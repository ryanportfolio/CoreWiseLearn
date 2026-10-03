/** Small drawing helpers shared by every scene. No allocation in the hot path. */

import type { SpriteStore } from '../engine/sprites';

/** Chunky display font. Falls back to system faces; no network fonts. */
export const DISPLAY_FONT = "'Andika', 'Segoe UI', sans-serif";

export const OUTLINE = '#2b2140';

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Filled rounded panel with a thick outline, the house style for tiles and keys. */
export function chunkyPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  outline = OUTLINE,
  radius = 28,
  lineWidth = 6,
): void {
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

/** Filled circle with a thick outline. */
export function chunkyCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, outline = OUTLINE, lineWidth = 6): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

/**
 * Draw a loaded sprite centred at (x, y) so its longest side equals `size`.
 * Uses the pre-scaled offscreen cache; draws nothing if the image is missing.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteStore,
  name: string,
  x: number,
  y: number,
  size: number,
  rotation = 0,
  scaleX = 1,
  scaleY = 1,
): void {
  const img = sprites.get(name);
  if (!img) return;
  const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const scale = size / longest;
  const cached = sprites.scaled(name, scale);
  if (!cached) return;
  const pr = sprites.pixelRatio;
  const w = cached.width / pr;
  const h = cached.height / pr;
  if (rotation === 0 && scaleX === 1 && scaleY === 1) {
    ctx.drawImage(cached, x - w / 2, y - h / 2, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
  ctx.drawImage(cached, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Big outlined text, for names and numbers only (the players cannot read). */
export function chunkyText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  sizePx: number,
  fill = '#ffffff',
  outline = OUTLINE,
  align: CanvasTextAlign = 'center',
): void {
  ctx.font = `900 ${sizePx}px ${DISPLAY_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, sizePx * 0.14);
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Soft elliptical ground shadow under a character. */
export function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.18): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Cover-fit a background image into the view. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
): void {
  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}
