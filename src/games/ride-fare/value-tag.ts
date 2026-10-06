/**
 * Coin value tags (money labels, owner 2026-10-06): a cream pill with a deep-ink edge carrying the coin's value
 * (1¢, 5¢, 10¢, 25¢) over the coin's lower edge, centred. All four coin games draw the same tag. Each tag is baked once
 * per coin size on a CPU canvas (pitfalls: no shader programs) and drawn each frame with one drawImage at the coin's
 * position and scale, so it moves, lifts, scales and flies with the coin. It stays upright while the coin rolls or
 * tumbles, so the value reads at every moment. No per-frame text, gradients or allocations.
 */
import { DISPLAY_FONT } from '../../ui/draw';

/**
 * Numeral ink is planned at TAG_INK of the coin's diameter (and at least the floor `configure` sets), a little over the
 * spec's 0.30 because anti-aliasing takes about 2 percent off the drawn digits; the pill is TAG_PILL_H times the ink tall.
 */
const TAG_INK = 0.31, TAG_PILL_H = 1.5;
/** TAG_OVER of the pill lies over the coin, never more than TAG_COVER of its diameter, so the portrait's face stays clear. */
const TAG_OVER = 0.55, TAG_COVER = 0.22;
/** Baked this much larger than drawn, so a lifted or pulsing coin's tag never draws above its own pixels. */
const TAG_SHARP = 1.25;
/** Cached tag sizes per coin kind; every layout draws fewer sizes than this. */
const SLOTS = 8;
const CREAM = '#fff8e6';

export interface TagInfo { kind: number; d: number; text: string; ink: number; measuredInk: number; w: number; h: number }
export interface ValueTags {
  /** Set the numeral floor (CSS px), pixel ratio and font state; any change drops every baked tag. */
  configure(minInk: number, ratio: number, fontReady: boolean): void;
  /** Numeral ink height in CSS px for a coin `d` across. */
  ink(d: number): number;
  /** How far the tag reaches below the lower edge of a coin `d` across, in CSS px. */
  hang(d: number): number;
  /** Bake the tag for a coin of `kind` resting `d` across ahead of its first draw. */
  prepare(kind: number, d: number): void;
  /**
   * The tag of a coin of `kind` whose resting size is `d` (the bake's key), for the coin centred at (x, y) drawn at
   * `sx` by `sy` of that size.
   */
  draw(ctx: CanvasRenderingContext2D, kind: number, d: number, x: number, y: number, sx: number, sy: number): void;
  /** The text a coin of `kind` carries. */
  text(kind: number): string;
  /** Every baked tag, with its numeral height measured from the baked pixels (allocates; for checks only). */
  measure(): TagInfo[];
  /** Canvases baked so far (for the canvas-growth check). */
  readonly bakes: number;
}

/** One CPU canvas reused to measure text, made on first use. */
let probe: CanvasRenderingContext2D | null | undefined;
const measureCtx = (): CanvasRenderingContext2D | null => {
  if (probe === undefined) probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  return probe;
};

/** `values` in cents by coin kind; `ink` the game's deep ink colour; `weight` its numerals' font weight. */
export function createValueTags(values: readonly number[], ink: string, weight: number): ValueTags {
  const kinds = values.length, texts = values.map(v => `${v}¢`);
  const canvas: (HTMLCanvasElement | undefined)[] = new Array<HTMLCanvasElement | undefined>(kinds * SLOTS).fill(undefined);
  const key = new Float32Array(kinds * SLOTS).fill(-1), tw = new Float32Array(kinds * SLOTS), th = new Float32Array(kinds * SLOTS);
  const toff = new Float32Array(kinds * SLOTS), next = new Uint8Array(kinds);
  /** Where the first digit's ink lies across each bake, as fractions of its width (for `measure`). */
  const dx0 = new Float32Array(kinds * SLOTS), dx1 = new Float32Array(kinds * SLOTS);
  let minInk = 20, ratio = 1, font = false, share = 0, bakes = 0;
  /** Midway between the cream's and the ink's channel sums: the coverage line `measure` counts a digit pixel at. */
  const sum = (hex: string): number => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  const half = (sum(CREAM) + sum(ink)) / 2;

  const inkOf = (d: number): number => Math.max(TAG_INK * d, minInk);
  const edge = (ik: number): number => Math.max(2, ik * 0.1);
  const overOf = (d: number, pillH: number): number => Math.min(pillH * TAG_OVER, d * TAG_COVER);

  function bake(slot: number, kind: number, d: number): void {
    const g0 = measureCtx();
    // Digit height as a share of the font size, measured on the flat-topped "1" once the bundled font is in (Andika's
    // digits are about 0.7), so the shortest digit still reaches the planned height.
    if (g0 && font && !share) {
      g0.font = `${weight} 100px ${DISPLAY_FONT}`;
      const m = g0.measureText('1');
      share = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 100 || 0.7;
    }
    const ik = inkOf(d), px = ik / (share || 0.7), f = `${weight} ${px.toFixed(2)}px ${DISPLAY_FONT}`, text = texts[kind]!;
    let textW = px * 0.55 * text.length, digitW = px * 0.55;
    if (g0) { g0.font = f; textW = g0.measureText(text).width; digitW = g0.measureText(text[0]!).width; }
    const lw = edge(ik), pillH = ik * TAG_PILL_H, pillW = Math.max(pillH * 1.1, textW + ik * 0.6);
    const w = pillW + lw, h = pillH + lw, k = ratio * TAG_SHARP;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
    bakes++;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.scale(c.width / w, c.height / h);
      g.beginPath(); g.roundRect(lw / 2, lw / 2, pillW, pillH, pillH / 2);
      g.fillStyle = CREAM; g.fill(); g.lineWidth = lw; g.strokeStyle = ink; g.stroke();
      g.font = f; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = ink;
      g.fillText(text, w / 2, h / 2 + ik / 2);
      g.getImageData(0, 0, 1, 1);
    }
    canvas[slot] = c; key[slot] = d; tw[slot] = w; th[slot] = h;
    dx0[slot] = (w / 2 - textW / 2) / w; dx1[slot] = (w / 2 - textW / 2 + digitW) / w;
    // The pill's centre sits this far below the coin's centre.
    toff[slot] = d / 2 - overOf(d, pillH) + pillH / 2;
  }
  function slotOf(kind: number, d: number): number {
    if (kind < 0 || kind >= kinds || d <= 0) return -1;
    const dd = Math.round(d), base = kind * SLOTS;
    for (let i = base; i < base + SLOTS; i++) if (key[i] === dd) return i;
    const i = base + next[kind]!; next[kind] = (next[kind]! + 1) % SLOTS;
    bake(i, kind, dd);
    return i;
  }

  return {
    configure(floor, pr, fontReady) {
      if (floor === minInk && pr === ratio && fontReady === font) return;
      minInk = floor; ratio = pr; font = fontReady;
      key.fill(-1); canvas.fill(undefined); next.fill(0);
    },
    ink: inkOf,
    hang(d) { const ik = inkOf(d), pillH = ik * TAG_PILL_H; return pillH - overOf(d, pillH) + edge(ik) / 2; },
    prepare(kind, d) { slotOf(kind, d); },
    draw(ctx, kind, d, x, y, sx, sy) {
      const i = slotOf(kind, d), c = i >= 0 ? canvas[i] : undefined; if (!c) return;
      const w = tw[i]!, h = th[i]!, off = toff[i]!;
      ctx.drawImage(c, x - w * sx / 2, y + (off - h / 2) * sy, w * sx, h * sy);
    },
    text(kind) { return texts[kind] ?? ''; },
    measure() {
      const out: TagInfo[] = [];
      for (let i = 0; i < canvas.length; i++) {
        const c = canvas[i]; if (!c || key[i]! < 0) continue;
        const g = c.getContext('2d', { willReadFrequently: true }); if (!g) continue;
        // The first digit is the only dark ink in its own columns inside the pill (the edge and the taller ¢ sign lie
        // outside them): find the rows it spans.
        const span = dx1[i]! - dx0[i]!, px = g.getImageData(0, 0, c.width, c.height).data;
        // The middle half of the digit's columns, clear of the pill's rounded end.
        const x0 = Math.ceil(c.width * (dx0[i]! + span * 0.25)), x1 = Math.floor(c.width * (dx0[i]! + span * 0.75));
        // A pixel counts as digit when it is at least half way from the cream to the ink (half its area covered).
        let top = -1, bottom = -1;
        for (let y = Math.floor(c.height * 0.12); y < Math.ceil(c.height * 0.88); y++) {
          for (let x = x0; x < x1; x++) {
            const j = (y * c.width + x) * 4;
            if (px[j + 3]! > 128 && px[j]! + px[j + 1]! + px[j + 2]! < half) { if (top < 0) top = y; bottom = y; break; }
          }
        }
        const kind = Math.floor(i / SLOTS);
        out.push({ kind, d: key[i]!, text: texts[kind]!, ink: inkOf(key[i]!), measuredInk: top < 0 ? 0 : (bottom - top + 1) * tw[i]! / c.width, w: tw[i]!, h: th[i]! });
      }
      return out;
    },
    get bakes() { return bakes; },
  };
}
