/**
 * Word fountain's baked words: a word in a soap bubble, and a compound word on a card with its two halves in two colours.
 * Baked once per round and size on a CPU canvas and read back one pixel, like cards.ts (see pitfalls: a bake on a GPU
 * canvas stalls the first frame that uses its draw modes), so no frame draws text.
 */
import { DISPLAY_FONT, OUTLINE, roundedRect } from '../../ui/draw';
import type { WordArt } from './cards';

const TEXT = '#2b2140', CARD_FILL = '#fff6d9';
/** The compound's first half and second half on its card. Both dark enough to read on cream. */
const LEFT_TEXT = '#1d5fa8', RIGHT_TEXT = '#b0420f';

function cpuCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
}
const measureCanvas = cpuCanvas(1, 1).g;
function measure(text: string, font: string, px: number): number {
  if (!measureCanvas) return px * 0.62 * text.length;
  measureCanvas.font = font;
  return measureCanvas.measureText(text).width;
}

export interface BubbleArt extends WordArt {
  /** The bubble's radius in logical px (the canvas adds room for the outline). */
  r: number;
}

/** A word in a pale soap bubble with a shine, letters `px` logical px high, upper case. At least 104 px across. */
export function bakeBubble(word: string, px: number, ratio: number): BubbleArt {
  const text = word.toUpperCase(), font = `700 ${px}px ${DISPLAY_FONT}`;
  const r = Math.ceil(Math.max(52, measure(text, font, px) / 2 + px * 0.55));
  const line = Math.max(3, px * 0.11), pad = Math.ceil(line), size = (r + pad) * 2, c0 = r + pad;
  const { c, g } = cpuCanvas(size * ratio, size * ratio);
  if (!g) return { canvas: c, w: size, h: size, r };
  g.scale(ratio, ratio);
  g.beginPath(); g.arc(c0, c0, r, 0, Math.PI * 2); g.fillStyle = 'rgba(218, 245, 255, 0.94)'; g.fill();
  g.lineCap = 'round';
  // A bluer rim low on the right and a white crescent high on the left make it read as a round bubble.
  g.beginPath(); g.arc(c0, c0, r - line * 1.7, Math.PI * 0.1, Math.PI * 0.8); g.strokeStyle = 'rgba(96, 186, 230, 0.6)'; g.lineWidth = line * 1.5; g.stroke();
  g.beginPath(); g.arc(c0, c0, r - line * 1.9, Math.PI * 1.08, Math.PI * 1.42); g.strokeStyle = '#ffffff'; g.lineWidth = line * 1.4; g.stroke();
  g.beginPath(); g.ellipse(c0 - r * 0.5, c0 - r * 0.56, r * 0.1, r * 0.065, -0.6, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.beginPath(); g.arc(c0, c0, r, 0, Math.PI * 2); g.lineWidth = line; g.strokeStyle = OUTLINE; g.stroke();
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = TEXT;
  g.fillText(text, c0, c0 + px * 0.04);
  g.getImageData(0, 0, 1, 1);
  return { canvas: c, w: size, h: size, r };
}

/** A compound word on a cream card, `h` logical px tall: the first half in blue, the second in orange, upper case. */
export function bakeJoined(left: string, right: string, h: number, ratio: number): WordArt {
  const a = left.toUpperCase(), b = right.toUpperCase(), px = Math.round(h * 0.64), font = `700 ${px}px ${DISPLAY_FONT}`;
  const wa = measure(a, font, px), wb = measure(b, font, px);
  const line = Math.max(3, h * 0.075), w = Math.ceil(Math.max(h * 1.6, wa + wb + h * 0.7)), pad = Math.ceil(line);
  const { c, g } = cpuCanvas((w + pad * 2) * ratio, (h + pad * 2) * ratio);
  if (!g) return { canvas: c, w: w + pad * 2, h: h + pad * 2 };
  g.scale(ratio, ratio);
  roundedRect(g, pad, pad, w, h, h * 0.32);
  g.fillStyle = CARD_FILL; g.fill();
  g.lineWidth = line; g.strokeStyle = OUTLINE; g.stroke();
  g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle';
  const x0 = pad + w / 2 - (wa + wb) / 2, y = pad + h / 2 + px * 0.04;
  g.fillStyle = LEFT_TEXT; g.fillText(a, x0, y);
  g.fillStyle = RIGHT_TEXT; g.fillText(b, x0 + wa, y);
  g.getImageData(0, 0, 1, 1);
  return { canvas: c, w: w + pad * 2, h: h + pad * 2 };
}
