/** Shared celebration bits: confetti bursts and the 1 to 3 star reveal. */

import type { ParticleSystem, ParticleSpawn } from '../engine/particles';
import { chunkyText, OUTLINE } from './draw';
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

/** Big number that pops when it changes. `sinceChange` in seconds. */
export function drawCounter(ctx: CanvasRenderingContext2D, value: number, x: number, y: number, sizePx: number, sinceChange: number): void {
  const s = 1 + 0.35 * pulse(Math.min(1, sinceChange / 0.3));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  chunkyText(ctx, String(value), 0, 0, sizePx, '#fff7a8');
  ctx.restore();
}
