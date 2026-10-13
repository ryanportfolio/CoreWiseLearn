/**
 * Pencil Path physics: a marble rolling on lines drawn on a page, seen from the side. Units are centimetres and
 * seconds, x to the right and y DOWN the page (gravity is +y). The step is fixed, so a drawing always gives the same
 * run, in the game and in the level check (scripts/check-pencil-path.mjs). This file imports nothing, so Node can run
 * it directly for that check. Stepping allocates nothing.
 */

export type P2 = [number, number];

export const G = 200; // cm/s², toy gravity so a 40 cm page reads clearly
export const R = 0.75; // marble radius
export const LINE_R = 0.14; // half thickness of a pencil line
export const DT = 1 / 600;
export const LEVEL_W = 40;
export const LEVEL_H = 25;

export interface Rect { x: number; y: number; w: number; h: number }

export interface Spinner {
  x: number;
  y: number;
  /** Half length. */
  len: number;
  /** rad/s, positive turns clockwise on screen. */
  speed: number;
  phase: number;
}

export interface Level {
  /** Adult-facing name, used in docs and debug output only (the players cannot read). */
  name: string;
  start: P2;
  /** x and y are the bottom centre. */
  cup: { x: number; y: number; w: number; h: number };
  /** Centimetres of pencil. */
  ink: number;
  /** Ink used at most stars[0] earns 3 stars, at most stars[1] earns 2; any win earns at least 1. */
  stars: [number, number];
  rulers?: [P2, P2][];
  pads?: [P2, P2][];
  blots?: { x: number; y: number; r: number }[];
  noDraw?: Rect[];
  spinners?: Spinner[];
  /** A drawing that wins: the pencil's demonstration, and what the level check proves. */
  solution: P2[][];
}

export type Kind = 'line' | 'ruler' | 'pad' | 'cup' | 'spinner';
export type Outcome = 'running' | 'win' | 'blot' | 'lost' | 'stuck';

const RULER_R = 0.45, PAD_R = 0.5, CUP_R = 0.18, SPIN_R = 0.3;

export function cupWalls(c: Level['cup']): [P2, P2][] {
  // a paper cup: slightly flared walls and a flat bottom
  const flare = c.w * 0.12;
  const l: P2 = [c.x - c.w / 2, c.y], r: P2 = [c.x + c.w / 2, c.y];
  return [[[l[0] - flare, c.y - c.h], l], [l, r], [r, [r[0] + flare, c.y - c.h]]];
}

/** Ends of a spinner at time t, written into `out` ([ax, ay, bx, by]). */
export function spinnerEnds(s: Spinner, t: number, out: Float64Array | number[]): void {
  const a = s.phase + s.speed * t, dx = Math.cos(a) * s.len, dy = Math.sin(a) * s.len;
  out[0] = s.x - dx; out[1] = s.y - dy; out[2] = s.x + dx; out[3] = s.y + dy;
}

export function strokeLength(s: readonly P2[]): number {
  let L = 0;
  for (let i = 1; i < s.length; i++) L += Math.hypot(s[i]![0] - s[i - 1]![0], s[i]![1] - s[i - 1]![1]);
  return L;
}
export function inkLength(strokes: readonly (readonly P2[])[]): number {
  let L = 0;
  for (const s of strokes) L += strokeLength(s);
  return L;
}

export const inRect = (x: number, y: number, r: Rect, pad = 0): boolean => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

export function starsFor(level: Level, inkUsed: number): number {
  return inkUsed <= level.stars[0] ? 3 : inkUsed <= level.stars[1] ? 2 : 1;
}

interface Seg { ax: number; ay: number; bx: number; by: number; r: number; e: number; kind: Kind; spin: Spinner | null }
const ends = [0, 0, 0, 0];

export class Sim {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** Roll angle, for drawing. */
  angle = 0;
  t = 0;
  outcome: Outcome = 'running';
  /** What the marble touched in the last step, or null in the air. */
  touching: Kind | null = null;
  /** Hardest contact since the caller last cleared it, for sound. */
  hitKind: Kind | null = null;
  hitSpeed = 0;
  /** Distance rolled while touching something, for spaced rolling ticks. */
  rolled = 0;
  readonly level: Level;
  private readonly segs: Seg[] = [];
  private still = 0;
  private inCup = 0;
  private acc = 0;

  constructor(level: Level, strokes: readonly (readonly P2[])[]) {
    this.level = level;
    this.x = level.start[0];
    this.y = level.start[1];
    const add = (a: P2, b: P2, r: number, e: number, kind: Kind, spin: Spinner | null = null): void => {
      this.segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], r, e, kind, spin });
    };
    for (const s of strokes) for (let i = 1; i < s.length; i++) add(s[i - 1]!, s[i]!, LINE_R, 0.12, 'line');
    for (const [a, b] of level.rulers ?? []) add(a, b, RULER_R, 0.25, 'ruler');
    for (const [a, b] of level.pads ?? []) add(a, b, PAD_R, 0.92, 'pad');
    for (const [a, b] of cupWalls(level.cup)) add(a, b, CUP_R, 0.15, 'cup');
    for (const s of level.spinners ?? []) add([0, 0], [0, 0], SPIN_R, 0.3, 'spinner', s);
  }

  /** Advances real time dt in fixed steps. */
  advance(dt: number): void {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT && this.outcome === 'running') {
      this.acc -= DT;
      this.step();
    }
  }

  step(): void {
    const lv = this.level;
    this.t += DT;
    this.vy += G * DT;
    // quadratic air drag (0.0015 v² cm/s²) keeps long falls from getting silly fast
    const drag = 1 - 0.0015 * Math.hypot(this.vx, this.vy) * DT;
    this.vx *= drag; this.vy *= drag;
    this.x += this.vx * DT;
    this.y += this.vy * DT;
    this.touching = null;
    for (const s of this.segs) {
      if (s.spin) { spinnerEnds(s.spin, this.t, ends); s.ax = ends[0]!; s.ay = ends[1]!; s.bx = ends[2]!; s.by = ends[3]!; }
      const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy || 1e-9;
      let u = ((this.x - s.ax) * dx + (this.y - s.ay) * dy) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const cx = s.ax + dx * u, cy = s.ay + dy * u;
      let nx = this.x - cx, ny = this.y - cy;
      const d = Math.hypot(nx, ny), reach = R + s.r;
      if (d >= reach) continue;
      if (d < 1e-6) { nx = -dy; ny = dx; }
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      this.x += nx * (reach - d);
      this.y += ny * (reach - d);
      // a spinning pencil's surface moves
      let svx = 0, svy = 0;
      if (s.spin) { svx = -s.spin.speed * (cy - s.spin.y); svy = s.spin.speed * (cx - s.spin.x); }
      const rvx = this.vx - svx, rvy = this.vy - svy, vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const bounce = -vn > 25 ? s.e : 0; // slow contacts settle instead of jittering
        const k = Math.exp(-0.25 * DT); // rolling resistance
        const tx = (rvx - vn * nx) * k, ty = (rvy - vn * ny) * k;
        this.vx = svx + tx - bounce * vn * nx;
        this.vy = svy + ty - bounce * vn * ny;
        if (-vn > 8 && -vn > this.hitSpeed) { this.hitSpeed = -vn; this.hitKind = s.kind; }
      }
      this.touching = s.kind;
    }
    const speed = Math.hypot(this.vx, this.vy);
    this.angle += ((this.vx >= 0 ? 1 : -1) * speed * DT) / R;
    if (this.touching) this.rolled += speed * DT;

    if (lv.blots) for (const b of lv.blots) {
      if (Math.hypot(this.x - b.x, this.y - b.y) < b.r + R * 0.6) { this.outcome = 'blot'; return; }
    }
    if (this.y > LEVEL_H + 6 || this.x < -6 || this.x > LEVEL_W + 6) { this.outcome = 'lost'; return; }
    const c = lv.cup;
    const inside = Math.abs(this.x - c.x) < c.w / 2 && this.y > c.y - c.h && this.y < c.y;
    this.inCup = inside ? this.inCup + DT : 0;
    if (this.inCup > 0.25) { this.outcome = 'win'; return; }
    this.still = speed < 1.5 ? this.still + DT : 0;
    if (this.still > 1.5 || this.t > 30) this.outcome = 'stuck';
  }
}

/** Runs a whole attempt with no drawing. */
export function simulate(level: Level, strokes: readonly (readonly P2[])[], maxT = 30): Outcome {
  const sim = new Sim(level, strokes);
  while (sim.outcome === 'running' && sim.t < maxT) sim.step();
  return sim.outcome;
}

/**
 * Shape assist for small hands, applied when the pencil lifts. A line close to one smooth curve becomes that curve:
 * a quadratic Bezier with the line's own ends and a least-squares middle, so a wobbly slide has no little dips for the
 * marble to stop in. A line that is clearly some other shape keeps it and only loses its jitter. The tidied line is
 * kept only if no part of it, checked every 0.25 cm, enters a no-pencil box; otherwise the drawn line stays.
 */
export function tidyStroke(level: Level, s: readonly P2[]): P2[] {
  if (s.length < 3) return s.slice();
  const cum = [0];
  for (let i = 1; i < s.length; i++) cum.push(cum[i - 1]! + Math.hypot(s[i]![0] - s[i - 1]![0], s[i]![1] - s[i - 1]![1]));
  const len = cum[cum.length - 1]!;
  if (len < 1) return s.slice();
  const p0 = s[0]!, p2 = s[s.length - 1]!;
  let ax = 0, ay = 0, aa = 0;
  for (let i = 0; i < s.length; i++) {
    const t = cum[i]! / len, a = 2 * t * (1 - t);
    ax += a * (s[i]![0] - ((1 - t) ** 2 * p0[0] + t * t * p2[0]));
    ay += a * (s[i]![1] - ((1 - t) ** 2 * p0[1] + t * t * p2[1]));
    aa += a * a;
  }
  const cx = aa > 1e-9 ? ax / aa : (p0[0] + p2[0]) / 2, cy = aa > 1e-9 ? ay / aa : (p0[1] + p2[1]) / 2;
  const at = (t: number): P2 => [
    (1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * cx + t * t * p2[0],
    (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * cy + t * t * p2[1],
  ];
  let err = 0;
  for (let i = 0; i < s.length; i++) {
    const q = at(cum[i]! / len);
    err += (q[0] - s[i]![0]) ** 2 + (q[1] - s[i]![1]) ** 2;
  }
  err = Math.sqrt(err / s.length);
  let out: P2[];
  if (err < Math.max(0.9, len * 0.05)) {
    const n = Math.max(2, Math.ceil(len / 0.3));
    out = Array.from({ length: n + 1 }, (_, i) => at(i / n));
  } else {
    out = s.map((p): P2 => [p[0], p[1]]);
    for (let pass = 0; pass < 4; pass++) {
      const next = out.map((p): P2 => [p[0], p[1]]);
      for (let i = 1; i < out.length - 1; i++) {
        next[i] = [(out[i - 1]![0] + 2 * out[i]![0] + out[i + 1]![0]) / 4, (out[i - 1]![1] + 2 * out[i]![1] + out[i + 1]![1]) / 4];
      }
      out = next;
    }
  }
  const zones = level.noDraw ?? [];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]!, b = out[i]!, n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      for (const z of zones) if (inRect(x, y, z, 0.15)) return s.slice();
    }
  }
  return out;
}
