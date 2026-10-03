/**
 * Sound lab: an adult tool for auditioning every sound effect, trying preset
 * variants, tuning the patch with sliders, rating each sound, and exporting
 * the result as JSON for whoever retunes the palette. State is kept in
 * localStorage. See docs/sound-lab.md.
 */

import { createAudio } from '../engine/audio';
import { SFX_DURATION, SFX_NAMES, SFX_PATCHES, playSfx, type SfxName } from '../audio/sfx';
import type { Patch } from '../audio/voices';

const audio = createAudio();
const STORAGE_KEY = 'corewise.soundlab.v1';

type VariantId = 'A' | 'B' | 'C' | 'D';
const VARIANT_IDS: readonly VariantId[] = ['A', 'B', 'C', 'D'];

const VARIANT_INFO: Record<VariantId, string> = {
  A: 'Current: the sound as shipped today.',
  B: 'Deeper: one octave down and darker.',
  C: 'Woody: more knock and noise, more overtone, shorter decay.',
  D: 'Soft and round: slower attack, longer decay, darker, fewer overtones and less noise.',
};

/** The shipped patches, captured before anything changes them. */
const DEFAULTS = Object.fromEntries(SFX_NAMES.map((n) => [n, { ...SFX_PATCHES[n] }])) as Record<SfxName, Patch>;

function variantPatch(name: SfxName, id: VariantId): Patch {
  const d = DEFAULTS[name];
  switch (id) {
    case 'A':
      return { ...d };
    case 'B':
      return { ...d, register: d.register - 12, brightness: clampBright(d.brightness * 0.55) };
    case 'C':
      return { ...d, noise: 2.5, overtone: 1.6, decay: 0.6, brightness: clampBright(d.brightness * 0.85), shape: 0.25 };
    case 'D':
      return { ...d, attack: 2.5, decay: 1.6, brightness: clampBright(d.brightness * 0.5), overtone: 0.4, noise: 0.4, level: 0.9 };
  }
}

// ---------------------------------------------------------------------------
// Sliders.

type PatchKey = keyof Patch;

interface SliderDef {
  key: PatchKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Log-scale slider (brightness). */
  log?: boolean;
  format(v: number): string;
  help: string;
}

const BRIGHT_MIN = 300;
const BRIGHT_MAX = 6000;
function clampBright(v: number): number {
  return Math.round(Math.min(BRIGHT_MAX, Math.max(BRIGHT_MIN, v)) / 50) * 50;
}

const SLIDERS: readonly SliderDef[] = [
  { key: 'register', label: 'Pitch', min: -24, max: 12, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v} st`, help: 'Pitch shift in semitones. -12 is one octave lower.' },
  { key: 'brightness', label: 'Brightness', min: BRIGHT_MIN, max: BRIGHT_MAX, step: 50, log: true, format: (v) => `${Math.round(v)} Hz`, help: 'Cuts everything above this frequency. Lower is darker and softer.' },
  { key: 'level', label: 'Level', min: 0, max: 2, step: 0.05, format: (v) => `${Math.round(v * 100)}%`, help: 'Loudness of this sound.' },
  { key: 'attack', label: 'Attack', min: 0.25, max: 4, step: 0.05, format: (v) => `x${v.toFixed(2)}`, help: 'How fast the sound starts. Higher is a softer, slower start.' },
  { key: 'decay', label: 'Decay', min: 0.25, max: 3, step: 0.05, format: (v) => `x${v.toFixed(2)}`, help: 'How long the sound rings. Higher rings longer.' },
  { key: 'shape', label: 'Waveform', min: -1, max: 1, step: 0.05, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`, help: 'Toward + is a reedier triangle tone, toward - a purer sine.' },
  { key: 'overtone', label: 'Overtone', min: 0, max: 3, step: 0.05, format: (v) => `x${v.toFixed(2)}`, help: 'The ring or sparkle on top of the note.' },
  { key: 'noise', label: 'Noise', min: 0, max: 3, step: 0.05, format: (v) => `x${v.toFixed(2)}`, help: 'The knock, click or fizz layer.' },
];

/** Controls that the sound does not use, shown dimmed. */
const UNUSED: Partial<Record<SfxName, readonly PatchKey[]>> = {
  pop: ['overtone'],
  miss: ['overtone', 'noise'],
  backspace: ['overtone', 'noise'],
  hover: ['overtone', 'noise'],
  yawn: ['overtone', 'noise'],
  whoosh: ['overtone', 'shape'],
  tick: ['overtone'],
};

const LOG_STEPS = 1000;
function toSlider(def: SliderDef, v: number): number {
  if (!def.log) return v;
  return Math.round((LOG_STEPS * Math.log(v / def.min)) / Math.log(def.max / def.min));
}
function fromSlider(def: SliderDef, x: number): number {
  if (!def.log) return x;
  return clampBright(def.min * Math.pow(def.max / def.min, x / LOG_STEPS));
}

// ---------------------------------------------------------------------------
// State.

interface EffectState {
  rating: number | null;
  notes: string;
  chosenVariant: VariantId | null;
  /** True once a slider moved after the chosen variant was applied. */
  edited: boolean;
  patch: Patch;
  updatedAt: string | null;
}

interface LabState {
  effects: Record<SfxName, EffectState>;
}

function freshEffect(name: SfxName): EffectState {
  return { rating: null, notes: '', chosenVariant: null, edited: false, patch: { ...DEFAULTS[name] }, updatedAt: null };
}

function sanitizePatch(raw: unknown, fallback: Patch): Patch {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const def of SLIDERS) {
    const v = Number(src[def.key]);
    out[def.key] = Number.isFinite(v) ? Math.min(def.max, Math.max(def.min, v)) : fallback[def.key];
  }
  return out;
}

function sanitizeEffect(name: SfxName, raw: unknown): EffectState {
  const base = freshEffect(name);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const rating = Number(r.rating);
  const variant = r.chosenVariant;
  // Accept both the stored shape (patch) and the export shape (settings).
  return {
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 500) : '',
    chosenVariant: typeof variant === 'string' && (VARIANT_IDS as readonly string[]).includes(variant) ? (variant as VariantId) : null,
    edited: r.edited === true || r.editedAfterVariant === true,
    patch: sanitizePatch(r.patch ?? r.settings, base.patch),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
  };
}

function loadState(): LabState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    parsed = null;
  }
  const effects = (parsed && typeof parsed === 'object' ? (parsed as { effects?: unknown }).effects : undefined) as Record<string, unknown> | undefined;
  return { effects: Object.fromEntries(SFX_NAMES.map((n) => [n, sanitizeEffect(n, effects?.[n])])) as Record<SfxName, EffectState> };
}

let state = loadState();

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the lab keeps working in memory */
  }
}

function applyPatches(): void {
  for (const n of SFX_NAMES) Object.assign(SFX_PATCHES[n], state.effects[n].patch);
}

function touch(name: SfxName): void {
  state.effects[name].updatedAt = new Date().toISOString();
  save();
}

// ---------------------------------------------------------------------------
// Playing.

const SEQUENCES: Partial<Record<SfxName, { count: number; gap: number; label: string }>> = {
  pop: { count: 12, gap: 0.18, label: 'Combo 0 to 11' },
  key: { count: 26, gap: 0.2, label: 'A to Z' },
  star: { count: 3, gap: 0.45, label: 'Stars 1 to 3' },
};

/** Index used when a row's play button is pressed, so pitched sounds sit mid-range. */
const PLAY_INDEX: Partial<Record<SfxName, number>> = { pop: 2, 'pop-big': 2, key: 7, star: 0 };

let timers: number[] = [];
function later(seconds: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, seconds * 1000));
}
function cancelScheduled(): void {
  for (const id of timers) clearTimeout(id);
  timers = [];
}

async function ready(): Promise<void> {
  if (!audio.ready) await audio.unlock();
}

function playCurrent(name: SfxName, index = PLAY_INDEX[name] ?? 0): void {
  playSfx(audio, name, { index });
}

/** Play a preset variant without changing the live patch. */
function playVariant(name: SfxName, id: VariantId): void {
  const live = { ...SFX_PATCHES[name] };
  Object.assign(SFX_PATCHES[name], variantPatch(name, id));
  playSfx(audio, name, { index: PLAY_INDEX[name] ?? 0 });
  Object.assign(SFX_PATCHES[name], live);
}

function playSequence(name: SfxName): void {
  const seq = SEQUENCES[name];
  if (!seq) return;
  for (let i = 0; i < seq.count; i++) later(i * seq.gap, () => playCurrent(name, i));
}

function playAll(): void {
  cancelScheduled();
  let t = 0;
  for (const n of SFX_NAMES) {
    later(t, () => playCurrent(n));
    t += SFX_DURATION[n] + 0.35;
  }
}

/** About 20 seconds of a bubble round: combos, score ticks, a miss, a big pop, the finish. */
const GAMEPLAY: readonly [number, SfxName, number][] = [
  [0.0, 'button', 0],
  [0.6, 'pop', 0],
  [1.3, 'pop', 1],
  [1.9, 'pop', 2],
  [2.4, 'pop', 3],
  [2.9, 'tick', 0],
  [3.6, 'pop', 4],
  [4.1, 'pop', 5],
  [4.6, 'tick', 0],
  [5.4, 'pop', 0],
  [6.4, 'miss', 0],
  [7.5, 'pop', 0],
  [8.3, 'pop', 1],
  [8.9, 'pop', 2],
  [9.6, 'tick', 0],
  [10.4, 'pop', 3],
  [11.0, 'pop', 4],
  [11.6, 'pop', 5],
  [12.2, 'pop', 6],
  [12.7, 'pop-big', 7],
  [13.4, 'tick', 0],
  [14.5, 'pop', 0],
  [15.2, 'pop', 1],
  [15.9, 'pop', 2],
  [16.5, 'tick', 0],
  [16.65, 'tick', 1],
  [16.8, 'tick', 2],
  [16.95, 'tick', 3],
  [17.1, 'tick', 4],
  [17.6, 'fanfare', 0],
  [19.2, 'sticker', 0],
];

function playGameplay(): void {
  cancelScheduled();
  for (const [t, name, index] of GAMEPLAY) later(t, () => playCurrent(name, index));
}

// ---------------------------------------------------------------------------
// Export and import.

interface ExportFile {
  app: string;
  version: 1;
  exportedAt: string;
  variants: Record<VariantId, string>;
  sliders: Record<PatchKey, string>;
  effects: Record<SfxName, {
    rating: number | null;
    notes: string;
    chosenVariant: VariantId | null;
    editedAfterVariant: boolean;
    settings: Patch;
    defaults: Patch;
    updatedAt: string | null;
  }>;
}

function exportData(): ExportFile {
  return {
    app: 'CoreWiseLearn sound lab',
    version: 1,
    exportedAt: new Date().toISOString(),
    variants: VARIANT_INFO,
    sliders: Object.fromEntries(SLIDERS.map((d) => [d.key, d.help])) as Record<PatchKey, string>,
    effects: Object.fromEntries(
      SFX_NAMES.map((n) => {
        const e = state.effects[n];
        return [n, { rating: e.rating, notes: e.notes, chosenVariant: e.chosenVariant, editedAfterVariant: e.edited, settings: { ...e.patch }, defaults: { ...DEFAULTS[n] }, updatedAt: e.updatedAt }];
      }),
    ) as ExportFile['effects'],
  };
}

async function exportFile(): Promise<string> {
  const json = JSON.stringify(exportData(), null, 2);
  console.log(json);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sound-lab.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  let copied = false;
  try {
    await navigator.clipboard.writeText(json);
    copied = true;
  } catch {
    /* clipboard blocked: the download and console still have it */
  }
  setStatus(`Exported sound-lab.json${copied ? ' and copied it to the clipboard' : ''}.`);
  return json;
}

function importJson(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    setStatus('That file is not valid JSON.');
    return false;
  }
  const effects = (parsed && typeof parsed === 'object' ? (parsed as { effects?: unknown }).effects : undefined) as Record<string, unknown> | undefined;
  if (!effects || typeof effects !== 'object') {
    setStatus('That file has no effects in it.');
    return false;
  }
  state = { effects: Object.fromEntries(SFX_NAMES.map((n) => [n, effects[n] === undefined ? state.effects[n] : sanitizeEffect(n, effects[n])])) as Record<SfxName, EffectState> };
  save();
  applyPatches();
  render();
  setStatus('Imported.');
  return true;
}

// ---------------------------------------------------------------------------
// DOM.

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', { textContent: label, className });
  b.addEventListener('click', () => {
    void ready().then(onClick);
  });
  return b;
}

const statusEl = document.getElementById('status');
function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function renderRow(name: SfxName): HTMLElement {
  const e = state.effects[name];
  const row = el('section', { className: 'row' });
  row.dataset.sfx = name;

  const stars = el('span', { className: 'stars' });
  const drawStars = (): void => {
    stars.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', e.rating !== null && i < e.rating));
  };
  for (let i = 1; i <= 5; i++) {
    const b = el('button', { textContent: '★', title: `${i} of 5` });
    b.dataset.star = String(i);
    b.addEventListener('click', () => {
      e.rating = e.rating === i ? null : i;
      drawStars();
      touch(name);
    });
    stars.append(b);
  }
  drawStars();

  const notes = el('input', { className: 'notes', type: 'text', placeholder: 'Notes', value: e.notes, maxLength: 500 });
  notes.addEventListener('input', () => {
    e.notes = notes.value;
    touch(name);
  });

  const head = el('div', { className: 'row-head' }, el('span', { className: 'name', textContent: name }), button('Play', () => playCurrent(name)));
  const seq = SEQUENCES[name];
  if (seq) head.append(button(seq.label, () => playSequence(name), 'secondary'));
  head.append(stars, notes);

  const chosen = el('span', { className: 'chosen' });
  const drawChosen = (): void => {
    chosen.textContent = e.chosenVariant ? `Current is ${e.chosenVariant}${e.edited ? ', edited' : ''}` : e.edited ? 'Current is edited' : 'Current is A';
  };
  let selected: VariantId = e.chosenVariant ?? 'A';
  const variantButtons = VARIANT_IDS.map((id) => {
    const b = button(`${id} ▶`, () => {
      selected = id;
      variantButtons.forEach((vb, i) => vb.classList.toggle('selected', VARIANT_IDS[i] === id));
      playVariant(name, id);
    }, `variant${id === selected ? ' selected' : ''}`);
    b.title = VARIANT_INFO[id];
    b.dataset.variant = id;
    return b;
  });

  const sliderBox = el('div', { className: 'sliders' });
  const inputs: { def: SliderDef; input: HTMLInputElement; value: HTMLSpanElement }[] = [];
  const unused = UNUSED[name] ?? [];
  for (const def of SLIDERS) {
    const input = el('input', { type: 'range', min: String(def.log ? 0 : def.min), max: String(def.log ? LOG_STEPS : def.max), step: String(def.log ? 1 : def.step), title: def.help });
    input.dataset.key = def.key;
    const value = el('span', { className: 'value' });
    input.addEventListener('input', () => {
      const v = fromSlider(def, Number(input.value));
      e.patch[def.key] = v;
      SFX_PATCHES[name][def.key] = v;
      value.textContent = def.format(v);
      e.edited = true;
      drawChosen();
      touch(name);
    });
    input.addEventListener('change', () => {
      void ready().then(() => playCurrent(name));
    });
    const wrap = el('label', { className: `slider${unused.includes(def.key) ? ' unused' : ''}`, title: unused.includes(def.key) ? `${def.help} This sound does not use it.` : def.help }, def.label, input, value);
    sliderBox.append(wrap);
    inputs.push({ def, input, value });
  }
  const drawSliders = (): void => {
    for (const { def, input, value } of inputs) {
      input.value = String(toSlider(def, e.patch[def.key]));
      value.textContent = def.format(e.patch[def.key]);
    }
  };
  drawSliders();
  drawChosen();

  const makeCurrent = button('Make selected variant current', () => {
    e.patch = variantPatch(name, selected);
    Object.assign(SFX_PATCHES[name], e.patch);
    e.chosenVariant = selected;
    e.edited = false;
    drawSliders();
    drawChosen();
    touch(name);
    playCurrent(name);
  }, 'ghost');
  makeCurrent.dataset.action = 'make-current';

  row.append(head, el('div', { className: 'variants' }, ...variantButtons, makeCurrent, chosen), sliderBox);
  return row;
}

const rowsEl = document.getElementById('rows');
function render(): void {
  if (!rowsEl) return;
  rowsEl.replaceChildren(
    el('p', { className: 'hint', textContent: 'Variants: ' + VARIANT_IDS.map((id) => `${id}, ${VARIANT_INFO[id]}`).join(' ') + ' Sliders play the sound when you let go. Dimmed sliders do nothing for that sound.' }),
    ...SFX_NAMES.map(renderRow),
  );
}

function wireHeader(): void {
  const on = (id: string, fn: () => void): void => {
    document.getElementById(id)?.addEventListener('click', () => {
      void ready().then(fn);
    });
  };
  const muteBtn = document.getElementById('mute');
  const drawMute = (): void => {
    if (muteBtn) muteBtn.textContent = audio.muted ? 'Unmute' : 'Mute';
  };
  on('play-all', playAll);
  on('gameplay', playGameplay);
  on('mute', () => {
    audio.toggleMuted();
    drawMute();
  });
  on('export', () => void exportFile());
  const fileInput = document.getElementById('import-file') as HTMLInputElement | null;
  document.getElementById('import')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((t) => {
      importJson(t);
      fileInput.value = '';
    });
  });
  drawMute();
  audio.onUnlock(() => setStatus('Sound is on.'));
}

applyPatches();
render();
wireHeader();

// ---------------------------------------------------------------------------
// Test hooks: a level meter on the master bus (attached on request only).

let analyser: AnalyserNode | undefined;
let meterBuf: Float32Array<ArrayBuffer> | undefined;

function rms(): number {
  if (!analyser) {
    const ctx = audio.context;
    const master = audio.masterBus;
    if (!ctx || !master) return 0;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    meterBuf = new Float32Array(analyser.fftSize);
    master.connect(analyser);
  }
  if (!meterBuf) return 0;
  analyser.getFloatTimeDomainData(meterBuf);
  let sum = 0;
  for (let i = 0; i < meterBuf.length; i++) sum += (meterBuf[i] ?? 0) ** 2;
  return Math.sqrt(sum / meterBuf.length);
}

/** Peak RMS over `ms` after running `fn`. */
function peakAfter(fn: () => void, ms: number): Promise<number> {
  rms();
  let peak = 0;
  fn();
  const t0 = performance.now();
  return new Promise((resolve) => {
    const id = setInterval(() => {
      peak = Math.max(peak, rms());
      if (performance.now() - t0 >= ms) {
        clearInterval(id);
        resolve(peak);
      }
    }, 4);
  });
}

const soundLab = {
  audio,
  names: SFX_NAMES,
  variants: VARIANT_IDS,
  rms,
  peakAfter,
  exportData,
  importJson,
  state: () => state,
};

declare global {
  interface Window {
    __soundLab?: typeof soundLab;
  }
}
window.__soundLab = soundLab;
