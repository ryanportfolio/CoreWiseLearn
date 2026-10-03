/**
 * Looping background music from audio files the owner composes.
 *
 * startMusic(audio, track) loads `<base>music/<track>.mp3` (or `.ogg` if there
 * is no MP3), decodes it once, and loops it on the music bus. The engine's
 * music bus starts 12 dB below the sound-effects bus. Switching
 * tracks crossfades; a missing file means silence, with one console.info.
 * See public/music/README.md for the file names and export advice.
 */

import type { Audio } from '../engine/audio';

export type MusicTrack = 'name-entry' | 'hub' | 'ocean' | 'sticker-book' | 'dino-picnic';

export const MUSIC_TRACKS: readonly MusicTrack[] = ['name-entry', 'hub', 'ocean', 'sticker-book', 'dino-picnic'];

const EXTENSIONS = ['mp3', 'ogg'] as const;
/** The build lists existing files so absent owner music creates no offline requests. */
declare const __MUSIC_FILES__: readonly string[];

function defaultFolder(): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}music/`;
}

let folder = defaultFolder();

/**
 * Point the player at another folder (ending in a slash), for dev pages that
 * test with stand-in files. Clears the cache. The game never calls this.
 */
export function setMusicFolder(url: string | undefined): void {
  folder = url ?? defaultFolder();
  bytesCache.clear();
  // Decoded buffers came from the old folder too; a WeakMap cannot be cleared, so replace it.
  decodedCache = new WeakMap();
}

// ---------------------------------------------------------------------------
// Loading. Bytes are fetched once per track (this works before unlock);
// decoding needs the AudioContext, so it waits for unlock and is cached per
// context.

const bytesCache = new Map<MusicTrack, Promise<ArrayBuffer | undefined>>();
let decodedCache = new WeakMap<BaseAudioContext, Map<MusicTrack, Promise<AudioBuffer | undefined>>>();

function fetchBytes(track: MusicTrack): Promise<ArrayBuffer | undefined> {
  let p = bytesCache.get(track);
  if (p) return p;
  p = (async () => {
    for (const ext of EXTENSIONS) {
      if (folder === defaultFolder() && !__MUSIC_FILES__.includes(`${track}.${ext}`)) continue;
      try {
        const res = await fetch(`${folder}${track}.${ext}`);
        // A dev server may answer a missing file with the HTML app shell.
        if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) continue;
        return await res.arrayBuffer();
      } catch {
        /* network error: try the next format */
      }
    }
    console.info(`music: no ${track}.mp3 or ${track}.ogg in ${folder}; playing silence`);
    return undefined;
  })();
  bytesCache.set(track, p);
  return p;
}

function decoded(ctx: BaseAudioContext, track: MusicTrack): Promise<AudioBuffer | undefined> {
  let map = decodedCache.get(ctx);
  if (!map) {
    map = new Map();
    decodedCache.set(ctx, map);
  }
  let p = map.get(track);
  if (p) return p;
  p = fetchBytes(track).then(async (bytes) => {
    if (!bytes) return undefined;
    try {
      // decodeAudioData detaches the buffer it is given, so hand it a copy.
      return await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      console.info(`music: ${track} could not be decoded; playing silence`);
      return undefined;
    }
  });
  map.set(track, p);
  return p;
}

const SILENCE = 1e-5;
const MAX_TRIM_SECONDS = 0.1;

/**
 * Loop points that skip pure digital silence (encoder padding) at either end,
 * at most 100 ms each, so an MP3 loops without a gap.
 */
function loopPoints(buf: AudioBuffer): { start: number; end: number } {
  const maxTrim = Math.floor(buf.sampleRate * MAX_TRIM_SECONDS);
  const len = buf.length;
  const audible = (i: number): boolean => {
    for (let c = 0; c < buf.numberOfChannels; c++) if (Math.abs(buf.getChannelData(c)[i] ?? 0) > SILENCE) return true;
    return false;
  };
  let first = 0;
  while (first < maxTrim && first < len - 1 && !audible(first)) first++;
  let last = len - 1;
  while (len - 1 - last < maxTrim && last > first && !audible(last)) last--;
  return { start: first / buf.sampleRate, end: (last + 1) / buf.sampleRate };
}

// ---------------------------------------------------------------------------
// Playback.

interface Playing {
  track: MusicTrack;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface MusicState {
  /** The track the game asked for last, even while it loads or waits for unlock. */
  wanted: MusicTrack | undefined;
  wantedFade: number;
  playing: Playing | undefined;
  cancelUnlock: (() => void) | undefined;
}

const states = new WeakMap<Audio, MusicState>();

function stateFor(audio: Audio): MusicState {
  let st = states.get(audio);
  if (!st) {
    st = { wanted: undefined, wantedFade: 1.2, playing: undefined, cancelUnlock: undefined };
    states.set(audio, st);
  }
  return st;
}

function fadeOut(ctx: BaseAudioContext, p: Playing, fade: number): void {
  const now = ctx.currentTime;
  const g = p.gain.gain;
  const from = g.value;
  const end = now + Math.max(0.02, fade);
  g.cancelScheduledValues(now);
  g.setValueAtTime(from, now);
  g.linearRampToValueAtTime(0, end);
  p.source.stop(end + 0.02);
  p.source.onended = () => {
    p.source.disconnect();
    p.gain.disconnect();
  };
}

/** Load the wanted track and crossfade to it, unless the request changed meanwhile. */
async function play(audio: Audio, st: MusicState, track: MusicTrack, fade: number): Promise<void> {
  const ctx = audio.context;
  const bus = audio.musicBus;
  if (!ctx || !bus) return;
  const buf = await decoded(ctx, track);
  if (st.wanted !== track || st.playing?.track === track) return;
  if (st.playing) {
    fadeOut(ctx, st.playing, fade);
    st.playing = undefined;
  }
  if (!buf) return;
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.loop = true;
  const { start, end } = loopPoints(buf);
  source.loopStart = start;
  source.loopEnd = end;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fade));
  source.connect(gain);
  gain.connect(bus);
  source.start(now, start);
  st.playing = { track, source, gain };
}

/**
 * Play a track on loop. Same track: no-op. Another track playing: crossfade
 * over `fadeSeconds`. Before the first user gesture unlocks audio, the request
 * is remembered and starts on unlock. A missing file plays silence.
 */
export function startMusic(audio: Audio, track: MusicTrack, fadeSeconds = 1.2): void {
  const st = stateFor(audio);
  if (st.wanted === track) return;
  st.wanted = track;
  st.wantedFade = fadeSeconds;
  void fetchBytes(track);
  if (!audio.ready) {
    st.cancelUnlock ??= audio.onUnlock(() => {
      st.cancelUnlock = undefined;
      if (st.wanted) void play(audio, st, st.wanted, st.wantedFade);
    });
    return;
  }
  void play(audio, st, track, fadeSeconds);
}

/** Fade the music out and stop it. */
export function stopMusic(audio: Audio, fadeSeconds = 0.5): void {
  const st = stateFor(audio);
  st.wanted = undefined;
  st.cancelUnlock?.();
  st.cancelUnlock = undefined;
  const ctx = audio.context;
  if (st.playing && ctx) fadeOut(ctx, st.playing, fadeSeconds);
  st.playing = undefined;
}

/** The track asked for last (playing, loading, or waiting for unlock), if any. */
export function currentMusic(audio: Audio): MusicTrack | undefined {
  return states.get(audio)?.wanted;
}
