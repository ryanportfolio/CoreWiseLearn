/**
 * Cut-paper shapes drawn in code. Every shape is a point list; baking turns it
 * into a cached canvas with a flat offset shadow, a slightly torn white rim,
 * the paper colour and a multiplied paper grain. Baking runs on entry, resize
 * or picture change only, never per frame.
 */

export const SHAPES = ['circle', 'square', 'triangle', 'rectangle', 'star', 'heart', 'semicircle'] as const;
export type Shape = (typeof SHAPES)[number];

/** Paper colours. 0..6 are the free-build swatches, in rainbow order. */
export const PAPER = ['#e8574a', '#f39a3b', '#f7cf45', '#6cbf5a', '#4a9fe0', '#9a6cd0', '#f08bb4', '#fff3dc', '#a8754a', '#55506a', '#ffffff', '#3fb8ad'] as const;
export const SWATCHES = 7;
/** Indices into PAPER, for picture definitions. */
export const C = { red: 0, orange: 1, yellow: 2, green: 3, blue: 4, purple: 5, pink: 6, cream: 7, brown: 8, charcoal: 9, white: 10, teal: 11 } as const;

/** Width over height of each shape's tray piece. */
export const TRAY_ASPECT: Readonly<Record<Shape, number>> = {
  circle: 1, square: 1, triangle: 1.08, rectangle: 1.7, star: 1.05, heart: 1.08, semicircle: 2,
};

const unitCache = new Map<Shape, Float32Array>();

function normalize(points: number[]): Float32Array {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]!); maxX = Math.max(maxX, points[i]!);
    minY = Math.min(minY, points[i + 1]!); maxY = Math.max(maxY, points[i + 1]!);
  }
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[i] = (points[i]! - minX) / (maxX - minX) - 0.5;
    out[i + 1] = (points[i + 1]! - minY) / (maxY - minY) - 0.5;
  }
  return out;
}

/** Corner points with each edge split into short steps, so a torn rim can wobble along it. */
function polygon(corners: number[], steps: number): number[] {
  const out: number[] = [];
  const n = corners.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = corners[i * 2]!, ay = corners[i * 2 + 1]!;
    const bx = corners[((i + 1) % n) * 2]!, by = corners[((i + 1) % n) * 2 + 1]!;
    for (let k = 0; k < steps; k++) out.push(ax + (bx - ax) * k / steps, ay + (by - ay) * k / steps);
  }
  return out;
}

/** Shape outline in a unit box centred on 0 (each axis spans -0.5..0.5). */
export function unitPoints(shape: Shape): Float32Array {
  const cached = unitCache.get(shape);
  if (cached) return cached;
  let pts: number[] = [];
  switch (shape) {
    case 'circle':
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a)); }
      break;
    case 'square':
    case 'rectangle':
      pts = polygon([-1, -1, 1, -1, 1, 1, -1, 1], 12);
      break;
    case 'triangle':
      pts = polygon([0, -1, 1, 1, -1, 1], 16);
      break;
    case 'star': {
      const corners: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.5, a = -Math.PI / 2 + i * Math.PI / 5;
        corners.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      pts = polygon(corners, 5);
      break;
    }
    case 'heart':
      for (let i = 0; i < 72; i++) {
        const t = i / 72 * Math.PI * 2, s = Math.sin(t);
        pts.push(16 * s * s * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)));
      }
      break;
    case 'semicircle':
      for (let i = 0; i <= 40; i++) { const a = Math.PI + i / 40 * Math.PI; pts.push(Math.cos(a), Math.sin(a)); }
      for (let k = 1; k < 16; k++) pts.push(1 - k / 8, 0);
      break;
  }
  const out = normalize(pts);
  unitCache.set(shape, out);
  return out;
}

/** Trace a shape path of size w x h centred at (x, y). No allocation. */
export function tracePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, w: number, h: number): void {
  const p = unitPoints(shape);
  ctx.beginPath();
  ctx.moveTo(x + p[0]! * w, y + p[1]! * h);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(x + p[i]! * w, y + p[i + 1]! * h);
  ctx.closePath();
}

/** Deterministic 0..1 noise per vertex, so a piece tears the same way every bake. */
function hash(i: number, seed: number): number {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function traceTorn(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, w: number, h: number, grow: number, rough: number, seed: number, rotation = 0): void {
  const p = unitPoints(shape), cos = Math.cos(rotation), sin = Math.sin(rotation);
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 2) {
    const ux = p[i]!, uy = p[i + 1]!;
    // Push along the direction from the centre; good enough for these convex-ish outlines.
    const len = Math.hypot(ux * w, uy * h) || 1;
    const push = grow + rough * (hash(i, seed) - 0.5) * 2;
    const lx = ux * w + ux * w / len * push, ly = uy * h + uy * h / len * push;
    const px = x + lx * cos - ly * sin, py = y + lx * sin + ly * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Width and height of a box centred on the turning point that holds the turned outline. */
export function turnedSize(shape: Shape, w: number, h: number, rotation: number): { w: number; h: number } {
  if (rotation === 0) return { w, h };
  const p = unitPoints(shape), cos = Math.cos(rotation), sin = Math.sin(rotation);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const lx = p[i]! * w, ly = p[i + 1]! * h, rx = lx * cos - ly * sin, ry = lx * sin + ly * cos;
    minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
  }
  // Symmetric about the turning point, so a baked canvas stays centred on it.
  return { w: 2 * Math.max(-minX, maxX), h: 2 * Math.max(-minY, maxY) };
}

export interface Baked {
  canvas: HTMLCanvasElement;
  /** Logical size of the canvas; the shape sits centred in it. */
  w: number;
  h: number;
}

let grainImage: HTMLImageElement | undefined;
const patternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();
/** Paper grain bitmap multiplied into every baked piece. Optional; plain colour without it. */
export function setGrain(image: HTMLImageElement | undefined): void { grainImage = image; }

function grain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!grainImage) return null;
  let pattern = patternCache.get(ctx);
  if (pattern === undefined) { pattern = ctx.createPattern(grainImage, 'repeat'); patternCache.set(ctx, pattern); }
  return pattern;
}

export interface BakeOptions {
  /** Flat shadow offset in logical px; 0 for none. */
  shadow?: number;
  /** Torn white rim width in logical px. */
  rim?: number;
  seed?: number;
  /** Draw a lighter inner layer, for big sheets. */
  layer?: string;
  /** Turn in radians, baked in so the flat shadow keeps falling down and right. */
  rotation?: number;
}

/** Bake a cut-paper shape into a fresh canvas at device resolution. */
export function bakeShape(shape: Shape, color: string, w: number, h: number, dpr: number, options: BakeOptions = {}): Baked {
  const m = Math.min(w, h);
  const shadow = options.shadow ?? Math.max(2, m * 0.045);
  const rim = options.rim ?? Math.max(1.2, Math.min(3.5, m * 0.022));
  const seed = options.seed ?? (w * 7 + h * 13 + color.length);
  const rotation = options.rotation ?? 0;
  const turned = turnedSize(shape, w, h, rotation);
  const pad = Math.ceil(shadow * 1.6 + rim * 2 + 3);
  const lw = turned.w + pad * 2, lh = turned.h + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(lw * dpr));
  canvas.height = Math.max(1, Math.ceil(lh * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, w: lw, h: lh };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = lw / 2, cy = lh / 2;
  if (shadow > 0) {
    // One flat offset layer, the house style's shadow. No blur.
    traceTorn(ctx, shape, cx + shadow * 0.7, cy + shadow, w, h, rim, rim * 0.5, seed + 1, rotation);
    ctx.fillStyle = 'rgba(74, 46, 28, 0.26)';
    ctx.fill();
  }
  // Torn white paper core shows around the cut colour.
  traceTorn(ctx, shape, cx, cy, w, h, rim, rim * 0.7, seed, rotation);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  traceTorn(ctx, shape, cx, cy, w, h, 0, Math.min(1.2, rim * 0.4), seed + 2, rotation);
  ctx.fillStyle = color;
  ctx.fill();
  if (options.layer) {
    traceTorn(ctx, shape, cx, cy - m * 0.012, w * 0.94, h * 0.94, 0, 0.8, seed + 3, rotation);
    ctx.fillStyle = options.layer;
    ctx.fill();
  }
  const pattern = grain(ctx);
  if (pattern) {
    ctx.save();
    traceTorn(ctx, shape, cx, cy, w, h, rim, rim * 0.7, seed, rotation);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, lw, lh);
    ctx.restore();
  }
  return { canvas, w: lw, h: lh };
}

/** Paint a small cut-paper shape straight onto a canvas (shadow, rim, colour; no grain). For thumbnails. */
export function paintShape(ctx: CanvasRenderingContext2D, shape: Shape, color: string, x: number, y: number, w: number, h: number, rotation: number): void {
  const m = Math.min(w, h), shadow = Math.max(1, m * 0.05), rim = Math.max(0.8, m * 0.03), seed = w * 7 + h * 13;
  traceTorn(ctx, shape, x + shadow * 0.7, y + shadow, w, h, rim, 0, seed, rotation);
  ctx.fillStyle = 'rgba(74, 46, 28, 0.26)'; ctx.fill();
  traceTorn(ctx, shape, x, y, w, h, rim, rim * 0.5, seed, rotation);
  ctx.fillStyle = '#fffaf0'; ctx.fill();
  traceTorn(ctx, shape, x, y, w, h, 0, 0, seed, rotation);
  ctx.fillStyle = color; ctx.fill();
}

/** Draw a baked piece centred at (x, y), turned and scaled. */
export function drawBaked(ctx: CanvasRenderingContext2D, b: Baked, x: number, y: number, rotation = 0, sx = 1, sy = 1): void {
  if (rotation === 0 && sx === 1 && sy === 1) {
    ctx.drawImage(b.canvas, x - b.w / 2, y - b.h / 2, b.w, b.h);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.scale(sx, sy);
  ctx.drawImage(b.canvas, -b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}
