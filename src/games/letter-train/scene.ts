/** Letter Train: carry letter blocks onto the train cars that show the same letter. */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxOptions } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, chunkyPanel, drawSprite, DISPLAY_FONT, OUTLINE, roundedRect } from '../../ui/draw';
import { confettiRain } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp, slamScale } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import {
  letterIndex, matches, nameLetters, planRound, stageDown, stageUp, toStage, WORDS,
  type Stage, type TrainPlan,
} from './content';
import { playVoiceClip } from './voice';
import { GAME_ID, LEARN_WINDOW, MAX_CARS, PASSENGERS, sanitizeLetterTrainData } from './save';

export { GAME_ID, PASSENGERS, sanitizeLetterTrainData };

export interface TierParams { block: number; cars: number; magnet: number }
export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { block: 150, cars: 2, magnet: 1.3 },
  { block: 132, cars: 3, magnet: 1.0 },
  { block: 116, cars: 4, magnet: 0.7 },
];
const TRAINS_PER_ROUND = 3, PARTICLES = 220;
/** Geometry in block widths. */
const CAR_W = 2.1, PITCH = 1.89, ENGINE_H = 1.45, FRONT_TOP = 0.135;
/** Blocks pop up and respond while the train is still pulling in; toot plus departure is about 1.6 s. */
const ARRIVE_SECONDS = 1.6, BLOCK_APPEAR = 0.15, BLOCK_STAGGER = 0.08, TOOT_SECONDS = 0.5, DEPART_SECONDS = 1.1, STAR_FLIGHT = 0.8;
// Choice and rest ignore input this long, so steady pressing from the round cannot choose for the child; after the
// first key shows focus, a key that is not an arrow acts only once that focus has shown for FOCUS_HOLD_MS.
const CELEBRATION_SECONDS = 4, CELEBRATION_LOCK = 1.5, CHOICE_LOCK = 1.2, REST_LOCK = 1.2, FOCUS_HOLD_MS = 250;
const IDLE_FIRST = 6, IDLE_REPEAT = 8, HINT_SECONDS = 2.4, DEMO_SECONDS = 3.2;
const CLICK_SLOP = 12;
/** A key pressed sooner than this after the previous key is mashing: it still plays but is never learning evidence. */
const KEY_CALM = 0.6;
const ART = 'letter-train/';
const WAGONS = ['wagon-red', 'wagon-yellow', 'wagon-green', 'wagon-blue'] as const;
const BLOCKS = ['block-red', 'block-yellow', 'block-green', 'block-blue'] as const;
const BLOCK_INK = ['#b3261e', '#9a6a00', '#2e7d32', '#1f5fa8'] as const;
const BUTTON_PLAY = 'buttons/play-arrow.png', BUTTON_HOME = 'buttons/home.png';
const sprite = (path: string) => `${GAME_ID}:${path}`;
const passengerSticker = (i: number) => `${GAME_ID}-${PASSENGERS[i] ?? 'bunny'}`;
/** Passenger art sits in a square with transparent padding so it fits the sticker book's slot; draw sizes are multiplied by this to keep the animal's size. */
const PASSENGER_PAD = 482 / 360;
// Sprite names built once, so drawing never builds strings.
const PASSENGER_IDS: readonly string[] = PASSENGERS.map((_, i) => passengerSticker(i));
const PASSENGER_SPRITES: readonly string[] = PASSENGER_IDS.map(id => stickerSpriteName(id));
const WAGON_SPRITES: readonly string[] = WAGONS.map(w => sprite(w));
const BLOCK_SPRITES: readonly string[] = BLOCKS.map(b => sprite(b));
const WORD_SPRITES: Readonly<Record<string, string>> = Object.fromEntries(WORDS.map(w => [w, sprite(`words/${w}`)]));
const SPR_TOWN = sprite('town'), SPR_ENGINE = sprite('engine'), SPR_STAR = sprite('star'), SPR_HAND = sprite('hand');
const SPR_PLAY = sprite('play'), SPR_HOME = sprite('home');
const CHIP_HUES = [8, 45, 120, 210] as const;
const passengerOf = (id: string) => Math.max(0, PASSENGER_IDS.indexOf(id));
const passengerSprite = (i: number) => PASSENGER_SPRITES[i] ?? PASSENGER_SPRITES[0]!;

type Phase = 'arrive' | 'play' | 'toot' | 'depart' | 'celebration' | 'choice' | 'sticker' | 'rest';
type BlockState = 'hidden' | 'idle' | 'held' | 'selected' | 'return' | 'fly' | 'placed';
type Source = 'pointer' | 'typed' | 'key' | 'demo';
interface Car {
  letter: string; wagon: number; passenger: number; filled: boolean; block: number;
  hop: number; wiggle: number; plate: number; slot: HTMLCanvasElement | undefined; plateCanvas: HTMLCanvasElement | undefined;
  /** Device pixel ratio the slot and plate canvases were baked at. */
  slotDpr: number; plateDpr: number;
}
interface Block {
  letter: string; color: number; state: BlockState; x: number; y: number; homeX: number; homeY: number;
  fromX: number; fromY: number; t: number; car: number; appear: number; squash: number; canvas: HTMLCanvasElement | undefined; canvasDpr: number;
}
interface Pending {
  /** Names this round across tabs, as Bubble Bay's does; rounds stored by older builds have none. */
  id?: string;
  stars: number; choices: string[]; chosen: string; rewardEnabled: boolean; restEntered: boolean; passengers: number[]; tier: Tier;
}
interface GameData extends Record<string, unknown> {
  tier: number; qualifyingRounds: number; rounds: number; stage: number; learn: number[]; recentWords: string[];
  pending: Pending | null;
}
export interface LetterTrainOptions { stage?: Stage }
export interface LetterTrainStats {
  readonly phase: Phase; readonly tier: Tier; readonly stage: Stage; readonly train: number; readonly trains: number;
  readonly starsEarned: number; readonly learnWindow: readonly number[]; readonly motorHits: number; readonly motorMisses: number;
  readonly hits: number; readonly misses: number; readonly demo: boolean; readonly hint: boolean; readonly blockSize: number;
  readonly choiceIds: readonly string[]; readonly selected: number; readonly stickerId: string; readonly particles: number;
  readonly workMean: number; readonly workMax: number; readonly kbBlock: number; readonly kbCar: number; readonly hintBlock: number; readonly hintCar: number;
  blocks(): { letter: string; x: number; y: number; state: BlockState; size: number }[];
  /** `plate`: the car shows its case-pair plate. */
  cars(): { letter: string; x: number; y: number; filled: boolean; open: boolean; size: number; plate: boolean }[];
  controls(): { x: number; y: number; w: number; h: number; id: string }[];
  /** Pixel ratios the cached art was built at, the backdrop's drawn rectangle and the corner buttons. */
  view(): {
    pixelRatio: number; artRatio: number; glyphDpr: number; dimStarDpr: number; blockDpr: number[]; slotDpr: number[];
    backdrop: { x: number; y: number; w: number; h: number } | null; corners: { x: number; y: number; w: number; h: number; id: string }[];
  };
  resetWork(): void;
}
export interface LetterTrainScene extends Scene { readonly stats: LetterTrainStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);

function artList(): { name: string; path: string }[] {
  const paths = ['town.webp', 'engine.webp', 'star.webp', 'hand.webp', ...WAGONS.map(w => `${w}.webp`), ...BLOCKS.map(b => `${b}.webp`),
    ...WORDS.map(w => `words/${w}.webp`)];
  return [...paths.map(p => ({ name: sprite(p.replace('.webp', '')), path: ART + p })),
    { name: SPR_PLAY, path: BUTTON_PLAY }, { name: SPR_HOME, path: BUTTON_HOME },
    ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path }))];
}
export async function loadLetterTrainArt(services: AppServices): Promise<string[]> {
  const missing: string[] = [];
  // Decode up front so the first frame that draws an image does not pay for it.
  await Promise.all(artList().map(({ name, path }) => services.sprites.load(name, services.art(path)).then(img => img.decode()).catch(() => { missing.push(path); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}

/** Bake a letter glyph centred in a square canvas, never during a frame. */
function bakeLetter(ctx: CanvasRenderingContext2D, letter: string, cx: number, cy: number, box: number, color: string): void {
  let size = box * 1.15;
  ctx.font = `700 ${size}px ${DISPLAY_FONT}`;
  let m = ctx.measureText(letter);
  const tall = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, wide = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const fit = Math.min(1, box / Math.max(1, tall), box / Math.max(1, wide));
  if (fit < 1) { size *= fit; ctx.font = `700 ${size}px ${DISPLAY_FONT}`; m = ctx.measureText(letter); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const x = cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
  const y = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.fillStyle = color; ctx.fillText(letter, x, y);
  ctx.lineWidth = Math.max(1, size * 0.035); ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.strokeText(letter, x, y);
}

export function createLetterTrainScene(services: AppServices, options: LetterTrainOptions = {}): LetterTrainScene {
  const { sprites, audio, input } = services;
  const random = () => services.random();
  const particles = createParticleSystem(PARTICLES);
  const soundButton = createSoundButton(services);
  const cars: Car[] = Array.from({ length: MAX_CARS }, () => ({ letter: '', wagon: 0, passenger: 0, filled: false, block: -1, hop: 9, wiggle: 9, plate: -1, slot: undefined, plateCanvas: undefined, slotDpr: 0, plateDpr: 0 }));
  const blocks: Block[] = Array.from({ length: MAX_CARS }, () => ({ letter: '', color: 0, state: 'hidden' as BlockState, x: 0, y: 0, homeX: 0, homeY: 0, fromX: 0, fromY: 0, t: 0, car: -1, appear: 0, squash: 9, canvas: undefined, canvasDpr: 0 }));
  // Round-end art (celebration riders, sticker choice, rest) scaled ahead during the last train, one image per update.
  const PREP_MAX = 40, prepNames: string[] = new Array<string>(PREP_MAX).fill(''), prepSizes = new Float32Array(PREP_MAX);
  let prepCount = 0, prepHead = 0;
  const work = new Float32Array(240);
  const keyOpt: SfxOptions = { index: 0, volume: 0.8 }, tokOpt: SfxOptions = { variant: 'B' }, cheerOpt: SfxOptions = { index: 0, volume: 0.8 };
  const missOpt: SfxOptions = { variant: 'D', volume: 0.8 }, chuffOpt: SfxOptions = { variant: 'C', volume: 0.3 }, tootOpt: SfxOptions = { variant: 'B' };
  const starOpt: SfxOptions = { index: 0 }, hoverOpt: SfxOptions = { volume: 0.6 };
  let data: GameData;
  // B: platform block size (never under 96). C: the train's unit (car slot, wagon and engine scale); C equals B unless
  // the row of cars would not fit the width at B (a word train on a phone-width screen).
  let W = 1366, H = 768, u = 1, B = 150, C = 150, bgX = 0, bgY = 0, bgS = 1, trackY = 430, platformTop = 460, platformY = 620;
  let bgCanvas: HTMLCanvasElement | undefined, dimStar: HTMLCanvasElement | undefined, dimStarSize = 0, dimStarDpr = 0;
  let phase: Phase = 'arrive', tier: Tier = 0, stage: Stage = 0, sceneT = 0, time = 0, phaseT = 0;
  let plans: TrainPlan[] = [], plan: TrainPlan | undefined, trainIndex = 0, nCars = 0, trainOff = 0, parkX = 0, trainL = 0;
  let starsEarned = 0, starFlight = -1, chuffT = 0, tootSquash = 9, departFrom = 0;
  /** `placements`: blocks the child (not the demonstration) put on cars this round, by any input. */
  let hits = 0, misses = 0, motorHits = 0, motorMisses = 0, placements = 0;
  let held = -1, selectedBlock = -1, downX = 0, downY = 0, grabX = 0, grabY = 0, moved = false;
  /** Keyboard highlights show only after keyboard input; pointer input hides them again. */
  let kbActive = false;
  /**
   * Wall-clock time (performance.now(), ms) of the last key press, so slow frames that clamp scene time cannot
   * make calm presses look like mashing; whether the arrows moved a highlight since the last placement (a pair the child
   * chose, not the default); and whether the keyboard attempt keyPress is making may count as learning evidence.
   */
  let lastKeyAt = -Infinity, kbChose = false, keyEvidence = false;
  /** Device pixel ratio the dim star and glyph canvases were baked for. */
  let glyphDpr = 1;
  /** Pixel ratio the backdrop and the queued round-end art were scaled at; the canvas lowers or raises it on slow or fast frames. */
  let artRatio = 0;
  let kbBlock = -1, kbCar = -1, idleT = 0, nextHintAt = IDLE_FIRST, hintT = -1, hintBlock = -1, hintCar = -1;
  let demoT = -1, demoBlock = -1, demoCar = -1, demoPlaced = false;
  let pending: Pending | null = null, menuSelected = -1, inputAfter = 0, focusAt = 0;
  let cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1, starRowY = 60, starSize = 64;
  let choiceW = 360, choiceY = 400, restY = 380, restW = 360, controlsY = 680, controlsR = 62;
  let workHead = 0, workCount = 0, updateMs = 0;
  let celebrationHops = 0, warmed = false, artLoaded = false;
  /** Index of the queued image prepared this update; render draws it once under the backdrop so its upload is done before it shows. */
  let prepShow = -1;
  /** A choice or rest restored on entry draws its riders and buttons only once their art is prepared (see planRestoredArt). */
  let holdResult = false;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0;
  const roundPassengers: number[] = [];

  const playable = () => phase === 'arrive' || phase === 'play' || phase === 'toot' || phase === 'depart';
  const guard = (seconds: number) => { inputAfter = performance.now() + seconds * 1000; };
  const cw = () => C * CAR_W;
  const wagonH = () => cw() * 211 / 480;
  const engineH = () => C * ENGINE_H;
  const engineW = () => engineH() * 640 / 356;
  const carX = (i: number) => trainOff + cw() / 2 + i * PITCH * C;
  const engineX = () => carX(nCars - 1) + cw() / 2 - 0.08 * C + engineW() / 2;
  const wagonTop = () => trackY - wagonH();
  const slotX = (i: number) => carX(i) - 0.19 * cw();
  const slotY = () => wagonTop() + 0.33 * wagonH() - C / 2;
  const isOpen = (i: number) => {
    if (i < 0 || i >= nCars || cars[i]!.filled) return false;
    if (!plan?.ordered) return true;
    for (let j = 0; j < i; j++) if (!cars[j]!.filled) return false;
    return true;
  };
  const nextOpen = () => { for (let i = 0; i < nCars; i++) if (isOpen(i)) return i; return -1; };
  const onPlatform = (b: Block) => b.state === 'idle' || b.state === 'selected' || b.state === 'return';

  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H, reratio = sprites.pixelRatio !== artRatio;
    W = width; H = height; glyphDpr = services.canvas.dpr; artRatio = sprites.pixelRatio;
    u = Math.min(1.4, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    bgS = Math.max(W / 1536, H / 1024); bgX = (W - 1536 * bgS) / 2; bgY = (H - 1024 * bgS) / 2;
    // The backdrop is scaled for both the view size and the pixel ratio; a new ratio alone (same CSS size) rebuilds it too.
    if (resized || reratio || !bgCanvas) { sprites.clearScaled(SPR_TOWN); bgCanvas = undefined; }
    // A new ratio empties the sprite cache, so the queued round-end art is scaled again, one image per update.
    if (reratio) prepHead = 0;
    trackY = bgY + 0.548 * 1024 * bgS; platformTop = bgY + 0.585 * 1024 * bgS;
    // Corner buttons take Bubble Bay's place and size at every view size, so the break nudge's sound button covers ours.
    const cu = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * cu, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    starSize = Math.round(Math.max(44, 64 * u)); starRowY = cornerY;
    // A rider (wagon plus passenger) reaches 0.62 widths above its centre and 0.23 below.
    const top = starRowY + starSize / 2 + 14;
    const offerWidth = (t: number) => Math.max(150, Math.min(440 * u + 60, (W - 72) / 2, (H - 24 - t) / 0.92));
    choiceW = offerWidth(top);
    // The two offers' tap areas (12 px past each wagon, gap between) reach this far from the middle. Where that is
    // beside a corner button (narrow screens, large uiScale), the offers start below the corner buttons instead.
    let choiceTop = top;
    if (W / 2 - (choiceW + Math.max(24, choiceW * 0.12) / 2 + 12) < homeX + cornerRadius + 8) {
      choiceTop = Math.max(top, cornerY + cornerRadius + 8); choiceW = offerWidth(choiceTop);
    }
    choiceY = choiceTop + choiceW * 0.66;
    controlsR = Math.max(52, Math.min(66 * u, W / 6));
    controlsY = H - controlsR - 22;
    restW = Math.max(150, Math.min(choiceW * 1.05, W * 0.6, (controlsY - controlsR - 14 - top) / 0.88));
    restY = top + restW * 0.64;
    if (plan) fitTrain();
  }
  /** Block size and train position for the current plan at the current view size. */
  function fitTrain(): void {
    const base = Math.max(96, TIERS[tier].block * u);
    // Car row width and whole-train length, in train units.
    const units = (Math.max(1, nCars) - 1) * PITCH + CAR_W, length = units - 0.08 + ENGINE_H * 640 / 356;
    const room = (W - 32) / (Math.max(1, nCars) * PITCH + 0.3 + ENGINE_H * 640 / 356);
    const below = (H - platformTop - 16) / 1.2, above = (trackY - starRowY - starSize / 2 - 12) / 1.65;
    let next = Math.round(Math.max(96, Math.min(base, room, below, above)));
    // The cars shrink below the block size only when their row would not fit the width at it; the blocks on the
    // platform keep at least 96 px and every car's drop zone (pullRadius) stays at least 0.7 block widths around its slot.
    let car = Math.round(Math.min(next, (W - 24) / units));
    // A large uiScale makes the corner buttons reach below the star row. Cars whose tap area (carAt) would reach up
    // beside a corner button keep between the two buttons: moved along, or narrowed while each stays 96 px wide;
    // failing that, the whole train gets smaller so its cars sit below the buttons.
    const rise = 0.67 * CAR_W * 211 / 480 + 1.15, cornerBottom = cornerY + cornerRadius + 8;
    const left = homeX + cornerRadius + 8, right = soundX - cornerRadius - 8;
    const parkFor = (c: number) => (c * length > W - 16 ? 8 : (W - c * length) / 2);
    let minPark = 0, maxPark = Infinity;
    if (trackY - car * rise < cornerBottom && (parkFor(car) < left || parkFor(car) + units * car > right)) {
      const fits = Math.floor(Math.min(car, (right - left) / units));
      if (fits >= 96) { car = fits; minPark = left; maxPark = right - units * car; }
      else {
        next = Math.round(Math.max(96, Math.min(base, room, below, (trackY - cornerBottom) / rise)));
        car = Math.round(Math.min(next, (W - 24) / units));
      }
    }
    if (next !== B) { B = next; for (const b of blocks) b.canvas = undefined; }
    if (car !== C) { C = car; for (const c of cars) { c.slot = undefined; c.plateCanvas = undefined; } }
    trainL = engineX() - trainOff + engineW() / 2;
    const oldPark = parkX;
    // Narrow screens: keep every car in view and let the engine run off the right edge (the word picture stays in view).
    parkX = Math.min(maxPark, Math.max(minPark, parkFor(C)));
    if (phase === 'play' || phase === 'toot') trainOff = parkX; else if (phase === 'arrive') trainOff += parkX - oldPark;
    platformY = Math.min(H - B / 2 - 10, Math.max(platformTop + B * 0.62, platformTop + (H - platformTop) * 0.5));
    const n = nCars, spacing = Math.min(B * 1.4, (W - 24) / Math.max(1, n)), edge = B * 0.54;
    for (let i = 0; i < n; i++) {
      const b = blocks[i]!; b.homeX = W / 2 + (i - (n - 1) / 2) * spacing; b.homeY = platformY;
      // After a resize every block that is not flying stays in view: a selected block moves to its new home (it still
      // draws lifted there), a held block is kept inside the view until the pointer moves it, and a returning block
      // starts its arc from inside the view (its arc rises 0.35 block widths).
      if (b.state === 'idle' || b.state === 'hidden' || b.state === 'selected') { b.x = b.homeX; b.y = b.homeY; }
      else if (b.state === 'held') { b.x = Math.min(W - edge, Math.max(edge, b.x)); b.y = Math.min(H - edge, Math.max(edge, b.y)); }
      else if (b.state === 'return') { b.fromX = Math.min(W - edge, Math.max(edge, b.fromX)); b.fromY = Math.min(H - edge, Math.max(edge + B * 0.35, b.fromY)); }
    }
  }
  /** Letters one train holds with full-size cars and the engine in view, never more than MAX_CARS. */
  function perTrainLetters(): number {
    return Math.min(MAX_CARS, Math.max(1, Math.floor(((W - 32) / 96 - 0.3 - ENGINE_H * 640 / 356) / PITCH)));
  }
  /** Blocks the platform holds side by side at 96 px (a name train may shrink its cars to carry this many letters). */
  function nameCap(): number {
    return Math.min(MAX_CARS, Math.max(1, Math.floor((W - 24) / 96)));
  }
  /** Spread the three stars over the round's trains: with more than three trains (a long name on a narrow screen) some trains earn none. */
  function earnsStar(train: number): boolean {
    const n = Math.max(TRAINS_PER_ROUND, plans.length);
    return Math.ceil((train + 1) * TRAINS_PER_ROUND / n) > Math.ceil(train * TRAINS_PER_ROUND / n);
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    if (!sprites.get(SPR_TOWN)) return;
    bgCanvas = sprites.scaled(SPR_TOWN, bgS);
  }
  function ensureDimStar(): void {
    if (dimStar && dimStarSize === starSize && dimStarDpr === glyphDpr) return;
    const img = sprites.get(SPR_STAR); if (!img) return;
    const px = Math.max(1, Math.round(starSize * glyphDpr));
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d'); if (!g) return;
    const s = px / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(92, 62, 34, 0.72)'; g.fillRect(0, 0, px, px);
    dimStar = c; dimStarSize = starSize; dimStarDpr = glyphDpr;
  }
  /** A square canvas `size` CSS px wide at device resolution; callers draw in device pixels and blit it back at `size`. */
  function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | undefined {
    const c = document.createElement('canvas'); c.width = c.height = Math.max(1, Math.round(size * glyphDpr));
    const g = c.getContext('2d'); return g ? [c, g] : undefined;
  }
  function bakeBlock(b: Block): HTMLCanvasElement | undefined {
    const img = sprites.get(BLOCK_SPRITES[b.color]!), made = makeCanvas(B);
    if (!img || !made) return b.canvas;
    const [c, g] = made; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    bakeLetter(g, b.letter, c.width / 2, c.height / 2, c.width * 0.56, BLOCK_INK[b.color]!);
    b.canvas = c; b.canvasDpr = glyphDpr; return c;
  }
  function bakeSlot(car: Car): HTMLCanvasElement | undefined {
    const made = makeCanvas(C); if (!made) return car.slot;
    const [c, g] = made, s = c.width, line = Math.max(3 * glyphDpr, s * 0.035);
    roundedRect(g, line, line, s - line * 2, s - line * 2, s * 0.14); g.fillStyle = '#f7ead0'; g.fill();
    g.setLineDash([s * 0.09, s * 0.06]); g.lineWidth = line; g.strokeStyle = '#8a6440'; g.stroke(); g.setLineDash([]);
    bakeLetter(g, car.letter, s / 2, s / 2, s * 0.58, '#6d4a2b');
    car.slot = c; car.slotDpr = glyphDpr; return c;
  }
  function bakePlate(car: Car): HTMLCanvasElement | undefined {
    const made = makeCanvas(C * 0.42); if (!made) return car.plateCanvas;
    const [c, g] = made, s = c.width, k = glyphDpr;
    roundedRect(g, 2 * k, 2 * k, s - 4 * k, s - 4 * k, s * 0.2); g.fillStyle = '#fff6df'; g.fill(); g.lineWidth = 3 * k; g.strokeStyle = '#5a3b22'; g.stroke();
    bakeLetter(g, car.letter, s / 2, s / 2, s * 0.62, '#3d2a1a');
    car.plateCanvas = c; car.plateDpr = glyphDpr; return c;
  }
  // Drawing uses whatever canvas exists, even one baked for an older pixel ratio; bakeNext replaces stale ones a frame at a time.
  const blockCanvas = (b: Block) => b.canvas ?? bakeBlock(b);
  const slotCanvas = (car: Car) => car.slot ?? bakeSlot(car);
  const plateCanvas = (car: Car) => car.plateCanvas ?? bakePlate(car);

  /** Bake at most one missing or stale glyph canvas per update, so a new train or a pixel-ratio change never bakes them all in one frame. */
  function bakeNext(): boolean {
    for (let i = 0; i < nCars; i++) { const c = cars[i]!; if (!c.filled && (!c.slot || c.slotDpr !== glyphDpr)) { bakeSlot(c); return true; } }
    for (let i = 0; i < nCars; i++) { const b = blocks[i]!; if (!b.canvas || b.canvasDpr !== glyphDpr) { bakeBlock(b); return true; } }
    for (let i = 0; i < nCars; i++) { const c = cars[i]!; if (c.plateCanvas && c.plateDpr !== glyphDpr) { bakePlate(c); return true; } }
    return false;
  }
  /** Scale one sprite to the size drawSprite will ask for (`size` is its longest side in CSS px). */
  function prescale(name: string, size: number): boolean {
    const img = sprites.get(name); if (img) sprites.scaled(name, Math.round(size) / Math.max(img.naturalWidth, img.naturalHeight));
    return !!img;
  }
  /** Scale the art this view needs once the files are decoded, outside the frame loop. */
  function warm(): void {
    warmed = true; ensureBackground(); ensureDimStar();
    prescale(SPR_ENGINE, engineW()); prescale(SPR_STAR, starSize); prescale(SPR_HOME, Math.round(cornerRadius * 1.3));
    for (const w of WAGON_SPRITES) prescale(w, Math.round(cw()));
    for (const p of PASSENGER_SPRITES) prescale(p, Math.round(C * 0.98 * PASSENGER_PAD));
  }
  function queuePrep(name: string, size: number): void {
    if (prepCount >= PREP_MAX) return;
    prepNames[prepCount] = name; prepSizes[prepCount] = Math.round(size); prepCount++;
  }
  /** Scale one queued image per update, waiting for art that is still loading; render then draws it once, hidden. */
  function prepNext(): void {
    if (prepHead >= prepCount) return;
    const made = prescale(prepNames[prepHead]!, prepSizes[prepHead]!);
    if (!made && !artLoaded) return;
    if (made) prepShow = prepHead;
    prepHead++;
  }
  /**
   * A choice or rest restored on entry (after a reload or a return visit) never had the last train to prepare its art:
   * queue the riders and buttons it draws and hold them back until each is scaled and uploaded, one per frame, under
   * the enter fade, so no single frame scales them all.
   */
  function planRestoredArt(): void {
    prepCount = prepHead = 0; prepShow = -1;
    const p = pending; if (!p) return;
    const add = (passenger: number, wagon: number, width: number): void => {
      queuePrep(WAGON_SPRITES[wagon % WAGONS.length]!, width);
      queuePrep(passengerSprite(passenger), Math.round(Math.round(width) * 0.62 * PASSENGER_PAD));
    };
    if (phase === 'choice') {
      for (let i = 0; i < p.choices.length; i++) add(passengerOf(p.choices[i]!), i + 1, choiceW);
      for (let i = 0; i < p.choices.length; i++) add(passengerOf(p.choices[i]!), i + 1, restW);
    } else if (p.chosen) add(passengerOf(p.chosen), Math.max(0, p.choices.indexOf(p.chosen)) + 1, restW);
    else add(p.passengers[0] ?? 0, 2, restW);
    queuePrep(SPR_PLAY, Math.round(controlsR * 1.3)); queuePrep(SPR_HOME, Math.round(controlsR * 1.3));
    holdResult = true;
  }
  /**
   * Queue every image the celebration, sticker choice and rest will draw, at the sizes they will use,
   * so none of them is scaled on its first frame. Runs when the last train of the round starts.
   */
  function planRoundEndArt(): void {
    prepCount = prepHead = 0; prepShow = -1;
    const riders: number[] = roundPassengers.slice();
    for (let i = 0; i < nCars; i++) if (!riders.includes(cars[i]!.passenger)) riders.push(cars[i]!.passenger);
    const n = Math.min(MAX_CARS, riders.length), size = Math.round(Math.min(B * 1.1, (W - 60) / Math.max(1, n) * 0.8));
    for (let i = 0; i < n; i++) queuePrep(passengerSprite(riders[i]!), Math.round(size * PASSENGER_PAD));
    const owned = rewards(services).stickers;
    const offered = PASSENGER_IDS.some(id => !owned.includes(id)) && services.config.rewardsEnabled;
    for (let w = 1; w <= 2; w++) { queuePrep(WAGON_SPRITES[w]!, Math.round(choiceW)); queuePrep(WAGON_SPRITES[w]!, Math.round(restW)); }
    for (let i = 0; i < PASSENGERS.length; i++) {
      const fresh = !owned.includes(PASSENGER_IDS[i]!);
      if (offered ? fresh : riders.includes(i)) {
        queuePrep(PASSENGER_SPRITES[i]!, Math.round(Math.round(choiceW) * 0.62 * PASSENGER_PAD));
        queuePrep(PASSENGER_SPRITES[i]!, Math.round(Math.round(restW) * 0.62 * PASSENGER_PAD));
      }
    }
    queuePrep(SPR_PLAY, Math.round(controlsR * 1.3)); queuePrep(SPR_HOME, Math.round(controlsR * 1.3));
  }

  // ---------------------------------------------------------------- round flow
  function startRound(): void {
    pending = null; data.pending = null;
    tier = services.debug.tier ?? toTier(data.tier);
    stage = options.stage ?? toStage(data.stage);
    hits = misses = motorHits = motorMisses = placements = 0; starsEarned = 0; starFlight = -1; roundPassengers.length = 0;
    const name = services.profile()?.unnamed ? '' : services.profile()?.name ?? '';
    plans = planRound(stage, TIERS[tier].cars, perTrainLetters(), nameCap(), name, random, data.recentWords);
    for (const p of plans) if (p.word) { data.recentWords = [...data.recentWords.filter(w => w !== p.word), p.word].slice(-4); }
    trainIndex = 0; particles.clear(); startTrain(); services.save.flush();
    // The round-end fanfare is rendered ahead once per session, as in Bubble Bay, so the frame the round ends does not
    // build its notes. Its one long step runs here, before the round's first frame, while the screen is still (under
    // the enter fade, or on the rest screen after Again); the short note steps follow in idle periods (prepareIdle).
    if (!fanfareStarted && audio.context) { fanfareStarted = true; if (prepareSfxStep(audio, 'fanfare')) fanfareAsked = true; }
  }
  /** One fanfare note step at a time while the idle period still has 4 ms left. */
  function prepareIdle(deadline: IdleDeadline): void {
    idleHandle = 0;
    while (!fanfareAsked && deadline.timeRemaining() >= 4) if (prepareSfxStep(audio, 'fanfare')) fanfareAsked = true;
  }
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; }
  function startTrain(): void {
    plan = plans[trainIndex];
    if (!plan) return;
    // Stages 0 to 2 keep at least two cars wherever the platform holds two blocks at 96 px: a one-car train leaves no
    // choice (choiceLeft), so a narrow screen would never record learning. Such a train runs its engine off the right
    // edge and shrinks its cars as a word train does (fitTrain).
    const letterCars = Math.max(Math.min(2, nameCap()), Math.min(TIERS[tier].cars, perTrainLetters()));
    const stageCars = plan.stage <= 2 ? Math.min(plan.cars.length, letterCars) : plan.cars.length;
    nCars = Math.min(MAX_CARS, stageCars);
    const passengers = [0, 1, 2, 3, 4, 5].sort(() => random() - 0.5);
    const wagonStart = Math.floor(random() * WAGONS.length);
    for (let i = 0; i < MAX_CARS; i++) {
      const c = cars[i]!;
      Object.assign(c, { letter: plan.cars[i] ?? '', wagon: (wagonStart + i) % WAGONS.length, passenger: passengers[i % 6]!, filled: false, block: -1, hop: 9, wiggle: 9, plate: -1, slot: undefined, plateCanvas: undefined, slotDpr: 0, plateDpr: 0 });
    }
    const order = Array.from({ length: nCars }, (_, i) => i);
    for (let k = 0; k < 6; k++) { order.sort(() => random() - 0.5); if (nCars < 2 || order.some((v, i) => v !== i)) break; }
    for (let i = 0; i < MAX_CARS; i++) {
      const b = blocks[i]!;
      Object.assign(b, { letter: i < nCars ? plan.blocks[order[i]!]! : '', color: Math.floor(random() * BLOCKS.length), state: 'hidden', car: -1, t: 0, appear: BLOCK_APPEAR + i * BLOCK_STAGGER, squash: 9, canvas: undefined, canvasDpr: 0 });
    }
    held = selectedBlock = -1; kbBlock = kbCar = -1; kbChose = false; hintT = -1; demoT = -1;
    phase = 'arrive'; phaseT = 0; chuffT = 0;
    fitTrain(); trainOff = -trainL - 60;
    if (trainIndex === plans.length - 1) planRoundEndArt();
    playSfx(audio, 'whoosh');
  }
  function beginPlay(): void {
    phase = 'play'; phaseT = 0; trainOff = parkX; idleT = 0; nextHintAt = IDLE_FIRST;
    for (let i = 0; i < nCars; i++) { const b = blocks[i]!; if (b.state === 'hidden') { b.state = 'idle'; b.x = b.homeX; b.y = b.homeY; } }
    ensureKb();
    if (allFilled()) { toot(); return; }
    // The demonstration runs on the very first train, unless the child already started on their own while it pulled in
    // (is dragging a block or has placed one). A block only selected (clicked) during the arrival does not stop it.
    let touched = held >= 0;
    for (let i = 0; i < nCars; i++) if (cars[i]!.filled) touched = true;
    if (touched || data.rounds !== 0 || trainIndex !== 0) return;
    if (!services.debug.enabled || new URLSearchParams(location.search).has('demo')) startDemo();
  }
  function startDemo(): void {
    const car = nextOpen(); if (car < 0) return;
    demoCar = car; demoBlock = blocks.findIndex((b, i) => i < nCars && onPlatform(b) && matches(b.letter, cars[car]!.letter));
    if (demoBlock < 0) return;
    demoT = 0; demoPlaced = false;
  }
  function endDemo(): void {
    if (demoT < 0) return;
    const b = blocks[demoBlock];
    if (b && !demoPlaced && b.state === 'held') sendHome(b);
    demoT = -1; held = -1;
  }
  function allFilled(): boolean { for (let i = 0; i < nCars; i++) if (!cars[i]!.filled) return false; return true; }
  function toot(): void {
    phase = 'toot'; phaseT = 0; tootSquash = 0; endDemo(); hintT = -1; held = selectedBlock = -1;
    playSfx(audio, 'go', tootOpt); puff(6);
  }
  function depart(): void {
    departFrom = trainOff; phase = 'depart'; phaseT = 0; chuffT = 0; starFlight = earnsStar(trainIndex) ? 0 : -1; playSfx(audio, 'whoosh');
  }
  function trainGone(): void {
    for (let i = 0; i < nCars; i++) if (!roundPassengers.includes(cars[i]!.passenger)) roundPassengers.push(cars[i]!.passenger);
    if (starFlight >= 0) starsEarned = Math.min(TRAINS_PER_ROUND, starsEarned + 1);
    starFlight = -1;
    trainIndex++;
    if (trainIndex < plans.length) startTrain(); else finishRound();
  }
  function chooseOffers(): string[] {
    if (!services.config.rewardsEnabled) return [];
    const owned = rewards(services).stickers;
    const fresh = STICKERS.filter(s => s.game === GAME_ID && !owned.includes(s.id)).map(s => s.id);
    if (fresh.length <= 1) return fresh;
    const first = fresh.splice(Math.floor(random() * fresh.length), 1)[0]!;
    return [first, fresh[Math.floor(random() * fresh.length)]!];
  }
  function adjustLevels(): void {
    // Motor tier: control only. Learning stage: letters only. Both change between rounds.
    if (services.debug.tier === undefined) {
      const n = motorHits + motorMisses, rate = n ? motorHits / n : 1;
      // A round offers only as many placements as its cars (six at tier 0), so promotion asks for at most that many
      // motor attempts, never more than 8: accurate pointer play can move up from every tier.
      const needed = Math.max(1, Math.min(8, placements));
      if (n >= 4 && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
      else if (n >= needed && rate >= 0.9) {
        data.qualifyingRounds++;
        if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
      } else data.qualifyingRounds = 0;
    }
    if (options.stage === undefined) {
      const w = data.learn, n = w.length, rate = n ? w.reduce((a, b) => a + b, 0) / n : 0;
      const hasName = nameLetters(services.profile()?.unnamed ? '' : services.profile()?.name).length > 0;
      if (n >= 10 && rate >= 0.85 && stage < 4) { data.stage = stageUp(stage, hasName); data.learn = []; }
      else if (n >= 8 && rate <= 0.5 && stage > 0) { data.stage = stageDown(stage, hasName); data.learn = []; }
    }
  }
  function finishRound(): void {
    adjustLevels();
    data.rounds++;
    const passengers = roundPassengers.slice(0, MAX_CARS);
    // A unique id, so two tabs' rounds that happen to match in every field stay two rounds when the save store merges them.
    const id = globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    pending = { id, stars: 3, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, passengers, tier };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += pending.stars;
    // Round count, stars and the open gift are one write; a reload never awards again.
    services.save.flush();
    phase = 'celebration'; phaseT = 0; celebrationHops = 0; particles.clear();
    confettiRain(particles, W, 60); playSfx(audio, 'fanfare');
  }
  function finishCelebration(): void {
    if (phase !== 'celebration') return;
    particles.clear();
    if (giftFollows()) { phase = 'choice'; phaseT = 0; menuSelected = -1; guard(CHOICE_LOCK); }
    else enterRest();
  }
  const giftFollows = () => !!pending && pending.choices.length > 0 && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled;
  function enterRest(): void {
    phase = 'rest'; phaseT = 0; menuSelected = -1; guard(REST_LOCK); particles.clear();
    if (!pending?.restEntered) {
      if (pending) pending.restEntered = true;
      services.save.flush(); services.roundBoundary();
    }
  }
  function chooseSticker(index: number): void {
    if (phase !== 'choice' || !pending || pending.chosen || !pending.rewardEnabled || !services.config.rewardsEnabled) return;
    const id = pending.choices[index]; if (!id) return;
    const bag = rewards(services); if (!bag.stickers.includes(id)) bag.stickers.push(id);
    pending.chosen = id;
    // The chosen id and the owned sticker save together, so repeats and reloads are idempotent.
    services.save.flush(); phase = 'sticker'; phaseT = 0; playSfx(audio, 'sticker');
  }
  /** A finished round is done once its rest screen is left by any route (Again, Home, Escape, the corner Home, the break nudge's Home). */
  function closeFinishedRound(): void {
    if (phase !== 'rest' || !data) return;
    data.pending = null; pending = null; services.save.flush();
  }
  function leave(replay: boolean): void {
    if (phase !== 'rest') return;
    closeFinishedRound(); playSfx(audio, replay ? 'whoosh' : 'button');
    if (replay) startRound(); else services.nav.toHub();
  }
  /** An unchosen gift left during the celebration or choice stays pending and resumes on the next visit. */
  function exitToHub(): void { closeFinishedRound(); services.save.flush(); services.nav.toHub(); }

  // ---------------------------------------------------------------- placing blocks
  let fx = 0, fy = 0, fh = 0;
  const fillChip = (p: ParticleSpawn, i: number): void => {
    const a = (i / 12) * Math.PI * 2 + random() * 0.4, v = (140 + random() * 120) * u;
    p.x = fx + Math.cos(a) * C * 0.3; p.y = fy + Math.sin(a) * C * 0.3; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 90 * u;
    p.life = 0.45 + random() * 0.25; p.size = (4 + random() * 4) * u; p.endSize = 1; p.gravity = 420 * u;
    p.hue = i % 3 === 0 ? 48 : fh; p.saturation = 85; p.lightness = i % 3 === 0 ? 62 : 55; p.alpha = 0.95;
  };
  const fillTap = (p: ParticleSpawn, i: number): void => {
    const a = (i / 10) * Math.PI * 2 + random() * 0.3, v = (110 + random() * 60) * u;
    p.x = fx; p.y = fy; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 40 * u;
    p.life = 0.6 + random() * 0.2; p.size = (11 + random() * 4) * u; p.endSize = 3; p.gravity = 160 * u;
    // Painted-wood reds, oranges and golds read on both the sky and the planks.
    p.hue = i % 3 === 0 ? 8 : i % 3 === 1 ? 28 : 46; p.saturation = 85; p.lightness = 52; p.alpha = 1;
  };
  const fillPuff = (p: ParticleSpawn, i: number): void => {
    p.x = fx + (random() - 0.5) * 14 * u; p.y = fy; p.vx = (-20 - random() * 40 + (i % 2) * 20) * u; p.vy = (-70 - random() * 50) * u;
    p.life = 0.9 + random() * 0.4; p.size = (9 + random() * 5) * u; p.endSize = (24 + random() * 10) * u; p.gravity = 25 * u; p.drag = 0.5;
    p.hue = 30; p.saturation = 20; p.lightness = 97; p.alpha = 0.85;
  };
  function puff(n: number): void {
    fx = engineX() + engineW() * 0.31; fy = trackY - engineH() * 0.95;
    particles.burst(n, fillPuff);
  }
  function sendHome(b: Block): void {
    b.state = 'return'; b.t = 0; b.fromX = b.x; b.fromY = b.y;
  }
  function wiggleHome(b: Block): void {
    // Where this block belongs: in ordered trains the next car, otherwise any empty car with its letter.
    kbChose = false;
    for (let i = 0; i < nCars; i++) if (isOpen(i) && matches(b.letter, cars[i]!.letter)) { cars[i]!.wiggle = 0; kbCar = i; kbBlock = blocks.indexOf(b); playSfx(audio, 'hover', hoverOpt); return; }
    const next = nextOpen();
    if (next >= 0) {
      cars[next]!.wiggle = 0; kbCar = next; playSfx(audio, 'hover', hoverOpt);
      for (let i = 0; i < nCars; i++) if (onPlatform(blocks[i]!) && matches(blocks[i]!.letter, cars[next]!.letter)) { blocks[i]!.squash = 0; kbBlock = i; break; }
    }
  }
  /**
   * Learning evidence comes from pointer attempts (a block put on an open car: the right car is a hit, another a miss)
   * and from calm keyboard play (owner decision, 2026-10-03). A typed letter that is on a platform block is a hit (the
   * child found it on the keyboard) when an open car takes that block; with no open car for it (an ordered train whose
   * car is not open yet) it counts for nothing, like a drop on a closed car. A typed letter on no block is a miss. Any other key places the highlighted pair
   * and counts only when the child moved a highlight with the arrows since the last placement; the default pair the
   * game chose never counts. keyPress sets keyEvidence, false for a key pressed under KEY_CALM after the previous key.
   * The demonstration and placements with no choice left never count.
   */
  function record(hit: boolean, source: Source): void {
    if (source === 'demo' || !choiceLeft()) return;
    if (source !== 'pointer' && !keyEvidence) return;
    if (hit) hits++; else misses++;
    data.learn.push(hit ? 1 : 0);
    if (data.learn.length > LEARN_WINDOW) data.learn.splice(0, data.learn.length - LEARN_WINDOW);
  }
  /**
   * True when the child is choosing: more than one block still to place, or more than one open car. The last block
   * onto the last open car (and any block on a one-car train) is placed without a letter choice.
   */
  function choiceLeft(): boolean {
    let free = 0, open = 0;
    for (let i = 0; i < nCars; i++) {
      const st = blocks[i]!.state;
      if (st === 'idle' || st === 'selected' || st === 'return' || st === 'held') free++;
      if (isOpen(i)) open++;
    }
    return free > 1 || open > 1;
  }
  function attempt(index: number, car: number, source: Source): void {
    const b = blocks[index]; if (!b || (phase !== 'play' && phase !== 'arrive')) return;
    if (held === index) held = -1;
    if (selectedBlock === index) selectedBlock = -1;
    if (car < 0 || cars[car]!.filled) { sendHome(b); return; }
    kbChose = false;
    if (!isOpen(car)) { sendHome(b); wiggleHome(b); playSfx(audio, 'miss', missOpt); return; }
    const c = cars[car]!;
    if (!matches(b.letter, c.letter)) {
      record(false, source); sendHome(b); wiggleHome(b); playSfx(audio, 'miss', missOpt); return;
    }
    record(true, source);
    if (source !== 'demo') placements++;
    b.state = 'fly'; b.t = 0; b.fromX = b.x; b.fromY = b.y; b.car = car;
    c.filled = true; c.block = index; idleT = 0; nextHintAt = IDLE_FIRST; hintT = -1;
    ensureKb();
  }
  function landed(b: Block): void {
    const c = cars[b.car]!;
    b.state = 'placed'; b.squash = 0; c.hop = 0; if (b.letter !== c.letter) c.plate = 0;
    let filled = 0; for (let i = 0; i < nCars; i++) if (cars[i]!.filled) filled++;
    playSfx(audio, 'button', tokOpt);
    cheerOpt.index = filled - 1; playSfx(audio, 'star', cheerOpt);
    playVoiceClip(audio, b.letter);
    fx = slotX(b.car); fy = slotY(); fh = CHIP_HUES[b.color] ?? 40; particles.burst(12, fillChip);
    if (demoT >= 0 && b.car === demoCar) demoPlaced = true;
    // A train filled while still pulling in toots once it has stopped (beginPlay).
    if (allFilled() && phase === 'play') toot();
  }
  function blockAt(x: number, y: number): number {
    let best = -1, distance = Infinity;
    for (let i = 0; i < nCars; i++) {
      const b = blocks[i]!; if (!onPlatform(b)) continue;
      const half = Math.max(48, B * 0.56), dx = Math.abs(x - b.x), dy = Math.abs(y - b.y);
      if (dx <= half && dy <= half && dx + dy < distance) { best = i; distance = dx + dy; }
    }
    return best;
  }
  /** Car under a point: inside its body or within the tier's pull radius of its slot. */
  function carAt(x: number, y: number, pull: number): number {
    let best = -1, distance = Infinity;
    const top = slotY() - C / 2 - C * 0.15, bottom = trackY + 6;
    for (let i = 0; i < nCars; i++) {
      if (cars[i]!.filled) continue;
      const d = Math.hypot(x - slotX(i), y - slotY());
      const inside = Math.abs(x - carX(i)) <= cw() / 2 && y >= top && y <= bottom;
      if ((inside || d <= pull) && d < distance) { best = i; distance = d; }
    }
    return best;
  }
  const pullRadius = () => Math.max(B * 0.7, TIERS[tier].magnet * B);
  /** Default keyboard target: the first open car and the platform block that belongs on it, so any key places it correctly. */
  function pairKb(): void {
    kbBlock = kbCar = -1; kbChose = false;
    for (let c = 0; c < nCars; c++) {
      if (!isOpen(c)) continue;
      for (let i = 0; i < nCars; i++) if (onPlatform(blocks[i]!) && matches(blocks[i]!.letter, cars[c]!.letter)) { kbBlock = i; kbCar = c; return; }
    }
  }
  /** Point the keyboard target at this block and the open car where it belongs (or at a fresh matching pair). */
  function pairWith(index: number): void {
    const b = blocks[index]!; kbChose = false;
    for (let c = 0; c < nCars; c++) if (isOpen(c) && matches(b.letter, cars[c]!.letter)) { kbBlock = index; kbCar = c; return; }
    pairKb();
  }
  /** Keep a target the child chose with the arrows while both ends are still usable; otherwise fall back to a matching pair. */
  function ensureKb(): void {
    const kb = kbBlock >= 0 && kbBlock < nCars ? blocks[kbBlock] : undefined;
    if (!kb || !onPlatform(kb) || !isOpen(kbCar)) pairKb();
  }
  function select(index: number): void {
    const b = blocks[index]!;
    if (selectedBlock >= 0 && selectedBlock !== index) sendHome(blocks[selectedBlock]!);
    selectedBlock = index; b.state = 'selected'; b.t = 0; pairWith(index);
    keyOpt.index = Math.max(0, letterIndex(b.letter)); playSfx(audio, 'key', keyOpt);
  }
  /** A small wood-chip burst where the child tapped, so a tap while nothing can be moved still answers. */
  function tapBurst(x: number, y: number): void {
    fx = x; fy = y; particles.burst(10, fillTap);
  }
  /** A key while nothing can be placed: a puff from the chimney, or a burst on the platform when the engine is off screen. */
  function keyBurst(): void {
    const ex = engineX();
    if (ex > 0 && ex < W) puff(2); else tapBurst(W / 2, platformY);
  }
  function pointerDown(x: number, y: number): void {
    idleT = 0; nextHintAt = IDLE_FIRST; hintT = -1; kbActive = false;
    if (demoT >= 0) endDemo();
    if (phase !== 'play' && phase !== 'arrive') { tapBurst(x, y); return; }
    const hitBlock = blockAt(x, y);
    if (selectedBlock >= 0) {
      const car = carAt(x, y, pullRadius());
      if (car >= 0) { motorHits++; attempt(selectedBlock, car, 'pointer'); return; }
      if (hitBlock === selectedBlock) { sendHome(blocks[selectedBlock]!); selectedBlock = -1; return; }
      if (hitBlock < 0) { sendHome(blocks[selectedBlock]!); selectedBlock = -1; return; }
    }
    if (hitBlock >= 0) {
      const b = blocks[hitBlock]!;
      if (selectedBlock >= 0 && selectedBlock !== hitBlock) { sendHome(blocks[selectedBlock]!); selectedBlock = -1; }
      // A second touch, or a press after a pointerup that never arrived: the block held so far goes home first.
      releaseHeld();
      held = hitBlock; b.state = 'held'; moved = false; downX = x; downY = y; grabX = b.x - x; grabY = b.y - y; pairWith(hitBlock);
      keyOpt.index = Math.max(0, letterIndex(b.letter)); playSfx(audio, 'key', keyOpt);
      return;
    }
    // A tap on a car says hello: its passenger hops.
    for (let i = 0; i < nCars; i++) if (Math.abs(x - carX(i)) < cw() / 2 && y > slotY() - C && y < trackY) { cars[i]!.hop = 0; return; }
    if (phase === 'arrive') tapBurst(x, y);
  }
  /** Let go of the block the pointer holds, without an attempt: it slides home. Never touches the demonstration's block. */
  function releaseHeld(): void {
    if (held < 0 || demoT >= 0) return;
    const b = blocks[held]; held = -1;
    if (b && b.state === 'held') sendHome(b);
  }
  function pointerMove(x: number, y: number): void {
    if (held < 0 || demoT >= 0) return;
    const b = blocks[held]!;
    if (Math.hypot(x - downX, y - downY) > CLICK_SLOP) moved = true;
    let tx = x + grabX, ty = y + grabY;
    const car = moved ? carAt(tx, ty, pullRadius()) : -1;
    if (car >= 0) { tx = lerp(tx, slotX(car), 0.45); ty = lerp(ty, slotY(), 0.45); }
    b.x = tx; b.y = ty;
  }
  function pointerUp(): void {
    if (held < 0 || demoT >= 0) return;
    const index = held, b = blocks[index]!; held = -1;
    if (!moved) { select(index); return; }
    const car = carAt(b.x, b.y, pullRadius());
    if (b.y < platformTop) { if (car >= 0) motorHits++; else motorMisses++; }
    if (car >= 0) attempt(index, car, 'pointer'); else sendHome(b);
  }
  function keyPress(key: string, code: string, now: number): void {
    // The highlights are hidden until a key arrives (and again after any pointer press).
    const first = !kbActive;
    // Mashing still plays, but a key that comes too soon after the previous one is never learning evidence.
    const calm = now - lastKeyAt >= KEY_CALM * 1000; lastKeyAt = now;
    idleT = 0; nextHintAt = IDLE_FIRST; hintT = -1; kbActive = true;
    if (demoT >= 0) endDemo();
    // Between trains a key gets a puff from the chimney.
    if (phase !== 'play' && phase !== 'arrive') { if (phase === 'toot' || phase === 'depart') keyBurst(); return; }
    // The key that shows the highlights starts from the default pair (a block picked with the pointer and its car, or
    // the first open car and its block), which always matches, never from a pair left over from earlier arrow presses.
    if (first) { if (selectedBlock >= 0) pairWith(selectedBlock); else pairKb(); } else ensureKb();
    // A first arrow only shows where the highlights start.
    if (first && code.startsWith('Arrow')) { if (kbBlock >= 0) { keyOpt.index = Math.max(0, letterIndex(blocks[kbBlock]!.letter)); playSfx(audio, 'key', keyOpt); } return; }
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      const step = code === 'ArrowLeft' ? -1 : 1;
      for (let k = 1; k <= nCars; k++) {
        const i = (kbBlock + step * k + nCars * 2) % nCars;
        if (onPlatform(blocks[i]!)) { if (i !== kbBlock) kbChose = true; kbBlock = i; keyOpt.index = Math.max(0, letterIndex(blocks[i]!.letter)); playSfx(audio, 'key', keyOpt); break; }
      }
      return;
    }
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const step = code === 'ArrowUp' ? -1 : 1;
      for (let k = 1; k <= nCars; k++) {
        const i = (kbCar + step * k + nCars * 2) % nCars;
        if (isOpen(i)) { if (i !== kbCar) kbChose = true; kbCar = i; cars[i]!.wiggle = 0.6; playSfx(audio, 'hover', hoverOpt); break; }
      }
      return;
    }
    // A letter key asks the child to find a platform letter on the keyboard: on a block it is a hit, on none a miss.
    // Any other key places the highlighted pair, which counts only when the child chose it with the arrows.
    keyEvidence = calm && kbChose;
    if (key.length === 1 && /\p{L}/u.test(key)) {
      let typed = -1, shown = false;
      for (let i = 0; i < nCars; i++) {
        if (!onPlatform(blocks[i]!)) continue;
        shown = true;
        if (blocks[i]!.letter.toLowerCase() === key.toLowerCase()) { typed = i; break; }
      }
      keyEvidence = calm;
      if (typed >= 0) {
        const b = blocks[typed]!; let car = -1;
        for (let i = 0; i < nCars; i++) if (isOpen(i) && matches(b.letter, cars[i]!.letter)) { car = i; break; }
        // Its car is not open yet (an ordered train): like a mouse drop on a closed car, this is no attempt.
        if (car < 0) { b.squash = 0; wiggleHome(b); return; }
        if (selectedBlock >= 0 && selectedBlock !== typed) { sendHome(blocks[selectedBlock]!); selectedBlock = -1; }
        attempt(typed, car, 'typed'); return;
      }
      // Only with letters on the platform to look for; the key then places the highlighted pair as before, uncounted.
      if (shown) record(false, 'typed');
      keyEvidence = false;
    }
    if (kbBlock < 0 || kbCar < 0) { keyBurst(); return; }
    if (selectedBlock >= 0 && selectedBlock !== kbBlock) { sendHome(blocks[selectedBlock]!); selectedBlock = -1; }
    attempt(kbBlock, kbCar, 'key');
  }

  // ---------------------------------------------------------------- update
  function updateBlocks(dt: number): void {
    for (let i = 0; i < nCars; i++) {
      const b = blocks[i]!;
      b.squash += dt;
      if (b.state === 'hidden') { if (phase === 'arrive' && phaseT >= b.appear) { b.state = 'idle'; b.x = b.homeX; b.y = b.homeY; b.t = 0; if (kbBlock < 0) pairKb(); } continue; }
      b.t += dt;
      if (b.state === 'return') {
        const k = easeOutCubic(b.t / 0.45);
        b.x = lerp(b.fromX, b.homeX, k); b.y = lerp(b.fromY, b.homeY, k) - Math.sin(clamp01(b.t / 0.45) * Math.PI) * B * 0.35;
        if (b.t >= 0.45) { b.state = 'idle'; b.x = b.homeX; b.y = b.homeY; b.squash = 0; }
      } else if (b.state === 'fly') {
        const k = easeInOutSine(b.t / 0.2);
        b.x = lerp(b.fromX, slotX(b.car), k); b.y = lerp(b.fromY, slotY(), k);
        if (b.t >= 0.2) landed(b);
      } else if (b.state === 'placed') { b.x = slotX(b.car); b.y = slotY(); }
    }
  }
  function updateDemo(dt: number): void {
    if (demoT < 0) return;
    demoT += dt;
    const b = blocks[demoBlock]!;
    // A block the child selected during the arrival is still a platform block: the hand takes it like an idle one.
    if (demoT >= 0.9 && demoT < 2.2 && (b.state === 'idle' || b.state === 'selected')) { if (selectedBlock === demoBlock) selectedBlock = -1; b.state = 'held'; held = demoBlock; keyOpt.index = Math.max(0, letterIndex(b.letter)); playSfx(audio, 'key', keyOpt); }
    if (b.state === 'held' && demoT < 2.2) {
      const k = easeInOutSine((demoT - 1.1) / 1.0);
      b.x = lerp(b.homeX, slotX(demoCar), k); b.y = lerp(b.homeY, slotY(), k) - Math.sin(clamp01((demoT - 1.1) / 1.0) * Math.PI) * B * 0.4;
    }
    if (demoT >= 2.2 && b.state === 'held') { held = -1; attempt(demoBlock, demoCar, 'demo'); }
    if (demoT >= DEMO_SECONDS) demoT = -1;
  }
  /** The selected block and its open car; with no block selected, or none of its cars open yet, the next open car and its block. */
  function hintTarget(): void {
    if (selectedBlock >= 0) {
      const s = blocks[selectedBlock]!;
      for (let c = 0; c < nCars; c++) if (isOpen(c) && matches(s.letter, cars[c]!.letter)) { hintBlock = selectedBlock; hintCar = c; return; }
    }
    hintCar = nextOpen(); hintBlock = -1;
    if (hintCar < 0) return;
    for (let i = 0; i < nCars; i++) if (onPlatform(blocks[i]!) && matches(blocks[i]!.letter, cars[hintCar]!.letter)) { hintBlock = i; break; }
  }
  function updatePlay(dt: number): void {
    phaseT += dt;
    // The engine cleared its pointer without a pointerup reaching the scene (the window lost focus mid-drag, a second
    // touch's release): the held block goes home, so no block stays held and every round can finish.
    if (held >= 0 && !input.pointer.down) releaseHeld();
    // One bake or one round-end pre-scale per update, never both.
    if (!bakeNext()) prepNext();
    if (phase === 'arrive') {
      const k = easeOutCubic(phaseT / ARRIVE_SECONDS);
      trainOff = lerp(-trainL - 60, parkX, k);
      chuffT -= dt;
      if (chuffT <= 0 && k < 0.97) { chuffT = 0.3 + k * 0.25; chuffOpt.volume = 0.3 * (1 - k * 0.6); playSfx(audio, 'tick', chuffOpt); puff(1); }
      if (phaseT >= ARRIVE_SECONDS) beginPlay();
    } else if (phase === 'play') {
      // Idle time runs while a block is only selected (a click without a drag), and pauses while one is held.
      if (held < 0 && demoT < 0) idleT += dt;
      if (hintT < 0 && idleT >= nextHintAt) { hintTarget(); if (hintBlock >= 0) { hintT = 0; nextHintAt = idleT + IDLE_REPEAT; } }
      if (hintT >= 0) {
        hintT += dt;
        if (hintT >= 1.75 && hintT - dt < 1.75 && hintCar >= 0) { cars[hintCar]!.wiggle = 0; playSfx(audio, 'hover', hoverOpt); }
        if (hintT >= HINT_SECONDS) hintT = -1;
      }
      updateDemo(dt);
    } else if (phase === 'toot') {
      tootSquash += dt;
      if (phaseT > 0.35 && phaseT - dt <= 0.35) puff(4);
      if (phaseT >= TOOT_SECONDS) depart();
    } else if (phase === 'depart') {
      const k = easeInCubic(phaseT / DEPART_SECONDS);
      trainOff = lerp(departFrom, W + 60, k);
      chuffT -= dt;
      if (chuffT <= 0 && k < 0.8) { chuffT = 0.3 - k * 0.15; chuffOpt.volume = 0.3; playSfx(audio, 'tick', chuffOpt); puff(1); }
      if (starFlight >= 0) {
        starFlight += dt;
        if (starFlight >= STAR_FLIGHT && starFlight - dt < STAR_FLIGHT) { starOpt.index = starsEarned; playSfx(audio, 'star', starOpt); }
      }
      if (phaseT >= DEPART_SECONDS && (starFlight < 0 || starFlight >= STAR_FLIGHT)) trainGone();
    }
    // The plate timer (-1 until a case pair clicks in) stops once its pop-in is over; the plate stays until the train leaves.
    for (let i = 0; i < MAX_CARS; i++) { const c = cars[i]!; c.hop += dt; c.wiggle += dt; if (c.plate >= 0 && c.plate < 1) c.plate += dt; }
    updateBlocks(dt);
  }
  function updateResult(dt: number): void {
    phaseT += dt;
    prepNext(); if (holdResult && prepHead >= prepCount) holdResult = false;
    if (phase === 'celebration') {
      const hop = Math.floor(phaseT / 0.55);
      if (hop > celebrationHops) { celebrationHops = hop; if (phaseT < 3) confettiRain(particles, W, 10); }
      for (let i = 0; i < 3; i++) {
        const land = 0.3 + i * 0.45 + 0.15;
        if (phaseT >= land && phaseT - dt < land) { starOpt.index = i; playSfx(audio, 'star', starOpt); }
      }
      if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
    } else if (phase === 'sticker' && phaseT >= 0.7) enterRest();
  }

  // ---------------------------------------------------------------- render
  function drawBlock(ctx: CanvasRenderingContext2D, b: Block, x: number, y: number, scale: number, alpha = 1): void {
    const c = blockCanvas(b); if (!c) return;
    const sq = b.squash < 0.3 ? Math.sin((b.squash / 0.3) * Math.PI) * 0.12 : 0;
    const w = B * scale * (1 + sq), h = B * scale * (1 - sq);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(c, x - w / 2, y + B * scale / 2 - h, w, h);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  function drawWagonFront(ctx: CanvasRenderingContext2D, name: string, x: number, bottom: number, width: number): void {
    const img = sprites.get(name); if (!img) return;
    const c = sprites.scaled(name, width / Math.max(img.naturalWidth, img.naturalHeight)); if (!c) return;
    const pr = sprites.pixelRatio, w = c.width / pr, h = c.height / pr, sy = Math.round(c.height * FRONT_TOP);
    ctx.drawImage(c, 0, sy, c.width, c.height - sy, x - w / 2, bottom - h + sy / pr, w, h - sy / pr);
  }
  function renderTrain(ctx: CanvasRenderingContext2D): void {
    if (!plan) return;
    const width = cw(), wh = wagonH(), moving = phase === 'arrive' || phase === 'depart';
    const bob = moving ? Math.sin(trainOff * 0.09) * 2 * u : 0;
    for (let i = 0; i < nCars; i++) {
      const c = cars[i]!, x = carX(i);
      if (x + width / 2 < -20 || x - width / 2 > W + 20) continue;
      const wig = c.wiggle < 0.6 ? Math.sin(c.wiggle * 30) * (1 - c.wiggle / 0.6) * 0.045 : 0;
      const wx = x + wig * width * 0.4, bottom = trackY + bob * (i % 2 ? 1 : -1);
      const wagon = WAGON_SPRITES[c.wagon]!;
      drawSprite(ctx, sprites, wagon, wx, bottom - wh / 2, Math.round(width));
      // Passenger sits behind the wagon front; a hop on every click-in.
      const hop = c.hop < 0.6 ? Math.sin((c.hop / 0.6) * Math.PI) * C * 0.42 : 0;
      const sway = phase === 'play' ? Math.sin(time * 2.2 + i * 1.7) * 2 * u : 0;
      drawSprite(ctx, sprites, passengerSprite(c.passenger), wx + 0.24 * width, bottom - wh * 0.5 - C * 0.42 - hop + sway, Math.round(C * 0.98 * PASSENGER_PAD));
      const sx = slotX(i) + wig * width * 0.4, sy = slotY() + bottom - trackY;
      if (!c.filled) {
        const slot = slotCanvas(c);
        if (slot) {
          const dim = plan.ordered && !isOpen(i);
          if (dim) ctx.globalAlpha = 0.5;
          ctx.drawImage(slot, sx - C / 2, sy - C / 2, C, C);
          if (dim) ctx.globalAlpha = 1;
        }
        if (phase === 'play' && plan.ordered && isOpen(i)) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4);
          roundedRect(ctx, sx - C / 2 - 6, sy - C / 2 - 6, C + 12, C + 12, C * 0.18);
          ctx.lineWidth = 4 + pulse * 3; ctx.strokeStyle = '#ffe066'; ctx.stroke();
        }
      } else {
        const b = blocks[c.block];
        if (b && b.state === 'placed') drawBlock(ctx, b, sx, sy, C / B);
      }
      drawWagonFront(ctx, wagon, wx, bottom, Math.round(width));
      if (c.filled && c.plate >= 0) {
        const plate = plateCanvas(c);
        if (plate) {
          const s = C * 0.42 * (c.plate < 0.35 ? easeOutBack(c.plate / 0.35) : 1);
          ctx.drawImage(plate, wx - s / 2, bottom - wh * 0.6 - s / 2, s, s);
        }
      }
    }
    const ex = engineX();
    if (ex - engineW() / 2 < W + 20 && ex + engineW() / 2 > -20) {
      const sq = phase === 'toot' && tootSquash < 0.5 ? Math.sin((tootSquash / 0.5) * Math.PI * 2) * 0.05 : 0;
      drawSprite(ctx, sprites, SPR_ENGINE, ex, trackY - engineH() / 2 * (1 + sq) - bob, Math.round(engineW()), 0, 1 - sq * 0.6, 1 + sq);
    }
    if (plan.word) {
      const size = C * 1.05, py = trackY - engineH() - size * 0.56;
      // The picture rides above the engine. Where the parked engine would put it past the right edge (narrow screens)
      // or under the sound button (short screens), it rides that much further back along the train, and so still
      // pulls in and leaves with it.
      const limit = py - size / 2 < cornerY + cornerRadius + 8 ? soundX - cornerRadius - size / 2 - 14 : W - size / 2 - 10;
      const px = ex - Math.max(0, ex - trainOff + parkX - limit);
      if (px + size / 2 > -20 && px - size / 2 < W + 20) {
        chunkyPanel(ctx, px - size / 2, py - size / 2, size, size, '#fff3d6', '#6d4a2b', size * 0.16, 5);
        drawSprite(ctx, sprites, WORD_SPRITES[plan.word]!, px, py, Math.round(size * 0.84));
      }
    }
  }
  function renderPlatform(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < nCars; i++) {
      const b = blocks[i]!;
      if (b.state === 'hidden' || b.state === 'placed' || b.state === 'held' || b.state === 'fly') continue;
      let scale = 1, y = b.y;
      if (b.state === 'idle' && b.t < 0.4) scale = 0.3 + 0.7 * easeOutBack(b.t / 0.4);
      if (b.state === 'selected') { y -= B * 0.22 + Math.sin(time * 5) * 4 * u; scale = 1.06; }
      if (hintT >= 0 && i === hintBlock && hintT > 0.55 && hintT < 0.9) y -= Math.sin(((hintT - 0.55) / 0.35) * Math.PI) * B * 0.15;
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#4a2c12';
      ctx.beginPath(); ctx.ellipse(b.homeX, b.homeY + B * 0.52, B * 0.46, B * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      drawBlock(ctx, b, b.x, y, scale);
      if (kbActive && (phase === 'play' || phase === 'arrive') && i === kbBlock) {
        roundedRect(ctx, b.x - B / 2 - 9, y - B / 2 - 9, B + 18, B + 18, B * 0.2);
        ctx.lineWidth = 10; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#ffe066'; ctx.stroke();
      }
    }
    if (kbActive && (phase === 'play' || phase === 'arrive') && kbCar >= 0 && kbBlock >= 0) {
      const x = slotX(kbCar), y = slotY() - C / 2 - 16 - Math.abs(Math.sin(time * 3)) * 6 * u, s = Math.max(14, 20 * u);
      ctx.beginPath(); ctx.moveTo(x - s, y - s * 1.2); ctx.lineTo(x + s, y - s * 1.2); ctx.lineTo(x, y); ctx.closePath();
      ctx.fillStyle = '#ffe066'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.stroke();
    }
  }
  function drawHand(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, press: number, alpha: number): void {
    // The hand art is square with the fingertip at its top-left corner (8, 6 of 256 px).
    const size = Math.round(Math.max(96, B * 0.95));
    if (alpha < 1) ctx.globalAlpha = alpha;
    drawSprite(ctx, sprites, SPR_HAND, tipX + size * 0.47, tipY + size * 0.477, size, 0, 1 + press * 0.08, 1 - press * 0.08);
    if (alpha < 1) ctx.globalAlpha = 1;
  }
  function renderHelpers(ctx: CanvasRenderingContext2D): void {
    if (demoT >= 0) {
      const b = blocks[demoBlock]!;
      let tx: number, ty: number, alpha = 1;
      if (demoT < 0.9) { const k = easeOutCubic(demoT / 0.9); tx = lerp(W * 0.85, b.homeX, k); ty = lerp(H + 60, b.homeY, k); alpha = clamp01(demoT / 0.3); }
      else if (demoT < 2.2) { tx = b.x; ty = b.y; }
      else { const k = easeInCubic((demoT - 2.2) / (DEMO_SECONDS - 2.2)); tx = lerp(slotX(demoCar), W * 0.9, k); ty = lerp(slotY(), H + 80, k); alpha = 1 - k; }
      const press = demoT > 0.85 && demoT < 1.15 ? Math.sin(((demoT - 0.85) / 0.3) * Math.PI) : 0;
      drawHand(ctx, tx, ty, press, alpha);
    }
    if (hintT >= 0 && hintBlock >= 0 && hintCar >= 0) {
      const b = blocks[hintBlock]!;
      // A selected block draws lifted (renderPlatform), so the hand starts where it shows.
      const sel = b.state === 'selected', bx = sel ? b.x : b.homeX, by = sel ? b.y - B * 0.22 : b.homeY;
      let tx: number, ty: number, alpha = 1;
      if (hintT < 0.55) { const k = easeOutCubic(hintT / 0.55); tx = lerp(bx + W * 0.12, bx, k); ty = lerp(H + 40, by, k); alpha = clamp01(hintT / 0.25); }
      else if (hintT < 0.9) { tx = bx; ty = by; }
      else if (hintT < 1.8) {
        const k = easeInOutSine((hintT - 0.9) / 0.9);
        tx = lerp(bx, slotX(hintCar), k); ty = lerp(by, slotY(), k) - Math.sin(k * Math.PI) * B * 0.35;
        drawBlock(ctx, b, tx, ty, 0.95, 0.45);
      } else { tx = slotX(hintCar); ty = slotY(); alpha = 1 - clamp01((hintT - 1.8) / 0.6); }
      drawHand(ctx, tx, ty, 0, alpha);
    }
  }
  function renderStarRow(ctx: CanvasRenderingContext2D): void {
    ensureDimStar();
    const gap = starSize * 1.25;
    for (let i = 0; i < TRAINS_PER_ROUND; i++) {
      const x = W / 2 + (i - 1) * gap;
      if (i < starsEarned) drawSprite(ctx, sprites, SPR_STAR, x, starRowY, starSize);
      else if (dimStar) ctx.drawImage(dimStar, x - starSize / 2, starRowY - starSize / 2, starSize, starSize);
    }
    if (starFlight >= 0 && phase === 'depart') {
      const k = clamp01(starFlight / STAR_FLIGHT), e = easeInOutSine(k);
      const sx = Math.min(W - 40, Math.max(40, engineX())), sy = trackY - engineH();
      const x = lerp(sx, W / 2 + (starsEarned - 1) * gap, e), y = lerp(sy, starRowY, e) - Math.sin(k * Math.PI) * 80 * u;
      drawSprite(ctx, sprites, SPR_STAR, x, y, starSize, k * Math.PI * 2, 1 + (1 - k) * 0.4, 1 + (1 - k) * 0.4);
    }
  }
  /**
   * A passenger in its wagon, centred on x, y. The art is drawn at `width` (pre-scaled by planRoundEndArt);
   * `scale` grows or shrinks the whole rider with a transform so a moving size never scales art per frame.
   */
  function drawRider(ctx: CanvasRenderingContext2D, passenger: number, wagon: number, x: number, y: number, width: number, scale = 1): void {
    const name = WAGON_SPRITES[wagon % WAGONS.length]!, rw = Math.round(width), wh = rw * 211 / 480;
    if (scale !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); x = 0; y = 0; }
    const bottom = y + wh / 2;
    drawSprite(ctx, sprites, name, x, y, rw);
    drawSprite(ctx, sprites, passengerSprite(passenger), x, bottom - wh * 0.62 - rw * 0.24, Math.round(rw * 0.62 * PASSENGER_PAD));
    drawWagonFront(ctx, name, x, bottom, rw);
    if (scale !== 1) ctx.restore();
  }
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  const choiceX = (i: number) => {
    const n = pending?.choices.length ?? 1;
    return W / 2 + (i - (n - 1) / 2) * (choiceW + Math.max(24, choiceW * 0.12));
  };
  const controlX = (i: number) => W / 2 + (i - 0.5) * controlsR * 3.2;
  function renderResult(ctx: CanvasRenderingContext2D): void {
    // Stars: during the celebration they slam in one by one; afterwards they sit still.
    const gap = starSize * 1.25;
    if (phase === 'celebration') ensureDimStar();
    for (let i = 0; i < 3; i++) {
      const x = W / 2 + (i - 1) * gap;
      if (phase === 'celebration') {
        const local = phaseT - 0.3 - i * 0.45;
        if (dimStar) ctx.drawImage(dimStar, x - starSize / 2, starRowY - starSize / 2, starSize, starSize);
        if (local > 0) { const s = slamScale(local / 0.4, 0.8); drawSprite(ctx, sprites, SPR_STAR, x, starRowY, starSize, 0, s, s); }
      } else drawSprite(ctx, sprites, SPR_STAR, x, starRowY, starSize);
    }
    if (phase === 'celebration' && pending) {
      // Same size formula as planRoundEndArt, so the first celebration frame finds its art pre-scaled.
      const n = pending.passengers.length, size = Math.round(Math.min(B * 1.1, (W - 60) / Math.max(1, n) * 0.8)), drawn = Math.round(size * PASSENGER_PAD);
      for (let i = 0; i < n; i++) {
        const jump = Math.abs(Math.sin(phaseT * 5.2 + i * 1.1)) * size * 0.35;
        drawSprite(ctx, sprites, passengerSprite(pending.passengers[i]!), W / 2 + (i - (n - 1) / 2) * size * 1.15, platformY - jump, drawn);
      }
      return;
    }
    // A restored choice or rest shows its riders and buttons once their art is prepared (planRestoredArt).
    if (holdResult) return;
    if (phase === 'choice' && pending) {
      for (let i = 0; i < pending.choices.length; i++) {
        const passenger = passengerOf(pending.choices[i]!);
        const x = choiceX(i), focused = menuSelected === i, wh = choiceW * 211 / 480;
        if (focused) {
          roundedRect(ctx, x - choiceW / 2 - 12, choiceY - choiceW * 0.64, choiceW + 24, choiceW * 0.64 + wh / 2 + 16, 28);
          ctx.lineWidth = 10; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#fff8da'; ctx.stroke();
        }
        drawRider(ctx, passenger, i + 1, x, choiceY, choiceW);
      }
      return;
    }
    const chosen = pending?.chosen ? passengerOf(pending.chosen) : -1;
    if (chosen >= 0) {
      const index = Math.max(0, pending!.choices.indexOf(pending!.chosen));
      const e = phase === 'sticker' ? easeOutCubic(clamp01(phaseT / 0.65)) : 1;
      const x = lerp(choiceX(index), W / 2, e), y = lerp(choiceY, restY, e);
      drawRider(ctx, chosen, index + 1, x, y, restW, lerp(choiceW, restW, e) / restW);
    } else {
      // Rewards off or the set is complete: the round's first passenger rides along, offered nothing.
      drawRider(ctx, pending?.passengers[0] ?? 0, 2, W / 2, restY, restW);
    }
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i);
      chunkyCircle(ctx, x, controlsY, controlsR, '#a3c9c5', OUTLINE, 5);
      drawSprite(ctx, sprites, i === 0 ? SPR_PLAY : SPR_HOME, x, controlsY, Math.round(controlsR * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsR);
    }
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    chunkyCircle(ctx, homeX, cornerY, cornerRadius, '#a3c9c5', OUTLINE, 4);
    drawSprite(ctx, sprites, SPR_HOME, homeX, cornerY, Math.round(cornerRadius * 1.3));
    soundButton.render(ctx, sprites);
    if (cornerFocus >= 0) focusRing(ctx, cornerFocus === 0 ? homeX : soundX, cornerY, cornerRadius);
  }
  function hoverMenu(x: number, y: number): number {
    if (phase === 'choice') {
      const wh = choiceW * 211 / 480;
      for (let i = 0; i < (pending?.choices.length ?? 0); i++) {
        if (Math.abs(x - choiceX(i)) <= choiceW / 2 + 12 && y >= choiceY - choiceW * 0.64 && y <= choiceY + wh / 2 + 16) return i;
      }
      return -1;
    }
    for (let i = 0; i < 2; i++) if (Math.hypot(x - controlX(i), y - controlsY) <= controlsR) return i;
    return -1;
  }

  const stats: LetterTrainStats = {
    get phase() { return phase; }, get tier() { return tier; }, get stage() { return stage; }, get train() { return trainIndex; }, get trains() { return plans.length; },
    get starsEarned() { return starsEarned; }, get learnWindow() { return data?.learn ?? []; }, get motorHits() { return motorHits; }, get motorMisses() { return motorMisses; },
    get hits() { return hits; }, get misses() { return misses; }, get demo() { return demoT >= 0; }, get hint() { return hintT >= 0; }, get blockSize() { return B; },
    get choiceIds() { return pending?.choices ?? []; }, get selected() { return menuSelected; }, get stickerId() { return pending?.chosen ?? ''; },
    get particles() { return particles.alive; }, get kbBlock() { return kbBlock; }, get kbCar() { return kbCar; }, get hintBlock() { return hintBlock; }, get hintCar() { return hintCar; },
    get workMean() { let s = 0; for (let i = 0; i < workCount; i++) s += work[i]!; return workCount ? s / workCount : 0; },
    get workMax() { let m = 0; for (let i = 0; i < workCount; i++) m = Math.max(m, work[i]!); return m; },
    blocks() { return blocks.slice(0, nCars).map(b => ({ letter: b.letter, x: b.x, y: b.y, state: b.state, size: B })); },
    cars() { return cars.slice(0, nCars).map((c, i) => ({ letter: c.letter, x: slotX(i), y: slotY(), filled: c.filled, open: isOpen(i), size: C, plate: c.filled && c.plate >= 0 })); },
    controls() {
      // The tap areas hoverMenu uses, centred.
      const wh = choiceW * 211 / 480, top = choiceY - choiceW * 0.64, bottom = choiceY + wh / 2 + 16;
      if (phase === 'choice') return (pending?.choices ?? []).map((id, i) => ({ x: choiceX(i), y: (top + bottom) / 2, w: choiceW + 24, h: bottom - top, id }));
      if (phase === 'rest') return [0, 1].map(i => ({ x: controlX(i), y: controlsY, w: controlsR * 2, h: controlsR * 2, id: i === 0 ? 'again' : 'home' }));
      return [];
    },
    view() {
      return {
        pixelRatio: sprites.pixelRatio, artRatio, glyphDpr, dimStarDpr, blockDpr: blocks.slice(0, nCars).map(b => b.canvasDpr), slotDpr: cars.slice(0, nCars).map(c => c.slotDpr),
        backdrop: bgCanvas ? { x: bgX, y: bgY, w: bgCanvas.width / sprites.pixelRatio, h: bgCanvas.height / sprites.pixelRatio } : null,
        corners: [{ x: homeX, y: cornerY, w: cornerRadius * 2, h: cornerRadius * 2, id: 'corner-home' }, { x: soundX, y: cornerY, w: cornerRadius * 2, h: cornerRadius * 2, id: 'corner-sound' }],
      };
    },
    resetWork() { workHead = workCount = 0; },
  };

  return {
    stats,
    enter() {
      void loadLetterTrainArt(services).then(() => { artLoaded = true; warm(); });
      data = services.save.gameData<GameData>(GAME_ID, { tier: 0, qualifyingRounds: 0, rounds: 0, stage: 0, learn: [], recentWords: [], pending: null });
      sanitizeLetterTrainData(data, () => services.save.protect());
      data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; startMusic(audio, 'letter-train');
      layout(services.canvas.width, services.canvas.height);
      // A return visit has the art decoded already: scale it now, before the first frame.
      if (sprites.get(SPR_TOWN)) warm();
      if (data.pending) {
        pending = data.pending; tier = pending.tier; stage = options.stage ?? toStage(data.stage); starsEarned = 3;
        if (giftFollows()) { phase = 'choice'; phaseT = 0; menuSelected = -1; guard(CHOICE_LOCK); }
        else enterRest();
        planRestoredArt();
      } else startRound();
    },
    pause() { stopMusic(audio); stopIdle(); services.save.flush(); },
    resume() {
      // Back on top after another screen (the break nudge) covered it. Keys pressed into that screen must not act
      // here: the choice and rest start over as when they first appeared, nothing focused and input ignored for
      // their lock. The corner Home and sound buttons still act at once.
      if (phase === 'choice' || phase === 'rest') { menuSelected = -1; cornerFocus = -1; guard(phase === 'choice' ? CHOICE_LOCK : REST_LOCK); }
      else guard(0.35);
      startMusic(audio, 'letter-train');
    },
    // Any route away from rest (corner Home, Escape, the break nudge's Home) closes the finished round.
    exit() { stopMusic(audio); stopIdle(); closeFinishedRound(); services.save.flush(); },
    resize: layout,
    update(dt) {
      const started = performance.now(); time += dt; sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      if (playable()) updatePlay(dt); else updateResult(dt);
      if (fanfareStarted && !fanfareAsked && !idleHandle && playable()) idleHandle = requestIdleCallback(prepareIdle, { timeout: 500 });
      particles.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H || sprites.pixelRatio !== artRatio) layout(view.width, view.height);
      if (services.canvas.dpr !== glyphDpr) glyphDpr = services.canvas.dpr;
      if (warmed) ensureBackground();
      // The image prepared this update, drawn once where the backdrop covers it, so its upload is done before it shows.
      if (prepShow >= 0) { drawSprite(ctx, sprites, prepNames[prepShow]!, W / 2, H / 2, prepSizes[prepShow]!); prepShow = -1; }
      if (bgCanvas) ctx.drawImage(bgCanvas, bgX, bgY, bgCanvas.width / sprites.pixelRatio, bgCanvas.height / sprites.pixelRatio);
      else { ctx.fillStyle = '#9fd3f0'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#e2b16f'; ctx.fillRect(0, trackY, W, H - trackY); }
      if (playable()) {
        renderStarRow(ctx); renderTrain(ctx); particles.render(ctx); renderPlatform(ctx);
        const b = blocks[held];
        if (held >= 0 && b) drawBlock(ctx, b, b.x, b.y, 1.08);
        for (let i = 0; i < nCars; i++) { const f = blocks[i]!; if (f.state === 'fly') drawBlock(ctx, f, f.x, f.y, lerp(1, C / B, clamp01(f.t / 0.2))); }
        renderHelpers(ctx);
      } else { renderResult(ctx); particles.render(ctx); }
      drawCorners(ctx); drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'keyup') { soundButton.pointerUp(soundX, cornerY); return; }
      if (event.type === 'pointerup') { soundButton.pointerUp(soundX, cornerY); if (playable()) pointerUp(); return; }
      const now = performance.now(), menu = (phase === 'choice' || phase === 'rest') && !holdResult;
      if (event.type === 'pointermove') {
        if (playable()) pointerMove(event.info.x, event.info.y);
        else if (menu && now >= inputAfter) { const i = hoverMenu(event.info.x, event.info.y); if (i >= 0) { if (menuSelected < 0) focusAt = now; menuSelected = i; } }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { playSfx(audio, 'button'); exitToHub(); return; }
        cornerFocus = -1;
      } else if (!playable()) {
        // During play every key plays, Escape, Tab and Enter included: there is no wrong button. Keyboard routes to
        // Home exist only after the round (celebration, choice, rest), once its lock or input guard has passed.
        if (phase === 'celebration' ? phaseT < CELEBRATION_LOCK : now < inputAfter) return;
        const code = event.info.code;
        if (code === 'Escape') { exitToHub(); return; }
        if (code === 'Tab') { cornerFocus = (cornerFocus + 2) % 3 - 1; return; }
        if (cornerFocus >= 0) {
          if (code.startsWith('Arrow')) { cornerFocus = 1 - cornerFocus; return; }
          if (code === 'Enter' || code === 'NumpadEnter') {
            if (cornerFocus === 0) exitToHub(); else soundButton.pointerDown(soundX, cornerY);
            return;
          }
          cornerFocus = -1;
        }
      }
      if (phase === 'celebration') { if (phaseT >= CELEBRATION_LOCK) finishCelebration(); return; }
      if (now < inputAfter) return;
      if (playable()) {
        if (event.type === 'pointerdown') pointerDown(event.info.x, event.info.y);
        else keyPress(event.info.key, event.info.code, now);
        return;
      }
      if (!menu) return;
      const n = phase === 'choice' ? pending?.choices.length ?? 1 : 2;
      if (event.type === 'pointerdown') {
        const i = hoverMenu(event.info.x, event.info.y); if (i < 0) return; menuSelected = i;
      } else {
        // The first key only shows focus; arrows move it; a later key acts on what the child can see.
        if (menuSelected < 0) { menuSelected = 0; focusAt = now; return; }
        const code = event.info.code;
        if (code.startsWith('Arrow')) { menuSelected = (menuSelected + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
      }
      if (phase === 'choice') chooseSticker(menuSelected); else leave(menuSelected === 0);
    },
  };
}
