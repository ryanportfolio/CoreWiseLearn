/**
 * Word pot, the third Frog Pond activity. Word bubbles rise out of a bubbling pot and drift above it: the halves of
 * two to four compound words and a few words that fit nothing. Pressing one lifts it and makes it glow; pressing a
 * second slams the two together, the halves in reading order whichever was pressed first. A real word goes poof, the
 * postman says it, and its picture swims out into the pond, where every word the child has made stays (the collection
 * is saved by the scene through `onMade`). Two words that make nothing bonk and bounce apart; nothing is lost.
 *
 * The scene shell (scene.ts) owns the background, the corner buttons and the round end; this module owns play.
 * Nothing here allocates per frame: bubbles and swimmers live in preallocated arrays and every word is a baked canvas.
 */
import type { AppServices } from '../../app/services';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import type { CursorHover } from '../../engine/scene';
import { voicePlayer } from '../../audio/voice-player';
import { playSfx, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { drawSprite, OUTLINE } from '../../ui/draw';
import { approach, clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp, slamScale } from '../../ui/tween';
import type { WordArt } from './cards';
import type { Compound } from './content';
import { bakeBubble, bakeJoined, type BubbleArt } from './pot-cards';
import { COMPOUND_WORDS, joinWord, potParams, type PotPlan, type PotTier } from './pot-rules';
import { HAND, HOVER_RING } from './rhyme';
import { FROG_VOICE, sayWord } from './voice';

const ART = 'frog-pond/';
export const POT = `${ART}pot`;
export const pictureName = (word: string): string => `${ART}cw-${word}`;
export const POT_ART = [POT, ...COMPOUND_WORDS.map(pictureName)];

const MAX_BUBBLES = 12;
const MAX_SWIMMERS = COMPOUND_WORDS.length;
const MAX_REVEALS = 4;
/** Bubble states. */
const FREE = 0, LIFTED = 1, JOINING = 2, GONE = 3;
/** Layout units at 1366x768: pot image, bubble letters, a swimming picture, the picture as it appears, cards. */
const POT_SIZE = 280, BUBBLE_PX = 36, SWIM_SIZE = 104, REVEAL_SIZE = 190, REVEAL_CARD = 60, LABEL_H = 30;
/** The pot art's own proportions on its 512 px sprite: its feet, the water's surface in its mouth, its sides. */
const POT_FEET = 0.88, POT_MOUTH = 0.3, POT_TOP = 0.12, POT_HALF_W = 0.42;
/** Bubbles rise out of the pot one after another, then drift. */
const RISE_SECONDS = 0.8, RISE_STAGGER = 0.16;
/** Two pressed bubbles slam together in this long; a bonk wobbles for BONK_SECONDS. */
const JOIN_SECONDS = 0.24, BONK_SECONDS = 0.6;
/** A lifted bubble floats up LIFT units and grows by LIFT_GROW; its ease overshoots both by up to LIFT_PEAK. */
const LIFT = 14, LIFT_GROW = 0.14, LIFT_PEAK = 1.1;
/** A made word: its picture and card hold, then swim out into the pond. */
const REVEAL_HOLD = 1.1, REVEAL_SWIM = 0.9;
/** After the last word lands: the pot hops, then the round is done. */
const DONE_HOP_AT = 0.4, DONE_AT = 1.4;
/** Helper hand: the introduction's word, the tap loop after it, and the see-through hint after quiet seconds. */
const HAND_DEMO = 1, HAND_TAP = 2, HAND_HINT = 3;
/** Turns the glove (fingertip at its top-left corner, body down and right) to point straight down. */
const HAND_TURN = -2.39;
const DEMO_AT = 2.2, DEMO_FIRST = 0.9, DEMO_SECOND = 1.7, DEMO_FADE = 0.5, HINT_IDLE = 8, HINT_SECONDS = 2.6, TAP_CYCLE = 2.4;
/** Word help turns on after this many bonks in a round, or this long without a word made. */
const HELP_BONKS = 3, HELP_PAUSE = 14;
const KEY_GAP_MS = 150;
const SPARKLE_HUES = [48, 330, 190, 90] as const;

export interface PotBubbleInfo {
  word: string; state: 'free' | 'lifted' | 'joining' | 'gone'; half: boolean;
  x: number; y: number; r: number; hit: { x: number; y: number; w: number; h: number };
}
export interface PotSwimmerInfo { word: string; visible: boolean; x: number; y: number; hit: { x: number; y: number; w: number; h: number } }

export interface PotResult {
  /** Words the child made (the introduction's demonstrated word excluded). */
  made: number;
  /** Pairs that made no word. */
  bonks: number;
  /** Word help was on at the end of the round. */
  help: boolean;
  /** The round had several bonks or a long pause without a word. */
  struggled: boolean;
}

export interface WordPot {
  /** Begin a round. `collection` is every word made before, oldest first: the pictures already in the pond. */
  start(plan: PotPlan, tier: Tier, intro: boolean, help: boolean, collection: readonly string[]): void;
  layout(width: number, height: number, u: number, top: number, ratio: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  /** The pot with a word's picture above it, `height` tall, centred on x with its feet at `bottom` (celebration, rest). */
  drawPot(ctx: CanvasRenderingContext2D, x: number, bottom: number, height: number, happy: number, time: number, word: string): void;
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  /** For the big cursor: what a press at x, y would act on now (pointerDown's own gates and hit tests). */
  hoverAt(x: number, y: number): CursorHover;
  /** Eases the hover cues toward the mouse at x, y; x < 0 when no mouse hover counts. */
  hover(dt: number, x: number, y: number): void;
  key(code: string, shift: boolean): void;
  /** Stop the hand (the scene left or was covered). */
  stop(): void;
  readonly done: boolean;
  /** The round's first word: the rest screen shows its picture. */
  readonly target: string;
  /** Records each word made (hit) and bonk (miss) for the hidden tier. */
  onAttempt?: (hit: boolean) => void;
  /** A word was made, the demonstrated one included: the scene adds it to the saved collection. */
  onMade?: (word: string) => void;
  result(): PotResult;
  readonly stats: {
    readonly bubbles: PotBubbleInfo[]; readonly swimmers: PotSwimmerInfo[]; readonly selected: number; readonly focus: number;
    readonly keyMode: boolean; readonly help: boolean; readonly hand: number; readonly made: number; readonly bonks: number;
    readonly words: readonly string[]; readonly reveals: number;
    readonly pot: { x: number; y: number; w: number; h: number };
  };
}

export function createWordPot(services: AppServices): WordPot {
  const { sprites, audio } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(260);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => { sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx); };
  const steam: ParticleSpawn = { x: 0, y: 0, life: 1 };

  // Bubbles, preallocated.
  const words: string[] = new Array<string>(MAX_BUBBLES).fill('');
  const arts: (BubbleArt | undefined)[] = new Array<BubbleArt | undefined>(MAX_BUBBLES).fill(undefined);
  const half = new Uint8Array(MAX_BUBBLES), state = new Uint8Array(MAX_BUBBLES), partner = new Int8Array(MAX_BUBBLES);
  const bx = new Float32Array(MAX_BUBBLES), by = new Float32Array(MAX_BUBBLES), heading = new Float32Array(MAX_BUBBLES), seed = new Float32Array(MAX_BUBBLES);
  const boost = new Float32Array(MAX_BUBBLES), riseT = new Float32Array(MAX_BUBBLES), homeX = new Float32Array(MAX_BUBBLES), homeY = new Float32Array(MAX_BUBBLES);
  const liftK = new Float32Array(MAX_BUBBLES), bonkT = new Float32Array(MAX_BUBBLES).fill(9), bonkDir = new Float32Array(MAX_BUBBLES);
  const joinT = new Float32Array(MAX_BUBBLES), fromX = new Float32Array(MAX_BUBBLES), fromY = new Float32Array(MAX_BUBBLES);
  const toX = new Float32Array(MAX_BUBBLES), toY = new Float32Array(MAX_BUBBLES);
  /** On the left bubble of a join: 1 a word, 2 the demonstration's word, 3 a bonk. 0 elsewhere. */
  const joinKind = new Uint8Array(MAX_BUBBLES);
  let nBubbles = 0;

  // Swimmers: the pictures of every word made, swimming in the pond.
  const swimWord: string[] = new Array<string>(MAX_SWIMMERS).fill('');
  const labels: (WordArt | undefined)[] = new Array<WordArt | undefined>(MAX_SWIMMERS).fill(undefined);
  const sx = new Float32Array(MAX_SWIMMERS), sy = new Float32Array(MAX_SWIMMERS), sHeading = new Float32Array(MAX_SWIMMERS), sSeed = new Float32Array(MAX_SWIMMERS);
  const sHop = new Float32Array(MAX_SWIMMERS).fill(9), sVisible = new Uint8Array(MAX_SWIMMERS);
  let nSwim = 0;

  // Reveals: a made word's picture and card, holding, then swimming to its swimmer.
  const rWord: string[] = new Array<string>(MAX_REVEALS).fill('');
  const rCard: (WordArt | undefined)[] = new Array<WordArt | undefined>(MAX_REVEALS).fill(undefined);
  const rT = new Float32Array(MAX_REVEALS).fill(-1), rX = new Float32Array(MAX_REVEALS), rY = new Float32Array(MAX_REVEALS), rSwim = new Int8Array(MAX_REVEALS);

  const revealCards = new Map<string, WordArt>(), labelCards = new Map<string, WordArt>();
  let W = 1366, H = 768, u = 1, top = 120, ratio = 1;
  let potSize = POT_SIZE, potCX = 683, potCY = 640, potMouth = 560, potTopY = 520, potHalfW = 120;
  let bubblePx = BUBBLE_PX, swimSize = SWIM_SIZE, revealSize = REVEAL_SIZE, revealCardH = REVEAL_CARD, labelH = LABEL_H;
  let zoneL = 12, zoneR = 1354, zoneT = 120, zoneB = 560, swimT = 500, swimB = 760;
  let bakedPx = 0, bakedRatio = 0, bakedLabelH = 0, bakedCardH = 0;

  let plan: PotPlan = { compounds: [], bubbles: [], halves: 0 };
  let params: PotTier = potParams(0, true);
  let intro = false, help = false, struggled = false, finished = false;
  let time = 0, idleT = 0, sinceMade = 0, doneT = -1, steamT = 0, potBump = 9, potHop = 9;
  let made = 0, madeAll = 0, bonks = 0, demoMade = false;
  let selected = -1, focus = -1, keyMode = false, keyAfter = 0, pointerX = -1, pointerY = -1;
  const hand = { mode: 0, t: 0, a: -1, b: -1, x: 0, y: 0 };
  // Mouse hover, eased 0 to 1: each bubble, each swimming picture, and the pot. potSwell is set only while play draws.
  const bubbleHover = new Float32Array(MAX_BUBBLES), swimHover = new Float32Array(MAX_SWIMMERS);
  let potHover = 0, potSwell = 0;

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number, unit: number, topY: number, pixelRatio: number): void {
    W = width; H = height; u = unit; top = topY;
    const reratio = pixelRatio !== ratio; ratio = pixelRatio;
    potSize = Math.round(Math.min(POT_SIZE * u, H * 0.38, W * 0.3));
    potCX = W / 2; potCY = H - 6 - (POT_FEET - 0.5) * potSize;
    potMouth = potCY + (POT_MOUTH - 0.5) * potSize; potTopY = potCY + (POT_TOP - 0.5) * potSize; potHalfW = potSize * POT_HALF_W;
    bubblePx = Math.round(Math.max(28, BUBBLE_PX * u));
    swimSize = Math.round(Math.max(96, SWIM_SIZE * u));
    revealSize = Math.round(Math.max(140, REVEAL_SIZE * u));
    revealCardH = Math.round(Math.max(48, REVEAL_CARD * u));
    labelH = Math.round(Math.max(26, LABEL_H * u));
    zoneL = 12; zoneR = W - 12; zoneT = top; zoneB = Math.max(top + 140, potMouth);
    swimT = H * 0.42; swimB = H - 6;
    rebake(reratio);
    for (let i = 0; i < nBubbles; i++) if (state[i] === FREE && riseT[i]! >= RISE_SECONDS) keepInside(i);
    for (let s = 0; s < nSwim; s++) keepSwimmerInside(s);
    // Scale the pot, the pictures in play and the glove now, so no frame scales art.
    warmScaled(POT, potSize);
    for (let s = 0; s < nSwim; s++) warmScaled(pictureName(swimWord[s]!), swimSize);
    for (const c of plan.compounds) { warmScaled(pictureName(c.word), swimSize); warmScaled(pictureName(c.word), revealSize); }
    warmScaled(HAND, Math.round(130 * u));
  }
  function warmScaled(name: string, size: number): void {
    const img = sprites.get(name);
    if (img) sprites.scaled(name, size / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
  }
  /** Bake every word in play again when a size or the pixel ratio changed (layout time, never a frame). */
  function rebake(force: boolean): void {
    if (force || bakedPx !== bubblePx || bakedRatio !== ratio) {
      bakedPx = bubblePx; bakedRatio = ratio;
      for (let i = 0; i < nBubbles; i++) arts[i] = bakeBubble(words[i]!, bubblePx, ratio);
    }
    if (force || bakedCardH !== revealCardH) { bakedCardH = revealCardH; revealCards.clear(); }
    if (force || bakedLabelH !== labelH) { bakedLabelH = labelH; labelCards.clear(); }
    // Every word the round can make gets its pond label now, so a first-time word bakes nothing in a frame.
    for (const c of plan.compounds) { revealCard(c); labelCard(c.word); }
    for (let s = 0; s < nSwim; s++) labels[s] = labelCard(swimWord[s]!);
    for (let k = 0; k < MAX_REVEALS; k++) if (rT[k]! >= 0) rCard[k] = revealCards.get(rWord[k]!);
  }
  const compoundOf = (word: string): Compound | undefined => plan.compounds.find(c => c.word === word);
  function partsOf(word: string): readonly [string, string] {
    const c = compoundOf(word) ?? joinWordFor(word);
    return c ? c.parts : [word, ''];
  }
  function joinWordFor(word: string): Compound | undefined {
    // The collection's words are always COMPOUNDS; find their halves by trying each split.
    for (let k = 1; k < word.length; k++) { const c = joinWord(word.slice(0, k), word.slice(k)); if (c && c.word === word) return c; }
    return undefined;
  }
  function revealCard(c: Compound): WordArt {
    let art = revealCards.get(c.word);
    if (!art) { art = bakeJoined(c.parts[0], c.parts[1], revealCardH, ratio); revealCards.set(c.word, art); }
    return art;
  }
  function labelCard(word: string): WordArt {
    let art = labelCards.get(word);
    if (!art) { const [a, b] = partsOf(word); art = bakeJoined(a, b, labelH, ratio); labelCards.set(word, art); }
    return art;
  }

  const radius = (i: number): number => arts[i]?.r ?? 52;
  /**
   * The highest a bubble's centre may go. The zone's top is just below the corner buttons, and the scene checks those
   * first, so a bubble lifted and grown at its peak (plus the 2 px drift slack) must still end below that line.
   */
  const minY = (i: number): number => zoneT + radius(i) * (1 + LIFT_GROW * LIFT_PEAK) + LIFT * LIFT_PEAK * u + 2;
  function keepInside(i: number): void {
    const r = radius(i);
    bx[i] = Math.max(zoneL + r, Math.min(zoneR - r, bx[i]!));
    by[i] = Math.max(minY(i), Math.min(zoneB - r, by[i]!));
  }
  function keepSwimmerInside(s: number): void {
    const hw = swimHW(s);
    sx[s] = Math.max(swimMinX(s), Math.min(swimMaxX(s), sx[s]!));
    sy[s] = Math.max(swimMinY(), Math.min(swimMaxY(sx[s]!), sy[s]!));
    if (inPotBox(sx[s]!, sy[s]!, hw)) sx[s] = sx[s]! < potCX ? potCX - potHalfW - hw - 1 : potCX + potHalfW + hw + 1;
  }
  const inPotBox = (x: number, y: number, hw: number): boolean => Math.abs(x - potCX) < potHalfW + hw && y + swimSize / 2 > potTopY;
  /** Half the width a swimmer takes: its picture or its label, whichever is wider. */
  const swimHW = (s: number): number => Math.max(swimSize, labels[s]?.w ?? 0) / 2;
  const swimMinX = (s: number): number => W * 0.05 + swimHW(s);
  const swimMaxX = (s: number): number => W * 0.95 - swimHW(s);
  const swimMinY = (): number => swimT + swimSize / 2;
  /** The lowest a swimmer's centre may go at x: its label stays on the water, off the grassy banks in the bottom corners. */
  const swimMaxY = (x: number): number => Math.max(swimMinY(), waterBottom(x) - swimSize * 0.42 - labelH);
  function waterBottom(x: number): number {
    const d = Math.min(x, W - x) / W;
    return d >= 0.27 ? swimB : lerp(H * 0.66, swimB, clamp01((d - 0.12) / 0.15));
  }

  // ---------------------------------------------------------------- round
  function start(next: PotPlan, tier: Tier, isIntro: boolean, withHelp: boolean, collection: readonly string[]): void {
    plan = next; intro = isIntro; help = withHelp; params = potParams(tier, isIntro);
    finished = false; struggled = false; time = 0; idleT = 0; sinceMade = 0; doneT = -1; steamT = 0; potBump = 9; potHop = 9;
    made = madeAll = bonks = 0; demoMade = false;
    selected = -1; focus = -1; keyMode = false; hand.mode = 0; hand.a = hand.b = -1;
    particles.clear(); rT.fill(-1); bubbleHover.fill(0); swimHover.fill(0); potHover = 0;
    // A small window holds fewer bubbles: decoys are dropped (never halves) until they fit with room to drift.
    nBubbles = Math.min(MAX_BUBBLES, plan.bubbles.length, Math.max(plan.halves, capacity()));
    const order: number[] = [];
    for (let i = 0; i < nBubbles; i++) order.push(i);
    for (let i = nBubbles - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)) % (i + 1); const t = order[i]!; order[i] = order[j]!; order[j] = t; }
    bakedPx = bubblePx; bakedRatio = ratio;
    for (let k = 0; k < nBubbles; k++) {
      const src = order[k]!;
      words[k] = plan.bubbles[src]!; half[k] = src < plan.halves ? 1 : 0;
      arts[k] = bakeBubble(words[k]!, bubblePx, ratio);
      state[k] = FREE; partner[k] = -1; seed[k] = random() * 100; boost[k] = 0; liftK[k] = 0; bonkT[k] = 9;
      riseT[k] = -k * RISE_STAGGER; heading[k] = random() * Math.PI * 2;
      bx[k] = potCX; by[k] = potMouth;
    }
    placeHomes();
    // The pond: every word made before swims there already.
    nSwim = 0;
    for (const w of collection) if (nSwim < MAX_SWIMMERS && !swimWord.slice(0, nSwim).includes(w)) addSwimmer(w, true);
    revealCards.clear(); bakedCardH = revealCardH;
    // Bake the round's reveal cards and pond labels here, so making a word (in update) only looks them up.
    for (const c of plan.compounds) { revealCard(c); labelCard(c.word); }
    // This round's clips load ahead of the rest of the folder: each word it can make, then word help.
    voicePlayer(audio).prioritize(FROG_VOICE, [...plan.compounds.map(c => `make-${c.word}`), ...words.slice(0, nBubbles).map(w => `say-${w}`)]);
  }
  /** Where each bubble rises to: spread over the zone, the farthest of a few random spots from those already chosen. */
  function placeHomes(): void {
    for (let k = 0; k < nBubbles; k++) {
      const r = radius(k);
      let best = 0, bestX = W / 2, bestY = (zoneT + zoneB) / 2;
      for (let n = 0; n < 14; n++) {
        const x = lerp(zoneL + r, zoneR - r, random()), y = lerp(minY(k), Math.max(minY(k), zoneB - r), random());
        let d = Math.min(x - zoneL, zoneR - x) * 2;
        for (let j = 0; j < k; j++) d = Math.min(d, Math.hypot(x - homeX[j]!, y - homeY[j]!) - radius(j));
        if (d > best) { best = d; bestX = x; bestY = y; }
      }
      homeX[k] = bestX; homeY[k] = bestY;
    }
  }
  /** Bubbles the zone holds at this size: the zone's area over a bubble's area, at 45 percent cover. */
  function capacity(): number {
    let sum = 0;
    for (const w of plan.bubbles) sum += (bakeSizeGuess(w) + 18 * u) ** 2;
    const avg = plan.bubbles.length ? sum / plan.bubbles.length : 1;
    return Math.floor((zoneR - zoneL) * Math.max(0, zoneB - zoneT) * 0.45 / avg);
  }
  const bakeSizeGuess = (w: string): number => Math.max(104, w.length * bubblePx * 0.72 + bubblePx * 1.1);

  function addSwimmer(word: string, visible: boolean): number {
    if (nSwim >= MAX_SWIMMERS) return -1;
    const s = nSwim++;
    swimWord[s] = word; labels[s] = labelCard(word); sSeed[s] = random() * 100; sHop[s] = 9; sVisible[s] = visible ? 1 : 0;
    sHeading[s] = random() < 0.5 ? 0 : Math.PI;
    // The farthest of a few random spots from the swimmers already there.
    let best = -1;
    for (let n = 0; n < 12; n++) {
      const x = lerp(swimMinX(s), swimMaxX(s), random()), y = lerp(swimMinY(), swimMaxY(x), random());
      if (inPotBox(x, y, swimHW(s))) continue;
      let d = 1e9;
      for (let j = 0; j < s; j++) d = Math.min(d, Math.hypot(x - sx[j]!, y - sy[j]!));
      if (d > best) { best = d; sx[s] = x; sy[s] = y; }
    }
    if (best < 0) { sx[s] = swimMinX(s); sy[s] = swimMinY(); }
    keepSwimmerInside(s);
    warmScaled(pictureName(word), swimSize);
    return s;
  }

  // ---------------------------------------------------------------- actions
  const arrived = (i: number): boolean => riseT[i]! >= RISE_SECONDS * 0.6;
  const pressable = (i: number): boolean => i >= 0 && i < nBubbles && (state[i] === FREE || state[i] === LIFTED) && arrived(i);

  function burst(x: number, y: number, n: number, spread: number, hues: boolean): void {
    particles.burst(n, (p, k) => {
      const a = (k / n) * Math.PI * 2 + random() * 0.4, v = spread * (0.55 + random() * 0.6);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - spread * 0.25;
      p.life = 0.5 + random() * 0.35; p.size = (hues ? 5 + random() * 5 : 6 + random() * 7) * u; p.endSize = 1;
      p.gravity = hues ? 260 : 120; p.drag = 0.2;
      if (hues) { p.hue = SPARKLE_HUES[k % SPARKLE_HUES.length]!; p.saturation = 95; p.lightness = 72; }
      else { p.hue = 195; p.saturation = 85; p.lightness = 86 + random() * 10; }
      p.alpha = 1;
    });
  }

  /** Press a bubble: lift it, put it back, or slam it into the lifted one. `assisted` (the demonstration) records nothing. */
  function pressBubble(i: number, assisted: boolean): void {
    if (!pressable(i)) return;
    if (state[i] === LIFTED) {
      // Pressed again: it settles back among the others.
      state[i] = FREE; selected = -1; play('button', 'B', 0, 0.5);
      return;
    }
    if (selected < 0 || state[selected] !== LIFTED) {
      state[i] = LIFTED; selected = i; boost[i] = 0;
      play('button', 'A', 0, 0.6);
      // Word help: the teacher says the word on its bubble.
      if (help && !assisted) sayWord(audio, 'say', words[i]!);
      return;
    }
    join(selected, i, assisted);
  }

  function join(a: number, b: number, assisted: boolean): void {
    selected = -1;
    const c = joinWord(words[a]!, words[b]!);
    const real = !!c && COMPOUND_WORDS.includes(c.word);
    // The halves meet in reading order; a pair that makes nothing keeps its order across the screen.
    let left = a, right = b;
    if (real ? words[a] === c!.parts[1] : bx[a]! > bx[b]!) { left = b; right = a; }
    const mx = (bx[a]! + bx[b]!) / 2, my = (by[a]! + by[b]!) / 2, gap = (radius(left) + radius(right)) * 0.42;
    for (const [i, side] of [[left, -1], [right, 1]] as const) {
      state[i] = JOINING; joinT[i] = 0; partner[i] = i === left ? right : left; fromX[i] = bx[i]!; fromY[i] = by[i]!;
      toX[i] = mx + side * gap; toY[i] = my; joinKind[i] = 0;
    }
    joinKind[left] = real ? (assisted ? 2 : 1) : 3;
    play('whoosh', 'A', 0, 0.3);
    if (!real && help && !assisted) sayWord(audio, 'say', words[b]!);
  }

  function resolve(left: number): void {
    const right = partner[left]!, kind = joinKind[left]!;
    joinKind[left] = 0;
    const mx = (bx[left]! + bx[right]!) / 2, my = (by[left]! + by[right]!) / 2;
    if (kind !== 3) {
      const c = joinWord(words[left]!, words[right]!)!;
      state[left] = GONE; state[right] = GONE;
      if (focus === left || focus === right) focus = nearestFree(mx, my);
      burst(mx, my, 16, 230 * u, false); burst(mx, my, 12, 200 * u, true);
      play('pop-big', 'A', madeAll, 0.85);
      voicePlayer(audio).play(FROG_VOICE, `make-${c.word}`);
      madeAll++; sinceMade = 0; potBump = 0;
      if (kind === 2) demoMade = true;
      else { made++; pot.onAttempt?.(true); }
      pot.onMade?.(c.word);
      startReveal(c, mx, my);
      return;
    }
    // A bonk: both squash on contact and bounce apart, quickly at first, then drift on.
    for (const i of [left, right]) {
      state[i] = FREE; bonkT[i] = 0; boost[i] = 1;
      bonkDir[i] = i === left ? -1 : 1;
      heading[i] = (i === left ? Math.PI : 0) + (random() - 0.5) * 0.8;
    }
    play('button', 'C', 0, 0.8);
    burst(mx, my - 20 * u, 5, 120 * u, true);
    bonks++; pot.onAttempt?.(false);
    if (bonks >= HELP_BONKS) turnHelpOn();
  }

  function startReveal(c: Compound, x: number, y: number): void {
    let k = 0;
    for (let n = 0; n < MAX_REVEALS; n++) if (rT[n]! < 0) { k = n; break; }
    rWord[k] = c.word; rCard[k] = revealCard(c); rT[k] = 0;
    // The picture sits above its card; both stay in the window.
    rX[k] = Math.max(revealSize / 2 + 8, Math.min(W - revealSize / 2 - 8, x));
    rY[k] = Math.max(top * 0.5 + revealSize + revealCardH * 0.5, Math.min(H - revealCardH, y));
    // Its swimmer: the one already in the pond (it will hop), or a new one that appears when the picture lands.
    let s = -1;
    for (let n = 0; n < nSwim; n++) if (swimWord[n] === c.word) { s = n; break; }
    if (s < 0) s = addSwimmer(c.word, false);
    rSwim[k] = s;
  }

  function turnHelpOn(): void { struggled = true; help = true; }
  function nearestFree(x: number, y: number): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nBubbles; i++) {
      if (!pressable(i)) continue;
      const d = Math.hypot(bx[i]! - x, by[i]! - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function bubbleAt(x: number, y: number): number {
    // The lifted bubble is drawn on top, so it is found first; then topmost (last drawn) first.
    if (selected >= 0 && pressable(selected) && Math.hypot(x - bx[selected]!, y - by[selected]! + liftOffset(selected)) <= Math.max(48, radius(selected))) return selected;
    for (let i = nBubbles - 1; i >= 0; i--) {
      if (!pressable(i)) continue;
      if (Math.hypot(x - bx[i]!, y - by[i]!) <= Math.max(48, radius(i))) return i;
    }
    return -1;
  }
  function swimmerAt(x: number, y: number): number {
    for (let s = nSwim - 1; s >= 0; s--) {
      if (!sVisible[s]) continue;
      if (Math.abs(x - sx[s]!) <= swimSize / 2 && y >= sy[s]! - swimSize / 2 && y <= sy[s]! + swimSize * 0.45 + labelH) return s;
    }
    return -1;
  }
  const onPot = (x: number, y: number): boolean => Math.abs(x - potCX) <= potHalfW && y >= potTopY && y <= H;
  /** A pair of the round still to make, nearest the pot first: [a, b] into `out`, or false. */
  function nextPair(out: Int8Array): boolean {
    let bestD = Infinity, found = false;
    for (let i = 0; i < nBubbles; i++) {
      if (!half[i] || !pressable(i)) continue;
      for (let j = i + 1; j < nBubbles; j++) {
        if (!half[j] || !pressable(j) || !joinWord(words[i]!, words[j]!)) continue;
        const d = Math.hypot(bx[i]! - potCX, by[i]! - potMouth);
        if (d < bestD) { bestD = d; out[0] = i; out[1] = j; found = true; }
      }
    }
    return found;
  }
  const pairScratch = new Int8Array(2);

  // ---------------------------------------------------------------- update
  function updateBubble(i: number, dt: number): void {
    if (state[i] === GONE) return;
    if (riseT[i]! < RISE_SECONDS) {
      const before = riseT[i]!;
      riseT[i] = before + dt;
      if (before < 0 && riseT[i]! >= 0) { potBump = 0; play('pop', 'A', i, 0.35); }
      if (riseT[i]! < 0) return;
      // Out of the pot's mouth and up to its spot, easing out.
      const k = easeOutCubic(riseT[i]! / RISE_SECONDS);
      bx[i] = lerp(potCX, homeX[i]!, k); by[i] = lerp(potMouth, homeY[i]!, k) - Math.sin(k * Math.PI) * 30 * u;
      if (riseT[i]! >= RISE_SECONDS) heading[i] = random() * Math.PI * 2;
      return;
    }
    bonkT[i] = bonkT[i]! + dt;
    const lifted = state[i] === LIFTED;
    liftK[i] = lifted ? Math.min(1, liftK[i]! + dt * 7) : Math.max(0, liftK[i]! - dt * 5);
    if (state[i] === JOINING) {
      joinT[i] = joinT[i]! + dt;
      const k = easeInCubic(joinT[i]! / JOIN_SECONDS);
      bx[i] = lerp(fromX[i]!, toX[i]!, k); by[i] = lerp(fromY[i]!, toY[i]!, k);
      if (joinT[i]! >= JOIN_SECONDS && joinKind[i]) resolve(i);
      return;
    }
    if (lifted) return;
    boost[i] = Math.max(0, boost[i]! - dt * 1.4);
    const s = seed[i]!;
    heading[i] = heading[i]! + (Math.sin(time * 0.5 + s) * 0.6 + Math.sin(time * 1.1 + s * 1.7) * 0.3) * dt;
    const speed = params.speed * u * (1 + boost[i]! * 9);
    let vx = Math.cos(heading[i]!) * speed, vy = Math.sin(heading[i]!) * speed * 0.8;
    // Keep apart: overlapping bubbles slide away from each other along the line between them.
    const gap = 14 * u;
    for (let j = 0; j < nBubbles; j++) {
      if (j === i || state[j] === GONE || riseT[j]! < RISE_SECONDS) continue;
      const dx = bx[i]! - bx[j]!, dy = by[i]! - by[j]!, d = Math.hypot(dx, dy) || 1;
      const over = radius(i) + radius(j) + gap - d;
      if (over <= 0) continue;
      const push = 120 * u * Math.min(1, over / 40);
      vx += (dx / d) * push; vy += (dy / d) * push;
    }
    let x = bx[i]! + vx * dt, y = by[i]! + vy * dt;
    const r = radius(i), c = Math.cos(heading[i]!), sn = Math.sin(heading[i]!);
    if (x < zoneL + r && c < 0) heading[i] = Math.PI - heading[i]!;
    if (x > zoneR - r && c > 0) heading[i] = Math.PI - heading[i]!;
    if (y < minY(i) && sn < 0) heading[i] = -heading[i]!;
    if (y > zoneB - r && sn > 0) heading[i] = -heading[i]!;
    x = Math.max(zoneL + r - 2, Math.min(zoneR - r + 2, x));
    y = Math.max(minY(i) - 2, Math.min(zoneB - r + 2, y));
    bx[i] = x; by[i] = y;
  }

  function updateSwimmer(s: number, dt: number): void {
    sHop[s] = sHop[s]! + dt;
    if (!sVisible[s]) return;
    const seedS = sSeed[s]!;
    sHeading[s] = sHeading[s]! + Math.sin(time * 0.4 + seedS) * 0.35 * dt;
    const speed = 11 * u;
    let vx = Math.cos(sHeading[s]!) * speed, vy = Math.sin(sHeading[s]!) * speed * 0.35;
    for (let j = 0; j < nSwim; j++) {
      if (j === s || !sVisible[j]) continue;
      const dx = sx[s]! - sx[j]!, dy = sy[s]! - sy[j]!;
      const ox = swimHW(s) + swimHW(j) + 10 * u - Math.abs(dx), oy = swimSize * 0.9 + labelH - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      const push = 40 * u * Math.min(1, ox / 40);
      if (ox < oy) vx += (dx > 0 || (dx === 0 && s > j) ? 1 : -1) * push; else vy += (dy > 0 || (dy === 0 && s > j) ? 1 : -1) * push;
    }
    let x = sx[s]! + vx * dt, y = sy[s]! + vy * dt;
    const c = Math.cos(sHeading[s]!), sn = Math.sin(sHeading[s]!);
    if (x < swimMinX(s) && c < 0) sHeading[s] = Math.PI - sHeading[s]!;
    if (x > swimMaxX(s) && c > 0) sHeading[s] = Math.PI - sHeading[s]!;
    if (y < swimMinY() && sn < 0) sHeading[s] = -sHeading[s]!;
    if (y > swimMaxY(x) && sn > 0) sHeading[s] = -sHeading[s]!;
    if (inPotBox(x, y, swimHW(s))) { if ((x < potCX) === (c > 0)) sHeading[s] = Math.PI - sHeading[s]!; x = sx[s]!; }
    sx[s] = x; sy[s] = y;
    keepSwimmerInside(s);
  }

  function updateReveals(dt: number): boolean {
    let any = false;
    for (let k = 0; k < MAX_REVEALS; k++) {
      if (rT[k]! < 0) continue;
      any = true;
      const before = rT[k]!;
      rT[k] = before + dt;
      if (rT[k]! >= REVEAL_HOLD + REVEAL_SWIM) {
        // Landed: a splash, and the picture swims on as part of the pond.
        const s = rSwim[k]!;
        rT[k] = -1;
        if (s >= 0) {
          sVisible[s] = 1; sHop[s] = 0;
          particles.burst(10, (p, n) => {
            const a = (n / 10) * Math.PI * 2;
            p.x = sx[s]!; p.y = sy[s]! + swimSize * 0.35; p.vx = Math.cos(a) * 110 * u; p.vy = Math.sin(a) * 40 * u - 40 * u;
            p.life = 0.5; p.size = 6 * u; p.endSize = 2; p.gravity = 200; p.hue = 195; p.saturation = 80; p.lightness = 90; p.alpha = 0.95;
          });
          play('pop', 'B', s, 0.5);
        }
      }
    }
    return any;
  }

  function updateHand(dt: number): void {
    if (!hand.mode) {
      if (intro && !demoMade && time >= DEMO_AT && madeAll === 0) startHand(HAND_DEMO);
      else if ((!intro || demoMade) && idleT >= HINT_IDLE && doneT < 0 && madeAll < plan.compounds.length) { startHand(HAND_HINT); idleT = 0; }
      return;
    }
    hand.t += dt;
    if (hand.mode === HAND_DEMO) {
      if (hand.t >= DEMO_FIRST && hand.t - dt < DEMO_FIRST) pressBubble(hand.a, true);
      if (hand.t >= DEMO_SECOND && hand.t - dt < DEMO_SECOND) pressBubble(hand.b, true);
      if (hand.t >= DEMO_SECOND + DEMO_FADE) { hand.mode = 0; if (demoMade || madeAll > 0) startHand(HAND_TAP); }
      if (hand.mode === HAND_DEMO) placeHand();
      return;
    }
    if (!pressable(hand.a) || !pressable(hand.b)) {
      // Its pair was made: show another, or stop.
      if (!nextPair(pairScratch)) { hand.mode = 0; return; }
      hand.a = pairScratch[0]!; hand.b = pairScratch[1]!;
    }
    if (hand.mode === HAND_HINT && hand.t >= HINT_SECONDS) { hand.mode = 0; return; }
    placeHand();
  }
  /** The glove's fingertip: at the first bubble, gliding to the second, at the second, gliding back. */
  function placeHand(): void {
    const a = hand.a, b = hand.b;
    if (a < 0 || b < 0) return;
    const ax = bx[a]!, ay = by[a]! - radius(a) * 0.5 - liftOffset(a), bxx = bx[b]!, byy = by[b]! - radius(b) * 0.5;
    if (hand.mode === HAND_DEMO) {
      const t = hand.t;
      if (t < DEMO_FIRST) { const e = easeOutCubic(clamp01(t / (DEMO_FIRST - 0.15))); hand.x = lerp(W * 0.6, ax, e); hand.y = lerp(-130 * u, ay, e); }
      else { const e = easeInOutSine(clamp01((t - DEMO_FIRST - 0.15) / (DEMO_SECOND - DEMO_FIRST - 0.3))); hand.x = lerp(ax, bxx, e); hand.y = lerp(ay, byy, e) - Math.sin(e * Math.PI) * 50 * u; }
      return;
    }
    const c = (hand.t % TAP_CYCLE) / TAP_CYCLE;
    const e = c < 0.25 ? 0 : c < 0.5 ? easeInOutSine((c - 0.25) / 0.25) : c < 0.75 ? 1 : 1 - easeInOutSine((c - 0.75) / 0.25);
    hand.x = lerp(ax, bxx, e); hand.y = lerp(ay, byy, e) - Math.sin(e * Math.PI) * 40 * u;
  }
  function startHand(mode: number): void {
    if (!nextPair(pairScratch)) return;
    hand.mode = mode; hand.t = 0; hand.a = pairScratch[0]!; hand.b = pairScratch[1]!;
    placeHand();
  }

  function update(dt: number): void {
    time += dt; idleT += dt; potBump += dt; potHop += dt;
    if (doneT < 0 && madeAll < plan.compounds.length && !(intro && !demoMade)) {
      sinceMade += dt;
      if (sinceMade >= HELP_PAUSE) turnHelpOn();
    }
    for (let i = 0; i < nBubbles; i++) updateBubble(i, dt);
    for (let s = 0; s < nSwim; s++) updateSwimmer(s, dt);
    const revealing = updateReveals(dt);
    updateHand(dt);
    if (keyMode && !pressable(focus)) focus = nearestFree(focus >= 0 ? bx[focus]! : W / 2, focus >= 0 ? by[focus]! : top);
    // The pot bubbles away: a small pale bubble rises from its mouth now and then.
    steamT += dt;
    if (steamT >= 0.35) {
      steamT = 0;
      steam.x = potCX + (random() - 0.5) * potSize * 0.5; steam.y = potMouth; steam.vx = (random() - 0.5) * 20 * u; steam.vy = -(40 + random() * 40) * u;
      steam.life = 1.1; steam.size = (4 + random() * 6) * u; steam.endSize = 2; steam.gravity = 0; steam.drag = 1;
      steam.hue = 195; steam.saturation = 85; steam.lightness = 88; steam.alpha = 0.85;
      particles.spawn(steam);
    }
    if (doneT < 0 && madeAll >= plan.compounds.length && plan.compounds.length > 0 && !revealing) doneT = 0;
    if (doneT >= 0) {
      const before = doneT; doneT += dt;
      if (before < DONE_HOP_AT && doneT >= DONE_HOP_AT) { potHop = 0; play('go', 'A', 0, 0.7); burst(potCX, potTopY, 24, 320 * u, true); }
      if (doneT >= DONE_AT) finished = true;
    }
    particles.update(dt);
  }

  // ---------------------------------------------------------------- render
  /** How far a lifted bubble floats up. */
  const liftOffset = (i: number): number => easeOutBack(liftK[i]!) * LIFT * u;

  function drawPotAt(ctx: CanvasRenderingContext2D, x: number, cy: number, size: number, sxk: number, syk: number): void {
    drawSprite(ctx, sprites, POT, x, cy, size, 0, sxk, syk);
  }
  function potSquash(happy: number, t: number, out: Float32Array): void {
    let sxk = 1, syk = 1 + Math.sin(t * 2.4) * 0.012, lift = 0;
    if (happy >= 0) { const b = Math.abs(Math.sin(happy * 3.2)); lift = b * 22 * u; sxk = 1 - 0.06 * b; syk = 1 + 0.08 * b; }
    else {
      if (potBump < 0.5) { const w = Math.exp(-6 * potBump) * Math.cos(potBump * 22); sxk += 0.06 * w; syk -= 0.05 * w; }
      if (potHop < 0.6) {
        const h = clamp01(potHop / 0.6); lift = Math.sin(h * Math.PI) * 36 * u;
        const squash = h < 0.15 ? 1 - h / 0.15 : h > 0.85 ? (h - 0.85) / 0.15 : 0;
        sxk += 0.12 * squash - 0.05 * Math.sin(h * Math.PI); syk += -0.12 * squash + 0.08 * Math.sin(h * Math.PI);
      }
    }
    out[0] = sxk; out[1] = syk; out[2] = lift;
  }
  const squashOut = new Float32Array(3);
  /** Draw the pot squashing about its feet. */
  function drawPotSquashed(ctx: CanvasRenderingContext2D, x: number, feet: number, size: number, happy: number, t: number): void {
    potSquash(happy, t, squashOut);
    // Mouse hover during play: a slight swell from the feet.
    const sxk = squashOut[0]! + 0.04 * potSwell, syk = squashOut[1]! + 0.04 * potSwell, lift = squashOut[2]!;
    ctx.save();
    ctx.translate(x, feet - lift);
    ctx.scale(sxk, syk);
    drawPotAt(ctx, 0, -(POT_FEET - 0.5) * size, size, 1, 1);
    ctx.restore();
  }

  function drawPot(ctx: CanvasRenderingContext2D, x: number, bottom: number, height: number, happy: number, t: number, word: string): void {
    const size = Math.round(height * 0.6), pic = Math.round(height * 0.42);
    drawPotSquashed(ctx, x, bottom, size, happy, t);
    if (word && sprites.get(pictureName(word))) {
      const bob = Math.sin(t * 2.2) * 6 * u, jump = happy >= 0 ? Math.abs(Math.sin(happy * 3.2 + 0.6)) * 26 * u : 0;
      drawSprite(ctx, sprites, pictureName(word), x, bottom - size * (POT_FEET - POT_TOP) - pic * 0.42 + bob - jump, pic, Math.sin(t * 1.7) * 0.06);
    }
  }

  function drawSwimmer(ctx: CanvasRenderingContext2D, s: number): void {
    if (!sVisible[s]) return;
    const seedS = sSeed[s]!, x = sx[s]!;
    let y = sy[s]! + Math.sin(time * 1.8 + seedS) * 4 * u, rot = Math.sin(time * 1.2 + seedS) * 0.07, k = 1;
    const hop = sHop[s]!;
    if (hop < 0.7) { const h = hop / 0.7; y -= Math.sin(h * Math.PI) * 34 * u; rot += Math.sin(h * Math.PI * 2) * 0.25; k = 1 + 0.08 * Math.sin(h * Math.PI); }
    const hv = swimHover[s]!;
    k *= 1 + 0.08 * hv;
    // A ripple on the water under it.
    ctx.beginPath(); ctx.ellipse(x, sy[s]! + swimSize * 0.36, swimSize * 0.42, swimSize * 0.09, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 3; ctx.stroke();
    if (hv > 0.01) {
      // Mouse hover: a soft cream ring round the picture.
      ctx.globalAlpha = 0.5 * hv; ctx.beginPath(); ctx.arc(x, y, swimSize * 0.55, 0, Math.PI * 2);
      ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER_RING; ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawSprite(ctx, sprites, pictureName(swimWord[s]!), x, y, swimSize, rot, k, k);
    const label = labels[s];
    if (label) ctx.drawImage(label.canvas, x - label.w / 2, sy[s]! + swimSize * 0.42, label.w, label.h);
  }

  function drawBubble(ctx: CanvasRenderingContext2D, i: number): void {
    const art = arts[i];
    if (state[i] === GONE || riseT[i]! < 0 || !art) return;
    const s = seed[i]!, rise = riseT[i]! < RISE_SECONDS ? riseT[i]! / RISE_SECONDS : 1;
    // Jelly wobble while drifting; a lifted bubble grows and floats up; a bonk squashes it against the other.
    const wob = Math.sin(time * 2.6 + s) * 0.03;
    let sxk = 1 + wob, syk = 1 - wob;
    const grow = 1 + LIFT_GROW * easeOutBack(liftK[i]!);
    const arrive = rise < 1 ? 0.9 + 0.1 * easeOutBack(rise) : 1;
    if (bonkT[i]! < BONK_SECONDS) { const w = Math.exp(-5 * bonkT[i]!) * Math.cos(bonkT[i]! * 26); sxk -= 0.22 * w; syk += 0.16 * w; }
    if (state[i] === JOINING) { const k = easeInCubic(joinT[i]! / JOIN_SECONDS); sxk += 0.12 * k; syk -= 0.1 * k; }
    const x = bx[i]!, y = by[i]! - liftOffset(i) + (state[i] === FREE ? Math.sin(time * 1.9 + s) * 4 * u : 0);
    if (liftK[i]! > 0) {
      // The glow: a pale halo ring that pulses gently.
      const r = art.r * grow + 10 + Math.sin(time * 5) * 3;
      ctx.globalAlpha = liftK[i]!;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff3a8'; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const hv = bubbleHover[i]!;
    if (hv > 0.01) {
      // Mouse hover: a soft cream ring and a slight swell.
      ctx.globalAlpha = 0.5 * hv; ctx.beginPath(); ctx.arc(x, y, art.r * grow * (1 + 0.06 * hv) + 7 * u, 0, Math.PI * 2);
      ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER_RING; ctx.stroke(); ctx.globalAlpha = 1;
    }
    const k = grow * arrive * (1 + 0.06 * hv);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sxk * k, syk * k);
    ctx.drawImage(art.canvas, -art.w / 2, -art.h / 2, art.w, art.h);
    ctx.restore();
  }

  function drawReveal(ctx: CanvasRenderingContext2D, k: number): void {
    const t = rT[k]!, word = rWord[k]!, card = rCard[k], s = rSwim[k]!;
    const name = pictureName(word);
    let px = rX[k]!, py = rY[k]! - revealCardH * 0.5 - revealSize * 0.5 - 6 * u, scale = slamScale(clamp01(t / 0.35), 0.3);
    let cx = rX[k]!, cy = rY[k]!, cardK = slamScale(clamp01(t / 0.3), 0.25), cardW = card?.w ?? 0, cardH = card?.h ?? 0;
    if (t < REVEAL_HOLD) {
      py += Math.sin(t * 6) * 4 * u;
    } else if (s >= 0) {
      // Swims out: an arc down to its place in the pond, shrinking to swimming size; the card shrinks into its label.
      const e = easeInOutSine((t - REVEAL_HOLD) / REVEAL_SWIM);
      const tx = sx[s]!, ty = sy[s]!;
      px = lerp(px, tx, e); py = lerp(py, ty, e) - Math.sin(e * Math.PI) * 70 * u;
      scale = lerp(1, swimSize / revealSize, e);
      const label = labels[s];
      cx = lerp(cx, tx, e); cy = lerp(cy, ty + swimSize * 0.42 + (label?.h ?? labelH) / 2, e);
      cardK = lerp(1, (label?.h ?? labelH) / (cardH || 1), e);
    }
    drawSprite(ctx, sprites, name, px, py, revealSize, Math.sin(t * 3) * 0.05, scale, scale);
    if (card) { cardW *= cardK; cardH *= cardK; ctx.drawImage(card.canvas, cx - cardW / 2, cy - cardH / 2, cardW, cardH); }
  }

  function drawFocus(ctx: CanvasRenderingContext2D): void {
    const i = keyMode ? focus : -1;
    if (!pressable(i)) return;
    const r = radius(i) * (1 + LIFT_GROW * liftK[i]!) + 12, y = by[i]! - liftOffset(i);
    ctx.beginPath(); ctx.arc(bx[i]!, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }

  function drawHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.mode) return;
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(130 * u), hw = hs * img.naturalWidth / img.naturalHeight, t = hand.t;
    let alpha = hand.mode === HAND_HINT ? 0.8 : 1, press = 1;
    if (hand.mode === HAND_DEMO) {
      if (Math.abs(t - DEMO_FIRST) < 0.12 || Math.abs(t - DEMO_SECOND) < 0.12) press = 0.88;
      if (t > DEMO_SECOND) alpha = 1 - clamp01((t - DEMO_SECOND) / DEMO_FADE);
    } else {
      const c = (t % TAP_CYCLE) / TAP_CYCLE;
      if ((c > 0.08 && c < 0.16) || (c > 0.58 && c < 0.66)) press = 0.88;
      if (hand.mode === HAND_HINT) alpha *= clamp01(t / 0.3) * (1 - clamp01((t - HINT_SECONDS + 0.4) / 0.4));
    }
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(HAND_TURN);
    drawSprite(ctx, sprites, HAND, hw * 0.42, hs * 0.44, hs, 0, press, press);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function render(ctx: CanvasRenderingContext2D): void {
    for (let s = 0; s < nSwim; s++) drawSwimmer(ctx, s);
    potSwell = potHover;
    if (potHover > 0.01) {
      // Mouse hover: a soft cream ring round the pot.
      const top = potTopY - 8 * u, bottom = potCY + (POT_FEET - 0.5) * potSize + 4 * u;
      ctx.globalAlpha = 0.5 * potHover; ctx.beginPath(); ctx.ellipse(potCX, (top + bottom) / 2, potHalfW + 26 * u, (bottom - top) / 2, 0, 0, Math.PI * 2);
      ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER_RING; ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawPotSquashed(ctx, potCX, potCY + (POT_FEET - 0.5) * potSize, potSize, doneT >= DONE_HOP_AT && potHop >= 0.6 ? doneT - DONE_HOP_AT : -1, time);
    potSwell = 0;
    // Rising bubbles first (they come out of the pot), then the drifting ones, the joining ones, the lifted one on top.
    for (let i = 0; i < nBubbles; i++) if (state[i] === FREE) drawBubble(ctx, i);
    for (let i = 0; i < nBubbles; i++) if (state[i] === JOINING) drawBubble(ctx, i);
    if (selected >= 0 && state[selected] === LIFTED) drawBubble(ctx, selected);
    for (let k = 0; k < MAX_REVEALS; k++) if (rT[k]! >= 0) drawReveal(ctx, k);
    drawFocus(ctx);
    particles.render(ctx);
    drawHand(ctx);
  }

  // ---------------------------------------------------------------- input
  function interruptHand(): void { if (hand.mode === HAND_TAP || hand.mode === HAND_HINT) hand.mode = 0; }
  /** The introduction ignores input until the glove has made its word, so an early press cannot skip the demonstration. */
  const demoRunning = (): boolean => (intro || hand.mode === HAND_DEMO) && !demoMade;
  function pointerDown(x: number, y: number): void {
    pointerX = x; pointerY = y; idleT = 0; keyMode = false;
    if (demoRunning() || doneT >= 0) return;
    interruptHand();
    const i = bubbleAt(x, y);
    if (i >= 0) { pressBubble(i, false); return; }
    if (onPot(x, y)) { potBump = 0; play('button', 'D', 0, 0.5); burst(potCX, potMouth, 6, 90 * u, false); return; }
    const s = swimmerAt(x, y);
    if (s >= 0) { sHop[s] = 0; play('button', 'A', 0, 0.4); voicePlayer(audio).play(FROG_VOICE, `make-${swimWord[s]}`); return; }
    // The water: a small ring of droplets where it was pressed.
    particles.burst(6, (p, k) => {
      const a = (k / 6) * Math.PI * 2;
      p.x = x; p.y = y; p.vx = Math.cos(a) * 70 * u; p.vy = Math.sin(a) * 40 * u; p.life = 0.45; p.size = 5 * u; p.endSize = 2;
      p.hue = 195; p.saturation = 80; p.lightness = 88; p.alpha = 0.9;
    });
  }
  function pointerMove(x: number, y: number): void {
    if (Math.hypot(x - pointerX, y - pointerY) < 12) return;
    pointerX = x; pointerY = y; keyMode = false; idleT = 0;
  }
  function hoverAt(x: number, y: number): CursorHover {
    if (demoRunning() || doneT >= 0) return null;
    return bubbleAt(x, y) >= 0 || onPot(x, y) || swimmerAt(x, y) >= 0 ? 'press' : null;
  }
  function hover(dt: number, x: number, y: number): void {
    // The same order as pointerDown: a bubble, else the pot, else a swimmer.
    const live = x >= 0 && !demoRunning() && doneT < 0, b = live ? bubbleAt(x, y) : -1;
    const onIt = live && b < 0 && onPot(x, y), s = live && b < 0 && !onIt ? swimmerAt(x, y) : -1;
    for (let i = 0; i < MAX_BUBBLES; i++) bubbleHover[i] = approach(bubbleHover[i]!, i === b ? 1 : 0, 14, dt);
    for (let i = 0; i < MAX_SWIMMERS; i++) swimHover[i] = approach(swimHover[i]!, i === s ? 1 : 0, 14, dt);
    potHover = approach(potHover, onIt ? 1 : 0, 14, dt);
  }
  function moveFocus(code: string, shift: boolean): void {
    if (!pressable(focus)) { focus = nearestFree(W / 2, top); return; }
    if (code === 'Tab') {
      for (let step = 1; step <= nBubbles; step++) {
        const j = (focus + (shift ? -step : step) + nBubbles * 2) % nBubbles;
        if (pressable(j)) { focus = j; return; }
      }
      return;
    }
    const dx = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0, dy = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
    let best = -1, score = Infinity;
    for (let j = 0; j < nBubbles; j++) {
      if (j === focus || !pressable(j)) continue;
      const x = bx[j]! - bx[focus]!, y = by[j]! - by[focus]!, along = x * dx + y * dy;
      if (along <= 1) continue;
      const v = along + Math.abs(x * dy - y * dx) * 2;
      if (v < score) { score = v; best = j; }
    }
    if (best < 0) {
      // Nothing that way: wrap round in order, so every bubble stays reachable.
      for (let step = 1; step <= nBubbles; step++) { const j = (focus + (dx + dy > 0 ? step : -step) + nBubbles * 2) % nBubbles; if (pressable(j)) { best = j; break; } }
    }
    if (best >= 0) focus = best;
  }
  function key(code: string, shift: boolean): void {
    idleT = 0;
    if (demoRunning() || doneT >= 0) return;
    interruptHand();
    const nav = code === 'Tab' || code.startsWith('Arrow');
    if (!keyMode) {
      // The first key shows which bubble has focus; it acts only from the next key.
      keyMode = true;
      if (!pressable(focus)) focus = nearestFree(W / 2, top);
      if (nav) moveFocus(code, shift);
      return;
    }
    if (nav) { moveFocus(code, shift); return; }
    const now = performance.now();
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    if (!pressable(focus)) { focus = nearestFree(W / 2, top); return; }
    const pressed = focus;
    pressBubble(pressed, false);
    // After a slam, focus moves on to the nearest bubble still drifting.
    if (state[pressed] === JOINING) focus = nearestFree(bx[pressed]!, by[pressed]!);
  }

  const bubbleInfo = (): PotBubbleInfo[] => {
    const out: PotBubbleInfo[] = [];
    for (let i = 0; i < nBubbles; i++) {
      const r = Math.max(48, radius(i)), y = by[i]! - liftOffset(i);
      out.push({
        word: words[i]!, state: state[i] === FREE ? 'free' : state[i] === LIFTED ? 'lifted' : state[i] === JOINING ? 'joining' : 'gone', half: half[i] === 1,
        x: bx[i]!, y, r: radius(i), hit: { x: bx[i]! - r, y: y - r, w: r * 2, h: r * 2 },
      });
    }
    return out;
  };
  const swimmerInfo = (): PotSwimmerInfo[] => {
    const out: PotSwimmerInfo[] = [];
    for (let s = 0; s < nSwim; s++) out.push({ word: swimWord[s]!, visible: sVisible[s] === 1, x: sx[s]!, y: sy[s]!, hit: { x: sx[s]! - swimSize / 2, y: sy[s]! - swimSize / 2, w: swimSize, h: swimSize * 0.95 + labelH } });
    return out;
  };

  const pot: WordPot = {
    start, layout, update, render, drawPot, pointerDown, pointerMove, hoverAt, hover, key,
    stop() { hand.mode = hand.mode === HAND_DEMO ? HAND_DEMO : 0; pointerX = -1; },
    get done() { return finished; },
    get target() { return plan.compounds[0]?.word ?? ''; },
    result: () => ({ made, bonks, help, struggled }),
    stats: {
      get bubbles() { return bubbleInfo(); }, get swimmers() { return swimmerInfo(); }, get selected() { return selected; },
      get focus() { return keyMode ? focus : -1; }, get keyMode() { return keyMode; }, get help() { return help; }, get hand() { return hand.mode; },
      get made() { return madeAll; }, get bonks() { return bonks; }, get words() { return plan.compounds.map(c => c.word); },
      get reveals() { let n = 0; for (let k = 0; k < MAX_REVEALS; k++) if (rT[k]! >= 0) n++; return n; },
      get pot() { return { x: potCX - potHalfW, y: potTopY, w: potHalfW * 2, h: H - potTopY }; },
    },
  };
  return pot;
}
