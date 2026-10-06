/**
 * Spoken clips for Market Stall, in the London market-stall voice, rendered
 * from scripts/voice/lines/market-stall.json (see that folder's README). A clip
 * plays only when its file is in public/voice/market-stall/ at build time; a
 * missing clip is skipped silently and causes no request.
 */
import type { Audio } from '../../engine/audio';

/** Clip names: a coin or bill name, or number-N for a number (see public/voice/market-stall/README.md). */
export type VoiceClip = `number-${number}` | 'penny' | 'nickel' | 'dime' | 'quarter' | 'one-dollar' | 'five-dollars' | 'ten-dollars' | 'twenty-dollars';

// Build-time list of the files that exist. The keys are enough: nothing is imported at runtime.
const FILES = Object.keys(import.meta.glob('/public/voice/market-stall/*.{mp3,ogg}', { query: '?url', import: 'default' }));
const AVAILABLE = new Map<string, string>();
for (const path of FILES) {
  const file = path.slice(path.lastIndexOf('/') + 1), name = file.replace(/\.(mp3|ogg)$/, '');
  if (!AVAILABLE.has(name) || file.endsWith('.mp3')) AVAILABLE.set(name, file);
}

const buffers = new Map<string, AudioBuffer | null>();
const loading = new Set<string>();

function load(audio: Audio, base: string, name: string): void {
  const file = AVAILABLE.get(name);
  if (!file || loading.has(name) || !audio.context) return;
  loading.add(name);
  void fetch(`${base}voice/market-stall/${file}`)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then(bytes => audio.decode(bytes))
    .then(buffer => { buffers.set(name, buffer); }, () => { buffers.set(name, null); });
}

/** Decode every available clip once audio is unlocked. Safe to call repeatedly. */
export function preloadVoice(audio: Audio, base: string): void {
  if (!AVAILABLE.size) return;
  audio.onUnlock(() => { for (const name of AVAILABLE.keys()) load(audio, base, name); });
}

/** When the last clip started will have finished, in the audio clock's seconds. */
let speechEnds = 0;

/** Play a clip if its file exists and has decoded; otherwise do nothing. */
export function playVoice(audio: Audio, name: VoiceClip): void {
  const buffer = buffers.get(name);
  if (!buffer || audio.muted || !audio.context) return;
  audio.playBuffer(buffer, 1);
  speechEnds = Math.max(speechEnds, audio.context.currentTime + buffer.duration);
}

/** Seconds until the clips already playing have finished (0 when none is). */
export function voiceRemaining(audio: Audio): number {
  return audio.context && !audio.muted ? Math.max(0, speechEnds - audio.context.currentTime) : 0;
}

export const voiceClipCount = (): number => AVAILABLE.size;
