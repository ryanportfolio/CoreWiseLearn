/** Bubble Bay: forgiving entry pops, a visible ten-frame jar and saved round gifts. */
import { rewards, sanitizeBubbleData, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxOptions } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, chunkyPanel, drawSprite, OUTLINE } from '../../ui/draw';
import { drawCounter, starPath } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { clamp01, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { OCEAN_THEME, spriteName, type BubbleTheme } from './theme';

export const GAME_ID = 'bubble-pop';
export interface TierParams {
  diameter: number; speed: number; speedMax: number; interval: number;
  minLive: number; maxLive: number; spacing: number; hitScale: number; roundSeconds: number; decoys: false;
}
export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { diameter: 144, speed: 45, speedMax: 60, interval: 1.15, minLive: 2, maxLive: 4, spacing: 1.5, hitScale: 1.25, roundSeconds: 60, decoys: false },
  { diameter: 136, speed: 70, speedMax: 100, interval: 0.9, minLive: 4, maxLive: 6, spacing: 1.2, hitScale: 1.15, roundSeconds: 75, decoys: false },
  { diameter: 128, speed: 110, speedMax: 140, interval: 0.7, minLive: 6, maxLive: 8, spacing: 1, hitScale: 1.1, roundSeconds: 90, decoys: false },
];
export const ROUND_SECONDS = 60;
const COMBO_WINDOW = 2.5, PARTICLE_CAPACITY = 150, POOL_SIZE = 8, FX_POOL_SIZE = 20;
const GUARD_MS = 350, CELEBRATION_SECONDS = 4, INTRO_POPS = 8;
// Choice and rest ignore input this long, so steady pressing from the round cannot choose for the child.
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250;
// The celebration cannot be skipped before this, nor before every earned star has appeared.
const CELEBRATION_LOCK = 1.5;
// The closed shell squashes for the first OPEN_SWAP of the opening, then pops into the open shell behind a gold ring
// (the sticker rises in front of it), a burst of outlined gold and coral stars and a low pop.
const OPEN_SECONDS = 0.3, OPEN_SWAP = 0.4, FLASH_SECONDS = 0.3, SPARKLES = 12, REVEAL_SECONDS = 0.65, BUMP_SECONDS = 0.3, LEAVE_SECONDS = 0.25, GROUP_MAX = 5;
const SPARKLE_COLORS = ['#ffcf3a', '#ff7f5c'] as const;
// Art that has not loaded is looked for again after 0.5, 1, 2 and 4 s, then only when the end-of-round sizes are next planned.
const WARM_RETRIES = 4;
const REWARD_ART = ['rewards/shell-coral.webp', 'rewards/shell-mint.webp', 'rewards/shell-closed-coral.webp', 'rewards/shell-closed-mint.webp', 'rewards/counting-tray.webp', 'rewards/gold-star.webp'];
const BUTTON_PLAY_PATH = 'buttons/play-arrow.png', BUTTON_HOME_PATH = 'buttons/home.png';
type Phase = 'intro' | 'play' | 'celebration' | 'choice' | 'sticker' | 'rest';
type Wave = 'warmup' | 'wave' | 'breather' | 'finale';
export interface BubblePopOptions { roundSeconds?: number; theme?: BubbleTheme }
export interface BubblePopStats {
  readonly tier: Tier; readonly phase: Phase; readonly live: number; readonly decoys: number;
  readonly particles: number; readonly count: number; readonly combo: number; readonly hits: number;
  readonly misses: number; readonly bestCombo: number; readonly expected: number; readonly stars: number;
  readonly remaining: number; readonly stickerId: string; readonly workMean: number; readonly workMax: number;
  readonly assisted: number; readonly excluded: number; readonly qualifyingRounds: number;
  readonly nextTier: Tier; readonly wave: Wave; readonly introductory: boolean; readonly celebration: number;
  readonly choiceIds: readonly string[]; readonly selected: number; readonly roundSeconds: number;
  /** Shell drawn last frame for the offered (choice) or chosen (sticker, rest) gift: centre and size in CSS px; size 0 when none. */
  readonly shell: { readonly x: number; readonly y: number; readonly size: number; readonly index: number };
  /** End-of-round sprite sizes not yet prepared; 0 once everything the celebration, choice and rest draw is cached. */
  readonly warmPending: number;
  /** Times the end-of-round preparation went round again for art that had not loaded; stops at 4. */
  readonly warmRetries: number;
  /** Result-screen layout in CSS px, for checks: vertical extents of the stars, total bubble (0 when hidden) and tray, offer and rest shells, controls. */
  resultLayout(): Record<string, number | boolean>;
  items(): { x: number; y: number; r: number; hitRadius: number; decoy: boolean; onScreen: boolean; highlighted: boolean }[];
  controls(): { x: number; y: number; radius: number; id: string }[];
  resetWork(): void;
}
export interface BubblePopScene extends Scene { readonly stats: BubblePopStats }
interface Bubble {
  active: boolean; x: number; y: number; x0: number; r: number; speed: number; age: number;
  creature: number; phase: number; surprise: boolean; recycled: boolean; assisted: boolean;
  eligible: boolean; excluded: boolean; visible: boolean; activeExposure: number;
}
interface Flight { active: boolean; x: number; y: number; t: number; creature: number; slot: number; r: number }
interface PendingRound {
  count: number; stars: number; choices: string[]; chosen: string; variant: number;
  tally: number[]; tier: Tier; rewardEnabled: boolean; restEntered: boolean;
}
interface GameData extends Record<string, unknown> {
  tier: number; bestCount: number; rounds: number; qualifyingRounds: number; lastCelebration: number;
  pending: PendingRound | null;
}
const toTier = (n: unknown): Tier => n === 1 ? 1 : n === 2 ? 2 : 0;
function artList(theme: BubbleTheme): { name: string; path: string }[] {
  const paths = [theme.background, theme.bubble, ...theme.creatures.map(c => c.path), ...REWARD_ART, BUTTON_PLAY_PATH, BUTTON_HOME_PATH];
  return [...paths.map(path => ({ name: spriteName(path), path })), ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path }))];
}
export async function loadBubblePopArt(services: AppServices, theme: BubbleTheme = OCEAN_THEME): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(artList(theme).map(({ name, path }) => services.sprites.load(name, services.art(path)).catch(() => { missing.push(path); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}
/** Each wave keeps the same tier. Only density changes inside a round. */
export function waveAt(elapsed: number, duration: number): Wave {
  if (elapsed < Math.min(10, duration * 0.2)) return 'warmup';
  if (elapsed >= duration - Math.min(8, duration * 0.12)) return 'finale';
  const cycles = duration >= 70 ? 4 : 3, start = Math.min(10, duration * 0.2);
  const cycle = (duration - start - Math.min(8, duration * 0.12)) / cycles;
  return (elapsed - start) % cycle < Math.min(12, cycle * 0.68) ? 'wave' : 'breather';
}
/** Maximum scheduled opportunities with immediate pops, used to check fixed star goals. */
export function scheduledPops(tier: Tier, duration = TIERS[tier].roundSeconds): number {
  let total = 1, elapsed = 0.6;
  while (elapsed < duration) {
    total++;
    const wave = waveAt(elapsed, duration);
    elapsed += TIERS[tier].interval * (wave === 'breather' ? 2.7 : wave === 'warmup' ? 1.4 : wave === 'finale' ? 0.65 : 1);
  }
  return total;
}

export function createBubblePopScene(services: AppServices, options: BubblePopOptions = {}): BubblePopScene {
  const theme = options.theme ?? OCEAN_THEME, { sprites, audio, input } = services, pal = theme.palette;
  const random = () => services.random();
  const names = theme.creatures.map(c => spriteName(c.path));
  const bubbleName = spriteName(theme.bubble);
  const rewardNames = new Map(STICKERS.map(s => [s.id, stickerSpriteName(s.id)]));
  const colors = ['#f28a45', '#7eb45d', '#d494c6', '#edc44d', '#e57e77', '#e8a866', '#a792d4', '#d5bd62', '#70b8ca', '#82a6d2'];
  const bgName = spriteName(theme.background), playName = spriteName(BUTTON_PLAY_PATH), homeName = spriteName(BUTTON_HOME_PATH);
  const particles = createParticleSystem(PARTICLE_CAPACITY);
  const soundButton = createSoundButton(services);
  const bubbles: Bubble[] = Array.from({ length: POOL_SIZE }, () => ({ active: false, x: 0, y: 0, x0: 0, r: 0, speed: 0, age: 0, creature: 0, phase: 0, surprise: false, recycled: false, assisted: false, eligible: false, excluded: false, visible: false, activeExposure: 0 }));
  const flights: Flight[] = Array.from({ length: FX_POOL_SIZE }, () => ({ active: false, x: 0, y: 0, t: 0, creature: 0, slot: 0, r: 0 }));
  const tally = new Uint8Array(256), work = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1 };
  // The shells open with the deeper version of the big pop at its lowest pitch: warm and low, never shrill.
  const openSfx: SfxOptions = { index: 0, variant: 'B' };
  let data: GameData;
  let W = 1366, H = 768, u = 1, diameter = 144, bgX = 0, bgY = 0;
  let bgCanvas: HTMLCanvasElement | undefined;
  let phase: Phase = 'intro', wave: Wave = 'warmup', tier: Tier = 0;
  let intro = true, elapsed = 0, duration = ROUND_SECONDS, time = 0, sceneT = 0, phaseT = 0;
  let count = 0, combo = 0, bestCombo = 0, lastPop = -99, lastInput = -99, spawnT = 0;
  let hits = 0, misses = 0, assisted = 0, excluded = 0, stars = 1, variant = 0, tallyCount = 0, starsPlayed = 0;
  let ownPops = 0, activeTime = 0;
  let pending: PendingRound | null = null;
  let highlighted: Bubble | undefined;
  let menuSelected = -1, inputAfter = 0, keyAfter = 0, focusAt = 0, pointerKnown = false;
  let workHead = 0, workCount = 0, updateMs = 0;
  let jarX = 0, jarY = 0, jarW = 0, jarH = 0, trayY = 0, trayWidth = 0, starY = 0, starSize = 0, shellSize = 0, shellY = 0, restSize = 0, restY = 0;
  let controlsY = 0, controlsRadius = 60, choiceRadius = 96, flank = false, flankOffset = 0, groupD = 0;
  let cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, cornerFocus = -1;
  // Sprite sizes the end of the round draws (name, longest side; an empty name is a counter glyph size). During play
  // an idle period between frames makes one cached canvas, and the next frame draws it once under the backdrop, so the
  // first celebration of a session never decodes, scales or uploads art on its own frames.
  const warmNames: string[] = [], warmSizes: number[] = [], warmKeys: string[] = [];
  /** Keys already made and drawn once. Cleared when the sprite cache for this art is cleared. */
  const warmDone = new Set<string>();
  let prepIndex = 0, madeIndex = -1, warmRetry = -1, warmRetries = 0, idleHandle = 0, fanfareStarted = false, fanfareAsked = false;
  let scratch: CanvasRenderingContext2D | null | undefined;
  let shellX = 0, shellDrawY = 0, shellDrawn = 0, shellIndex = -1;
  // The round's own popped creatures, distinct and in pop order, for scenes without a gift.
  const group = new Uint8Array(GROUP_MAX);
  let groupCount = 0;
  const playable = () => phase === 'intro' || phase === 'play';
  const live = () => { let n = 0; for (const b of bubbles) if (b.active) n++; return n; };
  const hitRadius = (b: Bubble) => Math.max(48 * services.config.uiScale, b.r * TIERS[tier].hitScale);
  const available = (b: Bubble) => b.active && b.y >= b.r && b.y <= H - b.r &&
    Math.hypot(b.x - homeX, b.y - cornerY) > cornerRadius + hitRadius(b) &&
    Math.hypot(b.x - soundX, b.y - cornerY) > cornerRadius + hitRadius(b);
  const guard = () => { inputAfter = Math.max(inputAfter, performance.now() + GUARD_MS); };
  const celebrationSkippable = () => phaseT >= CELEBRATION_LOCK && starsPlayed >= stars;
  /** Choice and rest start with nothing focused and ignore input for MENU_GUARD_MS. */
  const armMenu = () => { inputAfter = performance.now() + MENU_GUARD_MS; menuSelected = -1; };
  const giftFollows = () => !!pending && pending.choices.length > 0 && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled;

  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H;
    W = width; H = height;
    const oldDiameter = diameter;
    u = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    diameter = Math.max(96 / TIERS[tier].hitScale, TIERS[tier].diameter * u);
    for (const b of bubbles) if (b.active) { b.r = diameter / 2; b.x0 = Math.min(W - b.r, Math.max(b.r, b.x0)); b.x = b.x0; b.y = Math.min(H - b.r, Math.max(b.r, b.y)); }
    if (oldDiameter !== diameter) { for (const { name } of artList(theme)) sprites.clearScaled(name); warmDone.clear(); }
    // Rescaling the full-screen backdrop is costly; only a new canvas size needs it.
    if (resized || !bgCanvas) { sprites.clearScaled(bgName); bgCanvas = undefined; }
    jarW = Math.min(W * 0.55, 290 * u); jarH = Math.max(83, 132 * u); jarX = W / 2; jarY = jarH / 2 + 20 * u;
    placeResult();
  }
  /** End-of-round layout. Depends on the count on narrow screens, where a total above ten pushes the tray down. */
  function placeResult(): void {
    const headerScale = Math.min(1.25, Math.max(0.74, Math.min(W / 1366, H / 768)));
    starSize = W < 550 ? 36 : 72 * headerScale;
    starY = W < 550 ? 60 : 78 * headerScale;
    trayWidth = Math.min(W - 24, 480 * headerScale);
    trayY = starY + starSize / 2 + 18 + trayWidth * 0.386 / 2 + (W < 550 && count > 10 ? 76 : 0);
    const trayBottom = trayY + trayWidth * 0.386 / 2;
    shellSize = Math.min(370 * Math.min(1.25, H / 768), (W - 60) / 2);
    restSize = Math.min(300 * Math.min(1.25, H / 768), W * 0.64);
    controlsRadius = Math.min(Math.max(48 * services.config.uiScale, 62 * u), W / 5);
    controlsY = H - controlsRadius - 22;
    restY = (trayBottom + controlsY - controlsRadius) / 2;
    restSize = Math.min(restSize, controlsY - controlsRadius - trayBottom - 26);
    // Where Again and Home fit beside the offer-sized shell, the chosen shell keeps its size and place height.
    // Otherwise (narrow screens) it rests above the controls; where that space is smaller than the offer size,
    // the offers take the rest size, so the chosen shell never gets smaller between choice and rest.
    const gap = Math.max(16, 30 * u);
    flankOffset = shellSize / 2 + gap + controlsRadius;
    flank = W / 2 - flankOffset - controlsRadius >= 8;
    if (!flank) shellSize = Math.min(shellSize, restSize);
    shellY = Math.max(trayBottom + 22 + shellSize / 2, H * 0.64);
    choiceRadius = Math.max(48, shellSize * 0.51);
    if (flank) { restY = shellY; restSize = shellSize; controlsY = Math.min(controlsY, shellY + shellSize / 2 - controlsRadius); }
    groupD = Math.min(restSize * 0.5, (flank ? shellSize + 2 * gap : W - 40) / 3.3);
    cornerRadius = Math.max(48, Math.min(60 * u, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    planWarm();
  }
  /** Every sprite size the celebration, choice, reveal and rest draw, in the order they first appear. */
  function planWarm(): void {
    warmNames.length = 0; warmSizes.length = 0; warmKeys.length = 0; prepIndex = 0; madeIndex = -1; warmRetry = -1;
    const add = (name: string, size: number): void => { const side = Math.round(size); warmNames.push(name); warmSizes.push(side); warmKeys.push(`${name}@${side}`); };
    const cell = trayWidth * 0.103, total = W < 550 ? 68 : trayWidth * 0.3;
    // Before the round ends, a gift is expected unless rewards are off or the collection is complete (read once the
    // scene has entered and a profile is active).
    const gift = pending ? giftFollows() : !!data && services.config.rewardsEnabled && STICKERS.some(st => st.game === GAME_ID && !rewards(services).stickers.includes(st.id));
    add('rewards/gold-star', starSize); add('rewards/counting-tray', trayWidth);
    for (const name of names) add(name, cell * 0.95);
    add('', trayWidth * 0.115); add(bubbleName, total * 1.12); add('', total * 0.4);
    if (gift) {
      add('rewards/shell-closed-coral', shellSize); add('rewards/shell-closed-mint', shellSize);
      add('rewards/shell-coral', shellSize); add('rewards/shell-mint', shellSize);
      // Offers are known once the round ends; the celebration has time to prepare them before the choice.
      if (pending) for (const id of pending.choices) { const name = rewardNames.get(id); if (name) { add(name, shellSize * 0.95); add(name, restSize * 0.95); } }
      add('rewards/shell-coral', restSize); add('rewards/shell-mint', restSize);
    } else for (const name of names) add(name, groupD * 0.73);
    add(playName, controlsRadius * 1.3); add(homeName, controlsRadius * 1.3);
  }
  /**
   * Makes the next planned canvas in an idle period with at least 4 ms left. One per period: the browser rasterises a
   * new canvas later, so several made together would land on one frame. Sizes already done are skipped.
   */
  function prepareIdle(deadline: IdleDeadline): void {
    idleHandle = 0;
    if (madeIndex >= 0) return;
    // The fanfare render started in startRound goes on a note at a time (under 2 ms each on a slow laptop) while the
    // period still has 4 ms left. A period it used makes no art.
    if (fanfareDue() && deadline.timeRemaining() >= 4) {
      do if (prepareSfxStep(audio, 'fanfare')) { fanfareAsked = true; break; } while (deadline.timeRemaining() >= 4);
      return;
    }
    while (prepIndex < warmNames.length && warmDone.has(warmKeys[prepIndex]!)) prepIndex++;
    if (prepIndex >= warmNames.length || !(deadline.didTimeout || deadline.timeRemaining() >= 4)) return;
    const name = warmNames[prepIndex]!, size = warmSizes[prepIndex]!;
    if (!name) {
      scratch ??= document.createElement('canvas').getContext('2d');
      if (scratch) { drawCounter(scratch, 1234567890, 0, 0, size, 1); madeIndex = prepIndex; }
    } else {
      const image = sprites.get(name);
      // Art still loading: go round again later, waiting twice as long each time, at most WARM_RETRIES times.
      if (!image) { if (warmRetry < 0 && warmRetries < WARM_RETRIES) warmRetry = sceneT + 0.5 * 2 ** warmRetries; }
      else { sprites.scaled(name, size / (Math.max(image.naturalWidth, image.naturalHeight) || 1)); madeIndex = prepIndex; }
    }
    prepIndex++;
  }
  const fanfareDue = () => fanfareStarted && !fanfareAsked;
  /**
   * Called each frame before the backdrop is drawn: draws the canvas made in the last idle period once, hidden under
   * the backdrop, which uploads it, then asks for the next idle period while planned sizes remain.
   */
  function warm(ctx: CanvasRenderingContext2D): void {
    if (madeIndex >= 0) {
      const name = warmNames[madeIndex]!, size = warmSizes[madeIndex]!;
      if (!name) drawCounter(ctx, 1234567890, W / 2, H / 2, size, 1);
      else drawSprite(ctx, sprites, name, W / 2, H / 2, size);
      warmDone.add(warmKeys[madeIndex]!); madeIndex = -1;
    }
    if (prepIndex >= warmNames.length && warmRetry >= 0 && sceneT >= warmRetry) { prepIndex = 0; warmRetry = -1; warmRetries++; }
    if ((prepIndex < warmNames.length || fanfareDue()) && !idleHandle) idleHandle = requestIdleCallback(prepareIdle, { timeout: 500 });
  }
  function stopWarm(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; }
  function controlX(index: number, choices = false): number {
    if (!choices && flank) return W / 2 + (index === 0 ? -flankOffset : flankOffset);
    const n = choices ? pending?.choices.length ?? 0 : 2;
    return W / 2 + (index - (n - 1) / 2) * (choices ? shellSize + Math.max(24, shellSize * 0.18) : controlsRadius * 3.2);
  }
  const choiceY = () => shellY;
  function ensureBackground(): void {
    if (bgCanvas) return;
    const image = sprites.get(bgName); if (!image) return;
    bgCanvas = sprites.scaled(bgName, Math.max(W / image.naturalWidth, H / image.naturalHeight));
    if (bgCanvas) { bgX = (W - bgCanvas.width / sprites.pixelRatio) / 2; bgY = (H - bgCanvas.height / sprites.pixelRatio) / 2; }
  }
  function creature(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, size: number, sx = 1, sy = 1): void {
    drawSprite(ctx, sprites, names[n % names.length]!, x, y, Math.round(size), 0, sx, sy);
  }
  function spawn(first = false): boolean {
    let b: Bubble | undefined; for (const item of bubbles) if (!item.active) { b = item; break; }
    if (!b) return false;
    const p = TIERS[tier], r = diameter / 2;
    let x = W / 2, y = H - r - 12;
    if (first) {
      x = input.pointer.inside ? Math.max(r + 10, Math.min(W - r - 10, input.pointer.x)) : W / 2;
      y = input.pointer.inside ? Math.max(r + 10, Math.min(H - r - 10, input.pointer.y + Math.min(180, 150 * u))) : H * 0.58;
    } else {
      let placed = false;
      for (let attempt = 0; attempt < 18; attempt++) {
        x = r + 12 + random() * Math.max(1, W - 2 * r - 24);
        let clear = true;
        for (const other of bubbles) if (other.active && Math.hypot(x - other.x, y - other.y) < diameter * p.spacing) { clear = false; break; }
        if (clear) { placed = true; break; }
      }
      if (!placed) return false;
    }
    Object.assign(b, { active: true, x, x0: x, y, r, speed: lerp(p.speed, p.speedMax, random()) * u, age: 0, creature: Math.floor(random() * names.length), phase: random() * Math.PI * 2, surprise: random() < 1 / 15, recycled: false, assisted: false, eligible: false, excluded: first || intro || elapsed < 5, visible: false, activeExposure: 0 });
    if (!highlighted) highlighted = b;
    return true;
  }
  function startRound(): void {
    pending = null; data.pending = null; tier = services.debug.tier ?? toTier(data.tier);
    intro = data.rounds === 0 && !(services.debug.enabled && options.roundSeconds);
    duration = options.roundSeconds ?? TIERS[tier].roundSeconds;
    phase = intro ? 'intro' : 'play'; wave = 'warmup';
    elapsed = time = phaseT = count = combo = bestCombo = hits = misses = assisted = excluded = ownPops = activeTime = 0;
    lastPop = lastInput = -99; spawnT = 0.6; stars = 1; tallyCount = starsPlayed = groupCount = 0; highlighted = undefined;
    menuSelected = cornerFocus = -1;
    particles.clear(); for (const b of bubbles) b.active = false; for (const f of flights) f.active = false;
    layout(W, H); guard(); spawn(true); services.save.flush();
    // The round-end fanfare is rendered ahead once per session, so the frame a round ends does not build its notes.
    // The render's first step is its one long one (about 4 ms, 16 ms on a slow laptop, too long for an idle period
    // between frames), so it runs here, before the round's first frame, while the screen is still: under the enter
    // fade, or on the rest screen after Again. The short note steps follow in idle periods (prepareIdle).
    if (!fanfareStarted && audio.context) { fanfareStarted = true; if (prepareSfxStep(audio, 'fanfare')) fanfareAsked = true; }
  }
  function chooseOffers(): string[] {
    if (!services.config.rewardsEnabled) return [];
    const owned = rewards(services).stickers, all = STICKERS.filter(s => s.game === GAME_ID);
    for (let page = 0; page < all.length; page += 8) {
      const fresh = all.slice(page, page + 8).filter(s => !owned.includes(s.id));
      if (!fresh.length) continue;
      const first = fresh.splice(Math.floor(random() * fresh.length), 1)[0]!;
      const second = fresh.length ? fresh[Math.floor(random() * fresh.length)] : undefined;
      return second ? [first.id, second.id] : [first.id];
    }
    return [];
  }
  function adjustTier(): void {
    if (intro || services.debug.tier !== undefined) return;
    const opportunities = hits + misses, rate = opportunities ? hits / opportunities : 1;
    // Escapes are mostly recycled or assist-helped and rarely count as misses, so the rate alone misses a child who pops nothing.
    // Input in at least a third of the post-warm-up time with under one own (not drift-helped) pop per 6 active seconds also eases.
    const popsLittle = activeTime >= (duration - 5) / 3 && ownPops * 6 < activeTime;
    if ((opportunities >= 6 && rate < 0.75) || popsLittle) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
    else if (opportunities >= 30 && rate >= 0.9) {
      data.qualifyingRounds++;
      if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
    } else data.qualifyingRounds = 0;
  }
  function collectGroup(): void {
    groupCount = 0;
    for (let i = 0, n = Math.min(count, tally.length); i < n && groupCount < GROUP_MAX; i++) {
      let seen = false;
      for (let j = 0; j < groupCount; j++) if (group[j] === tally[i]) { seen = true; break; }
      if (!seen) group[groupCount++] = tally[i]!;
    }
  }
  function finishRound(): void {
    if (!playable()) return;
    stars = intro ? 3 : count >= 10 ? 3 : count >= 5 ? 2 : 1; adjustTier();
    variant = data.lastCelebration < 0 ? Math.floor(random() * 4) : (data.lastCelebration + 1 + Math.floor(random() * 3)) % 4;
    data.lastCelebration = variant; data.rounds++; data.bestCount = Math.max(data.bestCount, count);
    pending = { count, stars, choices: chooseOffers(), chosen: '', variant, tally: Array.from(tally.slice(0, Math.min(count, tally.length))), tier, rewardEnabled: services.config.rewardsEnabled, restEntered: false };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += stars;
    // Round, stars and unresolved gift share one immediate document write. Re-entry never awards again.
    services.save.flush(); phase = 'celebration'; phaseT = 0; highlighted = undefined; combo = 0; cornerFocus = -1; layout(W, H);
    for (const b of bubbles) b.active = false; for (const f of flights) f.active = false;
    collectGroup(); particles.clear(); playSfx(audio, 'fanfare');
  }
  function enterRest(): void {
    phase = 'rest'; phaseT = 0; armMenu(); particles.clear(); for (const f of flights) f.active = false;
    if (!pending?.restEntered) {
      if (pending) pending.restEntered = true;
      services.save.flush(); services.roundBoundary();
    }
  }
  function finishCelebration(): void {
    if (phase !== 'celebration') return;
    particles.clear(); tallyCount = count; starsPlayed = stars;
    // The closed shells already on screen open into the offers.
    if (giftFollows()) { phase = 'choice'; phaseT = 0; armMenu(); }
    else enterRest();
  }
  function chooseSticker(index: number): void {
    if (phase !== 'choice' || !pending || pending.chosen || !pending.rewardEnabled || !services.config.rewardsEnabled) return;
    const id = pending.choices[index]; if (!id) return;
    const bag = rewards(services); if (!bag.stickers.includes(id)) bag.stickers.push(id);
    pending.chosen = id;
    // The chosen ID and owned sticker save together, so repeated input and reload are idempotent.
    services.save.flush(); phase = 'sticker'; phaseT = 0; menuSelected = index; playSfx(audio, 'sticker');
  }
  /** A finished round is done once its rest screen is left by any route. */
  function closeFinishedRound(): void {
    if (phase !== 'rest' || !data) return;
    data.pending = null; pending = null; services.save.flush();
  }
  function leave(replay: boolean): void {
    if (phase !== 'rest') return;
    closeFinishedRound(); playSfx(audio, replay ? 'whoosh' : 'button');
    if (replay) startRound(); else services.nav.toHub();
  }
  let px = 0, py = 0, pr = 0, ph = 0;
  const fillPop = (p: ParticleSpawn, index: number): void => {
    const a = index / 8 * Math.PI * 2 + random() * 0.3;
    p.x = px + Math.cos(a) * pr * 0.4; p.y = py + Math.sin(a) * pr * 0.4;
    p.vx = Math.cos(a) * 135 * u; p.vy = Math.sin(a) * 135 * u;
    p.life = 0.35 + random() * 0.2; p.size = 3 + random() * 3; p.endSize = 1;
    p.gravity = 130; p.hue = ph; p.saturation = 70; p.lightness = 65; p.alpha = 0.7;
  };
  function pop(b: Bubble, keyAssisted = false): void {
    if (!playable() || !b.active) return;
    combo = Math.min(10, time - lastPop <= COMBO_WINDOW ? combo + 1 : 1);
    bestCombo = Math.max(bestCombo, combo); lastPop = time; lastInput = elapsed;
    count++; if (count <= tally.length) tally[count - 1] = b.creature;
    // Narrow screens lay the result out differently above ten; prepare that layout's sizes too.
    if (count === 11 && W < 550) placeResult();
    if (keyAssisted || b.assisted) assisted++;
    if (!b.recycled && !b.excluded && !b.assisted && !keyAssisted && elapsed >= 5 && b.visible) hits++;
    else excluded++;
    if (!intro && elapsed >= 5 && !b.assisted) ownPops++;
    let flight: Flight | undefined; for (const item of flights) if (!item.active) { flight = item; break; }
    if (flight) Object.assign(flight, { active: true, x: b.x, y: b.y, t: 0, creature: b.creature, slot: (count - 1) % 10, r: b.r });
    px = b.x; py = b.y; pr = b.r; ph = theme.creatures[b.creature]?.hue ?? 200;
    particles.burst(8, fillPop);
    sfx.index = (count - 1) % 10; sfx.bodySize = TIERS[tier].diameter / 144; sfx.volume = 1; playSfx(audio, 'pop', sfx);
    b.active = false; if (highlighted === b) highlighted = undefined; ensureHighlight();
    if (intro && count >= INTRO_POPS) finishRound(); else if (intro) spawnT = Math.min(spawnT, 0.4);
  }
  function ensureHighlight(): void {
    if (highlighted && available(highlighted)) return;
    highlighted = undefined;
    for (const b of bubbles) if (available(b) && (!highlighted || b.y < highlighted.y)) highlighted = b;
  }
  function pointerPop(x: number, y: number): void {
    let target: Bubble | undefined, distance = Infinity;
    for (const b of bubbles) {
      if (!available(b)) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= Math.max(hitRadius(b), b.r * 1.5) && d < distance) { target = b; distance = d; }
    }
    if (target) pop(target);
  }
  function sweep(x0: number, y0: number, x1: number, y1: number): void {
    const dx = x1 - x0, dy = y1 - y0, length2 = dx * dx + dy * dy;
    if (length2 < 0.01) return;
    lastInput = elapsed;
    for (const b of bubbles) {
      if (!playable()) break; if (!available(b)) continue;
      const t = clamp01(((b.x - x0) * dx + (b.y - y0) * dy) / length2);
      const hx = x0 + t * dx - b.x, hy = y0 + t * dy - b.y;
      if (hx * hx + hy * hy <= hitRadius(b) ** 2) pop(b);
    }
  }
  function updatePlay(dt: number): void {
    elapsed += dt; wave = intro ? 'warmup' : waveAt(elapsed, duration);
    const p = TIERS[tier];
    // No tier mutation inside a round. Quiet sections reduce spawn density only.
    const cap = intro ? 2 : wave === 'warmup' || wave === 'breather' ? p.minLive : p.maxLive;
    const density = wave === 'breather' ? 2.7 : wave === 'warmup' ? 1.4 : wave === 'finale' ? 0.65 : 1;
    spawnT -= dt;
    if (spawnT <= 0 && live() < cap) { if (spawn()) spawnT = p.interval * density; else spawnT = 0.2; }
    const active = elapsed - lastInput <= 3;
    if (!intro && elapsed >= 5 && active) activeTime += dt;
    for (const b of bubbles) {
      if (!b.active) continue;
      b.age += dt; b.x = b.x0 + Math.sin(b.phase + b.age * 0.8) * Math.min(12 * u, b.r * 0.15);
      if (!(intro && count === 0)) b.y -= b.speed * dt;
      if (!b.visible && available(b)) { b.visible = true; b.eligible = !intro && elapsed >= 5 && active && !b.recycled; if (!b.eligible) b.excluded = true; }
      if (b.visible && !b.recycled) { if (!active) b.excluded = true; else b.activeExposure += dt; }
      if (b.y < cornerY + cornerRadius && (Math.abs(b.x - homeX) < cornerRadius + b.r || Math.abs(b.x - soundX) < cornerRadius + b.r)) b.excluded = true;
      // Assisted opportunities never affect tiers. A slow active pointer gets a gentle approach.
      if (!intro && active && input.pointer.inside && b === highlighted && misses >= 2 && hits / (hits + misses) < 0.85 && time - lastPop > 5 && b.age > 3) {
        b.assisted = true; b.x0 += Math.max(-18 * u * dt, Math.min(18 * u * dt, input.pointer.x - b.x0));
      }
      if (b.y < -b.r) {
        if (!b.recycled && tier > 0 && b.eligible && !b.excluded && !b.assisted && b.activeExposure >= 0.5) misses++;
        else excluded++;
        b.recycled = true; b.excluded = true; b.y = H + b.r; b.visible = false;
      }
    }
    if (input.pointer.inside && performance.now() >= inputAfter) {
      if (pointerKnown) sweep(input.pointer.previousX, input.pointer.previousY, input.pointer.x, input.pointer.y);
      pointerKnown = true;
      // Entry caused by a rising bubble also pops. A stationary pointer is never penalized.
      for (const b of bubbles) if (playable() && available(b) && Math.hypot(input.pointer.x - b.x, input.pointer.y - b.y) <= hitRadius(b)) pop(b);
    }
    ensureHighlight(); if (time - lastPop > COMBO_WINDOW) combo = 0;
    if (!intro && elapsed >= duration) finishRound();
  }
  function updateResult(dt: number): void {
    phaseT += dt;
    if (phase === 'choice') { if (phaseT >= OPEN_SWAP * OPEN_SECONDS && phaseT - dt < OPEN_SWAP * OPEN_SECONDS) sparkleShells(); else updateSparkles(dt); }
    if (phase === 'celebration') {
      const next = Math.min(count, Math.floor(phaseT / 2.1 * count));
      if (next > tallyCount) { tallyCount = next; playSfx(audio, 'tick', { volume: 0.45 }); }
      const shownStars = Math.min(stars, Math.max(0, Math.floor((phaseT - 2.1) / 0.4) + 1));
      if (shownStars > starsPlayed) { playSfx(audio, 'star', { index: starsPlayed }); starsPlayed = shownStars; }
      if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
    } else if (phase === 'sticker' && phaseT >= 0.7) enterRest();
  }
  function drawJar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, total: number): void {
    chunkyPanel(ctx, x - width / 2, y - height / 2, width, height, '#fff6dc', OUTLINE, 18 * u, 4 * u);
    const shown = total === 0 ? 0 : (total - 1) % 10 + 1;
    const cell = Math.min(width / 7, height / 2.5), left = x - width * 0.37;
    for (let i = 0; i < 10; i++) {
      const cx = left + (i % 5) * cell, cy = y + (i < 5 ? -0.5 : 0.5) * cell;
      ctx.beginPath(); ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2); ctx.fillStyle = i < shown ? '#73b9ba' : '#dfd9c8'; ctx.fill();
      if (i < shown) { const index = Math.max(0, total - shown + i); creature(ctx, tally[index % tally.length] ?? 0, cx, cy, cell * 0.77); }
    }
    drawCounter(ctx, shown, x + width * 0.36, y, Math.max(42, height * 0.48), time - lastPop);
  }
  function renderBubbles(ctx: CanvasRenderingContext2D): void {
    for (const b of bubbles) {
      if (!b.active) continue;
      // Solid fill and dark rim stay legible in grayscale; colors each carry a distinct creature.
      chunkyCircle(ctx, b.x, b.y, b.r, colors[b.creature % colors.length]!, '#263f65', Math.max(3, 5 * u));
      ctx.beginPath(); ctx.ellipse(b.x - b.r * 0.3, b.y - b.r * 0.44, b.r * 0.25, b.r * 0.12, -0.6, 0, Math.PI * 2); ctx.fillStyle = '#fff5d2'; ctx.fill();
      const bob = Math.sin(time * 1.5 + b.phase) * 3 * u; creature(ctx, b.creature, b.x, b.y + bob, diameter * 0.73);
      if (b.surprise) { starPath(ctx, b.x + b.r * 0.62, b.y - b.r * 0.6, b.r * 0.24); ctx.fillStyle = '#ffe16b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke(); }
      if (highlighted === b) {
        ctx.beginPath(); ctx.arc(b.x, b.y, hitRadius(b), 0, Math.PI * 2); ctx.strokeStyle = '#fff6a3'; ctx.lineWidth = Math.max(3, 5 * u); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x - 8 * u, b.y - hitRadius(b) - 17 * u); ctx.lineTo(b.x + 8 * u, b.y - hitRadius(b) - 17 * u); ctx.lineTo(b.x, b.y - hitRadius(b) - 5 * u); ctx.closePath(); ctx.fillStyle = '#fff6a3'; ctx.fill();
      }
    }
  }
  function renderFlights(ctx: CanvasRenderingContext2D): void {
    for (const f of flights) {
      if (!f.active) continue;
      const k = clamp01(f.t / 0.55), e = easeOutCubic(k);
      const cell = Math.min(jarW / 7, jarH / 2.5);
      const targetX = jarX - jarW * 0.37 + (f.slot % 5) * cell, targetY = jarY + (f.slot < 5 ? -0.5 : 0.5) * cell;
      const size = lerp(f.r * 1.3, 22 * u, e), squash = Math.sin(Math.min(1, f.t / 0.1) * Math.PI) * 0.15;
      const base = Math.round(diameter * 0.73), scale = size / base;
      creature(ctx, f.creature, lerp(f.x, targetX, e), lerp(f.y, targetY, e) - Math.sin(k * Math.PI) * 35 * u, base, scale * (1 + squash), scale * (1 - squash));
    }
  }
  function renderHud(ctx: CanvasRenderingContext2D): void {
    drawJar(ctx, jarX, jarY, jarW, jarH, count);
    // Small chain pips never change sound, scoring or the tier.
    const shrink = clamp01((COMBO_WINDOW + 0.2 - (time - lastPop)) / 0.2);
    for (let i = 0; i < combo; i++) {
      ctx.beginPath(); ctx.arc(W / 2 + (i - (combo - 1) / 2) * 13 * u, jarY + jarH / 2 + 16 * u, (i === 2 || i === 5 || i === 9 ? 5 : 3) * u * shrink, 0, Math.PI * 2); ctx.fillStyle = '#ffe69a'; ctx.fill();
    }
  }
  function renderStars(ctx: CanvasRenderingContext2D): void {
    // Finishing always earns one star, including a zero-pop round.
    const n = phase === 'celebration' ? Math.max(1, starsPlayed) : stars;
    for (let i = 0; i < n; i++) drawSprite(ctx, sprites, 'rewards/gold-star', W / 2 + (i - (stars - 1) / 2) * starSize * 1.2, starY, Math.round(starSize));
  }
  function renderRewardCount(ctx: CanvasRenderingContext2D, total: number): void {
    drawSprite(ctx, sprites, 'rewards/counting-tray', W / 2, trayY, Math.round(trayWidth));
    const cell = trayWidth * 0.103, left = W / 2 - trayWidth * 0.32;
    const shown = total === 0 ? 0 : (total - 1) % 10 + 1;
    for (let i = 0; i < 10; i++) {
      const x = left + (i % 5) * cell, y = trayY + (i < 5 ? -0.57 : 0.43) * cell;
      ctx.beginPath(); ctx.arc(x, y, cell * 0.43, 0, Math.PI * 2);
      ctx.fillStyle = i < shown ? '#7fbebc' : '#d7d1bb'; ctx.fill();
      if (i < shown) creature(ctx, tally[Math.max(0, total - shown + i) % tally.length] ?? 0, x, y, Math.round(cell * 0.95));
    }
    // Up to ten the tray names the quantity it shows. Above ten only the total bubble carries a numeral,
    // so the partial ten in the tray never reads as the score.
    if (count <= 10) drawCounter(ctx, shown, W / 2 + trayWidth * 0.29, trayY - 2, Math.round(trayWidth * 0.115), 1);
    else {
      const x = W < 550 ? W / 2 : W / 2 + trayWidth * 0.76;
      const y = W < 550 ? starY + starSize / 2 + 44 : trayY;
      const size = W < 550 ? 68 : trayWidth * 0.3;
      // A separate ocean bubble carries the cumulative round total.
      chunkyCircle(ctx, x, y, size / 2, '#75cfd9', '#235977', 3);
      drawSprite(ctx, sprites, bubbleName, x, y, Math.round(size * 1.12));
      drawCounter(ctx, total, x, y, Math.round(size * 0.4), 1);
    }
  }
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  /**
   * A shell and its sticker. `open` runs from 0 (closed shell) to 1 (open shell, sticker risen into place).
   * Before OPEN_SWAP the closed shell, fully opaque, squashes down onto its base; at OPEN_SWAP it is replaced
   * in one frame by the open shell, stretched tall and springing back, behind a gold ring (with `flash`, drawn between
   * the shell and the sticker) and a burst of stars (see sparkleShells), and the sticker grows up out of the bowl. The two shells are never drawn together, so nothing shows through
   * a closed shell. An empty id draws the closed shell alone.
   */
  function treasure(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, mint: boolean, focused = false, scale = 1, open = 1, alpha = 1, flash = false): void {
    if (focused) {
      // A complete light/dark contour is still a choice cue in grayscale.
      ctx.beginPath(); ctx.ellipse(x, y, size * 0.51 + 8, size * 0.52 + 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
    }
    const k = id ? clamp01(open) : 0, side = Math.round(size);
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (k < OPEN_SWAP) {
      // Squash builds toward the swap; the base stays on the sand.
      const q = k / OPEN_SWAP, squash = q * q, sx = scale * (1 + 0.12 * squash), sy = scale * (1 - 0.16 * squash);
      drawSprite(ctx, sprites, mint ? 'rewards/shell-closed-mint' : 'rewards/shell-closed-coral', x, y + size * (scale - sy) * 0.48, side, 0, sx, sy);
    } else {
      // A damped spring from tall and narrow back to rest.
      const p = (k - OPEN_SWAP) / (1 - OPEN_SWAP), spring = (1 - p) * (1 - p) * Math.cos(p * Math.PI * 2);
      const sx = scale * (1 - 0.07 * spring), sy = scale * (1 + 0.12 * spring);
      drawSprite(ctx, sprites, mint ? 'rewards/shell-mint' : 'rewards/shell-coral', x, y + size * (scale - sy) * 0.48, side, 0, sx, sy);
      if (flash) renderFlash(ctx, x, y);
      const rise = easeOutCubic(p), s = scale * lerp(0.35, 1, rise);
      drawSprite(ctx, sprites, rewardNames.get(id)!, x, y + size * (0.07 + 0.17 * (1 - rise)) * scale, Math.round(size * 0.95), 0, s, s);
    }
    ctx.globalAlpha = 1;
  }
  // Opening stars: a fixed pool, SPARKLES per offered shell, drawn as chunky outlined stars like the rest of the art.
  const SPARK_POOL = SPARKLES * 2;
  const sparkX = new Float32Array(SPARK_POOL), sparkY = new Float32Array(SPARK_POOL), sparkVX = new Float32Array(SPARK_POOL), sparkVY = new Float32Array(SPARK_POOL);
  const sparkAge = new Float32Array(SPARK_POOL), sparkLife = new Float32Array(SPARK_POOL), sparkSize = new Float32Array(SPARK_POOL);
  let sparkCount = 0, sparkK = 1;
  /** The burst that hides the closed-to-open swap: gold and coral stars thrown up and out from each shell's seam, and the opening sound. */
  function sparkleShells(): void {
    sparkCount = 0;
    if (!pending) return;
    const k = sparkK = Math.max(0.5, shellSize / 370);
    for (let s = 0; s < pending.choices.length && s < 2; s++) {
      const cx = controlX(s, true), cy = shellY + shellSize * 0.2;
      for (let j = 0; j < SPARKLES; j++) {
        const i = sparkCount++, a = -Math.PI / 2 + (j - (SPARKLES - 1) / 2) / SPARKLES * Math.PI * 2 + (random() - 0.5) * 0.35;
        const speed = (650 + random() * 300) * k;
        sparkX[i] = cx + Math.cos(a) * shellSize * 0.3; sparkY[i] = cy + Math.sin(a) * shellSize * 0.16;
        sparkVX[i] = Math.cos(a) * speed; sparkVY[i] = Math.sin(a) * speed - 200 * k;
        sparkAge[i] = 0; sparkLife[i] = 0.6 + random() * 0.15; sparkSize[i] = (24 + random() * 10) * k;
      }
    }
    playSfx(audio, 'pop-big', openSfx);
  }
  function updateSparkles(dt: number): void {
    const drag = Math.pow(0.08, dt), gravity = 700 * sparkK * dt;
    for (let i = 0; i < sparkCount; i++) {
      sparkAge[i]! += dt; sparkVX[i]! *= drag; sparkVY[i] = sparkVY[i]! * drag + gravity;
      sparkX[i]! += sparkVX[i]! * dt; sparkY[i]! += sparkVY[i]! * dt;
    }
  }
  function renderSparkles(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round';
    for (let i = 0; i < sparkCount; i++) {
      const q = sparkAge[i]! / sparkLife[i]!;
      if (q >= 1) continue;
      // Pops in at full size within 60 ms, holds, then shrinks away over the last 35% of its life.
      const r = sparkSize[i]! * Math.min(1, 0.45 + sparkAge[i]! / 0.06 * 0.55) * Math.min(1, (1 - q) / 0.35);
      starPath(ctx, sparkX[i]!, sparkY[i]!, r);
      ctx.fillStyle = i & 1 ? SPARKLE_COLORS[1] : SPARKLE_COLORS[0]; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.2); ctx.stroke();
    }
    ctx.lineJoin = 'miter';
  }
  /**
   * A bold gold ring with the art's dark contour bursts out from a shell centred on x, y for FLASH_SECONDS after the
   * swap, over the open shell and behind the rising sticker. It ends by thinning away rather than fading, so its colours
   * stay solid: over its second half the gold and the contour thin together, and it is gone before the gold is thinner
   * than 4 px (half its full width on small shells), so it never ends as a hairline or a bare dark hoop. It stays inside
   * its own shell's half of the row.
   */
  function renderFlash(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const q = (phaseT - OPEN_SWAP * OPEN_SECONDS) / FLASH_SECONDS;
    const full = Math.max(4, shellSize * 0.06), thin = Math.min(1, (1 - q) / 0.5), width = full * thin;
    if (q < 0 || q >= 1 || width < Math.min(4, full * 0.5)) return;
    const e = easeOutCubic(q);
    ctx.beginPath(); ctx.ellipse(x, y + shellSize * 0.1, shellSize * lerp(0.28, 0.56, e), shellSize * lerp(0.18, 0.48, e), 0, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = width + 6 * thin; ctx.stroke();
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = width; ctx.stroke();
  }
  /** The round's own catch in bubbles, for rounds with no gift to offer. Nothing sits on a pedestal. */
  function renderGroup(ctx: CanvasRenderingContext2D, cx: number, cy: number, entering: boolean): void {
    const n = groupCount || 3, d = groupD, r = d / 2, two = n > 3;
    for (let i = 0; i < n; i++) {
      const row = two && i >= 3 ? 1 : 0, inRow = two ? (row ? n - 3 : 3) : n, col = row ? i - 3 : i;
      const x = cx + (col - (inRow - 1) / 2) * d * 1.1;
      let y = cy + (two ? (row ? -0.47 : 0.47) * d : (col % 2 ? -0.08 : 0.08) * d);
      // Each bubble rises from below the screen and settles; nothing moves once settled.
      if (entering) y += (1 - easeOutCubic(clamp01((phaseT - i * 0.12) / 1.1))) * (H - y + d);
      chunkyCircle(ctx, x, y, r, groupCount ? colors[group[i]! % colors.length]! : '#9fd6e0', '#263f65', Math.max(3, 5 * u));
      ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.44, r * 0.25, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fillStyle = '#fff5d2'; ctx.fill();
      if (groupCount) creature(ctx, group[i]!, x, y, Math.round(d * 0.73));
    }
  }
  function renderResult(ctx: CanvasRenderingContext2D): void {
    renderStars(ctx);
    renderRewardCount(ctx, phase === 'celebration' ? tallyCount : count);
    shellDrawn = 0; shellIndex = -1;
    if (phase === 'celebration') {
      if (pending && giftFollows()) {
        // Closed shells wait where the offers will be; the choice begins by opening them.
        const rise = (1 - easeOutCubic(clamp01(phaseT / 0.8))) * 40 * u, alpha = clamp01(phaseT / 0.35);
        for (let i = 0; i < pending.choices.length; i++) treasure(ctx, '', controlX(i, true), shellY + rise, shellSize, i === 1, false, 1, 0, alpha);
      } else renderGroup(ctx, W / 2, shellY, true);
      return;
    }
    if (phase === 'choice' && pending) {
      const open = clamp01(phaseT / OPEN_SECONDS);
      for (let i = 0; i < pending.choices.length; i++) treasure(ctx, pending.choices[i]!, controlX(i, true), shellY, shellSize, i === 1, open >= 1 && menuSelected === i, 1, open, 1, true);
      if (phaseT >= OPEN_SWAP * OPEN_SECONDS) renderSparkles(ctx);
      shellIndex = Math.max(0, menuSelected); shellX = controlX(shellIndex, true); shellDrawY = shellY; shellDrawn = shellSize;
      return;
    }
    if (pending?.chosen) {
      const index = Math.max(0, pending.choices.indexOf(pending.chosen)), reveal = phase === 'sticker';
      if (reveal) {
        // The shell not chosen sinks and fades instead of vanishing.
        const leaving = clamp01(phaseT / LEAVE_SECONDS);
        if (leaving < 1) for (let i = 0; i < pending.choices.length; i++) if (i !== index) {
          treasure(ctx, pending.choices[i]!, controlX(i, true), shellY + easeOutCubic(leaving) * shellSize * 0.18, shellSize, i === 1, false, 1, 1, 1 - leaving);
        }
      }
      const e = reveal ? easeOutCubic(clamp01(phaseT / REVEAL_SECONDS)) : 1;
      // A brief lift on selection, then it settles; the chosen shell never gets smaller than its offer.
      const bump = reveal ? 1 + 0.08 * Math.sin(Math.PI * clamp01(phaseT / BUMP_SECONDS)) : 1;
      const x = lerp(controlX(index, true), W / 2, e), y = lerp(shellY, restY, e);
      // Keep one cached art size through the reveal; transforms do not grow the sprite cache.
      const scale = lerp(shellSize / restSize, 1, e) * bump;
      treasure(ctx, pending.chosen, x, y, restSize, index === 1, false, scale);
      shellIndex = index; shellX = x; shellDrawY = y; shellDrawn = restSize * scale;
    } else renderGroup(ctx, W / 2, flank ? restY : lerp(shellY, restY, easeOutCubic(clamp01(phaseT / 0.4))), false);
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i); chunkyCircle(ctx, x, controlsY, controlsRadius, '#a3c9c5', OUTLINE, 5 * u);
      drawSprite(ctx, sprites, i === 0 ? playName : homeName, x, controlsY, Math.round(controlsRadius * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsRadius);
    }
  }
  function hoverMenu(x: number, y: number): number {
    const choice = phase === 'choice', n = choice ? pending?.choices.length ?? 0 : 2;
    for (let i = 0; i < n; i++) if (Math.hypot(x - controlX(i, choice), y - (choice ? choiceY() : controlsY)) <= (choice ? choiceRadius : controlsRadius)) return i;
    return -1;
  }
  function exitToHub(): void {
    // Unfinished gifts stay pending, including a departure during the celebration or choice.
    // Leaving from rest ends the finished round exactly like the rest screen's own Home.
    closeFinishedRound(); services.save.flush(); services.nav.toHub();
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    chunkyCircle(ctx, homeX, cornerY, cornerRadius, '#a3c9c5', OUTLINE, 4);
    drawSprite(ctx, sprites, homeName, homeX, cornerY, Math.round(cornerRadius * 1.3));
    soundButton.render(ctx, sprites);
    if (cornerFocus >= 0) focusRing(ctx, cornerFocus === 0 ? homeX : soundX, cornerY, cornerRadius);
  }
  const stats: BubblePopStats = {
    get tier() { return tier; }, get phase() { return phase; }, get live() { return live(); }, get decoys() { return 0; },
    get particles() { return particles.alive; }, get count() { return count; }, get combo() { return combo; }, get hits() { return hits; },
    get misses() { return misses; }, get bestCombo() { return bestCombo; }, get expected() { return intro ? INTRO_POPS : 10; },
    get stars() { return stars; }, get remaining() { return intro ? Infinity : Math.max(0, duration - elapsed); },
    get stickerId() { return pending?.chosen ?? ''; }, get assisted() { return assisted; }, get excluded() { return excluded; },
    get qualifyingRounds() { return data?.qualifyingRounds ?? 0; }, get nextTier() { return toTier(data?.tier); },
    get wave() { return wave; }, get introductory() { return intro; }, get celebration() { return variant; },
    get choiceIds() { return pending?.choices ?? []; }, get selected() { return menuSelected; }, get roundSeconds() { return duration; },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    items() { return bubbles.filter(b => b.active).map(b => ({ x: b.x, y: b.y, r: b.r, hitRadius: hitRadius(b), decoy: false, onScreen: available(b), highlighted: b === highlighted })); },
    controls() { const choice = phase === 'choice'; return Array.from({ length: choice ? pending?.choices.length ?? 0 : phase === 'rest' ? 2 : 0 }, (_, i) => ({ x: controlX(i, choice), y: choice ? choiceY() : controlsY, radius: choice ? choiceRadius : controlsRadius, id: choice ? pending!.choices[i]! : i === 0 ? 'again' : 'home' })); },
    get shell() { return { x: shellX, y: shellDrawY, size: shellDrawn, index: shellIndex }; },
    get warmRetries() { return warmRetries; },
    get warmPending() { let n = warmRetry >= 0 ? 1 : 0; for (const key of warmKeys) if (!warmDone.has(key)) n++; return n; },
    resultLayout() {
      const trayHalf = trayWidth * 0.386 / 2, narrowTotal = W < 550 && count > 10;
      return { width: W, height: H, count, flank, starTop: starY - starSize / 2, starBottom: starY + starSize / 2,
        totalTop: narrowTotal ? starY + starSize / 2 + 10 : 0, totalBottom: narrowTotal ? starY + starSize / 2 + 78 : 0,
        trayTop: trayY - trayHalf, trayBottom: trayY + trayHalf, shellY, shellSize, restY, restSize, controlsY, controlsRadius,
        controlsLeft: controlX(0) - controlsRadius, controlsRight: controlX(1) + controlsRadius };
    },
    resetWork() { workHead = workCount = 0; },
  };
  return {
    stats,
    enter() {
      // Decode off the main thread now, so preparing the end-of-round sizes during play only scales.
      void loadBubblePopArt(services, theme).then(() => { for (const { name } of artList(theme)) sprites.get(name)?.decode().catch(() => undefined); });
      data = services.save.gameData<GameData>(GAME_ID, { tier: 0, bestCount: 0, rounds: 0, qualifyingRounds: 0, lastCelebration: -1, pending: null });
      sanitizeBubbleData(data, () => services.save.protect(), names.length);
      // Legacy finished rounds already owned stars/stickers. They should not repeat the introduction.
      data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; startMusic(audio, theme.music);
      if (data.pending) {
        pending = data.pending; count = pending.count; stars = pending.stars; tier = pending.tier; variant = pending.variant;
        tally.set(pending.tally.slice(0, tally.length)); collectGroup(); layout(services.canvas.width, services.canvas.height);
        if (giftFollows()) { phase = 'choice'; phaseT = 0; armMenu(); }
        else enterRest();
      } else { layout(services.canvas.width, services.canvas.height); startRound(); }
    },
    pause() { stopMusic(audio); stopWarm(); services.save.flush(); },
    resume() {
      // Back on top after another screen (the break nudge) covered it. Keys pressed into that screen must not act
      // here: the choice and rest screen start over as when they first appeared, nothing focused and input ignored
      // for MENU_GUARD_MS. The corner Home and sound buttons still act at once.
      if (phase === 'choice' || phase === 'rest') { armMenu(); cornerFocus = -1; } else guard();
      startMusic(audio, theme.music);
    },
    // Any route away from rest (corner Home, the break nudge's Home) closes the finished round.
    exit() { stopMusic(audio); stopWarm(); closeFinishedRound(); services.save.flush(); },
    resize: layout,
    update(dt) {
      const started = performance.now(); time += dt; sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      if (playable()) updatePlay(dt); else updateResult(dt);
      particles.update(dt); for (const f of flights) if (f.active) { f.t += dt; if (f.t >= 0.55) f.active = false; }
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H) layout(view.width, view.height);
      ensureBackground();
      if (!playable() || elapsed >= 0.5) warm(ctx);
      if (bgCanvas) ctx.drawImage(bgCanvas, bgX, bgY, bgCanvas.width / sprites.pixelRatio, bgCanvas.height / sprites.pixelRatio); else { ctx.fillStyle = pal.water; ctx.fillRect(0, 0, W, H); }
      if (playable()) { renderBubbles(ctx); renderHud(ctx); renderFlights(ctx); particles.render(ctx); } else renderResult(ctx);
      drawCorners(ctx); drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'pointerup' || event.type === 'keyup') { soundButton.pointerUp(soundX, cornerY); return; }
      const now = performance.now(), menu = phase === 'choice' || phase === 'rest';
      if (event.type === 'pointermove') {
        lastInput = elapsed;
        if (playable() && now >= inputAfter) {
          if (pointerKnown) sweep(input.pointer.previousX, input.pointer.previousY, event.info.x, event.info.y);
          pointerKnown = true;
        } else if (menu && now >= inputAfter) {
          const index = hoverMenu(event.info.x, event.info.y);
          if (index >= 0) { if (menuSelected < 0) focusAt = now; menuSelected = index; }
        }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { exitToHub(); return; }
        cornerFocus = -1;
      } else if (!playable()) {
        // During play every key pops, Escape, Tab and Enter included: there is no wrong button.
        // Keyboard routes to Home exist only after the round, once its input guard has passed.
        if (phase === 'celebration' ? !celebrationSkippable() : now < inputAfter) return;
        if (event.info.code === 'Escape') { exitToHub(); return; }
        if (event.info.code === 'Tab') { cornerFocus = (cornerFocus + 2) % 3 - 1; return; }
        if (cornerFocus >= 0) {
          if (event.info.code.startsWith('Arrow')) { cornerFocus = 1 - cornerFocus; return; }
          if (event.info.code === 'Enter' || event.info.code === 'NumpadEnter') {
            if (cornerFocus === 0) exitToHub(); else soundButton.pointerDown(soundX, cornerY);
            return;
          }
          cornerFocus = -1;
        }
      }
      // The celebration plays until every earned star has appeared and CELEBRATION_LOCK has passed,
      // so the click or key that ends the round cannot skip it.
      if (phase === 'celebration') { if (celebrationSkippable()) finishCelebration(); return; }
      if (now < inputAfter) return;
      if (playable()) {
        lastInput = elapsed;
        if (event.type === 'pointerdown') { pointerKnown = true; pointerPop(event.info.x, event.info.y); }
        else if (now >= keyAfter) { keyAfter = now + 100; ensureHighlight(); if (highlighted) pop(highlighted, true); }
        return;
      }
      if (!menu) return;
      if (event.type === 'pointerdown') {
        // A click on a shell or button acts directly.
        const selected = hoverMenu(event.info.x, event.info.y); if (selected < 0) return; menuSelected = selected;
      } else {
        const code = event.info.code, n = phase === 'choice' ? pending?.choices.length ?? 1 : 2;
        // The first key only shows focus; a later key acts on what the child can see.
        if (menuSelected < 0) { menuSelected = 0; focusAt = now; return; }
        if (code.startsWith('Arrow')) { menuSelected = (menuSelected + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
      }
      if (phase === 'choice') chooseSticker(menuSelected); else leave(menuSelected === 0);
    },
  };
}
