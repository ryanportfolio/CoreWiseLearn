/**
 * Optional spoken letter clips. Files the owner drops into
 * public/voice/letter-train/ (a.ogg ... z.ogg, or .mp3) are found at build
 * time, so a missing clip makes no request and plays nothing.
 */
import type { Audio } from '../../engine/audio';

const found = import.meta.glob('/public/voice/letter-train/*.{ogg,mp3}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urls = new Map<string, string>();
for (const [path, url] of Object.entries(found)) {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.(ogg|mp3)$/, '').toLowerCase();
  if (!urls.has(name) || path.endsWith('.ogg')) urls.set(name, url);
}
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

export function hasVoiceClip(letter: string): boolean {
  return urls.has(letter.toLowerCase());
}

/** Play the clip for a letter if one exists. Loads on first use, then plays from memory. */
export function playVoiceClip(audio: Audio, letter: string): void {
  const key = letter.toLowerCase(), url = urls.get(key);
  if (!url || !audio.ready || audio.muted) return;
  let pending = buffers.get(key);
  if (!pending) {
    pending = fetch(url).then(r => (r.ok ? r.arrayBuffer() : undefined)).then(data => (data ? audio.decode(data) : undefined)).catch(() => undefined);
    buffers.set(key, pending);
  }
  void pending.then(buffer => { if (buffer && !audio.muted) audio.playBuffer(buffer, 0.9); });
}
