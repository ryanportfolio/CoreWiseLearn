/**
 * Spoken clips for Coin Vault, in the narrator voice, rendered from
 * scripts/voice/lines/coin-vault.json (see public/voice/coin-vault/README.md). A clip plays
 * only when its file is in public/voice/coin-vault/ at build time; a missing
 * clip is skipped silently and causes no request.
 *
 * Once audio is unlocked the clips load a few at a time (MAX_LOADS), so ~490
 * decodes never start at once and hold back frames; `prioritizeVoice` moves the
 * clips the next task needs to the front of that line.
 */
import type { Audio } from '../../engine/audio';

/**
 * Clip names: coin and bill names; `number-N` (a running total); `cents-N`, `dollars-N` and `dollar-and-N`
 * ("One dollar and N cents.") say an amount; `make-N` ("Make N cents.") asks for a lock's amount; and the visitor's lines.
 */
export type VoiceClip =
  | `number-${number}` | `cents-${number}` | `dollars-${number}` | `dollar-and-${number}` | `make-${number}`
  | 'penny' | 'nickel' | 'dime' | 'quarter' | 'one-dollar' | 'five-dollars' | 'ten-dollars' | 'twenty-dollars'
  | 'count-mine' | 'saved-1' | 'saved-2';

/** Clips fetched and decoded at once while the folder loads. */
const MAX_LOADS = 3;

// Build-time list of the files that exist. The keys are enough: nothing is imported at runtime.
const FILES = Object.keys(import.meta.glob('/public/voice/coin-vault/*.{mp3,ogg}', { query: '?url', import: 'default' }));
const AVAILABLE = new Map<string, string>();
for (const path of FILES) {
  const file = path.slice(path.lastIndexOf('/') + 1), name = file.replace(/\.(mp3|ogg)$/, '');
  if (!AVAILABLE.has(name) || file.endsWith('.mp3')) AVAILABLE.set(name, file);
}

const buffers = new Map<string, AudioBuffer | null>();
const loading = new Set<string>();
/** Clips waiting for a load slot, next first. May repeat a clip; loaded or loading ones are skipped. */
const queue: string[] = [];
let loads = 0, unlocked = false, waitingUnlock = false, base = '/', all = false;

function load(audio: Audio, name: string): void {
  const file = AVAILABLE.get(name);
  if (!file || loading.has(name) || buffers.has(name) || !audio.context) return;
  loading.add(name); loads++;
  const done = (buffer: AudioBuffer | null): void => { buffers.set(name, buffer); loading.delete(name); loads--; pump(audio); };
  void fetch(`${base}voice/coin-vault/${file}`)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then(bytes => audio.decode(bytes))
    .then(done, () => done(null));
}

function pump(audio: Audio): void {
  while (unlocked && loads < MAX_LOADS && queue.length) {
    const name = queue.shift()!;
    if (!buffers.has(name) && !loading.has(name)) load(audio, name);
  }
}

function whenUnlocked(audio: Audio, b: string): void {
  base = b;
  if (waitingUnlock) { pump(audio); return; }
  waitingUnlock = true;
  audio.onUnlock(() => { unlocked = true; pump(audio); });
}

/** Load every available clip once audio is unlocked, a few at a time. Safe to call repeatedly. */
export function preloadVoice(audio: Audio, b: string): void {
  if (!AVAILABLE.size) return;
  if (!all) { all = true; for (const name of AVAILABLE.keys()) queue.push(name); }
  whenUnlocked(audio, b);
}

/** Load these clips next, in this order, ahead of the rest. Missing clips are ignored. Call per task, not per frame. */
export function prioritizeVoice(audio: Audio, b: string, names: readonly string[]): void {
  let any = false;
  for (let i = names.length - 1; i >= 0; i--) {
    const name = names[i]!;
    if (!AVAILABLE.has(name) || buffers.has(name) || loading.has(name)) continue;
    queue.unshift(name); any = true;
  }
  if (any) whenUnlocked(audio, b);
}

/** The clip playing now (one channel: voices never stack) and when it ends, in the audio clock's seconds. */
let speaking: AudioBufferSourceNode | undefined, speechEnds = 0;

/** Play a clip if its file exists and has decoded; otherwise do nothing. A new clip stops the one playing. */
export function playVoice(audio: Audio, name: VoiceClip): void {
  const buffer = buffers.get(name);
  if (!buffer || audio.muted || !audio.context) return;
  if (speaking) { try { speaking.stop(); } catch { /* already ended */ } }
  speaking = audio.playBuffer(buffer, 1);
  speechEnds = speaking ? audio.context.currentTime + buffer.duration : 0;
}

/** Stop the clip playing, if any. The scene calls this on pause and exit, so speech never runs on into the hub. */
export function stopVoice(): void {
  if (speaking) { try { speaking.stop(); } catch { /* already ended */ } }
  speaking = undefined; speechEnds = 0;
}

/** Seconds until the clip playing now has finished (0 when none is). */
export function voiceRemaining(audio: Audio): number {
  return audio.context && !audio.muted ? Math.max(0, speechEnds - audio.context.currentTime) : 0;
}

/** How long `playVoice(audio, name)` would speak now: the clip's length, or 0 when it would stay silent. */
export function voiceSeconds(audio: Audio, name: VoiceClip): number {
  const buffer = buffers.get(name);
  return buffer && !audio.muted ? buffer.duration : 0;
}

/** Whether a clip exists but has not finished loading yet (so a caller can wait for it rather than skip it). */
export const voiceLoading = (name: VoiceClip): boolean => AVAILABLE.has(name) && !buffers.has(name);

export const voiceClipCount = (): number => AVAILABLE.size;
