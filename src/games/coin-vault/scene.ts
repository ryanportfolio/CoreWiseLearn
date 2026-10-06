/**
 * Coin Vault: animal visitors peek over the far edge of a wooden counting desk with a sack of coins. The child moves
 * each coin from the row along the bottom to the felt mat, where it slides into its own dish and pours its value into
 * the counting board's cups (rows of ten, split 5 and 5; no running numeral). When every coin is in, the dishes count on
 * from the largest and three amount tags rise; the matching tag flies to the vault's door, the coins roll into the
 * tree-stump vault, the round door swings shut and the visitor waves. Step 2 spills the coins as a pile, step 3 brings
 * quarters, and step 4 shows two locks wanting the same amount: the visitor fills the first, the child fills the second
 * with a different mix. Step 5's one lock has a slot per coin of the fewest-coins answer; step 6 trades a hundred cups
 * for a $1 bill ("$1 and 25¢"); step 7 counts bills on a pile; step 8 sets $ against ¢ with look-alike tags and a $ or ¢
 * block that finishes a tag. Nothing is kept: the vault empties every round.
 */
import { rewards, type AppServices } from '../../app/services';
import { ensureDisplayFont } from '../../app/font';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import type { CursorHover, Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, DISPLAY_FONT, drawSprite, OUTLINE } from '../../ui/draw';
import { drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { bakeDial, bakeJarFill, bakeShadow, createBits, DUST, GLINT, LEAF, SHAVING } from './fx';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, onBook, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { approach, clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { defaultData, GAME_ID, sanitizeVaultData, TOP_STEP, type PendingRound, type VaultData } from './data';
import {
  applyLearning, applyMotor, BILL1, BILL20, BILL_VALUE, CENTS, COIN_MM, COIN_NAMES, COIN_VALUE, DIME, DIME_MM, DISH_ORDER, DOLLARS, fewest, fewestTakes, introTask,
  lockPlanFor, lockTakes, MIN_DIME_PX, NICKEL, PENNY, PIECE_NAMES, planTask, QUARTER, recordTask, ROUND_STARS, roundTasks, roomTakes, taskStep, TIERS, type TaskPlan, type TierParams,
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
/** Every coin shows its front only (owner 2026-10-06: "SUPER clear what each coin is"). */
const COIN_FRONT = COIN_NAMES.map(c => `${ART}coin-${c}-heads`);
const COIN_PX = 320;
/**
 * The value tag every coin carries (1¢, 5¢, 10¢, 25¢): a cream pill with a deep-ink edge over the coin's lower edge.
 * Its numerals' ink is at least TAG_INK of the coin's diameter and TAG_MIN_INK CSS px (times u above 1; 21 so the
 * anti-aliased digits measure at least 20 on screen); the pill is
 * TAG_PILL_H times the ink tall, TAG_OVER of it lies over the coin. Baked TAG_SHARP times larger than drawn so a lifted
 * coin's tag (up to 1.22x in the pick-up spring) is never drawn above its own pixels.
 */
const TAG_INK = 0.3, TAG_MIN_INK = 21, TAG_PILL_H = 1.5, TAG_OVER = 0.55, TAG_SHARP = 1.25, TAG_SLOTS = 8;
/**
 * An empty dish still shows its kind: the coin (or bill) faint, its value tag clear. A row place emptied during counting
 * is drawn as a place, not a coin: a dashed ring, the coin fainter and its tag at ROW_GHOST_TAG_ALPHA, so a carried
 * dime never leaves a second "10¢" that looks real.
 */
const GHOST_ALPHA = 0.3, GHOST_TAG_ALPHA = 0.85, ROW_GHOST_ALPHA = 0.18, ROW_GHOST_TAG_ALPHA = 0.35;
/** The name the size log (`scales()`) keeps the value tags under. */
const VALUE_TAG = `${ART}value-tag`;
/** bill-1.webp to bill-20.webp (640x320): the plain side panels where code draws the numeral. */
const BILL_NAMES = BILL_VALUE.map(v => `${ART}bill-${v}`);
const BILL_PX = 640, BILL_PANEL0 = 0.04, BILL_PANEL1 = 0.31;
/** Bills never draw under 192 x 96 CSS px as play pieces, nor over 280 x 140 at 1366x768. */
const BILL_MIN_W = 192, BILL_MAX_W = 280;
const SYMBOL = `${ART}symbol-block`;
const isBill = (kind: number): boolean => kind >= BILL1;
/** What the visitors save for (one picture per task, drawn beside the visitor with its amount on a gift tag). */
const GOALS = ['bike', 'kite', 'boat', 'scooter', 'drum', 'paints'] as const;
const GOAL_NAMES = GOALS.map(g => `${ART}goal-${g}`);
const JAR = `${ART}jar`, RIBBON = `${ART}gift-ribbon`, GIFT_TAG = `${ART}gift-tag`;
/**
 * jar.webp (350x640): the fill is drawn behind the glass and reaches its walls (the glass's outer edge is at 0.006 and
 * 0.991 of the width, its inner edge about 0.04 and 0.94; docs/games/coin-vault/jar.json's straight inner rectangle is
 * narrower), from just under the shoulder (0.27 of the height) to the base (0.948), rounded at the base.
 */
const JAR_AR = 350 / 640, JAR_X0 = 0.03, JAR_X1 = 0.97, JAR_Y0 = 0.27, JAR_Y1 = 0.948;
/** gift-tag.webp (256x115): the plain face left of the punched hole. gift-ribbon.webp is 320x254. */
const GTAG_AR = 115 / 256, GTAG_FACE0 = 0.06, GTAG_FACE1 = 0.72;
/** The goal picture's height and its gift tag's width, in layout units. */
const GOAL_H = 130, GTAG_W = 150;

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
/** lock-plate.webp (1450x307): the plank right of the padlock starts at LOCK_FREE0 of its width. */
const LOCK_AR = 1450 / 307, LOCK_FREE0 = 0.18;
/**
 * Step 4's planks are lengthened to the mat's width: the padlock end (to LOCK_CUT0 of the sprite's width) and the
 * rounded right end (from LOCK_CUT1) keep the sprite's shape, and the plain wood between repeats, an odd number of
 * copies with every other one mirrored so the grain meets at each join and the last meets the right end as in the
 * sprite; a copy is never drawn wider than its share of the sprite at the plank's own scale. The amount ends at
 * LOCK_AMOUNT1 of the plate's own width.
 */
const LOCK_CUT0 = 0.42, LOCK_CUT1 = 0.9, LOCK_AMOUNT1 = 0.38;
/**
 * Step 4's coins in a lock: the largest quarter is LOCK_Q of the plank's height (as before round CL4); with more coins
 * they draw smaller, down to LOCK_Q_MIN CSS px across (times the window's scale above 1366x768), a penny then 41 px.
 */
const LOCK_Q = 0.62, LOCK_Q_MIN = 52;
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
const MAX_PLACES = 8, CUPS = 100, POOL = 32, ROLLERS = 64, PARTICLES = 160, DISH_MAX = 24, LOCK_MAX = 64, PILE_MAX = 16, SLOT_MAX = 12;

const CELEBRATION_SECONDS = 4.6, STAR_START = 0.5;
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350, KEY_GAP_MS = 150, IDLE_SECONDS = 6, IDLE_SOON = 4, IDLE_REPEAT = 7;
/** A pointer choice is deliberate this long after the previous press; a key choice this long after an arrow move. */
const DELIBERATE_MS = 700, KEY_DELIBERATE_MS = 400;
/** Cups light this far apart as a piece pours: a nickel's five, a dime's ten, a quarter's twenty-five; bills by dollars. */
const POUR_GAP = [0.07, 0.07, 0.032, 0.016, 0.07, 0.07, 0.032, 0.02] as const;
/** Step 6: a hundred lit cups slide together into a $1 bill (slower the first time, as a demonstration). */
const TRADE = 0.6, TRADE_DEMO = 1.2;
/** Step 8b: a symbol block flies to the tag's box; a wrong one jiggles there and hops back. */
const BLOCK_FLY = 0.3, BLOCK_HOLD = 0.3, BLOCK_HOP = 0.5;
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
const SEQ_TAG = 0.35, ROLL_GAP = 0.04, ROLL = 0.45, SHUT = 0.45, SINK = 0.35;
/**
 * After the money is in: the door slams (accelerating), bounces and the dial spins shut; the jar rises beside the board
 * and fills toward the goal; then the visitor gets its thing (GOT) or smiles and waves (NOT_YET). A press or key during
 * this sequence plays it HURRY times faster.
 */
const SLAM = 0.3, SLAM_BOUNCE = 0.28, DIAL_SPIN = 0.55, JAR_RISE = 0.3, JAR_OUT = 0.3, FILL = 0.75, GOT = 1.2, NOT_YET = 0.9, HURRY = 4;
/** The getting-the-thing scene: the picture grows over the mat, the ribbon lands on it, it rests, then flies to the visitor. */
const GIFT_GROW = 0.35, GIFT_RIBBON = 0.22, GIFT_HOLD = 0.8;
/** A picked-up piece: a short squash, then it springs up to its lifted size. */
const PICK_SQUASH = 0.06, PICK_SPRING = 0.2, COIN_LIFT = 1.12, BILL_LIFT = 1.08;
/** The introduction's goal holds its counted dishes and lit cups this long first. */
const GOAL_HOLD = 0.8, INTRO_HAND_AT = 0.35;
/** Helper hand timeline: rise to the coin, press it, carry it, then fade. */
const HAND_PRESS_AT = 0.5, HAND_CARRY_AT = 0.7, HAND_DROP_AT = 1.4, HAND_FADE = 0.5;
const FANFARE: SfxOptions = { variant: 'D' };
const HIGHLIGHT = '#fff6a3', INK = '#4a2f1c', CREAM = '#fff8e6', HOVER = '#fff8b2';
const NUMBER_CLIPS: readonly VoiceClip[] = Array.from({ length: 101 }, (_, n) => `number-${n}` as const);

type Phase = 'play' | 'celebration' | 'choice' | 'sticker' | 'rest';
/**
 * enter: visitor rises, pieces slide in; count: pieces to the mat; counton: the dishes count on; tags: pick the total;
 * symbol: finish the tag with the $ or ¢ block (step 8b); lock: fill the open lock; done: into the vault.
 */
type TaskPhase = 'enter' | 'count' | 'counton' | 'tags' | 'symbol' | 'lock' | 'done';
/**
 * Flight modes. ARRIVE: a piece slides from the purse onto its place; LEAVE: off the row; DISH: a coin into its dish;
 * RETURN: back from a miss; LOCKED: into the open lock; BACK_LOCK: not taken, back to its place; FIRST: the visitor's
 * coin into the first lock; PILE: a bill onto the pile (DOLLARS tasks); TO_BOARD: a $1 bill onto the board's upper half
 * (CENTS tasks, where it stands for 100 cups).
 */
const ARRIVE = 0, LEAVE = 1, DISH = 2, RETURN = 3, LOCKED = 4, BACK_LOCK = 5, FIRST = 6, PILE = 7, TO_BOARD = 8;
const HAND_DEMO = 1, HAND_TAP = 2, HAND_HINT = 3, HAND_POINT = 4, HAND_BLOCK = 5;
/** Count-on groups: 0 to 3 the coin dishes, 4 to 7 the bills in the pile, 8 the $1 bill on the board. */
const BOARD_GROUP = 8;

interface Flight {
  active: boolean; mode: number; kind: number; face: number; n: number; place: number; slot: number;
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; s0: number; s1: number; giggles: number;
}
interface Roller { active: boolean; kind: number; face: number; x0: number; y0: number; s0: number; t: number; board: boolean }
interface Rect { x: number; y: number; w: number; h: number }
/**
 * `tag` is the coin's value tag as drawn ("10¢"), `tagGlyph` its numerals' ink height in CSS px at rest, `tagBox` the
 * tag's pill at rest (x, y, w, h; upright) for coins in the row and in the locks.
 */
interface CoinInfo { kind: string; face: 'heads' | 'tails'; x: number; y: number; d: number; where: string; count: number; hit: Rect | null; tag: string; tagGlyph: number; tagBox?: Rect | undefined }
interface BillInfo { value: number; x: number; y: number; w: number; h: number; where: string; count: number; label: string; hit: Rect | null }
interface TargetInfo { kind: string; x: number; y: number; w: number; h: number; drawn?: Rect }
interface TaskInfo {
  kind: 'count' | 'lock' | 'symbol'; step: number; warmup: boolean; unit: '¢' | '$'; total: number; label: string;
  tags: number[]; tagForms: ('¢' | '$')[]; tagLabels: string[]; tagsShown: string[];
  coins: { penny: number; nickel: number; dime: number; quarter: number };
  bills: { 1: number; 5: number; 10: number; 20: number };
  locks: { amount: number; cents: number; coins: string[]; slots: number; filled: number }[];
  /** Step 6: the hundred cups have traded for the $1 bill on the board. Steps 6 and 8: a $1 bill lies on the board. */
  traded: boolean; boardBill: boolean;
  /** Step 8b: the symbol blocks left to right, the right one, and the one placed in the box ('' until then). */
  symbols: string[]; symbol: string; placed: string;
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
  /** Every bill on screen: in the row (stacks give their count), on the pile, on the board, and in flight; `value` in dollars. */
  readonly bills: readonly BillInfo[];
  /** Step 8b's symbol blocks with their hit rectangles. */
  readonly symbols: readonly { symbol: string; state: string; x: number; y: number; w: number; h: number }[];
  /** Hit rectangles in CSS px (with `drawn` where the drawn art differs). */
  readonly targets: readonly TargetInfo[];
  /**
   * Cups the task lights and how many are lit (lock tasks: the open lock's cups; `first` the first lock's). `unit` is
   * what one cup is worth; `bill` is 1 while a $1 bill (100 cups) lies on the board, so lit + 100 x bill is the count.
   */
  readonly cups: { total: number; lit: number; first: number; firstLit: number; sockets: number; unit: '¢' | '$'; bill: number };
  readonly dishes: readonly { kind: string; count: number; x: number; y: number; w: number; h: number }[];
  readonly billSize: { w: number; h: number };
  readonly coinSizes: { penny: number; nickel: number; dime: number; quarter: number };
  readonly cupDiameter: number;
  /**
   * The visitor's goal: the picture, its amount and drawn label (in the task's unit), whether the label is shown yet
   * (step 8 writes it in once counted), the counted amount, and whether the count reaches it.
   */
  readonly goal: { item: string; amount: number; label: string; shown: boolean; counted: number; reached: boolean; x: number; y: number; size: number };
  /**
   * The savings jar: shown, the drawn fill share now, the share the count earns (counted / goal, at most 1), the
   * outcome ('' until the jar has filled, then 'got' or 'not-yet'), and the jar's rectangle in CSS px.
   */
  readonly jar: { shown: boolean; fill: number; target: number; outcome: string; x: number; y: number; w: number; h: number };
  /** A piece follows the pointer after a click (no button held). */
  readonly carrySticky: boolean;
  /** Pooled effect bits alive now, and how fast a finished task's sequence plays (1, or HURRY after a press). */
  readonly bits: number; readonly seqSpeed: number;
  readonly workMean: number; readonly workMax: number;
  /**
   * Lock tasks: each drawn plank (step 4: both, step 5: the one), the drawn mat, the region step 4's locks keep to,
   * the open lock's room (most coins it takes), the quarter's size in the locks and the tags' smallest ink.
   */
  readonly locks: { planks: Rect[]; mat: Rect; region: Rect; room: number; quarter: number; ink: number } | null;
  /**
   * Debug probe (lock steps only): replaces the task with a lock task for `total` at `step`, fills the first lock (step
   * 4) and the open lock as a child could (coins chosen in `order`, smallest first for 'small', largest first for
   * 'large', the order given cycling for a list of coin names, each only when the lock takes it), with no animation,
   * and returns the coins' count. The scene then holds still as filled; it is not meant to be played on afterwards.
   */
  probeLock(step: 4 | 5, total: number, order: 'small' | 'large' | readonly string[]): number;
  /** Largest drawn scale of each image drawn this layout (drawn px / image px at pixel ratio 1). */
  scales(): Record<string, number>;
  resetWork(): void;
}
export interface CoinVaultScene extends Scene { readonly stats: CoinVaultStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);
const spriteName = (path: string): string => path.replace(/\.\w+$/, '');

function artList(): { name: string; path: string }[] {
  const paths = [`${BG}.webp`, `${STUMP}.webp`, `${DOOR}.webp`, `${MAT}.webp`, `${BOARD}.webp`, `${LOCK}.webp`, `${TAG}.webp`, `${PURSE}.webp`, `${HAND}.webp`,
    `${BUTTON_PLAY}.webp`, `${BUTTON_HOME}.webp`, BOOK_ICON_PATH, `${SYMBOL}.webp`, `${JAR}.webp`, `${RIBBON}.webp`, `${GIFT_TAG}.webp`];
  for (const n of GOAL_NAMES) paths.push(`${n}.webp`);
  for (const n of DISH_NAMES) paths.push(`${n}.webp`);
  for (const n of BILL_NAMES) paths.push(`${n}.webp`);
  for (const pair of VISITOR_NAMES) for (const n of pair) paths.push(`${n}.webp`);
  for (const n of COIN_FRONT) paths.push(`${n}.webp`);
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
/** A dashed ring `d` across (step 5's lock slots). */
function bakeSlot(d: number, ratio: number): HTMLCanvasElement {
  const size = d + 4, { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const lw = Math.max(2.5, d * 0.06);
  g.beginPath(); g.arc(size / 2, size / 2, d / 2 - lw / 2, 0, Math.PI * 2);
  g.fillStyle = 'rgba(74, 47, 28, 0.16)'; g.fill();
  g.setLineDash([d * 0.11, d * 0.08]); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** Step 4's lock layout for a number of coins in each lock (see solveLocks in the scene). */
interface LockGeo {
  /** The quarter's diameter (the other coins keep the true ratios), the tags' smallest ink, the plank's height. */
  q: number; ink: number; p: number;
  /** Column pitch (the widest tag or coin plus a gap), row pitch, and how far the lowest tag reaches below a coin's centre. */
  cell: number; rowH: number; bot: number;
  /** The columns across the region: the first one's centre and their count; the first row's first column and count. */
  gx: number; cols: number; c0: number; cols0: number;
  /** Each lock's plank top and band height (its plank, coins and tags). */
  top: Float32Array; band: Float32Array;
}
const lockGeo = (): LockGeo => ({ q: 0, ink: 0, p: 0, cell: 0, rowH: 0, bot: 0, gx: 0, cols: 0, c0: 0, cols0: 0, top: new Float32Array(2), band: new Float32Array(2) });
/** A dark ring around a coin `d` across, so a silver coin stands out on a silver dish. */
function bakeRing(d: number, ratio: number): HTMLCanvasElement {
  const lw = Math.max(2, d * 0.07), size = d + 2 * lw + 2, { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  g.beginPath(); g.arc(size / 2 + lw * 0.4, size / 2 + lw * 0.6, d / 2 + lw * 0.3, 0, Math.PI * 2); g.fillStyle = 'rgba(40, 24, 12, 0.35)'; g.fill();
  g.beginPath(); g.arc(size / 2, size / 2, d / 2 + lw / 2 - 0.5, 0, Math.PI * 2); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** A coin's value tag geometry for a coin `d` across: numeral ink height, pill height and edge width, in CSS px. */
function tagInk(d: number, minInk: number): number { return Math.max(TAG_INK * d, minInk); }
/** How far a coin's value tag hangs below the coin's lower edge. */
function tagHang(d: number, minInk: number): number { const ink = tagInk(d, minInk), lw = Math.max(2, ink * 0.1); return ink * TAG_PILL_H * (1 - TAG_OVER) + lw / 2; }
/** Digit ink height as a share of the font size (measured once the font is in; Andika's digits are about 0.7). */
let digitShare = 0;
/**
 * One value tag ("10¢") for a coin `d` across, baked once per size: a cream pill with a deep-ink edge and the value in
 * the bundled font. Writes its drawn width, height and the pill centre's offset below the coin's centre into `out`.
 */
function bakeValueTag(cents: number, d: number, minInk: number, ratio: number, fontIn: boolean, out: { w: number; h: number; off: number; ink: number }): HTMLCanvasElement {
  tagGeom(cents, d, minInk, fontIn, out);
  const ink = out.ink, px = ink / (digitShare || 0.7), lw = Math.max(2, ink * 0.1), pillH = ink * TAG_PILL_H, pillW = out.w - lw;
  const w = out.w, h = out.h, k = ratio * TAG_SHARP, { c, g } = cpuCanvas(w * k, h * k);
  if (!g) return c;
  g.scale(c.width / w, c.height / h);
  g.beginPath(); g.roundRect(lw / 2, lw / 2, pillW, pillH, pillH / 2);
  g.fillStyle = CREAM; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  g.font = `700 ${px.toFixed(2)}px ${DISPLAY_FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = INK;
  g.fillText(`${cents}¢`, w / 2, h / 2 + ink / 2);
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** One text-measuring context, made on first use (layout and bakes only). */
let tagProbe: CanvasRenderingContext2D | null | undefined;
/** Each value's text width at a 100 px font (cents to px), measured once, and again once the bundled font is in. */
const tagText100 = new Map<number, number>();
let tagTextFont = false;
/**
 * A value tag's geometry for a coin `d` across (drawn width and height, the pill centre's offset below the coin's centre,
 * the numerals' ink height) into `out`, without baking it. The text's width scales from its width at 100 px, so lock
 * layout can try many sizes cheaply; the bake uses the same numbers.
 */
function tagGeom(cents: number, d: number, minInk: number, fontIn: boolean, out: { w: number; h: number; off: number; ink: number }): void {
  if (tagProbe === undefined) tagProbe = cpuCanvas(1, 1).g;
  const probe = tagProbe;
  if (fontIn && !digitShare) {
    // Measured from pixels once: the drawn height of "0" at 100 px (text metrics overstate it).
    const { g: m } = cpuCanvas(120, 160);
    if (m) {
      m.font = `700 100px ${DISPLAY_FONT}`; m.textBaseline = 'alphabetic'; m.fillText('0', 10, 130);
      const a = m.getImageData(0, 0, 120, 160).data; let top = 160, bottom = -1;
      for (let y = 0; y < 160; y++) for (let x = 0; x < 120; x++) if (a[(y * 120 + x) * 4 + 3]! > 128) { if (y < top) top = y; bottom = y; }
      digitShare = bottom > top ? (bottom - top + 1) / 100 : 0.7;
    }
  }
  if (tagTextFont !== fontIn) { tagText100.clear(); tagTextFont = fontIn; }
  let w100 = tagText100.get(cents);
  if (w100 === undefined) {
    const text = `${cents}¢`;
    if (probe) probe.font = `700 100px ${DISPLAY_FONT}`;
    w100 = probe ? probe.measureText(text).width : 60 * text.length;
    tagText100.set(cents, w100);
  }
  const share = digitShare || 0.7, ink = tagInk(d, minInk), px = ink / share, textW = w100 * px / 100;
  const lw = Math.max(2, ink * 0.1), pillH = ink * TAG_PILL_H, pillW = Math.max(pillH * 1.3, textW + ink * 0.9);
  out.w = pillW + lw; out.h = pillH + lw; out.off = d / 2 + pillH * (0.5 - TAG_OVER); out.ink = ink;
}
/** Glyphs "0" to "9", the cent sign, the dollar sign and the word "and", baked once per size with the bundled font. */
const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '¢', '$', 'and'] as const, CENT = 10, DOLLAR = 11, AND = 12;
/** Amount sequences use these besides glyph indices: a word space, and an empty dashed box where a symbol goes. */
const SPACE = -1, BOX = -2;
/** Amount form for step 8b's unfinished tag: an empty box each side of the numeral. */
const BOXED = 2;
interface Strip { canvas: HTMLCanvasElement | undefined; box: HTMLCanvasElement | undefined; boxW: number; px: number; pad: number; x: Float32Array; w: Float32Array }
const strip = (): Strip => ({ canvas: undefined, box: undefined, boxW: 0, px: 0, pad: 0, x: new Float32Array(GLYPHS.length), w: new Float32Array(GLYPHS.length) });
function bakeStrip(s: Strip, px: number, ratio: number): void {
  const probe = cpuCanvas(1, 1).g, font = `700 ${Math.round(px)}px ${DISPLAY_FONT}`;
  let total = 0;
  if (probe) probe.font = font;
  s.pad = Math.ceil(px * 0.12); s.px = px;
  for (let i = 0; i < GLYPHS.length; i++) {
    const w = probe ? probe.measureText(GLYPHS[i]!).width : px * 0.6 * GLYPHS[i]!.length;
    s.x[i] = total + s.pad; s.w[i] = w; total += w + s.pad * 2;
  }
  // The empty symbol box: a dashed rounded square as wide as the $ sign's slot.
  const bw = Math.max(s.w[DOLLAR]!, s.w[CENT]!) * 1.15, bh = Math.ceil(px * 1.35), box = cpuCanvas((bw + 2 * s.pad) * ratio, bh * ratio);
  s.box = box.c; s.boxW = bw;
  if (box.g) {
    const bg = box.g, lw = Math.max(2, px * 0.07);
    bg.scale(ratio, ratio); bg.setLineDash([px * 0.12, px * 0.09]); bg.lineWidth = lw; bg.strokeStyle = INK;
    bg.beginPath(); bg.roundRect(s.pad + lw / 2, bh * 0.14, bw - lw, bh * 0.72, px * 0.12); bg.fillStyle = 'rgba(255, 248, 230, 0.7)'; bg.fill(); bg.stroke();
    bg.getImageData(0, 0, 1, 1);
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
  // Glints, leaves, pencil shavings and dust, pooled (fx.ts).
  const bits = createBits(PARTICLES);
  const soundButton = createSoundButton(services), soundNames = soundArt(services).map(a => a.name);
  const flights: Flight[] = Array.from({ length: POOL }, () => ({ active: false, mode: 0, kind: 0, face: 0, n: 1, place: 0, slot: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, s0: 1, s1: 1, giggles: 0 }));
  const rollers: Roller[] = Array.from({ length: ROLLERS }, () => ({ active: false, kind: 0, face: 0, x0: 0, y0: 0, s0: 1, t: 0, board: false }));
  const work = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const pos = { x: 0, y: 0 };
  // Row places: coin kind, coins resting there, endless supply, face, the pile's turn and nudge, small timers.
  const pKind: number[] = [], pCount: number[] = [], pUnlimited: boolean[] = [];
  const pFace = new Uint8Array(MAX_PLACES), pRot = new Float32Array(MAX_PLACES), pNx = new Float32Array(MAX_PLACES), pNy = new Float32Array(MAX_PLACES);
  const pHop = new Float32Array(MAX_PLACES).fill(9), pX = new Float32Array(MAX_PLACES), pY = new Float32Array(MAX_PLACES);
  /** Mouse hover, eased 0 to 1: each row place (a piece to pick up), each tag, each symbol block; the mat under a carried piece; the corner Home. */
  const placeHover = new Float32Array(MAX_PLACES), tagHover = new Float32Array(3), blockHover = new Float32Array(2);
  let matHover = 0, homeHover = 0;
  // Each place's hit half-width (a pile packs places closer) and the order places are drawn in (a pile overlaps).
  const pHW = new Float32Array(MAX_PLACES), pOrder = new Uint8Array(MAX_PLACES);
  let nPlaces = 0, pile = false;
  // Dishes (by coin kind): coins in each with their faces, and pulse timers.
  const dishN = new Int32Array(4), dishFace = new Uint8Array(4 * DISH_MAX), dishPulse = new Float32Array(4).fill(9);
  // Cups: lit or not, which coin kind lit each (count-on), pulse timers, centres.
  const cupLit = new Uint8Array(CUPS), cupKind = new Int8Array(CUPS), cupPulse = new Float32Array(CUPS).fill(9), cupX = new Float32Array(CUPS), cupY = new Float32Array(CUPS);
  // Locks (step 4): coins in each (kind, face), their value, and the open lock's coins per kind (including coins on their way).
  const lockKind = new Int8Array(2 * LOCK_MAX), lockFace = new Uint8Array(2 * LOCK_MAX), lockN = new Int32Array(2), lockCents = new Int32Array(2), lockCur = new Int32Array(4);
  const lockPulse = new Float32Array(2).fill(9);
  // Bills on the pile (DOLLARS tasks): kinds in the order they landed, count per bill kind, pulse per kind; the $1 bill
  // on the board (a CENTS task's $1, or step 6's trade) with its pulse; the trade's clock (-1 when not trading).
  const pileKind = new Int8Array(PILE_MAX), pileN = new Int32Array(4), billPulse = new Float32Array(4).fill(9);
  let pileCount = 0, pileMax = 1, boardBill = 0, boardPulse = 9, traded = false, tradeT = -1, tradeDur = TRADE, tradeDemo = false;
  // Count-on groups in order (largest first), each group's first cent and its cents.
  const groupOrder = new Int8Array(9), groupStart = new Int32Array(9), groupLen = new Int32Array(9);
  let nGroups = 0;
  // Tags: value, form (CENTS or DOLLARS), state (0 there, 1 tilting away, 2 gone, 3 picked, 4 leaving), clock.
  const tagVal = new Int32Array(3), tagForm = new Uint8Array(3), tagState = new Uint8Array(3), tagT = new Float32Array(3);
  // Step 8b: the two symbol blocks (DOLLAR or CENT glyph), state (0 there, 1 hopping back, 3 placed), clock, centres;
  // the symbol placed in the box (-1 none).
  const blockSym = new Uint8Array([DOLLAR, CENT]), blockState = new Uint8Array(2), blockT = new Float32Array(2), blockX = new Float32Array(2), blockY = new Float32Array(2);
  let blockS = 120, placedSym = -1, blockFocus = 0, symbolDemo = false, symbolResult = -1;
  // Glyph sequence scratch for drawing one amount.
  const seq = new Int8Array(24);
  const carry = { active: false, sticky: false, keyed: false, place: 0, kind: 0, face: 0, downAt: 0, downX: 0, downY: 0, deliberate: false };
  const hand = { mode: 0, t: 0, place: 0, kind: 0, released: false, taken: false, after: -1 };
  let data: VaultData = defaultData();
  let W = 1366, H = 768, u = 1, E = 163, portrait = false, rowsWanted = 1, billsWanted = false, pureBills = false;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0, bgScale = 1;
  let matCanvas: HTMLCanvasElement | undefined, glowCanvas: HTMLCanvasElement | undefined, cupOff: HTMLCanvasElement | undefined, cupOn: HTMLCanvasElement | undefined;
  const tagStrip = strip(), lockStrip = strip(), doorStrip = strip(), billStrip = strip(), boardStrip = strip(), symStrip = strip();
  // Bills baked once per size and notation: the art with its numerals (index = bill kind - BILL1), and the board's $1.
  // Bills are baked at the tier's largest lifted size for this window (billBakeW), so a task whose row shrinks them
  // draws the same canvases smaller and never rebakes; billMade* hold what each canvas was baked for.
  const billCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined, undefined];
  const billMadeW = new Float32Array(4), billMadePx = new Float32Array(4), billMadeRatio = new Float32Array(4);
  let boardCanvas: HTMLCanvasElement | undefined, boardKey = '', billBakeW = 0;
  // Step 5's dashed slot ring and the dark rings under dish coins (one per coin kind).
  let slotCanvas: HTMLCanvasElement | undefined, slotBaked = 0;
  // An emptied row place's dashed ring, one per coin kind at its row size.
  const placeRing: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined, undefined], placeRingBaked = new Float32Array(4);
  const ringCanvas: (HTMLCanvasElement | undefined)[] = [undefined, undefined, undefined, undefined], ringBaked = new Float32Array(4);
  // Value tags: TAG_SLOTS cached sizes per coin kind (the row's, the dish's, the lock's), each with its drawn geometry.
  const tagCanvas: (HTMLCanvasElement | undefined)[] = new Array<HTMLCanvasElement | undefined>(4 * TAG_SLOTS).fill(undefined);
  const tagD = new Float32Array(4 * TAG_SLOTS).fill(-1), tagWs = new Float32Array(4 * TAG_SLOTS), tagHs = new Float32Array(4 * TAG_SLOTS);
  const tagOff = new Float32Array(4 * TAG_SLOTS), tagInks = new Float32Array(4 * TAG_SLOTS), tagNext = new Uint8Array(4), tagMins = new Float64Array(4 * TAG_SLOTS);
  const tagGeo = { w: 0, h: 0, off: 0, ink: 0 };
  /** Coins per row in each dish and their spacing (so the coins' value tags never overlap). */
  const dishPer = new Uint8Array(4).fill(4), dishPitch = new Float32Array(4).fill(30);
  // Locks (round CL4): step 4's region (the mat's felt, clear of the corner buttons), its committed layout and a scratch
  // one, the open lock's room (most coins it takes), where its next coin goes, the lock tags' smallest ink (step 4 and
  // 5), the plate sprite's one scaled copy the lengthened planks are drawn from (its longest side), and how many copies
  // of the plain wood each plank repeats.
  let lrX = 0, lrY = 0, lrW = 0, lrH = 0, lockRoom = LOCK_MAX, lockNextX = 0, lockNextY = 0, lockTagInk = TAG_MIN_INK;
  const geo = lockGeo(), geoTmp = lockGeo(), roomScratch = [0, 0, 0, 0];
  let plankSrc = 0, plankCopies = 1, fewPlateW = 0;
  let tagMinInk = TAG_MIN_INK, tagBakedInk = 0, tagFont = false;
  let artRatio = 0, glowSize = 0, bakedCup = 0, bakedMat = '', fontReady = false;
  let phase: Phase = 'play', tier: Tier = 0, intro = false, introStage = 0, visitorOffset = 0;
  let taskPhase: TaskPhase = 'enter', taskT = 0, seqT = 0, taskIndex = 0, tasksTotal = 3, enterSeconds = 1;
  let plan: TaskPlan = introTask(), lastTotal = 0;
  /** Cups: lit in the task's open area, still to pour, the pour clock, and where the open area starts (lock 2: row 6). */
  let lit = 0, pourLeft = 0, pourTimer = 0, pourKind = 0, cupBase = 0, firstLit = 0, firstPour = 0;
  let countOnT = -1, countOnAt = -1, countOnReplay = false, tagsT = 0, tagFocus = 0, picked = -1, doneTag = 0, doneForm = 0, doneLocks = false, rollEnd = 0;
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
  /** How far (in total) a pile's coins may be nudged sideways and still keep their tags clear of each other. */
  let pileNudge = 0;
  let purseX = 0, purseY = 0, purseW = 0, purseH = 0;
  let visH = 0, visX = 0, stumpX = 0, stumpY = 0, stumpW = 0, stumpH = 0, doorD = 0, hingeX = 0, doorCY = 0;
  let boardX = 0, boardY = 0, boardW = 0, boardH = 0, cupD = 0, cupPitch = 0;
  let matX = 0, matY = 0, matW = 0, matH = 0, inX = 0, inY = 0, inW = 0, inH = 0;
  let zoneX0 = 0, zoneY0 = 0, zoneX1 = 0, zoneY1 = 0;
  const dishX = new Float32Array(4), dishY = new Float32Array(4), dishW = new Float32Array(4), dishH = new Float32Array(4);
  const lockX = new Float32Array(2), lockY = new Float32Array(2);
  let lockW = 0, lockH = 0;
  // Step 5: one plate (index 1, the open lock) with its slots in a grid on the mat below it.
  const slotX = new Float32Array(SLOT_MAX), slotY = new Float32Array(SLOT_MAX);
  let slotD = 0;
  // Bills: play size, the pile's scale on the mat, the board's $1 rectangle.
  let billW = 220, billH = 110, pileScale = 1, pilePer = 1, pileStepX = 0, pileStepY = 0, boardBillX = 0, boardBillY = 0, boardBillW = 0, boardBillH = 0;
  const tagX = new Float32Array(3), tagY = new Float32Array(3);
  /** tagK: one numeral scale for all of a task's tags, so a tag's length never changes its numerals' size. */
  let tagW = 0, tagH = 0, tagK = 1;
  let starY = 0, starR = 0, cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1;
  let choiceSize = 0, choiceY = 0, restSize = 0, restY = 0, controlsY = 0, controlsRadius = 60;
  const offers = createStickerOffers(sprites), bookAt = new Float32Array(2);
  let bookH = 150, bookGlide = false;
  const stickerNames = new Map(STICKERS.map(s => [s.id, stickerSpriteName(s.id)]));
  const drawnScale = new Map<string, number>();
  // The visitor's goal: its picture and gift tag in the top band (layout), the tag's numerals, and the pop-in clock.
  let goalItem = 0, goalShow = true, goalX = 0, goalY = 0, goalSize = 0, gtagX = 0, gtagY = 0, gtagW = 0, gtagH = 0, goalPop = 9, goalWrite = 9;
  const goalStrip = strip();
  /** The getting-the-thing picture's longest side over the mat, and the visitor's held picture's. */
  let bigGoal = 0, heldGoal = 0;
  // The savings jar beside the board: centre and size, its baked fill, the shown share, its clocks (-1 when not shown).
  let jarX = 0, jarY = 0, jarW = 0, jarH = 0, jarFill = 0, jarT = -1, jarOut = -1, cupDim = 0, moteT = 0, jarKey = '';
  let jarCanvas: HTMLCanvasElement | undefined;
  // The finished task's goal: its amount, whether the count reached it, and the getting-the-thing clock (-1: none).
  let doneGoal = 0, doneReached = false, giftT = -1, seqSpeed = 1, outcome: '' | 'got' | 'not-yet' = '';
  /** Each task's goal picture this round and whether the visitor got it (the celebration shows them; never saved). */
  const roundItem = new Int8Array(4).fill(-1), roundGot = new Uint8Array(4);
  // The door: the slam's bounce clock, the dial's spin clock and angle, the baked dial and the carried piece's shadows.
  let slamT = 9, dialT = 9, dialBase = 0, dialRot = 0, dialCanvas: HTMLCanvasElement | undefined, dialKey = 0;
  let shadowCoin: HTMLCanvasElement | undefined, shadowBill: HTMLCanvasElement | undefined, shadowKey = '';
  // A picked-up piece: the clock since the press, its tilt from the pointer's speed, the pointer's last position.
  let carryT = 9, carryTilt = 0, lastPX = 0, visNod = 9;
  /** How far through the round the visitors' reactions are (0 first task, 1 last): hops and waves grow with it. */
  const cheer = (): number => (tasksTotal > 1 ? Math.min(1, taskIndex / (tasksTotal - 1)) : 1);

  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  /** Effects take their scatter from Math.random so they never shift the seeded task sequence. */
  const fxRandom = Math.random;
  /** A few gold glints where a piece landed. */
  const glints = (x: number, y: number, d: number): void => bits.burst(GLINT, 3, x, y - d * 0.15, d * 0.6, 110 * u, 70 * u, 26 * u, 0.5, fxRandom);
  const playable = (): boolean => phase === 'play';
  const isLock = (): boolean => plan.kind === 'lock';
  /** Step 5's lock: one plate, slots for the fewest coins. */
  const isFewest = (): boolean => plan.kind === 'lock' && plan.step === 5;
  /** A piece's worth in the task's units: coins in cents; bills in dollars, or the $1 bill as 100¢ in a CENTS task. */
  const worth = (kind: number): number => kind < BILL1 ? COIN_VALUE[kind]! : plan.unit === DOLLARS ? BILL_VALUE[kind - BILL1]! : 100 * BILL_VALUE[kind - BILL1]!;
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
    tagMinInk = TAG_MIN_INK * Math.max(1, u);
    const cornerU = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * cornerU, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    // The desk's far edge from the background's cover-fit (the loaded image's size when there is one).
    const img = sprites.get(BG), iw = img?.naturalWidth || BG_W, ih = img?.naturalHeight || BG_H;
    bgScale = Math.max(W / iw, H / ih); bgX = (W - iw * bgScale) / 2; bgY = (H - ih * bgScale) / 2;
    E = Math.round(bgY + EDGE_PX * (ih / BG_H) * bgScale);
    const tp = TIERS[tier];
    billBakeW = Math.round(Math.min(BILL_MAX_W * Math.max(1, u), Math.max(BILL_MIN_W, tp.bill * u)) * 1.08);
    // Visitor, stump and board shrink first (to 0.6); where that is not enough (a large uiScale), the coins and their
    // spacing shrink in 10 percent steps toward the dime's 96 px floor, and the band tries again.
    const rowMin = Math.min(1, 0.45 / u);
    let ok = false;
    for (let cs = 1; ; cs = Math.max(rowMin, cs * 0.9)) {
      sizeRow(tp, cs);
      for (let fit = 1; fit >= 0.6 - 1e-6; fit -= 0.05) { placeBand(fit); if ((ok = fits())) break; }
      if (ok || cs <= rowMin) break;
    }
    placeCups();
    placeMat(tp.snap * u);
    placeGoal(); placeJar();
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
    bakePieces(reratio);
    bakeFeel(reratio);
    fitTags();
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
  /**
   * Glyph strips for the tags, the lock plates and the door's plate, rebaked when their size or the font changes. The
   * lock plates' strip, the bills' and the board's are baked only for a task that draws them, since their sizes follow
   * the mat and the band, which change from task to task with the row's lines.
   */
  function bakeStrips(force: boolean): void {
    const tagPx = Math.max(16, Math.round(tagH * 0.42)), lockPx = Math.max(14, Math.round((isFewest() ? lockH : lockPMax()) * 0.45));
    const doorPx = Math.max(14, Math.round(doorD * (PLATE_Y1 - PLATE_Y0) * 0.8));
    if (force || tagStrip.px !== tagPx || !tagStrip.canvas) bakeStrip(tagStrip, tagPx, artRatio);
    if (force) lockStrip.px = 0;
    if (isLock() && (lockStrip.px !== lockPx || !lockStrip.canvas)) bakeStrip(lockStrip, lockPx, artRatio);
    if (force || doorStrip.px !== doorPx || !doorStrip.canvas) bakeStrip(doorStrip, doorPx, artRatio);
    const goalPx = Math.max(14, Math.round(gtagH * 0.5));
    if (force || goalStrip.px !== goalPx || !goalStrip.canvas) bakeStrip(goalStrip, goalPx, artRatio);
    // Bill numerals at 0.52 of the bill's height (baked for the lifted size), the board's $1 likewise, the blocks' symbol
    // at 0.6. These are baked only once a task needs them (bills; the board's $1 in a cents task over a dollar; step 8b).
    if (force) { billStrip.px = 0; boardStrip.px = 0; symStrip.px = 0; }
    const billPx = billStripPx(), boardPx = Math.max(12, Math.round(boardBillH * 0.52)), symPx = Math.max(24, Math.round(blockS * 1.08 * 0.6));
    if (billsWanted && billStrip.px !== billPx) bakeStrip(billStrip, billPx, artRatio);
    if (boardWanted() && boardStrip.px !== boardPx) { bakeStrip(boardStrip, boardPx, artRatio); boardKey = ''; }
    if (plan.kind === 'symbol' && symStrip.px !== symPx) bakeStrip(symStrip, symPx, artRatio);
  }
  /**
   * Bills with their numerals (the art and the numerals in one canvas per bill, baked at the lifted size 1.08), the
   * board's $1, step 5's slot ring and the dark rings under dish coins; each rebaked only when its size, the pixel
   * ratio, the notation or the font changes.
   */
  function bakePieces(force: boolean): void {
    if (billsWanted) for (let i = 0; i < 4; i++) if (force || !billFresh(i)) bakeBillAt(i);
    const bkey = `${boardBillW}@${artRatio}/${boardStrip.px}`;
    if (boardWanted() && boardBillW > 0 && boardStrip.px > 0 && (force || bkey !== boardKey)) {
      const c = bakeBill(0, boardBillW, boardStrip); if (c) { boardCanvas = c; boardKey = bkey; }
    }
    if (isFewest() && slotD > 0 && (force || !slotCanvas || slotBaked !== slotD)) { slotBaked = slotD; slotCanvas = bakeSlot(slotD, artRatio); }
    for (let k = 0; k < 4; k++) {
      const d = Math.round(dishCoinD(k));
      if (d > 0 && (force || !ringCanvas[k] || ringBaked[k] !== d)) { ringBaked[k] = d; ringCanvas[k] = bakeRing(d, artRatio); }
      const rd = coinD[k]!;
      if (rd > 0 && (force || !placeRing[k] || placeRingBaked[k] !== rd)) { placeRingBaked[k] = rd; placeRing[k] = bakeSlot(rd, artRatio); }
    }
    // Value tags for the sizes this layout draws coins at: the row's (also carried and flying), the dish's, the lock's.
    if (force || tagBakedInk !== tagMinInk || tagFont !== fontReady) { tagBakedInk = tagMinInk; tagFont = fontReady; tagD.fill(-1); tagCanvas.fill(undefined); }
    for (let k = 0; k < 4; k++) {
      tagSlot(k, coinD[k]!, tagMinInk, 0);
      if (isLock()) tagSlot(k, lockCoinD(k), lockTagInk);
      // A dish's coins lie in rows far enough apart that their tags never overlap (up to four a row, fewer in a small
      // dish); each row lies a little higher than the one in front, and only the front row is tagged.
      const d = dishCoinD(k), t = tagSlot(k, d, tagMinInk, 1), tw = t >= 0 ? tagWs[t]! : d, pitch = Math.max(d * 0.53, tw + 2);
      dishPer[k] = Math.max(1, Math.min(4, Math.floor((dishW[k]! * 0.95 - tw) / pitch) + 1)); dishPitch[k] = pitch;
    }
  }
  /**
   * The cached value tag for a coin of `kind` drawn `d` across with numerals at least `minInk` tall (baked on first use
   * of a size), or -1. The row's size keeps slot 0 and the dish's slot 1 (`pin`); other sizes (the locks', which change
   * as a lock fills) take turns in the rest.
   */
  function tagSlot(kind: number, d: number, minInk = tagMinInk, pin = -1): number {
    const dd = Math.round(d); if (dd <= 0) return -1;
    const base = kind * TAG_SLOTS;
    for (let i = base; i < base + TAG_SLOTS; i++) if (tagD[i] === dd && tagMins[i] === minInk) return i;
    let i = base + pin;
    if (pin < 0) { i = base + 2 + tagNext[kind]!; tagNext[kind] = (tagNext[kind]! + 1) % (TAG_SLOTS - 2); }
    tagCanvas[i] = bakeValueTag(COIN_VALUE[kind]!, dd, minInk, artRatio, fontReady, tagGeo);
    tagD[i] = dd; tagMins[i] = minInk; tagWs[i] = tagGeo.w; tagHs[i] = tagGeo.h; tagOff[i] = tagGeo.off; tagInks[i] = tagGeo.ink;
    return i;
  }
  /** A coin's value tag under the coin's own transform (centre, horizontal and vertical scale, turn), so it moves with it. */
  function coinTag(ctx: CanvasRenderingContext2D, kind: number, d: number, x: number, y: number, sx: number, sy: number, rot: number, minInk = tagMinInk): void {
    const i = tagSlot(kind, d, minInk), c = i >= 0 ? tagCanvas[i] : undefined; if (!c) return;
    const w = tagWs[i]!, h = tagHs[i]!, off = tagOff[i]!;
    if (rot === 0) ctx.drawImage(c, x - w * sx / 2, y + (off - h / 2) * sy, w * sx, h * sy);
    else { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, sy); ctx.drawImage(c, -w / 2, off - h / 2, w, h); ctx.restore(); }
    note(VALUE_TAG, w * Math.max(sx, sy), w * TAG_SHARP);
  }
  /**
   * The feel layer's baked pieces, each only when its size or the pixel ratio changes: the bits' sprites, the carried
   * coin's and bill's shadows, the vault dial, and the jar's fill.
   */
  function bakeFeel(force: boolean): void {
    bits.bake(Math.round(u * 100) / 100, artRatio);
    const sk = `${coinD[QUARTER]}/${billW}@${artRatio}`;
    if (force || sk !== shadowKey) { shadowKey = sk; shadowCoin = bakeShadow(coinD[QUARTER]!, artRatio, true); shadowBill = bakeShadow(billH, artRatio, false); }
    const dd = Math.max(8, Math.round(doorD * 0.27));
    if (force || dd !== dialKey || !dialCanvas) { dialKey = dd; dialCanvas = bakeDial(dd, artRatio); }
    const fw = Math.round(jarW * (JAR_X1 - JAR_X0)), fh = Math.round(jarH * (JAR_Y1 - JAR_Y0)), jk = `${fw}x${fh}@${artRatio}`;
    if (fw > 0 && fh > 0 && (force || jk !== jarKey)) { jarKey = jk; jarCanvas = bakeJarFill(fw, fh, artRatio); }
  }
  /**
   * The visitor's goal in the top band, standing on the desk edge between the stump and the sound button: the picture
   * (GOAL_H u tall) and the gift tag with the amount beside it, shrunk to fit; not shown in a portrait window.
   */
  function placeGoal(): void {
    const img = sprites.get(GOAL_NAMES[goalItem]!), ar = img ? img.naturalWidth / img.naturalHeight : 1;
    const x0 = stumpX + stumpW + 20 * u, x1 = soundX - cornerRadius - 16 * u, room = x1 - x0;
    let h = Math.min(GOAL_H * u, E - 12), tw = GTAG_W * u, need = h * ar + 10 * u + tw;
    goalShow = !portrait && room >= 120;
    const k = Math.min(1, Math.max(0.1, room) / need); h *= k; tw *= k; need *= k;
    goalSize = Math.round(Math.max(h, h * ar)); gtagW = Math.round(tw); gtagH = tw * GTAG_AR;
    const gx0 = x0 + (room - need) / 2;
    goalX = gx0 + h * ar / 2; goalY = E - h / 2 + 4 * u;
    gtagX = gx0 + h * ar + 10 * u + tw / 2; gtagY = E - gtagH / 2 - 18 * u;
    bigGoal = Math.round(Math.max(60, Math.min(512, matH * 0.8, matW * 0.5)));
    heldGoal = Math.round(visH * 0.5);
  }
  /** The savings jar stands on the mat's right end beside the board (the dishes there are empty by the time it rises). */
  function placeJar(): void {
    jarH = Math.round(Math.max(60, Math.min(boardH * 0.95, matH * 0.92))); jarW = Math.round(jarH * JAR_AR);
    jarX = Math.round((portrait ? matX + matW / 2 : boardX - 10 * u - jarW / 2)); jarY = Math.round(matY + matH - 6 * u - jarH / 2);
  }
  /** Whether this task can put the $1 bill on the board: a cents task over a dollar (step 6's trade, or step 8a's $1). */
  const boardWanted = (): boolean => plan.unit === CENTS && (plan.total > 100 || plan.bills[0]! > 0);
  /** The bills' numeral size: 0.52 of the baked bill's height. */
  const billStripPx = (): number => Math.max(14, Math.round(billBakeW / 2 * 0.52));
  /** Whether bill i's canvas was baked for this window, tier, pixel ratio and numeral strip. */
  const billFresh = (i: number): boolean => billCanvas[i] !== undefined && billMadeW[i] === billBakeW && billMadePx[i] === billStrip.px
    && billMadeRatio[i] === artRatio;
  /** Whether bill i still needs baking (its art loaded; a missing sprite is drawn plain, never waited for). */
  const billDue = (i: number): boolean => !billFresh(i) && sprites.get(BILL_NAMES[i]!) !== undefined;
  function bakeBillAt(i: number): void {
    if (billStrip.px <= 0) return;
    const c = bakeBill(i, billBakeW, billStrip); if (!c) return;
    billCanvas[i] = c; billMadeW[i] = billBakeW; billMadePx[i] = billStrip.px; billMadeRatio[i] = artRatio;
  }
  /** A round at step 7 or 8 may bring bills in any task after its warm-up: bake them ahead, in idle time. */
  const billsSoon = (): boolean => !intro && data.step >= 7;
  function billsPending(): boolean {
    if (!billsSoon()) return false;
    if (billStrip.px !== billStripPx()) return true;
    for (let i = 0; i < 4; i++) if (billDue(i)) return true;
    return false;
  }
  /**
   * One idle step of the bills' bake: the numeral strip (one long step, so it waits for a long idle period or the
   * IDLE_WAIT_MS limit), then one bill per step. False when there was nothing to do.
   */
  function prepareBills(deadline: IdleDeadline, overdue: boolean): boolean {
    if (!billsPending()) return false;
    const px = billStripPx();
    if (billStrip.px !== px) { if (overdue || deadline.timeRemaining() >= 12) { bakeStrip(billStrip, px, artRatio); idleWaitFrom = -1; } return true; }
    for (let i = 0; i < 4; i++) if (billDue(i)) { bakeBillAt(i); idleWaitFrom = -1; return true; }
    return false;
  }
  /**
   * One bill `w` wide (2:1): the art, then its value written as money ("$20") in both plain side panels, both at one
   * size (owner 2026-10-06: bills "need to be clearly labeled as $1, $5, etc.").
   */
  function bakeBill(i: number, w: number, s: Strip): HTMLCanvasElement | undefined {
    const img = sprites.get(BILL_NAMES[i]!); if (!img || !s.canvas) return undefined;
    const h = Math.round(w / 2), { c, g } = cpuCanvas(w * artRatio, h * artRatio); if (!g) return c;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    g.scale(artRatio, artRatio);
    const panelW = w * (BILL_PANEL1 - BILL_PANEL0), lx = w * (BILL_PANEL0 + BILL_PANEL1) / 2, rx = w - lx, k = (h * 0.52) / s.px;
    const value = BILL_VALUE[i]!;
    drawAmount(g, s, DOLLARS, value, lx, h / 2, k, panelW * 0.92, 0.3 * h / s.px);
    drawAmount(g, s, DOLLARS, value, rx, h / 2, k, panelW * 0.92, 0.3 * h / s.px);
    g.getImageData(0, 0, 1, 1);
    return c;
  }
  /** Coins at true ratios (the dime never below 96 CSS px) and the row along the bottom, at `cs` of their full size. */
  function sizeRow(tp: TierParams, cs: number): void {
    const cu = u * cs;
    const dime = Math.max(MIN_DIME_PX, tp.dime * cu);
    for (let k = 0; k < 4; k++) coinD[k] = Math.round(dime * COIN_MM[k]! / DIME_MM);
    const edge = Math.max(6, 20 * u);
    rowX = Math.round(edge); rowW = Math.round(W - 2 * edge);
    placeGap = Math.max(4, 8 * cu);
    // Bills keep 2:1, never under 192 x 96 CSS px and never over 280 x 140 at 1366x768 (scaled with u above it).
    billW = Math.round(Math.min(BILL_MAX_W * Math.max(1, u), Math.max(BILL_MIN_W, tp.bill * cu))); billH = Math.round(billW / 2);
    rowH = Math.round(coinD[QUARTER]! + 36 * cu);
    // The purse sits at the row's left end (a narrow portrait window leaves it out to keep two places).
    purseW = portrait ? 0 : Math.round(Math.min(PURSE_W * u, rowH * 0.7 / PURSE_AR)); purseH = Math.round(purseW * PURSE_AR);
    placesX0 = rowX + (purseW ? purseW + Math.round(16 * u) : 0); placesW = rowX + rowW - placesX0;
    // A bill's place is the bill plus a margin; in a narrow window two places share the line and the bills overlap a little.
    if (billsWanted) placeW = Math.max(96, Math.round(portrait ? Math.min(billW + 16 * cu, (placesW - placeGap) / 2) : billW + 16 * cu));
    else placeW = Math.max(96, Math.round(coinD[QUARTER]! + 16 * cu));
    perRow = Math.max(1, Math.floor((placesW + placeGap) / (placeW + placeGap)));
    rows = Math.min(2, Math.max(1, rowsWanted > perRow ? 2 : 1));
    // Bills never stack where the row has room: every bill gets its own place (a second line when needed, each line
    // only as tall as a lifted bill), so every bill's numerals stay in view.
    maxPlaces = Math.min(MAX_PLACES, billsWanted ? Math.max(tp.places, rowsWanted) : tp.places, perRow * rows);
    if (pureBills && rows === 2) rowH = Math.max(96, Math.round(billH * 1.08 + 20 * cu));
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
    } else {
      // Two dishes by two (the whole mat is the drop zone; the dishes only show where coins go).
      const cw = (inW - 8) / 2, ch = (inH - 8) / 2;
      for (let i = 0; i < 4; i++) {
        const k = DISH_ORDER[i]!, w = Math.min(cw, ch / ar(k)) * (0.8 + 0.2 * coinD[k]! / coinD[QUARTER]!), h = w * ar(k);
        dishW[k] = w; dishH[k] = h; dishX[k] = inX + (i % 2) * (cw + 8) + cw / 2; dishY[k] = inY + (i >> 1) * (ch + 8) + ch / 2;
      }
    }
    // Step 5's plate (worked out for every task, so it is warmed ahead with the end-of-round art).
    fewPlateW = Math.max(36, Math.min(110 * u, inH * 0.36, inW / LOCK_AR)) * LOCK_AR;
    if (isFewest()) {
      // Step 5: one plate across the top of the inner area, its slots in a grid on the mat below it.
      lockW = fewPlateW; lockH = lockW / LOCK_AR;
      lockX[0] = lockX[1] = inX + (inW - lockW) / 2; lockY[0] = lockY[1] = inY;
      placeSlots(inY + lockH + 10 * u, inY + inH);
    } else {
      // Step 4: two planks stacked on the felt, each as long as the region; see layoutLocks.
      const vs = viewScale(), m = matH * 0.07, gap = 6 * vs;
      let x0 = matX + m, y0 = matY + m, x1 = matX + matW - m;
      const y1 = matY + matH - m, below = cornerY + cornerRadius + gap;
      if (below > y0) {
        // A large uiScale can bring a corner button over the mat's top: keep the locks clear of it, either beside it or
        // below it, whichever leaves the larger region.
        let ax0 = x0, ax1 = x1;
        if (homeX + cornerRadius + gap > x0) ax0 = homeX + cornerRadius + gap;
        if (soundX - cornerRadius - gap < x1) ax1 = soundX - cornerRadius - gap;
        if ((ax1 - ax0) * (y1 - y0) >= (x1 - x0) * (y1 - below)) { x0 = ax0; x1 = ax1; } else y0 = below;
      }
      lrX = x0; lrY = y0; lrW = Math.max(40, x1 - x0); lrH = Math.max(40, y1 - y0);
      // The planks are drawn from one copy of the plate sprite scaled for the tallest plank in its fill pulse (warmed
      // ahead with the end-of-round art), so a plank that draws smaller as a lock fills never needs a new bake.
      plankSrc = Math.round(lockPMax() * 1.04 * LOCK_AR);
      if (isLock()) layoutLocks(0, true);
    }
    // Bills on the pile: fanned left to right across the inner area, as large as the play size where the mat allows.
    placePile();
    // The board's $1 bill lies over rows 1 to 5, as large as fits that half (2:1, at most 280 x 140 at 1366x768).
    {
      const ax = cupX[0]! - cupPitch / 2, ay = cupY[0]! - cupPitch / 2, aw = cupX[9]! - cupX[0]! + cupPitch, ah = cupY[49]! - cupY[0]! + cupPitch;
      boardBillW = Math.round(Math.min(aw * 0.98, ah * 2 * 0.98, BILL_MAX_W * Math.max(1, u))); boardBillH = Math.round(boardBillW / 2);
      boardBillX = ax + (aw - boardBillW) / 2; boardBillY = ay + (ah - boardBillH) / 2;
    }
    // The mat's zone: the whole drawn mat plus the snap distance, never over the row; the corner buttons' own circles
    // are cut out of it where they overlap (onMat).
    zoneX0 = Math.max(0, matX - snap); zoneX1 = Math.min(boardX - 2, matX + matW + snap);
    zoneY0 = Math.max(0, matY - snap); zoneY1 = Math.min(rowY - 2, matY + matH + snap);
    // Tags: three across the whole row (the purse slides away first), or stacked from the bottom over the mat and row
    // (portrait, or a landscape window too narrow for three).
    blockS = Math.max(96, Math.round(120 * u));
    const tw = Math.min(330 * u, (rowW - 48 * u) / 3);
    tagH = Math.max(96, tw * TAG_AR); tagW = tagH / TAG_AR;
    const symbol = plan.kind === 'symbol', across = symbol ? tagW + 32 * u + 2 * blockS + 24 * u : 3 * tagW + 16;
    if (!portrait && across <= rowW) {
      // Centred on the row's whole height (one line of places or two).
      const blockH = rows * rowH + (rows - 1) * placeGap, ty = rowY + (blockH - tagH) / 2;
      if (symbol) {
        // Step 8b: the one tag, then the two symbol blocks, centred along the row.
        const x0 = rowX + (rowW - across) / 2;
        tagX[0] = x0; tagY[0] = ty;
        for (let i = 0; i < 2; i++) { blockX[i] = x0 + tagW + 32 * u + blockS / 2 + i * (blockS + 24 * u); blockY[i] = ty + tagH / 2; }
      } else {
        const gap = Math.max(8, Math.min(24 * u, (rowW - 3 * tagW) / 2));
        const x0 = rowX + (rowW - 3 * tagW - 2 * gap) / 2;
        for (let i = 0; i < 3; i++) { tagX[i] = x0 + i * (tagW + gap); tagY[i] = ty; }
      }
    } else {
      tagH = 96; tagW = Math.min(W - 2 * edge, tagH / TAG_AR);
      const y0 = H - 6 - 3 * tagH - 8;
      for (let i = 0; i < 3; i++) { tagX[i] = (W - tagW) / 2; tagY[i] = y0 + i * (tagH + 4); }
      if (symbol) {
        // The tag in the middle line, the two blocks side by side in the bottom line.
        tagY[0] = y0 + tagH + 4;
        blockS = 96;
        for (let i = 0; i < 2; i++) { blockX[i] = W / 2 + (i - 0.5) * (blockS + 24); blockY[i] = H - 6 - blockS / 2; }
      }
    }
  }
  /** One numeral scale for the task's tags: the largest at which the longest tag still fits its face. */
  function fitTags(): void {
    const maxW = tagW * (TAG_FACE1 - TAG_FACE0) * 0.86;
    tagK = 1;
    for (let i = 0; i < 3; i++) {
      if (plan.kind === 'symbol' && i > 0) break;
      const w = measureAmount(tagStrip, plan.kind === 'symbol' ? BOXED : tagForm[i]!, tagVal[i]!);
      if (w > 0) tagK = Math.min(tagK, maxW / w);
    }
  }
  /** Step 5's slots: a grid in the mat's band from `y0` to `y1`, as large as fits (a quarter fits each). */
  function placeSlots(y0: number, y1: number): void {
    const n = Math.max(1, Math.min(SLOT_MAX, plan.slots)), bandH = Math.max(40, y1 - y0);
    let best = 0, bestCols = n;
    for (let cols = n; cols >= 1; cols--) {
      const rowsN = Math.ceil(n / cols), s = Math.min(coinD[QUARTER]! * 0.8, inW / cols, bandH / rowsN);
      if (s > best + 0.5) { best = s; bestCols = cols; }
    }
    slotD = Math.round(best * 0.9);
    const rowsN = Math.ceil(n / bestCols);
    // The slot coins' tags: uiScale's larger ink eases down (never under TAG_MIN_INK times the window's scale) until the
    // widest tag leaves a gap to the next slot's and, with two rows, clears the coin below it.
    const vs = viewScale(), gap = 6 * vs, floor = TAG_MIN_INK * Math.max(1, vs);
    let ink = tagMinInk;
    for (;;) {
      let w = 0, bot = 0;
      for (let k = QUARTER; k >= PENNY; k--) {
        const d = Math.round(slotD * 0.86 * COIN_MM[k]! / COIN_MM[QUARTER]!);
        tagGeom(COIN_VALUE[k]!, d, ink, fontReady, tagGeo); w = Math.max(w, tagGeo.w); bot = Math.max(bot, tagGeo.off + tagGeo.h / 2);
      }
      const dq = Math.round(slotD * 0.86);
      if (ink <= floor || (w + gap <= best && (rowsN < 2 || bot + gap + dq / 2 <= best))) break;
      ink = Math.max(floor, ink * 0.95);
    }
    lockTagInk = ink;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / bestCols), c = i % bestCols, m = Math.min(bestCols, n - r * bestCols);
      slotX[i] = inX + inW / 2 + (c - (m - 1) / 2) * best;
      slotY[i] = y0 + bandH / 2 + (r - (rowsN - 1) / 2) * best;
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
  /**
   * Place centres: the places spread evenly to the purse's right, in one row or two. A pile packs its coins closer
   * than their places so neighbours overlap; each coin still owns a cell at least 96 px wide and the row's full height.
   */
  function placeCoins(): void {
    const per = Math.max(1, Math.ceil(nPlaces / rows));
    let cell = placeW, pitch = placeW + placeGap;
    pileNudge = 0;
    if (pile) {
      // Coins overlap, but the pitch keeps every value tag (drawn upright, above all the coins) clear of its neighbours'
      // tags, with room left for the sideways nudge.
      let maxD = 0, maxTag = 0;
      for (let p = 0; p < nPlaces; p++) { const k = pKind[p]!, t = tagSlot(k, coinD[k]!); maxD = Math.max(maxD, coinD[k]!); if (t >= 0) maxTag = Math.max(maxTag, tagWs[t]!); }
      const clear = maxTag + 6 * u;
      cell = pitch = Math.min(pitch, Math.max(96, Math.round(maxD * 0.74), Math.ceil(clear + 10 * u)));
      pileNudge = Math.max(0, Math.min(14 * u, pitch - clear));
    }
    for (let i = 0; i < nPlaces; i++) {
      const r = Math.floor(i / per), j = i % per, m = Math.min(per, nPlaces - r * per);
      const span = m * cell + (m - 1) * (pitch - cell);
      pX[i] = placesX0 + (placesW - span) / 2 + cell / 2 + j * pitch;
      // A coin sits a little high in its place so the coin and the value tag hanging below it are centred together.
      const k = pKind[i]!, lift = k < BILL1 ? tagHang(coinD[k]!, tagMinInk) / 2 : 0;
      pY[i] = rowY + r * (rowH + placeGap) + rowH / 2 - lift;
      pHW[i] = cell / 2;
    }
  }

  // ---------------------------------------------------------------- tasks
  /**
   * A step's first-time demonstration is due: steps 2 to 7 on their first counted task, step 8 on its first symbol task
   * (the demonstration places the block). Each plays once per profile.
   */
  const demoDue = (step: number): boolean => !intro && step >= 2 && step <= TOP_STEP && (data.demos & (1 << step)) === 0 && (step !== 8 || plan.kind === 'symbol');
  let demoStarted = false;
  /** Pieces per kind (coins 0 to 3, bills 4 to 7) in this task's collection. */
  const pieceCount = (k: number): number => k < BILL1 ? plan.coins[k]! : plan.bills[k - BILL1]!;
  /** Pieces of each kind on a row place, largest first or (a pile) in random order. */
  function arrangeRow(): void {
    pKind.length = 0; pCount.length = 0; pUnlimited.length = 0;
    if (isLock()) {
      // Four stacks that never run out (quarters only when the amount is 25¢ or more).
      for (let k = QUARTER; k >= PENNY; k--) { if (k === QUARTER && !plan.quarters) continue; pKind.push(k); pCount.push(5); pUnlimited.push(true); }
      return;
    }
    let pieces = 0, kinds = 0;
    for (let k = 0; k <= BILL20; k++) { pieces += pieceCount(k); if (pieceCount(k) > 0) kinds++; }
    const room = Math.max(kinds, maxPlaces);
    if (pieces <= room) {
      for (let k = BILL20; k >= PENNY; k--) for (let n = 0; n < pieceCount(k); n++) { pKind.push(k); pCount.push(1); pUnlimited.push(false); }
    } else {
      // One stack per kind; spare places split single pieces off the biggest stacks.
      const stack = [0, 0, 0, 0, 0, 0, 0, 0], single = [0, 0, 0, 0, 0, 0, 0, 0];
      for (let k = 0; k <= BILL20; k++) stack[k] = pieceCount(k);
      let spare = room - kinds;
      while (spare > 0) {
        let best = -1; for (let k = 0; k <= BILL20; k++) if (stack[k]! > 1 && (best < 0 || stack[k]! > stack[best]!)) best = k;
        if (best < 0) break; stack[best]!--; single[best]!++; spare--;
      }
      for (let k = BILL20; k >= PENNY; k--) {
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
    let k = 0; for (let i = 0; i <= BILL20; i++) if (pieceCount(i) > 0) k++;
    return k;
  }
  function startTask(i: number): void {
    taskIndex = i;
    if (intro && introStage === 2 && i === 0) plan = introTask();
    else { const ts = taskStep(data.step, i); plan = planTask(ts.step, ts.warmup || intro, i, TIERS[tier].coins, TIERS[tier].bills, random, lastTotal); }
    lastTotal = plan.total;
    // The visitor's goal: a different picture from the last visitor's; its tag pops in as the visitor rises.
    goalItem = intro && i === 0 ? 0 : (goalItem + 1 + Math.floor(random() * (GOALS.length - 1))) % GOALS.length;
    goalPop = -RISE * 0.7; goalWrite = 9; giftT = -1; jarT = -1; jarOut = -1; jarFill = 0; cupDim = 0; seqSpeed = 1; doneReached = false; outcome = '';
    // Pieces left from the last task slide away (from where they lie now).
    for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) launch(LEAVE, pKind[p]!, pFace[p]!, Math.min(5, pCount[p]!), p, pX[p]! + pNx[p]!, pY[p]! + pNy[p]!, pX[p]! - W, pY[p]!, LEAVE_SECONDS);
    // The task decides the places (bills are wider; a narrow window may need a second line for more kinds), the lock
    // plates, step 5's slots and step 8b's blocks: lay out again (cheap: art is rescaled only when sizes change).
    const nBills = plan.bills[0]! + plan.bills[1]! + plan.bills[2]! + plan.bills[3]!;
    billsWanted = nBills > 0; pureBills = billsWanted && plan.coins[0]! + plan.coins[1]! + plan.coins[2]! + plan.coins[3]! === 0;
    // Coins share a place per kind; bills want a place each.
    rowsWanted = billsWanted ? kindsInTask() - (plan.bills[0]! > 0 ? 1 : 0) - (plan.bills[1]! > 0 ? 1 : 0) - (plan.bills[2]! > 0 ? 1 : 0) - (plan.bills[3]! > 0 ? 1 : 0) + nBills : kindsInTask();
    pile = !plan.sorted && !isLock() && !billsWanted;
    // The locks start empty before the layout lays them out.
    lockN.fill(0); lockCents.fill(0); lockCur.fill(0); lockPulse.fill(9);
    layout(W, H);
    lit = 0; pourLeft = 0; pourTimer = 0; firstLit = 0; firstPour = 0;
    // Step 4's open lock lights rows 6 to 10; a CENTS task with a $1 bill pours its coins into rows 6 to 10 too.
    cupBase = (isLock() && !isFewest()) || (plan.unit === CENTS && plan.bills[0]! > 0) ? 50 : 0;
    cupLit.fill(0); cupKind.fill(-1); cupPulse.fill(9); dishN.fill(0); dishPulse.fill(9);
    pileN.fill(0); pileCount = 0; billPulse.fill(9); boardBill = 0; boardPulse = 9; traded = false; tradeT = -1; tradeDemo = false;
    pileMax = Math.max(1, plan.unit === DOLLARS ? plan.bills[0]! + plan.bills[1]! + plan.bills[2]! + plan.bills[3]! : 1);
    placePile();
    tagState.fill(0); tagT.fill(0); tagsT = 0; tagFocus = 0; picked = -1; countOnT = -1; countOnReplay = false;
    for (let k = 0; k < 3; k++) { tagVal[k] = plan.tags[k] ?? 0; tagForm[k] = plan.tagForms[k] ?? CENTS; }
    if (plan.kind === 'symbol') { tagState[1] = 2; tagState[2] = 2; }
    fitTags();
    // Step 8b's blocks: $ and ¢ in random order.
    const flip = random() < 0.5; blockSym[0] = flip ? CENT : DOLLAR; blockSym[1] = flip ? DOLLAR : CENT;
    blockState.fill(0); blockT.fill(0); placedSym = -1; blockFocus = 0; symbolDemo = false; symbolResult = -1;
    visitor = intro ? i % VISITORS.length : (visitorOffset + i) % VISITORS.length;
    taskAssisted = intro || plan.warmup; taskDeliberate = true; taskBounced = false; taskDrops = 0; tagResult = -1; wrongPicks = 0; firstPickDone = false; taskBounces = 0;
    idleT = 0; demoStarted = false; arrowMoved = false;
    taskPhase = 'enter'; taskT = 0; visRise = 0; visSink = 0;
    // The door swings open as the visitor rises.
    if (doorK < 1) { doorFrom = doorK; doorTo = 1; doorT = 0; }
    // The new pieces slide out of the purse onto their places.
    arrangeRow();
    nPlaces = pKind.length;
    placeCoins();
    for (let p = 0; p < nPlaces; p++) {
      const n = pCount[p]!; pCount[p] = 0; pHop[p] = 9; pOrder[p] = p;
      pFace[p] = 0;
      // A pile: each coin turned, nudged a little and staggered up or down, so neighbours overlap (never so low that its
      // value tag would leave the window).
      pRot[p] = pile ? (random() - 0.5) * 0.9 : 0;
      pNx[p] = pile ? (random() - 0.5) * pileNudge : 0;
      pNy[p] = pile ? (p % 2 ? 1 : -1) * rowH * 0.12 + (random() - 0.5) * 10 * u : 0;
      if (pile) { const d = coinD[pKind[p]!]!; pNy[p] = Math.min(pNy[p]!, H - 4 - pY[p]! - d / 2 - tagHang(d, tagMinInk)); }
      const f = launch(ARRIVE, pKind[p]!, pFace[p]!, n, p, purseX + purseW * 0.7, purseY + purseH * 0.4, pX[p]! + pNx[p]!, pY[p]! + pNy[p]!, ARRIVE_SECONDS);
      if (f) f.t = -RISE * 0.6 - ARRIVE_STAGGER * p;
    }
    // A pile draws its coins in random order, so which coin lies on top changes from pile to pile.
    if (pile) for (let p = nPlaces - 1; p > 0; p--) { const j = Math.floor(random() * (p + 1)); const t = pOrder[p]!; pOrder[p] = pOrder[j]!; pOrder[j] = t; }
    purseHop = 0;
    enterSeconds = Math.max(RISE, RISE * 0.6 + ARRIVE_SECONDS + ARRIVE_STAGGER * Math.max(0, nPlaces - 1)) + 0.05;
    if (isLock() && !isFewest()) {
      // The visitor fills the first lock itself: its coins fly from the purse, one after another, and light the top rows.
      firstLeft = plan.first[0]! + plan.first[1]! + plan.first[2]! + plan.first[3]!; firstT = RISE;
      enterSeconds = Math.max(enterSeconds, RISE + firstLeft * FIRST_GAP + TO_DISH + 0.6);
    } else firstLeft = 0;
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
      if (isLock() && !takes(pKind[p]!)) continue;
      if (best < 0 || pKind[p]! > pKind[best]!) best = p;
    }
    return best;
  }
  /** Whether the open lock takes a coin of `kind` now (coins on their way count as in): step 4's or step 5's rule. */
  function takes(kind: number): boolean {
    const rest = plan.total - lockCents[1]! - reservedOpen();
    if (isFewest()) return fewestTakes(kind, rest, plan.slots - lockN[1]! - countFlights(LOCKED, -1));
    return lockTakes(kind, lockCur, rest, plan.first) && roomTakes(kind, rest, lockRoom - lockN[1]! - countFlights(LOCKED, -1), plan.quarters);
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
  /** A piece is pouring or on its way, the trade is playing, or the helper is showing: new pieces wait (the pressed one hops). */
  const busy = (): boolean => {
    if (pourLeft > 0 || tradeT >= 0 || hand.mode === HAND_DEMO) return true;
    for (const f of flights) if (f.active && (f.mode === DISH || f.mode === LOCKED || f.mode === BACK_LOCK || f.mode === PILE || f.mode === TO_BOARD)) return true;
    return false;
  };
  /**
   * Size of a coin lying in a dish (rows of four, overlapping a little) and where coin `i` of kind `k` lies, into pos.
   * Dish coins are up to 0.6 of their play size and ringed in dark ink so silver coins stand out on silver dishes.
   */
  const dishCoinD = (k: number): number => Math.min(coinD[k]! * 0.6, dishW[k]! * 0.8 / 2.6);
  function dishSlot(k: number, i: number, n: number): void {
    // Every row keeps the front row's columns, so a coin behind sits right behind one in front.
    const per = dishPer[k]!, d = dishCoinD(k), row = Math.floor(i / per), col = i % per, cols = Math.min(per, Math.max(n, i + 1)), rowsN = Math.ceil(Math.max(n, i + 1) / per);
    pos.x = dishX[k]! + (col - (cols - 1) / 2) * dishPitch[k]!;
    pos.y = dishY[k]! + dishH[k]! * 0.04 + ((rowsN - 1) / 2 - row) * d * 0.42;
  }
  /** A coin in a lock keeps the true ratios: step 4's quarter at the layout's size (step 5: a quarter fills a slot). */
  function lockCoinD(kind: number): number {
    const top = isFewest() ? slotD * 0.86 : geo.q;
    return top * COIN_MM[kind]! / COIN_MM[QUARTER]!;
  }
  /** Coin `i` in lock `l`, into pos: step 4's place in its lock's grid, or step 5's slot `i`. */
  function lockSlot(l: number, i: number): void {
    if (isFewest()) { const j = Math.min(SLOT_MAX - 1, i); pos.x = slotX[j]!; pos.y = slotY[j]!; return; }
    gridSlot(geo, l, i);
  }
  /** Coin `i` of lock `l` in layout g, into pos: the first row right of the amount, then rows under the plank. */
  function gridSlot(g: LockGeo, l: number, i: number): void {
    let row = 0, col = g.c0 + i;
    if (i >= g.cols0) { const j = i - g.cols0; row = 1 + Math.floor(j / Math.max(1, g.cols)); col = j % Math.max(1, g.cols); }
    pos.x = g.gx + col * g.cell; pos.y = g.top[l]! + g.p / 2 + row * g.rowH;
  }
  /** The window's own scale, without uiScale. */
  const viewScale = (): number => Math.min(U_MAX, Math.max(0.45, Math.min(W / 1366, H / 768)));
  /** Step 4's tallest plank: two of them, 10 px apart (times the window's scale), fill the region, at the sprite's shape. */
  const lockPMax = (): number => Math.max(36, Math.min((lrH - 10 * viewScale()) / 2, lrW / LOCK_AR));
  /** Rows a lock needs for n coins in layout g. */
  const lockRows = (g: LockGeo, n: number): number => (n <= g.cols0 ? 1 : 1 + Math.ceil((n - g.cols0) / Math.max(1, g.cols)));
  /** A lock's band for n coins: its plank, or more where the coins' rows and their tags reach further down. */
  const lockBand = (g: LockGeo, n: number): number => Math.max(g.p, g.p / 2 + (lockRows(g, n) - 1) * g.rowH + g.bot);
  /**
   * Step 4's grid for a quarter `q` across, into g: the plank (q at LOCK_Q of its height, at most the size that lets two
   * planks fill the region), the tags' smallest ink (uiScale's larger floor eases down as the coins shrink, to
   * TAG_MIN_INK times the window's scale at LOCK_Q_MIN), and columns as wide as the widest tag or coin the task can
   * bring plus a gap, so no two tags or coins in a row ever touch. Rows are a coin, its tag's hang and a gap apart, so a
   * tag never reaches the next row's coins. The first row lies on the plank right of the amount; the others run under
   * it, across the whole region.
   */
  function lockGrid(q: number, qTop: number, qMin: number, pMax: number, g: LockGeo): void {
    const vs = viewScale(), gap = 6 * vs, floor = TAG_MIN_INK * Math.max(1, vs);
    g.q = q; g.p = Math.min(pMax, q / LOCK_Q);
    g.ink = floor + Math.max(0, tagMinInk - floor) * Math.max(0, Math.min(1, (q - qMin) / Math.max(1, qTop - qMin)));
    let w = 0, dMax = 0, bot = 0;
    for (let k = plan.quarters ? QUARTER : DIME; k >= PENNY; k--) {
      const d = Math.round(q * COIN_MM[k]! / COIN_MM[QUARTER]!);
      tagGeom(COIN_VALUE[k]!, d, g.ink, fontReady, tagGeo);
      w = Math.max(w, tagGeo.w, d); dMax = Math.max(dMax, d); bot = Math.max(bot, tagGeo.off + tagGeo.h / 2);
    }
    g.cell = w + gap; g.bot = bot; g.rowH = bot + dMax / 2 + gap;
    g.cols = Math.max(0, Math.floor((lrW + gap) / g.cell));
    g.gx = lrX + (lrW - (g.cols * g.cell - gap)) / 2 + w / 2;
    // The first row: the columns wholly on the plank between the amount and the rounded right end.
    const pw = g.p * LOCK_AR, a = lrX + pw * LOCK_AMOUNT1, b = lrX + lrW - pw * 0.05;
    g.c0 = -1; g.cols0 = 0;
    for (let c = 0; c < g.cols; c++) {
      const x = g.gx + c * g.cell;
      if (x - w / 2 < a || x + w / 2 > b) continue;
      if (g.c0 < 0) g.c0 = c;
      g.cols0++;
    }
    if (g.c0 < 0) g.c0 = 0;
  }
  /**
   * Step 4: both locks laid out for n0 coins in the first and n1 in the open one, at the largest size that fits the
   * region, into g. Sizes step down by 6 percent to LOCK_Q_MIN (then on, only as a last resort after a resize). The
   * planks stack in the middle of the region, the open lock's 10 px (times the window's scale) below the first lock's
   * lowest tag. Returns whether the size is at least LOCK_Q_MIN.
   */
  function solveLocks(n0: number, n1: number, g: LockGeo): boolean {
    const vs = viewScale(), gapB = 10 * vs;
    const pMax = lockPMax(), qTop = pMax * LOCK_Q, qMin = Math.min(qTop, LOCK_Q_MIN * Math.max(1, vs));
    let q = qTop;
    for (;;) {
      lockGrid(q, qTop, qMin, pMax, g);
      const b0 = lockBand(g, n0), b1 = lockBand(g, n1);
      if ((g.cols0 >= 1 && b0 + gapB + b1 <= lrH + 0.5) || q <= qMin * 0.5) {
        g.band[0] = b0; g.band[1] = b1;
        g.top[0] = lrY + Math.max(0, (lrH - b0 - gapB - b1) / 2); g.top[1] = g.top[0]! + b0 + gapB;
        return q >= qMin - 1e-3;
      }
      q = q > qMin + 1e-3 ? Math.max(qMin, q * 0.94) : q * 0.94;
    }
  }
  /**
   * Step 4: lay both locks out for the coins in them and on their way (and `extra` more in the open lock), the room (the
   * most coins the open lock holds at the smallest size, worked out when `room` is set), where the open lock's next coin
   * goes, and the tags baked at the new size (the amount numerals are baked once for the tallest plank and drawn
   * smaller with it). Runs at layout and as each coin is sent, never per frame.
   */
  function layoutLocks(extra: number, room: boolean): void {
    if (!isLock() || isFewest()) return;
    const n0 = plan.first[0]! + plan.first[1]! + plan.first[2]! + plan.first[3]!;
    const n1 = lockN[1]! + countFlights(LOCKED, -1) + extra;
    if (room) {
      // The room at the smallest size: whole rows under the first lock's band.
      const vs = viewScale(), gapB = 10 * vs, pMax = lockPMax(), qTop = pMax * LOCK_Q;
      const qMin = Math.min(qTop, LOCK_Q_MIN * Math.max(1, vs));
      lockGrid(qMin, qTop, qMin, pMax, geoTmp);
      const avail = lrH - lockBand(geoTmp, n0) - gapB;
      let r = 0; while (geoTmp.p / 2 + r * geoTmp.rowH + geoTmp.bot <= avail + 0.5 && r < LOCK_MAX) r++;
      const fit = geoTmp.cols0 >= 1 && r >= 1 && geoTmp.p <= avail + 0.5 ? geoTmp.cols0 + (r - 1) * geoTmp.cols : 0;
      // Never less than the coins already sent plus the fewest that finish the lock (a resize mid-task), nor under 12.
      const rest = plan.total - lockCents[1]! - reservedOpen();
      lockRoom = Math.min(LOCK_MAX, Math.max(fit, 12, n1 + fewest(rest, plan.quarters, roomScratch)));
    }
    solveLocks(n0, n1, geo);
    lockTagInk = geo.ink;
    lockH = geo.p; lockW = lrW;
    for (let l = 0; l < 2; l++) { lockX[l] = lrX; lockY[l] = geo.top[l]!; }
    // The plain wood's copies: the fewest (odd) that keep each no wider than its share of the plank's own shape.
    const pw = lockH * LOCK_AR, mid = lockW - pw * (LOCK_CUT0 + 1 - LOCK_CUT1), share = pw * (LOCK_CUT1 - LOCK_CUT0);
    plankCopies = Math.max(1, Math.ceil(mid / share - 1e-6)); if (plankCopies % 2 === 0) plankCopies++;
    solveLocks(n0, n1 + 1, geoTmp); gridSlot(geoTmp, 1, n1); lockNextX = pos.x; lockNextY = pos.y;
    for (let k = 0; k < 4; k++) tagSlot(k, lockCoinD(k), lockTagInk);
  }
  /**
   * The pile's layout for this task's bills: as many per line as fit while every bill's left numeral panel stays in
   * view (each bill at least 0.36 of a bill right of the last; a second line 0.82 of a bill lower), as large as fits.
   */
  function placePile(): void {
    const aw = portrait ? matW - 8 : inW, ah = portrait ? matH - 8 : inH, n = Math.max(1, pileMax);
    let best = 0, per = n;
    for (let k = n; k >= 1; k--) {
      const rowsN = Math.ceil(n / k), sc = Math.min(1, aw / (billW * (1 + (k - 1) * 0.36)), ah / (billH * (1 + (rowsN - 1) * 0.82)));
      if (sc > best + 1e-3) { best = sc; per = k; }
    }
    pileScale = best; pilePer = per;
    const w = billW * best;
    pileStepX = per > 1 ? Math.min(w * 0.55, (aw - w) / (per - 1)) : 0; pileStepY = billH * best * 0.82;
  }
  /** Bill `i` of the pile, into pos: fanned left to right, the first at the left, in one line or more. */
  function pileSlot(i: number): void {
    const r = Math.floor(i / pilePer), c = i % pilePer, rowsN = Math.ceil(pileMax / pilePer), m = Math.min(pilePer, pileMax - r * pilePer);
    pos.x = matX + matW / 2 + (c - (m - 1) / 2) * pileStepX; pos.y = matY + matH / 2 + (r - (rowsN - 1) / 2) * pileStepY;
  }
  /** Send a piece from place `place` to the mat: a coin into its dish or the open lock, a bill onto the pile or the board. */
  function dropToMat(kind: number, face: number, place: number, fromX: number, fromY: number, deliberate: boolean, keyed: boolean): void {
    if (!deliberate) taskDeliberate = false;
    taskDrops++; idleT = 0;
    if (isBill(kind)) {
      if (plan.unit === DOLLARS) {
        pileSlot(pileCount + countFlights(PILE, -1));
        const f = launch(PILE, kind, 0, 1, place, fromX, fromY, pos.x, pos.y, TO_DISH);
        if (f) f.s1 = pileScale;
      } else {
        // A CENTS task's $1 bill stands for 100 cups: it lies on the board's upper half.
        const f = launch(TO_BOARD, kind, 0, 1, place, fromX, fromY, boardBillX + boardBillW / 2, boardBillY + boardBillH / 2, TO_DISH + 0.1);
        if (f) f.s1 = boardBillW / billW;
      }
      return;
    }
    if (!isLock()) {
      const n = dishN[kind]! + countFlights(DISH, kind) + 1;
      dishSlot(kind, n - 1, n);
      const f = launch(DISH, kind, face, 1, place, fromX, fromY, pos.x, pos.y, TO_DISH);
      if (f) { f.s1 = dishCoinD(kind) / coinD[kind]!; f.slot = dishN[kind]! + countFlights(DISH, kind) - 1; }
      return;
    }
    const take = takes(kind);
    if (take) {
      lockCur[kind]!++;
      const n = lockN[1]! + countFlights(LOCKED, -1) + 1;
      // Step 4: the locks make room for it now (coins already in may draw smaller and take new places).
      layoutLocks(1, false);
      lockSlot(1, n - 1);
      const f = launch(LOCKED, kind, face, 1, place, fromX, fromY, pos.x, pos.y, TO_DISH);
      if (f) f.s1 = lockCoinD(kind) / coinD[kind]!;
      return;
    }
    // Not taken: it flies to the lock (step 5: the next free slot), jiggles with a smile, and hops home.
    taskBounced = true; bounces++; taskBounces++;
    if (isFewest()) lockSlot(1, lockN[1]! + countFlights(LOCKED, -1)); else { pos.x = lockNextX; pos.y = lockNextY; }
    const f = launch(BACK_LOCK, kind, face, 1, place, fromX, fromY, pos.x, pos.y, TO_DISH + BACK_HOLD + BACK_HOP);
    if (f) f.s1 = lockCoinD(kind) / coinD[kind]!;
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
      if (mode === BACK_LOCK && available(focus) && !takes(pKind[focus]!)) ensureFocus();
      return;
    }
    if (mode === DISH) {
      const i = dishN[kind]!;
      if (i < DISH_MAX) dishFace[kind * DISH_MAX + i] = face;
      dishN[kind] = i + 1; dishPulse[kind] = 0;
      // A clink that climbs as the dish fills, a few glints where it landed, and the visitor nods.
      play('coin-clink', 'A', i, 0.7);
      dishSlot(kind, i, i + 1); glints(pos.x, pos.y, dishCoinD(kind));
      visNod = 0;
      startPour(kind);
      return;
    }
    if (mode === PILE) {
      if (pileCount < PILE_MAX) pileKind[pileCount] = kind;
      pileCount++; pileN[kind - BILL1]!++; billPulse[kind - BILL1] = 0;
      play('bill-rustle', 'A', 0, 0.8); play('pop', 'D', 3, 0.4);
      pileSlot(pileCount - 1); glints(pos.x, pos.y, billH * pileScale);
      visNod = 0;
      startPour(kind);
      return;
    }
    if (mode === TO_BOARD) { boardBill = 1; boardPulse = 0; play('bill-rustle', 'A', 0, 0.8); play('pop-big', 'B', 3, 0.7); glints(boardBillX + boardBillW / 2, boardBillY + boardBillH / 2, boardBillH); return; }
    if (mode === LOCKED || mode === FIRST) {
      const l = mode === FIRST ? 0 : 1, i = lockN[l]!;
      if (i < LOCK_MAX) { lockKind[l * LOCK_MAX + i] = kind; lockFace[l * LOCK_MAX + i] = face; }
      lockN[l] = i + 1; lockCents[l]! += COIN_VALUE[kind]!; lockPulse[l] = 0;
      play('coin-clink', 'A', i + (l ? 2 : 0), 0.7);
      lockSlot(l, i); glints(pos.x, pos.y, lockCoinD(kind));
      if (l) visNod = 0;
      if (l === 0) { firstPour += COIN_VALUE[kind]!; if (pourTimer < 0) pourTimer = 0; pourKind = kind; }
      else {
        startPour(kind);
        // The highlight leaves a stack the open lock no longer takes.
        if (available(focus) && !takes(pKind[focus]!)) ensureFocus();
      }
    }
  }
  function startPour(kind: number): void { pourLeft += worth(kind); pourKind = kind; if (pourTimer < 0) pourTimer = 0; }
  /** Light the next cup of the open area (or of the first lock's rows). The hundredth cup of step 6 starts the trade. */
  function lightCup(first: boolean): void {
    const i = first ? firstLit : cupBase + lit;
    if (i >= CUPS) return;
    cupLit[i] = 1; cupKind[i] = pourKind; cupPulse[i] = 0;
    if (first) firstLit++; else lit++;
    play('tick', 'C', (i % 10), POUR_GAP[pourKind]! < 0.05 ? 0.55 : 0.75);
    if (!first && i === CUPS - 1 && !traded && plan.unit === CENTS && plan.total > 100 && plan.bills[0] === 0) startTrade();
  }
  /** Step 6: a hundred lit cups slide together into a $1 bill on the board's upper half; the rest pour into rows 6 to 10. */
  function startTrade(): void {
    tradeT = 0; tradeDur = TRADE;
    if (!intro && !plan.warmup && demoDue(6) && plan.step === 6) { data.demos |= 1 << 6; demoStarted = true; taskAssisted = true; tradeDemo = true; }
    if (tradeDemo) { tradeDur = TRADE_DEMO; hand.mode = HAND_POINT; hand.t = 0; hand.after = -1; }
  }
  function updateTrade(dt: number): void {
    if (tradeT < 0) return;
    tradeT += dt;
    if (tradeT < tradeDur) return;
    tradeT = -1; traded = true; boardBill = 1; boardPulse = 0;
    for (let i = 0; i < CUPS; i++) { cupLit[i] = 0; cupPulse[i] = 9; }
    cupBase = 50; lit = 0;
    play('pop-big', 'B', 2, 0.8);
    if (hand.mode === HAND_POINT) { hand.mode = 0; idleT = 0; }
  }
  function updatePour(dt: number): void {
    if ((pourLeft <= 0 && firstPour <= 0) || tradeT >= 0) return;
    pourTimer -= dt;
    while ((pourLeft > 0 || firstPour > 0) && pourTimer <= 0 && tradeT < 0) {
      if (firstPour > 0) { lightCup(true); firstPour--; } else { lightCup(false); pourLeft--; }
      pourTimer += POUR_GAP[pourKind]!;
    }
  }
  /** Every piece is in and poured: the dishes (or the pile) count on from the largest. */
  function countDone(): boolean {
    if (pourLeft > 0 || tradeT >= 0 || carry.active || hand.mode === HAND_DEMO) return false;
    for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) return false;
    for (const f of flights) if (f.active && f.mode !== LEAVE) return false;
    return true;
  }
  /** Pieces in count-on group `g`: a dish's coins, the pile's bills of one kind, or the board's $1. */
  const groupCount = (g: number): number => g < BILL1 ? dishN[g]! : g < BOARD_GROUP ? pileN[g - BILL1]! : boardBill;
  const groupWorth = (g: number): number => g === BOARD_GROUP ? 100 : worth(g);
  /**
   * The count-on: the groups largest first (the board's $1, the bills by kind, the dishes), each pulsing with its cups.
   * Beside the board's $1 (a CENTS task's $1, or after step 6's trade) the first hundred cents are the bill and the
   * rest sit in rows 6 to 10.
   */
  function startCountOn(replay: boolean): void {
    nGroups = 0;
    if (boardBill && !traded) groupOrder[nGroups++] = BOARD_GROUP;
    for (let k = BILL20; k >= BILL1; k--) if (groupCount(k) > 0) groupOrder[nGroups++] = k;
    for (const k of DISH_ORDER) if (groupCount(k) > 0) groupOrder[nGroups++] = k;
    let j = 0;
    for (let n = 0; n < nGroups; n++) {
      const g = groupOrder[n]!, len = groupCount(g) * groupWorth(g);
      groupStart[n] = j; groupLen[n] = len;
      for (let c = 0; c < len; c++, j++) {
        const cup = boardBill ? (j < 100 ? -1 : 50 + j - 100) : j;
        if (cup >= 0 && cup < CUPS) cupKind[cup] = g;
      }
    }
    countOnT = 0; countOnReplay = replay; countOnAt = -1;
    if (!replay) { taskPhase = 'counton'; tagFocus = 0; }
  }
  /** Which group the count-on is at (an index into groupOrder), or -1 when done. */
  function countOnGroup(t: number): number { const n = Math.floor(t / COUNT_ON); return n < nGroups ? n : -1; }
  function updateCountOn(dt: number): void {
    if (countOnT < 0) return;
    countOnT += dt; const before = countOnAt, now = countOnGroup(countOnT); countOnAt = now;
    if (now !== before && now >= 0) {
      const g = groupOrder[now]!;
      if (g < BILL1) dishPulse[g] = 0; else if (g < BOARD_GROUP) billPulse[g - BILL1] = 0;
      // The board's $1 holds the first hundred: it pulses with whichever group reaches into them.
      if (boardBill && groupStart[now]! < 100) boardPulse = 0;
      play('pop', 'C', now * 2, 0.7);
      for (let i = 0; i < CUPS; i++) if (cupLit[i] && cupKind[i] === g) cupPulse[i] = 0;
      const total = groupStart[now]! + groupLen[now]!;
      if (total <= 100 && (total <= 20 || total === 25 || total % 10 === 0)) playVoice(audio, NUMBER_CLIPS[total]!);
    } else if (now < 0) {
      countOnT = -1;
      if (!countOnReplay) {
        taskPhase = plan.kind === 'symbol' ? 'symbol' : 'tags'; tagsT = 0; idleT = 0; tagFocus = 0; blockFocus = 0; play('pop', 'B', 4, 0.5);
        if (plan.kind === 'symbol' && symbolDemo) startBlockDemo();
      }
    }
  }
  /** A tag was chosen. Right: the task is done. Wrong: it tilts, sinks and fades; the dishes count on again. */
  function pickTag(i: number, deliberate: boolean): void {
    if (taskPhase !== 'tags' || tagState[i] !== 0 || tagsT < TAG_RISE) return;
    idleT = 0;
    const right = tagVal[i] === plan.total && tagForm[i] === plan.unit;
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
    if (plan.total <= 100) playVoice(audio, NUMBER_CLIPS[plan.total]!);
    finishTask();
  }
  /** Step 8b: the block whose symbol matches the collection ($ for bills, ¢ for coins). */
  const rightBlock = (): number => (blockSym[0] === (plan.unit === DOLLARS ? DOLLAR : CENT) ? 0 : 1);
  /** Step 8b: a symbol block was chosen. Right: it flies into the tag's box and the tag is done. Wrong: it hops back. */
  function chooseBlock(i: number, deliberate: boolean): void {
    if (taskPhase !== 'symbol' || blockState[i] !== 0 || placedSym >= 0 || tagsT < TAG_RISE) return;
    for (let j = 0; j < 2; j++) if (blockState[j] === 3) return;
    idleT = 0;
    const right = i === rightBlock();
    if (deliberate && symbolResult < 0) symbolResult = right ? 1 : 0;
    blockState[i] = right ? 3 : 1; blockT[i] = 0;
    play('pop', 'B', 2, 0.5);
    if (!right) {
      wrongPicks++; visHop = 0;
      for (let g = 0; g < 3; g++) sfxLater[g] = BLOCK_FLY + 0.09 * g; sfxLaterOn = true;
      if (blockFocus === i) blockFocus = 1 - i;
    }
  }
  function updateBlocks(dt: number): void {
    for (let i = 0; i < 2; i++) {
      if (blockState[i] === 0) continue;
      const before = blockT[i]!; blockT[i]! += dt;
      if (blockState[i] === 1 && blockT[i]! >= BLOCK_FLY + BLOCK_HOLD + BLOCK_HOP) blockState[i] = 0;
      if (blockState[i] === 3 && before < BLOCK_FLY && blockT[i]! >= BLOCK_FLY) {
        // The block settles in its box: the tag now reads in full and flies to the vault door.
        placedSym = blockSym[i]!; tagForm[0] = plan.unit;
        play('pop', 'C', 5, 0.8);
        picked = 0; tagState[0] = 3; tagT[0] = 0;
        play('pop-big', 'C', 4, 0.8);
        finishTask();
      }
    }
  }
  /** Step 8's first-time demonstration: the helper carries the matching block into the tag's box. */
  function startBlockDemo(): void {
    hand.mode = HAND_BLOCK; hand.t = 0; hand.place = rightBlock(); hand.kind = -1; hand.released = false; hand.taken = false; hand.after = -1;
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
      } else if (plan.kind === 'symbol') {
        if (symbolResult >= 0) { recordTask(data, symbolResult === 1); roundCounted.push(symbolResult); }
      } else if (tagResult >= 0) { recordTask(data, tagResult === 1); roundCounted.push(tagResult); }
    }
    doneTag = plan.total; doneForm = plan.unit; doneLocks = isLock();
    doneGoal = plan.goal; doneReached = plan.total >= plan.goal; goalWrite = 0;
    taskPhase = 'done'; seqT = 0; rollEnd = 0; seqSpeed = 1;
    if (isLock()) { lockPulse.fill(0); play('pop-big', 'C', 4, 0.8); }
  }
  /** Coins and bills leave the dishes, pile, board or locks and roll in an arc into the vault's doorway, 40 ms apart. */
  function startRoll(): void {
    let n = 0;
    const add = (kind: number, face: number, x: number, y: number, s0: number, board: boolean): void => {
      for (const r of rollers) if (!r.active) { r.active = true; r.kind = kind; r.face = face; r.x0 = x; r.y0 = y; r.s0 = s0; r.board = board; r.t = -ROLL_GAP * n; n++; return; }
    };
    if (doneLocks) {
      for (let l = 0; l < 2; l++) for (let i = 0; i < Math.min(LOCK_MAX, lockN[l]!); i++) {
        const k = lockKind[l * LOCK_MAX + i]!;
        lockSlot(l, i); add(k, lockFace[l * LOCK_MAX + i]!, pos.x, pos.y, lockCoinD(k) / coinD[k]!, false);
      }
      lockN.fill(0);
    } else {
      if (boardBill) { add(BILL1, 0, boardBillX + boardBillW / 2, boardBillY + boardBillH / 2, 1, true); boardBill = 0; }
      for (let i = 0; i < Math.min(PILE_MAX, pileCount); i++) { pileSlot(i); add(pileKind[i]!, 0, pos.x, pos.y, pileScale, false); }
      pileCount = 0; pileN.fill(0);
      for (const k of DISH_ORDER) for (let i = 0; i < Math.min(DISH_MAX, dishN[k]!); i++) { dishSlot(k, i, dishN[k]!); add(k, dishFace[k * DISH_MAX + i]!, pos.x, pos.y, dishCoinD(k) / coinD[k]!, false); }
      dishN.fill(0);
    }
    rollEnd = ROLL_GAP * Math.max(0, n - 1) + ROLL;
    play('whoosh', 'B', 0, 0.6);
  }
  let seqPrev = 0;
  /** Whether the finished-task clock passed `t` this frame. */
  const at = (t: number): boolean => seqPrev < t && seqT >= t;
  /**
   * The finished-task sequence on its own clock: the money rolls into the vault, the door slams and the dial spins
   * (updateDoor), the jar rises and fills toward the goal with the counted amount, then the visitor gets its thing or
   * smiles and waves, and sinks.
   */
  function updateDone(dt: number): void {
    seqPrev = seqT; seqT += dt;
    const rollAt = doneLocks ? COUNT_ON : SEQ_TAG, shutAt = rollAt + Math.max(0.3, rollEnd), jarAt = shutAt + 0.05, fillAt = shutAt + SLAM + 0.15;
    const resultAt = fillAt + FILL, sinkAt = resultAt + (doneReached ? GOT : NOT_YET), endAt = sinkAt + SINK;
    if (at(rollAt)) { startRoll(); return; }
    if (seqT < rollAt) return;
    if (at(shutAt)) { doorFrom = 1; doorTo = -1; doorT = 0; }
    if (at(jarAt)) { jarT = 0; jarOut = -1; jarFill = 0; moteT = 0; play('whoosh', 'C', 0, 0.3); }
    if (seqT >= fillAt && seqT < resultAt + 0.2) {
      // The jar fills with the counted amount: its share of the goal, full at the goal (never past it).
      const target = Math.min(1, doneTag / Math.max(1, doneGoal)), k = clamp01((seqT - fillAt) / FILL);
      jarFill = target * easeOutCubic(k); cupDim = k;
      for (let q = 0; q < 4; q++) if (at(fillAt + q * FILL / 4) && target > q * 0.2) play('jar-fill', 'A', q * 2 + Math.round(target * 2), 0.6);
      // Gold motes from the lit cups into the jar's mouth.
      moteT -= dt;
      while (k < 0.9 && moteT <= 0) {
        moteT += 0.045;
        const c = Math.floor(fxRandom() * CUPS);
        if (cupLit[c] || (boardBill && c < 50)) bits.toward(GLINT, cupX[c]!, cupY[c]!, jarX + (fxRandom() - 0.5) * jarW * 0.3, jarY - jarH * 0.28, 18 * u, 0.35);
      }
    }
    if (at(resultAt)) startOutcome();
    if (at(sinkAt)) { visSink = 0.0001; jarOut = 0; }
    if (seqT >= endAt) {
      // The board's cups go out; the door swings open as the next visitor rises.
      cupLit.fill(0); lit = 0; firstLit = 0; cupDim = 0;
      if (introStage === 1) { introStage = 2; startTask(0); return; }
      if (taskIndex + 1 < tasksTotal) startTask(taskIndex + 1);
      else finishRound();
    }
  }
  /**
   * The jar is full or not: reached, the goal picture grows over the mat, a ribbon lands on it with leaves, shavings
   * and glints, and it flies into the visitor's arms; not yet, the visitor smiles and waves and the picture waits.
   */
  function startOutcome(): void {
    if (taskIndex < 4) { roundItem[taskIndex] = goalItem; roundGot[taskIndex] = doneReached ? 1 : 0; }
    outcome = doneReached ? 'got' : 'not-yet';
    visHop = 0;
    if (doneReached) {
      giftT = 0; play('pop-big', 'B', 4, 0.7);
      bits.burst(GLINT, 8, jarX, jarY - jarH * 0.42, jarW * 0.8, 160 * u, 120 * u, 30 * u, 0.7, fxRandom);
    } else {
      play('go', 'D', 0, 0.55); goalPop = 0;
      bits.burst(GLINT, 3, jarX, jarY + jarH * (0.45 - jarFill * 0.6), jarW * 0.5, 70 * u, 40 * u, 22 * u, 0.5, fxRandom);
    }
  }
  /** The getting-the-thing scene's clock; the ribbon's landing and the hand-over make their sounds and bits. */
  function updateGift(dt: number): void {
    if (giftT < 0) return;
    const before = giftT; giftT += dt;
    const cx = matX + matW * 0.42, cy = matY + matH * 0.5;
    if (before < GIFT_GROW && giftT >= GIFT_GROW) {
      play('pop-big', 'C', 6, 0.6);
      bits.burst(LEAF, 14, cx, cy - bigGoal * 0.3, bigGoal * 0.5, 320 * u, 240 * u, 34 * u, 1.3, fxRandom);
      bits.burst(SHAVING, 10, cx, cy - bigGoal * 0.3, bigGoal * 0.5, 300 * u, 220 * u, 30 * u, 1.3, fxRandom);
      bits.burst(GLINT, 6, cx, cy, bigGoal * 0.8, 150 * u, 60 * u, 30 * u, 0.8, fxRandom);
    }
    if (before < GIFT_HOLD + 0.35 && giftT >= GIFT_HOLD + 0.35) { play('go', 'C', 0, 0.7); visHop = 0; bits.burst(GLINT, 5, visX, E - visH * 0.2, visH * 0.6, 120 * u, 80 * u, 26 * u, 0.6, fxRandom); }
  }
  /**
   * The door's swing on its own clock. Shutting accelerates into a slam; on the slam the door bounces, dust puffs from
   * the doorway, the clunk sounds and the dial spins shut. Opening eases in and out.
   */
  function updateDoor(dt: number): void {
    slamT += dt;
    if (dialT < 9) {
      const before = dialT; dialT += dt;
      dialRot = dialBase + Math.PI * 2.5 * easeOutBack(clamp01(dialT / DIAL_SPIN));
      if (before < DIAL_SPIN && dialT >= DIAL_SPIN) { dialBase += Math.PI * 2.5; dialRot = dialBase; dialT = 9; }
    }
    if (doorT >= 9) return;
    doorT += dt;
    const closing = doorTo < doorFrom, dur = closing ? SLAM : SHUT, k = clamp01(doorT / dur);
    doorK = lerp(doorFrom, doorTo, closing ? easeInCubic(k) : easeInOutSine(k));
    if (k < 1) return;
    doorT = 9;
    if (!closing) return;
    slamT = 0; dialT = 0; visHop = 0;
    play('door-clunk', 'A', 0, 0.85); play('lock-spin', 'A', 0, 0.6);
    const hx = stumpX + stumpW * HOLE_X, by = stumpY + stumpH * 0.95;
    bits.burst(DUST, 6, hx, by, stumpW * 0.4, 70 * u, 20 * u, 46 * u, 0.6, fxRandom);
    bits.burst(SHAVING, 4, hx, by - stumpH * 0.1, stumpW * 0.3, 160 * u, 160 * u, 22 * u, 0.8, fxRandom);
  }
  /** The introduction's goal: the dishes hold a dime and two pennies, twelve cups lit, the 12¢ tag on the door. */
  function startGoal(): void {
    introStage = 1; plan = introTask(); taskIndex = 0; visitor = 0;
    dishN.fill(0); dishN[DIME] = 1; dishN[PENNY] = 2; dishFace.fill(0);
    cupLit.fill(0); for (let i = 0; i < 12; i++) { cupLit[i] = 1; cupKind[i] = i < 10 ? DIME : PENNY; }
    lit = 12; nPlaces = 0; doneTag = 12; doneForm = CENTS; doneLocks = false; picked = -1; tagState.fill(2);
    pileCount = 0; pileN.fill(0); boardBill = 0;
    visRise = RISE; visSink = 0; doorK = 1; doorT = 9;
    // The squirrel saves for the bike (10¢); its twelve cents fill the jar, and it gets the bike.
    goalItem = 0; goalPop = 9; goalWrite = 9; doneGoal = plan.goal; doneReached = true; giftT = -1; jarT = -1; jarOut = -1; jarFill = 0; cupDim = 0; seqSpeed = 1; outcome = '';
    placeGoal();
    taskPhase = 'done'; seqT = -GOAL_HOLD; rollEnd = 0; taskT = 0;
  }
  /**
   * A step's first-time demonstration. Steps 2 to 5 and 7: the helper carries a coin or bill, then taps the next useful
   * one. Step 6 waits for the trade (startTrade plays it slowly while the hand points). Step 8: the helper places the
   * symbol block once the tag is up.
   */
  function startDemo(step: number): void {
    if (step === 6) return;
    data.demos |= 1 << step; taskAssisted = true; demoStarted = true;
    if (step === 8) { symbolDemo = true; return; }
    let p = -1;
    if (isLock() && !isFewest()) {
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
    tasksTotal = intro ? 3 : roundTasks(tier, data.step);
    hits = misses = bounces = 0; stars = 1; starsPlayed = 0; focus = 0; roundCounted.length = 0;
    carry.active = false; carry.keyed = false; hand.mode = 0; introStage = 0; doorK = 1; doorT = 9;
    bits.clear(); for (const f of flights) f.active = false; for (const r of rollers) r.active = false;
    nPlaces = 0; lastTotal = 0; roundItem.fill(-1); roundGot.fill(0); slamT = 9; dialT = 9;
    plan = introTask(); rowsWanted = 3; billsWanted = false; pureBills = false; pile = false;
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
    for (const f of flights) f.active = false; for (const r of rollers) r.active = false; bits.clear(); doorK = -1; doorT = 9;
    layout(W, H);
    play('fanfare', FANFARE.variant!);
    // Leaves and pencil shavings burst from the vault and drift down across the desk.
    const hx = stumpX + stumpW * HOLE_X, hy = stumpY + stumpH * HOLE_Y;
    bits.burst(LEAF, 26, hx, hy, stumpW * 0.5, 520 * u, 360 * u, 38 * u, 2.2, fxRandom);
    bits.burst(SHAVING, 22, hx, hy, stumpW * 0.5, 480 * u, 340 * u, 34 * u, 2.2, fxRandom);
    bits.burst(GLINT, 10, hx, hy, stumpW * 0.6, 260 * u, 160 * u, 32 * u, 1, fxRandom);
    bits.rain(40, W, 44 * u, fxRandom);
    dialT = 0;
  }
  const celebrationLocked = (): boolean => phaseT < Math.max(1.5, STAR_START + (stars - 1) * STAR_GAP_SECONDS + STAR_HIT_SECONDS);
  function finishCelebration(): void {
    if (phase !== 'celebration') return;
    bits.clear();
    if (pending?.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
    else enterRest();
  }
  function enterRest(): void {
    phase = 'rest'; phaseT = 0; guard(MENU_GUARD_MS); bits.clear();
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
    add(LOCK, fewPlateW); add(LOCK, plankSrc); add(TAG, tagW); add(SYMBOL, blockS);
    // The feel layer: the jar, the getting-the-thing picture at its big size with its ribbon, and the gift tag.
    add(JAR, jarH); add(RIBBON, Math.round(bigGoal * 0.42)); add(GIFT_TAG, gtagW);
    for (const g of GOAL_NAMES) add(g, bigGoal);
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
    if (prepareBills(deadline, overdue)) return;
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
    if ((fanfareStarted && !fanfareAsked) || (playable() && time >= 0.5 && (warmIndex < warmNames.length || billsPending()))) {
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
    if (isBill(kind)) {
      if (plan.unit === DOLLARS) pileSlot(pileCount + countFlights(PILE, -1)); else { pos.x = boardBillX + boardBillW / 2; pos.y = boardBillY + boardBillH / 2; }
      return;
    }
    if (isLock()) { if (isFewest()) lockSlot(1, lockN[1]! + countFlights(LOCKED, -1)); else { pos.x = lockNextX; pos.y = lockNextY; } return; }
    const n = dishN[kind]! + countFlights(DISH, kind) + 1;
    dishSlot(kind, n - 1, n);
  }
  function updateHand(dt: number): void {
    if (!hand.mode) return;
    hand.t += dt;
    if (hand.mode === HAND_POINT) return;
    if (hand.mode === HAND_BLOCK) {
      // The hand presses the block, which flies into its box with the hand; then the hand fades.
      if (!hand.released && hand.t >= HAND_CARRY_AT) { hand.released = true; chooseBlock(hand.place, false); }
      if (hand.t >= HAND_CARRY_AT + BLOCK_FLY + HAND_FADE) { hand.mode = 0; idleT = 0; }
      return;
    }
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
    updateTrade(dt);
    updatePour(dt);
    updateBlocks(dt);
    if (taskPhase === 'enter') {
      if (isLock() && firstLeft > 0 && taskT >= firstT) {
        // The visitor's coins fly from its purse into the first lock.
        const all = plan.first[0]! + plan.first[1]! + plan.first[2]! + plan.first[3]!, i = all - firstLeft;
        let kind = QUARTER, c = i;
        for (let k = QUARTER; k >= PENNY; k--) { if (c < plan.first[k]!) { kind = k; break; } c -= plan.first[k]!; }
        lockSlot(0, i);
        const f = launch(FIRST, kind, 0, 1, -1, visX, E + visH * 0.02, pos.x, pos.y, TO_DISH + 0.1);
        if (f) f.s1 = lockCoinD(kind) / coinD[kind]!;
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
    } else if (taskPhase === 'tags' || taskPhase === 'symbol') {
      tagsT += dt;
    } else if (taskPhase === 'done') { updateDone(dt); return; }
    updateCountOn(dt);
    // Idle help: the hint carries a coin or bill; at the tags and the symbol blocks the dishes count on again instead.
    const wait = wrongPicks >= 2 || taskBounces >= 2 ? IDLE_SOON : IDLE_SECONDS;
    const choosing = taskPhase === 'tags' || taskPhase === 'symbol';
    if ((taskPhase === 'count' || taskPhase === 'lock' || choosing) && !hand.mode && !carry.active && !busy() && countOnT < 0 && idleT >= wait) {
      if (choosing) startCountOn(true); else startHint();
      idleT = wait - IDLE_REPEAT;
    }
  }
  function updatePlay(dt: number): void {
    time += dt; idleT += dt;
    purseHop += dt; visHop += dt; matHop += dt;
    for (let p = 0; p < MAX_PLACES; p++) pHop[p]! += dt;
    for (let k = 0; k < CUPS; k++) cupPulse[k]! += dt;
    for (let k = 0; k < 4; k++) { dishPulse[k]! += dt; billPulse[k]! += dt; }
    boardPulse += dt;
    lockPulse[0]! += dt; lockPulse[1]! += dt;
    for (let k = 0; k < 3; k++) tagT[k]! += dt;
    goalPop += dt; goalWrite += dt; visNod += dt; carryT += dt;
    updateDoor(dt);
    updateGift(dt);
    if (jarT >= 0) jarT += dt;
    if (jarOut >= 0) { jarOut += dt; if (jarOut >= JAR_OUT) { jarT = -1; jarOut = -1; } }
    // The carried piece leans with the pointer's sideways speed.
    if (carry.active && dt > 0) {
      const lean = Math.max(-0.3, Math.min(0.3, (input.pointer.x - lastPX) / dt * 0.0005));
      carryTilt += (lean - carryTilt) * Math.min(1, dt * 12);
    } else carryTilt = 0;
    lastPX = input.pointer.x;
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
    const before = phaseT;
    phaseT += dt; time += dt;
    updateDoor(dt);
    if (phase === 'celebration') {
      // A second, smaller fall of leaves and shavings as the stars land, and glints over the visitors who got their thing.
      if (before < 1.1 && phaseT >= 1.1) {
        bits.rain(30, W, 42 * u, fxRandom);
        const nl = celebSplit(Math.min(4, pending?.tasks ?? 3));
        for (let i = 0; i < Math.min(4, pending?.tasks ?? 3); i++) if (roundGot[i]) { celebX(i, nl, Math.min(4, pending?.tasks ?? 3)); bits.burst(GLINT, 5, pos.x, E - visH * 0.3, visH * 0.5, 120 * u, 60 * u, 26 * u, 0.7, fxRandom); }
      }
      const shown = Math.min(stars, Math.max(0, Math.floor((phaseT - STAR_START - STAR_HIT_SECONDS) / STAR_GAP_SECONDS) + 1));
      if (shown > starsPlayed) { play('star', 'B', starsPlayed); starsPlayed = shown; }
      if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
    } else if (phase === 'sticker' && phaseT >= PICK_SECONDS) enterRest();
    if (phase === 'celebration' || phase === 'choice' || phase === 'sticker') warmOffers();
    offers.update(dt, phase === 'choice' ? menuSelected : -1);
  }

  // ---------------------------------------------------------------- render
  /**
   * A coin at play size (its front) with its value tag, at `scale` with a turn and a horizontal factor `sx` (a flip in
   * flight, the pick-up squash), all by transform of one cached size. The size log takes the wider of the two axes.
   */
  function coin(ctx: CanvasRenderingContext2D, kind: number, _face: number, x: number, y: number, scale: number, rot: number, sx: number, tagged = true): void {
    const d = coinD[kind]!;
    drawSprite(ctx, sprites, COIN_FRONT[kind]!, x, y, d, rot, sx * scale, scale);
    if (tagged) coinTag(ctx, kind, d, x, y, sx * scale, scale, rot);
    note(COIN_FRONT[kind]!, d * scale * Math.max(1, sx), COIN_PX);
  }
  /** An empty place's or dish's coin `d` across at `s`: the front faint, its value tag clear, `a` of their full strength. */
  function ghostCoin(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, d: number, s: number, a: number): void {
    ctx.globalAlpha = GHOST_ALPHA * a;
    drawSprite(ctx, sprites, COIN_FRONT[kind]!, x, y, Math.round(d), 0, s, s);
    ctx.globalAlpha = GHOST_TAG_ALPHA * a;
    coinTag(ctx, kind, d, x, y, s, s, 0);
    ctx.globalAlpha = 1;
    note(COIN_FRONT[kind]!, d * s, COIN_PX);
  }
  /** A bill at `scale` of its play size, drawn from its baked canvas (art and numerals) with a transform; never flipped. */
  function drawBill(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, scale: number, rot: number): void {
    const i = kind - BILL1, c = billCanvas[i], w = billW * scale, h = billH * scale;
    if (!c) { sprite(ctx, BILL_NAMES[i]!, x, y, w, rot); return; }
    if (rot !== 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(c, -w / 2, -h / 2, w, h); ctx.restore(); }
    else ctx.drawImage(c, x - w / 2, y - h / 2, w, h);
    note(BILL_NAMES[i]!, w, BILL_PX);
  }
  /** A coin or a bill. */
  function piece(ctx: CanvasRenderingContext2D, kind: number, face: number, x: number, y: number, scale: number, rot: number, sx: number): void {
    if (isBill(kind)) drawBill(ctx, kind, x, y, scale, rot * 0.15); else coin(ctx, kind, face, x, y, scale, rot, sx);
  }
  /**
   * A coin `d` px across at `s` of that (a pulse), drawn from one cached size with a transform; dish coins (`ring`) sit
   * on a dark ring so they stand out on their dish.
   */
  function smallCoin(ctx: CanvasRenderingContext2D, kind: number, _face: number, x: number, y: number, d: number, s: number, ring: boolean, tagged = true): void {
    const rc = ring ? ringCanvas[kind] : undefined;
    if (rc) { const rw = rc.width / artRatio * s; ctx.drawImage(rc, x - rw / 2, y - rw / 2, rw, rw); }
    drawSprite(ctx, sprites, COIN_FRONT[kind]!, x, y, Math.round(d), 0, s, s);
    if (tagged) coinTag(ctx, kind, d, x, y, s, s, 0);
    note(COIN_FRONT[kind]!, d * s, COIN_PX);
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
    // Reactions grow over the round: later visitors hop higher, nod deeper at each landed piece and dance more.
    const c = cheer();
    const hop = (visHop < 0.42 ? Math.sin(visHop / 0.42 * Math.PI) * (10 + 8 * c) * u : 0) + (visNod < 0.25 ? Math.sin(visNod / 0.25 * Math.PI) * (2 + 4 * c) * u : 0);
    const dance = happy ? Math.abs(Math.sin(time * 6)) * (3 + 6 * c) * u : 0;
    const top = E - cut * h + (1 - up) * h * cut - hop - dance;
    const wave = happy ? Math.sin(time * 9) * (0.05 + 0.04 * c) : Math.sin(time * 2.1) * 0.01;
    // Below the edge only the sack shows, and only as far as the visitor has risen.
    const clipBottom = E + (1 - cut) * h * up;
    ctx.save(); ctx.beginPath(); ctx.rect(0, -H, W, clipBottom + H); ctx.clip();
    drawSprite(ctx, sprites, VISITOR_NAMES[a]![pose], visX, top + h / 2, Math.max(w, h), wave);
    // The thing it saved for, once handed over, in its arms (it sinks with the visitor).
    if (giftT >= GIFT_HOLD + 0.35 && taskPhase === 'done') heldGift(ctx, visX + w * 0.3, top + h * 0.62, wave);
    ctx.restore();
    note(VISITOR_NAMES[a]![pose], Math.max(w, h), Math.max(img.naturalWidth, img.naturalHeight));
  }
  /** The stump vault and its round door, hinged on the doorway ring's right edge (scale 1 open, -1 shut). */
  function renderVault(ctx: CanvasRenderingContext2D, amount: number): void {
    sprite(ctx, STUMP, stumpX + stumpW / 2, stumpY + stumpH / 2, stumpW);
    const door = sprites.scaled(DOOR, doorD / 420);
    if (!door) return;
    const pr = sprites.pixelRatio, w = door.width / pr, h = door.height / pr;
    // The slam's bounce: the shut door overshoots a little wider and flatter, then settles.
    const b = slamT < SLAM_BOUNCE ? Math.sin(slamT / SLAM_BOUNCE * Math.PI * 2) * 0.05 * (1 - slamT / SLAM_BOUNCE) : 0;
    ctx.save(); ctx.translate(hingeX, doorCY); ctx.scale(doorK * (1 + b), 1 - b * 0.6);
    ctx.drawImage(door, 0, -h / 2, w, h);
    // The brass dial on the round plate spins shut after the slam.
    if (dialCanvas) {
      const dw = dialCanvas.width / artRatio;
      ctx.translate(doorD * (0.338 + 0.667) / 2, -doorD / 2 + doorD * (0.14 + 0.462) / 2); ctx.rotate(dialRot);
      ctx.drawImage(dialCanvas, -dw / 2, -dw / 2, dw, dw);
    }
    ctx.restore();
    note(DOOR, doorD, 420);
    // The tag's amount stays on the door's plate as a keepsake (not shown mid-swing).
    if (amount > 0 && Math.abs(doorK) > 0.6 && doorStrip.canvas) {
      const cx = hingeX + doorK * doorD * (PLATE_X0 + PLATE_X1) / 2, cy = doorCY - doorD / 2 + doorD * (PLATE_Y0 + PLATE_Y1) / 2;
      drawAmount(ctx, doorStrip, doneForm, amount, cx, cy, 1, doorD * (PLATE_X1 - PLATE_X0) * 0.9);
    }
  }
  function renderBoard(ctx: CanvasRenderingContext2D): void {
    sprite(ctx, BOARD, boardX + boardW / 2, boardY + boardH / 2, boardW);
    if (!cupOn || !cupOff) return;
    const cw = cupOn.width / artRatio, lock = isLock() && introStage !== 1, one = lock && isFewest();
    // Step 6's trade: the hundred lit cups slide together into the $1 bill, which grows in their place.
    const trading = tradeT >= 0, tk = trading ? easeInOutSine(clamp01(tradeT / tradeDur)) : 0;
    const bcx = boardBillX + boardBillW / 2, bcy = boardBillY + boardBillH / 2;
    for (let i = 0; i < CUPS; i++) {
      // Lock tasks show only the locks' amounts: step 4's first lock in rows 1 to 5 and the open lock in rows 6 to 10; step 5's one lock from row 1.
      if (one ? i >= plan.total : lock && (i < 50 ? i >= plan.total : i - 50 >= plan.total)) continue;
      // The $1 bill on the board covers rows 1 to 5.
      if (boardBill && !trading && i < 50) continue;
      const on = cupLit[i] === 1, p = cupPulse[i]!;
      // A lit cup pops in: from 0.7 up past full size to 1.3, then a damped wobble back to 1 (0.3 s).
      let cx = cupX[i]!, cy = cupY[i]!, sc = p >= 0.3 ? 1 : p < 0.06 ? lerp(0.7, 1.3, p / 0.06) : 1 + 0.3 * Math.exp(-(p - 0.06) * 14) * Math.cos((p - 0.06) * 22);
      if (trading) {
        if (!on && i < 50) { if (tk > 0.5) continue; ctx.globalAlpha = 1 - tk * 2; }
        else if (on) { cx = lerp(cx, bcx, tk); cy = lerp(cy, bcy, tk); sc = 1 - 0.75 * tk; ctx.globalAlpha = 1 - tk * 0.8; }
      } else if (on && cupDim > 0) ctx.globalAlpha = 1 - 0.7 * cupDim; // the cups pour into the jar
      if (on && glowCanvas && p < 0.35 && !trading) { const g = cupD * 2.6; ctx.globalAlpha = 1 - p / 0.35; ctx.drawImage(glowCanvas, cx - g / 2, cy - g / 2, g, g); ctx.globalAlpha = 1; }
      const w = cw * sc;
      ctx.drawImage(on ? cupOn : cupOff, cx - w / 2, cy - w / 2, w, w);
      ctx.globalAlpha = 1;
    }
    if ((boardBill || trading) && boardCanvas) {
      const s = trading ? lerp(0.4, 1, tk) : boardPulse < 0.35 ? 1 + Math.sin(boardPulse / 0.35 * Math.PI) * 0.06 : 1;
      const w = boardBillW * s, h = boardBillH * s;
      if (trading) ctx.globalAlpha = tk;
      ctx.drawImage(boardCanvas, bcx - w / 2, bcy - h / 2, w, h);
      ctx.globalAlpha = 1;
      note(BILL_NAMES[0]!, w, BILL_PX);
    }
  }
  /** While a piece is carried, where it would go glows softly: its own dish, the open lock, the pile's next place or the board's $1 spot. */
  function renderTargetGlow(ctx: CanvasRenderingContext2D): void {
    if (!carry.active || !glowCanvas || carry.keyed) return;
    const k = carry.kind, a = 0.45 + 0.2 * Math.sin(time * 5);
    let x = 0, y = 0, w = 0, h = 0;
    if (isBill(k)) {
      if (plan.unit === DOLLARS) { targetPoint(k); x = pos.x; y = pos.y; w = billW * pileScale * 1.5; h = billH * pileScale * 1.7; }
      else { x = boardBillX + boardBillW / 2; y = boardBillY + boardBillH / 2; w = boardBillW * 1.4; h = boardBillH * 1.7; }
    } else if (isLock()) { const bh = isFewest() ? lockH : geo.band[1]!; x = lockX[1]! + lockW / 2; y = lockY[1]! + bh / 2; w = lockW * 1.15; h = Math.max(lockH * 1.8, bh * 1.3); }
    else { x = dishX[k]!; y = dishY[k]!; w = dishW[k]! * 1.55; h = dishH[k]! * 1.7; }
    ctx.globalAlpha = a; ctx.drawImage(glowCanvas, x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
  }
  function renderMat(ctx: CanvasRenderingContext2D): void {
    if (matCanvas) ctx.drawImage(matCanvas, matX, matY, matW, matH);
    // Mouse hover while carrying: a soft cream frame inside the mat when letting go here would count the piece.
    if (matHover > 0.01) hoverRect(ctx, matX + matW / 2, matY + matH / 2, matW - 28 * u, matH - 28 * u, matHover);
    renderTargetGlow(ctx);
    if (isLock() && introStage !== 1) { renderLocks(ctx); return; }
    if (plan.unit === DOLLARS && introStage !== 1) {
      // Bills: one fanned pile across the mat, each bill pulsing with its kind in the count-on.
      for (let i = 0; i < Math.min(PILE_MAX, pileCount); i++) {
        const k = pileKind[i]!, p = billPulse[k - BILL1]!, s = p < 0.35 ? 1 + Math.sin(p / 0.35 * Math.PI) * 0.06 : 1;
        pileSlot(i); drawBill(ctx, k, pos.x, pos.y, pileScale * s, 0);
      }
      return;
    }
    for (const k of DISH_ORDER) {
      // Pulses scale the cached dish and coins with a transform (no new sizes are made during a pulse).
      const p = dishPulse[k]!, s = p < 0.35 ? 1 + Math.sin(p / 0.35 * Math.PI) * 0.06 : 1;
      sprite(ctx, DISH_NAMES[k]!, dishX[k]!, dishY[k]!, dishW[k]!, 0, s, s);
      const n = Math.min(DISH_MAX, dishN[k]!), d = dishCoinD(k);
      // An empty dish still says what it holds: its coin, faint, with the value tag where the first coin will lie.
      if (n === 0) { dishSlot(k, 0, 1); ghostCoin(ctx, k, dishX[k]! + (pos.x - dishX[k]!) * s, dishY[k]! + (pos.y - dishY[k]!) * s, d, s, 1); }
      // Back rows first. Only the front row carries value tags, drawn after every coin, so each tag is whole: a back
      // row's tag would peek out between and above the front coins as a fragment that can read as another amount.
      const per = dishPer[k]!;
      for (let row = Math.floor((n - 1) / per); row >= 0; row--) for (let i = row * per; i < Math.min(n, row * per + per); i++) {
        // The coin that just landed settles with a little bounce.
        const b = i === n - 1 && p < 0.3 ? 1 + 0.2 * Math.sin(p / 0.3 * Math.PI * 2) * (1 - p / 0.3) : 1;
        dishSlot(k, i, n); smallCoin(ctx, k, dishFace[k * DISH_MAX + i]!, dishX[k]! + (pos.x - dishX[k]!) * s, dishY[k]! + (pos.y - dishY[k]!) * s, d, s * b, true, false);
      }
      // The front row's tags at the dish's pulse only (not the landing bounce), so neighbouring tags never overlap.
      for (let i = 0; i < Math.min(n, per); i++) {
        dishSlot(k, i, n); coinTag(ctx, k, d, dishX[k]! + (pos.x - dishX[k]!) * s, dishY[k]! + (pos.y - dishY[k]!) * s, s, s, 0);
      }
    }
  }
  /**
   * A step-4 plank `len` long and `h` tall at (x, y) from the plate sprite's scaled copy: the padlock end and the rounded
   * right end at the sprite's shape, the plain wood between in plankCopies copies, every other one mirrored.
   */
  function drawPlank(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, x: number, y: number, len: number, h: number): void {
    const sw = src.width, sh = src.height, pw = h * LOCK_AR, leftW = pw * LOCK_CUT0, rightW = pw * (1 - LOCK_CUT1);
    const each = Math.max(0, len - leftW - rightW) / plankCopies, m0 = sw * LOCK_CUT0, mw = sw * (LOCK_CUT1 - LOCK_CUT0);
    ctx.drawImage(src, 0, 0, m0, sh, x, y, leftW + 0.5, h);
    for (let i = 0; i < plankCopies; i++) {
      const cx = x + leftW + i * each;
      if (i % 2 === 0) ctx.drawImage(src, m0, 0, mw, sh, cx, y, each + 0.5, h);
      else { ctx.save(); ctx.translate(cx + each, y); ctx.scale(-1, 1); ctx.drawImage(src, m0, 0, mw, sh, -0.5, 0, each + 1, h); ctx.restore(); }
    }
    ctx.drawImage(src, sw * LOCK_CUT1, 0, sw * (1 - LOCK_CUT1), sh, x + len - rightW, y, rightW, h);
  }
  function renderLocks(ctx: CanvasRenderingContext2D): void {
    const one = isFewest();
    // Step 4's planks come from the plate sprite's one scaled copy (made at layout or warmed ahead, never per size).
    const img = one ? undefined : sprites.get(LOCK), src = img ? sprites.scaled(LOCK, plankSrc / (img.naturalWidth || 1)) : undefined;
    for (let l = one ? 1 : 0; l < 2; l++) {
      const p = lockPulse[l]!, s = p < 0.35 ? 1 + Math.sin(p / 0.35 * Math.PI) * 0.04 : 1;
      const pw = one ? lockW : lockH * LOCK_AR;
      if (one) sprite(ctx, LOCK, lockX[l]! + lockW / 2, lockY[l]! + lockH / 2, lockW, 0, s, s);
      else if (src) {
        drawPlank(ctx, src, lockX[l]! + lockW * (1 - s) / 2, lockY[l]! + lockH * (1 - s) / 2, lockW * s, lockH * s);
        note(LOCK, pw * s, 1450);
      }
      // The amount on the plank just right of the padlock.
      if (lockStrip.canvas) drawAmount(ctx, lockStrip, CENTS, plan.total, lockX[l]! + pw * (LOCK_FREE0 + 0.1), lockY[l]! + lockH / 2, one ? 1 : lockH / lockPMax(), pw * 0.18);
      // Step 5: one dashed slot per coin of the fewest-coins answer.
      if (one && slotCanvas) {
        const sw = slotCanvas.width / artRatio;
        for (let i = 0; i < Math.min(SLOT_MAX, plan.slots); i++) ctx.drawImage(slotCanvas, slotX[i]! - sw / 2, slotY[i]! - sw / 2, sw, sw);
      }
      const n = Math.min(LOCK_MAX, lockN[l]!);
      for (let i = 0; i < n; i++) { const k = lockKind[l * LOCK_MAX + i]!; lockSlot(l, i); smallCoin(ctx, k, lockFace[l * LOCK_MAX + i]!, pos.x, pos.y, lockCoinD(k), 1, false, false); }
    }
    // Every lock coin's tag, after every plank and coin: each lies whole on its own coin's lower edge. The grid (step 4)
    // and the slots (step 5) keep each coin and its tag in a space of its own, so no tag touches another tag, a coin of
    // the next row, the other lock's plank or the mat's edge.
    for (let l = one ? 1 : 0; l < 2; l++) {
      const n = Math.min(LOCK_MAX, lockN[l]!);
      for (let i = 0; i < n; i++) { const k = lockKind[l * LOCK_MAX + i]!; lockSlot(l, i); coinTag(ctx, k, lockCoinD(k), pos.x, pos.y, 1, 1, 0, lockTagInk); }
    }
  }
  /** Fill `seq` with the glyphs of an amount and return their count. */
  function amountSeq(form: number, value: number): number {
    let n = 0;
    if (form === CENTS && value > 100) {
      seq[n++] = DOLLAR; n = digits(Math.floor(value / 100), n); seq[n++] = SPACE; seq[n++] = AND; seq[n++] = SPACE; n = digits(value % 100, n); seq[n++] = CENT;
    } else if (form === CENTS) { n = digits(value, n); seq[n++] = CENT; }
    else if (form === DOLLARS) { seq[n++] = DOLLAR; n = digits(value, n); }
    else if (form === BOXED) { seq[n++] = BOX; n = digits(value, n); seq[n++] = BOX; }
    else n = digits(value, n);
    return n;
  }
  function digits(v: number, n: number): number {
    if (v >= 100) seq[n++] = Math.floor(v / 100) % 10;
    if (v >= 10) seq[n++] = Math.floor(v / 10) % 10;
    seq[n++] = v % 10;
    return n;
  }
  const seqW = (s: Strip, g: number): number => (g === SPACE ? s.px * 0.28 : g === BOX ? s.boxW : s.w[g]!);
  /** The width of an amount at the strip's own size. */
  function measureAmount(s: Strip, form: number, value: number): number {
    const n = amountSeq(form, value);
    let w = 0; for (let i = 0; i < n; i++) w += seqW(s, seq[i]!);
    return w;
  }
  /**
   * An amount from a baked glyph strip, centred on (cx, cy), at `k` of the strip's size and shrunk to fit `maxW` (never
   * below `minK`). Forms: CENTS ("45¢", "$1 and 25¢" above 100), DOLLARS ("$45"), BOXED (step 8b: an empty box each
   * side of the numeral), or -1 for the bare numeral.
   */
  function drawAmount(ctx: CanvasRenderingContext2D, s: Strip, form: number, value: number, cx: number, cy: number, k: number, maxW: number, minK = 0): void {
    const atlas = s.canvas; if (!atlas) return;
    const w = measureAmount(s, form, value), n = amountSeq(form, value);
    const kk = Math.max(minK, Math.min(k, maxW / (w || 1)));
    let x = Math.round(cx - w * kk / 2);
    for (let i = 0; i < n; i++) {
      const g = seq[i]!;
      if (g === SPACE) { x += s.px * 0.28 * kk; continue; }
      if (g === BOX) {
        if (s.box) { const r = artRatio, dh = s.box.height / r * kk; ctx.drawImage(s.box, Math.round(x - s.pad * kk), Math.round(cy - dh / 2), s.box.width / r * kk, dh); }
        x += s.boxW * kk; continue;
      }
      x = glyph(ctx, s, g, x, cy, kk);
    }
  }
  function glyph(ctx: CanvasRenderingContext2D, s: Strip, g: number, x: number, cy: number, k: number): number {
    const atlas = s.canvas!, r = artRatio, sx = Math.max(0, (s.x[g]! - s.pad) * r), sw = (s.w[g]! + 2 * s.pad) * r, dh = atlas.height / r * k;
    ctx.drawImage(atlas, sx, 0, sw, atlas.height, Math.round(x - s.pad * k), Math.round(cy - dh / 2), sw / r * k, dh);
    return x + s.w[g]! * k;
  }
  /** Step 8b: the centre of the tag's $ box (left) or ¢ box (right), into pos; returns the tag amount's scale. */
  function boxPoint(dollar: boolean): number {
    const cx = tagX[0]! + tagW * (TAG_FACE0 + TAG_FACE1) / 2, w = measureAmount(tagStrip, BOXED, tagVal[0]!);
    const kk = Math.min(tagK, tagW * (TAG_FACE1 - TAG_FACE0) * 0.86 / (w || 1));
    pos.x = dollar ? cx - w * kk / 2 + tagStrip.boxW * kk / 2 : cx + w * kk / 2 - tagStrip.boxW * kk / 2;
    pos.y = tagY[0]! + tagH / 2;
    return kk;
  }
  function renderRow(ctx: CanvasRenderingContext2D): void {
    // The purse slides out to the left once the tags rise.
    const out = taskPhase === 'tags' || taskPhase === 'symbol' ? easeInCubic(clamp01(tagsT / TAG_RISE)) : 0;
    if (purseW > 0 && !(taskPhase === 'done' && !doneLocks)) {
      const tip = purseHop < 0.5 ? Math.sin(purseHop / 0.5 * Math.PI) * 0.25 : 0;
      sprite(ctx, PURSE, purseX + purseW / 2 - out * (purseW + 40), purseY + purseH / 2, purseW, -tip);
    }
    const showFocus = (taskPhase === 'count' || taskPhase === 'lock') && !carry.active && hand.mode !== HAND_DEMO;
    // A pile draws in its own order; the highlighted piece is drawn last so its ring shows on top.
    // Emptied places still say what they held (the piece faint, its value clear) until the tags rise over the row.
    const ghost = taskPhase === 'count' || taskPhase === 'counton' || taskPhase === 'lock' ? 1 : taskPhase === 'tags' || taskPhase === 'symbol' ? 1 - out : 0;
    // Coins first, then every value tag above all of them (upright, the top coin's only on a stack), so no coin or tag
    // ever covers part of another tag; the pile's pitch keeps the tags clear of each other.
    if (ghost > 0.01) for (let q = 0; q < nPlaces; q++) ghostPiece(ctx, pOrder[q]!, ghost);
    for (let q = 0; q < nPlaces; q++) { const p = pOrder[q]!; if (!(showFocus && p === focus)) rowPiece(ctx, p, false); }
    if (showFocus && focus < nPlaces) rowPiece(ctx, focus, true);
    if (ghost > 0.01) for (let q = 0; q < nPlaces; q++) ghostTag(ctx, pOrder[q]!, ghost);
    for (let q = 0; q < nPlaces; q++) rowTag(ctx, pOrder[q]!);
  }
  /** Where place p's top piece is drawn now (its nudge and hop), into pos. */
  function rowPoint(p: number): void {
    const hopK = pHop[p]! < 0.35 ? Math.sin(pHop[p]! / 0.35 * Math.PI) : 0;
    pos.x = pX[p]! + pNx[p]!; pos.y = pY[p]! + pNy[p]! - hopK * 14 * u;
  }
  function rowTag(ctx: CanvasRenderingContext2D, p: number): void {
    const kind = pKind[p]!; if (pCount[p]! <= 0 || isBill(kind)) return;
    rowPoint(p); const hs = 1 + placeHover[p]! * 0.06;
    coinTag(ctx, kind, coinD[kind]!, pos.x, pos.y, hs, hs, 0);
  }
  function ghostTag(ctx: CanvasRenderingContext2D, p: number, a: number): void {
    const kind = pKind[p]!; if (pCount[p]! > 0 || isBill(kind)) return;
    ctx.globalAlpha = ROW_GHOST_TAG_ALPHA * a;
    coinTag(ctx, kind, coinD[kind]!, pX[p]! + pNx[p]!, pY[p]! + pNy[p]!, 1, 1, 0);
    ctx.globalAlpha = 1;
  }
  function ghostPiece(ctx: CanvasRenderingContext2D, p: number, a: number): void {
    if (pCount[p]! > 0) return;
    const kind = pKind[p]!, x = pX[p]! + pNx[p]!, y = pY[p]! + pNy[p]!;
    if (isBill(kind)) { ctx.globalAlpha = GHOST_ALPHA * 1.4 * a; drawBill(ctx, kind, x, y, 1, 0); ctx.globalAlpha = 1; return; }
    // A dashed ring round the coin, faint (its tag comes in the tag pass, see renderRow).
    const d = coinD[kind]!, rc = placeRing[kind];
    if (rc) { const rw = rc.width / artRatio; ctx.globalAlpha = a; ctx.drawImage(rc, x - rw / 2, y - rw / 2, rw, rw); }
    ctx.globalAlpha = ROW_GHOST_ALPHA * a;
    drawSprite(ctx, sprites, COIN_FRONT[kind]!, x, y, d, pRot[p]!, 1, 1);
    ctx.globalAlpha = 1;
    note(COIN_FRONT[kind]!, d, COIN_PX);
  }
  function rowPiece(ctx: CanvasRenderingContext2D, p: number, focused: boolean): void {
    const n = pCount[p]!; if (n <= 0) return;
    const kind = pKind[p]!;
    rowPoint(p); const x = pos.x, y = pos.y;
    const under = Math.min(4, n - 1);
    // Mouse hover: a soft cream ring and a slight swell on the piece a press would pick up (scaled by transform).
    const hv = placeHover[p]!, hs = 1 + hv * 0.06;
    if (isBill(kind)) {
      // A stack (only where the row has too few places): the bills below peek out up and to the right.
      for (let k = under; k >= 1; k--) drawBill(ctx, kind, x + k * billW * 0.1, y - k * billH * 0.22, 1, 0);
      if (focused) focusRect(ctx, x, y, billW, billH);
      if (hv > 0.01) hoverRect(ctx, x, y, billW * hs, billH * hs, hv);
      drawBill(ctx, kind, x, y, hs, 0);
      return;
    }
    const d = coinD[kind]!;
    for (let k = under; k >= 1; k--) coin(ctx, kind, pFace[p]!, x + k * 3 * u, y + k * 5 * u, 1, pRot[p]!, 1, false);
    if (focused) focusMark(ctx, x, y, d * 0.5);
    if (hv > 0.01) hoverRing(ctx, x, y, d * 0.5 * hs, hv);
    coin(ctx, kind, pFace[p]!, x, y, hs, pRot[p]!, 1, false);
  }
  /** The keyboard highlight: a warm ring and a bobbing arrow above. */
  function focusMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const bob = Math.abs(Math.sin(time * 3)) * 8 * u;
    ctx.beginPath(); ctx.arc(x, y, r + 9 * u, 0, Math.PI * 2);
    ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
    focusArrow(ctx, x, y - r - 16 * u - bob);
  }
  /** The keyboard highlight around a bill or a block: a warm rounded frame and the bobbing arrow. */
  function focusRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const bob = Math.abs(Math.sin(time * 3)) * 8 * u;
    ctx.beginPath(); ctx.roundRect(x - w / 2 - 9 * u, y - h / 2 - 9 * u, w + 18 * u, h + 18 * u, 16 * u);
    ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
    focusArrow(ctx, x, y - h / 2 - 16 * u - bob);
  }
  /** The mouse hover cue: a soft cream ring round a coin or a round button, `k` (0 to 1) of its full strength. */
  function hoverRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number): void {
    ctx.globalAlpha = 0.5 * k; ctx.beginPath(); ctx.arc(x, y, r + 7 * u, 0, Math.PI * 2);
    ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER; ctx.stroke(); ctx.globalAlpha = 1;
  }
  /** The mouse hover cue round a bill, tag, block or the mat: a soft cream rounded frame. */
  function hoverRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number): void {
    ctx.globalAlpha = 0.5 * k; ctx.beginPath(); ctx.roundRect(x - w / 2 - 7 * u, y - h / 2 - 7 * u, w + 14 * u, h + 14 * u, 16 * u);
    ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function focusArrow(ctx: CanvasRenderingContext2D, x: number, ty: number): void {
    ctx.beginPath(); ctx.moveTo(x - 15 * u, ty - 20 * u); ctx.lineTo(x + 15 * u, ty - 20 * u); ctx.lineTo(x, ty); ctx.closePath();
    ctx.fillStyle = HIGHLIGHT; ctx.fill(); ctx.lineWidth = 3 * u; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  function renderTags(ctx: CanvasRenderingContext2D): void {
    if (taskPhase !== 'tags' && taskPhase !== 'symbol' && !(taskPhase === 'done' && !doneLocks && introStage !== 1)) return;
    const rising = taskPhase === 'tags' || taskPhase === 'symbol';
    for (let i = 0; i < 3; i++) {
      const st = tagState[i]!; if (st === 2) continue;
      const t = tagT[i]!, rise = rising ? easeOutCubic(clamp01((tagsT - i * 0.08) / TAG_RISE)) : 1;
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
      // Mouse hover: a soft cream frame and a slight swell (by transform) on the tag a press would pick.
      const hv = st === 0 ? tagHover[i]! : 0;
      if (hv > 0.01) { s = 1 + hv * 0.05; hoverRect(ctx, x, y, tagW * s, tagH * s, hv); }
      if (taskPhase === 'tags' && st === 0 && i === tagFocus) {
        ctx.beginPath(); ctx.roundRect(x - tagW / 2 - 8, y - tagH / 2 - 8, tagW + 16, tagH + 16, 18 * u);
        ctx.lineWidth = 9 * u; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * u; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
      }
      if (a < 1) ctx.globalAlpha = a;
      if (rot !== 0 || s !== 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-x, -y); }
      sprite(ctx, TAG, x, y, tagW);
      if (s > 1) note(TAG, tagW * s, 640);
      // Step 8b's tag shows an empty box each side of the numeral until the right symbol block lands in its box.
      const form = plan.kind === 'symbol' && placedSym < 0 ? BOXED : tagForm[i]!;
      drawAmount(ctx, tagStrip, form, tagVal[i]!, x - tagW / 2 + tagW * (TAG_FACE0 + TAG_FACE1) / 2, y, tagK, tagW * (TAG_FACE1 - TAG_FACE0) * 0.86);
      if (rot !== 0 || s !== 1) ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  /** Step 8b: the $ and ¢ blocks in the row; a chosen block flies to its box (a wrong one jiggles there and hops back). */
  function renderBlocks(ctx: CanvasRenderingContext2D): void {
    if (taskPhase !== 'symbol') return;
    for (let i = 0; i < 2; i++) {
      const st = blockState[i]!;
      const rise = easeOutCubic(clamp01((tagsT - 0.1 - i * 0.08) / TAG_RISE));
      let x = blockX[i]!, y = blockY[i]! + (1 - rise) * (H - blockY[i]! + blockS), s = 1;
      if (st !== 0) {
        const kk = boxPoint(blockSym[i] === DOLLAR), bx = pos.x, by = pos.y, small = tagStrip.px * 1.0 * kk / blockS, t = blockT[i]!;
        if (t < BLOCK_FLY) { const e = easeInOutSine(t / BLOCK_FLY); x = lerp(x, bx, e); y = lerp(y, by, e) - Math.sin(e * Math.PI) * 60 * u; s = lerp(1.08, small, e); }
        else if (st === 3) continue;
        else {
          const t2 = t - BLOCK_FLY;
          if (t2 < BLOCK_HOLD) { x = bx + Math.sin(t2 * 40) * 3 * u; y = by; s = small; }
          else { const k = clamp01((t2 - BLOCK_HOLD) / BLOCK_HOP), e = easeInOutSine(k); x = lerp(bx, x, e); y = lerp(by, y, e) - Math.sin(k * Math.PI) * 110 * u; s = lerp(small, 1, e); }
        }
      }
      if (st === 0 && i === blockFocus && rise >= 1 && hand.mode !== HAND_BLOCK) focusRect(ctx, x, y, blockS, blockS);
      // Mouse hover: a soft cream frame and a slight swell (by transform) on the block a press would send.
      const hv = st === 0 ? blockHover[i]! : 0;
      if (hv > 0.01) { s = 1 + hv * 0.06; hoverRect(ctx, x, y, blockS * s, blockS * s, hv); }
      sprite(ctx, SYMBOL, x, y, blockS, 0, s, s);
      glyph1(ctx, symStrip, blockSym[i]!, x, y, s * blockS * 0.6 / (symStrip.px || 1));
    }
  }
  /** One glyph centred on (x, y) at `k` of its strip's size. */
  function glyph1(ctx: CanvasRenderingContext2D, s: Strip, g: number, x: number, y: number, k: number): void {
    if (!s.canvas) return;
    glyph(ctx, s, g, x - s.w[g]! * k / 2, y, k);
  }
  function renderFlights(ctx: CanvasRenderingContext2D): void {
    for (const f of flights) {
      if (!f.active || f.t < 0) continue;
      const kind = f.kind, bill = isBill(kind);
      if (f.mode === ARRIVE || f.mode === LEAVE || f.mode === RETURN) {
        const k = clamp01(f.t / f.dur), e = f.mode === LEAVE ? easeInCubic(k) : easeOutCubic(k);
        const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * (f.mode === ARRIVE ? 50 : f.mode === RETURN ? 60 : 0) * u;
        const sc = f.mode === ARRIVE ? lerp(0.5, 1, e) : 1, under = Math.min(4, f.n - 1);
        if (bill) {
          // Bills slide and flutter, never flipped.
          const rot = Math.sin(k * Math.PI * 3) * 0.12 * (1 - k);
          for (let j = under; j >= 1; j--) drawBill(ctx, kind, x + j * 4 * u, y + j * 4 * u, sc, rot);
          drawBill(ctx, kind, x, y, sc, rot);
          continue;
        }
        // Sliding out of the purse, the coin spins and settles.
        const spin = f.mode === ARRIVE ? (1 - e) * Math.PI * 4 : 0, c = Math.cos(spin);
        for (let j = under; j >= 1; j--) coin(ctx, kind, f.face, x + j * 3 * u, y + j * 5 * u, sc, 0, 1, false);
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
      // DISH, LOCKED, FIRST, PILE, BOARD and the outward part of BACK_LOCK: an arc onto the mat or board, shrinking to size.
      const k = clamp01(f.t / Math.min(f.dur, TO_DISH + 0.1)), e = easeOutCubic(k);
      const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 70 * u, sc = lerp(f.s0, f.s1, e);
      // Bills flutter down (a rocking tilt that fades); coins spin over once in the arc and land flat.
      if (bill) drawBill(ctx, kind, x, y, sc, Math.sin(k * Math.PI * 3) * 0.16 * (1 - k));
      else coin(ctx, kind, f.face, x, y, sc, 0, Math.max(0.12, Math.abs(Math.cos(k * Math.PI * 2))));
    }
  }
  /** Coins and bills rolling in an arc into the vault's doorway, shrinking as they go in. */
  function renderRollers(ctx: CanvasRenderingContext2D): void {
    const hx = stumpX + stumpW * HOLE_X, hy = stumpY + stumpH * HOLE_Y;
    for (const r of rollers) {
      if (!r.active) continue;
      const k = r.t < 0 ? 0 : clamp01(r.t / ROLL), e = easeInOutSine(k), s = lerp(r.s0, r.s0 * 0.4, e);
      const x = lerp(r.x0, hx, e), y = lerp(r.y0, hy, e) - Math.sin(k * Math.PI) * 90 * u;
      if (k > 0.85) ctx.globalAlpha = 1 - (k - 0.85) / 0.15;
      if (r.board && boardCanvas) { const w = boardBillW * s, h = boardBillH * s; ctx.drawImage(boardCanvas, x - w / 2, y - h / 2, w, h); }
      else if (isBill(r.kind)) drawBill(ctx, r.kind, x, y, s, k * 0.6);
      else coin(ctx, r.kind, r.face, x, y, r.t < 0 ? r.s0 : s, k * 8, 1);
      ctx.globalAlpha = 1;
    }
  }
  function handTip(): void {
    if (hand.mode === HAND_POINT) {
      // Pointing at the $1 bill growing on the board.
      pos.x = boardBillX + boardBillW * 0.5; pos.y = boardBillY + boardBillH * 0.8 + Math.abs(Math.sin(hand.t * 3.2)) * 14 * u;
      return;
    }
    if (hand.mode === HAND_BLOCK) {
      const b = hand.place, tx = blockX[b]!, ty = blockY[b]!, t = hand.t;
      if (t < HAND_PRESS_AT) { const e = easeOutCubic(t / HAND_PRESS_AT); pos.x = lerp(tx + 60 * u, tx, e); pos.y = lerp(H + 40, ty, e); return; }
      if (t < HAND_CARRY_AT) { pos.x = tx; pos.y = ty; return; }
      boxPoint(blockSym[b] === DOLLAR);
      const sx = pos.x, sy = pos.y, e = easeInOutSine(clamp01((t - HAND_CARRY_AT) / BLOCK_FLY));
      pos.x = lerp(tx, sx, e); pos.y = lerp(ty, sy, e) - Math.sin(e * Math.PI) * 60 * u;
      return;
    }
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
    const fadeAt = hand.mode === HAND_BLOCK ? HAND_CARRY_AT + BLOCK_FLY : HAND_DROP_AT;
    let alpha = hand.mode === HAND_HINT ? 0.85 : 1;
    if (hand.mode !== HAND_TAP && hand.mode !== HAND_POINT && t > fadeAt) alpha *= 1 - clamp01((t - fadeAt) / HAND_FADE);
    if (hand.mode !== HAND_TAP && t < HAND_PRESS_AT) alpha *= clamp01(t / 0.3);
    const carrying = (hand.mode === HAND_DEMO || hand.mode === HAND_HINT) && t >= HAND_CARRY_AT && t < HAND_DROP_AT && (hand.mode === HAND_HINT || hand.taken);
    if (carrying || (hand.mode === HAND_HINT && t >= HAND_DROP_AT)) {
      const ghost = hand.mode === HAND_HINT;
      if (ghost && glowCanvas) { const g = glowSize; ctx.globalAlpha = alpha * (0.85 + Math.sin(time * 7) * 0.15); ctx.drawImage(glowCanvas, pos.x - g / 2, pos.y - g / 2, g, g); }
      ctx.globalAlpha = ghost ? alpha * 0.6 : 1; piece(ctx, kind, pFace[hand.place] ?? 0, pos.x, pos.y, 1, 0, 1); ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = alpha;
    const press = (t >= HAND_PRESS_AT && t < HAND_CARRY_AT && hand.mode !== HAND_TAP && hand.mode !== HAND_POINT) || ((hand.mode === HAND_TAP || hand.mode === HAND_POINT) && Math.abs(Math.sin(hand.t * 3.2)) < 0.15) ? 0.9 : 1;
    // The art's fingertip is at its top left corner: put it on the target.
    drawSprite(ctx, sprites, HAND, pos.x + hw * 0.42, pos.y + hs * 0.44, hs, 0, press, press);
    note(HAND, hs, img.naturalHeight);
    ctx.globalAlpha = 1;
  }
  /** Keyboard carry is not used: a key sends the highlighted piece straight to the mat. */
  function renderPlay(ctx: CanvasRenderingContext2D): void {
    renderVault(ctx, taskPhase === 'done' && (introStage === 1 || doneLocks || (picked >= 0 && tagT[picked]! >= SEQ_TAG)) ? doneTag : 0);
    renderGoal(ctx);
    renderVisitor(ctx);
    renderBoard(ctx);
    renderMat(ctx);
    renderJar(ctx);
    renderRow(ctx);
    renderTags(ctx);
    renderBlocks(ctx);
    renderFlights(ctx);
    renderRollers(ctx);
    renderCarry(ctx);
    renderGift(ctx);
    bits.render(ctx);
    renderHand(ctx);
  }
  /**
   * The carried piece follows the pointer, lifted: a short squash at the press, then it springs up past its lifted
   * size and settles, breathing gently, over a soft shadow (baked once) that grows apart from it as it rises.
   */
  function renderCarry(ctx: CanvasRenderingContext2D): void {
    if (!carry.active) return;
    const x = input.pointer.x, y = input.pointer.y, kind = carry.kind, bill = isBill(kind), lift = bill ? BILL_LIFT : COIN_LIFT, t = carryT;
    let s = lift, sq = 1;
    if (t < PICK_SQUASH) { s = 1; sq = 1 - 0.12 * (t / PICK_SQUASH); }
    else if (t < PICK_SQUASH + PICK_SPRING) { const k = (t - PICK_SQUASH) / PICK_SPRING; s = lerp(1, lift, easeOutBack(k, 2.4)); sq = 1 - 0.12 * (1 - k); }
    else s = lift + 0.012 * Math.sin(time * 6);
    const up = clamp01((s - 1) / (lift - 1)), sh = bill ? shadowBill : shadowCoin;
    if (sh) {
      const k = bill ? s : coinD[kind]! * s / coinD[QUARTER]!, w = sh.width / artRatio * k, h = sh.height / artRatio * k;
      ctx.globalAlpha = 0.45 + 0.55 * up; ctx.drawImage(sh, x - w / 2 + 8 * u * up, y - h / 2 + 14 * u * up, w, h); ctx.globalAlpha = 1;
    }
    if (bill) drawBill(ctx, kind, x, y, s, carryTilt * 0.6 + Math.sin(time * 7) * 0.02);
    else coin(ctx, kind, carry.face, x, y, s * sq, 0, (2 - sq) / sq);
  }
  /** The visitor's goal picture in the top band, with its amount on a gift tag (step 8 writes the amount in once counted). */
  function renderGoal(ctx: CanvasRenderingContext2D): void {
    if (!goalShow) return;
    const up = easeOutCubic(clamp01(visRise / RISE)) * (1 - easeInCubic(clamp01(visSink / SINK)));
    if (up <= 0.02 || goalPop < 0) return;
    const pop = goalPop < 0.4 ? lerp(0.9, 1, easeOutBack(goalPop / 0.4, 3)) : 1;
    const wiggle = taskPhase === 'done' && !doneReached && goalPop < 0.6 ? Math.sin(goalPop * 20) * 0.07 * (1 - goalPop / 0.6) : 0;
    ctx.globalAlpha = up;
    if (giftT < 0) sprite(ctx, GOAL_NAMES[goalItem]!, goalX, goalY + Math.sin(time * 2) * 2 * u, goalSize, wiggle, pop, pop);
    ctx.save(); ctx.translate(gtagX, gtagY); ctx.rotate(-0.06 + Math.sin(time * 1.7) * 0.03 + wiggle); ctx.scale(pop, pop);
    sprite(ctx, GIFT_TAG, 0, 0, gtagW);
    // Step 8 sets $ against ¢: its goal shows no symbol before the answer, so the amount is written in once counted.
    const shown = plan.step < 8 || taskPhase === 'done';
    if (shown && goalStrip.canvas) {
      const wk = plan.step >= 8 && goalWrite < 0.35 ? lerp(0.6, 1, easeOutBack(goalWrite / 0.35, 3)) : 1;
      drawAmount(ctx, goalStrip, plan.unit, plan.goal, -gtagW / 2 + gtagW * (GTAG_FACE0 + GTAG_FACE1) / 2, gtagH * 0.02, wk, gtagW * (GTAG_FACE1 - GTAG_FACE0) * 0.9);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  /** The goal picture (and its ribbon) drawn from the one cached big size, scaled by `s`. */
  function giftAt(ctx: CanvasRenderingContext2D, item: number, x: number, y: number, s: number, rot: number, ribbon: number): void {
    const img = sprites.get(GOAL_NAMES[item]!); if (!img) return;
    sprite(ctx, GOAL_NAMES[item]!, x, y, bigGoal, rot, s, s);
    if (ribbon <= 0) return;
    const ih = bigGoal * img.naturalHeight / Math.max(img.naturalWidth, img.naturalHeight), rw = Math.round(bigGoal * 0.42);
    const rs = s * (ribbon < 1 ? lerp(1.35, 1, easeOutCubic(ribbon)) : 1), a = ctx.globalAlpha;
    ctx.globalAlpha = Math.min(a, clamp01(ribbon * 3));
    sprite(ctx, RIBBON, x + Math.sin(rot) * ih * 0.4 * s, y - ih * 0.4 * s, rw, rot, rs, rs);
    ctx.globalAlpha = a;
  }
  /** The thing the visitor saved for, held in its arms. */
  function heldGift(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number): void { giftAt(ctx, goalItem, x, y, heldGoal / bigGoal, rot, 1); }
  /**
   * The getting-the-thing scene: the picture grows from the top band to the middle of the mat (springing past its
   * size), the ribbon lands on it, it rests with a soft glow, then flies into the visitor's arms.
   */
  function renderGift(ctx: CanvasRenderingContext2D): void {
    if (giftT < 0 || giftT >= GIFT_HOLD + 0.35 || taskPhase !== 'done') return;
    const cx = matX + matW * 0.42, cy = matY + matH * 0.5, t = giftT;
    let x = cx, y = cy, s = 1;
    if (t < GIFT_GROW) {
      // It springs out of the full jar, from the small picture on its lid.
      const k = t / GIFT_GROW, e = easeOutCubic(k), s0 = jarGoalSize() / bigGoal;
      x = lerp(jarX, cx, e); y = lerp(jarLidY(), cy, e) - Math.sin(k * Math.PI) * 60 * u; s = lerp(s0, 1, easeOutBack(k, 2));
    } else if (t < GIFT_HOLD) y = cy + Math.sin((t - GIFT_GROW) * 7) * 4 * u;
    else {
      const k = clamp01((t - GIFT_HOLD) / 0.35), e = easeInOutSine(k);
      x = lerp(cx, visX + visH * 0.3, e); y = lerp(cy, E - visH * 0.3, e) - Math.sin(k * Math.PI) * 50 * u; s = lerp(1, heldGoal / bigGoal, e);
    }
    if (glowCanvas && t >= GIFT_GROW * 0.6 && t < GIFT_HOLD) {
      const g = bigGoal * 1.5; ctx.globalAlpha = 0.55 * clamp01((t - GIFT_GROW * 0.6) / 0.2); ctx.drawImage(glowCanvas, x - g / 2, y - g / 2, g, g); ctx.globalAlpha = 1;
    }
    giftAt(ctx, goalItem, x, y, s, Math.sin(t * 5) * 0.04, (t - (GIFT_GROW - 0.05)) / GIFT_RIBBON);
  }
  /** The savings jar beside the board: it rises, its fill (behind the glass) shows the counted amount's share of the goal. */
  function renderJar(ctx: CanvasRenderingContext2D): void {
    if (jarT < 0) return;
    const rise = easeOutCubic(clamp01(jarT / JAR_RISE)), out = jarOut >= 0 ? easeInCubic(clamp01(jarOut / JAR_OUT)) : 0;
    const a = rise * (1 - out); if (a <= 0.01) return;
    const cy = jarY + (1 - rise) * jarH * 0.3 + out * jarH * 0.3, top = cy - jarH / 2;
    ctx.globalAlpha = a;
    if (jarCanvas && jarFill > 0.002) {
      const fw = jarW * (JAR_X1 - JAR_X0), fh = jarH * (JAR_Y1 - JAR_Y0), fx = jarX - jarW / 2 + jarW * JAR_X0, fy = top + jarH * JAR_Y0;
      const ch = jarCanvas.height, sy = ch * (1 - jarFill);
      ctx.drawImage(jarCanvas, 0, sy, jarCanvas.width, ch - sy, fx, fy + fh * (1 - jarFill), fw, fh * jarFill);
      ctx.fillStyle = 'rgba(255, 244, 200, 0.9)'; ctx.fillRect(fx + fw * 0.05, fy + fh * (1 - jarFill), fw * 0.9, Math.max(2, 3 * u));
    }
    sprite(ctx, JAR, jarX, cy, jarH);
    // What it is saving for: the goal picture sits on the lid (until it springs out) and the gift tag with the goal's
    // amount hangs on the jar's neck, so the jar's top is the goal.
    if (giftT < 0) sprite(ctx, GOAL_NAMES[goalItem]!, jarX, cy - jarH / 2 + jarH * 0.02 - jarGoalSize() * 0.32, goalSize, 0, jarGoalSize() / goalSize, jarGoalSize() / goalSize);
    const tk = jarW * 0.95 / gtagW, tx = jarX - jarW * 0.5, ty = top + jarH * 0.3;
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(-0.22); ctx.scale(tk, tk);
    sprite(ctx, GIFT_TAG, 0, 0, gtagW);
    if (goalStrip.canvas) drawAmount(ctx, goalStrip, plan.unit, doneGoal, -gtagW / 2 + gtagW * (GTAG_FACE0 + GTAG_FACE1) / 2, gtagH * 0.02, 1, gtagW * (GTAG_FACE1 - GTAG_FACE0) * 0.9);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  /** The goal picture on the jar's lid: its longest side, and its centre's height when the jar stands. */
  const jarGoalSize = (): number => Math.round(jarW * 0.62);
  const jarLidY = (): number => jarY - jarH / 2 + jarH * 0.02 - jarGoalSize() * 0.32;
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
  /** The things the round's visitors got pop onto the mat one after another, each with its ribbon. */
  function renderCelebGifts(ctx: CanvasRenderingContext2D): void {
    let m = 0; for (let i = 0; i < 4; i++) if (roundGot[i] && roundItem[i]! >= 0) m++;
    if (!m) return;
    const size = Math.min(bigGoal * 0.7, matW * 0.8 / m), sc = size / bigGoal;
    let j = 0;
    for (let i = 0; i < 4; i++) {
      if (!roundGot[i] || roundItem[i]! < 0) continue;
      const k = clamp01((phaseT - 0.5 - 0.3 * j) / 0.45);
      if (k > 0) {
        ctx.globalAlpha = clamp01(k * 3);
        giftAt(ctx, roundItem[i]!, matX + matW * (j + 1) / (m + 1), matY + matH * 0.55 - Math.abs(Math.sin(time * 3 + j)) * 6 * u, sc * lerp(0.9, 1, easeOutBack(k, 2.5)), Math.sin(time * 2 + j) * 0.05, k * 2 - 0.4);
        ctx.globalAlpha = 1;
      }
      j++;
    }
  }
  /** How many of the celebration's `n` visitors stand left of the vault (the rest stand right of it). */
  function celebSplit(n: number): number {
    const lw = Math.max(0, stumpX - 8 - (homeX + cornerRadius + 8)), rw = Math.max(0, soundX - cornerRadius - 8 - (stumpX + stumpW + 8));
    return Math.min(n, Math.max(lw > 0 ? 1 : 0, Math.round(n * lw / ((lw + rw) || 1))));
  }
  /** Celebration visitor `i`'s x on the desk edge, into pos.x (`nl` of the `n` stand left of the vault). */
  function celebX(i: number, nl: number, n: number): void {
    const l0 = homeX + cornerRadius + 8, l1 = stumpX - 8, r0 = stumpX + stumpW + 8, r1 = soundX - cornerRadius - 8;
    const lw = Math.max(0, l1 - l0), rw = Math.max(0, r1 - r0), left = i < nl, j = left ? i : i - nl, m = Math.max(1, left ? nl : n - nl);
    pos.x = left ? l0 + lw * (j + 0.5) / m : r0 + rw * (j + 0.5) / m;
  }
  /**
   * The round's visitors pop up along the desk edge on both sides of the vault, happy and dancing (later ones dance a
   * little more); a visitor that got its thing this round holds its picture.
   */
  function renderCelebVisitors(ctx: CanvasRenderingContext2D, from: number, n: number): void {
    const nl = celebSplit(n);
    for (let i = 0; i < n; i++) {
      const a = (from + i) % VISITORS.length, img = sprites.get(VISITOR_NAMES[a]![1]), wait = sprites.get(VISITOR_NAMES[a]![0]);
      if (!img || !wait) continue;
      const k = visH * 0.8 / wait.naturalHeight, h = img.naturalHeight * k, w = img.naturalWidth * k;
      const pop = easeOutBack(clamp01((phaseT - 0.15 * i) / 0.45));
      celebX(i, nl, n);
      const x = pos.x, y = E - h * CUT_HAPPY * pop + h / 2 - Math.abs(Math.sin(time * 4 + i)) * (6 + 3 * i) * u;
      ctx.save(); ctx.beginPath(); ctx.rect(0, -H, W, E + H); ctx.clip();
      drawSprite(ctx, sprites, VISITOR_NAMES[a]![1], x, y, Math.max(w, h), Math.sin(time * 6 + i * 1.3) * (0.05 + 0.015 * i));
      const item = roundItem[i]!;
      if (roundGot[i] && item >= 0 && pop > 0.5) {
        const gi = sprites.get(GOAL_NAMES[item]!);
        if (gi) { const s = Math.round(h * 0.55); sprite(ctx, GOAL_NAMES[item]!, x + w * 0.42, y + h * 0.12, s, Math.sin(time * 5 + i) * 0.08); }
      }
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
      renderCelebGifts(ctx);
      bits.render(ctx);
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
    // Mouse hover: a slight swell and a soft cream ring; the icon keeps its baked size and scales by transform.
    const hs = 1 + homeHover * 0.08, hr = cornerRadius * hs;
    if (homeHover > 0.01) { ctx.globalAlpha = 0.45 * homeHover; ctx.beginPath(); ctx.arc(homeX, cornerY, hr + 7, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = HOVER; ctx.stroke(); ctx.globalAlpha = 1; }
    chunkyCircle(ctx, homeX, cornerY, hr, '#a8d58f', OUTLINE, 4);
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
  /** The place whose cell holds (x, y): its place, or in a pile the column it owns (at least 96 px wide). */
  function placeAt(x: number, y: number): number {
    for (let p = 0; p < nPlaces; p++) {
      const top = placeTop(p);
      if (Math.abs(x - pX[p]!) <= pHW[p]! && y >= top && y <= top + rowH) return p;
    }
    return -1;
  }
  /** The mat's zone, less the corner buttons' circles (a press there is the button's, never a drop). */
  const onMat = (x: number, y: number): boolean => x >= zoneX0 && x <= zoneX1 && y >= zoneY0 && y <= zoneY1 && !onCorner(x, y);
  const onTag = (x: number, y: number): number => {
    for (let i = 0; i < 3; i++) if (tagState[i] === 0 && x >= tagX[i]! && x <= tagX[i]! + tagW && y >= tagY[i]! && y <= tagY[i]! + tagH) return i;
    return -1;
  };
  const onBlock = (x: number, y: number): number => {
    for (let i = 0; i < 2; i++) if (Math.abs(x - blockX[i]!) <= blockS / 2 && Math.abs(y - blockY[i]!) <= blockS / 2) return i;
    return -1;
  };
  const onCorner = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius || Math.hypot(x - soundX, y - cornerY) <= cornerRadius;
  const onRow = (x: number, y: number): boolean => y >= rowY - 8 && x >= rowX && x <= rowX + rowW;
  /** Presses while nothing can be taken: the visitor and the pressed coin hop. */
  function invite(p: number): void { visHop = 0; if (p >= 0) pHop[p] = 0; play('pop', 'A', 3, 0.3); }
  function interruptHand(): void { if (hand.mode === HAND_TAP || hand.mode === HAND_HINT) hand.mode = 0; }
  const VOICE_NAMES = ['penny', 'nickel', 'dime', 'quarter', 'one-dollar', 'five-dollars', 'ten-dollars', 'twenty-dollars'] as const;
  function pick(p: number): boolean {
    if (!available(p)) return false;
    if (!pUnlimited[p]) pCount[p]!--;
    carry.place = p; carry.kind = pKind[p]!; carry.face = pFace[p]!;
    if (isBill(carry.kind)) play('bill-rustle', 'A', 0, 0.7); else play('pop', 'B', 2, 0.5);
    playVoice(audio, VOICE_NAMES[carry.kind]!);
    carryT = 0; lastPX = input.pointer.x;
    return true;
  }
  function returnCarry(x: number, y: number): void {
    carry.active = false; carry.keyed = false;
    launch(RETURN, carry.kind, carry.face, 1, carry.place, x, y, pX[carry.place]! + pNx[carry.place]!, pY[carry.place]! + pNy[carry.place]!, RETURN_SECONDS);
  }
  /**
   * Let go of the carried piece at (x, y): on the mat it goes to its dish, the pile, the board or the open lock (a hit);
   * anywhere else it slides home and counts one miss (quietly over the row, with a soft whoosh elsewhere).
   */
  function release(x: number, y: number): void {
    carry.active = false; carry.keyed = false;
    if (onMat(x, y)) { hits++; dropToMat(carry.kind, carry.face, carry.place, x, y, carry.deliberate, false); return; }
    misses++;
    if (!onRow(x, y)) play('whoosh', 'D', 0, 0.55);
    launch(RETURN, carry.kind, carry.face, 1, carry.place, x, y, pX[carry.place]! + pNx[carry.place]!, pY[carry.place]! + pNy[carry.place]!, RETURN_SECONDS);
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
    if (taskPhase === 'symbol') {
      const i = onBlock(x, y);
      if (i >= 0 && hand.mode !== HAND_BLOCK) { hits++; blockFocus = i; chooseBlock(i, gap >= DELIBERATE_MS); return; }
      if (!onCorner(x, y) && onTag(x, y) < 0) { misses++; visHop = 0; }
      return;
    }
    // A press while the money goes into the vault plays the rest of that sequence faster.
    if (taskPhase === 'done' && introStage !== 1 && !onCorner(x, y)) { seqSpeed = HURRY; return; }
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
    // A click (press and release within 0.3 s and 24 px) picks the piece up at every tier: it follows the pointer with
    // no button held until the next press puts it down (release), as letting go of a drag there would.
    if (quick) { carry.sticky = true; return; }
    release(x, y);
  }
  // ---------------------------------------------------------------- hover (the app's cursor and the hover cues)
  const onHome = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius;
  /** Whether a press on row place p would pick its piece up now (pointerDown's gates). */
  const grabbable = (p: number): boolean => p >= 0 && coinPhase() && !busy() && available(p);
  /** Whether a press on tag i (from onTag) would pick it now (pickTag's gates). */
  const tagLive = (i: number): boolean => i >= 0 && taskPhase === 'tags' && tagsT >= TAG_RISE;
  /** Whether a press on block i (from onBlock) would send it now (pointerDown's and chooseBlock's gates). */
  const blockLive = (i: number): boolean => i >= 0 && taskPhase === 'symbol' && hand.mode !== HAND_BLOCK && blockState[i] === 0 && placedSym < 0
    && tagsT >= TAG_RISE && blockState[0] !== 3 && blockState[1] !== 3;
  /** What a press at x, y would do now, with the same gates as handleInput and pointerDown. */
  function hoverAt(x: number, y: number): CursorHover {
    if (soundButton.contains(x, y)) return null;
    if (onHome(x, y)) return 'press';
    if (phase === 'celebration') return celebrationLocked() ? null : 'press';
    if (playable() && carry.active) return 'carry';
    if (performance.now() < inputAfter) return null;
    if (playable()) {
      if (taskPhase === 'tags') return tagLive(onTag(x, y)) ? 'press' : null;
      if (taskPhase === 'symbol') return blockLive(onBlock(x, y)) ? 'press' : null;
      // Any press during a task's end hurries the rest of it, once (the goal-first introduction is never hurried).
      if (taskPhase === 'done') return introStage !== 1 && seqSpeed !== HURRY ? 'press' : null;
      // A press on a piece that has to wait, on the mat or on the purse only makes something hop: nothing to act on.
      return grabbable(placeAt(x, y)) ? 'grab' : null;
    }
    if (phase === 'choice' || phase === 'rest') return hoverMenu(x, y) >= 0 ? 'press' : null;
    return null;
  }
  /** Ease the hover cues toward the mouse: the piece a press would pick up, the tag or block it would choose, the mat under a carried piece, Home. */
  function updateHover(dt: number): void {
    const pt = input.pointer, mouse = pt.inside && pt.type === 'mouse' && !soundButton.contains(pt.x, pt.y);
    const home = mouse && onHome(pt.x, pt.y), inPlay = mouse && !home && playable();
    const live = inPlay && !carry.active && performance.now() >= inputAfter;
    const at = live && coinPhase() ? placeAt(pt.x, pt.y) : -1, p = grabbable(at) ? at : -1;
    const ti = live && taskPhase === 'tags' ? onTag(pt.x, pt.y) : -1, t = tagLive(ti) ? ti : -1;
    const bi = live && taskPhase === 'symbol' ? onBlock(pt.x, pt.y) : -1, b = blockLive(bi) ? bi : -1;
    const mat = inPlay && carry.active && !carry.keyed && onMat(pt.x, pt.y);
    for (let i = 0; i < MAX_PLACES; i++) placeHover[i] = approach(placeHover[i]!, i === p ? 1 : 0, 14, dt);
    for (let i = 0; i < 3; i++) tagHover[i] = approach(tagHover[i]!, i === t ? 1 : 0, 14, dt);
    for (let i = 0; i < 2; i++) blockHover[i] = approach(blockHover[i]!, i === b ? 1 : 0, 14, dt);
    matHover = approach(matHover, mat ? 1 : 0, 14, dt);
    homeHover = approach(homeHover, home ? 1 : 0, 14, dt);
  }
  function keyPlay(code: string): void {
    idleT = 0; interruptHand();
    const left = code === 'ArrowLeft' || code === 'ArrowUp', right = code === 'ArrowRight' || code === 'ArrowDown';
    const now = performance.now();
    if (taskPhase === 'tags' || taskPhase === 'symbol') {
      const symbol = taskPhase === 'symbol';
      if (left || right) {
        if (symbol) blockFocus = 1 - blockFocus;
        else for (let k = 1; k <= 3; k++) { const j = (tagFocus + (left ? -k : k) + 9) % 3; if (tagState[j] === 0) { tagFocus = j; break; } }
        arrowMoved = true; lastArrowAt = now; return;
      }
      if (now < keyAfter) return;
      keyAfter = now + KEY_GAP_MS;
      const deliberate = arrowMoved && now - lastArrowAt >= KEY_DELIBERATE_MS;
      if (symbol) {
        if (hand.mode === HAND_BLOCK || blockState[blockFocus] !== 0) { invite(-1); return; }
        arrowMoved = false;
        chooseBlock(blockFocus, deliberate);
        return;
      }
      if (tagState[tagFocus] !== 0) for (let j = 0; j < 3; j++) if (tagState[j] === 0) { tagFocus = j; break; }
      arrowMoved = false;
      pickTag(tagFocus, deliberate);
      return;
    }
    if (taskPhase === 'done' && introStage !== 1) { seqSpeed = HURRY; return; }
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
    // The highlight then moves to the largest piece left (lock: the largest coin the lock takes).
    if (!isLock() || !available(p)) ensureFocus();
  }

  // ---------------------------------------------------------------- stats
  const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  const unitName = (u0: number): '¢' | '$' => (u0 === DOLLARS ? '$' : '¢');
  /** An amount as the game draws it, for the stats object (only built when read). */
  const label = (form: number, value: number): string => {
    const n = amountSeq(form, value); let out = '';
    for (let i = 0; i < n; i++) { const g = seq[i]!; out += g === SPACE ? ' ' : g === BOX ? '[ ]' : GLYPHS[g]!; }
    return out;
  };
  const placeHit = (p: number): Rect => ({ x: pX[p]! - pHW[p]!, y: placeTop(p), w: pHW[p]! * 2, h: rowH });
  const tagInfo = (kind: number, d: number): { tag: string; tagGlyph: number } => ({ tag: `${COIN_VALUE[kind]}¢`, tagGlyph: Math.round(tagInk(d, tagMinInk) * 10) / 10 });
  const coinInfo = (): CoinInfo[] => {
    const out: CoinInfo[] = [];
    if (!playable()) return out;
    const face = (f: number): 'heads' | 'tails' => (f ? 'tails' : 'heads');
    for (let p = 0; p < nPlaces; p++) {
      if (pCount[p]! <= 0 || isBill(pKind[p]!)) continue;
      const k = pKind[p]!, x = pX[p]! + pNx[p]!, y = pY[p]! + pNy[p]!, t = tagSlot(k, coinD[k]!);
      const tagBox = t >= 0 ? { x: x - tagWs[t]! / 2, y: y + tagOff[t]! - tagHs[t]! / 2, w: tagWs[t]!, h: tagHs[t]! } : undefined;
      out.push({ kind: COIN_NAMES[k]!, face: face(pFace[p]!), x, y, d: coinD[k]!, where: pUnlimited[p] ? 'stack' : 'row', count: pUnlimited[p] ? -1 : pCount[p]!, hit: placeHit(p), ...tagInfo(k, coinD[k]!), tagBox });
    }
    for (const k of DISH_ORDER) for (let i = 0; i < Math.min(DISH_MAX, dishN[k]!); i++) {
      // Only the front row is tagged (renderMat); behind it, `tag` is '' and there is no tagBox.
      const d = dishCoinD(k), front = i < dishPer[k]!, t = front ? tagSlot(k, d, tagMinInk, 1) : -1;
      dishSlot(k, i, dishN[k]!);
      const tagBox = t >= 0 ? { x: pos.x - tagWs[t]! / 2, y: pos.y + tagOff[t]! - tagHs[t]! / 2, w: tagWs[t]!, h: tagHs[t]! } : undefined;
      out.push({ kind: COIN_NAMES[k]!, face: face(dishFace[k * DISH_MAX + i]!), x: pos.x, y: pos.y, d, where: 'dish', count: 1, hit: null, ...(front ? tagInfo(k, d) : { tag: '', tagGlyph: 0 }), tagBox });
    }
    for (let l = 0; l < 2; l++) for (let i = 0; i < Math.min(LOCK_MAX, lockN[l]!); i++) {
      const k = lockKind[l * LOCK_MAX + i]!;
      const d = lockCoinD(k), t = tagSlot(k, d, lockTagInk);
      lockSlot(l, i);
      const tagBox = t >= 0 ? { x: pos.x - tagWs[t]! / 2, y: pos.y + tagOff[t]! - tagHs[t]! / 2, w: tagWs[t]!, h: tagHs[t]! } : undefined;
      out.push({ kind: COIN_NAMES[k]!, face: face(lockFace[l * LOCK_MAX + i]!), x: pos.x, y: pos.y, d, where: `lock${l + 1}`, count: 1, hit: null, tag: `${COIN_VALUE[k]}¢`, tagGlyph: Math.round(tagInk(d, lockTagInk) * 10) / 10, tagBox });
    }
    for (const f of flights) if (f.active && f.mode !== LEAVE && !isBill(f.kind)) out.push({ kind: COIN_NAMES[f.kind]!, face: face(f.face), x: f.x1, y: f.y1, d: coinD[f.kind]!, where: 'flight', count: f.n, hit: null, ...tagInfo(f.kind, coinD[f.kind]!) });
    return out;
  };
  const billInfo = (): BillInfo[] => {
    const out: BillInfo[] = [];
    if (!playable()) return out;
    const info = (kind: number, x: number, y: number, w: number, h: number, where: string, count: number, hit: Rect | null): BillInfo =>
      ({ value: BILL_VALUE[kind - BILL1]!, x, y, w, h, where, count, label: `$${BILL_VALUE[kind - BILL1]} | $${BILL_VALUE[kind - BILL1]}`, hit });
    for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0 && isBill(pKind[p]!)) out.push(info(pKind[p]!, pX[p]! + pNx[p]!, pY[p]! + pNy[p]!, billW, billH, 'row', pCount[p]!, placeHit(p)));
    for (let i = 0; i < Math.min(PILE_MAX, pileCount); i++) { pileSlot(i); out.push(info(pileKind[i]!, pos.x, pos.y, billW * pileScale, billH * pileScale, 'pile', 1, null)); }
    if (boardBill) out.push({ value: 1, x: boardBillX + boardBillW / 2, y: boardBillY + boardBillH / 2, w: boardBillW, h: boardBillH, where: 'board', count: 1, label: '$1 | $1', hit: null });
    for (const f of flights) if (f.active && f.mode !== LEAVE && isBill(f.kind)) out.push(info(f.kind, f.x1, f.y1, billW, billH, 'flight', f.n, null));
    return out;
  };
  const taskInfo = (): TaskInfo => {
    const locks: TaskInfo['locks'] = [];
    if (isLock()) for (let l = isFewest() ? 1 : 0; l < 2; l++) {
      const coins: string[] = [];
      for (let i = 0; i < Math.min(LOCK_MAX, lockN[l]!); i++) coins.push(COIN_NAMES[lockKind[l * LOCK_MAX + i]!]!);
      locks.push({ amount: plan.total, cents: lockCents[l]!, coins, slots: isFewest() ? plan.slots : 0, filled: lockN[l]! });
    }
    const shown: string[] = [];
    if (taskPhase === 'tags' || taskPhase === 'symbol') for (let i = 0; i < 3; i++) if (tagState[i] === 0) shown.push(label(plan.kind === 'symbol' && placedSym < 0 ? BOXED : tagForm[i]!, tagVal[i]!));
    return {
      kind: plan.kind, step: plan.step, warmup: plan.warmup, unit: unitName(plan.unit), total: plan.total, label: label(plan.unit, plan.total),
      tags: plan.tags.slice(), tagForms: plan.tagForms.map(unitName), tagLabels: plan.tags.map((v, i) => label(plan.kind === 'symbol' ? BOXED : plan.tagForms[i]!, v)), tagsShown: shown,
      coins: { penny: plan.coins[PENNY]!, nickel: plan.coins[NICKEL]!, dime: plan.coins[DIME]!, quarter: plan.coins[QUARTER]! },
      bills: { 1: plan.bills[0]!, 5: plan.bills[1]!, 10: plan.bills[2]!, 20: plan.bills[3]! }, locks,
      traded, boardBill: boardBill === 1,
      symbols: plan.kind === 'symbol' ? [GLYPHS[blockSym[0]!]!, GLYPHS[blockSym[1]!]!] : [], symbol: plan.kind === 'symbol' ? unitName(plan.unit) : '',
      placed: placedSym >= 0 ? GLYPHS[placedSym]! : '',
    };
  };
  const countLit = (from: number, to: number): number => { let n = 0; for (let i = from; i < to; i++) n += cupLit[i]!; return n; };
  const stats: CoinVaultStats = {
    get step() { return data.step; }, get contentStep() { return plan.step; }, get tier() { return tier; }, get rounds() { return data.rounds; },
    get phase() { return phase; }, get taskPhase() { return taskPhase; }, get intro() { return intro; }, get introStage() { return introStage; },
    get taskIndex() { return taskIndex; }, get tasks() { return tasksTotal; }, get hits() { return hits; }, get misses() { return misses; }, get bounces() { return bounces; },
    get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; }, get hand() { return hand.mode; },
    get carrying() { return carry.active; }, get focus() { return focus; }, get tagFocus() { return plan.kind === 'symbol' ? blockFocus : tagFocus; }, get counted() { return roundCounted.slice(); }, get learn() { return data.learn.slice(); },
    get demos() { return data.demos; },
    get task() { return taskInfo(); },
    get coins() { return coinInfo(); },
    get bills() { return billInfo(); },
    get symbols() {
      if (plan.kind !== 'symbol' || taskPhase !== 'symbol') return [];
      return [0, 1].map(i => ({ symbol: GLYPHS[blockSym[i]!]!, state: ['ready', 'hopping', '', 'placed'][blockState[i]!]!, x: blockX[i]! - blockS / 2, y: blockY[i]! - blockS / 2, w: blockS, h: blockS }));
    },
    get cups() {
      const lock = isLock() && introStage !== 1, two = lock && !isFewest();
      return {
        total: plan.total, lit: two ? countLit(50, 100) : countLit(0, 100), first: two ? plan.total : 0, firstLit: two ? countLit(0, 50) : 0,
        sockets: two ? 2 * plan.total : lock ? plan.total : boardBill ? 50 : CUPS, unit: unitName(plan.unit), bill: boardBill,
      };
    },
    get dishes() { return DISH_ORDER.map(k => ({ kind: COIN_NAMES[k]!, count: dishN[k]!, ...rect(dishX[k]! - dishW[k]! / 2, dishY[k]! - dishH[k]! / 2, dishX[k]! + dishW[k]! / 2, dishY[k]! + dishH[k]! / 2) })); },
    get billSize() { return { w: billW, h: billH }; },
    get coinSizes() { return { penny: coinD[PENNY]!, nickel: coinD[NICKEL]!, dime: coinD[DIME]!, quarter: coinD[QUARTER]! }; },
    get cupDiameter() { return cupD; },
    get goal() {
      return { item: GOALS[goalItem]!, amount: plan.goal, label: label(plan.unit, plan.goal), shown: goalShow && (plan.step < 8 || taskPhase === 'done'),
        counted: plan.total, reached: plan.total >= plan.goal, x: goalX, y: goalY, size: goalSize };
    },
    get jar() {
      return { shown: jarT >= 0, fill: jarFill, target: Math.min(1, plan.total / Math.max(1, plan.goal)), outcome,
        x: jarX - jarW / 2, y: jarY - jarH / 2, w: jarW, h: jarH };
    },
    get carrySticky() { return carry.active && carry.sticky; },
    get bits() { return bits.alive; }, get seqSpeed() { return seqSpeed; },
    get locks() {
      if (!isLock()) return null;
      const planks: Rect[] = [];
      for (let l = isFewest() ? 1 : 0; l < 2; l++) planks.push({ x: lockX[l]!, y: lockY[l]!, w: lockW, h: lockH });
      return { planks, mat: rect(matX, matY, matX + matW, matY + matH), region: isFewest() ? rect(inX, inY, inX + inW, inY + inH) : rect(lrX, lrY, lrX + lrW, lrY + lrH), room: isFewest() ? plan.slots : lockRoom, quarter: lockCoinD(QUARTER), ink: lockTagInk };
    },
    probeLock(step, total, order) {
      plan = lockPlanFor(step, total);
      for (const f of flights) f.active = false;
      for (const r of rollers) r.active = false;
      lockN.fill(0); lockCents.fill(0); lockCur.fill(0); lockPulse.fill(9); firstLeft = 0; hand.mode = 0;
      rowsWanted = kindsInTask(); billsWanted = false; pureBills = false; pile = false;
      arrangeRow(); nPlaces = pKind.length;
      layout(W, H);
      if (step === 4) for (let k = QUARTER; k >= PENNY; k--) for (let c = 0; c < plan.first[k]!; c++) { lockKind[lockN[0]!] = k; lockFace[lockN[0]!] = 0; lockN[0]!++; lockCents[0]! += COIN_VALUE[k]!; }
      layoutLocks(0, true);
      const kinds = order === 'small' ? [PENNY, NICKEL, DIME, QUARTER] : order === 'large' ? [QUARTER, DIME, NICKEL, PENNY] : order.map(n => COIN_NAMES.indexOf(n as typeof COIN_NAMES[number]));
      let j = 0;
      for (let guard = 0; lockCents[1]! < plan.total && guard < 500; guard++) {
        let took = -1;
        for (let a = 0; a < kinds.length && took < 0; a++) {
          const k = kinds[(j + a) % kinds.length]!;
          if (k >= 0 && (k !== QUARTER || plan.quarters) && takes(k)) took = k;
          if (took >= 0 && typeof order !== 'string') j = (j + a + 1) % kinds.length;
        }
        if (took < 0) break;
        const i = lockN[1]!;
        lockCur[took]!++; lockKind[LOCK_MAX + i] = took; lockFace[LOCK_MAX + i] = 0; lockN[1] = i + 1; lockCents[1]! += COIN_VALUE[took]!;
        layoutLocks(0, false);
      }
      // Held as filled (the visitor stays, nothing rolls into the vault) so the locks can be captured.
      taskPhase = 'enter'; taskT = 0; enterSeconds = 1e9;
      return lockN[1]!;
    },
    get targets() {
      const out: TargetInfo[] = [];
      if (playable()) {
        for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) out.push({ kind: `place:${PIECE_NAMES[pKind[p]!]}`, ...placeHit(p) });
        if (coinPhase()) {
          // The mat's whole zone is the one drop target: a coin dropped anywhere on it goes to its own dish (or the open
          // lock), a bill to the pile or the board. The dishes, lock plates and pile are what it looks like, not targets.
          out.push({ kind: isLock() ? 'mat:lock' : 'mat', ...rect(zoneX0, zoneY0, zoneX1, zoneY1), drawn: rect(matX, matY, matX + matW, matY + matH) });
        }
        if (taskPhase === 'tags') for (let i = 0; i < 3; i++) if (tagState[i] === 0) out.push({ kind: `tag:${label(tagForm[i]!, tagVal[i]!)}`, x: tagX[i]!, y: tagY[i]!, w: tagW, h: tagH });
        if (taskPhase === 'symbol') for (let i = 0; i < 2; i++) if (blockState[i] === 0) out.push({ kind: `symbol:${GLYPHS[blockSym[i]!]}`, x: blockX[i]! - blockS / 2, y: blockY[i]! - blockS / 2, w: blockS, h: blockS });
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
      if (!fontReady) void ensureDisplayFont().then(() => { fontReady = true; bakeStrips(true); bakePieces(true); fitTags(); });
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
    hoverAt,
    update(dt) {
      const started = performance.now(); sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      updateHover(dt);
      // Hurried: the rest of a finished task's sequence plays HURRY times faster.
      if (playable() && taskPhase === 'done') dt *= seqSpeed;
      if (playable()) updatePlay(dt); else updateResult(dt);
      askIdle(); updateFlights(dt); bits.update(dt);
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
