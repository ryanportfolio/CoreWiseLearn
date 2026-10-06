/**
 * Piggy Parade: coins roll down a wooden chute onto a hay tray; clay piggy banks on a barn shelf each wear one coin
 * as a belly badge. The child puts each coin into the piggy wearing the same coin. A right piggy oinks, wiggles and
 * fills up; a different piggy sends the coin rolling back while the right one wiggles. Nothing is ever wrong.
 */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { CursorHover, Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { ensureDisplayFont } from '../../app/font';
import { chunkyCircle, DISPLAY_FONT, drawSprite, groundShadow, OUTLINE, roundedRect } from '../../ui/draw';
import { confettiBurst, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, onBook, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { approach, clamp01, easeInOutSine, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { defaultData, GAME_ID, MAX_STEP, sanitizePiggyData, type PendingRound, type PiggyData } from './data';
import {
  applyLearning, applyMotor, COIN_NAMES, DIME, INTRO, INTRO_COINS, NICKEL, PENNY, QUARTER, RATIO, recordDrop, ROUND_STARS, roundCoins,
  roundStep, stepContent, TIERS, VALUE, type StepContent,
} from './rules';
import { createValueTags } from './value-tag';
import { playVoice, preloadVoice } from './voice';

export { GAME_ID };
const ART = 'piggy-parade/';
const COLORS = ['pink', 'mint', 'yellow', 'blue'] as const;
const BG = `${ART}barn`, SHELF = `${ART}shelf`, TRAY = `${ART}tray`, CHUTE = `${ART}chute`, HEN = `${ART}hen`, CHICK = `${ART}chick`, HAND = `${ART}helper-hand`;
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
// Sprite names built once; draw code only indexes these tables.
const PIGGY_NAMES = COLORS.map(c => [`${ART}piggy-${c}-content`, `${ART}piggy-${c}-happy`] as const);
// Every coin shows its front only (money labels, owner 2026-10-06); the tails files are no longer loaded.
const COIN_SPRITES = COIN_NAMES.map(n => `${ART}coin-${n}-heads`);
const piggyName = (color: number, happy: boolean): string => PIGGY_NAMES[color & 3]![happy ? 1 : 0];
const coinName = (kind: number): string => COIN_SPRITES[kind & 3]!;
/** Value tags in this game's numerals (the steps' labels: Andika 900) and deep brown ink. */
const TAG_INK_COLOR = '#4a2a12', TAG_WEIGHT = 900, TAG_MIN_INK = 21;

/** Piggy sprite geometry, as fractions of its frame: width over height, feet, the back slot, the snout, the belly badge. */
const PIG_ASPECT = 435 / 480, PIG_FEET = 0.985, PIG_SLOT = 0.08, PIG_SNOUT = 0.36, PIG_BADGE = 0.64;
/** Shelf plank top as a fraction of the shelf sprite's height; the sprite's own width caps the shelf. */
const SHELF_PLANK = 0.04, SHELF_PX = 1503, SHELF_ASPECT = 260 / 1503;
/** Tray: its sprite width, aspect, the hay's left and right edges and the coin row's height, as fractions of the sprite. */
const TRAY_PX = 1510, TRAY_ASPECT = 404 / 1510, HAY_L = 0.07, HAY_R = 0.92, HAY_ROW = 0.33;
/** Chute sprite size and its groove from the top (P0) to the open end (P1), as fractions of the sprite. */
const CHUTE_W = 560, CHUTE_H = 552, CHUTE_X0 = 0.2, CHUTE_Y0 = 0.12, CHUTE_X1 = 0.9, CHUTE_Y1 = 0.86;
const HEN_ASPECT = 313 / 320, CHICK_ASPECT = 211 / 256;
/**
 * Steps sprite (value steps 6 to 8), as fractions of the sprite, block by block from the penny's (lowest, left) to the
 * quarter's: block centre x, where the feet stand on the block's top, the top edge of the block's front face, the
 * sprite's bottom edge, and one block's front width.
 */
const STEPS_ART = `${ART}steps`, STEPS_PX = 1514, STEPS_ASPECT = 470 / 1514;
const STEP_CX = [0.134, 0.379, 0.624, 0.864], STEP_FEET = [0.668, 0.468, 0.281, 0.089], STEP_FACE = [0.713, 0.515, 0.323, 0.132];
const STEP_BASE = 0.977, STEP_BLOCK = 0.24;
/** Value dots by coin: rows of five (the groups), dots per row; rows sit this many pitches apart so groups read apart. */
const DOT_ROWS = [1, 1, 2, 5], DOT_COLS = [1, 5, 5, 5], ROW_SPACE = 1.3;
/** The line-up's two orders, left to right: by size (dime, penny, nickel, quarter), then by value. */
const SIZE_ORDER = [DIME, PENNY, NICKEL, QUARTER], VALUE_ORDER = [PENNY, NICKEL, DIME, QUARTER];
/** Line-up timeline in seconds: roll in, size hops, the reorder, value pulses, roll off, end. */
const LU_HOPS = 0.9, LU_MOVE = 1.7, LU_MOVE_END = 2.6, LU_PULSE = 2.7, LU_OFF = 4.0, LU_END = 4.5;
const LABEL_TEXT = VALUE.map(v => `${v}¢`);
/** The dime's size never grows past this, so a carried quarter (1.12 times) stays within its 320 px sprite. */
const DIME_CAP = 210, CARRY_SCALE = 1.12, CHUTE_SCALE = 0.5;
/**
 * A coin coming down the chute, falling to the hay and rolling to its place shows no value tag (at the chute's half size
 * the numerals would be under 20 px, and a passing tag would cover a resting coin); its tag fades in over TAG_FADE
 * seconds once it comes to rest.
 */
const TAG_FADE = 0.25;
const HIGHLIGHT = '#fff6a3', GOLD = '#f3c84b';
const POOL = 16, PARTICLES = 160, MAX_PIGGIES = 4, MAX_SLOTS = 6;
const CELEBRATION_SECONDS = 4.6, STAR_START = 0.5;
// Choice and rest ignore input this long (and again after the break nudge); the first key then only shows focus.
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350, KEY_GAP_MS = 120;
/** A drop is learning evidence only this long after the previous drop; a key drop only this long after the last arrow. */
const DROP_GAP_MS = 600, ARROW_GAP_MS = 400;
const IDLE_SECONDS = 6, IDLE_REPEAT = 8, SPAWN_GAP = 0.45;
/** The round-end fanfare variant, rendered ahead during play. */
const FANFARE: SfxOptions = { variant: 'D' };
/** Idle preparation that has waited this long (or whose callback timed out) runs one step anyway, as the sticker offers do. */
const IDLE_WAIT_MS = 400;
const IDLE_OPTIONS: IdleRequestOptions = { timeout: IDLE_WAIT_MS };
/** Step 8's helper hand points straight down at the dime: the art (pointing up and left) turned 225 degrees. */
const HAND_DOWN = Math.PI * 1.25, HAND_COS = Math.cos(HAND_DOWN), HAND_SIN = Math.sin(HAND_DOWN);

type Phase = 'play' | 'celebration' | 'choice' | 'sticker' | 'rest';
// Coin states.
const OFF = 0, CHUTE_ROLL = 1, FALL = 2, ROLL = 3, REST = 4, HELD = 5, FLY = 6, SLOT = 7, BACK = 8;
// Who holds a HELD coin.
const BY_POINTER = 1, BY_KEY = 2, BY_HAND = 3;

interface Coin {
  state: number; kind: number; slot: number; held: number;
  x: number; y: number; x0: number; y0: number; t: number; dur: number; angle: number; wob: number;
  piggy: number; right: boolean; misses: number;
  /** The hand has shown this coin's piggy (a hint or a point), so its next drop is not evidence. */
  pointed: boolean;
  /** After two misses: the next drop curves into the matching piggy and records nothing. */
  assisted: boolean;
  /** Seconds since the value tag started to show (it fades in over TAG_FADE); -1 while the coin comes in, untagged. */
  tagT: number;
}
interface Piggy {
  kind: number; color: number; x: number; feet: number; row: number; coins: number;
  happyT: number; wiggleT: number; glowT: number; bumpT: number;
  /** Drop zone in CSS px: left, top, right, bottom. */
  zone: Float32Array;
}
export interface PiggyParadeStats {
  readonly step: number; readonly roundStep: number; readonly review: boolean; readonly tier: Tier; readonly rounds: number;
  readonly phase: Phase; readonly intro: boolean; readonly evidence: number;
  readonly coinsTotal: number; readonly coinsDone: number; readonly trayCap: number; readonly hits: number; readonly misses: number;
  readonly stars: number; readonly stickerId: string; readonly choiceIds: readonly string[]; readonly selected: number;
  readonly hand: number; readonly keyMode: string; readonly focusCoin: number; readonly focusPiggy: number;
  readonly workMean: number; readonly workMax: number; readonly celebrationLocked: boolean;
  /**
   * Every coin on screen: kind name, face drawn, centre and drawn diameter in CSS px, state name (badges and the top
   * coin of each piggy's stack included), its value tag's text and its numerals' drawn height in CSS px.
   */
  readonly coins: { kind: string; face: string; x: number; y: number; d: number; state: string; tag: string; tagInk: number }[];
  /** Every baked value tag: coin kind and size, text, planned and measured numeral height (CSS px at scale 1). */
  readonly tags: { kind: string; d: number; text: string; ink: number; measuredInk: number; w: number; h: number }[];
  /** Value-tag canvases baked so far. */
  readonly tagBakes: number;
  /** Piggy drop zones in CSS px (top-left x, y, width, height): the hit rectangles, not the drawn sprites. */
  readonly targets: { kind: string; x: number; y: number; w: number; h: number }[];
  /** Every interactive hit rectangle on screen now (coins, piggies, choices, Again, Home, corner buttons). */
  readonly hitRects: { id: string; x: number; y: number; w: number; h: number }[];
  /** Drawn sizes in CSS px, for the sharpness check. */
  readonly drawn: Record<string, number>;
  /**
   * Steps 6 to 8: each step's value as drawn under its piggy: dots, rows of five, the label text ('' at step 6) and
   * whether its baked label is on screen, and the box the dots and label fill (CSS px). Empty at steps 1 to 5.
   */
  readonly values: { kind: string; dots: number; rows: number; perRow: number; label: string; labelShown: boolean; dotD: number; x: number; y: number; w: number; h: number }[];
  /**
   * Step 8's line-up: running, seconds in, whether input skips it, the coin kinds from left to right at this moment,
   * each coin's centre and drawn diameter, each coin's value tag (text, the coin's lower edge it hangs from, numeral
   * height, how far it reaches below that edge, opacity), and the helper hand's drawn bounding box (null when not
   * shown). CSS px.
   */
  readonly lineup: {
    active: boolean; t: number; skippable: boolean; order: string[];
    coinBoxes: { kind: string; x: number; y: number; d: number }[];
    labels: { kind: string; text: string; x: number; y: number; ink: number; hang: number; alpha: number }[];
    hand: { x: number; y: number; w: number; h: number } | null;
  };
  /** The round-end fanfare and every planned sprite size are ready (idle preparation finished). */
  readonly prepared: boolean;
  /** First-time demonstrations shown (bits: 1 step 6, 2 step 7, 4 step 8) and whether the line-up has played once. */
  readonly demos: number; readonly lineupSeen: boolean;
  resetWork(): void;
}
export interface PiggyParadeScene extends Scene { readonly stats: PiggyParadeStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);
const STATE_NAMES = ['off', 'chute', 'fall', 'roll', 'rest', 'held', 'fly', 'slot', 'back'];

function artList(): { name: string; path: string }[] {
  const paths = [BG, SHELF, STEPS_ART, TRAY, CHUTE, HEN, CHICK, HAND].map(n => `${n}.webp`);
  paths.push(`${BUTTON_PLAY}.webp`, `${BUTTON_HOME}.webp`, BOOK_ICON_PATH);
  for (const pair of PIGGY_NAMES) for (const n of pair) paths.push(`${n}.webp`);
  for (const n of COIN_SPRITES) paths.push(`${n}.webp`);
  return [...paths.map(path => ({ name: path.replace(/\.\w+$/, ''), path })), ...STICKERS.filter(st => st.game === GAME_ID).map(st => ({ name: stickerSpriteName(st.id), path: st.path }))];
}
/** Sprites whose scaled canvases this game releases on a size change and on leaving; the backdrop is handled on its own. */
const OWN_ART = artList().map(a => a.name).filter(name => name !== BG);
export async function loadPiggyParadeArt(services: AppServices): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(artList().map(({ name, path }) => services.sprites.load(name, services.art(path)).catch(() => { missing.push(path); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}

/** A soft warm halo behind the see-through hint coin, baked once per size on a CPU canvas so a hint never reads as a real coin. */
function bakeGlow(size: number, ratio: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = Math.max(2, Math.round(size * ratio));
  const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return c;
  g.scale(c.width / size, c.width / size);
  const r = size / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 253, 225, 1)'); grad.addColorStop(0.6, 'rgba(255, 240, 150, 0.85)'); grad.addColorStop(1, 'rgba(255, 238, 140, 0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  g.beginPath(); g.arc(r, r, r * 0.7, 0, Math.PI * 2);
  g.lineWidth = Math.max(3, r * 0.06); g.strokeStyle = 'rgba(255, 255, 255, 0.95)'; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}

/** A CPU canvas of `w` by `h` CSS px at `ratio`, its context scaled to CSS px (no shader programs; pitfalls). */
function cpuCanvas(w: number, h: number, ratio: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * ratio)); c.height = Math.max(1, Math.ceil(h * ratio));
  const g = c.getContext('2d', { willReadFrequently: true });
  g?.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
  return [c, g];
}
/** One value dot: a cream clay dot with a brown rim, `d` CSS px across plus its rim; `lit` bakes its golden pulse look. */
function bakeDot(d: number, ratio: number, lit = false): HTMLCanvasElement {
  const rim = Math.max(2, d * 0.12), size = d + rim * 2, [c, g] = cpuCanvas(size, size, ratio);
  if (!g) return c;
  g.beginPath(); g.arc(size / 2, size / 2, d / 2, 0, Math.PI * 2);
  g.fillStyle = lit ? GOLD : '#fff4dc'; g.fill(); g.lineWidth = rim; g.strokeStyle = lit ? '#b8741a' : '#6b3a17'; g.stroke();
  g.beginPath(); g.arc(size / 2 - d * 0.16, size / 2 - d * 0.16, d * 0.14, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** The dark groove one group of dots sits in (a row of five, or the penny's single dot). */
function bakeGroove(w: number, h: number, ratio: number): HTMLCanvasElement {
  const [c, g] = cpuCanvas(w, h, ratio);
  if (!g) return c;
  roundedRect(g, 1, 1, w - 2, h - 2, h / 2);
  g.fillStyle = 'rgba(74, 38, 14, 0.55)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255, 226, 170, 0.5)'; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** A value label (1¢, 5¢, 10¢, 25¢) in the bundled font at `px`, cream with a brown rim; baked once per size. */
function bakeLabel(text: string, px: number, ratio: number): { canvas: HTMLCanvasElement; w: number; h: number } {
  const probe = document.createElement('canvas').getContext('2d');
  const font = `900 ${px}px ${DISPLAY_FONT}`;
  let tw = px * 1.4;
  if (probe) { probe.font = font; tw = probe.measureText(text).width; }
  const rim = Math.max(3, px * 0.16), w = Math.ceil(tw + rim * 2 + 4), h = Math.ceil(px * 1.25 + rim * 2);
  const [c, g] = cpuCanvas(w, h, ratio);
  if (g) {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = rim; g.strokeStyle = '#5a2e12'; g.strokeText(text, w / 2, h / 2 + px * 0.04);
    g.fillStyle = '#fff4dc'; g.fillText(text, w / 2, h / 2 + px * 0.04);
    g.getImageData(0, 0, 1, 1);
  }
  return { canvas: c, w, h };
}

/** Debug URL parameters (step, rounds) apply once per page load, so leaving and re-entering keeps real progress. */
let debugApplied = false;

export function createPiggyParadeScene(services: AppServices): PiggyParadeScene {
  const { sprites, audio, input } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(PARTICLES);
  const soundButton = createSoundButton(services), soundNames = soundArt(services).map(a => a.name);
  const coins: Coin[] = Array.from({ length: POOL }, () => ({
    state: OFF, kind: 0, slot: 0, held: 0, x: 0, y: 0, x0: 0, y0: 0, t: 0, dur: 1, angle: 0, wob: 9, piggy: 0, right: false, misses: 0, pointed: false, assisted: false, tagT: 9,
  }));
  const newPiggy = (): Piggy => ({ kind: 0, color: 0, x: 0, feet: 0, row: 0, coins: 0, happyT: 0, wiggleT: 9, glowT: 0, bumpT: 9, zone: new Float32Array(4) });
  const piggies: Piggy[] = Array.from({ length: MAX_PIGGIES }, newPiggy);
  /** Stands in for the round's piggies on the still rest screen. */
  const restPig = newPiggy();
  /** Coin index resting in (or heading for) each tray place, -1 when free. */
  const slotCoin = new Int8Array(MAX_SLOTS).fill(-1);
  const slotX = new Float32Array(MAX_SLOTS);
  /** Coin diameters by kind at the current layout (tray size), and the belly badges'. */
  const coinD = new Float32Array(4), badgeD = new Float32Array(4);
  /** Every coin's value tag (1¢ 5¢ 10¢ 25¢), baked once per coin size. */
  const tags = createValueTags(VALUE, TAG_INK_COLOR, TAG_WEIGHT);
  const roundKinds: number[] = [];
  const work = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const pos = { x: 0, y: 0 };
  /** The pointer's carried coin: `sticky` after a quick click (it follows until the next press). */
  const carry = { coin: -1, sticky: false, downAt: 0, downX: 0, downY: 0 };
  // Hand modes: 1 introduction (carries a real coin to its piggy), 2 idle hint (a see-through coin), 3 taps the
  // highlighted coin until the child acts, 4 points at the matching piggy after two misses with one coin.
  const hand = { mode: 0, t: 0, coin: -1, piggy: 0, slot: 0, released: false, kind: 0, x0: 0, y0: 0 };
  let data: PiggyData = defaultData();
  let W = 1366, H = 768, u = 1, s = 1;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0, glowCanvas: HTMLCanvasElement | undefined;
  let artRatio = 0, glowSize = 0;
  let phase: Phase = 'play', tier: Tier = 0, intro = false, review = false, playStep = 1;
  // trayWant: the places the round asks for (its tier's count); trayCap: how many fit the current layout.
  let content: StepContent = INTRO, pigCount = 2, coinsTotal = 0, nextCoin = 0, coinsDone = 0, trayWant = 2, trayCap = 2, spawnT = 0;
  let time = 0, sceneT = 0, phaseT = 0, idleT = 0, endT = -1, henHop = 9;
  let hits = 0, misses = 0, stars = 1, starsPlayed = 0, evidence = 0, lastDropAt = -1e9;
  let keyMode: 'coin' | 'piggy' = 'coin', focusSlot = 0, focusPiggy = 0, lastPiggy = 0, arrowed = false, lastArrowAt = 0, introShown = false;
  let pending: PendingRound | null = null;
  let menuSelected = -1, inputAfter = 0, keyAfter = 0, focusAt = 0;
  let workHead = 0, workCount = 0, updateMs = 0;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0, idleWaitFrom = -1;
  /** The helper hand's drawn bounding box in CSS px (w 0 when not drawn), for checks. */
  const handBox = new Float32Array(4);
  const warmNames: string[] = [], warmSizes: number[] = [], warmDone = new Set<string>();
  let warmIndex = 0, madeName = '', madeSize = 0, sizeKey = '';
  // Layout, all in CSS px.
  let portrait = false, pw = 0, ph = 0, snap = 0, shelfW = 0, shelfX = 0, plank0 = 0, plank1 = 0;
  let trayX = 0, trayW = 0, trayTop = 0, hayL = 0, hayR = 0, rowY = 0;
  let chuteX = 0, chuteY = 0, chuteW = 0, chuteH = 0, henH = 0, chickH = 0;
  let starY = 0, starR = 0, handH = 0;
  // Value steps (6 to 8): the steps sprite, each block's centre, feet and front face, and the value dots and labels on
  // the faces. Index = coin kind, since the piggies stand in value order.
  let stairs = false, stW = 0, stH = 0, stX = 0, stTop = 0, stSy = 1, faceBottom = 0;
  const stairX = new Float32Array(4), stairFeet = new Float32Array(4), faceTop = new Float32Array(4);
  const labelX = new Float32Array(4), labelY = new Float32Array(4), dotsX = new Float32Array(4), dotsY = new Float32Array(4);
  let labelSide = false, dotPitch = 0, dotD = 0, labelPx = 0, bakeKey = '';
  let dotCanvas: HTMLCanvasElement | undefined, litCanvas: HTMLCanvasElement | undefined, groove5: HTMLCanvasElement | undefined, groove1: HTMLCanvasElement | undefined;
  const labels: ({ canvas: HTMLCanvasElement; w: number; h: number } | undefined)[] = [undefined, undefined, undefined, undefined];
  let fontReady = false;
  /** Seconds since each step's dots began a pulse (9 = still), the row gap of that pulse, and each label's pop. */
  const pulseT = new Float32Array(4).fill(9), pulseGap = new Float32Array(4).fill(0.22), labelPopT = new Float32Array(4).fill(9);
  /** Step 8's line-up: positions by kind in size order and in value order, drawn diameters, and its clock. */
  const luX0 = new Float32Array(4), luX1 = new Float32Array(4), luD = new Float32Array(4);
  const lineup = { active: false, t: 0, skippable: false, demo: false };
  /** The first-time demonstration this round still owes (a bit of `data.demos`; 0 for none). */
  let demoBit = 0;
  let cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1;
  /** Mouse hover, eased 0 to 1: each piggy (a press there drops a coin) and the corner Home. */
  const pigHover = new Float32Array(MAX_PIGGIES);
  let homeHover = 0;
  let choiceSize = 0, choiceY = 0, restSize = 0, restY = 0, controlsY = 0, controlsRadius = 60;
  const offers = createStickerOffers(sprites), bookAt = new Float32Array(2);
  let bookH = 150, bookGlide = false;
  const stickerNames = new Map(STICKERS.map(st => [st.id, stickerSpriteName(st.id)]));

  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  const playable = (): boolean => phase === 'play';
  const matchOf = (kind: number): number => { for (let i = 0; i < pigCount; i++) if (piggies[i]!.kind === kind) return i; return 0; };
  const resting = (ci: number): boolean => ci >= 0 && coins[ci]!.state === REST;
  const maxCoinD = (): number => { let m = 0; for (const k of content.kinds) m = Math.max(m, coinD[k]!); return m; };
  function keyHeld(): number { for (let i = 0; i < POOL; i++) if (coins[i]!.state === HELD && coins[i]!.held === BY_KEY) return i; return -1; }
  /** The coin in the child's hand: carried by the pointer or lifted by a key; -1 for none. */
  const heldCoin = (): number => (carry.coin >= 0 ? carry.coin : keyHeld());

  // ---------------------------------------------------------------- layout
  /** Place the piggies at `height` (shrunk to 0.9 of a shelf slot where needed) and their drop zones. */
  function placePiggies(height: number): void {
    ph = height; pw = ph * PIG_ASPECT;
    const perRow = portrait ? 2 : pigCount, slot = shelfW / perRow;
    // On the steps the layout already sized the piggies to their blocks.
    if (!stairs && pw > slot * 0.9) { pw = slot * 0.9; ph = pw / PIG_ASPECT; }
    snap = TIERS[intro ? 0 : tier].snap * pw;
    const pad = H * 0.02;
    for (let i = 0; i < pigCount; i++) {
      const pg = piggies[i]!, row = !stairs && portrait && pigCount > 2 && i >= 2 ? 1 : 0;
      if (stairs) {
        // One row in value order, each piggy on its own block; in portrait they share the width in equal quarters.
        pg.row = 0; pg.feet = stairFeet[i]!; pg.x = portrait ? (i + 0.5) * W / 4 : stairX[i]!;
        continue;
      }
      const inRow = portrait ? (row === 0 ? Math.min(2, pigCount) : pigCount - 2) : pigCount, col = portrait ? i - row * 2 : i;
      pg.row = row; pg.feet = row === 0 ? plank0 : plank1;
      pg.x = shelfX - shelfW / 2 + (col + 0.5) * slot + (perRow - inRow) * slot / 2;
    }
    // Four zones across a portrait screen keep 96 px each only with the narrowest gap between them.
    const gap = stairs && portrait ? 0.5 : 2;
    for (let i = 0; i < pigCount; i++) {
      const pg = piggies[i]!, z = pg.zone;
      let left = pg.x - pw / 2 - snap, right = pg.x + pw / 2 + snap;
      // Zones never overlap: growth stops at the midpoint to a neighbour on the same shelf.
      for (let j = 0; j < pigCount; j++) {
        const o = piggies[j]!; if (j === i || o.row !== pg.row) continue;
        const mid = (o.x + pg.x) / 2;
        if (o.x < pg.x) left = Math.max(left, mid + gap); else right = Math.min(right, mid - gap);
      }
      let top = pg.feet - ph - snap;
      if (pg.row === 1) top = Math.max(top, plank0 + pad + 2);
      // Clear of the corner buttons.
      const cb = cornerY + cornerRadius + 4;
      if (top < cb && (left < homeX + cornerRadius || right > soundX - cornerRadius)) top = cb;
      // On the steps a drop on the step's front face (its dots) counts for its piggy too.
      z[0] = Math.max(0, left); z[1] = Math.max(0, top); z[2] = Math.min(W, right); z[3] = stairs ? Math.max(pg.feet + pad, faceBottom - 2) : pg.feet + pad;
    }
  }
  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H;
    W = width; H = height;
    const reratio = sprites.pixelRatio !== artRatio;
    artRatio = sprites.pixelRatio;
    if (reratio) warmDone.clear();
    s = Math.min(W / 1366, H / 768);
    u = Math.min(1.5, Math.max(0.45, s)) * services.config.uiScale;
    // Bubble Bay's corner buttons, place and size, so the break nudge's sound button covers this one exactly.
    const cornerU = Math.min(1.5, Math.max(0.4, s)) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * cornerU, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    // Coins at their true diameter ratios; the dime never under 96 px and never past its cap.
    const dime = Math.min(DIME_CAP, Math.max(96, 100 * s * services.config.uiScale));
    for (let k = 0; k < 4; k++) coinD[k] = Math.round(dime * RATIO[k]!);
    portrait = W < H * 0.9;
    const t = TIERS[intro ? 0 : tier];
    if (!portrait) {
      shelfW = Math.min(W * 0.72, SHELF_PX); shelfX = W * 0.56; plank0 = plank1 = H * 0.57;
      trayW = Math.min(W * 0.79, TRAY_PX); trayX = W * 0.1 + (W * 0.79 - trayW) / 2; trayTop = H * 0.66;
      // The chute fits inside its box (0 to 0.2 w, 0.2 h to 0.66 h), bottom-left aligned, never above its own pixels.
      const k = Math.min(W * 0.2 / CHUTE_W, H * 0.46 / CHUTE_H, 1);
      chuteW = CHUTE_W * k; chuteH = CHUTE_H * k; chuteX = 0; chuteY = H * 0.66 - chuteH;
      henH = Math.min(H * 0.17, W * 0.08 / HEN_ASPECT); chickH = Math.min(H * 0.15, W * 0.08 / CHICK_ASPECT);
    } else {
      shelfW = W * 0.92; shelfX = W / 2;
      plank0 = pigCount > 2 ? H * 0.42 : H * 0.6; plank1 = H * 0.66;
      trayW = W * 0.98; trayX = W * 0.01; trayTop = H * 0.7;
      chuteW = chuteH = 0; henH = chickH = 0;
    }
    stairs = content.stairs;
    if (stairs) {
      // Landscape: the steps take the shelf's place. Portrait: just wider than the screen so each block is a quarter of
      // it, and drawn 1.5 times taller so the faces hold their dots; the tray moves down to show the faces.
      if (!portrait) { stW = Math.min(W * 0.72, STEPS_PX); stX = W * 0.56; stSy = 1; stTop = H * 0.68; }
      else { stW = W / (4 * 0.243); stX = W / 2; stSy = 1.5; stTop = H * 0.7; trayTop = H * 0.72; }
      stH = stW * STEPS_ASPECT * stSy; stTop -= stH;
      for (let i = 0; i < 4; i++) {
        stairX[i] = stX + (STEP_CX[i]! - 0.5) * stW; stairFeet[i] = stTop + STEP_FEET[i]! * stH; faceTop[i] = stTop + STEP_FACE[i]! * stH;
      }
      faceBottom = Math.min(stTop + STEP_BASE * stH, trayTop);
    }
    // Piggies: the layout height times the tier size, shrunk in 5 percent steps (never below a 96 px wide body) while a
    // top-row piggy would reach into a corner button.
    let pigH = (portrait ? Math.min(H * 0.22, W * 0.42 / PIG_ASPECT) : H * 0.3) * t.size;
    if (stairs) {
      // On the steps: as wide as 0.9 of a block (a quarter of the screen in portrait), and short enough that a coin
      // going into the top piggy's slot stays on screen; never below a 96 px wide body.
      const most = portrait ? W / 4 - 1 : stW * STEP_BLOCK * 0.9;
      pigH = Math.max(96 / PIG_ASPECT, Math.min(pigH, most / PIG_ASPECT, stairFeet[3]! - coinD[DIME]! * 0.6 - 8));
    }
    for (let tries = 0; tries < 30; tries++) {
      placePiggies(pigH);
      let clash = false;
      for (let i = 0; i < pigCount; i++) {
        const pg = piggies[i]!;
        if (pg.row === 0 && pg.feet - ph < cornerY + cornerRadius + 2 && (pg.x - pw / 2 < homeX + cornerRadius || pg.x + pw / 2 > soundX - cornerRadius)) clash = true;
      }
      if (!clash || pw * 0.95 < 96) break;
      pigH = ph * 0.95;
    }
    const big = maxCoinD();
    for (let k = 0; k < 4; k++) badgeD[k] = Math.round(coinD[k]! * Math.min(0.9, 0.5 * pw / coinD[QUARTER]!));
    hayL = trayX + trayW * HAY_L; hayR = trayX + trayW * HAY_R;
    let zoneBottom = 0;
    for (let i = 0; i < pigCount; i++) zoneBottom = Math.max(zoneBottom, piggies[i]!.zone[3]!);
    // Value tags: numerals at least 20 CSS px (more on bigger screens); the row leaves room for the tag under each coin.
    tags.configure(tagFloor(), artRatio, fontReady);
    rowY = Math.max(trayTop + trayW * TRAY_ASPECT * HAY_ROW, zoneBottom + big / 2 + 6);
    rowY = Math.min(rowY, H - big / 2 - tags.hang(big) - 2);
    fitTray();
    handH = Math.round(Math.max(80, 110 * s));
    const glow = Math.round(big * 1.7);
    if (!glowCanvas || reratio || glow !== glowSize) { glowSize = glow; glowCanvas = bakeGlow(glowSize, artRatio); }
    const headerScale = Math.min(1.25, Math.max(0.6, s));
    starR = 34 * headerScale; starY = 70 * headerScale;
    if (stairs) layoutValues();
    layoutLineup();
    prepareTags();
    choiceSize = Math.round(Math.max(110, Math.min(340 * Math.min(1.25, H / 768), (W - 60) / 2)));
    choiceY = H * 0.56;
    // Never under 48 px (96 px across), whatever uiScale the config sets.
    controlsRadius = Math.max(48, Math.min(Math.max(48 * services.config.uiScale, 62 * u), W / 5));
    controlsY = H - controlsRadius - 22;
    restSize = Math.round(Math.max(110, Math.min(300 * Math.min(1.25, H / 768), controlsY - controlsRadius - starY - starR - 40)));
    restY = (starY + starR + controlsY - controlsRadius) / 2;
    bookH = Math.round(Math.max(72, Math.min(200, choiceSize * 0.45)));
    planWarm();
    // Every sprite size follows the canvas size, pixel ratio, tier and piggy count; a change releases the old canvases.
    const key = `${W}x${H}@${artRatio}/${tier}/${intro}/${pigCount}/${ph}/${coinD[DIME]}/${stairs}`;
    if (key !== sizeKey) { sizeKey = key; releaseArt(); }
    if (resized || reratio || !bgCanvas) { sprites.clearScaled(BG); bgCanvas = undefined; }
  }
  /**
   * Tray places: the round's count, or as many of its biggest coin as fit in one row on the hay without touching
   * (coins keep their full size, so each pick area stays at least 96 px), spread evenly. Runs on every layout, so a
   * resize reflows the tray: places that no longer fit hand their coins to free places, or the coins roll back up the
   * chute and wait their turn; places that fit again fill from the chute. Coins done, the total and a held coin stay.
   */
  function fitTray(): void {
    const room = Math.floor((hayR - hayL) / (maxCoinD() + 10));
    const cap = Math.max(1, Math.min(trayWant, room, MAX_SLOTS));
    if (cap < trayCap) shrinkTray(cap);
    trayCap = cap;
    for (let i = 0; i < trayCap; i++) slotX[i] = hayL + (i + 0.5) * (hayR - hayL) / trayCap;
    if (focusSlot >= trayCap) focusSlot = trayCap - 1;
    if (hand.mode === 2 && hand.slot >= trayCap) hand.mode = 0;
    if (hand.mode === 1 && hand.coin >= 0 && coins[hand.coin]!.slot >= 0) hand.slot = coins[hand.coin]!.slot;
  }
  /** Rank for keeping a tray place: a coin in a hand (2), in the air (1), or waiting on the tray (0). */
  const keepRank = (ci: number): number => { const c = coins[ci]!; return c.state === HELD ? 2 : c.state === FLY ? 1 : 0; };
  /** Leave tray place `slot`: a coin in the air keeps flying (and waits up the chute if it bounces back); others go now. */
  function vacate(ci: number): void {
    const c = coins[ci]!;
    if (slotCoin[c.slot] === ci) slotCoin[c.slot] = -1;
    if (c.state === FLY) { c.slot = -1; return; }
    c.slot = -1; c.state = BACK; c.held = 0; c.x0 = c.x; c.y0 = c.y; c.t = 0; c.dur = 0.5;
  }
  /** Fewer places fit: coins in places `cap` and up move to free places, a held coin first, else wait up the chute. */
  function shrinkTray(cap: number): void {
    for (let rank = 2; rank >= 0; rank--) {
      for (let i = cap; i < trayCap; i++) {
        const ci = slotCoin[i]!;
        if (ci < 0 || keepRank(ci) !== rank) continue;
        let j = -1;
        for (let k = 0; k < cap && j < 0; k++) if (slotCoin[k]! < 0) j = k;
        // No free place: a held coin takes one from a coin that ranks lower.
        if (j < 0 && rank === 2) for (let k = 0; k < cap && j < 0; k++) if (keepRank(slotCoin[k]!) < 2) { vacate(slotCoin[k]!); j = k; }
        if (j < 0) { vacate(ci); continue; }
        const c = coins[ci]!;
        slotCoin[i] = -1; slotCoin[j] = ci; c.slot = j;
        // A coin on the tray slides over to its new place.
        if (c.state === REST || c.state === ROLL) { c.state = BACK; c.x0 = c.x; c.y0 = c.y; c.t = 0; c.dur = 0.4; }
      }
    }
  }
  /**
   * Value dots and labels on the steps' front faces. One dot size and one label size for all four steps, the largest
   * that fits every face (so no coin's dots look bigger than another's): the label at the top of the face, the dots
   * centred below it in rows of five.
   */
  function layoutValues(): void {
    const blockW = stW * STEP_BLOCK, inset = Math.max(3, stH * 0.02), innerW = blockW * 0.84;
    labelPx = content.labels ? Math.round(Math.max(16, Math.min(44, blockW * 0.12))) : 0;
    const labelH = labelPx ? Math.ceil(labelPx * 1.2) + 2 : 0, labelW = labelPx ? Math.ceil(labelPx * 1.9) + 6 : 0;
    // The label goes above the dots or to their left, whichever leaves the bigger dots (wide faces: beside).
    const fit = (aboveH: number, besideW: number): number => {
      let pitch = (innerW - besideW) / 5;
      for (let k = 0; k < 4; k++) {
        const rows = DOT_ROWS[k]!, room = faceBottom - faceTop[k]! - inset * 2 - aboveH;
        pitch = Math.min(pitch, room / (rows + (rows - 1) * (ROW_SPACE - 1)));
      }
      return pitch;
    };
    const above = fit(labelH, 0), beside = labelPx ? fit(0, labelW) : 0;
    labelSide = labelPx > 0 && beside > above;
    const pitch = labelSide ? beside : above, aboveH = labelSide ? 0 : labelH;
    dotPitch = Math.max(8, Math.floor(pitch)); dotD = Math.max(6, Math.round(dotPitch * 0.72));
    for (let k = 0; k < 4; k++) {
      const top = faceTop[k]! + inset, rows = DOT_ROWS[k]!, cols = DOT_COLS[k]!, dotsH = dotPitch * (rows + (rows - 1) * (ROW_SPACE - 1));
      dotsY[k] = top + aboveH + (faceBottom - inset - top - aboveH - dotsH) / 2 + dotPitch / 2;
      if (labelSide) {
        // Label and dots centred together across the face, the label level with the middle of the dots.
        const groupW = labelW + cols * dotPitch;
        labelX[k] = stairX[k]! - groupW / 2 + labelW / 2; dotsX[k] = labelX[k]! + labelW / 2 + cols * dotPitch / 2;
        labelY[k] = dotsY[k]! + (dotsH - dotPitch) / 2;
      } else { labelX[k] = dotsX[k] = stairX[k]!; labelY[k] = top + labelH / 2; }
    }
    bakeValues();
  }
  /** Dot, grooves and labels, baked on CPU canvases once per size and pixel ratio; labels wait for the font. */
  function bakeValues(): void {
    const key = `${dotPitch}/${dotD}/${labelPx}/${artRatio}/${fontReady}`;
    if (key === bakeKey) return;
    bakeKey = key;
    dotCanvas = bakeDot(dotD, artRatio); litCanvas = bakeDot(dotD, artRatio, true);
    const gh = Math.round(dotPitch * 0.94);
    groove5 = bakeGroove(Math.round(dotPitch * 4 + gh), gh, artRatio); groove1 = bakeGroove(gh, gh, artRatio);
    for (let k = 0; k < 4; k++) labels[k] = labelPx && fontReady ? bakeLabel(LABEL_TEXT[k]!, labelPx, artRatio) : undefined;
  }
  /** Step 8's line-up on the hay: both orders laid out with even gaps, shrunk only where four coins do not fit. */
  function layoutLineup(): void {
    const gapL = coinD[DIME]! * 0.3;
    let sum = 0; for (let k = 0; k < 4; k++) sum += coinD[k]!;
    const fit = Math.min(1, (hayR - hayL - gapL * 3) / sum);
    let total = gapL * 3; for (let k = 0; k < 4; k++) { luD[k] = Math.round(coinD[k]! * fit); total += luD[k]!; }
    let x = (hayL + hayR) / 2 - total / 2;
    for (const k of SIZE_ORDER) { luX0[k] = x + luD[k]! / 2; x += luD[k]! + gapL; }
    x = (hayL + hayR) / 2 - total / 2;
    for (const k of VALUE_ORDER) { luX1[k] = x + luD[k]! / 2; x += luD[k]! + gapL; }
  }
  /** The stack of swallowed coins by a piggy's foot: coin size and how flat each coin lies. */
  const stackD = (kind: number): number => Math.round(coinD[kind]! * 0.5);
  const STACK_SY = 0.55;
  /** The value tags' smallest numerals: planned at 21 CSS px so they draw at least 20, more on screens above 1366x768. */
  const tagFloor = (): number => Math.round(TAG_MIN_INK * Math.max(1, s));
  /** Bake the value tags for every size this layout draws coins at: tray (also carried and flying), badge, stack, line-up. */
  function prepareTags(): void {
    for (let k = 0; k < 4; k++) { tags.prepare(k, coinD[k]!); tags.prepare(k, badgeD[k]!); tags.prepare(k, stackD(k)); tags.prepare(k, luD[k]!); }
  }
  function releaseArt(): void {
    for (const name of OWN_ART) sprites.clearScaled(name);
    for (const name of soundNames) sprites.clearScaled(name);
    warmDone.clear();
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    const image = sprites.get(BG); if (!image) return;
    bgCanvas = sprites.scaled(BG, Math.max(W / image.naturalWidth, H / image.naturalHeight));
    if (bgCanvas) { bgX = (W - bgCanvas.width / sprites.pixelRatio) / 2; bgY = (H - bgCanvas.height / sprites.pixelRatio) / 2; }
  }

  // ---------------------------------------------------------------- geometry helpers
  const pigScaleX = (pg: Piggy): number => 1 + 0.02 * Math.min(4, pg.coins);
  const pigScaleY = (pg: Piggy): number => 1 + 0.01 * Math.min(4, pg.coins);
  /** Just above a piggy's back slot, where a coin goes in. */
  function slotPoint(p: number): void { const pg = piggies[p]!; pos.x = pg.x; pos.y = pg.feet - (PIG_FEET - PIG_SLOT) * ph * pigScaleY(pg) - coinD[DIME]! * 0.3; }
  function snoutPoint(p: number): void { const pg = piggies[p]!; pos.x = pg.x; pos.y = pg.feet - (PIG_FEET - PIG_SNOUT) * ph; }
  /** Where a coin rests in its tray place; the highlighted coin floats a little at tier 0. */
  function restPoint(c: Coin): void {
    // A coin without a place heads back to where new coins come from: the chute's top, or off the left edge in portrait.
    if (c.slot < 0) { if (chuteW > 0) chutePoint(0); else { pos.x = -coinD[c.kind]!; pos.y = rowY; } return; }
    pos.x = slotX[c.slot]!; pos.y = rowY;
    if (c.slot === focusSlot && keyMode === 'coin' && (intro || tier === 0)) pos.y -= coinD[c.kind]! * (0.08 + Math.abs(Math.sin(time * 2.6)) * 0.04);
  }
  function chutePoint(k: number): void {
    pos.x = chuteX + lerp(CHUTE_X0, CHUTE_X1, k) * chuteW; pos.y = chuteY + lerp(CHUTE_Y0, CHUTE_Y1, k) * chuteH;
  }
  function piggyAt(x: number, y: number): number {
    for (let i = 0; i < pigCount; i++) { const z = piggies[i]!.zone; if (x >= z[0]! && x <= z[2]! && y >= z[1]! && y <= z[3]!) return i; }
    return -1;
  }
  function coinAt(x: number, y: number): number {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < trayCap; i++) {
      const ci = slotCoin[i]!; if (!resting(ci)) continue;
      const d = coinD[coins[ci]!.kind]!, dx = Math.abs(x - slotX[i]!), dy = Math.abs(y - rowY);
      if (dx <= d / 2 && dy <= d / 2 && dx < bestD) { best = ci; bestD = dx; }
    }
    return best;
  }

  // ---------------------------------------------------------------- particles
  let bx = 0, by = 0, bSpeed = 0;
  const fillStraw = (p: ParticleSpawn, index: number): void => {
    const a = -Math.PI / 2 + (index / 5 - 0.5) * 2.2 + random() * 0.4;
    p.x = bx; p.y = by; p.vx = Math.cos(a) * bSpeed * s; p.vy = Math.sin(a) * bSpeed * s;
    p.life = 0.35 + random() * 0.3; p.size = (2.5 + random() * 2.5) * s; p.endSize = 1; p.gravity = 600 * s;
    p.hue = 40 + random() * 12; p.saturation = 75; p.lightness = 62; p.alpha = 0.95;
  };
  function straw(x: number, y: number, n: number, speed = 150): void { bx = x; by = y; bSpeed = speed; particles.burst(n, fillStraw); }

  // ---------------------------------------------------------------- coins
  function freeCoin(): number { for (let i = 0; i < POOL; i++) if (coins[i]!.state === OFF) return i; return -1; }
  /** A new coin for tray place `slot`: down the chute, or (portrait, no chute) rolling in from the left edge. */
  function spawnCoin(slot: number): void {
    const ci = freeCoin(); if (ci < 0) return;
    const c = coins[ci]!;
    c.kind = roundKinds[nextCoin++]!; c.slot = slot; c.held = 0; c.t = 0; c.angle = random() * 6; c.wob = 9;
    c.misses = 0; c.pointed = false; c.assisted = false; c.tagT = -1;
    slotCoin[slot] = ci;
    if (portrait) { c.state = ROLL; c.x0 = -coinD[c.kind]!; c.y0 = rowY; c.x = c.x0; c.y = rowY; c.dur = 0.5 + (slotX[slot]! - c.x0) / (W * 1.4); }
    else { c.state = CHUTE_ROLL; c.dur = 0.55; chutePoint(0); c.x = pos.x; c.y = pos.y; play('tick', 'C', 1, 0.35); }
  }
  /** Send coin ci toward piggy p. `deliberate`: a drop the child chose (pointer, or a key after choosing with arrows). */
  function sendCoin(ci: number, p: number, deliberate: boolean, byHand: boolean): void {
    const c = coins[ci]!, now = performance.now(), match = matchOf(c.kind);
    const target = c.assisted && !byHand ? match : p;
    const right = target === match;
    if (deliberate && !byHand && !c.assisted && !c.pointed && !intro && !review && now - lastDropAt >= DROP_GAP_MS) { recordDrop(data, right); evidence++; }
    if (!byHand) lastDropAt = now;
    c.x0 = c.x; c.y0 = c.y; c.t = 0; c.piggy = target; c.right = right; c.state = FLY; c.held = 0;
    if (right) slotPoint(target); else snoutPoint(target);
    c.dur = Math.min(0.6, Math.max(0.32, Math.hypot(pos.x - c.x, pos.y - c.y) / (1400 * Math.max(0.6, s))));
    if (carry.coin === ci) { carry.coin = -1; carry.sticky = false; }
    if (!right) {
      c.misses++;
      if (c.misses >= 2 && !c.assisted) { c.assisted = true; c.pointed = true; startHand(4, ci, match); }
    }
    keyMode = 'coin'; play('whoosh', 'B', 0, 0.25);
  }
  /** Back to its tray place from wherever it is (a bump, a let-go over nothing). */
  function sendBack(ci: number, sound: boolean): void {
    const c = coins[ci]!;
    c.x0 = c.x; c.y0 = c.y; c.t = 0; c.state = BACK; c.held = 0; c.dur = 0.5;
    if (carry.coin === ci) { carry.coin = -1; carry.sticky = false; }
    if (sound) play('whoosh', 'D', 0, 0.6);
  }
  function arrive(ci: number): void {
    const c = coins[ci]!, pg = piggies[c.piggy]!;
    if (c.right) {
      c.state = SLOT; c.t = 0; c.dur = 0.3;
      if (slotCoin[c.slot] === ci) slotCoin[c.slot] = -1;
      pg.coins++; pg.happyT = 0.9; pg.wiggleT = 0; coinsDone++;
      play('pop', 'C', pg.coins - 1, 0.9);
      play('button', 'C', 0, 0.55);
      playVoice(audio, COIN_NAMES[c.kind]!);
      straw(c.x, c.y, 4, 90);
      henHop = 0;
      // On the steps the coin's value shows: its step's dots pulse row by row and its label pops (a show, not a task).
      if (stairs) startPulse(c.kind, 0.22, true);
    } else {
      pg.bumpT = 0; play('pop', 'A', 2, 0.5);
      const m = piggies[matchOf(c.kind)]!; m.wiggleT = 0; m.glowT = 1;
      sendBack(ci, true);
    }
  }

  function startPulse(kind: number, gap: number, voice: boolean): void {
    pulseT[kind] = 0; pulseGap[kind] = gap; labelPopT[kind] = 0;
    if (voice) playVoice(audio, `number-${VALUE[kind]!}`);
  }
  /** Advance the dot pulses, one soft tick as each row of five lights. */
  function updatePulses(dt: number): void {
    for (let k = 0; k < 4; k++) {
      labelPopT[k] = Math.min(9, labelPopT[k]! + dt);
      const before = pulseT[k]!; if (before >= 9) continue;
      const now = before + dt, gap = pulseGap[k]!, rows = DOT_ROWS[k]!;
      for (let r = 0; r < rows; r++) if (before <= r * gap && now > r * gap) play('tick', 'C', r, 0.4);
      pulseT[k] = now > rows * gap + 0.5 ? 9 : now;
    }
  }

  // ---------------------------------------------------------------- line-up (step 8)
  /** Where the line-up draws coin `kind` now (pos), its drawn diameter scale, rotation and squash; false while unseen. */
  const lu = { scale: 1, rot: 0, sx: 1, alpha: 1 };
  function lineupPos(kind: number): boolean {
    const t = lineup.t, d = luD[kind]!, j = SIZE_ORDER.indexOf(kind), v = VALUE_ORDER.indexOf(kind);
    lu.scale = 1; lu.rot = 0; lu.sx = 1; lu.alpha = 1;
    pos.y = rowY;
    if (t < LU_HOPS) {
      // Roll in from the left along the hay, one after another, smallest first.
      const k = clamp01((t - j * 0.12) / 0.55); if (k <= 0) return false;
      pos.x = lerp(-d, luX0[kind]!, easeOutCubic(k)); lu.rot = (pos.x - luX0[kind]!) / (d * 0.5);
      return true;
    }
    if (t < LU_MOVE) {
      // Each coin hops in turn, smallest to biggest: they stand in size order.
      pos.x = luX0[kind]!;
      const k = clamp01((t - LU_HOPS - 0.05 - j * 0.13) / 0.25); pos.y -= Math.sin(k * Math.PI) * d * 0.22;
      return true;
    }
    if (t < LU_MOVE_END) {
      // Into value order: the dime jumps over the penny and the nickel in one arc while they slide left.
      const e = easeInOutSine(clamp01((t - LU_MOVE) / (LU_MOVE_END - LU_MOVE)));
      pos.x = lerp(luX0[kind]!, luX1[kind]!, e);
      if (kind === DIME) { pos.y -= Math.sin(e * Math.PI) * Math.max(d * 1.4, 100 * s); lu.sx = Math.max(0.2, Math.abs(Math.cos(e * Math.PI * 2))); }
      else if (luX0[kind] !== luX1[kind]) pos.y -= Math.sin(e * Math.PI) * d * 0.1;
      return true;
    }
    pos.x = luX1[kind]!;
    if (t < LU_OFF) {
      // Left to right in value order each coin hops as its step's dots light.
      const k = clamp01((t - LU_PULSE - v * 0.2) / 0.3); pos.y -= Math.sin(k * Math.PI) * d * 0.2;
      return true;
    }
    // Off the tray to the right, fading.
    const k = clamp01((t - LU_OFF) / (LU_END - LU_OFF));
    pos.x = lerp(luX1[kind]!, hayR + d, k * k); lu.rot = (pos.x - luX1[kind]!) / (d * 0.5); lu.alpha = 1 - k;
    return true;
  }
  let luBefore = 0;
  /** True on the frame the line-up clock passes `mark`. */
  const at = (mark: number): boolean => luBefore < mark && lineup.t >= mark;
  function updateLineup(dt: number): void {
    luBefore = lineup.t; lineup.t += dt;
    const t = lineup.t;
    for (let j = 0; j < 4; j++) {
      if (at(j * 0.12)) play('whoosh', 'D', 0, 0.3);
      if (at(LU_HOPS + 0.05 + j * 0.13)) play('tick', 'A', j, 0.5);
      if (at(LU_PULSE + j * 0.2)) startPulse(VALUE_ORDER[j]!, 0.1, false);
    }
    if (at(LU_MOVE)) play('whoosh', 'B', 0, 0.4);
    if (at(LU_MOVE_END)) play('pop', 'C', 2, 0.6);
    if (at(LU_OFF)) play('whoosh', 'D', 0, 0.5);
    if (lineup.demo && at(1.2)) startHand(5, -1, 0);
    if (t >= LU_END) endLineup();
  }
  /** The line-up is over (played out, or skipped once it has been seen): play begins. */
  function endLineup(): void {
    if (!lineup.active) return;
    lineup.active = false; spawnT = 0.2; idleT = 0;
    if (hand.mode === 5) hand.mode = 0;
    if (!data.lineupSeen || lineup.demo) { data.lineupSeen = true; data.demos |= 4; lineup.demo = false; services.save.flush(); }
  }

  function updateCoins(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      const c = coins[i]!;
      if (c.state === OFF) continue;
      c.t += dt; c.wob += dt; if (c.tagT >= 0) c.tagT += dt;
      const d = coinD[c.kind]!;
      switch (c.state) {
        case CHUTE_ROLL: {
          const k = clamp01(c.t / c.dur), px = c.x, py = c.y;
          chutePoint(k * k); c.x = pos.x; c.y = pos.y;
          c.angle += Math.hypot(c.x - px, c.y - py) / (d * CHUTE_SCALE * 0.5);
          if (k >= 1) { c.state = FALL; c.t = 0; c.dur = 0.34; c.x0 = c.x; c.y0 = c.y; }
          break;
        }
        case FALL: {
          const k = clamp01(c.t / c.dur), ex = hayL + d * 0.55;
          c.x = lerp(c.x0, ex, k); c.y = lerp(c.y0, rowY, k * k) - Math.sin(k * Math.PI) * 30 * s;
          c.angle += dt * 9;
          if (k >= 1) {
            c.state = ROLL; c.t = 0; c.x0 = c.x; c.y0 = rowY; c.y = rowY;
            c.dur = 0.35 + Math.abs(slotX[c.slot]! - c.x) / (W * 0.9);
            play('pop', 'B', 1, 0.3); straw(c.x, c.y + d * 0.35, 5);
          }
          break;
        }
        case ROLL: {
          const k = clamp01(c.t / c.dur);
          c.x = lerp(c.x0, slotX[c.slot]!, easeOutCubic(k)); c.y = rowY;
          // Rolls like a wheel and comes to rest upright, so the face reads the right way up.
          c.angle = (c.x - slotX[c.slot]!) / (d * 0.5);
          if (k >= 1) { c.state = REST; c.wob = 0; c.tagT = 0; play('tick', 'C', 2, 0.35); }
          break;
        }
        case REST: restPoint(c); c.x = pos.x; c.y = pos.y; break;
        case HELD:
          if (c.held === BY_POINTER) { c.x = input.pointer.x; c.y = input.pointer.y; }
          else if (c.held === BY_KEY) { c.x = slotX[c.slot]!; c.y = rowY - d * 0.55 - Math.abs(Math.sin(time * 3)) * 6 * s; }
          break;
        case FLY: {
          const k = clamp01(c.t / c.dur);
          if (c.right) slotPoint(c.piggy); else snoutPoint(c.piggy);
          const arc = Math.min(160 * s, Math.hypot(pos.x - c.x0, pos.y - c.y0) * 0.35);
          c.x = lerp(c.x0, pos.x, easeInOutSine(k)); c.y = lerp(c.y0, pos.y, easeInOutSine(k)) - Math.sin(k * Math.PI) * arc;
          if (k >= 1) arrive(i);
          break;
        }
        case SLOT: {
          slotPoint(c.piggy); const k = clamp01(c.t / c.dur);
          c.x = pos.x; c.y = pos.y + k * d * 1.1;
          if (k >= 1) c.state = OFF;
          break;
        }
        case BACK: {
          const k = clamp01(c.t / c.dur); restPoint(c);
          c.x = lerp(c.x0, pos.x, easeOutCubic(k)); c.y = lerp(c.y0, pos.y, easeOutCubic(k)) - Math.sin(k * Math.PI) * 60 * s;
          c.angle *= 1 - Math.min(1, dt * 10);
          // Back up the chute: the coin waits to come down again (its kind returns to the round's queue).
          if (k >= 1 && c.slot < 0) { c.state = OFF; roundKinds[--nextCoin] = c.kind; }
          else if (k >= 1) { c.state = REST; c.wob = 0; c.angle = 0; play('tick', 'C', 2, 0.3); }
          break;
        }
        default: break;
      }
    }
  }

  // ---------------------------------------------------------------- round
  function setupPiggies(): void {
    // Colours and shelf order shuffle every round: the badge is the only cue.
    const colors = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = colors[i]!; colors[i] = colors[j]!; colors[j] = t; }
    const kinds = [...content.kinds];
    // On the steps the piggies stand in value order (penny lowest, quarter highest); elsewhere their order shuffles.
    if (!content.stairs) for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = kinds[i]!; kinds[i] = kinds[j]!; kinds[j] = t; }
    pigCount = kinds.length;
    for (let i = 0; i < MAX_PIGGIES; i++) Object.assign(piggies[i]!, { kind: kinds[i] ?? 0, color: colors[i]!, coins: 0, happyT: 0, wiggleT: 9, glowT: 0, bumpT: 9 });
  }
  function startRound(): void {
    pending = null; data.pending = null; bookGlide = false;
    tier = services.debug.tier ?? toTier(data.tier);
    intro = data.rounds === 0;
    const rs = roundStep(data);
    review = !intro && rs.review; playStep = intro ? 1 : rs.step;
    content = intro ? INTRO : stepContent(playStep);
    phase = 'play'; phaseT = time = idleT = 0; endT = -1;
    coinsTotal = intro ? INTRO_COINS : TIERS[tier].coins; nextCoin = 0; coinsDone = 0; spawnT = 0.5;
    hits = misses = evidence = 0; stars = 1; starsPlayed = 0; lastDropAt = -1e9;
    keyMode = 'coin'; focusSlot = 0; focusPiggy = 0; lastPiggy = 0; arrowed = false; introShown = false;
    carry.coin = -1; carry.sticky = false; hand.mode = 0;
    particles.clear(); for (const c of coins) c.state = OFF; slotCoin.fill(-1);
    pulseT.fill(9); labelPopT.fill(9);
    // A value step's first round for this profile opens with its demonstration: the hand carries a coin at steps 6
    // and 7; at step 8 the line-up is the demonstration, the hand following the dime as it jumps.
    const bit = !intro && !review && playStep >= 6 ? 1 << (playStep - 6) : 0;
    demoBit = bit && !(data.demos & bit) && !content.lineup ? bit : 0;
    lineup.active = content.lineup; lineup.t = 0; lineup.skippable = data.lineupSeen; lineup.demo = content.lineup && !(data.demos & 4);
    setupPiggies();
    roundCoins(content.kinds, coinsTotal, random, roundKinds);
    trayWant = intro ? 2 : TIERS[tier].tray;
    layout(W, H);
    guard(PLAY_GUARD_MS); cornerFocus = -1; services.save.flush();
    // The round-end fanfare's first (long) render step runs here, while the screen is still; the rest in idle periods.
    if (!fanfareStarted && audio.context) { fanfareStarted = true; if (prepareSfxStep(audio, 'fanfare', FANFARE)) fanfareAsked = true; }
  }
  /** Every sprite size the round's end draws that play may not have drawn yet, made ahead in idle periods. */
  function planWarm(): void {
    warmNames.length = 0; warmSizes.length = 0; warmIndex = 0;
    const add = (name: string, size: number): void => { warmNames.push(name); warmSizes.push(Math.round(size)); };
    for (let i = 0; i < pigCount; i++) add(piggyName(piggies[i]!.color, true), ph);
    for (let c = 0; c < 4; c++) add(piggyName(c, false), restSize * 0.62);
    add(BUTTON_PLAY, controlsRadius * 1.3); add(BUTTON_HOME, controlsRadius * 1.3);
  }
  /**
   * Idle periods with at least 4 ms left: the fanfare render a note at a time, then one planned sprite canvas each.
   * A callback that timed out, or a wait of IDLE_WAIT_MS over many short idle periods, runs one step anyway, so a busy
   * machine still finishes the preparation before the round's end needs it.
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
    if (madeName || (!overdue && deadline.timeRemaining() < 4)) return;
    for (; warmIndex < warmNames.length; warmIndex++) {
      const name = warmNames[warmIndex]!, size = warmSizes[warmIndex]!, key = `${name}@${size}`;
      if (warmDone.has(key)) continue;
      const img = sprites.get(name); if (!img) continue;
      sprites.scaled(name, size / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
      madeName = name; madeSize = size; warmIndex++; idleWaitFrom = -1;
      return;
    }
  }
  function warm(ctx: CanvasRenderingContext2D): void {
    if (madeName) { drawSprite(ctx, sprites, madeName, W / 2, H / 2, madeSize); warmDone.add(`${madeName}@${madeSize}`); madeName = ''; }
  }
  function askIdle(): void {
    if (idleHandle) return;
    if ((fanfareStarted && !fanfareAsked) || (playable() && time >= 0.5 && warmIndex < warmNames.length)) {
      const now = performance.now();
      if (idleWaitFrom < 0) idleWaitFrom = now;
      // The callback's own timeout is what is left of the wait, so it fires by IDLE_WAIT_MS after the wait began.
      IDLE_OPTIONS.timeout = Math.max(1, IDLE_WAIT_MS - (now - idleWaitFrom));
      idleHandle = requestIdleCallback(prepareIdle, IDLE_OPTIONS);
    }
  }
  const prepared = (): boolean => (!fanfareStarted || fanfareAsked) && warmIndex >= warmNames.length && !madeName;
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; idleWaitFrom = -1; }

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
    if (!intro && services.debug.tier === undefined) applyMotor(data, tier, hits, misses, coinsTotal);
    if (!intro && !review) applyLearning(data);
    else if (review) data.stepRounds++;
    data.rounds++;
    // A unique id keeps this round apart from another tab's round with the same fields when the save store merges them.
    const id = globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const colors: number[] = [];
    for (let i = 0; i < pigCount; i++) colors.push(piggies[i]!.color);
    pending = { id, stars, coins: coinsTotal, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, tier, colors };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += stars;
    // Round, stars and the unresolved gift share one immediate write; re-entry never awards again.
    services.save.flush();
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; carry.coin = -1; hand.mode = 0; cornerFocus = -1;
    particles.clear();
    play('fanfare', FANFARE.variant!);
    confettiBurst(particles, W / 2, H * 0.22, 50, 360 * u);
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
    // The chosen id and the owned sticker save together, so repeated input and reload are idempotent.
    services.save.flush(); phase = 'sticker'; phaseT = 0; guard(PLAY_GUARD_MS); play('sticker', 'C');
    offers.pick(index); bookGlide = true;
  }
  /** A finished round is done once its rest screen is left by any route (Again, Home, the corner, the break nudge). */
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

  /** Keep the highlight on a resting coin: the nearest one to its place when its own coin has left. */
  function ensureFocus(): void {
    if (resting(slotCoin[focusSlot] ?? -1)) return;
    for (let k = 1; k < trayCap * 2; k++) {
      const i = focusSlot + (k % 2 ? -(k + 1) / 2 : k / 2);
      if (i >= 0 && i < trayCap && resting(slotCoin[i]!)) { focusSlot = i; return; }
    }
  }
  function moveCoinFocus(step: number): void {
    for (let k = 1; k <= trayCap; k++) {
      const i = (focusSlot + step * k + trayCap * 3) % trayCap;
      if (resting(slotCoin[i]!)) { focusSlot = i; return; }
    }
  }

  // ---------------------------------------------------------------- hand
  function startHand(mode: number, ci: number, p: number): void {
    hand.mode = mode; hand.t = 0; hand.coin = ci; hand.piggy = p; hand.released = false;
    hand.slot = ci >= 0 ? coins[ci]!.slot : 0; hand.kind = ci >= 0 ? coins[ci]!.kind : 0;
    hand.x0 = W * 0.5; hand.y0 = H + 60;
  }
  /** Hint at tier 0 (outside the introduction): the hand presses the piggy and the hint coin flies there by itself. */
  const pressHint = (): boolean => hand.mode === 2 && tier === 0 && !intro;
  /** Fingertip position for the current hand mode. */
  function handTip(): void {
    const t = hand.t;
    if (hand.mode === 5) {
      // Step 8's first line-up: the hand comes in from the left above the coins, points down at the dime's top and
      // rides along above it as it jumps, so it never covers the coins sliding underneath.
      const d = luD[DIME]!;
      if (!lineupPos(DIME)) { pos.x = luX0[DIME]!; pos.y = rowY; }
      const tx = pos.x, ty = pos.y - d * 0.7, e = easeOutCubic(clamp01(t / 0.45));
      pos.x = lerp(-handH, tx, e); pos.y = lerp(ty - handH, ty, e);
      return;
    }
    pos.x = slotX[hand.slot]!; pos.y = rowY;
    const cx = pos.x, cy = pos.y;
    slotPoint(hand.piggy); const px = pos.x, py = pos.y + coinD[DIME]! * 0.3;
    if (hand.mode === 3) { pos.x = cx; pos.y = cy - Math.abs(Math.sin(t * 3.4)) * 26 * s; return; }
    let tx = cx, ty = cy, k = 1;
    if (hand.mode === 4) {
      snoutPoint(hand.piggy); tx = pos.x; ty = pos.y + ph * 0.25;
      if (t >= 0.7) { pos.x = tx; pos.y = ty - Math.abs(Math.sin((t - 0.7) * 6)) * 14 * s; return; }
      k = t / 0.7;
    } else if (pressHint()) {
      tx = px; ty = py + ph * 0.3;
      if (t >= 0.8) { pos.x = tx; pos.y = ty; return; }
      k = t / 0.8;
    } else if (t >= 0.8) {
      if (t < 1.1) { pos.x = cx; pos.y = cy; return; }
      if (t < 2.2) { const e = easeInOutSine((t - 1.1) / 1.1); pos.x = lerp(cx, px, e); pos.y = lerp(cy, py, e) - Math.sin(e * Math.PI) * 90 * s; return; }
      pos.x = px; pos.y = py; return;
    } else k = t / 0.8;
    const e = easeOutCubic(k); pos.x = lerp(hand.x0, tx, e); pos.y = lerp(hand.y0, ty, e);
  }
  /** Where the hint coin is drawn for an idle hint; false when it is not shown. */
  function ghostPoint(): boolean {
    const t = hand.t;
    if (hand.mode !== 2) return false;
    if (pressHint()) {
      if (t < 0.9 || t >= 1.9) return false;
      const k = easeInOutSine(clamp01((t - 0.9) / 0.6));
      pos.x = slotX[hand.slot]!; pos.y = rowY; const cx = pos.x, cy = pos.y;
      slotPoint(hand.piggy); pos.x = lerp(cx, pos.x, k); pos.y = lerp(cy, pos.y, k) - Math.sin(k * Math.PI) * 100 * s;
      return true;
    }
    if (t < 1.1 || t >= 2.4) return false;
    handTip(); return true;
  }
  function updateHand(dt: number): void {
    if (!hand.mode) return;
    hand.t += dt;
    const t = hand.t;
    if (hand.mode === 1) {
      const c = coins[hand.coin]!;
      if (!hand.released && t >= 0.95 && c.state === REST) { c.state = HELD; c.held = BY_HAND; play('pop', 'B', 2, 0.5); }
      if (c.state === HELD && c.held === BY_HAND) { handTip(); c.x = pos.x - coinD[c.kind]! * 0.1; c.y = pos.y - coinD[c.kind]! * 0.25; }
      if (t >= 1.6 && t < 2.6) piggies[hand.piggy]!.glowT = Math.max(piggies[hand.piggy]!.glowT, 0.3);
      if (!hand.released && t >= 2.2) { hand.released = true; if (c.state === HELD) sendCoin(hand.coin, hand.piggy, false, true); }
      if (t >= 2.9) {
        hand.mode = 3; hand.t = 0; idleT = 0;
        if (demoBit) { data.demos |= demoBit; demoBit = 0; services.save.flush(); }
      }
    } else if (hand.mode === 2) {
      if (t >= 0.8 && t < 2.2) piggies[hand.piggy]!.glowT = Math.max(piggies[hand.piggy]!.glowT, 0.3);
      if (t >= 2.9 || !resting(slotCoin[hand.slot]!)) hand.mode = 0;
    } else if (hand.mode === 3) {
      ensureFocus(); hand.slot = focusSlot;
      if (!resting(slotCoin[hand.slot]!)) hand.mode = 0;
    } else if (hand.mode === 4 && t >= 2.6) hand.mode = 0;
    else if (hand.mode === 5 && t >= 2.0) hand.mode = 0;
  }

  // ---------------------------------------------------------------- update
  function updatePlay(dt: number): void {
    time += dt; idleT += dt; henHop += dt;
    for (let i = 0; i < pigCount; i++) {
      const pg = piggies[i]!;
      pg.happyT -= dt; pg.wiggleT += dt; pg.glowT -= dt; pg.bumpT += dt;
    }
    if (stairs) updatePulses(dt);
    // Step 8 opens with the line-up; the round's coins wait until it ends.
    if (lineup.active) { idleT = 0; updateLineup(dt); updateHand(dt); return; }
    // A free tray place gets the next coin down the chute, one at a time.
    spawnT -= dt;
    if (spawnT <= 0 && nextCoin < coinsTotal) {
      for (let i = 0; i < trayCap; i++) if (slotCoin[i]! < 0) { spawnCoin(i); spawnT = SPAWN_GAP; break; }
    }
    updateHand(dt);
    ensureFocus();
    const fc = slotCoin[focusSlot]!;
    // The introduction: once the first coin rests, the hand carries the highlighted coin to its piggy.
    // A value step's first round for this profile opens the same way (its demonstration).
    if ((intro || demoBit) && !introShown && !hand.mode && resting(fc)) { introShown = true; startHand(1, fc, matchOf(coins[fc]!.kind)); }
    // Idle: the hand shows the highlighted coin's piggy with a see-through coin; it never moves a real coin.
    if (!hand.mode && heldCoin() < 0 && keyMode === 'coin' && idleT >= IDLE_SECONDS && resting(fc)) {
      coins[fc]!.pointed = true;
      startHand(2, fc, matchOf(coins[fc]!.kind)); idleT = IDLE_SECONDS - IDLE_REPEAT;
    }
    if (coinsDone >= coinsTotal) {
      if (endT < 0) endT = 0; else endT += dt;
      if (endT >= 0.7) finishRound();
    }
  }
  function updateResult(dt: number): void {
    phaseT += dt; time += dt;
    // A pulse still running when the last coin went in finishes during the celebration.
    if (stairs && phase === 'celebration') updatePulses(dt);
    if (phase === 'celebration') {
      const shown = Math.min(stars, Math.max(0, Math.floor((phaseT - STAR_START - STAR_HIT_SECONDS) / STAR_GAP_SECONDS) + 1));
      if (shown > starsPlayed) { play('star', 'B', starsPlayed); starsPlayed = shown; }
      // Each piggy dances in turn with a clink.
      for (let i = 0; i < pigCount; i++) {
        const at = 0.3 + i * 0.35;
        if (phaseT - dt < at && phaseT >= at) { play('pop', 'C', 3 + i * 2, 0.6); const pg = piggies[i]!; straw(pg.x, pg.feet - ph * 0.5, 6, 200); }
      }
      if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
    } else if (phase === 'sticker' && phaseT >= PICK_SECONDS) enterRest();
    if (phase === 'celebration' || phase === 'choice' || phase === 'sticker') warmOffers();
    offers.update(dt, phase === 'choice' ? menuSelected : -1);
  }

  // ---------------------------------------------------------------- render
  /** The coin's drawn size and squash this frame, into look. */
  const look = { size: 0, sx: 1, sy: 1, rot: 0 };
  /** Whether coin c is still coming in (down the chute, falling, rolling to its place): drawn without a tag. */
  const entering = (c: Coin): boolean => c.state === CHUTE_ROLL || c.state === FALL || c.state === ROLL;
  function coinLook(c: Coin): void {
    const d = coinD[c.kind]!;
    let size = d, sx = 1, sy = 1, rot = c.angle;
    switch (c.state) {
      case CHUTE_ROLL: sx = sy = CHUTE_SCALE; break;
      case FALL: sx = sy = lerp(CHUTE_SCALE, 1, clamp01(c.t / c.dur)); break;
      case REST: case BACK: {
        if (c.state === REST && c.wob < 0.6) { const w = Math.sin(c.wob * 26) * (1 - c.wob / 0.6); rot += w * 0.12; sy = 1 - Math.abs(w) * 0.08; }
        break;
      }
      case HELD: size = Math.round(d * CARRY_SCALE); break;
      case FLY: {
        size = Math.round(d * CARRY_SCALE);
        const k = clamp01(c.t / c.dur);
        // Spins in the air (a horizontal squash) and arrives edge-on for the slot, or face-on for a snout bump.
        sx = c.right ? Math.max(0.14, Math.abs(Math.cos(k * Math.PI * 2.5))) : Math.max(0.2, Math.abs(Math.cos(k * Math.PI * 2)));
        if (c.right) rot = 0;
        break;
      }
      case SLOT: size = Math.round(d * CARRY_SCALE); sx = 0.14; rot = 0; break;
      default: break;
    }
    look.size = size; look.sx = sx; look.sy = sy; look.rot = rot;
  }
  /** Coin c's front; with `tag`, its value tag too (tray coins draw their tags in a later pass, over every coin). */
  function drawCoin(ctx: CanvasRenderingContext2D, c: Coin, tag = true): void {
    const d = coinD[c.kind]!;
    if ((c.state === REST || c.state === BACK) && c.slot >= 0) groundShadow(ctx, c.state === REST ? c.x : slotX[c.slot]!, rowY + d * 0.42, d * 0.42, d * 0.1, c.state === REST ? 0.2 : 0.2 * clamp01(c.t / c.dur));
    coinLook(c);
    drawSprite(ctx, sprites, coinName(c.kind), c.x, c.y, look.size, look.rot, look.sx, look.sy);
    if (tag) drawTag(ctx, c);
  }
  /**
   * Coin c's value tag, part of the coin: it moves, lifts, squashes and flies with it, upright while the coin turns. None
   * while the coin comes in; it fades in as the coin comes to rest.
   */
  function drawTag(ctx: CanvasRenderingContext2D, c: Coin): void {
    if (entering(c)) return;
    const d = coinD[c.kind]!, fade = c.state === REST && c.tagT >= 0 && c.tagT < TAG_FADE ? c.tagT / TAG_FADE : 1;
    if (fade <= 0) return;
    coinLook(c);
    const k = look.size / d;
    if (fade < 1) ctx.globalAlpha = fade;
    tags.draw(ctx, c.kind, d, c.x, c.y, look.sx * k, look.sy * k);
    if (fade < 1) ctx.globalAlpha = 1;
  }
  /**
   * mode 0 play, 1 celebration dance (piggy `index` in turn), 2 still rest. `part`: 0 the whole piggy, 1 its body only,
   * 2 its belly badge only (drawn after the coin stacks, so a stack never covers a badge).
   */
  function drawPiggy(ctx: CanvasRenderingContext2D, pg: Piggy, x: number, feet: number, h: number, mode: number, index: number, part = 0): void {
    let rot = 0, sx = mode === 2 ? 1 : pigScaleX(pg), sy = mode === 2 ? 1 : pigScaleY(pg), lift = 0, happy = false;
    if (mode !== 2) {
      const breathe = Math.sin(time * 2 + pg.color * 1.3) * 0.012; sx += breathe; sy -= breathe;
      if (pg.happyT > 0) happy = true;
      if (pg.wiggleT < 0.5) rot = Math.sin(pg.wiggleT * 30) * (1 - pg.wiggleT / 0.5) * 0.105;
      if (pg.bumpT < 0.3) { const b = Math.sin(pg.bumpT / 0.3 * Math.PI); sx += b * 0.05; sy -= b * 0.05; }
      // Mouse hover: a slight swell from the feet.
      if (mode === 0 && index < MAX_PIGGIES) { const hv = pigHover[index]! * 0.06; sx += hv; sy += hv; }
    }
    if (mode === 1) {
      happy = true;
      const at = phaseT - 0.3 - index * 0.35;
      if (at >= 0 && at < 0.55) { const k = at / 0.55; lift = Math.sin(k * Math.PI) * h * 0.2; rot = Math.sin(k * Math.PI * 2) * 0.1; }
      else if (at >= 0.55) { const k = (phaseT * 1.6 + pg.color * 0.25) % 1; lift = Math.sin(k * Math.PI) * h * 0.06; rot = Math.sin(phaseT * 4 + pg.color) * 0.06; }
    }
    ctx.save();
    // Wiggle, dance and plumpness all pivot on the feet.
    ctx.translate(x, feet - lift); ctx.rotate(rot); ctx.scale(sx, sy);
    if (part !== 2) drawSprite(ctx, sprites, piggyName(pg.color, happy), 0, (1 - PIG_FEET - 0.5) * h, Math.round(h));
    if (mode !== 2 && part !== 1) {
      const yb = -(PIG_FEET - PIG_BADGE) * h, bd = badgeD[pg.kind]!;
      if (pg.glowT > 0) {
        ctx.globalAlpha = Math.min(1, pg.glowT * 2) * (0.75 + Math.sin(time * 9) * 0.25);
        chunkyCircle(ctx, 0, yb, bd * 0.62, HIGHLIGHT, GOLD, 4); ctx.globalAlpha = 1;
      }
      drawSprite(ctx, sprites, coinName(pg.kind), 0, yb, bd);
      // The badge says what the piggy holds: the coin's front and its value tag.
      tags.draw(ctx, pg.kind, bd, 0, yb, 1, 1);
    }
    ctx.restore();
  }
  /** The coins a piggy has swallowed this round, as a small stack by its foot: it fills up visibly. */
  function drawStack(ctx: CanvasRenderingContext2D, pg: Piggy): void {
    const n = Math.min(6, pg.coins); if (!n) return;
    // On portrait steps the blocks are no wider than the piggies, so the stack stands closer in, at the front foot.
    const d = stackD(pg.kind), x = Math.min(W - d * 0.6, pg.x + pw * (stairs && portrait ? 0.3 : 0.44)), base = pg.feet - d * 0.25;
    for (let k = 0; k < n; k++) drawSprite(ctx, sprites, coinName(pg.kind), x + (k % 2 ? 0.05 : -0.05) * d, base - k * d * 0.22, d, 0, 1, STACK_SY);
    // One tag for the pile, on its top coin, upright at that coin's lower edge (the coins below are hidden under it).
    const top = n - 1;
    tags.draw(ctx, pg.kind, d, x + (top % 2 ? 0.05 : -0.05) * d, stackTagY(base - top * d * 0.22, d), 1, 1);
  }
  /**
   * Where a flat-lying stack coin centred at `y` puts its upright tag's coin centre: the tag meets its lower edge and
   * overlaps it only STACK_SY of the usual depth, so the flattened coin's face stays clear above the tag.
   */
  const stackTagY = (y: number, d: number): number => y - d * (1 - STACK_SY) / 2 + tags.over(d) * (1 - STACK_SY);
  /** Each step's value on its front face: the label (steps 7 and 8) and the dots in rows of five, each row in a groove. */
  function drawValues(ctx: CanvasRenderingContext2D): void {
    if (!dotCanvas || !litCanvas || !groove5 || !groove1) return;
    const dd = dotD + 2 * Math.max(2, dotD * 0.12), gh = dotPitch * 0.94;
    for (let k = 0; k < 4; k++) {
      const cx = dotsX[k]!, rows = DOT_ROWS[k]!, cols = DOT_COLS[k]!, pt = pulseT[k]!, gap = pulseGap[k]!;
      const lab = labels[k];
      if (lab && labelPx) {
        // The label pops by hopping up, always drawn at its baked size so it stays sharp.
        const hop = labelPopT[k]! < 0.35 ? lab.h * 0.3 * Math.sin(labelPopT[k]! / 0.35 * Math.PI) : 0;
        ctx.drawImage(lab.canvas, labelX[k]! - lab.w / 2, labelY[k]! - lab.h / 2 - hop, lab.w, lab.h);
      }
      for (let r = 0; r < rows; r++) {
        const y = dotsY[k]! + r * dotPitch * ROW_SPACE, gw = cols === 1 ? gh : dotPitch * 4 + gh;
        ctx.drawImage(cols === 1 ? groove1 : groove5, cx - gw / 2, y - gh / 2, gw, gh);
        for (let c = 0; c < cols; c++) {
          const x = cx + (c - (cols - 1) / 2) * dotPitch;
          // A pulse lights the rows in turn, each row's dots left to right: the dot glows gold and a thin gold ring
          // spreads from it. Dots are always drawn at their baked size; the ring is drawn in code, so both stay sharp.
          const k2 = pt < 9 ? clamp01((pt - r * gap - c * 0.04) / 0.28) : 0;
          ctx.drawImage(dotCanvas, x - dd / 2, y - dd / 2, dd, dd);
          if (k2 > 0 && k2 < 1) {
            ctx.globalAlpha = Math.sin(k2 * Math.PI); ctx.drawImage(litCanvas, x - dd / 2, y - dd / 2, dd, dd);
            ctx.globalAlpha = 1 - k2; ctx.beginPath(); ctx.arc(x, y, dd * (0.5 + 0.3 * k2), 0, Math.PI * 2);
            ctx.lineWidth = Math.max(2, dd * 0.12); ctx.strokeStyle = GOLD; ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
      }
    }
  }
  function drawShelves(ctx: CanvasRenderingContext2D): void {
    const size = Math.round(shelfW), half = shelfW * SHELF_ASPECT / 2, lift = SHELF_PLANK * shelfW * SHELF_ASPECT;
    drawSprite(ctx, sprites, SHELF, shelfX, plank0 - lift + half, size);
    if (portrait && pigCount > 2) drawSprite(ctx, sprites, SHELF, shelfX, plank1 - lift + half, size);
  }
  function drawScenery(ctx: CanvasRenderingContext2D, celebrating: boolean): void {
    if (henH > 0) {
      const hop = henHop < 0.4 ? Math.sin(henHop / 0.4 * Math.PI) * 14 * s : 0, bob = Math.sin(time * 1.7) * 0.02;
      drawSprite(ctx, sprites, HEN, W * 0.96, H * 0.62 - hop - henH * (1 + bob) / 2, Math.round(henH), 0, 1, 1 + bob);
    }
    if (stairs) { drawSprite(ctx, sprites, STEPS_ART, stX, stTop + stH / 2, Math.round(stW), 0, 1, stSy); drawValues(ctx); }
    else drawShelves(ctx);
    // Coins going into a slot draw behind their piggy, so the body hides them as they drop in.
    for (let i = 0; i < POOL; i++) { const c = coins[i]!; if (c.state === SLOT) drawCoin(ctx, c); }
    for (let i = 0; i < pigCount; i++) { const pg = piggies[i]!; drawPiggy(ctx, pg, pg.x, pg.feet, ph, celebrating ? 1 : 0, i, 1); }
    for (let i = 0; i < pigCount; i++) drawStack(ctx, piggies[i]!);
    for (let i = 0; i < pigCount; i++) { const pg = piggies[i]!; drawPiggy(ctx, pg, pg.x, pg.feet, ph, celebrating ? 1 : 0, i, 2); }
    if (chuteW > 0) drawSprite(ctx, sprites, CHUTE, chuteX + chuteW / 2, chuteY + chuteH / 2, Math.round(Math.max(chuteW, chuteH)));
    drawSprite(ctx, sprites, TRAY, trayX + trayW / 2, trayTop + trayW * TRAY_ASPECT / 2, Math.round(trayW));
  }
  function drawChick(ctx: CanvasRenderingContext2D): void {
    if (chickH > 0) drawSprite(ctx, sprites, CHICK, W * 0.94, H * 0.97 - chickH / 2 + Math.sin(time * 2.3) * 2 * s, Math.round(chickH));
  }
  function arrow(ctx: CanvasRenderingContext2D, x: number, top: number): void {
    const bob = Math.abs(Math.sin(time * 3)) * 8 * s, a = 16 * Math.max(0.7, s);
    ctx.beginPath(); ctx.moveTo(x - a, top - a * 1.4 - bob); ctx.lineTo(x + a, top - a * 1.4 - bob); ctx.lineTo(x, top - bob); ctx.closePath();
    ctx.fillStyle = HIGHLIGHT; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  function ring(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.lineWidth = 9; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
  }
  function renderPlay(ctx: CanvasRenderingContext2D): void {
    drawScenery(ctx, false);
    // Coins coming in pass behind the resting ones; every tray coin's tag is drawn after all the coins, so no coin or
    // passing tag ever covers a resting coin's tag or face.
    for (let i = 0; i < POOL; i++) { const c = coins[i]!; if (entering(c)) drawCoin(ctx, c, false); }
    for (let i = 0; i < POOL; i++) { const c = coins[i]!; if (c.state === REST || c.state === BACK) drawCoin(ctx, c, false); }
    if (lineup.active) drawLineup(ctx);
    drawChick(ctx);
    // The highlighted coin (keyboard default; a press on a piggy sends it) and, while a coin is held, its piggy.
    const fc = slotCoin[focusSlot]!;
    if (keyMode === 'coin' && resting(fc) && hand.mode !== 1) {
      const c = coins[fc]!, d = coinD[c.kind]!;
      ring(ctx, c.x, c.y, d * 0.56, d * 0.56); arrow(ctx, c.x, c.y - d * 0.62);
    }
    for (let i = 0; i < POOL; i++) { const c = coins[i]!; if (c.state === REST || c.state === BACK) drawTag(ctx, c); }
    const held = heldCoin();
    if (held >= 0) {
      const c = coins[held]!, p = keyMode === 'piggy' ? focusPiggy : piggyAt(c.x, c.y);
      if (p >= 0) { const pg = piggies[p]!; ring(ctx, pg.x, pg.feet, pw * 0.5, pw * 0.13); if (keyMode === 'piggy') arrow(ctx, pg.x, pg.feet - ph - 8 * s); }
    }
    for (let i = 0; i < POOL; i++) { const c = coins[i]!; if (c.state === FLY) drawCoin(ctx, c); }
    for (let i = 0; i < POOL; i++) { const c = coins[i]!; if (c.state === HELD) drawCoin(ctx, c); }
    particles.render(ctx);
    renderHand(ctx);
  }
  /** Step 8's line-up coins on the hay, each with its value tag, which rolls, hops and jumps with it. */
  function drawLineup(ctx: CanvasRenderingContext2D): void {
    for (let j = 0; j < 4; j++) {
      const kind = SIZE_ORDER[j]!;
      if (!lineupPos(kind)) continue;
      const d = luD[kind]!, x = pos.x, y = pos.y;
      ctx.globalAlpha = lu.alpha;
      groundShadow(ctx, x, rowY + d * 0.42, d * 0.42, d * 0.1, 0.2 * lu.alpha);
      drawSprite(ctx, sprites, coinName(kind), x, y, d, lu.rot, lu.sx, 1);
      tags.draw(ctx, kind, d, x, y, lu.sx, 1);
      ctx.globalAlpha = 1;
    }
  }
  function renderHand(ctx: CanvasRenderingContext2D): void {
    handBox[2] = 0;
    if (!hand.mode) return;
    const img = sprites.get(HAND); if (!img) return;
    if (ghostPoint() && glowCanvas) {
      const gx = pos.x, gy = pos.y, g = glowSize;
      ctx.globalAlpha = 0.85 + Math.sin(time * 7) * 0.15; ctx.drawImage(glowCanvas, gx - g / 2, gy - g / 2, g, g);
      ctx.globalAlpha = 0.6; drawSprite(ctx, sprites, coinName(hand.kind), gx, gy, Math.round(coinD[hand.kind]! * CARRY_SCALE));
      tags.draw(ctx, hand.kind, coinD[hand.kind]!, gx, gy, CARRY_SCALE, CARRY_SCALE);
      ctx.globalAlpha = 1;
    }
    handTip();
    const t = hand.t, hw = handH * img.naturalWidth / img.naturalHeight;
    let alpha = hand.mode === 2 ? 0.85 : 1;
    const end = hand.mode === 1 || hand.mode === 2 ? 2.3 : hand.mode === 4 ? 2.1 : hand.mode === 5 ? 1.5 : 99;
    if (t > end) alpha *= 1 - clamp01((t - end) / 0.5);
    let press = 1;
    if (hand.mode === 3) press = Math.abs(Math.sin(t * 3.4)) < 0.15 ? 0.9 : 1;
    else if (hand.mode !== 4 && hand.mode !== 5 && t >= 0.8 && t < 1.1) press = 0.88;
    else if (hand.mode === 2 && tier === 2 && t >= 1.1 && t < 2.2) press = 0.9;
    else if (hand.mode === 2 && tier === 1 && t >= 2.1 && t < 2.3) press = 0.88;
    ctx.globalAlpha = alpha;
    // The art points up and left: put its fingertip on the target. In step 8 it is turned to point straight down.
    const ox = hw * 0.44, oy = handH * 0.42;
    if (hand.mode === 5) {
      const cx = pos.x + ox * HAND_COS - oy * HAND_SIN, cy = pos.y + ox * HAND_SIN + oy * HAND_COS, half = (hw + handH) * Math.SQRT1_2 * press / 2;
      drawSprite(ctx, sprites, HAND, cx, cy, handH, HAND_DOWN, press, press);
      handBox[0] = cx - half; handBox[1] = cy - half; handBox[2] = half * 2; handBox[3] = half * 2;
    } else {
      drawSprite(ctx, sprites, HAND, pos.x + ox, pos.y + oy, handH, 0, press, press);
      handBox[0] = pos.x + ox - hw * press / 2; handBox[1] = pos.y + oy - handH * press / 2; handBox[2] = hw * press; handBox[3] = handH * press;
    }
    ctx.globalAlpha = 1;
  }
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  const controlX = (i: number, choice: boolean): number => {
    const n = choice ? pending?.choices.length ?? 0 : 2;
    return W / 2 + (i - (n - 1) / 2) * (choice ? choiceSize + Math.max(24, choiceSize * 0.18) : controlsRadius * 3.2);
  };
  /** Offer `index` as a sticker; `sticker` false draws nothing but the focus ring. */
  function gift(ctx: CanvasRenderingContext2D, index: number, id: string, x: number, y: number, size: number, focused: boolean, alpha = 1, sticker = true): void {
    if (focused) {
      ctx.beginPath(); ctx.arc(x, y, size * 0.5 + 8, 0, Math.PI * 2);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
    }
    if (sticker) offers.drawOffer(ctx, index, stickerNames.get(id) ?? '', x, y, Math.round(size * 0.82), 1, alpha);
  }
  function placeChoiceBook(): void {
    const n = pending?.choices.length ?? 1;
    placeBook(bookAt, W, H, controlX(n - 1, true) + choiceSize / 2, choiceY, choiceY + choiceSize / 2, bookH, cornerY + cornerRadius + 10);
  }
  /** Bakes the offers' sticker look and both book sizes in idle periods before they first show. */
  function warmOffers(): void {
    if (!pending?.choices.length || !pending.rewardEnabled) return;
    for (const id of pending.choices) offers.warm(stickerNames.get(id) ?? '', Math.round(choiceSize * 0.82));
    offers.warmBook(bookH); offers.warmBook(restSize);
  }
  function renderResult(ctx: CanvasRenderingContext2D): void {
    if (phase === 'celebration') {
      drawScenery(ctx, true); drawChick(ctx);
      particles.render(ctx);
      drawStarRow(ctx, W / 2, starY, starR, stars, phaseT - STAR_START, time);
      return;
    }
    drawStarRow(ctx, W / 2, starY, starR, stars, 99, phase === 'rest' ? 0 : time);
    if (phase === 'choice' && pending) {
      placeChoiceBook(); offers.drawBook(ctx, bookAt[0]!, bookAt[1]!, bookH, '', -1);
      for (let i = 0; i < pending.choices.length; i++) gift(ctx, i, pending.choices[i]!, controlX(i, true), choiceY, choiceSize, menuSelected === i);
      return;
    }
    if (pending?.chosen) {
      const index = Math.max(0, pending.choices.indexOf(pending.chosen)), name = stickerNames.get(pending.chosen) ?? '';
      placeChoiceBook();
      if (phase === 'sticker') {
        // The chosen sticker flies into the book, which bounces as it lands; the other offer drops and fades.
        const a = leaveAlpha(phaseT), drop = leaveDrop(phaseT) * choiceSize;
        if (a > 0) for (let i = 0; i < pending.choices.length; i++) gift(ctx, i, pending.choices[i]!, controlX(i, true), choiceY + drop, choiceSize, false, a, i !== index);
        offers.drawBook(ctx, bookAt[0]!, bookAt[1]!, bookH, name, phaseT - PICK_LIFT - PICK_FLY);
        offers.drawFlight(ctx, phaseT, name, controlX(index, true), choiceY, Math.round(choiceSize * 0.82), bookAt[0]!, bookAt[1]!, bookH);
      } else {
        const k = bookGlide ? easeOutCubic(clamp01(phaseT / BOOK_GLIDE)) : 1;
        offers.drawBook(ctx, lerp(bookAt[0]!, W / 2, k), lerp(bookAt[1]!, restY, k), lerp(bookH, restSize, k), name, 9, restSize);
      }
    } else if (pending) {
      // Rewards off or the set complete: the round's piggies, content and still, never a made-up collectible.
      const n = pending.colors.length, h = restSize * 0.62, gap = Math.min(h * 1.05, (W - 40) / Math.max(1, n));
      // They stand on a short shelf, as in play.
      const sw = Math.min(SHELF_PX, W - 40, gap * n + h * 0.4);
      drawSprite(ctx, sprites, SHELF, W / 2, restY + h / 2 - SHELF_PLANK * sw * SHELF_ASPECT + sw * SHELF_ASPECT / 2, Math.round(sw));
      for (let i = 0; i < n; i++) { restPig.color = pending.colors[i]!; drawPiggy(ctx, restPig, W / 2 + (i - (n - 1) / 2) * gap, restY + h / 2, h, 2, i); }
    }
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i, false); chunkyCircle(ctx, x, controlsY, controlsRadius, '#f7c26b', OUTLINE, 5 * u);
      drawSprite(ctx, sprites, i === 0 ? BUTTON_PLAY : BUTTON_HOME, x, controlsY, Math.round(controlsRadius * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsRadius);
    }
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    // Mouse hover: a slight swell and a soft cream ring; the icon keeps its baked size and scales by transform.
    const hs = 1 + homeHover * 0.08, hr = cornerRadius * hs;
    if (homeHover > 0.01) {
      ctx.globalAlpha = 0.45 * homeHover; ctx.beginPath(); ctx.arc(homeX, cornerY, hr + 7, 0, Math.PI * 2);
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff8b2'; ctx.stroke(); ctx.globalAlpha = 1;
    }
    chunkyCircle(ctx, homeX, cornerY, hr, '#f7c26b', OUTLINE, 4);
    drawSprite(ctx, sprites, BUTTON_HOME, homeX, cornerY, Math.round(cornerRadius * 1.3), 0, hs, hs);
    soundButton.render(ctx, sprites);
    if (cornerFocus >= 0) focusRing(ctx, cornerFocus === 0 ? homeX : soundX, cornerY, cornerRadius);
  }
  function hoverMenu(x: number, y: number): number {
    const choice = phase === 'choice', n = choice ? pending?.choices.length ?? 0 : 2;
    // The book only decorates: a press on it picks nothing.
    if (choice) { placeChoiceBook(); if (onBook(bookAt, bookH, x, y)) return -1; }
    for (let i = 0; i < n; i++) {
      const dx = x - controlX(i, choice), dy = y - (choice ? choiceY : controlsY);
      if (choice ? Math.abs(dx) <= choiceSize / 2 && Math.abs(dy) <= choiceSize * 0.5 : Math.hypot(dx, dy) <= controlsRadius) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- hover
  const onHome = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius;
  /** What a press at x, y would do now, with the same gates as handleInput's pointerdown. */
  function hoverAt(x: number, y: number): CursorHover {
    if (soundButton.contains(x, y)) return null;
    if (onHome(x, y)) return 'press';
    if (phase === 'celebration') return celebrationLocked() ? null : 'press';
    if (playable() && heldCoin() >= 0) return 'carry';
    if (performance.now() < inputAfter) return null;
    if (playable()) {
      if (lineup.active) return lineup.skippable ? 'press' : null;
      if (hand.mode === 1) return null;
      if (coinAt(x, y) >= 0) return 'grab';
      return piggyAt(x, y) >= 0 ? 'press' : null;
    }
    if (phase === 'choice' || phase === 'rest') return hoverMenu(x, y) >= 0 ? 'press' : null;
    return null;
  }
  /** Ease the hover looks toward the mouse: a piggy a press would drop on, and the corner Home. */
  function updateHover(dt: number): void {
    const pt = input.pointer, mouse = pt.inside && pt.type === 'mouse';
    const live = mouse && playable() && !lineup.active && hand.mode !== 1 && performance.now() >= inputAfter;
    const p = live && !soundButton.contains(pt.x, pt.y) && !onHome(pt.x, pt.y) ? piggyAt(pt.x, pt.y) : -1;
    for (let i = 0; i < MAX_PIGGIES; i++) pigHover[i] = approach(pigHover[i]!, i === p ? 1 : 0, 14, dt);
    homeHover = approach(homeHover, mouse && onHome(pt.x, pt.y) && !soundButton.contains(pt.x, pt.y) ? 1 : 0, 14, dt);
  }

  // ---------------------------------------------------------------- input
  /** The child acted: the introduction's tapping hand and an idle hint stop. */
  function acted(): void {
    idleT = 0;
    if (hand.mode === 3 || hand.mode === 2) hand.mode = 0;
  }
  function pickUp(ci: number, by: number): void {
    const c = coins[ci]!;
    c.state = HELD; c.held = by; focusSlot = c.slot;
    play('pop', 'B', 2, 0.5);
  }
  /**
   * Motor attempts: one placement counts once, whatever the input style. A coin put on a piggy (right or wrong) is a
   * hit; a coin let go over nothing is a miss. Picking a coin up counts nothing, and neither does a press with no coin.
   */
  function pointerDown(x: number, y: number): void {
    acted();
    if (hand.mode === 1) return;
    const now = performance.now();
    // A coin already in hand (a click-click carry, or one lifted by a key): this press places it.
    const held = heldCoin();
    if (held >= 0) {
      const p = piggyAt(x, y);
      if (p >= 0) { hits++; sendCoin(held, p, true, false); }
      else { misses++; sendBack(held, true); }
      keyMode = 'coin';
      return;
    }
    const ci = coinAt(x, y);
    if (ci >= 0) { pickUp(ci, BY_POINTER); carry.coin = ci; carry.sticky = false; carry.downAt = now; carry.downX = x; carry.downY = y; keyMode = 'coin'; return; }
    // A press on a piggy sends the highlighted coin there.
    const p = piggyAt(x, y);
    if (p >= 0) {
      ensureFocus();
      const fc = slotCoin[focusSlot]!;
      if (resting(fc)) { hits++; sendCoin(fc, p, true, false); }
      else { piggies[p]!.wiggleT = 0; play('pop', 'A', 3, 0.35); }
    }
  }
  function pointerUp(x: number, y: number): void {
    const ci = carry.coin;
    if (ci < 0 || carry.sticky) return;
    const quick = performance.now() - carry.downAt < 300 && Math.hypot(x - carry.downX, y - carry.downY) < 24;
    if (quick) { carry.sticky = true; return; }
    const p = piggyAt(x, y);
    if (p >= 0) { hits++; sendCoin(ci, p, true, false); return; }
    // Let go over its own tray place: it just settles back. Anywhere else it floats back and counts as a miss.
    const c = coins[ci]!;
    if (Math.abs(x - slotX[c.slot]!) < coinD[c.kind]! * 0.6 && Math.abs(y - rowY) < coinD[c.kind]! * 0.6) sendBack(ci, false);
    else { misses++; sendBack(ci, true); }
  }
  function keyPlay(code: string): void {
    acted();
    if (hand.mode === 1) return;
    const left = code === 'ArrowLeft', right = code === 'ArrowRight', up = code === 'ArrowUp', down = code === 'ArrowDown';
    const now = performance.now();
    if (keyMode === 'piggy') {
      const held = keyHeld();
      if (held < 0) { keyMode = 'coin'; return; }
      if (left || right || up || down) {
        // Up and Down follow the rows on screen: with two shelves they move to the nearest piggy on the other shelf;
        // in one row they move one place like Left and Right (on the steps Up climbs to the next higher step).
        const pg = piggies[focusPiggy]!;
        let next = -1, best = 1e9;
        if (up || down) for (let i = 0; i < pigCount; i++) { const o = piggies[i]!; if (o.row !== pg.row && Math.abs(o.x - pg.x) < best) { best = Math.abs(o.x - pg.x); next = i; } }
        if (next < 0) next = (focusPiggy + (left || (up && !stairs) || (down && stairs) ? -1 : 1) + pigCount) % pigCount;
        focusPiggy = next;
        arrowed = true; lastArrowAt = now;
        return;
      }
      if (now < keyAfter) return;
      keyAfter = now + KEY_GAP_MS;
      // Evidence only when the child chose the piggy with the arrows and paused on it; a key mashed through is play only.
      const deliberate = arrowed && now - lastArrowAt >= ARROW_GAP_MS;
      lastPiggy = focusPiggy;
      sendCoin(held, focusPiggy, deliberate, false);
      return;
    }
    if (left || up) { moveCoinFocus(-1); return; }
    if (right || down) { moveCoinFocus(1); return; }
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    // One coin in hand at a time: a coin the pointer carries becomes the key's coin, so keys can always finish the round.
    let ci = carry.coin;
    if (ci >= 0) { carry.coin = -1; carry.sticky = false; coins[ci]!.held = BY_KEY; focusSlot = coins[ci]!.slot; }
    else {
      ensureFocus();
      ci = slotCoin[focusSlot]!;
      if (!resting(ci)) return;
      pickUp(ci, BY_KEY);
    }
    keyMode = 'piggy'; arrowed = false;
    // After a miss the highlight starts on the matching piggy, so steady key pressing always moves the round on.
    const c = coins[ci]!;
    focusPiggy = c.misses > 0 ? matchOf(c.kind) : Math.min(lastPiggy, pigCount - 1);
  }

  // ---------------------------------------------------------------- stats (read by checks; allocates only when read)
  const rect = (id: string, x: number, y: number, w: number, h: number): { id: string; x: number; y: number; w: number; h: number } => ({ id, x, y, w, h });
  const stats: PiggyParadeStats = {
    get step() { return data.step; }, get roundStep() { return playStep; }, get review() { return review; }, get tier() { return tier; },
    get rounds() { return data.rounds; }, get phase() { return phase; }, get intro() { return intro; },
    get evidence() { return evidence; }, get coinsTotal() { return coinsTotal; }, get coinsDone() { return coinsDone; }, get trayCap() { return trayCap; },
    get hits() { return hits; }, get misses() { return misses; }, get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; },
    get choiceIds() { return pending?.choices ?? []; }, get selected() { return menuSelected; }, get hand() { return hand.mode; },
    get keyMode() { return keyMode; }, get focusCoin() { return slotCoin[focusSlot] ?? -1; }, get focusPiggy() { return focusPiggy; },
    get celebrationLocked() { return phase === 'celebration' && celebrationLocked(); },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    get coins() {
      const out: PiggyParadeStats['coins'] = [];
      for (const c of coins) {
        if (c.state === OFF) continue;
        const d = coinD[c.kind]!, scale = c.state === CHUTE_ROLL ? CHUTE_SCALE : c.state === HELD || c.state === FLY || c.state === SLOT ? CARRY_SCALE : 1;
        out.push({ kind: COIN_NAMES[c.kind]!, face: 'heads', x: c.x, y: c.y, d: Math.round(d * scale), state: STATE_NAMES[c.state]!, tag: entering(c) ? '' : tags.text(c.kind), tagInk: entering(c) ? 0 : tags.ink(d) * scale });
      }
      if (phase === 'play') {
        for (let i = 0; i < pigCount; i++) {
          const pg = piggies[i]!, bd = badgeD[pg.kind]!;
          out.push({ kind: COIN_NAMES[pg.kind]!, face: 'heads', x: pg.x, y: pg.feet - (PIG_FEET - PIG_BADGE) * ph, d: bd, state: 'badge', tag: tags.text(pg.kind), tagInk: tags.ink(bd) });
          if (pg.coins > 0) { const sd = stackD(pg.kind); out.push({ kind: COIN_NAMES[pg.kind]!, face: 'heads', x: pg.x, y: pg.feet, d: sd, state: 'stack', tag: tags.text(pg.kind), tagInk: tags.ink(sd) }); }
        }
      }
      return out;
    },
    get tags() { return tags.measure().map(t => ({ ...t, kind: COIN_NAMES[t.kind]! })); },
    get tagBakes() { return tags.bakes; },
    get targets() {
      if (phase !== 'play') return [];
      return piggies.slice(0, pigCount).map(pg => ({ kind: COIN_NAMES[pg.kind]!, x: pg.zone[0]!, y: pg.zone[1]!, w: pg.zone[2]! - pg.zone[0]!, h: pg.zone[3]! - pg.zone[1]! }));
    },
    get hitRects() {
      const out = [rect('corner-home', homeX - cornerRadius, cornerY - cornerRadius, cornerRadius * 2, cornerRadius * 2), rect('corner-sound', soundX - cornerRadius, cornerY - cornerRadius, cornerRadius * 2, cornerRadius * 2)];
      if (phase === 'play') {
        for (let i = 0; i < trayCap; i++) { const ci = slotCoin[i]!; if (resting(ci)) { const d = coinD[coins[ci]!.kind]!; out.push(rect(`coin-${COIN_NAMES[coins[ci]!.kind]}`, slotX[i]! - d / 2, rowY - d / 2, d, d)); } }
        for (let i = 0; i < pigCount; i++) { const z = piggies[i]!.zone; out.push(rect(`piggy-${COIN_NAMES[piggies[i]!.kind]}`, z[0]!, z[1]!, z[2]! - z[0]!, z[3]! - z[1]!)); }
      } else if (phase === 'choice') {
        for (let i = 0; i < (pending?.choices.length ?? 0); i++) out.push(rect(`choice-${pending!.choices[i]}`, controlX(i, true) - choiceSize / 2, choiceY - choiceSize / 2, choiceSize, choiceSize));
      } else if (phase === 'rest') {
        out.push(rect('again', controlX(0, false) - controlsRadius, controlsY - controlsRadius, controlsRadius * 2, controlsRadius * 2));
        out.push(rect('home', controlX(1, false) - controlsRadius, controlsY - controlsRadius, controlsRadius * 2, controlsRadius * 2));
      }
      return out;
    },
    get drawn() {
      const r: Record<string, number> = {
        piggyH: ph, piggyW: pw, piggyMaxH: ph * 1.04 * 1.012, chuteW, chuteH, henH: henH * 1.02, chickH, shelfW, trayW, handH,
        restPiggyH: restSize * 0.62, snap, rowY, glow: glowSize, choiceSticker: Math.round(choiceSize * 0.82),
      };
      for (let k = 0; k < 4; k++) { r[`coin-${COIN_NAMES[k]}`] = coinD[k]!; r[`carried-${COIN_NAMES[k]}`] = Math.round(coinD[k]! * CARRY_SCALE); r[`badge-${COIN_NAMES[k]}`] = badgeD[k]!; r[`lineup-${COIN_NAMES[k]}`] = luD[k]!; }
      if (stairs) { r.stepsW = stW; r.stepsH = stH; r.stepsScaleX = stW / STEPS_PX; r.stepsScaleY = stW / STEPS_PX * stSy; r.dotD = dotD; r.dotPitch = dotPitch; r.labelPx = labelPx; }
      return r;
    },
    get values() {
      if (!stairs) return [];
      const out: PiggyParadeStats['values'] = [];
      const half = stW * STEP_BLOCK * 0.42;
      for (let k = 0; k < 4; k++) {
        const top = labelPx && !labelSide ? labelY[k]! - (labels[k]?.h ?? 0) / 2 : dotsY[k]! - dotPitch / 2;
        const bottom = dotsY[k]! + (DOT_ROWS[k]! - 1) * dotPitch * ROW_SPACE + dotPitch / 2;
        out.push({
          kind: COIN_NAMES[k]!, dots: DOT_ROWS[k]! * DOT_COLS[k]!, rows: DOT_ROWS[k]!, perRow: DOT_COLS[k]!, label: content.labels ? LABEL_TEXT[k]! : '',
          labelShown: !!labels[k] && labelPx > 0, dotD, x: stairX[k]! - half, y: top, w: half * 2, h: bottom - top,
        });
      }
      return out;
    },
    get lineup() {
      const order: string[] = [], coinBoxes: PiggyParadeStats['lineup']['coinBoxes'] = [], labelBoxes: PiggyParadeStats['lineup']['labels'] = [];
      if (lineup.active) {
        const xs: [number, string][] = [];
        for (let k = 0; k < 4; k++) {
          if (!lineupPos(k)) continue;
          const d = luD[k]!;
          xs.push([pos.x, COIN_NAMES[k]!]); coinBoxes.push({ kind: COIN_NAMES[k]!, x: pos.x, y: pos.y, d });
          // Each coin's value tag, from the coin's lower edge down (its baked width is listed in `tags`).
          labelBoxes.push({ kind: COIN_NAMES[k]!, text: tags.text(k), x: pos.x, y: pos.y + d / 2, ink: tags.ink(d), hang: tags.hang(d), alpha: lu.alpha });
        }
        xs.sort((a, b) => a[0] - b[0]); for (const [, n] of xs) order.push(n);
      }
      const hb = hand.mode && handBox[2]! > 0 ? { x: handBox[0]!, y: handBox[1]!, w: handBox[2]!, h: handBox[3]! } : null;
      return { active: lineup.active, t: lineup.t, skippable: lineup.skippable, order, coinBoxes, labels: labelBoxes, hand: hb };
    },
    get prepared() { return prepared(); },
    get demos() { return data.demos; }, get lineupSeen() { return data.lineupSeen; },
    resetWork() { workHead = workCount = 0; },
  };

  /** ?debug&step=n&rounds=n: start at that learning step and round count (rounds=0 replays the introduction). */
  function applyDebug(): boolean {
    if (debugApplied || !services.debug.enabled) return false;
    debugApplied = true;
    // A round waiting for its sticker or rest is never thrown away by a reload of a debug URL.
    if (data.pending) return false;
    const params = new URLSearchParams(location.search), step = Number(params.get('step')), rounds = Number(params.get('rounds'));
    if (params.has('step') && Number.isSafeInteger(step) && step >= 1 && step <= MAX_STEP) {
      data.step = step; data.stepRounds = 0; data.learn.length = 0;
      // A chosen step skips the introduction unless rounds asks for it.
      if (data.rounds === 0 && !params.has('rounds')) data.rounds = 1;
    }
    const setRounds = params.has('rounds') && Number.isSafeInteger(rounds) && rounds >= 0;
    if (setRounds) data.rounds = rounds;
    return setRounds;
  }

  return {
    stats,
    enter() {
      void loadPiggyParadeArt(services);
      preloadVoice(audio, services.base);
      data = services.save.gameData<PiggyData>(GAME_ID, defaultData());
      sanitizePiggyData(data, () => services.save.protect());
      if (!applyDebug()) data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      if (!fontReady) void ensureDisplayFont().then(() => { fontReady = true; if (stairs) bakeValues(); tags.configure(tagFloor(), artRatio, true); prepareTags(); });
      sceneT = 0; bookGlide = false; startMusic(audio, 'piggy-parade');
      if (data.pending) {
        pending = data.pending; stars = pending.stars; tier = pending.tier; intro = false;
        pigCount = Math.max(1, pending.colors.length);
        for (let i = 0; i < pigCount; i++) piggies[i]!.color = pending.colors[i] ?? i;
        layout(services.canvas.width, services.canvas.height);
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
        else enterRest();
      } else { layout(services.canvas.width, services.canvas.height); startRound(); }
      if (services.debug.enabled) (window as unknown as { __piggyParade?: PiggyParadeStats }).__piggyParade = stats;
    },
    pause() {
      stopMusic(audio); stopIdle(); services.save.flush();
      // A coin in the hand goes back to its place; coins in flight finish where they were heading after resume.
      const held = heldCoin();
      if (held >= 0) { sendBack(held, false); keyMode = 'coin'; }
    },
    resume() {
      // Keys pressed into the break nudge must not act here: choice and rest start over with their guard.
      guard(phase === 'choice' || phase === 'rest' ? MENU_GUARD_MS : PLAY_GUARD_MS); cornerFocus = -1;
      startMusic(audio, 'piggy-parade');
    },
    // Any route away from rest (corner Home, the break nudge's Home) closes the finished round.
    exit() {
      stopMusic(audio); stopIdle(); offers.cancel(); closeFinishedRound(); services.save.flush();
      releaseArt(); sprites.clearScaled(BG); bgCanvas = undefined; sizeKey = ''; madeName = '';
    },
    resize: layout,
    hoverAt,
    update(dt) {
      const started = performance.now(); sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      if (playable()) { updatePlay(dt); updateCoins(dt); } else updateResult(dt);
      updateHover(dt);
      askIdle(); particles.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H || sprites.pixelRatio !== artRatio) layout(view.width, view.height);
      ensureBackground(); warm(ctx);
      if (bgCanvas) ctx.drawImage(bgCanvas, bgX, bgY, bgCanvas.width / sprites.pixelRatio, bgCanvas.height / sprites.pixelRatio);
      else { ctx.fillStyle = '#b8483a'; ctx.fillRect(0, 0, W, H); }
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
        else if (playable() && heldCoin() < 0 && keyMode === 'coin') {
          // Hovering a resting coin highlights it, so a press on a piggy sends the coin the child is looking at.
          const ci = coinAt(event.info.x, event.info.y);
          if (ci >= 0) focusSlot = coins[ci]!.slot;
        }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { exitToHub(); return; }
        cornerFocus = -1;
      } else if (!playable()) {
        // During play every key plays, Escape, Tab and Enter included. Keyboard routes to Home exist only after the round.
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
      if (playable()) {
        // The line-up plays out the first time; once seen, any press or key skips straight to play.
        if (lineup.active) { if (lineup.skippable) { endLineup(); guard(PLAY_GUARD_MS); } return; }
        if (event.type === 'pointerdown') pointerDown(event.info.x, event.info.y); else keyPlay(event.info.code);
        return;
      }
      if (phase !== 'choice' && phase !== 'rest') return;
      const n = phase === 'choice' ? pending?.choices.length ?? 1 : 2;
      if (event.type === 'pointerdown') {
        const selected = hoverMenu(event.info.x, event.info.y); if (selected < 0) return; menuSelected = selected;
      } else {
        const code = event.info.code;
        // The first key only shows where focus is; nothing is chosen by a stray press.
        if (menuSelected < 0) { menuSelected = 0; focusAt = now; return; }
        if (code.startsWith('Arrow')) { menuSelected = (menuSelected + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
      }
      if (phase === 'choice') chooseSticker(menuSelected); else leave(menuSelected === 0);
    },
  };
}
