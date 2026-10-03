/**
 * Optional spoken clips. public/voice/web-playground/clips.json lists the clip
 * files that exist (shipped empty). A listed name plays; anything else is
 * skipped silently, so a missing clip never causes a request.
 */
import type { AppServices } from '../../app/services';

let listed: Promise<Set<string>> | undefined;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
/** Counts prompts. A clip plays only if no newer prompt, pause or exit came while its file loaded and decoded. */
let current = 0;

function clipList(services: AppServices): Promise<Set<string>> {
  listed ??= fetch(`${services.base}voice/web-playground/clips.json`)
    .then(r => (r.ok ? r.json() : []))
    .then((list: unknown) => new Set(Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : []))
    .catch(() => new Set<string>());
  return listed;
}

/** Start loading the list so the first request can speak without delay. */
export function prepareClips(services: AppServices): void {
  void clipList(services);
}

/** Drop any clip still loading: its prompt has been answered, or the scene was paused or left. */
export function cancelClips(): void {
  current++;
}

/** Play `<name>.mp3` (or the listed file name) when the owner has added it. Starting a new clip cancels any still loading. */
export function playClip(services: AppServices, name: string): void {
  const audio = services.audio, id = ++current;
  if (!audio.ready || audio.muted) return;
  void clipList(services).then(set => {
    if (id !== current) return;
    const file = set.has(`${name}.mp3`) ? `${name}.mp3` : set.has(`${name}.ogg`) ? `${name}.ogg` : '';
    if (!file) return;
    let p = buffers.get(file);
    if (!p) {
      p = fetch(`${services.base}voice/web-playground/${file}`)
        .then(r => (r.ok ? r.arrayBuffer() : undefined))
        .then(data => (data ? audio.decode(data) : undefined))
        .catch(() => undefined);
      buffers.set(file, p);
    }
    return p.then(buffer => { if (buffer && id === current && !audio.muted) audio.playBuffer(buffer, 0.9); });
  });
}
