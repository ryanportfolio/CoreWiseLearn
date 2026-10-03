/** Letter Train: carry letter blocks onto the train cars that show the same letter. */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, type SfxOptions } from '../../audio/sfx';
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

export const GAME_ID = 'letter-train';
export interface TierParams { block: number; cars: number; magnet: number }
export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { block: 150, cars: 2, magnet: 1.3 },
  { block: 132, cars: 3, magnet: 1.0 },
  { block: 116, cars: 4, magnet: 0.7 },
];
const MAX_CARS = 6, TRAINS_PER_ROUND = 3, PARTICLES = 220;
/** Geometry in block widths. */
const CAR_W = 2.1, PITCH = 1.89, ENGINE_H = 1.45, FRONT_TOP = 0.135;
const ARRIVE_SECONDS = 2.2, TOOT_SECONDS = 0.9, DEPART_SECONDS = 1.6, STAR_FLIGHT = 0.8;
const CELEBRATION_SECONDS = 4, CELEBRATION_LOCK = 1.5, CHOICE_LOCK = 1.2, REST_LOCK = 0.6;
const IDLE_FIRST = 6, IDLE_REPEAT = 8, HINT_SECONDS = 2.4, DEMO_SECONDS = 3.2;
const LEARN_WINDOW = 12, CLICK_SLOP = 12;
const ART = 'letter-train/';
const WAGONS = ['wagon-red', 'wagon-yellow', 'wagon-green', 'wagon-blue'] as const;
const BLOCKS = ['block-red', 'block-yellow', 'block-green', 'block-blue'] as const;
const BLOCK_INK = ['#b3261e', '#9a6a00', '#2e7d32', '#1f5fa8'] as const;
export const PASSENGERS = ['bunny', 'duckling', 'elephant', 'hippo', 'mouse', 'lamb'] as const;
const BUTTON_PLAY = 'buttons/play-arrow.png', BUTTON_HOME = 'buttons/home.png';
const sprite = (path: string) => `${GAME_ID}:${path}`;
const passengerSticker = (i: number) => `${GAME_ID}-${PASSENGERS[i] ?? 'bunny'}`;
const passengerOf = (id: string) => Math.max(0, PASSENGERS.findIndex((_, i) => passengerSticker(i) === id));

type Phase = 'arrive' | 'play' | 'toot' | 'depart' | 'celebration' | 'choice' | 'sticker' | 'rest';
type BlockState = 'hidden' | 'idle' | 'held' | 'selected' | 'return' | 'fly' | 'placed';
type Source = 'pointer' | 'typed' | 'key' | 'demo';
interface Car {
  letter: string; wagon: number; passenger: number; filled: boolean; block: number;
  hop: number; wiggle: number; plate: number; slot: HTMLCanvasElement | undefined; plateCanvas: HTMLCanvasElement | undefined;
}
interface Block {
  letter: string; color: number; state: BlockState; x: number; y: number; homeX: number; homeY: number;
  fromX: number; fromY: number; t: number; car: number; appear: number; squash: number; canvas: HTMLCanvasElement | undefined;
}
interface Pending {
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
  readonly workMean: number; readonly workMax: number; readonly kbBlock: number; readonly kbCar: number;
  blocks(): { letter: string; x: number; y: number; state: BlockState; size: number }[];
  cars(): { letter: string; x: number; y: number; filled: boolean; open: boolean; size: number }[];
  controls(): { x: number; y: number; w: number; h: number; id: string }[];
  resetWork(): void;
}
export interface LetterTrainScene extends Scene { readonly stats: LetterTrainStats }

const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validate this game's save bag in place; anything malformed falls back and protects the stored document. */
export function sanitizeLetterTrainData(bag: Record<string, unknown>, protect: () => void): void {
  const fix = (key: string, ok: (v: unknown) => boolean, fallback: unknown): void => {
    if (!(key in bag)) { bag[key] = fallback; return; }
    if (!ok(bag[key])) { protect(); bag[key] = fallback; }
  };
  fix('tier', v => v === 0 || v === 1 || v === 2, 0);
  fix('qualifyingRounds', count, 0);
  fix('rounds', count, 0);
  fix('stage', v => v === 0 || v === 1 || v === 2 || v === 3 || v === 4, 0);
  fix('learn', v => Array.isArray(v) && v.length <= LEARN_WINDOW && v.every(n => n === 0 || n === 1), []);
  fix('recentWords', v => Array.isArray(v) && v.length <= WORDS.length && v.every(w => typeof w === 'string'), []);
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!rec(p) || p.stars !== 3 || !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean' || !(p.tier === 0 || p.tier === 1 || p.tier === 2) ||
    !Array.isArray(p.passengers) || p.passengers.length > MAX_CARS || !p.passengers.every(n => count(n) && n < PASSENGERS.length)) {
    protect(); bag.pending = null;
  }
}

function artList(): { name: string; path: string }[] {
  const paths = ['town.webp', 'engine.webp', 'star.webp', 'hand.webp', ...WAGONS.map(w => `${w}.webp`), ...BLOCKS.map(b => `${b}.webp`),
    ...WORDS.map(w => `words/${w}.webp`)];
  return [...paths.map(p => ({ name: sprite(p.replace('.webp', '')), path: ART + p })),
    { name: sprite('play'), path: BUTTON_PLAY }, { name: sprite('home'), path: BUTTON_HOME },
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
  const cars: Car[] = Array.from({ length: MAX_CARS }, () => ({ letter: '', wagon: 0, passenger: 0, filled: false, block: -1, hop: 9, wiggle: 9, plate: 9, slot: undefined, plateCanvas: undefined }));
  const blocks: Block[] = Array.from({ length: MAX_CARS }, () => ({ letter: '', color: 0, state: 'hidden' as BlockState, x: 0, y: 0, homeX: 0, homeY: 0, fromX: 0, fromY: 0, t: 0, car: -1, appear: 0, squash: 9, canvas: undefined }));
  const work = new Float32Array(240);
  const keyOpt: SfxOptions = { index: 0, volume: 0.8 }, tokOpt: SfxOptions = { variant: 'B' }, cheerOpt: SfxOptions = { index: 0, volume: 0.8 };
  const missOpt: SfxOptions = { variant: 'D', volume: 0.8 }, chuffOpt: SfxOptions = { variant: 'C', volume: 0.3 }, tootOpt: SfxOptions = { variant: 'B' };
  const starOpt: SfxOptions = { index: 0 }, hoverOpt: SfxOptions = { volume: 0.6 };
  let data: GameData;
  let W = 1366, H = 768, u = 1, B = 150, bgX = 0, bgY = 0, bgS = 1, trackY = 430, platformTop = 460, platformY = 620;
  let bgCanvas: HTMLCanvasElement | undefined, dimStar: HTMLCanvasElement | undefined, dimStarSize = 0;
  let phase: Phase = 'arrive', tier: Tier = 0, stage: Stage = 0, sceneT = 0, time = 0, phaseT = 0;
  let plans: TrainPlan[] = [], plan: TrainPlan | undefined, trainIndex = 0, nCars = 0, trainOff = 0, parkX = 0, trainL = 0;
  let starsEarned = 0, starFlight = -1, chuffT = 0, tootSquash = 9;
  let hits = 0, misses = 0, motorHits = 0, motorMisses = 0;
  let held = -1, selectedBlock = -1, downX = 0, downY = 0, grabX = 0, grabY = 0, moved = false;
  let kbBlock = 0, kbCar = 0, idleT = 0, nextHintAt = IDLE_FIRST, hintT = -1, hintBlock = -1, hintCar = -1;
  let demoT = -1, demoBlock = -1, demoCar = -1, demoPlaced = false;
  let pending: Pending | null = null, menuSelected = -1, inputAfter = 0;
  let cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1, starRowY = 60, starSize = 64;
  let choiceW = 360, choiceY = 400, restY = 380, restW = 360, controlsY = 680, controlsR = 62;
  let workHead = 0, workCount = 0, updateMs = 0;
  let celebrationHops = 0, warmed = false;
  const roundPassengers: number[] = [];

  const playable = () => phase === 'arrive' || phase === 'play' || phase === 'toot' || phase === 'depart';
  const guard = (seconds: number) => { inputAfter = performance.now() + seconds * 1000; };
  const cw = () => B * CAR_W;
  const wagonH = () => cw() * 211 / 480;
  const engineH = () => B * ENGINE_H;
  const engineW = () => engineH() * 640 / 356;
  const carX = (i: number) => trainOff + cw() / 2 + i * PITCH * B;
  const engineX = () => carX(nCars - 1) + cw() / 2 - 0.08 * B + engineW() / 2;
  const wagonTop = () => trackY - wagonH();
  const slotX = (i: number) => carX(i) - 0.19 * cw();
  const slotY = () => wagonTop() + 0.33 * wagonH() - B / 2;
  const isOpen = (i: number) => {
    if (i < 0 || i >= nCars || cars[i]!.filled) return false;
    if (!plan?.ordered) return true;
    for (let j = 0; j < i; j++) if (!cars[j]!.filled) return false;
    return true;
  };
  const nextOpen = () => { for (let i = 0; i < nCars; i++) if (isOpen(i)) return i; return -1; };
  const onPlatform = (b: Block) => b.state === 'idle' || b.state === 'selected' || b.state === 'return';

  function layout(width: number, height: number): void {
    W = width; H = height;
    u = Math.min(1.4, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    bgS = Math.max(W / 1536, H / 1024); bgX = (W - 1536 * bgS) / 2; bgY = (H - 1024 * bgS) / 2;
    sprites.clearScaled(sprite('town')); bgCanvas = undefined;
    trackY = bgY + 0.548 * 1024 * bgS; platformTop = bgY + 0.585 * 1024 * bgS;
    cornerRadius = Math.max(48, Math.min(60 * u, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    starSize = Math.round(Math.max(44, 64 * u)); starRowY = cornerY;
    if (dimStarSize !== starSize) dimStar = undefined;
    // A rider (wagon plus passenger) reaches 0.62 widths above its centre and 0.23 below.
    const top = starRowY + starSize / 2 + 14;
    choiceW = Math.max(150, Math.min(440 * u + 60, (W - 72) / 2, (H - 24 - top) / 0.92));
    choiceY = top + choiceW * 0.66;
    controlsR = Math.max(52, Math.min(66 * u, W / 6));
    controlsY = H - controlsR - 22;
    restW = Math.max(150, Math.min(choiceW * 1.05, W * 0.6, (controlsY - controlsR - 14 - top) / 0.88));
    restY = top + restW * 0.64;
    if (plan) fitTrain();
  }
  /** Block size and train position for the current plan at the current view size. */
  function fitTrain(): void {
    const base = Math.max(96, TIERS[tier].block * u);
    const room = (W - 32) / (Math.max(1, nCars) * PITCH + 0.3 + ENGINE_H * 640 / 356);
    const below = (H - platformTop - 16) / 1.2, above = (trackY - starRowY - starSize / 2 - 12) / 1.65;
    const next = Math.round(Math.max(96, Math.min(base, room, below, above)));
    if (next !== B) { B = next; for (const c of cars) { c.slot = undefined; c.plateCanvas = undefined; } for (const b of blocks) b.canvas = undefined; }
    trainL = engineX() - trainOff + engineW() / 2;
    const oldPark = parkX;
    // Narrow screens: keep every car in view and let the engine run off the right edge.
    parkX = trainL > W - 16 ? 8 : (W - trainL) / 2;
    if (phase === 'play' || phase === 'toot') trainOff = parkX; else if (phase === 'arrive') trainOff += parkX - oldPark;
    platformY = Math.min(H - B / 2 - 10, Math.max(platformTop + B * 0.62, platformTop + (H - platformTop) * 0.5));
    const n = nCars, spacing = Math.min(B * 1.4, (W - 24) / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const b = blocks[i]!; b.homeX = W / 2 + (i - (n - 1) / 2) * spacing; b.homeY = platformY;
      if (b.state === 'idle' || b.state === 'hidden') { b.x = b.homeX; b.y = b.homeY; }
    }
  }
  function perTrainLetters(): number {
    return Math.max(1, Math.floor(((W - 32) / 96 - 0.3 - ENGINE_H * 640 / 356) / PITCH));
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    const name = sprite('town'); if (!sprites.get(name)) return;
    bgCanvas = sprites.scaled(name, bgS);
  }
  function ensureDimStar(): void {
    if (dimStar) return;
    const img = sprites.get(sprite('star')); if (!img) return;
    const c = document.createElement('canvas'); c.width = c.height = starSize;
    const g = c.getContext('2d'); if (!g) return;
    const s = starSize / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    g.drawImage(img, (starSize - w) / 2, (starSize - h) / 2, w, h);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(92, 62, 34, 0.72)'; g.fillRect(0, 0, starSize, starSize);
    dimStar = c; dimStarSize = starSize;
  }
  function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | undefined {
    const c = document.createElement('canvas'); c.width = c.height = Math.max(1, Math.round(size));
    const g = c.getContext('2d'); return g ? [c, g] : undefined;
  }
  function blockCanvas(b: Block): HTMLCanvasElement | undefined {
    if (b.canvas) return b.canvas;
    const img = sprites.get(sprite(BLOCKS[b.color]!)), made = makeCanvas(B);
    if (!img || !made) return undefined;
    const [c, g] = made; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    bakeLetter(g, b.letter, c.width / 2, c.height / 2, c.width * 0.56, BLOCK_INK[b.color]!);
    b.canvas = c; return c;
  }
  function slotCanvas(car: Car): HTMLCanvasElement | undefined {
    if (car.slot) return car.slot;
    const made = makeCanvas(B); if (!made) return undefined;
    const [c, g] = made, s = c.width, line = Math.max(3, s * 0.035);
    roundedRect(g, line, line, s - line * 2, s - line * 2, s * 0.14); g.fillStyle = '#f7ead0'; g.fill();
    g.setLineDash([s * 0.09, s * 0.06]); g.lineWidth = line; g.strokeStyle = '#8a6440'; g.stroke(); g.setLineDash([]);
    bakeLetter(g, car.letter, s / 2, s / 2, s * 0.58, '#6d4a2b');
    car.slot = c; return c;
  }
  function plateCanvas(car: Car): HTMLCanvasElement | undefined {
    if (car.plateCanvas) return car.plateCanvas;
    const made = makeCanvas(B * 0.42); if (!made) return undefined;
    const [c, g] = made, s = c.width;
    roundedRect(g, 2, 2, s - 4, s - 4, s * 0.2); g.fillStyle = '#fff6df'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#5a3b22'; g.stroke();
    bakeLetter(g, car.letter, s / 2, s / 2, s * 0.62, '#3d2a1a');
    car.plateCanvas = c; return c;
  }

  /** Bake at most one missing slot or block canvas per update, so a new train never bakes them all in one frame. */
  function bakeNext(): void {
    for (let i = 0; i < nCars; i++) if (!cars[i]!.slot) { slotCanvas(cars[i]!); return; }
    for (let i = 0; i < nCars; i++) if (!blocks[i]!.canvas) { blockCanvas(blocks[i]!); return; }
  }
  /** Scale the art this view needs once the files are decoded, outside the frame loop. */
  function warm(): void {
    warmed = true; ensureBackground(); ensureDimStar();
    const scale = (name: string, size: number) => { const img = sprites.get(name); if (img) sprites.scaled(name, Math.round(size) / Math.max(img.naturalWidth, img.naturalHeight)); };
    scale(sprite('engine'), engineW()); scale(sprite('star'), starSize);
    for (const w of WAGONS) scale(sprite(w), Math.round(cw()));
    for (let i = 0; i < PASSENGERS.length; i++) scale(stickerSpriteName(passengerSticker(i)), Math.round(B * 0.98));
  }

  // ---------------------------------------------------------------- round flow
  function startRound(): void {
    pending = null; data.pending = null;
    tier = services.debug.tier ?? toTier(data.tier);
    stage = options.stage ?? toStage(data.stage);
    hits = misses = motorHits = motorMisses = 0; starsEarned = 0; starFlight = -1; roundPassengers.length = 0;
    const name = services.profile()?.unnamed ? '' : services.profile()?.name ?? '';
    plans = planRound(stage, TIERS[tier].cars, perTrainLetters(), name, random, data.recentWords).slice(0, TRAINS_PER_ROUND);
    for (const p of plans) if (p.word) { data.recentWords = [...data.recentWords.filter(w => w !== p.word), p.word].slice(-4); }
    trainIndex = 0; particles.clear(); startTrain(); services.save.flush();
  }
  function startTrain(): void {
    plan = plans[trainIndex];
    if (!plan) return;
    const stageCars = plan.stage <= 2 ? Math.min(plan.cars.length, Math.max(1, Math.min(TIERS[tier].cars, perTrainLetters()))) : plan.cars.length;
    nCars = Math.min(MAX_CARS, stageCars);
    const passengers = [0, 1, 2, 3, 4, 5].sort(() => random() - 0.5);
    const wagonStart = Math.floor(random() * WAGONS.length);
    for (let i = 0; i < MAX_CARS; i++) {
      const c = cars[i]!;
      Object.assign(c, { letter: plan.cars[i] ?? '', wagon: (wagonStart + i) % WAGONS.length, passenger: passengers[i % 6]!, filled: false, block: -1, hop: 9, wiggle: 9, plate: 9, slot: undefined, plateCanvas: undefined });
    }
    const order = Array.from({ length: nCars }, (_, i) => i);
    for (let k = 0; k < 6; k++) { order.sort(() => random() - 0.5); if (nCars < 2 || order.some((v, i) => v !== i)) break; }
    for (let i = 0; i < MAX_CARS; i++) {
      const b = blocks[i]!;
      Object.assign(b, { letter: i < nCars ? plan.blocks[order[i]!]! : '', color: Math.floor(random() * BLOCKS.length), state: 'hidden', car: -1, t: 0, appear: 1.15 + i * 0.13, squash: 9, canvas: undefined });
    }
    held = selectedBlock = -1; kbBlock = 0; kbCar = 0; hintT = -1; demoT = -1;
    phase = 'arrive'; phaseT = 0; chuffT = 0;
    fitTrain(); trainOff = -trainL - 60;
    playSfx(audio, 'whoosh');
  }
  function beginPlay(): void {
    phase = 'play'; phaseT = 0; trainOff = parkX; idleT = 0; nextHintAt = IDLE_FIRST;
    for (let i = 0; i < nCars; i++) { const b = blocks[i]!; if (b.state === 'hidden') { b.state = 'idle'; b.x = b.homeX; b.y = b.homeY; } }
    ensureKb();
    if (data.rounds === 0 && trainIndex === 0 && !services.debug.enabled) startDemo();
    else if (data.rounds === 0 && trainIndex === 0 && new URLSearchParams(location.search).has('demo')) startDemo();
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
    phase = 'depart'; phaseT = 0; chuffT = 0; starFlight = 0; playSfx(audio, 'whoosh');
  }
  function trainGone(): void {
    for (let i = 0; i < nCars; i++) if (!roundPassengers.includes(cars[i]!.passenger)) roundPassengers.push(cars[i]!.passenger);
    starsEarned = Math.min(TRAINS_PER_ROUND, starsEarned + 1); starFlight = -1;
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
      if (n >= 4 && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
      else if (n >= 8 && rate >= 0.9) {
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
    pending = { stars: 3, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, passengers, tier };
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
    if (pending?.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; menuSelected = -1; guard(CHOICE_LOCK); }
    else enterRest();
  }
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
  function leave(replay: boolean): void {
    if (phase !== 'rest') return;
    data.pending = null; pending = null; services.save.flush(); playSfx(audio, replay ? 'whoosh' : 'button');
    if (replay) startRound(); else services.nav.toHub();
  }
  function exitToHub(): void { services.save.flush(); services.nav.toHub(); }

  // ---------------------------------------------------------------- placing blocks
  let fx = 0, fy = 0, fh = 0;
  const fillChip = (p: ParticleSpawn, i: number): void => {
    const a = (i / 12) * Math.PI * 2 + random() * 0.4, v = (140 + random() * 120) * u;
    p.x = fx + Math.cos(a) * B * 0.3; p.y = fy + Math.sin(a) * B * 0.3; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 90 * u;
    p.life = 0.45 + random() * 0.25; p.size = (4 + random() * 4) * u; p.endSize = 1; p.gravity = 420 * u;
    p.hue = i % 3 === 0 ? 48 : fh; p.saturation = 85; p.lightness = i % 3 === 0 ? 62 : 55; p.alpha = 0.95;
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
    for (let i = 0; i < nCars; i++) if (isOpen(i) && matches(b.letter, cars[i]!.letter)) { cars[i]!.wiggle = 0; kbCar = i; playSfx(audio, 'hover', hoverOpt); return; }
    const next = nextOpen();
    if (next >= 0) {
      cars[next]!.wiggle = 0; kbCar = next; playSfx(audio, 'hover', hoverOpt);
      for (let i = 0; i < nCars; i++) if (onPlatform(blocks[i]!) && matches(blocks[i]!.letter, cars[next]!.letter)) { blocks[i]!.squash = 0; kbBlock = i; break; }
    }
  }
  function record(hit: boolean, source: Source): void {
    if (source !== 'pointer' && !(source === 'typed' && hit)) return;
    if (hit) hits++; else misses++;
    data.learn.push(hit ? 1 : 0);
    if (data.learn.length > LEARN_WINDOW) data.learn.splice(0, data.learn.length - LEARN_WINDOW);
  }
  function attempt(index: number, car: number, source: Source): void {
    const b = blocks[index]; if (!b || phase !== 'play') return;
    if (held === index) held = -1;
    if (selectedBlock === index) selectedBlock = -1;
    if (car < 0 || cars[car]!.filled) { sendHome(b); return; }
    if (!isOpen(car)) { sendHome(b); wiggleHome(b); playSfx(audio, 'miss', missOpt); return; }
    const c = cars[car]!;
    if (!matches(b.letter, c.letter)) {
      record(false, source); sendHome(b); wiggleHome(b); playSfx(audio, 'miss', missOpt); return;
    }
    record(true, source);
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
    fx = slotX(b.car); fy = slotY(); fh = [8, 45, 120, 210][b.color] ?? 40; particles.burst(12, fillChip);
    if (demoT >= 0 && b.car === demoCar) demoPlaced = true;
    if (allFilled()) toot();
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
    const top = slotY() - B / 2 - B * 0.15, bottom = trackY + 6;
    for (let i = 0; i < nCars; i++) {
      if (cars[i]!.filled) continue;
      const d = Math.hypot(x - slotX(i), y - slotY());
      const inside = Math.abs(x - carX(i)) <= cw() / 2 && y >= top && y <= bottom;
      if ((inside || d <= pull) && d < distance) { best = i; distance = d; }
    }
    return best;
  }
  const pullRadius = () => Math.max(B * 0.7, TIERS[tier].magnet * B);
  function ensureKb(): void {
    const kb = blocks[kbBlock];
    if (!kb || kbBlock >= nCars || !onPlatform(kb)) {
      kbBlock = -1;
      for (let i = 0; i < nCars; i++) if (onPlatform(blocks[i]!)) { kbBlock = i; break; }
    }
    if (!isOpen(kbCar)) kbCar = nextOpen();
  }
  function select(index: number): void {
    const b = blocks[index]!;
    if (selectedBlock >= 0 && selectedBlock !== index) sendHome(blocks[selectedBlock]!);
    selectedBlock = index; b.state = 'selected'; b.t = 0; kbBlock = index;
    keyOpt.index = Math.max(0, letterIndex(b.letter)); playSfx(audio, 'key', keyOpt);
  }
  function pointerDown(x: number, y: number): void {
    idleT = 0; nextHintAt = IDLE_FIRST; hintT = -1;
    if (demoT >= 0) endDemo();
    if (phase !== 'play') return;
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
      held = hitBlock; b.state = 'held'; moved = false; downX = x; downY = y; grabX = b.x - x; grabY = b.y - y; kbBlock = hitBlock;
      keyOpt.index = Math.max(0, letterIndex(b.letter)); playSfx(audio, 'key', keyOpt);
      return;
    }
    // A tap on a car says hello: its passenger hops.
    for (let i = 0; i < nCars; i++) if (Math.abs(x - carX(i)) < cw() / 2 && y > slotY() - B && y < trackY) { cars[i]!.hop = 0; return; }
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
  function keyPress(key: string, code: string): void {
    idleT = 0; nextHintAt = IDLE_FIRST; hintT = -1;
    if (demoT >= 0) endDemo();
    if (phase !== 'play') return;
    ensureKb();
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      const step = code === 'ArrowLeft' ? -1 : 1;
      for (let k = 1; k <= nCars; k++) {
        const i = (kbBlock + step * k + nCars * 2) % nCars;
        if (onPlatform(blocks[i]!)) { kbBlock = i; keyOpt.index = Math.max(0, letterIndex(blocks[i]!.letter)); playSfx(audio, 'key', keyOpt); break; }
      }
      return;
    }
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const step = code === 'ArrowUp' ? -1 : 1;
      for (let k = 1; k <= nCars; k++) {
        const i = (kbCar + step * k + nCars * 2) % nCars;
        if (isOpen(i)) { kbCar = i; cars[i]!.wiggle = 0.6; playSfx(audio, 'hover', hoverOpt); break; }
      }
      return;
    }
    if (key.length === 1 && /\p{L}/u.test(key)) {
      let typed = -1;
      for (let i = 0; i < nCars; i++) if (onPlatform(blocks[i]!) && blocks[i]!.letter.toLowerCase() === key.toLowerCase()) { typed = i; break; }
      if (typed >= 0) {
        const b = blocks[typed]!; let car = -1;
        for (let i = 0; i < nCars; i++) if (isOpen(i) && matches(b.letter, cars[i]!.letter)) { car = i; break; }
        if (car < 0) { b.squash = 0; wiggleHome(b); return; }
        if (selectedBlock >= 0 && selectedBlock !== typed) { sendHome(blocks[selectedBlock]!); selectedBlock = -1; }
        attempt(typed, car, 'typed'); return;
      }
    }
    if (kbBlock < 0 || kbCar < 0) return;
    if (selectedBlock >= 0 && selectedBlock !== kbBlock) { sendHome(blocks[selectedBlock]!); selectedBlock = -1; }
    attempt(kbBlock, kbCar, 'key');
  }

  // ---------------------------------------------------------------- update
  function updateBlocks(dt: number): void {
    for (let i = 0; i < nCars; i++) {
      const b = blocks[i]!;
      b.squash += dt;
      if (b.state === 'hidden') { if (phase === 'arrive' && phaseT >= b.appear) { b.state = 'idle'; b.x = b.homeX; b.y = b.homeY; b.t = 0; } continue; }
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
    if (demoT >= 0.9 && demoT < 2.2 && b.state === 'idle') { b.state = 'held'; held = demoBlock; keyOpt.index = Math.max(0, letterIndex(b.letter)); playSfx(audio, 'key', keyOpt); }
    if (b.state === 'held' && demoT < 2.2) {
      const k = easeInOutSine((demoT - 1.1) / 1.0);
      b.x = lerp(b.homeX, slotX(demoCar), k); b.y = lerp(b.homeY, slotY(), k) - Math.sin(clamp01((demoT - 1.1) / 1.0) * Math.PI) * B * 0.4;
    }
    if (demoT >= 2.2 && b.state === 'held') { held = -1; attempt(demoBlock, demoCar, 'demo'); }
    if (demoT >= DEMO_SECONDS) demoT = -1;
  }
  function hintTarget(): void {
    hintCar = nextOpen(); hintBlock = -1;
    if (hintCar < 0) return;
    for (let i = 0; i < nCars; i++) if (onPlatform(blocks[i]!) && matches(blocks[i]!.letter, cars[hintCar]!.letter)) { hintBlock = i; break; }
  }
  function updatePlay(dt: number): void {
    phaseT += dt;
    if (phase === 'arrive' || phase === 'play') bakeNext();
    if (phase === 'arrive') {
      const k = easeOutCubic(phaseT / ARRIVE_SECONDS);
      trainOff = lerp(-trainL - 60, parkX, k);
      chuffT -= dt;
      if (chuffT <= 0 && k < 0.97) { chuffT = 0.3 + k * 0.25; chuffOpt.volume = 0.3 * (1 - k * 0.6); playSfx(audio, 'tick', chuffOpt); puff(1); }
      if (phaseT >= ARRIVE_SECONDS) beginPlay();
    } else if (phase === 'play') {
      if (held < 0 && selectedBlock < 0 && demoT < 0) idleT += dt;
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
      trainOff = lerp(parkX, W + 60, k);
      chuffT -= dt;
      if (chuffT <= 0 && k < 0.8) { chuffT = 0.3 - k * 0.15; chuffOpt.volume = 0.3; playSfx(audio, 'tick', chuffOpt); puff(1); }
      if (starFlight >= 0) {
        starFlight += dt;
        if (starFlight >= STAR_FLIGHT && starFlight - dt < STAR_FLIGHT) { starOpt.index = starsEarned; playSfx(audio, 'star', starOpt); }
      }
      if (phaseT >= DEPART_SECONDS && starFlight >= STAR_FLIGHT) trainGone();
    }
    for (let i = 0; i < MAX_CARS; i++) { const c = cars[i]!; c.hop += dt; c.wiggle += dt; c.plate += dt; }
    updateBlocks(dt);
  }
  function updateResult(dt: number): void {
    phaseT += dt;
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
      const wagon = sprite(WAGONS[c.wagon]!);
      drawSprite(ctx, sprites, wagon, wx, bottom - wh / 2, Math.round(width));
      // Passenger sits behind the wagon front; a hop on every click-in.
      const hop = c.hop < 0.6 ? Math.sin((c.hop / 0.6) * Math.PI) * B * 0.42 : 0;
      const sway = phase === 'play' ? Math.sin(time * 2.2 + i * 1.7) * 2 * u : 0;
      drawSprite(ctx, sprites, stickerSpriteName(passengerSticker(c.passenger)), wx + 0.24 * width, bottom - wh * 0.5 - B * 0.42 - hop + sway, Math.round(B * 0.98));
      const sx = slotX(i) + wig * width * 0.4, sy = slotY() + bottom - trackY;
      if (!c.filled) {
        const slot = slotCanvas(c);
        if (slot) {
          const dim = plan.ordered && !isOpen(i);
          if (dim) ctx.globalAlpha = 0.5;
          ctx.drawImage(slot, sx - B / 2, sy - B / 2, B, B);
          if (dim) ctx.globalAlpha = 1;
        }
        if (phase === 'play' && plan.ordered && isOpen(i)) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4);
          roundedRect(ctx, sx - B / 2 - 6, sy - B / 2 - 6, B + 12, B + 12, B * 0.18);
          ctx.lineWidth = 4 + pulse * 3; ctx.strokeStyle = '#ffe066'; ctx.stroke();
        }
      } else {
        const b = blocks[c.block];
        if (b && b.state === 'placed') drawBlock(ctx, b, sx, sy, 1);
      }
      drawWagonFront(ctx, wagon, wx, bottom, Math.round(width));
      if (c.filled && c.plate < 9) {
        const plate = plateCanvas(c);
        if (plate) {
          const s = B * 0.42 * (c.plate < 0.35 ? easeOutBack(c.plate / 0.35) : 1);
          ctx.drawImage(plate, wx - s / 2, bottom - wh * 0.6 - s / 2, s, s);
        }
      }
    }
    const ex = engineX();
    if (ex - engineW() / 2 < W + 20 && ex + engineW() / 2 > -20) {
      const sq = phase === 'toot' && tootSquash < 0.5 ? Math.sin((tootSquash / 0.5) * Math.PI * 2) * 0.05 : 0;
      drawSprite(ctx, sprites, sprite('engine'), ex, trackY - engineH() / 2 * (1 + sq) - bob, Math.round(engineW()), 0, 1 - sq * 0.6, 1 + sq);
      if (plan.word) {
        const size = B * 1.05, py = trackY - engineH() - size * 0.56;
        // Keep the picture clear of the sound button on short screens.
        const px = py - size / 2 < cornerY + cornerRadius + 8 ? Math.min(ex, soundX - cornerRadius - size / 2 - 14) : ex;
        chunkyPanel(ctx, px - size / 2, py - size / 2, size, size, '#fff3d6', '#6d4a2b', size * 0.16, 5);
        drawSprite(ctx, sprites, sprite(`words/${plan.word}`), px, py, Math.round(size * 0.84));
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
      if (phase === 'play' && i === kbBlock) {
        roundedRect(ctx, b.x - B / 2 - 9, y - B / 2 - 9, B + 18, B + 18, B * 0.2);
        ctx.lineWidth = 10; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#ffe066'; ctx.stroke();
      }
    }
    if (phase === 'play' && kbCar >= 0) {
      const x = slotX(kbCar), y = slotY() - B / 2 - 16 - Math.abs(Math.sin(time * 3)) * 6 * u, s = Math.max(14, 20 * u);
      ctx.beginPath(); ctx.moveTo(x - s, y - s * 1.2); ctx.lineTo(x + s, y - s * 1.2); ctx.lineTo(x, y); ctx.closePath();
      ctx.fillStyle = '#ffe066'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.stroke();
    }
  }
  function drawHand(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, press: number, alpha: number): void {
    const size = Math.max(96, B * 0.95), w = size * 209 / 220;
    if (alpha < 1) ctx.globalAlpha = alpha;
    drawSprite(ctx, sprites, sprite('hand'), tipX + w * 0.4, tipY + size * 0.42, Math.round(size), 0, 1 + press * 0.08, 1 - press * 0.08);
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
      let tx: number, ty: number, alpha = 1;
      if (hintT < 0.55) { const k = easeOutCubic(hintT / 0.55); tx = lerp(b.homeX + W * 0.12, b.homeX, k); ty = lerp(H + 40, b.homeY, k); alpha = clamp01(hintT / 0.25); }
      else if (hintT < 0.9) { tx = b.homeX; ty = b.homeY; }
      else if (hintT < 1.8) {
        const k = easeInOutSine((hintT - 0.9) / 0.9);
        tx = lerp(b.homeX, slotX(hintCar), k); ty = lerp(b.homeY, slotY(), k) - Math.sin(k * Math.PI) * B * 0.35;
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
      if (i < starsEarned) drawSprite(ctx, sprites, sprite('star'), x, starRowY, starSize);
      else if (dimStar) ctx.drawImage(dimStar, x - starSize / 2, starRowY - starSize / 2, starSize, starSize);
    }
    if (starFlight >= 0 && phase === 'depart') {
      const k = clamp01(starFlight / STAR_FLIGHT), e = easeInOutSine(k);
      const sx = Math.min(W - 40, Math.max(40, engineX())), sy = trackY - engineH();
      const x = lerp(sx, W / 2 + (starsEarned - 1) * gap, e), y = lerp(sy, starRowY, e) - Math.sin(k * Math.PI) * 80 * u;
      drawSprite(ctx, sprites, sprite('star'), x, y, starSize, k * Math.PI * 2, 1 + (1 - k) * 0.4, 1 + (1 - k) * 0.4);
    }
  }
  function drawRider(ctx: CanvasRenderingContext2D, passenger: number, wagon: number, x: number, y: number, width: number, hop = 0): void {
    const name = sprite(WAGONS[wagon % WAGONS.length]!), wh = width * 211 / 480, bottom = y + wh / 2;
    drawSprite(ctx, sprites, name, x, y, Math.round(width));
    drawSprite(ctx, sprites, stickerSpriteName(passengerSticker(passenger)), x, bottom - wh * 0.62 - width * 0.24 - hop, Math.round(width * 0.62));
    drawWagonFront(ctx, name, x, bottom, Math.round(width));
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
    for (let i = 0; i < 3; i++) {
      const x = W / 2 + (i - 1) * gap;
      if (phase === 'celebration') {
        const local = phaseT - 0.3 - i * 0.45;
        if (dimStar) ctx.drawImage(dimStar, x - starSize / 2, starRowY - starSize / 2, starSize, starSize);
        if (local > 0) { const s = slamScale(local / 0.4, 0.8); drawSprite(ctx, sprites, sprite('star'), x, starRowY, starSize, 0, s, s); }
      } else drawSprite(ctx, sprites, sprite('star'), x, starRowY, starSize);
    }
    if (phase === 'celebration' && pending) {
      const n = pending.passengers.length, size = Math.min(B * 1.1, (W - 60) / Math.max(1, n) * 0.8);
      for (let i = 0; i < n; i++) {
        const jump = Math.abs(Math.sin(phaseT * 5.2 + i * 1.1)) * size * 0.35;
        drawSprite(ctx, sprites, stickerSpriteName(passengerSticker(pending.passengers[i]!)), W / 2 + (i - (n - 1) / 2) * size * 1.15, platformY - jump, Math.round(size));
      }
      return;
    }
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
      drawRider(ctx, chosen, index + 1, x, y, lerp(choiceW, restW, e));
    } else {
      // Rewards off or the set is complete: the round's first passenger rides along, offered nothing.
      drawRider(ctx, pending?.passengers[0] ?? 0, 2, W / 2, restY, restW);
    }
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i);
      chunkyCircle(ctx, x, controlsY, controlsR, '#a3c9c5', OUTLINE, 5);
      drawSprite(ctx, sprites, sprite(i === 0 ? 'play' : 'home'), x, controlsY, Math.round(controlsR * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsR);
    }
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    chunkyCircle(ctx, homeX, cornerY, cornerRadius, '#a3c9c5', OUTLINE, 4);
    drawSprite(ctx, sprites, sprite('home'), homeX, cornerY, Math.round(cornerRadius * 1.3));
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
    get particles() { return particles.alive; }, get kbBlock() { return kbBlock; }, get kbCar() { return kbCar; },
    get workMean() { let s = 0; for (let i = 0; i < workCount; i++) s += work[i]!; return workCount ? s / workCount : 0; },
    get workMax() { let m = 0; for (let i = 0; i < workCount; i++) m = Math.max(m, work[i]!); return m; },
    blocks() { return blocks.slice(0, nCars).map(b => ({ letter: b.letter, x: b.x, y: b.y, state: b.state, size: B })); },
    cars() { return cars.slice(0, nCars).map((c, i) => ({ letter: c.letter, x: slotX(i), y: slotY(), filled: c.filled, open: isOpen(i), size: B })); },
    controls() {
      if (phase === 'choice') return (pending?.choices ?? []).map((id, i) => ({ x: choiceX(i), y: choiceY - choiceW * 0.1, w: choiceW, h: choiceW * 0.6, id }));
      if (phase === 'rest') return [0, 1].map(i => ({ x: controlX(i), y: controlsY, w: controlsR * 2, h: controlsR * 2, id: i === 0 ? 'again' : 'home' }));
      return [];
    },
    resetWork() { workHead = workCount = 0; },
  };

  return {
    stats,
    enter() {
      void loadLetterTrainArt(services).then(() => warm());
      data = services.save.gameData<GameData>(GAME_ID, { tier: 0, qualifyingRounds: 0, rounds: 0, stage: 0, learn: [], recentWords: [], pending: null });
      sanitizeLetterTrainData(data, () => services.save.protect());
      data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; startMusic(audio, 'letter-train');
      layout(services.canvas.width, services.canvas.height);
      // A return visit has the art decoded already: scale it now, before the first frame.
      if (sprites.get(sprite('town'))) warm();
      if (data.pending) {
        pending = data.pending; tier = pending.tier; stage = options.stage ?? toStage(data.stage); starsEarned = 3;
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; menuSelected = -1; guard(CHOICE_LOCK); }
        else enterRest();
      } else startRound();
    },
    pause() { stopMusic(audio); services.save.flush(); },
    resume() { guard(0.35); startMusic(audio, 'letter-train'); },
    exit() { stopMusic(audio); services.save.flush(); },
    resize: layout,
    update(dt) {
      const started = performance.now(); time += dt; sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      if (playable()) updatePlay(dt); else updateResult(dt);
      particles.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H) layout(view.width, view.height);
      if (warmed) ensureBackground();
      if (bgCanvas) ctx.drawImage(bgCanvas, bgX, bgY, bgCanvas.width / sprites.pixelRatio, bgCanvas.height / sprites.pixelRatio);
      else { ctx.fillStyle = '#9fd3f0'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#e2b16f'; ctx.fillRect(0, trackY, W, H - trackY); }
      if (playable()) {
        renderStarRow(ctx); renderTrain(ctx); particles.render(ctx); renderPlatform(ctx);
        const b = blocks[held];
        if (held >= 0 && b) drawBlock(ctx, b, b.x, b.y, 1.08);
        for (let i = 0; i < nCars; i++) { const f = blocks[i]!; if (f.state === 'fly') drawBlock(ctx, f, f.x, f.y, 1); }
        renderHelpers(ctx);
      } else { renderResult(ctx); particles.render(ctx); }
      drawCorners(ctx); drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'keyup') { soundButton.pointerUp(soundX, cornerY); return; }
      if (event.type === 'pointerup') { soundButton.pointerUp(soundX, cornerY); if (playable()) pointerUp(); return; }
      if (event.type === 'pointermove') {
        if (playable()) pointerMove(event.info.x, event.info.y);
        else if ((phase === 'choice' || phase === 'rest') && performance.now() >= inputAfter) { const i = hoverMenu(event.info.x, event.info.y); if (i >= 0) menuSelected = i; }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { playSfx(audio, 'button'); exitToHub(); return; }
        cornerFocus = -1;
      } else {
        const code = event.info.code;
        if (code === 'Escape') { exitToHub(); return; }
        if (code === 'Tab') { cornerFocus = (cornerFocus + 2) % 3 - 1; return; }
        if (cornerFocus >= 0) {
          if (code.startsWith('Arrow')) { cornerFocus = 1 - cornerFocus; return; }
          if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
            if (cornerFocus === 0) exitToHub(); else soundButton.pointerDown(soundX, cornerY);
            return;
          }
          cornerFocus = -1;
        }
      }
      if (phase === 'celebration') { if (phaseT >= CELEBRATION_LOCK) finishCelebration(); return; }
      if (performance.now() < inputAfter) return;
      if (playable()) {
        if (event.type === 'pointerdown') pointerDown(event.info.x, event.info.y);
        else keyPress(event.info.key, event.info.code);
        return;
      }
      if (phase !== 'choice' && phase !== 'rest') return;
      const n = phase === 'choice' ? pending?.choices.length ?? 1 : 2;
      if (event.type === 'pointerdown') {
        const i = hoverMenu(event.info.x, event.info.y); if (i < 0) return; menuSelected = i;
      } else {
        // The first key only shows focus; arrows move it; the next key acts.
        if (menuSelected < 0) { menuSelected = 0; return; }
        const code = event.info.code;
        if (code.startsWith('Arrow')) { menuSelected = (menuSelected + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
      }
      if (phase === 'choice') chooseSticker(menuSelected); else leave(menuSelected === 0);
    },
  };
}
