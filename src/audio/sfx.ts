/**
 * Named procedural sound effects. Scenes call playSfx(audio, name) and never
 * build oscillators themselves, so every sound in the hub shares one palette.
 *
 * Every pitched sound sits on the C major pentatonic scale, the same scale the
 * music uses, so effects never clash with the background track. Voices are
 * sines, sine/triangle blends and filtered noise: no square or sawtooth buzz.
 * Everything rolls off above about 3 kHz, and no lead voice goes above C6.
 * At most MAX_SFX_VOICES sound at once; a new one fades out the oldest.
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
  | 'tick'; // counter increments

export interface SfxOptions {
  /** 0-based index for pitch climbs (combo count, letter index). */
  index?: number;
  /** 0..1 volume scale. Default 1. */
  volume?: number;
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
];

/** Seconds from trigger until each effect is silent, at the default patches. */
export const SFX_DURATION: Readonly<Record<SfxName, number>> = {
  pop: 0.16,
  'pop-big': 0.6,
  miss: 0.25,
  key: 0.52,
  backspace: 0.16,
  go: 0.95,
  button: 0.18,
  hover: 0.04,
  star: 0.75,
  fanfare: 1.2,
  sticker: 0.6,
  yawn: 0.8,
  whoosh: 0.3,
  tick: 0.05,
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
  button: makePatch(),
  hover: makePatch({ brightness: 2400 }),
  star: makePatch(),
  fanfare: makePatch(),
  sticker: makePatch(),
  yawn: makePatch({ brightness: 1800 }),
  whoosh: makePatch(),
  tick: makePatch(),
};

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
    wood: makeFilter(ctx, 'bandpass', 1500, 3, roll),
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

export function playSfx(audio: Audio, name: SfxName, options: SfxOptions = {}): void {
  const ctx = audio.context;
  const bus = audio.sfxBus;
  if (!ctx || !bus || !audio.ready || audio.muted) return;
  const p = SFX_PATCHES[name];
  const volume = Math.min(1, finite(options.volume ?? 1, 1, 0)) * finite(p.level, 1, 0);
  if (volume <= 0) return;
  const index = finite(options.index ?? 0, 0, 0);
  const kit = kitFor(ctx, bus);
  const t = ctx.currentTime + 0.002;
  // The same sound at the same pitch twice within DEDUPE_SECONDS would add up
  // in phase and double the level, so the repeat is dropped.
  const key = `${name}:${Math.floor(index)}`;
  const prev = kit.last.get(key);
  if (prev !== undefined && t - prev < DEDUPE_SECONDS) return;
  kit.last.set(key, t);
  const v = new Voice(ctx, t, volume);
  const out = lowpassInto(ctx, bus, finite(p.brightness, 3000, 100));
  /** MIDI note to Hz, shifted by the patch register. */
  const register = finite(p.register, 0);
  const hz = (midi: number): number => midiHz(midi + register);
  const at = (s: number): number => s * finite(p.attack, 1, 0.01);
  const dc = (s: number): number => s * finite(p.decay, 1, 0.01);

  switch (name) {
    case 'pop': {
      // Pitch climbs C4..A5 along the scale.
      bubble(v, t, hz(pentaMidi(5 + climb(index), 48)), 0.28, out, shaped(p, { ...BUBBLE, decay: 0.12 }));
      v.noise(t, 0.001, dc(0.03), 0.2 * p.noise, kit.popBand);
      break;
    }
    case 'pop-big': {
      const f = hz(pentaMidi(5 + climb(index), 48));
      const body = shaped(p, { attack: 0.005, decay: 0.26, shape: 0, overtone: 1, noise: 1 });
      for (const detune of [0.995, 1.005]) {
        const o = v.tone(body.shape, f * 0.5 * detune, t, body.attack, body.decay, 0.17, out);
        o.frequency.exponentialRampToValueAtTime(f * detune, t + 0.05);
      }
      v.noise(t, 0.001, dc(0.05), 0.26 * body.noise, kit.popBand);
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
      v.noise(t, 0.001, dc(0.025), 0.3 * p.noise, kit.wood);
      const tone = shaped(p, { attack: 0.001, decay: 0.04, shape: 0, overtone: 1, noise: 0 });
      const body = v.tone(tone.shape, hz(81), t, tone.attack, tone.decay, 0.14, out); // A5 wood body
      body.frequency.exponentialRampToValueAtTime(hz(78), t + 0.04);
      bell(v, t + 0.012, hz(79), 0.045 * tone.overtone, out, shaped(p, { ...BELL, decay: 0.15 })); // G5
      break;
    }
    case 'hover': {
      const tone = shaped(p, { attack: 0.002, decay: 0.03, shape: 0, overtone: 0, noise: 0 });
      v.tone(tone.shape, hz(76), t, tone.attack, Math.min(0.035, tone.decay), 0.07, out); // E5
      break;
    }
    case 'star': {
      const note = STAR_NOTES[Math.min(STAR_NOTES.length - 1, Math.max(0, Math.floor(index)))] ?? 72;
      bell(v, t, hz(note), 0.2, out, shaped(p, { ...BELL, decay: 0.7 }));
      marimba(v, t, hz(note - 12), 0.08, out, shaped(p, { ...MARIMBA, decay: 0.4 }));
      v.tone(0, hz(48), t, at(0.01), dc(0.6), 0.07, out); // warm C3 sub
      break;
    }
    case 'fanfare': {
      // C5 E5 G5 then a held C6 over a soft C major chord and a C3 sub.
      const notes = [72, 76, 79];
      const quick = shaped(p, { ...BELL, decay: 0.35 });
      const wood = shaped(p, { ...MARIMBA, decay: 0.25 });
      for (let i = 0; i < notes.length; i++) {
        const nt = t + i * 0.13;
        const m = notes[i] ?? 72;
        bell(v, nt, hz(m), 0.15, out, quick);
        marimba(v, nt, hz(m - 12), 0.08, out, wood);
      }
      const top = t + 0.42;
      bell(v, top, hz(84), 0.15, out, shaped(p, { ...BELL, decay: 0.74 }));
      marimba(v, top, hz(72), 0.1, out, shaped(p, { ...MARIMBA, decay: 0.5 }));
      const chord = shaped(p, { attack: 0.06, decay: 0.72, shape: 0, overtone: 0, noise: 0 });
      for (const m of [60, 64, 67]) v.tone(chord.shape, hz(m), top - 0.02, chord.attack, chord.decay, 0.065, out);
      v.tone(Math.min(1, chord.shape + 1), hz(48), top - 0.02, at(0.01), dc(0.7), 0.1, out);
      break;
    }
    case 'sticker': {
      // Squish (quick downward sine), pop (upward sine plus noise), quiet sparkle.
      const tone = shaped(p, { attack: 0.004, decay: 0.08, shape: 0, overtone: 1, noise: 1 });
      const squish = v.tone(tone.shape, hz(64), t, tone.attack, tone.decay, 0.2, out); // E4 down to about C#3
      squish.frequency.exponentialRampToValueAtTime(hz(49), t + 0.07);
      const pt = t + 0.06;
      bubble(v, pt, hz(81), 0.2, out, shaped(p, { ...BUBBLE, decay: 0.08 }));
      v.noise(pt, 0.001, dc(0.03), 0.14 * tone.noise, kit.popBand);
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
      // Tiny wood block near 1.5 kHz.
      const tone = shaped(p, { attack: 0.001, decay: 0.03, shape: 0, overtone: 0, noise: 1 });
      const o = v.tone(tone.shape, hz(79) * 1.9, t, tone.attack, tone.decay, 0.12, out);
      o.frequency.exponentialRampToValueAtTime(hz(79) * 1.6, t + 0.03);
      v.noise(t, 0.001, dc(0.015), 0.12 * tone.noise, kit.wood);
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
