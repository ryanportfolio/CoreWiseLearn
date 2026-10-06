/**
 * Skins for Bubble Pop. The mechanic reads everything visual from a theme,
 * so a new skin (space, farm, garden) is a new entry here plus its art.
 * Paths are relative to the art root (public/art/).
 */

import type { MusicTrack } from '../../audio/music';

export interface CreatureDef {
  /** Art path of the creature carried inside a bubble. */
  path: string;
  /** Hue (0..360) for its pop particles and placeholder blob. */
  hue: number;
}

export interface BubblePalette {
  /** Fill behind everything when the background art is missing. */
  water: string;
  /** Time bar: empty track and draining fill. */
  barTrack: string;
  barFill: string;
  /** Counter badge fill. */
  badge: string;
  /** Result panel fill. */
  panel: string;
  /** Dim layer drawn over the play field behind the result panel. */
  dim: string;
  /** Pulsing ring around the tutorial bubble. */
  highlight: string;
  /** Backing disc behind the awarded sticker. */
  stickerBacking: string;
  /** Replay and home button fills. */
  replay: string;
  home: string;
  /** Placeholder colours used only while art is missing. */
  placeholderRing: string;
  placeholderDecoy: string;
}

export interface BubbleTheme {
  id: string;
  /** Cover-fit backdrop. */
  background: string;
  /** One creature rides in each bubble. */
  creatures: readonly CreatureDef[];
  /** Drifts up without a bubble at the hardest tier; clicking it only wobbles it. */
  decoy: string;
  /** Transparent ring drawn on top of the creature. */
  bubble: string;
  /** Flash drawn where a bubble popped. */
  burst: string;
  music: MusicTrack;
  palette: BubblePalette;
}

export const OCEAN_THEME: BubbleTheme = {
  id: 'ocean',
  background: 'backgrounds/ocean-floor.webp',
  creatures: [
    { path: 'creatures/clownfish.webp', hue: 25 },
    { path: 'creatures/turtle.webp', hue: 115 },
    { path: 'creatures/jellyfish.webp', hue: 310 },
    { path: 'creatures/seahorse.webp', hue: 45 },
    { path: 'creatures/crab.webp', hue: 5 },
    { path: 'creatures/starfish.webp', hue: 15 },
    { path: 'creatures/octopus-purple.webp', hue: 275 },
    { path: 'creatures/pufferfish.webp', hue: 52 },
    { path: 'creatures/dolphin.webp', hue: 205 },
    { path: 'creatures/whale-small.webp', hue: 225 },
  ],
  decoy: 'decoys/urchin-grumpy.webp',
  bubble: 'effects/bubble-ring.webp',
  burst: 'effects/pop-burst.webp',
  music: 'ocean',
  palette: {
    water: '#1d8fd6',
    barTrack: 'rgba(16, 40, 90, 0.45)',
    barFill: '#7ff0ff',
    badge: '#ff8a3d',
    panel: '#fff6dc',
    dim: 'rgba(10, 30, 70, 0.45)',
    highlight: '#fff27a',
    stickerBacking: '#ffffff',
    replay: '#4cc35a',
    home: '#ff9a2e',
    placeholderRing: 'rgba(255, 255, 255, 0.85)',
    placeholderDecoy: '#5b3a8c',
  },
};

export const THEMES: Readonly<Record<string, BubbleTheme>> = {
  ocean: OCEAN_THEME,
};

/** Sprite-store name for an art path: the path without its extension. */
export function spriteName(path: string): string {
  return path.replace(/\.[a-z0-9]+$/i, '');
}
