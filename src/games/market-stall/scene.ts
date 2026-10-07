/**
 * Market Stall: the child is the cashier of a harbour bread stall. Animal customers come to the counter one at a time
 * with an item and a price tag and pay more than the price into the wooden dish. The board is a count-up track from
 * the price tag to the dish. The child counts the change back up from the price, moving coins or bills from the till to
 * the customer's open paw while the board's marker climbs along the track to the payment. Customers always leave happily; nothing is ever wrong.
 */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import type { CursorHover, Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, DISPLAY_FONT, drawSprite, OUTLINE } from '../../ui/draw';
import { drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, onBook, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { approach, clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp } from '../../ui/tween';
import { bakeShadow, createFx, INK_COUNT, PENNY_INKS, SILVER_INKS } from './fx';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { bagDefaults, cashierStart, CUSTOMER_COUNT, defaultData, GAME_ID, GOODS_COUNT, sanitizeStallData, TOP_STEP, type PendingRound, type StallData } from './data';
import {
  accepts, applyLearning, applyMotor, B1, B5, BILL_VALUE, COIN_MM, COIN_NAMES, COIN_VALUE, contentOf, CUP_STEPS, customerStep, DEMO_PLAN_STEPS, demoPlan, DIME, DIME_MM,
  goalCustomer, K_DOLLAR, K_FIVE, MIN_BILL_PX, MIN_DIME_PX, nextPiece, NICKEL, paid, PENNY, planCustomer, QUARTER, recordCustomer, ROUND_STARS, roundSize, taughtCustomer, TIERS,
  valueOf, type CustomerPlan, type TierParams,
} from './rules';
import { amountClip, costsClip, itemClips, OPENING_GAP, pickItemClip, customerSpeaking, payClip, prioritizeVoice, queueVoice, QUESTION_CLIP, recordVoice, stopVoice, TOTAL_GAP, updateVoice, voiceBusy } from './voice';

export { GAME_ID };
const ART = 'market-stall/';
const BG = `${ART}harbour-stall`, BOARD = `${ART}board`, TAG = `${ART}tag`, DISH = `${ART}dish`, TRAY = `${ART}till-tray`;
const WELL = `${ART}till-well`, SLOT = `${ART}till-slot`, HAND = `${ART}helper-hand`;
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
const BILLS = [1, 5, 10, 20].map(v => `${ART}bill-${v}`);
const COIN_FACES = COIN_NAMES.map(c => [`${ART}coin-${c}-heads`, `${ART}coin-${c}-tails`] as const);
/** Coin faces are 320x320 (byte copies of Piggy Parade's, so the hub shows one set of coins). */
const COIN_PX = 320;

/**
 * The six customers, measured from their sprites (round 2): the waiting pose's pixel size, the happy pose's, and the
 * centre of the held-out paw as a fraction of the waiting sprite (after the heron's mirror). Waiting poses are 760 px tall.
 */
const CUSTOMERS = [
  { name: 'heron', w: 400, hw: 432, hh: 758, paw: [0.875, 0.545], mirror: true },
  { name: 'otter', w: 492, hw: 449, hh: 758, paw: [0.898, 0.432], mirror: false },
  { name: 'pelican', w: 578, hw: 620, hh: 753, paw: [0.913, 0.645], mirror: false },
  { name: 'puffin', w: 618, hw: 610, hh: 753, paw: [0.919, 0.51], mirror: false },
  { name: 'seal', w: 508, hw: 549, hh: 759, paw: [0.902, 0.504], mirror: false },
  { name: 'bear', w: 583, hw: 558, hh: 758, paw: [0.916, 0.51], mirror: false },
] as const;
const CUST_NAMES = CUSTOMERS.map(c => [`${ART}${c.name}-wait`, `${ART}${c.name}-happy`] as const);
const GOODS = [
  { name: 'loaf-round', w: 320, h: 277 }, { name: 'loaf-long', w: 302, h: 320 }, { name: 'loaf-braid', w: 320, h: 288 }, { name: 'pretzel', w: 320, h: 286 },
  { name: 'fish-biscuit', w: 320, h: 243 }, { name: 'pie', w: 320, h: 254 }, { name: 'honey', w: 308, h: 320 }, { name: 'cake', w: 320, h: 313 },
] as const;
const GOOD_NAMES = GOODS.map(g => `${ART}goods-${g.name}`);
/**
 * Harbour overlays (docs/games/market-stall/overlays.json): where each sits on the 1920x1280 background, in its pixels.
 * Each draws at the background's own scale (1.0 at 1920x1080) and is revealed by wipes, fades and drops, never by
 * growing. houses-paint's straight edges only line up composited at exactly this position.
 */
const HARBOUR = [
  { name: `${ART}harbour-sails-big`, x: 247, y: 259, w: 224, h: 235 },
  { name: `${ART}harbour-sail-small`, x: 509, y: 368, w: 98, h: 128 },
  { name: `${ART}harbour-lamp`, x: 1519, y: 270, w: 157, h: 85 },
  { name: `${ART}harbour-paint`, x: 1630, y: 366, w: 198, h: 108 },
  { name: `${ART}bunting-left`, x: 96, y: 84, w: 870, h: 178 },
  { name: `${ART}bunting-right`, x: 958, y: 84, w: 872, h: 179 },
] as const;
const OV_SAILS = 0, OV_SMALL = 1, OV_LAMP = 2, OV_PAINT = 3, OV_BUNTING = 4;
/** What the day's takings buy for the harbour, one per round in turn (nothing is kept: it is gone next round). */
const BUY_SAILS = 0, BUY_LAMP = 1, BUY_PAINT = 2, BUY_NAMES = ['sails', 'lamp', 'paint'] as const;

// Measured from the art (round 1 and round 2), as fractions of each image.
/** harbour-stall.webp is 1920x1280; the counter's back edge is its row 767. */
const BG_W = 1920, BG_H = 1280, BG_COUNTER = 767;
/** board.webp (531x560): the cream panel inside the frame. The frame is baked as nine parts at any size. */
const BOARD_PX = [531, 560] as const, BOARD_IN = [0.11, 0.89, 0.18, 0.89] as const;
/** tag.webp (320x236): its writing area below the hole, and the hole the tag swings from. */
const TAG_PX = [320, 236] as const, TAG_IN = [0.06, 0.94, 0.32, 0.94] as const, TAG_HOLE = 0.12;
/** dish.webp (640x349): its floor. */
const DISH_PX = [640, 349] as const, DISH_FLOOR_Y = 0.45;
/** till-tray.webp (1428x586): rim width, baked as nine parts. till-well.webp is 320x318, till-slot.webp 420x227 (1.85:1). */
const TRAY_PX = [1428, 586] as const, TRAY_RIM = 0.08, WELL_PX = 320, SLOT_PX = [420, 227] as const;
/** Bills are 512x256 with a plain area for the numeral (0.06 to 0.46 of the width); the numeral centres at 0.27. */
const BILL_PX = 512, BILL_NUM_X = 0.27, BILL_NUM_H = 0.34;
/**
 * Coin value tags (money labels, round RD1): a cream pill with a deep-ink edge under each coin carrying "1¢", "5¢",
 * "10¢" or "25¢". Its font is TAG_FONT of the coin's diameter (the digits' ink then stands 0.36 of it, measured); the pill
 * is TAG_PILL_H of the font size tall and centred on the coin's lower edge, so it hangs TAG_HANG of the diameter below.
 */
const TAG_FONT = 0.46, TAG_PILL_H = 0.96, TAG_HANG = (TAG_FONT * TAG_PILL_H) / 2;
/** Value tags queued per frame (they draw after every coin of the layer). */
const TAGS_MAX = 160;
/** An emptied well (its piece carried): the coin's front and its tag at these strengths, a bill at EMPTY_BILL_ALPHA. */
const EMPTY_COIN_ALPHA = 0.18, EMPTY_TAG_ALPHA = 0.35, EMPTY_BILL_ALPHA = 0.3;
/** In a till well a coin sits this far (of its diameter) above the well's centre, so the coin and its tag are centred. */
const WELL_LIFT = 0.1;
/** Layout units (u = 1 at 1366x768): board, customer, item, tag, dish. */
const BOARD_W = 320, CUST_H = 520, CUST_CLIP = 0.68, ITEM_W = 170, TAG_W = 150, TAG_DX = 70, TAG_DY = 60, DISH_W = 440;
/** The dish never draws wider than its own pixels (640 CSS px at pixel ratio 1). */
const DISH_MAX = 640;
/** Till: well margin around the largest coin, tray padding and gaps, in layout units. */
const WELL_PAD = 28, TILL_PAD = 24, TILL_GAP = 12;
/** Cups on the closing slate never draw under this many CSS px. */
const MIN_CUP = 12;
/**
 * The board's count-up track (round MB1): the price tag at its left end and the dish at its right end, each at least
 * END_ICON_MIN CSS px tall (END_ICON_U layout units); at steps 1 to 3 one dot per cent of change on the track, never
 * under MIN_DOT CSS px, each DOT_FILL of its pitch. The board widens for the dots in steps of DOT_BUCKETS.
 */
const END_ICON_MIN = 40, END_ICON_U = 44, MIN_DOT = 12, DOT_FILL = 0.8, DOT_BUCKETS = [10, 15, 20] as const;
const U_MAX = 1.405;
/** Zone shifts tried in order: centred, then up or left, then down or right. */
const SHIFT3 = [0, -1, 1] as const;
const IDLE_WAIT_MS = 500;
const IDLE_OPTIONS: IdleRequestOptions = { timeout: IDLE_WAIT_MS };
/**
 * The paw draws up to this many pieces of change (95 pennies at step 5 fit); beyond it, at the dollars-and-cents steps,
 * the oldest pieces' value moves onto the settled column's card, so the paw always shows the change given.
 */
const MAX_DISH = 16, MAX_PAW = 100, MAX_CUPS = 100, POOL = 24, PARTICLES = 240, MAX_SALES = 8;
/** The paw's newest pieces fan at full size; older ones settle into a column beside them under a card with their value. */
const PAW_FAN = 4;
/**
 * Closing the till at the round's end: the till rises and the slate drops in, each sale's tag flies out and its
 * amount pours into the slate's cups (dollars left, cents right; 100 cent cups trade for one dollar cup), the total
 * pops, then the takings fly to the harbour and something there changes. A press plays the rest four times faster.
 */
const CLOSE_OPEN = 0.45, CLOSE_SALE = 0.55, CLOSE_TAG = 0.25, CLOSE_HOLD = 0.8, CLOSE_AWAY = 0.4, CLOSE_STREAM = 0.5, CLOSE_REVEAL = 0.9, CLOSE_END = 0.5;
/** Served customers wait at the back of the stall at this size, cheering; at most this many show. */
const CROWD_K = 0.45, CROWD_MAX = 4;

const CELEBRATION_SECONDS = 4.6, STAR_START = 0.5;
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350, KEY_GAP_MS = 150, IDLE_SECONDS = 6, IDLE_SOON = 4, IDLE_REPEAT = 7;
/** A pointer choice is deliberate this long after the previous press; a key choice this long after the arrow that chose it. */
const DELIBERATE_MS = 700, KEY_DELIBERATE_MS = 400;
/** Customer timing: walk in, payment pieces dropping one after another, a bill's flutter, the item's glide, walk out. */
const ENTER_SECONDS = 0.6, DROP_FLY = 0.35, DROP_STAGGER = 0.12, BILL_FLUTTER = 0.5, GLIDE_SECONDS = 0.4, LEAVE_SECONDS = 0.8, PAID_PULSE = 0.35;
/** A pouring piece takes about this long whatever its value; one cup at most this far apart. */
const POUR_PIECE = 0.3, POUR_GAP_MAX = 0.07, DOLLAR_POUR = 1.2;
/** Step 9: the two tags and cup groups slide together (longer the first time, when the hand shows it). */
const MERGE_SECONDS = 1.3, MERGE_DEMO = 2.1, MERGE_TAGS = 0.45;
/** A piece's trip to the paw; a piece that is too much shows its dots, then hops back. */
const TO_PAW = 0.3, BOUNCE_HOLD = 0.9, BOUNCE_HOP = 0.5, RETURN_SECONDS = 0.4;
/** Helper hand: rise to the piece, press, carry to the paw, fade; a tap sequence's segments. */
const HAND_PRESS_AT = 0.5, HAND_CARRY_AT = 0.7, HAND_DROP_AT = 1.4, HAND_FADE = 0.5, SEG = 0.9;
/** The introduction's goal: three pennies hop into the otter's paw this far apart. */
const GOAL_START = 0.5, GOAL_GAP = 0.5;
const FANFARE: SfxOptions = { variant: 'D' };
const INK = '#1d3461', RED = '#c8452a', HIGHLIGHT = '#fff6a3', CREAM = '#fbf3de', HOVER = '#fff8b2';

type Phase = 'play' | 'closing' | 'celebration' | 'choice' | 'sticker' | 'rest';
/** A customer's moments, in order (CHANGE waits for the child). */
const ENTER = 0, DROP = 1, POUR = 2, CHANGE = 3, PAID = 4, GLIDE = 5, LEAVE = 6, MERGE = 7;
const MOMENTS = ['enter', 'drop', 'pour', 'change', 'paid', 'glide', 'leave', 'merge'] as const;
/** Flights: a payment piece into the dish; change to the paw; too much (to the paw, dots, back); back from a miss. */
const F_DROP = 0, F_PAW = 1, F_BOUNCE = 2, F_RETURN = 3;
const HAND_DEMO = 1, HAND_TAP = 2, HAND_POINTS = 3, HAND_HINT = 4;
/** Till wells and slots (at most five: four coins and the $1 bill); hand targets are wells 0..4, then these. */
const MAX_WELLS = 5;
const TG_PAW = 12, TG_TAG = 15, TG_TAG2 = 16;
/**
 * Cup and dot looks: a cream socket (a track dot not given yet), mustard (a cent cup at closing), the till count's dollar
 * cup (deep ink with a mustard ring, drawn larger), orange-red (a track dot given, standing out on the mustard lit track).
 */
const CUP_UNLIT = 0, CUP_PAID = 1, CUP_DOLLAR = 2, CUP_GIVEN = 3;

interface Flight {
  active: boolean; mode: number; kind: number; idx: number; demo: boolean;
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; giggles: number;
}
interface Box { x: number; y: number; w: number; h: number }
interface Strip { c: HTMLCanvasElement; x: Float32Array; w: Float32Array; pad: number; px: number }
export interface MarketStallStats {
  readonly step: number; readonly tier: Tier; readonly rounds: number; readonly phase: Phase;
  readonly moment: string; readonly intro: boolean; readonly introStage: number; readonly customer: number; readonly customers: number;
  readonly hits: number; readonly misses: number; readonly bounces: number; readonly stars: number;
  readonly stickerId: string; readonly choiceIds: readonly string[]; readonly hand: number; readonly carrying: boolean;
  readonly focus: string; readonly counted: readonly number[]; readonly learn: readonly number[]; readonly demos: number;
  /** The current task's numbers: price, payment (what is in the dish so far), owed change, change given so far and counted on the board. */
  readonly task: {
    content: number; countsFor: number; dollars: boolean; price: number; parts: number[]; payment: number; planned: number; owed: number; given: number; counter: number;
    /** Pieces in the paw, how many of them sit in the settled column, and the value its card shows. */
    pawPieces: number; pawSettled: number; pawSettledValue: number;
    till: string[]; pay: string[]; merged: boolean;
  } | null;
  /**
   * What the board's count-up track shows now, as written: the price at the tag end, the payment poured so far at the
   * dish end, the marker's numeral ('' before change counting) with the marker's place (fraction of the change given,
   * -1 when hidden; its x and the track's ends in CSS px), the dots shown and lit (steps 1 to 3 only), the end icons'
   * boxes and the dot and numeral sizes.
   */
  readonly board: {
    price: string; payment: string; counter: string; dots: number; dotsLit: number; marker: number; markerX: number; trackX0: number; trackX1: number; trackY: number;
    tagIcon: Box; dishIcon: Box; dotSize: number; numPx: number; endPx: number;
  } | null;
  readonly coins: readonly { kind: string; face: 'heads' | 'tails'; x: number; y: number; d: number; where: string; tag: string }[];
  readonly bills: readonly { value: number; x: number; y: number; w: number; h: number; where: string }[];
  /** Hit rectangles in CSS px (the paw's also gives the snap distance a release may be outside it). */
  readonly targets: readonly { kind: string; x: number; y: number; w: number; h: number; snap?: number }[];
  readonly layout: Record<string, Box | boolean | number>;
  /**
   * The round-end till count: each sale's price (in its own unit), the exact total in whole dollars and cents (cents
   * under 100), and what the slate's cups show right now; null outside the round end.
   */
  readonly closing: { sales: { price: number; dollars: boolean }[]; dollars: number; cents: number; shownDollars: number; shownCents: number; t: number; speed: number } | null;
  /** The harbour this round: what the takings bought ('' until the round end), its reveal (0 to 1), bunting strings up, customers cheering at the back. */
  readonly harbour: { buy: string; reveal: number; bunting: number; crowd: number };
  /** A clicked piece is following the pointer with no button held. */
  readonly carrySticky: boolean;
  readonly workMean: number; readonly workMax: number;
  /**
   * Debug: lay out sample customers of every step, tier and customer at each window size (default 1366x768 and
   * 1920x1080) without drawing, and list every fit failure (zones overlapping, outside the window or under 96 px; the
   * dish over the customer or a price tag; a tag outside the window). With `rects`, also one line per layout listing
   * every laid-out box, well and size, to compare two builds' layouts exactly.
   */
  layoutCheck(sizes?: readonly (readonly [number, number])[], perStep?: number, rects?: boolean): { layouts: number; failures: string[]; slowestMs: number; rects?: string[] };
  /** Largest drawn scale of each image drawn this layout (drawn px / image px at pixel ratio 1). */
  scales(): Record<string, number>;
  resetWork(): void;
}
export interface MarketStallScene extends Scene { readonly stats: MarketStallStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);
const spriteName = (path: string): string => path.replace(/\.\w+$/, '');
const box = (): Box => ({ x: 0, y: 0, w: 0, h: 0 });
const setBox = (b: Box, x: number, y: number, w: number, h: number): Box => { b.x = x; b.y = y; b.w = w; b.h = h; return b; };
const meets = (a: Box, b: Box, m = 2): boolean => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const inside = (b: Box, x: number, y: number, pad = 0): boolean => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

function artList(): { name: string; path: string }[] {
  const paths = [BG, BOARD, TAG, DISH, TRAY, WELL, SLOT, HAND, ...BILLS, ...GOOD_NAMES, ...HARBOUR.map(o => o.name)].map(p => `${p}.webp`);
  paths.push(`${BUTTON_PLAY}.webp`, `${BUTTON_HOME}.webp`, BOOK_ICON_PATH);
  for (const pair of CUST_NAMES) for (const n of pair) paths.push(`${n}.webp`);
  for (const pair of COIN_FACES) for (const n of pair) paths.push(`${n}.webp`);
  return [...paths.map(path => ({ name: spriteName(path), path })), ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path }))];
}
const OWN_ART = artList().map(a => a.name).filter(name => name !== BG);
export async function loadMarketStallArt(services: AppServices): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(artList().map(({ name, path }) => services.sprites.load(name, services.art(path)).catch(() => { missing.push(path); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}

/** A CPU canvas (see pitfalls: bakes on GPU canvases stall the first frame that uses their draw modes). */
function cpuCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
}
/** A soft warm halo, `size` across. */
function bakeGlow(size: number, ratio: number, strong: boolean): HTMLCanvasElement {
  const { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(c.width / size, c.width / size);
  const r = size / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, strong ? 'rgba(255, 250, 210, 1)' : 'rgba(255, 245, 200, 0.85)');
  grad.addColorStop(0.45, strong ? 'rgba(255, 216, 90, 0.85)' : 'rgba(255, 220, 120, 0.55)');
  grad.addColorStop(1, 'rgba(255, 200, 80, 0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** One counting dot, `d` across: solid deep ink with a thin cream ring, so it reads on any coin, bill or card. */
function bakeDot(d: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpuCanvas(d * ratio, d * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  g.beginPath(); g.arc(d / 2, d / 2, d / 2 - 1, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill();
  g.beginPath(); g.arc(d / 2, d / 2, d / 2 - Math.max(1.5, d * 0.12), 0, Math.PI * 2); g.fillStyle = INK; g.fill();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/**
 * One cup or dot, `d` across, in the linocut inks: a cream socket (unlit), mustard (a closing cent cup), orange-red (a given dot), or the till count's dollar cup (deep ink
 * with a mustard ring).
 */
function bakeCup(d: number, ratio: number, look: number): HTMLCanvasElement {
  const size = d + 2, { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const lw = Math.max(1.5, d * 0.13), r = d / 2 - lw / 2;
  g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  g.fillStyle = look === CUP_PAID ? '#efb531' : look === CUP_GIVEN ? RED : look === CUP_DOLLAR ? INK : CREAM;
  g.fill();
  g.lineWidth = look === CUP_DOLLAR ? lw * 1.4 : lw;
  g.strokeStyle = look === CUP_UNLIT ? 'rgba(29, 52, 97, 0.7)' : look === CUP_DOLLAR ? '#efb531' : INK; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** The board's track, len x t: a rounded bar with a deep-ink edge, pale (unlit) or mustard (lit up to the marker). */
function bakeTrack(len: number, t: number, ratio: number, lit: boolean): HTMLCanvasElement {
  const { c, g } = cpuCanvas(len * ratio, t * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const lw = Math.max(1.5, t * 0.18);
  g.beginPath(); g.roundRect(lw / 2, lw / 2, len - lw, t - lw, (t - lw) / 2);
  g.fillStyle = lit ? '#efb531' : '#e9dcbc'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** The board's marker, h tall: an orange-red triangle pointing up at the track, with a deep-ink edge over a cream one. */
function bakeMarker(h: number, ratio: number): HTMLCanvasElement {
  const w = h * 1.25, pad = Math.max(3, h * 0.2), { c, g } = cpuCanvas((w + pad * 2) * ratio, (h + pad * 2) * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  g.beginPath(); g.moveTo(pad + w / 2, pad); g.lineTo(pad + w, pad + h); g.lineTo(pad, pad + h); g.closePath();
  g.lineJoin = 'round'; g.lineWidth = pad * 1.6; g.strokeStyle = CREAM; g.stroke();
  g.fillStyle = RED; g.fill(); g.lineWidth = Math.max(1.5, h * 0.12); g.strokeStyle = INK; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** Glyphs "0" to "9", "$", "¢" and the decimal point (for "$1.25"), baked once per size and colour with the bundled font. */
const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '$', '¢', '.'] as const, G_DOLLAR = 10, G_CENT = 11, G_DOT = 12;
/** A coin's value tag for a coin d across: font size, pill width and height (CSS px). The same numbers lay out and bake it. */
function coinTagSize(kind: number, d: number): { px: number; w: number; h: number } {
  const px = Math.round(d * TAG_FONT), digits = COIN_VALUE[kind]! >= 10 ? 2 : 1;
  return { px, w: Math.round(px * (0.58 * digits + 0.56 + 0.5)), h: Math.round(px * TAG_PILL_H) };
}
/**
 * One coin's value tag ("10¢") baked once per size: a cream rounded pill with a deep-ink edge and the value in deep
 * ink, in the bundled font. Drawn centred on the coin's lower edge, moving and scaling with the coin.
 */
function bakeCoinTag(kind: number, d: number, ratio: number): HTMLCanvasElement {
  const t = coinTagSize(kind, d), { c, g } = cpuCanvas(t.w * ratio, t.h * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const lw = Math.max(2, t.h * 0.07);
  g.beginPath(); g.roundRect(lw / 2, lw / 2, t.w - lw, t.h - lw, (t.h - lw) / 2);
  g.fillStyle = CREAM; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  const text = `${COIN_VALUE[kind]}¢`;
  g.font = `700 ${t.px}px ${DISPLAY_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  // Squeeze only if the measured text would touch the pill's ends (the size formula leaves room for Andika's digits).
  const tw = g.measureText(text).width, room = t.w - t.h * 0.55;
  if (tw > room) { g.translate(t.w / 2, 0); g.scale(room / tw, 1); g.fillText(text, 0, t.h / 2 + t.px * 0.04); }
  else g.fillText(text, t.w / 2, t.h / 2 + t.px * 0.04);
  g.getImageData(0, 0, 1, 1);
  return c;
}
/**
 * An emptied place's outline, baked once per size: a dashed ring a little wider than a coin `w` across (`bill` false),
 * cream so it shows in the dark well, or a dashed deep-ink rounded rectangle round a bill w x h on the pale slot, each
 * over a faint fill (as Coin Count Vault's empty places).
 */
function bakeEmpty(w: number, h: number, ratio: number, bill: boolean): HTMLCanvasElement {
  const pad = 6, { c, g } = cpuCanvas((w * 1.06 + pad) * ratio, (h * 1.06 + pad) * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const cw = w * 1.06 + pad, ch = h * 1.06 + pad, lw = Math.max(2.5, Math.min(w, h) * 0.05), dash = Math.min(w, h) * 0.11;
  g.beginPath();
  if (bill) g.roundRect(pad / 2, pad / 2, cw - pad, ch - pad, Math.min(w, h) * 0.14);
  else g.arc(cw / 2, ch / 2, (cw - pad) / 2 - lw / 2, 0, Math.PI * 2);
  g.fillStyle = bill ? 'rgba(74, 47, 28, 0.16)' : 'rgba(251, 243, 222, 0.14)'; g.fill();
  g.setLineDash([dash, dash * 0.75]); g.lineWidth = lw; g.strokeStyle = bill ? INK : CREAM; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
function bakeStrip(px: number, ratio: number, fill: string): Strip {
  const probe = cpuCanvas(1, 1).g, font = `700 ${Math.round(px)}px ${DISPLAY_FONT}`, x = new Float32Array(GLYPHS.length), w = new Float32Array(GLYPHS.length);
  if (probe) probe.font = font;
  const pad = Math.ceil(px * 0.12);
  let total = 0;
  for (let i = 0; i < GLYPHS.length; i++) {
    const m = probe ? probe.measureText(GLYPHS[i]!).width : px * 0.6;
    x[i] = total + pad; w[i] = m; total += m + pad * 2;
  }
  const h = Math.ceil(px * 1.35), { c, g } = cpuCanvas(total * ratio, h * ratio);
  if (g) {
    g.scale(ratio, ratio);
    g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(3, px * 0.14); g.strokeStyle = CREAM; g.fillStyle = fill;
    for (let i = 0; i < GLYPHS.length; i++) { g.strokeText(GLYPHS[i]!, x[i]!, h / 2 + px * 0.04); g.fillText(GLYPHS[i]!, x[i]!, h / 2 + px * 0.04); }
    g.getImageData(0, 0, 1, 1);
  }
  return { c, x, w, pad, px };
}
/**
 * Nine-part bake of a framed sprite at w x h: corners at one scale (at most 1.0), edges and the middle repeated along
 * their length in mirrored copies, each copy drawn at that scale or smaller, so nothing draws above its own pixels.
 */
function bakeNine(img: HTMLImageElement, w: number, h: number, ratio: number, l: number, r: number, t: number, b: number, k: number): HTMLCanvasElement {
  const { c, g } = cpuCanvas(w * ratio, h * ratio); if (!g) return c;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const W = w * ratio, H = h * ratio, K = k * ratio, dl = l * K, dr = r * K, dt = t * K, db = b * K;
  const mw = iw - l - r, mh = ih - t - b, spanX = W - dl - dr, spanY = H - dt - db;
  const nx = Math.max(1, Math.ceil(spanX / (mw * K))), ny = Math.max(1, Math.ceil(spanY / (mh * K))), tw = spanX / nx, th = spanY / ny;
  // One source part to a destination rectangle, mirrored (about its own centre) when asked.
  const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, fx: boolean, fy: boolean): void => {
    if (!fx && !fy) { g.drawImage(img, sx, sy, sw, sh, dx, dy, dw + 0.5, dh + 0.5); return; }
    g.save(); g.translate(dx + (fx ? dw : 0), dy + (fy ? dh : 0)); g.scale(fx ? -1 : 1, fy ? -1 : 1);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, dw + 0.5, dh + 0.5); g.restore();
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) part(l, t, mw, mh, dl + i * tw, dt + j * th, tw, th, i % 2 === 1, j % 2 === 1);
  for (let i = 0; i < nx; i++) { part(l, 0, mw, t, dl + i * tw, 0, tw, dt, i % 2 === 1, false); part(l, ih - b, mw, b, dl + i * tw, H - db, tw, db, i % 2 === 1, false); }
  for (let j = 0; j < ny; j++) { part(0, t, l, mh, 0, dt + j * th, dl, th, false, j % 2 === 1); part(iw - r, t, r, mh, W - dr, dt + j * th, dr, th, false, j % 2 === 1); }
  part(0, 0, l, t, 0, 0, dl, dt, false, false); part(iw - r, 0, r, t, W - dr, 0, dr, dt, false, false);
  part(0, ih - b, l, b, 0, H - db, dl, db, false, false); part(iw - r, ih - b, r, b, W - dr, H - db, dr, db, false, false);
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** Board frame in board.webp pixels (left, right, top, bottom) and its corner scale for a board w wide, h tall. */
const BOARD_FRAME = [BOARD_IN[0] * BOARD_PX[0], (1 - BOARD_IN[1]) * BOARD_PX[0], BOARD_IN[2] * BOARD_PX[1], (1 - BOARD_IN[3]) * BOARD_PX[1]] as const;
const boardK = (w: number, h: number): number => Math.min(1, w / BOARD_PX[0], (h * 0.45) / BOARD_FRAME[2]);
/** Till tray rim in till-tray.webp pixels, and its corner scale for a tray h tall (the rim about an eighth of the height). */
const TRAY_EDGE = TRAY_RIM * TRAY_PX[1] * 1.6;
const trayK = (h: number): number => Math.min(1, (h * 0.13) / TRAY_EDGE);
/** A bill at w x h with its big code-drawn numeral ("$1", "$5", "$10", "$20") in the plain area left of the animal. */
function bakeBill(img: HTMLImageElement, value: number, w: number, h: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpuCanvas(w * ratio, h * ratio); if (!g) return c;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  g.scale(ratio, ratio);
  const px = Math.round(h * BILL_NUM_H), small = Math.round(px * 0.72), digits = String(value);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
  g.font = `700 ${small}px ${DISPLAY_FONT}`; const dw = g.measureText('$').width;
  g.font = `700 ${px}px ${DISPLAY_FONT}`; const nw = g.measureText(digits).width;
  const x0 = w * BILL_NUM_X - (dw + nw) / 2, cy = h * 0.5 + px * 0.04;
  g.lineWidth = Math.max(3, px * 0.12); g.strokeStyle = CREAM; g.fillStyle = INK;
  g.font = `700 ${small}px ${DISPLAY_FONT}`; g.strokeText('$', x0, cy - px * 0.12); g.fillText('$', x0, cy - px * 0.12);
  g.font = `700 ${px}px ${DISPLAY_FONT}`; g.strokeText(digits, x0 + dw, cy); g.fillText(digits, x0 + dw, cy);
  g.getImageData(0, 0, 1, 1);
  return c;
}

let debugApplied = false;

export function createMarketStallScene(services: AppServices): MarketStallScene {
  const { sprites, audio, input } = services;
  const random = (): number => services.random();
  const particles = createFx(PARTICLES, Math.random);
  const soundButton = createSoundButton(services), soundNames = soundArt(services).map(a => a.name);
  const flights: Flight[] = Array.from({ length: POOL }, () => ({ active: false, mode: 0, kind: 0, idx: 0, demo: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, giggles: 0 }));
  const work = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const pos = { x: 0, y: 0 };
  let data: StallData = defaultData();
  let W = 1366, H = 768, u = 1, portrait = false, artRatio = 0;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0, bgScale = 1, Yc = 475;

  // ---- the current customer
  let plan: CustomerPlan = goalCustomer(), who = 0, good = 0, good2 = 1, mergeDur = MERGE_SECONDS, moment = ENTER, momentT = 0, asked = false, lastOpener = -1;
  const dishKind = new Int8Array(MAX_DISH), dishPx = new Float32Array(MAX_DISH), dishPy = new Float32Array(MAX_DISH), dishHop = new Float32Array(MAX_DISH).fill(9);
  /** Pieces in the dish (the payment) and landed so far. */
  let dishN = 0, dishLanded = 0, dropTo = 0;
  /** Pouring: the piece pouring, units left in it, the clock to the next cup, and cups lit so far. */
  let pourIdx = 0, pourLeft = 0, pourTimer = 0, pourGap = POUR_GAP_MAX, pourEvery = 1, lit = 0, cupsTotal = 0;
  /** Change: units given (landed at the paw), committed (landed or flying), counted on the board, and the count's pour. */
  let given = 0, committed = 0, counter = 0, countLeft = 0, countTimer = 0, countGap = POUR_GAP_MAX;
  const pawKind = new Int8Array(MAX_PAW);
  /** Pieces in the paw, and the value of pieces no longer drawn (past MAX_PAW). */
  let pawN = 0, pawLost = 0;
  /** Each track dot's pop clock (negative: not shown yet, it pops in when its turn comes). */
  const cupPulse = new Float32Array(MAX_CUPS).fill(9);
  // ---- till
  const tillKind = new Int8Array(MAX_WELLS), wellX = new Float32Array(MAX_WELLS), wellY = new Float32Array(MAX_WELLS), wellHop = new Float32Array(MAX_WELLS).fill(9);
  /** Each well's (or slot's) own size: coin wells are square, bill slots wide (a dollars-and-cents till has both). */
  const wellWs = new Float32Array(MAX_WELLS), wellHs = new Float32Array(MAX_WELLS);
  let tillN = 0, tillUp = 0;
  /** Mouse hover, eased 0 to 1: each till well (a piece to pick up), the paw under a carried piece, the corner Home. */
  const wellHover = new Float32Array(MAX_WELLS);
  let pawHover = 0, homeHover = 0;
  // ---- evidence and motor attempts
  let assisted = false, deliberate = true, actions = 0, bounced = false, bouncesHere = 0;
  let lastPressAt = -9999, lastArrowAt = -9999, lastActionAt = -9999;
  const roundCounted: number[] = [];
  let hits = 0, misses = 0, bounces = 0;
  // ---- motion
  let custHop = 9, tagSwing = 9, boardPulse = 9, itemFly = 0;
  /** Feel: the newest paw piece's landing squash, the carried piece's pick-up spring, the leaving customer's cheer (grows each customer). */
  let arrowedHere = false, mergePopped = false, pawHop = 9, carryT = 9, cheerT = -1, cheerLevel = 0, tillSounded = false;
  // ---- the harbour this round: bunting strings up as customers are served, served customers at the back, what the takings buy
  const buntAt = new Float32Array(2).fill(-1), crowdAt = new Float32Array(CROWD_MAX).fill(-1);
  let buntN = 0, crowdN = 0, buy = -1, buyK = 0, roundT = 0;
  // ---- the till count at closing (each sale's price in its own unit; totals in whole dollars and cents)
  const salePrice = new Int32Array(MAX_SALES), saleDollars = new Uint8Array(MAX_SALES), saleCum = new Int32Array(MAX_SALES + 1), saleCumD = new Int32Array(MAX_SALES + 1);
  const closeCupD = new Float32Array(MAX_CUPS).fill(9), closeCupC = new Float32Array(MAX_CUPS).fill(9);
  /** What the round's customers paid with: coin kinds and bill kinds (bit per kind), for the closing till tray. */
  let takenCoins = 0, takenBills = 0;
  let salesN = 0, closeT = 0, closeSpeed = 1, closeDollars = 0, closeCents = 0, shownD = 0, shownC = 0, closeTotalAt = 0, closeBuyAt = 0, closeEndAt = 0, closePopped = false, closeStreamed = false, closeRevealed = false;
  // ---- round
  let phase: Phase = 'play', tier: Tier = 0, intro = false, introStage = 0, customerIndex = 0, customersTotal = 3, lastPrice = 0;
  const roundWho: number[] = [], roundGoods: number[] = [];
  let time = 0, sceneT = 0, phaseT = 0, idleT = 0, stars = 1, starsPlayed = 0;
  let pending: PendingRound | null = null;
  let menuSelected = -1, inputAfter = 0, keyAfter = 0, focusAt = 0, focus = 0, cornerFocus = -1;
  let workHead = 0, workCount = 0, updateMs = 0;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0, idleWaitFrom = -1;
  const warmNames: string[] = [], warmSizes: number[] = [], warmDone = new Set<string>();
  let warmIndex = 0, madeN = 0, sizeKey = '', closingFresh = false;
  const madeNames: string[] = ['', '', '', ''], madeSizes = [0, 0, 0, 0];
  const carry = { active: false, sticky: false, well: 0, kind: 0, downAt: 0, downX: 0, downY: 0, deliberate: false };
  const hand = { mode: 0, t: 0, well: 0, kind: 0, taken: false, released: false, n: 0, seq: new Int8Array(4), kinds: new Int8Array(4), ki: 0, kn: 0 };

  // ---- layout (CSS px)
  /** Coin diameters at the tier's size; dish coins draw at `dishK` of it (the smallest tier's size) so their tags show. */
  const coinD = new Float32Array(4);
  let billW = 220, billH = 110, cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, dishK = 1;
  const L = {
    board: box(), panel: box(), dish: box(), foot: box(), till: box(), well: box(), body: box(), pawZone: box(), front: box(), scratch: box(),
    // Step 9's second item, the items' tags and the merged tag, and the front group's whole box; the paw stack's box
    // for four pieces.
    front2: box(), ftag: box(), ftag2: box(), fmtag: box(), frontAll: box(), stack: box(),
    // The round end: the slate (board art, fixed size per window), its cream panel, and the till that rises below it.
    slate: box(), slatePanel: box(), ctill: box(),
  };
  /** The round end: each sale's tag in a row under the slate (x centre), the slate's cup pitch and its total numeral size. */
  const closeTagX = new Float32Array(MAX_SALES);
  let closeTagW = 120, closeTagY = 0, closePitch = 16, closeRowsH = 200, closeCup = 14, closePx = 40, closeKS = 0.6;
  /** Served customers' crowd at the back: first x, step between them, height. */
  let crowdX0 = 0, crowdStep = 0, crowdH = 0;
  /** Whether the last layout found a place for every zone (false only when the solver had to keep a layout that does not fit). */
  let fitted = true;
  /** The layout's own scale (config uiScale, or less where that does not fit) and what it was found for. */
  let uiK = 1;
  const uiFor = { plan: null as CustomerPlan | null, who: -1, good: -1, good2: -1, tier: -1, w: 0, h: 0, ui: 0 };
  /** A tag's box now (tagNow), the full-size tag height its numeral strip is baked for, the newest paw piece's centre. */
  const tagAt = box();
  let tagH0 = 60, stackX = 0, stackY = 0;
  let dishInChange = true, custX = 0, custH = 0, custW = 0, custS = 1, pawX = 0, pawY = 0, snap = 0, wellW = 0, wellH = 0;
  /**
   * Board (the count-up track): the marker's numeral size, the end amounts' size, the end icons' height and widths, the
   * track's ends, centre line and thickness, the end icons' centres, the end amounts' line, the marker's top and height,
   * the marker numeral's line, and the dots (how many, pitch, size).
   */
  let numPx = 30, tagPx = 30, endPx = 18, iconH = 44, tagIconW = 60, dishIconW = 80, trackX0 = 0, trackX1 = 0, trackY = 0, trackT = 8;
  let tagCx = 0, dishCx = 0, endY = 0, markerTop = 0, markerH = 12, numY = 0, dotsN = 0, dotPitch = 20, dotD = 16;
  let starY = 0, starR = 0, choiceSize = 0, choiceY = 0, restSize = 0, restY = 0, controlsY = 0, controlsRadius = 60;
  const offers = createStickerOffers(sprites), bookAt = new Float32Array(2);
  let bookH = 150, bookGlide = false;
  const stickerNames = new Map(STICKERS.map(s => [s.id, stickerSpriteName(s.id)]));
  // ---- bakes
  let glowCanvas: HTMLCanvasElement | undefined, dotCanvas: HTMLCanvasElement | undefined, trayCanvas: HTMLCanvasElement | undefined, boardCanvas: HTMLCanvasElement | undefined;
  const cupCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined];
  const billCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined, undefined];
  /** Each coin kind's value tag, baked at its diameter (coinTagD). */
  const coinTagCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined, undefined];
  const coinTagD = new Float32Array(4);
  /** Emptied wells' outlines: one ring per coin kind (at coinTagD's sizes), one for a bill (at bakedEmptyBill's width). */
  const emptyRingCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined, undefined];
  let emptyBillCanvas: HTMLCanvasElement | undefined, bakedEmptyBill = 0;
  /** The value tags waiting for this layer's flushTags. */
  const qKind = new Int8Array(TAGS_MAX), qX = new Float32Array(TAGS_MAX), qY = new Float32Array(TAGS_MAX), qS = new Float32Array(TAGS_MAX);
  const qSx = new Float32Array(TAGS_MAX), qRot = new Float32Array(TAGS_MAX), qA = new Float32Array(TAGS_MAX);
  let tagN = 0;
  let redBoard: Strip | undefined, inkTag: Strip | undefined, inkClose: Strip | undefined, inkEnd: Strip | undefined;
  /** The board's track (unlit, and lit up to the marker) and the marker, baked per size. */
  let trackCanvas: HTMLCanvasElement | undefined, trackLitCanvas: HTMLCanvasElement | undefined, markerCanvas: HTMLCanvasElement | undefined;
  let bakedTrack = '', bakedMarker = 0, bakedEnd = 0;
  let shadowCanvas: HTMLCanvasElement | undefined, slateCanvas: HTMLCanvasElement | undefined, ctrayCanvas: HTMLCanvasElement | undefined;
  let bakedClose = 0, bakedSlate = '', bakedCtray = '', closeCupCanvas: HTMLCanvasElement | undefined, bakedCloseCup = 0;
  let closeDollarCanvas: HTMLCanvasElement | undefined, bakedCloseDollar = 0;
  const boardCache = new Map<string, HTMLCanvasElement>(), trayCache = new Map<string, HTMLCanvasElement>(), boardQueue: number[] = [];
  let trayWant = '', trayWantW = 0, trayWantH = 0, boardQueued = '';
  let bakedCup = 0, bakedTray = '', bakedBoard = '', bakedBills = '', bakedNum = 0, bakedTag = 0, glowSize = 0, dotSize = 0;
  const drawnScale = new Map<string, number>();

  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  const playable = (): boolean => phase === 'play';
  const tillShown = (): boolean => moment === CHANGE || moment === PAID || moment === POUR || moment === DROP;
  const dishShown = (): boolean => !tillShown() || dishInChange;
  const value = (kind: number): number => valueOf(kind, plan.dollars);
  const payment = (): number => { let s = 0; for (let i = 0; i < dishLanded; i++) s += value(dishKind[i]!); return s; };
  const planned = (): number => paid(plan);
  /** The board's track shows one dot per cent of change at steps 1 to 3 only. */
  const dotsOn = (): boolean => plan.content <= CUP_STEPS;
  const note = (name: string, drawn: number, natural: number): void => {
    const k = drawn / (natural || 1), old = drawnScale.get(name) ?? 0;
    if (k > old) drawnScale.set(name, k);
  };
  /** A bill: every piece at the $ steps, and the $1 and $5 bills of an amount counted in cents. */
  const isBill = (kind: number): boolean => plan.dollars || kind >= K_DOLLAR;
  /** Which bill art a bill piece uses ($1, $5, $10, $20). */
  const billOf = (kind: number): number => (plan.dollars ? kind : kind === K_FIVE ? B5 : B1);
  const pieceW = (kind: number): number => (isBill(kind) ? billW : coinD[kind]!);
  const pieceH = (kind: number): number => (isBill(kind) ? billH : coinD[kind]!);
  /** The change is given in bills (or, in dollars and cents, partly in $1 bills): the paw stack is sized for a bill. */
  const billChange = (): boolean => plan.dollars || plan.till.includes(K_DOLLAR);
  /** The chip inks a landing piece throws: copper for a penny, silver for the other coins, `billInks` for a bill. */
  const pieceInks = (kind: number, billInks: number): number => (isBill(kind) ? billInks : kind === PENNY ? PENNY_INKS : SILVER_INKS);
  const two = (): boolean => plan.parts.length === 2;

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H;
    const reratio = sprites.pixelRatio !== artRatio;
    artRatio = sprites.pixelRatio;
    if (reratio) warmDone.clear();
    geometry(width, height);
    // Celebration, choice and rest.
    const headerScale = Math.min(1.25, Math.max(0.6, Math.min(W / 1366, H / 768)));
    starR = 34 * headerScale; starY = 70 * headerScale;
    choiceSize = Math.round(Math.max(110, Math.min(300 * Math.min(1.25, H / 768), (W - 60) / 2)));
    choiceY = H * 0.56;
    controlsRadius = Math.max(48, Math.min(Math.max(48 * services.config.uiScale, 62 * u), W / 5));
    controlsY = H - controlsRadius - 22;
    restSize = Math.round(Math.max(110, Math.min(300 * Math.min(1.25, H / 768), controlsY - controlsRadius - starY - starR - 40)));
    restY = (starY + starR + controlsY - controlsRadius) / 2;
    bookH = Math.round(Math.max(72, Math.min(200, choiceSize * 0.45)));
    bake(reratio);
    planWarm();
    const key = `${W}x${H}@${artRatio}/${tier}/${uiK}`;
    if (key !== sizeKey) { sizeKey = key; releaseArt(); drawnScale.clear(); boardCache.clear(); trayCache.clear(); boardQueue.length = 0; boardQueued = ''; }
    if (resized || reratio || !bgCanvas) { sprites.clearScaled(BG); bgCanvas = undefined; }
  }
  /**
   * Sizes and places for the current customer at width x height, with no drawing or baking (layoutCheck uses it alone).
   * A config uiScale above 1 is the largest scale tried: when the layout at that scale does not fit (a target off
   * screen, under 96 px or overlapping), the scale is searched down towards 1 (halving the gap six times, keeping
   * only scales that fit) and the largest fitting one is used. The result is kept for the customer, tier and window.
   */
  function geometry(width: number, height: number): void {
    const ui = services.config.uiScale;
    if (ui <= 1) { uiK = ui; place(width, height, ui); return; }
    if (uiFor.plan === plan && uiFor.who === who && uiFor.good === good && uiFor.good2 === good2 && uiFor.tier === tier && uiFor.w === width && uiFor.h === height && uiFor.ui === ui) {
      place(width, height, uiK); return;
    }
    const fits = (): boolean => fitted && fitFailures().length === 0;
    let k = ui;
    place(width, height, ui);
    if (!fits()) {
      k = 1; place(width, height, 1);
      if (fits()) {
        let lo = 1, hi = ui;
        for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; place(width, height, mid); if (fits()) lo = mid; else hi = mid; }
        k = lo; place(width, height, lo);
      }
    }
    uiK = k;
    uiFor.plan = plan; uiFor.who = who; uiFor.good = good; uiFor.good2 = good2; uiFor.tier = tier; uiFor.w = width; uiFor.h = height; uiFor.ui = ui;
  }
  /** Sizes and places at layout scale `ui` (the config's uiScale, or less when that does not fit: see geometry). */
  function place(width: number, height: number, ui: number): void {
    W = width; H = height; portrait = W < H;
    u = Math.min(U_MAX, Math.max(0.45, Math.min(W / 1366, H / 768))) * ui;
    const cornerU = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * ui;
    cornerRadius = Math.max(48, Math.min(60 * cornerU, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    // The background's geometry from its known size (1920x1280): cover-fit, and in tall windows 1.3 times that,
    // anchored at the bottom so the counter fills more of the screen. ensureBackground uses the loaded image's own size.
    bgFit(BG_W, BG_H);
    Yc = bgY + BG_COUNTER * bgScale;
    const tp = TIERS[tier];
    const dime = Math.max(MIN_DIME_PX, tp.dime * u);
    for (let k = 0; k < 4; k++) coinD[k] = Math.round(dime * COIN_MM[k]! / DIME_MM);
    // Dish coins (never a target) draw at the smallest tier's size, so a fan of them can show every value tag.
    dishK = Math.min(1, Math.max(MIN_DIME_PX, TIERS[2].dime * u) / dime);
    billH = Math.round(Math.max(MIN_BILL_PX, tp.bill * u / 2)); billW = billH * 2;
    snap = tp.snap * u;
    solve(tp);
    tagH0 = TAG_W * u * TAG_PX[1] / TAG_PX[0];
    tagPx = Math.max(14, Math.round(tagH0 * 0.36));
    closeGeometry();
    crowdH = CUST_H * u * CROWD_K; crowdStep = 70 * u;
    crowdX0 = L.board.x + L.board.w + 24 * u + crowdH * 0.32;
  }
  /**
   * The round end's places: the till tray at the bottom centre, the sale tags in a row above it, and the slate (the
   * board's art at a fixed size per window) above them, with room for ten rows of cups in two grids (dollars, cents).
   */
  function closeGeometry(): void {
    const m = Math.max(4, 12 * u);
    const tw = Math.round(Math.min(W - 2 * m, 420 * u)), th = Math.round(Math.max(96, 140 * u));
    setBox(L.ctill, Math.round((W - tw) / 2), Math.round(H - m - th), tw, th);
    closeTagW = Math.round(Math.max(64, Math.min(130 * u, (W - 2 * m) / 5.6)));
    closeTagY = L.ctill.y - Math.max(6, 10 * u) - closeTagW * TAG_PX[1] / TAG_PX[0];
    const top = Math.round(cornerY + cornerRadius + (portrait ? 4 : Math.max(4, 8 * u))), bottom = closeTagY - Math.max(6, 10 * u);
    closeKS = Math.min(1, 0.6 * u);
    const fl = BOARD_FRAME[0] * closeKS, fr = BOARD_FRAME[1] * closeKS, ft = BOARD_FRAME[2] * closeKS, fb = BOARD_FRAME[3] * closeKS;
    const panelH = bottom - top - ft - fb;
    closePx = Math.round(Math.max(22, Math.min(56 * u, panelH * 0.15)));
    const band = closePx * 1.5, label = closePx * 0.75;
    // The slate is one size per window (baked ahead): wide enough for two grids of ten at a comfortable pitch, tall
    // enough for ten rows at the pitch that leaves; each round's cups take the largest pitch its rows allow.
    const pw = Math.min(W - 2 * m - fl - fr, 700 * u), rows = Math.max(MIN_CUP / 0.9 * 10.3, panelH - band - label);
    closeRowsH = rows; closePitch = Math.max(MIN_CUP / 0.9, Math.min(40 * u, rows / 10.3, pw / 23.2));
    closeCup = Math.max(MIN_CUP, Math.floor(closePitch * 0.9));
    const ph = band + label + rows, sw = Math.round(pw + fl + fr), sh = Math.round(ph + ft + fb);
    setBox(L.slate, Math.round((W - sw) / 2), top, sw, sh);
    setBox(L.slatePanel, L.slate.x + fl, L.slate.y + ft, pw, ph);
  }
  /** What does not fit in the current layout (layoutCheck): one line per problem. */
  function fitFailures(): string[] {
    const out: string[] = [];
    const over = (a: Box, b: Box): boolean => a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const inWin = (b: Box): boolean => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
    const show = (b: Box): string => `(${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`;
    if (!fitted) out.push('the solver found no layout that fits');
    const corners = [setBox(box(), homeX - cornerRadius, cornerY - cornerRadius, cornerRadius * 2, cornerRadius * 2), setBox(box(), soundX - cornerRadius, cornerY - cornerRadius, cornerRadius * 2, cornerRadius * 2)];
    const zones: [string, Box][] = [['paw', L.pawZone]];
    for (let i = 0; i < tillN; i++) zones.push([`well${i}`, setBox(box(), wellX[i]! - wellWs[i]! / 2, wellY[i]! - wellHs[i]! / 2, wellWs[i]!, wellHs[i]!)]);
    for (let i = 0; i < zones.length; i++) {
      const [zn, z] = zones[i]!;
      if (z.w < 96 || z.h < 96) out.push(`${zn} zone under 96 px ${show(z)}`);
      if (!inWin(z)) out.push(`${zn} zone outside the window ${show(z)}`);
      if (over(z, L.board)) out.push(`${zn} zone over the board`);
      for (const c of corners) if (over(z, c)) out.push(`${zn} zone over a corner button`);
      for (let j = i + 1; j < zones.length; j++) if (over(z, zones[j]![1])) out.push(`${zn} zone over ${zones[j]![0]} zone`);
      if (dishInChange && over(z, L.foot)) out.push(`${zn} zone over the dish ${show(L.foot)}`);
    }
    if (over(L.foot, L.body)) out.push(`dish ${show(L.foot)} over the customer ${show(L.body)}`);
    if (!inWin(L.foot)) out.push(`dish pile outside the window ${show(L.foot)}`);
    if (over(L.foot, L.board)) out.push('dish over the board');
    // The board (the count-up track) stays whole: inside the window, clear of the corner buttons, and the customer
    // (drawn after it) covers at most 8 percent of its own width of it.
    if (!inWin(L.board)) out.push(`board outside the window ${show(L.board)}`);
    for (const c of corners) if (over(L.board, c)) out.push('board over a corner button');
    if (L.board.x + L.board.w - L.body.x > 0.08 * L.body.w && over(L.board, L.body)) out.push(`customer ${show(L.body)} over the board ${show(L.board)}`);
    const front: Box[] = two() ? [L.ftag, L.ftag2, L.fmtag] : [L.ftag];
    for (const t of front) {
      if (!inWin(t)) out.push(`tag outside the window ${show(t)}`);
      if (over(t, L.foot) && dishInChange) out.push(`dish over a price tag ${show(t)}`);
      if (over(t, L.board)) out.push('board over a price tag');
      if (over(t, L.till) || over(t, L.pawZone)) out.push(`till or paw zone over a price tag ${show(t)}`);
    }
    if (over(L.till, L.board)) out.push('till over the board');
    if (!inWin(L.till)) out.push(`till outside the window ${show(L.till)}`);
    if (!inWin(L.stack)) out.push(`paw stack outside the window ${show(L.stack)}`);
    if (over(L.stack, L.till)) out.push(`paw stack over the till ${show(L.stack)}`);
    // Each well's stack (the rims below offset down and right) and the top coin's value tag stay inside the till.
    for (let i = 0; i < tillN; i++) {
      const kind = tillKind[i]!, b = isBill(kind), d = coinD[kind]!, t = coinTagSize(kind, d), off = 3 * 3 * u, offY = 3 * 4 * u;
      const cy = b ? wellY[i]! : wellY[i]! - wellLift(i), hw = b ? billW / 2 : Math.max(d, t.w) / 2, up = b ? billH / 2 : d / 2;
      const down = b ? billH / 2 + offY : Math.max(d / 2 + t.h / 2, d / 2 + offY);
      const c = setBox(box(), wellX[i]! - hw, cy - up, hw * 2 + off, up + down);
      if (c.x < L.till.x || c.y < L.till.y || c.x + c.w > L.till.x + L.till.w || c.y + c.h > L.till.y + L.till.h) out.push(`well${i} ${name(kind)} with its tag outside the till ${show(c)}`);
    }
    if (over(L.frontAll, L.till) || over(L.frontAll, L.pawZone)) out.push('till or paw zone over the goods');
    return out;
  }
  function bgFit(iw: number, ih: number): void {
    const cover = Math.max(W / iw, H / ih);
    bgScale = portrait ? cover * 1.3 : cover;
    bgX = (W - iw * bgScale) / 2; bgY = portrait ? H - ih * bgScale : (H - ih * bgScale) / 2;
  }
  /** Baked pieces follow the pixel ratio and their sizes. */
  function bake(reratio: boolean): void {
    const glow = Math.round(coinD[QUARTER]! * 1.6);
    if (!glowCanvas || reratio || glow !== glowSize) { glowSize = glow; glowCanvas = bakeGlow(glowSize, artRatio, false); }
    const dot = Math.max(12, Math.round(coinD[PENNY]! * 0.13));
    if (!dotCanvas || reratio || dot !== dotSize) { dotSize = dot; dotCanvas = bakeDot(dotSize, artRatio); }
    // The track's dots: cream sockets, turning orange-red as each cent of change is given ([0] unlit, [1] given).
    if (!cupCanvas[0] || reratio || dotD !== bakedCup) { bakedCup = dotD; cupCanvas[0] = bakeCup(dotD, artRatio, CUP_UNLIT); cupCanvas[1] = bakeCup(dotD, artRatio, CUP_GIVEN); }
    if (!redBoard || reratio || numPx !== bakedNum) { bakedNum = numPx; redBoard = bakeStrip(numPx, artRatio, RED); }
    if (!inkEnd || reratio || endPx !== bakedEnd) { bakedEnd = endPx; inkEnd = bakeStrip(endPx, artRatio, INK); }
    const trackKey = `${Math.round(trackX1 - trackX0)}x${trackT}@${artRatio}`;
    if (trackX1 > trackX0 && (trackKey !== bakedTrack || reratio)) {
      bakedTrack = trackKey; trackCanvas = bakeTrack(trackX1 - trackX0, trackT, artRatio, false); trackLitCanvas = bakeTrack(trackX1 - trackX0, trackT, artRatio, true);
    }
    if (!markerCanvas || reratio || markerH !== bakedMarker) { bakedMarker = markerH; markerCanvas = bakeMarker(markerH, artRatio); }
    if (!inkTag || reratio || tagPx !== bakedTag) { bakedTag = tagPx; inkTag = bakeStrip(tagPx, artRatio, INK); }
    for (let k = 0; k < 4; k++) {
      if (!coinTagCanvas[k] || reratio || coinTagD[k] !== coinD[k]) {
        coinTagD[k] = coinD[k]!; coinTagCanvas[k] = bakeCoinTag(k, coinD[k]!, artRatio); emptyRingCanvas[k] = bakeEmpty(coinD[k]!, coinD[k]!, artRatio, false);
      }
    }
    if (!emptyBillCanvas || reratio || bakedEmptyBill !== billW) { bakedEmptyBill = billW; emptyBillCanvas = bakeEmpty(billW, billH, artRatio, true); }
    if (!inkClose || reratio || closePx !== bakedClose) { bakedClose = closePx; inkClose = bakeStrip(closePx, artRatio, INK); shadowCanvas = bakeShadow(64, artRatio); }
    if (!closeCupCanvas || reratio || closeCup !== bakedCloseCup) { bakedCloseCup = closeCup; closeCupCanvas = bakeCup(closeCup, artRatio, CUP_PAID); }
    const dollarCup = dollarCupD(closePitch);
    if (!closeDollarCanvas || reratio || dollarCup !== bakedCloseDollar) { bakedCloseDollar = dollarCup; closeDollarCanvas = bakeCup(dollarCup, artRatio, CUP_DOLLAR); }
    particles.bake(u, artRatio);
    if (L.till.w > 0) {
      const trayKey = `${Math.round(L.till.w)}x${Math.round(L.till.h)}@${artRatio}`;
      if (trayKey !== bakedTray) { const c = trayCache.get(trayKey); if (c) { bakedTray = trayKey; trayCanvas = c; } else { trayWant = trayKey; trayWantW = L.till.w; trayWantH = L.till.h; } }
    }
    const boardKey = `${Math.round(L.board.w)}x${Math.round(L.board.h)}@${artRatio}`;
    if (boardKey !== bakedBoard) { const c = boardCache.get(boardKey) ?? bakeBoard(L.board.w, L.board.h); if (c) { bakedBoard = boardKey; boardCanvas = c; } }
    // Every board width (no dots, or each dot bucket) bakes ahead in idle periods once per window size.
    const queueKey = `${boardWidth(0)}x${Math.round(boardPanelH())}@${artRatio}`;
    if (boardQueue.length === 0 && boardQueued !== queueKey) {
      boardQueued = queueKey;
      boardQueue.push(boardWidth(0)); for (const n of DOT_BUCKETS) boardQueue.push(boardWidth(n));
    }
    const billKey = `${billW}@${artRatio}`;
    if (billKey !== bakedBills && BILLS.every(b => sprites.get(b))) {
      bakedBills = billKey;
      for (let k = 0; k < 4; k++) billCanvas[k] = bakeBill(sprites.get(BILLS[k]!)!, BILL_VALUE[k]!, billW, billH, artRatio);
    }
  }
  /** Bake the board frame at w x h (cached by size); undefined until its art has loaded. */
  function bakeBoard(w: number, h: number): HTMLCanvasElement | undefined {
    const board = sprites.get(BOARD); if (!board) return undefined;
    const key = `${Math.round(w)}x${Math.round(h)}@${artRatio}`;
    let c = boardCache.get(key);
    if (!c) { c = bakeNine(board, w, h, artRatio, BOARD_FRAME[0], BOARD_FRAME[1], BOARD_FRAME[2], BOARD_FRAME[3], frameK(h)); boardCache.set(key, c); }
    return c;
  }
  /** Bake the tray the current customer's till wants (cached by size). */
  function bakeTray(): void {
    const tray = sprites.get(TRAY); if (!tray || !trayWant) return;
    let c = trayCache.get(trayWant);
    if (!c) { c = bakeNine(tray, trayWantW, trayWantH, artRatio, TRAY_EDGE, TRAY_EDGE, TRAY_EDGE, TRAY_EDGE, trayK(trayWantH)); trayCache.set(trayWant, c); }
    if (`${Math.round(L.till.w)}x${Math.round(L.till.h)}@${artRatio}` === trayWant) { trayCanvas = c; bakedTray = trayWant; }
    trayWant = '';
  }
  /** The round end's slate and till tray, one bake each per window size (in an idle period during play when one comes). */
  const slateKey = (): string => `${L.slate.w}x${L.slate.h}@${artRatio}`;
  const ctrayKey = (): string => `${L.ctill.w}x${L.ctill.h}@${artRatio}`;
  function bakeClosing(): boolean {
    if (bakedSlate !== slateKey()) {
      const board = sprites.get(BOARD); if (!board) return false;
      slateCanvas = bakeNine(board, L.slate.w, L.slate.h, artRatio, BOARD_FRAME[0], BOARD_FRAME[1], BOARD_FRAME[2], BOARD_FRAME[3], closeKS);
      bakedSlate = slateKey(); return true;
    }
    if (bakedCtray !== ctrayKey()) {
      const tray = sprites.get(TRAY); if (!tray) return false;
      ctrayCanvas = bakeNine(tray, L.ctill.w, L.ctill.h, artRatio, TRAY_EDGE, TRAY_EDGE, TRAY_EDGE, TRAY_EDGE, trayK(L.ctill.h));
      bakedCtray = ctrayKey(); return true;
    }
    return false;
  }
  /** The till count's dollar cup: nearly the whole pitch, so it reads larger than a cent cup (0.9 of the pitch). */
  const dollarCupD = (pitch: number): number => Math.max(MIN_CUP + 2, Math.floor(pitch * 0.98));
  const closingBaked = (): boolean => bakedSlate === slateKey() && bakedCtray === ctrayKey();
  /**
   * The board's sizes for the current layout unit: the marker numeral, the end amounts (smaller), the end icons (at
   * least END_ICON_MIN px tall), the track's thickness and the marker's height.
   */
  function boardMetrics(): void {
    const inW = BOARD_IN[1] - BOARD_IN[0];
    numPx = Math.max(24, Math.round(BOARD_W * u * inW * 0.17));
    endPx = Math.max(16, Math.round(numPx * 0.6));
    iconH = Math.max(END_ICON_MIN, Math.round(END_ICON_U * u));
    tagIconW = Math.round(iconH * TAG_PX[0] / TAG_PX[1]); dishIconW = Math.round(iconH * DISH_PX[0] / DISH_PX[1]);
    trackT = Math.max(6, Math.round(iconH * 0.2)); markerH = Math.max(12, Math.round(numPx * 0.45));
  }
  /** Padding inside the panel and the gap between an end icon and the track. */
  const boardPad = (): number => Math.max(2, 4 * u), boardGap = (): number => Math.max(4, 8 * u);
  /** The board's base width: 320u, never narrower than its readable minimum (181 px). */
  const boardBase = (): number => Math.round(Math.max(BOARD_W * u, 181));
  /**
   * The frame's corner scale for a board h tall: set by the base width (at most 1.0), so a board widened for its dots
   * keeps the frame of the base board and only its panel grows.
   */
  const frameK = (h: number): number => boardK(boardBase(), h);
  /** The panel's height: the end amounts, the end icons with the track between them, the marker, the marker's numeral. */
  const boardPanelH = (): number => endPx * 1.4 + iconH * 1.15 / 2 + trackT / 2 + 1 + markerH + numPx * 1.3;
  /** The board's height (the same at every width: the frame keeps the base width's scale). */
  const boardHeight = (): number => Math.round(boardPanelH() + (BOARD_FRAME[2] + BOARD_FRAME[3]) * Math.min(1, boardBase() / BOARD_PX[0]));
  /**
   * The board's width for n dots (0: none): the base width, wider when the track needs room for n dots of MIN_DOT px
   * (n rounded up to a dot bucket, so a few widths bake ahead), never wider than the window allows.
   */
  function boardWidth(n: number): number {
    let bucket = 0; if (n > 0) { bucket = n; for (const b of DOT_BUCKETS) if (n <= b) { bucket = b; break; } }
    const track = bucket * MIN_DOT / DOT_FILL, inner = 2 * boardPad() + tagIconW + dishIconW + 2 * boardGap() + track;
    const frame = (BOARD_FRAME[0] + BOARD_FRAME[1]) * frameK(boardHeight());
    return Math.min(W - 8, Math.max(boardBase(), Math.ceil(inner + frame)));
  }
  /**
   * Place everything for the current customer: board, dish, till, customer, and the zones the child uses. The paw
   * zone and the till's wells never overlap each other, the board, the dish (while it shows), a corner button or the
   * window's edge; the customer shrinks in 5 percent steps until they fit.
   */
  function solve(tp: TierParams): void {
    const m = Math.max(4, 12 * u);
    // Board: a count-up track read left to right. The price tag at its left end and the dish at its right end, each
    // with its amount above it; between them the track (at steps 1 to 3 one dot per cent of change); under the track
    // the marker and its climbing numeral. The board widens for the dots (the frame is baked in nine parts, so any
    // size keeps its look).
    boardMetrics();
    dotsN = dotsOn() ? Math.max(0, plan.change) : 0;
    const bw = boardWidth(dotsN), bh = boardHeight(), k = frameK(bh);
    const boardTop = Math.round(cornerY + cornerRadius + (portrait ? 4 : Math.max(4, 8 * u)));
    setBox(L.board, portrait ? 4 : Math.max(4, Math.round(24 * u)), boardTop, bw, bh);
    setBox(L.panel, L.board.x + BOARD_FRAME[0] * k, L.board.y + BOARD_FRAME[2] * k, bw - (BOARD_FRAME[0] + BOARD_FRAME[1]) * k, bh - (BOARD_FRAME[2] + BOARD_FRAME[3]) * k);
    const pad = boardPad(), gap = boardGap(), endBand = endPx * 1.4;
    tagCx = L.panel.x + pad + tagIconW / 2; dishCx = L.panel.x + L.panel.w - pad - dishIconW / 2;
    trackX0 = Math.round(L.panel.x + pad + tagIconW + gap); trackX1 = Math.round(L.panel.x + L.panel.w - pad - dishIconW - gap);
    endY = L.panel.y + endBand * 0.5; trackY = L.panel.y + endBand + iconH * 1.15 / 2;
    markerTop = trackY + trackT / 2 + 1; numY = markerTop + markerH + numPx * 0.62;
    dotPitch = dotsN ? (trackX1 - trackX0) / dotsN : 0;
    dotD = Math.max(MIN_DOT, Math.floor(Math.min(dotsN ? dotPitch * DOT_FILL : iconH * 0.5, iconH * 0.5)));
    // Dish: the payment as a compact pile.
    packDish();
    // Till (change customers): one row of wells or slots where it fits beside the dish, else two rows; in windows too
    // narrow for both, the dish slides away while the change is counted (its pieces are on the board as cups).
    tillN = Math.min(MAX_WELLS, plan.till.length); for (let i = 0; i < tillN; i++) tillKind[i] = plan.till[i]!;
    dishInChange = true;
    let ok = false;
    for (let attempt = 0; attempt < 14 && !ok; attempt++) {
      const withDish = attempt < 7;
      ok = placeTill(attempt % 7, m, withDish);
      if (ok || attempt === 13) dishInChange = withDish && ok;
    }
    // Customer: search sizes (5 percent steps) and positions until every zone fits.
    fitted = true;
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 1; s >= 0.499; s -= 0.05) if (placeCustomer(tp, s, pass === 0)) return;
    }
    // Below 1366x768 (not verified, by owner decision) a layout may not fit: keep it and report it in the stats.
    fitted = false;
    placeCustomerAt(tp, portrait ? W * 0.7 : W * 0.55, 0.5, false, true);
  }
  /** Arrange the dish's pieces: kinds largest first in fans, packed into at most three rows; the dish fits around them. */
  function packDish(): void {
    dishN = 0;
    for (const k of plan.pay) if (dishN < MAX_DISH) dishKind[dishN++] = k;
    // The dish's own width when the pile fits it in two rows; else it widens in 5 percent steps up to its pixel size,
    // the window, or (in wide windows) the height below the counter's back edge, so it never covers the customer;
    // only then does the pile take a third row. The dish never grows taller for its pile.
    const m = Math.max(4, 12 * u), below = portrait ? H : (H - m - Yc - 8) * DISH_PX[0] / DISH_PX[1];
    const maxDish = Math.max(200, Math.min(DISH_MAX, W - 8, below));
    let dw = Math.min(maxDish, Math.max(DISH_W * u, 200));
    let coinsOnly = true; for (let i = 0; i < dishN; i++) if (isBill(dishKind[i]!)) coinsOnly = false;
    if (coinsOnly) {
      // Coins keep one row (a second row would sit below the first row's tags, taller than the counter's front): the
      // dish widens for them, then the row reaches past its rim, up to 0.6 of the window.
      while (!packRows(dw * 0.86, 1) && dw < maxDish) dw = Math.min(maxDish, dw * 1.05);
      if (packedW > dw * 0.86 && !packRows(Math.max(dw * 0.86, W * 0.6), 1)) packRows(dw * 0.86, 2);
    } else {
      while (!packRows(dw * 0.86, 2) && dw < maxDish) dw = Math.min(maxDish, dw * 1.05);
      if (packedW > dw * 0.86) packRows(dw * 0.86, 3);
    }
    dw = Math.round(dw);
    const dh = Math.round(dw * DISH_PX[1] / DISH_PX[0]);
    setBox(L.dish, portrait ? Math.round((W - dw) / 2) : Math.max(4, Math.round(24 * u)), Math.round(H - m - dh), dw, dh);
    // Pieces relative to the dish floor's centre (a row wider than the dish keeps inside the window); the pile stays
    // below the counter's back edge and inside the window.
    const cx = Math.max(L.dish.x + dw / 2, 4 + packedW / 2), cy = Math.max(Math.min(L.dish.y + dh * DISH_FLOOR_Y, H - 4 - packedH / 2), portrait ? 0 : Yc + 10 * u + packedH / 2);
    for (let i = 0; i < dishN; i++) { dishPx[i] = cx + dishPx[i]!; dishPy[i] = cy + dishPy[i]!; }
    // The footprint: the dish and anything of the pile reaching past it (a coin's value tag included).
    let x0 = L.dish.x, y0 = L.dish.y, x1 = L.dish.x + dw, y1 = L.dish.y + dh;
    for (let i = 0; i < dishN; i++) {
      const k = dishKind[i]!, hw = Math.max(dishW(k), isBill(k) ? 0 : coinTagSize(k, coinD[k]! * dishK).w) / 2;
      x0 = Math.min(x0, dishPx[i]! - hw); x1 = Math.max(x1, dishPx[i]! + hw);
      y0 = Math.min(y0, dishPy[i]! - dishH(k) / 2); y1 = Math.max(y1, dishPy[i]! + dishBelow(k));
    }
    setBox(L.foot, x0, y0, x1 - x0, y1 - y0);
    if (!portrait && meets(L.foot, L.board, 4)) {
      const dx = L.board.x + L.board.w + Math.max(8, 12 * u) - L.foot.x;
      L.dish.x += dx; L.foot.x += dx; for (let i = 0; i < dishN; i++) dishPx[i]! += dx;
    }
  }
  /** A dish piece's size: bills at full size, coins at `dishK` of theirs (the smallest tier's size). */
  const dishW = (kind: number): number => (isBill(kind) ? billW : coinD[kind]! * dishK);
  const dishH = (kind: number): number => (isBill(kind) ? billH : coinD[kind]! * dishK);
  const dishBelow = (kind: number): number => (isBill(kind) ? billH / 2 : coinD[kind]! * dishK * (0.5 + TAG_HANG));
  let packedW = 0, packedH = 0;
  /**
   * Pack the dish's pieces into rows no wider than `limit`. Groups of one kind fan left to right; bills each cover the
   * right part of the one before (every numeral stays visible), coins sit far enough apart that no coin covers the
   * value tag of the one before. Fills dishPx/dishPy relative to the pile's centre; returns whether it fits.
   */
  function packRows(limit: number, maxRows: number): boolean {
    let hasBill = false, coinsOnly = true;
    for (let i = 0; i < dishN; i++) { if (isBill(dishKind[i]!)) { hasBill = true; coinsOnly = false; } }
    let fan = 0.38, rows = 1;
    const rowOf = new Int8Array(MAX_DISH), rowWidth = new Float32Array(4);
    for (let attempt = 0; attempt < 6; attempt++) {
      rows = 1; let rowW = 0, maxW = 0, maxH = 0;
      for (let i = 0; i < dishN;) {
        // A group: pieces of one kind.
        let j = i; while (j < dishN && dishKind[j] === dishKind[i]) j++;
        const kind = dishKind[i]!, w = dishW(kind), bill = isBill(kind);
        // A coin's slot is as wide as the wider of the coin and its tag; coins step one slot plus a small gap.
        const slot = bill ? w : Math.max(w, coinTagSize(kind, w).w), stepX = bill ? w * fan : slot + Math.max(3, 4 * u);
        const gw = slot + (j - i - 1) * stepX, gap = rowW > 0 ? Math.max(w * 0.12, 6 * u) : 0;
        if (rowW > 0 && rowW + gap + gw > limit && rows < maxRows) { rowWidth[rows - 1] = rowW; rows++; rowW = 0; }
        const g0 = rowW > 0 ? gap : 0;
        for (let k = i; k < j; k++) { dishPx[k] = rowW + g0 + slot / 2 + (k - i) * stepX; rowOf[k] = rows - 1; }
        rowW += g0 + gw; maxH = Math.max(maxH, dishH(kind));
        i = j;
      }
      rowWidth[rows - 1] = rowW;
      for (let r = 0; r < rows; r++) maxW = Math.max(maxW, rowWidth[r]!);
      // Bills: a lower row starts 0.74 of a bill below the one above it, under the upper bill's numeral (which ends
      // about 0.64 down), so every numeral stays whole wherever the bills sit. Coins: a lower row starts below the
      // upper row's value tags.
      const hang = coinsOnly ? maxH * TAG_HANG : 0, step = hasBill ? maxH * 0.74 : maxH * (1 + TAG_HANG) + Math.max(3, 4 * u);
      for (let k = 0; k < dishN; k++) {
        const r = rowOf[k]!;
        dishPx[k] = dishPx[k]! - rowWidth[r]! / 2;
        dishPy[k] = (r - (rows - 1) / 2) * step - hang / 2;
      }
      packedW = maxW; packedH = maxH + (rows - 1) * step + hang;
      if (maxW <= limit) return true;
      // Bills' fans close up (a bill's numeral ends at 0.37 of its width for "$1") before anything else gives; coins
      // never close up over a tag.
      if (!hasBill || fan <= 0.38) break;
      fan -= 0.03;
    }
    return packedW <= limit;
  }
  /**
   * Till arrangement `mode`: 0 one row; 1 one row, tight gaps; 2 two rows; 3 two rows, tight gaps; 4 two rows, tight
   * wells; 5 one column; 6 one column, tight. Coin wells are square (the largest coin of the till plus a margin); bill
   * slots are 1.12 bills wide at 1.85:1. A dollars-and-cents till has both.
   */
  function placeTill(mode: number, m: number, withDish: boolean): boolean {
    const column = mode >= 5 && tillN > 1, two = !column && mode >= 2 && tillN > 1, tight = mode === 1 || mode >= 3, tighter = mode === 4 || mode === 6;
    const pad = tighter ? 4 : Math.max(4, TILL_PAD * u), gap = tight ? Math.max(2, 4 * u) : Math.max(4, TILL_GAP * u);
    let big = 0; for (let i = 0; i < tillN; i++) if (!isBill(tillKind[i]!)) big = Math.max(big, coinD[tillKind[i]!]!);
    const coinWell = Math.max(96, Math.round(big + (tighter ? 8 : Math.max(8, WELL_PAD * u)))), slotW = Math.round(billW * 1.12), slotH = Math.round(slotW * SLOT_PX[1] / SLOT_PX[0]);
    wellW = 0; wellH = 0;
    for (let i = 0; i < tillN; i++) {
      const b = isBill(tillKind[i]!); wellWs[i] = b ? slotW : coinWell; wellHs[i] = b ? slotH : coinWell;
      wellW = Math.max(wellW, wellWs[i]!); wellH = Math.max(wellH, wellHs[i]!);
    }
    const cols = column ? 1 : two ? Math.ceil(tillN / 2) : tillN, rows = column ? tillN : two ? 2 : 1;
    const rowOf = (i: number): number => (column ? i : two ? Math.floor(i / cols) : 0);
    // Each row as wide as its wells; each row as tall as its tallest well.
    let tw = 0, th = 2 * pad + (rows - 1) * gap;
    for (let r = 0; r < rows; r++) {
      let rw = 0, rh = 0, n = 0;
      for (let i = 0; i < tillN; i++) if (rowOf(i) === r) { rw += wellWs[i]!; rh = Math.max(rh, wellHs[i]!); n++; }
      tw = Math.max(tw, rw + (n - 1) * gap); th += rh;
    }
    tw += 2 * pad;
    const tx = column && portrait ? 4 : portrait ? Math.round((W - tw) / 2) : Math.round(W - m - tw), ty = Math.round(H - (portrait ? 4 : m) - th);
    setBox(L.till, tx, ty, tw, th);
    let y = ty + pad;
    for (let r = 0; r < rows; r++) {
      let rw = 0, rh = 0, n = 0;
      for (let i = 0; i < tillN; i++) if (rowOf(i) === r) { rw += wellWs[i]!; rh = Math.max(rh, wellHs[i]!); n++; }
      let x = tx + (tw - rw - (n - 1) * gap) / 2;
      for (let i = 0; i < tillN; i++) {
        if (rowOf(i) !== r) continue;
        wellX[i] = x + wellWs[i]! / 2; wellY[i] = y + rh / 2; x += wellWs[i]! + gap;
      }
      y += rh + gap;
    }
    if (tx < 2 || ty < cornerY + cornerRadius) return false;
    if (meets(L.till, L.board, 2)) return false;
    if (withDish && meets(L.till, L.foot, 4)) return false;
    return true;
  }
  /** Whether a zone keeps clear of the corner buttons and stays inside the window. */
  function clearOfEdges(b: Box): boolean {
    if (b.x < 2 || b.y < 2 || b.x + b.w > W - 2 || b.y + b.h > H - 2) return false;
    return !nearCorner(homeX, b) && !nearCorner(soundX, b);
  }
  function nearCorner(cx: number, b: Box): boolean {
    const nx = Math.min(b.x + b.w, Math.max(b.x, cx)), ny = Math.min(b.y + b.h, Math.max(b.y, cornerY));
    return Math.hypot(cx - nx, cornerY - ny) < cornerRadius + 4;
  }
  /** Try customer scale `s` at every position, nearest the preferred one first. */
  function placeCustomer(tp: TierParams, s: number, strict: boolean): boolean {
    const h = CUST_H * u * s, w = h * CUSTOMERS[who]!.w / 760;
    const pref = portrait ? W - 4 - w * 0.55 : W * 0.55, lo = w * 0.25, hi = W - w * 0.25;
    for (let k = 0; k < 600; k++) {
      const d = Math.ceil(k / 2) * 6, cx = pref + (k % 2 ? d : -d);
      if (pref - d < lo && pref + d > hi) break;
      if (cx < lo || cx > hi) continue;
      if (placeCustomerAt(tp, cx, s, strict, false)) return true;
    }
    return false;
  }
  /** Place the customer at centre x `cx`, scale `s`, and its zones; with `force`, keep the result even if it does not fit. */
  function placeCustomerAt(tp: TierParams, cx: number, s: number, strict: boolean, force: boolean): boolean {
    const c = CUSTOMERS[who]!, h = CUST_H * u * s, w = h * c.w / 760, top = Yc - CUST_CLIP * h;
    custX = cx; custH = h; custW = w; custS = s;
    setBox(L.body, cx - w / 2, top, w, Yc - top);
    if (strict && meets(L.body, L.board, -0.08 * w)) { if (!force) return false; }
    pawX = cx + (c.paw[0] - 0.5) * w; pawY = top + c.paw[1] * h;
    // The goods resting in front of the customer (not a target), each with its price tag: one item, or step 9's two
    // items, whose tags slide together into one.
    const iw = ITEM_W * u * s * 0.85;
    placeGoods(cx - w * 0.45 - (two() ? iw * 0.3 : 0), Yc + 4 * u, iw, L.front, L.front2, L.ftag, L.ftag2, L.fmtag, L.frontAll, true);
    let ok = placePaw(tp) || force;
    if (ok) {
      const clear = clearOfEdges(L.frontAll) && !meets(L.frontAll, L.board) && !meets(L.frontAll, L.foot) && !meets(L.frontAll, L.pawZone) && !meets(L.frontAll, L.till);
      ok = clear || force;
    }
    placeStack();
    return ok;
  }
  /**
   * Goods centred at cx with their bottom at `bottom`, each item iw wide: one item with its tag over its lower right,
   * or (step 9) two smaller items side by side, each with its tag, and the merged tag between them. `all` covers them.
   */
  function placeGoods(cx: number, bottom: number, iw: number, item: Box, item2: Box, tag: Box, tag2: Box, mtag: Box, all: Box, left = false): void {
    const tw = iw * TAG_W / ITEM_W, th = tw * TAG_PX[1] / TAG_PX[0];
    const hang = (t: Box, it: Box, k: number, toLeft = left): void => {
      const dx = it.w * TAG_DX / ITEM_W;
      setBox(t, toLeft ? it.x + it.w - dx - tw * k : it.x + dx, it.y + it.w * TAG_DY / ITEM_W, tw * k, th * k);
      if (t.y + t.h > it.y + it.h) t.y = it.y + it.h - t.h;
    };
    if (!two()) {
      const g = GOODS[good]!, ih = iw * g.h / g.w;
      setBox(item, cx - iw / 2, bottom - ih, iw, ih); hang(tag, item, 1);
      setBox(item2, 0, 0, 0, 0); setBox(tag2, 0, 0, 0, 0); setBox(mtag, tag.x, tag.y, tag.w, tag.h);
      unionZone(all, item, tag, 0, 0);
      return;
    }
    const k = 0.72, w1 = iw * k, ga = GOODS[good]!, gb = GOODS[good2]!;
    setBox(item, cx - w1 * 1.04, bottom - w1 * ga.h / ga.w, w1, w1 * ga.h / ga.w); hang(tag, item, k, true);
    setBox(item2, cx + w1 * 0.04, bottom - w1 * gb.h / gb.w, w1, w1 * gb.h / gb.w); hang(tag2, item2, k, false);
    setBox(mtag, cx - tw / 2, Math.max(tag.y + tag.h, tag2.y + tag2.h) - th, tw, th);
    unionZone(all, item, item2, 0, 0); unionZone(L.scratch, tag, tag2, 0, 0); unionZone(all, all, L.scratch, 0, 0); unionZone(all, all, mtag, 0, 0);
  }
  /** The change in the paw: a stack of up to four pieces drawn inside the paw zone, newest at its centre, older ones up and left. */
  function placeStack(): void {
    const bills = billChange(), bigW = bills ? billW : coinD[QUARTER]!, bigH = bills ? billH : bigW, z = L.pawZone;
    // Extents of everything the paw can show, relative to the newest piece's centre: every till kind (a coin with its
    // value tag, which is taller than a bill for a quarter) in each of the fan's places (pawPiece), and the settled
    // column beside the fan, rising 0.45 of a piece. `down0` is the newest piece's own reach below its centre.
    let fx0 = 0, fx1 = 0, y0 = 0, y1 = 0, down0 = 0, colHw = 0;
    for (let i = 0; i < tillN; i++) {
      const kind = tillKind[i]!, b = isBill(kind), d = coinD[kind]!, tag = b ? 0 : coinTagSize(kind, d).h, tagW = b ? 0 : coinTagSize(kind, d).w;
      const hw = b ? billW / 2 : Math.max(d, tagW) / 2, up = b ? billH / 2 : d / 2, down = b ? billH / 2 : d / 2 + tag / 2;
      for (let k = 0; k < PAW_FAN; k++) {
        const ox = b ? -k * billW * 0.06 : -k * d * 0.12, oy = b ? -k * billH * 0.12 : -k * d * 0.08;
        fx0 = Math.min(fx0, ox - hw); fx1 = Math.max(fx1, ox + hw); y0 = Math.min(y0, oy - up); y1 = Math.max(y1, oy + down);
      }
      y0 = Math.min(y0, -bigH * 0.45 - up); down0 = Math.max(down0, down); colHw = Math.max(colHw, hw);
    }
    let x = Math.min(W - 4 - fx1, Math.max(4 - fx0, z.x + z.w / 2));
    let y = Math.max(4 - y0, Math.min(z.y + z.h / 2, z.y + z.h - down0));
    const fit = (): void => {
      const colX = Math.max(4 + bigW / 2, x - bigW * (bills ? 0.18 : 0.36) - bigW * 1.04), left = Math.min(x + fx0, colX - colHw);
      setBox(L.stack, left, y + y0, x + fx1 - left, y1 - y0);
    };
    fit();
    // Clear of the till: first slide left (keeping the newest piece over the paw zone), else rise above the till.
    if (meets(L.stack, L.till, 2)) {
      const xl = L.till.x - 4 - fx1;
      if (xl >= z.x && xl + fx0 >= 4) { x = xl; fit(); }
      if (meets(L.stack, L.till, 2)) { y = Math.max(4 - y0, L.till.y - 4 - y1); fit(); }
    }
    stackX = x; stackY = y;
  }
  /** The paw zone: centred on the open paw where it fits, else shifted (always keeping the paw inside it). */
  function placePaw(tp: TierParams): boolean {
    const zw = Math.max(96, tp.paw[0] * u), zh = Math.max(96, tp.paw[1] * u);
    for (let j = 0; j < 9; j++) {
      const dx = SHIFT3[j % 3]! * zw * 0.38, dy = SHIFT3[Math.floor(j / 3)]! * zh * 0.38;
      setBox(L.pawZone, pawX - zw / 2 + dx, pawY - zh / 2 + dy, zw, zh);
      if (!clearOfEdges(L.pawZone) || meets(L.pawZone, L.board) || meets(L.pawZone, L.till) || (dishInChange && meets(L.pawZone, L.foot))) continue;
      return true;
    }
    return false;
  }
  /** A zone covering two drawn boxes and at least `zw` x `zh`, centred on them. */
  function unionZone(out: Box, a: Box, b: Box, zw: number, zh: number): void {
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
    const w = Math.max(zw, x1 - x0), h = Math.max(zh, y1 - y0);
    setBox(out, (x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h);
  }
  function releaseArt(): void {
    for (const name of OWN_ART) sprites.clearScaled(name);
    for (const name of soundNames) sprites.clearScaled(name);
    warmDone.clear();
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    const image = sprites.get(BG); if (!image) return;
    // The background may finish loading after the last layout: fit it from the loaded image now, never at a stale scale.
    bgFit(image.naturalWidth, image.naturalHeight);
    bgCanvas = sprites.scaled(BG, bgScale);
    note(BG, bgScale, 1);
  }

  // ---------------------------------------------------------------- customers
  /** Demonstration bit for this customer's new idea (bit n for step n), or -1 when none is due. */
  function demoBit(): number {
    if (intro) return -1;
    return (data.cashDemos & (1 << plan.content)) === 0 ? plan.content : -1;
  }
  function startCustomer(i: number): void {
    customerIndex = i;
    const step = customerStep(data.cashStep, i, data.rounds), content = contentOf(step);
    if (intro && introStage === 2 && i === 0) plan = taughtCustomer(tier);
    // Steps 2, 4, 7 and 8 show their first demonstration with fixed numbers (13¢ paid with a quarter; 23¢ paid with two
    // quarters; $13 paid with $20; 75¢ paid with $2).
    else if (!intro && (DEMO_PLAN_STEPS as readonly number[]).includes(content) && (data.cashDemos & (1 << content)) === 0) plan = demoPlan(content, step, tier);
    else plan = planCustomer(step, tier, random, lastPrice);
    lastPrice = plan.price;
    who = intro ? (introStage === 1 ? 1 : i === 0 ? 0 : (2 + i) % CUSTOMER_COUNT) : (data.turn + i) % CUSTOMER_COUNT;
    if (intro && introStage === 2 && i === 0) good = 3;
    else { let g = Math.floor(random() * GOODS_COUNT); if (g === good) g = (g + 1) % GOODS_COUNT; good = g; }
    good2 = (good + 3) % GOODS_COUNT;
    if (!intro || introStage === 2) { roundWho[i] = who; roundGoods[i] = good; }
    resetCustomer();
    layout(W, H);
    prioritizeVoice(audio, customerClips());
    moment = ENTER; momentT = 0;
    play('whoosh', 'B', 0, 0.45);
  }
  function resetCustomer(): void {
    dishLanded = 0; pourIdx = 0; pourLeft = 0; lit = 0; given = 0; committed = 0; counter = 0; countLeft = 0; pawN = 0; pawLost = 0; asked = false;
    cupsTotal = planned();
    cupPulse.fill(9); dishHop.fill(9); wellHop.fill(9);
    assisted = intro; deliberate = true; actions = 0; bounced = false; bouncesHere = 0;
    custHop = 9; tagSwing = 0; boardPulse = 9; itemFly = 0; tillUp = 0;
    idleT = 0; focus = 0; hand.mode = 0; carry.active = false;
    pawHop = 9; carryT = 9; cheerT = -1; tillSounded = false;
    // An arrow pressed for the customer before does not make this customer's first key choice deliberate.
    arrowedHere = false; lastArrowAt = -9999;
    for (const f of flights) if (f.mode !== F_RETURN) f.active = false;
  }
  /** The payment drops from the customer's paw into the dish, one piece after another. */
  function startDrop(): void {
    dropTo = dishN; moment = DROP; momentT = 0;
    for (let i = 0; i < dishN; i++) {
      const f = launch(F_DROP, dishKind[i]!, i, pawX, pawY, dishPx[i]!, dishPy[i]!, isBill(dishKind[i]!) ? BILL_FLUTTER : DROP_FLY);
      if (f) f.t = -i * DROP_STAGGER;
    }
  }
  function startPour(): void { moment = POUR; momentT = 0; pourLeft = 0; }
  /** Step 9: the two tags slide together into one and the second item's cups join the first's, then the payment drops. */
  function startMerge(): void {
    moment = MERGE; momentT = 0; mergeDur = MERGE_SECONDS; mergePopped = false;
    const bit = demoBit();
    if (bit >= 0) { data.cashDemos |= 1 << bit; assisted = true; mergeDur = MERGE_DEMO; startPoints(TG_TAG2, TG_TAG); }
  }
  /**
   * How far step 9's tags have slid together (1 when they are one, and for every other customer): the tags slide
   * together in the first MERGE_TAGS of the merge, and the total appears on the board as they meet; then the merge
   * holds a moment before the payment drops.
   */
  const mergeTagK = (): number => (!two() ? 1 : moment === ENTER ? 0 : moment === MERGE ? easeInOutSine(clamp01(momentT / (mergeDur * MERGE_TAGS))) : 1);
  const mergeK = (): number => (!two() ? 1 : moment === ENTER ? 0 : moment === MERGE ? clamp01(momentT / mergeDur) : 1);
  /** Change counting starts once the payment has poured; a step's first customer gets its demonstration. */
  function startChange(): void {
    moment = CHANGE; momentT = 0; idleT = 0; counter = 0;
    showTrack();
    focusHelpful();
    if (intro && introStage === 1) return;
    if (intro && introStage === 2 && customerIndex === 0) { data.cashDemos |= 1 << 1; startCarryDemo(); return; }
    if (two()) return;
    const bit = demoBit(); if (bit >= 0) { data.cashDemos |= 1 << bit; assisted = true; startCarryDemo(); }
  }
  function startGlide(): void { moment = GLIDE; momentT = 0; play('go', 'C', 0, 0.7); if (cheerT < 0) startCheer(); }
  /** The customer is happy: it cheers (bigger with each customer of the round) and carved chips fly. */
  function startCheer(): void {
    cheerT = 0; cheerLevel = intro && introStage === 1 ? 0 : Math.min(3, customerIndex);
    particles.chips(custX, Yc - custH * 0.4, 4 + 3 * cheerLevel, (240 + 30 * cheerLevel) * u, 0b1111);
    if (cheerLevel >= 2) particles.glints(custX, Yc - custH * 0.5, cheerLevel, custW * 0.4);
  }
  /**
   * The board's moments, one function each: the price shown at the track's tag end, the payment shown at its dish end
   * (the pour has finished; counting starts once the customer has said it and asked for its change), the marker's
   * numeral changed, and the marker reaching the dish end (done). The first two speak (see voice.ts).
   */
  function priceShown(): void { if (!goal()) queueVoice(costsClip(cents(plan.price)), OPENING_GAP); }
  function paymentShown(): void { if (!goal()) { queueVoice(payClip(cents(planned())), OPENING_GAP); queueVoice(QUESTION_CLIP, OPENING_GAP); } }
  /** The customer asks for its item as it sets it down (both items at step 9). */
  function itemShown(): void {
    if (goal()) return;
    // One of the item's wordings at random, never the same opener as the customer before.
    const pick = pickItemClip(good, two() ? good2 : -1, lastOpener, random);
    if (pick.opener >= 0) lastOpener = pick.opener;
    queueVoice(pick.clip, OPENING_GAP);
  }
  function counterChanged(): void { /* voiced in a later round */ }
  function trackDone(): void { /* voiced in a later round */ }
  /** Change counting starts: the marker appears at the tag end and (steps 1 to 3) the dots pop in left to right. */
  function showTrack(): void {
    for (let i = 0; i < dotsN && i < MAX_CUPS; i++) cupPulse[i] = -i * 0.03;
  }
  /** The introduction's goal customer: a wordless demonstration, so it asks nothing (its change total is still said). */
  const goal = (): boolean => intro && introStage === 1;
  /** An amount in the plan's unit, in cents. */
  const cents = (v: number): number => (plan.dollars ? v * 100 : v);
  /** Every clip this customer can say, for prioritizeVoice (once per customer, not per frame). */
  function customerClips(): string[] {
    return [...itemClips(good, two() ? good2 : -1), costsClip(cents(plan.price)), payClip(cents(planned())), QUESTION_CLIP, amountClip(cents(plan.change))];
  }
  function startLeave(): void {
    moment = LEAVE; momentT = 0; play('whoosh', 'A', 0, 0.5);
    // The change total, one whole clip, after anything still being said plus a short gap; the next customer waits for it.
    if (pawN) queueVoice(amountClip(cents(plan.change)), TOTAL_GAP);
  }
  function customerDone(): void {
    if (intro && introStage === 1) { introStage = 2; startCustomer(0); return; }
    served();
    if (customerIndex + 1 < customersTotal) startCustomer(customerIndex + 1);
    else finishRound();
  }
  /**
   * A customer of the round is served: its sale goes on the till's list for the closing count, it joins the cheering
   * crowd at the back of the stall, and the first two bring up a string of bunting each, so the stall looks busier.
   */
  function served(): void {
    if (salesN < MAX_SALES) { salePrice[salesN] = plan.price; saleDollars[salesN] = plan.dollars ? 1 : 0; salesN++; }
    for (let i = 0; i < dishN; i++) {
      const k = dishKind[i]!;
      if (isBill(k)) takenBills |= 1 << billOf(k); else takenCoins |= 1 << k;
    }
    if (crowdN < CROWD_MAX && !portrait) crowdAt[crowdN++] = roundT;
    if (buntN < 2) {
      const o = HARBOUR[OV_BUNTING + buntN]!;
      buntAt[buntN++] = roundT;
      play('paper-rustle', 'A', 0, 0.55);
      particles.chips(bgX + (o.x + o.w / 2) * bgScale, bgY + (o.y + o.h * 0.4) * bgScale, 8, 200 * u, 0b0111);
    }
  }
  /** Learning evidence for the customer that just finished: one result, only for deliberate unaided play at the current step. */
  function recordEvidence(right: boolean): void {
    if (intro || assisted || !deliberate || actions === 0 || plan.step !== data.cashStep) return;
    recordCustomer(data, right); roundCounted.push(right ? 1 : 0);
  }
  // ---------------------------------------------------------------- change
  /**
   * Whether a piece of this kind still fits the change owed (counting pieces already on their way) and leaves an amount
   * the till can still pay (rules' accepts).
   */
  const fits = (kind: number): boolean => accepts(kind, plan.change - committed, tillKind, tillN, plan.dollars);
  const wellOf = (kind: number): number => { for (let i = 0; i < tillN; i++) if (tillKind[i] === kind) return i; return -1; };
  /**
   * The well of the next piece when counting up from the price, as the demonstrations teach (rules' nextPiece): ones
   * to the next 5, a five to the next 10, then tens, and $1 bills from a whole dollar; -1 when nothing fits.
   */
  const inTill = (kind: number): boolean => wellOf(kind) >= 0;
  function bestWell(): number {
    const k = nextPiece(plan.price + committed, plan.change - committed, plan.dollars, inTill);
    return k < 0 ? -1 : wellOf(k);
  }
  function focusHelpful(): void { const b = bestWell(); focus = b >= 0 ? b : Math.min(focus, Math.max(0, tillN - 1)); }
  /** A piece goes to the paw: it joins the change, or (too much) shows its dots and hops back to its well. */
  function toPaw(well: number, kind: number, fromX: number, fromY: number, deliberateChoice: boolean, demo: boolean): void {
    idleT = 0;
    if (!demo) { actions++; if (!deliberateChoice) deliberate = false; }
    if (fits(kind)) { committed += value(kind); const f = launch(F_PAW, kind, well, fromX, fromY, stackX, stackY, TO_PAW); if (f) f.demo = demo; return; }
    bounced = true; bouncesHere++; bounces++;
    launch(F_BOUNCE, kind, well, fromX, fromY, stackX, stackY, TO_PAW + BOUNCE_HOLD + BOUNCE_HOP);
  }
  function launch(mode: number, kind: number, idx: number, x0: number, y0: number, x1: number, y1: number, dur: number): Flight | undefined {
    for (const f of flights) {
      if (f.active) continue;
      f.active = true; f.mode = mode; f.kind = kind; f.idx = idx; f.demo = false; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1; f.t = 0; f.dur = dur; f.giggles = 0;
      return f;
    }
    arrive(mode, kind, idx);
    return undefined;
  }
  function arrive(mode: number, kind: number, idx: number): void {
    if (mode === F_DROP) {
      dishLanded = Math.max(dishLanded, idx + 1); dishHop[idx] = 0;
      if (isBill(kind)) play('paper-rustle', 'A', 0, 0.5); else play('coin-stack', 'A', idx, 0.5);
      particles.chips(dishPx[idx]!, dishPy[idx]!, 3, 160 * u, pieceInks(kind, 0b1110), 0.8);
      return;
    }
    if (mode === F_PAW) {
      if (pawN >= MAX_PAW) { pawLost += value(pawKind[0]!); pawKind.copyWithin(0, 1); pawN--; }
      pawKind[pawN++] = kind;
      given += value(kind); countLeft += value(kind);
      countGap = Math.min(POUR_GAP_MAX, POUR_PIECE / value(kind));
      if (countTimer < 0) countTimer = 0;
      custHop = Math.min(custHop, 0.2); pawHop = 0;
      // Landing: the stack takes a squash and settles, a clink that climbs with the stack, carved chips and a glint.
      if (isBill(kind)) play('paper-rustle', 'A', 0, 0.6); else play('coin-stack', 'A', pawN - 1, 0.7);
      particles.chips(stackX, stackY, 6, 220 * u, pieceInks(kind, 0b1111));
      particles.glints(stackX, stackY - pieceH(kind) * 0.2, 1, pieceW(kind) * 0.3);
      return;
    }
    if (mode === F_BOUNCE || mode === F_RETURN) { if (idx >= 0 && idx < tillN) wellHop[idx] = 0; }
  }
  /** When the counter reaches the payment: cups pulse, the customer takes the change and the item and walks off. */
  function checkPaid(): void {
    if (moment !== CHANGE || countLeft > 0 || counter < plan.change) return;
    for (const f of flights) if (f.active && f.mode === F_PAW) return;
    if (carry.active) { carry.active = false; launch(F_RETURN, carry.kind, carry.well, input.pointer.x, input.pointer.y, wellX[carry.well]!, wellY[carry.well]!, RETURN_SECONDS); }
    if (hand.mode === HAND_TAP || hand.mode === HAND_HINT) hand.mode = 0;
    recordEvidence(!bounced);
    moment = PAID; momentT = 0; boardPulse = 0; startCheer();
    particles.glints(trackX1, trackY, 2, numPx);
    play('pop-big', 'C', 4, 0.8);
    trackDone();
  }

  // ---------------------------------------------------------------- helper hand
  /**
   * A step's change demonstration: the hand carries these pieces one after another (steps 1 and 3: one penny; step 2:
   * two pennies and a nickel, 14, 15, 20; step 4: two pennies and a nickel, 24, 25, 30; step 5: the first coin; step 6:
   * one $1 bill; step 7: two $1 bills, 14, 15; step 8: a nickel and two dimes, 80, 90, $1.00), then taps the well of the
   * next helpful piece, where the keyboard highlight also moves.
   */
  function startCarryDemo(): void {
    hand.kn = 0;
    const add = (k: number): void => { if (wellOf(k) >= 0 && hand.kn < 4) hand.kinds[hand.kn++] = k; };
    if (plan.content === 2 || plan.content === 4) { add(PENNY); add(PENNY); add(NICKEL); }
    else if (plan.content === 7) { add(B1); add(B1); }
    else if (plan.content === 8) { add(NICKEL); add(DIME); add(DIME); }
    else if (plan.content === 5) { const w = bestWell(); if (w >= 0) add(tillKind[w]!); }
    else add(plan.dollars ? B1 : PENNY);
    if (!hand.kn) return;
    hand.ki = 0; carryNext();
  }
  function carryNext(): void {
    const kind = hand.kinds[hand.ki]!;
    hand.mode = HAND_DEMO; hand.t = 0; hand.well = wellOf(kind); hand.kind = kind; hand.taken = false; hand.released = false;
  }
  /** The hand points at one target, then another (step 9's merge demonstration: the second tag, then the first). */
  function startPoints(a: number, b: number): void {
    hand.mode = HAND_POINTS; hand.t = 0; hand.seq[0] = a; hand.seq[1] = b; hand.n = 2; hand.released = false;
  }
  /** After quiet seconds: a see-through hint of the next helpful piece, carried from its well to the paw. */
  function startHint(): void {
    assisted = true;
    const w = bestWell(); if (w < 0) return;
    hand.mode = HAND_HINT; hand.t = 0; hand.well = w; hand.kind = tillKind[w]!; hand.taken = false; hand.released = false;
    focus = w;
  }
  /** Where a hand target is, into pos. */
  function targetPoint(t: number): void {
    if (t < MAX_WELLS) { pos.x = wellX[t] ?? W / 2; pos.y = wellY[t] ?? H; return; }
    if (t === TG_PAW) { pos.x = pawX; pos.y = pawY; return; }
    if (t === TG_TAG) { const b = L.fmtag; pos.x = b.x + b.w * 0.5; pos.y = b.y + b.h * 0.6; return; }
    tagNow(1); pos.x = tagAt.x + tagAt.w * 0.5; pos.y = tagAt.y + tagAt.h * 0.6;
  }
  function updateHand(dt: number): void {
    if (!hand.mode) return;
    hand.t += dt;
    if (hand.mode === HAND_TAP) return;
    if (hand.mode === HAND_POINTS) {
      if (hand.t >= hand.n * SEG + HAND_FADE) { hand.mode = 0; idleT = 0; }
      return;
    }
    // A carry (demonstration or hint): rise to the well, press, carry to the paw, let go, fade.
    if (hand.mode === HAND_DEMO && !hand.taken && hand.t >= HAND_CARRY_AT) {
      if (moment !== CHANGE) { hand.t = HAND_PRESS_AT; return; }
      hand.taken = true; play('pop', 'B', 2, 0.4);
    }
    if (!hand.released && hand.t >= HAND_DROP_AT) {
      hand.released = true;
      if (hand.mode === HAND_DEMO) toPaw(hand.well, hand.kind, pawX, pawY - 1, false, true);
    }
    if (hand.t >= HAND_DROP_AT + HAND_FADE) {
      if (hand.mode === HAND_DEMO && ++hand.ki < hand.kn) carryNext();
      else if (hand.mode === HAND_DEMO && moment === CHANGE) {
        const w = bestWell();
        if (w >= 0) { hand.mode = HAND_TAP; hand.t = 0; hand.well = w; focus = w; } else hand.mode = 0;
      } else hand.mode = 0;
      idleT = 0;
    }
  }
  /** The hand's fingertip now, into pos. */
  function handTip(): void {
    const t = hand.t;
    if (hand.mode === HAND_TAP) { targetPoint(hand.well); pos.x += coinD[PENNY]! * 0.1; pos.y += coinD[PENNY]! * 0.1 - Math.abs(Math.sin(t * 3.2)) * 22 * u; return; }
    if (hand.mode === HAND_POINTS) {
      const i = Math.min(hand.n - 1, Math.floor(t / SEG)), k = t - i * SEG;
      targetPoint(hand.seq[i]!); const tx = pos.x, ty = pos.y;
      let fx = tx + 60 * u, fy = H + 40;
      if (i > 0) { targetPoint(hand.seq[i - 1]!); fx = pos.x; fy = pos.y; }
      const e = easeInOutSine(clamp01(k / (SEG * 0.5)));
      pos.x = lerp(fx, tx, e); pos.y = lerp(fy, ty, e) - (k > SEG * 0.5 && k < SEG * 0.75 ? -6 * u : 0);
      return;
    }
    targetPoint(hand.well); const wx = pos.x, wy = pos.y;
    if (t < HAND_PRESS_AT) { const e = easeOutCubic(t / HAND_PRESS_AT); pos.x = lerp(wx + 60 * u, wx, e); pos.y = lerp(H + 40, wy, e); }
    else if (t < HAND_CARRY_AT) { pos.x = wx; pos.y = wy; }
    else if (t < HAND_DROP_AT) { const e = easeInOutSine((t - HAND_CARRY_AT) / (HAND_DROP_AT - HAND_CARRY_AT)); pos.x = lerp(wx, pawX, e); pos.y = lerp(wy, pawY, e) - Math.sin(e * Math.PI) * 90 * u; }
    else { pos.x = pawX; pos.y = pawY; }
  }

  // ---------------------------------------------------------------- round
  function startRound(): void {
    pending = null; data.pending = null; bookGlide = false;
    tier = services.debug.tier ?? toTier(data.tier);
    intro = data.rounds === 0;
    phase = 'play'; phaseT = time = idleT = 0;
    customersTotal = intro ? 3 : roundSize(data.cashStep, tier);
    // Nothing of the harbour carries over: no bunting, no crowd, no improvement until this round's own end.
    salesN = 0; takenCoins = 0; takenBills = 0; buntN = 0; crowdN = 0; buy = -1; buyK = 0; roundT = 0; buntAt.fill(-1); crowdAt.fill(-1);
    hits = misses = bounces = 0; stars = 1; starsPlayed = 0; roundCounted.length = 0; roundWho.length = 0; roundGoods.length = 0;
    carry.active = false; hand.mode = 0; cornerFocus = -1;
    particles.clear(); for (const f of flights) f.active = false;
    lastPrice = 0; good = -1;
    if (intro) startGoal(); else { introStage = 0; startCustomer(0); }
    guard(PLAY_GUARD_MS); services.save.flush();
    if (!fanfareStarted && audio.context) { fanfareStarted = true; if (prepareSfxStep(audio, 'fanfare', FANFARE)) fanfareAsked = true; }
  }
  /** The introduction's goal: the otter's 27¢ loaf, three dimes in the dish, three pennies hop into its paw. */
  function startGoal(): void {
    introStage = 1; customerIndex = 0; plan = goalCustomer(); who = 1; good = 0;
    resetCustomer(); layout(W, H);
    moment = ENTER; momentT = 0;
  }
  function chooseOffers(): string[] {
    if (!services.config.rewardsEnabled) return [];
    const owned = rewards(services).stickers, fresh = STICKERS.filter(st => st.game === GAME_ID && !owned.includes(st.id));
    if (!fresh.length) return [];
    const first = fresh.splice(Math.floor(random() * fresh.length), 1)[0]!;
    const second = fresh.length ? fresh[Math.floor(random() * fresh.length)] : undefined;
    return second ? [first.id, second.id] : [first.id];
  }
  function finishRound(): void {
    if (phase !== 'play') return;
    stars = ROUND_STARS;
    if (!intro && services.debug.tier === undefined) applyMotor(data, tier, hits, misses);
    if (!intro) applyLearning(data, roundCounted);
    data.rounds++;
    data.turn = (data.turn + customersTotal) % CUSTOMER_COUNT;
    const id = globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    pending = { id, stars, customers: customersTotal, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, tier, who: roundWho.slice(0, 6), goods: roundGoods.slice(0, 6) };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += stars;
    services.save.flush();
    carry.active = false; hand.mode = 0; cornerFocus = -1;
    for (const f of flights) f.active = false;
    // The takings buy one harbour change, in turn round by round (play material only: never saved, gone next round).
    buy = (data.rounds - 1) % 3;
    startClosing();
  }
  function startCelebration(): void {
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; layout(W, H);
    play('fanfare', FANFARE.variant!);
    // Linocut confetti: carved chips in all four inks, and gulls lifting off over the harbour.
    particles.chips(W * 0.5, H * 0.42, 34, 520 * u, 0b1111, 1.2);
    particles.chips(W * 0.3, H * 0.45, 14, 420 * u, 0b0111);
    particles.chips(W * 0.7, H * 0.45, 14, 420 * u, 0b0111);
    particles.gulls(W * 0.42, Yc - 40 * u, 3, -1); particles.gulls(W * 0.58, Yc - 40 * u, 3, 1);
  }

  // ---------------------------------------------------------------- the till count at closing
  /** Where the takings go for this round's change: the middle of the overlay it reveals, into pos. */
  function buyPoint(): void {
    const o = HARBOUR[buy === BUY_SAILS ? OV_SAILS : buy === BUY_LAMP ? OV_LAMP : OV_PAINT]!;
    pos.x = bgX + (o.x + o.w / 2) * bgScale; pos.y = bgY + (o.y + o.h / 2) * bgScale;
  }
  function startClosing(): void {
    phase = 'closing'; phaseT = 0; closeT = 0; closeSpeed = 1; closePopped = false; closeStreamed = false; closeRevealed = false;
    closeCupD.fill(9); closeCupC.fill(9); shownD = 0; shownC = 0;
    let c = 0, d = 0; saleCum[0] = 0; saleCumD[0] = 0;
    for (let k = 0; k < salesN; k++) { if (saleDollars[k]) d += salePrice[k]!; else c += salePrice[k]!; saleCum[k + 1] = c; saleCumD[k + 1] = d; }
    // The exact sum of the round's prices, in whole dollars and the cents that do not make a dollar.
    closeDollars = d + Math.floor(c / 100); closeCents = c % 100;
    closeTotalAt = CLOSE_OPEN + salesN * CLOSE_SALE + 0.1; closeBuyAt = closeTotalAt + CLOSE_HOLD;
    closeEndAt = closeBuyAt + 0.45 + CLOSE_REVEAL + CLOSE_END;
    const gap = closeTagW * 1.12;
    for (let k = 0; k < salesN; k++) closeTagX[k] = W / 2 + (k - (salesN - 1) / 2) * gap;
    // Cups as large as this round's rows allow: the cents grid needs ten rows when 100 cents trade for a dollar.
    const rows = Math.max(1, Math.ceil(closeDollars / 10), c >= 100 ? 10 : Math.ceil(c / 10)), both = closeDollars > 0 && closeCentsShown();
    closePitch = Math.max(MIN_CUP / 0.9, Math.min(40 * u, closeRowsH / (rows + 0.3), L.slatePanel.w / (both ? 23.2 : 10.8)));
    const cup = Math.max(MIN_CUP, Math.floor(closePitch * 0.9));
    if (cup !== bakedCloseCup || !closeCupCanvas) { bakedCloseCup = closeCup = cup; closeCupCanvas = bakeCup(cup, artRatio, CUP_PAID); }
    const dollarCup = dollarCupD(closePitch);
    if (dollarCup !== bakedCloseDollar || !closeDollarCanvas) { bakedCloseDollar = dollarCup; closeDollarCanvas = bakeCup(dollarCup, artRatio, CUP_DOLLAR); }
    while (!closingBaked() && bakeClosing());
    play('till-drawer', 'A', 0, 0.8);
  }
  /** Cups the slate shows at time t, into pos (x dollars, y cents): every sale's units poured so far, 100 cents traded for a dollar. */
  function closingCounts(t: number): void {
    let d = 0, c = 0;
    for (let k = 0; k < salesN; k++) {
      const s0 = CLOSE_OPEN + k * CLOSE_SALE + CLOSE_TAG * 0.8, f = clamp01((t - s0) / (CLOSE_SALE - CLOSE_TAG * 0.8));
      const n = Math.floor(f * salePrice[k]! + 1e-6);
      if (saleDollars[k]) d += n; else c += n;
    }
    pos.x = d + Math.floor(c / 100); pos.y = c % 100;
  }
  function updateClosing(dt: number): void {
    phaseT += dt; time += dt; roundT += dt;
    const before = closeT;
    closeT += dt * closeSpeed;
    const t = closeT;
    for (let i = 0; i < MAX_CUPS; i++) { closeCupD[i]! += dt; closeCupC[i]! += dt; }
    for (let k = 0; k < salesN; k++) {
      const s0 = CLOSE_OPEN + k * CLOSE_SALE;
      if (before < s0 && t >= s0) play('whoosh', 'B', 0, 0.35);
      if (before < s0 + CLOSE_TAG && t >= s0 + CLOSE_TAG) { play('pop', 'D', 2 + k, 0.5); particles.chips(closeTagX[k]!, closeTagY + closeTagW * 0.3, 3, 150 * u, 0b0110, 0.8); }
    }
    closingCounts(t);
    const nd = pos.x, nc = pos.y;
    if (nd !== shownD || nc !== shownC) {
      if (nd > shownD && nc < shownC) {
        // 100 cents trade for one dollar cup: the cent cups clear with a pop and the new dollar cup lands.
        play('pop-big', 'B', 3, 0.6);
        cupCentre(true, nd - 1); particles.glints(pos.x, pos.y, 3, closePitch * 2);
        particles.chips(pos.x, pos.y, 6, 200 * u, 0b0110, 0.8);
      }
      for (let i = shownD; i < nd && i < MAX_CUPS; i++) closeCupD[i] = 0;
      for (let i = nc < shownC ? 0 : shownC; i < nc; i++) closeCupC[i] = 0;
      play('tick', 'C', (nd + nc) % 10, 0.6);
      shownD = nd; shownC = nc;
    }
    if (!closePopped && t >= closeTotalAt) {
      closePopped = true; play('pop-big', 'C', 4, 0.8);
      const cx = L.slatePanel.x + L.slatePanel.w / 2, cy = L.slatePanel.y + closePx * 0.75;
      particles.chips(cx, cy, 12, 300 * u, 0b1111); particles.glints(cx, cy, 4, closePx * 2);
    }
    if (buy >= 0 && t >= closeBuyAt && t < closeBuyAt + CLOSE_STREAM) {
      // The takings fly to the harbour as a stream of silver, copper and cream chips (the coins' metals and the bills' paper).
      if (!closeStreamed) { closeStreamed = true; play('whoosh', 'C', 0, 0.6); }
      buyPoint();
      // From the total at the top of the slate, at the end of it nearest the harbour spot, so the stream never crosses the cups.
      const panel = L.slatePanel, away = easeInCubic(clamp01((t - closeBuyAt - 0.2) / CLOSE_AWAY)), sdy = -away * (L.slate.y + L.slate.h + 20);
      const sx = Math.min(panel.x + panel.w - closePitch * 2, Math.max(panel.x + closePitch * 2, pos.x)) + (Math.random() - 0.5) * closePitch * 3;
      const sy = panel.y + closePx * 0.75 + sdy + (Math.random() - 0.5) * closePx * 0.4, life = 0.45;
      const r = Math.random();
      particles.spawn((r < 0.5 ? 5 : r < 0.75 ? 4 : 3) + INK_COUNT * Math.floor(Math.random() * 3), sx, sy, (pos.x - sx) / life, (pos.y - sy) / life, life, 1, 0, 8, 0);
    }
    const revealAt = closeBuyAt + 0.45;
    if (buy >= 0 && t >= revealAt) {
      if (!closeRevealed) { closeRevealed = true; play('harbour-chime', 'A', 0, 0.8); }
      const k0 = buyK; buyK = clamp01((t - revealAt) / CLOSE_REVEAL);
      buyPoint();
      if (buyK < 1 && Math.random() < 0.5) particles.chips(pos.x, pos.y, 1, 160 * u, 0b0101, 0.8);
      if (k0 < 1 && buyK >= 1) { particles.gulls(pos.x, pos.y - 20 * u, 3, pos.x < W / 2 ? 1 : -1); particles.glints(pos.x, pos.y, 4, 60 * u); }
    }
    if (t >= closeEndAt) startCelebration();
  }
  /** Centre of the slate's cup i in the dollar grid (or the cent grid), into pos. */
  function cupCentre(dollarGrid: boolean, i: number): void {
    const p = closePitch, both = closeDollars > 0 && closeCentsShown(), gw = 10.6 * p, panel = L.slatePanel;
    const gx = both ? panel.x + (panel.w - 2 * gw - 1.6 * p) / 2 + (dollarGrid ? 0 : gw + 1.6 * p) : panel.x + (panel.w - gw) / 2;
    const row = Math.floor(i / 10), col = i % 10;
    pos.x = gx + p * (col + 0.5 + (col >= 5 ? 0.6 : 0));
    pos.y = panel.y + closePx * 1.5 + closePx * 0.75 + p * (row + 0.5);
  }
  /** Whether the slate has a cents grid this round (any sale in cents). */
  function closeCentsShown(): boolean { for (let k = 0; k < salesN; k++) if (!saleDollars[k]) return true; return false; }
  const celebrationLocked = (): boolean => phaseT < Math.max(1.5, STAR_START + (stars - 1) * STAR_GAP_SECONDS + STAR_HIT_SECONDS);
  function finishCelebration(): void {
    if (phase !== 'celebration') return;
    particles.clear();
    if (pending?.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
    else enterRest();
  }
  function enterRest(): void {
    phase = 'rest'; phaseT = 0; guard(MENU_GUARD_MS); particles.clear();
    if (!pending?.restEntered) {
      if (pending) pending.restEntered = true;
      services.save.flush(); services.roundBoundary();
    }
  }
  function chooseSticker(index: number): void {
    if (phase !== 'choice' || !pending || pending.chosen || !pending.rewardEnabled || !services.config.rewardsEnabled) return;
    const id = pending.choices[index]; if (!id) return;
    const bag = rewards(services); if (!bag.stickers.includes(id)) bag.stickers.push(id);
    pending.chosen = id; menuSelected = index;
    services.save.flush(); phase = 'sticker'; phaseT = 0; guard(PLAY_GUARD_MS); play('sticker', 'C');
    offers.pick(index); bookGlide = true;
  }
  function closeFinishedRound(): void {
    if (phase !== 'rest') return;
    data.pending = null; pending = null; services.save.flush();
  }
  function leave(replay: boolean): void {
    if (phase !== 'rest') return;
    closeFinishedRound();
    if (replay) { play('whoosh', 'A'); startRound(); } else { play('button', 'B'); services.nav.toHub(); }
  }
  function exitToHub(): void { closeFinishedRound(); services.save.flush(); services.nav.toHub(); }
  function guard(ms: number): void { inputAfter = performance.now() + ms; menuSelected = -1; }

  // ---------------------------------------------------------------- warm-up of end-of-round art
  function celebH(): number { return Math.min(CUST_H * u, H * 0.5); }
  function planWarm(): void {
    warmNames.length = 0; warmSizes.length = 0; warmIndex = 0;
    const add = (name: string, size: number): void => { warmNames.push(name); warmSizes.push(Math.round(size)); };
    const exact = (name: string, size: number): void => { warmNames.push(name); warmSizes.push(size); };
    for (let k = 0; k < 4; k++) { exact(COIN_FACES[k]![1]!, coinD[k]!); exact(COIN_FACES[k]![0]!, coinD[k]!); }
    for (let k = 0; k < 4; k++) exact(WELL, Math.max(96, Math.round(coinD[k]! + Math.max(8, WELL_PAD * u))));
    exact(SLOT, Math.round(billW * 1.12));
    for (let c = 0; c < CUSTOMER_COUNT; c++) { exact(CUST_NAMES[c]![0]!, CUST_H * u); exact(CUST_NAMES[c]![1]!, CUST_H * u * CUSTOMERS[c]!.hh / 760); }
    exact(HAND, Math.round(150 * u));
    // The board's track ends: the price tag and the dish at these widths.
    exact(DISH, dishIconW); exact(TAG, tagIconW);
    for (let g = 0; g < GOODS_COUNT; g++) {
      const gd = GOODS[g]!, tall = Math.max(1, gd.h / gd.w);
      for (const iw of [ITEM_W * u * 0.85, ITEM_W * u * 0.85 * 0.72]) exact(GOOD_NAMES[g]!, iw * tall);
    }
    for (const [h, gk] of [[celebH(), 0.3], [restSize * 0.62, 0.3]] as const) {
      for (let c = 0; c < CUSTOMER_COUNT; c++) exact(CUST_NAMES[c]![1]!, h * CUSTOMERS[c]!.hh / 760);
      for (let g = 0; g < GOODS_COUNT; g++) { const gd = GOODS[g]!; exact(GOOD_NAMES[g]!, h * gk * Math.max(gd.w, gd.h) / gd.w); }
    }
    add(BUTTON_PLAY, controlsRadius * 1.3); add(BUTTON_HOME, controlsRadius * 1.3);
    // The harbour overlays at the background's scale, the crowd at the back, and the round end's small tags.
    for (const o of HARBOUR) exact(o.name, Math.max(o.w, o.h) * bgScale);
    for (let c = 0; c < CUSTOMER_COUNT; c++) exact(CUST_NAMES[c]![1]!, crowdH * CUSTOMERS[c]!.hh / 760);
    exact(TAG, closeTagW);
  }
  /**
   * Idle periods with at least 4 ms left: the fanfare a step at a time, then one planned sprite canvas each. A
   * callback that timed out, or a wait of IDLE_WAIT_MS over many short idle periods, runs one step anyway.
   */
  function prepareIdle(deadline: IdleDeadline): void {
    idleHandle = 0;
    const overdue = deadline.didTimeout || (idleWaitFrom >= 0 && performance.now() - idleWaitFrom >= IDLE_WAIT_MS);
    if (!fanfareAsked && fanfareStarted) {
      while (overdue || deadline.timeRemaining() >= 4) {
        idleWaitFrom = -1;
        if (prepareSfxStep(audio, 'fanfare', FANFARE)) { fanfareAsked = true; break; }
        if (overdue) break;
      }
      return;
    }
    if (madeN || (!overdue && deadline.timeRemaining() < 4)) return;
    if (trayWant) { bakeTray(); idleWaitFrom = -1; return; }
    if (boardQueue.length) { const bw = boardQueue.shift()!; bakeBoard(bw, boardHeight()); idleWaitFrom = -1; return; }
    if (!closingBaked() && bakeClosing()) { closingFresh = true; idleWaitFrom = -1; return; }
    for (; warmIndex < warmNames.length; warmIndex++) {
      const name = warmNames[warmIndex]!, size = warmSizes[warmIndex]!, key = `${name}@${size}`;
      if (warmDone.has(key)) continue;
      const img = sprites.get(name); if (!img) continue;
      sprites.scaled(name, size / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
      madeNames[madeN] = name; madeSizes[madeN] = size; madeN++; idleWaitFrom = -1;
      if (madeN >= 4 || overdue || deadline.timeRemaining() < 6) { warmIndex++; return; }
    }
  }
  function warm(ctx: CanvasRenderingContext2D): void {
    if (closingFresh) {
      // A fresh bake uploads on its first draw: draw it once nearly invisible, before the round end needs it.
      closingFresh = false; ctx.globalAlpha = 0.01;
      if (slateCanvas) ctx.drawImage(slateCanvas, 0, 0, 4, 4);
      if (ctrayCanvas) ctx.drawImage(ctrayCanvas, 0, 0, 4, 4);
      ctx.globalAlpha = 1;
    }
    if (!madeN) return;
    ctx.globalAlpha = 0.01;
    for (let i = 0; i < madeN; i++) { drawSprite(ctx, sprites, madeNames[i]!, W / 2, H / 2, madeSizes[i]!); warmDone.add(`${madeNames[i]}@${madeSizes[i]}`); }
    ctx.globalAlpha = 1; madeN = 0;
  }
  function askIdle(): void {
    if (idleHandle) return;
    if ((fanfareStarted && !fanfareAsked) || (playable() && time >= 0.5 && (warmIndex < warmNames.length || trayWant || boardQueue.length || !closingBaked()))) {
      const now = performance.now();
      if (idleWaitFrom < 0) idleWaitFrom = now;
      IDLE_OPTIONS.timeout = Math.max(1, IDLE_WAIT_MS - (now - idleWaitFrom));
      idleHandle = requestIdleCallback(prepareIdle, IDLE_OPTIONS);
    }
  }
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; idleWaitFrom = -1; }

  // ---------------------------------------------------------------- update
  function updatePlay(dt: number): void {
    time += dt; momentT += dt; roundT += dt;
    custHop += dt; tagSwing += dt; boardPulse += dt;
    pawHop += dt; carryT += dt; if (cheerT >= 0) cheerT += dt;
    for (let i = 0; i < MAX_DISH; i++) dishHop[i]! += dt;
    for (let i = 0; i < MAX_WELLS; i++) wellHop[i]! += dt;
    for (let i = 0; i < MAX_CUPS; i++) cupPulse[i]! += dt;
    if (tillShown()) {
      if (!tillSounded) { tillSounded = true; play('till-drawer', 'A', 0, 0.6); }
      tillUp = Math.min(1, tillUp + dt / 0.35);
    }
    if (moment === ENTER) {
      if (momentT >= ENTER_SECONDS) {
        tagSwing = 0; play('pop', 'D', 1, 0.4);
        if (intro && introStage === 1) {
          // The goal shows its payment already poured, then three pennies hop into the paw.
          dishLanded = dishN; lit = cupsTotal; moment = CHANGE; momentT = 0; tillUp = 1; showTrack();
        } else if (two()) { itemShown(); startMerge(); }
        else { itemShown(); startDrop(); priceShown(); }
      }
    } else if (moment === MERGE) {
      if (!mergePopped && momentT >= mergeDur * MERGE_TAGS) {
        // The tags meet: one tag with the total, and the total on the board.
        mergePopped = true; play('pop-big', 'B', 2, 0.6); tagSwing = 0;
        tagNow(2); particles.chips(tagAt.x + tagAt.w / 2, tagAt.y + tagAt.h * 0.4, 7, 260 * u, 0b0110);
        particles.glints(tagCx, trackY, 3, numPx);
        priceShown();
      }
      if (momentT >= mergeDur) startDrop();
    } else if (moment === DROP) {
      let flying = false; for (const f of flights) if (f.active && f.mode === F_DROP) flying = true;
      if (!flying && dishLanded >= dropTo) { pourIdx = 0; startPour(); }
    } else if (moment === POUR) updatePour(dt);
    else if (moment === CHANGE) {
      if (intro && introStage === 1) {
        const n = Math.floor((momentT - GOAL_START) / GOAL_GAP) + 1, w = wellOf(PENNY);
        if (momentT >= GOAL_START && committed < Math.min(3, n) && w >= 0) toPaw(w, PENNY, wellX[w]!, wellY[w]!, false, true);
      }
      updateCount(dt); checkPaid(); idleTick(dt);
    } else if (moment === PAID) { updateCount(dt); if (momentT >= PAID_PULSE) startGlide(); }
    else if (moment === GLIDE) { itemFly = clamp01(momentT / GLIDE_SECONDS); if (momentT >= GLIDE_SECONDS) startLeave(); }
    else if (moment === LEAVE) { if (momentT >= LEAVE_SECONDS && !voiceBusy(audio)) customerDone(); }
    updateHand(dt);
  }
  /**
   * The payment pours onto the board one unit at a time, largest piece first (the piece hops as it pours): the payment
   * line climbs, and at steps 1 to 3 the cups light. A bill worth 100¢ or more pours over DOLLAR_POUR seconds with a
   * tick every ten cents ($5: every fifty).
   */
  function updatePour(dt: number): void {
    if (pourLeft <= 0) {
      // The payment has poured: the customer says it and asks for its change; counting starts once it has asked, so the
      // child hears the question and every coin or bill name after it (with the sound off this takes no time).
      if (pourIdx >= dropTo) {
        if (!asked) { asked = true; paymentShown(); }
        if (!customerSpeaking(audio)) startChange();
        return;
      }
      const v = value(dishKind[pourIdx]!);
      pourLeft = v; pourGap = v >= 100 ? DOLLAR_POUR / v : Math.min(POUR_GAP_MAX, POUR_PIECE / v); pourTimer = 0; dishHop[pourIdx] = 0; pourIdx++;
      pourEvery = v >= 500 ? 50 : pourGap >= 0.02 ? 1 : 10;
    }
    pourTimer -= dt;
    while (pourLeft > 0 && pourTimer <= 0) {
      lit = Math.min(cupsTotal, lit + 1); pourLeft--; pourTimer += pourGap;
      if (lit % pourEvery === 0) play('tick', 'C', pourEvery === 1 ? (lit - 1) % 10 : Math.floor((lit - 1) / pourEvery) % 10, pourGap < POUR_GAP_MAX ? 0.5 : 0.7);
    }
  }
  /** The marker's numeral climbs one unit at a time from the price as change lands; at steps 1 to 3 each cent's dot lights. */
  function updateCount(dt: number): void {
    if (countLeft <= 0) { countTimer = 0; return; }
    countTimer -= dt;
    while (countLeft > 0 && countTimer <= 0) {
      counter++; countLeft--; countTimer += countGap;
      if (counter - 1 < MAX_CUPS) cupPulse[counter - 1] = 0;
      play('tick', 'C', (plan.price + counter - 1) % 10, 0.7);
      counterChanged();
    }
  }
  function idleTick(dt: number): void {
    idleT += dt;
    if (intro && introStage === 1) return;
    const wait = bouncesHere >= 2 ? IDLE_SOON : IDLE_SECONDS;
    if (!hand.mode && !carry.active && !busy() && idleT >= wait) { startHint(); idleT = wait - IDLE_REPEAT; }
  }
  /** A piece is flying to the paw, the counter is climbing, or a demonstration runs: new pieces wait (the pressed one hops). */
  function busy(): boolean {
    if (hand.mode === HAND_DEMO) return true;
    for (const f of flights) if (f.active && (f.mode === F_PAW || f.mode === F_BOUNCE)) return true;
    return false;
  }
  function updateFlights(dt: number): void {
    for (const f of flights) {
      if (!f.active) continue;
      f.t += dt;
      if (f.mode === F_BOUNCE) while (f.giggles < 3 && f.t >= TO_PAW + f.giggles * 0.09) {
        if (f.giggles === 0) custHop = 0;
        play('pop', 'A', f.giggles === 1 ? 6 : 8, 0.4); f.giggles++;
      }
      if (f.t >= f.dur) { f.active = false; arrive(f.mode, f.kind, f.idx); }
    }
  }
  function updateResult(dt: number): void {
    phaseT += dt; time += dt;
    if (phase === 'celebration') {
      const shown = Math.min(stars, Math.max(0, Math.floor((phaseT - STAR_START - STAR_HIT_SECONDS) / STAR_GAP_SECONDS) + 1));
      if (shown > starsPlayed) { play('star', 'B', starsPlayed); starsPlayed = shown; }
      if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
    } else if (phase === 'sticker' && phaseT >= PICK_SECONDS) enterRest();
    if (phase === 'celebration' || phase === 'choice' || phase === 'sticker') warmOffers();
    offers.update(dt, phase === 'choice' ? menuSelected : -1);
  }

  // ---------------------------------------------------------------- render
  /**
   * A coin at (x, y), `scale` of its tier size, `sx` stretching its width on top. Its front shows (the back only while
   * it turns over in flight), and its value tag hangs from its lower edge, moving, scaling and turning with it.
   */
  function coin(ctx: CanvasRenderingContext2D, kind: number, face: number, x: number, y: number, scale: number, rot = 0, sx = 1, tagged = true): void {
    const d = coinD[kind]!;
    drawSprite(ctx, sprites, COIN_FACES[kind]![face]!, x, y, d, rot, sx * scale, scale);
    note(COIN_FACES[kind]![face]!, d * scale * Math.max(1, sx), COIN_PX);
    if (tagged && face === 0) queueTag(kind, x, y, scale, sx, rot, ctx.globalAlpha);
  }
  /**
   * Value tags wait in a list and draw after every coin of the layer (flushTags), so no coin ever covers part of a tag
   * and makes it read another value. Typed arrays: queuing allocates nothing.
   */
  function queueTag(kind: number, x: number, y: number, scale: number, sx: number, rot: number, alpha: number): void {
    if (tagN >= TAGS_MAX) return;
    qKind[tagN] = kind; qX[tagN] = x; qY[tagN] = y; qS[tagN] = scale; qSx[tagN] = sx; qRot[tagN] = rot; qA[tagN] = alpha; tagN++;
  }
  function flushTags(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < tagN; i++) {
      const kind = qKind[i]!, t = coinTagCanvas[kind]; if (!t) continue;
      const scale = qS[i]!, x = qX[i]!, y = qY[i]!, rot = qRot[i]!;
      const w = t.width / artRatio * scale * qSx[i]!, h = t.height / artRatio * scale, oy = coinD[kind]! * 0.5 * scale;
      ctx.globalAlpha = qA[i]!;
      if (rot === 0) ctx.drawImage(t, x - w / 2, y + oy - h / 2, w, h);
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(t, -w / 2, oy - h / 2, w, h); ctx.restore(); }
    }
    ctx.globalAlpha = 1; tagN = 0;
  }
  /** A bill at full size anywhere (dish, till, paw, in flight); it never squashes below its size. `kind` is the bill art ($1, $5, $10, $20). */
  function bill(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, scale: number, rot = 0, sx = 1): void {
    const c = billCanvas[kind]; if (!c) return;
    const w = billW * scale * sx, h = billH * scale;
    if (rot === 0) ctx.drawImage(c, x - w / 2, y - h / 2, w, h);
    else { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(c, -w / 2, -h / 2, w, h); ctx.restore(); }
    note(BILLS[kind]!, w, BILL_PX);
  }
  /** A piece at (x, y): `scale` is its height scale, `sx` stretches its width on top (squash and stretch). */
  function piece(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, scale: number, rot = 0, sx = 1): void {
    if (isBill(kind)) bill(ctx, billOf(kind), x, y, scale, rot, sx); else coin(ctx, kind, 0, x, y, scale, rot, sx);
  }
  /**
   * The carried piece, lifted (1.12 of its size) over a baked soft shadow: on pick-up it squashes wide and springs
   * back over 0.35 s; while carried it sways a little with the pointer's speed.
   */
  function renderCarry(ctx: CanvasRenderingContext2D): void {
    if (!carry.active) return;
    const x = input.pointer.x, y = input.pointer.y, t = carryT;
    const e = t < 0.4 ? Math.cos(t * 28) * Math.exp(-t * 10) : 0, sy = 1.12 * (1 - 0.12 * e), sx = (1.12 * (1 + 0.14 * e)) / sy;
    const w = pieceW(carry.kind) * 1.12, h = pieceH(carry.kind) * 1.12, off = Math.max(6, 12 * u);
    if (shadowCanvas) ctx.drawImage(shadowCanvas, x - w * 0.55 + off, y - h * 0.5 + off, w * 1.1, h * 1.05);
    const sway = Math.max(-0.18, Math.min(0.18, (input.pointer.x - input.pointer.previousX) * 0.01));
    const lift = Math.min(1, t / 0.1) * 12 * u + (t < 0.25 ? Math.sin(t / 0.25 * Math.PI) * 8 * u : 0);
    piece(ctx, carry.kind, x, y - lift, sy, sway, sx);
  }
  /** One glyph from a strip at `k` of its size, left edge x, centred on cy. Returns the next x. */
  function glyph(ctx: CanvasRenderingContext2D, s: Strip, g: number, x: number, cy: number, k: number): number {
    const r = artRatio, sx = Math.max(0, (s.x[g]! - s.pad) * r), sw = (s.w[g]! + 2 * s.pad) * r, dh = s.c.height / r * k;
    ctx.drawImage(s.c, sx, 0, sw, s.c.height, Math.round(x - s.pad * k), Math.round(cy - dh / 2), sw / r * k, dh);
    return x + s.w[g]! * k;
  }
  /**
   * Width at size 1 of an amount as written: "$7" in dollars; in cents "26¢" under a dollar and "$1.25" from a dollar
   * up (a decimal point and two digits of cents).
   */
  function amountW(s: Strip, v: number, dollars: boolean): number {
    if (dollars) return s.w[G_DOLLAR]! * 0.72 + digitsW(s, v);
    if (v < 100) return digitsW(s, v) + s.w[G_CENT]!;
    const c = v % 100;
    return s.w[G_DOLLAR]! * 0.72 + digitsW(s, Math.floor(v / 100)) + s.w[G_DOT]! + s.w[Math.floor(c / 10)]! + s.w[c % 10]!;
  }
  /** An amount as written (amountW), centred on (cx, cy) at `k` of the strip's size. */
  function amount(ctx: CanvasRenderingContext2D, s: Strip, v: number, dollars: boolean, cx: number, cy: number, k: number): void {
    let x = cx - (amountW(s, v, dollars) * k) / 2;
    if (dollars || v >= 100) x = glyph(ctx, s, G_DOLLAR, x, cy - s.px * 0.1 * k, k * 0.72);
    if (dollars) { digitsAt(ctx, s, v, x, cy, k); return; }
    if (v < 100) { x = digitsAt(ctx, s, v, x, cy, k); glyph(ctx, s, G_CENT, x, cy, k); return; }
    const c = v % 100;
    x = digitsAt(ctx, s, Math.floor(v / 100), x, cy, k);
    x = glyph(ctx, s, G_DOT, x, cy, k);
    x = glyph(ctx, s, Math.floor(c / 10), x, cy, k); glyph(ctx, s, c % 10, x, cy, k);
  }
  /** An amount as text, as amount() writes it (debug stats). */
  const amountText = (v: number, dollars: boolean): string =>
    (dollars ? `$${v}` : v < 100 ? `${v}¢` : `$${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`);
  /** Width of the digits of v in strip s at size 1. */
  function digitsW(s: Strip, v: number): number { let w = 0; for (let d = 1; ; d *= 10) { w += s.w[Math.floor(v / d) % 10]!; if (d * 10 > v) return w; } }
  /** The digits of v from x at k of the strip's size; returns the next x. */
  function digitsAt(ctx: CanvasRenderingContext2D, s: Strip, v: number, x: number, cy: number, k: number): number {
    let top = 1; while (top * 10 <= v) top *= 10;
    for (let d = top; d >= 1; d = Math.floor(d / 10)) x = glyph(ctx, s, Math.floor(v / d) % 10, x, cy, k);
    return x;
  }
  /** An amount in dollars and cents, "$14.30" ("$14" with no cents, "30¢" with no dollars), centred. */
  function amountMixed(ctx: CanvasRenderingContext2D, s: Strip, dollars: number, cents: number, cx: number, cy: number, k: number): void {
    if (dollars > 0 && cents === 0) amount(ctx, s, dollars, true, cx, cy, k);
    else amount(ctx, s, dollars * 100 + cents, false, cx, cy, k);
  }
  /** A dot popping in: it comes down from 1.35 times its size, dips a little under and settles (0.3 s). */
  const popScale = (p: number): number => (p < 0.3 ? 1 + 0.35 * (1 - p / 0.3) * Math.cos(p / 0.3 * Math.PI * 1.5) : 1);
  /** The marker shows while change is counted and until the customer has left. */
  const markerShown = (): boolean => moment === CHANGE || moment === PAID || moment === GLIDE || moment === LEAVE;
  /** How far along the track the marker is: the change given so far over the change owed (0 at the tag end, 1 at the dish end). */
  const markerFrac = (): number => (markerShown() && plan.change > 0 ? clamp01(counter / plan.change) : 0);
  /** The payment shows at the dish end once it starts pouring (not while step 9's tags merge). */
  const paymentOnBoard = (): boolean => (lit > 0 || moment >= CHANGE) && moment !== MERGE;
  /** Where the marker's numeral is centred: under the marker, kept inside the panel. */
  function markerNumX(mx: number, v: number): number {
    const s = redBoard; if (!s) return mx;
    const hw = amountW(s, v, plan.dollars) / 2 + 2;
    return Math.min(L.panel.x + L.panel.w - hw, Math.max(L.panel.x + hw, mx));
  }
  /** An end amount centred on its icon, kept inside the panel. */
  function endX(cx: number, v: number): number {
    const s = inkEnd; if (!s) return cx;
    const hw = amountW(s, v, plan.dollars) / 2 + 2;
    return Math.min(L.panel.x + L.panel.w - hw, Math.max(L.panel.x + hw, cx));
  }
  /**
   * The board: a count-up track read left to right. At its left end a small copy of the price tag with the price above
   * it (step 9: the merged total, once the tags meet); at its right end a small copy of the dish with what was paid
   * above it (climbing as the payment pours). While change is counted a bright marker starts at the tag end and moves
   * toward the dish end by the fraction of change given, the track lighting behind it, with the climbing amount (the
   * price plus the change given) in large numerals under it: the only large number on the board. At steps 1 to 3 the
   * track shows one dot per cent of change, each turning orange-red as that cent is given. When the marker reaches the dish end
   * the whole board pulses once.
   */
  function renderBoard(ctx: CanvasRenderingContext2D): void {
    const b = L.board;
    const pulse = moment === PAID ? Math.sin(clamp01(momentT / PAID_PULSE) * Math.PI) : 0;
    if (pulse > 0) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, k = 1 + pulse * 0.05;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    }
    if (boardCanvas) {
      ctx.drawImage(boardCanvas, b.x, b.y, b.w, b.h);
      note(BOARD, frameK(b.h), 1);
    }
    // Step 9 shows the total as soon as the two tags meet, with a small pop.
    const since = moment === MERGE ? momentT - mergeDur * MERGE_TAGS : 9, pop = since >= 0 && since < 0.3 ? 1 + Math.sin(since / 0.3 * Math.PI) * 0.25 : 1;
    // The two ends: the price tag with the price, the dish with what was paid.
    drawSprite(ctx, sprites, TAG, tagCx, trackY, tagIconW); note(TAG, tagIconW, TAG_PX[0]);
    drawSprite(ctx, sprites, DISH, dishCx, trackY, dishIconW); note(DISH, dishIconW, DISH_PX[0]);
    if (inkEnd && mergeTagK() >= 1) amount(ctx, inkEnd, plan.price, plan.dollars, endX(tagCx, plan.price), endY, pop);
    if (inkEnd && paymentOnBoard()) amount(ctx, inkEnd, lit, plan.dollars, endX(dishCx, lit), endY, 1);
    // The track, lit from the tag end up to the marker.
    const len = trackX1 - trackX0, ty = trackY - trackT / 2, f = markerFrac();
    if (trackCanvas) ctx.drawImage(trackCanvas, trackX0, ty, len, trackT);
    if (trackLitCanvas && f > 0) ctx.drawImage(trackLitCanvas, 0, 0, Math.max(1, trackLitCanvas.width * f), trackLitCanvas.height, trackX0, ty, len * f, trackT);
    if (!markerShown()) { if (pulse > 0) ctx.restore(); return; }
    // Steps 1 to 3: one dot per cent of change, lit as each cent is given (they pop in left to right as counting starts).
    for (let i = 0; i < dotsN && i < MAX_CUPS; i++) {
      const p = cupPulse[i]!; if (p < 0) continue;
      const img = cupCanvas[i < counter ? 1 : 0]; if (!img) continue;
      const w = img.width / artRatio * popScale(p);
      ctx.drawImage(img, trackX0 + dotPitch * (i + 0.5) - w / 2, trackY - w / 2, w, w);
    }
    // The marker and its numeral (the price plus the change given so far).
    const mx = trackX0 + len * f;
    if (markerCanvas) {
      const pad = Math.max(3, markerH * 0.2), mw = markerCanvas.width / artRatio, mh = markerCanvas.height / artRatio;
      ctx.drawImage(markerCanvas, mx - mw / 2, markerTop - pad, mw, mh);
    }
    const v = plan.price + counter;
    if (redBoard) amount(ctx, redBoard, v, plan.dollars, markerNumX(mx, v), numY, 1);
    if (pulse > 0) ctx.restore();
  }
  /** Customer x on the counter now (walking in from the left, walking off to the right). */
  function custNowX(): number {
    if (moment === ENTER) return lerp(-custW * 0.6, custX, easeOutCubic(momentT / ENTER_SECONDS));
    if (moment === LEAVE) return lerp(custX, W + custW * 0.6, easeInCubic(momentT / LEAVE_SECONDS));
    return custX;
  }
  function renderCustomer(ctx: CanvasRenderingContext2D): void {
    const c = CUSTOMERS[who]!, happy = moment === GLIDE || moment === LEAVE || moment === PAID || custHop < 0.5;
    const x = custNowX();
    let hop = custHop < 0.42 ? Math.sin(custHop / 0.42 * Math.PI) * 16 * u : 0, rot = 0, squash = 0;
    // A happy customer cheers, more with every customer of the round: one hop, then hops with a wave, then a little
    // dance with a squash on each landing.
    if (cheerT >= 0) {
      const n = cheerT * 2.6;
      if (n < cheerLevel + 1) {
        const ph = n - Math.floor(n);
        hop = Math.max(hop, Math.sin(ph * Math.PI) * (16 + 7 * cheerLevel) * u);
        rot = Math.sin(cheerT * 9) * 0.035 * cheerLevel;
        if (cheerLevel >= 2) squash = ph < 0.18 ? (1 - ph / 0.18) * 0.07 : ph > 0.9 ? (ph - 0.9) / 0.1 * 0.07 : 0;
      }
    }
    const walk = moment === ENTER || moment === LEAVE ? Math.abs(Math.sin(time * 10)) * 8 * u : 0;
    const name = CUST_NAMES[who]![happy ? 1 : 0]!, h = happy ? custH * c.hh / 760 : custH, breathe = Math.sin(time * 2.1) * 0.012;
    ctx.save(); ctx.beginPath(); ctx.rect(-W, -H, W * 3, Yc + H); ctx.clip();
    drawSprite(ctx, sprites, name, x, Yc - CUST_CLIP * custH + h / 2 - hop - walk, h, rot, c.mirror ? -1 : 1, 1 - breathe - squash);
    ctx.restore();
    note(name, h, happy ? c.hh : 760);
  }
  /** The tag `which` (0 the first item's, 1 the second's, 2 the merged one) where it is now, into tagAt. */
  function tagNow(which: number): void {
    const t = which === 2 ? L.fmtag : which === 1 ? L.ftag2 : L.ftag, m = L.fmtag;
    if (which === 2 || !two()) { setBox(tagAt, t.x, t.y, t.w, t.h); return; }
    const k = mergeTagK();
    setBox(tagAt, lerp(t.x, m.x + (m.w - t.w) / 2, k), lerp(t.y, m.y + (m.h - t.h) / 2, k), t.w, t.h);
  }
  /** A price tag at box t, swinging from its hole, with the amount drawn on it. */
  function drawTag(ctx: CanvasRenderingContext2D, t: Box, v: number, dy: number, alpha: number): void {
    const sw = tagSwing < 1.2 ? Math.sin(tagSwing * 9) * 0.25 * (1 - tagSwing / 1.2) : 0;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.save(); ctx.translate(t.x + t.w / 2, t.y + t.h * TAG_HOLE + dy); ctx.rotate(sw);
    // One cached size per customer (the largest tag it shows); a tag growing or shrinking scales it at draw time.
    const base = Math.max(L.ftag.w, L.fmtag.w), k = t.w / (base || 1);
    drawSprite(ctx, sprites, TAG, 0, t.h / 2 - t.h * TAG_HOLE, base, 0, k, k); note(TAG, t.w, TAG_PX[0]);
    if (inkTag) amount(ctx, inkTag, v, plan.dollars, t.w * ((TAG_IN[0] + TAG_IN[1]) / 2 - 0.5), t.h * ((TAG_IN[2] + TAG_IN[3]) / 2) - t.h * TAG_HOLE, t.h / (tagH0 || 1));
    ctx.restore(); ctx.globalAlpha = 1;
  }
  /**
   * One good in box b (lifted by dy); `e` > 0 glides it into the customer's arms as it leaves. It is cached once at
   * `base` (its largest size this customer) and scaled down at draw time while it moves between spots or glides.
   */
  function goodAt(ctx: CanvasRenderingContext2D, gi: number, b: Box, dy: number, e: number, base: number): void {
    const g = GOODS[gi]!, name = GOOD_NAMES[gi]!;
    let x = b.x + b.w / 2, y = b.y + b.h / 2 + dy, sc = 1;
    if (e > 0) {
      const cx = custNowX() - custW * 0.1, cy = Yc - custH * 0.3;
      x = lerp(x, cx, e); y = lerp(y, cy, e) - Math.sin(e * Math.PI) * 50 * u; sc = lerp(1, 0.8, e);
    }
    const size = Math.max(b.w, b.h) * sc, k = size / (base || 1);
    drawSprite(ctx, sprites, name, x, y, base, 0, k, k);
    note(name, size, Math.max(g.w, g.h));
  }
  /**
   * The goods with their price tags, in front of the customer. At step 9 the two tags slide together and become one
   * tag showing the total.
   */
  function renderItem(ctx: CanvasRenderingContext2D): void {
    let dy = 0;
    if (moment === ENTER) { const k = clamp01((momentT - ENTER_SECONDS * 0.5) / (ENTER_SECONDS * 0.5)); if (k <= 0) return; dy = -(1 - easeOutCubic(k)) * 40 * u; }
    const gliding = moment === GLIDE || moment === LEAVE, e = gliding ? easeInOutSine(itemFly) : 0;
    goodAt(ctx, good, L.front, dy, e, Math.max(L.front.w, L.front.h));
    if (two()) goodAt(ctx, good2, L.front2, dy, e, Math.max(L.front2.w, L.front2.h));
    if (gliding) return;
    if (!two()) { tagNow(0); drawTag(ctx, tagAt, plan.price, dy, 1); return; }
    const f = clamp01((mergeTagK() - 0.8) / 0.2);
    if (f < 1) { tagNow(0); drawTag(ctx, tagAt, plan.parts[0]!, dy, 1 - f); tagNow(1); drawTag(ctx, tagAt, plan.parts[1]!, dy, 1 - f); }
    if (f > 0) { tagNow(2); drawTag(ctx, tagAt, plan.price, dy, f); }
  }
  function renderDish(ctx: CanvasRenderingContext2D): void {
    const d = L.dish, out = tillShown() && !dishInChange ? easeInOutSine(tillUp) : 0;
    if (out >= 1) return;
    const dy = out * (H - d.y + 20);
    drawSprite(ctx, sprites, DISH, d.x + d.w / 2, d.y + d.h / 2 + dy, d.w); note(DISH, d.w, DISH_PX[0]);
    for (let i = 0; i < dishLanded; i++) {
      const hop = dishHop[i]! < 0.3 ? Math.sin(dishHop[i]! / 0.3 * Math.PI) * 10 * u : 0, k = dishKind[i]!;
      if (isBill(k)) bill(ctx, billOf(k), dishPx[i]!, dishPy[i]! - hop + dy, 1); else coin(ctx, k, 0, dishPx[i]!, dishPy[i]! - hop + dy, dishK);
    }
  }
  function renderTill(ctx: CanvasRenderingContext2D): void {
    if (!tillShown()) return;
    // The till rises with a small overshoot and settles, like a drawer popping open.
    const t = L.till, dy = (1 - easeOutBack(tillUp, 1.2)) * (H - t.y + 20);
    if (trayWant) bakeTray();
    if (trayCanvas) ctx.drawImage(trayCanvas, t.x, t.y + dy, t.w, t.h);
    note(TRAY, trayK(t.h), 1);
    const showFocus = moment === CHANGE && !carry.active && hand.mode !== HAND_DEMO && !(intro && introStage === 1);
    for (let i = 0; i < tillN; i++) {
      const kind = tillKind[i]!, b = isBill(kind), ww = wellWs[i]!, wh = wellHs[i]!, x = wellX[i]!, y = wellY[i]! + dy;
      if (b) { drawSprite(ctx, sprites, SLOT, x, y, ww); note(SLOT, ww, SLOT_PX[0]); }
      else { drawSprite(ctx, sprites, WELL, x, y, ww); note(WELL, ww, WELL_PX); }
      if (showFocus && i === focus) focusMark(ctx, x, y, ww / 2, wh / 2);
      // Mouse hover: a soft cream ring round the well and a slight swell on the piece a press would pick up.
      const hv = wellHover[i]!;
      if (hv > 0.01) softRing(ctx, x - ww / 2, y - wh / 2, ww, wh, hv);
      const hop = wellHop[i]! < 0.3 ? Math.sin(wellHop[i]! / 0.3 * Math.PI) * 10 * u : 0;
      // A coin and its tag sit centred in the well (the coin a little above the middle).
      const py = b ? y : y - wellLift(i);
      // The piece the child (or the demonstrating hand) is carrying has left its well: the well reads empty, as in Coin
      // Count Vault and Ride Fare. A dashed ring (a dashed outline for a bill) with the coin's front faint and its value
      // tag a little stronger, so it still says what it holds and never reads as a second real coin.
      if ((carry.active && carry.well === i) || (hand.mode === HAND_DEMO && hand.taken && !hand.released && hand.well === i)) { emptyPlace(ctx, kind, x, py - hop); continue; }
      // An endless stack: rims of the pieces below show offset down and right, fronts up, the tag on the top one only.
      for (let k = 3; k >= 1; k--) {
        if (b) bill(ctx, billOf(kind), x + k * 3 * u, py + k * 4 * u - hop, 1);
        else coin(ctx, kind, 0, x + k * 3 * u, py + k * 4 * u - hop, 1, 0, 1, false);
      }
      piece(ctx, kind, x, py - hop - hv * 4 * u, 1 + hv * 0.06);
    }
  }
  /** An emptied place of `kind` centred at (x, y): its baked dashed outline, the piece faint, a coin's tag stronger. */
  function emptyPlace(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number): void {
    const b = isBill(kind), ring = b ? emptyBillCanvas : emptyRingCanvas[kind];
    if (ring) { const rw = ring.width / artRatio, rh = ring.height / artRatio; ctx.drawImage(ring, x - rw / 2, y - rh / 2, rw, rh); }
    if (b) { ctx.globalAlpha = EMPTY_BILL_ALPHA; bill(ctx, billOf(kind), x, y, 1); ctx.globalAlpha = 1; return; }
    ctx.globalAlpha = EMPTY_COIN_ALPHA; coin(ctx, kind, 0, x, y, 1, 0, 1, false); ctx.globalAlpha = 1;
    queueTag(kind, x, y, 1, 1, 0, EMPTY_TAG_ALPHA);
  }
  /** How far well i's coin sits above the well's centre: WELL_LIFT of the coin, less when the well is tight, so the coin stays inside it. */
  const wellLift = (i: number): number => Math.min(coinD[tillKind[i]!]! * WELL_LIFT, Math.max(0, (wellHs[i]! - coinD[tillKind[i]!]!) / 2 - 2));
  /** A soft cream rounded outline just outside box (x, y, w, h), at `k` of its full strength (mouse hover). */
  function softRing(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number): void {
    const p = 6 * u;
    ctx.globalAlpha = 0.55 * k; ctx.beginPath(); ctx.roundRect(x - p, y - p, w + 2 * p, h + 2 * p, 18 * u);
    ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER; ctx.stroke(); ctx.globalAlpha = 1;
  }
  /** Mouse hover on the paw under a carried piece. */
  function renderHoverCues(ctx: CanvasRenderingContext2D): void {
    if (pawHover > 0.01) softRing(ctx, L.pawZone.x, L.pawZone.y, L.pawZone.w, L.pawZone.h, pawHover);
  }
  /** A warm ring and a bobbing arrow on the keyboard's highlighted target. */
  function focusMark(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number, hh: number): void {
    const bob = Math.abs(Math.sin(time * 3)) * 8 * u;
    ctx.beginPath(); ctx.roundRect(x - hw - 6 * u, y - hh - 6 * u, hw * 2 + 12 * u, hh * 2 + 12 * u, 18 * u);
    ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
    const ty = y - hh - 14 * u - bob;
    ctx.beginPath(); ctx.moveTo(x - 15 * u, ty - 20 * u); ctx.lineTo(x + 15 * u, ty - 20 * u); ctx.lineTo(x, ty); ctx.closePath();
    ctx.fillStyle = HIGHLIGHT; ctx.fill(); ctx.lineWidth = 3 * u; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  /**
   * Where paw piece i rests (before the customer's walk and hop), into pos. The newest PAW_FAN pieces fan from the
   * stack's centre, each older one 0.12 of a piece up and left (bills half as far sideways). Older pieces settle in a
   * column just left of the fan, oldest at the bottom, each 0.1 of a piece above the one before (closing up so the
   * column rises at most 0.45 of a piece); a card over the column shows their value.
   */
  function pawPiece(i: number): void {
    const kind = pawKind[i]!, k = pawN - 1 - i, bills = billChange();
    if (k < PAW_FAN) {
      if (isBill(kind)) { pos.x = stackX - k * billW * 0.06; pos.y = stackY - k * billH * 0.12; }
      else { pos.x = stackX - k * coinD[kind]! * 0.12; pos.y = stackY - k * coinD[kind]! * 0.08; }
      return;
    }
    const settled = pawN - PAW_FAN, bigW = bills ? billW : coinD[QUARTER]!, bigH = bills ? billH : bigW;
    const rise = Math.min(0.1, 0.45 / Math.max(1, settled - 1));
    pos.x = Math.max(4 + bigW / 2, stackX - bigW * (bills ? 0.18 : 0.36) - bigW * 1.04);
    pos.y = stackY - i * bigH * rise;
  }
  /**
   * The change handed back so far, drawn over the till in the paw zone, every piece at full size: the newest fan out
   * from the zone's centre, older ones settle in a column beside them under a cream card with their value, so the
   * pieces drawn always add up to the change given.
   */
  function settledValue(): number { let v = pawLost; for (let i = 0; i < pawN - PAW_FAN; i++) v += value(pawKind[i]!); return v; }
  function renderPaw(ctx: CanvasRenderingContext2D): void {
    if (moment < CHANGE || moment === MERGE) return;
    const dx = custNowX() - custX, dy = -(custHop < 0.42 ? Math.sin(custHop / 0.42 * Math.PI) * 16 * u : 0), x = stackX + dx, y = stackY + dy;
    if (moment === CHANGE && committed < plan.change && glowCanvas && !(intro && introStage === 1)) {
      // The paw glows softly while change is owed, more while a piece is being carried to it.
      const g = Math.max(L.pawZone.w, L.pawZone.h) * (carry.active ? 1.5 : 1.3) * (0.92 + Math.sin(time * 4) * 0.08); ctx.globalAlpha = carry.active ? 0.95 : 0.7;
      ctx.drawImage(glowCanvas, x - g / 2, y - g / 2, g, g); ctx.globalAlpha = 1;
    }
    // The newest piece lands with a squash that settles in 0.3 s.
    const land = pawHop < 0.3 ? Math.cos(pawHop / 0.3 * Math.PI * 1.5) * (1 - pawHop / 0.3) : 0, sy = 1 - 0.16 * land, sx = (1 + 0.12 * land) / sy;
    // The fan and the settled column are stacks: each shows only its top coin's tag (the newest coin of the fan; the
    // highest coin of the column), so no tag sits half under the piece above it.
    let fanCoin = -1, colCoin = -1;
    for (let i = pawN - 1; i >= 0 && fanCoin < 0 && i >= pawN - PAW_FAN; i--) if (!isBill(pawKind[i]!)) fanCoin = i;
    for (let i = pawN - PAW_FAN - 1; i >= 0 && colCoin < 0; i--) if (!isBill(pawKind[i]!)) colCoin = i;
    for (let i = 0; i < pawN; i++) {
      pawPiece(i);
      const kind = pawKind[i]!, top = i === pawN - 1, px = pos.x + dx, py = pos.y + dy;
      if (isBill(kind)) bill(ctx, billOf(kind), px, py + (top ? billH * (1 - sy) * 0.5 : 0), top ? sy : 1, 0, top ? sx : 1);
      else coin(ctx, kind, 0, px, py + (top ? coinD[kind]! * (1 - sy) * 0.5 : 0), top ? sy : 1, 0, top ? sx : 1, i === fanCoin || i === colCoin);
    }
    const settled = pawN - PAW_FAN, s = inkTag;
    if (settled <= 0 || !s) return;
    const v = settledValue();
    pawPiece(settled - 1);
    const bigH = billChange() ? billH : coinD[QUARTER]!;
    const cw = amountW(s, v, plan.dollars) + s.px * 0.7, ch = s.px * 1.45;
    const cx = Math.min(W - 4 - cw / 2, Math.max(4 + cw / 2, pos.x + dx)), cy = Math.max(4 + ch / 2, pos.y + dy - bigH / 2 - 6 * u - ch / 2);
    ctx.beginPath(); ctx.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, ch * 0.3);
    ctx.fillStyle = CREAM; ctx.fill(); ctx.lineWidth = Math.max(2, 3 * u); ctx.strokeStyle = INK; ctx.stroke();
    amount(ctx, s, v, plan.dollars, cx, cy, 1);
  }
  /**
   * A piece that is too much shows its value as dots on a cream card just above it: ink dots in rows of ten (5, gap,
   * 5), large enough to count at a glance.
   */
  function dots(ctx: CanvasRenderingContext2D, n: number, x: number, top: number): void {
    if (!dotCanvas) return;
    const s = dotSize, p = s * 1.35, rows = Math.ceil(n / 10), cols = Math.min(10, n);
    const cw = (cols + (cols > 5 ? 0.5 : 0)) * p + s * 0.7, ch = rows * p + s * 0.7;
    const cx = Math.min(W - 4 - cw / 2, Math.max(4 + cw / 2, x)), cy = Math.max(4 + ch / 2, top - 8 * u - ch / 2);
    ctx.beginPath(); ctx.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, s * 0.6);
    ctx.fillStyle = CREAM; ctx.fill(); ctx.lineWidth = Math.max(2, 3 * u); ctx.strokeStyle = INK; ctx.stroke();
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 10), c = i % 10, inRow = Math.min(10, n - r * 10), rowW = (inRow + (inRow > 5 ? 0.5 : 0)) * p;
      ctx.drawImage(dotCanvas, cx - rowW / 2 + p * (c + (c >= 5 ? 0.5 : 0)) + (p - s) / 2, cy - rows * p / 2 + r * p + (p - s) / 2, s, s);
    }
  }
  function renderFlights(ctx: CanvasRenderingContext2D): void {
    for (const f of flights) {
      if (!f.active || f.t < 0) continue;
      if (f.mode === F_DROP) {
        // A bill flutters down turning a little, at full size all the way (a dish piece is never a target).
        const k = clamp01(f.t / f.dur), e = easeOutCubic(k), b = isBill(f.kind);
        const x = lerp(f.x0, f.x1, e) + (b ? Math.sin(k * 9) * 14 * u * (1 - k) : 0), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 40 * u;
        if (b) piece(ctx, f.kind, x, y, 1, Math.sin(k * 7) * 0.25 * (1 - k)); else coin(ctx, f.kind, 0, x, y, dishK);
        continue;
      }
      if (f.mode === F_RETURN) {
        const k = clamp01(f.t / f.dur), e = easeOutCubic(k);
        piece(ctx, f.kind, lerp(f.x0, f.x1, e), lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 40 * u, 1);
        continue;
      }
      // To the paw (an arc); too much: a jiggle with its dots, then a hop home.
      if (f.t < TO_PAW) {
        // An arc to the paw: a coin turns over once in the middle of its flight (the back shows only while it turns),
        // a bill flutters.
        const k = f.t / TO_PAW, e = easeOutCubic(k), x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 70 * u;
        if (isBill(f.kind)) piece(ctx, f.kind, x, y, 1, Math.sin(k * 11) * 0.18 * (1 - k));
        else { const c = Math.cos(clamp01((k - 0.35) / 0.3) * Math.PI * 2); coin(ctx, f.kind, c < 0 ? 1 : 0, x, y, 1, 0, Math.max(0.12, Math.abs(c))); }
        continue;
      }
      if (f.mode !== F_BOUNCE) continue;
      const t = f.t - TO_PAW;
      if (t < BOUNCE_HOLD) {
        const jig = Math.sin(t * 40) * 3 * u;
        piece(ctx, f.kind, f.x1 + jig, f.y1, 1);
        // A bill worth 100¢ or more (dollars and cents) would need a card of 100 dots: it shows none.
        if (value(f.kind) < 100) dots(ctx, value(f.kind), f.x1, f.y1 - pieceH(f.kind) / 2);
        continue;
      }
      const k = clamp01((t - BOUNCE_HOLD) / BOUNCE_HOP), e = easeInOutSine(k);
      piece(ctx, f.kind, lerp(f.x1, wellX[f.idx] ?? f.x0, e), lerp(f.y1, wellY[f.idx] ?? f.y0, e) - Math.sin(k * Math.PI) * 110 * u, 1, isBill(f.kind) ? 0 : k * Math.PI * 2);
    }
  }
  /** The helper hand (`pieceOnly`: just the piece it carries, drawn before the layer's value tags; else just the hand). */
  function renderHand(ctx: CanvasRenderingContext2D, pieceOnly: boolean): void {
    if (!hand.mode) return;
    handTip();
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(150 * u), hw = hs * img.naturalWidth / img.naturalHeight, t = hand.t;
    let alpha = hand.mode === HAND_HINT ? 0.85 : 1;
    if (hand.mode === HAND_DEMO || hand.mode === HAND_HINT) {
      if (t > HAND_DROP_AT) alpha *= 1 - clamp01((t - HAND_DROP_AT) / HAND_FADE);
      if (t < HAND_PRESS_AT) alpha *= clamp01(t / 0.3);
      const carrying = t >= HAND_CARRY_AT && t < HAND_DROP_AT && (hand.mode === HAND_HINT || hand.taken);
      if (carrying && pieceOnly) {
        const ghost = hand.mode === HAND_HINT;
        if (ghost && glowCanvas) { const g = glowSize; ctx.globalAlpha = alpha * (0.85 + Math.sin(time * 7) * 0.15); ctx.drawImage(glowCanvas, pos.x - g / 2, pos.y - g / 2, g, g); }
        ctx.globalAlpha = ghost ? alpha * 0.6 : 1; piece(ctx, hand.kind, pos.x, pos.y, 1); ctx.globalAlpha = 1;
      }
    } else if (hand.mode === HAND_POINTS) {
      const end = hand.n * SEG;
      if (t > end) alpha *= 1 - clamp01((t - end) / HAND_FADE);
      if (t < 0.3) alpha *= clamp01(t / 0.3);
    }
    if (pieceOnly) return;
    ctx.globalAlpha = alpha;
    const pressed = (hand.mode === HAND_DEMO || hand.mode === HAND_HINT) ? t >= HAND_PRESS_AT && t < HAND_CARRY_AT
      : hand.mode === HAND_TAP ? Math.abs(Math.sin(t * 3.2)) < 0.15 : (t % SEG) > SEG * 0.5 && (t % SEG) < SEG * 0.75;
    const press = pressed ? 0.9 : 1;
    // The art's fingertip is at its top left corner: put it on the target.
    drawSprite(ctx, sprites, HAND, pos.x + hw * 0.42, pos.y + hs * 0.44, hs, 0, press, press);
    note(HAND, hs, img.naturalHeight);
    ctx.globalAlpha = 1;
  }
  /**
   * One harbour overlay at the background's own scale (1.0 at 1920x1080), revealed without ever growing: `wipe` 1
   * uncovers it from the bottom up, 2 from the left, by `k`; `dy` drops it in from above; `alpha` fades it.
   */
  function overlay(ctx: CanvasRenderingContext2D, i: number, alpha: number, wipe: number, k: number, dy: number): void {
    const o = HARBOUR[i]!; if (alpha <= 0 || k <= 0 || !sprites.get(o.name)) return;
    const x = bgX + o.x * bgScale, y = bgY + o.y * bgScale, w = o.w * bgScale, h = o.h * bgScale, clip = wipe > 0 && k < 1;
    if (clip) {
      ctx.save(); ctx.beginPath();
      if (wipe === 1) ctx.rect(x - 2, y + h * (1 - k), w + 4, h * k + 2); else ctx.rect(x - 2, y - 2, w * k + 2, h + 4);
      ctx.clip();
    }
    if (alpha < 1) ctx.globalAlpha = alpha;
    drawSprite(ctx, sprites, o.name, x + w / 2, y + h / 2 + dy, Math.max(w, h));
    ctx.globalAlpha = 1;
    if (clip) ctx.restore();
    note(o.name, Math.max(w, h), Math.max(o.w, o.h));
  }
  /** The harbour this round: bunting strings (dropping in as customers are served) and what the takings bought. */
  function renderHarbour(ctx: CanvasRenderingContext2D): void {
    if (!bgCanvas) return;
    for (let j = 0; j < buntN; j++) {
      const k = clamp01((roundT - buntAt[j]!) / 0.6);
      overlay(ctx, OV_BUNTING + j, clamp01(k * 3), 0, 1, -(1 - easeOutBack(k, 1.6)) * 46 * u);
    }
    if (buy < 0 || buyK <= 0) return;
    if (buy === BUY_SAILS) { overlay(ctx, OV_SAILS, 1, 1, buyK, 0); overlay(ctx, OV_SMALL, 1, 1, clamp01(buyK * 1.4 - 0.4), 0); }
    else if (buy === BUY_LAMP) {
      // The lamp switches on like a lamp: up, one soft dip, then full (one change in a second, a small area).
      const on = buyK < 0.3 ? buyK / 0.3 : buyK < 0.45 ? 0.45 : 1;
      overlay(ctx, OV_LAMP, on * (phase === 'celebration' ? 0.86 + Math.sin(time * 3) * 0.14 : 1), 0, 1, 0);
    }
    else if (buy === BUY_PAINT) overlay(ctx, OV_PAINT, 1, 2, buyK, 0);
  }
  /** Customers served this round wait at the back of the stall, small, bobbing and cheering; each pops up as it joins. */
  function renderBackCrowd(ctx: CanvasRenderingContext2D): void {
    if (!crowdN) return;
    ctx.save(); ctx.beginPath(); ctx.rect(-W, -H, W * 3, Yc + H); ctx.clip();
    for (let i = crowdN - 1; i >= 0; i--) {
      const ci = roundWho[i] ?? 0, c = CUSTOMERS[ci]!, name = CUST_NAMES[ci]![1]!, h = crowdH * c.hh / 760;
      const k = clamp01((roundT - crowdAt[i]!) / 0.5), rise = (1 - easeOutBack(k, 1.4)) * crowdH * 0.5;
      const bob = Math.abs(Math.sin(time * 3.2 + i * 1.7)) * 7 * u;
      drawSprite(ctx, sprites, name, crowdX0 + i * crowdStep, Yc - crowdH * 0.55 + h / 2 + rise - bob, h, Math.sin(time * 2.4 + i) * 0.04, c.mirror ? -1 : 1, 1);
      note(name, h, c.hh);
    }
    ctx.restore();
  }
  /** One small price tag of the round end at centre x, top y. */
  function closeTag(ctx: CanvasRenderingContext2D, x: number, y: number, v: number, dollars: boolean): void {
    const tw = closeTagW, th = tw * TAG_PX[1] / TAG_PX[0];
    drawSprite(ctx, sprites, TAG, x, y + th / 2, tw); note(TAG, tw, TAG_PX[0]);
    if (inkTag) amount(ctx, inkTag, v, dollars, x + tw * ((TAG_IN[0] + TAG_IN[1]) / 2 - 0.5), y + th * (TAG_IN[2] + TAG_IN[3]) / 2, th / (tagH0 || 1));
  }
  /**
   * The till count at closing: the till rises at the bottom, the slate drops in, each sale's tag flies out of the till
   * to the row under the slate and its amount pours into the slate's cups (dollars left, cents right), the total sits
   * at the top; then slate, tags and till leave so the harbour change shows.
   */
  function renderClosing(ctx: CanvasRenderingContext2D): void {
    const t = closeT, away = easeInCubic(clamp01((t - closeBuyAt - 0.2) / CLOSE_AWAY));
    renderBackCrowd(ctx);
    const tb = L.ctill, rise = easeOutBack(clamp01(t / 0.35), 1.3), tdy = (1 - rise + away) * (H - tb.y + 20);
    if (ctrayCanvas) ctx.drawImage(ctrayCanvas, tb.x, tb.y + tdy, tb.w, tb.h);
    note(TRAY, trayK(tb.h), 1);
    // The tray holds what the round took: a coin of each kind and a bill of each kind the customers paid with, in one
    // row. Each piece gets its own slot as wide as the piece plus a gap, so no piece overlaps another; the row shrinks
    // as a whole (coins and bills by the same factor) when it is wider than the tray's inside.
    let n = 0, coinsW = 0, billsN = 0;
    for (let k = 0; k < 4; k++) { if ((takenCoins >> k) & 1) { n++; coinsW += coinD[k]!; } if ((takenBills >> k) & 1) { n++; billsN++; } }
    if (n > 0) {
      const cy = tb.y + tb.h * 0.5 + tdy, gap = Math.max(4, 8 * u);
      const cs0 = Math.min(1, (tb.h * 0.6) / coinD[QUARTER]!), bs0 = Math.min(1, (tb.h * 0.62) / billH);
      const row = coinsW * cs0 + billsN * billW * bs0, fit = Math.min(1, (tb.w * 0.88 - gap * (n - 1)) / row);
      const cs = cs0 * fit, bs = bs0 * fit;
      let x = tb.x + (tb.w - (row * fit + gap * (n - 1))) / 2;
      for (let k = 0; k < 4; k++) if ((takenCoins >> k) & 1) { const w = coinD[k]! * cs; coin(ctx, k, 0, x + w / 2, cy - coinD[k]! * cs * TAG_HANG / 2, cs); x += w + gap; }
      for (let k = 0; k < 4; k++) if ((takenBills >> k) & 1) { const w = billW * bs; bill(ctx, k, x + w / 2, cy, bs); x += w + gap; }
      flushTags(ctx);
    }
    const sh = L.slate.y + L.slate.h + 20, sdy = -(1 - easeOutBack(clamp01(t / CLOSE_OPEN), 1.1)) * sh - away * sh;
    if (slateCanvas) { ctx.drawImage(slateCanvas, L.slate.x, L.slate.y + sdy, L.slate.w, L.slate.h); note(BOARD, closeKS, 1); }
    const showD = closeDollars > 0, showC = closeCentsShown(), labelY = L.slatePanel.y + closePx * 1.5 + closePx * 0.3 + sdy;
    if (inkClose) for (let g = 0; g < 2; g++) {
      if (g === 0 ? !showD : !showC) continue;
      cupCentre(g === 0, 4); const cx = pos.x + closePitch * 0.8, gw = inkClose.w[g === 0 ? G_DOLLAR : G_CENT]! * 0.6;
      glyph(ctx, inkClose, g === 0 ? G_DOLLAR : G_CENT, cx - gw / 2 * 1.3, labelY, 0.78);
    }
    for (let g = 0; g < 2; g++) {
      const n = g === 0 ? shownD : shownC, pulses = g === 0 ? closeCupD : closeCupC, img = g === 0 ? closeDollarCanvas : closeCupCanvas; if (!img) continue;
      for (let i = 0; i < n && i < MAX_CUPS; i++) {
        cupCentre(g === 0, i);
        const w = img.width / artRatio * popScale(pulses[i]!);
        ctx.drawImage(img, pos.x - w / 2, pos.y + sdy - w / 2, w, w);
      }
    }
    if (inkClose && (shownD || shownC)) {
      const since = t - closeTotalAt, k = closePopped ? (since < 0.3 ? 1 + Math.sin(since / 0.3 * Math.PI) * 0.22 : 1) : 0.82;
      amountMixed(ctx, inkClose, shownD, shownC, L.slatePanel.x + L.slatePanel.w / 2, L.slatePanel.y + closePx * 0.75 + sdy, k);
    }
    const th = closeTagW * TAG_PX[1] / TAG_PX[0], tagsDy = away * (H - closeTagY + 20);
    for (let k = 0; k < salesN; k++) {
      const s0 = CLOSE_OPEN + k * CLOSE_SALE; if (t < s0) break;
      const f = clamp01((t - s0) / CLOSE_TAG), e = easeOutCubic(f);
      const x = lerp(tb.x + tb.w / 2, closeTagX[k]!, e), y = lerp(tb.y + tdy - th * 0.3, closeTagY, e) - Math.sin(f * Math.PI) * 60 * u + tagsDy;
      closeTag(ctx, x, y, salePrice[k]!, saleDollars[k] === 1);
    }
  }
  function renderPlay(ctx: CanvasRenderingContext2D): void {
    renderBackCrowd(ctx);
    renderBoard(ctx);
    renderCustomer(ctx);
    if (dishShown() || tillUp < 1) renderDish(ctx);
    renderItem(ctx);
    renderTill(ctx);
    renderPaw(ctx);
    renderHoverCues(ctx);
    renderFlights(ctx);
    renderCarry(ctx);
    renderHand(ctx, true);
    // Every value tag after every coin (dish, till, paw, flights, carried, the hand's piece).
    flushTags(ctx);
    particles.render(ctx);
    renderHand(ctx, false);
  }
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  const controlX = (i: number, choice: boolean): number => {
    const n = choice ? pending?.choices.length ?? 0 : 2;
    return W / 2 + (i - (n - 1) / 2) * (choice ? choiceSize + Math.max(24, choiceSize * 0.18) : controlsRadius * 3.2);
  };
  function gift(ctx: CanvasRenderingContext2D, index: number, id: string, x: number, y: number, size: number, focused: boolean, alpha = 1, sticker = true): void {
    if (focused) {
      ctx.beginPath(); ctx.ellipse(x, y, size * 0.55 + 8, size * 0.55 + 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
    }
    if (alpha < 1) ctx.globalAlpha = alpha;
    // A cream paper disc under each offer, like the stall's printed paper.
    ctx.beginPath(); ctx.arc(x, y + size * 0.04, size * 0.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(251, 243, 222, 0.9)'; ctx.fill();
    ctx.globalAlpha = 1;
    if (sticker) offers.drawOffer(ctx, index, stickerNames.get(id) ?? '', x, y - size * 0.02, Math.round(size * 0.78), 1, alpha);
  }
  function placeChoiceBook(): void {
    const n = pending?.choices.length ?? 1;
    placeBook(bookAt, W, H, controlX(n - 1, true) + choiceSize / 2, choiceY, choiceY + choiceSize / 2, bookH, cornerY + cornerRadius + 10);
  }
  function warmOffers(): void {
    if (!pending?.choices.length || !pending.rewardEnabled) return;
    for (const id of pending.choices) offers.warm(stickerNames.get(id) ?? '', Math.round(choiceSize * 0.78));
    offers.warmBook(bookH); offers.warmBook(restSize);
  }
  /** The round's customers in a row along the quay, happy, each with its good, waving (standing still at rest). */
  function renderCrowd(ctx: CanvasRenderingContext2D, h: number, cy: number, feetClip: boolean): void {
    const n = Math.min(6, pending?.who.length ?? 0); if (!n) return;
    // The row stays in the middle of the window, so the harbour's boats and lighthouse stay in view.
    const gap = Math.min(W / (n + 0.5), h * 0.75, (W * 0.56) / n);
    for (let i = 0; i < n; i++) {
      const c = CUSTOMERS[pending!.who[i]!]!, name = CUST_NAMES[pending!.who[i]!]![1]!, x = W / 2 + (i - (n - 1) / 2) * gap;
      const still = phase === 'rest', hh = h * c.hh / 760, bob = still ? 0 : Math.abs(Math.sin(time * 4 + i * 1.3)) * 10 * u;
      if (feetClip) { ctx.save(); ctx.beginPath(); ctx.rect(-W, -H, W * 3, Yc + H); ctx.clip(); }
      drawSprite(ctx, sprites, name, x, cy - bob, hh, still ? 0 : Math.sin(time * 3 + i) * 0.05, c.mirror ? -1 : 1, 1);
      if (feetClip) ctx.restore();
      note(name, hh, c.hh);
      const gi = pending!.goods[i] ?? 0, g = GOODS[gi]!, gw = h * 0.3;
      drawSprite(ctx, sprites, GOOD_NAMES[gi]!, x + h * 0.08, Math.min(cy + hh * 0.1, Yc + gw * 0.2) - bob, gw * Math.max(g.w, g.h) / g.w);
    }
  }
  function renderResult(ctx: CanvasRenderingContext2D): void {
    const starT = phase === 'celebration' ? phaseT - STAR_START : 99;
    if (phase === 'celebration') {
      const h = celebH(); renderCrowd(ctx, h, Yc - CUST_CLIP * h + h / 2, true);
      particles.render(ctx);
    }
    drawStarRow(ctx, W / 2, starY, starR, stars, starT, phase === 'rest' ? 0 : time);
    if (phase === 'celebration') return;
    if (phase === 'choice' && pending) {
      placeChoiceBook(); offers.drawBook(ctx, bookAt[0]!, bookAt[1]!, bookH, '', -1);
      for (let i = 0; i < pending.choices.length; i++) gift(ctx, i, pending.choices[i]!, controlX(i, true), choiceY, choiceSize, menuSelected === i);
      return;
    }
    if (pending?.chosen) {
      const index = Math.max(0, pending.choices.indexOf(pending.chosen)), name = stickerNames.get(pending.chosen) ?? '';
      placeChoiceBook();
      if (phase === 'sticker') {
        const a = leaveAlpha(phaseT), drop = leaveDrop(phaseT) * choiceSize;
        if (a > 0) for (let i = 0; i < pending.choices.length; i++) gift(ctx, i, pending.choices[i]!, controlX(i, true), choiceY + drop, choiceSize, false, a, i !== index);
        offers.drawBook(ctx, bookAt[0]!, bookAt[1]!, bookH, name, phaseT - PICK_LIFT - PICK_FLY);
        offers.drawFlight(ctx, phaseT, name, controlX(index, true), choiceY - choiceSize * 0.02, Math.round(choiceSize * 0.78), bookAt[0]!, bookAt[1]!, bookH);
      } else {
        const k = bookGlide ? easeOutCubic(clamp01(phaseT / BOOK_GLIDE)) : 1;
        offers.drawBook(ctx, lerp(bookAt[0]!, W / 2, k), lerp(bookAt[1]!, restY, k), lerp(bookH, restSize, k), name, 9, restSize);
      }
    } else renderCrowd(ctx, restSize * 0.62, restY, false);
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i, false); chunkyCircle(ctx, x, controlsY, controlsRadius, '#e9b13b', OUTLINE, 5 * u);
      drawSprite(ctx, sprites, i === 0 ? BUTTON_PLAY : BUTTON_HOME, x, controlsY, Math.round(controlsRadius * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsRadius);
    }
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    // Mouse hover: a slight swell and a soft cream ring; the icon keeps its baked size and scales by transform.
    const hs = 1 + homeHover * 0.08, hr = cornerRadius * hs;
    if (homeHover > 0.01) {
      ctx.globalAlpha = 0.45 * homeHover; ctx.beginPath(); ctx.arc(homeX, cornerY, hr + 7, 0, Math.PI * 2);
      ctx.lineWidth = 6; ctx.strokeStyle = HOVER; ctx.stroke(); ctx.globalAlpha = 1;
    }
    chunkyCircle(ctx, homeX, cornerY, hr, '#e9b13b', OUTLINE, 4);
    drawSprite(ctx, sprites, BUTTON_HOME, homeX, cornerY, Math.round(cornerRadius * 1.3), 0, hs, hs);
    soundButton.render(ctx, sprites);
    if (cornerFocus >= 0) focusRing(ctx, cornerFocus === 0 ? homeX : soundX, cornerY, cornerRadius);
  }
  function hoverMenu(x: number, y: number): number {
    const choice = phase === 'choice', n = choice ? pending?.choices.length ?? 0 : 2;
    if (choice) { placeChoiceBook(); if (onBook(bookAt, bookH, x, y)) return -1; }
    for (let i = 0; i < n; i++) {
      const dx = x - controlX(i, choice), dy = y - (choice ? choiceY : controlsY);
      if (choice ? Math.abs(dx) <= choiceSize / 2 && Math.abs(dy) <= choiceSize * 0.5 : Math.hypot(dx, dy) <= controlsRadius) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- input
  function wellAt(x: number, y: number): number {
    for (let i = 0; i < tillN; i++) if (Math.abs(x - wellX[i]!) <= wellWs[i]! / 2 && Math.abs(y - wellY[i]!) <= wellHs[i]! / 2) return i;
    return -1;
  }
  /** A release on the paw: inside its zone or within the snap distance, unless the point is on a well. */
  const onPaw = (x: number, y: number): boolean => inside(L.pawZone, x, y) || (inside(L.pawZone, x, y, snap) && wellAt(x, y) < 0);
  const onCorner = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius || Math.hypot(x - soundX, y - cornerY) <= cornerRadius;
  /** Presses while nothing can be chosen: the customer smiles and hops, the pressed well hops. */
  function invite(well: number): void { custHop = 0; if (well >= 0) wellHop[well] = 0; play('pop', 'A', 3, 0.3); }
  function interruptHand(): void {
    if (hand.mode === HAND_TAP || hand.mode === HAND_HINT || hand.mode === HAND_POINTS) hand.mode = 0;
  }
  function pick(w: number): void {
    carry.well = w; carry.kind = tillKind[w]!; carryT = 0;
    if (isBill(carry.kind)) play('paper-rustle', 'A', 0, 0.6); else play('pop', 'B', 2, 0.5);
    particles.glints(wellX[w]!, wellY[w]!, 2, wellWs[w]! * 0.35);
  }
  function release(x: number, y: number): void {
    carry.active = false;
    if (onPaw(x, y)) { hits++; toPaw(carry.well, carry.kind, x, y, carry.deliberate, false); return; }
    if (!inside(L.till, x, y)) { misses++; play('whoosh', 'D', 0, 0.55); }
    launch(F_RETURN, carry.kind, carry.well, x, y, wellX[carry.well]!, wellY[carry.well]!, RETURN_SECONDS);
  }
  function pointerDown(x: number, y: number): void {
    idleT = 0; interruptHand();
    const now = performance.now(), gap = now - lastPressAt;
    lastPressAt = now;
    const goal = intro && introStage === 1;
    if (moment !== CHANGE || goal) { if (!onCorner(x, y)) invite(wellAt(x, y)); return; }
    if (carry.active) { release(x, y); return; }
    const w = wellAt(x, y);
    if (w >= 0) {
      if (busy()) { invite(w); return; }
      pick(w); lastActionAt = now;
      carry.active = true; carry.sticky = false; carry.downAt = now; carry.downX = x; carry.downY = y; carry.deliberate = gap >= DELIBERATE_MS; focus = w;
      return;
    }
    if (onPaw(x, y)) { custHop = 0; if (focus < tillN) wellHop[focus] = 0; play('pop', 'A', 4, 0.3); return; }
    if (!onCorner(x, y)) { misses++; custHop = 0; }
  }
  function pointerUp(x: number, y: number): void {
    if (!carry.active || carry.sticky) return;
    // Click to carry (every tier, any button): a press and release without dragging picks the piece up and it follows
    // the pointer with no button held until the next click puts it down. A drag with the button held drops on release.
    if (Math.hypot(x - carry.downX, y - carry.downY) < 24) { carry.sticky = true; return; }
    release(x, y);
  }
  /** Till wells take a press now (the same gates as pointerDown). */
  const changeLive = (): boolean => moment === CHANGE && !(intro && introStage === 1);
  /** What a press at x, y would do now, with the same gates as handleInput's pointerdown and pointerDown. */
  function hoverAt(x: number, y: number): CursorHover {
    if (soundButton.contains(x, y)) return null;
    if (Math.hypot(x - homeX, y - cornerY) <= cornerRadius) return 'press';
    if (phase === 'closing') return closeT > 0.5 && closeSpeed < 4 ? 'press' : null;
    if (phase === 'celebration') return celebrationLocked() ? null : 'press';
    if (playable() && carry.active) return 'carry';
    if (performance.now() < inputAfter) return null;
    if (playable()) {
      // Presses that only make the customer or a well hop act on nothing: the arrow stays.
      if (changeLive()) return wellAt(x, y) >= 0 && !busy() ? 'grab' : null;
      return null;
    }
    if (phase === 'choice' || phase === 'rest') return hoverMenu(x, y) >= 0 ? 'press' : null;
    return null;
  }
  /** Ease the hover looks toward the mouse: the piece a press would pick up, the paw under a carried piece, Home. */
  function updateHover(dt: number): void {
    const pt = input.pointer, mouse = pt.inside && pt.type === 'mouse' && !soundButton.contains(pt.x, pt.y);
    const home = mouse && Math.hypot(pt.x - homeX, pt.y - cornerY) <= cornerRadius;
    const live = mouse && !home && playable() && performance.now() >= inputAfter;
    const w = live && !carry.active && changeLive() && !busy() ? wellAt(pt.x, pt.y) : -1;
    for (let i = 0; i < MAX_WELLS; i++) wellHover[i] = approach(wellHover[i]!, i === w ? 1 : 0, 14, dt);
    pawHover = approach(pawHover, mouse && !home && playable() && carry.active && onPaw(pt.x, pt.y) ? 1 : 0, 14, dt);
    homeHover = approach(homeHover, home ? 1 : 0, 14, dt);
  }
  function keyPlay(code: string): void {
    idleT = 0; interruptHand();
    const now = performance.now();
    const arrow = code === 'ArrowLeft' || code === 'ArrowUp' || code === 'ArrowRight' || code === 'ArrowDown', back = code === 'ArrowLeft' || code === 'ArrowUp';
    if (moment !== CHANGE || (intro && introStage === 1)) { invite(-1); return; }
    if (arrow) { if (tillN) focus = (focus + (back ? tillN - 1 : 1)) % tillN; lastArrowAt = now; arrowedHere = true; return; }
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    if (carry.active) { carry.active = false; launch(F_RETURN, carry.kind, carry.well, input.pointer.x, input.pointer.y, wellX[carry.well]!, wellY[carry.well]!, RETURN_SECONDS); }
    if (busy() || focus >= tillN) { invite(focus); return; }
    const ok = lastArrowAt > lastActionAt && now - lastArrowAt >= KEY_DELIBERATE_MS;
    lastActionAt = now;
    const kind = tillKind[focus]!;
    pick(focus);
    const tooMuch = !fits(kind);
    toPaw(focus, kind, wellX[focus]!, wellY[focus]!, ok, false);
    // Keyboard play: after a piece hops back, the highlight moves to a piece that fits, so pressing on never stalls;
    // until the child moves it with an arrow, it also follows the counting-up order after every piece.
    if (tooMuch || !arrowedHere) focusHelpful();
  }

  // ---------------------------------------------------------------- stats
  const name = (k: number): string => (plan.dollars ? `$${BILL_VALUE[k]}` : k === K_DOLLAR ? '$1' : k === K_FIVE ? '$5' : COIN_NAMES[k]!);
  const r = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
  const stats: MarketStallStats = {
    get step() { return data.cashStep; }, get tier() { return tier; }, get rounds() { return data.rounds; }, get phase() { return phase; },
    get moment() { return MOMENTS[moment]!; }, get intro() { return intro; }, get introStage() { return introStage; },
    get customer() { return customerIndex; }, get customers() { return customersTotal; }, get hits() { return hits; }, get misses() { return misses; },
    get bounces() { return bounces; }, get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; },
    get hand() { return hand.mode; }, get carrying() { return carry.active; }, get carrySticky() { return carry.active && carry.sticky; },
    get closing() {
      if (phase !== 'closing' && phase !== 'celebration') return null;
      const sales: { price: number; dollars: boolean }[] = [];
      for (let k = 0; k < salesN; k++) sales.push({ price: salePrice[k]!, dollars: saleDollars[k] === 1 });
      return { sales, dollars: closeDollars, cents: closeCents, shownDollars: shownD, shownCents: shownC, t: closeT, speed: closeSpeed };
    },
    get harbour() { return { buy: buy >= 0 ? BUY_NAMES[buy]! : '', reveal: buyK, bunting: buntN, crowd: crowdN }; },
    get focus() { return moment === CHANGE ? `well:${focus}` : ''; },
    get counted() { return roundCounted.slice(); }, get learn() { return data.cashLearn.slice(); }, get demos() { return data.cashDemos; },
    get task() {
      if (!playable()) return null;
      return {
        content: plan.content, countsFor: plan.step, dollars: plan.dollars, price: plan.price, parts: plan.parts.slice(), payment: payment(), planned: planned(), owed: plan.change, given, counter,
        pawPieces: pawN, pawSettled: Math.max(0, pawN - PAW_FAN), pawSettledValue: settledValue(),
        till: Array.from(tillKind.subarray(0, tillN), name), pay: plan.pay.map(name), merged: mergeK() >= 1,
      };
    },
    get board() {
      if (!playable()) return null;
      const shown = markerShown(), f = markerFrac();
      let dotsShown = 0; for (let i = 0; i < dotsN && i < MAX_CUPS; i++) if (cupPulse[i]! >= 0) dotsShown++;
      return {
        price: mergeTagK() >= 1 ? amountText(plan.price, plan.dollars) : '',
        payment: paymentOnBoard() ? amountText(lit, plan.dollars) : '',
        counter: shown ? amountText(plan.price + counter, plan.dollars) : '',
        dots: shown ? dotsShown : 0, dotsLit: shown ? Math.min(dotsN, counter) : 0,
        marker: shown ? f : -1, markerX: shown ? Math.round(trackX0 + (trackX1 - trackX0) * f) : -1, trackX0, trackX1, trackY: Math.round(trackY),
        tagIcon: { x: Math.round(tagCx - tagIconW / 2), y: Math.round(trackY - tagIconW * TAG_PX[1] / TAG_PX[0] / 2), w: tagIconW, h: Math.round(tagIconW * TAG_PX[1] / TAG_PX[0]) },
        dishIcon: { x: Math.round(dishCx - dishIconW / 2), y: Math.round(trackY - dishIconW * DISH_PX[1] / DISH_PX[0] / 2), w: dishIconW, h: Math.round(dishIconW * DISH_PX[1] / DISH_PX[0]) },
        dotSize: dotsN ? dotD : 0, numPx, endPx,
      };
    },
    get coins() {
      const out: { kind: string; face: 'heads' | 'tails'; x: number; y: number; d: number; where: string; tag: string }[] = [];
      if (!playable() || plan.dollars) return out;
      const add = (k: number, x: number, y: number, d: number, where: string): void => { out.push({ kind: COIN_NAMES[k]!, face: 'heads', x, y, d, where, tag: `${COIN_VALUE[k]}¢` }); };
      if (dishShown()) for (let i = 0; i < dishLanded; i++) if (!isBill(dishKind[i]!)) add(dishKind[i]!, dishPx[i]!, dishPy[i]!, coinD[dishKind[i]!]! * dishK, 'dish');
      if (tillShown()) for (let i = 0; i < tillN; i++) if (!isBill(tillKind[i]!)) add(tillKind[i]!, wellX[i]!, wellY[i]! - wellLift(i), coinD[tillKind[i]!]!, 'till');
      for (let i = 0; i < pawN; i++) if (!isBill(pawKind[i]!)) { pawPiece(i); add(pawKind[i]!, pos.x, pos.y, coinD[pawKind[i]!]!, 'paw'); }
      return out;
    },
    get bills() {
      const out: { value: number; x: number; y: number; w: number; h: number; where: string }[] = [];
      if (!playable()) return out;
      const v = (k: number): number => BILL_VALUE[billOf(k)]!;
      if (dishShown()) for (let i = 0; i < dishLanded; i++) if (isBill(dishKind[i]!)) out.push({ value: v(dishKind[i]!), x: dishPx[i]!, y: dishPy[i]!, w: billW, h: billH, where: 'dish' });
      if (tillShown()) for (let i = 0; i < tillN; i++) if (isBill(tillKind[i]!)) out.push({ value: v(tillKind[i]!), x: wellX[i]!, y: wellY[i]!, w: billW, h: billH, where: 'till' });
      for (let i = 0; i < pawN; i++) if (isBill(pawKind[i]!)) { pawPiece(i); out.push({ value: v(pawKind[i]!), x: pos.x, y: pos.y, w: billW, h: billH, where: 'paw' }); }
      return out;
    },
    get targets() {
      const out: { kind: string; x: number; y: number; w: number; h: number; snap?: number }[] = [];
      if (playable() && tillShown()) {
        out.push({ kind: 'paw', ...r(L.pawZone), snap: Math.round(snap) });
        for (let i = 0; i < tillN; i++) out.push({ kind: `well:${name(tillKind[i]!)}`, x: Math.round(wellX[i]! - wellWs[i]! / 2), y: Math.round(wellY[i]! - wellHs[i]! / 2), w: Math.round(wellWs[i]!), h: Math.round(wellHs[i]!) });
      }
      if (phase === 'choice' && pending) for (let i = 0; i < pending.choices.length; i++) out.push({ kind: `sticker:${pending.choices[i]}`, x: controlX(i, true) - choiceSize / 2, y: choiceY - choiceSize / 2, w: choiceSize, h: choiceSize });
      if (phase === 'rest') for (let i = 0; i < 2; i++) out.push({ kind: i === 0 ? 'again' : 'home', x: controlX(i, false) - controlsRadius, y: controlsY - controlsRadius, w: controlsRadius * 2, h: controlsRadius * 2 });
      out.push({ kind: 'corner-home', x: homeX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      out.push({ kind: 'corner-sound', x: soundX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      return out;
    },
    get layout() {
      return {
        u, uiScale: uiK, portrait, Yc: Math.round(Yc), scale: custS, board: r(L.board), dish: r(L.dish), dishFootprint: r(L.foot), dishInChange, till: r(L.till),
        customer: r(L.body), pawZone: r(L.pawZone), tag: r(L.ftag),
        front: r(L.front), front2: r(L.front2), frontTags: r(L.frontAll), mergedTag: r(L.fmtag), pawStack: r(L.stack), fitted, dishCoinK: dishK,
        pawX: Math.round(pawX), pawY: Math.round(pawY), well: wellW, wellH, dotPitch, numPx, tagPx, coinDime: coinD[DIME]!, coinQuarter: coinD[QUARTER]!, billW, billH,
      };
    },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    scales() { return Object.fromEntries(drawnScale); },
    resetWork() { workHead = workCount = 0; },
    layoutCheck(sizes = [[1366, 768], [1920, 1080]], perStep = 40, rects = false) {
      const keep = { plan, who, good, good2, tier, W, H }, failures: string[] = [], dump: string[] = [];
      const f3 = (n: number): string => n.toFixed(3);
      const boxes = (): string => {
        const parts: string[] = [`u ${f3(u)} corner ${f3(cornerRadius)} coins ${Array.from(coinD, f3).join(' ')} bill ${billW}x${billH} snap ${f3(snap)} dot ${f3(dotPitch)} ${dotD} track ${trackX0} ${trackX1} well ${wellW}x${wellH} dishInChange ${dishInChange} fitted ${fitted}`];
        for (const [k, b] of Object.entries(L)) parts.push(`${k} ${f3(b.x)} ${f3(b.y)} ${f3(b.w)} ${f3(b.h)}`);
        for (let i = 0; i < tillN; i++) parts.push(`w${i} ${f3(wellX[i]!)} ${f3(wellY[i]!)}`);
        for (let i = 0; i < dishN; i++) parts.push(`d${i} ${f3(dishPx[i]!)} ${f3(dishPy[i]!)}`);
        parts.push(`paw ${f3(pawX)} ${f3(pawY)} stack ${f3(stackX)} ${f3(stackY)}`);
        return parts.join('; ');
      };
      let layouts = 0, seed = 20261005, slowest = 0;
      const rnd = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
      for (const [w, h] of sizes) for (let t = 0; t < 3; t++) {
        tier = toTier(t);
        for (let step = 1; step <= TOP_STEP; step++) {
          const seen = new Set<string>(), plans: CustomerPlan[] = [];
          if (step === 1) plans.push(goalCustomer(), taughtCustomer(tier));
          if ((DEMO_PLAN_STEPS as readonly number[]).includes(step)) plans.push(demoPlan(step, step, tier));
          for (let n = 0; n < perStep * 6 && plans.length < perStep; n++) {
            const p = planCustomer(step, tier, rnd, -1), key = JSON.stringify([p.parts, p.pay, p.till]);
            if (!seen.has(key)) { seen.add(key); plans.push(p); }
          }
          plans.forEach((p, n) => {
            for (let c = 0; c < CUSTOMER_COUNT; c++) {
              plan = p; who = c; good = (n + c) % GOODS_COUNT; good2 = (good + 3) % GOODS_COUNT;
              const t0 = performance.now(); geometry(w, h); layouts++;
              const took = performance.now() - t0; if (took > slowest) slowest = took;
              const label = `${w}x${h} tier ${t} step ${step} ${CUSTOMERS[c]!.name} ${p.dollars ? '$' : ''}${p.parts.join('+')}${p.dollars ? '' : 'c'} pay [${p.pay.map(name)}] till [${p.till.map(name)}]`;
              for (const f of fitFailures()) failures.push(`${label}: ${f}`);
              if (rects) dump.push(`${label} | ${boxes()}`);
            }
          });
        }
      }
      plan = keep.plan; who = keep.who; good = keep.good; good2 = keep.good2; tier = keep.tier;
      layout(keep.W, keep.H);
      return rects ? { layouts, failures, slowestMs: Math.round(slowest * 100) / 100, rects: dump } : { layouts, failures, slowestMs: Math.round(slowest * 100) / 100 };
    },
  };

  function applyDebug(): void {
    if (!services.debug.enabled || debugApplied) return;
    debugApplied = true;
    const params = new URLSearchParams(location.search), step = Number(params.get('step')), rounds = Number(params.get('rounds'));
    if (params.has('step') && Number.isSafeInteger(step) && step >= 1 && step <= TOP_STEP) { data.cashStep = step; data.cashLearn.length = 0; data.cashQuiet = 0; }
    if (params.has('rounds') && Number.isSafeInteger(rounds) && rounds >= 0) { data.rounds = rounds; data.pending = null; }
    else if (params.has('step') && data.rounds === 0) data.rounds = 1;
  }
  return {
    stats,
    enter() {
      void loadMarketStallArt(services).then(() => { bakedTray = ''; bakedBoard = ''; bakedBills = ''; layout(services.canvas.width, services.canvas.height); });
      if (services.debug.enabled) recordVoice();
      data = services.save.gameData<StallData>(GAME_ID, bagDefaults());
      sanitizeStallData(data, () => services.save.protect());
      cashierStart(data);
      applyDebug();
      if (!(services.debug.enabled && new URLSearchParams(location.search).has('rounds'))) data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; bookGlide = false; startMusic(audio, 'market-stall');
      if (data.pending) {
        pending = data.pending; stars = pending.stars; tier = pending.tier; intro = false;
        layout(services.canvas.width, services.canvas.height);
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
        else enterRest();
      } else { layout(services.canvas.width, services.canvas.height); startRound(); }
      if (services.debug.enabled) (window as unknown as { __marketStall?: MarketStallStats }).__marketStall = stats;
    },
    pause() {
      stopMusic(audio); stopIdle(); stopVoice(audio);
      if (carry.active) { carry.active = false; launch(F_RETURN, carry.kind, carry.well, input.pointer.x, input.pointer.y, wellX[carry.well]!, wellY[carry.well]!, RETURN_SECONDS); }
      services.save.flush();
    },
    resume() {
      guard(phase === 'choice' || phase === 'rest' ? MENU_GUARD_MS : PLAY_GUARD_MS); cornerFocus = -1;
      startMusic(audio, 'market-stall');
    },
    exit() {
      stopMusic(audio); stopIdle(); stopVoice(audio); offers.cancel(); closeFinishedRound(); services.save.flush();
      releaseArt(); sprites.clearScaled(BG); bgCanvas = undefined; sizeKey = ''; madeN = 0; bakedTray = ''; bakedBoard = ''; bakedBills = '';
      trayCanvas = undefined; boardCanvas = undefined; billCanvas.fill(undefined);
    },
    resize: layout,
    hoverAt,
    update(dt) {
      const started = performance.now(); sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      updateVoice(audio, dt);
      if (playable()) updatePlay(dt); else if (phase === 'closing') updateClosing(dt); else updateResult(dt);
      updateHover(dt);
      askIdle(); updateFlights(dt); particles.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H || sprites.pixelRatio !== artRatio) layout(view.width, view.height);
      ensureBackground(); warm(ctx);
      if (bgCanvas) ctx.drawImage(bgCanvas, bgX, bgY, bgCanvas.width / sprites.pixelRatio, bgCanvas.height / sprites.pixelRatio);
      else { ctx.fillStyle = '#f3e3c0'; ctx.fillRect(0, 0, W, H); }
      renderHarbour(ctx);
      tagN = 0;
      if (playable()) renderPlay(ctx); else if (phase === 'closing') { renderClosing(ctx); particles.render(ctx); } else renderResult(ctx);
      drawCorners(ctx); drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'pointerup') { soundButton.pointerUp(soundX, cornerY); if (playable() && performance.now() >= inputAfter) pointerUp(event.info.x, event.info.y); return; }
      if (event.type === 'keyup') { soundButton.pointerUp(soundX, cornerY); return; }
      const now = performance.now();
      if (event.type === 'pointermove') {
        if ((phase === 'choice' || phase === 'rest') && now >= inputAfter) { const index = hoverMenu(event.info.x, event.info.y); if (index >= 0) { if (menuSelected < 0) focusAt = now; menuSelected = index; } }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { exitToHub(); return; }
        cornerFocus = -1;
      } else if (!playable()) {
        if (phase === 'celebration' ? celebrationLocked() : now < inputAfter) return;
        const code = event.info.code;
        if (code === 'Escape') { exitToHub(); return; }
        if (code === 'Tab') { cornerFocus = (cornerFocus + 2) % 3 - 1; return; }
        if (cornerFocus >= 0) {
          if (code.startsWith('Arrow')) { cornerFocus = 1 - cornerFocus; return; }
          if (code === 'Enter' || code === 'NumpadEnter') { if (cornerFocus === 0) exitToHub(); else soundButton.pointerDown(soundX, cornerY); return; }
          cornerFocus = -1;
        }
      }
      if (phase === 'closing') { if (closeT > 0.5) closeSpeed = 4; return; }
      if (phase === 'celebration') { if (!celebrationLocked()) finishCelebration(); return; }
      if (now < inputAfter) return;
      if (playable()) { if (event.type === 'pointerdown') pointerDown(event.info.x, event.info.y); else keyPlay(event.info.code); return; }
      if (phase !== 'choice' && phase !== 'rest') return;
      const n = phase === 'choice' ? pending?.choices.length ?? 1 : 2;
      if (event.type === 'pointerdown') {
        const selected = hoverMenu(event.info.x, event.info.y); if (selected < 0) return; menuSelected = selected;
      } else {
        const code = event.info.code;
        if (menuSelected < 0) { menuSelected = 0; focusAt = now; return; }
        if (code.startsWith('Arrow')) { menuSelected = (menuSelected + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
      }
      if (phase === 'choice') chooseSticker(menuSelected); else leave(menuSelected === 0);
    },
  };
}
