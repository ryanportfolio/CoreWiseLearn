/**
 * Pooled paper effects: four-point sparkles, fluttering paper confetti and
 * soft paper puffs (smoke, bubbles). Every sprite is baked once by bake();
 * spawn, update and render never allocate.
 */

import { PAPER, SWATCHES, bakeShape, type Baked } from './paper';

export const FX_SPARKLE = 0, FX_BIT = 1, FX_PUFF = 2, FX_BUBBLE = 3;
const CAPACITY = 160;

export interface Fx {
  bake(dpr: number): void;
  /** kind, position, velocity, life (s), size (px), colour index (0..6) or -1 for the kind's own colour. */
  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, color: number): void;
  sparkleRing(x: number, y: number, radius: number, count: number, random: () => number): void;
  confetti(x: number, y: number, spread: number, count: number, random: () => number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  clear(): void;
  readonly alive: number;
}

export function createFx(): Fx {
  const kind = new Uint8Array(CAPACITY), color = new Int8Array(CAPACITY);
  const x = new Float32Array(CAPACITY), y = new Float32Array(CAPACITY), vx = new Float32Array(CAPACITY), vy = new Float32Array(CAPACITY);
  const life = new Float32Array(CAPACITY), max = new Float32Array(CAPACITY), size = new Float32Array(CAPACITY);
  const rot = new Float32Array(CAPACITY), spin = new Float32Array(CAPACITY), phase = new Float32Array(CAPACITY);
  let alive = 0;
  // Sprites per kind and colour, baked at a reference size and drawn scaled.
  let sparkle: Baked[] = [], bits: Baked[] = [], puff: Baked | undefined, bubble: Baked | undefined;
  const REF = 48;

  function sparkleCanvas(fill: string, dpr: number): Baked {
    const s = REF + 8, canvas = document.createElement('canvas');
    canvas.width = Math.ceil(s * dpr); canvas.height = Math.ceil(s * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = s / 2, r = REF / 2, k = r * 0.22;
      ctx.beginPath();
      ctx.moveTo(c, c - r); ctx.quadraticCurveTo(c + k * 0.4, c - k * 0.4, c + r, c);
      ctx.quadraticCurveTo(c + k * 0.4, c + k * 0.4, c, c + r);
      ctx.quadraticCurveTo(c - k * 0.4, c + k * 0.4, c - r, c);
      ctx.quadraticCurveTo(c - k * 0.4, c - k * 0.4, c, c - r);
      ctx.closePath();
      ctx.fillStyle = '#fffaf0'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = fill; ctx.stroke();
    }
    return { canvas, w: s, h: s };
  }

  return {
    get alive() { return alive; },
    bake(dpr) {
      sparkle = []; bits = [];
      for (let i = 0; i < SWATCHES; i++) {
        sparkle.push(sparkleCanvas(PAPER[i]!, dpr));
        bits.push(bakeShape(i % 2 === 0 ? 'square' : 'triangle', PAPER[i]!, REF * 0.5, REF * 0.36, dpr, { shadow: 0, rim: 1 }));
      }
      puff = bakeShape('circle', '#e6e1d8', REF, REF, dpr, { shadow: 3, rim: 2 });
      bubble = bakeShape('circle', '#bfe8f6', REF, REF, dpr, { shadow: 0, rim: 2 });
    },
    spawn(k, px, py, pvx, pvy, l, s, c) {
      if (alive >= CAPACITY) return;
      const i = alive++;
      kind[i] = k; x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy; life[i] = l; max[i] = l; size[i] = s;
      color[i] = c; rot[i] = (i * 2.399) % 6.283; spin[i] = k === FX_BIT ? 5 - (i % 7) * 1.6 : k === FX_SPARKLE ? 1.5 : 0; phase[i] = i * 1.7;
    },
    sparkleRing(px, py, radius, count, random) {
      for (let n = 0; n < count; n++) {
        const a = n / count * Math.PI * 2 + random() * 0.4, v = radius * (2.4 + random() * 1.4);
        this.spawn(FX_SPARKLE, px + Math.cos(a) * radius * 0.6, py + Math.sin(a) * radius * 0.6, Math.cos(a) * v, Math.sin(a) * v, 0.45 + random() * 0.2, radius * (0.32 + random() * 0.18), n % SWATCHES);
      }
    },
    confetti(px, py, spread, count, random) {
      for (let n = 0; n < count; n++) {
        const a = -Math.PI / 2 + (random() - 0.5) * 2.2, v = spread * (1.2 + random() * 1.6);
        this.spawn(FX_BIT, px + (random() - 0.5) * spread, py, Math.cos(a) * v, Math.sin(a) * v, 1.6 + random() * 0.8, spread * (0.16 + random() * 0.1), n % SWATCHES);
      }
    },
    update(dt) {
      for (let i = 0; i < alive;) {
        const l = life[i]! - dt;
        if (l <= 0) {
          const last = --alive;
          kind[i] = kind[last]!; color[i] = color[last]!; x[i] = x[last]!; y[i] = y[last]!; vx[i] = vx[last]!; vy[i] = vy[last]!;
          life[i] = life[last]!; max[i] = max[last]!; size[i] = size[last]!; rot[i] = rot[last]!; spin[i] = spin[last]!; phase[i] = phase[last]!;
          continue;
        }
        life[i] = l;
        const k = kind[i]!;
        if (k === FX_BIT) {
          // Paper flutters: strong drag, light gravity, a side-to-side drift.
          vx[i] = vx[i]! * Math.pow(0.25, dt) + Math.sin(phase[i]! + l * 6) * 40 * dt;
          vy[i] = vy[i]! * Math.pow(0.3, dt) + 260 * dt;
        } else if (k === FX_SPARKLE) {
          vx[i] = vx[i]! * Math.pow(0.02, dt); vy[i] = vy[i]! * Math.pow(0.02, dt);
        } else {
          vx[i] = vx[i]! * Math.pow(0.4, dt) + Math.sin(phase[i]! + l * 3) * 14 * dt;
        }
        x[i] = x[i]! + vx[i]! * dt; y[i] = y[i]! + vy[i]! * dt; rot[i] = rot[i]! + spin[i]! * dt;
        i++;
      }
    },
    render(ctx) {
      if (!alive) return;
      const saved = ctx.globalAlpha;
      for (let i = 0; i < alive; i++) {
        const k = kind[i]!, t = 1 - life[i]! / max[i]!;
        const b = k === FX_SPARKLE ? sparkle[color[i]! % SWATCHES] : k === FX_BIT ? bits[color[i]! % SWATCHES] : k === FX_PUFF ? puff : bubble;
        if (!b) continue;
        // Fast out, slow away: full size at once, shrink and fade late.
        const grow = k === FX_PUFF || k === FX_BUBBLE ? 0.6 + 0.6 * Math.min(1, t * 3) : k === FX_SPARKLE ? 1 - t * 0.6 : 1;
        const s = size[i]! * grow / REF;
        ctx.globalAlpha = k === FX_SPARKLE ? 1 - t * t : t < 0.7 ? 1 : (1 - t) / 0.3;
        ctx.save();
        ctx.translate(x[i]!, y[i]!);
        ctx.rotate(rot[i]!);
        ctx.scale(s, k === FX_BIT ? s * Math.cos(phase[i]! + life[i]! * 9) : s);
        ctx.drawImage(b.canvas, -b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      ctx.globalAlpha = saved;
    },
    clear() { alive = 0; },
  };
}
