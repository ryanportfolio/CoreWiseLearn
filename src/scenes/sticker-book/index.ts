/**
 * Collection pages of eight stickers each, as many pages as STICKERS needs.
 * Earned stickers show in full colour with a white sticker border; the rest
 * are dotted circles holding a faint grey version. Tapping an earned sticker
 * makes it wobble and picks it up; the next tap (or arrow keys, then any key)
 * puts it down there. Opening the book or turning a page marks the stickers
 * shown as seen.
 */

import type { CursorHover, Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { AppServices, RewardsBag } from '../../app/services';
import { STICKERS, stickerSpriteName, type StickerDef } from '../../app/stickers';
import { createButton, dispatchDown, dispatchUp, type Button } from '../../ui/button';
import { chunkyCircle, OUTLINE, roundedRect } from '../../ui/draw';
import { drawEnterFade } from '../../ui/motion';
import { createKeyboardNavigation, drawPageArrow } from '../../ui/navigation';
import { playSfx } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import {
  artName,
  artRequest,
  bakeBackground,
  circleTarget,
  createSoundButton,
  loadAllArt,
  markSeen,
  rewardsOrUndefined,
  soundArt,
  syncSoundIcon,
  unseenStickers,
  type ArtRequest,
  type LayoutTarget,
} from '../hub/shared';

const BG = 'backgrounds/sticker-album';
const HOME = 'buttons/home';

/** Page areas as fractions of the album image (left page, right page). */
const PAGES = [
  { x0: 0.07, x1: 0.47, y0: 0.1, y1: 0.88 },
  { x0: 0.53, x1: 0.93, y0: 0.1, y1: 0.88 },
] as const;

/** Dotted outline for stickers not earned yet; constant so a frame never allocates one. */
const DASH = [9, 9];
const SOLID: number[] = [];
/** Page dots: radius, centre spacing, and the band under the bottom controls they sit in, in px. */
const DOT_R = 6;
const DOT_STEP = 20;
const DOT_BAND = 26;
/** Arrow-key step, in px, for a picked-up sticker. */
const NUDGE: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32] };
/** A press on a sticker released within CLICK_MS and CLICK_PX is a click: the sticker follows the pointer until the next press. */
const CLICK_MS = 300, CLICK_PX = 24;

const PLACEHOLDER_HUES = ['#ff8a5c', '#5fd36b', '#c084fc', '#ffd23f', '#ff6b6b', '#ffb84d', '#a855f7', '#facc15', '#60a5fa', '#38bdf8'];

function stickerArt(services: AppServices, stickers: readonly StickerDef[]): ArtRequest[] {
  return [
    artRequest(services, `${BG}.webp`, 'none'),
    artRequest(services, `${HOME}.webp`, 'home', '#ffffff'),
    ...soundArt(services),
    ...stickers.map((def, i) => ({ name: stickerSpriteName(def.id), url: services.art(def.path), kind: 'blob' as const, color: PLACEHOLDER_HUES[i % PLACEHOLDER_HUES.length] ?? '#ffffff' })),
  ];
}

/**
 * Load (or finish loading) everything the sticker book draws. Never rejects. `stickers` defaults to STICKERS.
 * Once loaded, the album and the sticker art are baked in idle time, ahead of the first visit.
 */
export function loadStickerBookAssets(services: AppServices, stickers: readonly StickerDef[] = STICKERS): Promise<void> {
  return loadAllArt(services, stickerArt(services, stickers)).then(() => warmStickerBook(services, stickers));
}

interface Slot {
  def: StickerDef;
  /** True once color and grey match the current size and art. */
  ready: boolean;
  x: number;
  y: number;
  r: number;
  count: number;
  /** Full-colour sticker with white border, device resolution. */
  color: HTMLCanvasElement | undefined;
  /** Grey, 20 percent alpha version, device resolution. */
  grey: HTMLCanvasElement | undefined;
  /** Seconds since a tap started the bounce; negative when idle. */
  bounce: number;
  /** Position in the collection, which is also the index of its button. */
  index: number;
}

export interface StickerBookLayout {
  targets: LayoutTarget[];
  /** Page dot centres and radius, logical px. */
  dots: { x: number; y: number; r: number }[];
}

function fallbackAlbum(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#38b6ff';
  ctx.fillRect(0, 0, w, h);
  const pad = Math.min(w, h) * 0.03;
  roundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 40);
  ctx.fillStyle = '#8b5cf6';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  for (const p of PAGES) {
    const x = w * (p.x0 - 0.04);
    const y = h * (p.y0 - 0.06);
    roundedRect(ctx, x, y, w * (p.x1 - p.x0 + 0.08), h * (p.y1 - p.y0 + 0.1), 26);
    ctx.fillStyle = '#fff4dc';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

/** Side of the canvas a sticker's outline is measured on, in px. */
const REACH_SAMPLE = 256;
/** How far each image's visible pixels reach from its centre, as a fraction of its longest side. */
const reachCache = new WeakMap<HTMLImageElement, number>();

/**
 * Distance from the image centre to its farthest visible pixel, as a
 * fraction of the image's longest side: about 0.5 for a round creature
 * filling a square, 0.71 for a filled square, 0.53 for a filled 3:1 strip.
 * Measured once per image on a small canvas and cached.
 */
function artReach(img: HTMLImageElement): number {
  const cached = reachCache.get(img);
  if (cached !== undefined) return cached;
  const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const w = Math.max(1, Math.round(img.naturalWidth / longest * REACH_SAMPLE));
  const h = Math.max(1, Math.round(img.naturalHeight / longest * REACH_SAMPLE));
  // The rectangle's half diagonal is the safe answer if the pixels cannot be read.
  let reach = Math.hypot(w, h) / 2 / REACH_SAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    try {
      ctx.drawImage(img, 0, 0, w, h);
      const alpha = ctx.getImageData(0, 0, w, h).data;
      let far = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if ((alpha[(y * w + x) * 4 + 3] ?? 0) > 8) far = Math.max(far, Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2));
        }
      }
      // Half a pixel more, so a pixel's outer corner is counted too.
      reach = (far + 0.75) / REACH_SAMPLE;
    } catch {
      /* keep the half diagonal */
    }
  }
  reachCache.set(img, reach);
  return reach;
}

/** Dotted outline radius as a fraction of the slot radius, and its line width in px. */
const DASH_RADIUS = 0.82;
const DASH_WIDTH = 4;

/**
 * A sticker's finished art at one size: the full-colour copy with its white
 * border and the faint grey copy. Kept for the whole session, because every
 * visit builds a new book scene and building all eight costs tens of ms.
 */
interface SlotArt {
  img: HTMLImageElement;
  px: number;
  color: HTMLCanvasElement;
  grey: HTMLCanvasElement;
}
const slotArtCache = new Map<string, SlotArt>();

function slotPx(services: AppServices, d: number): number {
  return Math.max(8, Math.round(d * services.canvas.dpr));
}

/** Cached art for this sticker at `d` logical px, if it was built from the image loaded now. */
function cachedSlotArt(services: AppServices, def: StickerDef, d: number): SlotArt | undefined {
  const art = slotArtCache.get(def.id);
  if (!art || art.px !== slotPx(services, d)) return undefined;
  return art.img === services.sprites.get(artName(stickerSpriteName(def.id))) ? art : undefined;
}

/** White sticker border + sprite, and a grey faint copy, both at `d` logical px. Undefined while the image is not loaded. */
function buildSlotArt(services: AppServices, def: StickerDef, d: number): SlotArt | undefined {
  const dpr = services.canvas.dpr;
  const name = artName(stickerSpriteName(def.id));
  const img = services.sprites.get(name);
  if (!img) return undefined;
  const px = slotPx(services, d);
  const border = Math.max(3, px * 0.035);
  // Art is at most 80 percent of the slot on its longest side, and shrinks
  // further when its outline plus the white border would cross the dotted
  // circle (wide, tall or corner-filling art). Collected and grey use the
  // same size, so a sticker does not jump when it is earned.
  const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  // Three more px keep the soft, smoothed edge of the scaled art inside the line too.
  const inside = d / 2 * DASH_RADIUS - DASH_WIDTH / 2 - border / dpr - 3;
  const art = Math.max(1, Math.min(d * 0.8, inside / artReach(img)));
  const scaled = services.sprites.scaled(name, art / longest);
  if (!scaled) return undefined;
  const ox = (px - scaled.width) / 2;
  const oy = (px - scaled.height) / 2;

  // White silhouette, stamped around a ring to make the sticker's paper border.
  const white = document.createElement('canvas');
  white.width = scaled.width;
  white.height = scaled.height;
  const wctx = white.getContext('2d');
  const color = document.createElement('canvas');
  color.width = px;
  color.height = px;
  const cctx = color.getContext('2d');
  if (!wctx || !cctx) return undefined;
  wctx.drawImage(scaled, 0, 0);
  wctx.globalCompositeOperation = 'source-in';
  wctx.fillStyle = '#ffffff';
  wctx.fillRect(0, 0, white.width, white.height);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    cctx.drawImage(white, ox + Math.cos(a) * border, oy + Math.sin(a) * border);
  }
  cctx.drawImage(scaled, ox, oy);

  // Grey at 20 percent alpha, computed once from the pixels (no per-frame filter).
  const grey = document.createElement('canvas');
  grey.width = px;
  grey.height = px;
  const gctx = grey.getContext('2d', { willReadFrequently: true });
  if (!gctx) return undefined;
  gctx.drawImage(scaled, ox, oy);
  const data = gctx.getImageData(0, 0, px, px);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = 105;
    p[i] = v;
    p[i + 1] = v;
    p[i + 2] = v + 10;
    p[i + 3] = (p[i + 3] ?? 0) * 0.35;
  }
  gctx.putImageData(data, 0, 0);
  const built: SlotArt = { img, px, color, grey };
  slotArtCache.set(def.id, built);
  return built;
}

/** Album background baked at screen size, kept across visits like the sticker art. */
let album: { canvas: HTMLCanvasElement; w: number; h: number; dpr: number; img: HTMLImageElement | undefined } | undefined;

function albumCurrent(services: AppServices, width: number, height: number): boolean {
  return !!album && album.w === width && album.h === height && album.dpr === services.canvas.dpr && album.img === services.sprites.get(BG);
}

function albumFor(services: AppServices, width: number, height: number): HTMLCanvasElement {
  if (album && albumCurrent(services, width, height)) return album.canvas;
  const canvas = bakeBackground(services, BG, width, height, fallbackAlbum, album?.canvas);
  album = { canvas, w: width, h: height, dpr: services.canvas.dpr, img: services.sprites.get(BG) };
  return canvas;
}

/** Radius of the bottom row of controls, logical px. */
function controlRadius(width: number, uiScale: number): number {
  return Math.max(48, Math.min(64, 52 * uiScale, (width - 48) / 8));
}

function columnCount(width: number): number {
  return width >= 640 ? 4 : width >= 420 ? 3 : 2;
}

/** Height left for the sticker grid above the controls and page dots, logical px. */
function gridHeight(height: number, radius: number): number {
  return height - 2 * radius - 38 - (DOT_BAND - 12);
}

/** Sticker slot diameter for a screen size, logical px. */
function slotDiameter(width: number, height: number, uiScale: number): number {
  const cols = columnCount(width);
  const cellW = (width - 24) / cols;
  const cellH = gridHeight(height, controlRadius(width, uiScale)) / Math.ceil(8 / cols);
  return Math.max(96, Math.min(190 * uiScale, cellW - 12, cellH - 8));
}

/** A book frame starts building sticker art missing from the cache only within this many ms of its start; the book alone draws in well under 1 ms. */
const BUILD_BUDGET_MS = 3;
/** Idle warming starts a piece of work only with at least this many ms left before the next frame. */
const WARM_SLICE_MS = 7;
/** Longest a warm step waits for a long enough idle period, counted from when the wait began, across callbacks. */
const WARM_TIMEOUT = 400;
const WARM_OPTIONS: IdleRequestOptions = { timeout: WARM_TIMEOUT };
let warmServices: AppServices | undefined;
let warmList: readonly StickerDef[] = [];
let warmQueued = false;
/** When the wait for the next warm step began, or -1 when none is waiting. */
let warmWaitFrom = -1;

/**
 * Bakes the album and each sticker's art at the current screen size, one
 * piece per idle period, so opening the book and turning a page only look
 * them up. After a size change the book rebuilds what it shows itself, a
 * few stickers per frame, while this warms the rest again.
 */
function warmStickerBook(services: AppServices, stickers: readonly StickerDef[]): void {
  warmServices = services;
  warmList = stickers;
  queueWarm();
}

function queueWarm(): void {
  if (warmQueued) return;
  warmQueued = true;
  const now = performance.now();
  if (warmWaitFrom < 0) warmWaitFrom = now;
  if (typeof requestIdleCallback === 'function') {
    // The callback's own timeout is what is left of the wait, so it fires by WARM_TIMEOUT after the wait began.
    WARM_OPTIONS.timeout = Math.max(1, WARM_TIMEOUT - (now - warmWaitFrom));
    requestIdleCallback(warmStep, WARM_OPTIONS);
  } else setTimeout(warmStep, 50);
}

/**
 * Runs one warm step when the idle period has WARM_SLICE_MS left. Once the wait has lasted WARM_TIMEOUT (however many
 * short idle periods it took), the step runs regardless, so a busy machine still finishes warming.
 */
function warmStep(deadline?: IdleDeadline): void {
  warmQueued = false;
  const services = warmServices;
  if (!services) return;
  const overdue = !deadline || deadline.didTimeout || performance.now() - warmWaitFrom >= WARM_TIMEOUT;
  if (!overdue && deadline!.timeRemaining() < WARM_SLICE_MS) {
    queueWarm();
    return;
  }
  warmWaitFrom = -1;
  const { width, height } = services.canvas;
  if (!albumCurrent(services, width, height)) {
    albumFor(services, width, height);
    queueWarm();
    return;
  }
  const d = slotDiameter(width, height, services.config.uiScale);
  for (const def of warmList) {
    if (cachedSlotArt(services, def, d) || !services.sprites.get(artName(stickerSpriteName(def.id)))) continue;
    buildSlotArt(services, def, d);
    queueWarm();
    return;
  }
}

export interface StickerBookOptions {
  /** The collection to show. Default STICKERS; dev pages pass longer or shorter lists to check paging. */
  stickers?: readonly StickerDef[];
}

export function createStickerBookScene(services: AppServices, options: StickerBookOptions = {}): Scene {
  const { audio, input, nav } = services;
  const stickers = options.stickers ?? STICKERS;
  const pageCount = Math.max(1, Math.ceil(stickers.length / 8));
  let width = services.canvas.width, height = services.canvas.height;
  let time = 0, page = 0, leaving = false;
  let bag: RewardsBag | undefined;
  let selected: Slot | undefined;
  /**
   * A sticker picked up with the pointer follows it: dragged while the button is held, or carried after a click
   * (`sticky`: a release within CLICK_MS and CLICK_PX of the press) until the next press puts it down there.
   * gx, gy keep the sticker where it was grabbed relative to the pointer.
   */
  const carry = { active: false, sticky: false, downAt: 0, downX: 0, downY: 0, gx: 0, gy: 0 };
  let dirty = true;
  /** Top edge of the bottom control row; a placed sticker stays above it. */
  let controlsTop = 0;
  /** Page dot row: centre spacing and height. */
  let dotStep = DOT_STEP;
  let dotY = 0;
  const slots: Slot[] = stickers.map((def, index) => ({ def, index, ready: false, x: 0, y: 0, r: 48, count: 0, color: undefined, grey: undefined, bounce: -1 }));
  const home = createButton({ x: 0, y: 0, radius: 48, fill: '#fb923c', icon: artName(HOME), onPress: () => { if (!leaving) { leaving = true; playSfx(audio, 'button'); nav.toHub(); } } });
  const sound = createSoundButton(services);
  const previous = createButton({ x: 0, y: 0, radius: 48, fill: '#a78bfa', onPress: () => changePage(-1) });
  const next = createButton({ x: 0, y: 0, radius: 48, fill: '#a78bfa', onPress: () => changePage(1) });
  const slotButtons = slots.map((slot) => createButton({ x: 0, y: 0, radius: 48, fill: '#fff4dc', onPress: () => tap(slot) }));
  const controls = [home, previous, next, sound];
  const keyboard = createKeyboardNavigation(() => keyboardButtons, { anyKey: true, input });
  const layoutInfo: StickerBookLayout = { targets: [], dots: [] };
  let activeSlots: Slot[] = [];
  let activeButtons: Button[] = [];
  let slotHitOrder: Button[] = [];
  let keyboardButtons: Button[] = [];
  function visibleSlots(): Slot[] { return activeSlots; }
  function positions(): Record<string, { x: number; y: number }> {
    const raw = bag?.['positions'];
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, { x: number; y: number }> : {};
  }
  function savePosition(slot: Slot): void {
    if (!bag) return;
    bag['positions'] = { ...positions(), [slot.def.id]: { x: slot.x / width, y: slot.y / height } };
    services.save.save();
  }
  function tap(slot: Slot): void {
    if (slot.count < 1) return;
    if (selected === slot) { selected = undefined; return; }
    selected = slot;
    slot.bounce = 0;
    keyboard.focus(slotButtons[slot.index]);
    playSfx(audio, 'sticker');
  }
  function place(slot: Slot, x: number, y: number): void {
    follow(slot, x, y);
    savePosition(slot);
  }
  /** Move a sticker (and its button) to x, y inside the page, without saving: a carried sticker saves when put down. */
  function follow(slot: Slot, x: number, y: number): void {
    slot.x = Math.max(slot.r + 12, Math.min(width - slot.r - 12, x));
    slot.y = Math.max(slot.r + 12, Math.min(controlsTop - 8 - slot.r, y));
    const b = slotButtons[slot.index]!; b.x = slot.x; b.y = slot.y;
  }
  /** Put a pointer-carried sticker down at the pointer and save where it went. */
  function putDown(x: number, y: number): void {
    const slot = selected;
    carry.active = false; selected = undefined;
    if (slot) place(slot, x + carry.gx, y + carry.gy);
  }
  function changePage(step: number): void {
    // A carried sticker not yet put down goes back to its saved place when the page is laid out again.
    selected = undefined; carry.active = false;
    page = (page + step + pageCount) % pageCount;
    layout(); markVisibleSeen(); keyboard.focus(step > 0 ? next : previous);
    playSfx(audio, 'whoosh');
  }
  function refresh(): void {
    bag = rewardsOrUndefined(services);
    for (const slot of slots) slot.count = bag?.stickers.includes(slot.def.id) ? 1 : 0;
  }
  function markVisibleSeen(): void {
    const unseen = unseenStickers(bag).filter(id => activeSlots.some(slot => slot.def.id === id));
    if (bag && unseen.length) markSeen(services, bag, unseen);
  }
  function layout(): void {
    activeSlots = slots.slice(page * 8, page * 8 + 8);
    const visibleButtons = activeSlots.map((s) => slotButtons[s.index]!);
    activeButtons = [...controls, ...visibleButtons];
    slotHitOrder = visibleButtons.slice().reverse();
    keyboardButtons = [...visibleButtons, ...controls];
    const radius = controlRadius(width, services.config.uiScale);
    // The page dots get their own band under the controls, so no page count can reach a button.
    const y = height - radius - DOT_BAND;
    [home, previous, next, sound].forEach((b, i) => { b.radius = radius; b.x = (i + 0.5) * width / 4; b.y = y; });
    controlsTop = y - radius;
    // Centred on the screen for any page count; the spacing shrinks only if the row would not fit.
    dotStep = Math.min(DOT_STEP, (width - 24) / pageCount);
    dotY = height - DOT_BAND / 2;
    const cols = columnCount(width);
    const rows = Math.ceil(8 / cols);
    const availableHeight = gridHeight(height, radius);
    const cellW = (width - 24) / cols, cellH = availableHeight / rows;
    const d = slotDiameter(width, height, services.config.uiScale);
    const saved = positions();
    for (let i = 0; i < visibleSlots().length; i++) {
      const slot = visibleSlots()[i]!;
      slot.r = d / 2;
      slot.x = 12 + cellW * (i % cols + 0.5);
      slot.y = 12 + cellH * (Math.floor(i / cols) + 0.5);
      const position = saved[slot.def.id];
      if (slot.count && position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        slot.x = Math.max(slot.r + 12, Math.min(width - slot.r - 12, position.x * width));
        slot.y = Math.max(slot.r + 12, Math.min(availableHeight - slot.r, position.y * height));
      }
      const button = slotButtons[slot.index]!; button.x = slot.x; button.y = slot.y; button.radius = slot.r; button.enabled = slot.count > 0;
    }
    if (import.meta.env.DEV) layoutInfo.dots = Array.from({ length: pageCount }, (_, i) => ({ x: dotX(i), y: dotY, r: DOT_R }));
    if (import.meta.env.DEV) layoutInfo.targets = [...controls.map((b, i) => circleTarget(['home', 'previous', 'next', 'sound'][i]!, b)), ...visibleSlots().map((s) => circleTarget(`slot:${s.def.id}`, slotButtons[s.index]!))];
    dirty = true;
  }
  function dotX(i: number): number { return width / 2 + (i - (pageCount - 1) / 2) * dotStep; }
  function bindArt(): void { home.icon = artName(HOME); syncSoundIcon(sound, services); dirty = true; }
  /**
   * Fills in art for the slots on show: cached art at once; art missing from
   * the cache is built only while less than BUILD_BUDGET_MS has passed since
   * `frameStart`, and the rest waits for later frames.
   */
  function fillSlotArt(frameStart: number): void {
    for (const slot of activeSlots) {
      if (slot.ready) continue;
      const d = slot.r * 2;
      let art = cachedSlotArt(services, slot.def, d);
      if (!art) {
        if (performance.now() - frameStart > BUILD_BUDGET_MS) return;
        art = buildSlotArt(services, slot.def, d);
      }
      slot.color = art?.color;
      slot.grey = art?.grey;
      slot.ready = true;
    }
  }
  void loadStickerBookAssets(services, stickers).then(bindArt);
  const scene: Scene & { layout?: StickerBookLayout } = {
    enter() {
      width = services.canvas.width; height = services.canvas.height; time = 0; leaving = false; selected = undefined; carry.active = false;
      refresh(); layout(); markVisibleSeen(); keyboard.focus(keyboardButtons.find((b) => b.enabled) ?? home);
      startMusic(audio, 'sticker-book');
    },
    pause() { stopMusic(audio); },
    resume() { time = 0; startMusic(audio, 'sticker-book'); },
    exit() { stopMusic(audio); },
    resize(w, h) { width = w; height = h; layout(); warmStickerBook(services, stickers); },
    hoverAt(x: number, y: number): CursorHover {
      // Same order and guards as pointerdown: controls first (they report their own hover), then a held sticker,
      // then an earned sticker on this page, which a press picks up. Slots not earned are disabled buttons.
      if (leaving || time < 0.4) return null;
      for (let i = 0; i < controls.length; i++) { const b = controls[i]!; if (b.enabled && b.visible && b.contains(x, y)) return null; }
      if (selected) return 'carry';
      for (let i = 0; i < slotHitOrder.length; i++) { const b = slotHitOrder[i]!; if (b.enabled && b.visible && b.contains(x, y)) return 'grab'; }
      return null;
    },
    update(dt) {
      time += dt;
      for (const b of activeButtons) b.update(dt, input.pointer.inside ? input.pointer.x : -9999, input.pointer.inside ? input.pointer.y : -9999);
      syncSoundIcon(sound, services);
      for (const slot of slots) if (slot.bounce >= 0) { slot.bounce += dt; if (slot.bounce >= 3) slot.bounce = -1; }
    },
    render({ ctx }: SceneContext) {
      const frameStart = performance.now();
      ctx.drawImage(albumFor(services, width, height), 0, 0, width, height);
      if (dirty) { for (const slot of visibleSlots()) slot.ready = false; dirty = false; }
      fillSlotArt(frameStart);
      // A sticker carried by the pointer draws last, on top of the others, with its picked-up ring.
      const carried = carry.active ? selected : undefined;
      for (const slot of visibleSlots()) if (slot !== carried) drawSlot(ctx, slot);
      if (carried) drawSlot(ctx, carried);
      for (const b of controls) b.render(ctx, services.sprites);
      drawPageArrow(ctx, previous, -1); drawPageArrow(ctx, next, 1);
      for (let i = 0; i < pageCount; i++) chunkyCircle(ctx, dotX(i), dotY, DOT_R, i === page ? '#ffd23f' : '#d8c9ef', OUTLINE, 2);
      drawEnterFade(ctx, width, height, time);
    },
    handleInput(event: SceneInputEvent) {
      if (leaving || time < 0.4) return;
      if (event.type === 'pointerdown') {
        const { x, y } = event.info;
        if (dispatchDown(controls, x, y)) return;
        if (selected) {
          // A sticker carried after a click goes down where it is drawn; one picked up with a key goes to the press.
          if (carry.active) putDown(x, y); else { place(selected, x, y); selected = undefined; }
          return;
        }
        dispatchDown(slotHitOrder, x, y);
        if (selected) {
          const s: Slot = selected;
          carry.active = true; carry.sticky = false; carry.downAt = performance.now(); carry.downX = x; carry.downY = y; carry.gx = s.x - x; carry.gy = s.y - y;
        }
      } else if (event.type === 'pointermove') {
        if (carry.active && selected) follow(selected, event.info.x + carry.gx, event.info.y + carry.gy);
      } else if (event.type === 'pointerup') {
        dispatchUp(activeButtons, event.info.x, event.info.y);
        if (!carry.active || carry.sticky) return;
        const { x, y } = event.info;
        // A click: the sticker follows the pointer until the next press. Otherwise it was dragged and goes down here.
        if (performance.now() - carry.downAt < CLICK_MS && Math.hypot(x - carry.downX, y - carry.downY) < CLICK_PX) carry.sticky = true;
        else putDown(x, y);
      } else if (event.type === 'keydown' && !event.info.repeat) {
        const key = event.info.key;
        // A key takes over a sticker the pointer carries: it is saved where it is and the keys move or put it down.
        if (carry.active && selected) { carry.active = false; place(selected, selected.x, selected.y); }
        if (selected) {
          // Arrows move the picked-up sticker; any other key puts it down, and Tab then moves focus too.
          const vector = NUDGE[key];
          if (vector) { place(selected, selected.x + vector[0], selected.y + vector[1]); return; }
          selected = undefined;
          if (key !== 'Tab') return;
        }
        // Reading order stays reachable even when the child stacks stickers together.
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          const step = key === 'ArrowRight' ? 1 : -1;
          const from = keyboardButtons.indexOf(keyboard.selected as Button);
          for (let offset = 1; offset <= keyboardButtons.length; offset++) {
            const button = keyboardButtons[(from + step * offset + keyboardButtons.length * 2) % keyboardButtons.length]!;
            if (button.enabled && button.visible) { keyboard.focus(button); break; }
          }
          return;
        }
        keyboard.key(key);
      } else if (event.type === 'keyup') keyboard.keyUp(event.info.key);
    },
  };
  function drawSlot(ctx: CanvasRenderingContext2D, slot: Slot): void {
    const b = slotButtons[slot.index]!;
    const owned = slot.count > 0;
    ctx.save(); ctx.translate(slot.x, slot.y);
    if (slot.bounce >= 0 && owned) {
      const amount = Math.sin(Math.PI * slot.bounce / 3);
      ctx.rotate(Math.sin(slot.bounce * 6) * 0.12 * amount);
      const scale = 1 + Math.sin(slot.bounce * 4) * 0.1 * amount; ctx.scale(scale, scale);
    }
    if (owned && (selected === slot || b.focused || b.hovered)) {
      chunkyCircle(ctx, 0, 0, slot.r, selected === slot ? '#ffe48c' : '#fff4dc', OUTLINE, 4);
    }
    if (!owned) {
      ctx.setLineDash(DASH); ctx.beginPath(); ctx.arc(0, 0, slot.r * DASH_RADIUS, 0, Math.PI * 2); ctx.strokeStyle = '#9283a5'; ctx.lineWidth = DASH_WIDTH; ctx.stroke(); ctx.setLineDash(SOLID);
    }
    const image = owned ? slot.color : slot.grey;
    if (image) ctx.drawImage(image, -slot.r, -slot.r, slot.r * 2, slot.r * 2);
    ctx.restore();
  }
  if (import.meta.env.DEV) scene.layout = layoutInfo;
  return scene;
}
