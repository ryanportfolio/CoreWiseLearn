import type { Profile } from '../engine/save';

/**
 * Deterministic avatar and accent colour for a profile name, so the same
 * name always gets the same animal and colour on every screen.
 */

export const AVATARS = ['fox', 'panda', 'frog', 'bunny', 'lion', 'penguin', 'koala', 'owl'] as const;
export type AvatarName = (typeof AVATARS)[number];

export const ACCENTS = ['#ff7a59', '#ffd23f', '#6ee7b7', '#7cc4ff', '#c084fc', '#f472b6', '#fb923c', '#34d399'] as const;

function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.toUpperCase().charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function avatarFor(name: string | Profile): AvatarName {
  if (typeof name !== 'string') return AVATARS.includes(name.avatar as AvatarName) ? name.avatar as AvatarName : avatarFor(name.id);
  return AVATARS[hash(name) % AVATARS.length] ?? 'fox';
}

/** Sprite path under public/art/. */
export function avatarPath(name: string | Profile): string {
  return `avatars/${avatarFor(name)}.webp`;
}

/** Sprite-store name: `avatar:<animal>`. */
export function avatarSpriteName(name: string | Profile): string {
  return `avatar:${avatarFor(name)}`;
}

export function accentFor(name: string | Profile): string {
  if (typeof name !== 'string') return name.accent;
  return ACCENTS[(hash(name) >>> 8) % ACCENTS.length] ?? '#ffd23f';
}
