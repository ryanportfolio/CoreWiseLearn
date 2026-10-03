/**
 * Synth building blocks for the sound effects (sfx.ts): pitch helpers, a cached
 * noise buffer, a per-note node builder with a click-free kill, and a voice
 * pool that caps how many notes sound at once.
 *
 * Everything takes a BaseAudioContext so the same code renders offline
 * (OfflineAudioContext) for previews.
 */

/** Major pentatonic steps in semitones: do re mi sol la. */
const PENTA = [0, 2, 4, 7, 9] as const;

/** `x` if it is a finite number at least `min`, else `fallback`. */
export function finite(x: number, fallback: number, min = -Infinity): number {
  return Number.isFinite(x) && x >= min ? x : fallback;
}

export function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI note of a C major pentatonic degree; degree 0 is `base` (a C). */
export function pentaMidi(degree: number, base = 60): number {
  const octave = Math.floor(degree / 5);
  const step = PENTA[degree - octave * 5] ?? 0;
  return base + 12 * octave + step;
}

const NOISE_SECONDS = 2;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of mono white noise, generated once per context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Small LCG so previews render identically every time.
  let seed = 0x2f6b9a1d;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  noiseCache.set(ctx, buf);
  return buf;
}

export function makeFilter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q: number, dest: AudioNode): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

const SILENT = 0.0001;
const KILL_FADE = 0.02;

/**
 * One note or sound effect: every node it creates, routed through a kill gain
 * per destination so the voice pool can fade it out in 20 ms without a click.
 * Nodes disconnect themselves when the last source stops.
 */
export class Voice {
  start: number;
  end: number;
  private readonly outs: GainNode[] = [];
  private readonly outDests: AudioNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private lastSource: AudioScheduledSourceNode | undefined;
  private lastStop = -1;
  private readonly volume: number;

  constructor(
    readonly ctx: BaseAudioContext,
    t: number,
    volume = 1,
  ) {
    this.volume = finite(volume, 1, 0);
    this.start = t;
    this.end = t;
  }

  /** The kill gain feeding `dest`, created on first use. */
  out(dest: AudioNode): GainNode {
    const i = this.outDests.indexOf(dest);
    const existing = i >= 0 ? this.outs[i] : undefined;
    if (existing) return existing;
    const g = this.ctx.createGain();
    g.gain.value = this.volume;
    g.connect(dest);
    this.outs.push(g);
    this.outDests.push(dest);
    this.nodes.push(g);
    return g;
  }

  private addSource(src: AudioScheduledSourceNode, t: number, stop: number): void {
    src.start(t);
    src.stop(stop);
    this.sources.push(src);
    this.nodes.push(src);
    if (stop >= this.lastStop) {
      this.lastStop = stop;
      this.lastSource = src;
    }
    if (stop > this.end) this.end = stop;
  }

  /** Gain node routed to this voice's kill gain for `dest`. */
  gain(dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.out(dest));
    this.nodes.push(g);
    return g;
  }

  /** Oscillator into `env`, started at t and stopped at `stop`. */
  osc(type: Shape, freq: number, t: number, stop: number, env: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    setShape(this.ctx, o, type);
    o.frequency.setValueAtTime(finite(freq, 440, 1), t);
    o.connect(env);
    this.addSource(o, t, stop);
    return o;
  }

  /** Percussive partial: linear attack to `peak`, exponential decay to silence. */
  tone(type: Shape, freq: number, t: number, attack: number, decay: number, peak: number, dest: AudioNode): OscillatorNode {
    const env = this.gain(dest);
    const a = finite(attack, 0.002, 0.001);
    const d = finite(decay, 0.1, 0.005);
    percEnv(env.gain, t, a, d, peak);
    return this.osc(type, freq, t, t + a + d + 0.01, env);
  }

  /** Noise burst with a percussive envelope. */
  noise(t: number, attack: number, decay: number, peak: number, dest: AudioNode): AudioBufferSourceNode {
    const env = this.gain(dest);
    const a = finite(attack, 0.001, 0.001);
    const d = finite(decay, 0.02, 0.005);
    percEnv(env.gain, t, a, d, peak);
    return this.noiseInto(env, t, t + a + d + 0.01);
  }

  /** Raw looping noise source into `env`, for envelopes the caller shapes. */
  noiseInto(env: AudioNode, t: number, stop: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuffer(this.ctx);
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = NOISE_SECONDS;
    src.connect(env);
    this.sources.push(src);
    this.nodes.push(src);
    // Random start offset so repeated bursts are not identical.
    src.start(t, Math.random() * (NOISE_SECONDS - 0.5));
    src.stop(stop);
    if (stop >= this.lastStop) {
      this.lastStop = stop;
      this.lastSource = src;
    }
    if (stop > this.end) this.end = stop;
    return src;
  }

  /** Register a node the caller created (an extra filter, an LFO gain) for cleanup. */
  own(node: AudioNode): void {
    this.nodes.push(node);
  }

  /** Register a source the caller created and scheduled (an LFO) for cleanup and kill. */
  ownSource(src: AudioScheduledSourceNode, t: number, stop: number): void {
    this.addSource(src, t, stop);
  }

  /** Arm cleanup once all nodes are scheduled. */
  done(): this {
    const last = this.lastSource;
    if (last) {
      const nodes = this.nodes;
      last.onended = () => {
        for (const n of nodes) n.disconnect();
      };
    }
    return this;
  }

  /** Fade out fast from `t` and stop every source. */
  kill(t: number): void {
    const at = Math.max(t, this.start);
    for (const g of this.outs) {
      g.gain.setValueAtTime(this.volume, at);
      g.gain.linearRampToValueAtTime(0, at + KILL_FADE);
    }
    const stop = at + KILL_FADE + 0.01;
    for (const s of this.sources) {
      try {
        s.stop(stop);
      } catch {
        /* already ended */
      }
    }
    if (stop < this.end) this.end = stop;
  }
}

/** Linear attack to `peak`, exponential decay to silence. Bad inputs fall back to safe values. */
export function percEnv(param: AudioParam, t: number, attack: number, decay: number, peak: number): void {
  const a = finite(attack, 0.002, 0.001);
  const d = finite(decay, 0.1, 0.005);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(Math.max(SILENT, finite(peak, 0, 0)), t + a);
  param.exponentialRampToValueAtTime(SILENT, t + a + d);
}

/**
 * Caps simultaneous voices. When full, a new voice fades out the oldest one
 * (voices are added in start order, so that is the first in the list).
 */
export class VoicePool {
  private readonly voices: Voice[] = [];

  constructor(private readonly max: number) {}

  add(v: Voice): void {
    const t = v.start;
    // Drop records of voices that have finished by the time this one starts.
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const old = this.voices[i];
      if (old && old.end <= t) this.voices.splice(i, 1);
    }
    while (this.voices.length >= this.max) this.voices.shift()?.kill(t);
    this.voices.push(v);
  }

  /** Voices still sounding at time `t`. */
  activeAt(t: number): number {
    let n = 0;
    for (const v of this.voices) if (v.start <= t && v.end > t) n++;
    return n;
  }
}

// ---------------------------------------------------------------------------
// Waveform mix: 0 = sine, 1 = triangle, anything between blends the two.

const waveCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
const TRI = 8 / (Math.PI * Math.PI);

/** Periodic wave for a sine/triangle blend, cached per context in 5% steps. */
export function shapeWave(ctx: BaseAudioContext, shape: number): PeriodicWave {
  const key = Math.round(Math.min(1, Math.max(0, shape)) * 20);
  let map = waveCache.get(ctx);
  if (!map) {
    map = new Map();
    waveCache.set(ctx, map);
  }
  let wave = map.get(key);
  if (wave) return wave;
  const s = key / 20;
  const n = 16;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  imag[1] = 1 - s + s * TRI;
  for (let h = 3; h < n; h += 2) imag[h] = s * TRI * (((h - 1) / 2) % 2 === 0 ? 1 : -1) / (h * h);
  wave = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
  map.set(key, wave);
  return wave;
}

/** Oscillator type or a sine/triangle blend (0..1). */
export type Shape = OscillatorType | number;

export function setShape(ctx: BaseAudioContext, o: OscillatorNode, shape: Shape): void {
  if (typeof shape !== 'number') o.type = shape;
  else if (shape <= 0.025) o.type = 'sine';
  else if (shape >= 0.975) o.type = 'triangle';
  else o.setPeriodicWave(shapeWave(ctx, shape));
}

const lowpassCache = new WeakMap<AudioNode, Map<number, BiquadFilterNode>>();

/** Lowpass into `dest` at `cutoff` Hz, cached per destination in 50 Hz steps. */
export function lowpassInto(ctx: BaseAudioContext, dest: AudioNode, cutoff: number): BiquadFilterNode {
  const key = Math.max(100, Math.round(cutoff / 50) * 50);
  let map = lowpassCache.get(dest);
  if (!map) {
    map = new Map();
    lowpassCache.set(dest, map);
  }
  let f = map.get(key);
  if (!f) {
    f = makeFilter(ctx, 'lowpass', key, 0.5, dest);
    map.set(key, f);
  }
  return f;
}

// ---------------------------------------------------------------------------
// Tone parameters. Each sound effect is written with designed constants that
// a Patch then scales, so a tuning page can move register, brightness,
// envelope, waveform mix and noise without touching the code.

export interface Patch {
  /** Semitones added to every pitch. */
  register: number;
  /** Lowpass cutoff in Hz applied to the whole sound. */
  brightness: number;
  /** Output level multiplier. */
  level: number;
  /** Attack time multiplier. */
  attack: number;
  /** Decay time multiplier. */
  decay: number;
  /** Added to each body's sine/triangle blend (-1..1). */
  shape: number;
  /** Overtone partial level multiplier. */
  overtone: number;
  /** Noise layer level multiplier. */
  noise: number;
}

export const DEFAULT_PATCH: Readonly<Patch> = {
  register: 0,
  brightness: 3000,
  level: 1,
  attack: 1,
  decay: 1,
  shape: 0,
  overtone: 1,
  noise: 1,
};

export function makePatch(over: Partial<Patch> = {}): Patch {
  return { ...DEFAULT_PATCH, ...over };
}

/** Shape of one instrument hit, in absolute units. */
export interface Tone {
  attack: number;
  decay: number;
  /** Body waveform, 0 sine .. 1 triangle. */
  shape: number;
  /** Overtone partial level relative to the body. */
  overtone: number;
  /** Noise layer level relative to the body. */
  noise: number;
}

/** Apply a patch's multipliers to designed tone constants. */
export function shaped(p: Patch, base: Tone): Tone {
  return {
    attack: finite(base.attack * p.attack, base.attack, 0.001),
    decay: finite(base.decay * p.decay, base.decay, 0.005),
    shape: Math.min(1, Math.max(0, finite(base.shape + p.shape, base.shape))),
    // Raising overtone or noise above 1 also adds a little where the design has
    // none, so the controls do something on every instrument. At 1 nothing changes.
    overtone: finite(base.overtone * p.overtone + Math.max(0, p.overtone - 1) * 0.1, base.overtone, 0),
    noise: finite(base.noise * p.noise + Math.max(0, p.noise - 1) * 0.15, base.noise, 0),
  };
}

// ---------------------------------------------------------------------------
// Instruments. `peak` is the body level.

export const MARIMBA: Readonly<Tone> = { attack: 0.002, decay: 0.5, shape: 0, overtone: 0.3, noise: 0 };
export const BELL: Readonly<Tone> = { attack: 0.003, decay: 0.6, shape: 0, overtone: 0.22, noise: 0 };
export const PLUCK: Readonly<Tone> = { attack: 0.003, decay: 0.3, shape: 1, overtone: 0.3, noise: 0 };
export const BUBBLE: Readonly<Tone> = { attack: 0.004, decay: 0.11, shape: 0, overtone: 0, noise: 0 };

/** Marimba: body with a slight pitch drop plus a fast-decaying 4x partial. */
export function marimba(v: Voice, t: number, freq: number, peak: number, dest: AudioNode, tone: Tone = MARIMBA): void {
  const body = v.tone(tone.shape, freq * 1.015, t, tone.attack, tone.decay, peak, dest);
  body.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
  if (tone.overtone > 0) v.tone('sine', freq * 4, t, 0.001, Math.min(0.07, tone.decay * 0.2), peak * tone.overtone, dest);
  if (tone.noise > 0) v.noise(t, 0.001, 0.02, peak * tone.noise, dest);
}

/** Soft bell: fundamental plus a short inharmonic strike partial. */
export function bell(v: Voice, t: number, freq: number, peak: number, dest: AudioNode, tone: Tone = BELL): void {
  v.tone(tone.shape, freq, t, tone.attack, tone.decay, peak, dest);
  if (tone.overtone > 0) v.tone('sine', freq * 2.76, t, 0.002, Math.min(0.18, tone.decay * 0.3), peak * tone.overtone, dest);
  if (tone.noise > 0) v.noise(t, 0.001, 0.015, peak * tone.noise, dest);
}

/** Ukulele-like pluck: triangle body (send through a lowpass) plus a short 2x sine. */
export function pluck(v: Voice, t: number, freq: number, peak: number, dest: AudioNode, tone: Tone = PLUCK): void {
  v.tone(tone.shape, freq, t, tone.attack, tone.decay, peak, dest);
  if (tone.overtone > 0) v.tone('sine', freq * 2, t, 0.002, Math.min(0.06, tone.decay * 0.25), peak * tone.overtone, dest);
  if (tone.noise > 0) v.noise(t, 0.001, 0.01, peak * tone.noise, dest);
}

/** Bubble blip: quick pitch-up to `freq`. */
export function bubble(v: Voice, t: number, freq: number, peak: number, dest: AudioNode, tone: Tone = BUBBLE): void {
  const o = v.tone(tone.shape, freq * 0.55, t, tone.attack, tone.decay, peak, dest);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
  if (tone.noise > 0) v.noise(t, 0.001, 0.03, peak * tone.noise, dest);
}
