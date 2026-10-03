/**
 * Slots for short spoken shape names. The clip list is the hand-edited file
 * public/voice/shape-workshop/clips.json (a JSON array of clip names, file
 * names without .mp3). A clip plays only when its name is in that list and
 * the file loads; anything else is silently skipped, so an empty list makes no
 * clip requests and no console errors. See public/voice/shape-workshop/README.md.
 */

import type { AppServices } from '../../app/services';
import type { Shape } from './paper';

/** Clip names from clips.json; empty until it loads, or if it is missing or malformed. */
let clips: readonly string[] = [];
let listRequested = false;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
let lastAt = 0;

/** Read the clip list once per page. Safe to call on every scene entry. */
export function loadVoiceList(services: AppServices): void {
  if (listRequested) return;
  listRequested = true;
  void fetch(`${services.base}voice/shape-workshop/clips.json`)
    .then(res => res.ok ? res.json() as Promise<unknown> : [])
    .then(list => { if (Array.isArray(list)) clips = list.filter((n): n is string => typeof n === 'string' && /^[a-z0-9-]+$/.test(n)); })
    .catch(() => undefined);
}

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

/** Say a shape's name if its clip is listed. At most one clip every 0.6 s. */
export function sayShape(services: AppServices, shape: Shape): void {
  if (!clips.includes(shape) || services.audio.muted || !services.audio.ready) return;
  const now = performance.now();
  if (now - lastAt < 600) return;
  lastAt = now;
  void load(services, shape).then(buffer => { if (buffer) services.audio.playBuffer(buffer, 0.9); });
}
