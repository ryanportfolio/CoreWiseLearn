/**
 * The sticker collection. Games award ids from this list; the sticker book
 * shows every entry, earned or not. Paths are relative to the art root.
 */

export interface StickerDef {
  id: string;
  /** Sprite path under public/art/. */
  path: string;
  /** Which game can award it. */
  game: string;
}

export const STICKERS: readonly StickerDef[] = [
  { id: 'clownfish', path: 'creatures/clownfish.png', game: 'bubble-pop' },
  { id: 'turtle', path: 'creatures/turtle.png', game: 'bubble-pop' },
  { id: 'jellyfish', path: 'creatures/jellyfish.png', game: 'bubble-pop' },
  { id: 'seahorse', path: 'creatures/seahorse.png', game: 'bubble-pop' },
  { id: 'crab', path: 'creatures/crab.png', game: 'bubble-pop' },
  { id: 'starfish', path: 'creatures/starfish.png', game: 'bubble-pop' },
  { id: 'octopus-purple', path: 'creatures/octopus-purple.png', game: 'bubble-pop' },
  { id: 'pufferfish', path: 'creatures/pufferfish.png', game: 'bubble-pop' },
  { id: 'dolphin', path: 'creatures/dolphin.png', game: 'bubble-pop' },
  { id: 'whale-small', path: 'creatures/whale-small.png', game: 'bubble-pop' },
];

export function stickerById(id: string): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}

/** Sprite-store name used for a sticker's image: `sticker:<id>`. */
export function stickerSpriteName(id: string): string {
  return `sticker:${id}`;
}
