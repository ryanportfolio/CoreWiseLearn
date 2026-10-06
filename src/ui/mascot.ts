/**
 * Mascot drawing anchored at the feet. The five pose images are 768 px squares
 * whose feet sit at slightly different heights, so drawing each pose from its
 * own feet keeps a pose swap from jumping, and squash, stretch and tilt pivot
 * on the ground instead of the middle of the body.
 */

import type { SpriteStore } from '../engine/sprites';
import type { AppServices } from '../app/services';
import { drawSprite } from './draw';
import { springStep } from './tween';

/**
 * Feet position per pose, measured from the art: the lowest opaque row below
 * the sprite centre, and the feet's horizontal offset from the centre, both as
 * fractions of the sprite size. Measured in 512 px units on the earlier
 * drawings; on the 768 px redraws the feet are within 1 of those units
 * vertically and 2 horizontally.
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

// ---------------------------------------------------------------------------
// Talking and poking

/**
 * Talking frames that exist at build time, by pose name. Some poses are drawn
 * with the mouth open (cheer, wave, yawn) and have a `<pose>-closed.webp`; the
 * others are drawn with a closed smile (idle, point) and have a
 * `<pose>-open.webp`. 'mascot/idle' maps to 'mascot/idle-open', for example.
 * Every frame is 768x768 and matches its pose outside the mouth, so it shares
 * the pose's feet. A pose with neither frame only wobbles while talking.
 */
const OPEN = new Map<string, string>();
const CLOSED = new Map<string, string>();
for (const path of Object.keys(import.meta.glob('/public/art/mascot/*-{open,closed}.webp', { query: '?url', import: 'default' }))) {
  const name = `mascot/${path.slice(path.lastIndexOf('/') + 1).replace(/\.webp$/, '')}`;
  if (name.endsWith('-open')) OPEN.set(name.slice(0, -'-open'.length), name);
  else CLOSED.set(name.slice(0, -'-closed'.length), name);
}

/** Load the talking frames for these poses, where they exist. Never rejects; nothing is requested for missing files. */
export function loadMascotMouths(services: AppServices, poses: readonly string[]): Promise<void> {
  const loads: Promise<unknown>[] = [];
  for (const pose of poses) {
    for (const name of [OPEN.get(pose), CLOSED.get(pose)]) {
      if (name) loads.push(services.sprites.load(name, services.art(`${name}.webp`)).catch(() => undefined));
    }
  }
  return Promise.all(loads).then(() => undefined);
}

/** Loudness above which a shut mouth opens, and below which an open one shuts while talking. */
const MOUTH_OPEN = 0.3;
const MOUTH_SHUT = 0.15;
/** Loudness that counts as a peak (a small hop), and the level it must fall under before the next. */
const PEAK = 0.72;
const PEAK_REARM = 0.4;
/** How long a poke's jiggle lasts, seconds. */
const POKE_SECONDS = 1.6;

/**
 * Motion layered on whatever a scene already does with the mascot: a jelly
 * stretch and squash that follows the voice's loudness, a little hop on loud
 * peaks, a sway while talking, and a poke's jiggle and hop. All state is
 * numbers and two fixed arrays, so stepping it allocates nothing.
 */
export interface MascotMotion {
  /** Outputs: multiply into the scene's squash and stretch, add `lift` (a fraction of the size) and `rot`. */
  sx: number;
  sy: number;
  lift: number;
  rot: number;
  /** Mouth to draw: 0 the pose as it is (not talking), 1 open, 2 closed (talking, between syllables). */
  mouth: 0 | 1 | 2;
  /** Stretch spring following the loudness, [value, velocity]. */
  readonly talk: Float32Array;
  /** Hop spring for loud peaks, [lift, velocity]. */
  readonly hop: Float32Array;
  /** Seconds since the last poke, or -1. */
  poke: number;
  pokeAmp: number;
  pokeSide: number;
  /** 0..1, how much the talking sway shows; its phase in radians. */
  sway: number;
  phase: number;
  armed: boolean;
}

export function createMascotMotion(): MascotMotion {
  return {
    sx: 1, sy: 1, lift: 0, rot: 0, mouth: 0,
    talk: new Float32Array(2), hop: new Float32Array(2),
    poke: -1, pokeAmp: 0, pokeSide: 1, sway: 0, phase: 0, armed: true,
  };
}

/** Back to rest at once (on scene enter). */
export function resetMascotMotion(m: MascotMotion): void {
  m.talk[0] = m.talk[1] = m.hop[0] = m.hop[1] = 0;
  m.poke = -1; m.sway = 0; m.phase = 0; m.armed = true; m.mouth = 0;
  m.sx = m.sy = 1; m.lift = m.rot = 0;
}

/** Start a poke's jiggle; a poke during one makes it a little bigger. Plays with the sound off too. */
export function pokeMascot(m: MascotMotion): void {
  m.pokeAmp = m.poke >= 0 && m.poke < POKE_SECONDS ? Math.min(1.35, m.pokeAmp + 0.25) : 1;
  m.poke = 0;
  m.pokeSide = -m.pokeSide;
}

/**
 * Advance the motion. `level` is the voice's loudness now (0..1) and
 * `speaking` whether a clip is audible, both from the voice player.
 */
export function stepMascotMotion(m: MascotMotion, dt: number, speaking: boolean, level: number): void {
  const target = speaking ? level : 0;
  // Underdamped, so the body overshoots a little and settles like jelly between words.
  springStep(m.talk, target, 24, 0.32, dt);
  if (speaking && target > PEAK && m.armed) {
    m.hop[1] = (m.hop[1] ?? 0) + 0.9;
    m.armed = false;
  } else if (target < PEAK_REARM) m.armed = true;
  springStep(m.hop, 0, 16, 0.45, dt);
  m.sway += ((speaking ? 1 : 0) - m.sway) * (1 - Math.exp(-5 * dt));
  m.phase += dt * 5.2;
  if (m.phase > Math.PI * 2) m.phase -= Math.PI * 2;
  // Starts closed and opens on the first syllable; hysteresis keeps it from flickering.
  if (!speaking) m.mouth = 0;
  else if (m.mouth !== 1 && level > MOUTH_OPEN) m.mouth = 1;
  else if (m.mouth !== 2 && level < MOUTH_SHUT) m.mouth = 2;

  const s = m.talk[0] ?? 0;
  const hop = m.hop[0] ?? 0;
  // A hop that swings below the ground becomes a landing squash instead.
  const land = Math.min(0, hop);
  let sy = (1 + 0.12 * s) * (1 + 1.5 * land);
  let sx = (1 - 0.07 * s) * (1 - land);
  let lift = Math.max(0, hop);
  let rot = 0.04 * m.sway * Math.sin(m.phase);
  if (m.poke >= 0) {
    m.poke += dt;
    const t = m.poke;
    if (t >= POKE_SECONDS) m.poke = -1;
    else {
      // Squash first, then a hop and a wobble that dies away.
      const a = m.pokeAmp * Math.min(1, t / 0.04);
      const j = -a * Math.exp(-3.8 * t) * Math.cos(2 * Math.PI * 3.4 * t);
      sy *= 1 + 0.2 * j;
      sx *= 1 - 0.13 * j;
      if (t > 0.05 && t < 0.42) lift += a * 0.14 * Math.sin((Math.PI * (t - 0.05)) / 0.37);
      rot += a * 0.09 * Math.exp(-3.5 * t) * Math.sin(2 * Math.PI * 2.2 * t) * m.pokeSide;
    }
  }
  m.sx = sx;
  m.sy = sy;
  m.lift = lift;
  m.rot = rot;
}

/**
 * drawMascotAt with the motion added. While talking, the open or closed frame
 * of `sprite` as the motion says, when that frame has loaded; otherwise, and
 * when not talking, `sprite` itself (a pose such as 'mascot/idle', or its
 * placeholder, which has no frames). `pose` gives the feet, as in drawMascotAt.
 */
export function drawMascotMoving(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteStore,
  m: MascotMotion,
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
  let name = sprite;
  if (m.mouth !== 0) {
    const frame = (m.mouth === 1 ? OPEN : CLOSED).get(sprite);
    if (frame && sprites.get(frame)) name = frame;
  }
  drawMascotAt(ctx, sprites, name, pose, x, groundY, size, lift + m.lift * size, rot + m.rot, sx * m.sx, sy * m.sy);
}
