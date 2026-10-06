/**
 * Rhyme snack, the first Frog Pond activity. The frog sits on its lily pad with a target word (say MAT) and the
 * Scottish teacher says it. Bugs fly over the pond carrying words. Pressing a bug whose word rhymes: the frog's tongue
 * (drawn here) shoots out and catches it, the postman says the word, the frog puffs up with a sparkle and the catch
 * plays the next note of a short pentatonic tune that ends on the round's last rhyme. Pressing a bug whose word does
 * not rhyme: it hops aside with a giggle and the London lad says its word; nothing is lost.
 *
 * The scene shell (scene.ts) owns the background, the corner buttons and the round end; this module owns play.
 * Nothing here allocates per frame: bugs live in preallocated arrays and every word is a baked canvas.
 */
import type { AppServices } from '../../app/services';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem } from '../../engine/particles';
import { voicePlayer } from '../../audio/voice-player';
import { playSfx, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { drawSprite, OUTLINE, roundedRect } from '../../ui/draw';
import { clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp } from '../../ui/tween';
import { bakePadWord, WordCache, type WordArt } from './cards';
import { keyIndexForDegree, tierParams, tuneDegree, type RhymePlan, type RhymeTier } from './rhyme-rules';
import { sayWord } from './voice';

const ART = 'frog-pond/';
export const FROG_SIT = `${ART}frog-sit`, FROG_OPEN = `${ART}frog-open`, FROG_PUFF = `${ART}frog-puff`, PAD = `${ART}lily-pad`;
export const BUGS = [`${ART}bug-ladybird`, `${ART}bug-bee`, `${ART}bug-dragonfly`] as const;
/** The cartoon glove from Ride Fare: the house helper hand for flat-vector worlds. Its fingertip is its top-left corner. */
export const HAND = 'ride-fare/helper-hand';
export const RHYME_ART = [FROG_SIT, FROG_OPEN, FROG_PUFF, PAD, ...BUGS, HAND];

const MAX_BUGS = 9;
/** BUGS index of the bee, the one bug drawn side on. */
const SIDE_VIEW = 1;
/** Bug states. */
const FLY = 0, CAUGHT = 1, GONE = 2;
/** Layout units at 1366x768: lily pad image, frog image (of the pad), bug image, word card height. */
const PAD_SIZE = 440, FROG_K = 0.62, BUG_SIZE = 128, CARD_H = 54;
/** The art's own proportions, measured on the 512 px sprites. */
const PAD_BOTTOM = 0.266, FROG_FEET = 0.84, FROG_TOP = 0.08, MOUTH_Y = 0.37, BUG_VISIBLE = 0.8;
/** Tongue: out, then back with the bug. Puff after the gulp. */
const TONGUE_OUT = 0.16, TONGUE_BACK = 0.24, PUFF_SECONDS = 0.75;
const DODGE_SECONDS = 0.6, ENTER_STAGGER = 0.35, TARGET_SAY_AT = 0.7;
/** After the last catch: the frog bounces, then the round is done. */
const DONE_HOP_AT = 0.55, DONE_AT = 1.5;
/** Helper hand: the introduction's catch, the tap loop after it, and the see-through hint after quiet seconds. */
const HAND_DEMO = 1, HAND_TAP = 2, HAND_HINT = 3;
/** Turns the glove (fingertip at its top-left corner, body down and right) to point straight down. */
const HAND_TURN = -2.39;
const DEMO_AT = 1.6, DEMO_PRESS = 0.9, DEMO_FADE = 0.5, HINT_IDLE = 8, HINT_SECONDS = 2.4;
/** Word help turns on after this many dodges in a round, or this long without a catch. */
const HELP_DODGES = 3, HELP_PAUSE = 14;
/** With word help on, pointing at (or focusing) a bug this long says its word. */
const DWELL_SECONDS = 0.45;
const KEY_GAP_MS = 150;
const TONGUE = '#ff7a9c', TONGUE_DARK = '#c94d72';
const SPARKLE_HUES = [48, 330, 190, 90] as const;

export interface BugInfo {
  word: string; rhyme: boolean; state: 'fly' | 'caught' | 'gone';
  x: number; y: number; hit: { x: number; y: number; w: number; h: number };
}

export interface RhymeResult {
  /** Rhymes the child caught (the introduction's demonstrated catch excluded). */
  catches: number;
  /** Bugs that dodged. */
  dodges: number;
  /** Word help was on at the end of the round (turned on now or carried in). */
  help: boolean;
  /** The round had several dodges or a long pause without a catch. */
  struggled: boolean;
}

export interface RhymeSnack {
  /** Begin a round. */
  start(plan: RhymePlan, tier: Tier, intro: boolean, help: boolean): void;
  layout(width: number, height: number, u: number, top: number, ratio: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  /** The frog on its pad with the target word, `k` times play size, centred on x with its pad's bottom at `bottom`. */
  drawFrog(ctx: CanvasRenderingContext2D, x: number, bottom: number, k: number, happy: number, time: number): void;
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  key(code: string, shift: boolean): void;
  /** Stop speech-driven timers and the hand (the scene left or was covered). */
  stop(): void;
  readonly done: boolean;
  readonly target: string;
  /** Records each catch (hit) and dodge (miss) for the hidden tier. */
  onAttempt?: (hit: boolean) => void;
  result(): RhymeResult;
  readonly stats: {
    readonly bugs: BugInfo[]; readonly focus: number; readonly keyMode: boolean; readonly help: boolean; readonly hand: number;
    readonly tongue: number; readonly catches: number; readonly dodges: number; readonly tune: readonly number[];
    readonly frog: { x: number; y: number; w: number; h: number };
  };
}

export function createRhymeSnack(services: AppServices): RhymeSnack {
  const { sprites, audio } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(220);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => { sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx); };
  const cache = new WordCache();

  // Bugs, preallocated.
  const words: string[] = new Array<string>(MAX_BUGS).fill('');
  const cards: (WordArt | undefined)[] = new Array<WordArt | undefined>(MAX_BUGS).fill(undefined);
  const rhyme = new Uint8Array(MAX_BUGS), kind = new Uint8Array(MAX_BUGS), state = new Uint8Array(MAX_BUGS), entering = new Uint8Array(MAX_BUGS);
  const bx = new Float32Array(MAX_BUGS), by = new Float32Array(MAX_BUGS), heading = new Float32Array(MAX_BUGS), seed = new Float32Array(MAX_BUGS);
  const facing = new Float32Array(MAX_BUGS), boost = new Float32Array(MAX_BUGS), dodgeT = new Float32Array(MAX_BUGS).fill(9);
  const dodgeDir = new Float32Array(MAX_BUGS), arriveT = new Float32Array(MAX_BUGS), caughtK = new Float32Array(MAX_BUGS);
  let nBugs = 0;
  const tune: number[] = [];

  let W = 1366, H = 768, u = 1, top = 120, ratio = 1;
  let padSize = PAD_SIZE, frogSize = PAD_SIZE * FROG_K, bugSize = BUG_SIZE, cardH = CARD_H;
  let padCX = 683, padCY = 640, feetY = 610, frogCY = 500, frogTop = 400, mouthX = 683, mouthY = 450;
  let boxL = 0, boxR = 0, boxT = 0;
  let padWord: WordArt | undefined, padWordFor = '';

  let plan: RhymePlan = { rime: '', target: '', words: [], rhymes: 0 };
  let params: RhymeTier = tierParams(0, true);
  let intro = false, help = false, struggled = false, finished = false;
  let time = 0, idleT = 0, sinceCatch = 0, doneT = -1, sayT = 9, targetSaid = false, frogHop = 9;
  let catches = 0, dodges = 0, caughtCount = 0, demoCatch = false;
  // Tongue: 0 idle, 1 out, 2 back. `queued` is a rhyme pressed while the tongue was busy (-1: none).
  let tongue = 0, tongueT = 0, tongueBug = -1, tongueAssisted = false, queued = -1, tipX = 0, tipY = 0, puffT = 9;
  // Keyboard focus and word help.
  let focus = -1, keyMode = false, keyAfter = 0, hover = -1, dwellBug = -1, dwellT = 0, dwellSaid = false, pointerX = -1, pointerY = -1;
  // Helper hand.
  const hand = { mode: 0, t: 0, bug: -1, x: 0, y: 0 };

  // ---------------------------------------------------------------- layout
  const halfW = (i: number): number => Math.max(48, (cards[i]?.w ?? 0) / 2, bugSize * BUG_VISIBLE / 2);
  const cardTop = (): number => bugSize * 0.34;
  const hitTop = (i: number): number => by[i]! - bugSize * BUG_VISIBLE / 2;
  const hitBottom = (i: number): number => by[i]! + cardTop() + (cards[i]?.h ?? cardH);

  function layout(width: number, height: number, unit: number, topY: number, pixelRatio: number): void {
    W = width; H = height; u = unit; top = topY;
    const reratio = pixelRatio !== ratio; ratio = pixelRatio;
    padSize = Math.round(Math.min(PAD_SIZE * u, W * 0.5, H * 0.62));
    frogSize = Math.round(padSize * FROG_K);
    bugSize = Math.round(Math.max(120, BUG_SIZE * u));
    cardH = Math.round(Math.max(44, CARD_H * u));
    padCX = W / 2; padCY = H - 10 - padSize * PAD_BOTTOM;
    feetY = padCY - padSize * 0.06;
    frogCY = feetY - (FROG_FEET - 0.5) * frogSize;
    frogTop = feetY - (FROG_FEET - FROG_TOP) * frogSize;
    mouthX = padCX; mouthY = frogCY + (MOUTH_Y - 0.5) * frogSize;
    boxL = padCX - padSize * 0.42; boxR = padCX + padSize * 0.42; boxT = frogTop - 6;
    cache.reset(cardH, ratio);
    for (let i = 0; i < nBugs; i++) cards[i] = cache.card(words[i]!, cardH, ratio);
    if (reratio || !padWord || padWordFor !== `${plan.target}@${padSize}`) bakePad();
    for (let i = 0; i < nBugs; i++) if (!entering[i]) keepInside(i);
    // Scale every pose and bug now, so the first catch, puff or hint does not scale art inside a frame.
    warmScaled(FROG_OPEN, frogSize); warmScaled(FROG_PUFF, frogSize); warmScaled(FROG_SIT, frogSize); warmScaled(PAD, padSize);
    for (const b of BUGS) warmScaled(b, bugSize);
    warmScaled(HAND, Math.round(130 * u));
  }
  function warmScaled(name: string, size: number): void {
    const img = sprites.get(name);
    if (img) sprites.scaled(name, size / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
  }
  function bakePad(): void {
    padWordFor = `${plan.target}@${padSize}`;
    padWord = plan.target ? bakePadWord(plan.target, Math.round(padSize * 0.13), ratio) : undefined;
  }
  const flyLeft = (i: number): number => 12 + halfW(i);
  const flyRight = (i: number): number => W - 12 - halfW(i);
  const flyTop = (): number => top + bugSize * BUG_VISIBLE / 2;
  const flyBottom = (i: number): number => H - 12 - (hitBottom(i) - by[i]!);
  /** True when bug i's press area overlaps the frog and its pad. */
  const inFrogBox = (i: number, x: number, y: number): boolean =>
    x + halfW(i) > boxL && x - halfW(i) < boxR && y + (hitBottom(i) - by[i]!) > boxT;
  function keepInside(i: number): void {
    bx[i] = Math.max(flyLeft(i), Math.min(flyRight(i), bx[i]!));
    by[i] = Math.max(flyTop(), Math.min(flyBottom(i), by[i]!));
    if (inFrogBox(i, bx[i]!, by[i]!)) by[i] = Math.max(flyTop(), boxT - (hitBottom(i) - by[i]!) - 1);
  }

  // ---------------------------------------------------------------- round
  function start(next: RhymePlan, tier: Tier, isIntro: boolean, withHelp: boolean): void {
    plan = next; intro = isIntro; help = withHelp; params = tierParams(tier, isIntro);
    finished = false; struggled = false; time = 0; idleT = 0; sinceCatch = 0; doneT = -1; sayT = 9; targetSaid = false; frogHop = 9;
    catches = dodges = caughtCount = 0; demoCatch = false; tune.length = 0;
    tongue = 0; tongueBug = -1; queued = -1; puffT = 9; focus = -1; keyMode = false; hover = -1; dwellBug = -1; dwellT = 0; dwellSaid = false;
    hand.mode = 0; hand.bug = -1;
    particles.clear();
    // Shuffle the words so rhymes and decoys mix; the order also sets which side each bug flies in from.
    // A small window holds fewer bugs: decoys are dropped (never rhymes, and never the last decoy) until the bugs
    // fit with room to wander.
    nBugs = Math.min(MAX_BUGS, plan.words.length, Math.max(plan.rhymes + Math.min(1, plan.words.length - plan.rhymes), capacity()));
    const order: number[] = [];
    for (let i = 0; i < nBugs; i++) order.push(i);
    for (let i = nBugs - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)) % (i + 1); const t = order[i]!; order[i] = order[j]!; order[j] = t; }
    cache.reset(cardH, ratio);
    for (let k = 0; k < nBugs; k++) {
      const src = order[k]!;
      words[k] = plan.words[src]!; rhyme[k] = src < plan.rhymes ? 1 : 0; kind[k] = k % BUGS.length;
      cards[k] = cache.card(words[k]!, cardH, ratio);
      state[k] = FLY; entering[k] = 1; seed[k] = random() * 100; boost[k] = 0; dodgeT[k] = 9; caughtK[k] = 0;
      arriveT[k] = -k * ENTER_STAGGER;
      // Fly in from alternate sides, at spread heights.
      const fromLeft = k % 2 === 0;
      const lane = (k + 0.5) / nBugs;
      bx[k] = fromLeft ? -bugSize : W + bugSize;
      // Beside the frog the pond is open down to the bank, so the lanes run the full height there.
      by[k] = lerp(flyTop(), Math.max(flyTop(), flyBottom(k)), (lane * 1.7) % 1);
      heading[k] = fromLeft ? (random() - 0.5) * 0.6 : Math.PI + (random() - 0.5) * 0.6;
      facing[k] = fromLeft ? 1 : -1;
    }
    bakePad();
  }

  /** Bugs the pond holds at this size: open water (less the frog's box) over a bug's press area, at 40 percent cover. */
  function capacity(): number {
    const hitW = Math.max(96, bugSize * BUG_VISIBLE, cardH * 2.4) + 18 * u;
    const hitH = bugSize * BUG_VISIBLE / 2 + cardTop() + cardH + 8 + 18 * u;
    const open = (W - 24) * Math.max(0, H - 12 - top) - (boxR - boxL) * (H - boxT);
    return Math.floor(open * 0.4 / (hitW * hitH));
  }

  // ---------------------------------------------------------------- actions
  const flying = (i: number): boolean => i >= 0 && i < nBugs && state[i] === FLY && arriveT[i]! >= 0;
  /** A bug the keyboard may focus and catch: flying and already inside the pond, so its card is in view. */
  const focusable = (i: number): boolean => flying(i) && !entering[i];
  function sayTarget(): void { if (plan.target) { sayWord(audio, 'say', plan.target); sayT = 0; } }

  function sparkle(x: number, y: number, n: number, spread: number): void {
    particles.burst(n, (p, i) => {
      const a = (i / n) * Math.PI * 2 + random() * 0.4, v = spread * (0.55 + random() * 0.6);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - spread * 0.25;
      p.life = 0.55 + random() * 0.35; p.size = (5 + random() * 5) * u; p.endSize = 1;
      p.gravity = 260; p.drag = 0.18; p.hue = SPARKLE_HUES[i % SPARKLE_HUES.length]!; p.saturation = 95; p.lightness = 72; p.alpha = 1;
    });
  }

  /** Press a bug: catch a rhyme, or the bug dodges. `assisted` (the demonstration) records nothing. */
  function pressBug(i: number, assisted: boolean): void {
    if (!flying(i)) return;
    if (rhyme[i]) {
      if (tongue) { if (queued < 0 && i !== tongueBug) queued = i; return; }
      shoot(i, assisted);
      return;
    }
    // A decoy hops aside, giggling; the London lad says its word.
    dodges++; dodgeT[i] = 0; boost[i] = 1;
    const away = Math.atan2(by[i]! - (pointerY >= 0 ? pointerY : feetY), bx[i]! - (pointerX >= 0 ? pointerX : padCX));
    dodgeDir[i] = Math.cos(away) >= 0 ? 1 : -1;
    heading[i] = away;
    play('button', 'C', 0, 0.8);
    sayWord(audio, 'dodge', words[i]!);
    if (!assisted) snack.onAttempt?.(false);
    if (dodges >= HELP_DODGES) turnHelpOn();
  }
  function shoot(i: number, assisted: boolean): void {
    state[i] = CAUGHT; tongue = 1; tongueT = 0; tongueBug = i; tongueAssisted = assisted; tipX = mouthX; tipY = mouthY;
    if (assisted) demoCatch = true;
    play('whoosh', 'A', 0, 0.35);
    if (focus === i) focus = nearestFlying(bx[i]!, by[i]!, i);
  }
  function turnHelpOn(): void {
    struggled = true;
    if (help) return;
    help = true;
    // Say the target again, so the child hears what to match before pointing at bugs.
    if (!voicePlayer(audio).busy()) sayTarget();
  }
  function nearestFlying(x: number, y: number, except: number): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nBugs; i++) {
      if (i === except || state[i] !== FLY || arriveT[i]! < 0 || entering[i]) continue;
      const d = Math.hypot(bx[i]! - x, by[i]! - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function bugAt(x: number, y: number): number {
    // Topmost first: bugs draw in index order, so walk backwards.
    for (let i = nBugs - 1; i >= 0; i--) {
      if (!flying(i)) continue;
      if (Math.abs(x - bx[i]!) <= halfW(i) && y >= hitTop(i) && y <= hitBottom(i)) return i;
    }
    return -1;
  }
  const onFrog = (x: number, y: number): boolean => x >= boxL && x <= boxR && y >= boxT && y <= H;

  // ---------------------------------------------------------------- update
  function updateBug(i: number, dt: number): void {
    if (state[i] === GONE) return;
    if (arriveT[i]! < 0) { arriveT[i] = arriveT[i]! + dt; return; }
    arriveT[i] = arriveT[i]! + dt;
    if (state[i] === CAUGHT) return;
    dodgeT[i] = dodgeT[i]! + dt;
    boost[i] = Math.max(0, boost[i]! - dt * 0.9);
    // A slow wander: two slow sine turns per bug, so each meanders in its own way.
    const s = seed[i]!;
    heading[i] = heading[i]! + (Math.sin(time * 0.55 + s) * 0.7 + Math.sin(time * 1.3 + s * 1.7) * 0.35) * dt;
    // Bugs fly in quickly, then slow to their tier's wander.
    const speed = params.speed * u * (1 + boost[i]! * 2.2) * (entering[i] ? 4 : 1);
    let vx = Math.cos(heading[i]!) * speed, vy = Math.sin(heading[i]!) * speed * 0.75;
    // Keep apart: where two bugs' press areas (with a margin) overlap, each slides away along the axis that overlaps
    // least, faster the deeper the overlap, so words never cover each other for long.
    const gap = 18 * u;
    for (let j = 0; j < nBugs; j++) {
      if (j === i || state[j] !== FLY || arriveT[j]! < 0 || entering[i] || entering[j]) continue;
      const dx = bx[i]! - bx[j]!, dy = by[i]! - by[j]!;
      const ox = halfW(i) + halfW(j) + gap - Math.abs(dx), oy = (hitBottom(i) - hitTop(i) + hitBottom(j) - hitTop(j)) / 2 + gap - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      const push = 140 * u;
      // Against the left or right edge there is no room sideways: slide up or down instead.
      const walled = bx[i]! <= flyLeft(i) + 4 || bx[i]! >= flyRight(i) - 4;
      if (ox < oy && !walled) vx += (dx > 0 || (dx === 0 && i > j) ? 1 : -1) * push * Math.min(1, ox / 40);
      else vy += (dy > 0 || (dy === 0 && i > j) ? 1 : -1) * push * Math.min(1, oy / 40);
    }
    let x = bx[i]! + vx * dt, y = by[i]! + vy * dt;
    if (entering[i]) {
      if (x >= flyLeft(i) && x <= flyRight(i)) entering[i] = 0;
      else { const toward = x < W / 2 ? 0 : Math.PI; heading[i] = lerp(heading[i]!, toward, Math.min(1, dt * 2)); }
    } else {
      const c = Math.cos(heading[i]!), sn = Math.sin(heading[i]!);
      if (x < flyLeft(i) && c < 0) heading[i] = Math.PI - heading[i]!;
      if (x > flyRight(i) && c > 0) heading[i] = Math.PI - heading[i]!;
      if (y < flyTop() && sn < 0) heading[i] = -heading[i]!;
      if (y > flyBottom(i) && sn > 0) heading[i] = -heading[i]!;
      if (inFrogBox(i, x, y)) {
        // Off the frog's box by the shortest way: up over it, or out to the side.
        const up = y + (hitBottom(i) - by[i]!) - boxT, side = Math.min(x + halfW(i) - boxL, boxR - (x - halfW(i)));
        if (up < side) { if (sn > 0) heading[i] = -heading[i]!; y = Math.min(y, boxT - (hitBottom(i) - by[i]!)); }
        else if ((x < padCX) === (c > 0)) heading[i] = Math.PI - heading[i]!;
        if (inFrogBox(i, x, y)) { x = bx[i]!; y = by[i]!; }
      }
      x = Math.max(flyLeft(i) - 2, Math.min(flyRight(i) + 2, x));
      y = Math.max(flyTop() - 2, Math.min(flyBottom(i) + 2, y));
    }
    bx[i] = x; by[i] = y;
    const want = vx >= 0 ? 1 : -1;
    facing[i] = facing[i]! + (want - facing[i]!) * Math.min(1, dt * 6);
  }

  function updateTongue(dt: number): void {
    if (!tongue) return;
    tongueT += dt;
    const i = tongueBug;
    if (tongue === 1) {
      const k = easeOutCubic(tongueT / TONGUE_OUT);
      tipX = lerp(mouthX, bx[i]!, k); tipY = lerp(mouthY, by[i]!, k);
      if (tongueT >= TONGUE_OUT) {
        tongue = 2; tongueT = 0;
        // Contact: the postman says the word and the tune moves on a note.
        caughtCount++;
        const degree = tuneDegree(caughtCount - 1, plan.rhymes);
        tune.push(degree);
        play('key', 'A', keyIndexForDegree(degree), 0.9);
        sayWord(audio, 'catch', words[i]!);
        sparkle(bx[i]!, by[i]!, 10, 160 * u);
        if (!tongueAssisted) { catches++; sinceCatch = 0; snack.onAttempt?.(true); }
      }
    } else {
      const k = easeInCubic(tongueT / TONGUE_BACK);
      tipX = lerp(bx[i]!, mouthX, k); tipY = lerp(by[i]!, mouthY, k);
      caughtK[i] = k;
      if (tongueT >= TONGUE_BACK) {
        state[i] = GONE; tongue = 0; tongueBug = -1; puffT = 0;
        play('pop', 'B', caughtCount, 0.7);
        sparkle(padCX, frogTop + frogSize * 0.25, 16, 260 * u);
        if (caughtCount >= plan.rhymes) { play('pop-big', 'A', 5, 0.8); doneT = 0; }
        else if (queued >= 0) { const q = queued; queued = -1; if (flying(q)) shoot(q, false); }
      }
    }
  }

  function updateHand(dt: number): void {
    if (!hand.mode) {
      if (intro && !demoCatch && time >= DEMO_AT && caughtCount === 0) startHand(HAND_DEMO);
      else if ((!intro || demoCatch) && idleT >= HINT_IDLE && doneT < 0 && !tongue) { startHand(HAND_HINT); idleT = 0; }
      return;
    }
    hand.t += dt;
    if (!flying(hand.bug) && !(hand.mode === HAND_DEMO && hand.t >= DEMO_PRESS)) {
      // Its bug was caught: tap another rhyme, or stop.
      const next = nextRhyme();
      if (next < 0) { hand.mode = 0; return; }
      hand.bug = next;
    }
    if (hand.bug >= 0 && state[hand.bug] !== GONE) { hand.x = bx[hand.bug]!; hand.y = by[hand.bug]!; }
    if (hand.mode === HAND_DEMO) {
      if (hand.t >= DEMO_PRESS && !demoCatch) pressBug(hand.bug, true);
      if (hand.t >= DEMO_PRESS + DEMO_FADE) { hand.mode = HAND_TAP; hand.t = 0; hand.bug = nextRhyme(); if (hand.bug < 0) hand.mode = 0; }
    } else if (hand.mode === HAND_HINT && hand.t >= HINT_SECONDS) hand.mode = 0;
  }
  function nextRhyme(): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nBugs; i++) {
      if (!rhyme[i] || !flying(i) || entering[i]) continue;
      const d = Math.hypot(bx[i]! - padCX, by[i]! - feetY);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function startHand(mode: number): void {
    const bug = nextRhyme(); if (bug < 0) return;
    hand.mode = mode; hand.t = 0; hand.bug = bug; hand.x = bx[bug]!; hand.y = by[bug]!;
    if (mode === HAND_HINT) sayTarget();
  }

  function updateDwell(dt: number): void {
    const at = keyMode ? (focusable(focus) ? focus : -1) : hover;
    if (at !== dwellBug) { dwellBug = at; dwellT = 0; dwellSaid = false; return; }
    if (!help || at < 0 || dwellSaid) return;
    dwellT += dt;
    if (dwellT >= DWELL_SECONDS && !tongue && !voicePlayer(audio).busy()) { dwellSaid = true; sayWord(audio, 'say', words[at]!); }
  }

  function update(dt: number): void {
    time += dt; idleT += dt; sayT += dt; frogHop += dt; puffT += dt;
    // The target is said once audio can play (the page's first press unlocks it).
    if (!targetSaid && time >= TARGET_SAY_AT && audio.ready) { targetSaid = true; sayTarget(); }
    if (doneT < 0 && caughtCount < plan.rhymes && !(intro && !demoCatch)) {
      sinceCatch += dt;
      if (sinceCatch >= HELP_PAUSE) turnHelpOn();
    }
    for (let i = 0; i < nBugs; i++) updateBug(i, dt);
    if (pointerX >= 0 && !keyMode) hover = bugAt(pointerX, pointerY);
    updateTongue(dt); updateHand(dt); updateDwell(dt);
    if (keyMode && !focusable(focus)) focus = nearestFlying(focus >= 0 ? bx[focus]! : padCX, focus >= 0 ? by[focus]! : top, -1);
    if (doneT >= 0) {
      const before = doneT; doneT += dt;
      if (before < DONE_HOP_AT && doneT >= DONE_HOP_AT) { frogHop = 0; play('go', 'A', 0, 0.7); sparkle(padCX, frogTop, 24, 320 * u); }
      if (doneT >= DONE_AT) finished = true;
    }
    particles.update(dt);
  }

  // ---------------------------------------------------------------- render
  /** The frog's pose and its squash: puffed (eyes shut, cheeks round) after a gulp, mouth open while the tongue is out. */
  function frogPose(): string { return tongue ? FROG_OPEN : puffT < PUFF_SECONDS || doneT >= 0 ? FROG_PUFF : FROG_SIT; }
  function drawFrog(ctx: CanvasRenderingContext2D, x: number, bottom: number, k: number, happy: number, t: number): void {
    const ps = padSize * k, fs = frogSize * k, cy = bottom - ps * PAD_BOTTOM, feet = cy - ps * 0.06;
    drawSprite(ctx, sprites, PAD, x, cy, ps);
    if (padWord) {
      const pop = sayT < 0.5 ? 1 + 0.18 * Math.sin(clamp01(sayT / 0.5) * Math.PI) : 1;
      const w = padWord.w * k * pop, h = padWord.h * k * pop;
      ctx.drawImage(padWord.canvas, x - w / 2, cy + ps * 0.13 - h / 2, w, h);
    }
    // Squash and stretch about the feet: a puff wobbles wide then tall, a hop stretches up and lands squashed.
    let sx = 1, sy = 1, lift = 0;
    const pose = happy >= 0 ? FROG_PUFF : frogPose();
    if (happy >= 0) { const b = Math.abs(Math.sin(happy * 3.2)); lift = b * 26 * k * u; sx = 1 - 0.06 * b; sy = 1 + 0.08 * b; }
    else if (puffT < PUFF_SECONDS) { const w = Math.exp(-4.5 * puffT) * Math.cos(puffT * 15); sx = 1 + 0.14 * w; sy = 1 - 0.1 * w; }
    if (frogHop < 0.6 && happy < 0) {
      const h = clamp01(frogHop / 0.6); lift = Math.sin(h * Math.PI) * 40 * u * k;
      const squash = h < 0.15 ? 1 - h / 0.15 : h > 0.85 ? (h - 0.85) / 0.15 : 0;
      sx += 0.12 * squash - 0.05 * Math.sin(h * Math.PI); sy += -0.12 * squash + 0.08 * Math.sin(h * Math.PI);
    }
    const breathe = 1 + Math.sin(t * 2.2) * 0.012;
    const lean = tongue === 1 && tongueBug >= 0 && happy < 0 ? Math.max(-0.12, Math.min(0.12, (bx[tongueBug]! - x) / (W * 2))) : 0;
    ctx.save();
    ctx.translate(x, feet - lift);
    if (lean) ctx.rotate(lean);
    ctx.scale(sx, sy * breathe);
    drawSprite(ctx, sprites, pose, 0, -(FROG_FEET - 0.5) * fs, fs);
    ctx.restore();
  }

  function drawTongue(ctx: CanvasRenderingContext2D): void {
    if (!tongue) return;
    const lw = 20 * u;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(mouthX, mouthY); ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw + 8; ctx.stroke();
    ctx.strokeStyle = TONGUE; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.arc(tipX, tipY, lw * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = TONGUE_DARK; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawBug(ctx: CanvasRenderingContext2D, i: number): void {
    if (state[i] === GONE || arriveT[i]! < 0) return;
    const caught = state[i] === CAUGHT;
    const x = caught && tongue === 2 ? tipX : bx[i]!, y = caught && tongue === 2 ? tipY : by[i]!;
    const shrink = caught ? 1 - 0.6 * caughtK[i]! : 1;
    const s = seed[i]!, t = time;
    // Wings: a quick flutter as a small vertical squash; the body bobs slowly.
    const flap = Math.sin(t * 14 + s) * 0.05, bob = Math.sin(t * 2.4 + s) * 5 * u;
    const arrive = Math.min(1, arriveT[i]! / 0.4);
    const a = arrive < 1 ? 0.9 + 0.1 * easeOutBack(arrive) : 1;
    let rot = Math.max(-0.2, Math.min(0.2, Math.sin(heading[i]!) * 0.25));
    let hopY = 0, cardRot = Math.sin(t * 2.4 + s + 0.6) * 0.04;
    const d = dodgeT[i]!;
    if (d < DODGE_SECONDS) {
      const k = d / DODGE_SECONDS;
      hopY = -Math.sin(k * Math.PI) * 70 * u;
      rot = dodgeDir[i]! * easeInOutSine(k) * Math.PI * 2;
      cardRot = Math.sin(k * 30) * 0.25 * (1 - k);
    }
    const scale = a * shrink;
    const cy = y + bob + hopY;
    // The word card hangs under the bug on two short threads.
    const card = cards[i];
    if (card && !caught) {
      ctx.save();
      ctx.translate(x, cy + cardTop());
      ctx.rotate(cardRot);
      ctx.scale(scale, scale);
      ctx.beginPath(); ctx.moveTo(-card.w * 0.22, 2); ctx.lineTo(-bugSize * 0.08, -bugSize * 0.12);
      ctx.moveTo(card.w * 0.22, 2); ctx.lineTo(bugSize * 0.08, -bugSize * 0.12);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.stroke();
      ctx.drawImage(card.canvas, -card.w / 2, 0, card.w, card.h);
      ctx.restore();
    } else if (card && caught) {
      ctx.save(); ctx.translate(x, cy + cardTop() * shrink); ctx.scale(scale, scale);
      ctx.drawImage(card.canvas, -card.w / 2, 0, card.w, card.h); ctx.restore();
    }
    if (kind[i] === SIDE_VIEW) {
      // The bee is drawn side on, facing right: it turns round (a quick squash through its middle) to fly left.
      const fx = facing[i]!, flip = Math.abs(fx) < 0.3 ? (fx < 0 ? -0.3 : 0.3) : fx;
      drawSprite(ctx, sprites, BUGS[kind[i]!]!, x, cy, bugSize, rot * Math.sign(flip), flip * scale, (1 + flap) * scale);
    } else {
      // The ladybird and dragonfly face the child: they lean into the way they fly instead of turning.
      const lean = d < DODGE_SECONDS ? rot : Math.cos(heading[i]!) * 0.14;
      drawSprite(ctx, sprites, BUGS[kind[i]!]!, x, cy, bugSize, lean, scale, (1 + flap) * scale);
    }
  }

  function drawFocus(ctx: CanvasRenderingContext2D): void {
    const i = keyMode ? focus : -1;
    if (!flying(i)) return;
    const w = halfW(i) * 2 + 16, y0 = hitTop(i) - 8 + Math.sin(time * 2.4 + seed[i]!) * 5 * u, h = hitBottom(i) - hitTop(i) + 16;
    roundedRect(ctx, bx[i]! - w / 2, y0, w, h, 26);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }

  function drawHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.mode) return;
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(130 * u), hw = hs * img.naturalWidth / img.naturalHeight, t = hand.t;
    // The fingertip touches the top of the bug and the hand reaches down from above, so the word card stays in view.
    const atY = hand.y - bugSize * 0.3;
    let x = hand.x, y = atY, alpha = hand.mode === HAND_HINT ? 0.8 : 1, press = 1;
    if (hand.mode === HAND_DEMO) {
      // Comes down from above to the bug, presses it, fades.
      const e = easeOutCubic(clamp01(t / (DEMO_PRESS - 0.15)));
      x = lerp(W * 0.6, x, e); y = lerp(-hs, y, e);
      if (t >= DEMO_PRESS - 0.15 && t < DEMO_PRESS + 0.1) press = 0.88;
      if (t > DEMO_PRESS) alpha = 1 - clamp01((t - DEMO_PRESS) / DEMO_FADE);
    } else {
      const tap = Math.abs(Math.sin(t * 3.2));
      y -= tap * 22 * u; press = tap < 0.15 ? 0.9 : 1;
      if (hand.mode === HAND_HINT) alpha *= clamp01(t / 0.3) * (1 - clamp01((t - HINT_SECONDS + 0.4) / 0.4));
    }
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(x, y);
    // The glove points up and to the left; turned this far it points straight down.
    ctx.rotate(HAND_TURN);
    drawSprite(ctx, sprites, HAND, hw * 0.42, hs * 0.44, hs, 0, press, press);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function render(ctx: CanvasRenderingContext2D): void {
    drawFrog(ctx, padCX, padCY + padSize * PAD_BOTTOM, 1, -1, time);
    drawTongue(ctx);
    for (let i = 0; i < nBugs; i++) if (state[i] !== CAUGHT) drawBug(ctx, i);
    if (tongueBug >= 0) drawBug(ctx, tongueBug);
    drawFocus(ctx);
    particles.render(ctx);
    drawHand(ctx);
  }

  // ---------------------------------------------------------------- input
  function interruptHand(): void { if (hand.mode === HAND_TAP || hand.mode === HAND_HINT) hand.mode = 0; }
  /** The first round waits for the demonstration catch: before it (and while the hand moves) input is ignored. */
  const demoRunning = (): boolean => (intro || hand.mode === HAND_DEMO) && !demoCatch;
  function pointerDown(x: number, y: number): void {
    pointerX = x; pointerY = y; idleT = 0; keyMode = false;
    if (demoRunning() || doneT >= 0) return;
    interruptHand();
    const i = bugAt(x, y);
    if (i >= 0) { pressBug(i, false); return; }
    if (onFrog(x, y)) { sayTarget(); frogHop = 0; play('button', 'A', 0, 0.5); return; }
    // The water: a small ring of droplets where it was pressed.
    particles.burst(6, (p, k) => {
      const a = (k / 6) * Math.PI * 2;
      p.x = x; p.y = y; p.vx = Math.cos(a) * 70 * u; p.vy = Math.sin(a) * 40 * u; p.life = 0.45; p.size = 5 * u; p.endSize = 2;
      p.hue = 195; p.saturation = 80; p.lightness = 88; p.alpha = 0.9;
    });
  }
  function pointerMove(x: number, y: number): void {
    if (Math.hypot(x - pointerX, y - pointerY) < 12) return;
    // Moving the pointer about (looking at bugs, hearing their words with help on) is play, not a pause.
    pointerX = x; pointerY = y; keyMode = false; idleT = 0;
  }
  function moveFocus(code: string, shift: boolean): void {
    if (!focusable(focus)) { focus = nearestFlying(padCX, top, -1); return; }
    if (code === 'Tab') {
      for (let step = 1; step <= nBugs; step++) {
        const j = (focus + (shift ? -step : step) + nBugs * 2) % nBugs;
        if (focusable(j)) { focus = j; return; }
      }
      return;
    }
    const dx = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0, dy = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
    let best = -1, score = Infinity;
    for (let j = 0; j < nBugs; j++) {
      if (j === focus || !focusable(j)) continue;
      const x = bx[j]! - bx[focus]!, y = by[j]! - by[focus]!, along = x * dx + y * dy;
      if (along <= 1) continue;
      const v = along + Math.abs(x * dy - y * dx) * 2;
      if (v < score) { score = v; best = j; }
    }
    if (best < 0) {
      // Nothing that way: wrap round in reading order, so every bug stays reachable.
      for (let step = 1; step <= nBugs; step++) { const j = (focus + (dx + dy > 0 ? step : -step) + nBugs * 2) % nBugs; if (focusable(j)) { best = j; break; } }
    }
    if (best >= 0) focus = best;
  }
  function key(code: string, shift: boolean): void {
    idleT = 0;
    if (demoRunning() || doneT >= 0) return;
    interruptHand();
    const nav = code === 'Tab' || code.startsWith('Arrow');
    if (!keyMode) {
      // The first key shows which bug has focus; it acts only from the next key.
      keyMode = true;
      if (!focusable(focus)) focus = nearestFlying(padCX, top, -1);
      if (nav) moveFocus(code, shift);
      return;
    }
    if (nav) { moveFocus(code, shift); return; }
    const now = performance.now();
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    if (!focusable(focus)) { focus = nearestFlying(padCX, top, -1); return; }
    pointerX = -1; pointerY = -1;
    pressBug(focus, false);
  }

  const bugInfo = (): BugInfo[] => {
    const out: BugInfo[] = [];
    for (let i = 0; i < nBugs; i++) {
      out.push({
        word: words[i]!, rhyme: rhyme[i] === 1, state: state[i] === FLY ? 'fly' : state[i] === CAUGHT ? 'caught' : 'gone', x: bx[i]!, y: by[i]!,
        hit: { x: bx[i]! - halfW(i), y: hitTop(i), w: halfW(i) * 2, h: hitBottom(i) - hitTop(i) },
      });
    }
    return out;
  };

  const snack: RhymeSnack = {
    start, layout, update, render, drawFrog, pointerDown, pointerMove, key,
    stop() { hand.mode = hand.mode === HAND_DEMO ? HAND_DEMO : 0; dwellBug = -1; pointerX = -1; },
    get done() { return finished; },
    get target() { return plan.target; },
    result: () => ({ catches, dodges, help, struggled }),
    stats: {
      get bugs() { return bugInfo(); }, get focus() { return keyMode ? focus : -1; }, get keyMode() { return keyMode; }, get help() { return help; },
      get hand() { return hand.mode; }, get tongue() { return tongue; }, get catches() { return catches; }, get dodges() { return dodges; },
      get tune() { return tune.slice(); },
      get frog() { return { x: boxL, y: boxT, w: boxR - boxL, h: H - boxT }; },
    },
  };
  return snack;
}
