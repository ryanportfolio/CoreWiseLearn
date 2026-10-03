/** Shared celebration bits: confetti bursts and the 1 to 3 star reveal. */

import type { ParticleSystem, ParticleSpawn } from '../engine/particles';
import { chunkyText, OUTLINE } from './draw';
import { easeOutBack, pulse } from './tween';

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

/**
 * Draw three star slots, `earned` of them gold, revealing one by one.
 * `t` is seconds since the reveal started; each star lands 0.45 s after the previous.
 */
export function drawStarRow(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, earned: number, t: number): void {
  const gap = radius * 2.6;
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * gap;
    const lit = i < earned;
    const local = t - i * 0.45;
    const s = lit ? easeOutBack(Math.min(1, Math.max(0, local / 0.5))) : 1;
    const bump = lit && local > 0 && local < 0.5 ? 1 + 0.25 * pulse(local / 0.5) : 1;
    ctx.save();
    ctx.translate(x, cy);
    ctx.scale(s * bump, s * bump);
    starPath(ctx, 0, 0, radius);
    ctx.fillStyle = lit && local > 0 ? '#ffd23f' : '#d9d4e8';
    ctx.fill();
    ctx.lineWidth = Math.max(4, radius * 0.16);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
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
