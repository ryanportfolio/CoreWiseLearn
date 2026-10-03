/**
 * Bubble Pop: bubbles carrying sea creatures rise from the sea floor; the
 * child pops them with a click, a hover (easiest tier) or any key. A counter
 * grows with every pop and the result screen counts the creatures out in
 * rows of ten. No game over: misses only ease the difficulty.
 *
 * Performance: this is the busiest scene. Bubbles, bursts and hops live in
 * preallocated pools, update and render allocate nothing of their own, and
 * every sprite is drawn at one fixed size per tier so the scaled-sprite cache
 * holds at most three sizes per image.
 */

import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import { createAdaptiveTier, type Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, type SfxOptions } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, chunkyPanel, drawSprite, roundedRect, OUTLINE } from '../../ui/draw';
import { createButton, dispatchDown, dispatchUp, MIN_HIT } from '../../ui/button';
import { arriveAlpha, arriveScale, clamp01, easeInCubic, easeOutCubic, lerp, slamScale, SLAM_CONTACT } from '../../ui/tween';
import { confettiBurst, confettiRain, drawCounter, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade, reducedMotion } from '../../ui/motion';
import { OCEAN_THEME, spriteName, type BubbleTheme } from './theme';

export const GAME_ID = 'bubble-pop';

export interface TierParams {
  /** Bubble diameter in px at the 1366x768 design size. */
  diameter: number;
  /** Rise speed, px/s at design size. */
  speed: number;
  /** Seconds between spawns. */
  interval: number;
  /** Most bubbles alive at once. */
  maxLive: number;
  /** Grumpy urchins drift up among the bubbles. */
  decoys: boolean;
}

/** Placeholders to tune with real children. */
export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { diameter: 170, speed: 70, interval: 1.3, maxLive: 5, decoys: false },
  { diameter: 135, speed: 110, interval: 0.9, maxLive: 7, decoys: false },
  { diameter: 110, speed: 150, interval: 0.65, maxLive: 9, decoys: true },
];

export const ROUND_SECONDS = 75;
const COMBO_WINDOW = 1.2;
const COMBO_MILESTONE = 5;
const HIT_SCALE = 1.3;
const DWELL_SECONDS = 0.15;
const POOL_SIZE = 24;
const FX_POOL_SIZE = 24;
const PARTICLE_CAPACITY = 600;
const POP_PARTICLES = 18;
/** Burst: full size in under three frames, then a slow drift while the ring thins. */
const BURST_SECONDS = 0.35;
const BURST_GROW = 0.04;
/** The burst sprite holds for the hit frame, then goes first; the ring and the sparks outlast it. */
const BURST_HOLD = 0.08;
const BURST_FADE = 0.12;
/** Big burst scale; kept so the burst covers well under 20 percent of the frame at the easiest tier. */
const BIG_BURST = 1.7;
/** Creature hop: launch stretched (0.6 wide by 1.4 tall), land squashed (1.4 by 0.6), back to 1 at 1.75 per second. */
const HOP_AIR = 0.34;
const HOP_SQUASH = 0.4;
const HOP_RECOVER = 1.75;
const HOP_EXIT_AT = 0.62;
const HOP_SECONDS = 0.84;
/** Scene freeze on a combo milestone: three frames, never more, none on ordinary pops. */
const HITSTOP_SECONDS = 0.05;
/** Any-key pops are limited to one per 120 ms, about as fast as a child can click. */
const KEY_COOLDOWN = 0.12;
/** Result timeline. Each tally creature slams in; its tick plays on touchdown. */
const GRID_SLAM = 0.2;
const GRID_HIT = GRID_SLAM * SLAM_CONTACT;
/** Quiet gap between the last star and the fanfare. */
const FANFARE_GAP = 0.3;
/** Holds with only twinkle and sway: after the last star lands, and after the sticker lands. */
const STAR_HOLD = 1.6;
const STICKER_HOLD = 1.6;
/** Sticker: flies in for STICKER_FLY, then slams down; it touches down at STICKER_HIT. */
const STICKER_FLY = 0.3;
const STICKER_SLAM = 0.35;
const STICKER_HIT = STICKER_FLY + STICKER_SLAM * SLAM_CONTACT;
const TUTORIAL_RISE_SECONDS = 1.6;
const TUTORIAL_TIMEOUT = 6;
const MAX_DECOYS = 2;
const DECOY_CHANCE = 0.2;
const EXPECTED_FACTOR = 0.7;
const ENDING_ACCEL = 700;
const ENDING_MAX_SECONDS = 3.5;
const MAX_TALLY = 512;
const WORK_SAMPLES = 240;
const DESIGN_W = 1366;
const DESIGN_H = 768;

const BUTTON_PLAY_PATH = 'buttons/play-arrow.png';
const BUTTON_HOME_PATH = 'buttons/home.png';

export interface BubblePopOptions {
  /** Round length in seconds. Default 75. */
  roundSeconds?: number;
  theme?: BubbleTheme;
}

export interface BubblePopStats {
  readonly tier: Tier;
  readonly phase: Phase;
  /** Bubbles alive (decoys not included). */
  readonly live: number;
  readonly decoys: number;
  readonly particles: number;
  readonly count: number;
  readonly combo: number;
  /** Attempts recorded on the adaptive tier since the scene was created. */
  readonly hits: number;
  readonly misses: number;
  readonly bestCombo: number;
  readonly expected: number;
  readonly stars: number;
  readonly remaining: number;
  readonly stickerId: string;
  /** Scene update plus render time per frame, ms (CPU side only). */
  readonly workMean: number;
  readonly workMax: number;
  /** Dev only: snapshot of live items (allocates). */
  items(): { x: number; y: number; r: number; decoy: boolean; onScreen: boolean }[];
  resetWork(): void;
}

export interface BubblePopScene extends Scene {
  readonly stats: BubblePopStats;
}

type Phase = 'intro' | 'play' | 'ending' | 'result';

interface Bubble {
  active: boolean;
  decoy: boolean;
  tutorial: boolean;
  /** Tier at spawn; picks the fixed sprite size. */
  tier: Tier;
  x0: number;
  x: number;
  y: number;
  /** Visual radius in px. */
  r: number;
  startY: number;
  holdY: number;
  speed: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  age: number;
  creature: number;
  /** Scene time when the bubble was first fully on screen; -1 until then. */
  visibleAt: number;
  dwell: number;
  wobble: number;
}

interface Fx {
  active: boolean;
  x: number;
  y: number;
  t: number;
  tier: Tier;
  big: boolean;
  creature: number;
}

function newBubble(): Bubble {
  return {
    active: false,
    decoy: false,
    tutorial: false,
    tier: 0,
    x0: 0,
    x: 0,
    y: 0,
    r: 0,
    startY: 0,
    holdY: 0,
    speed: 0,
    swayAmp: 0,
    swayFreq: 0,
    phase: 0,
    age: 0,
    creature: 0,
    visibleAt: -1,
    dwell: 0,
    wobble: 0,
  };
}

function newFx(): Fx {
  return { active: false, x: 0, y: 0, t: 0, tier: 0, big: false, creature: 0 };
}

function toTier(n: unknown): Tier {
  return n === 1 ? 1 : n === 2 ? 2 : 0;
}

/** Every art path the scene uses, with its sprite-store name. */
function artList(theme: BubbleTheme): { name: string; path: string }[] {
  const list: { name: string; path: string }[] = [];
  const add = (path: string): void => {
    list.push({ name: spriteName(path), path });
  };
  add(theme.background);
  for (const c of theme.creatures) add(c.path);
  add(theme.decoy);
  add(theme.bubble);
  add(theme.burst);
  add(BUTTON_PLAY_PATH);
  add(BUTTON_HOME_PATH);
  for (const s of STICKERS) if (s.game === GAME_ID) list.push({ name: stickerSpriteName(s.id), path: s.path });
  return list;
}

/**
 * Load the scene's art. Each image loads on its own so one missing file does
 * not hold back the rest (loadAll rejects on the first failure); missing art
 * draws as placeholders. Resolves with the art paths that failed to load.
 */
export async function loadBubblePopArt(services: AppServices, theme: BubbleTheme = OCEAN_THEME): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(
    artList(theme).map(({ name, path }) =>
      services.sprites.load(name, services.art(path)).then(
        () => undefined,
        () => {
          missing.push(path);
        },
      ),
    ),
  );
  return missing;
}

export function createBubblePopScene(services: AppServices, options: BubblePopOptions = {}): BubblePopScene {
  const theme = options.theme ?? OCEAN_THEME;
  const roundSeconds = options.roundSeconds ?? ROUND_SECONDS;
  const { sprites, audio, input } = services;
  const pal = theme.palette;

  // Sprite names, resolved once.
  const bgName = spriteName(theme.background);
  const ringName = spriteName(theme.bubble);
  const burstName = spriteName(theme.burst);
  const decoyName = spriteName(theme.decoy);
  const playName = spriteName(BUTTON_PLAY_PATH);
  const homeName = spriteName(BUTTON_HOME_PATH);
  const creatureNames = theme.creatures.map((c) => spriteName(c.path));
  const creatureHues = theme.creatures.map((c) => c.hue);
  const creatureFills = theme.creatures.map((c) => `hsl(${c.hue} 85% 60%)`);
  const creatureBlobs = theme.creatures.map((c) => `hsl(${c.hue} 90% 80%)`);
  const creatureCount = creatureNames.length;
  const ownedSpriteNames = artList(theme).map((a) => a.name);

  const tierCtl = createAdaptiveTier({
    windowSize: 10,
    promoteAccuracy: 0.85,
    demoteAccuracy: 0.5,
    minAttempts: 6,
    cooldownAttempts: 4,
  });
  let data: { tier: number; bestCount: number } | undefined;
  tierCtl.onChange((t) => {
    if (!data) return;
    data.tier = t;
    services.save.save();
  });

  const particles = createParticleSystem(PARTICLE_CAPACITY);
  const bubbles: Bubble[] = [];
  for (let i = 0; i < POOL_SIZE; i++) bubbles.push(newBubble());
  const bursts: Fx[] = [];
  const hops: Fx[] = [];
  for (let i = 0; i < FX_POOL_SIZE; i++) {
    bursts.push(newFx());
    hops.push(newFx());
  }
  const tally = new Uint8Array(MAX_TALLY);
  const work = new Float32Array(WORK_SAMPLES);
  let workHead = 0;
  let workCount = 0;
  let updateMs = 0;

  const sfxOpts: SfxOptions = { index: 0, volume: 1 };

  // Layout, recomputed in resize().
  let W = DESIGN_W;
  let H = DESIGN_H;
  let u = 1;
  const ringSize = [0, 0, 0];
  const creatureSize = [0, 0, 0];
  const burstSize = [0, 0, 0];
  const decoySize = [0, 0, 0];
  const tierSpeed = [0, 0, 0];
  let bgCanvas: HTMLCanvasElement | undefined;
  let bgX = 0;
  let bgY = 0;
  let barX = 0;
  let barY = 0;
  let barW = 0;
  let barH = 0;
  let badgeX = 0;
  let badgeY = 0;
  let badgeW = 0;
  let badgeH = 0;
  let counterSize = 0;
  let panelX = 0;
  let panelY = 0;
  let panelW = 0;
  let panelH = 0;
  let numX = 0;
  let numY = 0;
  let numSize = 0;
  let gridX = 0;
  let gridY = 0;
  let gridW = 0;
  let gridH = 0;
  let starX = 0;
  let starY = 0;
  let starR = 0;
  let stickerX = 0;
  let stickerY = 0;
  let stickerSize = 0;

  // Round state.
  let phase: Phase = 'intro';
  let time = 0;
  let introT = 0;
  let remaining = roundSeconds;
  let expected = 0;
  let spawnT = 0;
  let count = 0;
  let combo = 0;
  let bestCombo = 0;
  let lastPopTime = -99;
  let counterChangedAt = -99;
  let tallyLen = 0;
  let liveCount = 0;
  let decoyCount = 0;
  let endingT = 0;
  let endBoost = 0;
  let lastCreature = -1;
  let lastSpawnX = -9999;
  let everInside = false;
  let hitstop = 0;
  let keyCooldown = 0;
  /** Seconds since enter, unscaled, for the enter fade. */
  let sceneT = 0;
  let hitsRecorded = 0;
  let missesRecorded = 0;

  // Result state.
  let resultT = 0;
  let stars = 1;
  let counted = 0;
  let countStep = 0.2;
  let countChangedAt = -99;
  let starStart = 0;
  let starsPlayed = 0;
  let fanfareAt = 0;
  let fanfareDone = false;
  let stickerAt = 0;
  let stickerDone = false;
  let buttonsAt = 0;
  let buttonsShown = false;
  let stickerId = '';
  let stickerName = '';
  let stickerCreature = 0;
  let gridRows = 1;
  let gridCell = 0;
  let resultTier: Tier = 0;

  const replayButton = createButton({
    x: 0,
    y: 0,
    radius: 72,
    fill: pal.replay,
    icon: playName,
    wobble: true,
    onPress: () => replay(),
  });
  const homeButton = createButton({
    x: 0,
    y: 0,
    radius: 58,
    fill: pal.home,
    icon: homeName,
    onPress: () => goHome(),
  });
  const buttons = [replayButton, homeButton];
  function hideButtons(): void {
    for (const b of buttons) {
      b.visible = false;
      b.enabled = false;
    }
  }
  hideButtons();

  // Particle burst generator, shared so a pop does not build a closure.
  let pbX = 0;
  let pbY = 0;
  let pbR = 0;
  let pbHue = 0;
  let pbSpeed = 0;
  const fillPop = (p: ParticleSpawn, i: number): void => {
    const a = (i / POP_PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const v = pbSpeed * (0.55 + Math.random() * 0.45);
    p.x = pbX + c * pbR * 0.45;
    p.y = pbY + s * pbR * 0.45;
    p.vx = c * v;
    p.vy = s * v - 60 * u;
    p.life = 0.45 + Math.random() * 0.3;
    p.size = (6 + Math.random() * 6) * u;
    p.endSize = 1.5;
    p.gravity = 420 * u;
    p.drag = 0.25;
    p.hue = pbHue;
    p.saturation = 90;
    p.lightness = 62;
    p.alpha = 1;
  };

  function layout(width: number, height: number): void {
    const nu = Math.max(0.5, Math.min(1.6, Math.min(width / DESIGN_W, height / DESIGN_H)));
    if (Math.abs(nu - u) > 0.001) {
      for (const n of ownedSpriteNames) sprites.clearScaled(n);
    } else {
      sprites.clearScaled(bgName);
    }
    W = width;
    H = height;
    u = nu;
    bgCanvas = undefined;
    for (let t = 0; t < 3; t++) {
      const p = TIERS[t as Tier];
      ringSize[t] = Math.round(p.diameter * u);
      creatureSize[t] = Math.round(p.diameter * 0.66 * u);
      burstSize[t] = Math.round(p.diameter * 1.25 * u);
      decoySize[t] = Math.round(p.diameter * 0.9 * u);
      tierSpeed[t] = p.speed * u;
    }
    barX = 24 * u;
    barY = 14 * u;
    barW = W - 48 * u;
    barH = 26 * u;
    badgeW = 160 * u;
    badgeH = 92 * u;
    badgeX = W / 2;
    badgeY = barY + barH + 18 * u + badgeH / 2;
    counterSize = 66 * u;

    const left = W / 2 - 590 * u;
    panelW = 820 * u;
    panelH = 560 * u;
    panelX = left;
    panelY = H / 2 - panelH / 2;
    numX = panelX + panelW / 2;
    numY = panelY + 72 * u;
    numSize = 84 * u;
    gridX = panelX + 50 * u;
    gridW = panelW - 100 * u;
    gridY = panelY + 130 * u;
    gridH = 270 * u;
    starX = panelX + panelW / 2;
    starY = panelY + panelH - 88 * u;
    starR = 44 * u;
    stickerX = left + panelW + 40 * u + 160 * u;
    stickerY = H / 2 - 100 * u;
    stickerSize = Math.round(230 * u);
    replayButton.x = stickerX - 82 * u;
    replayButton.y = H / 2 + 190 * u;
    replayButton.radius = Math.max(MIN_HIT, 72 * u);
    homeButton.x = stickerX + 96 * u;
    homeButton.y = H / 2 + 200 * u;
    homeButton.radius = Math.max(MIN_HIT, 58 * u);
  }

  function ensureBackground(): void {
    if (bgCanvas) return;
    const img = sprites.get(bgName);
    if (!img) return;
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    bgCanvas = sprites.scaled(bgName, scale);
    if (!bgCanvas) return;
    bgX = (W - bgCanvas.width) / 2;
    bgY = (H - bgCanvas.height) / 2;
  }

  // ---------------------------------------------------------------- pools

  function freeBubble(): Bubble | undefined {
    for (let i = 0; i < POOL_SIZE; i++) {
      const b = bubbles[i] as Bubble;
      if (!b.active) return b;
    }
    return undefined;
  }

  function release(b: Bubble): void {
    if (!b.active) return;
    b.active = false;
    if (b.decoy) decoyCount--;
    else liveCount--;
  }

  function freeFx(pool: Fx[]): Fx | undefined {
    for (let i = 0; i < FX_POOL_SIZE; i++) {
      const f = pool[i] as Fx;
      if (!f.active) return f;
    }
    return undefined;
  }

  function pickCreature(): number {
    let c = Math.floor(Math.random() * creatureCount);
    if (c === lastCreature) c = (c + 1 + Math.floor(Math.random() * (creatureCount - 1))) % creatureCount;
    lastCreature = c;
    return c;
  }

  function placeX(r: number, amp: number): number {
    const margin = r + amp + 16 * u;
    const span = Math.max(1, W - margin * 2);
    let x = margin + Math.random() * span;
    for (let k = 0; k < 4 && Math.abs(x - lastSpawnX) < r * 1.6; k++) x = margin + Math.random() * span;
    lastSpawnX = x;
    return x;
  }

  function spawn(decoy: boolean): void {
    const b = freeBubble();
    if (!b) return;
    const tier = tierCtl.tier;
    b.active = true;
    b.decoy = decoy;
    b.tutorial = false;
    b.tier = tier;
    b.r = (decoy ? decoySize[tier]! : ringSize[tier]!) / 2;
    b.swayAmp = (14 + Math.random() * 22) * u;
    b.swayFreq = 0.6 + Math.random() * 0.6;
    b.phase = Math.random() * Math.PI * 2;
    b.x0 = placeX(b.r, b.swayAmp);
    b.x = b.x0;
    b.y = H + b.r + 4;
    b.speed = tierSpeed[tier]! * (decoy ? 0.8 : 0.9 + Math.random() * 0.2);
    b.age = 0;
    b.creature = pickCreature();
    b.visibleAt = -1;
    b.dwell = 0;
    b.wobble = 0;
    if (decoy) decoyCount++;
    else liveCount++;
  }

  function spawnTutorial(): void {
    const b = freeBubble();
    if (!b) return;
    const tier = tierCtl.tier;
    b.active = true;
    b.decoy = false;
    b.tutorial = true;
    b.tier = tier;
    b.r = ringSize[tier]! / 2;
    b.swayAmp = 14 * u;
    b.swayFreq = 0.9;
    b.phase = 0;
    b.x0 = W / 2;
    b.x = b.x0;
    b.startY = H + b.r + 4;
    b.holdY = H * 0.55;
    b.y = b.startY;
    b.speed = tierSpeed[tier]! * 0.6;
    b.age = 0;
    b.creature = pickCreature();
    b.visibleAt = -1;
    b.dwell = 0;
    b.wobble = 0;
    liveCount++;
  }

  // ---------------------------------------------------------------- round flow

  function startTimer(): void {
    if (phase !== 'intro') return;
    phase = 'play';
    spawnT = 0.4;
  }

  function startRound(): void {
    for (let i = 0; i < POOL_SIZE; i++) (bubbles[i] as Bubble).active = false;
    for (let i = 0; i < FX_POOL_SIZE; i++) {
      (bursts[i] as Fx).active = false;
      (hops[i] as Fx).active = false;
    }
    particles.clear();
    phase = 'intro';
    introT = 0;
    remaining = roundSeconds;
    expected = 0;
    spawnT = 0;
    count = 0;
    combo = 0;
    bestCombo = 0;
    lastPopTime = -99;
    counterChangedAt = -99;
    tallyLen = 0;
    liveCount = 0;
    decoyCount = 0;
    endingT = 0;
    endBoost = 0;
    resultT = 0;
    hideButtons();
    buttonsShown = false;
  }

  function beginEnding(): void {
    phase = 'ending';
    endingT = 0;
    endBoost = 0;
    combo = 0;
  }

  function awardSticker(): void {
    const bag = rewards(services);
    const mine = STICKERS.filter((s) => s.game === GAME_ID);
    const fresh = mine.filter((s) => !bag.stickers.includes(s.id));
    const pool = fresh.length > 0 ? fresh : mine;
    const def = pool[Math.floor(Math.random() * pool.length)];
    stickerId = def ? def.id : '';
    stickerName = def ? stickerSpriteName(def.id) : '';
    const ci = def ? creatureNames.indexOf(spriteName(def.path)) : -1;
    stickerCreature = ci >= 0 ? ci : 0;
    if (def) bag.stickers.push(def.id);
    bag.stars += stars;
    bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
  }

  function showResult(): void {
    for (let i = 0; i < POOL_SIZE; i++) (bubbles[i] as Bubble).active = false;
    liveCount = 0;
    decoyCount = 0;
    phase = 'result';
    resultT = 0;
    resultTier = tierCtl.tier;
    const exp = Math.max(1, expected);
    stars = 1 + (count >= exp * 0.6 ? 1 : 0) + (count >= exp * 0.9 ? 1 : 0);

    if (data) {
      data.tier = tierCtl.tier;
      if (count > data.bestCount) data.bestCount = count;
    }
    awardSticker();
    services.save.save();

    const shown = Math.min(count, tallyLen);
    gridRows = Math.max(1, Math.ceil(shown / 10));
    gridCell = Math.min(64 * u, gridH / gridRows, gridW / 10.6);
    countStep = shown > 0 ? Math.min(0.25, 2.5 / shown) : 0;
    counted = 0;
    countChangedAt = -99;
    starStart = 0.25 + shown * countStep + 0.35;
    starsPlayed = 0;
    const lastStarHit = starStart + (stars - 1) * STAR_GAP_SECONDS + STAR_HIT_SECONDS;
    fanfareAt = lastStarHit + FANFARE_GAP;
    fanfareDone = false;
    stickerAt = lastStarHit + STAR_HOLD;
    stickerDone = false;
    buttonsAt = stickerAt + STICKER_HIT + STICKER_HOLD;
    buttonsShown = false;
  }

  function replay(): void {
    playSfx(audio, 'whoosh');
    startRound();
  }

  function goHome(): void {
    hideButtons();
    playSfx(audio, 'button');
    services.nav.toHub();
  }

  // ---------------------------------------------------------------- popping

  function pop(b: Bubble): void {
    const recording = phase === 'intro' || phase === 'play';
    const reaction = b.visibleAt < 0 ? 0 : time - b.visibleAt;
    combo = time - lastPopTime <= COMBO_WINDOW && combo > 0 ? combo + 1 : 1;
    if (combo > bestCombo) bestCombo = combo;
    lastPopTime = time;
    count++;
    counterChangedAt = time;
    if (tallyLen < MAX_TALLY) tally[tallyLen++] = b.creature;
    const big = combo % COMBO_MILESTONE === 0;

    const burst = freeFx(bursts);
    if (burst) {
      burst.active = true;
      burst.x = b.x;
      burst.y = b.y;
      burst.t = 0;
      burst.tier = b.tier;
      burst.big = big;
    }
    const hop = freeFx(hops);
    if (hop) {
      hop.active = true;
      hop.x = b.x;
      hop.y = b.y;
      hop.t = 0;
      hop.tier = b.tier;
      hop.creature = b.creature;
      hop.big = false;
    }
    pbX = b.x;
    pbY = b.y;
    pbR = b.r;
    pbHue = creatureHues[b.creature] ?? 200;
    pbSpeed = 330 * u;
    particles.burst(POP_PARTICLES, fillPop);

    sfxOpts.index = combo;
    sfxOpts.volume = 1;
    playSfx(audio, 'pop', sfxOpts);
    if (big) {
      playSfx(audio, 'pop-big');
      confettiBurst(particles, b.x, b.y, 70, 420 * u);
      hitstop = HITSTOP_SECONDS;
    }
    playSfx(audio, 'tick');

    const wasTutorial = b.tutorial;
    release(b);
    if (recording) {
      hitsRecorded++;
      tierCtl.record({ hit: true, reactionSeconds: reaction });
    }
    if (wasTutorial) startTimer();
  }

  function poke(d: Bubble): void {
    d.wobble = 0.6;
    sfxOpts.index = 0;
    sfxOpts.volume = 0.35;
    playSfx(audio, 'miss', sfxOpts);
  }

  function missed(b: Bubble): void {
    const recording = (phase === 'intro' || phase === 'play') && !b.decoy;
    release(b);
    if (!recording) return;
    sfxOpts.index = 0;
    sfxOpts.volume = 0.6;
    playSfx(audio, 'miss', sfxOpts);
    missesRecorded++;
    tierCtl.record({ hit: false });
  }

  function bubbleAt(px: number, py: number): Bubble | undefined {
    let best: Bubble | undefined;
    let bestD = Infinity;
    for (let i = 0; i < POOL_SIZE; i++) {
      const b = bubbles[i] as Bubble;
      if (!b.active || b.decoy) continue;
      const dx = px - b.x;
      const dy = py - b.y;
      const d2 = dx * dx + dy * dy;
      const hr = b.r * HIT_SCALE;
      if (d2 <= hr * hr && d2 < bestD) {
        bestD = d2;
        best = b;
      }
    }
    return best;
  }

  function decoyAt(px: number, py: number): Bubble | undefined {
    for (let i = 0; i < POOL_SIZE; i++) {
      const b = bubbles[i] as Bubble;
      if (!b.active || !b.decoy) continue;
      const dx = px - b.x;
      const dy = py - b.y;
      const hr = Math.max(b.r * 1.1, MIN_HIT);
      if (dx * dx + dy * dy <= hr * hr) return b;
    }
    return undefined;
  }

  function onScreen(b: Bubble): boolean {
    return b.y - b.r < H && b.y + b.r > 0;
  }

  /** Any key: the bubble nearest the pointer, or the lowest one if the pointer never entered. */
  function keyPop(): void {
    let best: Bubble | undefined;
    let bestScore = Infinity;
    const px = input.pointer.x;
    const py = input.pointer.y;
    for (let i = 0; i < POOL_SIZE; i++) {
      const b = bubbles[i] as Bubble;
      if (!b.active || b.decoy || !onScreen(b)) continue;
      let score: number;
      if (everInside) {
        const dx = px - b.x;
        const dy = py - b.y;
        score = dx * dx + dy * dy;
      } else {
        score = -b.y;
      }
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best) pop(best);
  }

  // ---------------------------------------------------------------- update

  /** Bursts run on real time so the hit snaps out during a hitstop; hops run on scene time and freeze with it. */
  function updateFx(dt: number, sceneDt: number): void {
    for (let i = 0; i < FX_POOL_SIZE; i++) {
      const bu = bursts[i] as Fx;
      if (bu.active) {
        bu.t += dt;
        if (bu.t >= BURST_SECONDS) bu.active = false;
      }
      const h = hops[i] as Fx;
      if (h.active) {
        h.t += sceneDt;
        if (h.t >= HOP_SECONDS) h.active = false;
      }
    }
  }

  function updateBubbles(dt: number): void {
    const holding = phase === 'intro';
    const boost = phase === 'ending' ? endBoost : 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      const b = bubbles[i] as Bubble;
      if (!b.active) continue;
      b.age += dt;
      if (b.wobble > 0) b.wobble = Math.max(0, b.wobble - dt);
      b.x = b.x0 + Math.sin(b.phase + b.age * b.swayFreq) * b.swayAmp;
      if (b.tutorial && holding) {
        b.y = lerp(b.startY, b.holdY, easeOutCubic(b.age / TUTORIAL_RISE_SECONDS));
      } else {
        b.y -= (b.speed + boost) * dt;
      }
      if (b.visibleAt < 0 && b.y + b.r <= H) b.visibleAt = time;
      if (b.y + b.r < 0) missed(b);
    }
  }

  /** Easiest tier: resting the pointer on a bubble for a moment pops it. */
  function updateDwell(dt: number): void {
    if (tierCtl.tier !== 0 || !input.pointer.inside || phase === 'result') return;
    const target = bubbleAt(input.pointer.x, input.pointer.y);
    for (let i = 0; i < POOL_SIZE; i++) {
      const b = bubbles[i] as Bubble;
      if (!b.active || b === target) continue;
      b.dwell = 0;
    }
    if (!target) return;
    target.dwell += dt;
    if (target.dwell >= DWELL_SECONDS) pop(target);
  }

  function updatePlay(dt: number): void {
    if (phase === 'intro') {
      introT += dt;
      if (introT >= 0.3 && introT - dt < 0.3) spawnTutorial();
      if (introT >= TUTORIAL_TIMEOUT) startTimer();
    } else if (phase === 'play') {
      const p = TIERS[tierCtl.tier];
      remaining -= dt;
      expected += (dt * EXPECTED_FACTOR) / p.interval;
      spawnT -= dt;
      if (spawnT <= 0) {
        if (p.decoys && decoyCount < MAX_DECOYS && Math.random() < DECOY_CHANCE) {
          spawn(true);
          spawnT = p.interval;
        } else if (liveCount < p.maxLive) {
          spawn(false);
          spawnT = p.interval;
        }
      }
      if (remaining <= 0) {
        remaining = 0;
        beginEnding();
      }
    } else if (phase === 'ending') {
      endingT += dt;
      endBoost += ENDING_ACCEL * u * dt;
    }

    updateBubbles(dt);
    updateDwell(dt);
    if (combo > 0 && time - lastPopTime > COMBO_WINDOW) combo = 0;

    if (phase === 'ending' && (liveCount + decoyCount === 0 || endingT >= ENDING_MAX_SECONDS)) showResult();
  }

  function updateResult(dt: number): void {
    resultT += dt;
    const shown = Math.min(count, tallyLen);
    if (shown > 0 && resultT >= 0.25 + GRID_HIT) {
      const target = Math.min(shown, Math.floor((resultT - 0.25 - GRID_HIT) / countStep) + 1);
      if (target > counted) {
        counted = target;
        countChangedAt = resultT;
        playSfx(audio, 'tick');
      }
    }
    if (counted < count && resultT >= starStart) {
      // Pops beyond the tally capacity: show the true total once counting ends.
      counted = count;
      countChangedAt = resultT;
    }
    if (starsPlayed < stars && resultT >= starStart + starsPlayed * STAR_GAP_SECONDS + STAR_HIT_SECONDS) {
      sfxOpts.index = starsPlayed;
      sfxOpts.volume = 1;
      playSfx(audio, 'star', sfxOpts);
      starsPlayed++;
    }
    if (!fanfareDone && resultT >= fanfareAt) {
      fanfareDone = true;
      playSfx(audio, 'fanfare');
      confettiRain(particles, W, 60);
    }
    if (!stickerDone && resultT >= stickerAt + STICKER_HIT) {
      stickerDone = true;
      playSfx(audio, 'sticker');
    }
    if (!buttonsShown && resultT >= buttonsAt) {
      buttonsShown = true;
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i]!;
        b.visible = true;
        b.enabled = true;
        b.popIn(i * 0.04);
      }
    }
    const px = input.pointer.x;
    const py = input.pointer.y;
    replayButton.update(dt, px, py);
    homeButton.update(dt, px, py);
  }

  // ---------------------------------------------------------------- render

  function spriteOr(
    ctx: CanvasRenderingContext2D,
    name: string,
    x: number,
    y: number,
    size: number,
    rot: number,
    sx: number,
    sy: number,
    fill: string,
    blob: string,
  ): void {
    if (sprites.get(name)) {
      drawSprite(ctx, sprites, name, x, y, size, rot, sx, sy);
      return;
    }
    // Placeholder while art is missing: chunky circle with a coloured blob.
    const r = size * 0.42 * Math.max(0.01, (sx + sy) / 2);
    chunkyCircle(ctx, x, y, r, fill, OUTLINE, Math.max(2, 5 * u));
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.2, r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = blob;
    ctx.fill();
  }

  function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, tier: Tier): void {
    const size = ringSize[tier]!;
    if (sprites.get(ringName)) {
      drawSprite(ctx, sprites, ringName, x, y, size);
      return;
    }
    ctx.beginPath();
    ctx.arc(x, y, size / 2 - 3, 0, Math.PI * 2);
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = pal.placeholderRing;
    ctx.stroke();
  }

  function renderBubbles(ctx: CanvasRenderingContext2D): void {
    const calm = reducedMotion();
    for (let i = 0; i < POOL_SIZE; i++) {
      const b = bubbles[i] as Bubble;
      if (!b.active) continue;
      if (b.decoy) {
        // Rotate only while wobbling, so the common path is a plain blit.
        const rot = b.wobble > 0 && !calm ? Math.sin(b.wobble * 32) * 0.4 * (b.wobble / 0.6) : 0;
        spriteOr(ctx, decoyName, b.x, b.y, decoySize[b.tier]!, rot, 1, 1, pal.placeholderDecoy, '#8f6bd1');
        continue;
      }
      // No per-bubble rotation: each bubble is two untransformed blits. The creature bobs
      // slowly inside its bubble, phase-shifted per bubble, from the moment it spawns.
      const c = b.creature;
      const bob = calm ? 0 : Math.cos(b.age * 1.6 + i * 1.5) * b.r * 0.06;
      spriteOr(ctx, creatureNames[c]!, b.x, b.y + bob, creatureSize[b.tier]!, 0, 1, 1, creatureFills[c]!, creatureBlobs[c]!);
      drawRing(ctx, b.x, b.y, b.tier);
      if (b.tutorial) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 4.5);
        ctx.globalAlpha = 0.45 + 0.45 * pulse;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (1.12 + 0.08 * pulse), 0, Math.PI * 2);
        ctx.lineWidth = 9 * u;
        ctx.strokeStyle = pal.highlight;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function renderFx(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < FX_POOL_SIZE; i++) {
      const h = hops[i] as Fx;
      if (!h.active) continue;
      const t = h.t;
      const size = creatureSize[h.tier]!;
      let dev: number;
      let dy: number;
      let sx: number;
      let sy: number;
      if (t < HOP_AIR) {
        // Launch: stretched tall and thin, easing back to round while it rises and falls.
        const p = t / HOP_AIR;
        dy = -46 * u * 4 * p * (1 - p);
        dev = Math.max(0, HOP_SQUASH - HOP_RECOVER * t);
        sx = 1 - dev;
        sy = 1 + dev;
      } else {
        // Landing: squashed wide and flat, recovering at the same rate.
        dy = 0;
        dev = Math.max(0, HOP_SQUASH - HOP_RECOVER * (t - HOP_AIR));
        sx = 1 + dev;
        sy = 1 - dev;
      }
      // Keep the feet planted while the body squashes and stretches.
      dy += size * 0.33 * (1 - sy);
      let alpha = 1;
      if (t > HOP_EXIT_AT) {
        // Exit: swims off upward and fades, easing in.
        const e = easeInCubic((t - HOP_EXIT_AT) / (HOP_SECONDS - HOP_EXIT_AT));
        alpha = 1 - e;
        sx *= 1 - 0.25 * e;
        sy *= 1 - 0.25 * e;
        dy -= 40 * u * e;
      }
      if (alpha <= 0.01) continue;
      const c = h.creature;
      ctx.globalAlpha = alpha;
      spriteOr(ctx, creatureNames[c]!, h.x, h.y + dy, size, 0, sx, sy, creatureFills[c]!, creatureBlobs[c]!);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < FX_POOL_SIZE; i++) {
      const bu = bursts[i] as Fx;
      if (!bu.active) continue;
      const t = bu.t;
      const k = t / BURST_SECONDS;
      const big = bu.big ? BIG_BURST : 1;
      const r = (ringSize[bu.tier]! / 2) * big;
      // Ring of the bubble skin: starts thick and thins as it drifts out; it never fades.
      const lw = r * 0.22 * (1 - k) * (1 - k);
      if (lw > 0.6) {
        ctx.beginPath();
        ctx.arc(bu.x, bu.y, r * (0.95 + 0.45 * easeOutCubic(k)), 0, Math.PI * 2);
        ctx.lineWidth = lw;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      // Burst: full size in under three frames, then a slow drift; it goes first.
      const a = 1 - clamp01((t - BURST_HOLD) / BURST_FADE);
      if (a <= 0) continue;
      const grow = t < BURST_GROW ? lerp(0.55, 1, easeOutCubic(t / BURST_GROW)) : 1 + 0.12 * ((t - BURST_GROW) / (BURST_SECONDS - BURST_GROW));
      const s = grow * big;
      ctx.globalAlpha = a;
      if (sprites.get(burstName)) {
        drawSprite(ctx, sprites, burstName, bu.x, bu.y, burstSize[bu.tier]!, 0, s, s);
      } else {
        ctx.beginPath();
        ctx.arc(bu.x, bu.y, (burstSize[bu.tier]! / 2) * s, 0, Math.PI * 2);
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = pal.highlight;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function renderHud(ctx: CanvasRenderingContext2D): void {
    // Time: a draining bar, two rounded rects.
    const frac = phase === 'intro' ? 1 : clamp01(remaining / roundSeconds);
    roundedRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = pal.barTrack;
    ctx.fill();
    if (frac > 0) {
      roundedRect(ctx, barX, barY, Math.max(barH, barW * frac), barH, barH / 2);
      ctx.fillStyle = pal.barFill;
      ctx.fill();
      ctx.lineWidth = 4 * u;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    chunkyPanel(ctx, badgeX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, pal.badge, OUTLINE, 30 * u, 6 * u);
    drawCounter(ctx, count, badgeX, badgeY + 2 * u, counterSize, time - counterChangedAt);
  }

  function renderResult(ctx: CanvasRenderingContext2D): void {
    const calm = reducedMotion();
    ctx.globalAlpha = easeOutCubic(clamp01(resultT / 0.3));
    ctx.fillStyle = pal.dim;
    ctx.fillRect(0, 0, W, H);

    // Panel arrives from 0.9 with a small overshoot while it fades in.
    const panelK = resultT / 0.4;
    const panelPop = arriveScale(panelK, calm);
    ctx.globalAlpha = arriveAlpha(panelK);
    ctx.save();
    ctx.translate(panelX + panelW / 2, panelY + panelH / 2);
    ctx.scale(panelPop, panelPop);
    ctx.translate(-(panelX + panelW / 2), -(panelY + panelH / 2));
    chunkyPanel(ctx, panelX, panelY, panelW, panelH, pal.panel, OUTLINE, 40 * u, 8 * u);

    drawCounter(ctx, counted, numX, numY, numSize, resultT - countChangedAt);

    // Ten-frame grid: rows of ten, a gap after five, creatures counted out one by one.
    const totalW = gridCell * 10.6;
    const ox = gridX + (gridW - totalW) / 2;
    const oy = gridY + (gridH - gridRows * gridCell) / 2;
    const iconScale = (gridCell * 0.9) / creatureSize[resultTier]!;
    ctx.fillStyle = '#e8dcc0';
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < 10; col++) {
        const cx = ox + col * gridCell + (col >= 5 ? gridCell * 0.6 : 0) + gridCell / 2;
        const cy = oy + row * gridCell + gridCell / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, gridCell * 0.36, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Each creature slams into its cell; its tick sounds on touchdown (GRID_HIT).
    const shown = Math.min(count, tallyLen);
    const panelAlpha = ctx.globalAlpha;
    for (let i = 0; i < shown; i++) {
      const appear = 0.25 + i * countStep;
      if (resultT < appear) break;
      const row = (i / 10) | 0;
      const col = i - row * 10;
      const cx = ox + col * gridCell + (col >= 5 ? gridCell * 0.6 : 0) + gridCell / 2;
      const cy = oy + row * gridCell + gridCell / 2;
      const local = resultT - appear;
      const s = iconScale * slamScale(local / GRID_SLAM, 0.4, calm);
      const c = tally[i]!;
      ctx.globalAlpha = panelAlpha * clamp01(local / GRID_HIT);
      spriteOr(ctx, creatureNames[c]!, cx, cy, creatureSize[resultTier]!, 0, s, s, creatureFills[c]!, creatureBlobs[c]!);
    }
    ctx.globalAlpha = panelAlpha;

    drawStarRow(ctx, starX, starY, starR, stars, Math.max(0, resultT - starStart), time);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (resultT >= stickerAt && stickerName) {
      // Flies in from the corner, then slams onto the page; sways gently once it has landed.
      const lt = resultT - stickerAt;
      const k = clamp01(lt / STICKER_FLY);
      const e = easeOutCubic(k);
      const x = lerp(W + stickerSize, stickerX, e);
      const y = lerp(H + stickerSize, stickerY, e);
      const landed = lt >= STICKER_FLY;
      const sway = landed && !calm ? Math.cos(time * 1.1 + 0.7) * 0.05 : 0;
      const rot = lerp(0.9, -0.08, e) + sway;
      const s = landed ? slamScale((lt - STICKER_FLY) / STICKER_SLAM, 0.3, calm) : 1.3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(s, s);
      chunkyCircle(ctx, 0, 0, stickerSize * 0.6, pal.stickerBacking, OUTLINE, 8 * u);
      spriteOr(ctx, stickerName, 0, 0, stickerSize, 0, 1, 1, creatureFills[stickerCreature]!, creatureBlobs[stickerCreature]!);
      ctx.restore();
    }

    replayButton.render(ctx, sprites);
    homeButton.render(ctx, sprites);
    if (buttonsShown && resultT > buttonsAt + 0.6) {
      if (!sprites.get(playName)) drawPlayGlyph(ctx, replayButton.x, replayButton.y, replayButton.radius);
      if (!sprites.get(homeName)) drawHomeGlyph(ctx, homeButton.x, homeButton.y, homeButton.radius);
    }
  }

  function drawPlayGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.28, y - r * 0.4);
    ctx.lineTo(x + r * 0.45, y);
    ctx.lineTo(x - r * 0.28, y + r * 0.4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  function drawHomeGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.5);
    ctx.lineTo(x + r * 0.48, y - r * 0.05);
    ctx.lineTo(x + r * 0.32, y - r * 0.05);
    ctx.lineTo(x + r * 0.32, y + r * 0.42);
    ctx.lineTo(x - r * 0.32, y + r * 0.42);
    ctx.lineTo(x - r * 0.32, y - r * 0.05);
    ctx.lineTo(x - r * 0.48, y - r * 0.05);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  // ---------------------------------------------------------------- stats

  const stats: BubblePopStats = {
    get tier() {
      return tierCtl.tier;
    },
    get phase() {
      return phase;
    },
    get live() {
      return liveCount;
    },
    get decoys() {
      return decoyCount;
    },
    get particles() {
      return particles.alive;
    },
    get count() {
      return count;
    },
    get combo() {
      return combo;
    },
    get hits() {
      return hitsRecorded;
    },
    get misses() {
      return missesRecorded;
    },
    get bestCombo() {
      return bestCombo;
    },
    get expected() {
      return expected;
    },
    get stars() {
      return stars;
    },
    get remaining() {
      return remaining;
    },
    get stickerId() {
      return stickerId;
    },
    get workMean() {
      let s = 0;
      for (let i = 0; i < workCount; i++) s += work[i]!;
      return workCount ? s / workCount : 0;
    },
    get workMax() {
      let m = 0;
      for (let i = 0; i < workCount; i++) if (work[i]! > m) m = work[i]!;
      return m;
    },
    items() {
      const out: { x: number; y: number; r: number; decoy: boolean; onScreen: boolean }[] = [];
      for (const b of bubbles) if (b.active) out.push({ x: b.x, y: b.y, r: b.r, decoy: b.decoy, onScreen: onScreen(b) });
      return out;
    },
    resetWork() {
      workHead = 0;
      workCount = 0;
    },
  };

  // ---------------------------------------------------------------- scene

  return {
    stats,
    enter() {
      void loadBubblePopArt(services, theme);
      data = services.save.gameData(GAME_ID, { tier: 0, bestCount: 0 });
      tierCtl.setTier(toTier(data.tier));
      layout(services.canvas.width, services.canvas.height);
      startMusic(audio, theme.music);
      playSfx(audio, 'whoosh');
      sceneT = 0;
      hitstop = 0;
      keyCooldown = 0;
      startRound();
    },
    exit() {
      stopMusic(audio);
      services.save.save();
    },
    resize(width, height) {
      layout(width, height);
    },
    update(dt) {
      const t0 = performance.now();
      // Hitstop: scene time stands still for HITSTOP_SECONDS; the burst itself keeps real time.
      let sdt = dt;
      if (hitstop > 0) {
        const frozen = Math.min(hitstop, dt);
        hitstop -= frozen;
        sdt = dt - frozen;
      }
      sceneT += dt;
      if (keyCooldown > 0) keyCooldown -= dt;
      time += sdt;
      particles.update(sdt);
      updateFx(dt, sdt);
      if (phase === 'result') updateResult(dt);
      else updatePlay(sdt);
      updateMs += performance.now() - t0;
    },
    render(view: SceneContext) {
      const t0 = performance.now();
      const ctx = view.ctx;
      if (view.width !== W || view.height !== H) layout(view.width, view.height);
      ensureBackground();
      if (bgCanvas) {
        ctx.drawImage(bgCanvas, bgX, bgY);
      } else {
        ctx.fillStyle = pal.water;
        ctx.fillRect(0, 0, W, H);
      }
      renderBubbles(ctx);
      renderFx(ctx);
      if (phase === 'result') renderResult(ctx);
      else renderHud(ctx);
      particles.render(ctx);
      drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - t0;
      workHead = (workHead + 1) % WORK_SAMPLES;
      if (workCount < WORK_SAMPLES) workCount++;
      updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      switch (event.type) {
        case 'pointermove':
          everInside = true;
          return;
        case 'pointerdown': {
          everInside = true;
          const { x, y } = event.info;
          if (phase === 'result') {
            dispatchDown(buttons, x, y);
            return;
          }
          const b = bubbleAt(x, y);
          if (b) {
            pop(b);
            return;
          }
          const d = decoyAt(x, y);
          if (d) poke(d);
          return;
        }
        case 'pointerup':
          if (phase === 'result') dispatchUp(buttons, event.info.x, event.info.y);
          return;
        case 'anykey':
          if (phase === 'result') {
            if (buttonsShown && (event.info.code === 'Enter' || event.info.code === 'NumpadEnter')) replay();
            return;
          }
          // One pop per KEY_COOLDOWN however fast keys are mashed; recorded like any other pop.
          if (keyCooldown > 0) return;
          keyCooldown = KEY_COOLDOWN;
          keyPop();
          return;
        default:
          return;
      }
    },
  };
}
