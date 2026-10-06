/**
 * Optional spoken clips for Coin Vault. A clip plays only when its file is in
 * public/voice/coin-vault/ at build time; a missing clip is skipped silently
 * and causes no request. No clips ship yet (see that folder's README).
 */
import type { Audio } from '../../engine/audio';

/** Clip names: coin and bill names, and number-1 .. number-20, number-25, number-30 .. number-100 say a number. */
export type VoiceClip = `number-${number}` | 'penny' | 'nickel' | 'dime' | 'quarter' | 'one-dollar' | 'five-dollars' | 'ten-dollars' | 'twenty-dollars';

// Build-time list of the files that exist. The keys are enough: nothing is imported at runtime.
const FILES = Object.keys(import.meta.glob('/public/voice/coin-vault/*.{mp3,ogg}', { query: '?url', import: 'default' }));
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
  void fetch(`${base}voice/coin-vault/${file}`)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then(bytes => audio.decode(bytes))
    .then(buffer => { buffers.set(name, buffer); }, () => { buffers.set(name, null); });
}

/** Decode every available clip once audio is unlocked. Safe to call repeatedly. */
export function preloadVoice(audio: Audio, base: string): void {
  if (!AVAILABLE.size) return;
  audio.onUnlock(() => { for (const name of AVAILABLE.keys()) load(audio, base, name); });
}

/** Play a clip if its file exists and has decoded; otherwise do nothing. */
export function playVoice(audio: Audio, name: VoiceClip): void {
  const buffer = buffers.get(name);
  if (buffer && !audio.muted) audio.playBuffer(buffer, 1);
}

export const voiceClipCount = (): number => AVAILABLE.size;
