/**
 * Spoken clips on one channel, shared by every scene. Starting a clip stops
 * the one playing, so voices never stack and nothing queues. Nothing plays
 * while the speaker button is off.
 *
 * A folder's clips are listed at build time by the caller's
 * `import.meta.glob('/public/voice/<folder>/*.mp3')`, so a missing clip is
 * silence with no request and no error. Once audio is unlocked, `preload`
 * loads the whole folder a few clips at a time (MAX_LOADS), and `prioritize`
 * moves the clips a round needs to the front of that line. A clip asked for
 * by `play` or `sequence` loads at once, outside the line.
 *
 * When a clip decodes, its loudness is measured once in 20 ms steps into a
 * Float32Array. `speakingLevel()` reads that curve by index against the audio
 * clock, so a scene can animate a talking character each frame without
 * allocating.
 *
 * The existing per-game loaders (src/games/<game>/voice.ts) stay as they are.
 */

import type { Audio } from '../engine/audio';

/** Loudness is measured in steps of this many seconds. */
const STEP_SECONDS = 0.02;
/** Loudness under this share of the clip's peak counts as silence. */
const FLOOR = 0.08;
/** A clip asked for before it decoded still starts if it decodes within this long. */
const PENDING_MS = 800;
/** Fade applied when a clip is cut off, so the cut does not click. */
const STOP_FADE = 0.012;
/**
 * Clips fetched and decoded at once while a folder preloads. Starting all of
 * Frog Pond's ~460 clips together kept Chrome's decode threads busy for about
 * 0.4 s and held back frame drawing (70-120 ms gaps on opening an activity).
 */
const MAX_LOADS = 3;

interface Clip {
  buffer: AudioBuffer;
  /** Loudness per STEP_SECONDS, 0..1 of the clip's own peak. */
  env: Float32Array;
}

/** The clips of one folder under public/voice/. */
export interface VoiceFolder {
  /** Folder name under public/voice/, such as 'wibble'. */
  readonly name: string;
  /** Clip names (file names without the extension) that exist, sorted. */
  readonly clips: readonly string[];
  has(clip: string): boolean;
}

interface FolderState extends VoiceFolder {
  url: string;
  files: Map<string, string>;
  decoded: Map<string, Clip | null>;
  loading: Set<string>;
  /** Clips waiting for a load slot, next first. May repeat a clip; loading or decoded ones are skipped. */
  queue: string[];
  preloaded: boolean;
}

function defaultBase(): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}voice/`;
}

/**
 * A folder of clips. `globKeys` are the keys of the caller's
 * `import.meta.glob('/public/voice/<name>/*.mp3')`, which lists the files
 * that exist at build time.
 */
export function voiceFolder(name: string, globKeys: readonly string[]): VoiceFolder {
  const files = new Map<string, string>();
  for (const path of globKeys) {
    const file = path.slice(path.lastIndexOf('/') + 1);
    files.set(file.replace(/\.(mp3|ogg)$/, ''), file);
  }
  const clips = [...files.keys()].sort();
  const state: FolderState = {
    name,
    clips,
    has: (clip) => files.has(clip),
    url: `${defaultBase()}${name}/`,
    files,
    decoded: new Map(),
    loading: new Set(),
    queue: [],
    preloaded: false,
  };
  return state;
}

/** Loudness per 20 ms step, scaled to the clip's peak, with quiet steps at 0. Runs once per clip. */
function measure(buffer: AudioBuffer): Float32Array {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.round(buffer.sampleRate * STEP_SECONDS));
  const n = Math.max(1, Math.ceil(data.length / step));
  const env = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const b = Math.min(data.length, a + step);
    let sum = 0;
    for (let j = a; j < b; j++) {
      const v = data[j] ?? 0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / Math.max(1, b - a));
    env[i] = rms;
    if (rms > peak) peak = rms;
  }
  for (let i = 0; i < n; i++) {
    const v = peak > 0 ? (env[i] ?? 0) / peak : 0;
    env[i] = v <= FLOOR ? 0 : Math.pow((v - FLOOR) / (1 - FLOOR), 0.7);
  }
  return env;
}

export interface VoicePlayer {
  /** Load every clip in the folder once audio is unlocked, MAX_LOADS at a time. Safe to call repeatedly. */
  preload(folder: VoiceFolder): void;
  /**
   * Load these clips next, in this order, ahead of the rest of the preload
   * (and even if the folder is not preloading). Waits for unlock like
   * preload. Missing clips are ignored. Call when a round starts, not per frame.
   */
  prioritize(folder: VoiceFolder, clips: readonly string[]): void;
  /**
   * Play one clip, stopping whatever is playing and cancelling a sequence.
   * Returns false, and plays nothing, when the sound is off, audio is not
   * unlocked or the clip does not exist. A clip still decoding starts when it
   * is ready, if nothing else was asked for first.
   */
  play(folder: VoiceFolder, clip: string): boolean;
  /**
   * Play clips one after another. Each starts `spacing` seconds after the one
   * before, or once that one has finished plus `gap`, whichever is later.
   * Missing clips are skipped; a clip not yet decoded is skipped but keeps its
   * beat. Any play(), sequence() or stop() cancels it. Returns false, and
   * plays nothing, when the sound is off, audio is locked or no clip exists.
   */
  sequence(folder: VoiceFolder, clips: readonly string[], spacing: number, gap: number): boolean;
  /** Stop speech now and cancel any sequence or waiting clip. Scenes call this when they exit. */
  stop(): void;
  /** True while a clip is audible. */
  isSpeaking(): boolean;
  /** True while speaking, in a sequence, or waiting for a clip to decode. */
  busy(): boolean;
  /** Loudness of the clip playing now, 0..1; 0 when silent. Reads the measured curve; no allocation. */
  speakingLevel(): number;
  /** Seconds of the clip playing now that have been heard (output latency allowed for), or -1 when silent. */
  elapsed(): number;
  /** Index into the running sequence of the clip it last started, or -1. */
  readonly sequenceIndex: number;
  /** Name of the clip playing, or '' when silent. */
  readonly current: string;
}

const players = new WeakMap<Audio, VoicePlayer>();

/** The one voice channel for this Audio service. */
export function voicePlayer(audio: Audio): VoicePlayer {
  let player = players.get(audio);
  if (!player) {
    player = createVoicePlayer(audio);
    players.set(audio, player);
  }
  return player;
}

/** Dev builds record every clip started, for browser checks (window.__voice). */
interface VoiceDebug {
  log: { clip: string; at: number }[];
  player: VoicePlayer;
}

function createVoicePlayer(audio: Audio): VoicePlayer {
  let out: GainNode | undefined;
  let outContext: AudioContext | undefined;
  let source: AudioBufferSourceNode | undefined;
  let sourceGain: GainNode | undefined;
  let env: Float32Array | undefined;
  let startAt = 0;
  let duration = 0;
  let currentName = '';
  let pendingFolder: FolderState | undefined;
  let pendingName = '';
  let pendingAt = 0;
  let seqFolder: FolderState | undefined;
  let seqClips: readonly string[] = [];
  let seqSpacing = 0;
  let seqGap = 0;
  let seqIndex = -1;
  let seqTimer: ReturnType<typeof setTimeout> | undefined;
  /** Loads in flight, queued or asked for directly. */
  let loads = 0;
  let unlocked = false;
  let waitingUnlock = false;
  /** Folders with clips queued, served in order; the one prioritized last comes first. */
  const waiting: FolderState[] = [];
  const debug: VoiceDebug | undefined = import.meta.env.DEV ? { log: [], player: undefined as unknown as VoicePlayer } : undefined;

  function canPlay(): boolean {
    const ctx = audio.context;
    return !audio.muted && !!ctx && ctx.state !== 'closed' && !!audio.sfxBus;
  }

  function output(ctx: AudioContext): GainNode | undefined {
    if (out && outContext === ctx) return out;
    if (!audio.sfxBus) return undefined;
    out = ctx.createGain();
    out.connect(audio.sfxBus);
    outContext = ctx;
    return out;
  }

  /** Fetch and decode one clip now. Returns false when it is missing, loading or already done. */
  function load(folder: FolderState, name: string): boolean {
    const file = folder.files.get(name);
    if (!file || folder.loading.has(name) || folder.decoded.has(name)) return false;
    folder.loading.add(name);
    loads++;
    void fetch(`${folder.url}${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((bytes) => audio.decode(bytes))
      .then(
        (buffer) => {
          folder.decoded.set(name, { buffer, env: measure(buffer) });
          folder.loading.delete(name);
          loads--;
          if (pendingFolder === folder && pendingName === name) {
            const late = performance.now() - pendingAt > PENDING_MS;
            pendingFolder = undefined;
            pendingName = '';
            if (!late) start(folder, name);
          }
          pump();
        },
        () => {
          folder.decoded.set(name, null);
          folder.loading.delete(name);
          loads--;
          if (pendingFolder === folder && pendingName === name) { pendingFolder = undefined; pendingName = ''; }
          pump();
        },
      );
    return true;
  }

  /** Start queued clips until MAX_LOADS are in flight. Nothing starts before unlock. */
  function pump(): void {
    while (unlocked && loads < MAX_LOADS && waiting.length > 0) {
      const folder = waiting[0]!;
      const name = folder.queue.shift();
      if (name === undefined) waiting.shift();
      else load(folder, name);
    }
  }

  /** Serve this folder's queue once audio is unlocked; `first` puts it ahead of other folders. */
  function wait(folder: FolderState, first: boolean): void {
    const at = waiting.indexOf(folder);
    if (at < 0 && !first) waiting.push(folder);
    else if (at !== 0 && first) {
      if (at > 0) waiting.splice(at, 1);
      waiting.unshift(folder);
    }
    if (!waitingUnlock) {
      waitingUnlock = true;
      audio.onUnlock(() => {
        unlocked = true;
        pump();
      });
    }
    pump();
  }

  /** Cut the clip playing, with a short fade. */
  function cut(): void {
    const ctx = audio.context;
    if (source && sourceGain && ctx) {
      const t = ctx.currentTime;
      try {
        sourceGain.gain.setTargetAtTime(0, t, STOP_FADE / 3);
        source.stop(t + STOP_FADE);
      } catch {
        /* already stopped */
      }
    }
    source = undefined;
    sourceGain = undefined;
    env = undefined;
    currentName = '';
  }

  function cancelSequence(): void {
    if (seqTimer !== undefined) clearTimeout(seqTimer);
    seqTimer = undefined;
    seqClips = [];
    seqFolder = undefined;
    seqIndex = -1;
  }

  /** Start a decoded clip now. Does not touch the sequence. */
  function start(folder: FolderState, name: string): boolean {
    const clip = folder.decoded.get(name);
    const ctx = audio.context;
    if (!clip || !ctx || !canPlay()) return false;
    const bus = output(ctx);
    if (!bus) return false;
    cut();
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = clip.buffer;
    src.connect(g);
    g.connect(bus);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      if (source === src) {
        source = undefined;
        sourceGain = undefined;
        env = undefined;
        currentName = '';
      }
    };
    src.start();
    source = src;
    sourceGain = g;
    env = clip.env;
    startAt = ctx.currentTime;
    duration = clip.buffer.duration;
    currentName = name;
    if (debug) debug.log.push({ clip: `${folder.name}/${name}`, at: Math.round(performance.now()) });
    return true;
  }

  /** Seconds into the clip that is being heard now. */
  function heardTime(): number {
    const ctx = audio.context;
    if (!ctx) return -1;
    const latency = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
    return ctx.currentTime - startAt - latency;
  }

  function isSpeaking(): boolean {
    if (!source) return false;
    if (audio.muted) {
      cut();
      return false;
    }
    return heardTime() < duration;
  }

  function seqStep(i: number): void {
    seqTimer = undefined;
    const folder = seqFolder;
    if (!folder) return;
    for (; i < seqClips.length; i++) {
      const name = seqClips[i] ?? '';
      if (!folder.files.has(name)) continue;
      seqIndex = i;
      if (start(folder, name)) {
        seqTimer = setTimeout(seqStep, Math.max(seqSpacing, duration + seqGap) * 1000, i + 1);
      } else {
        load(folder, name);
        seqTimer = setTimeout(seqStep, seqSpacing * 1000, i + 1);
      }
      return;
    }
    cancelSequence();
  }

  const player: VoicePlayer = {
    preload(folder) {
      const f = folder as FolderState;
      if (f.preloaded || f.files.size === 0) return;
      f.preloaded = true;
      for (const name of f.clips) f.queue.push(name);
      wait(f, false);
    },
    prioritize(folder, clips) {
      const f = folder as FolderState;
      let any = false;
      for (let i = clips.length - 1; i >= 0; i--) {
        const name = clips[i] ?? '';
        if (!f.files.has(name) || f.decoded.has(name) || f.loading.has(name)) continue;
        f.queue.unshift(name);
        any = true;
      }
      if (any) wait(f, true);
    },
    play(folder, clip) {
      const f = folder as FolderState;
      cancelSequence();
      pendingFolder = undefined;
      pendingName = '';
      if (!f.files.has(clip) || !canPlay()) return false;
      if (f.decoded.get(clip) === null) return false;
      if (start(f, clip)) return true;
      // Not decoded yet: stop what is playing and start this one when it is ready.
      cut();
      pendingFolder = f;
      pendingName = clip;
      pendingAt = performance.now();
      load(f, clip);
      return true;
    },
    sequence(folder, clips, spacing, gap) {
      const f = folder as FolderState;
      cancelSequence();
      pendingFolder = undefined;
      pendingName = '';
      if (!canPlay() || !clips.some((c) => f.files.has(c))) return false;
      cut();
      seqFolder = f;
      seqClips = clips.slice();
      seqSpacing = spacing;
      seqGap = gap;
      seqStep(0);
      return true;
    },
    stop() {
      cancelSequence();
      pendingFolder = undefined;
      pendingName = '';
      cut();
    },
    isSpeaking,
    busy() {
      // A clip still loading past its deadline will not play, so it no longer counts.
      const pending = pendingName !== '' && performance.now() - pendingAt <= PENDING_MS;
      return seqTimer !== undefined || pending || isSpeaking();
    },
    speakingLevel() {
      if (!env || !isSpeaking()) return 0;
      const t = heardTime();
      if (t < 0) return 0;
      const x = t / STEP_SECONDS;
      const i = Math.floor(x);
      if (i >= env.length) return 0;
      const a = env[i] ?? 0;
      const b = i + 1 < env.length ? (env[i + 1] ?? 0) : 0;
      return a + (b - a) * (x - i);
    },
    elapsed() {
      return isSpeaking() ? Math.max(0, heardTime()) : -1;
    },
    get sequenceIndex() {
      return seqIndex;
    },
    get current() {
      return isSpeaking() ? currentName : '';
    },
  };
  if (debug) {
    debug.player = player;
    (window as unknown as { __voice?: VoiceDebug }).__voice = debug;
  }
  return player;
}
