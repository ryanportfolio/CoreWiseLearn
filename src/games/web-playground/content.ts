/** Web Playground rules that do not touch the canvas: tiers, levels, pictures and save data. */
import type { Tier } from '../../engine/difficulty';
import { STICKERS } from '../../app/stickers';

export const GAME_ID = 'web-playground';
export type Mode = 'numbers' | 'letters';
export type Level = 0 | 1 | 2;
export type PictureKind = 'star' | 'heart' | 'kite';
export const PICTURES: readonly PictureKind[] = ['star', 'heart', 'kite'];

/** Motor difficulty: how big, how many and how lively the targets are. Sizes at 1366x768. */
export interface TierParams { ball: number; balls: number; wobble: number; hitScale: number; point: number }
export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { ball: 150, balls: 3, wobble: 8, hitScale: 1.25, point: 124 },
  { ball: 130, balls: 4, wobble: 16, hitScale: 1.15, point: 112 },
  { ball: 112, balls: 5, wobble: 26, hitScale: 1.08, point: 100 },
];
export const CATCHES_PER_ROUND = 6;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Values a catch round draws from: numbers 1..n, or letter indexes 0..n-1. */
export function catchRange(mode: Mode, level: Level): number {
  if (mode === 'numbers') return level === 0 ? 5 : 10;
  return level === 0 ? 5 : 26;
}
export function connectCount(level: Level): number {
  return level === 0 ? 5 : level === 1 ? 7 : 10;
}
/** The glyph printed on a ball or point. Numbers are 1-based values; letters are 0-based indexes. */
export function glyph(mode: Mode, value: number): string {
  return mode === 'numbers' ? String(value) : LETTERS[value] ?? 'A';
}
/** What the hero's sign shows: level 2 numbers drop the numeral, level 2 letters use the small letter. */
export function signGlyph(mode: Mode, value: number, level: Level): string {
  if (mode === 'numbers') return level === 2 ? '' : String(value);
  const g = glyph(mode, value);
  return level === 2 ? g.toLowerCase() : g;
}
export const signDots = (mode: Mode, value: number): number => mode === 'numbers' ? value : 0;
/** Key that names a value: digits 1..9 for numbers (ten has no single key), the letter for letters. */
export function keyMatches(mode: Mode, value: number, key: string): boolean {
  if (key.length !== 1) return false;
  if (mode === 'numbers') return value < 10 && key === String(value);
  return key.toUpperCase() === glyph(mode, value);
}
/** Voice clip names for the optional clip slot. */
export function clipName(mode: Mode, value: number): string {
  return mode === 'numbers' ? `number-${value}` : `letter-${glyph(mode, value).toLowerCase()}`;
}

/**
 * Connect points around a picture, in unit coordinates (radius 1, y down),
 * listed in the order the child joins them. For the heart, curveT receives
 * each point's heartAt() parameter so threads can follow the curve.
 */
export function picturePoints(kind: PictureKind, n: number, out: Float32Array, curveT?: Float32Array): void {
  if (kind === 'star') {
    if (n === 10) {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 === 0 ? 1 : 0.6;
        out[i * 2] = Math.cos(a) * r; out[i * 2 + 1] = Math.sin(a) * r * 0.98 + 0.06;
      }
      return;
    }
    // A star polygon drawn in one stroke: five points skip one, seven points skip two.
    const step = n === 5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const k = (i * step) % n, a = -Math.PI / 2 + k * Math.PI * 2 / n;
      out[i * 2] = Math.cos(a); out[i * 2 + 1] = Math.sin(a) + 0.08;
    }
    return;
  }
  if (kind === 'heart') {
    // Equal straight-line gaps between neighbours, starting at the top dip and going round the right lobe first.
    // Equal steps along the curve would put the two points either side of the tip close together.
    const ts = heartChords(n);
    for (let k = 0; k < n; k++) {
      heartAt(ts[k]!, out, k * 2);
      if (curveT) curveT[k] = ts[k]!;
    }
    return;
  }
  // Kite: four corners always, extra points on the long lower edges first.
  const corners = [0, -1, 0.72, -0.18, 0, 1, -0.72, -0.18];
  const extra = n - 4, edges = [0, 0, 0, 0];
  const order = [1, 2, 0, 3];
  for (let k = 0; k < extra; k++) edges[order[k % 4]!]!++;
  let i = 0;
  for (let e = 0; e < 4; e++) {
    const ax = corners[e * 2]!, ay = corners[e * 2 + 1]!, bx = corners[(e * 2 + 2) % 8]!, by = corners[(e * 2 + 3) % 8]!;
    const parts = edges[e]! + 1;
    for (let k = 0; k < parts; k++) { out[i * 2] = ax + (bx - ax) * k / parts; out[i * 2 + 1] = ay + (by - ay) * k / parts; i++; }
  }
}
/**
 * Whether choosing point `next` needs its numeral or letter. Points are
 * listed in join order (x, y pairs). When the next point is clearly the
 * nearest unjoined point to the last joined one, a child can follow the
 * outline without reading, so the step is play, not learning evidence.
 * It needs the glyph when some other unjoined point is about as near
 * (within 15 percent) or nearer.
 */
export function stepNeedsGlyph(points: Float32Array, n: number, next: number): boolean {
  if (next < 1 || next >= n) return false;
  const lx = points[(next - 1) * 2]!, ly = points[(next - 1) * 2 + 1]!;
  const want = Math.hypot(points[next * 2]! - lx, points[next * 2 + 1]! - ly);
  for (let i = next + 1; i < n; i++) {
    if (Math.hypot(points[i * 2]! - lx, points[i * 2 + 1]! - ly) <= want * 1.15) return true;
  }
  return false;
}
/** Classic heart curve, scaled to radius about 1 with t = 0 at the top dip and t = pi at the tip. */
export function heartAt(t: number, out: Float32Array, index: number): void {
  const s = Math.sin(t);
  out[index] = (16 * s * s * s) / 17;
  out[index + 1] = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.08;
}

/** The heart outline sampled once: x, y for t = i / HEART_SAMPLES * 2 pi, i = 0 .. HEART_SAMPLES. */
const HEART_SAMPLES = 720;
const heartXY = new Float32Array((HEART_SAMPLES + 1) * 2);
for (let i = 0; i <= HEART_SAMPLES; i++) heartAt(i / HEART_SAMPLES * Math.PI * 2, heartXY, i * 2);
/** Unit bounding box of the heart outline: x0, x1, y0, y1. */
const HEART_BOX = ((): readonly number[] => {
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i <= HEART_SAMPLES; i++) { y0 = Math.min(y0, heartXY[i * 2 + 1]!); y1 = Math.max(y1, heartXY[i * 2 + 1]!); }
  return [-16 / 17, 16 / 17, y0, y1];
})();
const chordCache = new Map<number, Float32Array>();

/**
 * Walks n - 1 straight steps of length c along the sampled heart from the dip, writing each point's sample
 * position to ts. Returns the length of the closing step back to the dip, or -1 when the walk runs off the end.
 */
function chordWalk(c: number, n: number, ts: Float32Array): number {
  let s = 0, px = heartXY[0]!, py = heartXY[1]!;
  ts[0] = 0;
  for (let k = 1; k < n; k++) {
    let j = Math.floor(s) + 1, from = s, before = 0, after = 0;
    for (; j <= HEART_SAMPLES; j++) {
      after = Math.hypot(heartXY[j * 2]! - px, heartXY[j * 2 + 1]! - py);
      if (after >= c) break;
      from = j; before = after;
    }
    if (j > HEART_SAMPLES) return -1;
    s = from + (j - from) * (c - before) / Math.max(1e-6, after - before);
    const i = Math.min(HEART_SAMPLES - 1, Math.floor(s)), f = s - i;
    px = heartXY[i * 2]! + (heartXY[i * 2 + 2]! - heartXY[i * 2]!) * f;
    py = heartXY[i * 2 + 1]! + (heartXY[i * 2 + 3]! - heartXY[i * 2 + 1]!) * f;
    ts[k] = s;
  }
  return Math.hypot(px - heartXY[0]!, py - heartXY[1]!);
}

/** Curve parameters of n heart points with equal straight gaps (the closing gap included). Computed once per n. */
function heartChords(n: number): Float32Array {
  let ts = chordCache.get(n);
  if (ts) return ts;
  ts = new Float32Array(n);
  let lo = 0.05, hi = 3;
  for (let i = 0; i < 32; i++) {
    const c = (lo + hi) / 2, closing = chordWalk(c, n, ts);
    if (closing < c) hi = c; else lo = c;
  }
  chordWalk(lo, n, ts);
  for (let k = 0; k < n; k++) ts[k] = ts[k]! / HEART_SAMPLES * Math.PI * 2;
  chordCache.set(n, ts);
  return ts;
}

/** Unit bounding box of the drawn picture, as x0, x1, y0, y1 in out. Points are in join order. */
export function pictureBox(kind: PictureKind, points: Float32Array, n: number, out: Float32Array): void {
  if (kind === 'heart') { for (let i = 0; i < 4; i++) out[i] = HEART_BOX[i]!; return; }
  if (kind === 'kite') { out[0] = -0.72; out[1] = 0.72; out[2] = -1; out[3] = 1; return; }
  out[0] = out[2] = Infinity; out[1] = out[3] = -Infinity;
  for (let i = 0; i < n; i++) {
    out[0] = Math.min(out[0]!, points[i * 2]!); out[1] = Math.max(out[1]!, points[i * 2]!);
    out[2] = Math.min(out[2]!, points[i * 2 + 1]!); out[3] = Math.max(out[3]!, points[i * 2 + 1]!);
  }
}

/** Points along the drawn outline (unit x, y pairs in out, at most 48), for keeping it clear of the corner buttons. Returns the count. */
export function pictureOutline(kind: PictureKind, points: Float32Array, n: number, out: Float32Array): number {
  if (kind === 'heart') {
    for (let i = 0; i < 48; i++) { out[i * 2] = heartXY[i * 30]!; out[i * 2 + 1] = heartXY[i * 30 + 1]!; }
    return 48;
  }
  const corners = kind === 'kite' ? KITE : points, m = kind === 'kite' ? 4 : n, per = Math.max(1, Math.floor(48 / m));
  let k = 0;
  for (let i = 0; i < m; i++) {
    const ax = corners[i * 2]!, ay = corners[i * 2 + 1]!, bx = corners[((i + 1) % m) * 2]!, by = corners[((i + 1) % m) * 2 + 1]!;
    for (let s = 0; s < per; s++, k++) { out[k * 2] = ax + (bx - ax) * s / per; out[k * 2 + 1] = ay + (by - ay) * s / per; }
  }
  return k;
}
const KITE = new Float32Array([0, -1, 0.72, -0.18, 0, 1, -0.72, -0.18]);

export interface PendingRound {
  /** Names this round, so two tabs' rounds with the same fields stay apart when the save merges them. Rounds saved before ids have none. */
  id?: string;
  mode: Mode; picture: number; stars: number; caught: number; points: number;
  choices: string[]; chosen: string; rewardEnabled: boolean; restEntered: boolean;
}
export interface GameData extends Record<string, unknown> {
  rounds: number; tier: number; tierGood: number;
  numberLevel: number; letterLevel: number; numberGood: number; letterGood: number;
  pending: PendingRound | null;
}
export const DEFAULT_DATA: GameData = { rounds: 0, tier: 0, tierGood: 0, numberLevel: 0, letterLevel: 0, numberGood: 0, letterGood: 0, pending: null };

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const upTo = (v: unknown, max: number): v is number => count(v) && v <= max;
export const toTier = (n: unknown): Tier => n === 1 ? 1 : n === 2 ? 2 : 0;
export const toLevel = (n: unknown): Level => n === 1 ? 1 : n === 2 ? 2 : 0;

/** Repair this game's bag in place; protect the stored document when anything was malformed. */
export function sanitizeData(bag: Record<string, unknown>, protect: () => void): void {
  const limits: Record<string, number> = { rounds: Number.MAX_SAFE_INTEGER, tier: 2, tierGood: 99, numberLevel: 2, letterLevel: 2, numberGood: 99, letterGood: 99 };
  for (const [key, max] of Object.entries(limits)) {
    if (!(key in bag)) { bag[key] = 0; continue; }
    if (!upTo(bag[key], max)) { protect(); bag[key] = 0; }
  }
  if (!('pending' in bag)) { bag.pending = null; return; }
  const p = bag.pending as Record<string, unknown> | null;
  if (p === null) return;
  const mine = (id: unknown): boolean => typeof id === 'string' && STICKERS.some(s => s.game === GAME_ID && s.id === id);
  const ok = !!p && typeof p === 'object' && !Array.isArray(p) && (p.id === undefined || typeof p.id === 'string') &&
    (p.mode === 'numbers' || p.mode === 'letters') && upTo(p.picture, PICTURES.length - 1) &&
    upTo(p.stars, 3) && (p.stars as number) >= 1 && upTo(p.caught, 99) && upTo(p.points, 26) &&
    Array.isArray(p.choices) && p.choices.length <= 2 && p.choices.every(mine) && new Set(p.choices).size === p.choices.length &&
    typeof p.chosen === 'string' && (p.chosen === '' || (p.choices as string[]).includes(p.chosen)) &&
    typeof p.rewardEnabled === 'boolean' && typeof p.restEntered === 'boolean';
  if (!ok) { protect(); bag.pending = null; }
}

/** Between-round learning step for one mode. Returns the new level and streak. */
export function nextLevel(level: Level, good: number, correct: number, wrong: number): { level: Level; good: number } {
  if (wrong >= 3 && wrong * 2 >= correct) return { level: toLevel(Math.max(0, level - 1)), good: 0 };
  if (correct >= 7 && wrong <= 1) {
    if (good + 1 >= 2 && level < 2) return { level: toLevel(level + 1), good: 0 };
    return { level, good: Math.min(99, good + 1) };
  }
  return { level, good: 0 };
}
/** Between-round motor step. Hits land inside the drawn target; padded hits inside the padded area. */
export function nextTier(tier: Tier, good: number, attempts: number, hits: number, padded: number): { tier: Tier; good: number } {
  if (attempts >= 6 && padded / attempts < 0.7) return { tier: toTier(Math.max(0, tier - 1)), good: 0 };
  if (attempts >= 10 && hits / attempts >= 0.9) {
    if (good + 1 >= 2 && tier < 2) return { tier: toTier(tier + 1), good: 0 };
    return { tier, good: Math.min(99, good + 1) };
  }
  return { tier, good: 0 };
}
