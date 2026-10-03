/**
 * Optional spoken letter clips. The owner drops files into
 * public/voice/letter-train/ and lists them in VOICE_CLIPS (clips.ts). Only
 * listed letters are ever requested, so a missing clip makes no request and
 * plays nothing. The files ship once, from public/, with no hashed copy.
 */
import type { Audio } from '../../engine/audio';
import { VOICE_CLIPS } from './clips';

const folder = `${import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`}voice/letter-train/`;
const urls = new Map<string, string>();
for (const file of VOICE_CLIPS) {
  const match = /^([a-z])\.(ogg|mp3)$/.exec(file);
  if (!match) continue;
  const name = match[1]!;
  if (!urls.has(name) || match[2] === 'ogg') urls.set(name, folder + file);
}
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

export function hasVoiceClip(letter: string): boolean {
  return urls.has(letter.toLowerCase());
}

/** Play the clip for a letter if one is listed. Loads on first use, then plays from memory. */
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
