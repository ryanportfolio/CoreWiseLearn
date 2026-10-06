/**
 * Lily-pad sentences, the second Frog Pond activity. A picture at the top shows a scene (a pig in a box). The words of
 * a sentence about it float on lily pads in a scrambled order. Pressing them in reading order sends each pad to the
 * sentence row, where the frog hops onto it and the teacher says the word. The last step is a choice between a full
 * stop pad and a question mark pad; the words decide which is right. Then the postman reads the sentence while each
 * word lights up as he says it and the frog hops along, and the picture acts it out. A pad pressed out of order
 * wobbles and floats back; nothing is lost.
 *
 * The scene shell (scene.ts) owns the background, the corner buttons and the round end; this module owns play.
 * Nothing here allocates per frame: pads live in preallocated arrays and every word is a baked canvas.
 */
import type { AppServices } from '../../app/services';
import type { Tier } from '../../engine/difficulty';
import { createParticleSystem } from '../../engine/particles';
import type { CursorHover } from '../../engine/scene';
import { voicePlayer } from '../../audio/voice-player';
import { playSfx, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { drawSprite, OUTLINE, roundedRect } from '../../ui/draw';
import { approach, clamp01, easeInCubic, easeInOutSine, easeOutCubic, lerp } from '../../ui/tween';
import { bakeWordPad, type WordArt } from './cards';
import type { SceneId, Sentence } from './content';
import { READ_TIMING } from './read-timing';
import { FROG_PUFF, FROG_SIT, HAND, HOVER_RING, PAD } from './rhyme';
import { keyIndexForDegree } from './rhyme-rules';
import { readClip, sentenceTier, wordClip, type SentencePlan, type SentenceTier } from './sentence-rules';
import { FROG_VOICE } from './voice';

const ART = 'frog-pond/';
export const WORD_PAD = `${ART}word-pad`;
const sceneSprite = (id: SceneId): string => `${ART}${id === 'frog' ? 'frog-sit' : id === 'bug' ? 'bug-ladybird' : id}`;
const SCENE_IDS: readonly SceneId[] = ['pig', 'frog', 'bug', 'bat', 'cat', 'dog', 'hen', 'fox', 'jet', 'van', 'box', 'log', 'hat', 'bag', 'cap', 'ball', 'pen', 'lid', 'rock', 'twig'];
export const SENTENCE_ART = [WORD_PAD, PAD, FROG_SIT, FROG_PUFF, HAND, ...SCENE_IDS.filter(id => id !== 'frog' && id !== 'bug').map(sceneSprite), `${ART}bug-ladybird`];

/** Top and bottom of each scene sprite's drawing, as shares of its 512 px square (measured alpha bounds). */
const BOUNDS: Readonly<Record<SceneId, readonly [number, number]>> = {
  pig: [0.16, 0.84], frog: [0.113, 0.887], bug: [0.199, 0.799], bat: [0.266, 0.734], cat: [0.1, 0.898], dog: [0.1, 0.898],
  hen: [0.1, 0.898], fox: [0.1, 0.898], jet: [0.189, 0.809], van: [0.225, 0.773], box: [0.176, 0.824], log: [0.156, 0.844],
  hat: [0.248, 0.752], bag: [0.1, 0.898], cap: [0.184, 0.816], ball: [0.107, 0.893], pen: [0.1, 0.898], lid: [0.252, 0.748],
  rock: [0.205, 0.793], twig: [0.119, 0.881],
};
/**
 * Where a container's opening is, as a share of its sprite: what is in it shows above this line. A hat holding
 * something is drawn upside down, like a bowl, so its brim is the opening.
 */
const RIM: Partial<Record<SceneId, number>> = { box: 0.42, bag: 0.3, hat: 0.38 };
const WEARABLE: readonly SceneId[] = ['hat', 'cap'];

const MAX_PADS = 9;
/** Pad kinds and states. */
const WORD = 0, STOP = 1, ASK = 2;
const FLOAT = 0, MOVING = 1, PLACED = 2, HIDDEN = 3;
/** Activity steps after play: the frog hops back to the start, the postman reads, the picture acts it out. */
const PLAY = 0, BACK = 1, READ = 2, ACT = 3, DONE = 4;
/** Layout units at 1366x768: picture height, word pad height, frog sprite. */
const PIC = 230, PAD_H = 96, FROG = 116;
const FROG_TOP = 0.113, FROG_FEET = 0.887;
const GLIDE = 0.32, HOP = 0.36, WOBBLE = 0.7, APPEAR = 0.4, APPEAR_READY = 0.25;
const BACK_DELAY = 0.45, BACK_HOP = 0.5, READ_TAIL = 0.5, ACT_SECONDS = 1.6, DONE_AFTER = 0.7;
/** Without a measured table (or with the sound off), words light at this pace. */
const EVEN_WORD = 0.45;
/** A sentence clip that has not started this long after it was asked for is read on the even pace instead. */
const READ_WAIT = 1.2;
const HAND_DEMO = 1, HAND_TAP = 2, HAND_HINT = 3;
const HAND_TURN = -2.39;
const DEMO_AT = 1.6, DEMO_PRESS = 0.9, DEMO_FADE = 0.5, HINT_IDLE = 8, HINT_SECONDS = 2.4;
/** Word help turns on after this many out-of-order presses in a round, or this long without a right one. */
const HELP_MISSES = 3, HELP_PAUSE = 14;
const KEY_GAP_MS = 150;
const SKY = '#e4f6ff', GRASS = '#a6db7a', GLOW = '#fff1a0';
const SPARKLE_HUES = [48, 330, 190, 90] as const;

/** How the picture is arranged. */
const ALONE = 0, BY = 1, ON = 2, IN = 3, UNDER = 4, WEAR = 5, HOLD = 6;

export interface PadInfo {
  text: string; kind: 'word' | 'stop' | 'ask'; state: 'float' | 'moving' | 'placed' | 'hidden';
  hit: { x: number; y: number; w: number; h: number };
}
export interface SentenceResult { misses: number; help: boolean; struggled: boolean }

export interface LilySentences {
  start(plan: SentencePlan, tier: Tier, intro: boolean, help: boolean): void;
  layout(width: number, height: number, u: number, top: number, ratio: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  /** The frog on a plain lily pad, `size` its pad's width, centred on x with the pad's bottom at `bottom`; `happy` >= 0 bounces it puffed. */
  drawPadFrog(ctx: CanvasRenderingContext2D, x: number, bottom: number, size: number, happy: number): void;
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  /** For the big cursor: what a press at x, y would act on now (pointerDown's own gates and hit tests). */
  hoverAt(x: number, y: number): CursorHover;
  /** Eases the hover cues toward the mouse at x, y; x < 0 when no mouse hover counts. */
  hover(dt: number, x: number, y: number): void;
  key(code: string, shift: boolean): void;
  stop(): void;
  readonly done: boolean;
  /** The round's word for the rest screen's pad: none, the frog sits on a plain pad. */
  readonly target: string;
  /** Records each pad pressed in order (hit) and out of order (miss) for the hidden tier. */
  onAttempt?: (hit: boolean) => void;
  result(): SentenceResult;
  readonly stats: {
    readonly sentence: string; readonly end: string; readonly index: number; readonly pads: PadInfo[]; readonly next: number;
    readonly step: string; readonly lit: number; readonly litLog: readonly { word: number; at: number }[]; readonly clipStarted: boolean;
    readonly focus: number; readonly keyMode: boolean; readonly help: boolean; readonly hand: number; readonly misses: number;
    readonly frog: { x: number; y: number }; readonly picture: { x: number; y: number; w: number; h: number };
    readonly act: number;
  };
}

export function createLilySentences(services: AppServices): LilySentences {
  const { sprites, audio } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(160);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => { sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx); };
  const voice = voicePlayer(audio);

  // Pads, preallocated.
  const text: string[] = new Array<string>(MAX_PADS).fill('');
  const art: (WordArt | undefined)[] = new Array<WordArt | undefined>(MAX_PADS).fill(undefined);
  /** The same words on narrower pads for the sentence row, so a long sentence still fits a small window at a readable size. */
  const rowArt: (WordArt | undefined)[] = new Array<WordArt | undefined>(MAX_PADS).fill(undefined);
  const padLandT = new Float32Array(MAX_PADS).fill(9);
  const kind = new Uint8Array(MAX_PADS), state = new Uint8Array(MAX_PADS), slot = new Int8Array(MAX_PADS), cell = new Uint8Array(MAX_PADS);
  const homeX = new Float32Array(MAX_PADS), homeY = new Float32Array(MAX_PADS), seed = new Float32Array(MAX_PADS);
  const wobT = new Float32Array(MAX_PADS).fill(9), glideT = new Float32Array(MAX_PADS), fromX = new Float32Array(MAX_PADS), fromY = new Float32Array(MAX_PADS);
  const appearT = new Float32Array(MAX_PADS);
  let nPads = 0, nWords = 0;
  /** Row slots: one per word plus the end mark. Centre x and drawn width. */
  const slotX = new Float32Array(MAX_PADS), slotW = new Float32Array(MAX_PADS);
  const litAt = new Float32Array(MAX_PADS + 1);
  const litLog: { word: number; at: number }[] = [];
  let blank: WordArt | undefined, bakedFor = '';

  let W = 1366, H = 768, u = 1, top = 120, ratio = 1;
  let picX = 0, picY = 0, picW = 0, picH = 0, panel: HTMLCanvasElement | undefined, panelFor = '';
  let padH = PAD_H, frogS = FROG, rowY = 400, rowK = 1, startX = 0, floatK = 1, floatTop = 460, floatBottom = 750;
  let px = 0, py = 0;

  let plan: SentencePlan | undefined;
  let sentence: Sentence | undefined;
  let params: SentenceTier = sentenceTier(0, true);
  let intro = false, help = false, struggled = false, finished = false;
  let time = 0, idleT = 0, sinceHit = 0, misses = 0, next = 0, step = PLAY, stepT = 0, sayT = 9;
  // The frog: where its feet are, and its hop.
  let frogX = 0, frogY = 0, hopFromX = 0, hopFromY = 0, hopToX = 0, hopToY = 0, hopT = 9, hopDur = HOP, hopH = 50, landT = 9, frogSlot = -1;
  // Reading.
  let clip = '', clipStarted = false, readT = 0, readWait = 0, lit = -1, onsets: readonly number[] = [];
  // Keyboard and word help.
  let focus = -1, keyMode = false, keyAfter = 0, pointerX = -1, pointerY = -1;
  const hand = { mode: 0, t: 0, pad: -1, x: 0, y: 0 };
  let demoDone = false, pokeT = 9;
  // Mouse hover, eased 0 to 1: each floating pad and the picture (a press makes it jump).
  const padHover = new Float32Array(MAX_PADS);
  let picHover = 0;
  // The picture.
  let mode = ALONE, who: SceneId = 'pig', what: SceneId | undefined;
  let whoS = 0, whatS = 0, whoX = 0, whoY = 0, whatX = 0, whatY = 0, rimY = 0, sideX = 0, sideY = 0, groundY = 0;
  let actT = -1, whatTurn = 0;

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number, unit: number, topY: number, pixelRatio: number): void {
    W = width; H = height; u = unit; top = topY;
    const reratio = pixelRatio !== ratio; ratio = pixelRatio;
    padH = Math.round(Math.max(72, PAD_H * u));
    frogS = Math.round(Math.max(84, FROG * u));
    // The picture sits at the top between the corner buttons.
    picH = Math.round(Math.min(PIC * u, (H - 40) * 0.3)); picW = Math.round(picH * 1.6);
    picX = Math.round((W - picW) / 2); picY = Math.round(Math.max(10, 14 * u));
    const panelKey = `${picW}x${picH}@${ratio}`;
    if (panelFor !== panelKey) { panelFor = panelKey; panel = bakePanel(); }
    const padKey = `${padH}@${ratio}`;
    if (reratio || bakedFor !== padKey) bakePads();
    placeRow();
    placeFloat();
    placeScene();
    if (hopT >= hopDur) { frogX = hopToX = frogAtX(frogSlot); frogY = hopToY = frogAtY(); }
    warm(FROG_SIT, frogS); warm(FROG_PUFF, frogS); warm(HAND, Math.round(130 * u));
    if (who) warm(sceneSprite(who), whoS);
    if (what) warm(sceneSprite(what), whatS);
  }
  function warm(name: string, size: number): void {
    const img = sprites.get(name);
    if (img && size > 0) sprites.scaled(name, size / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
  }
  function bakePanel(): HTMLCanvasElement | undefined {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(picW * ratio)); c.height = Math.max(1, Math.round(picH * ratio));
    const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return undefined;
    g.scale(ratio, ratio);
    const r = picH * 0.12, line = Math.max(3, 5 * u);
    g.save(); roundedRect(g, line / 2, line / 2, picW - line, picH - line, r); g.clip();
    g.fillStyle = SKY; g.fillRect(0, 0, picW, picH);
    g.fillStyle = GRASS; g.fillRect(0, picH * 0.8, picW, picH * 0.2);
    g.restore();
    roundedRect(g, line / 2, line / 2, picW - line, picH - line, r); g.lineWidth = line; g.strokeStyle = OUTLINE; g.stroke();
    g.getImageData(0, 0, 1, 1);
    return c;
  }
  function bakePads(): void {
    const img = sprites.get(WORD_PAD); if (!img) return;
    bakedFor = `${padH}@${ratio}`;
    blank = bakeWordPad('', img, padH, ratio, true);
    for (let i = 0; i < nPads; i++) { art[i] = bakeWordPad(text[i]!, img, padH, ratio); rowArt[i] = bakeWordPad(text[i]!, img, padH, ratio, true); }
  }
  const padW = (i: number): number => art[i]?.w ?? padH * 2.4;
  /** Width of the row pad showing the sentence's word s (pads with the same word are the same width). */
  function wordW(s: number): number {
    const word = sentence?.words[s] ?? '';
    for (let i = 0; i < nWords; i++) if (text[i] === word) return rowArt[i]?.w ?? padH * 1.5;
    return padH * 1.5;
  }
  /** Row: the frog's own pad, then one slot per word and one for the end mark, shrunk to fit the width. */
  function placeRow(): void {
    const gap = 10 * u, startW = blank?.w ?? padH * 1.5;
    let total = startW;
    for (let s = 0; s < nWords; s++) total += wordW(s) + gap;
    // The end mark's slot is as wide as a mark pad.
    const markW = rowArt[nWords]?.w ?? padH * 1.5;
    total += markW + gap;
    rowK = Math.min(1, (W - 40) / total);
    // Under the picture leave room for the frog standing on the back of a pad.
    const frogVis = frogS * (FROG_FEET - FROG_TOP);
    rowY = picY + picH + frogVis + padH * rowK * 0.47 + 8 * u;
    let x = (W - total * rowK) / 2;
    startX = x + startW * rowK / 2; x += (startW + gap) * rowK;
    for (let s = 0; s <= nWords; s++) {
      const w = s < nWords ? wordW(s) : markW;
      slotW[s] = w * rowK; slotX[s] = x + w * rowK / 2; x += (w + gap) * rowK;
    }
    // Floating pads (and a wobble's lift) always stay below the corner buttons, whose bottom edge is `top`.
    floatTop = Math.max(rowY + padH * rowK * 0.5 + 22 * u, top + 30 * u); floatBottom = H - Math.max(10, 44 * u);
  }
  /** Floating pads: a grid of cells over the open water below the row, one pad bobbing in each. */
  function placeFloat(): void {
    let maxW = 0;
    for (let i = 0; i < nPads; i++) maxW = Math.max(maxW, padW(i));
    // One size for every floating pad, set by the word grid (the two end marks have more room).
    const rows = nWords > 4 ? 2 : 1, cols = Math.max(1, Math.ceil(nWords / rows));
    floatK = Math.min(1, ((W - 40) / cols - 24) / Math.max(1, maxW), ((floatBottom - floatTop) / rows - 16) / (padH + 16));
    placeGroup(WORD, nWords);
    placeGroup(STOP, 2);
  }
  function placeGroup(k: number, count: number): void {
    if (!count) return;
    const rows = count > 4 ? 2 : 1, cols = Math.ceil(count / rows);
    const cellW = (W - 40) / cols, cellH = (floatBottom - floatTop) / rows;
    for (let i = 0; i < nPads; i++) {
      if ((k === WORD) !== (kind[i] === WORD)) continue;
      const c = cell[i]!, r = Math.floor(c / cols), col = c % cols;
      // The second row is offset half a cell, so the pads do not line up like a table.
      const rowCount = r === rows - 1 ? count - cols * (rows - 1) : cols;
      const off = (cols - rowCount) * cellW / 2 + (rows > 1 ? (r === 0 ? -0.18 : 0.18) * cellW * (rowCount === cols ? 1 : 0) : 0);
      homeX[i] = 20 + off + cellW * (col + 0.5); homeY[i] = floatTop + cellH * (r + 0.5);
    }
  }
  function placeScene(): void {
    if (!sentence) return;
    const P = picH, cx = picX + picW / 2;
    groundY = picY + P * 0.9;
    const s = sentence.scene;
    who = s.who; what = s.what;
    whatTurn = 0;
    mode = !what ? ALONE : s.where === 'on' ? ON : s.where === 'in' ? IN : s.where === 'under' ? UNDER
      : s.where === 'with' ? (WEARABLE.includes(what) ? WEAR : HOLD) : BY;
    const small = WEARABLE.includes(who);
    whoS = Math.round(P * (mode === ALONE ? 0.74 : mode === BY ? 0.58 : mode === ON ? (small ? 0.36 : 0.44) : mode === IN ? (who === 'ball' ? 0.34 : 0.46) : mode === UNDER ? 0.36 : 0.62));
    whatS = Math.round(P * (mode === BY ? 0.52 : mode === ON ? 0.62 : mode === IN ? 0.66 : mode === UNDER ? 0.72 : mode === WEAR ? 0.36 : 0.32));
    whoX = cx; whoY = onGround(who, whoS); whatX = cx; whatY = what ? onGround(what, whatS) : 0;
    if (mode === BY) { whoX = cx - P * 0.36; whatX = cx + P * 0.36; }
    if (mode === ON && what) { const [t] = BOUNDS[what]; const topY = whatY + (t - 0.5) * whatS; whoY = topY + whatS * 0.06 - (BOUNDS[who][1] - 0.5) * whoS; }
    if (mode === IN && what) {
      rimY = whatY + ((RIM[what] ?? 0.4) - 0.5) * whatS;
      whatTurn = what === 'hat' ? Math.PI : 0;
      const vis = (BOUNDS[who][1] - BOUNDS[who][0]) * whoS;
      whoY = rimY + vis * (what === 'hat' ? 0.26 : 0.42) - (BOUNDS[who][1] - 0.5) * whoS;
    }
    if (mode === UNDER && what) { whoX = cx + P * 0.27; whoY = onGround(who, whoS) + whoS * 0.04; }
    if (mode === WEAR && what) { const headY = whoY + (BOUNDS[who][0] - 0.5) * whoS; whatY = headY + whoS * 0.1 - (BOUNDS[what][1] - 0.5) * whatS; }
    if (mode === HOLD && what) { whoX = cx - P * 0.12; whatX = cx + P * 0.26; whatY = groundY - P * 0.22; }
    // Where the main character goes when it hops out before acting the sentence.
    const gapX = mode === BY ? P * 0.34 : (what ? whatS * 0.4 : 0) + whoS * 0.42 + P * 0.04;
    sideX = (mode === BY ? whoX : whatX) - gapX; sideY = onGround(who, whoS);
    if (mode === BY) sideX = Math.max(picX + whoS * 0.42, sideX);
  }
  const onGround = (id: SceneId, size: number): number => groundY - (BOUNDS[id][1] - 0.5) * size;

  // ---------------------------------------------------------------- round
  function start(next0: SentencePlan, tier: Tier, isIntro: boolean, withHelp: boolean): void {
    plan = next0; sentence = next0.sentence; intro = isIntro; help = withHelp; params = sentenceTier(tier, isIntro);
    finished = false; struggled = false; time = 0; idleT = 0; sinceHit = 0; misses = 0; next = 0; step = PLAY; stepT = 0; sayT = 9;
    focus = -1; keyMode = false; hand.mode = 0; hand.pad = -1; demoDone = false; pokeT = 9; actT = -1; padHover.fill(0); picHover = 0;
    clip = readClip(sentence); clipStarted = false; readT = 0; readWait = 0; lit = -1; litLog.length = 0; litAt.fill(-1);
    onsets = READ_TIMING[clip] ?? [];
    particles.clear();
    const words = sentence.words;
    nWords = words.length; nPads = nWords + 2;
    for (let k = 0; k < nWords; k++) {
      const i = next0.order[k]!;
      text[k] = words[i]!; kind[k] = WORD; state[k] = FLOAT; slot[k] = -1; cell[k] = k;
    }
    text[nWords] = '.'; kind[nWords] = STOP; text[nWords + 1] = '?'; kind[nWords + 1] = ASK;
    // The two marks float in random order, hidden until the last word is in place.
    const askFirst = random() < 0.5;
    for (let i = nWords; i < nPads; i++) { state[i] = HIDDEN; slot[i] = -1; cell[i] = (i === nWords) === askFirst ? 1 : 0; }
    for (let i = 0; i < nPads; i++) { seed[i] = random() * 100; wobT[i] = 9; glideT[i] = 0; appearT[i] = 0; padLandT[i] = 9; }
    bakedFor = '';
    frogSlot = -1; hopT = 9; landT = 9;
    layout(W, H, u, top, ratio);
    frogX = startX; frogY = frogAtY();
    // This round's clips load ahead of the rest of the folder: the sentence read aloud, then each word.
    voice.prioritize(FROG_VOICE, [clip, ...words.map(wordClip)]);
  }
  const frogAtX = (s: number): number => (s < 0 ? startX : slotX[s]!);
  /** The frog stands on the back of a pad, so the word on its front stays in view. */
  const frogAtY = (): number => rowY - padH * rowK * 0.47;

  // ---------------------------------------------------------------- positions
  /** Sets px, py to pad i's floating position now (bob and drift, the wobble's lift). */
  function floatPos(i: number): void {
    const s = seed[i]!;
    px = homeX[i]! + Math.sin(time * 0.5 + s) * params.drift * u;
    py = homeY[i]! + Math.sin(time * 1.3 + s * 1.7) * 5 * u;
    const w = wobT[i]!;
    if (w < WOBBLE) py -= Math.sin(clamp01(w / WOBBLE) * Math.PI) * 26 * u;
    if (kind[i] !== WORD) py += (1 - easeOutCubic(appearT[i]! / APPEAR)) * 24 * u;
  }
  const hitW = (i: number): number => Math.max(96, padW(i) * floatK);
  const hitH = (): number => Math.max(96, padH * floatK + 16);
  /** A pad the child can press now: floating and fully risen. */
  const pressable = (i: number): boolean => i >= 0 && i < nPads && state[i] === FLOAT && (kind[i] === WORD || appearT[i]! >= APPEAR_READY);
  function padAt(x: number, y: number): number {
    for (let i = nPads - 1; i >= 0; i--) {
      if (!pressable(i)) continue;
      floatPos(i);
      if (Math.abs(x - px) <= hitW(i) / 2 && Math.abs(y - py) <= hitH() / 2) return i;
    }
    return -1;
  }
  /** The pad that comes next: the next word (any pad showing it) or the right end mark. */
  function rightPad(): number {
    if (!sentence) return -1;
    if (next < nWords) { for (let i = 0; i < nWords; i++) if (state[i] === FLOAT && text[i] === sentence.words[next]) return i; return -1; }
    for (let i = nWords; i < nPads; i++) if (state[i] === FLOAT && text[i] === sentence.end) return i;
    return -1;
  }

  // ---------------------------------------------------------------- actions
  function sparkle(x: number, y: number, n: number, spread: number): void {
    particles.burst(n, (p, k) => {
      const a = (k / n) * Math.PI * 2 + random() * 0.4, v = spread * (0.55 + random() * 0.6);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - spread * 0.25;
      p.life = 0.55 + random() * 0.35; p.size = (5 + random() * 5) * u; p.endSize = 1;
      p.gravity = 260; p.drag = 0.18; p.hue = SPARKLE_HUES[k % SPARKLE_HUES.length]!; p.saturation = 95; p.lightness = 72; p.alpha = 1;
    });
  }
  function hopTo(x: number, y: number, dur: number, height: number): void {
    hopFromX = frogX; hopFromY = frogY; hopToX = x; hopToY = y; hopT = 0; hopDur = dur; hopH = height;
  }
  function sayWord(word: string): void { if (voice.play(FROG_VOICE, wordClip(word))) sayT = 0; }

  /** Press pad i: the right one joins the row, any other wobbles and floats back. `assisted` (the demonstration) records nothing. */
  function pressPad(i: number, assisted: boolean): void {
    if (!pressable(i) || !sentence || step !== PLAY) return;
    const right = kind[i] === WORD ? next < nWords && text[i] === sentence.words[next] : next >= nWords && text[i] === sentence.end;
    if (!right) {
      wobT[i] = 0; misses++;
      play('button', 'C', 0, 0.8);
      if (help && kind[i] === WORD) sayWord(text[i]!);
      if (!assisted) lily.onAttempt?.(false);
      if (misses >= HELP_MISSES) turnHelpOn();
      return;
    }
    // Right: the pad glides to its place in the row and the frog hops onto it.
    floatPos(i);
    fromX[i] = px; fromY[i] = py; glideT[i] = 0; state[i] = MOVING;
    // Pads showing the same word ("the" twice) are interchangeable: whichever is pressed takes the next place.
    const s = next; slot[i] = s;
    if (kind[i] === WORD) sayWord(text[i]!);
    play('key', 'A', keyIndexForDegree(Math.min(9, next)), 0.85);
    if (!assisted) { lily.onAttempt?.(true); sinceHit = 0; }
    frogSlot = s; hopTo(slotX[s]!, frogAtY(), HOP + 0.06, 50 * u);
    next++;
    if (focus === i) focus = nearestPad(px, py, i);
  }
  function turnHelpOn(): void { struggled = true; help = true; }
  function nearestPad(x: number, y: number, except: number): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nPads; i++) {
      if (i === except || !pressable(i)) continue;
      floatPos(i);
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ---------------------------------------------------------------- update
  function updatePads(dt: number): void {
    for (let i = 0; i < nPads; i++) {
      wobT[i] = wobT[i]! + dt;
      if (state[i] === MOVING) {
        glideT[i] = glideT[i]! + dt;
        if (glideT[i]! >= GLIDE) { state[i] = PLACED; padLandT[i] = 0; landed(i); }
      } else if (state[i] === PLACED) { padLandT[i] = padLandT[i]! + dt;
      } else if (kind[i] !== WORD && state[i] !== HIDDEN) appearT[i] = appearT[i]! + dt;
    }
  }
  function landed(i: number): void {
    play('pop', 'B', next, 0.5);
    if (kind[i] !== WORD) {
      // The sentence is whole: the other mark sinks away and the reading begins.
      for (let j = nWords; j < nPads; j++) if (j !== i) state[j] = HIDDEN;
      play('pop-big', 'A', 5, 0.7);
      sparkle(slotX[nWords]!, rowY, 18, 240 * u);
      step = BACK; stepT = 0; focus = -1; hand.mode = 0;
      return;
    }
    if (next >= nWords) {
      // Every word is in its place: the two end marks rise from the water.
      let anyFloating = false;
      for (let j = 0; j < nWords; j++) if (state[j] === FLOAT || state[j] === MOVING) anyFloating = true;
      if (!anyFloating) for (let j = nWords; j < nPads; j++) if (state[j] === HIDDEN) { state[j] = FLOAT; appearT[j] = 0; play('whoosh', 'A', 0, 0.3); }
    }
  }
  function updateFrog(dt: number): void {
    hopT += dt; landT += dt;
    if (hopT < hopDur) {
      const k = clamp01(hopT / hopDur);
      frogX = lerp(hopFromX, hopToX, easeInOutSine(k)); frogY = lerp(hopFromY, hopToY, k) - Math.sin(k * Math.PI) * hopH;
      if (hopT + dt >= hopDur) landT = -dt;
    } else if (hopT < hopDur + 1) { frogX = hopToX; frogY = hopToY; }
  }
  function updateSteps(dt: number): void {
    if (step === PLAY) return;
    stepT += dt;
    if (step === BACK) {
      if (stepT >= BACK_DELAY && hopT >= hopDur + 0.15 && frogSlot >= 0) { frogSlot = -1; hopTo(startX, frogAtY(), BACK_HOP, 110 * u); }
      if (frogSlot < 0 && hopT >= hopDur + 0.12) { step = READ; stepT = 0; startReading(); }
    } else if (step === READ) {
      updateReading(dt);
    } else if (step === ACT) {
      actT += dt;
      if (actT >= ACT_SECONDS && actT - dt < ACT_SECONDS) { play('go', 'A', 0, 0.7); sparkle(frogX, frogY - frogS * 0.5, 24, 320 * u); }
      if (actT >= ACT_SECONDS + DONE_AFTER) { step = DONE; finished = true; }
    }
  }
  function startReading(): void {
    clipStarted = false; readT = 0; readWait = 0; lit = -1;
    // Played on the shared voice channel; with the sound off (or no clip) the words light at an even pace.
    if (!voice.play(FROG_VOICE, clip)) readWait = READ_WAIT;
  }
  /** Word i's start in seconds; the measured table when there is one, else an even pace. */
  const onset = (i: number): number => (onsets.length === nWords + 1 ? onsets[i]! : 0.1 + i * EVEN_WORD);
  function updateReading(dt: number): void {
    if (voice.current === clip) { clipStarted = true; readT = voice.elapsed(); }
    else if (clipStarted || readWait >= READ_WAIT) readT += dt;
    else { readWait += dt; return; }
    // Light the word being said; the end mark lights as the voice finishes.
    let want = -1;
    for (let i = 0; i < nWords; i++) if (readT >= onset(i)) want = i;
    if (readT >= onset(nWords) - 0.05) want = nWords;
    if (want > lit) {
      for (let w = lit + 1; w <= want; w++) { litAt[w] = time; litLog.push({ word: w, at: Math.round(readT * 100) / 100 }); }
      lit = want;
      const dur = want < nWords ? Math.min(0.28, Math.max(0.16, onset(want + 1) - onset(want) - 0.04)) : 0.28;
      frogSlot = want; hopTo(slotX[want]!, frogAtY(), dur, 34 * u);
    }
    if (lit >= nWords && readT >= onset(nWords) + READ_TAIL) { step = ACT; stepT = 0; actT = 0; play('whoosh', 'A', 0, 0.4); }
  }

  function updateHand(dt: number): void {
    if (step !== PLAY) { hand.mode = 0; return; }
    if (!hand.mode) {
      if (intro && !demoDone && time >= DEMO_AT) startHand(HAND_DEMO);
      else if ((!intro || demoDone) && idleT >= HINT_IDLE) { startHand(HAND_HINT); idleT = 0; }
      return;
    }
    hand.t += dt;
    if (!pressable(hand.pad) && !(hand.mode === HAND_DEMO && hand.t >= DEMO_PRESS)) {
      const r = rightPad();
      if (r < 0 || !pressable(r)) { if (hand.mode !== HAND_DEMO) hand.mode = 0; return; }
      hand.pad = r;
    }
    if (hand.pad >= 0 && state[hand.pad] === FLOAT) { floatPos(hand.pad); hand.x = px; hand.y = py; }
    if (hand.mode === HAND_DEMO) {
      if (hand.t >= DEMO_PRESS && !demoDone) { demoDone = true; pressPad(hand.pad, true); }
      if (hand.t >= DEMO_PRESS + DEMO_FADE) { hand.mode = HAND_TAP; hand.t = 0; hand.pad = rightPad(); if (hand.pad < 0) hand.mode = 0; }
    } else if (hand.mode === HAND_HINT && hand.t >= HINT_SECONDS) hand.mode = 0;
  }
  function startHand(m: number): void {
    const pad = rightPad(); if (pad < 0 || !pressable(pad)) return;
    floatPos(pad);
    hand.mode = m; hand.t = 0; hand.pad = pad; hand.x = px; hand.y = py;
  }

  function update(dt: number): void {
    time += dt; idleT += dt; sayT += dt; pokeT += dt;
    if (step === PLAY && !(intro && !demoDone)) {
      sinceHit += dt;
      if (sinceHit >= HELP_PAUSE) turnHelpOn();
    }
    updatePads(dt); updateFrog(dt); updateSteps(dt); updateHand(dt);
    if (keyMode && !pressable(focus) && step === PLAY) focus = nearestPad(focus >= 0 ? homeX[focus]! : W / 2, focus >= 0 ? homeY[focus]! : floatTop, -1);
    particles.update(dt);
  }

  // ---------------------------------------------------------------- render
  function drawPicture(ctx: CanvasRenderingContext2D): void {
    if (panel) ctx.drawImage(panel, picX, picY, picW, picH);
    if (!sentence) return;
    const P = picH, t = actT;
    let wx = whoX, wy = whoY, wsx = 1, wsy = 1, wrot = 0;
    let tx = whatX, ty = whatY, tsx = 1, tsy = 1, trot = whatTurn;
    const land = (since: number): number => (since >= 0 && since < 0.3 ? Math.exp(-9 * since) * Math.cos(since * 22) : 0);
    if (t >= 0) {
      if (mode === BY || mode === ON || mode === IN) {
        // Out to the side, then back in with a big hop, landing squashed.
        if (t < 0.5) { const k = easeOutCubic(t / 0.5); wx = lerp(whoX, sideX, k); wy = lerp(whoY, sideY, k) - Math.sin(k * Math.PI) * P * 0.22; }
        else if (t < 0.65) { wx = sideX; wy = sideY; }
        else if (t < 1.25) { const k = easeInOutSine((t - 0.65) / 0.6); wx = lerp(sideX, whoX, k); wy = lerp(sideY, whoY, k) - Math.sin(k * Math.PI) * P * (mode === BY ? 0.16 : 0.42); }
        const l = land(t - 1.25) + land(t - 0.5) * 0.6; wsx = 1 + 0.14 * l; wsy = 1 - 0.14 * l;
        if (mode === BY && t >= 0.5 && t < 1.25) wrot = Math.sin(t * 18) * 0.06;
      } else if (mode === UNDER) {
        const up = t < 0.4 ? easeOutCubic(t / 0.4) : t < 1.0 ? 1 : 1 - easeInCubic((t - 1.0) / 0.25);
        ty = whatY - up * P * 0.32; trot = -0.14 * up;
        const l = land(t - 1.25); tsx = 1 + 0.12 * l; tsy = 1 - 0.12 * l;
        if (t > 0.4 && t < 1.0) wrot = Math.sin((t - 0.4) * 20) * 0.12;
      } else if (mode === WEAR) {
        // The hat (or cap) jumps off and spins back onto the head.
        const k = clamp01((t - 0.1) / 0.8);
        ty = whatY - Math.sin(k * Math.PI) * P * 0.34; trot = k < 1 ? Math.sin(k * Math.PI * 2) * 0.5 : 0;
        const l = land(t - 0.9); wsx = 1 + 0.12 * l; wsy = 1 - 0.12 * l;
      } else {
        // Alone or holding something: two happy hops (a van or jet drives off and back).
        if (mode === ALONE && (who === 'van' || who === 'jet')) {
          const k = clamp01(t / 1.4); wx = whoX + Math.sin(k * Math.PI * 2) * P * 0.3; wrot = (who === 'jet' ? -0.18 : -0.05) * Math.sin(k * Math.PI * 2);
          if (who === 'jet') wy = whoY - Math.sin(k * Math.PI) * P * 0.12;
        } else {
          const h = Math.abs(Math.sin(clamp01(t / 1.3) * Math.PI * 2));
          wy = whoY - h * P * 0.16; if (mode === HOLD) ty = whatY - h * P * 0.16;
          const l = land(t - 0.65) + land(t - 1.3); wsx = 1 + 0.12 * l; wsy = 1 - 0.12 * l;
        }
      }
    } else if (pokeT < 0.5) {
      // A press on the picture: the main character does a small hop.
      const k = pokeT / 0.5; wy = whoY - Math.sin(k * Math.PI) * P * 0.08;
    }
    const whoName = sceneSprite(who), whatName = what ? sceneSprite(what) : '';
    if (mode === UNDER) {
      drawSprite(ctx, sprites, whoName, wx, wy, whoS, wrot, wsx, wsy);
      drawSprite(ctx, sprites, whatName, tx, ty, whatS, trot, tsx, tsy);
    } else if (mode === IN) {
      // The container, then what is in it, then the container's front again (below its rim) so the inside shows.
      drawSprite(ctx, sprites, whatName, tx, ty, whatS, trot);
      drawSprite(ctx, sprites, whoName, wx, wy, whoS, wrot, wsx, wsy);
      ctx.save(); ctx.beginPath(); ctx.rect(picX, rimY, picW, picY + picH - rimY); ctx.clip();
      drawSprite(ctx, sprites, whatName, tx, ty, whatS, trot);
      ctx.restore();
    } else if (mode === ON || mode === BY) {
      if (what) drawSprite(ctx, sprites, whatName, tx, ty, whatS, trot, tsx, tsy);
      drawSprite(ctx, sprites, whoName, wx, wy, whoS, wrot, wsx, wsy);
    } else {
      drawSprite(ctx, sprites, whoName, wx, wy, whoS, wrot, wsx, wsy);
      if (what) drawSprite(ctx, sprites, whatName, tx, ty, whatS, trot, tsx, tsy);
    }
  }

  function drawPad(ctx: CanvasRenderingContext2D, a: WordArt, x: number, y: number, k: number, rot: number, alpha: number): void {
    const w = a.w * k, h = a.h * k;
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(a.canvas, -w / 2, -h / 2, w, h); ctx.restore(); }
    else ctx.drawImage(a.canvas, x - w / 2, y - h / 2, w, h);
    if (alpha < 1) ctx.globalAlpha = 1;
  }
  function drawRow(ctx: CanvasRenderingContext2D): void {
    if (blank) drawPad(ctx, blank, startX, rowY, rowK, 0, 1);
    // Empty slots show faintly, so the row shows how many words the sentence has.
    for (let s = 0; s <= nWords; s++) {
      let filled = false;
      for (let i = 0; i < nPads; i++) if (slot[i] === s && state[i] === PLACED) filled = true;
      if (!filled && blank) { const k = slotW[s]! / blank.w; ctx.globalAlpha = 0.28; ctx.drawImage(blank.canvas, slotX[s]! - slotW[s]! / 2, rowY - blank.h * k / 2, slotW[s]!, blank.h * k); ctx.globalAlpha = 1; }
    }
    for (let i = 0; i < nPads; i++) {
      if (state[i] !== PLACED) continue;
      const a = rowArt[i]; if (!a) continue;
      const s = slot[i]!;
      // A pad landing in the row swells a little as it settles.
      let k = rowK * (padLandT[i]! < 0.25 ? 1 + 0.1 * Math.sin(padLandT[i]! / 0.25 * Math.PI) : 1);
      // The word being read glows and swells.
      const since = litAt[s]! >= 0 ? time - litAt[s]! : -1;
      const isLit = step >= READ && s === lit && step < ACT;
      if (isLit || (since >= 0 && since < 0.35)) {
        const p = since >= 0 && since < 0.35 ? Math.sin(clamp01(since / 0.35) * Math.PI) : 0;
        k *= 1 + 0.16 * p + (isLit ? 0.06 : 0);
        if (isLit) { ctx.beginPath(); ctx.ellipse(slotX[s]!, rowY, a.w * k * 0.56, a.h * k * 0.7, 0, 0, Math.PI * 2); ctx.fillStyle = GLOW; ctx.fill(); }
      }
      drawPad(ctx, a, slotX[s]!, rowY, k, 0, 1);
    }
  }
  function drawFloating(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < nPads; i++) {
      const a = art[i]; if (!a) continue;
      if (state[i] === FLOAT) {
        floatPos(i);
        let rot = Math.sin(time * 0.9 + seed[i]!) * 0.03;
        const w = wobT[i]!;
        if (w < WOBBLE) rot += Math.sin(w * 26) * 0.2 * (1 - w / WOBBLE);
        const appear = kind[i] === WORD ? 1 : clamp01(appearT[i]! / APPEAR), hv = padHover[i]!;
        if (hv > 0.01) {
          // Mouse hover: a soft cream ring round the pad and a slight swell.
          const w = a.w * floatK * (1 + 0.06 * hv) + 14 * u, h = a.h * floatK * (1 + 0.06 * hv) + 14 * u;
          ctx.globalAlpha = 0.5 * hv; ctx.beginPath(); ctx.ellipse(px, py, w / 2, h / 2, rot, 0, Math.PI * 2);
          ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER_RING; ctx.stroke(); ctx.globalAlpha = 1;
        }
        drawPad(ctx, a, px, py, floatK * (0.9 + 0.1 * easeOutCubic(appear)) * (1 + 0.06 * hv), rot, appear);
      } else if (state[i] === MOVING) {
        const k = easeOutCubic(glideT[i]! / GLIDE), s = slot[i]!;
        const x = lerp(fromX[i]!, slotX[s]!, k), y = lerp(fromY[i]!, rowY, k) - Math.sin(k * Math.PI) * 30 * u;
        // The wide floating pad turns into the narrower row pad on the way: both drawn at the same size, crossfading.
        const r = rowArt[i] ?? a, w = lerp(a.w * floatK, r.w * rowK, k), h = lerp(a.h * floatK, r.h * rowK, k);
        ctx.globalAlpha = 1 - k; ctx.drawImage(a.canvas, x - w / 2, y - h / 2, w, h);
        ctx.globalAlpha = k; ctx.drawImage(r.canvas, x - w / 2, y - h / 2, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }
  function drawFrogOnRow(ctx: CanvasRenderingContext2D): void {
    let sx = 1, sy = 1;
    if (landT >= 0 && landT < 0.3) { const l = Math.exp(-9 * landT) * Math.cos(landT * 22); sx += 0.14 * l; sy -= 0.14 * l; }
    if (hopT < hopDur) { const k = hopT / hopDur; sx -= 0.05 * Math.sin(k * Math.PI); sy += 0.08 * Math.sin(k * Math.PI); }
    const happy = step === ACT || step === DONE;
    ctx.save(); ctx.translate(frogX, frogY); ctx.scale(sx, sy * (1 + Math.sin(time * 2.2) * 0.012));
    drawSprite(ctx, sprites, happy ? FROG_PUFF : FROG_SIT, 0, -(FROG_FEET - 0.5) * frogS, frogS);
    ctx.restore();
  }
  function drawFocus(ctx: CanvasRenderingContext2D): void {
    const i = keyMode ? focus : -1;
    if (!pressable(i)) return;
    floatPos(i);
    const w = hitW(i) + 16, h = hitH() + 12;
    roundedRect(ctx, px - w / 2, py - h / 2, w, h, 26);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  function drawHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.mode) return;
    const img = sprites.get(HAND); if (!img) return;
    const hs = Math.round(130 * u), hw = hs * img.naturalWidth / img.naturalHeight, t = hand.t;
    // The fingertip touches the top of the pad from above, so the word stays in view.
    const atY = hand.y - padH * floatK * 0.25;
    let x = hand.x, y = atY, alpha = hand.mode === HAND_HINT ? 0.8 : 1, press = 1;
    if (hand.mode === HAND_DEMO) {
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
    ctx.save(); ctx.translate(x, y); ctx.rotate(HAND_TURN);
    drawSprite(ctx, sprites, HAND, hw * 0.42, hs * 0.44, hs, 0, press, press);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  function render(ctx: CanvasRenderingContext2D): void {
    drawPicture(ctx);
    if (picHover > 0.01) {
      // Mouse hover: a soft cream frame round the picture.
      ctx.globalAlpha = 0.5 * picHover; roundedRect(ctx, picX - 6 * u, picY - 6 * u, picW + 12 * u, picH + 12 * u, 22 * u);
      ctx.lineWidth = 6 * u; ctx.strokeStyle = HOVER_RING; ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawRow(ctx);
    drawFloating(ctx);
    drawFrogOnRow(ctx);
    particles.render(ctx);
    drawFocus(ctx);
    drawHand(ctx);
  }
  function drawPadFrog(ctx: CanvasRenderingContext2D, x: number, bottom: number, size: number, happy: number): void {
    const cy = bottom - size * 0.27, fs = size * 0.62, feet = cy - size * 0.06;
    drawSprite(ctx, sprites, PAD, x, cy, size);
    let lift = 0, sx = 1, sy = 1;
    if (happy >= 0) { const b = Math.abs(Math.sin(happy * 3.2)); lift = b * 26 * u * size / 440; sx = 1 - 0.06 * b; sy = 1 + 0.08 * b; }
    ctx.save(); ctx.translate(x, feet - lift); ctx.scale(sx, sy);
    drawSprite(ctx, sprites, happy >= 0 ? FROG_PUFF : FROG_SIT, 0, -(FROG_FEET - 0.5) * fs, fs);
    ctx.restore();
  }

  // ---------------------------------------------------------------- input
  const demoRunning = (): boolean => intro && !demoDone;
  function interruptHand(): void { if (hand.mode === HAND_TAP || hand.mode === HAND_HINT) hand.mode = 0; }
  function pointerDown(x: number, y: number): void {
    pointerX = x; pointerY = y; idleT = 0; keyMode = false;
    if (demoRunning() || step !== PLAY) return;
    interruptHand();
    const i = padAt(x, y);
    if (i >= 0) { pressPad(i, false); return; }
    if (x >= picX && x <= picX + picW && y >= picY && y <= picY + picH) { if (pokeT > 0.5) { pokeT = 0; play('button', 'A', 2, 0.5); } return; }
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
  const onPicture = (x: number, y: number): boolean => x >= picX && x <= picX + picW && y >= picY && y <= picY + picH;
  function hoverAt(x: number, y: number): CursorHover {
    if (demoRunning() || step !== PLAY) return null;
    return padAt(x, y) >= 0 || onPicture(x, y) ? 'press' : null;
  }
  function hover(dt: number, x: number, y: number): void {
    const live = x >= 0 && !demoRunning() && step === PLAY, p = live ? padAt(x, y) : -1, pic = live && p < 0 && onPicture(x, y);
    for (let i = 0; i < MAX_PADS; i++) padHover[i] = approach(padHover[i]!, i === p ? 1 : 0, 14, dt);
    picHover = approach(picHover, pic ? 1 : 0, 14, dt);
  }
  function moveFocus(code: string, shift: boolean): void {
    if (!pressable(focus)) { focus = nearestPad(W / 2, floatTop, -1); return; }
    if (code === 'Tab') {
      for (let s = 1; s <= nPads; s++) { const j = (focus + (shift ? -s : s) + nPads * 2) % nPads; if (pressable(j)) { focus = j; return; } }
      return;
    }
    const dx = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0, dy = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
    floatPos(focus); const fx = px, fy = py;
    let best = -1, score = Infinity;
    for (let j = 0; j < nPads; j++) {
      if (j === focus || !pressable(j)) continue;
      floatPos(j);
      const x = px - fx, y = py - fy, along = x * dx + y * dy;
      if (along <= 1) continue;
      const v = along + Math.abs(x * dy - y * dx) * 2;
      if (v < score) { score = v; best = j; }
    }
    if (best < 0) for (let s = 1; s <= nPads; s++) { const j = (focus + (dx + dy > 0 ? s : -s) + nPads * 2) % nPads; if (pressable(j)) { best = j; break; } }
    if (best >= 0) focus = best;
  }
  function key(code: string, shift: boolean): void {
    idleT = 0;
    if (demoRunning() || step !== PLAY) return;
    interruptHand();
    const nav = code === 'Tab' || code.startsWith('Arrow');
    if (!keyMode) {
      // The first key shows which pad has focus; it acts only from the next key.
      keyMode = true;
      if (!pressable(focus)) focus = nearestPad(W / 2, floatTop, -1);
      if (nav) moveFocus(code, shift);
      return;
    }
    if (nav) { moveFocus(code, shift); return; }
    const now = performance.now();
    if (now < keyAfter) return;
    keyAfter = now + KEY_GAP_MS;
    if (!pressable(focus)) { focus = nearestPad(W / 2, floatTop, -1); return; }
    pressPad(focus, false);
  }

  const padInfo = (): PadInfo[] => {
    const out: PadInfo[] = [];
    for (let i = 0; i < nPads; i++) {
      floatPos(i);
      out.push({
        text: text[i]!, kind: kind[i] === WORD ? 'word' : kind[i] === STOP ? 'stop' : 'ask',
        state: state[i] === FLOAT ? 'float' : state[i] === MOVING ? 'moving' : state[i] === PLACED ? 'placed' : 'hidden',
        hit: { x: px - hitW(i) / 2, y: py - hitH() / 2, w: hitW(i), h: hitH() },
      });
    }
    return out;
  };
  const STEP_NAMES = ['play', 'back', 'read', 'act', 'done'] as const;

  const lily: LilySentences = {
    start, layout, update, render, drawPadFrog, pointerDown, pointerMove, hoverAt, hover, key,
    stop() { if (hand.mode !== HAND_DEMO) hand.mode = 0; pointerX = -1; },
    get done() { return finished; },
    get target() { return ''; },
    result: () => ({ misses, help, struggled }),
    stats: {
      get sentence() { return sentence ? sentence.words.join(' ') : ''; }, get end() { return sentence?.end ?? ''; }, get index() { return plan?.index ?? -1; },
      get pads() { return padInfo(); }, get next() { return next; }, get step() { return STEP_NAMES[step]!; }, get lit() { return lit; },
      get litLog() { return litLog.slice(); }, get clipStarted() { return clipStarted; },
      get focus() { return keyMode ? focus : -1; }, get keyMode() { return keyMode; }, get help() { return help; }, get hand() { return hand.mode; },
      get misses() { return misses; }, get frog() { return { x: frogX, y: frogY }; },
      get picture() { return { x: picX, y: picY, w: picW, h: picH }; }, get act() { return actT; },
    },
  };
  return lily;
}
