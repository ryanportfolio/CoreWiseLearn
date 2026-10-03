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
  { id: 'fox', path: 'avatars/fox.png', game: 'bubble-pop' },
  { id: 'panda', path: 'avatars/panda.png', game: 'bubble-pop' },
  { id: 'frog', path: 'avatars/frog.png', game: 'bubble-pop' },
  { id: 'bunny', path: 'avatars/bunny.png', game: 'bubble-pop' },
  { id: 'lion', path: 'avatars/lion.png', game: 'bubble-pop' },
  { id: 'penguin', path: 'avatars/penguin.png', game: 'bubble-pop' },
  { id: 'koala', path: 'avatars/koala.png', game: 'bubble-pop' },
  { id: 'owl', path: 'avatars/owl.png', game: 'bubble-pop' },
  { id: 'rainbow-unicorn', path: 'stickers/rainbow-unicorn.webp', game: 'bubble-pop' },
  { id: 'red-rocket', path: 'stickers/red-rocket.webp', game: 'bubble-pop' },
  { id: 'green-dino', path: 'stickers/green-dino.webp', game: 'bubble-pop' },
  { id: 'rainbow-candy', path: 'stickers/rainbow-candy.webp', game: 'bubble-pop' },
  { id: 'ocean-friend', path: 'stickers/ocean-friend.webp', game: 'bubble-pop' },
  { id: 'happy-star', path: 'stickers/happy-star.webp', game: 'bubble-pop' },
  { id: 'dino-picnic-hatchling', path: 'dino-picnic/sticker-hatchling.webp', game: 'dino-picnic' },
  { id: 'dino-picnic-pterosaur', path: 'dino-picnic/sticker-pterosaur.webp', game: 'dino-picnic' },
  { id: 'dino-picnic-rex', path: 'dino-picnic/sticker-rex.webp', game: 'dino-picnic' },
  { id: 'dino-picnic-ankylosaurus', path: 'dino-picnic/sticker-ankylosaurus.webp', game: 'dino-picnic' },
  { id: 'dino-picnic-parasaurolophus', path: 'dino-picnic/sticker-parasaurolophus.webp', game: 'dino-picnic' },
  { id: 'dino-picnic-cake', path: 'dino-picnic/sticker-cake.webp', game: 'dino-picnic' },
  { id: 'letter-train-bunny', path: 'letter-train/passengers/bunny.webp', game: 'letter-train' },
  { id: 'letter-train-duckling', path: 'letter-train/passengers/duckling.webp', game: 'letter-train' },
  { id: 'letter-train-elephant', path: 'letter-train/passengers/elephant.webp', game: 'letter-train' },
  { id: 'letter-train-hippo', path: 'letter-train/passengers/hippo.webp', game: 'letter-train' },
  { id: 'letter-train-mouse', path: 'letter-train/passengers/mouse.webp', game: 'letter-train' },
  { id: 'letter-train-lamb', path: 'letter-train/passengers/lamb.webp', game: 'letter-train' },
];

export function stickerById(id: string): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}

/** Sprite-store name used for a sticker's image: `sticker:<id>`. */
export function stickerSpriteName(id: string): string {
  return `sticker:${id}`;
}
