/**
 * Dev page for the sound palette: one big button per sound effect, one per
 * music track, plus stop and mute. Also exposes window.__audioTest so a
 * script can play sounds, read the output level, and render sound-effect WAV
 * previews. Music plays from public/music/ files; with none there, the track
 * buttons are silent.
 */

import { bootApp } from '../app/boot';
import type { Audio } from '../engine/audio';
import type { Scene } from '../engine/scene';
import { SFX_DURATION, SFX_NAMES, activeSfxVoices, playSfx, sfxDuration, type SfxName, type SfxOptions, type SfxVariant } from '../audio/sfx';
import { MUSIC_TRACKS, currentMusic, setMusicFolder, startMusic, stopMusic, type MusicTrack } from '../audio/music';
import { createButton, dispatchDown, dispatchUp, type Button } from '../ui/button';
import { DISPLAY_FONT } from '../ui/draw';

const services = bootApp();
const { audio, input, sprites, loop } = services;

// ---------------------------------------------------------------------------
// Level meter: an AnalyserNode tapped off the master bus, attached on request
// only, so nothing analyses audio unless a test asks for it.

let analyser: AnalyserNode | undefined;
let meterBuf: Float32Array<ArrayBuffer> | undefined;

function attachMeter(): boolean {
  if (analyser) return true;
  const ctx = audio.context;
  const master = audio.masterBus;
  if (!ctx || !master) return false;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  meterBuf = new Float32Array(analyser.fftSize);
  master.connect(analyser);
  return true;
}

function detachMeter(): void {
  if (!analyser) return;
  audio.masterBus?.disconnect(analyser);
  analyser = undefined;
  meterBuf = undefined;
}

function rms(): number {
  if (!analyser || !meterBuf) return 0;
  analyser.getFloatTimeDomainData(meterBuf);
  let sum = 0;
  for (let i = 0; i < meterBuf.length; i++) {
    const s = meterBuf[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / meterBuf.length);
}

/** RMS every `everyMs` for `ms`, as [msSinceStart, rms] pairs. */
function sample(ms: number, everyMs = 5): Promise<[number, number][]> {
  attachMeter();
  const out: [number, number][] = [];
  const t0 = performance.now();
  return new Promise((resolve) => {
    const id = setInterval(() => {
      const t = performance.now() - t0;
      out.push([Math.round(t), rms()]);
      if (t >= ms) {
        clearInterval(id);
        resolve(out);
      }
    }, everyMs);
  });
}

const QUIET = 0.001; // -60 dBFS

/** Play one effect into silence and report its peak and when it went quiet. */
async function measureSfx(name: SfxName, options: SfxOptions = {}): Promise<{ name: SfxName; statedMs: number; peak: number; lastAudibleMs: number; quietAfterMs: number }> {
  attachMeter();
  const stated = SFX_DURATION[name];
  const pending = sample(stated * 1000 + 600, 4);
  playSfx(audio, name, options);
  const samples = await pending;
  let peak = 0;
  let last = 0;
  for (const [t, r] of samples) {
    if (r > peak) peak = r;
    if (r > QUIET) last = t;
  }
  // The analyser window is 512 samples (about 11 ms); allow for it.
  return { name, statedMs: Math.round(stated * 1000), peak: Number(peak.toFixed(4)), lastAudibleMs: last, quietAfterMs: last };
}

// ---------------------------------------------------------------------------
// Offline rendering to WAV.

function offlineAudio(ctx: OfflineAudioContext): Audio {
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  sfx.connect(master);
  music.connect(master);
  master.connect(ctx.destination);
  const noop = (): void => {};
  return {
    ready: true,
    state: 'on',
    setMasterTrimDb: noop,
    muted: false,
    setMuted: noop,
    toggleMuted: () => false,
    setMasterVolume: noop,
    setSfxVolume: noop,
    setMusicVolume: noop,
    unlock: () => Promise.resolve(),
    blip: noop,
    playBuffer: () => undefined,
    setMusic: noop,
    decode: () => Promise.reject(new Error('offline preview')),
    context: ctx as unknown as AudioContext,
    masterBus: master,
    sfxBus: sfx,
    musicBus: music,
    onUnlock(fn) {
      fn();
      return noop;
    },
    destroy: noop,
  };
}

const RATE = 44100;

function encodeWav(buf: AudioBuffer): Uint8Array {
  const data = buf.getChannelData(0);
  const bytes = new Uint8Array(44 + data.length * 2);
  const view = new DataView(bytes.buffer);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + data.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function stats(buf: AudioBuffer): { seconds: number; peak: number; rms: number } {
  const d = buf.getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    const s = Math.abs(d[i] ?? 0);
    if (s > peak) peak = s;
    sum += s * s;
  }
  return { seconds: Number(buf.duration.toFixed(2)), peak: Number(peak.toFixed(4)), rms: Number(Math.sqrt(sum / d.length).toFixed(4)) };
}

async function renderSfx(name: SfxName, options: SfxOptions = {}): Promise<{ base64: string; seconds: number; peak: number; rms: number }> {
  const ctx = new OfflineAudioContext(1, Math.ceil((sfxDuration(name, options.variant) + 0.25) * RATE), RATE);
  playSfx(offlineAudio(ctx), name, options);
  const buf = await ctx.startRendering();
  return { base64: toBase64(encodeWav(buf)), ...stats(buf) };
}

/** Combo-style sequence (pop index 0..n) rendered as one file. */
async function renderSequence(name: SfxName, count: number, gapSeconds: number, variant?: SfxVariant): Promise<{ base64: string; seconds: number; peak: number; rms: number }> {
  const total = count * gapSeconds + sfxDuration(name, variant) + 0.25;
  const ctx = new OfflineAudioContext(1, Math.ceil(total * RATE), RATE);
  const fake = offlineAudio(ctx);
  for (let i = 0; i < count; i++) {
    ctx.suspend(i * gapSeconds).then(() => {
      playSfx(fake, name, variant ? { index: i, variant } : { index: i });
      void ctx.resume();
    }, () => {});
  }
  const buf = await ctx.startRendering();
  return { base64: toBase64(encodeWav(buf)), ...stats(buf) };
}

// ---------------------------------------------------------------------------
// Scene: a grid of big buttons with a label under each.

interface Entry {
  label: string;
  fill: string;
  press(): void;
}

const counters: Partial<Record<SfxName, number>> = {};
const SFX_WRAP: Partial<Record<SfxName, number>> = { pop: 12, 'pop-big': 10, key: 26, star: 3 };

function playFromButton(name: SfxName): void {
  const wrap = SFX_WRAP[name];
  if (wrap === undefined) {
    playSfx(audio, name);
    return;
  }
  const i = counters[name] ?? 0;
  playSfx(audio, name, { index: i });
  counters[name] = (i + 1) % wrap;
}

const entries: Entry[] = [
  ...SFX_NAMES.map((name): Entry => ({ label: name, fill: '#ffcc33', press: () => playFromButton(name) })),
  ...MUSIC_TRACKS.map((track): Entry => ({ label: track, fill: '#6fd3ff', press: () => startMusic(audio, track) })),
  { label: 'stop', fill: '#ff8a80', press: () => stopMusic(audio) },
  { label: 'mute', fill: '#b9f6ca', press: () => audio.toggleMuted() },
];

function createAudioScene(): Scene {
  const buttons: Button[] = entries.map((e) => createButton({ x: 0, y: 0, radius: 48, fill: e.fill, onPress: e.press }));

  function layout(width: number, height: number): void {
    const cols = width > height ? 7 : 4;
    const rows = Math.ceil(buttons.length / cols);
    const top = 70;
    const cellW = width / cols;
    const cellH = (height - top) / rows;
    const r = Math.max(30, Math.min(cellW, cellH) * 0.3);
    buttons.forEach((b, i) => {
      b.x = cellW * (i % cols) + cellW / 2;
      b.y = top + cellH * Math.floor(i / cols) + cellH * 0.42;
      b.radius = r;
    });
  }

  return {
    enter() {
      layout(services.canvas.width, services.canvas.height);
      buttons.forEach((b, i) => b.popIn(i * 0.02));
    },
    resize(w, h) {
      layout(w, h);
    },
    update(dt) {
      for (const b of buttons) b.update(dt, input.pointer.x, input.pointer.y);
    },
    render({ ctx, width, height }) {
      ctx.fillStyle = '#1b1f3b';
      ctx.fillRect(0, 0, width, height);
      buttons.forEach((b, i) => {
        b.render(ctx, sprites);
        const e = entries[i];
        if (!e) return;
        ctx.font = `700 15px ${DISPLAY_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffffff';
        const label = e.label === 'mute' ? (audio.muted ? 'unmute' : 'mute') : e.label;
        ctx.fillText(label, b.x, b.y + b.radius + 10);
      });
      const s = loop.stats;
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(
        `audio ${audio.ready ? 'on' : 'locked (click anywhere)'}${audio.muted ? ' MUTED' : ''}  track ${currentMusic(audio) ?? '-'}  frame mean ${s.mean.toFixed(2)} ms max ${s.max.toFixed(1)} ms`,
        12,
        10,
      );
      if (analyser) ctx.fillText(`rms ${rms().toFixed(4)}`, 12, 30);
    },
    handleInput(event) {
      if (event.type === 'pointerdown') dispatchDown(buttons, event.info.x, event.info.y);
      else if (event.type === 'pointerup') dispatchUp(buttons, event.info.x, event.info.y);
    },
  };
}

void services.scenes.replace(createAudioScene());
loop.start();

// ---------------------------------------------------------------------------

const audioTest = {
  sfx: SFX_NAMES,
  tracks: MUSIC_TRACKS,
  durations: SFX_DURATION,
  ready: () => audio.ready,
  muted: () => audio.muted,
  setMuted: (m: boolean) => audio.setMuted(m),
  current: () => currentMusic(audio),
  play: (name: SfxName, options?: SfxOptions) => playSfx(audio, name, options),
  start: (track: MusicTrack, fadeSeconds?: number) => startMusic(audio, track, fadeSeconds),
  stop: (fadeSeconds?: number) => stopMusic(audio, fadeSeconds),
  activeVoices: () => activeSfxVoices(audio),
  attachMeter,
  detachMeter,
  rms,
  sample,
  measureSfx,
  /** Load music from another folder (ending in a slash), for stand-in test files. */
  setMusicFolder,
  renderSfx,
  renderSequence,
};

declare global {
  interface Window {
    __audioTest?: typeof audioTest;
  }
}
window.__audioTest = audioTest;
