/**
 * Slots for short spoken shape names. A clip plays only when its name is
 * listed in VOICE_CLIPS and the file loads from public/voice/shape-workshop/;
 * anything else is silently skipped, so an empty list makes no requests and
 * no console errors. See public/voice/shape-workshop/README.md.
 */

import type { AppServices } from '../../app/services';
import type { Shape } from './paper';

/** Clip names (file name without .mp3) that exist in public/voice/shape-workshop/. None ship yet. */
export const VOICE_CLIPS: readonly string[] = [];

const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
let lastAt = 0;

function load(services: AppServices, name: string): Promise<AudioBuffer | undefined> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`${services.base}voice/shape-workshop/${name}.mp3`)
      .then(res => res.ok ? res.arrayBuffer() : undefined)
      .then(bytes => bytes && services.audio.ready ? services.audio.decode(bytes) : undefined)
      .catch(() => undefined);
    buffers.set(name, p);
  }
  return p;
}

/** Say a shape's name if its clip exists. At most one clip every 0.6 s. */
export function sayShape(services: AppServices, shape: Shape): void {
  if (!VOICE_CLIPS.includes(shape) || services.audio.muted || !services.audio.ready) return;
  const now = performance.now();
  if (now - lastAt < 600) return;
  lastAt = now;
  void load(services, shape).then(buffer => { if (buffer) services.audio.playBuffer(buffer, 0.9); });
}
