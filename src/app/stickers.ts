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
  { id: 'clownfish', path: 'creatures/clownfish.webp', game: 'bubble-pop' },
  { id: 'turtle', path: 'creatures/turtle.webp', game: 'bubble-pop' },
  { id: 'jellyfish', path: 'creatures/jellyfish.webp', game: 'bubble-pop' },
  { id: 'seahorse', path: 'creatures/seahorse.webp', game: 'bubble-pop' },
  { id: 'crab', path: 'creatures/crab.webp', game: 'bubble-pop' },
  { id: 'starfish', path: 'creatures/starfish.webp', game: 'bubble-pop' },
  { id: 'octopus-purple', path: 'creatures/octopus-purple.webp', game: 'bubble-pop' },
  { id: 'pufferfish', path: 'creatures/pufferfish.webp', game: 'bubble-pop' },
  { id: 'dolphin', path: 'creatures/dolphin.webp', game: 'bubble-pop' },
  { id: 'whale-small', path: 'creatures/whale-small.webp', game: 'bubble-pop' },
  { id: 'fox', path: 'avatars/fox.webp', game: 'bubble-pop' },
  { id: 'panda', path: 'avatars/panda.webp', game: 'bubble-pop' },
  { id: 'frog', path: 'avatars/frog.webp', game: 'bubble-pop' },
  { id: 'bunny', path: 'avatars/bunny.webp', game: 'bubble-pop' },
  { id: 'lion', path: 'avatars/lion.webp', game: 'bubble-pop' },
  { id: 'penguin', path: 'avatars/penguin.webp', game: 'bubble-pop' },
  { id: 'koala', path: 'avatars/koala.webp', game: 'bubble-pop' },
  { id: 'owl', path: 'avatars/owl.webp', game: 'bubble-pop' },
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
  { id: 'web-playground-hero', path: 'web-playground/hero-wave.webp', game: 'web-playground' },
  { id: 'web-playground-swing', path: 'web-playground/tile.webp', game: 'web-playground' },
  { id: 'web-playground-kitten', path: 'web-playground/kitten.webp', game: 'web-playground' },
  { id: 'web-playground-balloon', path: 'web-playground/girl.webp', game: 'web-playground' },
  { id: 'web-playground-pigeon', path: 'web-playground/pigeon.webp', game: 'web-playground' },
  { id: 'web-playground-badge', path: 'web-playground/emblem.webp', game: 'web-playground' },
  { id: 'piggy-parade-sunflower-piggy', path: 'piggy-parade/sticker-sunflower-piggy.webp', game: 'piggy-parade' },
  { id: 'piggy-parade-hen-nest', path: 'piggy-parade/sticker-hen-nest.webp', game: 'piggy-parade' },
  { id: 'piggy-parade-chick-hat', path: 'piggy-parade/sticker-chick-hat.webp', game: 'piggy-parade' },
  { id: 'piggy-parade-tractor', path: 'piggy-parade/sticker-tractor.webp', game: 'piggy-parade' },
  { id: 'piggy-parade-mud-piglet', path: 'piggy-parade/sticker-mud-piglet.webp', game: 'piggy-parade' },
  { id: 'piggy-parade-calf', path: 'piggy-parade/sticker-calf.webp', game: 'piggy-parade' },
  { id: 'ride-fare-balloon', path: 'ride-fare/sticker-balloon.webp', game: 'ride-fare' },
  { id: 'ride-fare-hedgehog', path: 'ride-fare/sticker-hedgehog.webp', game: 'ride-fare' },
  { id: 'ride-fare-fox', path: 'ride-fare/sticker-fox.webp', game: 'ride-fare' },
  { id: 'ride-fare-bunny', path: 'ride-fare/sticker-bunny.webp', game: 'ride-fare' },
  { id: 'ride-fare-bear', path: 'ride-fare/sticker-bear.webp', game: 'ride-fare' },
  { id: 'ride-fare-mouse', path: 'ride-fare/sticker-mouse.webp', game: 'ride-fare' },
  { id: 'frog-pond-frog', path: 'frog-pond/frog-puff.webp', game: 'frog-pond' },
  { id: 'frog-pond-ladybird', path: 'frog-pond/bug-ladybird.webp', game: 'frog-pond' },
  { id: 'frog-pond-bee', path: 'frog-pond/bug-bee.webp', game: 'frog-pond' },
  { id: 'frog-pond-dragonfly', path: 'frog-pond/bug-dragonfly.webp', game: 'frog-pond' },
  { id: 'frog-pond-starfish', path: 'frog-pond/cw-starfish.webp', game: 'frog-pond' },
  { id: 'frog-pond-seahorse', path: 'frog-pond/cw-seahorse.webp', game: 'frog-pond' },
  { id: 'coin-vault-squirrel', path: 'coin-vault/sticker-squirrel.webp', game: 'coin-vault' },
  { id: 'coin-vault-vault', path: 'coin-vault/sticker-vault.webp', game: 'coin-vault' },
  { id: 'coin-vault-purse', path: 'coin-vault/sticker-purse.webp', game: 'coin-vault' },
  { id: 'coin-vault-acorn', path: 'coin-vault/sticker-acorn.webp', game: 'coin-vault' },
  { id: 'coin-vault-beaver', path: 'coin-vault/sticker-beaver.webp', game: 'coin-vault' },
  { id: 'coin-vault-owl', path: 'coin-vault/sticker-owl.webp', game: 'coin-vault' },
  { id: 'market-stall-heron', path: 'market-stall/sticker-heron.webp', game: 'market-stall' },
  { id: 'market-stall-lighthouse', path: 'market-stall/sticker-lighthouse.webp', game: 'market-stall' },
  { id: 'market-stall-boat', path: 'market-stall/sticker-boat.webp', game: 'market-stall' },
  { id: 'market-stall-gull', path: 'market-stall/sticker-gull.webp', game: 'market-stall' },
  { id: 'market-stall-otter', path: 'market-stall/sticker-otter.webp', game: 'market-stall' },
  { id: 'market-stall-pretzel', path: 'market-stall/sticker-pretzel.webp', game: 'market-stall' },
];

export function stickerById(id: string): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}

/** Sprite-store name used for a sticker's image: `sticker:<id>`. */
export function stickerSpriteName(id: string): string {
  return `sticker:${id}`;
}
