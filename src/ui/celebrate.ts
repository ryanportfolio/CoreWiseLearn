/** Shared celebration bits: confetti bursts and the 1 to 3 star reveal. */

import type { ParticleSystem, ParticleSpawn } from '../engine/particles';
import { chunkyText, DISPLAY_FONT, OUTLINE } from './draw';
import { reducedMotion } from './motion';
import { clamp01, pulse, slamScale, SLAM_CONTACT } from './tween';

const CONFETTI_HUES = [0, 35, 55, 130, 200, 280, 320];

/** Confetti shower from a point. Big and slow so it reads for a small child. */
export function confettiBurst(particles: ParticleSystem, x: number, y: number, count = 80, speed = 420): void {
  particles.burst(count, (p: ParticleSpawn, i: number) => {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * v;
    p.vy = Math.sin(angle) * v - speed * 0.5;
    p.life = 1.4 + Math.random() * 0.8;
    p.size = 7 + Math.random() * 7;
    p.endSize = 3;
    p.gravity = 700;
    p.drag = 0.35;
    p.hue = CONFETTI_HUES[i % CONFETTI_HUES.length] ?? 0;
    p.saturation = 90;
    p.lightness = 58;
    p.alpha = 1;
  });
}

/** Full-width confetti rain from the top edge. */
export function confettiRain(particles: ParticleSystem, width: number, count = 40): void {
  particles.burst(count, (p: ParticleSpawn, i: number) => {
    p.x = Math.random() * width;
    p.y = -20;
    p.vx = (Math.random() - 0.5) * 120;
    p.vy = 80 + Math.random() * 160;
    p.life = 2.5 + Math.random();
    p.size = 6 + Math.random() * 8;
    p.endSize = 4;
    p.gravity = 180;
    p.drag = 0.2;
    p.hue = CONFETTI_HUES[i % CONFETTI_HUES.length] ?? 0;
    p.saturation = 90;
    p.lightness = 60;
    p.alpha = 1;
  });
}

export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Seconds between one star landing and the next. */
export const STAR_GAP_SECONDS = 0.45;
/** Length of one star's slam; it touches down at STAR_HIT_SECONDS, which is when its sound should play. */
export const STAR_SLAM_SECONDS = 0.4;
export const STAR_HIT_SECONDS = STAR_SLAM_SECONDS * SLAM_CONTACT;

/** Four-point glint used for the star twinkle. */
function glintPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const w = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
}

/**
 * Draw three star slots, `earned` of them gold, landing one by one.
 * `t` is seconds since the reveal started; star i starts its slam at
 * i * STAR_GAP_SECONDS and touches down STAR_HIT_SECONDS later. Landed stars
 * sway and twinkle slowly; pass a running clock as `time` (seconds) for that.
 */
export function drawStarRow(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, earned: number, t: number, time = 0): void {
  const gap = radius * 2.6;
  const calm = reducedMotion();
  ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * gap;
    // Empty slot, always drawn so a landing star covers it.
    starPath(ctx, x, cy, radius);
    ctx.fillStyle = '#d9d4e8';
    ctx.fill();
    ctx.lineWidth = Math.max(4, radius * 0.16);
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    const local = t - i * STAR_GAP_SECONDS;
    if (i >= earned || local <= 0) continue;
    const k = local / STAR_SLAM_SECONDS;
    const s = slamScale(k, 0.7, calm);
    const alpha = clamp01(local / STAR_HIT_SECONDS);
    const landed = k >= 1;
    const sway = landed && !calm ? Math.cos(time * 1.1 + i * 1.5) * 0.05 : 0;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;
    ctx.translate(x, cy);
    if (sway !== 0) ctx.rotate(sway);
    ctx.scale(s, s);
    starPath(ctx, 0, 0, radius);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.stroke();
    if (landed) {
      // Twinkle: a white glint that swells and fades, under one cycle per second.
      const tw = 0.5 + 0.5 * Math.cos(time * 2.4 + i * 1.5);
      const g = tw * tw;
      if (g > 0.05) {
        ctx.globalAlpha = g;
        glintPath(ctx, radius * 0.42, -radius * 0.5, radius * (0.22 + 0.2 * g));
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = Math.max(2, radius * 0.06);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

const COUNTER_FILL = '#fff7a8';

interface Glyph {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** Horizontal advance of the digit in logical px, from measureText. */
  advance: number;
}

/** Digit glyphs 0 to 9 rendered once per text size, so the counter never calls fillText per frame. */
const glyphCache = new Map<number, Glyph[]>();

function glyphsFor(sizePx: number): Glyph[] {
  let glyphs = glyphCache.get(sizePx);
  if (glyphs) return glyphs;
  glyphs = [];
  const stroke = Math.max(4, sizePx * 0.14);
  const pad = Math.ceil(stroke + 2);
  const h = Math.ceil(sizePx * 1.3 + stroke * 2);
  for (let d = 0; d < 10; d++) {
    const text = String(d);
    const canvas = document.createElement('canvas');
    const measure = canvas.getContext('2d');
    let advance = sizePx * 0.6;
    if (measure) {
      measure.font = `900 ${sizePx}px ${DISPLAY_FONT}`;
      advance = measure.measureText(text).width;
    }
    const w = Math.ceil(advance + pad * 2);
    // Drawn at 1 logical px per device px: the canvas DPR is capped at 1 (MAX_DPR).
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    const c = canvas.getContext('2d');
    if (c) chunkyText(c, text, w / 2, h / 2, sizePx, COUNTER_FILL);
    glyphs.push({ canvas, w, h, advance });
  }
  glyphCache.set(sizePx, glyphs);
  return glyphs;
}

/**
 * Big number that pops when it changes. `sinceChange` in seconds. Draws cached
 * digit glyphs with drawImage and allocates nothing per frame.
 */
export function drawCounter(ctx: CanvasRenderingContext2D, value: number, x: number, y: number, sizePx: number, sinceChange: number): void {
  const s = 1 + 0.35 * pulse(Math.min(1, sinceChange / 0.3));
  const glyphs = glyphsFor(Math.round(sizePx));
  const n = Math.max(0, Math.floor(value));
  // Total advance first, so the number stays centred on x.
  let total = 0;
  let m = n;
  do {
    total += (glyphs[m % 10] as Glyph).advance;
    m = Math.floor(m / 10);
  } while (m > 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // Lay digits out from the rightmost one, walking left.
  let right = total / 2;
  m = n;
  do {
    const g = glyphs[m % 10] as Glyph;
    const cx = right - g.advance / 2;
    ctx.drawImage(g.canvas, cx - g.w / 2, -g.h / 2, g.w, g.h);
    right -= g.advance;
    m = Math.floor(m / 10);
  } while (m > 0);
  ctx.restore();
}
