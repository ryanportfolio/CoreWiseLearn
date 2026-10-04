/**
 * Ride Fare: animal friends queue for a hot-air balloon ride. The child pays each fare by dropping coins from a wooden
 * tray into the brass fare box: each coin lights as many dot cups as it is worth, and when every cup is lit the animal
 * climbs in, the balloon lifts off, drifts and lands, and the next animal steps up. Step 1 shows coin pictures to match
 * instead of cups. A coin worth more than the unlit cups hops back to the tray.
 */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, chunkyPanel, drawSprite, OUTLINE } from '../../ui/draw';
import { confettiBurst, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, onBook, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { clamp01, easeInCubic, easeInOutSine, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { defaultData, GAME_ID, sanitizeRideData, TOP_STEP, type PendingRound, type RideData } from './data';
import {
  applyLearning, applyMotor, arrangeTray, BUILT_STEP, COIN_MM, COIN_NAMES, COIN_VALUE, DIME_MM, introRider, MIN_DIME_PX, NICKEL,
  PENNY, planRider, recordRider, riderStep, ROUND_STARS, TIERS, type RiderPlan,
} from './rules';
import { playVoice, preloadVoice } from './voice';

export { GAME_ID };
const ART = 'ride-fare/';
const BG = `${ART}launch-field`, BASKET = `${ART}basket`, ENVELOPE = `${ART}envelope`, FAREBOX = `${ART}fare-box`, TRAY = `${ART}tray`, HAND = `${ART}helper-hand`;
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
const ANIMALS = ['hedgehog', 'bunny', 'fox', 'raccoon', 'bear', 'mouse'] as const;
const ANIMAL_NAMES = ANIMALS.map(a => [`${ART}${a}-wait`, `${ART}${a}-wave`] as const);
const COIN_FACES = COIN_NAMES.map(c => [`${ART}coin-${c}-heads`, `${ART}coin-${c}-tails`] as const);
const NUMBER_CLIPS = Array.from({ length: 21 }, (_, n) => `number-${n}` as const);

// Measured once from the sprites' pixels (round 2), as fractions of each image.
/** basket.webp: top of the rim, its bottom edge, the front rim line animals inside are clipped at, the door's left edge. */
const RIM_TOP = 0.379, RIM_BOTTOM = 0.476, RIM_CLIP = 0.425;
/** Where on the basket's ropes the envelope's mouth sits (the envelope hides the burner and the upper ropes). */
const ENVELOPE_AT = 0.27;
/** envelope.webp: the mouth row; the ropes below it are not drawn (the basket brings its own). */
const MOUTH = 0.8;
/** fare-box.webp: the dark window where code draws the cups (x0, x1, y0, y1) and the coin slot's centre line and top. */
const WIN_X0 = 0.265, WIN_X1 = 0.912, WIN_Y0 = 0.271, WIN_Y1 = 0.859, SLOT_X = 0.146, SLOT_TOP = 0.37;
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
const MAX_PLACES = 8, MAX_CUPS = 10, POOL = 16, PARTICLES = 160;

const CELEBRATION_SECONDS = 4.6, STAR_START = 0.5;
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350, KEY_GAP_MS = 150, IDLE_SECONDS = 6, IDLE_SOON = 4, IDLE_REPEAT = 7;
/**
 * A coin counts as a deliberate choice when the press that picked it came at least this long after the previous press
 * in play; a stream of quick presses (mashing) plays fully but records no learning evidence.
 */
const DELIBERATE_MS = 700;
/** Cups light this far apart as a coin pours: a nickel's five within 0.3 s. */
const POUR_GAP = 0.07;
/** A coin's trip into the slot: fly to the slot, show its dots, slip in edge-on. */
const SEND_FLY = 0.3, SEND_DOTS = 0.25, SEND_SLIP = 0.15, SEND_SECONDS = SEND_FLY + SEND_DOTS + SEND_SLIP;
/** A coin that is too much: fly to the slot, show its dots, hop home. */
const REJECT_HOLD = 0.35, REJECT_HOP = 0.5, REJECT_SECONDS = SEND_FLY + REJECT_HOLD + REJECT_HOP;
const RETURN_SECONDS = 0.4, ARRIVE_SECONDS = 0.55, LEAVE_SECONDS = 0.35;
/** The fare-paid sequence: cups pulse, the animal hops in, the balloon lifts, drifts small across the sky and lands. */
const SEQ_PULSE = 0.5, SEQ_HOP = 0.6, SEQ_LIFT = 1.0, SEQ_DRIFT = 1.5, SEQ_LAND = 1.0;
const SEQ_HOP_AT = SEQ_PULSE, SEQ_LIFT_AT = SEQ_HOP_AT + SEQ_HOP, SEQ_DRIFT_AT = SEQ_LIFT_AT + SEQ_LIFT, SEQ_LAND_AT = SEQ_DRIFT_AT + SEQ_DRIFT;
const SEQ_SECONDS = SEQ_LAND_AT + SEQ_LAND;
/** The introduction's goal (every cup lit, the hedgehog rides) plays the same sequence this much faster: about 3 s. */
const GOAL_SPEED = 1.5;
const FANFARE: SfxOptions = { variant: 'D' };
const CUP_EMPTY = '#3c4150', CUP_RIM = '#e2b453', PLATE_FILL = '#fff4dc', PLATE_LINE = '#8a6232', HIGHLIGHT = '#fff6a3';
const DASH = [6, 6], NO_DASH: number[] = [];

type Phase = 'play' | 'celebration' | 'choice' | 'sticker' | 'rest';
type RiderPhase = 'enter' | 'pay' | 'paid';
const ARRIVE = 0, LEAVE = 1, SEND = 2, REJECT = 3, RETURN = 4;
const HAND_DEMO = 1, HAND_TAP = 2, HAND_HINT = 3;

interface Flight {
  active: boolean; mode: number; kind: number; n: number; place: number;
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; giggles: number;
}
interface CoinInfo { kind: string; face: 'heads' | 'tails'; x: number; y: number; d: number; place: number; count: number; hit: { x: number; y: number; w: number; h: number } | null }
interface TargetInfo { kind: string; x: number; y: number; w: number; h: number; drawn?: { x: number; y: number; w: number; h: number } }
export interface RideFareStats {
  readonly step: number; readonly contentStep: number; readonly tier: Tier; readonly rounds: number; readonly phase: Phase; readonly riderPhase: RiderPhase;
  readonly intro: boolean; readonly introStage: number; readonly rider: number; readonly riders: number; readonly hits: number; readonly misses: number;
  readonly bounces: number; readonly stars: number; readonly stickerId: string; readonly choiceIds: readonly string[]; readonly hand: number;
  readonly carrying: boolean; readonly focus: number; readonly counted: readonly number[]; readonly learn: readonly number[];
  readonly cups: { total: number; lit: number };
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
  const paths = [`${BG}.webp`, `${BASKET}.webp`, `${ENVELOPE}.webp`, `${FAREBOX}.webp`, `${TRAY}.webp`, `${HAND}.webp`, `${BUTTON_PLAY}.png`, `${BUTTON_HOME}.png`, BOOK_ICON_PATH];
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
/** One dot cup, `r` in radius: an empty dark socket with a brass rim, or lit warm yellow. */
function bakeCup(r: number, ratio: number, lit: boolean): HTMLCanvasElement {
  const size = r * 2 + 6, { c, g } = cpuCanvas(size * ratio, size * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const cx = size / 2;
  g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2);
  if (lit) {
    const grad = g.createRadialGradient(cx - r * 0.25, cx - r * 0.3, r * 0.1, cx, cx, r);
    grad.addColorStop(0, '#fffbe0'); grad.addColorStop(0.55, '#ffd84f'); grad.addColorStop(1, '#f0a81e');
    g.fillStyle = grad;
  } else {
    const grad = g.createRadialGradient(cx, cx + r * 0.35, r * 0.1, cx, cx, r);
    grad.addColorStop(0, '#8a8f9c'); grad.addColorStop(0.7, '#5d6271'); grad.addColorStop(1, CUP_EMPTY);
    g.fillStyle = grad;
  }
  g.fill();
  g.lineWidth = Math.max(2.5, r * 0.2); g.strokeStyle = lit ? '#e09a1c' : CUP_RIM; g.stroke();
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
  let nPlaces = 0;
  const cupPulse = new Float32Array(MAX_CUPS).fill(9);
  const have = new Int32Array(3);
  const plateKind = new Int8Array(3), plateState = new Uint8Array(3), platePulse = new Float32Array(3).fill(9);
  const carry = { active: false, sticky: false, place: 0, kind: 0, downAt: 0, downX: 0, downY: 0, deliberate: false };
  const hand = { mode: 0, t: 0, place: 0, kind: 0, released: false };
  let data: RideData = defaultData();
  let W = 1366, H = 768, u = 1, fitS = 1;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0, bgScale = 1;
  let trayCanvas: HTMLCanvasElement | undefined, cupCanvas: HTMLCanvasElement | undefined, litCanvas: HTMLCanvasElement | undefined;
  let glowCanvas: HTMLCanvasElement | undefined, dotCanvas: HTMLCanvasElement | undefined;
  let artRatio = 0, glowSize = 0, dotSize = 0, bakedCupR = 0, bakedTray = '';
  let phase: Phase = 'play', tier: Tier = 0, intro = false, introStage = 0, animalOffset = 0;
  let riderPhase: RiderPhase = 'enter', riderT = 0, seqT = 0, seqSpeed = 1, riderIndex = 0, ridersTotal = 3;
  let plan: RiderPlan = introRider(), fare = 0, lit = 0, reserved = 0, pourLeft = 0, pourTimer = 0, plateN = 0, lastFare = 0;
  let riderAnimal = 0, riderAssisted = false, riderKeyed = false, riderDeliberate = true, riderBounced = false, nickelFirst = false, riderDrops = 0;
  let bouncesHere = 0, lastPressAt = -9999, boxPulse = 9, boxHop = 9, gateHop = 9, queueHop = 9;
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
  let gateX = 0, feetY = 0, cupR = 0;
  /** The balloon's vertical offset (lift and landing) and the drifting small balloon's position. */
  let liftY = 0, driftX = 0, driftY = 0, driftOn = false;
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
  const usesPlate = (): boolean => plan.step <= 1 && plateN > 0;
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
    const glow = Math.round(coinD[NICKEL]! * 1.7);
    if (!glowCanvas || reratio || glow !== glowSize) { glowSize = glow; glowCanvas = bakeGlow(glowSize, artRatio, false); }
    const dot = Math.max(10, Math.round(coinD[PENNY]! * 0.26));
    if (!dotCanvas || reratio || dot !== dotSize) { dotSize = dot; dotCanvas = bakeGlow(dotSize, artRatio, true); }
    if (!cupCanvas || reratio || cupR !== bakedCupR) { bakedCupR = cupR; cupCanvas = bakeCup(cupR, artRatio, false); litCanvas = bakeCup(cupR, artRatio, true); }
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
    boxW = Math.round(boxUnits * s); boxH = Math.round(boxW * 454 / 720);
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
    const win = boxW * (WIN_X1 - WIN_X0) / 5, winH = boxH * (WIN_Y1 - WIN_Y0) / 2;
    cupR = Math.max(7, Math.round(Math.min(win, winH) * 0.42));
  }
  /** Everything on screen: the whole fare box and its press zone, clear of the tray and the Home button, and the gate animal. */
  function fits(): boolean {
    if (boxX + boxW > W - 6 || boxY < 4 || boxY + boxH > trayY - 4 || zoneY1 - zoneY0 < 128) return false;
    const nx = Math.min(boxX + boxW, Math.max(boxX, homeX)), ny = Math.min(boxY + boxH, Math.max(boxY, cornerY));
    if (Math.hypot(homeX - nx, cornerY - ny) < cornerRadius + 4) return false;
    return gateX + animalH * 0.36 <= W - 4;
  }
  function releaseArt(): void {
    for (const name of OWN_ART) sprites.clearScaled(name);
    for (const name of soundNames) sprites.clearScaled(name);
    warmDone.clear();
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    const image = sprites.get(BG); if (!image) return;
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
  function startRider(i: number): void {
    riderIndex = i;
    plan = intro && introStage === 2 && i === 0 ? introRider() : planRider(riderStep(data.step, i), random, lastFare);
    fare = plan.fare; lit = 0; reserved = 0; pourLeft = 0; pourTimer = 0;
    plateN = plan.plate.length;
    for (let k = 0; k < 3; k++) { plateKind[k] = plan.plate[k] ?? 0; plateState[k] = 0; platePulse[k] = 9; }
    lastFare = plan.step <= 1 ? plateN : fare;
    cupPulse.fill(9);
    riderAnimal = intro ? (1 + i) % ANIMALS.length : (animalOffset + i) % ANIMALS.length;
    riderAssisted = intro && i === 0; riderKeyed = false; riderDeliberate = true; riderBounced = false; nickelFirst = false; riderDrops = 0;
    bouncesHere = 0; idleT = 0; liftY = 0;
    riderPhase = 'enter'; riderT = 0;
    // Coins left from the last rider slide away; the new ones slide in from the right and spin as they settle.
    for (let p = 0; p < nPlaces; p++) if (pCount[p]! > 0) launch(LEAVE, pKind[p]!, Math.min(5, pCount[p]!), p, pX[p]!, pY[p]!, pX[p]! - W, pY[p]!, LEAVE_SECONDS);
    nPlaces = arrangeTray(plan.tray, maxPlaces, pKind, pCount, pUnlimited);
    placeCoins();
    for (let p = 0; p < nPlaces; p++) {
      const n = pCount[p]!; pCount[p] = 0; pHop[p] = 9;
      const f = launch(ARRIVE, pKind[p]!, n, p, W + coinD[1]! + p * 30 * u, pY[p]!, pX[p]!, pY[p]!, ARRIVE_SECONDS + p * 0.07);
      if (f) f.t = -0.12 * p;
    }
    focus = 0;
    play('pop-big', 'D', 2, 0.5);
    if (plan.step > 1) playVoice(audio, NUMBER_CLIPS[Math.min(20, fare)]!);
  }
  /** Coins this place can still give. */
  const available = (p: number): number => (pCount[p]! > 0 ? pCount[p]! : 0);
  /** Whether a coin of this kind would be taken now (fits the unlit cups or matches an unlit picture). */
  function fitsNow(kind: number): boolean {
    if (usesPlate()) { for (let k = 0; k < plateN; k++) if (plateState[k] === 0 && plateKind[k] === kind) return true; return false; }
    return COIN_VALUE[kind]! <= fare - reserved;
  }
  function ensureFocus(): void {
    if (focus < nPlaces && available(focus) && fitsNow(pKind[focus]!)) return;
    for (let p = 0; p < nPlaces; p++) if (available(p) && fitsNow(pKind[p]!)) { focus = p; return; }
    if (focus < nPlaces && available(focus)) return;
    for (let p = 0; p < nPlaces; p++) if (available(p)) { focus = p; return; }
  }
  function moveFocus(step: number): void {
    for (let k = 1; k <= nPlaces; k++) { const p = (focus + step * k + nPlaces * 4) % nPlaces; if (available(p)) { focus = p; return; } }
  }
  /**
   * Whatever order the coins come in, the fare stays payable: unlimited stacks stay full, and when the pennies and
   * nickels left (on the tray, in the hand, or on their way back) cannot make the unlit cups exactly, pennies are added.
   */
  function refill(): void {
    for (let p = 0; p < nPlaces; p++) if (pUnlimited[p] && pCount[p]! < 5) pCount[p] = 5;
    if (usesPlate() || riderPhase !== 'pay') return;
    const need = fare - reserved; if (need <= 0) return;
    // Coin counts by kind, in a preallocated table (this runs every frame).
    have[PENNY] = 0; have[NICKEL] = 0; have[2] = 0;
    for (let p = 0; p < nPlaces; p++) have[pKind[p]!]! += pCount[p]!;
    for (const f of flights) if (f.active && (f.mode === RETURN || f.mode === REJECT || f.mode === ARRIVE)) have[f.kind]! += f.n;
    if (carry.active) have[carry.kind]!++;
    if (hand.mode === HAND_DEMO && hand.kind >= 10 && !hand.released) have[hand.kind % 10]!++;
    const short = need - 5 * Math.min(have[NICKEL]!, Math.floor(need / 5)) - have[PENNY]!;
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
  const busy = (): boolean => {
    if (pourLeft > 0 || hand.mode === HAND_DEMO) return true;
    for (const f of flights) if (f.active && (f.mode === SEND || f.mode === REJECT)) return true;
    return false;
  };
  /**
   * Drop a coin into the fare box. `deliberate`: a pointer choice long enough after the previous drop to count as
   * learning evidence. `keyed`: sent with a key (plays fully, never evidence).
   */
  function dropCoin(kind: number, place: number, fromX: number, fromY: number, deliberate: boolean, keyed: boolean): void {
    let take = false;
    if (usesPlate()) {
      for (let k = 0; k < plateN; k++) if (plateState[k] === 0 && plateKind[k] === kind) { plateState[k] = 1; take = true; break; }
    } else if (COIN_VALUE[kind]! <= fare - reserved) { reserved += COIN_VALUE[kind]!; take = true; }
    if (keyed) riderKeyed = true;
    if (!deliberate && !keyed) riderDeliberate = false;
    if (riderDrops === 0 && kind === NICKEL && deliberate) nickelFirst = true;
    riderDrops++;
    if (!take) { riderBounced = true; bouncesHere++; bounces++; }
    launch(take ? SEND : REJECT, kind, 1, place, fromX, fromY, slotX(), slotY(), take ? SEND_SECONDS : REJECT_SECONDS);
    idleT = 0;
  }
  function arrive(mode: number, kind: number, n: number, place: number): void {
    if (mode === ARRIVE || mode === RETURN || mode === REJECT) {
      if (place < nPlaces && pKind[place] === kind) { pCount[place]! += n; pHop[place] = mode === ARRIVE ? 0 : pHop[place]!; }
      if (mode === ARRIVE) play('tick', 'B', 2 + place, 0.35);
      return;
    }
    if (mode !== SEND) return;
    play('pop', 'D', 3, 0.7);
    boxPulse = 0;
    if (usesPlate()) {
      for (let k = 0; k < plateN; k++) if (plateState[k] === 1 && plateKind[k] === kind) { plateState[k] = 2; platePulse[k] = 0; play('tick', 'C', k * 2, 0.8); break; }
    } else { pourLeft += COIN_VALUE[kind]!; if (pourTimer < 0) pourTimer = 0; }
  }
  function checkPaid(): void {
    if (riderPhase !== 'pay' || pourLeft > 0) return;
    for (const f of flights) if (f.active && f.mode === SEND) return;
    if (usesPlate()) { for (let k = 0; k < plateN; k++) if (plateState[k] !== 2) return; }
    else if (lit < fare) return;
    farePaid();
  }
  function farePaid(): void {
    riderPhase = 'paid'; seqT = 0; seqSpeed = 1;
    if (carry.active) { carry.active = false; launch(RETURN, carry.kind, 1, carry.place, input.pointer.x, input.pointer.y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS); }
    if (hand.mode === HAND_HINT || hand.mode === HAND_TAP) hand.mode = 0;
    // Learning evidence: only riders at the current step, paid with deliberate pointer choices, without a hint or keys.
    const counted = !intro && !riderAssisted && !riderKeyed && riderDeliberate && riderDrops > 0 && plan.step === Math.min(BUILT_STEP, data.step);
    if (counted) {
      const exact = plan.step === 3 ? nickelFirst && !riderBounced : !riderBounced;
      recordRider(data, exact); roundCounted.push(exact ? 1 : 0);
    }
    play('pop-big', 'C', 4, 0.8);
  }
  /** The introduction's goal: every cup lit and the hedgehog riding, before any coin is shown. */
  function startGoal(): void {
    introStage = 1;
    plan = { step: 3, fare: 5, plate: [], tray: [] }; fare = 5; lit = 5; reserved = 5; plateN = 0; pourLeft = 0;
    riderAnimal = 0;
    riderPhase = 'paid'; seqT = 0; seqSpeed = GOAL_SPEED; riderT = 0;
  }
  function sequenceDone(): void {
    if (introStage === 1) { introStage = 2; startRider(0); return; }
    if (riderIndex + 1 < ridersTotal) startRider(riderIndex + 1);
    else finishRound();
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
    carry.active = false; hand.mode = 0; introStage = 0; driftOn = false; liftY = 0;
    particles.clear(); for (const f of flights) f.active = false;
    nPlaces = 0;
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
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; carry.active = false; hand.mode = 0; cornerFocus = -1;
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
  function updateHand(dt: number): void {
    if (!hand.mode) return;
    hand.t += dt;
    if (hand.mode === HAND_DEMO || hand.mode === HAND_HINT) {
      if (hand.mode === HAND_DEMO && !hand.released && hand.t >= 0.9 && pCount[hand.place]! > 0 && hand.kind < 9) {
        // The hand takes the real coin off the tray.
        pCount[hand.place]!--; hand.kind += 10;
      }
      if (!hand.released && hand.t >= 1.9) {
        hand.released = true;
        if (hand.mode === HAND_DEMO) { const kind = hand.kind % 10; handTip(); dropCoin(kind, hand.place, pos.x, pos.y, false, false); hand.kind = kind; }
        else play('pop', 'A', 5, 0.35);
      }
      if (hand.t >= 2.4) {
        if (hand.mode === HAND_DEMO) { hand.mode = HAND_TAP; hand.t = 0; hand.place = pennyPlace(); }
        else hand.mode = 0;
        idleT = 0;
      }
    }
  }
  const pennyPlace = (): number => { for (let p = 0; p < nPlaces; p++) if (pKind[p] === PENNY && available(p)) return p; return 0; };
  function startHint(): void {
    let best = -1;
    for (let p = 0; p < nPlaces; p++) if (available(p) && fitsNow(pKind[p]!) && (best < 0 || COIN_VALUE[pKind[p]!]! > COIN_VALUE[pKind[best]!]!)) best = p;
    if (best < 0) return;
    hand.mode = HAND_HINT; hand.t = 0; hand.place = best; hand.kind = pKind[best]!; hand.released = false;
    riderAssisted = true;
  }
  function updateRider(dt: number): void {
    riderT += dt;
    if (riderPhase === 'enter') {
      if (riderT >= ARRIVE_SECONDS + 0.12 * nPlaces + 0.1) {
        riderPhase = 'pay'; idleT = 0; ensureFocus();
        if (intro && introStage === 2 && riderIndex === 0) {
          let p = 0; for (let k = 0; k < nPlaces; k++) if (pKind[k] === NICKEL) p = k;
          hand.mode = HAND_DEMO; hand.t = 0; hand.place = p; hand.kind = NICKEL; hand.released = false;
        }
      }
      return;
    }
    if (riderPhase === 'pay') {
      // Cups light one after another as a coin pours.
      if (pourLeft > 0) {
        pourTimer -= dt;
        while (pourLeft > 0 && pourTimer <= 0) {
          lit = Math.min(fare, lit + 1); cupPulse[lit - 1] = 0; pourLeft--; pourTimer += POUR_GAP;
          play('tick', 'C', lit - 1, 0.75);
        }
      }
      refill();
      checkPaid();
      const wait = bouncesHere >= 2 ? IDLE_SOON : IDLE_SECONDS;
      if (riderPhase === 'pay' && !hand.mode && !carry.active && !busy() && idleT >= wait) { startHint(); idleT = wait - IDLE_REPEAT; }
      return;
    }
    // Fare paid: the sequence runs on its own clock.
    seqT += dt * seqSpeed;
    const prev = seqT - dt * seqSpeed;
    if (prev < SEQ_HOP_AT && seqT >= SEQ_HOP_AT) play('go', 'C', 0, 0.7);
    if (prev < SEQ_LIFT_AT && seqT >= SEQ_LIFT_AT) play('whoosh', 'B', 0, 0.6);
    if (prev < SEQ_LAND_AT + SEQ_LAND * 0.9 && seqT >= SEQ_LAND_AT + SEQ_LAND * 0.9) play('pop-big', 'D', 1, 0.5);
    const top = basketTop() - (EH * MOUTH - BH * ENVELOPE_AT);
    if (seqT < SEQ_LIFT_AT) liftY = 0;
    else if (seqT < SEQ_DRIFT_AT) liftY = -easeInCubic((seqT - SEQ_LIFT_AT) / SEQ_LIFT) * (basketBottom - top + 40);
    else if (seqT < SEQ_LAND_AT) liftY = -(basketBottom - top + 40) - 9999;
    else liftY = -(1 - easeOutCubic((seqT - SEQ_LAND_AT) / SEQ_LAND)) * (basketBottom - top + 40);
    driftOn = seqT >= SEQ_DRIFT_AT && seqT < SEQ_LAND_AT;
    if (driftOn) {
      const k = (seqT - SEQ_DRIFT_AT) / SEQ_DRIFT;
      driftX = lerp(basketL + BW * 0.5, W * 0.78, Math.sin(k * Math.PI)) ; driftY = H * 0.24 - Math.sin(k * Math.PI) * H * 0.06 + Math.sin(k * 9) * 4 * u;
    }
    if (seqT >= SEQ_SECONDS) { liftY = 0; driftOn = false; sequenceDone(); }
  }
  function updatePlay(dt: number): void {
    time += dt; idleT += dt;
    boxPulse += dt; boxHop += dt; gateHop += dt; queueHop += dt;
    for (let p = 0; p < MAX_PLACES; p++) pHop[p]! += dt;
    for (let k = 0; k < MAX_CUPS; k++) cupPulse[k]! += dt;
    for (let k = 0; k < 3; k++) platePulse[k]! += dt;
    updateRider(dt);
    updateHand(dt);
    if (riderPhase === 'pay' && !carry.active) ensureFocus();
  }
  function updateFlights(dt: number): void {
    for (const f of flights) {
      if (!f.active) continue;
      f.t += dt;
      // Too much: a soft giggle, three quiet notes 90 ms apart, and the animal at the gate smiles.
      while (f.mode === REJECT && f.giggles < 3 && f.t >= SEND_FLY + f.giggles * 0.09) {
        if (f.giggles === 0) gateHop = 0;
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
    if (boxPulse < 0.25) s = 1 + Math.sin(boxPulse / 0.25 * Math.PI) * 0.04;
    if (riderPhase === 'paid' && seqT < SEQ_PULSE) s = 1 + Math.sin(seqT / SEQ_PULSE * Math.PI) * 0.05;
    const hop = boxHop < 0.3 ? Math.sin(boxHop / 0.3 * Math.PI) * 8 * u : 0;
    drawSprite(ctx, sprites, FAREBOX, boxCX(), y + boxH / 2 - hop, boxW, 0, s, s);
    note(FAREBOX, boxW * s, 720);
    const wx0 = boxX + boxW * WIN_X0, wx1 = boxX + boxW * WIN_X1, wy0 = y - hop + boxH * WIN_Y0, wy1 = y - hop + boxH * WIN_Y1;
    // The rider has flown: the balloon comes back with an empty window, and the next fare appears once it has landed.
    if (riderPhase === 'paid' && seqT >= SEQ_DRIFT_AT) return;
    if (usesPlate()) { renderPlate(ctx, wx0, wy0, wx1, wy1); return; }
    if (!cupCanvas || !litCanvas || fare <= 0) return;
    // Ten cups in two rows of five; only the fare's cups are in play. A fare of five or fewer uses one middle row.
    const two = fare > 5, pitchX = (wx1 - wx0) / 5, pitchY = (wy1 - wy0) / 2, cw = cupCanvas.width / artRatio;
    const paidGlow = riderPhase === 'paid' && seqT < SEQ_PULSE ? Math.sin(seqT / SEQ_PULSE * Math.PI) : 0;
    for (let i = 0; i < fare; i++) {
      const row = i < 5 ? 0 : 1, col = i % 5;
      const cx = wx0 + (col + 0.5) * pitchX, cy = two ? wy0 + (row + 0.5) * pitchY : (wy0 + wy1) / 2;
      const on = i < lit, p = cupPulse[i]!;
      let sc = 1;
      if (p < 0.25) sc = 1 + Math.sin(p / 0.25 * Math.PI) * 0.3;
      sc += paidGlow * 0.12;
      if (on && glowCanvas && (p < 0.4 || paidGlow > 0)) {
        const g = cupR * 3.2 * (1 + paidGlow * 0.3); ctx.globalAlpha = Math.max(paidGlow, 1 - p / 0.4);
        ctx.drawImage(glowCanvas, cx - g / 2, cy - g / 2, g, g); ctx.globalAlpha = 1;
      }
      const w = cw * sc;
      ctx.drawImage(on ? litCanvas : cupCanvas, cx - w / 2, cy - w / 2, w, w);
    }
  }
  /** Step 1: a cream plate in the window with the coins to pay as pictures; each lights when its coin goes in. */
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
    }
  }
  function renderTray(ctx: CanvasRenderingContext2D): void {
    if (trayCanvas) ctx.drawImage(trayCanvas, trayX, trayY, trayW, trayH);
    for (let p = 0; p < nPlaces; p++) {
      // A soft round well under each place.
      ctx.beginPath(); ctx.ellipse(pX[p]!, pY[p]! + coinD[pKind[p]!]! * 0.06, coinD[pKind[p]!]! * 0.56, coinD[pKind[p]!]! * 0.52, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70, 30, 10, 0.22)'; ctx.fill();
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
    }
  }
  /** A ring of glowing dots on a coin, one per cent of its value, as it reaches the slot. */
  function coinDots(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, a: number): void {
    if (!dotCanvas || a <= 0) return;
    const n = COIN_VALUE[kind]!, r = coinD[kind]! * (n === 1 ? 0 : 0.3), ds = dotSize * (n === 1 ? 1.6 : 1);
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
  function handTip(): void {
    const tx = pX[hand.place] ?? W / 2, ty = pY[hand.place] ?? H;
    if (hand.mode === HAND_TAP) { pos.x = tx + coinD[PENNY]! * 0.1; pos.y = ty + coinD[PENNY]! * 0.1 - Math.abs(Math.sin(hand.t * 3.2)) * 22 * u; return; }
    const t = hand.t, sx = slotX(), sy = slotY() - coinD[hand.kind % 10]! * 0.35;
    if (t < 0.6) { const e = easeOutCubic(t / 0.6); pos.x = lerp(tx + 60 * u, tx, e); pos.y = lerp(H + 40, ty, e); }
    else if (t < 0.9) { pos.x = tx; pos.y = ty; }
    else if (t < 1.9) { const e = easeInOutSine((t - 0.9) / 1.0); pos.x = lerp(tx, sx, e); pos.y = lerp(ty, sy, e) - Math.sin(e * Math.PI) * 90 * u; }
    else { pos.x = sx; pos.y = sy; }
  }
  function renderHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.mode) return;
    handTip();
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(150 * u), hw = hs * img.naturalWidth / img.naturalHeight, t = hand.t, kind = hand.kind % 10;
    let alpha = hand.mode === HAND_HINT ? 0.85 : 1;
    if (hand.mode !== HAND_TAP && t > 1.9) alpha *= 1 - clamp01((t - 1.9) / 0.5);
    if (hand.mode !== HAND_TAP && t < 0.6) alpha *= clamp01(t / 0.3);
    const carrying = hand.mode !== HAND_TAP && t >= 0.9 && t < 1.9;
    if (carrying || (hand.mode === HAND_HINT && t >= 1.9)) {
      const ghost = hand.mode === HAND_HINT, a = ghost ? alpha : 1;
      if (ghost && glowCanvas) { const g = glowSize; ctx.globalAlpha = a * (0.85 + Math.sin(time * 7) * 0.15); ctx.drawImage(glowCanvas, pos.x - g / 2, pos.y - g / 2, g, g); }
      ctx.globalAlpha = ghost ? a * 0.6 : 1; coin(ctx, kind, 0, pos.x, pos.y, 1, 0, 1); ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = alpha;
    const press = (t >= 0.6 && t < 0.9 && hand.mode !== HAND_TAP) || (hand.mode === HAND_TAP && Math.abs(Math.sin(hand.t * 3.2)) < 0.15) ? 0.9 : 1;
    // The art's fingertip is at its top left corner: put it on the target.
    drawSprite(ctx, sprites, HAND, pos.x + hw * 0.42, pos.y + hs * 0.44, hs, 0, press, press);
    note(HAND, hs, img.naturalHeight);
    ctx.globalAlpha = 1;
  }
  function renderAnimals(ctx: CanvasRenderingContext2D): void {
    // The queue: the round's riders after the one at the gate (the next one walks up during the drift).
    const walk = riderPhase === 'paid' && seqT >= SEQ_DRIFT_AT ? easeInOutSine(clamp01((seqT - SEQ_DRIFT_AT) / SEQ_DRIFT)) : 0;
    const first = introStage === 1 ? 0 : riderIndex + 1;
    const hopQ = queueHop < 0.4 ? Math.sin(queueHop / 0.4 * Math.PI) * 18 * u : 0;
    for (let i = Math.min(ridersTotal - 1, first + 3); i >= first; i--) {
      const k = i - first;
      const a = intro ? (1 + i) % ANIMALS.length : (animalOffset + i) % ANIMALS.length;
      let sc = queueSpot(k); const x0 = pos.x, y0 = pos.y;
      if (walk > 0) { const s1 = queueSpot(k - 1); pos.x = lerp(x0, pos.x, walk); pos.y = lerp(y0, pos.y, walk); sc = lerp(sc, s1, walk); }
      else { pos.x = x0; pos.y = y0; }
      // The queue thins where it would crowd the gate.
      if (k >= 0 && walk === 0 && pos.x - animalH * 0.3 * sc < gateX + animalH * 0.34) continue;
      animal(ctx, a, 0, pos.x, pos.y - hopQ * (k % 2 ? 0.7 : 1), animalH, sc);
    }
    // The rider at the gate, hopping into the basket once the fare is paid.
    if (riderPhase === 'paid' && seqT >= SEQ_HOP_AT) return;
    const hopG = gateHop < 0.42 ? Math.sin(gateHop / 0.42 * Math.PI) * 20 * u : 0;
    const breathe = Math.sin(time * 2.1) * 0.012;
    const pose = riderPhase === 'paid' || gateHop < 0.6 ? 1 : 0;
    animal(ctx, riderAnimal, pose, gateX, feetY - hopG, animalH, 1, 0, 1 - breathe);
  }
  /** The play balloon: basket, envelope, fare box, and the rider climbing in. */
  function renderBalloon(ctx: CanvasRenderingContext2D): void {
    const cx = basketL + BW / 2, top = basketTop() + liftY;
    if (top + BH > -20) balloon(ctx, cx, top, 1, 0, 0, false);
    // The rider climbs in, then rides away in the small balloon; the balloon lands back empty.
    if (riderPhase === 'paid' && seqT >= SEQ_HOP_AT && seqT < SEQ_DRIFT_AT) {
      const k = clamp01((seqT - SEQ_HOP_AT) / SEQ_HOP), e = easeInOutSine(k);
      const clipY = top + BH * RIM_CLIP, inX = cx + BW * 0.3, inFeet = clipY + animalH * 0.5;
      const x = lerp(gateX, inX, e), feet = lerp(feetY, inFeet, e) - Math.sin(k * Math.PI) * animalH * 0.75;
      if (k < 0.5) animal(ctx, riderAnimal, 1, x, feet, animalH, 1);
      else {
        ctx.save(); ctx.beginPath(); ctx.rect(0, -H, W, clipY + H); ctx.clip();
        animal(ctx, riderAnimal, 1, x, feet + (k >= 1 ? Math.sin(time * 5) * 3 * u : 0), animalH, 1);
        ctx.restore();
      }
    }
    renderBox(ctx);
  }
  function renderPlay(ctx: CanvasRenderingContext2D): void {
    if (driftOn) balloon(ctx, driftX, driftY, DRIFT_K, riderAnimal, 1, true);
    renderAnimals(ctx);
    renderBalloon(ctx);
    renderTray(ctx);
    renderFlights(ctx);
    if (carry.active) coin(ctx, carry.kind, 0, input.pointer.x, input.pointer.y, 1.12, 0, 1);
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
  function release(x: number, y: number): void {
    carry.active = false;
    if (onBox(x, y)) { hits++; dropCoin(carry.kind, carry.place, x, y, carry.deliberate, false); return; }
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
      carry.active = true; carry.sticky = false; carry.downAt = now; carry.downX = x; carry.downY = y; carry.deliberate = gap >= DELIBERATE_MS; focus = p;
      return;
    }
    if (onBox(x, y)) { boxHop = 0; if (focus < nPlaces) pHop[focus] = 0; play('pop', 'A', 4, 0.3); return; }
    if (!onCorner(x, y)) { misses++; gateHop = 0; }
  }
  function pointerUp(x: number, y: number): void {
    if (!carry.active || carry.sticky) return;
    const now = performance.now(), quick = now - carry.downAt < 300 && Math.hypot(x - carry.downX, y - carry.downY) < 24;
    if (quick) {
      if (TIERS[tier].oneTap) {
        // Tier 0: one press sends the coin into the slot. Not a motor attempt; still a deliberate coin choice.
        carry.active = false;
        dropCoin(carry.kind, carry.place, pX[carry.place]!, pY[carry.place]!, carry.deliberate, false);
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
    if (left || right) { if (!carry.active) moveFocus(left ? -1 : 1); return; }
    const now = performance.now();
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    if (carry.active) { carry.active = false; launch(RETURN, carry.kind, 1, carry.place, input.pointer.x, input.pointer.y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS); }
    ensureFocus();
    if (busy() || !available(focus)) { invite(focus); return; }
    if (!pick(focus)) return;
    dropCoin(carry.kind, carry.place, pX[carry.place]!, pY[carry.place]!, false, true);
  }

  // ---------------------------------------------------------------- stats
  const coinInfo = (): CoinInfo[] => {
    const out: CoinInfo[] = [];
    if (!playable()) return out;
    for (let p = 0; p < nPlaces; p++) {
      if (pCount[p]! <= 0) continue;
      const r = rows === 1 ? 0 : pY[p]! > trayY + rowH ? 1 : 0, top = trayY + r * (rowH + placeGap);
      out.push({ kind: COIN_NAMES[pKind[p]!]!, face: 'heads', x: pX[p]!, y: pY[p]!, d: coinD[pKind[p]!]!, place: p, count: pCount[p]!, hit: { x: pX[p]! - placeW / 2, y: top, w: placeW, h: rowH } });
    }
    for (const f of flights) if (f.active) out.push({ kind: COIN_NAMES[f.kind]!, face: 'heads', x: f.x1, y: f.y1, d: coinD[f.kind]!, place: f.place, count: f.n, hit: null });
    return out;
  };
  const stats: RideFareStats = {
    get step() { return data.step; }, get contentStep() { return contentStep(); }, get tier() { return tier; }, get rounds() { return data.rounds; },
    get phase() { return phase; }, get riderPhase() { return riderPhase; }, get intro() { return intro; }, get introStage() { return introStage; },
    get rider() { return riderIndex; }, get riders() { return ridersTotal; }, get hits() { return hits; }, get misses() { return misses; }, get bounces() { return bounces; },
    get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; }, get hand() { return hand.mode; },
    get carrying() { return carry.active; }, get focus() { return focus; }, get counted() { return roundCounted.slice(); }, get learn() { return data.learn.slice(); },
    get cups() { return { total: usesPlate() ? 0 : fare, lit }; },
    get plate() { return usesPlate() ? Array.from({ length: plateN }, (_, k) => ({ kind: COIN_NAMES[plateKind[k]!]!, lit: plateState[k] === 2 })) : []; },
    get coins() { return coinInfo(); },
    get targets() {
      const out: TargetInfo[] = [];
      if (playable()) out.push({ kind: 'farebox', x: zoneX0, y: zoneY0, w: zoneX1 - zoneX0, h: zoneY1 - zoneY0, drawn: { x: boxX, y: boxY + liftY, w: boxW, h: boxH } });
      if (phase === 'choice' && pending) for (let i = 0; i < pending.choices.length; i++) out.push({ kind: `sticker:${pending.choices[i]}`, x: controlX(i, true) - choiceSize / 2, y: choiceY - choiceSize / 2, w: choiceSize, h: choiceSize });
      if (phase === 'rest') for (let i = 0; i < 2; i++) out.push({ kind: i === 0 ? 'again' : 'home', x: controlX(i, false) - controlsRadius, y: controlsY - controlsRadius, w: controlsRadius * 2, h: controlsRadius * 2 });
      out.push({ kind: 'corner-home', x: homeX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      out.push({ kind: 'corner-sound', x: soundX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      return out;
    },
    get coinSizes() { return { penny: coinD[PENNY]!, nickel: coinD[NICKEL]!, dime: coinD[2]! }; },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    scales() { return Object.fromEntries(drawnScale); },
    resetWork() { workHead = workCount = 0; },
  };

  function applyDebug(): void {
    if (!services.debug.enabled || debugApplied) return;
    debugApplied = true;
    const params = new URLSearchParams(location.search), step = Number(params.get('step')), rounds = Number(params.get('rounds'));
    if (params.has('step') && Number.isSafeInteger(step) && step >= 1 && step <= TOP_STEP) { data.step = Math.min(BUILT_STEP, step); data.learn.length = 0; data.stepRounds = 0; }
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
      if (carry.active) { carry.active = false; launch(RETURN, carry.kind, 1, carry.place, input.pointer.x, input.pointer.y, pX[carry.place]!, pY[carry.place]!, RETURN_SECONDS); }
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

