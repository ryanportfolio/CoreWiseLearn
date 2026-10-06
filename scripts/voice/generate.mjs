// Voice clip generator. Renders each line of a lines file with Gemini TTS through
// OpenRouter, checks the audio by transcribing it, trims and levels it, and writes
// public/voice/<folder>/<file>.mp3. See scripts/voice/README.md.
//
// Usage: node scripts/voice/generate.mjs <lines-file...> [--force] [--only file,file] [--dry-run]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VOICE_DIR = join(ROOT, 'scripts/voice');
const PUBLIC_VOICE = join(ROOT, 'public/voice');
const LOCK_FILE = join(VOICE_DIR, 'lock.json');
const LETTER_TRAIN_CLIPS = join(ROOT, 'src/games/letter-train/clips.ts');
const API = 'https://openrouter.ai/api/v1';
const SAMPLE_RATE = 24000; // Gemini TTS returns 24 kHz mono signed 16-bit little-endian PCM
const MAX_RENDERS = 3;
const CONCURRENCY = 4;
const TARGET_LUFS = -16;
const PEAK_CEILING_DB = -1.5;
const PAD_MS = 30;
const CHECK_PROMPT = 'Transcribe this audio exactly, word for word, with punctuation. Reply with the transcript only.';
const LETTER_NOTE = 'Say the name of this letter of the alphabet.';
const LONG_PAUSE_MS = 300;
const LIST_KINDS = ['clips.json:names', 'clips.json:files', 'letter-train'];

// ---------- arguments ----------

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const onlyAt = args.indexOf('--only');
// --only letter-g,tickle-2 re-renders just those lines (by file name), whatever the lock says.
const ONLY = onlyAt >= 0 ? new Set((args.splice(onlyAt, 2)[1] ?? '').split(',').map(s => s.trim()).filter(Boolean)) : null;
const unknown = args.filter(a => a.startsWith('--') && a !== '--force' && a !== '--dry-run');
const lineFiles = args.filter(a => !a.startsWith('--'));
if (unknown.length || !lineFiles.length || (ONLY && !ONLY.size)) {
  console.error('Usage: node scripts/voice/generate.mjs <lines-file...> [--force] [--only file,file] [--dry-run]');
  process.exit(2);
}

const roles = JSON.parse(readFileSync(join(VOICE_DIR, 'roles.json'), 'utf8'));
const lock = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : {};

// ---------- lines files ----------

function loadLinesFile(path) {
  const spec = JSON.parse(readFileSync(path, 'utf8'));
  const where = `${path}:`;
  if (!/^[a-z0-9-]+$/.test(spec.folder ?? '')) throw new Error(`${where} "folder" must be lowercase letters, digits and dashes`);
  if (spec.list != null && !LIST_KINDS.includes(spec.list)) throw new Error(`${where} "list" must be one of ${LIST_KINDS.join(', ')} or left out`);
  if (!Array.isArray(spec.lines) || !spec.lines.length) throw new Error(`${where} "lines" must be a non-empty array`);
  const seen = new Set();
  for (const line of spec.lines) {
    if (!/^[a-z0-9-]+$/.test(line.file ?? '')) throw new Error(`${where} bad file name "${line.file}" (lowercase letters, digits, dashes; no extension)`);
    if (seen.has(line.file)) throw new Error(`${where} duplicate file "${line.file}"`);
    seen.add(line.file);
    if (typeof line.text !== 'string' || !line.text.trim()) throw new Error(`${where} ${line.file}: missing text`);
    const role = line.role ?? spec.role;
    if (!roles.roles[role]) throw new Error(`${where} ${line.file}: unknown role "${role}" (see scripts/voice/roles.json)`);
  }
  return spec;
}

// A letter line has an accept list naming a single letter, for example ["m", "em"].
const isLetterLine = line => (line.accept ?? []).some(a => /^[a-z]$/i.test(a));

function buildJob(spec, line) {
  const roleName = line.role ?? spec.role;
  const role = roles.roles[roleName];
  const model = role.model ?? roles.model;
  const style = role.style ?? roles.style;
  const notes = role.notes + (isLetterLine(line) ? `\n${LETTER_NOTE}` : '');
  const input = `### DIRECTOR'S NOTES\nStyle: ${style}\n${notes}\n\n#### TRANSCRIPT\n${line.text}`;
  const hash = createHash('sha256').update(JSON.stringify({ model, voice: role.voice, notes, style, text: line.text })).digest('hex');
  const key = `${spec.folder}/${line.file}`;
  const out = join(PUBLIC_VOICE, spec.folder, `${line.file}.mp3`);
  return { key, spec, line, role: roleName, model, voice: role.voice, input, hash, out };
}

// ---------- transcript comparison ----------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
  return String(n);
}

// Lowercase, drop apostrophes, turn other punctuation into spaces, spell out digits.
// "Twenty-five" and "25" both become "twenty five"; "I'm" becomes "im".
function normalise(s) {
  return s.toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map(w => (/^\d+$/.test(w) ? numberWords(Number(w)) : w))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const matches = (heard, line) => {
  const h = normalise(heard);
  return [line.text, ...(line.accept ?? [])].some(t => normalise(t) === h);
};

// ---------- HTTP ----------

const KEY = process.env.OPENROUTER_API_KEY;

async function post(path, body) {
  // Network errors, timeouts, 408, 429 and 5xx are retried with backoff (1, 2, 4, 8 s).
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      if (attempt >= 4) throw new Error(`${path}: ${e.message ?? e}`);
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
      continue;
    }
    if (res.ok) return res;
    const err = new Error(`${path} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) throw err;
    await sleep(1000 * 2 ** attempt + Math.random() * 500);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function keyUsage() {
  try {
    const res = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20_000) });
    return res.ok ? (await res.json()).data?.usage ?? null : null;
  } catch { return null; }
}

// ---------- audio ----------

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    const hit = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (hit) return hit;
  } catch { /* fall through */ }
  const fallback = 'C:/Users/Home/ffmpeg/ffmpeg-8.0.1-essentials_build/bin/ffmpeg.exe';
  if (existsSync(fallback)) return fallback;
  throw new Error('ffmpeg not found: put it on PATH or set FFMPEG to its full path');
}

let FFMPEG;

function ffmpeg(argv, input) {
  return new Promise((resolvePromise, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', ...argv], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => err.push(d));
    p.on('error', reject);
    p.on('close', code => {
      const stderr = Buffer.concat(err).toString();
      if (code === 0) resolvePromise({ stdout: Buffer.concat(out), stderr });
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
    p.stdin.on('error', () => {});
    p.stdin.end(input ?? Buffer.alloc(0));
  });
}

const PCM_IN = ['-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0'];

function toSamples(buf) {
  const even = buf.length - (buf.length % 2);
  return new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + even));
}

// Cut silence from both ends, keeping PAD_MS. A 10 ms frame counts as sound when its
// peak is within 40 dB of the clip's peak and above -60 dBFS. The model often leaves
// a quiet breath or a lone click a few hundred ms before or after the words, so the
// edges are set by runs of sound that come within 20 dB of the peak, then widened to
// take in quieter sound less than 150 ms away (a soft "h" or "s", or the burst of a
// final "p"). Returns the trimmed samples and the longest pause left inside, in ms.
function trim(samples) {
  const frame = SAMPLE_RATE / 100;
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return null;
  const threshold = Math.max(peak * 10 ** (-40 / 20), 32768 * 10 ** (-60 / 20));
  const strong = peak * 10 ** (-20 / 20);
  const frames = Math.ceil(samples.length / frame);
  const framePeak = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let p = 0;
    for (let i = f * frame; i < Math.min(samples.length, (f + 1) * frame); i++) p = Math.max(p, Math.abs(samples[i]));
    framePeak[f] = p;
  }
  const runs = [];
  for (let f = 0; f < frames; f++) {
    if (framePeak[f] < threshold) continue;
    let g = f, top = 0;
    while (g < frames && framePeak[g] >= threshold) top = Math.max(top, framePeak[g++]);
    runs.push({ a: f, b: g - 1, strong: top >= strong });
    f = g;
  }
  const anchors = runs.filter(r => r.strong);
  if (!anchors.length) return null;
  const BRIDGE = 15; // frames: 150 ms
  let first = anchors[0].a, last = anchors[anchors.length - 1].b;
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i].b < first && first - runs[i].b <= BRIDGE) first = runs[i].a;
  for (const r of runs) if (r.a > last && r.a - last <= BRIDGE) last = r.b;
  let pauseMs = 0;
  const inside = runs.filter(r => r.a >= first && r.b <= last);
  for (let i = 1; i < inside.length; i++) pauseMs = Math.max(pauseMs, (inside[i].a - inside[i - 1].b - 1) * 10);
  const pad = (SAMPLE_RATE * PAD_MS) / 1000;
  const start = Math.max(0, first * frame - pad);
  const end = Math.min(samples.length, (last + 1) * frame + pad);
  const out = samples.slice(start, end);
  const fade = SAMPLE_RATE / 200; // 5 ms fades so the cut never clicks
  for (let i = 0; i < fade && i < out.length; i++) {
    out[i] = Math.round(out[i] * (i / fade));
    out[out.length - 1 - i] = Math.round(out[out.length - 1 - i] * (i / fade));
  }
  return { samples: out, pauseMs };
}

// Integrated loudness in LUFS (EBU R128). Short clips are repeated to at least 3 s so
// the 400 ms gating blocks have enough audio; repeating does not change the loudness.
async function loudness(samples) {
  const reps = Math.max(1, Math.ceil((3 * SAMPLE_RATE) / samples.length));
  const one = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const { stderr } = await ffmpeg([...PCM_IN, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], Buffer.concat(Array(reps).fill(one)));
  const all = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  const value = all.length ? Number(all[all.length - 1][1]) : NaN;
  return Number.isFinite(value) && value > -70 ? value : null;
}

// Gain towards TARGET_LUFS, capped so the sample peak stays under PEAK_CEILING_DB.
async function level(samples) {
  const lufs = await loudness(samples);
  let peak = 1;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const peakDb = 20 * Math.log10(peak / 32768);
  const gainDb = Math.min(lufs == null ? 0 : TARGET_LUFS - lufs, PEAK_CEILING_DB - peakDb);
  const g = 10 ** (gainDb / 20);
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * g)));
  return { samples: out, lufs: lufs == null ? null : lufs + gainDb };
}

function wav(samples) {
  const pcm = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function encodeMp3(samples, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.mp3`;
  await ffmpeg(['-y', ...PCM_IN, '-map_metadata', '-1', '-id3v2_version', '0', '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-ar', String(SAMPLE_RATE), tmp],
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  renameSync(tmp, dest);
}

// ---------- render and check ----------

const stats = { checkCost: 0 };

async function renderOnce(job) {
  const res = await post('audio/speech', { model: job.model, voice: job.voice, response_format: 'pcm', input: job.input });
  const raw = toSamples(Buffer.from(await res.arrayBuffer()));
  const trimmed = trim(raw);
  if (!trimmed) return { heard: '(silence)', ok: false };
  const { samples, lufs } = await level(trimmed.samples);
  const check = await post('chat/completions', {
    model: roles.checkModel,
    usage: { include: true },
    messages: [{ role: 'user', content: [
      { type: 'text', text: CHECK_PROMPT },
      { type: 'input_audio', input_audio: { data: wav(samples).toString('base64'), format: 'wav' } },
    ] }],
  });
  const body = await check.json();
  if (typeof body.usage?.cost === 'number') stats.checkCost += body.usage.cost;
  const heard = String(body.choices?.[0]?.message?.content ?? '').trim();
  return { samples, lufs, heard, ok: matches(heard, job.line), seconds: samples.length / SAMPLE_RATE, pauseMs: trimmed.pauseMs };
}

async function runJob(job, reviewDir) {
  const tries = [];
  let last;
  for (let n = 1; n <= MAX_RENDERS; n++) {
    try {
      last = await renderOnce(job);
    } catch (e) {
      last = { heard: '', ok: false, error: String(e.message ?? e) };
    }
    tries.push(last.error ? `error: ${last.error}` : last.heard);
    if (last.ok) break;
  }
  const entry = { key: job.key, file: job.line.file, text: job.line.text, role: job.role, heard: last.heard, tries, renders: tries.length, ok: last.ok, seconds: last.seconds, pauseMs: last.pauseMs, lufs: last.lufs, error: last.error };
  if (last.ok) {
    await encodeMp3(last.samples, job.out);
    copyFileSync(job.out, join(reviewDir, 'clips', `${job.line.file}.mp3`));
    rmSync(join(reviewDir, 'clips', `${job.line.file}.failed.mp3`), { force: true });
    lock[job.key] = job.hash;
    writeLock();
    entry.clip = `clips/${job.line.file}.mp3`;
  } else if (last.samples) {
    // Keep the last failed take on the review page only, never in public/.
    await encodeMp3(last.samples, join(reviewDir, 'clips', `${job.line.file}.failed.mp3`));
    entry.clip = `clips/${job.line.file}.failed.mp3`;
  }
  const mark = last.ok ? (tries.length > 1 ? `ok after ${tries.length}` : 'ok') : 'FAILED';
  console.log(`  ${mark.padEnd(10)} ${job.key}  "${job.line.text}"${last.ok ? '' : `  heard: ${tries.map(t => JSON.stringify(t)).join(' / ')}`}`);
  return entry;
}

function writeLock() {
  const sorted = Object.fromEntries(Object.keys(lock).sort().map(k => [k, lock[k]]));
  writeFileSync(LOCK_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

async function pool(tasks, n) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; results[i] = await tasks[i](); }
  }));
  return results;
}

// ---------- clip lists ----------

function audioFiles(folder) {
  const dir = join(PUBLIC_VOICE, folder);
  return existsSync(dir) ? readdirSync(dir).filter(f => /^[a-z0-9-]+\.(mp3|ogg)$/.test(f)).sort() : [];
}

function updateList(spec) {
  if (!spec.list) return null;
  const files = audioFiles(spec.folder);
  if (spec.list === 'clips.json:names' || spec.list === 'clips.json:files') {
    const list = spec.list === 'clips.json:names'
      ? files.filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4))
      : files;
    writeFileSync(join(PUBLIC_VOICE, spec.folder, 'clips.json'), `${JSON.stringify(list, null, 2)}\n`);
    return `public/voice/${spec.folder}/clips.json (${list.length})`;
  }
  if (spec.list === 'letter-train') {
    const list = files.filter(f => /^[a-z]\.(mp3|ogg)$/.test(f));
    const rows = [];
    for (let i = 0; i < list.length; i += 8) rows.push(`  ${list.slice(i, i + 8).map(f => `'${f}'`).join(', ')},`);
    const literal = list.length ? `[\n${rows.join('\n')}\n]` : '[]';
    const src = readFileSync(LETTER_TRAIN_CLIPS, 'utf8');
    const pattern = /(export const VOICE_CLIPS: readonly string\[\] = )\[[^\]]*\]/;
    if (!pattern.test(src)) throw new Error('VOICE_CLIPS array not found in src/games/letter-train/clips.ts');
    writeFileSync(LETTER_TRAIN_CLIPS, src.replace(pattern, `$1${literal}`));
    return `src/games/letter-train/clips.ts VOICE_CLIPS (${list.length})`;
  }
  return null;
}

// ---------- review page ----------

function reviewRoot() {
  const preferred = 'D:/screenshots/CoreWiseLearn/voice-review';
  try {
    mkdirSync(preferred, { recursive: true });
    accessSync(preferred, constants.W_OK);
    return { dir: preferred, fallback: false };
  } catch {
    return { dir: join(ROOT, '.tmp/voice-review'), fallback: true };
  }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The page keeps clips from earlier runs (review.json) so a re-run that fixes one line
// does not hide the rest; this run's clips are marked "new".
function writeReview(spec, dir, entries, runId) {
  const store = join(dir, 'review.json');
  const previous = existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')) : {};
  for (const e of entries) previous[e.file] = { ...e, run: runId };
  const order = spec.lines.map(l => l.file).filter(f => previous[f]);
  const kept = Object.fromEntries(order.map(f => [f, previous[f]]));
  writeFileSync(store, JSON.stringify(kept, null, 1));
  const rows = order.map(f => {
    const e = kept[f];
    const cls = e.ok ? '' : 'bad';
    const play = e.clip ? `<button data-src="${esc(e.clip)}">&#9654;</button>` : '';
    return `<tr class="${cls}"><td>${play}</td><td><code>${esc(e.file)}</code>${e.run === runId ? ' <b class="new">new</b>' : ''}</td>`
      + `<td>${esc(e.text)}</td><td>${esc(e.heard)}${e.renders > 1 ? `<small>${e.renders} renders: ${e.tries.map(t => esc(t)).join(' / ')}</small>` : ''}</td>`
      + `<td>${e.seconds ? `${e.seconds.toFixed(2)} s` : ''}</td><td class="${e.pauseMs >= LONG_PAUSE_MS ? 'pause' : ''}">${e.pauseMs ? `${e.pauseMs} ms` : ''}</td><td>${e.ok ? 'ok' : esc(e.error ? 'error' : 'failed check')}</td></tr>`;
  }).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Voice review: ${esc(spec.folder)}</title>
<style>body{font:15px system-ui;margin:24px;background:#fbf7ef}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px;background:#fff;vertical-align:top;text-align:left}
th{background:#f1ead9}tr.bad td{background:#f8d7da}button{font:inherit;padding:4px 12px;cursor:pointer;border-radius:8px;border:1px solid #bbb;background:#eef6ff}
button.playing{background:#ffe08a}small{display:block;color:#666}td.pause{background:#fff3cd}.new{color:#2a7a2a;font-size:12px}</style>
<h1>Voice review: ${esc(spec.folder)}</h1>
<p>Role ${esc(spec.role)}. Click a row's button to play it, or <button id="all">Play all</button>. Red rows failed the transcript check and were not written to public/voice; their last take is here to hear why. A yellow pause (${LONG_PAUSE_MS} ms or more of quiet inside the clip) can mean an extra sound the check did not write down: listen to those.</p>
<table><tr><th></th><th>File</th><th>Text</th><th>Check heard</th><th>Length</th><th>Longest pause</th><th>Status</th></tr>
${rows}
</table>
<script>
const audio=new Audio();let queue=[];
function play(b){document.querySelectorAll('.playing').forEach(x=>x.classList.remove('playing'));b.classList.add('playing');audio.src=b.dataset.src;audio.play();}
audio.onended=()=>{document.querySelectorAll('.playing').forEach(x=>x.classList.remove('playing'));if(queue.length)setTimeout(()=>play(queue.shift()),300);};
document.addEventListener('click',e=>{const b=e.target.closest('button[data-src]');if(b){queue=[];play(b);}});
document.getElementById('all').onclick=()=>{queue=[...document.querySelectorAll('button[data-src]')];if(queue.length)play(queue.shift());};
</script>
`;
  writeFileSync(join(dir, 'index.html'), html);
  return join(dir, 'index.html');
}

// ---------- main ----------

const specs = lineFiles.map(f => ({ path: f, spec: loadLinesFile(resolve(f)) }));
const plan = specs.map(({ path, spec }) => {
  const jobs = spec.lines.map(line => buildJob(spec, line));
  const todo = ONLY
    ? jobs.filter(j => ONLY.has(j.line.file))
    : jobs.filter(j => FORCE || lock[j.key] !== j.hash || !existsSync(j.out));
  return { path, spec, jobs, todo };
});

if (DRY_RUN) {
  for (const p of plan) {
    console.log(`${p.path}: ${p.todo.length} to render, ${p.jobs.length - p.todo.length} up to date`);
    for (const j of p.todo) console.log(`  ${j.key}  [${j.role}/${j.voice}]  "${j.line.text}"`);
  }
  process.exit(0);
}

if (!KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(1); }
FFMPEG = findFfmpeg();
const review = reviewRoot();
if (review.fallback) console.log(`D:\\ is not writable; the review page goes to ${review.dir}`);
const usageBefore = await keyUsage();
const runId = new Date().toISOString();

const summary = [];
for (const p of plan) {
  const reviewDir = join(review.dir, p.spec.folder);
  mkdirSync(join(reviewDir, 'clips'), { recursive: true });
  console.log(`${p.path}: rendering ${p.todo.length}, skipping ${p.jobs.length - p.todo.length}`);
  const entries = await pool(p.todo.map(job => () => runJob(job, reviewDir)), CONCURRENCY);
  const list = entries.some(e => e.ok) ? updateList(p.spec) : null;
  const page = entries.length ? writeReview(p.spec, reviewDir, entries, runId) : null;
  summary.push({ p, entries, list, page });
}

const usageAfter = await keyUsage();
console.log('\nSummary');
let failedTotal = 0;
for (const { p, entries, list, page } of summary) {
  const failed = entries.filter(e => !e.ok);
  failedTotal += failed.length;
  console.log(`  ${p.spec.folder}: rendered ${entries.length - failed.length}, skipped ${p.jobs.length - p.todo.length}, failed ${failed.length}`);
  const retried = entries.filter(e => e.ok && e.renders > 1);
  if (retried.length) console.log(`    needed more than one render: ${retried.map(e => `${e.file} (${e.renders})`).join(', ')}`);
  for (const e of failed) console.log(`    FAILED ${e.file} "${e.text}": ${e.tries.map(t => JSON.stringify(t)).join(' / ')}`);
  if (list) console.log(`    updated ${list}`);
  if (page) console.log(`    review: ${pathToFileURL(page).href}`);
}
if (usageBefore != null && usageAfter != null) {
  console.log(`  cost: about $${(usageAfter - usageBefore).toFixed(4)} (key usage before and after; may lag)`);
} else if (stats.checkCost) {
  console.log(`  transcript checks cost $${stats.checkCost.toFixed(4)}; speech cost not reported`);
}
process.exit(failedTotal ? 1 : 0);
