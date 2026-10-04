/**
 * End-of-round sticker offers drawn as real stickers, shared by every round game so they match.
 *
 * Each offer is its art on a white die-cut edge that follows its shape, with a thin paper-coloured rim, one corner
 * peeled back (the corner folds over and shows the sticker's pale back) and a soft offset shadow. Offers sit at a
 * slight tilt and bob gently while idle; the focused (or hovered) one lifts. A small sticker book stands beside them:
 * the hub's sticker-book purple and star on its cover, with an empty dotted sticker place under the star. On a pick
 * the sticker lifts, flies along a short arc into that place, shrinking, and the book bounces once when it lands.
 *
 * Each sticker's look is baked once per image, size and pixel ratio into two cached canvases (the sticker and its
 * shadow), and the book once per size and pixel ratio, so a frame only draws images: no canvas, gradient, shadowBlur
 * or fillText. All baking happens in idle periods, never inside a frame, in short steps spread over several idle
 * periods, on canvases the CPU draws (so the GPU has no new shader programs to build): warm() bakes ahead (games call
 * it during the celebration), and a draw that finds no bake at the size it needs queues one and meanwhile draws a bake
 * at another size scaled, or nothing.
 */
import type { SpriteStore } from '../engine/sprites';
import { OUTLINE, roundedRect } from './draw';
import { clamp01, easeInCubic, easeInOutSine, easeOutCubic, lerp } from './tween';

/** The hub's sticker-book icon, drawn on the book's cover. Games load it with their own art. */
export const BOOK_ICON = 'buttons/sticker-star';
export const BOOK_ICON_PATH = 'buttons/sticker-star.png';
/** After a pick: the sticker lifts, flies into the book, then the book bounces. PICK_SECONDS is the whole of it. */
export const PICK_LIFT = 0.12, PICK_FLY = 0.5, BOOK_BOUNCE = 0.3;
export const PICK_SECONDS = PICK_LIFT + PICK_FLY + BOOK_BOUNCE;
/** The offer not chosen (and the shells, plates or wagons under the offers) drops and fades over this long. */
export const LEAVE_SECONDS = 0.35;
/** On the rest screen the book moves from beside the offers to the middle over this long. */
export const BOOK_GLIDE = 0.45;
/** Book width over height. */
export const BOOK_ASPECT = 0.82;

const BOOK_FILL = '#8b5cf6', BOOK_SPINE = '#6d3fd6', BOOK_PAGES = '#fff8e8', BOOK_PLACE = '#e4d6ff';
const RIM = '#b4a8c8', BACK = '#efe9f7';
const BOOK_DASH = [0, 0];
const NO_DASH: number[] = [];
/** Longest a queued bake step waits for an idle period, counted from when the wait began, across callbacks. */
const IDLE_TIMEOUT = 400;
const IDLE_OPTIONS: IdleRequestOptions = { timeout: IDLE_TIMEOUT };
/** Where requestIdleCallback is missing, queued bakes run from a timer, one per call. */
const TIMED_OUT: IdleDeadline = { didTimeout: true, timeRemaining: () => 0 };
/**
 * Cover layout as fractions of the book height, from the book's centre: the star's centre and size, and the dotted
 * place's centre and radius. The cover is 0.9 of the book's width (its pages show past it); the spine band takes its
 * left 0.16, so the star and the place are centred on the rest of it.
 */
const STAR_Y = -0.2625, STAR_SIZE = 0.34, PLACE_X = 0.018, PLACE_Y = 0.146, PLACE_R = 0.22;
/** A stuck sticker's visible art fills this much of the book height. */
const STUCK = 0.42;

/** Visible extent of an image, as fractions of its longest side from its top-left, and its lowest-right point (max x + y). */
interface Shape { x0: number; y0: number; x1: number; y1: number; diag: number }
const shapes = new WeakMap<HTMLImageElement, Shape>();
const SHAPE_SAMPLE = 128;

/** Measured once per image on a small canvas; the whole image if its pixels cannot be read. */
function shapeOf(img: HTMLImageElement): Shape {
  const known = shapes.get(img);
  if (known) return known;
  const long = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const w = Math.max(1, Math.round(img.naturalWidth / long * SHAPE_SAMPLE)), h = Math.max(1, Math.round(img.naturalHeight / long * SHAPE_SAMPLE));
  let shape: Shape = { x0: 0, y0: 0, x1: w / SHAPE_SAMPLE, y1: h / SHAPE_SAMPLE, diag: (w + h) / SHAPE_SAMPLE };
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    try {
      ctx.drawImage(img, 0, 0, w, h);
      const a = ctx.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = 0, y1 = 0, diag = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((a[(y * w + x) * 4 + 3] ?? 0) <= 24) continue;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x + 1 > x1) x1 = x + 1; if (y + 1 > y1) y1 = y + 1;
        if (x + y + 2 > diag) diag = x + y + 2;
      }
      if (x1 > x0) shape = { x0: x0 / SHAPE_SAMPLE, y0: y0 / SHAPE_SAMPLE, x1: x1 / SHAPE_SAMPLE, y1: y1 / SHAPE_SAMPLE, diag: diag / SHAPE_SAMPLE };
    } catch { /* keep the whole image */ }
  }
  canvas.width = canvas.height = 0;
  shapes.set(img, shape);
  return shape;
}

interface Baked {
  img: HTMLImageElement;
  /** Image longest side it was baked for, in logical px, and the pixel ratio. */
  size: number; ratio: number;
  sticker: HTMLCanvasElement; shadow: HTMLCanvasElement;
  /** Canvas size in logical px, and the visible art's centre in it. */
  w: number; h: number; cx: number; cy: number;
  /** Longest side of the visible art, as a fraction of the image's longest side. */
  visible: number;
}
interface BookArt { h: number; ratio: number; star: HTMLImageElement | undefined; canvas: HTMLCanvasElement }

/**
 * A canvas drawn by the CPU. The bakes draw only into these: on a GPU-backed canvas, the GPU process builds a shader
 * program the first time in a browser session that it meets each new mix of draw and composite mode the bakes use
 * (a Chrome trace showed eight, 12 to 20 ms each), and the frames on screen wait for it. Here the only GPU work is one
 * upload of each finished canvas on its first draw.
 */
function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | undefined {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return ctx ? [c, ctx] : undefined;
}
/** Fill the half-plane x + y > c (the corner side of a fold along x + y = c). */
function beyond(ctx: CanvasRenderingContext2D, c: number, reach: number): void {
  const m = reach * 4 + Math.abs(c);
  ctx.beginPath(); ctx.moveTo(c + m, -m); ctx.lineTo(-m, c + m); ctx.lineTo(c + m, c + m); ctx.closePath(); ctx.fill();
}
/** Copies `from` to `to` (exclusive) of `n` copies of src, spaced evenly round a circle of radius r. */
function stamp(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, r: number, n: number, from: number, to: number): void {
  for (let i = from; i < to; i++) { const a = i / n * Math.PI * 2; ctx.drawImage(src, Math.cos(a) * r, Math.sin(a) * r); }
}
/**
 * Draws the canvas's queued drawing now. A canvas records draw calls and draws them only when its pixels are next
 * needed, so without this the work of every step would pile up into one long step, or into the first frame that
 * shows the canvas.
 */
function settle(ctx: CanvasRenderingContext2D): void { ctx.getImageData(0, 0, 1, 1); }
/** Copies per bake step, so that one step stays short enough for an idle period. */
const STAMPS_PER_STEP = 8;

/**
 * The sticker look of one image at `size` (its longest side, logical px) and pixel ratio `r`. The bake runs in steps:
 * the generator yields between them, so the work spreads over idle periods. The finished bake is passed to `done`.
 */
function* bakeSticker(img: HTMLImageElement, size: number, r: number, done: (b: Baked) => void): Generator<void, void, void> {
  const shape = shapeOf(img);
  yield;
  const long = Math.max(img.naturalWidth, img.naturalHeight) || 1, P = size * r;
  const iw = img.naturalWidth / long * P, ih = img.naturalHeight / long * P;
  const border = Math.max(3, size * 0.045) * r, rim = Math.max(1.5, size * 0.007) * r, pad = Math.ceil(border + rim + 2);
  const cw = Math.ceil((shape.x1 - shape.x0) * P) + pad * 2, ch = Math.ceil((shape.y1 - shape.y0) * P) + pad * 2;
  const ox = pad - shape.x0 * P, oy = pad - shape.y0 * P;
  const art = canvas2d(cw, ch), sil = canvas2d(cw, ch), out = canvas2d(cw, ch), flap = canvas2d(cw, ch), shade = canvas2d(cw, ch);
  if (!art || !sil || !out || !flap || !shade) return;
  const [artC, a] = art, [silC, s] = sil, [stickerC, o] = out, [flapC, f] = flap, [shadowC, sh] = shade;
  // The art at its size, resampled once; every later use of it is an unscaled copy.
  a.imageSmoothingEnabled = true; a.imageSmoothingQuality = 'high';
  a.drawImage(img, ox, oy, iw, ih);
  settle(a); yield;
  // The paper: the art's silhouette spread outward by the border, a thin rim colour just outside it.
  s.drawImage(artC, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = RIM; s.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 24; i += STAMPS_PER_STEP) { stamp(o, silC, border + rim, 24, i, i + STAMPS_PER_STEP); settle(o); yield; }
  s.fillStyle = '#ffffff'; s.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 24; i += STAMPS_PER_STEP) { stamp(o, silC, border, 24, i, i + STAMPS_PER_STEP); settle(o); yield; }
  stamp(o, silC, border * 0.5, 12, 0, 12); o.drawImage(silC, 0, 0);
  o.drawImage(artC, 0, 0);
  settle(o); artC.width = artC.height = 0; silC.width = silC.height = 0;
  yield;
  // The peel: the paper beyond a fold near its lowest-right point is cut off and drawn folded back over the sticker
  // (its mirror image across the fold), pale side up, with a soft shadow under it.
  const corner = shape.diag * P + ox + oy + (border + rim) * Math.SQRT2;
  const fold = corner - Math.max(6 * r, P * 0.085) * Math.SQRT2;
  f.drawImage(stickerC, 0, 0);
  f.globalCompositeOperation = 'source-in'; f.fillStyle = OUTLINE; f.fillRect(0, 0, cw, ch);
  f.globalCompositeOperation = 'destination-in'; beyond(f, fold, cw + ch);
  o.globalCompositeOperation = 'destination-out'; beyond(o, fold, cw + ch);
  o.globalCompositeOperation = 'source-over';
  // Mirror across x + y = fold: (x, y) -> (fold - y, fold - x). A shift of (dx, dy) on screen is (-dy, -dx) before it.
  const dx = 1.5 * r + P * 0.006, dy = 2 * r + P * 0.01;
  o.setTransform(0, -1, -1, 0, fold, fold);
  o.globalAlpha = 0.28; o.drawImage(flapC, -dy, -dx); o.globalAlpha = 1;
  f.globalCompositeOperation = 'source-in'; f.fillStyle = BACK; f.fillRect(0, 0, cw, ch);
  o.drawImage(flapC, 0, 0);
  o.setTransform(1, 0, 0, 1, 0, 0);
  settle(o); flapC.width = flapC.height = 0;
  yield;
  // The shadow is the finished sticker's silhouette in the outline colour; its alpha and offset are set when drawn.
  sh.drawImage(stickerC, 0, 0);
  sh.globalCompositeOperation = 'source-in'; sh.fillStyle = OUTLINE; sh.fillRect(0, 0, cw, ch);
  settle(sh);
  done({
    img, size, ratio: r, sticker: stickerC, shadow: shadowC, w: cw / r, h: ch / r,
    cx: (pad + (shape.x1 - shape.x0) * P / 2) / r, cy: (pad + (shape.y1 - shape.y0) * P / 2) / r,
    visible: Math.max(shape.x1 - shape.x0, shape.y1 - shape.y0),
  });
}

/** The closed sticker book, `h` logical px tall, centred in its canvas with room for its outline around it. Baked in steps, like a sticker. */
function* bakeBook(star: HTMLImageElement | undefined, h: number, r: number, done: (b: BookArt) => void): Generator<void, void, void> {
  const w = h * BOOK_ASPECT, line = Math.max(3, h * 0.035), margin = line + 2;
  const made = canvas2d((w + margin * 2) * r, (h + margin * 2) * r);
  if (!made) return;
  const [canvas, ctx] = made;
  ctx.scale(r, r); ctx.translate(margin + w / 2, margin + h / 2);
  ctx.lineJoin = 'round';
  // Pages, showing past the cover's right and bottom edges.
  const coverW = w * 0.9, coverH = h * 0.95;
  roundedRect(ctx, -w / 2 + w * 0.1, -h / 2 + h * 0.05, coverW, coverH, h * 0.06);
  ctx.fillStyle = BOOK_PAGES; ctx.fill(); ctx.lineWidth = line; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.beginPath();
  for (let i = 1; i <= 2; i++) { const x = -w / 2 + coverW + w * 0.1 * (i / 3); ctx.moveTo(x, -h / 2 + h * 0.12); ctx.lineTo(x, h / 2 - h * 0.06); }
  ctx.lineWidth = Math.max(1.5, h * 0.012); ctx.strokeStyle = '#d9cdb8'; ctx.stroke();
  settle(ctx); yield;
  // Cover with a darker spine band.
  roundedRect(ctx, -w / 2, -h / 2, coverW, coverH, h * 0.07);
  ctx.fillStyle = BOOK_FILL; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = BOOK_SPINE; ctx.fillRect(-w / 2, -h / 2, coverW * 0.16, coverH); ctx.restore();
  roundedRect(ctx, -w / 2, -h / 2, coverW, coverH, h * 0.07);
  ctx.lineWidth = line; ctx.strokeStyle = OUTLINE; ctx.stroke();
  settle(ctx); yield;
  if (star) {
    const long = Math.max(star.naturalWidth, star.naturalHeight) || 1, sw = STAR_SIZE * h * star.naturalWidth / long, sh = STAR_SIZE * h * star.naturalHeight / long;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(star, PLACE_X * h - sw / 2, STAR_Y * h - sh / 2, sw, sh);
    settle(ctx); yield;
  }
  // The empty place a new sticker goes, dotted like the sticker book's own empty places.
  BOOK_DASH[0] = h * 0.04; BOOK_DASH[1] = h * 0.035;
  ctx.setLineDash(BOOK_DASH); ctx.beginPath(); ctx.arc(PLACE_X * h, PLACE_Y * h, PLACE_R * h, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, h * 0.022); ctx.strokeStyle = BOOK_PLACE; ctx.stroke(); ctx.setLineDash(NO_DASH);
  settle(ctx);
  done({ h, ratio: r, star, canvas });
}

export interface StickerOffers {
  /** Per update: the idle bob clock, and the lift of the focused offer (-1: none). */
  update(dt: number, focused: number): void;
  /** Bake this sticker at `size` in an idle period ahead of its first frame. Cheap once it is baked. */
  warm(name: string, size: number): void;
  /** Bake the book at height `h` in an idle period. */
  warmBook(h: number): void;
  /** Offer `index` as a sticker centred (by its visible art) on x, y; `size` is the image's longest side, as drawSprite takes it. */
  drawOffer(ctx: CanvasRenderingContext2D, index: number, name: string, x: number, y: number, size: number, scale?: number, alpha?: number): void;
  /** Note the pick, so its flight starts from the tilt the offer had. */
  pick(index: number): void;
  /** The picked sticker `t` seconds after the pick, flying from its offer place into the book at bookX, bookY (height bookH). */
  drawFlight(ctx: CanvasRenderingContext2D, t: number, name: string, x: number, y: number, size: number, bookX: number, bookY: number, bookH: number): void;
  /**
   * The book at x, y, `h` tall, from art baked at `bakeH` (default h; pass the larger size while it changes size). `stuck`
   * is the sticker on its cover ('' for none); `landed` is seconds since it landed: negative hides it, under BOOK_BOUNCE
   * bounces the book.
   */
  drawBook(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, stuck: string, landed: number, bakeH?: number): void;
  /** Stops baking: cancels the waiting idle callback and drops the queue and the bake in progress. Finished bakes stay. Scenes call it on exit. */
  cancel(): void;
}

/** One per scene. All state is preallocated; drawing allocates nothing. */
export function createStickerOffers(sprites: SpriteStore): StickerOffers {
  const baked = new Map<string, Baked>();
  const books: (BookArt | undefined)[] = [undefined, undefined];
  const lift = new Float32Array(2), pickTilt = new Float32Array(1);
  const queueNames: string[] = [], queueSizes: number[] = [];
  /** waitFrom: when the wait for the next bake step began (performance.now), -1 when nothing waits. */
  let time = 0, idle = 0, bookUsed = 0, waitFrom = -1;

  const tilt = (i: number): number => (i % 2 ? 0.06 : -0.07);
  const bob = (i: number): number => Math.sin(time * 2.1 + i * 1.9);
  const wiggle = (i: number): number => Math.sin(time * 2.6 + i * 2.3) * 0.035;

  function fresh(b: Baked | undefined, name: string, size: number): boolean {
    return !!b && b.size === size && b.ratio === sprites.pixelRatio && b.img === sprites.get(name);
  }
  /**
   * The sticker baked at `size` for drawing. When it is not baked at that size and pixel ratio, the bake is queued for
   * an idle period and, until it is done, a bake at another size or ratio is drawn scaled, or the plain art.
   */
  function ensure(name: string, size: number): Baked | undefined {
    const s = Math.round(size), b = baked.get(name), img = sprites.get(name);
    if (fresh(b, name, s)) return b;
    if (img) queue(name, s);
    return b && b.img === img ? b : undefined;
  }
  /** Any bake of this sticker, at whatever size: a flight or the book's cover only scales it. */
  function any(name: string, size: number): Baked | undefined {
    const b = baked.get(name), img = sprites.get(name);
    if (b && b.img === img) { if (b.ratio !== sprites.pixelRatio) queue(name, b.size); return b; }
    if (img) queue(name, Math.round(size));
    return undefined;
  }
  /** The bake in progress, run a step at a time by onIdle, and what it is for ('' and a height: the book). */
  let job: Generator<void, void, void> | undefined, jobName = '', jobSize = 0;
  const stickerDone = (b: Baked): void => { baked.set(jobName, b); };
  const bookDone = (made: BookArt): void => {
    // Two sizes are kept (beside the offers and in the middle of the rest screen); a third replaces the one used less recently.
    const slot = !books[0] ? 0 : !books[1] ? 1 : 1 - bookUsed;
    books[slot] = made; bookUsed = slot;
  };
  /** Starts the next queued bake that is still needed; false when the queue is empty. */
  function nextJob(): boolean {
    while (queueNames.length) {
      const name = queueNames.shift()!, s = queueSizes.shift()!;
      if (name) {
        const img = sprites.get(name);
        if (!img || fresh(baked.get(name), name, s)) continue;
        job = bakeSticker(img, s, sprites.pixelRatio, stickerDone);
      } else {
        if (bookFresh(books[0], s) || bookFresh(books[1], s)) continue;
        job = bakeBook(sprites.get(BOOK_ICON), s, sprites.pixelRatio, bookDone);
      }
      jobName = name; jobSize = s;
      return true;
    }
    return false;
  }
  const bookFresh = (b: BookArt | undefined, s: number): b is BookArt => !!b && b.h === s && b.ratio === sprites.pixelRatio && b.star === sprites.get(BOOK_ICON);
  /** The book baked at height `h`; as with stickers, a missing size is queued and another size is drawn scaled meanwhile. */
  function book(h: number): BookArt | undefined {
    const s = Math.round(h), star = sprites.get(BOOK_ICON);
    for (let i = 0; i < 2; i++) { const b = books[i]; if (bookFresh(b, s)) { bookUsed = i; return b; } }
    queue('', s);
    for (let i = 0; i < 2; i++) { const b = books[i]; if (b && b.star === star) return b; }
    return undefined;
  }
  /**
   * Runs bake steps while the idle period has 4 ms left. Once the wait for a step has lasted IDLE_TIMEOUT (however many
   * short idle periods it took), one step runs regardless, so a busy machine still finishes the bake. Never runs inside a frame.
   */
  function onIdle(deadline: IdleDeadline): void {
    idle = 0;
    const overdue = deadline.didTimeout || performance.now() - waitFrom >= IDLE_TIMEOUT;
    while ((job || nextJob()) && (overdue || deadline.timeRemaining() >= 4)) {
      if (job!.next().done) job = undefined;
      waitFrom = -1;
      if (overdue) break;
    }
    if (job || queueNames.length) request(); else waitFrom = -1;
  }
  function request(): void {
    if (idle) return;
    const now = performance.now();
    if (waitFrom < 0) waitFrom = now;
    if (typeof requestIdleCallback === 'function') {
      // The callback's own timeout is what is left of the wait, so it fires by IDLE_TIMEOUT after the wait began.
      IDLE_OPTIONS.timeout = Math.max(1, IDLE_TIMEOUT - (now - waitFrom));
      idle = requestIdleCallback(onIdle, IDLE_OPTIONS);
    } else idle = window.setTimeout(onIdle, 0, TIMED_OUT);
  }
  function queue(name: string, size: number): void {
    if (job && jobName === name && jobSize === size) return;
    for (let i = 0; i < queueNames.length; i++) if (queueNames[i] === name && queueSizes[i] === size) return;
    queueNames.push(name); queueSizes.push(size);
    request();
  }
  function drawBaked(ctx: CanvasRenderingContext2D, b: Baked, x: number, y: number, size: number, rot: number, scale: number, up: number, alpha: number): void {
    const k = size * scale / b.size, w = b.w * k, h = b.h * k, left = -b.cx * k, top = -b.cy * k;
    const visible = b.visible * size * scale;
    ctx.save();
    ctx.translate(x, y);
    if (rot !== 0) ctx.rotate(rot);
    // The shadow falls down and right, further the higher the sticker is lifted.
    ctx.globalAlpha = alpha * (0.2 + 0.1 * up);
    ctx.drawImage(b.shadow, left + visible * (0.012 + 0.03 * up), top + visible * (0.02 + 0.05 * up), w, h);
    ctx.globalAlpha = alpha;
    ctx.drawImage(b.sticker, left, top, w, h);
    ctx.restore();
  }
  /**
   * The plain art, longest side `size * scale`, for a sticker whose bake is not done yet. On a busy machine a bake can
   * take seconds, and the offers can be picked once their input guard ends, so they must never be invisible.
   */
  function drawPlain(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, rot: number, scale: number, alpha: number): boolean {
    const img = sprites.get(name);
    if (!img) return false;
    const long = Math.max(img.naturalWidth, img.naturalHeight) || 1, k = size * scale / long;
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.save();
    ctx.translate(x, y);
    if (rot !== 0) ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  return {
    update(dt, focused) {
      time += dt;
      for (let i = 0; i < 2; i++) lift[i] = lift[i]! + ((i === focused ? 1 : 0) - lift[i]!) * (1 - Math.exp(-14 * dt));
    },
    warm(name, size) {
      const s = Math.round(size);
      if (!fresh(baked.get(name), name, s) && sprites.get(name)) queue(name, s);
    },
    warmBook(h) {
      const s = Math.round(h);
      if (!bookFresh(books[0], s) && !bookFresh(books[1], s)) queue('', s);
    },
    drawOffer(ctx, index, name, x, y, size, scale = 1, alpha = 1) {
      const b = ensure(name, size), up = lift[index & 1]!;
      const rot = (tilt(index) + wiggle(index)) * (1 - 0.7 * up);
      if (!b) { drawPlain(ctx, name, x, y + bob(index) * size * 0.015 - size * 0.05 * up, size, rot, scale * (1 + 0.08 * up), alpha); return; }
      const vis = b.visible * size;
      drawBaked(ctx, b, x, y + bob(index) * vis * 0.015 - vis * 0.05 * up, size, rot, scale * (1 + 0.08 * up), up, alpha);
    },
    pick(index) {
      pickTilt[0] = (tilt(index) + wiggle(index)) * (1 - 0.7 * lift[index & 1]!);
    },
    drawFlight(ctx, t, name, x, y, size, bookX, bookY, bookH) {
      if (t >= PICK_LIFT + PICK_FLY) return;
      const b = any(name, size);
      if (!b) {
        // Picked before its bake finished: the plain art goes into the book along the same arc, without the lift.
        const k = easeInOutSine(clamp01((t - PICK_LIFT) / PICK_FLY)), x1 = bookX + PLACE_X * bookH, y1 = bookY + PLACE_Y * bookH;
        drawPlain(ctx, name, lerp(x, x1, k), lerp(y, y1, k) - Math.sin(k * Math.PI) * Math.max(50, Math.hypot(x1 - x, y1 - y) * 0.22), size, pickTilt[0]! * (1 - k), lerp(1, STUCK * bookH / size, k), 1);
        return;
      }
      const vis = b.visible * size, startY = y - vis * 0.05;
      if (t < PICK_LIFT) {
        // Peeled off the sheet: up a little, straightening, its shadow dropping away.
        const k = easeOutCubic(t / PICK_LIFT);
        drawBaked(ctx, b, x, lerp(startY, startY - vis * 0.06, k), size, pickTilt[0]! * (1 - k), lerp(1.08, 1.14, k), 1, 1);
        return;
      }
      // A short arc over to the book's dotted place, shrinking to the size it has there and turning to its tilt.
      const k = easeInOutSine((t - PICK_LIFT) / PICK_FLY);
      const x0 = x, y0 = startY - vis * 0.06, x1 = bookX + PLACE_X * bookH, y1 = bookY + PLACE_Y * bookH;
      const lift2 = Math.max(50, Math.hypot(x1 - x0, y1 - y0) * 0.22);
      const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - lift2;
      const px = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * cx + k * k * x1, py = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * cy + k * k * y1;
      const end = STUCK * bookH / vis;
      drawBaked(ctx, b, px, py, size, lerp(0, -0.12, k) + Math.sin(k * Math.PI) * 0.25, lerp(1.14, end, easeInCubic(k) * 0.4 + k * 0.6), 1 - k, 1);
    },
    drawBook(ctx, x, y, h, stuck, landed, bakeH = h) {
      const art = book(bakeH);
      if (!art) return;
      // One bounce on landing: up and a little larger, then back down.
      let lift2 = 0, sx = 1, sy = 1;
      if (landed >= 0 && landed < BOOK_BOUNCE) {
        const up = Math.sin(landed / BOOK_BOUNCE * Math.PI);
        lift2 = up * h * 0.1; sx = 1 + 0.08 * up; sy = 1 + 0.12 * up;
      }
      const k = h / art.h, cw = art.canvas.width / art.ratio * k, chh = art.canvas.height / art.ratio * k;
      ctx.save();
      ctx.translate(x, y - lift2);
      if (sx !== 1 || sy !== 1) { ctx.translate(0, h / 2); ctx.scale(sx, sy); ctx.translate(0, -h / 2); }
      ctx.drawImage(art.canvas, -cw / 2, -chh / 2, cw, chh);
      if (stuck && landed >= 0) {
        const b = any(stuck, h);
        if (b) {
          const size = STUCK * h / b.visible;
          drawBaked(ctx, b, PLACE_X * h, PLACE_Y * h, size, -0.12, 1, 0, 1);
        }
      }
      ctx.restore();
    },
    cancel() {
      if (idle) { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle); else window.clearTimeout(idle); }
      idle = 0; waitFrom = -1; job = undefined; jobName = ''; jobSize = 0;
      queueNames.length = 0; queueSizes.length = 0;
    },
  };
}

/** True when x, y is on the book standing at at[0], at[1], `h` tall (its outline included). A press there picks nothing. */
export function onBook(at: Float32Array, h: number, x: number, y: number): boolean {
  const pad = Math.max(3, h * 0.035) + 2;
  return Math.abs(x - at[0]!) <= h * BOOK_ASPECT / 2 + pad && Math.abs(y - at[1]!) <= h / 2 + pad;
}

/** How far the offers' bases and the offer not chosen have dropped (as a share of their size) and faded, t seconds after a pick. */
export function leaveDrop(t: number): number { return easeInCubic(clamp01(t / LEAVE_SECONDS)) * 0.22; }
export function leaveAlpha(t: number): number { return 1 - clamp01(t / LEAVE_SECONDS); }

/**
 * Where the book stands during the choice, in out[0], out[1]: just right of the offers when it fits there (a little
 * below their middle `cy`), else centred under them (below `bottom`), else in the bottom-right corner. `top` is the
 * highest its top edge may go (below the corner buttons).
 */
export function placeBook(out: Float32Array, width: number, height: number, right: number, cy: number, bottom: number, h: number, top: number): void {
  const w = h * BOOK_ASPECT, edge = 12, gap = 24;
  if (right + gap + w + edge <= width) {
    out[0] = right + gap + w / 2;
    out[1] = Math.max(top + h / 2, Math.min(height - edge - h / 2, cy + h * 0.3));
  } else if (bottom + 12 + h + edge <= height) {
    out[0] = width / 2; out[1] = bottom + 12 + h / 2;
  } else {
    out[0] = width - edge - w / 2; out[1] = height - edge - h / 2;
  }
}
