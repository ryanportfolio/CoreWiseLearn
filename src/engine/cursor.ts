/**
 * The app's big cursor, drawn by code on top of every scene. The system cursor
 * is hidden over the canvas (CSS cursor: none).
 *
 * Four looks, each baked once per size onto a CPU canvas: an arrow (nothing
 * under the pointer), a pointing hand (something to press), an open hand
 * (something to pick up) and a closed hand (carrying a piece). The top scene
 * says what is under the pointer through Scene.hoverAt; buttons made with
 * src/ui/button.ts report their own hover through markButtonHover().
 *
 * Motion: a slow sway while idle, a springy grow on hover, a squash and a ring
 * ripple at the hotspot on any press (smaller when nothing is under it), drawn
 * over the cursor so it shows from its first frame. No cursor is drawn for
 * touch or pen input. Like the rest of the hub, it ignores prefers-reduced-motion.
 */

import type { CursorHover, SceneManager } from './scene';
import type { Input } from './input';

const OUTLINE = '#2b2140';
const RIM = '#ffffff';
const FILL = '#ffd23f';
const SHINE = '#fff6d9';
const RING = '#fff6d9';
const SPARK = '#ffd23f';

/** Cursor height in logical px at 1366x768 and uiScale 1 (the arrow's art box). */
const BASE_SIZE = 56;
/** Bakes are made this much larger than the drawn size so the hover grow stays sharp. */
const BAKE_HEADROOM = 1.2;
const HOVER_SCALE = 1.15;
/** Art units: every look is drawn in a box where the arrow's art is UNIT_BOX units tall. */
const UNIT_BOX = 114;
/** Visible dark outline and white rim, in art units. */
const LINE = 6.5;
const RIM_W = 4.5;

const RIPPLE_SLOTS = 6;
const RIPPLE_BIG_SECONDS = 0.34;
const RIPPLE_SMALL_SECONDS = 0.26;

const enum Look { Arrow = 0, Point = 1, Open = 2, Closed = 3 }

interface LookArt {
  /** Art box in units, and the hotspot inside it. */
  w: number;
  h: number;
  hx: number;
  hy: number;
  /** Drawn size relative to the arrow's units, so every look reads about the same size. */
  k: number;
  draw(ctx: CanvasRenderingContext2D, pass: number): void;
  detail(ctx: CanvasRenderingContext2D): void;
}

let buttonHover = false;

/** Called by a hovered button during its update; the cursor shows the pointing hand. */
export function markButtonHover(): void {
  buttonHover = true;
}

/** Colour and outward growth for a pass: 0 white rim, 1 dark outline, 2 fill. */
function passStyle(ctx: CanvasRenderingContext2D, pass: number): number {
  const color = pass === 0 ? RIM : pass === 1 ? OUTLINE : FILL;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  return pass === 0 ? LINE + RIM_W : pass === 1 ? LINE : 0;
}

/** Round-capped thick line: fingers and thumbs. */
function capsule(ctx: CanvasRenderingContext2D, pass: number, x1: number, y1: number, x2: number, y2: number, w: number): void {
  const grow = passStyle(ctx, pass);
  ctx.lineCap = 'round';
  ctx.lineWidth = w + grow * 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function blob(ctx: CanvasRenderingContext2D, pass: number, x: number, y: number, w: number, h: number, r: number): void {
  const grow = passStyle(ctx, pass);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  if (grow > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = grow * 2;
    ctx.stroke();
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

const M = LINE + RIM_W + 2;

const ARROW: LookArt = {
  w: 60 + M * 2, h: 90 + M * 2, hx: M, hy: M, k: 1,
  draw(ctx, pass) {
    const grow = passStyle(ctx, pass);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 78);
    ctx.lineTo(19, 62);
    ctx.lineTo(31, 89);
    ctx.lineTo(46, 82);
    ctx.lineTo(34, 56);
    ctx.lineTo(58, 55);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.fill();
    if (grow > 0) { ctx.lineWidth = grow * 2; ctx.stroke(); }
  },
  detail(ctx) {
    line(ctx, 6, 16, 6, 56, 5, SHINE);
  },
};

/** Index finger up, the other fingers curled; hotspot at the fingertip. */
const POINT: LookArt = {
  w: 74 + M * 2, h: 96 + M * 2, hx: 22 + M, hy: M, k: 1.08,
  draw(ctx, pass) {
    capsule(ctx, pass, 0, 8, 0, 52, 16);
    capsule(ctx, pass, 12, 44, 12, 52, 13);
    capsule(ctx, pass, 23, 46, 23, 54, 13);
    capsule(ctx, pass, 33, 50, 33, 58, 12);
    blob(ctx, pass, -12, 44, 50, 42, 16);
    capsule(ctx, pass, -15, 72, -4, 58, 13);
  },
  detail(ctx) {
    line(ctx, 6.5, 40, 6.5, 54, 3, OUTLINE);
    line(ctx, 17.5, 42, 17.5, 56, 3, OUTLINE);
    line(ctx, 28.5, 45, 28.5, 58, 3, OUTLINE);
    line(ctx, -4, 9, -4, 34, 4, SHINE);
  },
};

/** Open hand, fingers spread; hotspot in the palm. */
const OPEN: LookArt = {
  w: 82 + M * 2, h: 96 + M * 2, hx: 42 + M, hy: 58 + M, k: 1.08,
  draw(ctx, pass) {
    capsule(ctx, pass, -16, -8, -21, -42, 14);
    capsule(ctx, pass, -3, -10, -4, -49, 14);
    capsule(ctx, pass, 10, -10, 13, -45, 14);
    capsule(ctx, pass, 21, -4, 28, -30, 12);
    capsule(ctx, pass, -20, 14, -36, -6, 14);
    blob(ctx, pass, -25, -16, 50, 46, 18);
  },
  detail(ctx) {
    line(ctx, -10, -14, -10, -4, 3, OUTLINE);
    line(ctx, 3, -14, 3, -4, 3, OUTLINE);
    line(ctx, 16, -10, 16, -2, 3, OUTLINE);
    line(ctx, -21, -38, -18, -16, 4, SHINE);
  },
};

/** Closed hand holding on; hotspot in the middle of the fist. */
const CLOSED: LookArt = {
  w: 66 + M * 2, h: 62 + M * 2, hx: 33 + M, hy: 34 + M, k: 1.3,
  draw(ctx, pass) {
    capsule(ctx, pass, -19, -22, -19, -18, 15);
    capsule(ctx, pass, -6, -24, -6, -18, 15);
    capsule(ctx, pass, 7, -24, 7, -18, 15);
    capsule(ctx, pass, 19, -21, 19, -16, 14);
    blob(ctx, pass, -27, -20, 54, 46, 18);
    capsule(ctx, pass, -26, 6, -6, 0, 14);
  },
  detail(ctx) {
    line(ctx, -12.5, -30, -12.5, -16, 3, OUTLINE);
    line(ctx, 0.5, -31, 0.5, -16, 3, OUTLINE);
    line(ctx, 13, -29, 13, -15, 3, OUTLINE);
    // The thumb sits in front of the fingers: give it its own outline.
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 14 + LINE;
    ctx.beginPath(); ctx.moveTo(-26, 6); ctx.lineTo(-6, 0); ctx.stroke();
    ctx.strokeStyle = FILL;
    ctx.lineWidth = 14 - LINE * 0.2;
    ctx.beginPath(); ctx.moveTo(-26, 6); ctx.lineTo(-6, 0); ctx.stroke();
  },
};

const LOOKS: readonly LookArt[] = [ARROW, POINT, OPEN, CLOSED];

function bake(art: LookArt, unitPx: number, into: HTMLCanvasElement | undefined): HTMLCanvasElement {
  const pxPerUnit = unitPx * art.k;
  const canvas = into ?? document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(art.w * pxPerUnit));
  canvas.height = Math.max(1, Math.ceil(art.h * pxPerUnit));
  // A CPU canvas: no shader programs are built for the bake (pitfalls, 2026-10-03).
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(pxPerUnit, 0, 0, pxPerUnit, art.hx * pxPerUnit, art.hy * pxPerUnit);
  for (let pass = 0; pass < 3; pass++) art.draw(ctx, pass);
  art.detail(ctx);
  ctx.getImageData(0, 0, 1, 1);
  return canvas;
}

/** Damped spring on a [value, velocity] pair, sub-stepped for stability. */
function spring(state: Float32Array, target: number, omega: number, zeta: number, dt: number): void {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  let x = state[0] ?? 0;
  let v = state[1] ?? 0;
  for (let i = 0; i < n; i++) {
    v += (omega * omega * (target - x) - 2 * zeta * omega * v) * h;
    x += v * h;
  }
  state[0] = x;
  state[1] = v;
}

export interface Cursor {
  /** Size in logical px for a canvas of this size (the arrow's art box). */
  readonly size: number;
  /** The look last shown, for checks: 'arrow' | 'point' | 'open' | 'closed'. */
  readonly look: string;
  /** Call at the start of each simulation step, before the scenes update. */
  beginStep(): void;
  /** Real seconds since the last drawn frame. */
  frame(seconds: number): void;
  /** Draw on top of everything; call last in the frame. */
  render(ctx: CanvasRenderingContext2D): void;
  resize(width: number, height: number, dpr: number): void;
  destroy(): void;
}

const LOOK_NAMES = ['arrow', 'point', 'open', 'closed'] as const;

export function createCursor(element: HTMLCanvasElement, input: Input, scenes: SceneManager, uiScale: number): Cursor {
  const baked: HTMLCanvasElement[] = [];
  let size = BASE_SIZE;
  let bakedPx = 0;
  let stepped = false;
  let look: Look = Look.Arrow;
  let kind: CursorHover = null;
  let visible = false;
  let time = 0;
  /** Hover grow and press squash springs: [value, velocity]. */
  const grow = new Float32Array([1, 0]);
  const squash = new Float32Array([0, 0]);
  /** Ripple pool: x, y, age (seconds, < 0 = free), big (1 or 0). */
  const ripples = new Float32Array(RIPPLE_SLOTS * 4);
  for (let i = 0; i < RIPPLE_SLOTS; i++) ripples[i * 4 + 2] = -1;
  let nextRipple = 0;

  element.style.cursor = 'none';

  function lookFor(hover: CursorHover): Look {
    return hover === 'carry' ? Look.Closed : hover === 'grab' ? Look.Open : hover === 'press' ? Look.Point : Look.Arrow;
  }

  function resolve(): void {
    const p = input.pointer;
    const scene = scenes.current;
    let next: CursorHover = scene?.hoverAt ? scene.hoverAt(p.x, p.y) : null;
    if (next === null && buttonHover) next = 'press';
    kind = next;
    const nextLook = lookFor(next);
    if (nextLook !== look) {
      // A small dip before the grow hides the swap from one shape to the next.
      if (visible) grow[0] = Math.min(grow[0] ?? 1, 0.9);
      look = nextLook;
    }
  }

  const offDown = input.on('pointerdown', (info) => {
    if (input.pointer.type !== 'mouse') return;
    squash[0] = 0.2;
    squash[1] = 0;
    const at = nextRipple * 4;
    ripples[at] = info.x;
    ripples[at + 1] = info.y;
    ripples[at + 2] = 0;
    ripples[at + 3] = kind === null ? 0 : 1;
    nextRipple = (nextRipple + 1) % RIPPLE_SLOTS;
  });

  function drawRipples(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < RIPPLE_SLOTS; i++) {
      const at = i * 4;
      const age = ripples[at + 2] ?? -1;
      if (age < 0) continue;
      const big = ripples[at + 3] === 1;
      const k = age / (big ? RIPPLE_BIG_SECONDS : RIPPLE_SMALL_SECONDS);
      if (k >= 1) { ripples[at + 2] = -1; continue; }
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      const x = ripples[at] ?? 0;
      const y = ripples[at + 1] ?? 0;
      const r = size * (0.12 + (big ? 0.55 : 0.3) * e);
      const fade = (1 - k) * (1 - k);
      ctx.globalAlpha = 0.55 * fade;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.lineWidth = (big ? 7 : 5) * (1 - k * 0.6);
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.globalAlpha = 0.95 * fade;
      ctx.lineWidth = (big ? 3.5 : 2.5) * (1 - k * 0.6);
      ctx.strokeStyle = RING;
      ctx.stroke();
      if (big) {
        const d = r * 1.18;
        const dot = size * 0.055 * (1 - k);
        ctx.globalAlpha = fade;
        ctx.fillStyle = SPARK;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        for (let s = 0; s < 6; s++) {
          const a = s * (Math.PI / 3) + 0.3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, dot, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  const cursor: Cursor = {
    get size() { return size; },
    get look() { return LOOK_NAMES[look]; },
    beginStep() {
      buttonHover = false;
      stepped = true;
    },
    frame(seconds) {
      const dt = Math.min(0.1, Math.max(0, seconds));
      time += dt;
      for (let i = 0; i < RIPPLE_SLOTS; i++) {
        const at = i * 4 + 2;
        if ((ripples[at] ?? -1) >= 0) ripples[at] = (ripples[at] ?? 0) + dt;
      }
      spring(grow, look === Look.Arrow ? 1 : HOVER_SCALE, 40, 0.6, dt);
      spring(squash, 0, 46, 0.5, dt);
    },
    render(ctx) {
      const p = input.pointer;
      const show = p.inside && p.type === 'mouse';
      if (!show) { visible = false; return; }
      if (stepped) { stepped = false; resolve(); }
      if (!visible) {
        visible = true;
        grow[0] = look === Look.Arrow ? 1 : HOVER_SCALE;
        grow[1] = 0;
      }
      const art = LOOKS[look];
      const image = baked[look];
      if (!art || !image) return;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      const q = squash[0] ?? 0;
      const g = grow[0] ?? 1;
      const idle = look === Look.Arrow ? 1 : 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (idle) ctx.rotate(0.035 * Math.sin(time * 1.7));
      const breathe = 1 + idle * 0.015 * Math.sin(time * 2.3);
      ctx.scale(g * breathe * (1 + q * 0.5), g * breathe * (1 - q));
      const u = (size / UNIT_BOX) * art.k;
      ctx.drawImage(image, -art.hx * u, -art.hy * u, art.w * u, art.h * u);
      ctx.restore();
      // Over the cursor, so the ring shows from its first frame whichever look sits on the hotspot.
      drawRipples(ctx);
      ctx.restore();
    },
    resize(width, height, dpr) {
      const s = Math.min(1.5, Math.max(0.75, Math.min(width / 1366, height / 768))) * uiScale;
      size = BASE_SIZE * s;
      const px = (size / UNIT_BOX) * BAKE_HEADROOM * dpr;
      if (Math.abs(px - bakedPx) < 0.001) return;
      bakedPx = px;
      for (let i = 0; i < LOOKS.length; i++) {
        const art = LOOKS[i];
        if (art) baked[i] = bake(art, px, baked[i]);
      }
    },
    destroy() {
      offDown();
      element.style.cursor = '';
    },
  };
  return cursor;
}
