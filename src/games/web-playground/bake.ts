/**
 * Canvases baked once per value and size: web balls, connect points and the
 * hero's sign. Glyphs use the bundled font, so call after ensureDisplayFont().
 * Nothing here runs per frame.
 */
import { DISPLAY_FONT, OUTLINE, roundedRect } from '../../ui/draw';

export const PAD = 8;
export const RIMS = ['#e8413b', '#2f6fe4', '#f5b71f'] as const;
const PAPER = '#fffaf0';
const WEB = '#a9bde0';

function canvasFor(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [canvas, ctx];
}

/** Dark glyph with a light rim, centred on (x, y), fitted inside maxW. */
function glyph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, maxW: number, fill = OUTLINE, rim = '#ffffff'): void {
  ctx.font = `900 ${Math.round(px)}px ${DISPLAY_FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) { px *= maxW / w; ctx.font = `900 ${Math.round(px)}px ${DISPLAY_FONT}`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, px * 0.16); ctx.strokeStyle = rim; ctx.strokeText(text, x, y + px * 0.04);
  ctx.fillStyle = fill; ctx.fillText(text, x, y + px * 0.04);
}

function webPattern(ctx: CanvasRenderingContext2D, c: number, r: number, width: number): void {
  ctx.strokeStyle = WEB; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
  for (const k of [0.42, 0.75]) {
    for (let i = 0; i <= 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8, rr = r * k;
      if (i === 0) ctx.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); else ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    }
  }
  ctx.stroke();
}

/** A floating web ball: coloured rim, paper face with a faint web, the glyph on top. */
export function bakeBall(text: string, d: number, rim: string, dpr: number): HTMLCanvasElement {
  const size = d + PAD * 2, c = size / 2, r = d / 2;
  const [canvas, ctx] = canvasFor(size, size, dpr);
  if (!ctx) return canvas;
  ctx.beginPath(); ctx.arc(c + 3, c + 5, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(43, 33, 64, 0.22)'; ctx.fill();
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.fill();
  ctx.beginPath(); ctx.arc(c, c, r * 0.8, 0, Math.PI * 2); ctx.fillStyle = PAPER; ctx.fill();
  webPattern(ctx, c, r * 0.8, Math.max(1.5, d * 0.014));
  ctx.lineWidth = Math.max(2, d * 0.018); ctx.strokeStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(c, c, r * 0.8, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(3, d * 0.04);
  ctx.beginPath(); ctx.arc(c, c, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(c - r * 0.5, c - r * 0.58, r * 0.16, r * 0.07, -0.7, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  glyph(ctx, text, c, c, d * (text.length > 1 ? 0.44 : 0.52), d * 0.62);
  return canvas;
}

/** A connect point: a paper knot with its glyph. Joined points get a ring drawn over it at runtime. */
export function bakePoint(text: string, d: number, dpr: number): HTMLCanvasElement {
  const size = d + PAD * 2, c = size / 2, r = d / 2;
  const [canvas, ctx] = canvasFor(size, size, dpr);
  if (!ctx) return canvas;
  ctx.beginPath(); ctx.arc(c + 2, c + 4, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20, 16, 50, 0.3)'; ctx.fill();
  ctx.beginPath(); ctx.arc(c, c, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = PAPER; ctx.fill();
  webPattern(ctx, c, r * 0.86, Math.max(1.2, d * 0.012));
  ctx.lineWidth = Math.max(3, d * 0.05); ctx.strokeStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(c, c, r * 0.86, 0, Math.PI * 2); ctx.stroke();
  glyph(ctx, text, c, c, d * (text.length > 1 ? 0.42 : 0.5), d * 0.6);
  return canvas;
}

/**
 * The hero's comic sign: the wanted glyph, and for numbers that many dots in
 * a ten-frame. The tail at the bottom left points down to the hero.
 * Returns logical size in out[0], out[1].
 */
export function bakeSign(text: string, dots: number, w: number, h: number, dpr: number, out: Float32Array): HTMLCanvasElement {
  const tail = h * 0.16, size = 10;
  out[0] = w + size; out[1] = h + tail + size;
  const [canvas, ctx] = canvasFor(w + size, h + tail + size, dpr);
  if (!ctx) return canvas;
  const x = size / 2, y = size / 2, line = Math.max(4, w * 0.026);
  ctx.lineJoin = 'round';
  // Flat offset shadow, then the bubble with its tail.
  for (let pass = 0; pass < 2; pass++) {
    const o = pass === 0 ? 4 : 0;
    roundedRect(ctx, x + o, y + o, w - size, h, Math.min(28, h * 0.18));
    ctx.moveTo(x + o + w * 0.24, y + o + h - 2); ctx.lineTo(x + o + w * 0.2, y + o + h + tail); ctx.lineTo(x + o + w * 0.42, y + o + h - 2);
    ctx.fillStyle = pass === 0 ? 'rgba(43, 33, 64, 0.28)' : PAPER; ctx.fill();
  }
  ctx.lineWidth = line; ctx.strokeStyle = OUTLINE;
  roundedRect(ctx, x, y, w - size, h, Math.min(28, h * 0.18)); ctx.stroke();
  // Cover the seam where the tail meets the bubble, then outline the tail.
  ctx.beginPath(); ctx.moveTo(x + w * 0.24, y + h - 2); ctx.lineTo(x + w * 0.2, y + h + tail); ctx.lineTo(x + w * 0.42, y + h - 2); ctx.closePath();
  ctx.fillStyle = PAPER; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + w * 0.24, y + h - line / 2); ctx.lineTo(x + w * 0.2, y + h + tail); ctx.lineTo(x + w * 0.42, y + h - line / 2); ctx.stroke();
  // Comic accent: a thin red inner frame.
  ctx.lineWidth = Math.max(2, line * 0.45); ctx.strokeStyle = '#e8413b';
  roundedRect(ctx, x + line * 1.6, y + line * 1.6, w - size - line * 3.2, h - line * 3.2, Math.min(20, h * 0.13)); ctx.stroke();
  const inner = w - size;
  const frameH = dots > 0 ? (text ? h * 0.3 : h * 0.5) : 0;
  if (text) glyph(ctx, text, x + inner / 2, y + (h - frameH) / 2 + (dots > 0 ? line : 0), (h - frameH) * 0.66, inner * 0.8, OUTLINE, '#ffffff');
  if (dots > 0) {
    // Ten-frame: two rows of five, filled left to right, top row first.
    const cell = Math.min(inner * 0.84 / 5, frameH * 0.86 / 2), left = x + inner / 2 - cell * 2.5;
    const top = y + h - frameH - (text ? line * 1.2 : (h - frameH) / 2 - line);
    for (let i = 0; i < 10; i++) {
      const cx = left + (i % 5 + 0.5) * cell, cy = top + (i < 5 ? 0.5 : 1.5) * cell;
      ctx.beginPath(); ctx.arc(cx, cy, cell * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = i < dots ? '#2f6fe4' : '#e9e2cf'; ctx.fill();
      ctx.lineWidth = Math.max(1.5, cell * 0.07); ctx.strokeStyle = OUTLINE; ctx.stroke();
    }
  }
  return canvas;
}
