/**
 * Web Audio wrapper. The AudioContext is created lazily and resumed on the
 * first user gesture, because browsers refuse to start audio before one.
 *
 * Graph: source -> sfx bus or music bus -> master gain -> destination.
 */

const MUTE_KEY = 'corewise.audio.muted';

export interface BlipOptions {
  /** Oscillator frequency in Hz. Default 440. */
  frequency?: number;
  /** Total length in seconds. Default 0.12. */
  duration?: number;
  /** Attack time in seconds. Default 0.005. */
  attack?: number;
  /** Release time in seconds (counted inside duration). Default 0.06. */
  release?: number;
  /** Peak gain in [0, 1]. Default 0.4. */
  volume?: number;
  type?: OscillatorType;
  /** Optional frequency to glide to by the end of the blip. */
  slideTo?: number;
}

export interface Audio {
  /** True once the context exists and is running. */
  readonly ready: boolean;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  toggleMuted(): boolean;
  /** 0..1 */
  setMasterVolume(v: number): void;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  /** Call from any user gesture handler; safe to call repeatedly. */
  unlock(): Promise<void>;
  /** Procedural one-shot. Silent until unlocked. */
  blip(options?: BlipOptions): void;
  /** Play a decoded buffer once on the sfx bus. */
  playBuffer(buffer: AudioBuffer, volume?: number): void;
  /** Replace the looping music track; pass undefined to stop. */
  setMusic(buffer: AudioBuffer | undefined, fadeSeconds?: number): void;
  /** Decode an ArrayBuffer (from fetch) into an AudioBuffer. Requires unlock first. */
  decode(data: ArrayBuffer): Promise<AudioBuffer>;
  /**
   * The AudioContext, or undefined until the first unlock() creates it.
   * For procedural voices (src/audio) that build their own nodes.
   */
  readonly context: AudioContext | undefined;
  /** Gain feeding the destination; mute sets it to 0. Undefined before unlock(). */
  readonly masterBus: GainNode | undefined;
  /** Sound-effects bus into the master gain. Undefined before unlock(). */
  readonly sfxBus: GainNode | undefined;
  /** Music bus into the master gain. Undefined before unlock(). */
  readonly musicBus: GainNode | undefined;
  /**
   * Run `listener` once when the context first reaches the running state,
   * or right away if it already is. Returns a function that cancels it.
   */
  onUnlock(listener: () => void): () => void;
  destroy(): void;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* storage unavailable; mute stays in memory */
  }
}

export function createAudio(): Audio {
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let sfx: GainNode | undefined;
  let music: GainNode | undefined;
  let musicSource: AudioBufferSourceNode | undefined;
  let muted = readMuted();
  let masterVolume = 1;
  let sfxVolume = 1;
  let musicVolume = 0.4; // music sits at 40% of the sfx level
  const unlockListeners = new Set<() => void>();

  function fireUnlock(): void {
    if (ctx?.state !== 'running' || unlockListeners.size === 0) return;
    const listeners = [...unlockListeners];
    unlockListeners.clear();
    for (const fn of listeners) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }

  function ensureGraph(): AudioContext | undefined {
    if (ctx) return ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    ctx = new Ctor();
    master = ctx.createGain();
    sfx = ctx.createGain();
    music = ctx.createGain();
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    ctx.addEventListener('statechange', fireUnlock);
    applyVolumes();
    return ctx;
  }

  function applyVolumes(): void {
    if (!ctx || !master || !sfx || !music) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : masterVolume, t, 0.01);
    sfx.gain.setTargetAtTime(sfxVolume, t, 0.01);
    music.gain.setTargetAtTime(musicVolume, t, 0.01);
  }

  const gestureEvents = ['pointerdown', 'keydown', 'touchstart'] as const;
  const onGesture = (): void => {
    void unlock();
  };
  for (const ev of gestureEvents) window.addEventListener(ev, onGesture, { passive: true });

  async function unlock(): Promise<void> {
    const c = ensureGraph();
    if (!c) return;
    if (c.state !== 'running') {
      try {
        await c.resume();
      } catch {
        return;
      }
    }
    if (c.state === 'running') {
      for (const ev of gestureEvents) window.removeEventListener(ev, onGesture);
      fireUnlock();
    }
  }

  return {
    get ready() {
      return ctx?.state === 'running';
    },
    get muted() {
      return muted;
    },
    setMuted(m) {
      muted = m;
      writeMuted(m);
      applyVolumes();
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },
    setMasterVolume(v) {
      masterVolume = Math.min(1, Math.max(0, v));
      applyVolumes();
    },
    setSfxVolume(v) {
      sfxVolume = Math.min(1, Math.max(0, v));
      applyVolumes();
    },
    setMusicVolume(v) {
      musicVolume = Math.min(1, Math.max(0, v));
      applyVolumes();
    },
    unlock,
    blip(options = {}) {
      if (!ctx || !sfx || ctx.state !== 'running') return;
      const {
        frequency = 440,
        duration = 0.12,
        attack = 0.005,
        release = 0.06,
        volume = 0.4,
        type = 'square',
        slideTo,
      } = options;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, t0);
      if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), t0 + attack);
      const releaseStart = Math.max(t0 + attack, t0 + duration - release);
      env.gain.setValueAtTime(Math.max(0.0001, volume), releaseStart);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(env);
      env.connect(sfx);
      osc.start(t0);
      osc.stop(t0 + duration + 0.01);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    },
    playBuffer(buffer, volume = 1) {
      if (!ctx || !sfx || ctx.state !== 'running') return;
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = volume;
      src.buffer = buffer;
      src.connect(g);
      g.connect(sfx);
      src.start();
      src.onended = () => {
        src.disconnect();
        g.disconnect();
      };
    },
    setMusic(buffer, fadeSeconds = 0.5) {
      if (!ctx || !music) return;
      const t = ctx.currentTime;
      if (musicSource) {
        const old = musicSource;
        musicSource = undefined;
        try {
          old.stop(t + fadeSeconds);
        } catch {
          /* already stopped */
        }
      }
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(music);
      src.start(t);
      musicSource = src;
    },
    async decode(data) {
      const c = ensureGraph();
      if (!c) throw new Error('Web Audio unavailable');
      return c.decodeAudioData(data);
    },
    get context() {
      return ctx;
    },
    get masterBus() {
      return master;
    },
    get sfxBus() {
      return sfx;
    },
    get musicBus() {
      return music;
    },
    onUnlock(listener) {
      if (ctx?.state === 'running') {
        listener();
        return () => {};
      }
      unlockListeners.add(listener);
      return () => {
        unlockListeners.delete(listener);
      };
    },
    destroy() {
      unlockListeners.clear();
      for (const ev of gestureEvents) window.removeEventListener(ev, onGesture);
      musicSource?.stop();
      void ctx?.close();
      ctx = undefined;
    },
  };
}
