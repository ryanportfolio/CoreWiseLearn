/**
 * Words drawn once into cached canvases, so no frame ever draws text. Each card is baked on a CPU canvas (see
 * pitfalls: a bake on a GPU canvas stalls the first frame that uses its draw modes) and read back one pixel so the
 * drawing happens now, not on the first frame that shows it.
 */
import { DISPLAY_FONT, OUTLINE, roundedRect } from '../../ui/draw';

export interface WordArt {
  canvas: HTMLCanvasElement;
  /** Logical size. */
  w: number;
  h: number;
}

const CARD_FILL = '#fff6d9', CARD_TEXT = '#2b2140', PAD_TEXT = '#1f4d2a', PAD_RIM = '#f4ffe0';

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

/** A word on a cream card with the house outline, `h` logical px tall, at pixel ratio `ratio`. Upper case. */
export function bakeCard(word: string, h: number, ratio: number): WordArt {
  const text = word.toUpperCase(), px = Math.round(h * 0.64), font = `700 ${px}px ${DISPLAY_FONT}`;
  const line = Math.max(3, h * 0.075), w = Math.ceil(Math.max(h * 1.6, measure(text, font, px) + h * 0.7));
  const pad = Math.ceil(line);
  const { c, g } = cpuCanvas((w + pad * 2) * ratio, (h + pad * 2) * ratio);
  if (!g) return { canvas: c, w: w + pad * 2, h: h + pad * 2 };
  g.scale(ratio, ratio);
  roundedRect(g, pad, pad, w, h, h * 0.32);
  g.fillStyle = CARD_FILL; g.fill();
  g.lineWidth = line; g.strokeStyle = OUTLINE; g.stroke();
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = CARD_TEXT;
  g.fillText(text, pad + w / 2, pad + h / 2 + px * 0.04);
  g.getImageData(0, 0, 1, 1);
  return { canvas: c, w: w + pad * 2, h: h + pad * 2 };
}

/** The target word for the frog's lily pad: dark green letters with a pale rim, `px` logical px high. Upper case. */
export function bakePadWord(word: string, px: number, ratio: number): WordArt {
  const text = word.toUpperCase(), font = `700 ${Math.round(px)}px ${DISPLAY_FONT}`;
  const rim = Math.max(4, px * 0.16), w = Math.ceil(measure(text, font, px) + rim * 2 + 6), h = Math.ceil(px * 1.35 + rim * 2);
  const { c, g } = cpuCanvas(w * ratio, h * ratio);
  if (!g) return { canvas: c, w, h };
  g.scale(ratio, ratio);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = rim; g.strokeStyle = PAD_RIM; g.strokeText(text, w / 2, h / 2 + px * 0.04);
  g.fillStyle = PAD_TEXT; g.fillText(text, w / 2, h / 2 + px * 0.04);
  g.getImageData(0, 0, 1, 1);
  return { canvas: c, w, h };
}

/** Cache of baked words for one size and pixel ratio. `reset` drops everything when either changes. */
export class WordCache {
  private cards = new Map<string, WordArt>();
  private key = '';
  /** Forget every bake when the card height or the pixel ratio changes. */
  reset(h: number, ratio: number): void {
    const key = `${h}@${ratio}`;
    if (key !== this.key) { this.key = key; this.cards.clear(); }
  }
  card(word: string, h: number, ratio: number): WordArt {
    let art = this.cards.get(word);
    if (!art) { art = bakeCard(word, h, ratio); this.cards.set(word, art); }
    return art;
  }
}
