/**
 * Named procedural sound effects. Scenes call playSfx(audio, name) and never
 * build oscillators themselves, so every sound in the hub shares one palette.
 *
 * Every pitched sound sits on the C major pentatonic scale, the same scale the
 * music uses, so effects never clash with the background track. Voices are
 * sines, sine/triangle blends and filtered noise: no square or sawtooth buzz.
 * Everything rolls off above about 3 kHz, and no lead voice goes above C6.
 * At most MAX_SFX_VOICES sound at once; a new one fades out the oldest.
 *
 * Every effect comes in variants A to D (SFX_VARIANTS). A is the default; a
 * game or theme picks its family with setSfxVariants, or one call passes
 * { variant }. See docs/audio/README.md.
 */

import type { Audio } from '../engine/audio';
import {
  BELL,
  BUBBLE,
  MARIMBA,
  Voice,
  VoicePool,
  bell,
  bubble,
  lowpassInto,
  makeFilter,
  makePatch,
  marimba,
  midiHz,
  pentaMidi,
  finite,
  shaped,
  type Patch,
} from './voices';

export type SfxName =
  | 'pop' // a bubble popped; use `index` for combo pitch climb
  | 'pop-big' // combo milestone or special pop
  | 'miss' // soft, never harsh; a bubble floated away
  | 'key' // a letter typed; use `index` (0..25) for per-letter pitch
  | 'backspace'
  | 'go' // name confirmed, round start
  | 'button' // any UI button press
  | 'hover' // pointer entered a big button
  | 'star' // one star lands in the result row
  | 'fanfare' // round complete
  | 'sticker' // sticker placed in the book
  | 'yawn' // mascot break nudge
  | 'whoosh' // scene transition
  | 'tick' // counter increments
  | 'coin-clink' // a coin lands on coins; use `index` for a pitch that climbs as a pile grows
  | 'bill-rustle' // a paper bill is picked up or lands
  | 'lock-spin' // a vault dial spins and clicks shut
  | 'door-clunk' // a heavy wooden door shuts
  | 'jar-fill'; // money pours into a jar; use `index` for a rising pitch

export type SfxVariant = 'A' | 'B' | 'C' | 'D';

export const SFX_VARIANT_IDS: readonly SfxVariant[] = ['A', 'B', 'C', 'D'];

export interface SfxOptions {
  /** 0-based index for pitch climbs (combo count, letter index). */
  index?: number;
  /** Bubble diameter divided by 144; changes the noise body, never the count pitch. */
  bodySize?: number;
  /** 0..1 volume scale. Default 1. */
  volume?: number;
  /** Which version of the sound. Default: the one set with setSfxVariants, else 'A'. */
  variant?: SfxVariant;
}

export const SFX_NAMES: readonly SfxName[] = [
  'pop',
  'pop-big',
  'miss',
  'key',
  'backspace',
  'go',
  'button',
  'hover',
  'star',
  'fanfare',
  'sticker',
  'yawn',
  'whoosh',
  'tick',
  'coin-clink',
  'bill-rustle',
  'lock-spin',
  'door-clunk',
  'jar-fill',
];

/** Seconds from trigger until each effect is silent, at the default patches. */
export const SFX_DURATION: Readonly<Record<SfxName, number>> = {
  pop: 0.16,
  'pop-big': 0.6,
  miss: 0.25,
  key: 0.52,
  backspace: 0.16,
  go: 0.95,
  button: 0.22,
  hover: 0.075,
  star: 0.75,
  fanfare: 1.2,
  sticker: 0.6,
  yawn: 0.8,
  whoosh: 0.3,
  tick: 0.05,
  'coin-clink': 0.3,
  'bill-rustle': 0.2,
  'lock-spin': 0.55,
  'door-clunk': 0.45,
  'jar-fill': 0.22,
};

export const MAX_SFX_VOICES = 8;

/** A repeat of the same effect and index sooner than this is dropped. */
const DEDUPE_SECONDS = 0.03;

/**
 * Per-effect tuning, applied on top of the designed sound. Mutable so a tuning
 * page can change it live; the defaults are the shipped sound.
 */
export const SFX_PATCHES: Record<SfxName, Patch> = {
  pop: makePatch(),
  'pop-big': makePatch(),
  miss: makePatch({ brightness: 1400 }),
  key: makePatch(),
  backspace: makePatch({ brightness: 2000 }),
  go: makePatch(),
  button: makePatch({ brightness: 2200, level: 0.7 }),
  hover: makePatch({ brightness: 2400, level: 2 }),
  star: makePatch(),
  fanfare: makePatch(),
  sticker: makePatch(),
  yawn: makePatch({ brightness: 1800 }),
  whoosh: makePatch(),
  tick: makePatch({ level: 2 }),
  'coin-clink': makePatch(),
  'bill-rustle': makePatch({ brightness: 2200 }),
  'lock-spin': makePatch(),
  'door-clunk': makePatch({ brightness: 1600 }),
  'jar-fill': makePatch(),
};

// ---------------------------------------------------------------------------
// Variants. One table: shared transforms that apply to every effect, and
// per-effect entries that replace them (a different design, or a level fix).
// To add a variant E, add 'E' to SfxVariant and SFX_VARIANT_IDS, then an E
// entry under shared (and under byEffect where a sound needs its own take).

export interface SfxVariantDef {
  /** Plain description, shown in the sound lab and the docs. */
  label: string;
  /** Turns the effect's live patch into this variant's patch. */
  patch(base: Patch): Patch;
  /** Seconds until silent, relative to SFX_DURATION (ignored when `duration` is set). */
  durationScale: number;
  /** Seconds until silent, for variants with their own design. */
  duration?: number;
  /** A different sound design for this effect (see the design names in playSfx). */
  design?: string;
}

const same = (base: Patch): Patch => ({ ...base });
const bright = (v: number): number => Math.max(300, Math.min(6000, v));

export const SFX_VARIANTS: {
  shared: Record<SfxVariant, SfxVariantDef>;
  byEffect: Partial<Record<SfxName, Partial<Record<SfxVariant, SfxVariantDef>>>>;
} = {
  shared: {
    A: { label: 'As designed.', patch: same, durationScale: 1 },
    B: {
      label: 'Deeper: one octave down and darker.',
      patch: (b) => ({ ...b, register: b.register - 12, brightness: bright(b.brightness * 0.55) }),
      durationScale: 1,
    },
    C: {
      label: 'Woody: more knock and noise, more overtone, shorter.',
      patch: (b) => ({ ...b, noise: b.noise * 2.5, overtone: b.overtone * 1.6, decay: b.decay * 0.6, brightness: bright(b.brightness * 0.85), shape: b.shape + 0.25 }),
      durationScale: 0.8,
    },
    D: {
      label: 'Soft and round: slower start, longer ring, darker.',
      patch: (b) => ({ ...b, attack: b.attack * 2.5, decay: b.decay * 1.6, brightness: bright(b.brightness * 0.5), overtone: b.overtone * 0.4, noise: b.noise * 0.4, level: b.level * 0.9 }),
      durationScale: 1.7,
    },
  },
  byEffect: {
    button: {
      A: { label: 'Bloop: a quick cartoon pitch-up with a tiny wobble.', patch: same, durationScale: 1, duration: 0.2, design: 'bloop' },
      B: { label: 'Tok: a wooden knock with a low body thump.', patch: same, durationScale: 1, duration: 0.14, design: 'tok' },
      C: { label: 'Boing: a rubbery dip and spring back up.', patch: same, durationScale: 1, duration: 0.3, design: 'boing' },
      D: { label: 'Bu-dum: two soft low notes with a gentle knock.', patch: same, durationScale: 1, duration: 0.32, design: 'budum' },
    },
    star: {
      C: { label: 'Glide: a soft bell over a low note that slides gently up.', patch: same, durationScale: 1, duration: 0.95, design: 'glide-bell' },
    },
    whoosh: {
      // The shared D was too quiet on the noise-only whoosh; keep its softness, match the level.
      D: {
        label: 'Soft and round, at the same loudness as the others.',
        patch: (b) => ({ ...SFX_VARIANTS.shared.D.patch(b), noise: b.noise, level: b.level * 1.3 }),
        durationScale: 1,
      },
    },
  },
};

export function sfxVariantDef(name: SfxName, variant: SfxVariant): SfxVariantDef {
  return SFX_VARIANTS.byEffect[name]?.[variant] ?? SFX_VARIANTS.shared[variant];
}

/** Seconds until silent for an effect's variant, at the default patch. */
export function sfxDuration(name: SfxName, variant: SfxVariant = 'A'): number {
  const def = sfxVariantDef(name, variant);
  return def.duration ?? SFX_DURATION[name] * def.durationScale;
}

const chosenVariants: Partial<Record<SfxName, SfxVariant>> = {};

/**
 * Pick the variant each effect plays by default, for example
 * setSfxVariants({ pop: 'B' }) for a deeper ocean pop. Merges with earlier
 * calls; pass 'A' to go back to the default.
 */
export function setSfxVariants(map: Partial<Record<SfxName, SfxVariant>>): void {
  for (const name of SFX_NAMES) {
    const v = map[name];
    if (v && SFX_VARIANT_IDS.includes(v)) chosenVariants[name] = v;
  }
}

export function getSfxVariant(name: SfxName): SfxVariant {
  return chosenVariants[name] ?? 'A';
}

interface SfxKit {
  pool: VoicePool;
  /** Start time of the last trigger per name and index, for the dedupe window. */
  last: Map<string, number>;
  /** Bubble-pop noise band, into a fixed 3 kHz rolloff. */
  popBand: BiquadFilterNode;
  /** Wood click band for button and tick, into the same rolloff. */
  wood: BiquadFilterNode;
}

const kits = new WeakMap<AudioNode, SfxKit>();

function kitFor(ctx: BaseAudioContext, bus: AudioNode): SfxKit {
  let kit = kits.get(bus);
  if (kit) return kit;
  const roll = lowpassInto(ctx, bus, 3000);
  kit = {
    pool: new VoicePool(MAX_SFX_VOICES),
    last: new Map(),
    popBand: makeFilter(ctx, 'bandpass', 1800, 1.0, roll),
    wood: makeFilter(ctx, 'bandpass', 1200, 3, roll),
  };
  kits.set(bus, kit);
  return kit;
}

/** Combo climbs wrap after two octaves of the scale (10 degrees). */
function climb(index: number): number {
  return Math.max(0, Math.floor(index)) % 10;
}

/** Star pitches climb do mi sol, then on up the scale (C5 E5 G5 C6 ...). */
const STAR_NOTES = [72, 76, 79, 84, 88, 91] as const;

/** Seconds from the trigger to the first note, so the start is not already past when the audio thread reads it. */
const LEAD = 0.002;

/** Build steps in the fanfare: one bell or marimba hit each for the three rising notes and the top note, then the chord, then the sub. */
const FANFARE_STEPS = 10;
const FANFARE_NOTES = [72, 76, 79] as const;

/**
 * One build step of the fanfare (0 to FANFARE_STEPS - 1). Running every step in order builds exactly the nodes,
 * in the same order, that one whole build makes, so a render built a step at a time is sample-identical.
 */
function fanfareStep(step: number, v: Voice, t: number, p: Patch, out: AudioNode): void {
  const register = finite(p.register, 0);
  const hz = (midi: number): number => midiHz(midi + register);
  const top = t + 0.42;
  if (step < 6) {
    // C5 E5 G5, each a bell over a marimba an octave down.
    const i = step >> 1;
    const nt = t + i * 0.13;
    const m = FANFARE_NOTES[i] ?? 72;
    if (step & 1) marimba(v, nt, hz(m - 12), 0.08, out, shaped(p, { ...MARIMBA, decay: 0.25 }));
    else bell(v, nt, hz(m), 0.15, out, shaped(p, { ...BELL, decay: 0.35 }));
  } else if (step === 6) bell(v, top, hz(84), 0.15, out, shaped(p, { ...BELL, decay: 0.74 }));
  else if (step === 7) marimba(v, top, hz(72), 0.1, out, shaped(p, { ...MARIMBA, decay: 0.5 }));
  else {
    const chord = shaped(p, { attack: 0.06, decay: 0.72, shape: 0, overtone: 0, noise: 0 });
    if (step === 8) for (const m of [60, 64, 67]) v.tone(chord.shape, hz(m), top - 0.02, chord.attack, chord.decay, 0.065, out);
    else v.tone(Math.min(1, chord.shape + 1), hz(48), top - 0.02, 0.01 * finite(p.attack, 1, 0.01), 0.7 * finite(p.decay, 1, 0.01), 0.1, out);
  }
}

/** Fanfare: C5 E5 G5 then a held C6 over a soft C major chord and a C3 sub. Every node feeds `out`. */
function fanfare(v: Voice, t: number, p: Patch, out: AudioNode): void {
  for (let step = 0; step < FANFARE_STEPS; step++) fanfareStep(step, v, t, p, out);
}

// ---------------------------------------------------------------------------
// Rendered ahead. Building the fanfare's twenty notes takes a few ms of main
// thread on the frame a round ends (four times that on a slow laptop, at the
// 192 kHz some sound cards run at). prepareSfx renders the notes once into a
// buffer, before they are needed; playSfx then plays that buffer through the
// same voice gain and low-pass, which sounds the same because the notes have
// no random part. A patch with extra noise adds random bursts, so it always
// builds live. prepareSfxStep builds the same render one note per call, for
// callers that only have short idle periods between frames.

interface Rendered {
  /** Undefined while building or rendering, or when the render failed (playSfx builds live then). */
  buffer: AudioBuffer | undefined;
  /** Seconds from the buffer start until the last note stops. */
  end: number;
  /** Settles once the render has finished or failed; undefined while the notes are still being built. */
  done?: Promise<void>;
}

/** A render whose notes are still being added, one build step per prepareSfxStep call. */
interface Building {
  off: OfflineAudioContext;
  v: Voice;
  p: Patch;
  step: number;
}

const renders = new Map<string, Rendered>();
const building = new Map<string, Building>();
/** Longest render kept; longer tunings build live. */
const RENDER_SECONDS = 4;

/** Cache key for an effect that can be rendered ahead, or undefined when it must build live. */
function renderKey(ctx: BaseAudioContext, name: SfxName, variant: SfxVariant, p: Patch): string | undefined {
  if (name !== 'fanfare' || !(p.noise <= 1)) return undefined;
  // Level and brightness act after the buffer (voice gain and low-pass), so they are not part of the key.
  return `${name}:${variant}:${ctx.sampleRate}:${p.register}:${p.attack}:${p.decay}:${p.shape}:${p.overtone}:${p.noise}`;
}

/** The render key and patch prepareSfx would use, or undefined when nothing can be rendered ahead. */
function renderTarget(audio: Audio, name: SfxName, options: Pick<SfxOptions, 'variant'>): { ctx: AudioContext; key: string; p: Patch } | undefined {
  const ctx = audio.context;
  if (!ctx || typeof OfflineAudioContext === 'undefined') return undefined;
  const variant = options.variant && SFX_VARIANT_IDS.includes(options.variant) ? options.variant : getSfxVariant(name);
  const p = sfxVariantDef(name, variant).patch(SFX_PATCHES[name]);
  const key = renderKey(ctx, name, variant, p);
  return key ? { ctx, key, p } : undefined;
}

/**
 * prepareSfx one slice at a time. The first call sets up the render and is the one long slice (about 4 ms at
 * 192 kHz, four times that on a slow laptop): make it while nothing on screen moves. Each later call adds one bell or
 * marimba hit (or the chord, or the sub), well under 1 ms (under 2 ms on a slow laptop), so it fits a short idle
 * period between frames; the last starts the render, which runs off the main thread. Returns true once nothing is
 * left to do on the main thread (rendering, rendered, failed, or an effect that always builds live).
 */
export function prepareSfxStep(audio: Audio, name: SfxName, options: Pick<SfxOptions, 'variant'> = {}): boolean {
  const target = renderTarget(audio, name, options);
  if (!target) return true;
  const { ctx, key, p } = target;
  const build = building.get(key);
  if (!build) {
    if (renders.has(key)) return true;
    renders.set(key, { buffer: undefined, end: 0 });
    try {
      const off = new OfflineAudioContext(1, Math.ceil(ctx.sampleRate * RENDER_SECONDS), ctx.sampleRate);
      // A context builds its sine and triangle tables when it makes its first oscillator of each kind, and that is
      // most of the work (each several ms at 192 kHz on a slow laptop). Build them here, with an oscillator that is
      // never connected or started, so the note steps after this stay short and the render is unchanged.
      off.createOscillator().type = 'triangle';
      building.set(key, { off, v: new Voice(off, LEAD, 1), p, step: 0 });
      return false;
    } catch {
      return true;
    }
  }
  try {
    if (build.step < FANFARE_STEPS) {
      fanfareStep(build.step++, build.v, LEAD, build.p, build.off.destination);
      return false;
    }
    building.delete(key);
    const entry = renders.get(key);
    const { v } = build;
    if (!entry || v.end > RENDER_SECONDS) return true;
    entry.done = build.off.startRendering().then(
      (buffer) => {
        entry.end = v.end;
        entry.buffer = buffer;
      },
      () => undefined,
    );
  } catch {
    building.delete(key);
  }
  return true;
}

/**
 * Render an effect ahead so playSfx does not build its notes on the frame it plays. Only the fanfare uses this;
 * other effects resolve at once. Safe to call repeatedly: one render per patch, variant and sample rate. Call it
 * away from busy frames: building the render costs what building the live sound would. Where only short idle
 * periods are free, call prepareSfxStep once per period instead.
 */
export function prepareSfx(audio: Audio, name: SfxName, options: Pick<SfxOptions, 'variant'> = {}): Promise<void> {
  while (!prepareSfxStep(audio, name, options));
  const target = renderTarget(audio, name, options);
  return (target && renders.get(target.key)?.done) ?? Promise.resolve();
}

export function playSfx(audio: Audio, name: SfxName, options: SfxOptions = {}): void {
  const ctx = audio.context;
  const bus = audio.sfxBus;
  if (!ctx || !bus || !audio.ready || audio.muted) return;
  const variant = options.variant && SFX_VARIANT_IDS.includes(options.variant) ? options.variant : getSfxVariant(name);
  const def = sfxVariantDef(name, variant);
  const p = def.patch(SFX_PATCHES[name]);
  const design = def.design;
  const volume = Math.min(1, finite(options.volume ?? 1, 1, 0)) * finite(p.level, 1, 0);
  if (volume <= 0) return;
  const index = finite(options.index ?? 0, 0, 0);
  const kit = kitFor(ctx, bus);
  const t = ctx.currentTime + LEAD;
  // The same sound at the same pitch twice within DEDUPE_SECONDS would add up
  // in phase and double the level, so the repeat is dropped.
  const key = `${name}:${variant}:${Math.floor(index)}`;
  const prev = kit.last.get(key);
  if (prev !== undefined && t - prev < DEDUPE_SECONDS) return;
  kit.last.set(key, t);
  const v = new Voice(ctx, t, volume);
  const out = lowpassInto(ctx, bus, finite(p.brightness, 3000, 100));
  // This low-pass belongs to the shared bus. A voice must not disconnect it.
  const bodySize = Math.min(2, Math.max(0.5, finite(options.bodySize ?? 1, 1, 0.01)));
  const popBody = name === 'pop' || name === 'pop-big' ? makeFilter(ctx, 'bandpass', 1800 / bodySize, 1, out) : undefined;
  if (popBody) v.own(popBody);
  /** MIDI note to Hz, shifted by the patch register. */
  const register = finite(p.register, 0);
  const hz = (midi: number): number => midiHz(midi + register);
  const at = (s: number): number => s * finite(p.attack, 1, 0.01);
  const dc = (s: number): number => s * finite(p.decay, 1, 0.01);

  switch (name) {
    case 'pop': {
      // Pitch climbs C4..A5 along the scale.
      bubble(v, t, hz(pentaMidi(5 + climb(index), 48)), 0.28, out, shaped(p, { ...BUBBLE, decay: 0.12 }));
      v.noise(t, 0.001, dc(0.03), 0.2 * p.noise, popBody ?? kit.popBand);
      break;
    }
    case 'pop-big': {
      const f = hz(pentaMidi(5 + climb(index), 48));
      const body = shaped(p, { attack: 0.005, decay: 0.26, shape: 0, overtone: 1, noise: 1 });
      for (const detune of [0.995, 1.005]) {
        const o = v.tone(body.shape, f * 0.5 * detune, t, body.attack, body.decay, 0.17, out);
        o.frequency.exponentialRampToValueAtTime(f * detune, t + 0.05);
      }
      v.noise(t, 0.001, dc(0.05), 0.26 * body.noise, popBody ?? kit.popBand);
      // Quiet sparkle tail: C5 E5 G5 C6.
      const sparkle = [72, 76, 79, 84];
      const bt = shaped(p, { ...BELL, decay: 0.25 });
      for (let i = 0; i < sparkle.length; i++) {
        bell(v, t + 0.08 + i * 0.07, hz(sparkle[i] ?? 72), 0.06 * body.overtone, out, bt);
      }
      break;
    }
    case 'miss': {
      // Soft descending "aw": E4 then C4, triangle through a low lowpass.
      const tone = shaped(p, { attack: 0.012, decay: 0.11, shape: 1, overtone: 0, noise: 0 });
      v.tone(tone.shape, hz(64), t, tone.attack, tone.decay, 0.13, out);
      const o = v.tone(tone.shape, hz(60), t + 0.1, at(0.015), dc(0.135), 0.12, out);
      o.frequency.exponentialRampToValueAtTime(hz(59), t + 0.1 + dc(0.15));
      break;
    }
    case 'key': {
      // A..Z rises across two octaves of the scale, C4..C6.
      const i = Math.min(25, Math.max(0, Math.floor(index)));
      marimba(v, t, hz(pentaMidi(Math.round((i * 10) / 25), 60)), 0.3, out, shaped(p, MARIMBA));
      break;
    }
    case 'backspace': {
      const tone = shaped(p, { attack: 0.006, decay: 0.15, shape: 0, overtone: 0, noise: 0 });
      const o = v.tone(tone.shape, hz(72), t, tone.attack, tone.decay, 0.2, out);
      o.frequency.exponentialRampToValueAtTime(hz(60), t + dc(0.12));
      break;
    }
    case 'go': {
      // do mi sol, C5 E5 G5, over a soft G4.
      const short = shaped(p, { ...BELL, decay: 0.45 });
      bell(v, t, hz(72), 0.18, out, short);
      bell(v, t + 0.09, hz(76), 0.18, out, short);
      bell(v, t + 0.18, hz(79), 0.2, out, shaped(p, { ...BELL, decay: 0.75 }));
      v.tone(0, hz(67), t + 0.18, at(0.02), dc(0.7), 0.06, out);
      break;
    }
    case 'button': {
      switch (design) {
        case 'tok': {
          // Wooden knock: a short wood-band click, a hollow body note, a low thump.
          v.noise(t, 0.001, dc(0.02), 0.35 * p.noise, kit.wood);
          const body = v.tone(0.3 + p.shape, hz(69), t, at(0.001), dc(0.06), 0.16, out); // A4
          body.frequency.exponentialRampToValueAtTime(hz(66), t + 0.05);
          const thump = v.tone(0, hz(45), t, at(0.002), dc(0.1), 0.22, out); // A2 falling
          thump.frequency.exponentialRampToValueAtTime(hz(38), t + 0.09);
          if (p.overtone > 0) v.tone('sine', hz(69) * 2.76, t, 0.001, dc(0.025), 0.03 * p.overtone, out);
          break;
        }
        case 'boing': {
          // Rubbery: triangle dips, then springs up past the start, with a wobble.
          const env = v.gain(out);
          const end = t + at(0.006) + dc(0.28);
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(0.2, t + at(0.006));
          env.gain.setValueAtTime(0.2, t + 0.12);
          env.gain.exponentialRampToValueAtTime(0.0001, end);
          const o = v.osc(Math.min(1, 1 + p.shape), hz(52), t, end + 0.01, env); // E3
          o.frequency.exponentialRampToValueAtTime(hz(43), t + 0.05); // down to G2
          o.frequency.exponentialRampToValueAtTime(hz(57), t + 0.16); // up to A3
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 9;
          const depth = ctx.createGain();
          depth.gain.setValueAtTime(0, t);
          depth.gain.linearRampToValueAtTime(9, t + 0.15);
          lfo.connect(depth);
          depth.connect(o.frequency);
          v.own(depth);
          v.ownSource(lfo, t, end + 0.01);
          if (p.noise > 0) v.noise(t, 0.001, 0.012, 0.08 * p.noise, kit.wood);
          break;
        }
        case 'budum': {
          // Two soft low notes, G3 then C4, each with a gentle knock.
          const tone = shaped(p, { attack: 0.004, decay: 0.16, shape: 0.35, overtone: 0.2, noise: 0 });
          marimba(v, t, hz(55), 0.2, out, tone);
          marimba(v, t + 0.1, hz(60), 0.24, out, { ...tone, decay: tone.decay * 1.3 });
          v.noise(t, 0.001, 0.015, 0.12 * p.noise, kit.wood);
          v.noise(t + 0.1, 0.001, 0.015, 0.12 * p.noise, kit.wood);
          break;
        }
        default: {
          // Bloop: a sine that leaps up an octave fast, with a tiny vibrato.
          const tone = shaped(p, { attack: 0.004, decay: 0.17, shape: 0, overtone: 0.25, noise: 0 });
          const env = v.gain(out);
          const end = t + tone.attack + tone.decay;
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(0.24, t + tone.attack);
          env.gain.setValueAtTime(0.24, t + 0.05);
          env.gain.exponentialRampToValueAtTime(0.0001, end);
          const o = v.osc(tone.shape, hz(55), t, end + 0.01, env); // G3 up to G4
          o.frequency.exponentialRampToValueAtTime(hz(67), t + 0.06);
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 14;
          const depth = ctx.createGain();
          depth.gain.setValueAtTime(0, t);
          depth.gain.linearRampToValueAtTime(10, t + 0.08);
          lfo.connect(depth);
          depth.connect(o.frequency);
          v.own(depth);
          v.ownSource(lfo, t, end + 0.01);
          if (tone.overtone > 0) {
            const top = v.tone('sine', hz(55) * 2, t, tone.attack, Math.min(0.08, tone.decay), 0.24 * tone.overtone, out);
            top.frequency.exponentialRampToValueAtTime(hz(67) * 2, t + 0.06);
          }
          if (tone.noise > 0) v.noise(t, 0.001, 0.01, 0.24 * tone.noise, out);
          break;
        }
      }
      break;
    }
    case 'hover': {
      // Soft E5 tick, about 70 ms to silence (about 50 ms clearly audible).
      const tone = shaped(p, { attack: 0.004, decay: 0.065, shape: 0, overtone: 0, noise: 0 });
      v.tone(tone.shape, hz(76), t, tone.attack, Math.min(0.08, tone.decay), 0.07, out);
      break;
    }
    case 'star': {
      const note = STAR_NOTES[Math.min(STAR_NOTES.length - 1, Math.max(0, Math.floor(index)))] ?? 72;
      if (design === 'glide-bell') {
        // A low body note slides gently up a fourth into the star's pitch,
        // then a soft, slow-starting bell blooms on top.
        const body = shaped(p, { attack: 0.03, decay: 0.75, shape: 0.2, overtone: 0, noise: 0 });
        const env = v.gain(out);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.19, t + body.attack);
        env.gain.exponentialRampToValueAtTime(0.0001, t + body.attack + body.decay);
        const o = v.osc(body.shape, hz(note - 17), t, t + body.attack + body.decay + 0.01, env);
        o.frequency.exponentialRampToValueAtTime(hz(note - 12), t + 0.22);
        bell(v, t + 0.12, hz(note), 0.16, out, shaped(p, { ...BELL, attack: 0.02, decay: 0.75, overtone: 0.12 }));
        v.tone(0, hz(48), t, at(0.02), dc(0.7), 0.06, out); // C3 floor
        break;
      }
      bell(v, t, hz(note), 0.2, out, shaped(p, { ...BELL, decay: 0.7 }));
      marimba(v, t, hz(note - 12), 0.08, out, shaped(p, { ...MARIMBA, decay: 0.4 }));
      v.tone(0, hz(48), t, at(0.01), dc(0.6), 0.07, out); // warm C3 sub
      break;
    }
    case 'fanfare': {
      const ready = renderKey(ctx, name, variant, p);
      const rendered = ready ? renders.get(ready) : undefined;
      if (rendered?.buffer) {
        // The same notes, rendered ahead by prepareSfx with the same lead before the first note, so the buffer
        // starts on the render quantum and every sample lines up with the live build.
        const src = ctx.createBufferSource();
        src.buffer = rendered.buffer;
        src.connect(v.out(out));
        v.ownSource(src, t - LEAD, t - LEAD + rendered.end);
      } else fanfare(v, t, p, out);
      break;
    }
    case 'sticker': {
      // Squish (quick downward sine), pop (upward sine plus noise), quiet sparkle.
      const tone = shaped(p, { attack: 0.004, decay: 0.08, shape: 0, overtone: 1, noise: 1 });
      const squish = v.tone(tone.shape, hz(64), t, tone.attack, tone.decay, 0.2, out); // E4 down to about C#3
      squish.frequency.exponentialRampToValueAtTime(hz(49), t + 0.07);
      const pt = t + 0.06;
      bubble(v, pt, hz(81), 0.2, out, shaped(p, { ...BUBBLE, decay: 0.08 }));
      v.noise(pt, 0.001, dc(0.03), 0.14 * tone.noise, popBody ?? kit.popBand);
      const sparkle = [76, 79, 84]; // E5 G5 C6
      const bt = shaped(p, { ...BELL, decay: 0.28 });
      for (let i = 0; i < sparkle.length; i++) bell(v, t + 0.14 + i * 0.06, hz(sparkle[i] ?? 76), 0.05 * tone.overtone, out, bt);
      break;
    }
    case 'yawn': {
      // Rise a little, then a slow glide down with a soft vibrato.
      const tone = shaped(p, { attack: 0.12, decay: 0.35, shape: 0, overtone: 0, noise: 0 });
      const hold = t + Math.max(tone.attack, 0.45);
      const end = hold + tone.decay;
      const env = v.gain(out);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.16, t + tone.attack);
      env.gain.setValueAtTime(0.16, hold);
      env.gain.linearRampToValueAtTime(0, end);
      const o = v.osc(tone.shape, hz(67), t, end + 0.01, env);
      o.frequency.exponentialRampToValueAtTime(hz(69), t + 0.2);
      o.frequency.exponentialRampToValueAtTime(hz(57), end - 0.05);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(7, t + 0.4);
      lfo.connect(depth);
      depth.connect(o.frequency);
      v.own(depth);
      v.ownSource(lfo, t, end + 0.01);
      break;
    }
    case 'whoosh': {
      // The sweep moves the filter, so this one filter is built per call.
      const top = Math.min(2400, finite(p.brightness, 3000, 400));
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.8;
      band.frequency.setValueAtTime(300, t);
      band.frequency.exponentialRampToValueAtTime(top, t + 0.2);
      band.frequency.exponentialRampToValueAtTime(top / 2, t + 0.3);
      band.connect(v.out(out));
      v.own(band);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.22 * finite(p.noise, 1, 0), t + Math.min(0.25, at(0.13)));
      env.gain.linearRampToValueAtTime(0, t + 0.3);
      env.connect(band);
      v.own(env);
      v.noiseInto(env, t, t + 0.31);
      break;
    }
    case 'tick': {
      // Tiny wood block near 1.1 kHz.
      const tone = shaped(p, { attack: 0.001, decay: 0.035, shape: 0, overtone: 0, noise: 1 });
      const o = v.tone(tone.shape, hz(79) * 1.4, t, tone.attack, tone.decay, 0.12, out);
      o.frequency.exponentialRampToValueAtTime(hz(79) * 1.2, t + 0.035);
      v.noise(t, 0.001, dc(0.015), 0.12 * tone.noise, kit.wood);
      break;
    }
    case 'coin-clink': {
      // Two soft bell partials a sixth apart, low on the scale (C4 up), with a tiny wood tick for the contact.
      const f = hz(pentaMidi(climb(index), 60));
      const bt = shaped(p, { ...BELL, decay: 0.22, overtone: 0.3 });
      bell(v, t, f, 0.1, out, bt);
      bell(v, t + 0.035, f * 1.68, 0.05, out, bt);
      v.noise(t, 0.001, dc(0.012), 0.08 * p.noise, kit.wood);
      break;
    }
    case 'bill-rustle': {
      // Two quick soft paper scuffs: band noise through the wood band, the second a little quieter.
      v.noise(t, at(0.01), dc(0.06), 0.16 * finite(p.noise, 1, 0), kit.popBand);
      v.noise(t + 0.07, at(0.01), dc(0.08), 0.11 * finite(p.noise, 1, 0), kit.popBand);
      break;
    }
    case 'lock-spin': {
      // A dial's ratchet: six wood clicks that speed up then slow, stepping down the scale, then a deeper catch.
      const gaps = [0, 0.07, 0.13, 0.18, 0.235, 0.3];
      for (let i = 0; i < gaps.length; i++) {
        const ct = t + (gaps[i] ?? 0);
        v.noise(ct, 0.001, dc(0.012), 0.16 * p.noise, kit.wood);
        v.tone(0, hz(pentaMidi(6 - i, 60)), ct, at(0.001), dc(0.03), 0.05, out);
      }
      marimba(v, t + 0.4, hz(55), 0.16, out, shaped(p, { ...MARIMBA, decay: 0.12 }));
      v.noise(t + 0.4, 0.001, dc(0.02), 0.2 * p.noise, kit.wood);
      break;
    }
    case 'door-clunk': {
      // A heavy soft thud (C3 falling to G2), a hollow wood knock on top and a low marimba ring.
      const thump = v.tone(0, hz(48), t, at(0.003), dc(0.22), 0.3, out);
      thump.frequency.exponentialRampToValueAtTime(hz(43), t + 0.15);
      v.noise(t, 0.001, dc(0.04), 0.3 * p.noise, kit.wood);
      marimba(v, t + 0.01, hz(55), 0.12, out, shaped(p, { ...MARIMBA, decay: 0.3 }));
      break;
    }
    case 'jar-fill': {
      // A bubbly glug that climbs with `index` (C4 up the scale), with a soft splash of noise.
      bubble(v, t, hz(pentaMidi(climb(index), 60)), 0.18, out, shaped(p, { ...BUBBLE, decay: 0.14 }));
      v.noise(t, 0.002, dc(0.05), 0.08 * p.noise, kit.popBand);
      break;
    }
  }

  kit.pool.add(v.done());
}

/** Sound-effect voices sounding right now (for dev checks of the voice cap). */
export function activeSfxVoices(audio: Audio): number {
  const ctx = audio.context;
  const bus = audio.sfxBus;
  const kit = bus ? kits.get(bus) : undefined;
  return ctx && kit ? kit.pool.activeAt(ctx.currentTime) : 0;
}
