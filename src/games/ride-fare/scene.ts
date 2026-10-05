/**
 * Ride Fare: animal friends queue for a hot-air balloon ride. The child pays each fare by dropping coins from a wooden
 * tray into the brass fare box: each coin lights as many dot cups as it is worth, and when every cup is lit the animal
 * climbs in, the balloon lifts off, drifts and lands, and the next animal steps up. Step 1 shows coin pictures to match
 * instead of cups. A coin worth more than the unlit cups hops back to the tray. The age-6 steps add dimes and a second
 * panel of cups (5), the fare as a numeral with rows of ten small cups (6), a swap stand that turns five pennies into a
 * nickel and two nickels into a dime (7), and change handed back to the animal's paws (8).
 */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, chunkyPanel, DISPLAY_FONT, drawSprite, OUTLINE } from '../../ui/draw';
import { confettiBurst, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, onBook, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { clamp01, easeInCubic, easeInOutSine, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { defaultData, GAME_ID, sanitizeRideData, TOP_STEP, type PendingRound, type RideData } from './data';
import {
  applyLearning, applyMotor, arrangeTray, COIN_MM, COIN_NAMES, COIN_VALUE, DIME, DIME_MM, introRider, MIN_DIME_PX, NICKEL,
  PENNY, planRider, recordRider, riderStep, ROUND_STARS, swapRider, TIERS, type RiderPlan,
} from './rules';
import { playVoice, preloadVoice } from './voice';

export { GAME_ID };
const ART = 'ride-fare/';
const BG = `${ART}launch-field`, BASKET = `${ART}basket`, ENVELOPE = `${ART}envelope`, FAREBOX = `${ART}fare-box`, TRAY = `${ART}tray`, HAND = `${ART}helper-hand`;
const PANEL = `${ART}fare-panel`, STAND = `${ART}swap-stand`;
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
const ANIMALS = ['hedgehog', 'bunny', 'fox', 'raccoon', 'bear', 'mouse'] as const;
const ANIMAL_NAMES = ANIMALS.map(a => [`${ART}${a}-wait`, `${ART}${a}-wave`] as const);
const COIN_FACES = COIN_NAMES.map(c => [`${ART}coin-${c}-heads`, `${ART}coin-${c}-tails`] as const);
const NUMBER_CLIPS = Array.from({ length: 100 }, (_, n) => `number-${n}` as const);

// Measured once from the sprites' pixels (round 2), as fractions of each image.
/** basket.webp: top of the rim, its bottom edge, the front rim line animals inside are clipped at, the door's left edge. */
const RIM_TOP = 0.379, RIM_BOTTOM = 0.476, RIM_CLIP = 0.425;
/** Where on the basket's ropes the envelope's mouth sits (the envelope hides the burner and the upper ropes). */
const ENVELOPE_AT = 0.27;
/** envelope.webp: the mouth row; the ropes below it are not drawn (the basket brings its own). */
const MOUTH = 0.8;
/** fare-box.webp: the dark window where code draws the cups (x0, x1, y0, y1) and the coin slot's centre line and top. */
const WIN_X0 = 0.265, WIN_X1 = 0.912, WIN_Y0 = 0.271, WIN_Y1 = 0.859, SLOT_X = 0.146, SLOT_TOP = 0.37;
/** fare-panel.webp (600x264): its dark window, measured round 3 (42..556 x 42..222 px), inset a little. */
const PWIN_X0 = 0.08, PWIN_X1 = 0.92, PWIN_Y0 = 0.17, PWIN_Y1 = 0.83;
/** The second panel's width as a share of the fare box's: its rows of small cups then match the box's. */
const PANEL_W = 1.04;
/**
 * Step 6's small cups are at least 12 px across (radius ROWS_MIN_R). On narrow windows the box is at least
 * ROWS_BOX_MIN CSS px wide with six rows of ten, and the panel ROWS_PANEL_MIN wide with the last four.
 */
const ROWS_MIN_R = 6, ROWS_BOX_MIN = 218, ROWS_PANEL_MIN = 182;
/**
 * swap-stand.webp (582x700): the open space between its posts above the table top (x 0.137..0.864, awning bottom 0.43,
 * table top 0.636), where the dotted circles and coins sit, and its press zone (most of the stand below the awning).
 */
const STAND_X0 = 0.17, STAND_X1 = 0.83, STAND_TABLE = 0.64, STAND_AWNING = 0.43, STAND_ZONE_Y0 = 0.3, STAND_ZONE_Y1 = 0.86;
/** Stand width in layout units (478 px at 1920x1080, under its 582 px). */
const STAND_W = 340;
/** tray.webp: the end caps' width in its own pixels; the middle repeats, mirrored, so nothing draws above 1.0. */
const TRAY_CAP = 200;
/** Layout units: basket width and left edge, envelope width, animal height. */
const BASKET_W = 470, BASKET_LEFT = 64, ENVELOPE_W = 540, ANIMAL_H = 260;
/** Largest layout unit: at 1920x1080 every piece draws at most at its own pixel size. */
const U_MAX = 1.405;
/** Scale of the small balloon that drifts across the sky, and of the celebration balloon (of the play balloon). */
const DRIFT_K = 0.3;
/** Queue spots on the path, in launch-field.webp pixels (nearest first). */
const PATH = [[1180, 880], [1330, 838], [1480, 790], [1620, 740]] as const;
const MAX_PLACES = 8, MAX_CUPS = 100, POOL = 24, PARTICLES = 160;

const CELEBRATION_SECONDS = 4.6, STAR_START = 0.5;
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350, KEY_GAP_MS = 150, IDLE_SECONDS = 6, IDLE_SOON = 4, IDLE_REPEAT = 7;
/**
 * A coin counts as a deliberate choice when the press that picked it came at least this long after the previous press
 * in play; a stream of quick presses (mashing) plays fully but records no learning evidence.
 */
const DELIBERATE_MS = 700;
/** Cups light this far apart as a coin pours: a nickel's five within 0.3 s; a dime's ten in one quicker pour. */
const POUR_GAP = 0.07, POUR_GAP_FAST = 0.032;
/** A coin's trip into the slot: fly to the slot, show its dots, slip in edge-on. */
const SEND_FLY = 0.3, SEND_DOTS = 0.25, SEND_SLIP = 0.15, SEND_SECONDS = SEND_FLY + SEND_DOTS + SEND_SLIP;
/** A coin that is too much: fly to the slot, show its dots, hop home. */
const REJECT_HOLD = 0.35, REJECT_HOP = 0.5, REJECT_SECONDS = SEND_FLY + REJECT_HOLD + REJECT_HOP;
const RETURN_SECONDS = 0.4, ARRIVE_SECONDS = 0.45, ARRIVE_STAGGER = 0.06, LEAVE_SECONDS = 0.35;
/** A coin's trip to the swap stand or the paws, and a coin those hand back. */
const TO_SECONDS = 0.35, BACK_HOLD = 0.3, BACK_HOP = 0.5;
/** The swap: hold, the coins slide together, the new coin shows its dots, then hops onto the tray. */
const MERGE_SLIDE_AT = 0.2, MERGE_AT = 0.55, MERGE_HOP_AT = 1.15, MERGE_HOP = 0.5;
/**
 * The fare-paid sequence: cups pulse, the animal hops in, the balloon lifts off the top. A fresh balloon then lands
 * while the small one carries the rider across the sky in the background, and the next rider can pay once it is down.
 */
const SEQ_PULSE = 0.35, SEQ_HOP = 0.5, SEQ_LIFT = 0.7, SEQ_LAND = 0.7, DRIFT_SECONDS = 2.6;
const SEQ_HOP_AT = SEQ_PULSE, SEQ_LIFT_AT = SEQ_HOP_AT + SEQ_HOP, SEQ_SECONDS = SEQ_LIFT_AT + SEQ_LIFT;
/** The introduction's goal holds its lit cups this long first; its helper starts this long after the rider steps up. */
const GOAL_HOLD = 0.5, INTRO_HAND_AT = 0.35;
/** Helper hand timeline: rise to the coin, press it, carry it to the target, then fade (or go back for the next coin). */
const HAND_PRESS_AT = 0.5, HAND_CARRY_AT = 0.7, HAND_DROP_AT = 1.4, HAND_FADE = 0.5;
/** Repeated carries of one demonstration (pennies to the swap stand) run quicker: back, press, carry. */
const REP_BACK = 0.35, REP_PRESS = 0.15, REP_CARRY = 0.5;
const FANFARE: SfxOptions = { variant: 'D' };
const CUP_RIM = '#e2b453', PLATE_FILL = '#fff4dc', PLATE_LINE = '#8a6232', HIGHLIGHT = '#fff6a3';
const NUM_FILL = '#5a3416', NUM_LIT = '#c77712';
const DASH = [6, 6], NO_DASH: number[] = [];

type Phase = 'play' | 'celebration' | 'choice' | 'sticker' | 'rest';
type RiderPhase = 'enter' | 'pay' | 'paid';
/**
 * Flight modes. ARRIVE: a coin slides onto the tray; LEAVE: off it; SEND: into the slot; REJECT: too much, back from
 * the slot; RETURN: back from a miss; TO_STAND / TO_PAWS: onto the swap stand or into the animal's paws; BACK_STAND /
 * BACK_PAWS: not wanted there, back to the tray; SWAPPED: a swapped coin hops from the stand onto the tray.
 */
const ARRIVE = 0, LEAVE = 1, SEND = 2, REJECT = 3, RETURN = 4, TO_STAND = 5, TO_PAWS = 6, BACK_STAND = 7, BACK_PAWS = 8, SWAPPED = 9;
const HAND_DEMO = 1, HAND_TAP = 2, HAND_HINT = 3;
/** Drop targets: the fare box, the swap stand (step 7), the animal's paws (step 8). */
const T_BOX = 0, T_STAND = 1, T_PAWS = 2;
/** Cup layouts: a 5 x 2 grid in the box (a second grid on the panel above 10), or rows of ten small cups (step 6). */
const CUPS_GRID = 0, CUPS_ROWS = 1;

interface Flight {
  active: boolean; mode: number; kind: number; n: number; place: number;
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; giggles: number;
}
interface Rect { x: number; y: number; w: number; h: number }
interface CoinInfo { kind: string; face: 'heads' | 'tails'; x: number; y: number; d: number; place: number; count: number; dots: boolean; hit: Rect | null }
interface TargetInfo { kind: string; x: number; y: number; w: number; h: number; drawn?: Rect }
/** One group of cups: the box's grid, the panel's grid, or one row of ten (step 6), with how many are lit. */
interface CupGroup { where: 'box' | 'panel'; row: number; total: number; lit: number; change: number }
export interface RideFareStats {
  readonly step: number; readonly contentStep: number; readonly tier: Tier; readonly rounds: number; readonly phase: Phase; readonly riderPhase: RiderPhase;
  readonly intro: boolean; readonly introStage: number; readonly rider: number; readonly riders: number; readonly hits: number; readonly misses: number;
  readonly bounces: number; readonly stars: number; readonly stickerId: string; readonly choiceIds: readonly string[]; readonly hand: number;
  readonly carrying: boolean; readonly focus: number; readonly counted: readonly number[]; readonly learn: readonly number[];
  /** The fare in cents (steps 1 and 7: the value of the plate's coins). */
  readonly fare: number;
  readonly cups: { total: number; lit: number };
  /** Drawn cup diameters in CSS px: the grids (steps 2-5, 8) and the rows of ten (step 6). */
  readonly cupDiameter: { grid: number; rows: number };
  /** Cups per panel (grid) or per row of ten (step 6), each with its lit count and (step 8) change cups still owed. */
  readonly cupGroups: readonly CupGroup[];
  /** Step 6 and 8: the numeral shown beside the cups (fare and, at step 6, the climbing count), or null. */
  readonly numeral: { fare: number; counter: number; rect: Rect } | null;
  /** Step 7: the swap stand (drawn rectangle, press zone, coins resting on it). */
  readonly stand: { drawn: Rect; zone: Rect; kind: string; count: number; need: number } | null;
  /** Step 8: the animal's paws target (rectangle and zone with the snap distance) and the change owed and still to hand back. */
  readonly paws: { rect: Rect; zone: Rect; owed: number; left: number; paid: boolean } | null;
  readonly demos: number;
  readonly keyTarget: string;
  readonly plate: readonly { kind: string; lit: boolean }[];
  readonly coins: readonly CoinInfo[];
  readonly targets: readonly TargetInfo[];
  readonly coinSizes: { penny: number; nickel: number; dime: number };
  readonly workMean: number; readonly workMax: number;
  /** Largest drawn scale of each image drawn this layout (drawn px / image px at pixel ratio 1). */
  scales(): Record<string, number>;
  resetWork(): void;
}
export interface RideFareScene extends Scene { readonly stats: RideFareStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);
const spriteName = (path: string): string => path.replace(/\.\w+$/, '');

function artList(): { name: string; path: string }[] {
  const paths = [`${BG}.webp`, `${BASKET}.webp`, `${ENVELOPE}.webp`, `${FAREBOX}.webp`, `${PANEL}.webp`, `${STAND}.webp`, `${TRAY}.webp`, `${HAND}.webp`, `${BUTTON_PLAY}.png`, `${BUTTON_HOME}.png`, BOOK_ICON_PATH];
  for (const pair of ANIMAL_NAMES) for (const n of pair) paths.push(`${n}.webp`);
  for (const pair of COIN_FACES) for (const n of pair) paths.push(`${n}.webp`);
  return [...paths.map(path => ({ name: spriteName(path), path })), ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path }))];
}
const OWN_ART = artList().map(a => a.name).filter(name => name !== BG);
export async function loadRideFareArt(services: AppServices): Promise<string[]> {
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
/** Cup looks: an empty socket, lit warm yellow, or (step 8) a change cup lit copper like a penny. */
const CUP_UNLIT = 0, CUP_LIT = 1, CUP_CHANGE = 2;
/**
 * One dot cup, `r` in radius to the outside of its brass rim (the rim is drawn inside, so the cup's whole size reads):
 * an empty grey socket, lit warm yellow, or lit copper.
 */
function bakeCup(r: number, ratio: number, look: number): HTMLCanvasElement {
  const size = r * 2 + 4, { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const cx = size / 2, lw = Math.max(2, r * 0.16), ri = r - lw / 2;
  g.beginPath(); g.arc(cx, cx, ri, 0, Math.PI * 2);
  if (look === CUP_LIT) {
    const grad = g.createRadialGradient(cx - r * 0.25, cx - r * 0.3, r * 0.1, cx, cx, r);
    grad.addColorStop(0, '#fffbe0'); grad.addColorStop(0.55, '#ffd84f'); grad.addColorStop(1, '#f0a81e');
    g.fillStyle = grad;
  } else if (look === CUP_CHANGE) {
    const grad = g.createRadialGradient(cx - r * 0.25, cx - r * 0.3, r * 0.1, cx, cx, r);
    grad.addColorStop(0, '#ffe2c4'); grad.addColorStop(0.55, '#e48a4e'); grad.addColorStop(1, '#a8501f');
    g.fillStyle = grad;
  } else {
    const grad = g.createRadialGradient(cx, cx + r * 0.35, r * 0.1, cx, cx, r);
    grad.addColorStop(0, '#9da2ad'); grad.addColorStop(0.7, '#727785'); grad.addColorStop(1, '#4d5260');
    g.fillStyle = grad;
  }
  g.fill();
  g.lineWidth = lw; g.strokeStyle = look === CUP_LIT ? '#e09a1c' : look === CUP_CHANGE ? '#8a4a1c' : CUP_RIM; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** A dashed ring `d` across: an empty place for a coin on the swap stand or on the tray. */
function bakeRing(d: number, ratio: number, line: string): HTMLCanvasElement {
  const size = d + 8, { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const lw = Math.max(2.5, d * 0.045);
  g.beginPath(); g.arc(size / 2, size / 2, d / 2, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255, 244, 220, 0.35)'; g.fill();
  g.setLineDash([Math.max(5, d * 0.09), Math.max(4, d * 0.07)]); g.lineWidth = lw; g.strokeStyle = line; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** Glyphs "0" to "9" and the cent sign, baked once per size with the bundled font: x offset and width of each. */
const GLYPHS = '0123456789¢';
function bakeDigits(px: number, ratio: number, fill: string, offX: Float32Array, widths: Float32Array): HTMLCanvasElement {
  const probe = cpuCanvas(1, 1).g, font = `700 ${Math.round(px)}px ${DISPLAY_FONT}`;
  let total = 0;
  if (probe) probe.font = font;
  const pad = Math.ceil(px * 0.12);
  for (let i = 0; i < GLYPHS.length; i++) {
    const w = probe ? probe.measureText(GLYPHS[i]!).width : px * 0.6;
    offX[i] = total + pad; widths[i] = w; total += w + pad * 2;
  }
  const h = Math.ceil(px * 1.35), { c, g } = cpuCanvas(total * ratio, h * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = Math.max(3, px * 0.14); g.strokeStyle = '#fff8e6'; g.fillStyle = fill;
  for (let i = 0; i < GLYPHS.length; i++) { g.strokeText(GLYPHS[i]!, offX[i]!, h / 2 + px * 0.04); g.fillText(GLYPHS[i]!, offX[i]!, h / 2 + px * 0.04); }
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** The tray: two end caps at one scale and a middle repeated (every other copy mirrored), each drawn at 1.0 or less. */
function bakeTray(img: HTMLImageElement, w: number, h: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpuCanvas(w * ratio, h * ratio); if (!g) return c;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth, ih = img.naturalHeight, k = (h * ratio) / ih, cap = Math.min(TRAY_CAP, iw / 3), capW = cap * k, H = h * ratio, Wd = w * ratio;
  g.drawImage(img, 0, 0, cap, ih, 0, 0, capW, H);
  g.drawImage(img, iw - cap, 0, cap, ih, Wd - capW, 0, capW, H);
  const mid = iw - 2 * cap, span = Wd - 2 * capW;
  // An odd number of copies, so the first and last are unmirrored and meet the end caps as in the source.
  let tiles = Math.max(1, Math.ceil(span / (mid * k)));
  if (tiles % 2 === 0) tiles++;
  const tw = span / tiles;
  for (let i = 0; i < tiles; i++) {
    const x = capW + i * tw;
    if (i % 2) { g.save(); g.translate(x + tw, 0); g.scale(-1, 1); g.drawImage(img, cap, 0, mid, ih, 0, 0, tw + 0.5, H); g.restore(); }
    else g.drawImage(img, cap, 0, mid, ih, x, 0, tw + 0.5, H);
  }
  g.getImageData(0, 0, 1, 1);
  return c;
}

let debugApplied = false;

export function createRideFareScene(services: AppServices): RideFareScene {
  const { sprites, audio, input } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(PARTICLES);
  const soundButton = createSoundButton(services), soundNames = soundArt(services).map(a => a.name);
  const flights: Flight[] = Array.from({ length: POOL }, () => ({ active: false, mode: 0, kind: 0, n: 1, place: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, giggles: 0 }));
  const work = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const pos = { x: 0, y: 0 };
  // Tray places: coin kind, coins resting there, endless supply, and small timers (hop when pressed, spin on arrival).
  const pKind: number[] = [], pCount: number[] = [], pUnlimited: boolean[] = [];
  const pHop = new Float32Array(MAX_PLACES).fill(9), pX = new Float32Array(MAX_PLACES), pY = new Float32Array(MAX_PLACES);
  /** Places whose coins came from the swap stand show their dots inside (step 7). */
  const pDots = new Uint8Array(MAX_PLACES), pExtra = new Uint8Array(MAX_PLACES);
  let nPlaces = 0;
  const cupPulse = new Float32Array(MAX_CUPS).fill(9), cupX = new Float32Array(MAX_CUPS), cupY = new Float32Array(MAX_CUPS);
  const have = new Int32Array(3);
  /** Coins of each kind the fare box took for the current rider. */
  const paidN = new Int32Array(3);
  const plateKind = new Int8Array(3), plateState = new Uint8Array(3), platePulse = new Float32Array(3).fill(9);
  const carry = { active: false, sticky: false, keyed: false, place: 0, kind: 0, downAt: 0, downX: 0, downY: 0, deliberate: false };
  /** The helper hand: what it does, its clock, the place and coin it takes, its target, and further carries to make. */
  const hand = { mode: 0, t: 0, place: 0, kind: 0, released: false, taken: false, target: T_BOX, reps: 0, cycle: 0, after: -1 };
  let data: RideData = defaultData();
  let W = 1366, H = 768, u = 1, fitS = 1;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0, bgScale = 1;
  let trayCanvas: HTMLCanvasElement | undefined;
  /** Baked cups per look (unlit, lit, change): full-size cups for the grids and small ones for step 6's rows. */
  const cupCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined], smallCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined];
  let glowCanvas: HTMLCanvasElement | undefined, dotCanvas: HTMLCanvasElement | undefined;
  let ringStand: HTMLCanvasElement | undefined, ringStand2: HTMLCanvasElement | undefined, ringPlace: HTMLCanvasElement | undefined, digitsBig: HTMLCanvasElement | undefined, digitsLit: HTMLCanvasElement | undefined;
  const digitX = new Float32Array(GLYPHS.length), digitW = new Float32Array(GLYPHS.length);
  let artRatio = 0, glowSize = 0, dotSize = 0, bakedCupR = 0, bakedSmallR = 0, bakedTray = '', bakedRing = '', bakedDigits = 0, digitPad = 0;
  let phase: Phase = 'play', tier: Tier = 0, intro = false, introStage = 0, animalOffset = 0;
  let riderPhase: RiderPhase = 'enter', riderT = 0, seqT = 0, riderIndex = 0, ridersTotal = 3, enterSeconds = 1;
  let plan: RiderPlan = introRider(), fare = 0, lit = 0, reserved = 0, pourLeft = 0, pourTimer = 0, pourGap = POUR_GAP, plateN = 0, lastFare = 0;
  /** Cups on show (step 8: the fare's cups plus the change cups) and how they are laid out. */
  let nCups = 0, cupMode = CUPS_GRID, panelOn = false, numeralOn = false;
  /** Step 8: cents of change owed after the animal's dime, still to hand back, and pennies on their way to the paws. */
  let changeOwed = 0, changeLeft = 0, changeReserved = 0, animalPaid = false;
  /** Step 7: coins resting on the swap stand, coins flying to it, and the swap's clock (-1 when no swap is running). */
  let standKind = -1, standCount = 0, standIn = 0, mergeT = -1, mergeKind = 0;
  /** Keyboard play with two targets: which target the held coin will drop on. */
  let keyTarget = T_BOX;
  let riderAnimal = 0, riderAssisted = false, riderKeyed = false, riderDeliberate = true, riderBounced = false, nickelFirst = false, riderDrops = 0;
  let bouncesHere = 0, lastPressAt = -9999, boxPulse = 9, boxHop = 9, gateHop = 9, queueHop = 9, standHop = 9, pawsHop = 9;
  /** The fresh balloon landing after a lift-off, and the small balloon carrying the last rider across the sky. */
  let landT = 9, driftT = 9, driftAnimal = 0;
  const roundCounted: number[] = [];
  let time = 0, sceneT = 0, phaseT = 0, idleT = 0;
  let hits = 0, misses = 0, bounces = 0, stars = 1, starsPlayed = 0, focus = 0;
  let pending: PendingRound | null = null;
  let menuSelected = -1, inputAfter = 0, keyAfter = 0, focusAt = 0;
  let workHead = 0, workCount = 0, updateMs = 0;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0;
  const warmNames: string[] = [], warmSizes: number[] = [], warmDone = new Set<string>();
  let warmIndex = 0, madeName = '', madeSize = 0, sizeKey = '';
  // Layout in logical (CSS) px.
  const coinD = new Float32Array(3);
  let trayX = 0, trayY = 0, trayW = 0, trayH = 0, rowH = 0, rows = 1, placeW = 0, placeGap = 0, maxPlaces = 3;
  let basketL = 0, basketBottom = 0, BW = 0, BH = 0, EW = 0, EH = 0, animalH = 0;
  let boxX = 0, boxY = 0, boxW = 0, boxH = 0, zoneX0 = 0, zoneY0 = 0, zoneX1 = 0, zoneY1 = 0;
  let gateX = 0, feetY = 0, cupR = 0, smallR = 0;
  /** Step 6: rows of ten in the box's window (5, or 6 on narrow windows); the panel holds the rest. */
  let boxRows = 5, rowsLaid = false;
  /** The second panel (above the box), the numeral plate (right of the box), the swap stand and the animal's paws. */
  let panelX = 0, panelY = 0, panelW = 0, panelH = 0, numX = 0, numY = 0, numW = 0, numH = 0, numPx = 0;
  let standX = 0, standY = 0, standW = 0, standH = 0, sZoneX0 = 0, sZoneY0 = 0, sZoneX1 = 0, sZoneY1 = 0;
  let pawsX0 = 0, pawsY0 = 0, pawsX1 = 0, pawsY1 = 0, pZoneX0 = 0, pZoneY0 = 0, pZoneX1 = 0, pZoneY1 = 0;
  /** The balloon's vertical offset (lift and landing) and the drifting small balloon's position. */
  let liftY = 0, driftX = 0, driftY = 0;
  let starY = 0, starR = 0, cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1;
  let choiceSize = 0, choiceY = 0, restSize = 0, restY = 0, controlsY = 0, controlsRadius = 60;
  const offers = createStickerOffers(sprites), bookAt = new Float32Array(2);
  let bookH = 150, bookGlide = false;
  const stickerNames = new Map(STICKERS.map(s => [s.id, stickerSpriteName(s.id)]));
  /** Largest drawn scale per image name in this layout, for the sharpness check. */
  const drawnScale = new Map<string, number>();

  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  const playable = (): boolean => phase === 'play';
  const contentStep = (): number => plan.step;
  const usesPlate = (): boolean => plateN > 0;
  /** The round's content may need the second panel (any rider of step 5 or 6): the layout keeps room for it. */
  const roundPanel = (): boolean => !intro && data.step >= 5;
  const swapOn = (): boolean => plan.swap;
  const pawsOn = (): boolean => plan.animalPays > 0 && riderPhase === 'pay';
  /** Where the gate animal stands: where the swap stand would hide it (narrow windows), just left of the stand. */
  const gateAt = (): number => (plan.swap ? Math.min(gateX, standX - animalH * 0.2) : gateX);
  const boxCX = (): number => boxX + boxW / 2;
  const slotX = (): number => boxX + boxW * SLOT_X;
  const slotY = (): number => boxY + boxH * SLOT_TOP + liftY;
  const basketTop = (): number => basketBottom - BH;
  const note = (name: string, drawn: number, natural: number): void => {
    const k = drawn / (natural || 1), old = drawnScale.get(name) ?? 0;
    if (k > old) drawnScale.set(name, k);
  };

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H;
    W = width; H = height;
    const reratio = sprites.pixelRatio !== artRatio;
    artRatio = sprites.pixelRatio;
    if (reratio) warmDone.clear();
    u = Math.min(U_MAX, Math.max(0.45, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    const cornerU = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * cornerU, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    const tp = TIERS[tier];
    // Coins at true ratios; the dime never below 96 CSS px.
    const dime = Math.max(MIN_DIME_PX, tp.dime * u);
    for (let k = 0; k < 3; k++) coinD[k] = Math.round(dime * COIN_MM[k]! / DIME_MM);
    // The tray: one row of places along the bottom, two rows where fewer than three places fit in one.
    const edge = Math.max(6, 20 * u);
    placeGap = Math.max(8, 16 * u); placeW = Math.max(96, Math.round(coinD[NICKEL]! + 16 * u));
    rowH = Math.round(coinD[NICKEL]! + 36 * u);
    trayW = Math.round(W - 2 * edge); trayX = Math.round(edge);
    const capIn = rowH * 0.42;
    const perRow = Math.max(1, Math.floor((trayW - 2 * capIn + placeGap) / (placeW + placeGap)));
    rows = perRow >= Math.min(3, tp.places) ? 1 : 2;
    maxPlaces = Math.min(MAX_PLACES, tp.places, perRow * rows);
    trayH = rows * rowH + (rows - 1) * placeGap;
    trayY = Math.round(H - Math.max(6, 12 * u) - trayH);
    // Basket, fare box and gate animal: shrink together in 5 percent steps until everything fits on screen.
    for (fitS = 1; fitS >= 0.6; fitS -= 0.05) { placeBalloon(tp.box, tp.snap); if (fits()) break; }
    if (fitS < 0.6) { fitS = 0.6; placeBalloon(tp.box, tp.snap); }
    placeExtras(tp.snap * u, tp.paws);
    if (nPlaces) placeCoins();
    if (nCups) placeCups();
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
    // Baked pieces follow the pixel ratio and their sizes.
    const glow = Math.round(coinD[NICKEL]! * 1.7);
    if (!glowCanvas || reratio || glow !== glowSize) { glowSize = glow; glowCanvas = bakeGlow(glowSize, artRatio, false); }
    const dot = Math.max(10, Math.round(coinD[PENNY]! * 0.26));
    if (!dotCanvas || reratio || dot !== dotSize) { dotSize = dot; dotCanvas = bakeGlow(dotSize, artRatio, true); }
    if (!cupCanvas[0] || reratio || cupR !== bakedCupR) { bakedCupR = cupR; for (let k = 0; k < 3; k++) cupCanvas[k] = bakeCup(cupR, artRatio, k); }
    if (roundPanel() && (!smallCanvas[0] || reratio || smallR !== bakedSmallR)) { bakedSmallR = smallR; for (let k = 0; k < 3; k++) smallCanvas[k] = bakeCup(smallR, artRatio, k); }
    const ringKey = `${coinD[PENNY]}/${standW}@${artRatio}`;
    if (roundPanel() && ringKey !== bakedRing) {
      bakedRing = ringKey;
      ringStand = bakeRing(standCoinD(5), artRatio, PLATE_LINE); ringStand2 = bakeRing(standCoinD(2), artRatio, PLATE_LINE); ringPlace = bakeRing(coinD[NICKEL]! * 0.96, artRatio, PLATE_LINE);
    }
    if (roundPanel() && (!digitsBig || reratio || numPx !== bakedDigits)) {
      bakedDigits = numPx; digitPad = Math.ceil(numPx * 0.12);
      digitsBig = bakeDigits(numPx, artRatio, NUM_FILL, digitX, digitW);
      digitsLit = bakeDigits(numPx, artRatio, NUM_LIT, digitX, digitW);
    }
    const trayKey = `${trayW}x${trayH}@${artRatio}`, trayImg = sprites.get(TRAY);
    if (trayImg && trayKey !== bakedTray) { bakedTray = trayKey; trayCanvas = bakeTray(trayImg, trayW, trayH, artRatio); }
    planWarm();
    const key = `${W}x${H}@${artRatio}/${tier}/${fitS}`;
    if (key !== sizeKey) { sizeKey = key; releaseArt(); drawnScale.clear(); }
    if (trayImg) {
      // The tray's caps scale by its height; each middle copy also stretches along the grain, never past its own pixels.
      const k = trayH / trayImg.naturalHeight, mid = trayImg.naturalWidth - 2 * TRAY_CAP, span = trayW - 2 * TRAY_CAP * k;
      let tiles = Math.max(1, Math.ceil(span / (mid * k))); if (tiles % 2 === 0) tiles++;
      note(TRAY, span / tiles, mid); note(TRAY, trayH, trayImg.naturalHeight);
    }
    if (resized || reratio || !bgCanvas) { sprites.clearScaled(BG); bgCanvas = undefined; }
    const img = sprites.get(BG);
    bgScale = img ? Math.max(W / img.naturalWidth, H / img.naturalHeight) : 1;
    if (img) { bgX = (W - img.naturalWidth * bgScale) / 2; bgY = (H - img.naturalHeight * bgScale) / 2; }
  }
  function placeBalloon(boxUnits: number, snapUnits: number): void {
    const s = u * fitS;
    BW = Math.round(BASKET_W * s); BH = Math.round(BW * 1030 / 687);
    EW = Math.round(ENVELOPE_W * s); EH = Math.round(EW * 1110 / 762);
    basketL = Math.round(BASKET_LEFT * s);
    basketBottom = trayY + Math.round(40 * s);
    animalH = Math.round(ANIMAL_H * s * (W < H ? 0.8 : 1));
    boxW = Math.round(boxUnits * s);
    // Step 6's rows of small cups must be 12 px across. Where five rows in the box and five in the panel would make
    // them smaller (narrow windows), the box grows and holds six rows and a smaller panel the last four.
    const rowsWidth = Math.min(boxW * (WIN_X1 - WIN_X0) / 10.6, boxW * PANEL_W * 264 / 600 * (PWIN_Y1 - PWIN_Y0) / 5);
    // Only a step-6 rider shows rows; startRider lays out again when the next rider changes that.
    rowsLaid = !intro && plan.step === 6;
    boxRows = rowsLaid && Math.floor(0.46 * rowsWidth) < ROWS_MIN_R ? 6 : 5;
    if (boxRows === 6) boxW = Math.max(boxW, ROWS_BOX_MIN);
    boxH = Math.round(boxW * 454 / 720);
    boxX = Math.max(6, Math.round(basketL - 0.09 * BW));
    const rimBottom = basketBottom - (1 - RIM_BOTTOM) * BH;
    boxY = Math.round((rimBottom + trayY) / 2 - 10 * s - boxH / 2);
    boxY = Math.min(boxY, trayY - 8 - boxH);
    boxY = Math.max(boxY, Math.round(basketBottom - (1 - RIM_TOP) * BH));
    // The press zone: the box plus the snap distance, at least 200 x 128, never over the tray or a corner button.
    const snap = snapUnits * s;
    zoneX0 = Math.max(0, boxX - snap); zoneX1 = boxX + boxW + snap; zoneY0 = boxY - snap; zoneY1 = Math.min(trayY - 2, boxY + boxH + snap);
    if (zoneX1 - zoneX0 < 200) { const c = (zoneX0 + zoneX1) / 2; zoneX0 = Math.max(0, c - 100); zoneX1 = zoneX0 + 200; }
    if (zoneY1 - zoneY0 < 128) zoneY0 = zoneY1 - 128;
    zoneY0 = Math.max(zoneY0, cornerY + cornerRadius + 4);
    gateX = basketL + BW + 16 * s + animalH * 0.34;
    feetY = trayY + 10 * s;
    // Cups fill the window as in the concept: five across with a thin gap, the brass rim inside each cup.
    const wx = boxW * (WIN_X1 - WIN_X0), wy = boxH * (WIN_Y1 - WIN_Y0);
    // The second panel sits above the box on the basket's rim, centred on the box's window; the smaller panel of a
    // narrow window moves right, between the corner buttons, as far as it must to clear the Home button.
    panelW = boxRows === 5 ? Math.round(boxW * PANEL_W) : ROWS_PANEL_MIN; panelH = Math.round(panelW * 264 / 600);
    panelX = Math.max(6, Math.round(boxX + boxW * (WIN_X0 + WIN_X1) / 2 - panelW / 2));
    panelY = Math.round(boxY - 6 * s - panelH);
    if (boxRows === 6) while (panelX + panelW < W - 6 && clearsCorner(homeX, panelX, panelY, panelW, panelH)) panelX += 2;
    const pwx = panelW * (PWIN_X1 - PWIN_X0), pwy = panelH * (PWIN_Y1 - PWIN_Y0);
    // Grids of ten (two rows of five) fit both windows.
    cupR = Math.max(7, Math.floor(Math.min(wx / 5 * 0.48, wy / 2 * 0.44, pwx / 5 * 0.48, pwy / 2 * 0.44)));
    // Step 6: rows of ten small cups (five, a gap, five), `boxRows` rows in the box's window and the rest in the panel's.
    smallR = Math.max(4, Math.floor(0.46 * Math.min(wx / 10.6, wy / boxRows, pwx / 10.6, pwy / (10 - boxRows))));
    // The numeral plate hangs on the basket right of the box.
    numH = Math.round(boxH * 0.5); numW = Math.round(numH * 1.15);
    numX = boxX + boxW + Math.round(6 * s); numY = Math.round(boxY + (boxH - numH) / 2);
    numPx = Math.max(12, Math.round(numH * 0.42));
    // The grown box of a narrow window: the gate animal stands right of the numeral plate.
    if (boxRows === 6) gateX = Math.max(gateX, numX + numW + 4 + animalH * 0.34);
  }
  /** Everything on screen: the whole fare box and its press zone, clear of the tray and the Home button, and the gate animal. */
  function fits(): boolean {
    if (boxX + boxW > W - 6 || boxY < 4 || boxY + boxH > trayY - 4 || zoneY1 - zoneY0 < 128) return false;
    if (clearsHome(boxX, boxY, boxW, boxH)) return false;
    if (roundPanel() && (panelY < 4 || clearsHome(panelX, panelY, panelW, panelH) || clearsCorner(soundX, panelX, panelY, panelW, panelH) || numX + numW > W - 4)) return false;
    return gateX + animalH * 0.36 <= W - 4;
  }
  /** Whether a rectangle comes within reach of the Home button. */
  function clearsHome(x: number, y: number, w: number, h: number): boolean { return clearsCorner(homeX, x, y, w, h); }
  /** Whether a rectangle comes within reach of the corner button centred at (cx, cornerY). */
  function clearsCorner(cx: number, x: number, y: number, w: number, h: number): boolean {
    const nx = Math.min(x + w, Math.max(x, cx)), ny = Math.min(y + h, Math.max(y, cornerY));
    return Math.hypot(cx - nx, cornerY - ny) < cornerRadius + 4;
  }
  /**
   * Coin size on the swap stand: `n` coins side by side between its posts, each standing on the table top with its
   * dashed ring (a little wider than the coin) and the swap's pop under the awning.
   */
  const standCoinD = (n: number): number =>
    Math.round(Math.min(standW * (STAND_X1 - STAND_X0) / n * 0.9, standH * (STAND_TABLE - STAND_AWNING) / 1.2, coinD[NICKEL]!));
  /** The swap stand (step 7) on the meadow at the right, and the animal's paws (step 8), each with its press zone. */
  function placeExtras(snap: number, paws: readonly [number, number]): void {
    standW = Math.round(STAND_W * u); standH = Math.round(standW * 700 / 582);
    standX = Math.round(W - Math.max(6, 20 * u) - standW);
    standY = Math.round(trayY + 10 * u - standH);
    standY = Math.max(standY, Math.round(cornerY + cornerRadius * 0.5));
    sZoneX0 = standX + standW * 0.04 - snap; sZoneX1 = standX + standW * 0.96 + snap;
    sZoneY0 = Math.max(cornerY + cornerRadius + 4, standY + standH * STAND_ZONE_Y0 - snap); sZoneY1 = Math.min(trayY - 2, standY + standH * STAND_ZONE_Y1 + snap);
    const pw = Math.max(96, paws[0] * u), ph = Math.max(96, paws[1] * u), cy = feetY - animalH * 0.42;
    // Centred on the animal, kept inside the window (a narrow window's gate animal stands near the right edge).
    pawsX0 = Math.min(gateX - pw / 2, W - 2 - pw); pawsX1 = pawsX0 + pw; pawsY0 = cy - ph / 2; pawsY1 = Math.min(trayY - 4, cy + ph / 2);
    if (pawsY1 - pawsY0 < 96) pawsY0 = pawsY1 - 96;
    pZoneX0 = Math.max(zoneX1 + 2, pawsX0 - snap); pZoneX1 = Math.min(W, pawsX1 + snap);
    pZoneY0 = Math.max(cornerY + cornerRadius + 4, pawsY0 - snap); pZoneY1 = Math.min(trayY - 2, pawsY1 + snap);
  }
  /**
   * Cup centres for the current fare. Grid: the box's window holds ten (two rows of five; one middle row for five or
   * fewer), the panel's window the next ten. Rows (step 6): ten to a row with a gap after five, `boxRows` rows in the
   * box, then the rest in the panel.
   */
  function placeCups(): void {
    const wx0 = boxX + boxW * WIN_X0, wx1 = boxX + boxW * WIN_X1, wy0 = boxY + boxH * WIN_Y0, wy1 = boxY + boxH * WIN_Y1;
    const px0 = panelX + panelW * PWIN_X0, px1 = panelX + panelW * PWIN_X1, py0 = panelY + panelH * PWIN_Y0, py1 = panelY + panelH * PWIN_Y1;
    if (cupMode === CUPS_ROWS) panelOn = nCups > boxRows * 10;
    for (let i = 0; i < nCups; i++) {
      const inPanel = cupMode === CUPS_GRID ? i >= 10 : i >= boxRows * 10;
      const x0 = inPanel ? px0 : wx0, x1 = inPanel ? px1 : wx1, y0 = inPanel ? py0 : wy0, y1 = inPanel ? py1 : wy1;
      if (cupMode === CUPS_GRID) {
        const j = i % 10, row = j < 5 ? 0 : 1, col = j % 5, count = inPanel ? nCups - 10 : Math.min(10, nCups);
        // Rows spread over the window, as in the concept; five or fewer sit in one middle row.
        cupX[i] = x0 + (col + 0.5) * (x1 - x0) / 5;
        cupY[i] = count > 5 ? y0 + (y1 - y0) * (row === 0 ? 0.27 : 0.73) : (y0 + y1) / 2;
      } else {
        const j = inPanel ? i - boxRows * 10 : i, row = Math.floor(j / 10), col = j % 10, pitch = (x1 - x0) / 10.6;
        cupX[i] = x0 + pitch * (col + 0.5 + (col >= 5 ? 0.6 : 0));
        cupY[i] = y0 + (y1 - y0) * (row + 0.5) / (inPanel ? 10 - boxRows : boxRows);
      }
    }
  }
  function releaseArt(): void {
    for (const name of OWN_ART) sprites.clearScaled(name);
    for (const name of soundNames) sprites.clearScaled(name);
    warmDone.clear();
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    const image = sprites.get(BG); if (!image) return;
    // The background may finish loading after the last layout: fit it to the window now, never at a stale scale.
    bgScale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
    bgX = (W - image.naturalWidth * bgScale) / 2; bgY = (H - image.naturalHeight * bgScale) / 2;
    bgCanvas = sprites.scaled(BG, bgScale);
    note(BG, bgScale, 1);
  }
  /** Place centres for the current tray contents. */
  function placeCoins(): void {
    const perRow = Math.ceil(nPlaces / rows);
    for (let i = 0; i < nPlaces; i++) {
      const r = rows === 1 ? 0 : Math.floor(i / perRow), j = rows === 1 ? i : i % perRow, m = rows === 1 ? nPlaces : r === 0 ? perRow : nPlaces - perRow;
      pX[i] = trayX + trayW / 2 + (j - (m - 1) / 2) * (placeW + placeGap);
      pY[i] = trayY + rowH / 2 + r * (rowH + placeGap) + rowH * 0.02;
    }
  }
  /** Queue spot k (0 = nearest) on the path, into pos; k = -1 is the gate. Returns the animal's size factor. */
  function queueSpot(k: number): number {
    if (k < 0) { pos.x = gateX; pos.y = feetY; return 1; }
    const p = PATH[Math.min(PATH.length - 1, k)]!;
    pos.x = bgX + p[0] * bgScale; pos.y = Math.min(trayY - 6, bgY + p[1] * bgScale);
    return 0.72 - 0.1 * k;
  }

  // ---------------------------------------------------------------- riders
  /** A new step's demonstration: shown once per profile, the first time a rider shows that step's content. */
  const demoDue = (step: number): boolean => !intro && step >= 5 && (data.demos & (1 << step)) === 0;
  let demoStarted = false;
  function startRider(i: number): void {
    riderIndex = i;
    const step = riderStep(data.step, i);
    // The first swap a profile sees is the simplest one (five pennies make the nickel the plate asks for).
    plan = intro && introStage === 2 && i === 0 ? introRider() : step === 7 && demoDue(7) ? swapRider(0) : planRider(step, random, lastFare);
    // A narrow window grows the box for step-6 rows only: lay out again when this rider changes whether rows show.
    if (!intro && (plan.step === 6) !== rowsLaid) layout(W, H);
    fare = plan.fare; lit = 0; reserved = 0; pourLeft = 0; pourTimer = 0; paidN.fill(0);
    plateN = plan.plate.length;
    for (let k = 0; k < 3; k++) { plateKind[k] = plan.plate[k] ?? 0; plateState[k] = 0; platePulse[k] = 9; }
    lastFare = plan.step <= 1 ? plateN : fare;
    // Cups: none with a plate; at step 8 the fare's cups and, once the dime pours, the change cups up to ten.
    changeOwed = plan.animalPays ? plan.animalPays - fare : 0; changeLeft = 0; changeReserved = 0; animalPaid = false;
    nCups = usesPlate() ? 0 : plan.animalPays ? plan.animalPays : fare;
    cupMode = plan.step === 6 ? CUPS_ROWS : CUPS_GRID;
    panelOn = cupMode === CUPS_GRID ? nCups > 10 : nCups > boxRows * 10;
    numeralOn = plan.step === 6 || plan.step === 8;
    standKind = -1; standCount = 0; standIn = 0; mergeT = -1;
    cupPulse.fill(9); placeCups();
    riderAnimal = intro ? (1 + i) % ANIMALS.length : (animalOffset + i) % ANIMALS.length;
    riderAssisted = intro && i === 0; riderKeyed = false; riderDeliberate = true; riderBounced = false; nickelFirst = false; riderDrops = 0;
    bouncesHere = 0; idleT = 0; demoStarted = false; keyTarget = T_BOX;
    riderPhase = 'enter'; riderT = 0;
    // Coins left from the last rider slide away; the new ones slide in from the right and spin as they settle.
    for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) launch(LEAVE, pKind[p]!, Math.min(5, pCount[p]!), p, pX[p]!, pY[p]!, pX[p]! - W, pY[p]!, LEAVE_SECONDS);
    nPlaces = arrangeTray(plan.tray, Math.max(1, maxPlaces - plan.extra.length), pKind, pCount, pUnlimited);
    // Step 7: coins from the swap stand land on empty places of their own, shown as dashed rings.
    for (const kind of plan.extra) { pKind.push(kind); pCount.push(0); pUnlimited.push(false); nPlaces++; }
    placeCoins();
    for (let p = 0; p < nPlaces; p++) {
      const n = pCount[p]!; pCount[p] = 0; pHop[p] = 9; pDots[p] = 0; pExtra[p] = p >= nPlaces - plan.extra.length ? 1 : 0;
      if (n <= 0) continue;
      const f = launch(ARRIVE, pKind[p]!, n, p, W + coinD[1]! + p * 30 * u, pY[p]!, pX[p]!, pY[p]!, ARRIVE_SECONDS);
      if (f) f.t = -ARRIVE_STAGGER * p;
    }
    enterSeconds = ARRIVE_SECONDS + ARRIVE_STAGGER * Math.max(0, nPlaces - 1) + 0.05;
    focus = 0;
    play('pop-big', 'D', 2, 0.5);
    if (plan.step > 1 && !usesPlate() && (fare <= 20 || fare % 10 === 0)) playVoice(audio, NUMBER_CLIPS[fare]!);
  }
  /** Whether place p has a coin to give. */
  const available = (p: number): boolean => p >= 0 && p < nPlaces && pCount[p]! > 0;
  /** The first place holding a coin of this kind, or -1. */
  const placeOf = (kind: number): number => { for (let p = 0; p < nPlaces; p++) if (pKind[p] === kind && pCount[p]! > 0) return p; return -1; };
  /** Whether the fare box would take a coin of this kind now (fits the unlit cups or matches an unpaid picture). */
  function fitsNow(kind: number): boolean {
    if (usesPlate()) { for (let k = 0; k < plateN; k++) if (plateState[k] === 0 && plateKind[k] === kind) return true; return false; }
    if (plan.animalPays) return false;
    return COIN_VALUE[kind]! <= fare - reserved;
  }
  /** Coins in play by kind, into `have`: on the tray, in the hand, flying (not into the slot or paws), on the swap stand. */
  function countCoins(): void {
    have[PENNY] = 0; have[NICKEL] = 0; have[DIME] = 0;
    for (let p = 0; p < nPlaces; p++) have[pKind[p]!]! += pCount[p]!;
    for (const f of flights) if (f.active && f.mode !== LEAVE && f.mode !== SEND && f.mode !== TO_PAWS) have[f.kind]! += f.n;
    if (carry.active) have[carry.kind]!++;
    if (hand.mode === HAND_DEMO && hand.taken && !hand.released) have[hand.kind]!++;
    if (standKind >= 0) have[standKind]! += standCount;
  }
  /** Coins the swap stand needs for one swap: five pennies make a nickel, two nickels a dime. */
  const standNeed = (kind: number): number => (kind === PENNY ? 5 : 2);
  /**
   * Whether the swap stand takes a coin of this kind now. Pennies while the plate still wants its coin and the stand
   * holds pennies or nothing; nickels only when the plate wants a dime and no penny is left anywhere (so pennies and
   * a lone nickel never block each other on the stand).
   */
  function standTakes(kind: number): boolean {
    if (!plan.swap || mergeT >= 0 || plateState[0] !== 0 || plateCoinMade()) return false;
    if (kind === PENNY) return (standKind < 0 || standKind === PENNY) && standCount + standIn < 5;
    if (kind !== NICKEL || plateKind[0] !== DIME || (standKind >= 0 && standKind !== NICKEL) || standCount + standIn >= 2) return false;
    countCoins();
    return have[PENNY] === 0;
  }
  /** The kind of coin the stand is collecting: what lies on it, else pennies while any are left, else nickels. */
  function standMode(): number {
    if (standKind >= 0) return standKind;
    for (const f of flights) if (f.active && f.mode === TO_STAND) return f.kind;
    countCoins();
    return have[PENNY]! > 0 ? PENNY : NICKEL;
  }
  /** Whether the coin the plate asks for is already made (on the tray, in the hand or on its way there). */
  function plateCoinMade(): boolean { countCoins(); return have[plateKind[0]!]! > 0; }
  /** Whether the empty stand shows its dotted circles: only while it would take a coin (not once the plate is satisfied or its coin is made). */
  function standOpen(): boolean {
    if (standKind >= 0 || standIn > 0) return true;
    if (!plan.swap || plateState[0] !== 0 || plateCoinMade()) return false;
    return standMode() === PENNY || plateKind[0] === DIME;
  }
  /** Centre of coin `i` of `n` on the swap stand's table, into pos. */
  function standSlot(i: number, n: number): void {
    const d = standCoinD(n);
    pos.x = standX + standW * (STAND_X0 + (i + 0.5) * (STAND_X1 - STAND_X0) / n);
    pos.y = standY + standH * STAND_TABLE - d * 0.55;
  }
  const pawsCX = (): number => gateX;
  const pawsCY = (): number => (pawsY0 + pawsY1) / 2;
  /** Where a coin goes on a target, into pos: the slot's top, the stand's next free circle, the paws. */
  function targetPoint(target: number, kind: number): void {
    if (target === T_STAND) { const m = standMode(); standSlot(Math.min(standNeed(m) - 1, standCount + standIn), standNeed(m)); return; }
    if (target === T_PAWS) { pos.x = pawsCX(); pos.y = pawsCY(); return; }
    pos.x = slotX(); pos.y = slotY() - coinD[kind]! * 0.35;
  }
  /** Start a rider's highlight on a coin that fits the fare box (or the first coin). */
  function ensureFocus(): void {
    if (available(focus) && fitsNow(pKind[focus]!)) return;
    for (let p = 0; p < nPlaces; p++) if (available(p) && fitsNow(pKind[p]!)) { focus = p; return; }
    if (available(focus)) return;
    for (let p = 0; p < nPlaces; p++) if (available(p)) { focus = p; return; }
  }
  /** Keep the highlight on the coin the child chose; move it only when that place has run out. */
  function keepFocus(): void { if (!available(focus)) ensureFocus(); }
  function moveFocus(step: number): void {
    for (let k = 1; k <= nPlaces; k++) { const p = (focus + step * k + nPlaces * 4) % nPlaces; if (available(p)) { focus = p; return; } }
  }
  /**
   * Whatever order the coins come in, the fare stays payable: unlimited stacks stay full, and when the dimes, nickels
   * and pennies left (on the tray, in the hand, or on their way back) cannot make the unlit cups exactly, pennies are added.
   */
  function refill(): void {
    for (let p = 0; p < nPlaces; p++) if (pUnlimited[p] && pCount[p]! < 5) pCount[p] = 5;
    if (usesPlate() || plan.animalPays || riderPhase !== 'pay') return;
    const need = fare - reserved; if (need <= 0) return;
    countCoins();
    // An endless stack refills as it is used, so it counts as any number of its coins.
    const rest = need - 10 * Math.min(trayStart(DIME) === Infinity ? Infinity : have[DIME]!, Math.floor(need / 10));
    const short = rest - 5 * Math.min(trayStart(NICKEL) === Infinity ? Infinity : have[NICKEL]!, Math.floor(rest / 5)) - have[PENNY]!;
    if (short <= 0) return;
    for (let p = 0; p < nPlaces; p++) if (pKind[p] === PENNY) { pCount[p] = pCount[p]! + short; return; }
  }
  function launch(mode: number, kind: number, n: number, place: number, x0: number, y0: number, x1: number, y1: number, dur: number): Flight | undefined {
    for (const f of flights) {
      if (f.active) continue;
      f.active = true; f.mode = mode; f.kind = kind; f.n = n; f.place = place; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1; f.t = 0; f.dur = dur; f.giggles = 0;
      return f;
    }
    // Pool full: settle at once so a coin is never lost.
    arrive(mode, kind, n, place);
    return undefined;
  }
  /** A coin is on its way into the slot or pouring, or the helper is showing: new coins wait (the pressed one hops). */
  const busy = (): boolean => {
    if (pourLeft > 0 || hand.mode === HAND_DEMO) return true;
    for (const f of flights) if (f.active && (f.mode === SEND || f.mode === REJECT)) return true;
    return false;
  };
  /**
   * Drop a coin on a target (fare box, swap stand, paws). `deliberate`: a pointer choice long enough after the previous
   * press to count as learning evidence. `keyed`: sent with a key (plays fully, never evidence).
   */
  function dropTo(target: number, kind: number, place: number, fromX: number, fromY: number, deliberate: boolean, keyed: boolean): void {
    if (keyed) riderKeyed = true;
    if (!deliberate && !keyed) riderDeliberate = false;
    if (riderDrops === 0 && kind === NICKEL && deliberate && target === T_BOX) nickelFirst = true;
    riderDrops++; idleT = 0;
    let take = false;
    if (target === T_STAND) {
      take = standTakes(kind);
      targetPoint(T_STAND, kind);
      if (take) standIn++;
      launch(take ? TO_STAND : BACK_STAND, kind, 1, place, fromX, fromY, pos.x, pos.y, take ? TO_SECONDS : TO_SECONDS + BACK_HOLD + BACK_HOP);
    } else if (target === T_PAWS) {
      take = kind === PENNY && animalPaid && changeReserved < changeOwed;
      if (take) changeReserved++;
      launch(take ? TO_PAWS : BACK_PAWS, kind, 1, place, fromX, fromY, pawsCX(), pawsCY(), take ? TO_SECONDS : TO_SECONDS + BACK_HOLD + BACK_HOP);
    } else {
      if (usesPlate()) {
        for (let k = 0; k < plateN; k++) if (plateState[k] === 0 && plateKind[k] === kind) { plateState[k] = 1; take = true; break; }
      } else if (!plan.animalPays && COIN_VALUE[kind]! <= fare - reserved) { reserved += COIN_VALUE[kind]!; paidN[kind]!++; take = true; }
      launch(take ? SEND : REJECT, kind, 1, place, fromX, fromY, slotX(), slotY(), take ? SEND_SECONDS : REJECT_SECONDS);
    }
    if (!take) {
      riderBounced = true; bouncesHere++; bounces++;
      // Keyboard play: after a coin hops back, the highlight moves to a coin that helps, so pressing on never stalls.
      if (keyed) focusHelpful();
    }
  }
  /** Highlight a coin that helps now: one the fare box takes (largest first), else one the stand takes, else a penny for the paws. */
  function focusHelpful(): void {
    let best = -1;
    for (let p = 0; p < nPlaces; p++) if (available(p) && fitsNow(pKind[p]!) && (best < 0 || COIN_VALUE[pKind[p]!]! > COIN_VALUE[pKind[best]!]!)) best = p;
    if (best < 0 && plan.swap) for (let p = 0; p < nPlaces; p++) if (available(p) && standTakes(pKind[p]!)) { best = p; break; }
    if (best < 0 && plan.animalPays) best = placeOf(PENNY);
    if (best >= 0) focus = best;
  }
  /** A flight has landed. */
  function arrive(mode: number, kind: number, n: number, place: number): void {
    if (mode === ARRIVE || mode === RETURN || mode === REJECT || mode === BACK_STAND || mode === BACK_PAWS || mode === SWAPPED) {
      let p = place;
      if (p < 0 || p >= nPlaces || pKind[p] !== kind) { p = -1; for (let q = 0; q < nPlaces; q++) if (pKind[q] === kind) { p = q; break; } }
      if (p >= 0) {
        pCount[p]! += n;
        if (mode === ARRIVE || mode === SWAPPED) pHop[p] = 0;
        if (mode === SWAPPED) pDots[p] = 1;
      }
      if (mode === ARRIVE) play('tick', 'B', 2 + place, 0.35);
      else if (mode === SWAPPED) play('tick', 'B', 7, 0.7);
      return;
    }
    if (mode === TO_STAND) {
      standIn = Math.max(0, standIn - 1); standCount++; standKind = kind; standHop = 0;
      play('tick', 'B', standCount * 2, 0.6);
      if (standCount >= standNeed(kind)) { mergeT = 0; mergeKind = kind === PENNY ? NICKEL : DIME; }
      return;
    }
    if (mode === TO_PAWS) {
      changeLeft = Math.max(0, changeLeft - 1); pawsHop = 0;
      play('pop', 'C', changeOwed - changeLeft, 0.7);
      return;
    }
    if (mode !== SEND) return;
    play('pop', 'D', 3, 0.7);
    boxPulse = 0;
    if (usesPlate()) {
      for (let k = 0; k < plateN; k++) if (plateState[k] === 1 && plateKind[k] === kind) { plateState[k] = 2; platePulse[k] = 0; play('tick', 'C', k * 2, 0.8); break; }
    } else { pourLeft += COIN_VALUE[kind]!; pourGap = COIN_VALUE[kind]! >= 10 ? POUR_GAP_FAST : POUR_GAP; if (pourTimer < 0) pourTimer = 0; }
  }
  function checkPaid(): void {
    if (riderPhase !== 'pay' || pourLeft > 0) return;
    for (const f of flights) if (f.active && (f.mode === SEND || f.mode === TO_PAWS)) return;
    if (usesPlate()) { for (let k = 0; k < plateN; k++) if (plateState[k] !== 2) return; }
    else if (plan.animalPays) { if (!animalPaid || changeLeft > 0 || changeReserved < changeOwed) return; }
    else if (lit < fare) return;
    farePaid();
  }
  function farePaid(): void {
    riderPhase = 'paid'; seqT = 0;
    if (carry.active) { carry.active = false; carry.keyed = false; launch(RETURN, carry.kind, 1, carry.place, input.pointer.x, input.pointer.y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS); }
    if (hand.mode === HAND_HINT || hand.mode === HAND_TAP) hand.mode = 0;
    // Learning evidence: only riders at the current step, paid with deliberate pointer choices, without a hint or keys.
    const counted = !intro && !riderAssisted && !riderKeyed && riderDeliberate && riderDrops > 0 && plan.step === data.step;
    if (counted) {
      // Steps 3 to 6 also ask for the step's coin: a fare paid in pennies alone rides, but counts as a miss.
      const exact = plan.step === 3 ? nickelFirst && !riderBounced : !riderBounced && usedStepCoins();
      recordRider(data, exact); roundCounted.push(exact ? 1 : 0);
    }
    play('pop-big', 'C', 4, 0.8);
  }
  /**
   * Steps 4 to 6: whether the payment used the step's coin wherever it fits, as far as the tray had it. Step 4: the
   * nickel; step 5: a dime per full ten; step 6: a dime per full ten, then a nickel for a full five left over.
   */
  function usedStepCoins(): boolean {
    let rest = fare;
    for (let kind = DIME; kind >= NICKEL; kind--) {
      const asked = plan.step === 6 || (plan.step === 5 && kind === DIME) || (plan.step === 4 && kind === NICKEL);
      if (!asked) continue;
      const want = Math.min(trayStart(kind), Math.floor(rest / COIN_VALUE[kind]!));
      if (paidN[kind]! < want) return false;
      rest -= want * COIN_VALUE[kind]!;
    }
    return true;
  }
  /** Coins of a kind the rider's tray started with (an endless stack counts as any number). */
  function trayStart(kind: number): number {
    let n = 0;
    for (const it of plan.tray) if (it.kind === kind) { if (it.unlimited) return Infinity; n += it.count; }
    return n;
  }
  /** The introduction's goal: every cup lit and the hedgehog riding, before any coin is shown. */
  function startGoal(): void {
    introStage = 1;
    plan = { step: 3, fare: 5, plate: [], tray: [], swap: false, extra: [], animalPays: 0 }; fare = 5; lit = 5; reserved = 5; plateN = 0; pourLeft = 0;
    nCups = 5; cupMode = CUPS_GRID; panelOn = false; numeralOn = false; changeOwed = 0; placeCups();
    riderAnimal = 0;
    // The lit cups show alone for a moment before the sequence starts.
    riderPhase = 'paid'; seqT = -GOAL_HOLD; riderT = 0;
  }
  function sequenceDone(): void {
    // A fresh balloon lands while the small one carries the rider away across the sky.
    landT = 0; driftT = 0; driftAnimal = riderAnimal;
    if (introStage === 1) { introStage = 2; startRider(0); return; }
    if (riderIndex + 1 < ridersTotal) startRider(riderIndex + 1);
    else finishRound();
  }
  /** A new step's one demonstration: the helper hand shows the new idea, then (where useful) taps the coin to use. */
  function startDemo(step: number): void {
    data.demos |= 1 << step; riderAssisted = true; demoStarted = true;
    const kind = step === 7 || step === 8 ? PENNY : DIME, p = placeOf(kind);
    if (p < 0) return;
    // Step 7: five pennies onto the stand one by one; step 8: one penny into the paws; steps 5 and 6: a dime into the slot.
    startHand(p, kind, step === 7 ? T_STAND : step === 8 ? T_PAWS : T_BOX, step === 7 ? 5 : 1, step === 7 ? NICKEL : step === 8 ? PENNY : -1);
  }
  function startHand(place: number, kind: number, target: number, reps: number, after: number): void {
    hand.mode = HAND_DEMO; hand.t = 0; hand.place = place; hand.kind = kind; hand.released = false; hand.taken = false;
    hand.target = target; hand.reps = reps; hand.cycle = 0; hand.after = after;
  }
  // ---------------------------------------------------------------- round
  function startRound(): void {
    pending = null; data.pending = null; bookGlide = false;
    tier = services.debug.tier ?? toTier(data.tier);
    intro = data.rounds === 0;
    animalOffset = data.rounds % ANIMALS.length;
    phase = 'play'; phaseT = time = idleT = 0;
    ridersTotal = intro ? 3 : TIERS[tier].riders;
    hits = misses = bounces = 0; stars = 1; starsPlayed = 0; focus = 0; roundCounted.length = 0;
    carry.active = false; carry.keyed = false; hand.mode = 0; introStage = 0; liftY = 0; landT = 9; driftT = 9;
    particles.clear(); for (const f of flights) f.active = false;
    nPlaces = 0; nCups = 0; plateN = 0; lastFare = 0;
    plan = introRider();
    layout(W, H);
    if (intro) startGoal(); else startRider(0);
    guard(PLAY_GUARD_MS); cornerFocus = -1; services.save.flush();
    if (!fanfareStarted && audio.context) { fanfareStarted = true; if (prepareSfxStep(audio, 'fanfare', FANFARE)) fanfareAsked = true; }
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
    const id = globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    pending = { id, stars, riders: ridersTotal, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, tier, animalOffset };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += stars;
    services.save.flush();
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; carry.active = false; carry.keyed = false; hand.mode = 0; cornerFocus = -1; driftT = 9;
    for (const f of flights) f.active = false; particles.clear(); layout(W, H);
    play('fanfare', FANFARE.variant!);
    confettiBurst(particles, W / 2, H * 0.45, 70, 380 * u);
  }
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
  function planWarm(): void {
    warmNames.length = 0; warmSizes.length = 0; warmIndex = 0;
    const add = (name: string, size: number): void => { warmNames.push(name); warmSizes.push(Math.round(size)); };
    const k = celebK();
    // The age-6 pieces first, so they are scaled before the rider that uses them steps up.
    if (roundPanel()) { add(PANEL, panelW); add(STAND, standH); }
    add(BASKET, BH * k); add(ENVELOPE, EH * k);
    for (const pair of ANIMAL_NAMES) { add(pair[1], animalH * k); add(pair[1], restSize * 0.62); }
    add(BASKET, BH * DRIFT_K); add(ENVELOPE, EH * DRIFT_K);
    add(BUTTON_PLAY, controlsRadius * 1.3); add(BUTTON_HOME, controlsRadius * 1.3);
  }
  function prepareIdle(deadline: IdleDeadline): void {
    idleHandle = 0;
    if (!fanfareAsked && fanfareStarted) {
      while (deadline.timeRemaining() >= 4) if (prepareSfxStep(audio, 'fanfare', FANFARE)) { fanfareAsked = true; break; }
      return;
    }
    if (madeName || deadline.timeRemaining() < 4) return;
    for (; warmIndex < warmNames.length; warmIndex++) {
      const name = warmNames[warmIndex]!, size = warmSizes[warmIndex]!, key = `${name}@${size}`;
      if (warmDone.has(key)) continue;
      const img = sprites.get(name); if (!img) continue;
      sprites.scaled(name, size / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
      madeName = name; madeSize = size; warmIndex++;
      return;
    }
  }
  function warm(ctx: CanvasRenderingContext2D): void {
    if (madeName) { ctx.globalAlpha = 0.01; drawSprite(ctx, sprites, madeName, W / 2, H / 2, madeSize); ctx.globalAlpha = 1; warmDone.add(`${madeName}@${madeSize}`); madeName = ''; }
  }
  function askIdle(): void {
    if (idleHandle) return;
    if ((fanfareStarted && !fanfareAsked) || (playable() && time >= 0.5 && warmIndex < warmNames.length)) idleHandle = requestIdleCallback(prepareIdle, { timeout: 500 });
  }
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; }
  /** The celebration balloon's scale: the whole balloon (envelope and basket) in about four fifths of the height. */
  const celebK = (): number => Math.min(0.75, (H * 0.8) / (EH * MOUTH + BH * (1 - ENVELOPE_AT)));

  // ---------------------------------------------------------------- update
  /** The helper's timeline for its current carry: when it presses the coin, picks it up and lets go. */
  const handPressAt = (): number => (hand.cycle > 0 ? REP_BACK : HAND_PRESS_AT);
  const handCarryAt = (): number => (hand.cycle > 0 ? REP_BACK + REP_PRESS : HAND_CARRY_AT);
  const handDropAt = (): number => (hand.cycle > 0 ? REP_BACK + REP_PRESS + REP_CARRY : HAND_DROP_AT);
  function updateHand(dt: number): void {
    if (!hand.mode) return;
    hand.t += dt;
    if (hand.mode === HAND_TAP) { hand.place = placeOf(hand.kind); return; }
    const carryAt = handCarryAt(), dropAt = handDropAt();
    if (hand.mode === HAND_DEMO && !hand.taken && hand.t >= carryAt) {
      // The hand takes the real coin off the tray (waiting while it is still sliding in).
      if (available(hand.place)) { if (!pUnlimited[hand.place]) pCount[hand.place]!--; hand.taken = true; }
      else { const p = placeOf(hand.kind); if (p >= 0) hand.place = p; hand.t = carryAt; return; }
    }
    if (!hand.released && hand.t >= dropAt) {
      hand.released = true;
      if (hand.mode === HAND_DEMO) { handTip(); dropTo(hand.target, hand.kind, hand.place, pos.x, pos.y, false, false); }
      else play('pop', 'A', 5, 0.35);
    }
    if (hand.mode === HAND_DEMO && hand.released && hand.reps > 1) {
      // A repeated demonstration goes back to the tray for the next coin.
      const p = placeOf(hand.kind);
      if (p >= 0) { hand.reps--; hand.cycle++; hand.t = 0; hand.released = false; hand.taken = false; hand.place = p; return; }
      hand.reps = 1;
    }
    if (hand.t >= dropAt + HAND_FADE) {
      if (hand.mode === HAND_DEMO && hand.after >= 0) { hand.mode = HAND_TAP; hand.t = 0; hand.kind = hand.after; hand.place = placeOf(hand.kind); }
      else hand.mode = 0;
      idleT = 0;
    }
  }
  /** After quiet seconds the see-through hint carries a coin that helps now to where it goes. */
  function startHint(): void {
    let best = -1, target = T_BOX;
    if (plan.animalPays) { if (animalPaid && changeReserved < changeOwed) { best = placeOf(PENNY); target = T_PAWS; } }
    else {
      for (let p = 0; p < nPlaces; p++) if (available(p) && fitsNow(pKind[p]!) && (best < 0 || COIN_VALUE[pKind[p]!]! > COIN_VALUE[pKind[best]!]!)) best = p;
      if (best < 0 && plan.swap) { for (let p = 0; p < nPlaces; p++) if (available(p) && standTakes(pKind[p]!)) { best = p; target = T_STAND; break; } }
    }
    if (best < 0) return;
    hand.mode = HAND_HINT; hand.t = 0; hand.place = best; hand.kind = pKind[best]!; hand.released = false; hand.taken = false;
    hand.target = target; hand.reps = 0; hand.cycle = 0; hand.after = -1;
    riderAssisted = true;
  }
  /** The basket's height off its rest: lifting off after a paid fare, or the fresh balloon landing. */
  function updateLift(): void {
    const dist = basketBottom - (basketTop() - (EH * MOUTH - BH * ENVELOPE_AT)) + 40;
    if (riderPhase === 'paid') liftY = seqT < SEQ_LIFT_AT ? 0 : -easeInCubic(clamp01((seqT - SEQ_LIFT_AT) / SEQ_LIFT)) * dist;
    else liftY = landT < SEQ_LAND ? -(1 - easeOutCubic(landT / SEQ_LAND)) * dist : 0;
  }
  function updateRider(dt: number): void {
    riderT += dt;
    if (landT < SEQ_LAND) {
      const before = landT; landT += dt;
      if (before < SEQ_LAND * 0.9 && landT >= SEQ_LAND * 0.9) play('pop-big', 'D', 1, 0.45);
    }
    if (riderPhase === 'enter') {
      // The introduction's helper starts while the coins land, so the first pour comes early.
      if (intro && introStage === 2 && riderIndex === 0 && !demoStarted && riderT >= INTRO_HAND_AT) {
        demoStarted = true;
        let p = 0; for (let k = 0; k < nPlaces; k++) if (pKind[k] === NICKEL) p = k;
        startHand(p, NICKEL, T_BOX, 1, PENNY);
      }
      if (riderT >= enterSeconds && landT >= SEQ_LAND) {
        riderPhase = 'pay'; idleT = 0; ensureFocus();
        if (plan.animalPays) {
          // Step 8: the animal pays first, dropping its dime into the slot.
          reserved = plan.animalPays; gateHop = 0;
          launch(SEND, DIME, 1, -1, pawsCX(), pawsCY(), slotX(), slotY(), SEND_SECONDS);
        } else if (!demoStarted && demoDue(plan.step)) startDemo(plan.step);
      }
      updateLift();
      return;
    }
    if (riderPhase === 'pay') {
      // Cups light one after another as a coin pours.
      if (pourLeft > 0) {
        pourTimer -= dt;
        while (pourLeft > 0 && pourTimer <= 0) {
          lit = Math.min(nCups, lit + 1); cupPulse[lit - 1] = 0; pourLeft--; pourTimer += pourGap;
          play('tick', 'C', (lit - 1) % 10, pourGap < POUR_GAP ? 0.55 : 0.75);
          if (cupMode === CUPS_ROWS && lit % 10 === 0 && lit >= 30) playVoice(audio, NUMBER_CLIPS[lit]!);
        }
      }
      if (plan.animalPays && !animalPaid && pourLeft === 0 && lit >= nCups) {
        // The dime has poured: the cups past the fare are change to hand back.
        animalPaid = true; changeLeft = changeOwed; ensureFocus();
        if (!demoStarted && demoDue(8)) startDemo(8);
      }
      updateMerge(dt);
      refill();
      checkPaid();
      const wait = bouncesHere >= 2 ? IDLE_SOON : IDLE_SECONDS;
      if (riderPhase === 'pay' && !hand.mode && !carry.active && !busy() && mergeT < 0 && idleT >= wait) { startHint(); idleT = wait - IDLE_REPEAT; }
      updateLift();
      return;
    }
    // Fare paid: the sequence runs on its own clock.
    const prev = seqT; seqT += dt;
    if (prev < SEQ_HOP_AT && seqT >= SEQ_HOP_AT) play('go', 'C', 0, 0.7);
    if (prev < SEQ_LIFT_AT && seqT >= SEQ_LIFT_AT) play('whoosh', 'B', 0, 0.6);
    updateLift();
    if (seqT >= SEQ_SECONDS) { liftY = 0; sequenceDone(); updateLift(); }
  }
  /** Step 7: the coins on the swap stand slide together into one coin, which shows its dots and hops onto the tray. */
  function updateMerge(dt: number): void {
    if (mergeT < 0) return;
    const prev = mergeT; mergeT += dt;
    if (prev < MERGE_AT && mergeT >= MERGE_AT) {
      standKind = mergeKind; standCount = 1;
      play('pop-big', 'B', 2, 0.7);
    }
    if (mergeT >= MERGE_HOP_AT) {
      let p = -1; for (let q = 0; q < nPlaces; q++) if (pKind[q] === mergeKind) { p = q; break; }
      const cx = standX + standW / 2, cy = standY + standH * STAND_TABLE - standCoinD(2) * 0.55;
      launch(SWAPPED, mergeKind, 1, p, cx, cy, p >= 0 ? pX[p]! : cx, p >= 0 ? pY[p]! : cy, MERGE_HOP);
      standKind = -1; standCount = 0; mergeT = -1;
    }
  }
  function updatePlay(dt: number): void {
    time += dt; idleT += dt;
    boxPulse += dt; boxHop += dt; gateHop += dt; queueHop += dt; standHop += dt; pawsHop += dt;
    for (let p = 0; p < MAX_PLACES; p++) pHop[p]! += dt;
    for (let k = 0; k < MAX_CUPS; k++) cupPulse[k]! += dt;
    for (let k = 0; k < 3; k++) platePulse[k]! += dt;
    if (driftT < DRIFT_SECONDS) {
      // The small balloon carries the last rider up and away across the sky.
      driftT += dt;
      const k = clamp01(driftT / DRIFT_SECONDS);
      driftX = lerp(basketL + BW * 0.5, W * 0.92, easeInOutSine(k)); driftY = H * 0.3 - easeOutCubic(k) * H * 0.14 + Math.sin(k * 9) * 4 * u;
    }
    updateRider(dt);
    updateHand(dt);
    if (riderPhase === 'pay' && !carry.active) keepFocus();
  }
  function updateFlights(dt: number): void {
    for (const f of flights) {
      if (!f.active) continue;
      f.t += dt;
      // Too much, or not wanted there: a soft giggle, three quiet notes 90 ms apart, and the animal at the gate smiles.
      const at = f.mode === REJECT ? SEND_FLY : f.mode === BACK_STAND || f.mode === BACK_PAWS ? TO_SECONDS : -1;
      while (at >= 0 && f.giggles < 3 && f.t >= at + f.giggles * 0.09) {
        if (f.giggles === 0) { gateHop = 0; if (f.mode === BACK_STAND) standHop = 0; }
        play('pop', 'A', f.giggles === 1 ? 6 : 8, 0.4); f.giggles++;
      }
      if (f.t >= f.dur) { f.active = false; arrive(f.mode, f.kind, f.n, f.place); }
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
  function coin(ctx: CanvasRenderingContext2D, kind: number, face: number, x: number, y: number, scale: number, rot: number, sx: number): void {
    const d = coinD[kind]!;
    drawSprite(ctx, sprites, COIN_FACES[kind]![face]!, x, y, d, rot, sx * scale, scale);
    note(COIN_FACES[kind]![face]!, d * scale, 384);
  }
  function animal(ctx: CanvasRenderingContext2D, a: number, pose: number, x: number, feet: number, h: number, scale: number, rot = 0, sx = 1): void {
    const name = ANIMAL_NAMES[a % ANIMALS.length]![pose]!, img = sprites.get(name);
    drawSprite(ctx, sprites, name, x, feet - h * scale / 2, h, rot, scale * sx, scale);
    if (img) note(name, h * scale, img.naturalHeight);
  }
  /** Envelope (to its mouth), basket and riders. `k` scales the play balloon; riders stand inside, clipped at the rim. */
  function balloon(ctx: CanvasRenderingContext2D, cx: number, top: number, k: number, ridersFrom: number, ridersN: number, wave: boolean): void {
    const bw = BW * k, bh = Math.round(BH * k), ew = EW * k, eh = Math.round(EH * k);
    drawSprite(ctx, sprites, BASKET, cx, top + bh / 2, bh);
    note(BASKET, bh, 1030);
    const env = sprites.scaled(ENVELOPE, eh / 1110);
    if (env) {
      const pr = sprites.pixelRatio, w = env.width / pr, h = env.height / pr, mouthY = top + bh * ENVELOPE_AT;
      ctx.drawImage(env, 0, 0, env.width, env.height * MOUTH, cx - w / 2, mouthY - h * MOUTH, w, h * MOUTH);
      note(ENVELOPE, ew, 762);
    }
    if (ridersN <= 0) return;
    const clip = top + bh * RIM_CLIP, h = Math.round(animalH * k);
    ctx.save(); ctx.beginPath(); ctx.rect(cx - bw, -H, bw * 2, clip + H); ctx.clip();
    for (let i = 0; i < ridersN; i++) {
      const x = ridersN === 1 ? cx + bw * 0.3 : cx + bw * lerp(-0.3, 0.32, i / (ridersN - 1));
      const bob = wave ? Math.sin(time * 6 + i * 1.3) * 6 * k : 0;
      animal(ctx, (ridersFrom + i) % ANIMALS.length, 1, x, clip + h * 0.5 - bob, h, 1);
    }
    ctx.restore();
  }
  function renderBox(ctx: CanvasRenderingContext2D): void {
    const y = boxY + liftY;
    if (y + boxH < -10) return;
    let s = 1;
    const pulse = riderPhase === 'paid' && seqT >= 0 && seqT < SEQ_PULSE ? Math.sin(seqT / SEQ_PULSE * Math.PI) : 0;
    if (boxPulse < 0.25) s = 1 + Math.sin(boxPulse / 0.25 * Math.PI) * 0.04;
    if (pulse > 0) s = 1 + pulse * 0.05;
    const hop = boxHop < 0.3 ? Math.sin(boxHop / 0.3 * Math.PI) * 8 * u : 0, dy = liftY - hop;
    if (panelOn) { drawSprite(ctx, sprites, PANEL, panelX + panelW / 2, panelY + panelH / 2 + dy, panelW); note(PANEL, panelW, 600); }
    drawSprite(ctx, sprites, FAREBOX, boxCX(), y + boxH / 2 - hop, boxW, 0, s, s);
    note(FAREBOX, boxW * s, 720);
    if (numeralOn) renderNumeral(ctx, dy);
    if (usesPlate()) { renderPlate(ctx, boxX + boxW * WIN_X0, y - hop + boxH * WIN_Y0, boxX + boxW * WIN_X1, y - hop + boxH * WIN_Y1); return; }
    const set = cupMode === CUPS_ROWS ? smallCanvas : cupCanvas, r = cupMode === CUPS_ROWS ? smallR : cupR;
    if (!set[CUP_UNLIT] || nCups <= 0) return;
    for (let i = 0; i < nCups; i++) {
      const on = i < lit, change = plan.animalPays > 0 && i >= fare;
      // Step 8: change cups appear as the animal's dime lights them, copper while owed, dim once handed back.
      if (change && !on) continue;
      const handed = change && animalPaid && i - fare >= changeLeft;
      const cx = cupX[i]!, cy = cupY[i]! + dy, p = cupPulse[i]!;
      let sc = p < 0.25 ? 1 + Math.sin(p / 0.25 * Math.PI) * 0.3 : 1;
      sc += pulse * 0.12;
      if (on && !handed && glowCanvas && (p < 0.4 || pulse > 0)) {
        const g = r * 3.2 * (1 + pulse * 0.3); ctx.globalAlpha = Math.max(pulse, 1 - p / 0.4);
        ctx.drawImage(glowCanvas, cx - g / 2, cy - g / 2, g, g); ctx.globalAlpha = 1;
      }
      const look = handed ? CUP_UNLIT : change ? CUP_CHANGE : on ? CUP_LIT : CUP_UNLIT, img = set[look]!, w = img.width / artRatio * sc;
      if (handed) ctx.globalAlpha = 0.35;
      ctx.drawImage(img, cx - w / 2, cy - w / 2, w, w);
      ctx.globalAlpha = 1;
    }
  }
  /** Steps 6 and 8: a cream plate beside the cups with the fare as a numeral and the cent sign; at step 6 the count climbs under it. */
  function renderNumeral(ctx: CanvasRenderingContext2D, dy: number): void {
    if (!digitsBig || !digitsLit) return;
    const y = numY + dy, counter = plan.step === 6 && lit > 0;
    chunkyPanel(ctx, numX, y, numW, numH, PLATE_FILL, PLATE_LINE, numH * 0.16, Math.max(2, 4 * u));
    drawNumber(ctx, digitsBig, fare, numX + numW / 2, y + numH * (counter ? 0.34 : 0.5), 1);
    if (counter) drawNumber(ctx, digitsLit, lit, numX + numW / 2, y + numH * 0.74, 0.62);
  }
  /** A value under 100 with the cent sign, centred on (cx, cy), from a baked glyph strip at `k` of its size. */
  function drawNumber(ctx: CanvasRenderingContext2D, atlas: HTMLCanvasElement, value: number, cx: number, cy: number, k: number): void {
    const tens = Math.floor(value / 10) % 10, ones = value % 10;
    const w = (tens > 0 ? digitW[tens]! : 0) + digitW[ones]! + digitW[10]!;
    let x = Math.round(cx - w * k / 2);
    if (tens > 0) x = glyph(ctx, atlas, tens, x, cy, k);
    x = glyph(ctx, atlas, ones, x, cy, k);
    glyph(ctx, atlas, 10, x, cy, k);
  }
  function glyph(ctx: CanvasRenderingContext2D, atlas: HTMLCanvasElement, g: number, x: number, cy: number, k: number): number {
    const r = artRatio, sx = Math.max(0, (digitX[g]! - digitPad) * r), sw = (digitW[g]! + 2 * digitPad) * r, dh = atlas.height / r * k;
    ctx.drawImage(atlas, sx, 0, sw, atlas.height, Math.round(x - digitPad * k), Math.round(cy - dh / 2), sw / r * k, dh);
    return x + digitW[g]! * k;
  }
  /** Steps 1 and 7: a cream plate in the window with the coins to pay as pictures; each lights when its coin goes in. */
  function renderPlate(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    const pad = (y1 - y0) * 0.08;
    chunkyPanel(ctx, x0 + pad, y0 + pad, x1 - x0 - 2 * pad, y1 - y0 - 2 * pad, PLATE_FILL, PLATE_LINE, (y1 - y0) * 0.18, Math.max(2, 4 * u));
    const cy = (y0 + y1) / 2, step = (x1 - x0 - 2 * pad) / Math.max(plateN, 2.2);
    const base = Math.min((y1 - y0) * 0.62, step * 0.86) / coinD[NICKEL]!;
    for (let k = 0; k < plateN; k++) {
      const kind = plateKind[k]!, cx = (x0 + x1) / 2 + (k - (plateN - 1) / 2) * step, d = coinD[kind]! * base, state = plateState[k]!;
      const p = platePulse[k]!, sc = p < 0.3 ? 1 + Math.sin(p / 0.3 * Math.PI) * 0.2 : 1;
      if (state === 2 && glowCanvas) { const g = d * 1.7; ctx.drawImage(glowCanvas, cx - g / 2, cy - g / 2, g, g); }
      if (state !== 2) {
        ctx.beginPath(); ctx.arc(cx, cy, d * 0.56, 0, Math.PI * 2); ctx.setLineDash(DASH); ctx.lineWidth = Math.max(2, 3 * u); ctx.strokeStyle = PLATE_LINE; ctx.stroke(); ctx.setLineDash(NO_DASH);
        ctx.globalAlpha = 0.55;
      }
      coin(ctx, kind, 0, cx, cy, base * sc, 0, 1);
      ctx.globalAlpha = 1;
      // Step 7: the wanted coin shows its value as dots, like the coin the swap stand makes.
      if (plan.swap) coinDots(ctx, kind, cx, cy, state === 2 ? 1 : 0.85, base * sc);
    }
  }
  function renderTray(ctx: CanvasRenderingContext2D): void {
    if (trayCanvas) ctx.drawImage(trayCanvas, trayX, trayY, trayW, trayH);
    for (let p = 0; p < nPlaces; p++) {
      // A soft round well under each place.
      ctx.beginPath(); ctx.ellipse(pX[p]!, pY[p]! + coinD[pKind[p]!]! * 0.06, coinD[pKind[p]!]! * 0.56, coinD[pKind[p]!]! * 0.52, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70, 30, 10, 0.22)'; ctx.fill();
      // Step 7: an empty place waits for the coin the swap stand makes.
      if (pExtra[p] && pCount[p]! <= 0 && ringPlace) { const g = ringPlace.width / artRatio; ctx.drawImage(ringPlace, pX[p]! - g / 2, pY[p]! - g / 2, g, g); }
    }
    const showFocus = playable() && riderPhase === 'pay' && !carry.active && hand.mode !== HAND_DEMO;
    for (let p = 0; p < nPlaces; p++) {
      const n = pCount[p]!; if (n <= 0) continue;
      const kind = pKind[p]!, d = coinD[kind]!, x = pX[p]!, hopK = pHop[p]! < 0.35 ? Math.sin(pHop[p]! / 0.35 * Math.PI) : 0;
      const y = pY[p]! - hopK * 14 * u;
      // Coins below the top one show as rims (up to four), offset down and right.
      const under = Math.min(4, n - 1);
      for (let k = under; k >= 1; k--) coin(ctx, kind, 1, x + k * 3 * u, y + k * 5 * u, 1, 0, 1);
      if (showFocus && p === focus) {
        const bob = Math.abs(Math.sin(time * 3)) * 8 * u;
        ctx.beginPath(); ctx.arc(x, y, d * 0.5 + 9 * u, 0, Math.PI * 2);
        ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
        const ty = y - d * 0.5 - 16 * u - bob;
        ctx.beginPath(); ctx.moveTo(x - 15 * u, ty - 20 * u); ctx.lineTo(x + 15 * u, ty - 20 * u); ctx.lineTo(x, ty); ctx.closePath();
        ctx.fillStyle = HIGHLIGHT; ctx.fill(); ctx.lineWidth = 3 * u; ctx.strokeStyle = OUTLINE; ctx.stroke();
      }
      coin(ctx, kind, 0, x, y, 1, 0, 1);
      if (pDots[p]) coinDots(ctx, kind, x, y, 1, 1);
    }
  }
  /** Dots on a coin, one per cent of its value, as a ring (a penny's one dot in the middle), `k` of the coin's size. */
  function coinDots(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, a: number, k = 1): void {
    if (!dotCanvas || a <= 0) return;
    const n = COIN_VALUE[kind]!, r = coinD[kind]! * k * (n === 1 ? 0 : 0.3), ds = dotSize * Math.max(0.45, k) * (n === 1 ? 1.6 : 1);
    ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      ctx.drawImage(dotCanvas, x + Math.cos(ang) * r - ds / 2, y + Math.sin(ang) * r - ds / 2, ds, ds);
    }
    ctx.globalAlpha = 1;
  }
  function renderFlights(ctx: CanvasRenderingContext2D): void {
    for (const f of flights) {
      if (!f.active || f.t < 0) continue;
      const kind = f.kind;
      if (f.mode === ARRIVE || f.mode === LEAVE || f.mode === RETURN) {
        const k = clamp01(f.t / f.dur), e = f.mode === LEAVE ? easeInCubic(k) : easeOutCubic(k);
        const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - (f.mode === RETURN ? Math.sin(k * Math.PI) * 40 * u : 0);
        // Sliding in, the coin spins (turning about its upright axis) and settles heads up.
        const spin = f.mode === ARRIVE ? (1 - e) * Math.PI * 4 : 0, c = Math.cos(spin);
        const under = Math.min(4, f.n - 1);
        for (let j = under; j >= 1; j--) coin(ctx, kind, 1, x + j * 3 * u, y + j * 5 * u, 1, 0, 1);
        coin(ctx, kind, c >= 0 ? 0 : 1, x, y, 1, f.mode === RETURN ? k * 4 : 0, Math.max(0.08, Math.abs(c)));
        continue;
      }
      if (f.mode === TO_STAND || f.mode === TO_PAWS || f.mode === BACK_STAND || f.mode === BACK_PAWS) {
        // An arc onto the stand (shrinking to the stand's coin size) or into the paws; not wanted there, a jiggle and a hop home.
        const small = (f.mode === TO_STAND || f.mode === BACK_STAND ? standCoinD(standNeed(kind)) : coinD[kind]! * 0.62) / coinD[kind]!;
        if (f.t < TO_SECONDS) {
          const k = f.t / TO_SECONDS, e = easeOutCubic(k);
          coin(ctx, kind, 0, lerp(f.x0, f.x1, e), lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 70 * u, lerp(1, small, e), 0, 1);
          continue;
        }
        const t = f.t - TO_SECONDS;
        if (t < BACK_HOLD) { coin(ctx, kind, 0, f.x1 + Math.sin(t * 40) * 3 * u, f.y1, small, 0, 1); continue; }
        const k = clamp01((t - BACK_HOLD) / BACK_HOP), e = easeInOutSine(k);
        coin(ctx, kind, 0, lerp(f.x1, pX[f.place] ?? f.x0, e), lerp(f.y1, pY[f.place] ?? f.y0, e) - Math.sin(k * Math.PI) * 110 * u, lerp(small, 1, e), k * Math.PI * 2, 1);
        continue;
      }
      if (f.mode === SWAPPED) {
        // The swapped coin hops from the stand onto its place, its dots still glowing inside.
        const k = clamp01(f.t / f.dur), e = easeInOutSine(k), from = standCoinD(2) / coinD[kind]!;
        const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 120 * u, sc = lerp(from, 1, e);
        coin(ctx, kind, 0, x, y, sc, 0, 1); coinDots(ctx, kind, x, y, 1, sc);
        continue;
      }
      // SEND and REJECT: fly to the slot top, show the coin's dots, then slip in (edge-on) or hop home.
      const sy = slotY();
      if (f.t < SEND_FLY) {
        const k = f.t / SEND_FLY, e = easeOutCubic(k);
        const x = lerp(f.x0, slotX(), e), y = lerp(f.y0, sy - coinD[kind]! * 0.35, e) - Math.sin(k * Math.PI) * 60 * u;
        coin(ctx, kind, 0, x, y, 1, 0, 1);
        continue;
      }
      if (f.mode === SEND) {
        const t = f.t - SEND_FLY;
        if (t < SEND_DOTS) {
          coin(ctx, kind, 0, slotX(), sy - coinD[kind]! * 0.35, 1, 0, 1);
          coinDots(ctx, kind, slotX(), sy - coinD[kind]! * 0.35, Math.sin(Math.min(1, t / SEND_DOTS) * Math.PI * 0.5 + 0.3));
        } else {
          const k = clamp01((t - SEND_DOTS) / SEND_SLIP);
          coin(ctx, kind, 0, slotX(), sy - coinD[kind]! * 0.35 + k * coinD[kind]! * 0.5, 1, 0, Math.max(0.08, 1 - k));
        }
        continue;
      }
      const t = f.t - SEND_FLY;
      if (t < REJECT_HOLD) {
        const jig = Math.sin(t * 40) * 3 * u;
        coin(ctx, kind, 0, slotX() + jig, sy - coinD[kind]! * 0.35, 1, 0, 1);
        coinDots(ctx, kind, slotX() + jig, sy - coinD[kind]! * 0.35, 1);
      } else {
        const k = clamp01((t - REJECT_HOLD) / REJECT_HOP), e = easeInOutSine(k);
        const x = lerp(slotX(), pX[f.place] ?? f.x0, e), y = lerp(sy - coinD[kind]! * 0.35, pY[f.place] ?? f.y0, e) - Math.sin(k * Math.PI) * 120 * u;
        coin(ctx, kind, 0, x, y, 1, k * Math.PI * 2, 1);
      }
    }
  }
  /** Step 7: the swap stand with its dotted circles, the coins resting on it, and the swap itself. */
  function renderStand(ctx: CanvasRenderingContext2D): void {
    const hop = standHop < 0.3 ? Math.sin(standHop / 0.3 * Math.PI) * 6 * u : 0;
    drawSprite(ctx, sprites, STAND, standX + standW / 2, standY + standH / 2 - hop, standH);
    note(STAND, standW, 582);
    const merging = mergeT >= 0 && mergeT < MERGE_AT, mode = merging ? standKind : standMode(), n = standNeed(mode), d = standCoinD(n);
    if (mergeT >= MERGE_AT) {
      // The new coin, with its dots glowing inside, pops in the middle of the stand.
      const k = clamp01((mergeT - MERGE_AT) / 0.25), sc = (standCoinD(2) / coinD[standKind]!) * (1 + Math.sin(k * Math.PI) * 0.2);
      const cx = standX + standW / 2, cy = standY + standH * STAND_TABLE - standCoinD(2) * 0.55 - hop;
      if (glowCanvas) { const g = standCoinD(2) * 1.8; ctx.drawImage(glowCanvas, cx - g / 2, cy - g / 2, g, g); }
      coin(ctx, standKind, 0, cx, cy, sc, 0, 1); coinDots(ctx, standKind, cx, cy, 1, sc);
      return;
    }
    if (!merging && !standOpen()) return;
    const ring = n === 5 ? ringStand : ringStand2, slide = merging ? easeInOutSine(clamp01((mergeT - MERGE_SLIDE_AT) / (MERGE_AT - MERGE_SLIDE_AT))) : 0;
    for (let i = 0; i < n; i++) {
      standSlot(i, n); const x = pos.x, y = pos.y - hop;
      if (i >= standCount) { if (ring && !merging) { const g = ring.width / artRatio; ctx.drawImage(ring, x - g / 2, y - g / 2, g, g); } continue; }
      // Merging, the coins slide together to the middle.
      const cx = lerp(x, standX + standW / 2, slide), sc = d / coinD[standKind]!;
      coin(ctx, standKind, 0, cx, y, sc, 0, 1); coinDots(ctx, standKind, cx, y, 1, sc);
    }
  }
  /** Step 8: a warm glow at the animal's paws while change is owed, and the pennies handed back so far. */
  function renderPaws(ctx: CanvasRenderingContext2D): void {
    // Nothing is owed until the animal's dime has poured; then one penny shows per hand-back.
    const back = animalPaid ? changeOwed - changeLeft : 0, cx = pawsCX(), cy = pawsCY(), hop = pawsHop < 0.3 ? Math.sin(pawsHop / 0.3 * Math.PI) * 8 * u : 0;
    if (animalPaid && changeReserved < changeOwed && glowCanvas) {
      const g = (pawsX1 - pawsX0) * 1.2 * (0.92 + Math.sin(time * 4) * 0.08); ctx.globalAlpha = 0.75;
      ctx.drawImage(glowCanvas, cx - g / 2, cy - g / 2, g, g); ctx.globalAlpha = 1;
    }
    const sc = 0.5, d = coinD[PENNY]! * sc;
    for (let i = 0; i < back; i++) coin(ctx, PENNY, 0, cx + (i - (back - 1) / 2) * d * 0.55, cy + d * 0.35 - hop - i * 2 * u, sc, 0, 1);
  }
  function handTip(): void {
    const tx = pX[hand.place] ?? W / 2, ty = pY[hand.place] ?? H;
    if (hand.mode === HAND_TAP) { pos.x = tx + coinD[PENNY]! * 0.1; pos.y = ty + coinD[PENNY]! * 0.1 - Math.abs(Math.sin(hand.t * 3.2)) * 22 * u; return; }
    targetPoint(hand.target, hand.kind);
    const sx = pos.x, sy = pos.y, t = hand.t, pressAt = handPressAt(), carryAt = handCarryAt(), dropAt = handDropAt();
    if (t < pressAt) {
      if (hand.cycle > 0) { const e = easeInOutSine(t / pressAt); pos.x = lerp(sx, tx, e); pos.y = lerp(sy, ty, e); }
      else { const e = easeOutCubic(t / pressAt); pos.x = lerp(tx + 60 * u, tx, e); pos.y = lerp(H + 40, ty, e); }
    } else if (t < carryAt) { pos.x = tx; pos.y = ty; }
    else if (t < dropAt) { const e = easeInOutSine((t - carryAt) / (dropAt - carryAt)); pos.x = lerp(tx, sx, e); pos.y = lerp(ty, sy, e) - Math.sin(e * Math.PI) * 90 * u; }
    else { pos.x = sx; pos.y = sy; }
  }
  function renderHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.mode || (hand.mode === HAND_TAP && hand.place < 0)) return;
    handTip();
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(150 * u), hw = hs * img.naturalWidth / img.naturalHeight, t = hand.t, kind = hand.kind;
    const pressAt = handPressAt(), carryAt = handCarryAt(), dropAt = handDropAt(), last = hand.reps <= 1;
    let alpha = hand.mode === HAND_HINT ? 0.85 : 1;
    if (hand.mode !== HAND_TAP && t > dropAt && last) alpha *= 1 - clamp01((t - dropAt) / HAND_FADE);
    if (hand.mode !== HAND_TAP && hand.cycle === 0 && t < pressAt) alpha *= clamp01(t / 0.3);
    const carrying = hand.mode !== HAND_TAP && t >= carryAt && t < dropAt && (hand.mode === HAND_HINT || hand.taken);
    if (carrying || (hand.mode === HAND_HINT && t >= dropAt)) {
      const ghost = hand.mode === HAND_HINT, a = ghost ? alpha : 1;
      if (ghost && glowCanvas) { const g = glowSize; ctx.globalAlpha = a * (0.85 + Math.sin(time * 7) * 0.15); ctx.drawImage(glowCanvas, pos.x - g / 2, pos.y - g / 2, g, g); }
      ctx.globalAlpha = ghost ? a * 0.6 : 1; coin(ctx, kind, 0, pos.x, pos.y, 1, 0, 1); ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = alpha;
    const press = (t >= pressAt && t < carryAt && hand.mode !== HAND_TAP) || (hand.mode === HAND_TAP && Math.abs(Math.sin(hand.t * 3.2)) < 0.15) ? 0.9 : 1;
    // The art's fingertip is at its top left corner: put it on the target.
    drawSprite(ctx, sprites, HAND, pos.x + hw * 0.42, pos.y + hs * 0.44, hs, 0, press, press);
    note(HAND, hs, img.naturalHeight);
    ctx.globalAlpha = 1;
  }
  function renderAnimals(ctx: CanvasRenderingContext2D): void {
    // The queue: the round's riders after the one at the gate (the next one walks up while the balloon lifts off).
    const walk = riderPhase === 'paid' && seqT >= SEQ_HOP_AT ? easeInOutSine(clamp01((seqT - SEQ_HOP_AT) / (SEQ_SECONDS - SEQ_HOP_AT))) : 0;
    const first = introStage === 1 ? 0 : riderIndex + 1, gx = gateAt();
    const hopQ = queueHop < 0.4 ? Math.sin(queueHop / 0.4 * Math.PI) * 18 * u : 0;
    for (let i = Math.min(ridersTotal - 1, first + 3); i >= first; i--) {
      const k = i - first;
      const a = intro ? (1 + i) % ANIMALS.length : (animalOffset + i) % ANIMALS.length;
      let sc = queueSpot(k); const x0 = pos.x, y0 = pos.y;
      if (walk > 0) { const s1 = queueSpot(k - 1); pos.x = lerp(x0, pos.x, walk); pos.y = lerp(y0, pos.y, walk); sc = lerp(sc, s1, walk); }
      else { pos.x = x0; pos.y = y0; }
      // The queue thins where it would crowd the gate or stand behind the swap stand.
      if (k >= 0 && walk === 0 && pos.x - animalH * 0.3 * sc < gx + animalH * 0.34) continue;
      if (swapOn() && pos.x + animalH * 0.3 * sc > standX) continue;
      animal(ctx, a, 0, pos.x, pos.y - hopQ * (k % 2 ? 0.7 : 1), animalH, sc);
    }
    // The rider at the gate (drawn after the balloon when the swap stand pushed it in front of the basket).
    if (gx === gateX) renderGate(ctx);
  }
  /** The rider at the gate, until it hops into the basket once the fare is paid. */
  function renderGate(ctx: CanvasRenderingContext2D): void {
    if (riderPhase === 'paid' && seqT >= SEQ_HOP_AT) return;
    const gx = gateAt(), hopG = gateHop < 0.42 ? Math.sin(gateHop / 0.42 * Math.PI) * 20 * u : 0;
    const breathe = Math.sin(time * 2.1) * 0.012;
    // Step 8: the animal holds out its paws (waving pose) while it pays and waits for its change.
    const pose = riderPhase === 'paid' || gateHop < 0.6 || pawsOn() ? 1 : 0;
    animal(ctx, riderAnimal, pose, gx, feetY - hopG, animalH, 1, 0, 1 - breathe);
    if (pawsOn()) renderPaws(ctx);
  }
  /** The play balloon: basket, envelope, fare box, and the rider climbing in. */
  function renderBalloon(ctx: CanvasRenderingContext2D): void {
    const cx = basketL + BW / 2, top = basketTop() + liftY;
    if (top + BH > -20) balloon(ctx, cx, top, 1, 0, 0, false);
    // The rider climbs in and rides up with the balloon.
    if (riderPhase === 'paid' && seqT >= SEQ_HOP_AT) {
      const k = clamp01((seqT - SEQ_HOP_AT) / SEQ_HOP), e = easeInOutSine(k);
      const clipY = top + BH * RIM_CLIP, inX = cx + BW * 0.3, inFeet = clipY + animalH * 0.5;
      const x = lerp(gateAt(), inX, e), feet = lerp(feetY, inFeet, e) - Math.sin(k * Math.PI) * animalH * 0.75;
      if (k < 0.5) animal(ctx, riderAnimal, 1, x, feet, animalH, 1);
      else {
        ctx.save(); ctx.beginPath(); ctx.rect(0, -H, W, clipY + H); ctx.clip();
        animal(ctx, riderAnimal, 1, x, feet + (k >= 1 ? Math.sin(time * 5) * 3 * u : 0), animalH, 1);
        ctx.restore();
      }
    }
    renderBox(ctx);
  }
  /** Keyboard play with two targets: a ring round the target the held coin will drop on, and the coin above it. */
  function renderKeyCarry(ctx: CanvasRenderingContext2D): void {
    let x0 = zoneX0, y0 = zoneY0, x1 = zoneX1, y1 = zoneY1;
    if (keyTarget === T_STAND) { x0 = sZoneX0; y0 = sZoneY0; x1 = sZoneX1; y1 = sZoneY1; }
    else if (keyTarget === T_PAWS) { x0 = pawsX0; y0 = pawsY0; x1 = pawsX1; y1 = pawsY1; }
    ctx.beginPath(); ctx.roundRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8, 18 * u);
    ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
    targetPoint(keyTarget, carry.kind);
    coin(ctx, carry.kind, 0, pos.x, pos.y - coinD[carry.kind]! * 0.5 - Math.abs(Math.sin(time * 3)) * 10 * u, 1.05, 0, 1);
  }
  function renderPlay(ctx: CanvasRenderingContext2D): void {
    if (driftT < DRIFT_SECONDS) {
      ctx.globalAlpha = 1 - clamp01((driftT - DRIFT_SECONDS + 0.5) / 0.5);
      balloon(ctx, driftX, driftY, DRIFT_K, driftAnimal, 1, true);
      ctx.globalAlpha = 1;
    }
    if (swapOn()) renderStand(ctx);
    renderAnimals(ctx);
    renderBalloon(ctx);
    if (gateAt() !== gateX) renderGate(ctx);
    renderTray(ctx);
    renderFlights(ctx);
    if (carry.active) { if (carry.keyed) renderKeyCarry(ctx); else coin(ctx, carry.kind, 0, input.pointer.x, input.pointer.y, 1.12, 0, 1); }
    particles.render(ctx);
    renderHand(ctx);
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
    // A soft cloud-cream disc under each offer, like the clouds in the sky.
    ctx.beginPath(); ctx.arc(x, y + size * 0.04, size * 0.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 244, 220, 0.85)'; ctx.fill();
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
  function renderResult(ctx: CanvasRenderingContext2D): void {
    const starT = phase === 'celebration' ? phaseT - STAR_START : 99;
    if (phase === 'celebration') {
      // The balloon floats past with every rider of the round waving from the basket.
      const k = celebK(), bh = BH * k, x = lerp(W * 0.2, W * 0.8, easeInOutSine(phaseT / CELEBRATION_SECONDS));
      const top = H * 0.98 - bh + Math.sin(phaseT * 2) * 8 * u;
      balloon(ctx, x, top, k, pending ? (pending.animalOffset) : 0, Math.min(4, pending?.riders ?? 3), true);
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
    } else {
      // Rewards off or the set complete: the round's riders wave, never a made-up collectible.
      const n = Math.min(4, pending?.riders ?? 3), h = restSize * 0.62, gap = Math.min(W / (n + 1), h * 0.85);
      for (let i = 0; i < n; i++) animal(ctx, ((pending?.animalOffset ?? 0) + i) % ANIMALS.length, 1, W / 2 + (i - (n - 1) / 2) * gap, restY + h * 0.5, h, 1, Math.sin(time * 3 + i) * 0.05);
    }
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i, false); chunkyCircle(ctx, x, controlsY, controlsRadius, '#a8d58f', OUTLINE, 5 * u);
      drawSprite(ctx, sprites, i === 0 ? BUTTON_PLAY : BUTTON_HOME, x, controlsY, Math.round(controlsRadius * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsRadius);
    }
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    chunkyCircle(ctx, homeX, cornerY, cornerRadius, '#a8d58f', OUTLINE, 4);
    drawSprite(ctx, sprites, BUTTON_HOME, homeX, cornerY, Math.round(cornerRadius * 1.3));
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
  function placeAt(x: number, y: number): number {
    for (let p = 0; p < nPlaces; p++) {
      const r = rows === 1 ? 0 : pY[p]! > trayY + rowH ? 1 : 0, top = trayY + r * (rowH + placeGap);
      if (Math.abs(x - pX[p]!) <= placeW / 2 && y >= top && y <= top + rowH) return p;
    }
    return -1;
  }
  const onBox = (x: number, y: number): boolean => x >= zoneX0 && x <= zoneX1 && y >= zoneY0 && y <= zoneY1;
  const onStand = (x: number, y: number): boolean => x >= sZoneX0 && x <= sZoneX1 && y >= sZoneY0 && y <= sZoneY1;
  const onPaws = (x: number, y: number): boolean => x >= pZoneX0 && x <= pZoneX1 && y >= pZoneY0 && y <= pZoneY1;
  /** The drop target under a point: the swap stand (step 7), the paws (step 8), the fare box, or -1. */
  const targetAt = (x: number, y: number): number => (swapOn() && onStand(x, y) ? T_STAND : pawsOn() && onPaws(x, y) ? T_PAWS : onBox(x, y) ? T_BOX : -1);
  /**
   * Where a single press (tier 0) or the keyboard's first choice sends a coin: the paws while change is owed (step 8);
   * at step 7 the fare box when it takes this coin, else the swap stand when it does; otherwise the fare box.
   */
  function defaultTarget(kind: number): number {
    if (pawsOn()) return T_PAWS;
    if (swapOn() && !fitsNow(kind) && standTakes(kind)) return T_STAND;
    return T_BOX;
  }
  const onCorner = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius || Math.hypot(x - soundX, y - cornerY) <= cornerRadius;
  const onTray = (x: number, y: number): boolean => y >= trayY && y <= trayY + trayH && x >= trayX && x <= trayX + trayW;
  /** Presses while the balloon is away or a coin pours: the animals hop, the pressed coin hops. */
  function invite(p: number): void { queueHop = 0; gateHop = 0; if (p >= 0) pHop[p] = 0; play('pop', 'A', 3, 0.3); }
  function interruptHand(): void { if (hand.mode === HAND_TAP || hand.mode === HAND_HINT) hand.mode = 0; }
  /** Take a coin off place p into the hand (or the pointer). */
  function pick(p: number): boolean {
    if (!available(p)) return false;
    if (!pUnlimited[p]) pCount[p]!--;
    carry.place = p; carry.kind = pKind[p]!;
    play('pop', 'B', 2, 0.5); playVoice(audio, COIN_NAMES[carry.kind]!);
    return true;
  }
  /** Put a coin in the hand back on its place (it slides home). */
  function returnCarry(x: number, y: number): void {
    carry.active = false; carry.keyed = false;
    launch(RETURN, carry.kind, 1, carry.place, x, y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS);
  }
  function release(x: number, y: number): void {
    carry.active = false; carry.keyed = false;
    const target = targetAt(x, y);
    if (target >= 0) { hits++; dropTo(target, carry.kind, carry.place, x, y, carry.deliberate, false); return; }
    if (!onTray(x, y)) { misses++; play('whoosh', 'D', 0, 0.55); }
    launch(RETURN, carry.kind, 1, carry.place, x, y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS);
  }
  function pointerDown(x: number, y: number): void {
    idleT = 0; interruptHand();
    const now = performance.now(), gap = now - lastPressAt;
    lastPressAt = now;
    if (riderPhase !== 'pay' || introStage === 1) { if (!onCorner(x, y)) invite(placeAt(x, y)); return; }
    if (carry.active) { release(x, y); return; }
    const p = placeAt(x, y);
    if (p >= 0) {
      if (busy() || !available(p)) { invite(p); return; }
      if (!pick(p)) return;
      carry.active = true; carry.sticky = false; carry.keyed = false; carry.downAt = now; carry.downX = x; carry.downY = y; carry.deliberate = gap >= DELIBERATE_MS; focus = p;
      return;
    }
    const target = targetAt(x, y);
    if (target >= 0) {
      // A press on a target with no coin: it hops, and so does the highlighted coin.
      if (target === T_STAND) standHop = 0; else if (target === T_PAWS) pawsHop = 0; else boxHop = 0;
      if (focus < nPlaces) pHop[focus] = 0;
      play('pop', 'A', 4, 0.3); return;
    }
    if (!onCorner(x, y)) { misses++; gateHop = 0; }
  }
  function pointerUp(x: number, y: number): void {
    if (!carry.active || carry.sticky) return;
    const now = performance.now(), quick = now - carry.downAt < 300 && Math.hypot(x - carry.downX, y - carry.downY) < 24;
    if (quick) {
      if (TIERS[tier].oneTap) {
        // Tier 0: one press sends the coin where the step asks next. Not a motor attempt; still a deliberate coin choice.
        carry.active = false;
        dropTo(defaultTarget(carry.kind), carry.kind, carry.place, pX[carry.place]!, pY[carry.place]!, carry.deliberate, false);
        return;
      }
      carry.sticky = true; return; // Click then target: the coin follows the pointer until the next press.
    }
    release(x, y);
  }
  function keyPlay(code: string): void {
    idleT = 0; interruptHand();
    if (riderPhase !== 'pay' || introStage === 1) { invite(-1); return; }
    const left = code === 'ArrowLeft' || code === 'ArrowUp', right = code === 'ArrowRight' || code === 'ArrowDown';
    const two = swapOn() || pawsOn();
    if (left || right) {
      // Holding a coin with two targets, the arrows choose the target; otherwise they move between coins.
      if (carry.active && carry.keyed) { keyTarget = keyTarget === T_BOX ? (swapOn() ? T_STAND : T_PAWS) : T_BOX; return; }
      if (!carry.active) moveFocus(left ? -1 : 1);
      return;
    }
    const now = performance.now();
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    if (carry.active && carry.keyed) {
      targetPoint(keyTarget, carry.kind);
      carry.active = false; carry.keyed = false;
      dropTo(keyTarget, carry.kind, carry.place, pos.x, pos.y - coinD[carry.kind]! * 0.5, false, true);
      return;
    }
    if (carry.active) returnCarry(input.pointer.x, input.pointer.y);
    keepFocus();
    if (busy() || !available(focus)) { invite(focus); return; }
    if (!pick(focus)) return;
    if (two) {
      // Two targets: the first key lifts the coin over the target the step asks for next; arrows choose, the next key drops.
      carry.active = true; carry.keyed = true; carry.sticky = true; keyTarget = defaultTarget(carry.kind);
      return;
    }
    dropTo(T_BOX, carry.kind, carry.place, pX[carry.place]!, pY[carry.place]!, false, true);
  }

  // ---------------------------------------------------------------- stats
  const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  const coinInfo = (): CoinInfo[] => {
    const out: CoinInfo[] = [];
    if (!playable()) return out;
    for (let p = 0; p < nPlaces; p++) {
      if (pCount[p]! <= 0) continue;
      const r = rows === 1 ? 0 : pY[p]! > trayY + rowH ? 1 : 0, top = trayY + r * (rowH + placeGap);
      out.push({ kind: COIN_NAMES[pKind[p]!]!, face: 'heads', x: pX[p]!, y: pY[p]!, d: coinD[pKind[p]!]!, place: p, count: pCount[p]!, dots: pDots[p] === 1, hit: { x: pX[p]! - placeW / 2, y: top, w: placeW, h: rowH } });
    }
    for (const f of flights) if (f.active && f.mode !== LEAVE) out.push({ kind: COIN_NAMES[f.kind]!, face: 'heads', x: f.x1, y: f.y1, d: coinD[f.kind]!, place: f.place, count: f.n, dots: f.mode === SWAPPED, hit: null });
    return out;
  };
  const cupGroups = (): CupGroup[] => {
    const out: CupGroup[] = [];
    if (usesPlate() || nCups <= 0) return out;
    // Ten cups to a group: the box's grid and the panel's grid, or one row of ten (step 6: the box's rows, then the panel's).
    for (let start = 0, g = 0; start < nCups; start += 10, g++) {
      const end = Math.min(nCups, start + 10);
      let litN = 0, change = 0;
      for (let i = start; i < end; i++) {
        if (i < lit) litN++;
        if (plan.animalPays && i >= fare && i < lit && (!animalPaid || i - fare < changeLeft)) change++;
      }
      // Step 8: change cups exist only once the dime has lit them.
      const total = plan.animalPays ? Math.max(0, Math.min(end, Math.max(fare, lit)) - start) : end - start;
      const inPanel = cupMode === CUPS_GRID ? start >= 10 : start >= boxRows * 10;
      out.push({ where: inPanel ? 'panel' : 'box', row: cupMode === CUPS_ROWS ? (inPanel ? g - boxRows : g) : 0, total, lit: litN, change });
    }
    return out;
  };
  const stats: RideFareStats = {
    get step() { return data.step; }, get contentStep() { return contentStep(); }, get tier() { return tier; }, get rounds() { return data.rounds; },
    get phase() { return phase; }, get riderPhase() { return riderPhase; }, get intro() { return intro; }, get introStage() { return introStage; },
    get rider() { return riderIndex; }, get riders() { return ridersTotal; }, get hits() { return hits; }, get misses() { return misses; }, get bounces() { return bounces; },
    get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; }, get hand() { return hand.mode; },
    get carrying() { return carry.active; }, get focus() { return focus; }, get counted() { return roundCounted.slice(); }, get learn() { return data.learn.slice(); },
    get fare() { return fare; },
    get cups() { return { total: usesPlate() ? 0 : fare, lit: Math.min(lit, fare) }; },
    get cupGroups() { return cupGroups(); },
    get cupDiameter() { return { grid: cupR * 2, rows: smallR * 2 }; },
    get numeral() { return numeralOn && playable() ? { fare, counter: plan.step === 6 ? lit : 0, rect: rect(numX, numY + liftY, numX + numW, numY + numH + liftY) } : null; },
    get stand() {
      if (!swapOn() || !playable()) return null;
      return { drawn: rect(standX, standY, standX + standW, standY + standH), zone: rect(sZoneX0, sZoneY0, sZoneX1, sZoneY1), kind: standKind >= 0 ? COIN_NAMES[standKind]! : '', count: standCount, need: standNeed(standMode()) };
    },
    get paws() {
      if (!plan.animalPays || !playable()) return null;
      return { rect: rect(pawsX0, pawsY0, pawsX1, pawsY1), zone: rect(pZoneX0, pZoneY0, pZoneX1, pZoneY1), owed: changeOwed, left: animalPaid ? changeLeft : changeOwed, paid: animalPaid };
    },
    get demos() { return data.demos; },
    get keyTarget() { return carry.active && carry.keyed ? (keyTarget === T_STAND ? 'stand' : keyTarget === T_PAWS ? 'paws' : 'farebox') : ''; },
    get plate() { return usesPlate() ? Array.from({ length: plateN }, (_, k) => ({ kind: COIN_NAMES[plateKind[k]!]!, lit: plateState[k] === 2 })) : []; },
    get coins() { return coinInfo(); },
    get targets() {
      const out: TargetInfo[] = [];
      if (playable()) out.push({ kind: 'farebox', x: zoneX0, y: zoneY0, w: zoneX1 - zoneX0, h: zoneY1 - zoneY0, drawn: { x: boxX, y: boxY + liftY, w: boxW, h: boxH } });
      if (playable() && swapOn()) out.push({ kind: 'stand', ...rect(sZoneX0, sZoneY0, sZoneX1, sZoneY1), drawn: rect(standX, standY, standX + standW, standY + standH) });
      if (playable() && plan.animalPays) out.push({ kind: 'paws', ...rect(pZoneX0, pZoneY0, pZoneX1, pZoneY1), drawn: rect(pawsX0, pawsY0, pawsX1, pawsY1) });
      if (phase === 'choice' && pending) for (let i = 0; i < pending.choices.length; i++) out.push({ kind: `sticker:${pending.choices[i]}`, x: controlX(i, true) - choiceSize / 2, y: choiceY - choiceSize / 2, w: choiceSize, h: choiceSize });
      if (phase === 'rest') for (let i = 0; i < 2; i++) out.push({ kind: i === 0 ? 'again' : 'home', x: controlX(i, false) - controlsRadius, y: controlsY - controlsRadius, w: controlsRadius * 2, h: controlsRadius * 2 });
      out.push({ kind: 'corner-home', x: homeX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      out.push({ kind: 'corner-sound', x: soundX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      return out;
    },
    get coinSizes() { return { penny: coinD[PENNY]!, nickel: coinD[NICKEL]!, dime: coinD[DIME]! }; },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    scales() { return Object.fromEntries(drawnScale); },
    resetWork() { workHead = workCount = 0; },
  };

  function applyDebug(): void {
    if (!services.debug.enabled || debugApplied) return;
    debugApplied = true;
    const params = new URLSearchParams(location.search), step = Number(params.get('step')), rounds = Number(params.get('rounds'));
    if (params.has('step') && Number.isSafeInteger(step) && step >= 1 && step <= TOP_STEP) { data.step = step; data.learn.length = 0; data.stepRounds = 0; }
    if (params.has('rounds') && Number.isSafeInteger(rounds) && rounds >= 0) { data.rounds = rounds; data.pending = null; }
    else if (params.has('step') && data.rounds === 0) data.rounds = 1;
  }
  return {
    stats,
    enter() {
      void loadRideFareArt(services).then(() => { bakedTray = ''; layout(services.canvas.width, services.canvas.height); });
      preloadVoice(audio, services.base);
      data = services.save.gameData<RideData>(GAME_ID, defaultData());
      sanitizeRideData(data, () => services.save.protect());
      applyDebug();
      if (!(services.debug.enabled && new URLSearchParams(location.search).has('rounds'))) data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; bookGlide = false; startMusic(audio, 'ride-fare');
      if (data.pending) {
        pending = data.pending; stars = pending.stars; tier = pending.tier; animalOffset = pending.animalOffset; intro = false;
        layout(services.canvas.width, services.canvas.height);
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
        else enterRest();
      } else { layout(services.canvas.width, services.canvas.height); startRound(); }
      if (services.debug.enabled) (window as unknown as { __rideFare?: RideFareStats }).__rideFare = stats;
    },
    pause() {
      stopMusic(audio); stopIdle();
      if (carry.active) returnCarry(input.pointer.x, input.pointer.y);
      services.save.flush();
    },
    resume() {
      guard(phase === 'choice' || phase === 'rest' ? MENU_GUARD_MS : PLAY_GUARD_MS); cornerFocus = -1;
      startMusic(audio, 'ride-fare');
    },
    exit() {
      stopMusic(audio); stopIdle(); offers.cancel(); closeFinishedRound(); services.save.flush();
      releaseArt(); sprites.clearScaled(BG); bgCanvas = undefined; sizeKey = ''; madeName = ''; bakedTray = ''; trayCanvas = undefined;
    },
    resize: layout,
    update(dt) {
      const started = performance.now(); sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      if (playable()) updatePlay(dt); else updateResult(dt);
      askIdle(); updateFlights(dt); particles.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H || sprites.pixelRatio !== artRatio) layout(view.width, view.height);
      ensureBackground(); warm(ctx);
      if (bgCanvas) ctx.drawImage(bgCanvas, bgX, bgY, bgCanvas.width / sprites.pixelRatio, bgCanvas.height / sprites.pixelRatio);
      else { ctx.fillStyle = '#f3c58a'; ctx.fillRect(0, 0, W, H); }
      if (playable()) renderPlay(ctx); else renderResult(ctx);
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

