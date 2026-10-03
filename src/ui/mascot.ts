/**
 * Mascot drawing anchored at the feet. The five pose images are 512 px squares
 * whose feet sit at slightly different heights, so drawing each pose from its
 * own feet keeps a pose swap from jumping, and squash, stretch and tilt pivot
 * on the ground instead of the middle of the body.
 */

import type { SpriteStore } from '../engine/sprites';
import { drawSprite } from './draw';

/**
 * Feet position per pose, measured from the art: the lowest opaque row below
 * the sprite centre, and the feet's horizontal offset from the centre, both as
 * fractions of the sprite size.
 */
const FEET: Record<string, readonly [number, number]> = {
  'mascot/idle': [(424 - 256) / 512, 0],
  'mascot/cheer': [(415 - 256) / 512, (254.6 - 256) / 512],
  'mascot/point': [(411 - 256) / 512, (233.8 - 256) / 512],
  'mascot/wave': [(412 - 256) / 512, (246.6 - 256) / 512],
  'mascot/yawn': [(436 - 256) / 512, (247.4 - 256) / 512],
};
const DEFAULT_FEET: readonly [number, number] = [0.32, 0];

/** Feet below the sprite centre, as a fraction of its size. `pose` is the art name, such as 'mascot/idle'. */
export function mascotFeetY(pose: string): number {
  return (FEET[pose] ?? DEFAULT_FEET)[0];
}

/**
 * Draw a mascot pose with its feet at (x, groundY - lift).
 * `sprite` is the sprite-store name to draw (it may be a placeholder);
 * `pose` is the art name whose feet to use. `sx` may be negative to flip.
 * `rot` tilts the body about the feet.
 */
export function drawMascotAt(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteStore,
  sprite: string,
  pose: string,
  x: number,
  groundY: number,
  size: number,
  lift = 0,
  rot = 0,
  sx = 1,
  sy = 1,
): void {
  const feet = FEET[pose] ?? DEFAULT_FEET;
  // Centre relative to the feet, before the tilt.
  const ox = -feet[1] * size * sx;
  const oy = -feet[0] * size * sy;
  let cx = x + ox;
  let cy = groundY - lift + oy;
  if (rot !== 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    cx = x + ox * c - oy * s;
    cy = groundY - lift + ox * s + oy * c;
  }
  drawSprite(ctx, sprites, sprite, cx, cy, size, rot, sx, sy);
}
