/**
 * The six workshop pictures, each built from paper shapes in a 100 x 100 box,
 * and how each one comes alive when it is finished. Parts are listed in draw
 * order. `rot` is in degrees, clockwise; a part with a turn is only offered as
 * an open spot from learning level 2.
 */

import { C, type Shape } from './paper';
import { clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, pulse } from '../../ui/tween';

export type Role = 'flame' | 'fin' | 'tail' | 'body' | 'head' | 'ear' | 'nose' | 'door' | 'window' | 'chimney' | 'sun' | 'wheel' | 'petals' | 'center' | 'leaf' | 'bug' | 'yarn';
/** Drawn on top of a placed part: an eye, a cat face, a smile, ladybug spots, a wheel hub, a lit window. */
export type Face = 'eye' | 'cat' | 'smile' | 'bug' | 'hub' | 'window';

export interface Part {
  shape: Shape;
  x: number; y: number; w: number; h: number;
  rot: number;
  color: number;
  role?: Role;
  face?: Face;
}

export interface Picture {
  id: PictureId;
  parts: readonly Part[];
}

export const PICTURE_IDS = ['rocket', 'fish', 'house', 'cat', 'car', 'flower'] as const;
export type PictureId = (typeof PICTURE_IDS)[number];

const p = (shape: Shape, x: number, y: number, w: number, h: number, color: number, extra: Partial<Part> = {}): Part =>
  ({ shape, x, y, w, h, rot: 0, color, ...extra });

export const PICTURES: readonly Picture[] = [
  {
    id: 'rocket',
    parts: [
      p('triangle', 50, 88, 18, 18, C.orange, { rot: 180, role: 'flame' }),
      p('triangle', 31, 72, 16, 24, C.purple, { rot: -25, role: 'fin' }),
      p('triangle', 69, 72, 16, 24, C.purple, { rot: 25, role: 'fin' }),
      p('rectangle', 50, 55, 30, 48, C.red, { role: 'body' }),
      p('triangle', 50, 21, 30, 20, C.yellow),
      p('circle', 50, 45, 17, 17, C.blue, { role: 'window' }),
      p('heart', 50, 67, 12, 11, C.pink),
      p('star', 21, 22, 17, 16, C.yellow),
    ],
  },
  {
    id: 'fish',
    parts: [
      p('triangle', 25, 50, 26, 20, C.teal, { rot: 90, role: 'tail' }),
      p('semicircle', 52, 24, 26, 13, C.purple, { role: 'fin' }),
      p('semicircle', 52, 76, 22, 11, C.purple, { rot: 180, role: 'fin' }),
      p('circle', 55, 50, 46, 46, C.orange, { role: 'body' }),
      p('rectangle', 47, 50, 7, 38, C.cream),
      p('circle', 66, 44, 12, 12, C.white, { face: 'eye' }),
      p('circle', 86, 25, 11, 11, C.blue),
      p('star', 83, 84, 17, 16, C.pink),
    ],
  },
  {
    id: 'house',
    parts: [
      p('rectangle', 67, 24, 9, 18, C.brown, { role: 'chimney' }),
      p('triangle', 50, 32, 64, 28, C.red),
      p('square', 50, 67, 42, 42, C.yellow),
      p('rectangle', 50, 76, 13, 24, C.brown, { role: 'door' }),
      p('square', 38, 59, 11, 11, C.blue, { role: 'window', face: 'window' }),
      p('square', 62, 59, 11, 11, C.blue, { role: 'window', face: 'window' }),
      p('star', 15, 17, 18, 17, C.orange, { rot: 36, role: 'sun' }),
      p('semicircle', 85, 83, 20, 10, C.green),
    ],
  },
  {
    id: 'cat',
    parts: [
      p('rectangle', 72, 70, 7, 28, C.orange, { rot: 35, role: 'tail' }),
      p('semicircle', 50, 76, 50, 25, C.orange, { role: 'body' }),
      p('semicircle', 50, 82, 24, 12, C.cream),
      p('triangle', 37, 27, 13, 15, C.orange, { role: 'ear' }),
      p('triangle', 63, 27, 13, 15, C.orange, { role: 'ear' }),
      p('circle', 50, 44, 34, 34, C.orange, { role: 'head', face: 'cat' }),
      p('heart', 50, 50, 10, 9, C.pink, { rot: 180, role: 'nose' }),
      p('star', 50, 64, 11, 10, C.yellow, { role: 'nose' }),
      p('circle', 17, 80, 17, 17, C.blue, { role: 'yarn' }),
    ],
  },
  {
    id: 'car',
    parts: [
      p('circle', 9, 69, 9, 9, C.cream),
      p('semicircle', 46, 50, 40, 20, C.blue),
      p('square', 46, 52, 11, 11, C.cream),
      p('rectangle', 50, 64, 70, 18, C.red, { role: 'body' }),
      p('circle', 30, 74, 18, 18, C.charcoal, { role: 'wheel', face: 'hub' }),
      p('circle', 70, 74, 18, 18, C.charcoal, { role: 'wheel', face: 'hub' }),
      p('star', 58, 64, 10, 10, C.yellow),
      p('triangle', 91, 61, 10, 9, C.yellow, { rot: -90 }),
    ],
  },
  {
    id: 'flower',
    parts: [
      p('semicircle', 20, 20, 26, 13, C.white),
      p('rectangle', 50, 67, 6, 40, C.green),
      p('heart', 39, 72, 14, 13, C.green, { rot: -60, role: 'leaf' }),
      p('heart', 61, 64, 14, 13, C.green, { rot: 60, role: 'leaf' }),
      p('star', 50, 34, 44, 42, C.pink, { role: 'petals' }),
      p('circle', 50, 36, 17, 17, C.yellow, { role: 'center', face: 'smile' }),
      p('rectangle', 50, 88, 28, 14, C.orange),
      p('circle', 76, 54, 10, 10, C.red, { role: 'bug', face: 'bug' }),
    ],
  },
];

export function pictureById(id: string): Picture | undefined {
  return PICTURES.find(pic => pic.id === id);
}

/** Seconds a finished picture plays alive before it flies to the shelf. */
export const ALIVE_SECONDS = 3;

/** A reusable transform: offset in picture units, turn in radians, scale. */
export interface Pose { x: number; y: number; rot: number; sx: number; sy: number; open: number }

export function resetPose(o: Pose): Pose { o.x = 0; o.y = 0; o.rot = 0; o.sx = 1; o.sy = 1; o.open = 0; return o; }

/** Whole-picture motion at `t` seconds into the alive animation. Writes into `o`. */
export function picturePose(id: PictureId, t: number, o: Pose): Pose {
  resetPose(o);
  switch (id) {
    case 'rocket':
      if (t < 0.6) o.x = Math.sin(t * 60) * 0.7 * (t / 0.6);
      else if (t < 1.5) { const k = (t - 0.6) / 0.9; o.y = -easeInCubic(k) * 170; o.sy = 1 + 0.12 * k; o.sx = 1 - 0.05 * k; }
      else if (t < 1.75) o.y = -170;
      else if (t < 2.6) o.y = -170 * (1 - easeOutCubic((t - 1.75) / 0.85));
      else { const k = pulse((t - 2.6) / 0.4); o.sy = 1 - 0.1 * k; o.sx = 1 + 0.08 * k; }
      break;
    case 'fish':
      o.x = Math.sin(t * 2.2) * 10; o.y = Math.sin(t * 4.4) * 3; o.rot = Math.cos(t * 2.2) * 0.07;
      break;
    case 'house':
      if (t < 0.45) o.y = -Math.sin(Math.PI * t / 0.45) * 5;
      break;
    case 'cat':
      o.y = Math.sin(t * 3) * 0.6;
      break;
    case 'car':
      if (t < 0.35) o.x = Math.sin(t * 70) * 0.5;
      else if (t < 1.4) o.x = easeInCubic((t - 0.35) / 1.05) * 150;
      else if (t < 1.6) o.x = 150;
      else if (t < 2.7) o.x = -150 * (1 - easeOutCubic((t - 1.6) / 1.1));
      if (t > 0.35 && t < 2.7) o.y = -Math.abs(Math.sin(t * 13)) * 1.2;
      break;
    case 'flower':
      o.rot = Math.sin(t * 3) * 0.04;
      break;
  }
  return o;
}

/** One part's extra motion on top of the whole picture. Writes into `o`. */
export function partPose(id: PictureId, part: Part, t: number, o: Pose): Pose {
  resetPose(o);
  const role = part.role;
  switch (id) {
    case 'rocket':
      if (role === 'flame') { const boost = t > 0.4 && t < 1.6 ? 1.6 : 1; o.sy = boost * (1 + 0.3 * Math.sin(t * 31)); o.sx = 1 + 0.12 * Math.sin(t * 23); o.y = (o.sy - 1) * part.h * 0.5; }
      break;
    case 'fish':
      if (role === 'tail') o.rot = Math.sin(t * 16) * 0.35;
      else if (role === 'fin') o.rot = Math.sin(t * 9 + part.y) * 0.15;
      break;
    case 'house':
      if (role === 'door') { const k = easeOutBack(clamp01((t - 0.4) / 0.45)); o.sx = 1 - 0.72 * k; o.x = -part.w * (1 - o.sx) / 2; }
      else if (role === 'window') o.open = clamp01((t - 0.7) / 0.3);
      else if (role === 'sun') o.rot = t * 1.4;
      break;
    case 'cat': {
      const k = pulse(clamp01((t - 0.15) / 1.5));
      if (role === 'body') { o.sx = 1 + 0.2 * k; o.sy = 1 - 0.12 * k; o.y = part.h * 0.06 * k; }
      else if (role === 'head' || role === 'nose') { o.y = 7 * k; o.open = k; }
      else if (role === 'ear') { o.y = 7 * k; o.rot = (part.x < 50 ? -1 : 1) * (0.22 * k + (t > 2 && t < 2.3 ? Math.sin((t - 2) * 40) * 0.12 : 0)); }
      else if (role === 'tail') o.rot = Math.sin(t * 4.5) * 0.45;
      else if (role === 'yarn') { o.x = Math.sin(t * 2.6) * 5; o.rot = Math.sin(t * 2.6) * 0.9; }
      if (role === 'head' && t > 2.3 && t < 2.5) o.open = -1;
      break;
    }
    case 'car':
      if (role === 'wheel') o.rot = t < 2.7 ? t * 11 : 2.7 * 11;
      break;
    case 'flower':
      if (role === 'petals') o.rot = easeInOutSine(clamp01(t / 1.8)) * Math.PI * 0.8;
      else if (role === 'center') { const k = 1 + 0.14 * Math.sin(t * 7) * (1 - clamp01(t / ALIVE_SECONDS)); o.sx = k; o.sy = k; o.open = 1; }
      else if (role === 'leaf') o.rot = Math.sin(t * 6 + part.x) * 0.25;
      else if (role === 'bug') { o.x = Math.sin(t * 2) * 6; o.y = -Math.abs(Math.sin(t * 5)) * 2.5; }
      break;
  }
  return o;
}

/** Gentle loop for finished pictures on the gallery shelf, in picture units. */
export function shelfPose(id: PictureId, t: number, o: Pose): Pose {
  resetPose(o);
  switch (id) {
    case 'rocket': o.y = Math.sin(t * 2) * 3; break;
    case 'fish': o.x = Math.sin(t * 1.2) * 6; o.rot = Math.cos(t * 1.2) * 0.05; break;
    case 'house': o.sy = 1 + Math.sin(t * 1.6) * 0.012; break;
    case 'cat': o.sx = 1 + Math.sin(t * 1.4) * 0.025; o.sy = 1 - Math.sin(t * 1.4) * 0.02; break;
    case 'car': o.rot = Math.sin(t * 3) * 0.02; o.x = Math.sin(t * 0.9) * 3; break;
    case 'flower': o.rot = Math.sin(t * 1.3) * 0.05; break;
  }
  return o;
}
