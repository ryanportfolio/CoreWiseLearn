/** Web Playground: find the number or letter the hero shows, catch it with a web, then spin a web picture. */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import { ensureDisplayFont } from '../../app/font';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, setSfxVariants } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, drawSprite, OUTLINE } from '../../ui/draw';
import { drawCounter, drawStarRow, starPath, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp } from '../../ui/tween';
import { bakeBackground, coverRect, createSoundButton, soundArt, syncSoundIcon, type Rect } from '../../scenes/hub/shared';
import { bakeBall, bakePoint, bakeSign, PAD, RIMS } from './bake';
import { cancelClips, playClip, prepareClips } from './voice';
import {
  CATCHES_PER_ROUND, catchRange, clipName, connectCount, DEFAULT_DATA, GAME_ID, glyph, heartAt, keyMatches, nextLevel, nextTier,
  PICTURES, pictureBox, pictureOutline, picturePoints, sanitizeData, signDots, signGlyph, stepNeedsGlyph, TIERS, toLevel, toTier,
  type GameData, type Level, type Mode, type PendingRound, type TierParams,
} from './content';

export { GAME_ID } from './content';
const ART_DIR = 'web-playground/';
const HERO = { wave: 'hero-wave', shoot: 'hero-shoot', swing: 'hero-swing', cheer: 'hero-cheer' } as const;
type Pose = keyof typeof HERO;
const spriteName = (name: string): string => `${ART_DIR}${name}`;
// Sprite names built once, so update and render never build strings.
const HERO_SPRITE: Readonly<Record<Pose, string>> = { wave: spriteName(HERO.wave), shoot: spriteName(HERO.shoot), swing: spriteName(HERO.swing), cheer: spriteName(HERO.cheer) };
const KITTEN = spriteName('kitten'), GIRL = spriteName('girl'), PIGEON = spriteName('pigeon'), EMBLEM = spriteName('emblem');
const CITY_DAY = spriteName('city-day'), CITY_DUSK = spriteName('city-dusk');
/** Hand positions as fractions of each pose's image (measured on the processed art). */
const SHOOT_HAND = [0.87, 0.42] as const, SWING_HAND = [0.125, 0.07] as const;
const ART = ['hero-wave', 'hero-shoot', 'hero-swing', 'hero-cheer', 'city-day', 'city-dusk', 'kitten', 'girl', 'pigeon', 'emblem'];
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
const BG_W = 1366, BG_H = 911;
const GUARD_MS = 350;
// Choice and rest ignore input this long, so steady pressing from the round cannot choose for the child; after the
// first key shows focus, a later key acts only once focus has shown FOCUS_HOLD_MS (as in Bubble Bay).
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250;
const SWING_IN = 1.4, SWING_OUT = 0.9, SWING_ACROSS_IN = 0.9, COMPLETE_SECONDS = 1.7, CELEBRATION_SECONDS = 4, CELEBRATION_MIN = 1.5;
const MAX_BALLS = 5, MAX_POINTS = 10, PUFFS = 4;
const PICTURE_FILL = ['#ffd23f', '#f2545b', '#3b82f6'] as const;
const RIM_HUES = [4, 218, 44] as const;
const HOMES: Readonly<Record<number, readonly number[]>> = {
  3: [0.18, 0.32, 0.52, 0.72, 0.86, 0.28],
  4: [0.12, 0.3, 0.4, 0.75, 0.64, 0.22, 0.9, 0.68],
  5: [0.08, 0.62, 0.28, 0.18, 0.5, 0.7, 0.72, 0.22, 0.93, 0.62],
};
/** Narrow views (the ball field is under 2.5 balls wide): three balls in a zigzag column. */
const NARROW_HOMES: readonly number[] = [0, 0, 1, 0.5, 0, 1];
const NARROW_BALLS = 3;
/** Floor for ball and point discs: 100 keeps the drawn disc at least 96 px even after edge anti-aliasing. */
const MIN_DISC = 100;
/** Clear space kept between two floating balls at the widest bob and sway. */
const BALL_GAP = 2;
const IDLE_OPTIONS: IdleRequestOptions = { timeout: 500 };
const GUIDE_FADES = 24;
/** Clear space wanted between two connect points' discs, so the rings round the next and joined points have room; the least accepted. */
const POINT_GAP = 16, POINT_GAP_MIN = 8;
/** Hand offset in the shoot pose, as fractions of the sprite from its centre. */
const AIM_X = SHOOT_HAND[0] - 0.5, AIM_Y = SHOOT_HAND[1] - 0.5;
type Phase = 'swingIn' | 'catch' | 'swing' | 'connect' | 'complete' | 'celebration' | 'choice' | 'sticker' | 'rest';
type CatchStep = 'ask' | 'shoot' | 'wait';
/** ringed: a click on the target the keyboard focus ring marks; it plays like a click but is not learning evidence. */
type How = 'click' | 'ringed' | 'key-match' | 'key-other' | 'demo';

export interface WebPlaygroundOptions { mode?: Mode; level?: Level }
export interface WebPlaygroundStats {
  readonly phase: Phase; readonly tier: Tier; readonly mode: Mode; readonly level: Level; readonly picture: string;
  readonly request: string; readonly hint: boolean; readonly caught: number; readonly connected: number; readonly points: number;
  readonly correct: number; readonly wrong: number; readonly alone: number; readonly stars: number; readonly stickerId: string;
  readonly choiceIds: readonly string[]; readonly selected: number; readonly rounds: number;
  readonly motor: { attempts: number; hits: number; padded: number };
  readonly levels: { numbers: number; letters: number; tier: number };
  readonly workMean: number; readonly workMax: number; readonly particles: number;
  /** Hint trail dots in the last frame: drawn in full, faded near another target, and left out over one. */
  readonly guide: { dots: number; faded: number; hidden: number };
  /** Balls on screen; catchable is false while a ball is still dropping in. */
  balls(): { x: number; y: number; r: number; glyph: string; wanted: boolean; catchable: boolean }[];
  pointsList(): { x: number; y: number; r: number; glyph: string; next: boolean; joined: boolean }[];
  controls(): { x: number; y: number; radius: number; id: string }[];
  corners(): { x: number; y: number; radius: number; id: string }[];
  /** The connect picture's box in CSS px (outline included, kite tail not) and its point centres, while it shows. */
  pictureRect(): { x0: number; x1: number; y0: number; y1: number; points: number[] } | null;
  /**
   * Cached art against the canvas pixel ratio, for checks: backdrops in device px with the size the view needs, and
   * how many baked glyph canvases (balls, caught balls, points, sign) match the current ratio and how many do not.
   */
  art(): { dpr: number; view: number[]; day: number[]; dusk: number[]; glyphs: number; stale: number };
  resetWork(): void;
}
export interface WebPlaygroundScene extends Scene { readonly stats: WebPlaygroundStats }

interface Ball {
  /** home: index into the narrow zigzag homes (narrow views), else the slot. */
  active: boolean; value: number; slot: number; home: number; homeX: number; homeY: number; x: number; y: number;
  phase: number; enter: number; delay: number; wiggle: number; rim: number; pulled: boolean; canvas: HTMLCanvasElement | undefined;
}

function artList(): { name: string; path: string }[] {
  return [
    ...ART.map(name => ({ name: spriteName(name), path: `${ART_DIR}${name}.webp` })),
    { name: BUTTON_PLAY, path: `${BUTTON_PLAY}.png` }, { name: BUTTON_HOME, path: `${BUTTON_HOME}.png` }, { name: BOOK_ICON, path: BOOK_ICON_PATH },
    ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path })),
  ];
}
export async function loadWebPlaygroundArt(services: AppServices): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(artList().map(({ name, path }) => services.sprites.load(name, services.art(path)).catch(() => { missing.push(path); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}

export function createWebPlaygroundScene(services: AppServices, options: WebPlaygroundOptions = {}): WebPlaygroundScene {
  const { sprites, audio, input } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(160);
  const soundButton = createSoundButton(services);
  const balls: Ball[] = Array.from({ length: MAX_BALLS }, (_, slot) => ({ active: false, value: 0, slot, home: slot, homeX: 0, homeY: 0, x: 0, y: 0, phase: 0, enter: 1, delay: 0, wiggle: 0, rim: 0, pulled: false, canvas: undefined }));
  const ballCache = new Map<string, HTMLCanvasElement>();
  // Sticker sprite names built once, so the choice, sticker and rest screens build no strings per frame.
  const stickerNames = new Map(STICKERS.map(s => [s.id, stickerSpriteName(s.id)]));
  // The offers drawn as stickers, and the small sticker book they go into (its centre during the choice in bookAt).
  // bookGlide: the rest screen came from a pick, so the book moves from beside the offers to the middle.
  const offers = createStickerOffers(sprites), bookAt = new Float32Array(2);
  let bookGlide = false;
  const caught = new Int8Array(CATCHES_PER_ROUND), caughtCanvas: (HTMLCanvasElement | undefined)[] = [];
  const unit = new Float32Array(MAX_POINTS * 2), pts = new Float32Array(MAX_POINTS * 2), outline = new Float32Array(96 * 2);
  const curveT = new Float32Array(MAX_POINTS);
  // The connect picture's unit bounding box and outline samples, for fitting it to the view.
  const picBox = new Float32Array(4), picShape = new Float32Array(48 * 2);
  const pointCanvas: (HTMLCanvasElement | undefined)[] = Array.from({ length: MAX_POINTS }, () => undefined);
  const pointWiggle = new Float32Array(MAX_POINTS), pointJoined = new Float32Array(MAX_POINTS);
  const puffs = Array.from({ length: PUFFS }, () => ({ active: false, x: 0, y: 0, t: 0 }));
  const pows = Array.from({ length: 3 }, () => ({ active: false, x: 0, y: 0, t: 0, size: 0 }));
  const signSize = new Float32Array(2), work = new Float32Array(240), heroPos = new Float32Array(3);
  const bgDayRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let data: GameData = { ...DEFAULT_DATA };
  let W = 1366, H = 768, u = 1, fontReady = false;
  let bgDay: HTMLCanvasElement | undefined, bgDusk: HTMLCanvasElement | undefined;
  let phase: Phase = 'swingIn', step: CatchStep = 'ask', tier: Tier = 0, tierP: TierParams = TIERS[0], mode: Mode = 'numbers', level: Level = 0;
  let picture = 0, intro = false, time = 0, sceneT = 0, phaseT = 0, stepT = 0, requestT = 0, hintAt = 0;
  let request = 0, requestIndex = 0, requested = 0, lastRequest = -1, hint = false, target: Ball | undefined;
  let signCanvas: HTMLCanvasElement | undefined, signT = 0;
  let caughtCount = 0, flightT = 1, flightX = 0, flightY = 0;
  let nPoints = 5, nextPoint = 1, threadT = 1, closeT = 0;
  // roomy: the connect picture uses reclaimed space (fitPicture), as the usual area cannot fit its points.
  let roomy = false;
  let correct = 0, wrong = 0, alone = 0, attempts = 0, hits = 0, padded = 0, stars = 1, starsPlayed = 0, ticks = 0;
  // keyboardUsed: the keyboard focus ring shows on the wanted ball or next point; a key turns it on, a pointer press off.
  let pose: Pose = 'wave', poseT = 0, hopT = 9, friendHopT = 9, keyboardUsed = false, demoDone = false;
  let pending: PendingRound | null = null;
  let inputAfter = 0, menuSelected = -1, cornerFocus = -1, focusAt = 0;
  // The celebration counter's digit glyphs are baked in an idle period during play, at counterWarm px (0: not yet);
  // counterMade: baked since the last frame, so the next render draws them once under the backdrop to upload them.
  let counterPx = 50, counterWarm = 0, counterMade = false, scratch: CanvasRenderingContext2D | null | undefined;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0, dayDecoded = false, duskDecoded = false, frame = 0, bakedAt = -1;
  // Size and pixel ratio the backdrops were made at; the ratio every glyph canvas was baked at.
  let bgW = 0, bgH = 0, bgDpr = 0, dayStale = false, duskStale = false, artDpr = 0;
  let workHead = 0, workCount = 0, updateMs = 0;
  // Layout.
  let parapetY = 0, feetY = 0, heroX = 0, heroSize = 250, signW = 230, signH = 236, signX = 0, signY = 0;
  let narrow = false, wobble = 8, aimRot = 0, aimX = 0, aimY = 0;
  // The picture maps unit point (x, y) to (picX + x * picSX, picY + y * picSY).
  let ax0 = 0, ay0 = 0, ax1 = 0, ay1 = 0, ballD = 150, pointD = 124, picX = 0, picY = 0, picSX = 200, picSY = 200;
  let stringX0 = 0, stringX1 = 0, stringY = 0, miniD = 56, starY = 0, starR = 30;
  // badgeSize: an offer's tap circle across; stickerSize: its art (longest side); bookH: the book beside the offers.
  let badgeSize = 300, badgeY = 0, stickerSize = 250, bookH = 120, restSize = 260, restY = 0, controlsY = 0, controlsRadius = 60;
  let cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306;

  const guard = (ms = GUARD_MS): void => { inputAfter = performance.now() + ms; };
  /** Choice and rest start with nothing focused and ignore input for MENU_GUARD_MS. */
  const armMenu = (): void => { guard(MENU_GUARD_MS); menuSelected = -1; cornerFocus = -1; };
  /** The round is under way: from the swing-in until the picture has filled. Every key plays then. */
  const inRound = (): boolean => phase === 'swingIn' || phase === 'catch' || phase === 'swing' || phase === 'connect' || phase === 'complete';
  const celebrationSkippable = (): boolean => phaseT >= CELEBRATION_MIN && starsPlayed >= stars;
  const values = (): number => catchRange(mode, level);
  const dpr = (): number => services.canvas.dpr || 1;
  const hintDelay = (): number => (level === 0 ? 4 : 6);
  const playing = (): boolean => phase === 'catch' || phase === 'connect';
  const hitRadius = (r: number): number => Math.max(48 * services.config.uiScale, r * tierP.hitScale);
  const pointValue = (i: number): number => (mode === 'numbers' ? i + 1 : i);

  function layout(width: number, height: number): void {
    W = width; H = height;
    u = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    coverRect(BG_W, BG_H, W, H, bgDayRect);
    parapetY = bgDayRect.y + bgDayRect.h * 0.818;
    feetY = Math.min(H - 8, bgDayRect.y + bgDayRect.h * 0.92);
    heroSize = Math.max(150, Math.min(250 * u, H * 0.36));
    heroX = Math.max(heroSize * 0.42 + 8, W * 0.12);
    cornerRadius = Math.max(48, Math.min(60 * u, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    stringX0 = homeX + cornerRadius + 28 * u; stringX1 = soundX - cornerRadius - 28 * u; stringY = cornerY - 18 * u;
    miniD = Math.max(36, Math.min(60 * u, (stringX1 - stringX0) / (CATCHES_PER_ROUND + 1)));
    // The sign grows with the hero and, past its 1366x768 size, only into the room between the corner buttons and
    // his head, so a large uiScale cannot make it bury him or crowd the balls.
    const signBase = mode === 'numbers' ? 236 : 176, signRoom = feetY - heroSize - (cornerY + cornerRadius + 10);
    const su = Math.min(u, heroSize / 250 * 1.15, Math.max(1, signRoom / (signBase * 1.16)));
    signW = Math.max(150, 230 * su); signH = signBase * Math.max(0.65, su);
    signX = heroX + 34 * u;
    signY = Math.max(cornerY + cornerRadius + 10 + signH / 2, feetY - heroSize - signH * 0.6 - 26 * u);
    fitBalls();
    replaceBalls();
    fitConnect();
    starR = Math.max(22, Math.min(40 * u, cornerRadius * 0.7)); starY = cornerY;
    counterPx = Math.round(Math.max(36, 50 * u));
    badgeSize = Math.min(330 * Math.min(1.25, H / 768), (W - 60) / 2.3, H * 0.42);
    // Never under 48 px (96 px across), whatever uiScale the config sets.
    controlsRadius = Math.max(48, Math.min(Math.max(48 * services.config.uiScale, 62 * u), W / 5));
    controlsY = H - controlsRadius - 22;
    badgeY = Math.min(H * 0.56, controlsY - controlsRadius - badgeSize / 2 - 10);
    restSize = Math.max(120, Math.min(280 * Math.min(1.25, H / 768), controlsY - controlsRadius - (starY + starR) - 40));
    restY = (starY + starR + controlsY - controlsRadius) / 2;
    stickerSize = Math.round(badgeSize * 0.84); bookH = Math.round(Math.max(72, Math.min(200, badgeSize * 0.5)));
    ballCache.clear(); for (const b of balls) b.canvas = undefined;
    for (let i = 0; i < MAX_POINTS; i++) pointCanvas[i] = undefined;
    caughtCanvas.length = 0; signCanvas = undefined;
    // Rescaling the backdrops is costly; only a new canvas size or pixel ratio needs it (the engine's adaptive
    // resolution changes the ratio without changing the size). Until a backdrop is remade, its old canvas is drawn
    // stretched to the view, so the view is never left unpainted.
    artDpr = dpr();
    if (W !== bgW || H !== bgH || artDpr !== bgDpr) { dayStale = duskStale = true; bgW = W; bgH = H; bgDpr = artDpr; }
  }
  /** The area ball centres float in, for balls d across. */
  function ballField(d: number): void {
    ballD = d;
    ax0 = Math.max(heroX + heroSize * 0.6, signX + signW / 2 + 20 * u, W * 0.3) + d / 2;
    ax1 = W - 40 * u - d / 2;
    ay0 = cornerY + cornerRadius + 26 * u + d / 2;
    ay1 = Math.max(ay0 + 10, parapetY - 12 * u - d / 2);
  }
  /** True when every two homes keep their balls BALL_GAP apart at the widest bob and sway. */
  function homesClear(): boolean {
    const n = narrow ? NARROW_BALLS : tierP.balls, homes = narrow ? NARROW_HOMES : HOMES[tierP.balls] ?? HOMES[3]!;
    // Two balls bob (up to wobble) and sway (up to 0.8 of it) out of phase: 2 * hypot(1, 0.8) is about 2.6.
    const need = ballD + BALL_GAP + 2.6 * wobble, xr = Math.max(0, ax1 - ax0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.hypot((homes[i * 2]! - homes[j * 2]!) * xr, (homes[i * 2 + 1]! - homes[j * 2 + 1]!) * (ay1 - ay0)) < need) return false;
    }
    return true;
  }
  /**
   * Ball size and field. Balls start at the tier's size (never under MIN_DISC) and shrink only where their homes would
   * crowd (a large uiScale). Still crowded at MIN_DISC: a bob and sway down to half as wide; then three balls in the
   * narrow column, sized the same way; then a calmer bob and sway again.
   */
  function fitBalls(): void {
    const full = tierP.wobble * u, start = Math.max(MIN_DISC, tierP.ball * u);
    wobble = full;
    let d = start;
    for (;;) {
      ballField(d); narrow = ax1 - ax0 < d * 2.5;
      if (homesClear() || d <= MIN_DISC) break;
      d = Math.max(MIN_DISC, d * 0.92);
    }
    while (!homesClear() && wobble > full * 0.5) wobble = Math.max(full * 0.5, wobble * 0.9);
    if (!homesClear()) {
      narrow = true; wobble = full;
      for (d = start; ; d = Math.max(MIN_DISC, d * 0.92)) { ballField(d); if (homesClear() || d <= MIN_DISC) break; }
    }
    while (!homesClear() && wobble > 0.5) wobble *= 0.8;
  }
  function placeHome(b: Ball): void {
    const homes = narrow ? NARROW_HOMES : HOMES[tierP.balls] ?? HOMES[3]!;
    const i = narrow ? b.home : b.slot;
    const nx = homes[i * 2] ?? 0.5, ny = homes[i * 2 + 1] ?? 0.5;
    b.homeX = lerp(ax0, Math.max(ax0, ax1), nx); b.homeY = lerp(ay0, ay1, ny);
  }
  /** A narrow home no other floating ball uses, or -1. */
  function freeHome(self: Ball): number {
    for (let h = 0; h < NARROW_BALLS; h++) {
      let used = false;
      for (const o of balls) if (o !== self && o.active && !o.pulled && o.home === h) { used = true; break; }
      if (!used) return h;
    }
    return -1;
  }
  /**
   * After a resize, every floating ball gets a home of its own. A narrow view has three homes: the wanted ball keeps
   * one, other balls fill the rest and any left over float away (the round goes on with three). A wider view again
   * floats the tier's full set, new balls dropping into the empty slots.
   */
  function replaceBalls(): void {
    if (phase !== 'catch') return;
    if (narrow) {
      const wanted = step === 'ask' ? wantedBall() : undefined;
      for (const b of balls) if (b.active && !b.pulled) b.home = -1;
      if (wanted) wanted.home = freeHome(wanted);
      for (const b of balls) if (b.active && !b.pulled && b !== wanted) { b.home = freeHome(b); if (b.home < 0) b.active = false; }
    } else {
      let live = 0;
      for (const b of balls) { b.home = b.slot; if (b.active) live++; }
      const want = Math.min(tierP.balls, values());
      if (caughtCount < CATCHES_PER_ROUND) for (const b of balls) if (!b.active && live < want) { spawnBall(b, freshValue(onScreen()), 0.15); live++; }
    }
    for (const b of balls) if (b.active && !b.pulled) { placeHome(b); if (b.enter >= 1) { b.x = b.homeX; b.y = b.homeY; } }
  }
  /**
   * Sizes and places the connect picture to fit the view; true when no two points overlap. It first fits the area
   * right of the hero (above him on narrow views) with the tier's point size, then with points at the 100 px floor,
   * each time first at the picture's own proportions and then stretched up to 20 percent. Where the points would
   * still be closer than the gap, the picture grows just enough, kept on the same bottom line and centred across,
   * into the space between the corner buttons, as long as no point or outline comes near those buttons. All of this
   * is tried with POINT_GAP first, then with POINT_GAP_MIN.
   *
   * With `roomy` set (space reclaimed, used only where the usual area cannot fit the points), the area reaches down to
   * the bottom of the view below the margin it usually keeps, first right of the hero and then, where that is still
   * too small, across the whole width above and beside him. The connect draws its points over the hero, so a point
   * there is never covered.
   */
  function fitPicture(): boolean {
    const kind = PICTURES[picture]!;
    pictureBox(kind, unit, nPoints, picBox);
    const shapeN = pictureOutline(kind, unit, nPoints, picShape);
    if (!(picBox[1]! - picBox[0]! > 0 && picBox[3]! - picBox[2]! > 0)) return false; // no picture chosen yet
    const top = cornerY + cornerRadius + 12 * u, right = W - 30 * u, beside = heroX + heroSize * 0.55;
    if (!roomy) return fitIn(top, narrow ? feetY - heroSize * 0.8 : feetY - 40 * u, narrow ? 12 * u : beside, right, shapeN);
    return fitIn(top, H - 8, beside, right, shapeN) || fitIn(top, H - 8, 12 * u, right, shapeN);
  }
  /** fitPicture in one area: point discs inside top..bottom and left..right. */
  function fitIn(top: number, bottom: number, left: number, right: number, shapeN: number): boolean {
    const bw = picBox[1]! - picBox[0]!, bh = picBox[3]! - picBox[2]!;
    const base = Math.max(MIN_DISC, Math.min(tierP.point, nPoints >= 10 ? 104 : tierP.point) * u);
    for (let pass = 0; pass < 9; pass++) {
      const last = pass === 8, d = pass % 4 < 2 ? base : MIN_DISC, stretch = pass % 2 || last ? 1.2 : 1;
      const space = pass < 4 ? POINT_GAP : POINT_GAP_MIN;
      let sx = (right - left - d) / bw, sy = (bottom - top - d) / bh;
      sx = Math.max(10, Math.min(sx, sy * stretch)); sy = Math.max(10, Math.min(sy, sx * stretch));
      let gap = Infinity;
      for (let i = 0; i < nPoints; i++) for (let j = i + 1; j < nPoints; j++) {
        gap = Math.min(gap, Math.hypot((unit[i * 2]! - unit[j * 2]!) * sx, (unit[i * 2 + 1]! - unit[j * 2 + 1]!) * sy));
      }
      const grow = !last && gap < d + space;
      if (grow) { const f = (d + space) / gap; sx *= f; sy *= f; }
      picX = (left + right) / 2 - (picBox[0]! + picBox[1]!) / 2 * sx;
      picY = grow ? bottom - d / 2 - picBox[3]! * sy : (top + bottom) / 2 - (picBox[2]! + picBox[3]!) / 2 * sy;
      picSX = sx; picSY = sy; pointD = d;
      if (last) return false;
      if (grow && (bw * sx > right - left - d + 0.5 || bh * sy > bottom - 8 - d)) continue;
      if (!grow || cornersClear(shapeN)) return true;
    }
    return false;
  }
  function cornersClear(shapeN: number): boolean {
    for (let c = 0; c < 2; c++) {
      const cx = c ? soundX : homeX;
      for (let i = 0; i < nPoints; i++) if (Math.hypot(picX + unit[i * 2]! * picSX - cx, picY + unit[i * 2 + 1]! * picSY - cornerY) < cornerRadius + pointD / 2 + POINT_GAP_MIN) return false;
      for (let i = 0; i < shapeN; i++) if (Math.hypot(picX + picShape[i * 2]! * picSX - cx, picY + picShape[i * 2 + 1]! * picSY - cornerY) < cornerRadius + 6) return false;
    }
    return true;
  }
  /**
   * The round's connect points: as many as the level asks for, fewer only when that many cannot fit the view without
   * overlapping. Where even five do not fit the usual area, space is reclaimed for them (roomy).
   */
  function choosePoints(): void {
    nPoints = connectCount(level); roomy = false;
    for (;;) {
      picturePoints(PICTURES[picture]!, nPoints, unit, curveT);
      if (fitPicture()) break;
      if (nPoints <= 5) { roomy = true; fitPicture(); break; }
      nPoints = nPoints >= 10 ? 7 : 5;
    }
    placePoints(); for (let i = 0; i < MAX_POINTS; i++) pointCanvas[i] = undefined;
  }
  /**
   * Fits the picture again after a resize, in every phase: the finished picture still shows during the complete and
   * celebration phases, so it is refitted there too (a fit that would overlap points is harmless then, as no points are
   * drawn). During the connect, a view now too small for the round's points (no fit without overlap at the 100 px floor
   * and the least gap) drops only points still to come: the same picture is laid out again with the most points that
   * fit, as long as that keeps every joined point and the next one. Points are joined in index order, so the joined
   * points keep their numerals or letters, the next point keeps its glyph, and the threads are drawn again between the
   * new positions. Where no such count fits the usual area, space is reclaimed (roomy) and the same counts are tried
   * again. Only when even that cannot fit (many points already joined in a very small view) do the points still to
   * come go as well, with any joined points past the most that fit: the picture keeps the joined points that fit and
   * closes, as if the last one had just been joined, so the round ends a step early. No step is counted that the child
   * did not make. Shrinking the spacing alone cannot help: the points already sit at the floor size and least gap.
   * Five points always fit with reclaimed space, at every size from 390x600 up and every uiScale from 0.75 to 2.
   */
  function fitConnect(): void {
    roomy = false;
    let fits = fitPicture();
    if (!fits && phase !== 'connect') { roomy = true; fits = fitPicture(); }
    if (phase !== 'connect' || fits) { placePoints(); return; }
    const kind = PICTURES[picture]!, n0 = nPoints;
    // Stars are drawn in one stroke ({n/2} or {n/3}), which needs 5, 7 or 8 points; hearts and kites take any count.
    const drawable = (n: number): boolean => kind !== 'star' || n === 5 || n === 7 || n === 8 || n === n0;
    for (let pass = 0; pass < 2; pass++) {
      roomy = pass === 1;
      // The usual area at n0 has just failed.
      for (let n = roomy ? n0 : n0 - 1; n > nextPoint && n >= 5; n--) {
        if (!drawable(n)) continue;
        picturePoints(kind, n, unit, curveT); nPoints = n;
        if (fitPicture()) { placePoints(); return; }
      }
    }
    // Fewer fit than are joined: the most joined points that fit, in reclaimed space. updateConnect closes the picture on its next step.
    for (let n = Math.min(n0, nextPoint); n >= 5; n--) {
      if (!drawable(n)) continue;
      picturePoints(kind, n, unit, curveT); nPoints = n;
      if (fitPicture()) break;
    }
    placePoints();
    nextPoint = Math.min(nextPoint, nPoints);
  }
  function placePoints(): void {
    for (let i = 0; i < nPoints; i++) { pts[i * 2] = picX + unit[i * 2]! * picSX; pts[i * 2 + 1] = picY + unit[i * 2 + 1]! * picSY; }
  }
  function ensureBakes(): void {
    // Each backdrop is scaled once its image has decoded off the main thread, and at most one per frame, so the
    // opening frames under the fade stay short. The day city comes first; the dusk city is not needed before the swing.
    if (bakedAt !== frame) {
      if ((!bgDay || dayStale) && dayDecoded && sprites.get(CITY_DAY)) { bgDay = bakeBackground(services, CITY_DAY, W, H, fallbackSky, undefined); dayStale = false; bakedAt = frame; }
      else if ((!bgDusk || duskStale) && bgDay && duskDecoded && sprites.get(CITY_DUSK)) { bgDusk = bakeBackground(services, CITY_DUSK, W, H, fallbackSky, undefined); duskStale = false; bakedAt = frame; }
    }
    if (!fontReady) return;
    for (const b of balls) if (b.active && !b.canvas) b.canvas = ballCanvas(b.value, ballD, b.rim);
    if (phase === 'catch' && !signCanvas) signCanvas = bakeSign(signGlyph(mode, request, level), signDots(mode, request), signW, signH, dpr(), signSize);
    if (phase === 'connect' || phase === 'complete' || phase === 'celebration') for (let i = 0; i < nPoints; i++) pointCanvas[i] ??= bakePoint(glyph(mode, pointValue(i)), pointD, dpr());
    for (let i = 0; i < caughtCount; i++) caughtCanvas[i] ??= ballCanvas(caught[i]!, miniD, i % RIMS.length);
  }
  function ballCanvas(value: number, d: number, rim: number): HTMLCanvasElement {
    const key = `${value}|${Math.round(d)}|${rim}`;
    let c = ballCache.get(key);
    if (!c) { c = bakeBall(glyph(mode, value), d, RIMS[rim % RIMS.length]!, dpr()); ballCache.set(key, c); }
    return c;
  }
  function fallbackSky(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = '#7cc4f2'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#c2453b'; ctx.fillRect(0, height * 0.8, width, height * 0.2);
  }

  // ---- round flow ----
  function startRound(): void {
    pending = null; data.pending = null; bookGlide = false;
    tier = services.debug.tier ?? toTier(data.tier); tierP = TIERS[tier];
    mode = options.mode ?? (data.rounds % 2 === 0 ? 'numbers' : 'letters');
    level = options.level ?? toLevel(mode === 'numbers' ? data.numberLevel : data.letterLevel);
    picture = data.rounds % PICTURES.length; intro = data.rounds === 0;
    correct = wrong = alone = attempts = hits = padded = caughtCount = requestIndex = requested = 0;
    lastRequest = -1; hint = false; target = undefined; keyboardUsed = false; demoDone = false; flightT = 1;
    stars = 1; starsPlayed = 0; ticks = 0;
    for (const b of balls) b.active = false;
    particles.clear(); for (const p of puffs) p.active = false;
    setPhase('swingIn'); pose = 'swing';
    layout(W, H); choosePoints(); guard(); services.save.flush();
    playSfx(audio, 'whoosh', { variant: 'D' });
    // The picture's fanfare is rendered ahead once per session, so the frame it plays does not build its notes. The
    // render's first step is its one long one, so it runs here, while the screen is still (under the enter fade, or on
    // the rest screen after Again); the short note steps follow in idle periods during play (prepareIdle).
    if (!fanfareStarted && audio.context) { fanfareStarted = true; if (prepareSfxStep(audio, 'fanfare')) fanfareAsked = true; }
  }
  function setPhase(next: Phase): void { phase = next; phaseT = 0; }
  const fanfareDue = (): boolean => fanfareStarted && !fanfareAsked;
  /** The counter's digits are not baked at its current size (a resize can change it); they wait for the font. */
  const counterDue = (): boolean => fontReady && counterWarm !== counterPx;
  /**
   * Adds fanfare notes to the render started in startRound while this idle period has at least 4 ms left. A period too
   * short for a note bakes the celebration counter's ten digits at the current size instead (as Bubble Bay does) when
   * it timed out or has 4 ms left, so on a busy machine the counter is still ready and the first celebration makes no
   * canvas and calls no fillText.
   */
  function prepareIdle(deadline: IdleDeadline): void {
    idleHandle = 0;
    if (fanfareDue() && deadline.timeRemaining() >= 4) {
      do if (prepareSfxStep(audio, 'fanfare')) { fanfareAsked = true; break; } while (deadline.timeRemaining() >= 4);
      return;
    }
    if (!counterDue() || !(deadline.didTimeout || deadline.timeRemaining() >= 4)) return;
    scratch ??= document.createElement('canvas').getContext('2d');
    if (scratch) { drawCounter(scratch, 1234567890, 0, 0, counterPx, 1); counterWarm = counterPx; counterMade = true; }
  }
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; }
  function beginCatch(): void {
    setPhase('catch'); pose = 'wave';
    const n = Math.min(narrow ? NARROW_BALLS : tierP.balls, values());
    let used = 0;
    for (let i = 0; i < n; i++) { const v = freshValue(used); used |= 1 << v; spawnBall(balls[i]!, v, i * 0.12); }
    newRequest();
  }
  function onScreen(): number { let m = 0; for (const b of balls) if (b.active && !b.pulled) m |= 1 << b.value; return m; }
  /** A value not in exclude, avoiding soft too when possible (soft: the value just caught). */
  function freshValue(exclude: number, soft = 0): number {
    const lo = mode === 'numbers' ? 1 : 0, n = values();
    let choice = -1, seen = 0;
    for (let v = lo; v < lo + n; v++) if (!((exclude | soft) & (1 << v))) { seen++; if (random() * seen < 1) choice = v; }
    if (choice < 0 && soft) return freshValue(exclude);
    return choice >= 0 ? choice : lo + Math.floor(random() * n);
  }
  function spawnBall(b: Ball, value: number, delay: number): void {
    b.home = narrow ? freeHome(b) : b.slot;
    if (b.home < 0) { b.active = false; return; }
    b.active = true; b.value = value; b.enter = 0; b.delay = delay; b.wiggle = 0; b.pulled = false;
    b.phase = random() * Math.PI * 2; b.rim = (value + b.slot) % RIMS.length; b.canvas = undefined;
    placeHome(b); b.x = b.homeX; b.y = -ballD;
  }
  function newRequest(): void {
    // Ask for a ball the child can already see: not yet asked this round, then any but the last one.
    let pick: Ball | undefined, seen = 0;
    for (let pass = 0; pass < 3 && !pick; pass++) {
      seen = 0;
      for (const b of balls) {
        if (!b.active || b.pulled || (pass < 2 && (b.delay > 0 || b.enter < 1))) continue;
        if (pass === 0 && (requested & (1 << b.value) || b.value === lastRequest)) continue;
        if (pass === 1 && b.value === lastRequest) continue;
        seen++; if (random() * seen < 1) pick = b;
      }
    }
    if (!pick) return;
    request = pick.value; requested |= 1 << request; lastRequest = request;
    step = 'ask'; stepT = requestT = 0; signT = 0; signCanvas = undefined;
    hint = intro && requestIndex === 1; hintAt = 0;
    playClip(services, clipName(mode, request));
  }
  function wantedBall(): Ball | undefined {
    for (const b of balls) if (b.active && !b.pulled && b.value === request) return b;
    return undefined;
  }
  function catchBall(b: Ball, how: How): void {
    if (phase !== 'catch' || step !== 'ask' || !b.active || b.pulled) return;
    cancelClips();
    if ((how === 'click' || how === 'key-match') && !hint) { correct++; alone++; }
    target = b; b.pulled = true; step = 'shoot'; stepT = 0; pose = 'shoot'; poseT = 0;
    playSfx(audio, 'whoosh', { volume: 0.8 });
  }
  function wrongBall(b: Ball): void {
    b.wiggle = 0.45; playSfx(audio, 'hover', { volume: 0.6 });
    if (!hint) { wrong++; showHint(); }
    hopT = 0;
  }
  function showHint(): void { if (!hint) { hint = true; hintAt = requestT; } }
  function updateCatch(dt: number): void {
    stepT += dt; signT += dt;
    for (const b of balls) {
      if (!b.active) continue;
      if (b.delay > 0) { b.delay -= dt; continue; }
      if (b.enter < 1) b.enter = Math.min(1, b.enter + dt / 0.6);
      b.wiggle = Math.max(0, b.wiggle - dt);
      if (b.pulled) continue;
      const bob = Math.sin(time * 1.3 + b.phase) * wobble, sway = Math.sin(time * 0.7 + b.phase * 1.7) * wobble * 0.8;
      b.x = b.homeX + sway;
      b.y = lerp(-ballD, b.homeY + bob, easeOutBack(b.enter));
    }
    if (step === 'ask') {
      requestT += dt;
      if (!hint && requestT >= hintDelay()) showHint();
      if (hint && requestT - hintAt > 0.5 && (requestT - hintAt) % 8 < dt) hopT = 0;
      // The very first request of a profile is demonstrated by the hero.
      if (intro && requestIndex === 0 && !demoDone && requestT >= 1.2) {
        const b = wantedBall();
        if (b && b.enter >= 1) { demoDone = true; catchBall(b, 'demo'); }
      }
    } else if (step === 'shoot' && target) {
      const hp = hand(), hx = hp[0], hy = hp[1];
      if (stepT > 0.15) {
        const k = easeInCubic(clamp01((stepT - 0.15) / 0.3));
        target.x = lerp(target.x, hx, k); target.y = lerp(target.y, hy, k);
      }
      if (stepT >= 0.45 && target.active) {
        burst(hx, hy, RIM_HUES[target.rim % RIM_HUES.length]!, 14); pow(hx, hy, 74 * u);
        playSfx(audio, 'pop', { index: caughtCount });
        caught[caughtCount] = target.value; caughtCount++;
        flightT = 0; flightX = hx; flightY = hy; friendHopT = 0;
        const slot = target, freed = slot.value;
        slot.active = false; target = undefined;
        if (caughtCount < CATCHES_PER_ROUND) spawnBall(slot, freshValue(onScreen(), 1 << freed), 0.15);
        step = 'wait'; stepT = 0;
      }
    } else if (step === 'wait' && stepT >= 0.12) {
      pose = 'wave';
      if (caughtCount >= CATCHES_PER_ROUND) { if (flightT >= 1) beginSwing(); }
      else { requestIndex++; newRequest(); }
    }
  }
  function beginSwing(): void {
    setPhase('swing'); pose = 'swing'; playSfx(audio, 'whoosh', { variant: 'D' });
    for (const b of balls) b.active = false;
  }
  function beginConnect(): void {
    setPhase('connect'); pose = 'shoot'; nextPoint = 1; threadT = 1; closeT = 0;
    pointWiggle.fill(0); pointJoined.fill(-1); pointJoined[0] = 0;
    requestT = 0; hint = intro; hintAt = 0; demoDone = false; choosePoints();
    playClip(services, clipName(mode, pointValue(1)));
  }
  /**
   * Connect evidence: a matching key always names the glyph; a click counts
   * only when the layout does not give the answer away (stepNeedsGlyph) and the keyboard ring was not on the point.
   */
  function joinEvidence(how: How): boolean {
    if (hint) return false;
    return how === 'key-match' || (how === 'click' && stepNeedsGlyph(pts, nPoints, nextPoint));
  }
  function joinPoint(how: How): void {
    if (phase !== 'connect' || nextPoint >= nPoints) return;
    cancelClips();
    if (joinEvidence(how)) { correct++; alone++; }
    pointJoined[nextPoint] = time; threadT = 0; pose = 'shoot'; poseT = 0;
    playSfx(audio, 'pop', { index: nextPoint });
    burst(pts[nextPoint * 2]!, pts[nextPoint * 2 + 1]!, 48, 8); pow(pts[nextPoint * 2]!, pts[nextPoint * 2 + 1]!, pointD * 0.62);
    nextPoint++; requestT = 0; hint = intro && nextPoint === 2; hintAt = 0;
    if (nextPoint >= nPoints) { closeT = 0.0001; finishRound(); }
    else playClip(services, clipName(mode, pointValue(nextPoint)));
  }
  function updateConnect(dt: number): void {
    threadT = Math.min(1, threadT + dt / 0.22);
    // A resize left every remaining point joined (fitConnect): close the picture now.
    if (closeT === 0 && nextPoint >= nPoints) { closeT = 0.0001; finishRound(); }
    if (closeT > 0) {
      closeT += dt;
      if (closeT >= 0.35) { setPhase('complete'); pose = 'cheer'; playSfx(audio, 'pop-big'); }
      return;
    }
    requestT += dt;
    if (!hint && requestT >= hintDelay()) showHint();
    if (hint && requestT - hintAt > 0.5 && (requestT - hintAt) % 8 < dt) hopT = 0;
    if (intro && nextPoint === 1 && !demoDone && requestT >= 1.0) { demoDone = true; joinPoint('demo'); }
  }
  function updateComplete(): void {
    if (phaseT >= 0.3 && phaseT - lastDt < 0.3) sparkleOutline();
    if (phaseT >= 0.55 && phaseT - lastDt < 0.55) { playSfx(audio, 'fanfare'); playClip(services, `picture-${PICTURES[picture]}`); friendHopT = 0; }
    if (phaseT >= COMPLETE_SECONDS) { setPhase('celebration'); starsPlayed = 0; ticks = 0; }
  }
  function chooseOffers(): string[] {
    if (!services.config.rewardsEnabled) return [];
    const owned = rewards(services).stickers;
    // Offers follow the sticker book's pages (8 per page over the whole STICKERS list):
    // only this game's uncollected stickers on the earliest such page, so one left there is offered alone.
    let page = -1;
    const fresh: (typeof STICKERS)[number][] = [];
    STICKERS.forEach((s, i) => {
      if (s.game !== GAME_ID || owned.includes(s.id)) return;
      const p = Math.floor(i / 8);
      if (page < 0) page = p;
      if (p === page) fresh.push(s);
    });
    if (!fresh.length) return [];
    const first = fresh.splice(Math.floor(random() * fresh.length), 1)[0]!;
    const second = fresh.length ? fresh[Math.floor(random() * fresh.length)] : undefined;
    return second ? [first.id, second.id] : [first.id];
  }
  function finishRound(): void {
    cancelClips();
    stars = intro ? 3 : 2 + (alone >= 3 ? 1 : 0);
    if (!intro && services.debug.tier === undefined) {
      const m = nextTier(tier, data.tierGood, attempts, hits, padded); data.tier = m.tier; data.tierGood = m.good;
    }
    if (!intro && options.level === undefined) {
      if (mode === 'numbers') { const l = nextLevel(level, data.numberGood, correct, wrong); data.numberLevel = l.level; data.numberGood = l.good; }
      else { const l = nextLevel(level, data.letterGood, correct, wrong); data.letterLevel = l.level; data.letterGood = l.good; }
    }
    data.rounds++;
    // A unique id, so the save never takes this round for another tab's round with the same fields (as Bubble Bay).
    const id = globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    pending = { id, mode, picture, stars, caught: caughtCount, points: nPoints, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false };
    data.pending = pending;
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars += stars;
    // Round, stars and the unresolved gift share one immediate write; re-entry never awards again.
    services.save.flush();
  }
  function finishCelebration(): void {
    if (phase !== 'celebration') return;
    particles.clear();
    if (pending?.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { setPhase('choice'); armMenu(); }
    else enterRest();
  }
  function enterRest(): void {
    setPhase('rest'); armMenu(); particles.clear(); pose = 'wave';
    // Everything is awarded by now, so the stored round is cleared: leaving the
    // rest by any route (Again, Home, Escape, the corner, a reload) starts a new round next time.
    // The scene keeps its copy to show the chosen sticker.
    const first = !pending?.restEntered;
    if (pending) pending.restEntered = true;
    data.pending = null; services.save.flush();
    if (first) services.roundBoundary();
  }
  function chooseSticker(index: number): void {
    if (phase !== 'choice' || !pending || pending.chosen || !pending.rewardEnabled || !services.config.rewardsEnabled) return;
    const id = pending.choices[index]; if (!id) return;
    const bag = rewards(services); if (!bag.stickers.includes(id)) bag.stickers.push(id);
    pending.chosen = id;
    // The chosen id and the owned sticker save together, so repeats and reloads are idempotent.
    services.save.flush(); setPhase('sticker'); guard(); playSfx(audio, 'sticker');
    offers.pick(index); bookGlide = true;
  }
  function leave(replay: boolean): void {
    if (phase !== 'rest') return;
    data.pending = null; pending = null; services.save.flush(); playSfx(audio, replay ? 'whoosh' : 'button');
    if (replay) startRound(); else services.nav.toHub();
  }
  function exitToHub(): void {
    // An unfinished gift stays pending, including a departure during the celebration.
    services.save.flush(); services.nav.toHub();
  }

  // ---- effects ----
  let bx = 0, by = 0, bh = 0;
  const fillBurst = (p: ParticleSpawn, i: number): void => {
    const a = i * 2.39996 + random() * 0.4, v = (110 + random() * 120) * u;
    p.x = bx; p.y = by; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 40 * u;
    p.life = 0.45 + random() * 0.25; p.size = (4 + random() * 4) * Math.max(0.6, u); p.endSize = 1;
    p.gravity = 220 * u; p.drag = 0.5; p.hue = bh + (i % 3) * 12; p.saturation = 80; p.lightness = 62; p.alpha = 0.95;
  };
  function burst(x: number, y: number, hue: number, n: number): void { bx = x; by = y; bh = hue; particles.burst(n, fillBurst); }
  /** Comic impact star behind a catch: grows with a small overshoot, then fades. */
  function pow(x: number, y: number, size: number): void {
    let slot = pows[0]!;
    for (const p of pows) if (!p.active || p.t > slot.t) { slot = p; if (!p.active) break; }
    slot.active = true; slot.x = x; slot.y = y; slot.t = 0; slot.size = size;
  }
  function drawPows(ctx: CanvasRenderingContext2D): void {
    for (const p of pows) {
      if (!p.active) continue;
      const r = p.size * easeOutBack(clamp01(p.t / 0.22)), a = 1 - clamp01((p.t - 0.25) / 0.2);
      ctx.globalAlpha = a; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const ang = i * Math.PI / 8 + 0.2, rr = i % 2 ? r * 0.56 : r; if (i) ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr); else ctx.moveTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr); }
      ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#e8413b'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function sparkleOutline(): void {
    for (let i = 0; i < nPoints; i++) burst(pts[i * 2]!, pts[i * 2 + 1]!, i % 2 ? 48 : 205, 4);
  }
  let lastDt = 0;

  // ---- hero ----
  /** Hand position for the current pose; also fills heroPos with the sprite centre and rotation. */
  function hand(): [number, number] {
    heroAt();
    const p = pose === 'swing' ? SWING_HAND : SHOOT_HAND, name = HERO_SPRITE[pose === 'swing' ? 'swing' : 'shoot'];
    const img = sprites.get(name), aspect = img ? img.naturalWidth / img.naturalHeight : 1;
    const h = heroSize, w = h * aspect, rot = heroPos[2]!;
    const ox = (p[0] - 0.5) * w, oy = (p[1] - 0.5) * h;
    handOut[0] = heroPos[0]! + ox * Math.cos(rot) - oy * Math.sin(rot);
    handOut[1] = heroPos[1]! + ox * Math.sin(rot) + oy * Math.cos(rot);
    return handOut;
  }
  const handOut: [number, number] = [0, 0];
  /** Rope swing: anchor above the top edge, hand on a circle around it. Returns hand x, y in out. */
  function swingHand(k: number, incoming: boolean, out: Float32Array): void {
    const w = heroSize * 319 / 509;
    const landX = heroX - (0.5 - SWING_HAND[0]) * w, landY = feetY - heroSize / 2 - (0.5 - SWING_HAND[1]) * heroSize;
    const axp = incoming ? heroX + W * 0.35 : heroX + W * 0.45, ayp = -60 * u;
    const L = Math.hypot(landX - axp, landY - ayp), land = Math.atan2(landX - axp, landY - ayp);
    const theta = incoming ? lerp(land - 0.85, land, 1 - (1 - k) * (1 - k)) : lerp(land, 1.0, easeInOutSine(k));
    out[0] = axp + Math.sin(theta) * L; out[1] = ayp + Math.cos(theta) * L; out[2] = theta;
    ropeX = axp; ropeY = ayp;
  }
  let ropeX = 0, ropeY = 0, roping = false;
  const swingOut = new Float32Array(3);
  /** Sprite centre and rotation of the hero this frame, in heroPos. */
  function heroAt(): void {
    roping = false;
    const standY = feetY - heroSize / 2;
    let k = -1, incoming = true;
    if (phase === 'swingIn') k = clamp01(phaseT / SWING_IN);
    else if (phase === 'swing') {
      if (phaseT < SWING_OUT) { k = phaseT / SWING_OUT; incoming = false; }
      else k = clamp01((phaseT - SWING_OUT) / SWING_ACROSS_IN);
    }
    if (k >= 0 && k < 1) {
      swingHand(k, incoming, swingOut);
      const w = heroSize * 319 / 509, rot = -swingOut[2]! * 0.35;
      const ox = (0.5 - SWING_HAND[0]) * w, oy = (0.5 - SWING_HAND[1]) * heroSize;
      heroPos[0] = swingOut[0]! + ox * Math.cos(rot) - oy * Math.sin(rot);
      heroPos[1] = swingOut[1]! + ox * Math.sin(rot) + oy * Math.cos(rot);
      heroPos[2] = rot; roping = true;
      return;
    }
    const hop = hopT < 0.5 ? Math.sin(hopT / 0.5 * Math.PI) * 26 * u : 0;
    const cheer = phase === 'complete' || phase === 'celebration' ? Math.abs(Math.sin(time * 4.2)) * 20 * u : 0;
    pointing = hintTarget();
    let reach = 0;
    aimRot = 0;
    if (pointing) {
      // Turn the shooting pose so its outstretched hand aims at the target, and reach towards it in a slow pulse.
      const img = sprites.get(HERO_SPRITE.shoot), w = heroSize * (img ? img.naturalWidth / img.naturalHeight : 1);
      const want = Math.atan2(aimY - standY, aimX - heroX) - Math.atan2(AIM_Y * heroSize, AIM_X * w);
      aimRot = Math.max(-0.28, Math.min(0.2, want));
      reach = (0.5 - 0.5 * Math.cos(time * 4)) * 18 * u;
    }
    heroPos[0] = heroX + reach * Math.cos(aimRot); heroPos[1] = standY - hop - cheer + reach * Math.sin(aimRot); heroPos[2] = aimRot;
  }
  let pointing = false, aimBall: Ball | undefined, guideDots = 0, guideFaded = 0, guideHidden = 0;
  // Guide dots drawn faded this frame: x, y, alpha.
  const guideFade = new Float32Array(GUIDE_FADES * 3);
  /** While the hero points: a trail of sunny dots marching from his outstretched hand to the target. */
  function drawGuide(ctx: CanvasRenderingContext2D): void {
    guideDots = guideFaded = guideHidden = 0;
    const hp = hand(); if (!pointing) return;
    const hx = hp[0], hy = hp[1], dx = aimX - hx, dy = aimY - hy, len = Math.hypot(dx, dy);
    const stop = len - (phase === 'catch' ? ballD : pointD) * 0.72, gap = 34 * Math.max(0.8, u), r = 8.5 * Math.max(0.8, u);
    if (stop <= gap) return;
    const ux = dx / len, uy = dy / len, shift = (time * 70 * Math.max(0.7, u)) % gap;
    // Dots near another ball or point fade out, so the trail never crosses a target it does not lead to.
    let faded = 0;
    ctx.beginPath();
    for (let d = gap * 0.6 + shift; d < stop; d += gap) {
      const x = hx + ux * d, y = hy + uy * d, a = guideClear(x, y, r);
      guideDots++; if (a <= 0) guideHidden++;
      if (a >= 1) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      else if (a > 0 && faded < GUIDE_FADES) { guideFade[faded * 3] = x; guideFade[faded * 3 + 1] = y; guideFade[faded * 3 + 2] = a; faded++; }
    }
    ctx.fillStyle = '#fff27a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    for (let i = 0; i < faded; i++) {
      ctx.globalAlpha = guideFade[i * 3 + 2]!; ctx.beginPath(); ctx.arc(guideFade[i * 3]!, guideFade[i * 3 + 1]!, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1; guideFaded = faded;
  }
  /** 1 where a guide dot of radius r at x, y is clear of every target but the one pointed at, falling to 0 as it nears one. */
  function guideClear(x: number, y: number, r: number): number {
    let a = 1;
    if (phase === 'catch') {
      for (const b of balls) {
        if (!b.active || b.pulled || b.delay > 0 || b === aimBall) continue;
        a = Math.min(a, clamp01((Math.hypot(x - b.x, y - b.y) - ballD / 2 - r - 6) / 22));
      }
    } else {
      for (let i = 0; i < nPoints; i++) {
        if (i === nextPoint) continue;
        a = Math.min(a, clamp01((Math.hypot(x - pts[i * 2]!, y - pts[i * 2 + 1]!) - pointD / 2 - 10 * u - r - 6) / 22));
      }
    }
    return a;
  }
  /** While a hint shows, the ball or point the hero points at goes in aimX, aimY. */
  function hintTarget(): boolean {
    if (!hint) return false;
    if (phase === 'catch' && step === 'ask') {
      const b = wantedBall(); if (!b || b.enter < 1) return false;
      aimX = b.x; aimY = b.y; aimBall = b; return true;
    }
    if (phase === 'connect' && closeT === 0 && threadT >= 1 && nextPoint < nPoints) {
      aimX = pts[nextPoint * 2]!; aimY = pts[nextPoint * 2 + 1]!; return true;
    }
    return false;
  }
  function drawHero(ctx: CanvasRenderingContext2D): void {
    heroAt();
    let p: Pose = pose;
    if (roping) p = 'swing';
    else if (phase === 'swingIn' || phase === 'swing') p = 'wave';
    else if (pointing) p = 'shoot';
    const land = phase === 'swingIn' && phaseT >= SWING_IN ? phaseT - SWING_IN : phase === 'swing' && phaseT >= SWING_OUT + SWING_ACROSS_IN ? phaseT - SWING_OUT - SWING_ACROSS_IN : 9;
    const squash = land < 0.25 ? Math.sin(land / 0.25 * Math.PI) * 0.12 : 0;
    if (roping) web(ctx, ropeX, ropeY, swingOut[0]!, swingOut[1]!, 0, 3.2 * u);
    const sy = 1 - squash, y = heroPos[1]! + heroSize * squash / 2;
    drawSprite(ctx, sprites, HERO_SPRITE[p], heroPos[0]!, y, Math.round(heroSize), heroPos[2]!, 1 + squash, sy);
  }
  function web(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number, width: number): void {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = width * 2.3; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = width; ctx.stroke();
  }

  // ---- render pieces ----
  function drawBg(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement | undefined, x: number): void {
    if (canvas) ctx.drawImage(canvas, x, 0, W, H);
    else { ctx.fillStyle = '#7cc4f2'; ctx.fillRect(x, 0, W, H); }
  }
  function drawFriends(ctx: CanvasRenderingContext2D, dusk: boolean, still: boolean): void {
    const hop = !still && friendHopT < 0.6 ? Math.sin(friendHopT / 0.6 * Math.PI) * 22 * u : 0;
    const party = !still && (phase === 'complete' || phase === 'celebration') ? Math.abs(Math.sin(time * 3.6 + 1)) * 16 * u : 0;
    const s = Math.max(70, 112 * u);
    drawSprite(ctx, sprites, KITTEN, W - s * 0.75, parapetY - s * 0.42 - hop - party, Math.round(s));
    if (dusk) drawSprite(ctx, sprites, GIRL, W - s * 1.85, feetY - s * 0.82 - party * 0.8, Math.round(s * 1.7));
    else drawSprite(ctx, sprites, PIGEON, Math.max(heroX + heroSize * 0.75, W * 0.4), parapetY - s * 0.38 - hop * 0.7, Math.round(s * 0.9));
  }
  function drawBalls(ctx: CanvasRenderingContext2D): void {
    const wanted = step === 'ask' ? wantedBall() : undefined;
    for (const b of balls) {
      if (!b.active || b.delay > 0 || !b.canvas) continue;
      const size = b.canvas.width / dpr(), wig = b.wiggle > 0 ? Math.sin(b.wiggle * 40) * 0.18 * (b.wiggle / 0.45) : 0;
      const pointed = b === wanted && b.enter >= 1 && hint;
      const shrink = b.pulled ? lerp(1, 0.55, clamp01((stepT - 0.15) / 0.3)) : pointed ? hintBounce() : 1;
      if (pointed) halo(ctx, b.x, b.y, ballD / 2);
      if (wig || shrink !== 1) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(wig); ctx.scale(shrink, shrink);
        ctx.drawImage(b.canvas, -size / 2, -size / 2, size, size); ctx.restore();
      } else ctx.drawImage(b.canvas, b.x - size / 2, b.y - size / 2, size, size);
      if (b === wanted && b.enter >= 1) {
        if (hint) glow(ctx, b.x, b.y, ballD / 2);
        if (keyboardUsed) focusRing(ctx, b.x, b.y, ballD / 2 + 4);
      }
    }
  }
  /** Hint bounce for the pointed-at ball or point: a springy scale pulse about twice a second. */
  function hintBounce(): number { return 1 + Math.abs(Math.sin(time * 6.5)) * 0.12; }
  /** Wide flat sunny halo behind the hinted target, pulsing in size. */
  function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const k = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.globalAlpha = 0.5 + 0.2 * k; ctx.beginPath(); ctx.arc(x, y, r + (22 + k * 14) * Math.max(0.7, u), 0, Math.PI * 2);
    ctx.fillStyle = '#fff27a'; ctx.fill(); ctx.globalAlpha = 1;
  }
  /** Thick pulsing ring and a big bouncing arrow over the hinted target. */
  function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const pulseK = 0.5 + 0.5 * Math.sin(time * 6), s = Math.max(0.7, u);
    ctx.beginPath(); ctx.arc(x, y, r * 1.12 + 8 + pulseK * 10 * s, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 14; ctx.stroke(); ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 8; ctx.stroke();
    const ay = Math.max(30 * s, y - r * 1.12 - 30 * s - Math.abs(Math.sin(time * 5)) * 18 * s);
    ctx.beginPath(); ctx.moveTo(x - 26 * s, ay - 30 * s); ctx.lineTo(x + 26 * s, ay - 30 * s); ctx.lineTo(x, ay + 6 * s); ctx.closePath();
    ctx.fillStyle = '#fff27a'; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  function drawSign(ctx: CanvasRenderingContext2D): void {
    if (!signCanvas) return;
    const w = signSize[0]!, h = signSize[1]!, s = signT < 0.35 ? easeOutBack(signT / 0.35) : 1;
    const wob = hopT < 0.5 ? Math.sin(hopT * 25) * 0.04 : 0;
    ctx.save(); ctx.translate(signX, signY); ctx.rotate(wob - 0.03); ctx.scale(s, s);
    ctx.drawImage(signCanvas, -w / 2, -h / 2, w, h); ctx.restore();
  }
  /** The caught string. The ball still flying to it is left for drawFlight, which runs above the sign. */
  function drawString(ctx: CanvasRenderingContext2D): void {
    const sag = 26 * u;
    web(ctx, stringX0, stringY, stringX1, stringY, sag * 2, 2.4 * u);
    for (let i = 0; i < caughtCount; i++) {
      if (i === caughtCount - 1 && flightT < 1) continue;
      drawCaught(ctx, i, 1);
    }
  }
  function drawFlight(ctx: CanvasRenderingContext2D): void {
    if (caughtCount > 0 && flightT < 1) drawCaught(ctx, caughtCount - 1, flightT);
  }
  function drawCaught(ctx: CanvasRenderingContext2D, i: number, f: number): void {
    const c = caughtCanvas[i]; if (!c) return;
    const sag = 26 * u, k = (i + 1) / (CATCHES_PER_ROUND + 1), x = lerp(stringX0, stringX1, k), y = stringY + sag * 4 * k * (1 - k) + miniD * 0.42;
    const e = easeOutCubic(f);
    const px = lerp(flightX, x, e), py = lerp(flightY, y, e) - (f < 1 ? Math.sin(f * Math.PI) * 60 * u : 0);
    const size = c.width / dpr();
    ctx.drawImage(c, px - size / 2, py - size / 2, size, size);
  }
  function drawPuffs(ctx: CanvasRenderingContext2D): void {
    for (const p of puffs) {
      if (!p.active) continue;
      const k = p.t / 0.4, r = (10 + 22 * k) * u;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  function tracePicture(ctx: CanvasRenderingContext2D): void {
    const kind = PICTURES[picture]!;
    ctx.beginPath();
    if (kind === 'heart') {
      for (let i = 0; i < 64; i++) { heartAt(i / 64 * Math.PI * 2, outline, 0); const x = picX + outline[0]! * picSX, y = picY + outline[1]! * picSY; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    } else if (kind === 'star') {
      // The star is exactly the joined web, so fill and threads line up.
      for (let i = 0; i < nPoints; i++) { if (i) ctx.lineTo(pts[i * 2]!, pts[i * 2 + 1]!); else ctx.moveTo(pts[0]!, pts[1]!); }
    } else {
      ctx.moveTo(picX, picY - picSY); ctx.lineTo(picX + 0.72 * picSX, picY - 0.18 * picSY); ctx.lineTo(picX, picY + picSY); ctx.lineTo(picX - 0.72 * picSX, picY - 0.18 * picSY);
    }
    ctx.closePath();
  }
  function drawPicture(ctx: CanvasRenderingContext2D, fill: number): void {
    if (fill > 0) {
      ctx.globalAlpha = fill; tracePicture(ctx);
      ctx.fillStyle = PICTURE_FILL[picture]!; ctx.fill();
      ctx.lineWidth = 6 * u; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
      if (PICTURES[picture] === 'kite') {
        ctx.beginPath(); ctx.moveTo(picX, picY - picSY); ctx.lineTo(picX, picY + picSY); ctx.moveTo(picX - 0.72 * picSX, picY - 0.18 * picSY); ctx.lineTo(picX + 0.72 * picSX, picY - 0.18 * picSY);
        ctx.lineWidth = 4 * u; ctx.stroke();
        const sway = Math.sin(time * 2) * 18 * u;
        ctx.beginPath(); ctx.moveTo(picX, picY + picSY); ctx.quadraticCurveTo(picX - 40 * u + sway, picY + picSY + 50 * u, picX + 10 * u, picY + picSY + 100 * u); ctx.lineWidth = 3 * u; ctx.stroke();
        for (let i = 0; i < 3; i++) { const t = (i + 1) / 3.5; starPath(ctx, lerp(picX, picX + 10 * u, t) + sway * Math.sin(t * Math.PI) * 0.6, picY + picSY + 100 * u * t, 10 * u); ctx.fillStyle = i % 2 ? '#ffd23f' : '#f2545b'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }
  }
  /** Thread from point a towards point b, k of the way. Heart threads follow the heart curve. */
  function thread(ctx: CanvasRenderingContext2D, a: number, b: number, k: number): void {
    const x0 = pts[a * 2]!, y0 = pts[a * 2 + 1]!;
    if (PICTURES[picture] !== 'heart') { web(ctx, x0, y0, lerp(x0, pts[b * 2]!, k), lerp(y0, pts[b * 2 + 1]!, k), 0, 3 * u); return; }
    const t0 = curveT[a]!, t1 = b === 0 ? Math.PI * 2 : curveT[b]!, steps = 14;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let s = 1; s <= steps; s++) {
      heartAt(lerp(t0, t1, k * s / steps), outline, 0);
      ctx.lineTo(picX + outline[0]! * picSX, picY + outline[1]! * picSY);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3 * u * 2.3; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * u; ctx.stroke();
  }
  function drawThreads(ctx: CanvasRenderingContext2D): void {
    const joined = Math.min(nextPoint, nPoints);
    for (let i = 1; i < joined; i++) thread(ctx, i - 1, i, i === joined - 1 ? easeOutCubic(threadT) : 1);
    if (closeT > 0 || phase === 'complete' || phase === 'celebration') {
      thread(ctx, nPoints - 1, 0, phase === 'connect' ? easeOutCubic(clamp01(closeT / 0.3)) : 1);
    }
  }
  function drawPoints(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < nPoints; i++) {
      const c = pointCanvas[i]; if (!c) continue;
      const x = pts[i * 2]!, y = pts[i * 2 + 1]!, size = c.width / dpr();
      const since = pointJoined[i]! >= 0 ? time - pointJoined[i]! : -1;
      const pointed = phase === 'connect' && i === nextPoint && closeT === 0 && hint;
      const pop = since >= 0 && since < 0.3 ? 1 + Math.sin(since / 0.3 * Math.PI) * 0.22 : pointed ? hintBounce() : 1;
      const wig = pointWiggle[i]! > 0 ? Math.sin(pointWiggle[i]! * 40) * 0.2 : 0;
      if (pointed) halo(ctx, x, y, pointD / 2);
      if (since >= 0) { chunkyCircle(ctx, x, y, (pointD * 0.5 + 9 * u) * pop, i % 2 ? '#2f6fe4' : '#e8413b', OUTLINE, 4); }
      if (pop !== 1 || wig) { ctx.save(); ctx.translate(x, y); ctx.rotate(wig); ctx.scale(pop, pop); ctx.drawImage(c, -size / 2, -size / 2, size, size); ctx.restore(); }
      else ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
      if (phase === 'connect' && i === nextPoint && closeT === 0) {
        if (hint) glow(ctx, x, y, pointD / 2);
        if (keyboardUsed) focusRing(ctx, x, y, pointD / 2 + 4);
      }
    }
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    chunkyCircle(ctx, homeX, cornerY, cornerRadius, '#a3c9c5', OUTLINE, 4);
    drawSprite(ctx, sprites, BUTTON_HOME, homeX, cornerY, Math.round(cornerRadius * 1.3));
    soundButton.render(ctx, sprites);
    if (cornerFocus >= 0) focusRing(ctx, cornerFocus === 0 ? homeX : soundX, cornerY, cornerRadius);
  }
  /** The book beside the offers, in bookAt: right of them, else under them, clear of the corner buttons. */
  function placeChoiceBook(): void {
    const n = pending?.choices.length ?? 1;
    placeBook(bookAt, W, H, controlX(n - 1, true) + badgeSize / 2, badgeY, badgeY + badgeSize / 2, bookH, cornerY + cornerRadius + 10);
  }
  /** Bakes the offers' sticker look and both book sizes in idle periods before they first show. */
  function warmOffers(): void {
    if (!pending?.choices.length || !pending.rewardEnabled) return;
    for (const id of pending.choices) offers.warm(stickerNames.get(id) ?? '', stickerSize);
    offers.warmBook(bookH); offers.warmBook(restSize);
  }
  function controlX(i: number, choice: boolean): number {
    const n = choice ? pending?.choices.length ?? 0 : 2;
    return W / 2 + (i - (n - 1) / 2) * (choice ? badgeSize * 1.2 : controlsRadius * 3.2);
  }
  function hoverMenu(x: number, y: number): number {
    const choice = phase === 'choice', n = choice ? pending?.choices.length ?? 0 : 2;
    for (let i = 0; i < n; i++) if (Math.hypot(x - controlX(i, choice), y - (choice ? badgeY : controlsY)) <= (choice ? badgeSize / 2 : controlsRadius)) return i;
    return -1;
  }
  function drawReward(ctx: CanvasRenderingContext2D): void {
    const still = phase === 'rest';
    drawStarRow(ctx, W / 2, starY, starR, stars, phase === 'celebration' ? Math.max(0, phaseT - 0.3) : 9, still ? 0 : time);
    if (phase === 'celebration') {
      // Count the caught balls out in a row under the stars; the counter rides just right of the last one counted.
      const shown = Math.min(caughtCount, ticks), gap = miniD * 1.12, left = W / 2 - (caughtCount * gap) / 2 - 30 * u, y = starY + starR + 24 * u + miniD / 2;
      // Drawn at the size its digits were baked at: after a resize during the celebration, the old size until the next
      // idle period has baked the new one. Never baked (no idle period yet): the current size, baked here.
      const px = counterWarm || counterPx;
      for (let i = 0; i < shown; i++) { const c = caughtCanvas[i]; if (c) { const size = c.width / dpr(); ctx.drawImage(c, left + (i + 0.5) * gap - size / 2, y - size / 2, size, size); } }
      drawCounter(ctx, shown, left + shown * gap + px * 0.45, y, px, phaseT - (shown / Math.max(1, caughtCount)) * 1.6);
      return;
    }
    if (phase === 'choice' && pending) {
      // The offers are stickers with the book they go into beside them; the focused one lifts and shows the focus ring.
      placeChoiceBook();
      offers.drawBook(ctx, bookAt[0]!, bookAt[1]!, bookH, '', -1);
      for (let i = 0; i < pending.choices.length; i++) {
        const x = controlX(i, true);
        if (menuSelected === i) focusRing(ctx, x, badgeY, badgeSize / 2 + 4);
        offers.drawOffer(ctx, i, stickerNames.get(pending.choices[i]!) ?? '', x, badgeY, stickerSize);
      }
      return;
    }
    if (pending?.chosen) {
      const index = Math.max(0, pending.choices.indexOf(pending.chosen)), name = stickerNames.get(pending.chosen) ?? '';
      placeChoiceBook();
      if (phase === 'sticker') {
        // The chosen sticker flies into the book, which bounces as it lands; the other offer drops away.
        offers.drawBook(ctx, bookAt[0]!, bookAt[1]!, bookH, name, phaseT - PICK_LIFT - PICK_FLY);
        const a = leaveAlpha(phaseT);
        if (a > 0) for (let i = 0; i < pending.choices.length; i++) if (i !== index) offers.drawOffer(ctx, i, stickerNames.get(pending.choices[i]!) ?? '', controlX(i, true), badgeY + leaveDrop(phaseT) * badgeSize, stickerSize, 1, a);
        offers.drawFlight(ctx, phaseT, name, controlX(index, true), badgeY, stickerSize, bookAt[0]!, bookAt[1]!, bookH);
      } else {
        // The rest screen shows the book with the new sticker on its cover, in the middle.
        const k = bookGlide ? easeOutCubic(clamp01(phaseT / BOOK_GLIDE)) : 1;
        offers.drawBook(ctx, lerp(bookAt[0]!, W / 2, k), lerp(bookAt[1]!, restY, k), lerp(bookH, restSize, k), name, 9, restSize);
      }
    } else drawSprite(ctx, sprites, EMBLEM, W / 2, restY, Math.round(restSize));
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i, false); chunkyCircle(ctx, x, controlsY, controlsRadius, '#a3c9c5', OUTLINE, 5 * u);
      drawSprite(ctx, sprites, i === 0 ? BUTTON_PLAY : BUTTON_HOME, x, controlsY, Math.round(controlsRadius * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsRadius);
    }
  }

  // ---- input ----
  function pointerPlay(x: number, y: number): void {
    // The keyboard ring was on the wanted ball or next point at this press (drawBalls, drawPoints); a pointer press hides it.
    const ring = keyboardUsed;
    keyboardUsed = false;
    if (phase === 'catch' && step !== 'ask') {
      // A catch is still flying in: answer the click with a puff and a ball wiggle, record nothing.
      for (const b of balls) if (b.active && !b.pulled && b.delay <= 0 && Math.hypot(x - b.x, y - b.y) <= hitRadius(ballD / 2)) b.wiggle = 0.3;
      puff(x, y); return;
    }
    if (phase === 'catch') {
      let best: Ball | undefined, dist = Infinity, dropping = false;
      for (const b of balls) {
        if (!b.active || b.pulled || b.delay > 0) continue;
        const d = Math.hypot(x - b.x, y - b.y);
        if (b.enter < 1) { if (d <= ballD / 2) dropping = true; continue; }
        if (d <= hitRadius(ballD / 2) && d < dist) { best = b; dist = d; }
      }
      // A ball still dropping in is not a target until it has landed in the play area, clear of the corner buttons: a
      // click on it gets a puff and a wiggle and records nothing.
      if (!best && dropping) { for (const b of balls) if (b.active && !b.pulled && b.delay <= 0 && b.enter < 1 && Math.hypot(x - b.x, y - b.y) <= ballD / 2) b.wiggle = 0.3; puff(x, y); return; }
      attempts++;
      if (best) { padded++; if (dist <= ballD / 2) hits++; }
      if (!best) { puff(x, y); return; }
      if (best.value === request) catchBall(best, ring ? 'ringed' : 'click'); else wrongBall(best);
      return;
    }
    if (phase === 'connect' && (closeT > 0 || threadT < 0.6)) { puff(x, y); return; }
    if (phase === 'connect') {
      let best = -1, dist = Infinity;
      for (let i = 0; i < nPoints; i++) {
        const d = Math.hypot(x - pts[i * 2]!, y - pts[i * 2 + 1]!);
        if (d <= hitRadius(pointD / 2) && d < dist) { best = i; dist = d; }
      }
      attempts++;
      if (best < 0) { puff(x, y); return; }
      padded++; if (dist <= pointD / 2) hits++;
      if (best === nextPoint) joinPoint(ring ? 'ringed' : 'click');
      else if (best > nextPoint) { pointWiggle[best] = 0.45; playSfx(audio, 'hover', { volume: 0.6 }); if (!hint) { if (joinEvidence('click')) wrong++; showHint(); } hopT = 0; }
      else { pointWiggle[best] = 0.3; hopT = 0; }
    }
  }
  function keyPlay(key: string): void {
    keyboardUsed = true;
    if (phase === 'catch') {
      const b = step === 'ask' ? wantedBall() : undefined;
      // While a catch is still flying in, or the wanted ball is still dropping in, the hero hops and the sign wobbles so
      // the key is seen.
      if (!b || b.delay > 0 || b.enter < 1) { hopT = 0; return; }
      catchBall(b, keyMatches(mode, request, key) ? 'key-match' : 'key-other');
    } else if (phase === 'connect') {
      if (closeT > 0 || threadT < 0.6) { hopT = 0; return; }
      joinPoint(keyMatches(mode, pointValue(nextPoint), key) ? 'key-match' : 'key-other');
    }
  }
  function puff(x: number, y: number): void {
    // Reuse the oldest puff when all are busy, so every click shows one.
    let slot = puffs[0]!;
    for (const p of puffs) { if (!p.active) { slot = p; break; } if (p.t > slot.t) slot = p; }
    slot.active = true; slot.x = x; slot.y = y; slot.t = 0;
  }

  const stats: WebPlaygroundStats = {
    get phase() { return phase; }, get tier() { return tier; }, get mode() { return mode; }, get level() { return level; },
    get picture() { return PICTURES[picture]!; }, get request() { return phase === 'catch' ? glyph(mode, request) : phase === 'connect' && nextPoint < nPoints ? glyph(mode, pointValue(nextPoint)) : ''; },
    get hint() { return hint; }, get caught() { return caughtCount; }, get connected() { return Math.min(nextPoint, nPoints); }, get points() { return nPoints; },
    get correct() { return correct; }, get wrong() { return wrong; }, get alone() { return alone; }, get stars() { return stars; },
    get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; }, get selected() { return menuSelected; },
    get rounds() { return data.rounds; },
    get motor() { return { attempts, hits, padded }; },
    get levels() { return { numbers: data.numberLevel, letters: data.letterLevel, tier: data.tier }; },
    get workMean() { let s = 0; for (let i = 0; i < workCount; i++) s += work[i]!; return workCount ? s / workCount : 0; },
    get workMax() { let m = 0; for (let i = 0; i < workCount; i++) m = Math.max(m, work[i]!); return m; },
    get particles() { return particles.alive; },
    get guide() { return { dots: guideDots, faded: guideFaded, hidden: guideHidden }; },
    balls() { const w = phase === 'catch' && step === 'ask' ? wantedBall() : undefined; return balls.filter(b => b.active && !b.pulled && b.delay <= 0).map(b => ({ x: b.x, y: b.y, r: ballD / 2, glyph: glyph(mode, b.value), wanted: b === w, catchable: b.enter >= 1 })); },
    pointsList() { return Array.from({ length: phase === 'connect' ? nPoints : 0 }, (_, i) => ({ x: pts[i * 2]!, y: pts[i * 2 + 1]!, r: pointD / 2, glyph: glyph(mode, pointValue(i)), next: i === nextPoint, joined: i < nextPoint })); },
    controls() { const choice = phase === 'choice'; return Array.from({ length: choice ? pending?.choices.length ?? 0 : phase === 'rest' ? 2 : 0 }, (_, i) => ({ x: controlX(i, choice), y: choice ? badgeY : controlsY, radius: choice ? badgeSize / 2 : controlsRadius, id: choice ? pending!.choices[i]! : i === 0 ? 'again' : 'home' })); },
    corners() { return [{ x: homeX, y: cornerY, radius: cornerRadius, id: 'home' }, { x: soundX, y: cornerY, radius: cornerRadius, id: 'sound' }]; },
    pictureRect() {
      if (phase !== 'connect' && phase !== 'complete' && phase !== 'celebration') return null;
      return { x0: picX + picBox[0]! * picSX, x1: picX + picBox[1]! * picSX, y0: picY + picBox[2]! * picSY, y1: picY + picBox[3]! * picSY, points: Array.from(pts.subarray(0, nPoints * 2)) };
    },
    art() {
      const r = dpr(), size = (c: HTMLCanvasElement | undefined): number[] => (c ? [c.width, c.height] : []);
      let glyphs = 0, stale = 0;
      const check = (c: HTMLCanvasElement | undefined, w: number): void => { if (!c) return; glyphs++; if (Math.abs(c.width - Math.ceil(w * r)) > 1) stale++; };
      for (const b of balls) if (b.active) check(b.canvas, ballD + PAD * 2);
      for (let i = 0; i < caughtCount; i++) check(caughtCanvas[i], miniD + PAD * 2);
      for (let i = 0; i < nPoints; i++) check(pointCanvas[i], pointD + PAD * 2);
      check(signCanvas, signSize[0]!);
      return { dpr: r, view: [Math.round(W * r), Math.round(H * r)], day: size(bgDay), dusk: size(bgDusk), glyphs, stale };
    },
    resetWork() { workHead = workCount = 0; },
  };

  return {
    stats,
    enter() {
      // Decode off the main thread now, so the first frames that draw the art only draw it.
      void loadWebPlaygroundArt(services).then(() => {
        for (const { name } of artList()) {
          const done = sprites.get(name)?.decode().catch(() => undefined);
          if (name === CITY_DAY) void done?.then(() => { dayDecoded = true; });
          else if (name === CITY_DUSK) void done?.then(() => { duskDecoded = true; });
        }
      });
      if (services.debug.enabled) window.__webPlayground = stats;
      void ensureDisplayFont().then(() => { fontReady = true; });
      prepareClips(services);
      setSfxVariants({ pop: 'C', whoosh: 'C' });
      data = services.save.gameData<GameData>(GAME_ID, { ...DEFAULT_DATA });
      sanitizeData(data, () => services.save.protect());
      data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; startMusic(audio, 'web-playground');
      layout(services.canvas.width, services.canvas.height);
      bookGlide = false;
      if (data.pending) {
        pending = data.pending; mode = pending.mode; picture = pending.picture; stars = pending.stars; caughtCount = pending.caught;
        tier = toTier(data.tier); tierP = TIERS[tier];
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { setPhase('choice'); armMenu(); }
        else enterRest();
      } else startRound();
    },
    pause() { stopMusic(audio); stopIdle(); cancelClips(); services.save.flush(); },
    resume() {
      // Back on top after another screen (the break nudge) covered it. Keys pressed into that screen must not act
      // here: the choice and rest start over as when they first appeared, nothing focused and input ignored for
      // MENU_GUARD_MS. During the round a short guard keeps the press that closed the nudge from catching a ball.
      if (phase === 'choice' || phase === 'rest') armMenu(); else guard();
      startMusic(audio, 'web-playground');
    },
    exit() { stopMusic(audio); stopIdle(); cancelClips(); services.save.flush(); setSfxVariants({ pop: 'A', whoosh: 'A' }); },
    resize: layout,
    update(dt) {
      const started = performance.now();
      lastDt = dt; time += dt; sceneT += dt; phaseT += dt; poseT += dt; hopT += dt; friendHopT += dt;
      if (flightT < 1) flightT = Math.min(1, flightT + dt / 0.45);
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      for (let i = 0; i < MAX_POINTS; i++) pointWiggle[i] = Math.max(0, pointWiggle[i]! - dt);
      for (const p of puffs) if (p.active) { p.t += dt; if (p.t >= 0.4) p.active = false; }
      for (const p of pows) if (p.active) { p.t += dt; if (p.t >= 0.45) p.active = false; }
      if (phase === 'swingIn') { if (phaseT >= SWING_IN + 0.3) beginCatch(); }
      else if (phase === 'catch') updateCatch(dt);
      else if (phase === 'swing') { if (phaseT >= SWING_OUT + SWING_ACROSS_IN + 0.3) beginConnect(); }
      else if (phase === 'connect') updateConnect(dt);
      else if (phase === 'complete') updateComplete();
      else if (phase === 'celebration') {
        const reveal = phaseT - 0.3;
        const shown = reveal < STAR_HIT_SECONDS ? 0 : Math.min(stars, Math.floor((reveal - STAR_HIT_SECONDS) / STAR_GAP_SECONDS) + 1);
        if (shown > starsPlayed) { playSfx(audio, 'star', { index: starsPlayed }); starsPlayed = shown; }
        const next = Math.min(caughtCount, Math.floor(phaseT / 1.6 * caughtCount));
        if (next > ticks) { ticks = next; playSfx(audio, 'tick', { volume: 0.45 }); }
        if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
      } else if (phase === 'sticker' && phaseT >= PICK_SECONDS) enterRest();
      if (phase === 'celebration' || phase === 'choice' || phase === 'sticker') warmOffers();
      offers.update(dt, phase === 'choice' ? menuSelected : -1);
      if (pose === 'shoot' && poseT > 0.9 && phase === 'catch' && step === 'ask') pose = 'wave';
      ensureBakes();
      if ((fanfareDue() || counterDue()) && !idleHandle) idleHandle = requestIdleCallback(prepareIdle, IDLE_OPTIONS);
      particles.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      frame++;
      if (view.width !== W || view.height !== H || dpr() !== artDpr) { layout(view.width, view.height); ensureBakes(); }
      // Digits baked in the last idle period: drawn once here, under the backdrop, which uploads them.
      if (counterMade) { drawCounter(ctx, 1234567890, W / 2, H / 2, counterWarm, 1); counterMade = false; }
      if (phase === 'swing') {
        const p = easeInOutSine(clamp01(phaseT / (SWING_OUT + SWING_ACROSS_IN)));
        drawBg(ctx, bgDay, -p * W); drawBg(ctx, bgDusk, W - p * W);
      } else drawBg(ctx, phase === 'swingIn' || phase === 'catch' ? bgDay : bgDusk, 0);
      const dusk = !(phase === 'swingIn' || phase === 'catch' || (phase === 'swing' && phaseT < SWING_OUT));
      const still = phase === 'rest';
      if (phase !== 'choice' && phase !== 'sticker' && phase !== 'rest' && phase !== 'swing') drawFriends(ctx, dusk, still);
      if (phase === 'catch' || phase === 'swingIn') { drawBalls(ctx); drawString(ctx); }
      if (phase === 'connect' || phase === 'complete' || phase === 'celebration') {
        const fill = phase === 'connect' ? 0 : phase === 'complete' ? clamp01((phaseT - 0.3) / 0.6) : 1;
        drawPicture(ctx, fill); drawThreads(ctx);
        if (phase === 'connect' && nextPoint > 0 && closeT === 0 && threadT < 1) {
          const hp = hand(), hx = hp[0], hy = hp[1], j = nextPoint - 1;
          web(ctx, hx, hy, lerp(hx, pts[j * 2]!, easeOutCubic(threadT)), lerp(hy, pts[j * 2 + 1]!, easeOutCubic(threadT)), 0, 2.2 * u);
        }
      }
      if (phase === 'catch' && step === 'shoot' && target) {
        const hp = hand(), hx = hp[0], hy = hp[1], k = easeOutCubic(clamp01(stepT / 0.15));
        web(ctx, hx, hy, lerp(hx, target.x, k), lerp(hy, target.y, k), 0, 3 * u);
      }
      if (phase !== 'choice' && phase !== 'sticker') drawHero(ctx);
      // Points above the hero: in reclaimed space (fitPicture) a point may stand in front of him, never behind.
      if (phase === 'connect') drawPoints(ctx);
      if (phase === 'catch' || phase === 'connect') drawGuide(ctx);
      if (phase === 'catch') { drawSign(ctx); drawFlight(ctx); }
      particles.render(ctx); drawPuffs(ctx); drawPows(ctx);
      if (phase === 'celebration' || phase === 'choice' || phase === 'sticker' || phase === 'rest') drawReward(ctx);
      drawCorners(ctx); drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'pointerup' || event.type === 'keyup') { soundButton.pointerUp(soundX, cornerY); return; }
      const now = performance.now(), menu = phase === 'choice' || phase === 'rest';
      if (event.type === 'pointermove') {
        if (menu && now >= inputAfter) { const i = hoverMenu(event.info.x, event.info.y); if (i >= 0) { if (menuSelected < 0) focusAt = now; menuSelected = i; } }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { exitToHub(); return; }
        cornerFocus = -1;
      } else if (!inRound()) {
        // During the round every key plays, Escape, Tab and Enter included: there is no wrong button.
        // Keyboard routes to Home exist only after the round, once its input guard has passed.
        if (phase === 'celebration' ? !celebrationSkippable() : now < inputAfter) return;
        const code = event.info.code;
        if (code === 'Escape') { exitToHub(); return; }
        if (code === 'Tab') { cornerFocus = (cornerFocus + 2) % 3 - 1; return; }
        if (cornerFocus >= 0) {
          if (code.startsWith('Arrow')) { cornerFocus = 1 - cornerFocus; return; }
          if (code === 'Enter' || code === 'NumpadEnter') { if (cornerFocus === 0) exitToHub(); else soundButton.pointerDown(soundX, cornerY); return; }
          cornerFocus = -1;
        }
      }
      if (phase === 'celebration') {
        // Skippable once the stars are in, never in the first 1.5 s.
        if (celebrationSkippable()) finishCelebration();
        return;
      }
      if (now < inputAfter) return;
      if (phase === 'swingIn' || phase === 'swing' || phase === 'complete') {
        // Transitions run on their own; a click still leaves a web puff.
        if (event.type === 'pointerdown') puff(event.info.x, event.info.y); else hopT = 0;
        return;
      }
      if (playing()) {
        if (event.type === 'pointerdown') pointerPlay(event.info.x, event.info.y); else keyPlay(event.info.key);
        return;
      }
      if (!menu) return;
      const n = phase === 'choice' ? pending?.choices.length ?? 0 : 2;
      if (event.type === 'pointerdown') {
        const i = hoverMenu(event.info.x, event.info.y); if (i < 0) return; menuSelected = i;
      } else {
        // The first key only shows focus; arrows move it; a later key, once focus has shown a moment, chooses.
        if (menuSelected < 0) { menuSelected = 0; focusAt = now; return; }
        const code = event.info.code;
        if (code.startsWith('Arrow')) { menuSelected = (menuSelected + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
      }
      if (phase === 'choice') chooseSticker(menuSelected); else leave(menuSelected === 0);
    },
  };
}

declare global { interface Window { __webPlayground?: WebPlaygroundStats } }
