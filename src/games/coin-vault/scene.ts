/**
 * Coin Vault: animal visitors peek over the far edge of a wooden counting desk with a sack of coins. The child moves
 * each coin from the row along the bottom to the felt mat, where it slides into its own dish and pours its value into
 * the counting board's cups (rows of ten, split 5 and 5; no running numeral). When every coin is in, the dishes count on
 * from the largest and three amount tags rise; the matching tag flies to the vault's door, the coins roll into the
 * tree-stump vault, the round door swings shut and the visitor waves. Step 2 spills the coins as a pile, step 3 brings
 * quarters, and step 4 shows two locks wanting the same amount: the visitor fills the first, the child fills the second
 * with a different mix. Nothing is kept: the vault empties every round.
 */
import { rewards, type AppServices } from '../../app/services';
import { ensureDisplayFont } from '../../app/font';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, DISPLAY_FONT, drawSprite, OUTLINE } from '../../ui/draw';
import { confettiBurst, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, onBook, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { clamp01, easeInCubic, easeInOutSine, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { BUILT_STEP, defaultData, GAME_ID, sanitizeVaultData, TOP_STEP, type PendingRound, type VaultData } from './data';
import {
  applyLearning, applyMotor, COIN_MM, COIN_NAMES, COIN_VALUE, DIME, DIME_MM, DISH_ORDER, introTask, lockTakes, MIN_DIME_PX, NICKEL,
  PENNY, planTask, QUARTER, recordTask, ROUND_STARS, taskStep, TIERS, type TaskPlan, type TierParams,
} from './rules';
import { playVoice, preloadVoice, type VoiceClip } from './voice';

export { GAME_ID };
const ART = 'coin-vault/';
const BG = `${ART}desk`, STUMP = `${ART}vault-stump`, DOOR = `${ART}vault-door`, MAT = `${ART}mat`, BOARD = `${ART}count-board`;
const LOCK = `${ART}lock-plate`, TAG = `${ART}tag`, PURSE = `${ART}purse`, HAND = `${ART}helper-hand`;
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
const DISH_NAMES = COIN_NAMES.map(c => `${ART}dish-${c}`);
const VISITORS = ['squirrel', 'rabbit', 'badger', 'hedgehog', 'owl', 'beaver'] as const;
const VISITOR_NAMES = VISITORS.map(a => [`${ART}${a}-wait`, `${ART}${a}-happy`] as const);
/** Where each visitor's waiting pose has its straight body cut (fraction of its height); the sack hangs below it. */
const CUT_WAIT = [0.937, 0.952, 0.993, 0.928, 0.93, 0.925] as const;
const CUT_HAPPY = 0.99;
const COIN_FACES = COIN_NAMES.map(c => [`${ART}coin-${c}-heads`, `${ART}coin-${c}-tails`] as const);
const COIN_PX = 384;

// Measured once from the sprites' pixels (round 1), as fractions of each image.
/** desk.webp: the desk's far edge, in the background's own pixels. */
const EDGE_PX = 329, BG_W = 1920, BG_H = 1280;
/** vault-stump.webp (700x401): the doorway's centre and the doorway ring's right edge (the hinge). */
const HOLE_X = 0.49, HOLE_Y = 0.62, HINGE_X = 0.69, STUMP_AR = 401 / 700;
/** vault-door.webp (420x420): the door's width as a share of the stump's, and its rectangular plate. */
const DOOR_K = 0.41, PLATE_X0 = 0.257, PLATE_X1 = 0.74, PLATE_Y0 = 0.552, PLATE_Y1 = 0.729;
/** count-board.webp (760x673): its cream inset. */
const BOARD_AR = 673 / 760, INSET_X0 = 0.07, INSET_X1 = 0.93, INSET_Y0 = 0.073, INSET_Y1 = 0.923;
/** tag.webp (640x254): the writable face (left of it are the eyelet and twine). */
const TAG_AR = 254 / 640, TAG_FACE0 = 0.27, TAG_FACE1 = 0.97;
/** lock-plate.webp (1450x307): the free plank right of the padlock. */
const LOCK_AR = 1450 / 307, LOCK_FREE0 = 0.18, LOCK_FREE1 = 0.97;
/** mat.webp (1489x683): the outer fifths are end caps, the middle three fifths stretch. */
const MAT_PX_W = 1489, MAT_PX_H = 683;
const PURSE_AR = 274 / 420;
/** Layout units: visitor height, stump width, board width, purse width, helper hand height. */
const VISITOR_H = 180, STUMP_W = 330, BOARD_W = 360, PURSE_W = 170, HAND_H = 150;
/** Largest layout unit: at 1920x1080 every piece draws at most at its own pixel size. */
const U_MAX = 1.405;
/** Idle preparation: a step runs anyway once it has waited this long for an idle period with 4 ms to spare. */
const IDLE_WAIT_MS = 500;
const IDLE_OPTIONS: IdleRequestOptions = { timeout: IDLE_WAIT_MS };
const MAX_PLACES = 8, CUPS = 100, POOL = 32, ROLLERS = 64, PARTICLES = 160, DISH_MAX = 24, LOCK_MAX = 64;

const CELEBRATION_SECONDS = 4.6, STAR_START = 0.5;
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350, KEY_GAP_MS = 150, IDLE_SECONDS = 6, IDLE_SOON = 4, IDLE_REPEAT = 7;
/** A pointer choice is deliberate this long after the previous press; a key choice this long after an arrow move. */
const DELIBERATE_MS = 700, KEY_DELIBERATE_MS = 400;
/** Cups light this far apart as a coin pours: a nickel's five, a dime's ten, a quarter's twenty-five. */
const POUR_GAP = [0.07, 0.07, 0.032, 0.016] as const;
const TO_DISH = 0.3, RETURN_SECONDS = 0.4, ARRIVE_SECONDS = 0.45, ARRIVE_STAGGER = 0.06, LEAVE_SECONDS = 0.35;
/** A coin the lock does not take: fly there, jiggle, hop home. */
const BACK_HOLD = 0.3, BACK_HOP = 0.5;
/** The visitor rises (and the door opens) this long; the visitor fills its lock one coin this often. */
const RISE = 0.45, FIRST_GAP = 0.22;
/** Count-on: each dish with its cups pulses this long. */
const COUNT_ON = 0.35;
/** Tags slide up, a wrong tag tilts then sinks and fades. */
const TAG_RISE = 0.35, TAG_TILT = 0.3, TAG_FADE = 0.4;
/** The finished-task sequence: tag to the door, coins roll in, door shuts, visitor waves and sinks, the board clears. */
const SEQ_TAG = 0.35, ROLL_GAP = 0.04, ROLL = 0.45, SHUT = 0.45, WAVE = 0.8, SINK = 0.35;
/** The introduction's goal holds its counted dishes and lit cups this long first. */
const GOAL_HOLD = 0.8, INTRO_HAND_AT = 0.35;
/** Helper hand timeline: rise to the coin, press it, carry it, then fade. */
const HAND_PRESS_AT = 0.5, HAND_CARRY_AT = 0.7, HAND_DROP_AT = 1.4, HAND_FADE = 0.5;
const FANFARE: SfxOptions = { variant: 'D' };
const HIGHLIGHT = '#fff6a3', INK = '#4a2f1c', CREAM = '#fff8e6';
const NUMBER_CLIPS: readonly VoiceClip[] = Array.from({ length: 101 }, (_, n) => `number-${n}` as const);

type Phase = 'play' | 'celebration' | 'choice' | 'sticker' | 'rest';
/** enter: visitor rises, coins slide in; count: coins to dishes; counton: the dishes count on; tags: pick the total; lock: fill the second lock; done: into the vault. */
type TaskPhase = 'enter' | 'count' | 'counton' | 'tags' | 'lock' | 'done';
/**
 * Flight modes. ARRIVE: a coin slides from the purse onto its place; LEAVE: off the row; DISH: into its dish; RETURN:
 * back from a miss; LOCKED: into the open lock; BACK_LOCK: not taken, back to its place; FIRST: the visitor's coin into
 * the first lock.
 */
const ARRIVE = 0, LEAVE = 1, DISH = 2, RETURN = 3, LOCKED = 4, BACK_LOCK = 5, FIRST = 6;
const HAND_DEMO = 1, HAND_TAP = 2, HAND_HINT = 3;

interface Flight {
  active: boolean; mode: number; kind: number; face: number; n: number; place: number; slot: number;
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; s0: number; s1: number; giggles: number;
}
interface Roller { active: boolean; kind: number; face: number; x0: number; y0: number; s0: number; t: number }
interface Rect { x: number; y: number; w: number; h: number }
interface CoinInfo { kind: string; face: 'heads' | 'tails'; x: number; y: number; d: number; where: string; count: number; hit: Rect | null }
interface TargetInfo { kind: string; x: number; y: number; w: number; h: number; drawn?: Rect }
interface TaskInfo {
  kind: 'count' | 'lock'; step: number; warmup: boolean; total: number; tags: number[]; tagsShown: number[];
  coins: { penny: number; nickel: number; dime: number; quarter: number };
  locks: { amount: number; cents: number; coins: string[] }[];
}
export interface CoinVaultStats {
  readonly step: number; readonly contentStep: number; readonly tier: Tier; readonly rounds: number; readonly phase: Phase; readonly taskPhase: TaskPhase;
  readonly intro: boolean; readonly introStage: number; readonly taskIndex: number; readonly tasks: number; readonly hits: number; readonly misses: number;
  readonly bounces: number; readonly stars: number; readonly stickerId: string; readonly choiceIds: readonly string[]; readonly hand: number;
  readonly carrying: boolean; readonly focus: number; readonly tagFocus: number; readonly counted: readonly number[]; readonly learn: readonly number[]; readonly demos: number;
  /** The current task's numbers: the collection total and tag values, or the lock amounts and what is in each lock. */
  readonly task: TaskInfo;
  /** Every coin on screen: in the row (stacks give their count), in the dishes, in the locks, and in flight. */
  readonly coins: readonly CoinInfo[];
  readonly bills: readonly { value: number; x: number; y: number; w: number; h: number }[];
  /** Hit rectangles in CSS px (with `drawn` where the drawn art differs). */
  readonly targets: readonly TargetInfo[];
  /** Cups the task lights and how many are lit (lock tasks: the open lock's cups; `first` the first lock's). */
  readonly cups: { total: number; lit: number; first: number; firstLit: number; sockets: number };
  readonly dishes: readonly { kind: string; count: number }[];
  readonly coinSizes: { penny: number; nickel: number; dime: number; quarter: number };
  readonly cupDiameter: number;
  readonly workMean: number; readonly workMax: number;
  /** Largest drawn scale of each image drawn this layout (drawn px / image px at pixel ratio 1). */
  scales(): Record<string, number>;
  resetWork(): void;
}
export interface CoinVaultScene extends Scene { readonly stats: CoinVaultStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);
const spriteName = (path: string): string => path.replace(/\.\w+$/, '');

function artList(): { name: string; path: string }[] {
  const paths = [`${BG}.webp`, `${STUMP}.webp`, `${DOOR}.webp`, `${MAT}.webp`, `${BOARD}.webp`, `${LOCK}.webp`, `${TAG}.webp`, `${PURSE}.webp`, `${HAND}.webp`,
    `${BUTTON_PLAY}.png`, `${BUTTON_HOME}.png`, BOOK_ICON_PATH];
  for (const n of DISH_NAMES) paths.push(`${n}.webp`);
  for (const pair of VISITOR_NAMES) for (const n of pair) paths.push(`${n}.webp`);
  for (const pair of COIN_FACES) for (const n of pair) paths.push(`${n}.webp`);
  return [...paths.map(path => ({ name: spriteName(path), path })), ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path }))];
}
const OWN_ART = artList().map(a => a.name).filter(name => name !== BG);
export async function loadCoinVaultArt(services: AppServices): Promise<string[]> {
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
function bakeGlow(size: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(c.width / size, c.width / size);
  const r = size / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 245, 200, 0.85)'); grad.addColorStop(0.45, 'rgba(255, 220, 120, 0.55)'); grad.addColorStop(1, 'rgba(255, 200, 80, 0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** One cup `d` across: a warm grey socket, or lit warm gold with a darker rim. */
function bakeCup(d: number, ratio: number, lit: boolean): HTMLCanvasElement {
  const size = d + 2, { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const cx = size / 2, r = d / 2, lw = Math.max(1.5, d * 0.12);
  g.beginPath(); g.arc(cx, cx, r - lw / 2, 0, Math.PI * 2);
  const grad = lit ? g.createRadialGradient(cx - r * 0.25, cx - r * 0.3, r * 0.1, cx, cx, r) : g.createRadialGradient(cx, cx + r * 0.3, r * 0.1, cx, cx, r);
  if (lit) { grad.addColorStop(0, '#fff6cf'); grad.addColorStop(0.55, '#f6c54a'); grad.addColorStop(1, '#d9931c'); }
  else { grad.addColorStop(0, '#d9cfc0'); grad.addColorStop(0.7, '#c2b5a3'); grad.addColorStop(1, '#a89884'); }
  g.fillStyle = grad; g.fill();
  g.lineWidth = lw; g.strokeStyle = lit ? '#b8741a' : '#9a8a76'; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** The mat: the outer fifths as end caps scaled by the height's scale, the middle three fifths stretched to fill. */
function bakeMat(img: HTMLImageElement, w: number, h: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpuCanvas(w * ratio, h * ratio); if (!g) return c;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth, ih = img.naturalHeight, cap = iw / 5, k = (h * ratio) / ih, capW = Math.min(cap * k, (w * ratio) / 2.5), Hh = h * ratio, Ww = w * ratio;
  g.drawImage(img, 0, 0, cap, ih, 0, 0, capW, Hh);
  g.drawImage(img, iw - cap, 0, cap, ih, Ww - capW, 0, capW, Hh);
  g.drawImage(img, cap, 0, iw - 2 * cap, ih, capW - 0.5, 0, Ww - 2 * capW + 1, Hh);
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** Glyphs "0" to "9", the cent sign and the dollar sign, baked once per size with the bundled font. */
const GLYPHS = '0123456789¢$', CENT = 10;
interface Strip { canvas: HTMLCanvasElement | undefined; px: number; pad: number; x: Float32Array; w: Float32Array }
const strip = (): Strip => ({ canvas: undefined, px: 0, pad: 0, x: new Float32Array(GLYPHS.length), w: new Float32Array(GLYPHS.length) });
function bakeStrip(s: Strip, px: number, ratio: number): void {
  const probe = cpuCanvas(1, 1).g, font = `700 ${Math.round(px)}px ${DISPLAY_FONT}`;
  let total = 0;
  if (probe) probe.font = font;
  s.pad = Math.ceil(px * 0.12); s.px = px;
  for (let i = 0; i < GLYPHS.length; i++) {
    const w = probe ? probe.measureText(GLYPHS[i]!).width : px * 0.6;
    s.x[i] = total + s.pad; s.w[i] = w; total += w + s.pad * 2;
  }
  const h = Math.ceil(px * 1.35), { c, g } = cpuCanvas(total * ratio, h * ratio);
  s.canvas = c; if (!g) return;
  g.scale(ratio, ratio);
  g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = Math.max(2, px * 0.1); g.strokeStyle = CREAM; g.fillStyle = INK;
  for (let i = 0; i < GLYPHS.length; i++) { g.strokeText(GLYPHS[i]!, s.x[i]!, h / 2 + px * 0.04); g.fillText(GLYPHS[i]!, s.x[i]!, h / 2 + px * 0.04); }
  g.getImageData(0, 0, 1, 1);
}

let debugApplied = false;

export function createCoinVaultScene(services: AppServices): CoinVaultScene {
  const { sprites, audio, input } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(PARTICLES);
  const soundButton = createSoundButton(services), soundNames = soundArt(services).map(a => a.name);
  const flights: Flight[] = Array.from({ length: POOL }, () => ({ active: false, mode: 0, kind: 0, face: 0, n: 1, place: 0, slot: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, s0: 1, s1: 1, giggles: 0 }));
  const rollers: Roller[] = Array.from({ length: ROLLERS }, () => ({ active: false, kind: 0, face: 0, x0: 0, y0: 0, s0: 1, t: 0 }));
  const work = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const pos = { x: 0, y: 0 };
  // Row places: coin kind, coins resting there, endless supply, face, the pile's turn and nudge, small timers.
  const pKind: number[] = [], pCount: number[] = [], pUnlimited: boolean[] = [];
  const pFace = new Uint8Array(MAX_PLACES), pRot = new Float32Array(MAX_PLACES), pNx = new Float32Array(MAX_PLACES), pNy = new Float32Array(MAX_PLACES);
  const pHop = new Float32Array(MAX_PLACES).fill(9), pX = new Float32Array(MAX_PLACES), pY = new Float32Array(MAX_PLACES);
  let nPlaces = 0;
  // Dishes (by coin kind): coins in each with their faces, and pulse timers.
  const dishN = new Int32Array(4), dishFace = new Uint8Array(4 * DISH_MAX), dishPulse = new Float32Array(4).fill(9);
  // Cups: lit or not, which coin kind lit each (count-on), pulse timers, centres.
  const cupLit = new Uint8Array(CUPS), cupKind = new Int8Array(CUPS), cupPulse = new Float32Array(CUPS).fill(9), cupX = new Float32Array(CUPS), cupY = new Float32Array(CUPS);
  // Locks (step 4): coins in each (kind, face), their value, and the open lock's coins per kind (including coins on their way).
  const lockKind = new Int8Array(2 * LOCK_MAX), lockFace = new Uint8Array(2 * LOCK_MAX), lockN = new Int32Array(2), lockCents = new Int32Array(2), lockCur = new Int32Array(4);
  const lockPulse = new Float32Array(2).fill(9);
  // Tags: value, state (0 there, 1 tilting away, 2 gone, 3 picked, 4 leaving), clock.
  const tagVal = new Int32Array(3), tagState = new Uint8Array(3), tagT = new Float32Array(3);
  const carry = { active: false, sticky: false, keyed: false, place: 0, kind: 0, face: 0, downAt: 0, downX: 0, downY: 0, deliberate: false };
  const hand = { mode: 0, t: 0, place: 0, kind: 0, released: false, taken: false, after: -1 };
  let data: VaultData = defaultData();
  let W = 1366, H = 768, u = 1, E = 163, portrait = false, rowsWanted = 1;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0, bgScale = 1;
  let matCanvas: HTMLCanvasElement | undefined, glowCanvas: HTMLCanvasElement | undefined, cupOff: HTMLCanvasElement | undefined, cupOn: HTMLCanvasElement | undefined;
  const tagStrip = strip(), lockStrip = strip(), doorStrip = strip();
  let artRatio = 0, glowSize = 0, bakedCup = 0, bakedMat = '', fontReady = false;
  let phase: Phase = 'play', tier: Tier = 0, intro = false, introStage = 0, visitorOffset = 0;
  let taskPhase: TaskPhase = 'enter', taskT = 0, seqT = 0, taskIndex = 0, tasksTotal = 3, enterSeconds = 1;
  let plan: TaskPlan = introTask(), lastTotal = 0;
  /** Cups: lit in the task's open area, still to pour, the pour clock, and where the open area starts (lock 2: row 6). */
  let lit = 0, pourLeft = 0, pourTimer = 0, pourKind = 0, cupBase = 0, firstLit = 0, firstPour = 0;
  let countOnT = -1, countOnAt = -1, countOnReplay = false, tagsT = 0, tagFocus = 0, picked = -1, doneTag = 0, doneLocks = false, rollEnd = 0;
  let visitor = 0, visRise = 0, visSink = 0, doorK = 1, doorFrom = 1, doorTo = 1, doorT = 9, firstLeft = 0, firstT = 0;
  let taskBounces = 0, taskAssisted = false, taskDeliberate = true, taskBounced = false, taskDrops = 0, tagResult = -1, wrongPicks = 0, firstPickDone = false;
  let lastPressAt = -9999, lastArrowAt = -9999, arrowMoved = false, purseHop = 9, visHop = 9, matHop = 9;
  const roundCounted: number[] = [];
  /** Three quiet giggle notes 90 ms apart after a wrong tag. */
  const sfxLater = new Float32Array([9, 9, 9]);
  let sfxLaterOn = false;
  let time = 0, sceneT = 0, phaseT = 0, idleT = 0;
  let hits = 0, misses = 0, bounces = 0, stars = 1, starsPlayed = 0, focus = 0;
  let pending: PendingRound | null = null;
  let menuSelected = -1, inputAfter = 0, keyAfter = 0, focusAt = 0;
  let workHead = 0, workCount = 0, updateMs = 0;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0, idleWaitFrom = -1;
  const warmNames: string[] = [], warmSizes: number[] = [], warmDone = new Set<string>();
  let warmIndex = 0, madeName = '', madeSize = 0, sizeKey = '';
  // Layout in logical (CSS) px.
  const coinD = new Float32Array(4);
  let rowX = 0, rowY = 0, rowW = 0, rowH = 0, rows = 1, placeW = 0, placeGap = 0, perRow = 4, maxPlaces = 4, placesX0 = 0, placesW = 0;
  let purseX = 0, purseY = 0, purseW = 0, purseH = 0;
  let visH = 0, visX = 0, stumpX = 0, stumpY = 0, stumpW = 0, stumpH = 0, doorD = 0, hingeX = 0, doorCY = 0;
  let boardX = 0, boardY = 0, boardW = 0, boardH = 0, cupD = 0, cupPitch = 0;
  let matX = 0, matY = 0, matW = 0, matH = 0, inX = 0, inY = 0, inW = 0, inH = 0;
  let zoneX0 = 0, zoneY0 = 0, zoneX1 = 0, zoneY1 = 0;
  const dishX = new Float32Array(4), dishY = new Float32Array(4), dishW = new Float32Array(4), dishH = new Float32Array(4);
  const dzX0 = new Float32Array(4), dzY0 = new Float32Array(4), dzX1 = new Float32Array(4), dzY1 = new Float32Array(4);
  const lockX = new Float32Array(2), lockY = new Float32Array(2);
  let lockW = 0, lockH = 0;
  const tagX = new Float32Array(3), tagY = new Float32Array(3);
  let tagW = 0, tagH = 0;
  let starY = 0, starR = 0, cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1;
  let choiceSize = 0, choiceY = 0, restSize = 0, restY = 0, controlsY = 0, controlsRadius = 60;
  const offers = createStickerOffers(sprites), bookAt = new Float32Array(2);
  let bookH = 150, bookGlide = false;
  const stickerNames = new Map(STICKERS.map(s => [s.id, stickerSpriteName(s.id)]));
  const drawnScale = new Map<string, number>();

  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  const playable = (): boolean => phase === 'play';
  const isLock = (): boolean => plan.kind === 'lock';
  const note = (name: string, drawn: number, natural: number): void => {
    const k = drawn / (natural || 1), old = drawnScale.get(name) ?? 0;
    if (k > old) drawnScale.set(name, k);
  };

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H;
    W = width; H = height; portrait = H > W;
    const reratio = sprites.pixelRatio !== artRatio;
    artRatio = sprites.pixelRatio;
    if (reratio) warmDone.clear();
    u = Math.min(U_MAX, Math.max(0.45, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    const cornerU = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * cornerU, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    // The desk's far edge from the background's cover-fit (the loaded image's size when there is one).
    const img = sprites.get(BG), iw = img?.naturalWidth || BG_W, ih = img?.naturalHeight || BG_H;
    bgScale = Math.max(W / iw, H / ih); bgX = (W - iw * bgScale) / 2; bgY = (H - ih * bgScale) / 2;
    E = Math.round(bgY + EDGE_PX * (ih / BG_H) * bgScale);
    const tp = TIERS[tier];
    // Visitor, stump and board shrink first (to 0.6); where that is not enough (a large uiScale), the coins and their
    // spacing shrink in 10 percent steps toward the dime's 96 px floor, and the band tries again.
    const rowMin = Math.min(1, 0.45 / u);
    let ok = false;
    for (let cs = 1; ; cs = Math.max(rowMin, cs * 0.9)) {
      sizeRow(tp, cs);
      for (let fit = 1; fit >= 0.6 - 1e-6; fit -= 0.05) { placeBand(fit); if ((ok = fits())) break; }
      if (ok || cs <= rowMin) break;
    }
    placeMat(tp.snap * u);
    placeCups();
    if (nPlaces) placeCoins();
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
    const glow = Math.round(coinD[QUARTER]! * 1.5);
    if (!glowCanvas || reratio || glow !== glowSize) { glowSize = glow; glowCanvas = bakeGlow(glowSize, artRatio); }
    if (!cupOn || reratio || cupD !== bakedCup) { bakedCup = cupD; cupOn = bakeCup(cupD, artRatio, true); cupOff = bakeCup(cupD, artRatio, false); }
    bakeStrips(reratio);
    const matImg = sprites.get(MAT), matKey = `${Math.round(matW)}x${Math.round(matH)}@${artRatio}`;
    if (matImg && matKey !== bakedMat) { bakedMat = matKey; matCanvas = bakeMat(matImg, Math.round(matW), Math.round(matH), artRatio); }
    planWarm();
    const key = `${W}x${H}@${artRatio}/${tier}/${coinD[DIME]}/${rows}`;
    if (key !== sizeKey) { sizeKey = key; releaseArt(); drawnScale.clear(); }
    if (matImg) {
      const k = matH / matImg.naturalHeight, capW = Math.min(MAT_PX_W / 5 * k, matW / 2.5);
      note(MAT, matH, MAT_PX_H); note(MAT, capW, MAT_PX_W / 5); note(MAT, matW - 2 * capW, MAT_PX_W * 3 / 5);
    }
    if (resized || reratio || !bgCanvas) { sprites.clearScaled(BG); bgCanvas = undefined; }
  }
  /** Glyph strips for the tags, the lock plates and the door's plate, rebaked when their size or the font changes. */
  function bakeStrips(force: boolean): void {
    const tagPx = Math.max(16, Math.round(tagH * 0.42)), lockPx = Math.max(14, Math.round(lockH * 0.45));
    const doorPx = Math.max(14, Math.round(doorD * (PLATE_Y1 - PLATE_Y0) * 0.8));
    if (force || tagStrip.px !== tagPx || !tagStrip.canvas) bakeStrip(tagStrip, tagPx, artRatio);
    if (force || lockStrip.px !== lockPx || !lockStrip.canvas) bakeStrip(lockStrip, lockPx, artRatio);
    if (force || doorStrip.px !== doorPx || !doorStrip.canvas) bakeStrip(doorStrip, doorPx, artRatio);
  }
  /** Coins at true ratios (the dime never below 96 CSS px) and the row along the bottom, at `cs` of their full size. */
  function sizeRow(tp: TierParams, cs: number): void {
    const cu = u * cs;
    const dime = Math.max(MIN_DIME_PX, tp.dime * cu);
    for (let k = 0; k < 4; k++) coinD[k] = Math.round(dime * COIN_MM[k]! / DIME_MM);
    const edge = Math.max(6, 20 * u);
    rowX = Math.round(edge); rowW = Math.round(W - 2 * edge);
    placeGap = Math.max(4, 8 * cu);
    placeW = Math.max(96, Math.round(coinD[QUARTER]! + 16 * cu));
    rowH = Math.round(coinD[QUARTER]! + 36 * cu);
    // The purse sits at the row's left end (a narrow portrait window leaves it out to keep two places).
    purseW = portrait ? 0 : Math.round(Math.min(PURSE_W * u, rowH * 0.7 / PURSE_AR)); purseH = Math.round(purseW * PURSE_AR);
    placesX0 = rowX + (purseW ? purseW + Math.round(16 * u) : 0); placesW = rowX + rowW - placesX0;
    perRow = Math.max(1, Math.floor((placesW + placeGap) / (placeW + placeGap)));
    rows = Math.min(2, Math.max(1, rowsWanted > perRow ? 2 : 1));
    maxPlaces = Math.min(MAX_PLACES, tp.places, perRow * rows);
    const total = rows * rowH + (rows - 1) * placeGap;
    rowY = Math.round(H - Math.max(6, 12 * cu) - total);
    purseX = rowX; purseY = rowY + total - purseH - Math.round(4 * u);
  }
  /** Visitor, stump with its door, and the counting board, at `fit` of their full size. */
  function placeBand(fit: number): void {
    const s = u * fit;
    if (!portrait) {
      visH = Math.min(VISITOR_H * s, (E - 4) / 0.95);
      visX = homeX + cornerRadius + 16 * u + visH * 0.47;
      stumpW = Math.min(STUMP_W * s, (E + 6 * u - 4) / STUMP_AR); stumpH = stumpW * STUMP_AR;
      stumpX = Math.max(visX + visH * 0.5 + 24 * u, W / 2 - 230 * u); stumpY = E + 6 * u - stumpH;
      boardW = Math.round(BOARD_W * s); boardH = Math.round(boardW * BOARD_AR);
      boardX = Math.round(W - Math.max(6, 20 * u) - boardW); boardY = Math.round(E + 14 * u);
    } else {
      // Between the corner buttons: the visitor (at most 100 px) and the stump stand on the desk edge.
      const bandX = homeX + cornerRadius + 6, bandW = soundX - cornerRadius - 6 - bandX;
      visH = Math.min(100, (E - 4) / 0.95); visX = bandX + visH * 0.47;
      stumpW = Math.max(30, Math.min((bandW - visH * 0.95 - 4) / (HINGE_X + DOOR_K), (E + 3 - 4) / STUMP_AR)); stumpH = stumpW * STUMP_AR;
      stumpX = bandX + visH * 0.95 + 4; stumpY = E + 3 - stumpH;
      // The board takes all the width the mat leaves (6 px edges, a 4 px gap), so its cups stay at least 12 px.
      const matWant = Math.max(2 * 96 + 8, 200), edge = 6;
      boardW = Math.round(W - 2 * edge - 4 - matWant); boardH = Math.round(boardW * BOARD_AR);
      boardX = Math.round(W - edge - boardW); boardY = Math.round(E + 6);
    }
    doorD = DOOR_K * stumpW; hingeX = stumpX + HINGE_X * stumpW; doorCY = stumpY + HOLE_Y * stumpH;
  }
  function fits(): boolean {
    const matTop = portrait ? E + 6 : E + 14 * u, matBottom = rowY - 12 * u;
    if (!portrait && boardY + boardH > rowY - 8) return false;
    if (portrait && boardY + boardH > rowY - 4) return false;
    return matBottom - matTop >= (portrait ? 110 : 150);
  }
  /** The mat, its dishes (each owning its column), the lock plates, the tags and their zones. */
  function placeMat(snap: number): void {
    const edge = portrait ? 6 : Math.max(6, 20 * u);
    matX = Math.round(edge); matY = Math.round(portrait ? E + 6 : E + 14 * u);
    matW = Math.round(portrait ? Math.max(2 * 96 + 8, 200) : boardX - 16 * u - matX); matH = Math.round(rowY - 12 * u - matY);
    if (portrait) matH = Math.round(rowY - 8 - matY);
    inX = matX + matW * 0.06; inY = matY + matH * 0.1; inW = matW * 0.88; inH = matH * 0.8;
    const ar = (k: number): number => { const im = sprites.get(DISH_NAMES[k]!); return im ? im.naturalHeight / im.naturalWidth : 2 / 3; };
    if (!portrait) {
      let sumD = 0; for (const k of DISH_ORDER) sumD += coinD[k]!;
      let kk = Math.min(1.6, (inW - 48 * u) / sumD);
      kk = Math.min(kk, inH / (coinD[QUARTER]! * ar(QUARTER)));
      let total = 0; for (const k of DISH_ORDER) total += coinD[k]! * kk;
      const gap = (inW - total) / 3;
      let x = inX;
      for (let i = 0; i < 4; i++) {
        const k = DISH_ORDER[i]!, w = coinD[k]! * kk, h = w * ar(k), lift = i === 0 || i === 3 ? -10 * u : 0;
        dishW[k] = w; dishH[k] = h; dishX[k] = x + w / 2; dishY[k] = inY + inH / 2 + lift;
        x += w + gap;
      }
      for (let i = 0; i < 4; i++) {
        const k = DISH_ORDER[i]!, prev = i ? DISH_ORDER[i - 1]! : -1, next = i < 3 ? DISH_ORDER[i + 1]! : -1;
        dzX0[k] = prev >= 0 ? (dishX[prev]! + dishW[prev]! / 2 + dishX[k]! - dishW[k]! / 2) / 2 : matX;
        dzX1[k] = next >= 0 ? (dishX[k]! + dishW[k]! / 2 + dishX[next]! - dishW[next]! / 2) / 2 : matX + matW;
        dzY0[k] = matY; dzY1[k] = matY + matH;
      }
    } else {
      // Two dishes by two, each owning a quarter of the mat.
      const cw = (inW - 8) / 2, ch = (inH - 8) / 2;
      for (let i = 0; i < 4; i++) {
        const k = DISH_ORDER[i]!, w = Math.min(cw, ch / ar(k)) * (0.8 + 0.2 * coinD[k]! / coinD[QUARTER]!), h = w * ar(k);
        dishW[k] = w; dishH[k] = h; dishX[k] = inX + (i % 2) * (cw + 8) + cw / 2; dishY[k] = inY + (i >> 1) * (ch + 8) + ch / 2;
        dzX0[k] = matX + (i % 2) * matW / 2; dzX1[k] = dzX0[k]! + matW / 2; dzY0[k] = matY + (i >> 1) * matH / 2; dzY1[k] = dzY0[k]! + matH / 2;
      }
    }
    // Two lock plates stacked in the inner area.
    lockH = Math.max(40, Math.min((inH - 16 * u) / 2, inW / LOCK_AR)); lockW = lockH * LOCK_AR;
    for (let i = 0; i < 2; i++) { lockX[i] = inX + (inW - lockW) / 2; lockY[i] = inY + (inH - 2 * lockH - 16 * u) / 2 + i * (lockH + 16 * u); }
    // The mat's zone: the mat plus the snap distance, never over the row or a corner button.
    zoneX0 = Math.max(0, matX - snap); zoneX1 = Math.min(portrait ? boardX - 2 : boardX - 2, matX + matW + snap);
    zoneY0 = Math.max(cornerY + cornerRadius + 4, matY - snap); zoneY1 = Math.min(rowY - 2, matY + matH + snap);
    // Tags: three in the row (landscape) or stacked from the bottom over the mat and row (portrait).
    if (!portrait) {
      const tw = Math.min(330 * u, (placesW - 48 * u) / 3); tagH = Math.max(96, tw * TAG_AR); tagW = tagH / TAG_AR;
      const gap = Math.max(8, Math.min(24 * u, (placesW - 3 * tagW) / 2));
      const x0 = placesX0 + (placesW - 3 * tagW - 2 * gap) / 2;
      for (let i = 0; i < 3; i++) { tagX[i] = x0 + i * (tagW + gap); tagY[i] = rowY + (rowH - tagH) / 2; }
    } else {
      tagH = 96; tagW = Math.min(W - 2 * edge, tagH / TAG_AR);
      const y0 = H - 6 - 3 * tagH - 8;
      for (let i = 0; i < 3; i++) { tagX[i] = (W - tagW) / 2; tagY[i] = y0 + i * (tagH + 4); }
    }
  }
  /** Cup centres: ten rows of ten in the board's inset, five, a gap, five; a small gap between rows 5 and 6. */
  function placeCups(): void {
    const ix = boardX + boardW * INSET_X0, iy = boardY + boardH * INSET_Y0, iw = boardW * (INSET_X1 - INSET_X0), ih = boardH * (INSET_Y1 - INSET_Y0);
    cupPitch = Math.min(iw / 10.6, ih / 10.4);
    // Cups are 0.86 of the pitch, and at least 12 px where the pitch leaves room (narrow windows).
    cupD = Math.round(Math.min(cupPitch * 0.95, Math.max(12, cupPitch * 0.86)));
    const ox = ix + (iw - cupPitch * 10.6) / 2, oy = iy + (ih - cupPitch * 10.4) / 2;
    for (let i = 0; i < CUPS; i++) {
      const r = Math.floor(i / 10), c = i % 10;
      cupX[i] = ox + cupPitch * (c + 0.5 + (c >= 5 ? 0.6 : 0));
      cupY[i] = oy + cupPitch * (r + 0.5 + (r >= 5 ? 0.4 : 0));
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
    const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
    if (Math.abs(scale - bgScale) > 1e-6) layout(W, H);
    bgScale = scale; bgX = (W - image.naturalWidth * bgScale) / 2; bgY = (H - image.naturalHeight * bgScale) / 2;
    bgCanvas = sprites.scaled(BG, bgScale);
    note(BG, bgScale, 1);
  }
  /** Top of the row line place p sits in. */
  const placeTop = (p: number): number => rowY + Math.floor(p / Math.max(1, Math.ceil(nPlaces / rows))) * (rowH + placeGap);
  /** Place centres: the places spread evenly to the purse's right, in one row or two. */
  function placeCoins(): void {
    const per = Math.max(1, Math.ceil(nPlaces / rows));
    for (let i = 0; i < nPlaces; i++) {
      const r = Math.floor(i / per), j = i % per, m = Math.min(per, nPlaces - r * per);
      const span = m * placeW + (m - 1) * placeGap;
      pX[i] = placesX0 + (placesW - span) / 2 + placeW / 2 + j * (placeW + placeGap);
      pY[i] = rowY + r * (rowH + placeGap) + rowH / 2;
    }
  }

  // ---------------------------------------------------------------- tasks
  const demoDue = (step: number): boolean => !intro && step >= 2 && step <= BUILT_STEP && (data.demos & (1 << step)) === 0;
  let demoStarted = false;
  /** Coins of each kind on a row place, largest first or (a pile) in random order. */
  function arrangeRow(): void {
    pKind.length = 0; pCount.length = 0; pUnlimited.length = 0;
    if (isLock()) {
      // Four stacks that never run out (quarters only when the amount is 25¢ or more).
      for (let k = QUARTER; k >= PENNY; k--) { if (k === QUARTER && !plan.quarters) continue; pKind.push(k); pCount.push(5); pUnlimited.push(true); }
      return;
    }
    let coins = 0, kinds = 0;
    for (let k = 0; k < 4; k++) { coins += plan.coins[k]!; if (plan.coins[k]! > 0) kinds++; }
    const room = Math.max(kinds, maxPlaces);
    if (coins <= room) {
      for (let k = QUARTER; k >= PENNY; k--) for (let n = 0; n < plan.coins[k]!; n++) { pKind.push(k); pCount.push(1); pUnlimited.push(false); }
    } else {
      // One stack per kind; spare places split single coins off the biggest stacks.
      const stack = [0, 0, 0, 0], single = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) stack[k] = plan.coins[k]!;
      let spare = room - kinds;
      while (spare > 0) {
        let best = -1; for (let k = 0; k < 4; k++) if (stack[k]! > 1 && (best < 0 || stack[k]! > stack[best]!)) best = k;
        if (best < 0) break; stack[best]!--; single[best]!++; spare--;
      }
      for (let k = QUARTER; k >= PENNY; k--) {
        for (let n = 0; n < single[k]!; n++) { pKind.push(k); pCount.push(1); pUnlimited.push(false); }
        if (stack[k]! > 0) { pKind.push(k); pCount.push(stack[k]!); pUnlimited.push(false); }
      }
    }
    if (!plan.sorted) {
      // A pile: places in random order.
      for (let i = pKind.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const a = pKind[i]!, b = pCount[i]!; pKind[i] = pKind[j]!; pCount[i] = pCount[j]!; pKind[j] = a; pCount[j] = b;
      }
    }
  }
  function kindsInTask(): number {
    if (isLock()) return plan.quarters ? 4 : 3;
    let k = 0; for (let i = 0; i < 4; i++) if (plan.coins[i]! > 0) k++;
    return k;
  }
  function startTask(i: number): void {
    taskIndex = i;
    if (intro && introStage === 2 && i === 0) plan = introTask();
    else { const ts = taskStep(data.step, i); plan = planTask(ts.step, ts.warmup || intro, i, TIERS[tier].coins, random, lastTotal); }
    lastTotal = plan.total;
    // A narrow window may need a second row of places for this task's kinds: lay out again when that changes.
    const want = kindsInTask();
    if (want !== rowsWanted) { rowsWanted = want; layout(W, H); }
    lit = 0; pourLeft = 0; pourTimer = 0; firstLit = 0; firstPour = 0; cupBase = isLock() ? 50 : 0;
    cupLit.fill(0); cupKind.fill(-1); cupPulse.fill(9); dishN.fill(0); dishPulse.fill(9);
    lockN.fill(0); lockCents.fill(0); lockCur.fill(0); lockPulse.fill(9);
    tagState.fill(0); tagT.fill(0); tagsT = 0; tagFocus = 0; picked = -1; countOnT = -1; countOnReplay = false;
    for (let k = 0; k < 3; k++) tagVal[k] = plan.tags[k] ?? 0;
    visitor = intro ? i % VISITORS.length : (visitorOffset + i) % VISITORS.length;
    taskAssisted = intro || plan.warmup; taskDeliberate = true; taskBounced = false; taskDrops = 0; tagResult = -1; wrongPicks = 0; firstPickDone = false; taskBounces = 0;
    idleT = 0; demoStarted = false; arrowMoved = false;
    taskPhase = 'enter'; taskT = 0; visRise = 0; visSink = 0;
    // The door swings open as the visitor rises.
    if (doorK < 1) { doorFrom = doorK; doorTo = 1; doorT = 0; }
    // Coins left from the last task slide away; the new ones slide out of the purse onto their places.
    for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) launch(LEAVE, pKind[p]!, pFace[p]!, Math.min(5, pCount[p]!), p, pX[p]!, pY[p]!, pX[p]! - W, pY[p]!, LEAVE_SECONDS);
    arrangeRow();
    nPlaces = pKind.length;
    placeCoins();
    const pile = !plan.sorted && !isLock();
    for (let p = 0; p < nPlaces; p++) {
      const n = pCount[p]!; pCount[p] = 0; pHop[p] = 9;
      pFace[p] = random() < 0.5 ? 0 : 1;
      pRot[p] = pile ? (random() - 0.5) * 0.9 : 0;
      pNx[p] = pile ? (random() - 0.5) * 24 * u : 0; pNy[p] = pile ? (random() - 0.5) * 24 * u : 0;
      const f = launch(ARRIVE, pKind[p]!, pFace[p]!, n, p, purseX + purseW * 0.7, purseY + purseH * 0.4, pX[p]!, pY[p]!, ARRIVE_SECONDS);
      if (f) f.t = -RISE * 0.6 - ARRIVE_STAGGER * p;
    }
    purseHop = 0;
    enterSeconds = Math.max(RISE, RISE * 0.6 + ARRIVE_SECONDS + ARRIVE_STAGGER * Math.max(0, nPlaces - 1)) + 0.05;
    if (isLock()) {
      // The visitor fills the first lock itself: its coins fly from the purse, one after another, and light the top rows.
      firstLeft = plan.first[0]! + plan.first[1]! + plan.first[2]! + plan.first[3]!; firstT = RISE;
      enterSeconds = Math.max(enterSeconds, RISE + firstLeft * FIRST_GAP + TO_DISH + 0.6);
    }
    focus = 0;
    play('pop-big', 'D', 2, 0.5);
  }
  /** Whether place p has a coin to give. */
  const available = (p: number): boolean => p >= 0 && p < nPlaces && pCount[p]! > 0;
  const placeOf = (kind: number): number => { for (let p = 0; p < nPlaces; p++) if (pKind[p] === kind && pCount[p]! > 0) return p; return -1; };
  /** The largest coin left in the row (lock: the largest coin the open lock takes), or -1. */
  function bestPlace(): number {
    let best = -1;
    for (let p = 0; p < nPlaces; p++) {
      if (!available(p)) continue;
      if (isLock() && !lockTakes(pKind[p]!, lockCur, plan.total - lockCents[1]! - reservedOpen(), plan.first)) continue;
      if (best < 0 || pKind[p]! > pKind[best]!) best = p;
    }
    return best;
  }
  /** Cents on their way into the open lock. */
  function reservedOpen(): number { let n = 0; for (const f of flights) if (f.active && f.mode === LOCKED) n += COIN_VALUE[f.kind]!; return n; }
  function ensureFocus(): void { const b = bestPlace(); if (b >= 0) focus = b; else if (!available(focus)) for (let p = 0; p < nPlaces; p++) if (available(p)) { focus = p; return; } }
  function keepFocus(): void { if (!available(focus)) ensureFocus(); }
  function moveFocus(step: number): void {
    for (let k = 1; k <= nPlaces; k++) { const p = (focus + step * k + nPlaces * 4) % nPlaces; if (available(p)) { focus = p; return; } }
  }
  function launch(mode: number, kind: number, face: number, n: number, place: number, x0: number, y0: number, x1: number, y1: number, dur: number): Flight | undefined {
    for (const f of flights) {
      if (f.active) continue;
      f.active = true; f.mode = mode; f.kind = kind; f.face = face; f.n = n; f.place = place; f.slot = 0; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1;
      f.t = 0; f.dur = dur; f.s0 = 1; f.s1 = 1; f.giggles = 0;
      return f;
    }
    // Pool full: settle at once so a coin is never lost.
    arrive(mode, kind, face, n, place, 0);
    return undefined;
  }
  /** A coin is pouring or on its way, or the helper is showing: new coins wait (the pressed one hops). */
  const busy = (): boolean => {
    if (pourLeft > 0 || hand.mode === HAND_DEMO) return true;
    for (const f of flights) if (f.active && (f.mode === DISH || f.mode === LOCKED || f.mode === BACK_LOCK)) return true;
    return false;
  };
  /** Size of a coin lying in a dish (rows of five) and where coin `i` of kind `k` lies, into pos. */
  const dishCoinD = (k: number): number => Math.min(coinD[k]! * 0.45, dishW[k]! * 0.74 / 3.2);
  function dishSlot(k: number, i: number, n: number): void {
    const d = dishCoinD(k), row = Math.floor(i / 5), col = i % 5, inRow = Math.min(5, Math.max(1, n - row * 5)), rowsN = Math.ceil(Math.max(n, i + 1) / 5);
    pos.x = dishX[k]! + (col - (inRow - 1) / 2) * d * 0.55;
    pos.y = dishY[k]! + dishH[k]! * 0.04 + ((rowsN - 1) / 2 - row) * d * 0.5;
  }
  /** Coin `i` of `n` in lock `l`: coins at up to 0.7 of the plate's height along the free plank, right of the amount. */
  function lockCoinD(): number { return lockH * 0.62; }
  function lockSlot(l: number, i: number, n: number): void {
    const d = lockCoinD(), x0 = lockX[l]! + lockW * (LOCK_FREE0 + 0.2), x1 = lockX[l]! + lockW * LOCK_FREE1 - d * 0.6;
    const step = Math.min(d * 0.95, (x1 - x0 - d) / Math.max(1, n - 1));
    pos.x = x0 + d / 2 + i * step; pos.y = lockY[l]! + lockH * 0.5;
  }
  /** Send a coin from place `place` to the mat: into its dish (counting) or the open lock (step 4). */
  function dropToMat(kind: number, face: number, place: number, fromX: number, fromY: number, deliberate: boolean, keyed: boolean): void {
    if (!deliberate) taskDeliberate = false;
    taskDrops++; idleT = 0;
    if (!isLock()) {
      const n = dishN[kind]! + countFlights(DISH, kind) + 1;
      dishSlot(kind, n - 1, n);
      const f = launch(DISH, kind, face, 1, place, fromX, fromY, pos.x, pos.y, TO_DISH);
      if (f) { f.s1 = dishCoinD(kind) / coinD[kind]!; f.slot = dishN[kind]! + countFlights(DISH, kind) - 1; }
      return;
    }
    const take = lockTakes(kind, lockCur, plan.total - lockCents[1]! - reservedOpen(), plan.first);
    if (take) {
      lockCur[kind]!++;
      const n = lockN[1]! + countFlights(LOCKED, -1) + 1;
      lockSlot(1, n - 1, Math.max(n, 4));
      const f = launch(LOCKED, kind, face, 1, place, fromX, fromY, pos.x, pos.y, TO_DISH);
      if (f) f.s1 = lockCoinD() / coinD[kind]!;
      return;
    }
    // Not taken: it flies to the lock, jiggles with a smile, and hops home.
    taskBounced = true; bounces++; taskBounces++;
    lockSlot(1, lockN[1]!, Math.max(lockN[1]! + 1, 4));
    const f = launch(BACK_LOCK, kind, face, 1, place, fromX, fromY, pos.x, pos.y, TO_DISH + BACK_HOLD + BACK_HOP);
    if (f) f.s1 = lockCoinD() / coinD[kind]!;
    if (keyed) { const b = bestPlace(); if (b >= 0) focus = b; }
  }
  function countFlights(mode: number, kind: number): number { let n = 0; for (const f of flights) if (f.active && f.mode === mode && (kind < 0 || f.kind === kind)) n++; return n; }
  /** A flight has landed. */
  function arrive(mode: number, kind: number, face: number, n: number, place: number, _slot: number): void {
    if (mode === ARRIVE || mode === RETURN || mode === BACK_LOCK) {
      let p = place;
      if (p < 0 || p >= nPlaces || pKind[p] !== kind) { p = -1; for (let q = 0; q < nPlaces; q++) if (pKind[q] === kind) { p = q; break; } }
      if (p >= 0) { if (!pUnlimited[p] || mode === ARRIVE) pCount[p]! += n; if (mode === ARRIVE) { pHop[p] = 0; play('tick', 'B', 2 + p, 0.35); } }
      // A coin back from the lock: the highlight moves off a stack the lock does not take now.
      if (mode === BACK_LOCK && available(focus) && !lockTakes(pKind[focus]!, lockCur, plan.total - lockCents[1]! - reservedOpen(), plan.first)) ensureFocus();
      return;
    }
    if (mode === DISH) {
      const i = dishN[kind]!;
      if (i < DISH_MAX) dishFace[kind * DISH_MAX + i] = face;
      dishN[kind] = i + 1; dishPulse[kind] = 0;
      play('pop', 'D', 3, 0.7);
      startPour(kind);
      return;
    }
    if (mode === LOCKED || mode === FIRST) {
      const l = mode === FIRST ? 0 : 1, i = lockN[l]!;
      if (i < LOCK_MAX) { lockKind[l * LOCK_MAX + i] = kind; lockFace[l * LOCK_MAX + i] = face; }
      lockN[l] = i + 1; lockCents[l]! += COIN_VALUE[kind]!; lockPulse[l] = 0;
      play('pop', 'D', 3, 0.7);
      if (l === 0) { firstPour += COIN_VALUE[kind]!; if (pourTimer < 0) pourTimer = 0; pourKind = kind; }
      else {
        startPour(kind);
        // The highlight leaves a stack the open lock no longer takes.
        if (available(focus) && !lockTakes(pKind[focus]!, lockCur, plan.total - lockCents[1]! - reservedOpen(), plan.first)) ensureFocus();
      }
    }
  }
  function startPour(kind: number): void { pourLeft += COIN_VALUE[kind]!; pourKind = kind; if (pourTimer < 0) pourTimer = 0; }
  /** Light the next cup of the open area (or of the first lock's rows). */
  function lightCup(first: boolean): void {
    const i = first ? firstLit : cupBase + lit;
    if (i >= CUPS) return;
    cupLit[i] = 1; cupKind[i] = pourKind; cupPulse[i] = 0;
    if (first) firstLit++; else lit++;
    play('tick', 'C', (i % 10), POUR_GAP[pourKind]! < 0.05 ? 0.55 : 0.75);
  }
  function updatePour(dt: number): void {
    if (pourLeft <= 0 && firstPour <= 0) return;
    pourTimer -= dt;
    while ((pourLeft > 0 || firstPour > 0) && pourTimer <= 0) {
      if (firstPour > 0) { lightCup(true); firstPour--; } else { lightCup(false); pourLeft--; }
      pourTimer += POUR_GAP[pourKind]!;
    }
  }
  /** Every coin is in its dish and poured: the dishes count on from the largest. */
  function countDone(): boolean {
    if (pourLeft > 0 || carry.active || hand.mode === HAND_DEMO) return false;
    for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) return false;
    for (const f of flights) if (f.active && f.mode !== LEAVE) return false;
    return true;
  }
  /** The count-on: lit cups regroup by kind, largest first, and each dish pulses with its cups. */
  function startCountOn(replay: boolean): void {
    let i = 0;
    for (const k of DISH_ORDER) for (let c = 0; c < dishN[k]! * COIN_VALUE[k]! && i < CUPS; c++) cupKind[i++] = k;
    countOnT = 0; countOnReplay = replay; countOnAt = -1;
    if (!replay) { taskPhase = 'counton'; tagFocus = 0; }
  }
  /** Which dish the count-on is at (index into DISH_ORDER of non-empty dishes), or -1 when done. */
  function countOnDish(t: number): number {
    let n = 0;
    for (const k of DISH_ORDER) { if (dishN[k]! <= 0) continue; if (t < (n + 1) * COUNT_ON) return k; n++; }
    return -1;
  }
  function updateCountOn(dt: number): void {
    if (countOnT < 0) return;
    countOnT += dt; const before = countOnAt, now = countOnDish(countOnT); countOnAt = now;
    if (now !== before && now >= 0) {
      dishPulse[now] = 0;
      let total = 0, order = 0;
      for (const k of DISH_ORDER) { if (dishN[k]! <= 0) continue; total += dishN[k]! * COIN_VALUE[k]!; if (k === now) break; order++; }
      play('pop', 'C', order * 2, 0.7);
      for (let i = 0; i < CUPS; i++) if (cupLit[i] && cupKind[i] === now) cupPulse[i] = 0;
      if (total <= 20 || total === 25 || total % 10 === 0) playVoice(audio, NUMBER_CLIPS[Math.min(100, total)]!);
    } else if (now < 0) {
      countOnT = -1;
      if (!countOnReplay) { taskPhase = 'tags'; tagsT = 0; idleT = 0; tagFocus = 0; play('pop', 'B', 4, 0.5); }
    }
  }
  /** A tag was chosen. Right: the task is done. Wrong: it tilts, sinks and fades; the dishes count on again. */
  function pickTag(i: number, deliberate: boolean): void {
    if (taskPhase !== 'tags' || tagState[i] !== 0 || tagsT < TAG_RISE) return;
    idleT = 0;
    const right = tagVal[i] === plan.total;
    if (deliberate && !firstPickDone) { firstPickDone = true; tagResult = right ? 1 : 0; }
    if (!right) {
      tagState[i] = 1; tagT[i] = 0; wrongPicks++; visHop = 0;
      for (let g = 0; g < 3; g++) sfxLater[g] = 0.09 * g; sfxLaterOn = true;
      startCountOn(true);
      if (tagFocus === i) for (let k = 1; k < 3; k++) { const j = (i + k) % 3; if (tagState[j] === 0) { tagFocus = j; break; } }
      return;
    }
    picked = i; tagState[i] = 3; tagT[i] = 0;
    for (let k = 0; k < 3; k++) if (k !== i && tagState[k] === 0) { tagState[k] = 4; tagT[k] = 0; }
    play('pop-big', 'C', 4, 0.8);
    playVoice(audio, NUMBER_CLIPS[Math.min(100, plan.total)]!);
    finishTask();
  }
  function updateGiggle(dt: number): void {
    if (!sfxLaterOn) return;
    let any = false;
    for (let g = 0; g < 3; g++) {
      if (sfxLater[g]! >= 9) continue;
      sfxLater[g]! -= dt; any = true;
      if (sfxLater[g]! <= 0) { sfxLater[g] = 9; play('pop', 'A', g === 1 ? 6 : 8, 0.4); }
    }
    sfxLaterOn = any;
  }
  /** Evidence for the task, then the vault sequence. */
  function finishTask(): void {
    if (carry.active) { carry.active = false; carry.keyed = false; launch(RETURN, carry.kind, carry.face, 1, carry.place, input.pointer.x, input.pointer.y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS); }
    if (hand.mode) hand.mode = 0;
    if (!intro && !taskAssisted) {
      if (isLock()) {
        if (taskDeliberate && taskDrops > 0) { recordTask(data, !taskBounced); roundCounted.push(taskBounced ? 0 : 1); }
      } else if (tagResult >= 0) { recordTask(data, tagResult === 1); roundCounted.push(tagResult); }
    }
    doneTag = plan.total; doneLocks = isLock();
    taskPhase = 'done'; seqT = 0; rollEnd = 0;
    if (isLock()) { lockPulse.fill(0); play('pop-big', 'C', 4, 0.8); }
  }
  /** Coins leave the dishes (or locks) and roll in an arc into the vault's doorway, 40 ms apart. */
  function startRoll(): void {
    let n = 0;
    const add = (kind: number, face: number, x: number, y: number, s0: number): void => {
      for (const r of rollers) if (!r.active) { r.active = true; r.kind = kind; r.face = face; r.x0 = x; r.y0 = y; r.s0 = s0; r.t = -ROLL_GAP * n; n++; return; }
    };
    if (doneLocks) {
      for (let l = 0; l < 2; l++) for (let i = 0; i < Math.min(LOCK_MAX, lockN[l]!); i++) {
        lockSlot(l, i, Math.max(lockN[l]!, 4)); add(lockKind[l * LOCK_MAX + i]!, lockFace[l * LOCK_MAX + i]!, pos.x, pos.y, lockCoinD() / coinD[lockKind[l * LOCK_MAX + i]!]!);
      }
      lockN.fill(0);
    } else {
      for (const k of DISH_ORDER) for (let i = 0; i < Math.min(DISH_MAX, dishN[k]!); i++) { dishSlot(k, i, dishN[k]!); add(k, dishFace[k * DISH_MAX + i]!, pos.x, pos.y, dishCoinD(k) / coinD[k]!); }
      dishN.fill(0);
    }
    rollEnd = ROLL_GAP * Math.max(0, n - 1) + ROLL;
    play('whoosh', 'B', 0, 0.6);
  }
  /** The finished-task sequence on its own clock. */
  function updateDone(dt: number): void {
    const prev = seqT; seqT += dt;
    const rollAt = doneLocks ? COUNT_ON : SEQ_TAG, shutAt = rollAt + Math.max(0.3, rollEnd), waveAt = shutAt + SHUT, sinkAt = waveAt + WAVE, endAt = sinkAt + SINK;
    if (prev < rollAt && seqT >= rollAt) { startRoll(); return; }
    if (seqT < rollAt) return;
    if (prev < shutAt && seqT >= shutAt) { doorFrom = 1; doorTo = -1; doorT = 0; }
    if (prev < shutAt + SHUT * 0.9 && seqT >= shutAt + SHUT * 0.9) play('pop-big', 'D', 1, 0.6);
    if (prev < waveAt && seqT >= waveAt) { play('go', 'C', 0, 0.7); }
    if (prev < sinkAt && seqT >= sinkAt) { visSink = 0.0001; }
    if (seqT >= endAt) {
      // The board's cups go out; the door swings open as the next visitor rises.
      cupLit.fill(0); lit = 0; firstLit = 0;
      if (introStage === 1) { introStage = 2; startTask(0); return; }
      if (taskIndex + 1 < tasksTotal) startTask(taskIndex + 1);
      else finishRound();
    }
  }
  /** The introduction's goal: the dishes hold a dime and two pennies, twelve cups lit, the 12¢ tag on the door. */
  function startGoal(): void {
    introStage = 1; plan = introTask(); taskIndex = 0; visitor = 0;
    dishN.fill(0); dishN[DIME] = 1; dishN[PENNY] = 2; dishFace.fill(0);
    cupLit.fill(0); for (let i = 0; i < 12; i++) { cupLit[i] = 1; cupKind[i] = i < 10 ? DIME : PENNY; }
    lit = 12; nPlaces = 0; doneTag = 12; doneLocks = false; picked = -1; tagState.fill(2);
    visRise = RISE; visSink = 0; doorK = 1; doorT = 9;
    taskPhase = 'done'; seqT = -GOAL_HOLD; rollEnd = 0; taskT = 0;
  }
  /** A step's first-time demonstration: the helper carries a coin, then taps the next useful one. */
  function startDemo(step: number): void {
    data.demos |= 1 << step; taskAssisted = true; demoStarted = true;
    let p = -1;
    if (isLock()) {
      // A different coin from the first lock's largest: the largest coin the open lock takes that is smaller than it.
      let top = 0; for (let k = 0; k < 4; k++) if (plan.first[k]! > 0) top = k;
      for (let q = 0; q < nPlaces; q++) if (available(q) && pKind[q]! < top && lockTakes(pKind[q]!, lockCur, plan.total, plan.first) && (p < 0 || pKind[q]! > pKind[p]!)) p = q;
    }
    if (p < 0) p = bestPlace();
    if (p < 0) return;
    startHand(p, pKind[p]!, 1);
  }
  function startHand(place: number, kind: number, after: number): void {
    hand.mode = HAND_DEMO; hand.t = 0; hand.place = place; hand.kind = kind; hand.released = false; hand.taken = false; hand.after = after;
  }
  // ---------------------------------------------------------------- round
  function startRound(): void {
    pending = null; data.pending = null; bookGlide = false;
    tier = services.debug.tier ?? toTier(data.tier);
    intro = data.rounds === 0;
    visitorOffset = data.rounds % VISITORS.length;
    phase = 'play'; phaseT = time = idleT = 0;
    tasksTotal = intro ? 3 : TIERS[tier].tasks;
    hits = misses = bounces = 0; stars = 1; starsPlayed = 0; focus = 0; roundCounted.length = 0;
    carry.active = false; carry.keyed = false; hand.mode = 0; introStage = 0; doorK = 1; doorT = 9;
    particles.clear(); for (const f of flights) f.active = false; for (const r of rollers) r.active = false;
    nPlaces = 0; lastTotal = 0;
    plan = introTask(); rowsWanted = 3;
    layout(W, H);
    if (intro) startGoal(); else startTask(0);
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
    pending = { id, stars, tasks: tasksTotal, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, tier, visitorOffset: intro ? 0 : visitorOffset };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += stars;
    services.save.flush();
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; carry.active = false; carry.keyed = false; hand.mode = 0; cornerFocus = -1;
    for (const f of flights) f.active = false; for (const r of rollers) r.active = false; particles.clear(); doorK = -1; doorT = 9;
    layout(W, H);
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
    for (let a = 0; a < VISITORS.length; a++) { add(VISITOR_NAMES[a]![1], celebVisitorSize(a)); add(VISITOR_NAMES[a]![1], restSize * 0.62); }
    add(LOCK, lockW); add(TAG, tagW);
    add(BUTTON_PLAY, controlsRadius * 1.3); add(BUTTON_HOME, controlsRadius * 1.3);
  }
  /** Each visitor's happy pose on the desk edge in the celebration, as drawSprite's longest side. */
  function celebVisitorSize(a: number): number {
    const img = sprites.get(VISITOR_NAMES[a]![1]), wait = sprites.get(VISITOR_NAMES[a]![0]);
    if (!img || !wait) return 0;
    const h = visH * 0.8 * img.naturalHeight / wait.naturalHeight;
    return Math.max(h, h * img.naturalWidth / img.naturalHeight);
  }
  /**
   * Idle periods with at least 4 ms left: the fanfare a step at a time, then one planned sprite canvas each. A callback
   * that timed out, or a wait of IDLE_WAIT_MS over many short idle periods, runs one step anyway.
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
      if (warmDone.has(key) || size <= 0) continue;
      const img = sprites.get(name); if (!img) continue;
      sprites.scaled(name, size / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
      madeName = name; madeSize = size; warmIndex++; idleWaitFrom = -1;
      return;
    }
  }
  function warm(ctx: CanvasRenderingContext2D): void {
    if (madeName) { ctx.globalAlpha = 0.01; drawSprite(ctx, sprites, madeName, W / 2, H / 2, madeSize); ctx.globalAlpha = 1; warmDone.add(`${madeName}@${madeSize}`); madeName = ''; }
  }
  function askIdle(): void {
    if (idleHandle) return;
    if ((fanfareStarted && !fanfareAsked) || (playable() && time >= 0.5 && warmIndex < warmNames.length)) {
      const now = performance.now();
      if (idleWaitFrom < 0) idleWaitFrom = now;
      IDLE_OPTIONS.timeout = Math.max(1, IDLE_WAIT_MS - (now - idleWaitFrom));
      idleHandle = requestIdleCallback(prepareIdle, IDLE_OPTIONS);
    }
  }
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; idleWaitFrom = -1; }

  // ---------------------------------------------------------------- update
  /** Where a coin of `kind` goes on the mat now, into pos: its dish's next place, or the open lock's next slot. */
  function targetPoint(kind: number): void {
    if (isLock()) { const n = lockN[1]! + countFlights(LOCKED, -1) + 1; lockSlot(1, n - 1, Math.max(n, 4)); return; }
    const n = dishN[kind]! + countFlights(DISH, kind) + 1;
    dishSlot(kind, n - 1, n);
  }
  function updateHand(dt: number): void {
    if (!hand.mode) return;
    hand.t += dt;
    if (hand.mode === HAND_TAP) { hand.place = placeOf(hand.kind); if (hand.place < 0) { const b = bestPlace(); if (b >= 0) { hand.place = b; hand.kind = pKind[b]!; } } return; }
    if (hand.mode === HAND_DEMO && !hand.taken && hand.t >= HAND_CARRY_AT) {
      // The hand takes the real coin off its place (waiting while it is still sliding in).
      if (available(hand.place) && pKind[hand.place] === hand.kind) { if (!pUnlimited[hand.place]) pCount[hand.place]!--; hand.taken = true; }
      else { const p = placeOf(hand.kind); if (p >= 0) hand.place = p; hand.t = HAND_CARRY_AT; return; }
    }
    if (!hand.released && hand.t >= HAND_DROP_AT) {
      hand.released = true;
      if (hand.mode === HAND_DEMO) { handTip(); dropToMat(hand.kind, pFace[hand.place] ?? 0, hand.place, pos.x, pos.y, false, false); }
    }
    if (hand.t >= HAND_DROP_AT + HAND_FADE) {
      if (hand.mode === HAND_DEMO && hand.after >= 0) {
        // Then the hand rests on the next useful coin and taps it until the child acts.
        const b = bestPlace();
        if (b >= 0) { hand.mode = HAND_TAP; hand.t = 0; hand.place = b; hand.kind = pKind[b]!; } else hand.mode = 0;
      } else hand.mode = 0;
      idleT = 0;
    }
  }
  /** After quiet seconds the see-through hint carries a coin that helps now to where it goes (never at the tags). */
  function startHint(): void {
    const best = bestPlace();
    if (best < 0) return;
    hand.mode = HAND_HINT; hand.t = 0; hand.place = best; hand.kind = pKind[best]!; hand.released = false; hand.taken = false; hand.after = -1;
    // A lock hint points at the answer: the task then records nothing. A counting hint does not point at the tag.
    if (isLock()) taskAssisted = true;
  }
  function updateTask(dt: number): void {
    taskT += dt;
    if (visRise < RISE) visRise = Math.min(RISE, visRise + dt);
    if (visSink > 0) visSink = Math.min(SINK, visSink + dt);
    updatePour(dt);
    if (taskPhase === 'enter') {
      if (isLock() && firstLeft > 0 && taskT >= firstT) {
        // The visitor's coins fly from its purse into the first lock.
        const all = plan.first[0]! + plan.first[1]! + plan.first[2]! + plan.first[3]!, i = all - firstLeft;
        let kind = QUARTER, c = i;
        for (let k = QUARTER; k >= PENNY; k--) { if (c < plan.first[k]!) { kind = k; break; } c -= plan.first[k]!; }
        lockSlot(0, i, Math.max(all, 4));
        const f = launch(FIRST, kind, i % 2, 1, -1, visX, E + visH * 0.02, pos.x, pos.y, TO_DISH + 0.1);
        if (f) f.s1 = lockCoinD() / coinD[kind]!;
        firstLeft--; firstT += FIRST_GAP;
      }
      if (intro && introStage === 2 && taskIndex === 0 && !demoStarted && taskT >= RISE + INTRO_HAND_AT) {
        demoStarted = true; const p = placeOf(DIME); if (p >= 0) startHand(p, DIME, 1);
      }
      if (taskT >= enterSeconds && firstPour <= 0 && countFlights(FIRST, -1) === 0) {
        taskPhase = isLock() ? 'lock' : 'count'; idleT = 0; ensureFocus();
        if (!demoStarted && !plan.warmup && demoDue(plan.step)) startDemo(plan.step);
      }
      return;
    }
    if (taskPhase === 'count') {
      if (countDone()) startCountOn(false);
    } else if (taskPhase === 'lock') {
      if (lockCents[1] === plan.total && pourLeft <= 0 && countFlights(LOCKED, -1) === 0) finishTask();
    } else if (taskPhase === 'tags') {
      tagsT += dt;
    } else if (taskPhase === 'done') { updateDone(dt); return; }
    updateCountOn(dt);
    // Idle help: the hint carries a coin; at the tags the dishes count on again instead.
    const wait = wrongPicks >= 2 || taskBounces >= 2 ? IDLE_SOON : IDLE_SECONDS;
    if ((taskPhase === 'count' || taskPhase === 'lock' || taskPhase === 'tags') && !hand.mode && !carry.active && !busy() && countOnT < 0 && idleT >= wait) {
      if (taskPhase === 'tags') startCountOn(true); else startHint();
      idleT = wait - IDLE_REPEAT;
    }
  }
  function updatePlay(dt: number): void {
    time += dt; idleT += dt;
    purseHop += dt; visHop += dt; matHop += dt;
    for (let p = 0; p < MAX_PLACES; p++) pHop[p]! += dt;
    for (let k = 0; k < CUPS; k++) cupPulse[k]! += dt;
    for (let k = 0; k < 4; k++) dishPulse[k]! += dt;
    lockPulse[0]! += dt; lockPulse[1]! += dt;
    for (let k = 0; k < 3; k++) tagT[k]! += dt;
    if (doorT < 9) { doorT += dt; const k = clamp01(doorT / SHUT); doorK = lerp(doorFrom, doorTo, easeInOutSine(k)); if (k >= 1) doorT = 9; }
    refillStacks();
    updateTask(dt);
    updateHand(dt);
    updateGiggle(dt);
    for (let k = 0; k < 3; k++) if (tagState[k] === 1 && tagT[k]! >= TAG_TILT + TAG_FADE) tagState[k] = 2;
    if ((taskPhase === 'count' || taskPhase === 'lock') && !carry.active) keepFocus();
  }
  /** Lock stacks never run out. */
  function refillStacks(): void { for (let p = 0; p < nPlaces; p++) if (pUnlimited[p] && pCount[p]! < 5) pCount[p] = 5; }
  function updateFlights(dt: number): void {
    for (const f of flights) {
      if (!f.active) continue;
      f.t += dt;
      if (f.mode === BACK_LOCK) while (f.giggles < 3 && f.t >= TO_DISH + f.giggles * 0.09) { if (f.giggles === 0) visHop = 0; play('pop', 'A', f.giggles === 1 ? 6 : 8, 0.4); f.giggles++; }
      if (f.t >= f.dur) { f.active = false; arrive(f.mode, f.kind, f.face, f.n, f.place, f.slot); }
    }
    for (const r of rollers) { if (!r.active) continue; r.t += dt; if (r.t >= ROLL) r.active = false; }
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
    note(COIN_FACES[kind]![face]!, d * scale, COIN_PX);
  }
  /** A coin drawn at `d` px across (dish and lock coins use their own cached size). */
  function smallCoin(ctx: CanvasRenderingContext2D, kind: number, face: number, x: number, y: number, d: number): void {
    drawSprite(ctx, sprites, COIN_FACES[kind]![face]!, x, y, Math.round(d));
    note(COIN_FACES[kind]![face]!, d, COIN_PX);
  }
  function sprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, rot = 0, sx = 1, sy = 1): void {
    const img = sprites.get(name); if (!img) return;
    drawSprite(ctx, sprites, name, x, y, size, rot, sx, sy);
    note(name, size * Math.max(Math.abs(sx), Math.abs(sy)), Math.max(img.naturalWidth, img.naturalHeight));
  }
  /** The visitor peeking over the desk edge, its waiting pose's body cut on the edge; clipped at the edge as it rises and sinks. */
  function renderVisitor(ctx: CanvasRenderingContext2D): void {
    const a = visitor % VISITORS.length, waitImg = sprites.get(VISITOR_NAMES[a]![0]);
    if (!waitImg) return;
    const happy = taskPhase === 'done' && seqT >= SEQ_TAG && (introStage !== 1 || seqT >= 0);
    const pose = happy ? 1 : 0, img = sprites.get(VISITOR_NAMES[a]![pose]) ?? waitImg;
    const k = visH / waitImg.naturalHeight, h = img.naturalHeight * k, w = img.naturalWidth * k, cut = pose ? CUT_HAPPY : CUT_WAIT[a]!;
    const up = easeOutCubic(clamp01(visRise / RISE)) * (1 - easeInCubic(clamp01(visSink / SINK)));
    const hop = visHop < 0.42 ? Math.sin(visHop / 0.42 * Math.PI) * 10 * u : 0;
    const top = E - cut * h + (1 - up) * h * cut - hop;
    const wave = happy ? Math.sin(time * 9) * 0.05 : Math.sin(time * 2.1) * 0.01;
    // Below the edge only the sack shows, and only as far as the visitor has risen.
    const clipBottom = E + (1 - cut) * h * up;
    ctx.save(); ctx.beginPath(); ctx.rect(0, -H, W, clipBottom + H); ctx.clip();
    drawSprite(ctx, sprites, VISITOR_NAMES[a]![pose], visX, top + h / 2, Math.max(w, h), wave);
    ctx.restore();
    note(VISITOR_NAMES[a]![pose], Math.max(w, h), Math.max(img.naturalWidth, img.naturalHeight));
  }
  /** The stump vault and its round door, hinged on the doorway ring's right edge (scale 1 open, -1 shut). */
  function renderVault(ctx: CanvasRenderingContext2D, amount: number): void {
    sprite(ctx, STUMP, stumpX + stumpW / 2, stumpY + stumpH / 2, stumpW);
    const door = sprites.scaled(DOOR, doorD / 420);
    if (!door) return;
    const pr = sprites.pixelRatio, w = door.width / pr, h = door.height / pr;
    ctx.save(); ctx.translate(hingeX, doorCY); ctx.scale(doorK, 1);
    ctx.drawImage(door, 0, -h / 2, w, h);
    ctx.restore();
    note(DOOR, doorD, 420);
    // The tag's amount stays on the door's plate as a keepsake (not shown mid-swing).
    if (amount > 0 && Math.abs(doorK) > 0.6 && doorStrip.canvas) {
      const cx = hingeX + doorK * doorD * (PLATE_X0 + PLATE_X1) / 2, cy = doorCY - doorD / 2 + doorD * (PLATE_Y0 + PLATE_Y1) / 2;
      drawAmount(ctx, doorStrip, amount, cx, cy, 1, doorD * (PLATE_X1 - PLATE_X0) * 0.9);
    }
  }
  function renderBoard(ctx: CanvasRenderingContext2D): void {
    sprite(ctx, BOARD, boardX + boardW / 2, boardY + boardH / 2, boardW);
    if (!cupOn || !cupOff) return;
    const cw = cupOn.width / artRatio, lock = isLock() && introStage !== 1;
    for (let i = 0; i < CUPS; i++) {
      // Lock tasks show only each lock's amount: the first lock's in rows 1 to 5, the open lock's in rows 6 to 10.
      if (lock && (i < 50 ? i >= plan.total : i - 50 >= plan.total)) continue;
      const on = cupLit[i] === 1, p = cupPulse[i]!, cx = cupX[i]!, cy = cupY[i]!;
      const sc = p < 0.3 ? 1 + Math.sin(p / 0.3 * Math.PI) * 0.3 : 1;
      if (on && glowCanvas && p < 0.35) { const g = cupD * 2.6; ctx.globalAlpha = 1 - p / 0.35; ctx.drawImage(glowCanvas, cx - g / 2, cy - g / 2, g, g); ctx.globalAlpha = 1; }
      const w = cw * sc;
      ctx.drawImage(on ? cupOn : cupOff, cx - w / 2, cy - w / 2, w, w);
    }
  }
  function renderMat(ctx: CanvasRenderingContext2D): void {
    if (matCanvas) ctx.drawImage(matCanvas, matX, matY, matW, matH);
    if (isLock() && introStage !== 1) { renderLocks(ctx); return; }
    for (const k of DISH_ORDER) {
      const p = dishPulse[k]!, s = p < 0.35 ? 1 + Math.sin(p / 0.35 * Math.PI) * 0.06 : 1;
      sprite(ctx, DISH_NAMES[k]!, dishX[k]!, dishY[k]!, dishW[k]! * s);
      const n = Math.min(DISH_MAX, dishN[k]!), d = dishCoinD(k) * s;
      for (let i = 0; i < n; i++) { dishSlot(k, i, n); smallCoin(ctx, k, dishFace[k * DISH_MAX + i]!, dishX[k]! + (pos.x - dishX[k]!) * s, dishY[k]! + (pos.y - dishY[k]!) * s, d); }
    }
  }
  function renderLocks(ctx: CanvasRenderingContext2D): void {
    for (let l = 0; l < 2; l++) {
      const p = lockPulse[l]!, s = p < 0.35 ? 1 + Math.sin(p / 0.35 * Math.PI) * 0.04 : 1;
      sprite(ctx, LOCK, lockX[l]! + lockW / 2, lockY[l]! + lockH / 2, lockW * s);
      // The amount on the plank just right of the padlock.
      if (lockStrip.canvas) drawAmount(ctx, lockStrip, plan.total, lockX[l]! + lockW * (LOCK_FREE0 + 0.1), lockY[l]! + lockH / 2, 1, lockW * 0.18);
      const n = Math.min(LOCK_MAX, lockN[l]!), d = lockCoinD();
      for (let i = 0; i < n; i++) { lockSlot(l, i, Math.max(n, 4)); smallCoin(ctx, lockKind[l * LOCK_MAX + i]!, lockFace[l * LOCK_MAX + i]!, pos.x, pos.y, d); }
    }
  }
  /** An amount in cents from a baked glyph strip, centred on (cx, cy), shrunk to fit `maxW`. */
  function drawAmount(ctx: CanvasRenderingContext2D, s: Strip, cents: number, cx: number, cy: number, k: number, maxW: number): void {
    const atlas = s.canvas; if (!atlas) return;
    const h = Math.floor(cents / 100), t = Math.floor(cents / 10) % 10, o = cents % 10;
    let w = s.w[o]! + s.w[CENT]!;
    if (cents >= 10) w += s.w[t]!;
    if (cents >= 100) w += s.w[h]!;
    const kk = Math.min(k, maxW / (w || 1));
    let x = Math.round(cx - w * kk / 2);
    if (cents >= 100) x = glyph(ctx, s, h, x, cy, kk);
    if (cents >= 10) x = glyph(ctx, s, t, x, cy, kk);
    x = glyph(ctx, s, o, x, cy, kk);
    glyph(ctx, s, CENT, x, cy, kk);
  }
  function glyph(ctx: CanvasRenderingContext2D, s: Strip, g: number, x: number, cy: number, k: number): number {
    const atlas = s.canvas!, r = artRatio, sx = Math.max(0, (s.x[g]! - s.pad) * r), sw = (s.w[g]! + 2 * s.pad) * r, dh = atlas.height / r * k;
    ctx.drawImage(atlas, sx, 0, sw, atlas.height, Math.round(x - s.pad * k), Math.round(cy - dh / 2), sw / r * k, dh);
    return x + s.w[g]! * k;
  }
  function renderRow(ctx: CanvasRenderingContext2D): void {
    // The purse slides out to the left once the tags rise.
    const out = taskPhase === 'tags' ? easeInCubic(clamp01(tagsT / TAG_RISE)) : 0;
    if (purseW > 0 && !(taskPhase === 'done' && !doneLocks)) {
      const tip = purseHop < 0.5 ? Math.sin(purseHop / 0.5 * Math.PI) * 0.25 : 0;
      sprite(ctx, PURSE, purseX + purseW / 2 - out * (purseW + 40), purseY + purseH / 2, purseW, -tip);
    }
    const showFocus = (taskPhase === 'count' || taskPhase === 'lock') && !carry.active && hand.mode !== HAND_DEMO;
    for (let p = 0; p < nPlaces; p++) {
      const n = pCount[p]!; if (n <= 0) continue;
      const kind = pKind[p]!, d = coinD[kind]!, hopK = pHop[p]! < 0.35 ? Math.sin(pHop[p]! / 0.35 * Math.PI) : 0;
      const x = pX[p]! + pNx[p]!, y = pY[p]! + pNy[p]! - hopK * 14 * u;
      const under = Math.min(4, n - 1);
      for (let k = under; k >= 1; k--) coin(ctx, kind, pFace[p]!, x + k * 3 * u, y + k * 5 * u, 1, pRot[p]!, 1);
      if (showFocus && p === focus) focusMark(ctx, x, y, d * 0.5);
      coin(ctx, kind, pFace[p]!, x, y, 1, pRot[p]!, 1);
    }
  }
  /** The keyboard highlight: a warm ring and a bobbing arrow above. */
  function focusMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const bob = Math.abs(Math.sin(time * 3)) * 8 * u;
    ctx.beginPath(); ctx.arc(x, y, r + 9 * u, 0, Math.PI * 2);
    ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
    const ty = y - r - 16 * u - bob;
    ctx.beginPath(); ctx.moveTo(x - 15 * u, ty - 20 * u); ctx.lineTo(x + 15 * u, ty - 20 * u); ctx.lineTo(x, ty); ctx.closePath();
    ctx.fillStyle = HIGHLIGHT; ctx.fill(); ctx.lineWidth = 3 * u; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  function renderTags(ctx: CanvasRenderingContext2D): void {
    if (taskPhase !== 'tags' && !(taskPhase === 'done' && !doneLocks && introStage !== 1)) return;
    for (let i = 0; i < 3; i++) {
      const st = tagState[i]!; if (st === 2) continue;
      const t = tagT[i]!, rise = taskPhase === 'tags' ? easeOutCubic(clamp01((tagsT - i * 0.08) / TAG_RISE)) : 1;
      let x = tagX[i]! + tagW / 2, y = tagY[i]! + tagH / 2 + (1 - rise) * (H - tagY[i]!), rot = 0, s = 1, a = 1;
      if (st === 1) {
        if (t < TAG_TILT) rot = Math.sin(t / TAG_TILT * Math.PI * 2) * 0.12;
        else { const k = clamp01((t - TAG_TILT) / TAG_FADE); y += k * tagH * 0.6; a = 1 - k; }
      } else if (st === 4) { a = 1 - clamp01(t / 0.25); }
      else if (st === 3) {
        // The picked tag lifts, then flies to the door's plate, shrinking to it; then the door carries the amount.
        const k = clamp01(t / SEQ_TAG), e = easeInOutSine(k);
        const px = hingeX + doorD * (PLATE_X0 + PLATE_X1) / 2, py = doorCY - doorD / 2 + doorD * (PLATE_Y0 + PLATE_Y1) / 2;
        x = lerp(x, px, e); y = lerp(y, py, e) - Math.sin(k * Math.PI) * 60 * u;
        s = lerp(1.08, doorD * (PLATE_X1 - PLATE_X0) / (tagW * (TAG_FACE1 - TAG_FACE0)), e);
        if (k >= 1) continue;
      }
      if (a <= 0) continue;
      if (taskPhase === 'tags' && st === 0 && i === tagFocus) {
        ctx.beginPath(); ctx.roundRect(x - tagW / 2 - 8, y - tagH / 2 - 8, tagW + 16, tagH + 16, 18 * u);
        ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
      }
      if (a < 1) ctx.globalAlpha = a;
      if (rot !== 0 || s !== 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-x, -y); }
      sprite(ctx, TAG, x, y, tagW);
      if (s > 1) note(TAG, tagW * s, 640);
      drawAmount(ctx, tagStrip, tagVal[i]!, x - tagW / 2 + tagW * (TAG_FACE0 + TAG_FACE1) / 2, y, 1, tagW * (TAG_FACE1 - TAG_FACE0) * 0.86);
      if (rot !== 0 || s !== 1) ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  function renderFlights(ctx: CanvasRenderingContext2D): void {
    for (const f of flights) {
      if (!f.active || f.t < 0) continue;
      const kind = f.kind;
      if (f.mode === ARRIVE || f.mode === LEAVE || f.mode === RETURN) {
        const k = clamp01(f.t / f.dur), e = f.mode === LEAVE ? easeInCubic(k) : easeOutCubic(k);
        const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * (f.mode === ARRIVE ? 50 : f.mode === RETURN ? 40 : 0) * u;
        // Sliding out of the purse, the coin spins and settles.
        const spin = f.mode === ARRIVE ? (1 - e) * Math.PI * 4 : 0, c = Math.cos(spin);
        const under = Math.min(4, f.n - 1), sc = f.mode === ARRIVE ? lerp(0.5, 1, e) : 1;
        for (let j = under; j >= 1; j--) coin(ctx, kind, f.face, x + j * 3 * u, y + j * 5 * u, sc, 0, 1);
        coin(ctx, kind, f.face, x, y, sc, f.mode === RETURN ? k * 4 : 0, Math.max(0.08, Math.abs(c)));
        continue;
      }
      if (f.mode === BACK_LOCK && f.t >= TO_DISH) {
        const t = f.t - TO_DISH;
        if (t < BACK_HOLD) { coin(ctx, kind, f.face, f.x1 + Math.sin(t * 40) * 3 * u, f.y1, f.s1, 0, 1); continue; }
        const k = clamp01((t - BACK_HOLD) / BACK_HOP), e = easeInOutSine(k);
        coin(ctx, kind, f.face, lerp(f.x1, pX[f.place] ?? f.x0, e), lerp(f.y1, pY[f.place] ?? f.y0, e) - Math.sin(k * Math.PI) * 110 * u, lerp(f.s1, 1, e), k * Math.PI * 2, 1);
        continue;
      }
      // DISH, LOCKED, FIRST and the outward part of BACK_LOCK: an arc onto the mat, shrinking to the dish or lock size.
      const k = clamp01(f.t / TO_DISH), e = easeOutCubic(k);
      coin(ctx, kind, f.face, lerp(f.x0, f.x1, e), lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 70 * u, lerp(f.s0, f.s1, e), 0, 1);
    }
  }
  /** Coins rolling in an arc into the vault's doorway, shrinking as they go in. */
  function renderRollers(ctx: CanvasRenderingContext2D): void {
    const hx = stumpX + stumpW * HOLE_X, hy = stumpY + stumpH * HOLE_Y;
    for (const r of rollers) {
      if (!r.active) continue;
      if (r.t < 0) { coin(ctx, r.kind, r.face, r.x0, r.y0, r.s0, 0, 1); continue; }
      const k = clamp01(r.t / ROLL), e = easeInOutSine(k), s = lerp(r.s0, r.s0 * 0.6, e);
      if (k > 0.85) ctx.globalAlpha = 1 - (k - 0.85) / 0.15;
      coin(ctx, r.kind, r.face, lerp(r.x0, hx, e), lerp(r.y0, hy, e) - Math.sin(k * Math.PI) * 90 * u, s, k * 8, 1);
      ctx.globalAlpha = 1;
    }
  }
  function handTip(): void {
    const tx = (pX[hand.place] ?? W / 2) + (pNx[hand.place] ?? 0), ty = (pY[hand.place] ?? H) + (pNy[hand.place] ?? 0);
    if (hand.mode === HAND_TAP) { pos.x = tx + coinD[PENNY]! * 0.1; pos.y = ty + coinD[PENNY]! * 0.1 - Math.abs(Math.sin(hand.t * 3.2)) * 22 * u; return; }
    targetPoint(hand.kind);
    const sx = pos.x, sy = pos.y, t = hand.t;
    if (t < HAND_PRESS_AT) { const e = easeOutCubic(t / HAND_PRESS_AT); pos.x = lerp(tx + 60 * u, tx, e); pos.y = lerp(H + 40, ty, e); }
    else if (t < HAND_CARRY_AT) { pos.x = tx; pos.y = ty; }
    else if (t < HAND_DROP_AT) { const e = easeInOutSine((t - HAND_CARRY_AT) / (HAND_DROP_AT - HAND_CARRY_AT)); pos.x = lerp(tx, sx, e); pos.y = lerp(ty, sy, e) - Math.sin(e * Math.PI) * 90 * u; }
    else { pos.x = sx; pos.y = sy; }
  }
  function renderHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.mode || (hand.mode === HAND_TAP && hand.place < 0)) return;
    handTip();
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(HAND_H * u), hw = hs * img.naturalWidth / img.naturalHeight, t = hand.t, kind = hand.kind;
    let alpha = hand.mode === HAND_HINT ? 0.85 : 1;
    if (hand.mode !== HAND_TAP && t > HAND_DROP_AT) alpha *= 1 - clamp01((t - HAND_DROP_AT) / HAND_FADE);
    if (hand.mode !== HAND_TAP && t < HAND_PRESS_AT) alpha *= clamp01(t / 0.3);
    const carrying = hand.mode !== HAND_TAP && t >= HAND_CARRY_AT && t < HAND_DROP_AT && (hand.mode === HAND_HINT || hand.taken);
    if (carrying || (hand.mode === HAND_HINT && t >= HAND_DROP_AT)) {
      const ghost = hand.mode === HAND_HINT;
      if (ghost && glowCanvas) { const g = glowSize; ctx.globalAlpha = alpha * (0.85 + Math.sin(time * 7) * 0.15); ctx.drawImage(glowCanvas, pos.x - g / 2, pos.y - g / 2, g, g); }
      ctx.globalAlpha = ghost ? alpha * 0.6 : 1; coin(ctx, kind, pFace[hand.place] ?? 0, pos.x, pos.y, 1, 0, 1); ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = alpha;
    const press = (t >= HAND_PRESS_AT && t < HAND_CARRY_AT && hand.mode !== HAND_TAP) || (hand.mode === HAND_TAP && Math.abs(Math.sin(hand.t * 3.2)) < 0.15) ? 0.9 : 1;
    // The art's fingertip is at its top left corner: put it on the target.
    drawSprite(ctx, sprites, HAND, pos.x + hw * 0.42, pos.y + hs * 0.44, hs, 0, press, press);
    note(HAND, hs, img.naturalHeight);
    ctx.globalAlpha = 1;
  }
  /** Keyboard carry is not used: a key sends the highlighted coin straight to the mat. */
  function renderPlay(ctx: CanvasRenderingContext2D): void {
    renderVault(ctx, taskPhase === 'done' && (introStage === 1 || doneLocks || (picked >= 0 && tagT[picked]! >= SEQ_TAG)) ? doneTag : 0);
    renderVisitor(ctx);
    renderBoard(ctx);
    renderMat(ctx);
    renderRow(ctx);
    renderTags(ctx);
    renderFlights(ctx);
    renderRollers(ctx);
    if (carry.active) coin(ctx, carry.kind, carry.face, input.pointer.x, input.pointer.y, 1.12, 0, 1);
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
    // A soft cream disc under each offer, like the paper the desk is drawn on.
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
  /** The round's visitors on the desk edge, happy and waving, popping up one after another. */
  function renderCelebVisitors(ctx: CanvasRenderingContext2D, from: number, n: number): void {
    // Spread along the desk edge on both sides of the vault, clear of the corner buttons.
    const l0 = homeX + cornerRadius + 8, l1 = stumpX - 8, r0 = stumpX + stumpW + 8, r1 = soundX - cornerRadius - 8;
    const lw = Math.max(0, l1 - l0), rw = Math.max(0, r1 - r0);
    const nl = Math.min(n, Math.max(lw > 0 ? 1 : 0, Math.round(n * lw / ((lw + rw) || 1))));
    for (let i = 0; i < n; i++) {
      const a = (from + i) % VISITORS.length, img = sprites.get(VISITOR_NAMES[a]![1]), wait = sprites.get(VISITOR_NAMES[a]![0]);
      if (!img || !wait) continue;
      const k = visH * 0.8 / wait.naturalHeight, h = img.naturalHeight * k, w = img.naturalWidth * k;
      const pop = easeOutCubic(clamp01((phaseT - 0.15 * i) / 0.4));
      const left = i < nl, j = left ? i : i - nl, m = left ? nl : n - nl;
      const x = left ? l0 + lw * (j + 0.5) / m : r0 + rw * (j + 0.5) / m, y = E - h * CUT_HAPPY * pop + h / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(0, -H, W, E + H); ctx.clip();
      drawSprite(ctx, sprites, VISITOR_NAMES[a]![1], x, y - Math.abs(Math.sin(time * 4 + i)) * 6 * u, Math.max(w, h), Math.sin(time * 6 + i * 1.3) * 0.06);
      ctx.restore();
      note(VISITOR_NAMES[a]![1], Math.max(w, h), Math.max(img.naturalWidth, img.naturalHeight));
    }
  }
  function renderResult(ctx: CanvasRenderingContext2D): void {
    const starT = phase === 'celebration' ? phaseT - STAR_START : 99;
    if (matCanvas) ctx.drawImage(matCanvas, matX, matY, matW, matH);
    renderVault(ctx, 0);
    if (phase === 'celebration') {
      renderCelebVisitors(ctx, pending?.visitorOffset ?? 0, Math.min(4, pending?.tasks ?? 3));
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
      // Rewards off or the set complete: the round's visitors wave, never a made-up collectible.
      const n = Math.min(4, pending?.tasks ?? 3), h = restSize * 0.62, gap = Math.min(W / (n + 1), h * 0.85);
      for (let i = 0; i < n; i++) {
        const a = ((pending?.visitorOffset ?? 0) + i) % VISITORS.length;
        sprite(ctx, VISITOR_NAMES[a]![1], W / 2 + (i - (n - 1) / 2) * gap, restY, h, Math.sin(time * 3 + i) * 0.05);
      }
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
      const top = placeTop(p);
      if (Math.abs(x - pX[p]!) <= placeW / 2 && y >= top && y <= top + rowH) return p;
    }
    return -1;
  }
  const onMat = (x: number, y: number): boolean => x >= zoneX0 && x <= zoneX1 && y >= zoneY0 && y <= zoneY1;
  const onTag = (x: number, y: number): number => {
    for (let i = 0; i < 3; i++) if (tagState[i] === 0 && x >= tagX[i]! && x <= tagX[i]! + tagW && y >= tagY[i]! && y <= tagY[i]! + tagH) return i;
    return -1;
  };
  const onCorner = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius || Math.hypot(x - soundX, y - cornerY) <= cornerRadius;
  const onRow = (x: number, y: number): boolean => y >= rowY - 8 && x >= rowX && x <= rowX + rowW;
  /** Presses while nothing can be taken: the visitor and the pressed coin hop. */
  function invite(p: number): void { visHop = 0; if (p >= 0) pHop[p] = 0; play('pop', 'A', 3, 0.3); }
  function interruptHand(): void { if (hand.mode === HAND_TAP || hand.mode === HAND_HINT) hand.mode = 0; }
  function pick(p: number): boolean {
    if (!available(p)) return false;
    if (!pUnlimited[p]) pCount[p]!--;
    carry.place = p; carry.kind = pKind[p]!; carry.face = pFace[p]!;
    play('pop', 'B', 2, 0.5); playVoice(audio, COIN_NAMES[carry.kind]!);
    return true;
  }
  function returnCarry(x: number, y: number): void {
    carry.active = false; carry.keyed = false;
    launch(RETURN, carry.kind, carry.face, 1, carry.place, x, y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS);
  }
  /** Let go of the carried coin at (x, y): on the mat it goes to its dish or the open lock; elsewhere it slides home. */
  function release(x: number, y: number): void {
    carry.active = false; carry.keyed = false;
    if (onMat(x, y)) { hits++; dropToMat(carry.kind, carry.face, carry.place, x, y, carry.deliberate, false); return; }
    if (!onRow(x, y)) { misses++; play('whoosh', 'D', 0, 0.55); }
    launch(RETURN, carry.kind, carry.face, 1, carry.place, x, y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS);
  }
  const coinPhase = (): boolean => taskPhase === 'count' || taskPhase === 'lock';
  function pointerDown(x: number, y: number): void {
    idleT = 0; interruptHand();
    const now = performance.now(), gap = now - lastPressAt;
    lastPressAt = now;
    if (taskPhase === 'tags') {
      const i = onTag(x, y);
      if (i >= 0) { hits++; pickTag(i, gap >= DELIBERATE_MS); return; }
      if (!onCorner(x, y)) { misses++; visHop = 0; }
      return;
    }
    if (!coinPhase()) { if (!onCorner(x, y)) invite(placeAt(x, y)); return; }
    if (carry.active) { release(x, y); return; }
    const p = placeAt(x, y);
    if (p >= 0) {
      if (busy() || !available(p)) { invite(p); return; }
      if (!pick(p)) return;
      carry.active = true; carry.sticky = false; carry.keyed = false; carry.downAt = now; carry.downX = x; carry.downY = y; carry.deliberate = gap >= DELIBERATE_MS; focus = p;
      return;
    }
    if (onMat(x, y)) { matHop = 0; if (focus < nPlaces) pHop[focus] = 0; play('pop', 'A', 4, 0.3); return; }
    if (purseW > 0 && x >= purseX && x <= purseX + purseW && y >= rowY) { purseHop = 0; play('pop', 'A', 4, 0.3); return; }
    if (!onCorner(x, y)) { misses++; visHop = 0; }
  }
  function pointerUp(x: number, y: number): void {
    if (!carry.active || carry.sticky) return;
    const now = performance.now(), quick = now - carry.downAt < 300 && Math.hypot(x - carry.downX, y - carry.downY) < 24;
    if (quick) {
      if (TIERS[tier].oneTap) {
        // Tier 0: one press sends the coin where it goes. Not a motor attempt; still a deliberate coin choice.
        carry.active = false;
        dropToMat(carry.kind, carry.face, carry.place, pX[carry.place]!, pY[carry.place]!, carry.deliberate, false);
        return;
      }
      carry.sticky = true; return; // Click then mat: the coin follows the pointer until the next press.
    }
    release(x, y);
  }
  function keyPlay(code: string): void {
    idleT = 0; interruptHand();
    const left = code === 'ArrowLeft' || code === 'ArrowUp', right = code === 'ArrowRight' || code === 'ArrowDown';
    const now = performance.now();
    if (taskPhase === 'tags') {
      if (left || right) {
        for (let k = 1; k <= 3; k++) { const j = (tagFocus + (left ? -k : k) + 9) % 3; if (tagState[j] === 0) { tagFocus = j; break; } }
        arrowMoved = true; lastArrowAt = now; return;
      }
      if (now < keyAfter) return;
      keyAfter = now + KEY_GAP_MS;
      if (tagState[tagFocus] !== 0) for (let j = 0; j < 3; j++) if (tagState[j] === 0) { tagFocus = j; break; }
      const deliberate = arrowMoved && now - lastArrowAt >= KEY_DELIBERATE_MS;
      arrowMoved = false;
      pickTag(tagFocus, deliberate);
      return;
    }
    if (!coinPhase()) { invite(-1); return; }
    if (left || right) { if (!carry.active) moveFocus(left ? -1 : 1); arrowMoved = true; lastArrowAt = now; return; }
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    if (carry.active) returnCarry(input.pointer.x, input.pointer.y);
    keepFocus();
    if (busy() || !available(focus)) { invite(focus); return; }
    const deliberate = arrowMoved && now - lastArrowAt >= KEY_DELIBERATE_MS;
    arrowMoved = false;
    const p = focus;
    if (!pick(p)) return;
    dropToMat(carry.kind, carry.face, p, pX[p]! + pNx[p]!, pY[p]! + pNy[p]!, deliberate, true);
    // The highlight then moves to the largest coin left (lock: the largest the lock takes).
    if (!isLock() || !available(p)) ensureFocus();
  }

  // ---------------------------------------------------------------- stats
  const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  const coinInfo = (): CoinInfo[] => {
    const out: CoinInfo[] = [];
    if (!playable()) return out;
    const face = (f: number): 'heads' | 'tails' => (f ? 'tails' : 'heads');
    for (let p = 0; p < nPlaces; p++) {
      if (pCount[p]! <= 0) continue;
      const top = placeTop(p);
      out.push({ kind: COIN_NAMES[pKind[p]!]!, face: face(pFace[p]!), x: pX[p]! + pNx[p]!, y: pY[p]! + pNy[p]!, d: coinD[pKind[p]!]!, where: pUnlimited[p] ? 'stack' : 'row', count: pUnlimited[p] ? -1 : pCount[p]!, hit: { x: pX[p]! - placeW / 2, y: top, w: placeW, h: rowH } });
    }
    for (const k of DISH_ORDER) for (let i = 0; i < Math.min(DISH_MAX, dishN[k]!); i++) {
      dishSlot(k, i, dishN[k]!); out.push({ kind: COIN_NAMES[k]!, face: face(dishFace[k * DISH_MAX + i]!), x: pos.x, y: pos.y, d: dishCoinD(k), where: 'dish', count: 1, hit: null });
    }
    for (let l = 0; l < 2; l++) for (let i = 0; i < Math.min(LOCK_MAX, lockN[l]!); i++) {
      lockSlot(l, i, Math.max(lockN[l]!, 4)); out.push({ kind: COIN_NAMES[lockKind[l * LOCK_MAX + i]!]!, face: face(lockFace[l * LOCK_MAX + i]!), x: pos.x, y: pos.y, d: lockCoinD(), where: `lock${l + 1}`, count: 1, hit: null });
    }
    for (const f of flights) if (f.active && f.mode !== LEAVE) out.push({ kind: COIN_NAMES[f.kind]!, face: face(f.face), x: f.x1, y: f.y1, d: coinD[f.kind]!, where: 'flight', count: f.n, hit: null });
    return out;
  };
  const taskInfo = (): TaskInfo => {
    const locks: TaskInfo['locks'] = [];
    if (isLock()) for (let l = 0; l < 2; l++) {
      const coins: string[] = [];
      for (let i = 0; i < Math.min(LOCK_MAX, lockN[l]!); i++) coins.push(COIN_NAMES[lockKind[l * LOCK_MAX + i]!]!);
      locks.push({ amount: plan.total, cents: lockCents[l]!, coins });
    }
    const shown: number[] = [];
    if (taskPhase === 'tags') for (let i = 0; i < 3; i++) if (tagState[i] === 0) shown.push(tagVal[i]!);
    return {
      kind: plan.kind, step: plan.step, warmup: plan.warmup, total: plan.total, tags: plan.tags.slice(), tagsShown: shown,
      coins: { penny: plan.coins[PENNY]!, nickel: plan.coins[NICKEL]!, dime: plan.coins[DIME]!, quarter: plan.coins[QUARTER]! }, locks,
    };
  };
  const countLit = (from: number, to: number): number => { let n = 0; for (let i = from; i < to; i++) n += cupLit[i]!; return n; };
  const stats: CoinVaultStats = {
    get step() { return data.step; }, get contentStep() { return plan.step; }, get tier() { return tier; }, get rounds() { return data.rounds; },
    get phase() { return phase; }, get taskPhase() { return taskPhase; }, get intro() { return intro; }, get introStage() { return introStage; },
    get taskIndex() { return taskIndex; }, get tasks() { return tasksTotal; }, get hits() { return hits; }, get misses() { return misses; }, get bounces() { return bounces; },
    get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; }, get hand() { return hand.mode; },
    get carrying() { return carry.active; }, get focus() { return focus; }, get tagFocus() { return tagFocus; }, get counted() { return roundCounted.slice(); }, get learn() { return data.learn.slice(); },
    get demos() { return data.demos; },
    get task() { return taskInfo(); },
    get coins() { return coinInfo(); },
    get bills() { return []; },
    get cups() {
      const lock = isLock() && introStage !== 1;
      return { total: plan.total, lit: lock ? countLit(50, 100) : countLit(0, 100), first: lock ? plan.total : 0, firstLit: lock ? countLit(0, 50) : 0, sockets: lock ? 2 * plan.total : CUPS };
    },
    get dishes() { return DISH_ORDER.map(k => ({ kind: COIN_NAMES[k]!, count: dishN[k]! })); },
    get coinSizes() { return { penny: coinD[PENNY]!, nickel: coinD[NICKEL]!, dime: coinD[DIME]!, quarter: coinD[QUARTER]! }; },
    get cupDiameter() { return cupD; },
    get targets() {
      const out: TargetInfo[] = [];
      if (playable()) {
        for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) out.push({ kind: `place:${COIN_NAMES[pKind[p]!]}`, x: pX[p]! - placeW / 2, y: placeTop(p), w: placeW, h: rowH });
        if (coinPhase()) {
          out.push({ kind: 'mat', ...rect(zoneX0, zoneY0, zoneX1, zoneY1), drawn: rect(matX, matY, matX + matW, matY + matH) });
          // Any coin dropped on the mat goes into the open lock: the lock's target is the mat's whole zone.
          if (isLock()) out.push({ kind: 'lock2', ...rect(zoneX0, zoneY0, zoneX1, zoneY1), drawn: rect(lockX[1]!, lockY[1]!, lockX[1]! + lockW, lockY[1]! + lockH) });
          else for (const k of DISH_ORDER) out.push({ kind: `dish:${COIN_NAMES[k]}`, ...rect(dzX0[k]!, dzY0[k]!, dzX1[k]!, dzY1[k]!), drawn: rect(dishX[k]! - dishW[k]! / 2, dishY[k]! - dishH[k]! / 2, dishX[k]! + dishW[k]! / 2, dishY[k]! + dishH[k]! / 2) });
        }
        if (taskPhase === 'tags') for (let i = 0; i < 3; i++) if (tagState[i] === 0) out.push({ kind: `tag:${tagVal[i]}`, x: tagX[i]!, y: tagY[i]!, w: tagW, h: tagH });
      }
      if (phase === 'choice' && pending) for (let i = 0; i < pending.choices.length; i++) out.push({ kind: `sticker:${pending.choices[i]}`, x: controlX(i, true) - choiceSize / 2, y: choiceY - choiceSize / 2, w: choiceSize, h: choiceSize });
      if (phase === 'rest') for (let i = 0; i < 2; i++) out.push({ kind: i === 0 ? 'again' : 'home', x: controlX(i, false) - controlsRadius, y: controlsY - controlsRadius, w: controlsRadius * 2, h: controlsRadius * 2 });
      out.push({ kind: 'corner-home', x: homeX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      out.push({ kind: 'corner-sound', x: soundX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      return out;
    },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    scales() { return Object.fromEntries(drawnScale); },
    resetWork() { workHead = workCount = 0; },
  };

  function applyDebug(): void {
    if (!services.debug.enabled || debugApplied) return;
    debugApplied = true;
    const params = new URLSearchParams(location.search), step = Number(params.get('step')), rounds = Number(params.get('rounds'));
    if (params.has('step') && Number.isSafeInteger(step) && step >= 1 && step <= TOP_STEP) { data.step = step; data.learn.length = 0; data.quietRounds = 0; }
    if (params.has('rounds') && Number.isSafeInteger(rounds) && rounds >= 0) { data.rounds = rounds; data.pending = null; }
    else if (params.has('step') && data.rounds === 0) data.rounds = 1;
  }
  return {
    stats,
    enter() {
      void loadCoinVaultArt(services).then(() => { bakedMat = ''; layout(services.canvas.width, services.canvas.height); });
      if (!fontReady) void ensureDisplayFont().then(() => { fontReady = true; bakeStrips(true); });
      preloadVoice(audio, services.base);
      data = services.save.gameData<VaultData>(GAME_ID, defaultData());
      sanitizeVaultData(data, () => services.save.protect());
      applyDebug();
      if (!(services.debug.enabled && new URLSearchParams(location.search).has('rounds'))) data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; bookGlide = false; startMusic(audio, 'coin-vault');
      if (data.pending) {
        pending = data.pending; stars = pending.stars; tier = pending.tier; visitorOffset = pending.visitorOffset; intro = false; doorK = -1;
        layout(services.canvas.width, services.canvas.height);
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
        else enterRest();
      } else { layout(services.canvas.width, services.canvas.height); startRound(); }
      if (services.debug.enabled) (window as unknown as { __coinVault?: CoinVaultStats }).__coinVault = stats;
    },
    pause() {
      stopMusic(audio); stopIdle();
      if (carry.active) returnCarry(input.pointer.x, input.pointer.y);
      services.save.flush();
    },
    resume() {
      guard(phase === 'choice' || phase === 'rest' ? MENU_GUARD_MS : PLAY_GUARD_MS); cornerFocus = -1;
      startMusic(audio, 'coin-vault');
    },
    exit() {
      stopMusic(audio); stopIdle(); offers.cancel(); closeFinishedRound(); services.save.flush();
      releaseArt(); sprites.clearScaled(BG); bgCanvas = undefined; sizeKey = ''; madeName = ''; bakedMat = ''; matCanvas = undefined;
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
      else { ctx.fillStyle = '#d9a86a'; ctx.fillRect(0, 0, W, H); }
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
