/**
 * Dino Picnic: baby clay dinos show a quantity on a wish card; the child feeds
 * that many fruits onto each leaf plate. Exact plates are eaten fruit by fruit,
 * spare fruit bounces home with a giggle, and later rounds ask which plate has more.
 */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, chunkyPanel, drawSprite, OUTLINE } from '../../ui/draw';
import { confettiBurst, drawCounter, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { arriveScale, clamp01, easeInOutSine, easeOutBack, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { defaultData, GAME_ID, sanitizePicnicData, type PendingRound, type PicnicData } from './data';
import {
  applyLearning, applyMotor, comparisonsPerRound, INTRO_TARGETS, pickComparison, pickTarget,
  recordComparison, recordPlate, starsFor, TIERS,
} from './rules';
import { playVoice, preloadVoice } from './voice';

export { GAME_ID };
const ART = 'dino-picnic/';
const DINO_KINDS = ['green', 'orange', 'blue'] as const;
const POSES = ['content', 'chomp', 'happy'] as const;
const FRUITS = ['strawberry', 'apple', 'orange', 'pear', 'watermelon', 'banana'] as const;
/** Mouth position in each dino's frame, as fractions of its width and height. */
const MOUTH: readonly (readonly [number, number])[] = [[0.8, 0.29], [0.72, 0.44], [0.8, 0.44]];
/** Clay crumb hues per fruit, for the small landing burst. */
const FRUIT_HUE = [355, 2, 30, 80, 350, 50];
const BG = `${ART}meadow`, PLATE = `${ART}leaf-plate`, BASKET = `${ART}basket`, HAND = `${ART}helper-hand`;
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
const CARD_FILL = '#fff4dc', CARD_LINE = '#6b4a33', DOT_EMPTY = '#ece0c4', DOT_RIM = '#b8a27c', HIGHLIGHT = '#fff6a3';
const POOL = 32, PARTICLES = 220, MAX_FRUIT = 10;
/** Most progress pips a round shows: six plates and two comparisons. */
const MAX_PIPS = 8;
const SETTLE_SECONDS = 0.8, EAT_GAP = 0.3, DANCE_SECONDS = 1.3, CELEBRATION_SECONDS = 4.6, STAR_START = 0.5;
// Choice and rest ignore input this long (and again after the break nudge), so steady pressing from the round cannot
// choose for the child; the first key then only shows focus, and a later key acts once focus has shown FOCUS_HOLD_MS.
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350, KEY_GAP_MS = 120, PRESS_GAP_MS = 150, IDLE_SECONDS = 6, IDLE_REPEAT = 7;
/** Comparison hint: the hand points at the bigger pile after 6 idle seconds, again every 8 s, for 3 s each time. */
const HINT_REPEAT = 8, HINT_SECONDS = 3;
/** Introduction: the hand reaches the card, then taps each dot in turn before it fetches a fruit. */
const POINT_REACH = 0.8, POINT_GAP = 0.6, POINT_TAP = 0.25, POINT_AFTER = 0.4;
/**
 * Plate fruit size as a fraction of the plate width. Rows of four and five shrink their fruit so the whole row spans at
 * most ROW_FIT of the plate (the leaf's visible width is about 0.96 of it); ROW_STEP is the spacing in fruit sizes.
 */
const FRUIT_OF_PLATE = 0.31, ROW_FIT = 0.86, ROW_STEP = 0.88;
/** The round-end fanfare variant, rendered ahead during play. */
const FANFARE: SfxOptions = { variant: 'D' };

type Phase = 'play' | 'celebration' | 'choice' | 'sticker' | 'rest';
type SlotState = 'off' | 'waiting' | 'asking' | 'settling' | 'eating' | 'dancing' | 'done' | 'compare';
const LAND = 0, BOUNCE = 1, RETURN = 2, EAT = 3, DROP = 4;

interface Slot {
  kind: number; x: number; state: SlotState; t: number;
  target: number; count: number; sent: number; incoming: number; eaten: number; swallowed: number;
  overshoot: boolean; assisted: boolean; compare: boolean;
  fruit: Uint8Array; landed: Uint8Array; scatterX: Float32Array; scatterY: Float32Array; tilt: Float32Array; dotPulse: Float32Array;
  chompT: number; happyT: number; wiggleT: number; giggleT: number; giggleN: number; cardT: number; lastPress: number; hopT: number;
  cardW: number; cardH: number;
}
interface Flight { active: boolean; mode: number; kind: number; slot: number; index: number; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; arc: number }
export interface DinoPicnicStats {
  readonly phase: Phase; readonly tier: Tier; readonly stage: number; readonly compareLevel: number; readonly intro: boolean;
  readonly ordersTotal: number; readonly ordersDone: number; readonly happy: number; readonly comparisonsTotal: number; readonly comparisonsDone: number;
  readonly hits: number; readonly misses: number; readonly stars: number; readonly stickerId: string; readonly choiceIds: readonly string[];
  readonly selected: number; readonly particles: number; readonly flights: number; readonly carrying: boolean; readonly hand: number;
  readonly workMean: number; readonly workMax: number; readonly comparing: string; readonly bigger: number;
  slots(): { x: number; y: number; zone: [number, number, number, number]; plateX: number; plateY: number; state: SlotState; target: number; count: number; sent: number; card: [number, number, number, number]; focused: boolean }[];
  basket(): { x: number; y: number; r: number };
  controls(): { x: number; y: number; radius: number; id: string }[];
  corners(): { home: [number, number, number]; sound: [number, number, number] };
  /** Baked canvases: the pixel ratio they were made at, the backdrop's logical rectangle, and the hat and glow canvas widths. */
  baked(): { ratio: number; pixelRatio: number; backdrop: [number, number, number, number] | null; hatPx: number; hatSize: number; glowPx: number; glowSize: number; scale: number };
  resetWork(): void;
}
export interface DinoPicnicScene extends Scene { readonly stats: DinoPicnicStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);
const spriteName = (path: string): string => path.replace(/\.\w+$/, '');
// Sprite and clip names are built once here; draw code only indexes these tables.
const DINO_NAMES = DINO_KINDS.map(k => POSES.map(p => `${ART}dino-${k}-${p}`));
const FRUIT_NAMES = FRUITS.map(f => `${ART}fruit-${f}`);
const NUMBER_CLIPS = Array.from({ length: MAX_FRUIT + 1 }, (_, n) => `number-${n}` as const);
const dinoName = (kind: number, pose: number): string => DINO_NAMES[kind % 3]![pose]!;
const fruitName = (kind: number): string => FRUIT_NAMES[kind % FRUITS.length]!;

function artList(): { name: string; path: string }[] {
  const paths = [`${BG}.webp`, `${PLATE}.webp`, `${BASKET}.webp`, `${HAND}.webp`, `${BUTTON_PLAY}.png`, `${BUTTON_HOME}.png`];
  for (let k = 0; k < 3; k++) for (let p = 0; p < 3; p++) paths.push(`${dinoName(k, p)}.webp`);
  for (let f = 0; f < FRUITS.length; f++) paths.push(`${fruitName(f)}.webp`);
  return [...paths.map(path => ({ name: spriteName(path), path })), ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path }))];
}
export async function loadDinoPicnicArt(services: AppServices): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(artList().map(({ name, path }) => services.sprites.load(name, services.art(path)).catch(() => { missing.push(path); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}

/** A small clay party hat, baked once per size and pixel ratio: the "which has more?" prize. Draw it at width / ratio. */
function bakeHat(size: number, ratio: number): HTMLCanvasElement {
  const c = document.createElement('canvas'), w = Math.ceil(size * 1.1), h = Math.ceil(size * 1.25);
  c.width = Math.max(1, Math.round(w * ratio)); c.height = Math.max(1, Math.round(h * ratio));
  const g = c.getContext('2d'); if (!g) return c;
  g.scale(c.width / w, c.height / h);
  const cx = w / 2, top = size * 0.2, base = h - size * 0.12, half = size * 0.42, line = Math.max(3, size * 0.06);
  g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + half, base); g.quadraticCurveTo(cx, base + size * 0.12, cx - half, base); g.closePath();
  g.fillStyle = '#ff9f6b'; g.fill();
  g.save(); g.clip();
  g.fillStyle = '#ffd860';
  for (let i = 0; i < 3; i++) { const y = top + (base - top) * (0.3 + i * 0.25); g.fillRect(0, y, w, size * 0.1); }
  g.fillStyle = '#8fd0f0';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx + (i % 2 ? 0.16 : -0.14) * size, top + (base - top) * (0.42 + i * 0.13), size * 0.045, 0, Math.PI * 2); g.fill(); }
  g.restore();
  g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + half, base); g.quadraticCurveTo(cx, base + size * 0.12, cx - half, base); g.closePath();
  g.lineWidth = line; g.strokeStyle = CARD_LINE; g.stroke();
  g.beginPath(); g.arc(cx, top, size * 0.13, 0, Math.PI * 2); g.fillStyle = '#fff4dc'; g.fill(); g.stroke();
  return c;
}

/** A soft warm halo behind demonstration fruit, baked once per size and pixel ratio so a hint never reads as a real fruit. */
function bakeGlow(size: number, ratio: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = Math.max(2, Math.round(size * ratio));
  const g = c.getContext('2d'); if (!g) return c;
  g.scale(c.width / size, c.width / size);
  const r = size / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 253, 225, 1)'); grad.addColorStop(0.6, 'rgba(255, 240, 150, 0.9)'); grad.addColorStop(1, 'rgba(255, 238, 140, 0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  // A bright rim marks it as a hint, unlike any fruit on a plate.
  g.beginPath(); g.arc(r, r, r * 0.66, 0, Math.PI * 2);
  g.lineWidth = Math.max(3, r * 0.07); g.strokeStyle = 'rgba(255, 255, 255, 0.95)'; g.stroke();
  return c;
}

export function createDinoPicnicScene(services: AppServices): DinoPicnicScene {
  const { sprites, audio, input } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(PARTICLES);
  const soundButton = createSoundButton(services);
  const slots: Slot[] = Array.from({ length: 3 }, () => ({
    kind: 0, x: 0, state: 'off' as SlotState, t: 0, target: 0, count: 0, sent: 0, incoming: 0, eaten: 0, swallowed: 0,
    overshoot: false, assisted: false, compare: false,
    fruit: new Uint8Array(MAX_FRUIT), landed: new Uint8Array(MAX_FRUIT), scatterX: new Float32Array(MAX_FRUIT), scatterY: new Float32Array(MAX_FRUIT), tilt: new Float32Array(MAX_FRUIT), dotPulse: new Float32Array(MAX_FRUIT).fill(9),
    chompT: 0, happyT: 0, wiggleT: 9, giggleT: 9, giggleN: 0, cardT: 0, lastPress: -9, hopT: 9, cardW: 0, cardH: 0,
  }));
  const flights: Flight[] = Array.from({ length: POOL }, () => ({ active: false, mode: 0, kind: 0, slot: 0, index: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, arc: 0 }));
  const work = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const pos = { x: 0, y: 0 };
  const carry = { active: false, sticky: false, kind: 0, downAt: 0, downX: 0, downY: 0 };
  // Hand modes: 1 introduction (points at the dots, then feeds one fruit), 2 idle see-through fruit, 3 taps the basket,
  // 4 first comparison (presses the bigger pile), 5 comparison hint (points at the bigger pile, chooses nothing).
  const hand = { mode: 0, t: 0, slot: 0, kind: 0, released: false, tapped: 0 };
  const cmp = { active: false, sub: 'fill' as 'fill' | 'ask' | 'reveal', t: 0, values: [0, 0], bigger: 0, choice: -1, demo: false, hinted: false, focusShown: false, focusAt: 0, askAt: 0, dropped: 0, eatStarted: false };
  let data: PicnicData = defaultData();
  let W = 1366, H = 768, u = 1, s = 1;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0, hatCanvas: HTMLCanvasElement | undefined, glowCanvas: HTMLCanvasElement | undefined;
  /** Pixel ratio the backdrop, hat and glow were made at; logical sizes of the glow and hat. */
  let artRatio = 0, glowSize = 0;
  /** Fitted scales for feeding (and the round's end) and for comparing. */
  let playS = 1, compareS = 1;
  /** The last placed layout stands the dinos lower; the progress row sits at the top. */
  let lowLayout = false, pipsTop = false;
  let phase: Phase = 'play', tier: Tier = 0, intro = false, dinoOffset = 0;
  let time = 0, sceneT = 0, phaseT = 0, idleT = 0;
  let ordersTotal = 0, ordersStarted = 0, ordersDone = 0, happy = 0, compTotal = 0, compDone = 0, lastTarget = 0;
  let hits = 0, misses = 0, stars = 1, starsPlayed = 0, nextFruit = 0, focus = 0;
  let pending: PendingRound | null = null;
  let menuSelected = -1, inputAfter = 0, keyAfter = 0, focusAt = 0;
  let workHead = 0, workCount = 0, updateMs = 0;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0;
  // End-of-round sprite sizes made ahead in idle periods during play (see planWarm and prepareIdle).
  const warmNames: string[] = [], warmSizes: number[] = [], warmDone = new Set<string>();
  let warmIndex = 0, madeName = '', madeSize = 0;
  // Layout, all in logical px.
  let feetY = 0, dinoH = 0, plateW = 0, plateY = 0, fruitSize = 0, dotR = 0, dotStep = 0, cardPad = 0, numW = 0, numSize = 0;
  /** Dino centres when the tier's own places leave too little room between the wish cards (narrow screens). */
  let spread = false;
  let zoneW = 0, zoneTop = 0, zoneBottom = 0, basketX = 0, basketY = 0, basketSize = 0, basketR = 0, hatSize = 0;
  let starY = 0, starR = 0, pipY = 0, pipSize = 0;
  let cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1;
  let choiceSize = 0, choiceY = 0, restSize = 0, restY = 0, controlsY = 0, controlsRadius = 60;

  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  const playable = (): boolean => phase === 'play';
  const activeSlots = (): number => (cmp.active ? 2 : intro ? 1 : TIERS[tier].dinos);
  const feeding = (sl: Slot): boolean => sl.state === 'asking' || sl.state === 'settling';
  /** Still wants fruit: fewer sent (landed or in the air) than its card asks for. */
  const wants = (sl: Slot): boolean => sl.state === 'asking' && sl.sent < sl.target;

  function slotX(i: number): number {
    if (cmp.active) return W * (i === 0 ? 0.3 : 0.7);
    const t = TIERS[intro ? 0 : tier];
    // Evenly spaced across the width, the most room each card can get.
    if (spread) return W * (i + 0.5) / t.dinos;
    return W * (t.slots[i] ?? 0.5);
  }
  /** Fruit scale for a plate's rows: 1 up to three in a row, smaller for four and five so the row stays on the leaf. */
  function rowScale(sl: Slot): number {
    const cols = Math.min(5, Math.max(1, sl.target));
    return Math.min(1, ROW_FIT / (FRUIT_OF_PLATE * (1 + (cols - 1) * ROW_STEP)));
  }
  /** Room for the numeral beside the dots; two digits need more. */
  const numberWidth = (n: number): number => numW * (n >= 10 ? 1.65 : 1);
  function cardSize(sl: Slot): void {
    const n = Math.max(1, sl.target), cols = Math.min(5, n), rows = n > 5 ? 2 : 1;
    sl.cardW = cardPad * 2 + cols * dotStep + numberWidth(n); sl.cardH = cardPad * 2 + rows * dotStep;
  }
  /** Smallest distance between neighbouring dino centres; the width when only one dino plays. */
  function slotGap(): number {
    let gap = W;
    for (let i = 1; i < activeSlots(); i++) gap = Math.min(gap, Math.abs(slotX(i) - slotX(i - 1)));
    return gap;
  }
  /** Play geometry at scale s. With `lowered`, the dinos stand lower so the wish cards clear the corner buttons. */
  function place(lowered: boolean): void {
    const t = TIERS[intro ? 0 : tier];
    dinoH = 250 * s; plateW = 236 * s; fruitSize = Math.round(plateW * FRUIT_OF_PLATE);
    // The widest wish card (ten dots and a two-digit numeral) at full size. Where the tier's places leave less room
    // between dinos (narrow screens), the dinos spread evenly and the cards shrink to fit between them.
    const fullCard = s * (14 * 2 + 5 * 44 + 60 * 1.65), several = !cmp.active && activeSlots() > 1;
    spread = false;
    let gap = slotGap();
    if (several && gap < fullCard + 8) { spread = true; gap = slotGap(); }
    const k = several ? Math.min(1, (gap - 8) / fullCard) : 1;
    dotR = 17 * s * k; dotStep = 44 * s * k; cardPad = 14 * s * k; numSize = Math.round(62 * s * k); numW = 60 * s * k;
    const maxCard = cardPad * 2 + 5 * dotStep + numberWidth(10);
    // Press zones reach from above a two-row card down to below the plate.
    const above = dinoH + 14 * s + (cardPad * 2 + 2 * dotStep) + 18 * s, below = plateW * 0.7;
    feetY = H * 0.62; lowLayout = lowered;
    if (lowered) feetY = Math.max(feetY, Math.min(cornerY + cornerRadius + 4 + above, H - below));
    plateY = feetY + plateW * 0.28;
    zoneW = Math.max(96, plateW * 1.05, maxCard);
    // Neighbouring press zones never overlap, and never get narrower than 96 px.
    if (activeSlots() > 1) zoneW = Math.max(96, Math.min(zoneW, gap - 4));
    zoneTop = feetY - above; zoneBottom = feetY + below;
    basketSize = Math.round(170 * s); basketR = Math.max(48, basketSize * 0.5);
    // The whole press circle stays on screen.
    basketX = Math.min(W - basketR, Math.max(basketR, W * t.basketX)); basketY = Math.min(H - basketR, H * t.basketY);
    for (let i = 0; i < 3; i++) { slots[i]!.x = slotX(i); cardSize(slots[i]!); }
  }
  /** Whether the press zone of the dino at x comes within r of (cx, cy). */
  function zoneNear(x: number, cx: number, cy: number, r: number): boolean {
    const dx = Math.max(x - zoneW / 2 - cx, 0, cx - x - zoneW / 2), dy = Math.max(zoneTop - cy, 0, cy - zoneBottom);
    return dx * dx + dy * dy < r * r;
  }
  /** True when a wish card would leave the top of the screen or a press area overlaps the basket or a corner button. */
  function crowded(): boolean {
    if (zoneTop < 0) return true;
    const basketOn = !cmp.active;
    if (basketOn && (Math.hypot(basketX - homeX, basketY - cornerY) < basketR + cornerRadius || Math.hypot(basketX - soundX, basketY - cornerY) < basketR + cornerRadius)) return true;
    for (let i = 0; i < activeSlots(); i++) {
      const x = slots[i]!.x;
      if (zoneNear(x, homeX, cornerY, cornerRadius) || zoneNear(x, soundX, cornerY, cornerRadius) || (basketOn && zoneNear(x, basketX, basketY, basketR))) return true;
    }
    return false;
  }
  /**
   * The largest scale up to `start` at which the play layout fits (a large uiScale on a small screen asks for more than
   * fits): first as placed, then with the dinos lower, then smaller. Leaves that layout placed.
   */
  function fit(start: number): void {
    for (let f = 1; ; f *= 0.95) {
      s = start * f;
      place(false); if (!crowded()) return;
      place(true); if (!crowded() || s <= 0.3) return;
    }
  }
  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H;
    W = width; H = height;
    // The loop's adaptive resolution changes the pixel ratio without a new size: every canvas baked at the old ratio
    // (the scaled backdrop, the hat and glow, the sprites warmed for the round's end) is made again.
    const reratio = sprites.pixelRatio !== artRatio;
    artRatio = sprites.pixelRatio;
    if (reratio) warmDone.clear();
    u = Math.min(1.5, Math.max(0.45, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    // Bubble Bay's corner buttons, place and size, so the break nudge's sound button covers this one exactly.
    const cornerU = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * cornerU, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    // Feeding and comparing each get their own fitted scale; the round's end draws at the feeding scale.
    const t = TIERS[intro ? 0 : tier], comparing = cmp.active;
    cmp.active = !comparing; fit(u * (cmp.active ? 1 : t.scale)); const otherS = s, otherLow = lowLayout;
    cmp.active = comparing; fit(u * (comparing ? 1 : t.scale));
    const anyLow = lowLayout || (otherLow && (comparing || (!intro && comparisonsPerRound(data) > 0)));
    playS = comparing ? otherS : s; compareS = comparing ? s : otherS;
    // The halo shows only while feeding and the hat only in comparisons, so each bakes at its own scale once.
    const glow = Math.max(2, Math.round(Math.round(236 * playS * FRUIT_OF_PLATE) * 1.9));
    if (!glowCanvas || reratio || glow !== glowSize) { glowSize = glow; glowCanvas = bakeGlow(glowSize, artRatio); }
    const hat = Math.round(84 * compareS);
    if (!hatCanvas || reratio || hat !== hatSize) { hatSize = hat; hatCanvas = bakeHat(hatSize, artRatio); }
    const headerScale = Math.min(1.25, Math.max(0.6, Math.min(W / 1366, H / 768)));
    starR = 34 * headerScale; starY = 70 * headerScale;
    pipSize = Math.round(34 * u); pipY = H - pipSize * 0.75; pipsTop = anyLow;
    // Where the dinos stand lower, the plates reach the bottom edge: the round's progress row moves up between the corner buttons.
    if (pipsTop) { pipY = cornerY; pipSize = Math.max(8, Math.round(Math.min(pipSize, (soundX - homeX - 2 * cornerRadius - 24) / (MAX_PIPS * 1.15)))); }
    choiceSize = Math.round(Math.max(110, Math.min(340 * Math.min(1.25, H / 768), (W - 60) / 2)));
    choiceY = H * 0.58;
    // Never under 48 px (96 px across), whatever uiScale the config sets.
    controlsRadius = Math.max(48, Math.min(Math.max(48 * services.config.uiScale, 62 * u), W / 5));
    controlsY = H - controlsRadius - 22;
    restSize = Math.round(Math.max(110, Math.min(300 * Math.min(1.25, H / 768), controlsY - controlsRadius - starY - starR - 40)));
    restY = (starY + starR + controlsY - controlsRadius) / 2;
    planWarm();
    // Rescaling the full-screen backdrop is costly; only a new canvas size or pixel ratio needs it.
    if (resized || reratio || !bgCanvas) { sprites.clearScaled(BG); bgCanvas = undefined; }
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    const image = sprites.get(BG); if (!image) return;
    bgCanvas = sprites.scaled(BG, Math.max(W / image.naturalWidth, H / image.naturalHeight));
    if (bgCanvas) { bgX = (W - bgCanvas.width / sprites.pixelRatio) / 2; bgY = (H - bgCanvas.height / sprites.pixelRatio) / 2; }
  }

  /** Where fruit k of a plate rests: rows of five, mirroring the card's dots. */
  function fruitSpot(sl: Slot, k: number, arranged: number): void {
    const n = Math.max(1, sl.target), rows = n > 5 ? 2 : 1, row = k < 5 ? 0 : 1, inRow = row === 0 ? Math.min(5, n) : n - 5;
    const size = fruitSize * rowScale(sl);
    const fx = sl.x + ((k % 5) - (inRow - 1) / 2) * size * ROW_STEP;
    const fy = plateY - plateW * 0.06 + (rows === 2 ? (row - 0.5) * size * 0.92 : 0);
    pos.x = lerp(sl.x + sl.scatterX[k]! * plateW, fx, arranged); pos.y = lerp(plateY + sl.scatterY[k]! * plateW, fy, arranged);
  }
  function mouth(sl: Slot): void {
    const img = sprites.get(dinoName(sl.kind, 1)), aspect = img ? img.naturalWidth / img.naturalHeight : 0.85;
    const m = MOUTH[sl.kind % 3]!;
    pos.x = sl.x + (m[0] - 0.5) * dinoH * aspect; pos.y = feetY - dinoH + m[1] * dinoH;
  }
  const cardY = (sl: Slot): number => feetY - dinoH - 16 * s - sl.cardH / 2;
  function slotAt(x: number, y: number): number {
    const n = activeSlots();
    for (let i = 0; i < n; i++) {
      const sl = slots[i]!; if (sl.state === 'off') continue;
      if (Math.abs(x - sl.x) <= zoneW / 2 && y >= zoneTop && y <= zoneBottom) return i;
    }
    return -1;
  }
  const onBasket = (x: number, y: number): boolean => !cmp.active && Math.hypot(x - basketX, y - basketY) <= basketR;
  const onCorner = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius || Math.hypot(x - soundX, y - cornerY) <= cornerRadius;

  function launch(mode: number, kind: number, slot: number, index: number, x0: number, y0: number, x1: number, y1: number, dur: number, arc: number): void {
    for (const f of flights) {
      if (f.active) continue;
      f.active = true; f.mode = mode; f.kind = kind; f.slot = slot; f.index = index; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1; f.t = 0; f.dur = dur; f.arc = arc;
      return;
    }
    // Pool full: resolve a landing at once so a plate never loses a fruit.
    if (mode === LAND) arrive(mode, kind, slot, index);
  }
  const basketMouthY = (): number => basketY - basketSize * 0.12;

  /** Send one fruit toward a plate. Spare fruit bounces home with a giggle; nothing is ever wrong. */
  function feed(i: number, fromX: number, fromY: number, deliberate: boolean, kind = -1): void {
    const sl = slots[i]; if (!sl || sl.state === 'off' || sl.compare) return;
    const k = kind >= 0 ? kind : nextFruit; if (kind < 0) nextFruit = (nextFruit + 1 + Math.floor(random() * 2)) % FRUITS.length;
    const near = Math.hypot(fromX - sl.x, fromY - plateY) < plateW;
    if (wants(sl)) {
      // The card's dot fills on the press, with the fruit still in the air, so the card shows full as soon as
      // enough fruit is on its way; focus then moves to a plate that still wants fruit.
      const index = sl.sent++; sl.incoming++;
      sl.fruit[index] = k; sl.dotPulse[index] = 0;
      fruitSpot(sl, index, 1);
      launch(LAND, k, i, index, fromX, fromY, pos.x, pos.y, near ? 0.22 : 0.45, near ? 20 * s : 90 * s);
      ensureFocus();
      return;
    }
    // Enough fruit is already on its way: send no more, the dino only wiggles. A carried fruit floats back to the basket.
    if (sl.state === 'asking' && sl.incoming > 0) {
      sl.wiggleT = 0;
      if (kind < 0) nextFruit = k; else launch(RETURN, k, i, 0, fromX, fromY, basketX, basketMouthY(), 0.4, 40 * s);
      return;
    }
    if (feeding(sl) && deliberate) sl.overshoot = true;
    if (sl.state === 'settling') sl.t = 0;
    launch(BOUNCE, k, i, 0, fromX, fromY, sl.x, plateY - plateW * 0.1, near ? 0.22 : 0.42, near ? 30 * s : 90 * s);
  }
  function giggle(sl: Slot): void { sl.giggleT = 0; sl.giggleN = 0; sl.happyT = 0.6; sl.wiggleT = 0; }

  let bx = 0, by = 0, bHue = 0, bSpeed = 0;
  const fillCrumb = (p: ParticleSpawn, index: number): void => {
    const a = (index / 6) * Math.PI * 2 + random() * 0.5;
    p.x = bx; p.y = by; p.vx = Math.cos(a) * bSpeed * s; p.vy = Math.sin(a) * bSpeed * s - 60 * s;
    p.life = 0.35 + random() * 0.25; p.size = (3 + random() * 3) * s; p.endSize = 1; p.gravity = 420 * s;
    p.hue = bHue + random() * 20; p.saturation = 70; p.lightness = 62; p.alpha = 0.9;
  };
  function crumbs(x: number, y: number, hue: number, n: number, speed = 120): void { bx = x; by = y; bHue = hue; bSpeed = speed; particles.burst(n, fillCrumb); }

  function arrive(mode: number, kind: number, slot: number, index: number): void {
    const sl = slots[slot]!;
    if (mode === LAND) {
      sl.incoming = Math.max(0, sl.incoming - 1);
      // A near fruit can land before a far one sent earlier; each is drawn on the plate only once it has landed.
      sl.fruit[index] = kind; sl.landed[index] = 1; sl.count++;
      sl.chompT = 0.28; sl.wiggleT = 0;
      play('pop', 'C', sl.count - 1);
      fruitSpot(sl, index, 1); crumbs(pos.x, pos.y, FRUIT_HUE[kind] ?? 0, 5);
      if (sl.count >= sl.target && sl.incoming === 0 && sl.state === 'asking') { sl.state = 'settling'; sl.t = 0; }
    } else if (mode === BOUNCE) {
      giggle(sl);
      launch(RETURN, kind, slot, 0, sl.x, plateY - plateW * 0.1, basketX, basketMouthY(), 0.55, 110 * s);
    } else if (mode === EAT) {
      sl.swallowed++; sl.chompT = 0.25; sl.dotPulse[index] = 0;
      play('pop', 'D', index, 0.9);
      playVoice(audio, NUMBER_CLIPS[index + 1]!);
      mouth(sl); crumbs(pos.x, pos.y, FRUIT_HUE[kind] ?? 0, 4, 90);
    } else if (mode === DROP) {
      sl.landed[index] = 1; sl.count++;
      play('tick', 'C', index, 0.7);
    }
  }

  function startOrder(i: number): void {
    const sl = slots[i]!;
    let target: number;
    if (intro) target = INTRO_TARGETS[ordersStarted % INTRO_TARGETS.length] ?? 2;
    else target = pickTarget(data.stage, random, n => n === lastTarget || slots.some((o, j) => j !== i && feeding(o) && o.target === n));
    lastTarget = target;
    Object.assign(sl, { state: 'asking', t: 0, target, count: 0, sent: 0, incoming: 0, eaten: 0, swallowed: 0, overshoot: false, assisted: intro, compare: false, cardT: 0 });
    sl.scatterX.fill(0); sl.scatterY.fill(0); sl.tilt.fill(0); sl.dotPulse.fill(9); sl.landed.fill(0);
    cardSize(sl); ordersStarted++;
    play('pop-big', 'D', 2, 0.55);
    playVoice(audio, NUMBER_CLIPS[target]!);
    if (intro && ordersStarted === 1) { hand.mode = 1; hand.t = 0; hand.slot = i; hand.kind = nextFruit; hand.released = false; hand.tapped = 0; }
    ensureFocus();
  }
  function startEating(sl: Slot): void { sl.state = 'eating'; sl.t = 0; sl.eaten = 0; sl.swallowed = 0; }

  function startRound(): void {
    pending = null; data.pending = null;
    tier = services.debug.tier ?? toTier(data.tier);
    intro = data.rounds === 0;
    dinoOffset = data.rounds % 3;
    phase = 'play'; phaseT = time = idleT = 0;
    ordersTotal = intro ? INTRO_TARGETS.length : TIERS[tier].orders; ordersStarted = ordersDone = happy = 0;
    compTotal = intro ? 0 : comparisonsPerRound(data); compDone = 0; lastTarget = 0;
    hits = misses = 0; stars = 1; starsPlayed = 0; focus = 0; nextFruit = Math.floor(random() * FRUITS.length);
    cmp.active = false; carry.active = false; hand.mode = 0;
    particles.clear(); for (const f of flights) f.active = false;
    const n = activeSlots();
    for (let i = 0; i < 3; i++) {
      const sl = slots[i]!;
      Object.assign(sl, { state: i < n ? 'waiting' : 'off', t: -0.35 * i, kind: (dinoOffset + i) % 3, target: 0, count: 0, sent: 0, incoming: 0, compare: false, chompT: 0, happyT: 0, giggleT: 9 });
    }
    layout(W, H); guard(PLAY_GUARD_MS); cornerFocus = -1; services.save.flush();
    // The round-end fanfare is rendered ahead once per session, so the frame a round ends does not build its notes.
    // Its first step is the one long one, so it runs here, before the round's first frame, while the screen is still
    // (under the enter fade, or on the rest screen after Again); the short note steps follow in idle periods.
    if (!fanfareStarted && audio.context) { fanfareStarted = true; if (prepareSfxStep(audio, 'fanfare', FANFARE)) fanfareAsked = true; }
  }
  /** Every sprite size the celebration, choice and rest draw that play does not, so the round's end scales nothing. */
  function planWarm(): void {
    warmNames.length = 0; warmSizes.length = 0; warmIndex = 0;
    const add = (name: string, size: number): void => { warmNames.push(name); warmSizes.push(Math.round(size)); };
    // The celebration (and a rest without a gift) shows all three dinos at the round's own size.
    const celebH = 250 * playS;
    for (let k = 0; k < 3; k++) { add(dinoName(k, 2), celebH); add(dinoName(k, 0), celebH); }
    add(PLATE, choiceSize); add(PLATE, restSize);
    // Offers are drawn only when the round ends; any sticker not yet owned can be one.
    if (services.config.rewardsEnabled && services.profile()) {
      const owned = rewards(services).stickers;
      for (const st of STICKERS) if (st.game === GAME_ID && !owned.includes(st.id)) { add(stickerSpriteName(st.id), choiceSize * 0.78); add(stickerSpriteName(st.id), restSize * 0.78); }
    }
    add(BUTTON_PLAY, controlsRadius * 1.3); add(BUTTON_HOME, controlsRadius * 1.3);
    // Comparisons draw the dinos, plates and fruit at their own size instead of the tier's size.
    if (!intro && comparisonsPerRound(data) > 0) {
      const plate = 236 * compareS, fruit = Math.round(plate * FRUIT_OF_PLATE);
      for (let k = 0; k < 3; k++) for (let pose = 0; pose < 3; pose++) add(dinoName(k, pose), 250 * compareS);
      add(PLATE, plate);
      for (let f = 0; f < FRUITS.length; f++) add(fruitName(f), fruit);
    }
  }
  /**
   * Idle periods between frames, with at least 4 ms left: first the fanfare render, a note at a time, then one planned
   * sprite canvas per period (several made together would be rasterised on one frame); the next frame draws it once
   * under the backdrop, which uploads it.
   */
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
    if (madeName) { drawSprite(ctx, sprites, madeName, W / 2, H / 2, madeSize); warmDone.add(`${madeName}@${madeSize}`); madeName = ''; }
  }
  function askIdle(): void {
    if (idleHandle) return;
    if ((fanfareStarted && !fanfareAsked) || (playable() && time >= 0.5 && warmIndex < warmNames.length)) idleHandle = requestIdleCallback(prepareIdle, { timeout: 500 });
  }
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; }

  function startComparison(): void {
    cmp.active = true; cmp.sub = 'fill'; cmp.t = 0; cmp.choice = -1; cmp.focusShown = false; cmp.dropped = 0; cmp.eatStarted = false;
    cmp.demo = data.comparisons === 0;
    const [a, b] = pickComparison(data.compareLevel, random);
    cmp.values[0] = a; cmp.values[1] = b; cmp.bigger = a > b ? 0 : 1;
    for (let i = 0; i < 3; i++) {
      const sl = slots[i]!;
      if (i > 1) { sl.state = 'off'; continue; }
      const value = cmp.values[i]!;
      Object.assign(sl, { state: 'compare', t: 0, target: value, count: 0, sent: 0, incoming: 0, eaten: 0, swallowed: 0, compare: true, overshoot: false, chompT: 0, happyT: 0, giggleT: 9, hopT: 9, kind: (dinoOffset + i) % 3 });
      sl.landed.fill(0);
      pile(sl, value);
    }
    cmp.hinted = false; focus = 0; layout(W, H); carry.active = false;
  }
  /**
   * A loose heap on the plate: a bottom layer, each layer above one fruit narrower and nestled
   * between the ones below, slightly jittered and tilted. Fruits barely touch, so every one stays
   * visible and the bigger amount makes the bigger heap, without forming rows to read.
   */
  function pile(sl: Slot, n: number): void {
    let base = 1;
    while ((base * (base + 1)) / 2 < n) base++;
    const step = FRUIT_OF_PLATE * 1.02, lean = random() < 0.5 ? -1 : 1;
    let k = 0;
    for (let layer = 0; k < n; layer++) {
      const full = base - layer, w = Math.min(full, n - k);
      const shift = lean * (full - w) * step * 0.25;
      for (let j = 0; j < w; j++, k++) {
        sl.scatterX[k] = (j - (w - 1) / 2) * step + shift + (random() - 0.5) * FRUIT_OF_PLATE * 0.14;
        sl.scatterY[k] = -0.06 - layer * FRUIT_OF_PLATE * 0.8 + (random() - 0.5) * FRUIT_OF_PLATE * 0.1;
        sl.tilt[k] = (random() - 0.5) * 0.7;
        sl.fruit[k] = Math.floor(random() * FRUITS.length);
      }
    }
  }

  function chooseCompare(i: number, deliberate: boolean): void {
    if (!cmp.active || cmp.sub !== 'ask' || i < 0 || i > 1) return;
    cmp.choice = i; cmp.sub = 'reveal'; cmp.t = 0;
    // Once the hand has shown the answer, the pick is the hand's, not evidence of comparing.
    if (deliberate && !cmp.demo && !cmp.hinted) recordComparison(data, i === cmp.bigger);
    data.comparisons++;
    if (hand.mode === 4 || hand.mode === 5) hand.mode = 0;
    play('whoosh', 'B', 0, 0.7);
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
    stars = starsFor(happy, ordersTotal, intro);
    if (!intro && services.debug.tier === undefined) applyMotor(data, tier, hits, misses);
    applyLearning(data);
    data.rounds++;
    pending = { stars, happy, orders: ordersTotal, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, tier, dinoOffset };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += stars;
    // Round, stars and the unresolved gift share one immediate write; re-entry never awards again.
    services.save.flush();
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; carry.active = false; hand.mode = 0; cmp.active = false; cornerFocus = -1;
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
    // The chosen id and the owned sticker save together, so repeated input and reload are idempotent.
    services.save.flush(); phase = 'sticker'; phaseT = 0; guard(PLAY_GUARD_MS); play('sticker', 'C');
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
  function exitToHub(): void {
    // An unfinished gift stays pending, including a departure during the celebration or choice.
    closeFinishedRound(); services.save.flush(); services.nav.toHub();
  }
  function guard(ms: number): void { inputAfter = performance.now() + ms; menuSelected = -1; }

  function ensureFocus(): void {
    const n = activeSlots(), cur = slots[focus];
    if (cmp.active) { if (focus > 1) focus = 0; return; }
    // A plate that still wants fruit first; focus leaves a full plate when another one wants fruit.
    if (cur && focus < n && wants(cur)) return;
    for (let k = 1; k < n; k++) { const i = (focus + k) % n; if (wants(slots[i]!)) { focus = i; return; } }
    if (cur && focus < n && feeding(cur)) return;
    for (let i = 0; i < n; i++) if (feeding(slots[i]!)) { focus = i; return; }
    if (focus >= n) focus = 0;
  }
  function moveFocus(step: number): void {
    const n = activeSlots();
    for (let k = 1; k <= n; k++) {
      const i = (focus + step * k + n * 3) % n;
      if (slots[i]!.state !== 'off') { focus = i; return; }
    }
  }

  // ---------------------------------------------------------------- update
  function updateSlot(i: number, dt: number): void {
    const sl = slots[i]!;
    sl.t += dt; sl.cardT += dt; sl.chompT -= dt; sl.happyT -= dt; sl.wiggleT += dt; sl.hopT += dt;
    for (let k = 0; k < MAX_FRUIT; k++) sl.dotPulse[k]! += dt;
    if (sl.giggleT < 1) {
      sl.giggleT += dt;
      // Three quick soft notes: hee-hee-hee.
      if (sl.giggleN < 3 && sl.giggleT >= sl.giggleN * 0.09) { play('pop', 'A', sl.giggleN === 1 ? 6 : 8, 0.45); sl.giggleN++; }
    }
    switch (sl.state) {
      case 'waiting':
        if (cmp.active) break;
        if (ordersStarted >= ordersTotal) { sl.state = 'done'; sl.t = 0; }
        else if (sl.t >= 0.55) startOrder(i);
        break;
      case 'settling':
        if (sl.t >= SETTLE_SECONDS) {
          if (!sl.assisted && !intro) recordPlate(data, !sl.overshoot);
          if (!sl.overshoot) happy++;
          startEating(sl);
        }
        break;
      case 'eating':
        if (sl.eaten < sl.target && sl.t >= 0.15 + sl.eaten * EAT_GAP) {
          fruitSpot(sl, sl.eaten, 1); const fx = pos.x, fy = pos.y; mouth(sl);
          launch(EAT, sl.fruit[sl.eaten] ?? 0, i, sl.eaten, fx, fy, pos.x, pos.y, 0.26, 40 * s);
          sl.eaten++;
        }
        if (sl.swallowed >= sl.target && sl.t >= 0.4 + sl.target * EAT_GAP) {
          sl.state = 'dancing'; sl.t = 0; sl.happyT = DANCE_SECONDS;
          play('go', 'C', 0, 0.8);
          confettiBurst(particles, sl.x, feetY - dinoH * 0.6, 22, 300 * s);
          if (!sl.compare) ordersDone++;
        }
        break;
      case 'dancing':
        if (sl.t >= DANCE_SECONDS) { sl.state = sl.compare ? 'done' : 'waiting'; sl.t = 0; ensureFocus(); }
        break;
      default: break;
    }
  }
  function updateCompare(dt: number): void {
    cmp.t += dt;
    if (cmp.sub === 'fill') {
      const total = cmp.values[0]! + cmp.values[1]!;
      const due = Math.min(total, Math.floor(cmp.t / 0.13));
      while (cmp.dropped < due) {
        // Alternate plates so both piles grow together; the larger pile finishes last.
        const a = slots[0]!, b = slots[1]!;
        const i = a.sent < a.target && (a.sent <= b.sent || b.sent >= b.target) ? 0 : 1;
        const sl = slots[i]!, k = sl.sent++; fruitSpot(sl, k, 0);
        launch(DROP, sl.fruit[k] ?? 0, i, k, pos.x, zoneTop - 40 * s, pos.x, pos.y, 0.35, 0);
        cmp.dropped++;
      }
      if (cmp.dropped >= total && cmp.t >= total * 0.13 + 0.7) {
        cmp.sub = 'ask'; cmp.t = 0; cmp.askAt = time; idleT = 0;
        play('pop-big', 'B', 4, 0.6); playVoice(audio, 'more');
        if (cmp.demo) { hand.mode = 4; hand.t = 0; hand.slot = cmp.bigger; }
      }
    } else if (cmp.sub === 'reveal') {
      const right = cmp.choice === cmp.bigger, big = slots[cmp.bigger]!, chosen = slots[cmp.choice]!;
      if (cmp.t - dt < 0.5 && cmp.t >= 0.5) {
        if (right) { play('pop-big', 'C', 5); big.happyT = 1.2; crumbs(big.x, feetY - dinoH, 50, 10, 160); }
        else giggle(chosen);
      }
      if (!right && cmp.t - dt < 1.6 && cmp.t >= 1.6) { play('whoosh', 'B', 0, 0.7); }
      if (!right && cmp.t - dt < 2.1 && cmp.t >= 2.1) { play('pop-big', 'C', 5); big.happyT = 1.2; crumbs(big.x, feetY - dinoH, 50, 10, 160); }
      if (!cmp.eatStarted && cmp.t >= (right ? 2.6 : 3.3)) { cmp.eatStarted = true; startEating(slots[0]!); startEating(slots[1]!); }
      if (cmp.eatStarted && slots[0]!.state === 'done' && slots[1]!.state === 'done') {
        compDone++; cmp.active = false;
        for (let i = 0; i < 3; i++) { const sl = slots[i]!; sl.compare = false; sl.state = i < activeSlots() ? 'done' : 'off'; }
        layout(W, H);
      }
    }
  }
  function hatOn(sl: Slot): void { mouth(sl); pos.y = feetY - dinoH - hatSize * 0.35; pos.x = sl.x + (pos.x - sl.x) * 0.4; }
  /** Hat position: centre stage while asking, then onto the chosen dino and, if needed, hop to the plate with more. */
  function hatPos(): void {
    const top = zoneTop + hatSize * 0.4;
    if (cmp.sub !== 'reveal') { pos.x = W / 2; pos.y = top + Math.sin(time * 2.2) * 8 * s; return; }
    const chosen = slots[cmp.choice]!, big = slots[cmp.bigger]!;
    hatOn(chosen); const cx = pos.x, cy = pos.y;
    if (cmp.t < 0.5) { const e = easeOutCubic(cmp.t / 0.5); pos.x = lerp(W / 2, cx, e); pos.y = lerp(top, cy, e) - Math.sin(e * Math.PI) * 40 * s; return; }
    if (cmp.choice === cmp.bigger || cmp.t < 1.6) { pos.x = cx; pos.y = cy; return; }
    hatOn(big); const e = easeInOutSine(clamp01((cmp.t - 1.6) / 0.5));
    pos.x = lerp(cx, pos.x, e); pos.y = lerp(cy, pos.y, e) - Math.sin(e * Math.PI) * 90 * s;
  }

  /** Seconds the introduction hand spends pointing at the card's dots before it fetches a fruit. */
  const handLead = (): number => (hand.mode === 1 ? POINT_REACH + slots[hand.slot]!.target * POINT_GAP + POINT_AFTER : 0);
  /** Hand time after the pointing lead: the basket-to-plate carry runs on this clock. */
  const carryT = (): number => hand.t - handLead();
  function updateHand(dt: number): void {
    if (!hand.mode) return;
    hand.t += dt;
    if (hand.mode === 1 || hand.mode === 2) {
      if (hand.mode === 1) {
        // Each dot pulses with a soft tick as the fingertip taps it, counting the wish out loud in motion.
        const sl = slots[hand.slot]!;
        while (hand.tapped < sl.target && hand.t >= POINT_REACH + hand.tapped * POINT_GAP + POINT_TAP) {
          sl.dotPulse[hand.tapped] = 0; play('tick', 'C', hand.tapped, 0.7); playVoice(audio, NUMBER_CLIPS[hand.tapped + 1]!);
          hand.tapped++;
        }
      }
      const t = carryT();
      if (!hand.released && t >= 1.9) {
        hand.released = true;
        handTip();
        if (hand.mode === 1) feed(hand.slot, pos.x, pos.y, false, hand.kind);
      }
      if (t >= 2.5) { hand.mode = hand.mode === 1 ? 3 : 0; hand.t = 0; idleT = 0; }
    } else if (hand.mode === 4 && hand.t >= 1.3 && cmp.sub === 'ask') chooseCompare(hand.slot, false);
    else if (hand.mode === 5 && (hand.t >= HINT_SECONDS || cmp.sub !== 'ask')) hand.mode = 0;
  }
  /** Fingertip just below dot k of a slot's card, so the dot stays visible while it is tapped. */
  function dotSpot(sl: Slot, k: number): void {
    const rows = sl.target > 5 ? 2 : 1;
    pos.x = sl.x - sl.cardW / 2 + cardPad + ((k % 5) + 0.5) * dotStep;
    pos.y = cardY(sl) + (rows === 2 ? ((k < 5 ? 0 : 1) - 0.5) * dotStep : 0) + dotR * 0.8;
  }
  /** Fingertip position for the current hand demonstration. */
  function handTip(): void {
    const sl = slots[hand.slot]!;
    let startX = basketX + 140 * s, startY = H + 40;
    const bxm = basketX, bym = basketMouthY() - 10 * s;
    if (hand.mode === 3) { pos.x = bxm; pos.y = bym - Math.abs(Math.sin(hand.t * 3.2)) * 26 * s; return; }
    if (hand.mode === 4 || hand.mode === 5) {
      const tx = sl.x, ty = plateY - plateW * 0.05, e = easeOutCubic(clamp01(hand.t / 0.9));
      pos.x = lerp(W / 2, tx, e); pos.y = lerp(H + 40, ty, e) - (hand.t > 0.9 ? Math.abs(Math.sin((hand.t - 0.9) * 6)) * 14 * s : 0);
      return;
    }
    if (hand.mode === 1) {
      const last = Math.max(0, sl.target - 1);
      if (hand.t < handLead()) {
        if (hand.t < POINT_REACH) {
          dotSpot(sl, 0); const e = easeOutCubic(hand.t / POINT_REACH);
          pos.x = lerp(startX, pos.x, e); pos.y = lerp(startY, pos.y, e);
          return;
        }
        const local = hand.t - POINT_REACH, k = Math.min(last, Math.floor(local / POINT_GAP)), within = local - k * POINT_GAP;
        dotSpot(sl, k);
        if (k > 0 && within < POINT_TAP) {
          // Hop from the previous dot to this one.
          const tx = pos.x, ty = pos.y, e = easeInOutSine(within / POINT_TAP);
          dotSpot(sl, k - 1); pos.x = lerp(pos.x, tx, e); pos.y = lerp(pos.y, ty, e) - Math.sin(e * Math.PI) * 16 * s;
        }
        return;
      }
      // The carry starts from the last dot instead of below the screen.
      dotSpot(sl, last); startX = pos.x; startY = pos.y;
    }
    const t = carryT();
    fruitSpot(sl, Math.min(sl.target - 1, sl.sent), 1);
    const px = pos.x, py = pos.y;
    if (t < 0.5) { const e = easeOutCubic(t / 0.5); pos.x = lerp(startX, bxm, e); pos.y = lerp(startY, bym, e); }
    else if (t < 0.8) { pos.x = bxm; pos.y = bym; }
    else if (t < 1.9) { const e = easeInOutSine((t - 0.8) / 1.1); pos.x = lerp(bxm, px, e); pos.y = lerp(bym, py, e) - Math.sin(e * Math.PI) * 80 * s; }
    else { pos.x = px; pos.y = py; }
  }
  /** True while the introduction hand presses a dot (a short squash on each tap). */
  const handTapping = (): boolean => {
    if (hand.mode !== 1 || hand.t < POINT_REACH) return false;
    const local = hand.t - POINT_REACH;
    if (local >= slots[hand.slot]!.target * POINT_GAP) return false;
    const within = local % POINT_GAP;
    return within >= POINT_TAP && within < POINT_TAP + 0.14;
  };

  function updatePlay(dt: number): void {
    time += dt; idleT += dt;
    const n = activeSlots();
    for (let i = 0; i < n; i++) updateSlot(i, dt);
    if (cmp.active) updateCompare(dt);
    updateHand(dt);
    ensureFocus();
    // Idle: a see-through fruit is carried to a plate. It never counts and never repeats faster than every few seconds.
    const target = slots[focus];
    if (!cmp.active && !hand.mode && !carry.active && idleT >= IDLE_SECONDS && target && feeding(target)) {
      hand.mode = 2; hand.t = 0; hand.slot = focus; hand.kind = nextFruit; hand.released = false; idleT = IDLE_SECONDS - IDLE_REPEAT;
    }
    // Idle in a comparison: the hand points at the bigger pile again (it chooses nothing), every few seconds.
    if (cmp.active && cmp.sub === 'ask' && !cmp.demo && !hand.mode && idleT >= IDLE_SECONDS) {
      hand.mode = 5; hand.t = 0; hand.slot = cmp.bigger; cmp.hinted = true; idleT = IDLE_SECONDS - HINT_REPEAT;
      play('pop', 'A', 4, 0.4);
    }
    let busy = false;
    for (const f of flights) if (f.active) { busy = true; break; }
    if (!cmp.active && !busy && ordersStarted >= ordersTotal) {
      let settled = true;
      for (let i = 0; i < n; i++) { const st = slots[i]!.state; if (st !== 'done' && st !== 'off') { settled = false; break; } }
      if (settled) { if (compDone < compTotal) startComparison(); else finishRound(); }
    }
  }
  function updateFlights(dt: number): void {
    for (const f of flights) {
      if (!f.active) continue;
      f.t += dt;
      if (f.t >= f.dur) { f.active = false; if (f.mode !== RETURN) arrive(f.mode, f.kind, f.slot, f.index); }
    }
  }
  function updateResult(dt: number): void {
    phaseT += dt; time += dt;
    if (phase === 'celebration') {
      const shown = Math.min(stars, Math.max(0, Math.floor((phaseT - STAR_START - STAR_HIT_SECONDS) / STAR_GAP_SECONDS) + 1));
      if (shown > starsPlayed) { play('star', 'B', starsPlayed); starsPlayed = shown; }
      if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
    } else if (phase === 'sticker' && phaseT >= 0.7) enterRest();
  }

  // ---------------------------------------------------------------- render
  function dino(ctx: CanvasRenderingContext2D, sl: Slot, x: number, still: boolean): void {
    let pose = 0, sx = 1, sy = 1, lift = 0, rot = 0;
    if (!still) {
      if (sl.state === 'dancing' || sl.happyT > 0) pose = 2;
      if (sl.chompT > 0) pose = 1;
      const breathe = Math.sin(time * 2.1 + sl.kind * 1.7) * 0.015;
      sx = 1 - breathe; sy = 1 + breathe;
      if (sl.wiggleT < 0.45) { const w = Math.sin(sl.wiggleT * 28) * (1 - sl.wiggleT / 0.45); rot = w * 0.06; sx += w * 0.04; sy -= w * 0.04; }
      if (sl.state === 'dancing') {
        const k = (sl.t * 2.6) % 1, hop = Math.sin(k * Math.PI);
        lift = hop * 34 * s; rot = Math.sin(sl.t * 5.2) * 0.12;
        if (k < 0.12 || k > 0.9) { sx += 0.08; sy -= 0.08; }
      } else if (sl.happyT > 0 && sl.giggleT < 1) rot = Math.sin(sl.giggleT * 30) * 0.05;
      if (sl.state === 'settling') lift = Math.abs(Math.sin(sl.t * 9)) * 6 * s;
      // An inviting hop when a press lands somewhere that does nothing yet.
      if (sl.hopT >= 0 && sl.hopT < 0.42) {
        const k = sl.hopT / 0.42; lift += Math.sin(k * Math.PI) * 26 * s;
        if (k < 0.15 || k > 0.88) { sx += 0.06; sy -= 0.06; }
      }
      if (phase === 'celebration') { pose = 2; const k = (phaseT * 2.4 + sl.kind * 0.33) % 1; lift = Math.sin(k * Math.PI) * 40 * s; rot = Math.sin(phaseT * 5 + sl.kind) * 0.12; }
    }
    // Feet stay planted: scale about the feet by shifting the centre.
    drawSprite(ctx, sprites, dinoName(sl.kind, pose), x, feetY - lift - dinoH * sy / 2, Math.round(dinoH), rot, sx, sy);
  }
  function plate(ctx: CanvasRenderingContext2D, sl: Slot): void {
    drawSprite(ctx, sprites, PLATE, sl.x, plateY, Math.round(plateW));
    const arranged = sl.compare ? (cmp.sub === 'reveal' ? easeInOutSine(clamp01((cmp.t - 0.6) / 0.6)) : 0) : 1;
    const glow = sl.compare && cmp.sub === 'reveal' && cmp.t > 1.2 && sl === slots[cmp.bigger];
    const small = Math.min(cmp.values[0]!, cmp.values[1]!);
    // A heap keeps full-size fruit; rows of four or five use smaller fruit, so a heap shrinks into its rows as it arranges.
    const sc = lerp(1, rowScale(sl), arranged);
    for (let k = sl.eaten; k < sl.sent; k++) {
      if (!sl.landed[k]) continue;
      fruitSpot(sl, k, arranged);
      if (glow && k >= small) {
        const b = Math.abs(Math.sin(time * 5 + k)) * 6 * s;
        chunkyCircle(ctx, pos.x, pos.y - b, fruitSize * 0.62 * sc, HIGHLIGHT, '#f3c84b', 3);
        drawSprite(ctx, sprites, fruitName(sl.fruit[k] ?? 0), pos.x, pos.y - b, fruitSize, 0, sc, sc);
      } else drawSprite(ctx, sprites, fruitName(sl.fruit[k] ?? 0), pos.x, pos.y, fruitSize, sl.tilt[k]! * (1 - arranged), sc, sc);
    }
  }
  function card(ctx: CanvasRenderingContext2D, sl: Slot): void {
    if (sl.compare || !(feeding(sl) || sl.state === 'eating' || (sl.state === 'dancing' && sl.t < 0.3))) return;
    const n = sl.target, cy = cardY(sl), x0 = sl.x - sl.cardW / 2;
    let scale = arriveScale(Math.min(1, sl.cardT / 0.35));
    if (sl.state === 'dancing') scale = 1 - easeOutCubic(sl.t / 0.3);
    if (sl.state === 'settling') scale *= 1 + Math.sin(Math.min(1, sl.t / 0.3) * Math.PI) * 0.08;
    ctx.save(); ctx.translate(sl.x, cy); ctx.scale(scale, scale); ctx.translate(-sl.x, -cy);
    // Thought-bubble tail toward the dino's head.
    chunkyCircle(ctx, sl.x - 8 * s, cy + sl.cardH / 2 + 10 * s, 8 * s, CARD_FILL, CARD_LINE, 3 * s);
    chunkyCircle(ctx, sl.x - 16 * s, cy + sl.cardH / 2 + 24 * s, 5 * s, CARD_FILL, CARD_LINE, 2.5 * s);
    chunkyPanel(ctx, x0, cy - sl.cardH / 2, sl.cardW, sl.cardH, CARD_FILL, CARD_LINE, 22 * s, 5 * s);
    const rows = n > 5 ? 2 : 1, dotSize = Math.round(dotR * 2.5);
    for (let k = 0; k < n; k++) {
      const row = k < 5 ? 0 : 1, col = k % 5;
      const dx = x0 + cardPad + (col + 0.5) * dotStep, dy = cy + (rows === 2 ? (row - 0.5) * dotStep : 0);
      // Fruit on its way already fills its dot.
      const filled = k < sl.sent && k >= (sl.state === 'eating' ? sl.swallowed : 0);
      const eatenDot = sl.state === 'eating' && k < sl.swallowed;
      const pulse = sl.dotPulse[k]! < 0.28 ? 1 + Math.sin(sl.dotPulse[k]! / 0.28 * Math.PI) * 0.4 : 1;
      if (filled) drawSprite(ctx, sprites, fruitName(sl.fruit[k] ?? 0), dx, dy, dotSize, 0, pulse, pulse);
      else {
        ctx.beginPath(); ctx.arc(dx, dy, dotR * pulse, 0, Math.PI * 2);
        ctx.fillStyle = eatenDot ? '#ffe58a' : DOT_EMPTY; ctx.fill(); ctx.lineWidth = 3 * s; ctx.strokeStyle = DOT_RIM; ctx.stroke();
      }
    }
    // The numeral beside the dots names the quantity (learning material, drawn from cached glyphs).
    drawCounter(ctx, n, x0 + sl.cardW - cardPad - numberWidth(n) / 2 + 2 * s, cy, numSize, 1);
    ctx.restore();
  }
  function highlight(ctx: CanvasRenderingContext2D, sl: Slot): void {
    const bob = Math.abs(Math.sin(time * 3)) * 8 * s;
    const top = sl.compare ? feetY - dinoH - 24 * s : cardY(sl) - sl.cardH / 2 - 14 * s;
    ctx.beginPath(); ctx.ellipse(sl.x, plateY, plateW * 0.55, plateW * 0.36, 0, 0, Math.PI * 2);
    ctx.lineWidth = 9 * s; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5 * s; ctx.strokeStyle = HIGHLIGHT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sl.x - 16 * s, top - 22 * s - bob); ctx.lineTo(sl.x + 16 * s, top - 22 * s - bob); ctx.lineTo(sl.x, top - bob); ctx.closePath();
    ctx.fillStyle = HIGHLIGHT; ctx.fill(); ctx.lineWidth = 3 * s; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  function basket(ctx: CanvasRenderingContext2D): void {
    if (cmp.active) return;
    drawSprite(ctx, sprites, BASKET, basketX, basketY, basketSize);
    // A heap of fruit in the basket, always plenty.
    const fs = Math.round(basketSize * 0.3), my = basketMouthY();
    for (let k = 0; k < 4; k++) {
      const fx = basketX + (k - 1.5) * fs * 0.62, fy = my + (k % 2 ? -fs * 0.12 : fs * 0.06);
      drawSprite(ctx, sprites, fruitName((nextFruit + k) % FRUITS.length), fx, fy, fs);
    }
  }
  function renderFlights(ctx: CanvasRenderingContext2D): void {
    for (const f of flights) {
      if (!f.active) continue;
      const k = clamp01(f.t / f.dur), e = f.mode === DROP ? k * k : easeOutCubic(k);
      const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * f.arc;
      // Fruit landing in (or eaten from) a row of four or five takes that row's smaller size.
      const row = f.mode === LAND || f.mode === EAT ? rowScale(slots[f.slot]!) : 1;
      let sq = 1;
      if (f.mode === LAND && k > 0.85) sq = 1 + (k - 0.85) * 1.2;
      if (f.mode === EAT) { const sc = Math.max(4 / fruitSize, row * (1 - 0.7 * k)); drawSprite(ctx, sprites, fruitName(f.kind), x, y, fruitSize, 0, sc, sc); }
      else { const sc = f.mode === LAND ? lerp(1, row, e) : 1; drawSprite(ctx, sprites, fruitName(f.kind), x, y, fruitSize, f.mode === BOUNCE || f.mode === RETURN ? k * 4 : 0, sc * sq, sc * (2 - sq)); }
    }
  }
  /** The idle demonstration's fruit: a warm halo behind a slightly see-through fruit, so it reads as a hint, not a plate fruit. */
  function ghostFruit(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
    if (glowCanvas) {
      const g = glowSize;
      ctx.globalAlpha = a * (0.85 + Math.sin(time * 7) * 0.15); ctx.drawImage(glowCanvas, x - g / 2, y - g / 2, g, g);
    }
    ctx.globalAlpha = a * 0.8; drawSprite(ctx, sprites, fruitName(hand.kind), x, y, fruitSize);
    ctx.globalAlpha = 1;
  }
  function renderHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.mode) return;
    handTip();
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(110 * s), hw = hs * img.naturalWidth / img.naturalHeight;
    const feedHand = hand.mode === 1 || hand.mode === 2, t = carryT();
    let alpha = 1;
    if (hand.mode === 2 || hand.mode === 5) alpha = 0.85;
    if (feedHand && t > 2.0) alpha = 1 - clamp01((t - 2.0) / 0.5);
    if (hand.mode === 5) alpha *= 1 - clamp01((hand.t - (HINT_SECONDS - 0.4)) / 0.4);
    const carrying = feedHand && t >= 0.5 && t < 1.9;
    if (carrying) {
      const fx = pos.x - fruitSize * 0.3, fy = pos.y - fruitSize * 0.3;
      if (hand.mode === 2) ghostFruit(ctx, fx, fy, 1);
      else drawSprite(ctx, sprites, fruitName(hand.kind), fx, fy, fruitSize);
    }
    if (hand.mode === 2 && hand.released) ghostFruit(ctx, pos.x, pos.y, alpha);
    ctx.globalAlpha = alpha;
    const press = (feedHand && t >= 0.5 && t < 0.8) || handTapping() ? 0.9 : 1;
    // The art points up and left: put its fingertip on the target.
    drawSprite(ctx, sprites, HAND, pos.x + hw * 0.38, pos.y + hs * 0.42, hs, 0, press, press);
    ctx.globalAlpha = 1;
  }
  function renderPips(ctx: CanvasRenderingContext2D): void {
    const total = ordersTotal + compTotal, done = ordersDone + compDone, gap = pipSize * 1.15;
    // The row sits on the side of the blanket away from the basket.
    const cx = pipsTop ? W / 2 : basketX > W * 0.6 ? W * 0.4 : basketX < W * 0.4 ? W * 0.6 : W * 0.25;
    for (let i = 0; i < total; i++) {
      const x = cx + (i - (total - 1) / 2) * gap;
      ctx.globalAlpha = i < done ? 1 : 0.35;
      drawSprite(ctx, sprites, PLATE, x, pipY, pipSize);
    }
    ctx.globalAlpha = 1;
  }
  function renderPlay(ctx: CanvasRenderingContext2D): void {
    const n = activeSlots();
    for (let i = 0; i < n; i++) { const sl = slots[i]!; if (sl.state !== 'off') dino(ctx, sl, sl.x, false); }
    for (let i = 0; i < n; i++) { const sl = slots[i]!; if (sl.state !== 'off') plate(ctx, sl); }
    const focused = slots[focus];
    if (focused && focus < n && (cmp.active ? cmp.sub === 'ask' && cmp.focusShown : feeding(focused))) highlight(ctx, focused);
    for (let i = 0; i < n; i++) card(ctx, slots[i]!);
    basket(ctx);
    if (cmp.active && cmp.sub !== 'fill' && hatCanvas) {
      hatPos(); const w = hatCanvas.width / artRatio, h = hatCanvas.height / artRatio;
      ctx.drawImage(hatCanvas, pos.x - w / 2, pos.y - h / 2, w, h);
    }
    renderFlights(ctx);
    if (carry.active) drawSprite(ctx, sprites, fruitName(carry.kind), input.pointer.x, input.pointer.y, Math.round(fruitSize * 1.2));
    particles.render(ctx);
    renderHand(ctx);
    renderPips(ctx);
  }
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  const controlX = (i: number, choice: boolean): number => {
    const n = choice ? pending?.choices.length ?? 0 : 2;
    return W / 2 + (i - (n - 1) / 2) * (choice ? choiceSize + Math.max(24, choiceSize * 0.18) : controlsRadius * 3.2);
  };
  function gift(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, focused: boolean, scale = 1): void {
    if (focused) {
      ctx.beginPath(); ctx.ellipse(x, y, size * 0.55 + 8, size * 0.47 + 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
    }
    drawSprite(ctx, sprites, PLATE, x, y + size * 0.08, size, 0, scale, scale);
    drawSprite(ctx, sprites, stickerSpriteName(id), x, y - size * 0.04, Math.round(size * 0.78), 0, scale, scale);
  }
  function renderResult(ctx: CanvasRenderingContext2D): void {
    const starT = phase === 'celebration' ? phaseT - STAR_START : 99;
    drawStarRow(ctx, W / 2, starY, starR, stars, starT, phase === 'rest' ? 0 : time);
    if (phase === 'celebration') {
      const gap = Math.min(W / 3.4, 300 * u), saved = feetY;
      feetY = H * 0.74;
      for (let k = 0; k < 3; k++) { const sl = slots[k]!, kind = sl.kind; sl.kind = (dinoOffset + k) % 3; dino(ctx, sl, W / 2 + (k - 1) * gap, false); sl.kind = kind; }
      feetY = saved;
      particles.render(ctx);
      return;
    }
    if (phase === 'choice' && pending) {
      for (let i = 0; i < pending.choices.length; i++) gift(ctx, pending.choices[i]!, controlX(i, true), choiceY, choiceSize, menuSelected === i);
      return;
    }
    if (pending?.chosen) {
      const e = phase === 'sticker' ? easeOutBack(clamp01(phaseT / 0.65)) : 1, index = Math.max(0, pending.choices.indexOf(pending.chosen));
      gift(ctx, pending.chosen, lerp(controlX(index, true), W / 2, e), lerp(choiceY, restY, e), restSize, false, lerp(choiceSize / restSize, 1, Math.min(1, e)));
    } else {
      // Rewards off or the set complete: the three picnic friends, never a fabricated collectible.
      const saved = feetY; feetY = restY + restSize * 0.4;
      for (let k = 0; k < 3; k++) { const sl = slots[k]!, kind = sl.kind; sl.kind = (dinoOffset + k) % 3; dino(ctx, sl, W / 2 + (k - 1) * restSize * 0.7, true); sl.kind = kind; }
      feetY = saved;
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
    for (let i = 0; i < n; i++) {
      const dx = x - controlX(i, choice), dy = y - (choice ? choiceY : controlsY);
      if (choice ? Math.abs(dx) <= choiceSize / 2 && Math.abs(dy) <= choiceSize * 0.5 : Math.hypot(dx, dy) <= controlsRadius) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- input
  /** Comparison dinos hop (one dino if i names it, else both, a beat apart) with a soft pop. */
  function invite(i: number): void {
    for (let j = 0; j < 2; j++) if (i < 0 || i === j) { const sl = slots[j]!; if (sl.hopT >= 0.42 || sl.hopT < 0) sl.hopT = i < 0 ? -0.1 * j : 0; }
    play('pop', 'A', 3, 0.35);
  }
  function pointerDown(x: number, y: number): void {
    idleT = 0;
    if (hand.mode === 3) hand.mode = 0;
    const now = performance.now();
    if (cmp.active) {
      const i = slotAt(x, y);
      // Only a press that chooses counts as a motor attempt; any other press makes the dinos hop invitingly.
      if (cmp.sub === 'ask' && i >= 0 && i <= 1) { hits++; focus = i; chooseCompare(i, time - cmp.askAt >= 0.6); }
      else if (cmp.sub !== 'reveal' && !onCorner(x, y)) invite(i);
      return;
    }
    const i = slotAt(x, y);
    // Motor attempts: one deliberate placement counts once, whatever the input style. Picking a fruit up counts nothing;
    // where it is put down (or where a press sends one) counts one hit on a plate or one miss elsewhere. Putting it back
    // on the basket counts nothing.
    if (carry.active) {
      carry.active = false;
      if (i >= 0) { hits++; focus = i; feed(i, x, y, true, carry.kind); }
      else if (!onBasket(x, y)) { misses++; launch(RETURN, carry.kind, 0, 0, x, y, basketX, basketMouthY(), 0.4, 40 * s); play('whoosh', 'D', 0, 0.6); }
      return;
    }
    if (onBasket(x, y)) {
      carry.active = true; carry.sticky = false; carry.kind = nextFruit; carry.downAt = now; carry.downX = x; carry.downY = y;
      nextFruit = (nextFruit + 1 + Math.floor(random() * 2)) % FRUITS.length;
      play('pop', 'B', 2, 0.5);
      return;
    }
    if (i >= 0) {
      const sl = slots[i]!;
      // A bounce or double-click within a moment is the same press.
      if (now - sl.lastPress < PRESS_GAP_MS) return;
      sl.lastPress = now; hits++; focus = i;
      feed(i, basketX, basketMouthY(), true);
      return;
    }
    if (!onCorner(x, y)) misses++;
  }
  function pointerUp(x: number, y: number): void {
    if (!carry.active || carry.sticky) return;
    const quick = performance.now() - carry.downAt < 300 && Math.hypot(x - carry.downX, y - carry.downY) < 24;
    if (quick) { carry.sticky = true; return; } // A click on the basket: the fruit follows until the next press.
    carry.active = false;
    const i = slotAt(x, y);
    if (i >= 0) { hits++; focus = i; feed(i, x, y, true, carry.kind); }
    // Let go over the basket (a long press in place): the fruit just drops back in.
    else if (onBasket(x, y)) play('pop', 'B', 1, 0.35);
    else { misses++; launch(RETURN, carry.kind, 0, 0, x, y, basketX, basketMouthY(), 0.4, 40 * s); play('whoosh', 'D', 0, 0.6); }
  }
  function keyPlay(code: string): void {
    idleT = 0;
    if (hand.mode === 3) hand.mode = 0;
    const left = code === 'ArrowLeft' || code === 'ArrowUp', right = code === 'ArrowRight' || code === 'ArrowDown';
    if (cmp.active) {
      if (cmp.sub !== 'ask') { if (cmp.sub === 'fill') invite(-1); return; }
      if (left || right) { if (cmp.focusShown) focus = 1 - focus; cmp.focusShown = true; cmp.focusAt = time; return; }
      if (!cmp.focusShown) { cmp.focusShown = true; cmp.focusAt = time; focus = 0; return; }
      chooseCompare(focus, time - cmp.focusAt >= 0.5);
      return;
    }
    if (left || right) { moveFocus(left ? -1 : 1); return; }
    const now = performance.now();
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    ensureFocus();
    feed(focus, basketX, basketMouthY(), true);
  }

  const stats: DinoPicnicStats = {
    get phase() { return phase; }, get tier() { return tier; }, get stage() { return data.stage; }, get compareLevel() { return data.compareLevel; },
    get intro() { return intro; }, get ordersTotal() { return ordersTotal; }, get ordersDone() { return ordersDone; }, get happy() { return happy; },
    get comparisonsTotal() { return compTotal; }, get comparisonsDone() { return compDone; }, get hits() { return hits; }, get misses() { return misses; },
    get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; },
    get selected() { return menuSelected; }, get particles() { return particles.alive; },
    get flights() { let n = 0; for (const f of flights) if (f.active) n++; return n; }, get carrying() { return carry.active; }, get hand() { return hand.mode; },
    get comparing() { return cmp.active ? cmp.sub : ''; }, get bigger() { return cmp.bigger; },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    slots() {
      return slots.slice(0, activeSlots()).map((sl, i) => ({ x: sl.x, y: feetY - dinoH / 2, zone: [sl.x - zoneW / 2, zoneTop, sl.x + zoneW / 2, zoneBottom] as [number, number, number, number], plateX: sl.x, plateY, state: sl.state, target: sl.target, count: sl.count, sent: sl.sent, card: [sl.x - sl.cardW / 2, cardY(sl) - sl.cardH / 2, sl.x + sl.cardW / 2, cardY(sl) + sl.cardH / 2] as [number, number, number, number], focused: i === focus }));
    },
    basket() { return { x: basketX, y: basketY, r: basketR }; },
    controls() {
      const choice = phase === 'choice', n = choice ? pending?.choices.length ?? 0 : phase === 'rest' ? 2 : 0;
      return Array.from({ length: n }, (_, i) => ({ x: controlX(i, choice), y: choice ? choiceY : controlsY, radius: choice ? choiceSize / 2 : controlsRadius, id: choice ? pending!.choices[i]! : i === 0 ? 'again' : 'home' }));
    },
    corners() { return { home: [homeX, cornerY, cornerRadius], sound: [soundX, cornerY, cornerRadius] }; },
    baked() {
      const r = sprites.pixelRatio;
      return { ratio: artRatio, pixelRatio: r, backdrop: bgCanvas ? [bgX, bgY, bgCanvas.width / r, bgCanvas.height / r] : null, hatPx: hatCanvas?.width ?? 0, hatSize, glowPx: glowCanvas?.width ?? 0, glowSize, scale: s };
    },
    resetWork() { workHead = workCount = 0; },
  };

  return {
    stats,
    enter() {
      void loadDinoPicnicArt(services);
      preloadVoice(audio, services.base);
      data = services.save.gameData<PicnicData>(GAME_ID, defaultData());
      sanitizePicnicData(data, () => services.save.protect());
      data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; startMusic(audio, 'dino-picnic');
      if (data.pending) {
        pending = data.pending; stars = pending.stars; tier = pending.tier; dinoOffset = pending.dinoOffset; intro = false;
        layout(services.canvas.width, services.canvas.height);
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
        else enterRest();
      } else { layout(services.canvas.width, services.canvas.height); startRound(); }
      if (services.debug.enabled) (window as unknown as { __dinoPicnic?: DinoPicnicStats }).__dinoPicnic = stats;
    },
    pause() { stopMusic(audio); stopIdle(); carry.active = false; services.save.flush(); },
    resume() {
      // Back on top after the break nudge: keys pressed into it must not act here. The choice and rest screens start
      // over as on first appearance (nothing focused, input ignored for MENU_GUARD_MS); play gets its short guard.
      guard(phase === 'choice' || phase === 'rest' ? MENU_GUARD_MS : PLAY_GUARD_MS); cornerFocus = -1;
      startMusic(audio, 'dino-picnic');
    },
    // Any route away from rest (corner Home, the break nudge's Home) closes the finished round.
    exit() { stopMusic(audio); stopIdle(); closeFinishedRound(); services.save.flush(); },
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
      else { ctx.fillStyle = '#9fd47a'; ctx.fillRect(0, 0, W, H); }
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
        else if (playable() && cmp.active && cmp.sub === 'ask') { const i = slotAt(event.info.x, event.info.y); if (i >= 0 && i <= 1) { focus = i; cmp.focusShown = true; } }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { exitToHub(); return; }
        cornerFocus = -1;
      } else if (!playable()) {
        // During play every key plays, Escape, Tab and Enter included: there is no wrong button.
        // Keyboard routes to Home exist only after the round, once its input guard has passed.
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
        // The first key only shows where focus is; nothing is chosen by a stray press.
        if (menuSelected < 0) { menuSelected = 0; focusAt = now; return; }
        if (code.startsWith('Arrow')) { menuSelected = (menuSelected + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
      }
      if (phase === 'choice') chooseSticker(menuSelected); else leave(menuSelected === 0);
    },
  };
}
