/**
 * Frog Pond: a reading game on a pond. The pond shows one spot per activity (with a single activity the game would go
 * straight into it). Rounds come in sets of three: each round's star lands and the next round starts by itself, and the
 * set ends like every round game: stars, the shared sticker offer, then a still rest screen with Again and Home.
 *
 * This file is the shell: background, corner buttons, the activity chooser, the round end and the save bag. The
 * activities live in rhyme.ts (Rhyme snack), pot.ts (Word fountain) and sentences.ts (Lily-pad sentences).
 */
import { rewards, type AppServices } from '../../app/services';
import { STICKERS, stickerSpriteName } from '../../app/stickers';
import { createAdaptiveTier, type Tier } from '../../engine/difficulty';
import { createParticleSystem } from '../../engine/particles';
import type { CursorHover, Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfxStep, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { chunkyCircle, drawSprite, OUTLINE } from '../../ui/draw';
import { confettiBurst, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { drawEnterFade } from '../../ui/motion';
import { BOOK_GLIDE, BOOK_ICON_PATH, createStickerOffers, leaveAlpha, leaveDrop, onBook, PICK_FLY, PICK_LIFT, PICK_SECONDS, placeBook } from '../../ui/sticker-offer';
import { approach, clamp01, easeOutCubic, lerp } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { ACTIVITY_IDS, defaultData, GAME_ID, sanitizeFrogPondData, SET_ROUNDS, toTier, type ActivityId, type FrogPondData, type PendingRound } from './data';
import { createRhymeSnack, FROG_SIT, HOVER_RING, PAD, RHYME_ART, type BugInfo } from './rhyme';
import { planRhyme, tierParams } from './rhyme-rules';
import { planSentence, sentenceTier } from './sentence-rules';
import { createLilySentences, SENTENCE_ART, WORD_PAD, type LilySentences } from './sentences';
import { preloadFrogVoice, stopFrogVoice } from './voice';
import { createWordPot, FOUNTAIN, POT_ART, type WordPot } from './pot';
import { planPot, potParams } from './pot-rules';

export { GAME_ID };
const BG = 'frog-pond/pond';
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home';
const FANFARE: SfxOptions = { variant: 'D' };
const CELEBRATION_SECONDS = 4.2, STAR_START = 0.5;
/** Between rounds of a set: the round's star lands, then the next round of the same activity starts by itself. */
const BETWEEN_SECONDS = 1.6;
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350;
const IDLE_WAIT_MS = 500;
const IDLE_OPTIONS: IdleRequestOptions = { timeout: IDLE_WAIT_MS };
/** The introduction's family: the first word family on the owner's list. */
const INTRO_RIME = 'AT';

type Phase = 'pond' | 'play' | 'between' | 'celebration' | 'choice' | 'sticker' | 'rest';

export interface FrogPondStats {
  readonly phase: Phase; readonly activity: ActivityId; readonly tier: Tier; readonly liveTier: Tier; readonly rounds: number; readonly setDone: number;
  readonly intro: boolean; readonly target: string; readonly help: boolean; readonly stars: number;
  readonly stickerId: string; readonly choiceIds: readonly string[];
  readonly bugs: readonly BugInfo[]; readonly focus: number; readonly keyMode: boolean; readonly hand: number; readonly tongue: number;
  readonly catches: number; readonly dodges: number; readonly tune: readonly number[];
  readonly frog: { x: number; y: number; w: number; h: number };
  /** Word fountain's bubbles, swimmers and state (while it is the activity). */
  readonly pot: WordPot['stats'];
  readonly targets: readonly { kind: string; x: number; y: number; w: number; h: number }[];
  readonly workMean: number; readonly workMax: number; readonly workP95: number;
  resetWork(): void;
  /** Lily-pad sentences' play state (pads, reading, picture). */
  readonly sentences: LilySentences['stats'];
}
export interface FrogPondScene extends Scene { readonly stats: FrogPondStats }

const spriteName = (path: string): string => path.replace(/\.\w+$/, '');
function artList(): { name: string; path: string }[] {
  const paths = [`${BG}.webp`, ...[...new Set([...RHYME_ART, ...POT_ART, ...SENTENCE_ART])].map(n => `${n}.webp`), `${BUTTON_PLAY}.png`, `${BUTTON_HOME}.png`, BOOK_ICON_PATH];
  return [...paths.map(path => ({ name: spriteName(path), path })), ...STICKERS.filter(s => s.game === GAME_ID).map(s => ({ name: stickerSpriteName(s.id), path: s.path }))];
}
export async function loadFrogPondArt(services: AppServices): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(artList().map(({ name, path }) => services.sprites.load(name, services.art(path)).catch(() => { missing.push(path); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}

let debugApplied = false;

export function createFrogPondScene(services: AppServices): FrogPondScene {
  const { sprites, audio, input } = services;
  const random = (): number => services.random();
  const particles = createParticleSystem(120);
  const soundButton = createSoundButton(services);
  const snack = createRhymeSnack(services);
  const adaptive = createAdaptiveTier({ windowSize: 10, minAttempts: 6, cooldownAttempts: 4, promoteAccuracy: 0.85, demoteAccuracy: 0.5 });
  snack.onAttempt = hit => { if (!intro && services.debug.tier === undefined) adaptive.record({ hit }); };
  const pot = createWordPot(services);
  // Word fountain keeps its own hidden tier: making compound words is a different skill from hearing rhymes.
  const potAdaptive = createAdaptiveTier({ windowSize: 10, minAttempts: 6, cooldownAttempts: 4, promoteAccuracy: 0.85, demoteAccuracy: 0.5 });
  pot.onAttempt = hit => { if (!intro && services.debug.tier === undefined) potAdaptive.record({ hit }); };
  // Every word made joins the pond at once, so a reload mid-round keeps it.
  pot.onMade = word => { if (!data.pot.made.includes(word)) { data.pot.made.push(word); services.save.save(); } };
  // Lily-pad sentences keeps its own hidden tier, so a reader strong at rhymes still starts on short sentences.
  const lily = createLilySentences(services);
  const sentAdaptive = createAdaptiveTier({ windowSize: 10, minAttempts: 6, cooldownAttempts: 4, promoteAccuracy: 0.85, demoteAccuracy: 0.5 });
  lily.onAttempt = hit => { if (!intro && services.debug.tier === undefined) sentAdaptive.record({ hit }); };
  const work = new Float32Array(240), workSorted = new Float32Array(240);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  let data: FrogPondData = defaultData();
  let W = 1366, H = 768, u = 1, artRatio = 0;
  let bgCanvas: HTMLCanvasElement | undefined, bgX = 0, bgY = 0;
  let phase: Phase = 'play', activity: ActivityId = 'rhyme', tier: Tier = 0, intro = false;
  let time = 0, sceneT = 0, phaseT = 0, stars = SET_ROUNDS, starsPlayed = 0;
  let pending: PendingRound | null = null, roundRime = '';
  let menuSelected = -1, inputAfter = 0, focusAt = 0, cornerFocus = -1, pondFocus = -1;
  let workHead = 0, workCount = 0, updateMs = 0;
  let fanfareStarted = false, fanfareAsked = false, idleHandle = 0, idleWaitFrom = -1, restWarmed = false;
  let starY = 0, starR = 0, cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306;
  let choiceSize = 0, choiceY = 0, restSize = 0, restY = 0, controlsY = 0, controlsRadius = 60, spotR = 90;
  const offers = createStickerOffers(sprites), bookAt = new Float32Array(2);
  let bookH = 150, bookGlide = false;
  /** Mouse hover on the corner Home, eased 0 to 1 (the activities ease their own objects). */
  let homeHover = 0;
  const stickerNames = new Map(STICKERS.map(s => [s.id, stickerSpriteName(s.id)]));
  const forcePond = services.debug.enabled && new URLSearchParams(location.search).has('pond');
  const debugSentence = services.debug.enabled ? Number(new URLSearchParams(location.search).get('sentence') ?? -1) : -1;

  const play = (name: SfxName, variant: SfxVariant, index = 0, volume = 1): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  const playable = (): boolean => phase === 'play';
  const current = (): typeof snack | WordPot | LilySentences => (activity === 'pot' ? pot : activity === 'sentences' ? lily : snack);

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number): void {
    const resized = width !== W || height !== H;
    W = width; H = height;
    const reratio = sprites.pixelRatio !== artRatio;
    artRatio = sprites.pixelRatio;
    u = Math.min(1.405, Math.max(0.45, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    const cornerU = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * cornerU, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    snack.layout(W, H, u, cornerY + cornerRadius + 10, artRatio);
    pot.layout(W, H, u, cornerY + cornerRadius + 10, artRatio);
    lily.layout(W, H, u, cornerY + cornerRadius + 10, artRatio);
    const headerScale = Math.min(1.25, Math.max(0.6, Math.min(W / 1366, H / 768)));
    starR = 34 * headerScale; starY = 70 * headerScale;
    choiceSize = Math.round(Math.max(110, Math.min(300 * Math.min(1.25, H / 768), (W - 60) / 2)));
    choiceY = H * 0.56;
    controlsRadius = Math.max(48, Math.min(Math.max(48 * services.config.uiScale, 62 * u), W / 5));
    controlsY = H - controlsRadius - 22;
    restSize = Math.round(Math.max(110, Math.min(300 * Math.min(1.25, H / 768), controlsY - controlsRadius - starY - starR - 40)));
    restY = (starY + starR + controlsY - controlsRadius) / 2;
    bookH = Math.round(Math.max(72, Math.min(200, choiceSize * 0.45)));
    spotR = Math.max(60, Math.min(120 * u, W / 8));
    if (resized || reratio || !bgCanvas) { sprites.clearScaled(BG); bgCanvas = undefined; restWarmed = false; }
  }
  function ensureBackground(): void {
    if (bgCanvas) return;
    const image = sprites.get(BG); if (!image) return;
    // The background may finish loading after the last layout: fit it to the window now, never at a stale scale.
    const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
    bgX = (W - image.naturalWidth * scale) / 2; bgY = (H - image.naturalHeight * scale) / 2;
    bgCanvas = sprites.scaled(BG, scale);
  }

  // ---------------------------------------------------------------- rounds
  const showPond = (): boolean => ACTIVITY_IDS.length > 1 || forcePond;
  function openPond(): void {
    phase = 'pond'; phaseT = 0; pondFocus = -1; guard(PLAY_GUARD_MS); cornerFocus = -1;
  }
  function startRound(): void {
    pending = null; data.pending = null; bookGlide = false;
    const potRound = activity === 'pot', sentences = activity === 'sentences', bag = data.sentences;
    tier = services.debug.tier ?? toTier(potRound ? data.pot.tier : sentences ? bag.tier : data.tier);
    // Only a changed tier resets the attempt window; resetting it every round would stop the tier ever moving.
    const tracker = potRound ? potAdaptive : sentences ? sentAdaptive : adaptive;
    if (tracker.tier !== tier) tracker.setTier(tier);
    // data.rounds counts every activity; Rhyme snack's own rounds are those the other activities did not play.
    intro = potRound ? data.pot.rounds === 0 : sentences ? bag.rounds === 0 : data.rounds - data.pot.rounds - bag.rounds <= 0;
    phase = 'play'; phaseT = time = 0; stars = SET_ROUNDS; starsPlayed = 0; cornerFocus = -1;
    particles.clear();
    if (potRound) {
      roundRime = '';
      pot.start(planPot(potParams(tier, intro), data.pot.made, data.pot.last, random), tier, intro, data.pot.assist === 1, data.pot.made);
    } else if (sentences) {
      const plan = planSentence(sentenceTier(tier, intro), bag.last, random, intro, debugSentence);
      lily.start(plan, tier, intro, bag.assist === 1);
    } else {
      const plan = planRhyme(tierParams(tier, intro), data.lastRime, random, intro ? INTRO_RIME : undefined);
      roundRime = plan.rime;
      snack.start(plan, tier, intro, data.assist === 1);
    }
    layout(W, H);
    guard(PLAY_GUARD_MS); services.save.flush();
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
    stars = SET_ROUNDS;
    if (activity === 'pot') {
      const result = pot.result();
      if (!intro && services.debug.tier === undefined) data.pot.tier = potAdaptive.tier;
      // Word help: on after a round with several bonks or a long pause, off after a round with no bonk at all.
      data.pot.assist = result.struggled ? 1 : result.bonks === 0 ? 0 : data.pot.assist;
      data.pot.rounds++; data.pot.last = pot.stats.words.slice();
    } else if (activity === 'sentences') {
      const result = lily.result(), bag = data.sentences;
      if (!intro && services.debug.tier === undefined) bag.tier = sentAdaptive.tier;
      // Word help: on after a round with several out-of-order presses or a long pause, off after a round with none.
      bag.assist = result.struggled ? 1 : result.misses === 0 ? 0 : bag.assist;
      bag.last = lily.stats.index + 1; bag.rounds++;
    } else {
      const result = snack.result();
      if (!intro && services.debug.tier === undefined) data.tier = adaptive.tier;
      // Word help: on after a round with several dodges or a long pause, off after a round with no dodge at all.
      data.assist = result.struggled ? 1 : result.dodges === 0 ? 0 : data.assist;
    }
    if (roundRime) data.lastRime = roundRime;
    data.rounds++;
    // Every round earns its star at once, so leaving mid-set loses nothing; the set's count is saved too.
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars++;
    if (++data.setDone < SET_ROUNDS) {
      services.save.flush();
      phase = 'between'; phaseT = 0; starsPlayed = 0; cornerFocus = -1;
      return;
    }
    data.setDone = 0;
    const id = globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    pending = { id, activity, stars, choices: chooseOffers(), chosen: '', rewardEnabled: services.config.rewardsEnabled, restEntered: false, target: current().target };
    data.pending = pending;
    services.save.flush();
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; cornerFocus = -1;
    particles.clear();
    play('fanfare', FANFARE.variant!);
    confettiBurst(particles, W / 2, H * 0.4, 70, 380 * u);
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
    if (replay) { play('whoosh', 'A'); if (showPond()) openPond(); else startRound(); } else { play('button', 'B'); services.nav.toHub(); }
  }
  function exitToHub(): void { closeFinishedRound(); stopFrogVoice(audio); services.save.flush(); services.nav.toHub(); }
  function guard(ms: number): void { inputAfter = performance.now() + ms; menuSelected = -1; }

  // ---------------------------------------------------------------- idle preparation
  /** Idle periods with at least 4 ms left render the fanfare a step at a time, so the round's end builds no notes. */
  function prepareIdle(deadline: IdleDeadline): void {
    idleHandle = 0;
    const overdue = deadline.didTimeout || (idleWaitFrom >= 0 && performance.now() - idleWaitFrom >= IDLE_WAIT_MS);
    while (!fanfareAsked && (overdue || deadline.timeRemaining() >= 4)) {
      idleWaitFrom = -1;
      if (prepareSfxStep(audio, 'fanfare', FANFARE)) { fanfareAsked = true; break; }
      if (overdue) break;
    }
  }
  function askIdle(): void {
    if (idleHandle || !fanfareStarted || fanfareAsked) return;
    const now = performance.now();
    if (idleWaitFrom < 0) idleWaitFrom = now;
    IDLE_OPTIONS.timeout = Math.max(1, IDLE_WAIT_MS - (now - idleWaitFrom));
    idleHandle = requestIdleCallback(prepareIdle, IDLE_OPTIONS);
  }
  function stopIdle(): void { if (idleHandle) cancelIdleCallback(idleHandle); idleHandle = 0; idleWaitFrom = -1; }

  // ---------------------------------------------------------------- update
  function updateResult(dt: number): void {
    phaseT += dt; time += dt;
    if (phase === 'between') {
      // The finished round stays on screen and keeps moving while its star lands.
      current().update(dt);
      if (!starsPlayed && phaseT >= STAR_HIT_SECONDS) { play('star', 'B', data.setDone - 1); starsPlayed = 1; }
      if (phaseT >= BETWEEN_SECONDS) startRound();
      return;
    }
    if (phase === 'celebration') {
      const shown = Math.min(stars, Math.max(0, Math.floor((phaseT - STAR_START - STAR_HIT_SECONDS) / STAR_GAP_SECONDS) + 1));
      if (shown > starsPlayed) { play('star', 'B', starsPlayed); starsPlayed = shown; }
      if (phaseT >= CELEBRATION_SECONDS) finishCelebration();
    } else if (phase === 'sticker' && phaseT >= PICK_SECONDS) enterRest();
    if (phase === 'celebration' || phase === 'choice' || phase === 'sticker') warmOffers();
    offers.update(dt, phase === 'choice' ? menuSelected : -1);
  }

  // ---------------------------------------------------------------- render
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  const controlX = (i: number, choice: boolean): number => {
    const n = choice ? pending?.choices.length ?? 0 : 2;
    return W / 2 + (i - (n - 1) / 2) * (choice ? choiceSize + Math.max(24, choiceSize * 0.18) : controlsRadius * 3.2);
  };
  /** Rest-screen frog: the pad's height (about 0.53 of its image) fits the rest size. */
  const restFrogK = (): number => restSize / 380;
  /** The activity's own picture for the celebration and the rest screen: the frog on its pad, or the fountain with a word's picture. */
  function drawHero(ctx: CanvasRenderingContext2D, x: number, bottom: number, rest: boolean, happy: number, t: number): void {
    if (activity === 'pot') pot.drawFountain(ctx, x, bottom, rest ? restSize : Math.round(Math.min(H * 0.72, 560 * u)), happy, t, pending?.target ?? pot.target);
    else if (activity === 'sentences') lily.drawPadFrog(ctx, x, bottom, padWidth() * (rest ? restFrogK() : 1), happy);
    else snack.drawFrog(ctx, x, bottom, rest ? restFrogK() : 1, happy, t);
  }
  /** Rhyme snack's lily pad width, for the frog Lily-pad sentences shows at the round's end. */
  const padWidth = (): number => Math.round(Math.min(440 * u, W * 0.5, H * 0.62));
  function gift(ctx: CanvasRenderingContext2D, index: number, id: string, x: number, y: number, size: number, focused: boolean, alpha = 1, sticker = true): void {
    if (focused) {
      ctx.beginPath(); ctx.ellipse(x, y, size * 0.55 + 8, size * 0.55 + 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
    }
    if (alpha < 1) ctx.globalAlpha = alpha;
    // A lily pad under each offer, as if the stickers float on the pond.
    drawSprite(ctx, sprites, PAD, x, y + size * 0.3, size * 1.15);
    ctx.globalAlpha = 1;
    if (sticker) offers.drawOffer(ctx, index, stickerNames.get(id) ?? '', x, y - size * 0.04, Math.round(size * 0.78), 1, alpha);
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
    if (phase === 'between') {
      // The set's stars so far; the newest slams in (the gap between stars is longer than a slam, so the others have landed).
      current().render(ctx);
      // Lily-pad sentences' picture card fills the top middle, so its stars sit in the open water below the pads.
      drawStarRow(ctx, W / 2, activity === 'sentences' ? H * 0.72 : starY, starR, data.setDone, phaseT + (data.setDone - 1) * STAR_GAP_SECONDS, time);
      return;
    }
    const starT = phase === 'celebration' ? phaseT - STAR_START : 99;
    if (phase === 'celebration') {
      drawHero(ctx, W / 2, H - 10, false, phaseT, time);
      // Prepare the rest screen's smaller picture once, invisibly, while the celebration is still busy.
      if (!restWarmed && phaseT > 1) { ctx.globalAlpha = 0.01; drawHero(ctx, W / 2, H / 2, true, 0, 0); ctx.globalAlpha = 1; restWarmed = true; }
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
        offers.drawFlight(ctx, phaseT, name, controlX(index, true), choiceY - choiceSize * 0.04, Math.round(choiceSize * 0.78), bookAt[0]!, bookAt[1]!, bookH);
      } else {
        const k = bookGlide ? easeOutCubic(clamp01(phaseT / BOOK_GLIDE)) : 1;
        offers.drawBook(ctx, lerp(bookAt[0]!, W / 2, k), lerp(bookAt[1]!, restY, k), lerp(bookH, restSize, k), name, 9, restSize);
      }
    } else {
      // Rewards off or the set complete: the frog on its pad with the round's word, never a made-up collectible.
      drawHero(ctx, W / 2, restY + restSize * 0.5, true, -1, 0);
    }
    if (phase !== 'rest') return;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i, false); chunkyCircle(ctx, x, controlsY, controlsRadius, '#a8d58f', OUTLINE, 5 * u);
      drawSprite(ctx, sprites, i === 0 ? BUTTON_PLAY : BUTTON_HOME, x, controlsY, Math.round(controlsRadius * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsRadius);
    }
  }
  const spotX = (i: number): number => W / 2 + (i - (ACTIVITY_IDS.length - 1) / 2) * spotR * 2.8;
  const spotY = (): number => H * 0.55;
  function renderPond(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < ACTIVITY_IDS.length; i++) {
      const x = spotX(i), y = spotY() + Math.sin(time * 1.6 + i * 1.5) * 4 * u;
      if (ACTIVITY_IDS[i] === 'pot') {
        // Word fountain's spot: the fountain, wobbling gently.
        drawSprite(ctx, sprites, FOUNTAIN, x, y, spotR * 2.1, 0, 1 + Math.sin(time * 2.6) * 0.02, 1 - Math.sin(time * 2.6) * 0.02);
      } else if (ACTIVITY_IDS[i] === 'sentences') {
        // Lily-pad sentences' spot: a row of three word pads bobbing in turn, a small frog on the first.
        for (let k = 0; k < 3; k++) drawSprite(ctx, sprites, WORD_PAD, x + (k - 1) * spotR * 0.7, y + spotR * (0.45 - k * 0.16) + Math.sin(time * 2.2 + k) * 3 * u, spotR * 1.3);
        drawSprite(ctx, sprites, FROG_SIT, x - spotR * 0.7, y - spotR * 0.05, spotR * 1.05);
      } else {
        // Rhyme snack's spot: the frog on a lily pad.
        drawSprite(ctx, sprites, PAD, x, y + spotR * 0.45, spotR * 2.4);
        drawSprite(ctx, sprites, FROG_SIT, x, y - spotR * 0.15, spotR * 1.5);
      }
      if (pondFocus === i) focusRing(ctx, x, y, spotR);
    }
  }
  function drawCorners(ctx: CanvasRenderingContext2D): void {
    // Mouse hover: a slight swell and a soft cream ring; the icon keeps its baked size and scales by transform.
    const hs = 1 + homeHover * 0.08, hr = cornerRadius * hs;
    if (homeHover > 0.01) {
      ctx.globalAlpha = 0.45 * homeHover; ctx.beginPath(); ctx.arc(homeX, cornerY, hr + 7, 0, Math.PI * 2);
      ctx.lineWidth = 6; ctx.strokeStyle = HOVER_RING; ctx.stroke(); ctx.globalAlpha = 1;
    }
    chunkyCircle(ctx, homeX, cornerY, hr, '#a8d58f', OUTLINE, 4);
    drawSprite(ctx, sprites, BUTTON_HOME, homeX, cornerY, Math.round(cornerRadius * 1.3), 0, hs, hs);
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
  const spotAt = (x: number, y: number): number => {
    for (let i = 0; i < ACTIVITY_IDS.length; i++) if (Math.hypot(x - spotX(i), y - spotY()) <= spotR) return i;
    return -1;
  };
  // ---------------------------------------------------------------- hover
  const onHome = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius;
  /** What a press at x, y would do now, with the same gates as handleInput's pointerdown. */
  function hoverAt(x: number, y: number): CursorHover {
    if (soundButton.contains(x, y)) return null;
    if (onHome(x, y)) return 'press';
    if (phase === 'celebration') return celebrationLocked() ? null : 'press';
    if (performance.now() < inputAfter) return null;
    if (playable()) return current().hoverAt(x, y);
    if (phase === 'pond') return spotAt(x, y) >= 0 ? 'press' : null;
    if (phase === 'choice' || phase === 'rest') return hoverMenu(x, y) >= 0 ? 'press' : null;
    return null;
  }
  /** Ease the hover looks toward the mouse: the activity's objects and the corner Home. Pond spots, offers, Again and
   * Home already show their focus ring on pointermove. */
  function updateHover(dt: number): void {
    const pt = input.pointer, mouse = pt.inside && pt.type === 'mouse' && !soundButton.contains(pt.x, pt.y);
    const home = mouse && onHome(pt.x, pt.y), live = mouse && !home && playable() && performance.now() >= inputAfter;
    if (playable()) current().hover(dt, live ? pt.x : -1, pt.y);
    homeHover = approach(homeHover, home ? 1 : 0, 14, dt);
  }
  function openActivity(i: number): void {
    if (i < 0 || i >= ACTIVITY_IDS.length) return;
    activity = ACTIVITY_IDS[i]!; play('go', 'A', 0, 0.8); startRound();
  }

  // ---------------------------------------------------------------- stats
  const stats: FrogPondStats = {
    get phase() { return phase; }, get activity() { return activity; }, get tier() { return tier; }, get liveTier() { return adaptive.tier; },
    get rounds() { return data.rounds; }, get setDone() { return data.setDone; }, get intro() { return intro; }, get target() { return current().target; }, get help() { return current().stats.help; },
    get stars() { return stars; }, get stickerId() { return pending?.chosen ?? ''; }, get choiceIds() { return pending?.choices ?? []; },
    get bugs() { return playable() ? snack.stats.bugs : []; }, get focus() { return snack.stats.focus; }, get keyMode() { return snack.stats.keyMode; },
    get hand() { return snack.stats.hand; }, get tongue() { return snack.stats.tongue; }, get catches() { return snack.stats.catches; },
    get dodges() { return snack.stats.dodges; }, get tune() { return snack.stats.tune; }, get frog() { return snack.stats.frog; }, get pot() { return pot.stats; },
    get targets() {
      const out: { kind: string; x: number; y: number; w: number; h: number }[] = [];
      if (phase === 'pond') for (let i = 0; i < ACTIVITY_IDS.length; i++) out.push({ kind: `spot:${ACTIVITY_IDS[i]}`, x: spotX(i) - spotR, y: spotY() - spotR, w: spotR * 2, h: spotR * 2 });
      if (phase === 'play' && activity === 'sentences') for (const p of lily.stats.pads) if (p.state === 'float') out.push({ kind: `pad:${p.text}`, ...p.hit });
      if (phase === 'choice' && pending) for (let i = 0; i < pending.choices.length; i++) out.push({ kind: `sticker:${pending.choices[i]}`, x: controlX(i, true) - choiceSize / 2, y: choiceY - choiceSize / 2, w: choiceSize, h: choiceSize });
      if (phase === 'rest') for (let i = 0; i < 2; i++) out.push({ kind: i === 0 ? 'again' : 'home', x: controlX(i, false) - controlsRadius, y: controlsY - controlsRadius, w: controlsRadius * 2, h: controlsRadius * 2 });
      out.push({ kind: 'corner-home', x: homeX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      out.push({ kind: 'corner-sound', x: soundX - cornerRadius, y: cornerY - cornerRadius, w: cornerRadius * 2, h: cornerRadius * 2 });
      return out;
    },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    get workP95() {
      if (!workCount) return 0;
      workSorted.set(work.subarray(0, workCount)); const s = workSorted.subarray(0, workCount).sort();
      return s[Math.max(0, Math.ceil(workCount * 0.95) - 1)]!;
    },
    resetWork() { workHead = workCount = 0; },
    get sentences() { return lily.stats; },
  };

  function applyDebug(): void {
    if (!services.debug.enabled || debugApplied) return;
    debugApplied = true;
    const params = new URLSearchParams(location.search), rounds = Number(params.get('rounds')), help = params.get('help');
    if (params.has('rounds') && Number.isSafeInteger(rounds) && rounds >= 0) {
      // Each activity gets that many rounds of its own (data.rounds counts all three), so rounds=0 replays every introduction.
      data.rounds = rounds * 3; data.pot.rounds = rounds; data.sentences.rounds = rounds; data.pending = null;
    }
    // made=N fills Word fountain's pond with the first N collection words (a big collection, for frame timing; 37 adds the retired ones).
    const made = Number(params.get('made'));
    if (params.has('made') && Number.isSafeInteger(made) && made >= 0) data.pot.made = POT_ART.slice(1, 1 + made).map(n => n.slice(n.lastIndexOf('/cw-') + 4));
    if (help === '0' || help === '1') { data.assist = Number(help); data.pot.assist = Number(help); data.sentences.assist = Number(help); }
  }

  return {
    stats,
    hoverAt,
    enter() {
      void loadFrogPondArt(services).then(() => layout(services.canvas.width, services.canvas.height));
      preloadFrogVoice(audio);
      data = services.save.gameData<FrogPondData>(GAME_ID, defaultData());
      sanitizeFrogPondData(data, () => services.save.protect());
      applyDebug();
      if (!(services.debug.enabled && new URLSearchParams(location.search).has('rounds'))) data.rounds = Math.max(data.rounds, rewards(services).rounds[GAME_ID] ?? 0);
      sceneT = 0; bookGlide = false; startMusic(audio, 'frog-pond');
      layout(services.canvas.width, services.canvas.height);
      if (data.pending) {
        pending = data.pending; stars = pending.stars; activity = pending.activity; intro = false;
        if (activity === 'rhyme') snack.start({ rime: '', target: pending.target, words: [], rhymes: 0 }, toTier(data.tier), false, false);
        layout(services.canvas.width, services.canvas.height);
        if (pending.choices.length && !pending.chosen && pending.rewardEnabled && services.config.rewardsEnabled) { phase = 'choice'; phaseT = 0; guard(MENU_GUARD_MS); }
        else enterRest();
      } else if (showPond()) openPond();
      else startRound();
      if (services.debug.enabled) (window as unknown as { __frogPond?: FrogPondStats }).__frogPond = stats;
    },
    pause() {
      stopMusic(audio); stopIdle(); stopFrogVoice(audio); snack.stop(); pot.stop(); lily.stop();
      services.save.flush();
    },
    resume() {
      guard(phase === 'choice' || phase === 'rest' ? MENU_GUARD_MS : PLAY_GUARD_MS); cornerFocus = -1;
      startMusic(audio, 'frog-pond');
    },
    exit() {
      stopMusic(audio); stopIdle(); stopFrogVoice(audio); snack.stop(); pot.stop(); lily.stop(); offers.cancel(); closeFinishedRound(); services.save.flush();
      sprites.clearScaled(BG); bgCanvas = undefined;
    },
    resize: layout,
    update(dt) {
      const started = performance.now(); sceneT += dt;
      syncSoundIcon(soundButton, services); soundButton.update(dt, input.pointer.x, input.pointer.y);
      if (playable()) { time += dt; const act = current(); act.update(dt); if (act.done) finishRound(); }
      else if (phase === 'pond') { time += dt; phaseT += dt; }
      else updateResult(dt);
      updateHover(dt);
      askIdle(); particles.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H || sprites.pixelRatio !== artRatio) layout(view.width, view.height);
      ensureBackground();
      if (bgCanvas) ctx.drawImage(bgCanvas, bgX, bgY, bgCanvas.width / sprites.pixelRatio, bgCanvas.height / sprites.pixelRatio);
      else { ctx.fillStyle = '#34c6e8'; ctx.fillRect(0, 0, W, H); }
      if (playable()) current().render(ctx);
      else if (phase === 'pond') renderPond(ctx);
      else renderResult(ctx);
      drawCorners(ctx); drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'pointerup' || event.type === 'keyup') { soundButton.pointerUp(soundX, cornerY); return; }
      const now = performance.now();
      if (event.type === 'pointermove') {
        if (playable()) current().pointerMove(event.info.x, event.info.y);
        else if (phase === 'pond') { const i = spotAt(event.info.x, event.info.y); if (i >= 0) pondFocus = i; }
        else if ((phase === 'choice' || phase === 'rest') && now >= inputAfter) { const index = hoverMenu(event.info.x, event.info.y); if (index >= 0) { if (menuSelected < 0) focusAt = now; menuSelected = index; } }
        return;
      }
      if (event.type !== 'pointerdown' && event.type !== 'anykey') return;
      if (event.type === 'pointerdown') {
        if (soundButton.pointerDown(event.info.x, event.info.y)) return;
        if (Math.hypot(event.info.x - homeX, event.info.y - cornerY) <= cornerRadius) { exitToHub(); return; }
        cornerFocus = -1;
      } else if (!playable() && phase !== 'pond') {
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
      if (playable()) {
        if (event.type === 'pointerdown') current().pointerDown(event.info.x, event.info.y);
        else current().key(event.info.code, input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight'));
        return;
      }
      if (phase === 'pond') {
        if (event.type === 'pointerdown') { openActivity(spotAt(event.info.x, event.info.y)); return; }
        const code = event.info.code, n = ACTIVITY_IDS.length;
        if (pondFocus < 0) { pondFocus = 0; focusAt = now; return; }
        if (code.startsWith('Arrow') || code === 'Tab') { pondFocus = (pondFocus + (code === 'ArrowLeft' || code === 'ArrowUp' ? n - 1 : 1)) % n; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
        openActivity(pondFocus);
        return;
      }
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
