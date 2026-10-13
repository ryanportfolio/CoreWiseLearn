/**
 * Pencil Path: a glass marble waits on a push pin. The child draws lines on the page, presses Go, and the marble rolls
 * along them; the page is done when it lands in the paper cup. Less pencil earns more stars, and every finished page
 * earns at least one. There is no failing: a marble that touches ink, rolls off the page or stops pops back onto its
 * pin, and after two of those the pencil shows a way (as it does on any page the child has not finished yet).
 *
 * Twelve pages in levels.ts, physics in physics.ts (fixed step, so a drawing always does the same thing), drawing in
 * paint.ts. Keyboard: any key asks the pencil to draw its line for you, the next presses Go; Backspace undoes a line.
 * A quick press (under 0.3 s, under 24 px) starts a line that follows the pointer with no button held, and the next
 * press ends it.
 */
import { rewards, type AppServices } from '../../app/services';
import { voicePlayer } from '../../audio/voice-player';
import { createParticleSystem } from '../../engine/particles';
import type { CursorHover, Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, prepareSfx, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { createButton, dispatchDown, dispatchUp, type Button } from '../../ui/button';
import { confettiBurst, drawStarRow, STAR_GAP_SECONDS, STAR_HIT_SECONDS } from '../../ui/celebrate';
import { chunkyCircle, drawSprite, OUTLINE } from '../../ui/draw';
import { drawEnterFade } from '../../ui/motion';
import { approach } from '../../ui/tween';
import { createSoundButton, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { defaultData, GAME_ID, PAGE_COUNT, sanitizePencilPathData, type PencilPathData } from './data';
import { LEVELS } from './levels';
import { createPainter, pointAlong } from './paint';
import { inRect, inkLength, Sim, starsFor, tidyStroke, type Kind, type Level, type P2 } from './physics';
import { AGAIN_CLIPS, PENCIL_VOICE, START_CLIP, WATCH_CLIPS } from './voice';

export { GAME_ID };
const BUTTON_PLAY = 'buttons/play-arrow', BUTTON_HOME = 'buttons/home', BUTTON_UNDO = 'buttons/backspace';
const FANFARE: SfxOptions = { variant: 'C' };
const CELEBRATION_SECONDS = 4.2, STAR_START = 0.5;
const MENU_GUARD_MS = 1200, FOCUS_HOLD_MS = 250, PLAY_GUARD_MS = 350;
/** One stroke of the pencil's demonstration: draw, lift, glide back. */
const DEMO_STROKE_SECONDS = 3.2;
/** Seconds the page waits, untouched, before the pencil shows a way on its own. */
const IDLE_DEMO_SECONDS = 10;
const BACK_SECONDS = 0.9;
const TAP_MS = 300, TAP_PX = 24;

type Phase = 'play' | 'run' | 'back' | 'celebration' | 'rest';

export interface PencilPathStats {
  readonly phase: Phase; readonly page: number; readonly strokes: readonly (readonly P2[])[]; readonly ink: number;
  readonly misses: number; readonly demo: boolean; readonly guided: boolean; readonly stars: number;
  readonly outcome: string; readonly marble: { x: number; y: number };
  readonly targets: readonly { kind: string; x: number; y: number; w: number; h: number }[];
  readonly view: { s: number; ox: number; oy: number };
  load(page: number): void; draw(strokes: P2[][]): void; go(): void;
  readonly workMean: number; readonly workMax: number; resetWork(): void;
}
export interface PencilPathScene extends Scene { readonly stats: PencilPathStats }

export async function loadPencilPathArt(services: AppServices): Promise<string[]> {
  const missing: string[] = [];
  const names = [BUTTON_PLAY, BUTTON_HOME, BUTTON_UNDO];
  await Promise.all(names.map(name => services.sprites.load(name, services.art(`${name}.webp`)).catch(() => { missing.push(name); })));
  await Promise.all(soundArt(services).map(({ name, url }) => services.sprites.load(name, url).catch(() => { missing.push(name); })));
  return missing;
}

export function createPencilPathScene(services: AppServices): PencilPathScene {
  const { sprites, audio, input } = services;
  const voice = voicePlayer(audio);
  const painter = createPainter();
  const particles = createParticleSystem(160);
  const soundButton = createSoundButton(services);
  const sfx: SfxOptions = { index: 0, volume: 1, variant: 'A' };
  const work = new Float32Array(240);
  const tmp: P2 = [0, 0], tip: P2 = [0, 0];

  let data: PencilPathData = defaultData();
  let W = 1366, H = 768, ratio = 0;
  let phase: Phase = 'play', page = 0, level: Level = LEVELS[0]!;
  let strokes: P2[][] = [];
  let drawing: P2[] | null = null, carry = false, downAt = 0, downX = 0, downY = 0, havePrev = false;
  const prev: P2 = [0, 0];
  let sim: Sim | null = null, tackOut = 0, backT = 0, misses = 0, lastOutcome = '';
  let demoFrom = -1, demoAdopt = false, guided = false, idleT = 0;
  let stars = 1, sceneT = 0, time = 0, phaseT = 0, starsPlayed = 0, zoneFlash = 0;
  let menuSelected = -1, inputAfter = 0, focusAt = 0, cornerFocus = -1, keyMode = false, homeHover = 0;
  let cornerRadius = 48, cornerY = 60, homeX = 60, soundX = 1306, controlsY = 600, controlsRadius = 60;
  let meterX = 0, meterW = 0, meterY = 60, pageTop = 132, scratchAt = 0, tickAt = 0, hitAt = 0, voiceAt = -99, restEntered = false, invited = false;
  let workHead = 0, workCount = 0, updateMs = 0;

  const play = (name: SfxName, variant: SfxVariant, volume = 1, index = 0): void => {
    sfx.index = index; sfx.volume = volume; sfx.variant = variant; playSfx(audio, name, sfx);
  };
  const say = (clips: readonly string[]): boolean => {
    voiceAt = time;
    return voice.play(PENCIL_VOICE, clips[Math.floor(services.random() * clips.length)]!);
  };

  const goButton: Button = createButton({ x: 0, y: 0, radius: 56, fill: '#ffd166', icon: BUTTON_PLAY, onPress: () => go() });
  const undoButton: Button = createButton({ x: 0, y: 0, radius: 48, fill: '#ffb4a2', icon: BUTTON_UNDO, onPress: () => undo() });
  const buttons = [goButton, undoButton, soundButton];

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number): void {
    W = width; H = height; ratio = services.canvas.dpr;
    const u = Math.min(1.5, Math.max(0.4, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    cornerRadius = Math.max(48, Math.min(60 * u, W / 8, H / 6));
    homeX = cornerRadius + 12; soundX = W - cornerRadius - 12; cornerY = cornerRadius + 12;
    soundButton.x = soundX; soundButton.y = cornerY; soundButton.radius = cornerRadius;
    goButton.radius = Math.max(48, cornerRadius * 1.05);
    undoButton.radius = Math.max(48, cornerRadius * 0.9);
    // Go and Undo sit between the corner buttons; a window too narrow for that puts them on a row of their own
    // below, so every control keeps its own 96 px target.
    const undoLeft = W / 2 - goButton.radius - 22 - undoButton.radius * 2;
    const ownRow = undoLeft < homeX + cornerRadius + 12 || W / 2 + goButton.radius > soundX - cornerRadius - 12;
    const rowY = ownRow ? cornerY + cornerRadius + 14 + goButton.radius : cornerY;
    goButton.y = undoButton.y = rowY;
    // on its own row the pair is centred; between the corners Go is centred and Undo sits to its left
    goButton.x = ownRow ? W / 2 + undoButton.radius + 11 : W / 2;
    undoButton.x = goButton.x - goButton.radius - undoButton.radius - 22;
    meterX = goButton.x + goButton.radius + 24;
    meterW = Math.max(0, Math.min(300, (ownRow ? W - 12 : soundX - cornerRadius - 24) - meterX));
    meterY = rowY;
    const top = ownRow ? rowY + goButton.radius + 14 : cornerY + cornerRadius + 14;
    controlsRadius = Math.max(48, Math.min(62 * u, W / 5));
    controlsY = H - controlsRadius - 22;
    pageTop = top;
    painter.layout(W, H, top, ratio);
    painter.bake(level);
  }

  // ---------------------------------------------------------------- pages
  function openPage(i: number): void {
    page = ((i % PAGE_COUNT) + PAGE_COUNT) % PAGE_COUNT;
    level = LEVELS[page]!;
    strokes = []; drawing = null; carry = false; sim = null; tackOut = 0; misses = 0; lastOutcome = '';
    demoFrom = -1; demoAdopt = false; guided = false; idleT = 0; restEntered = false;
    phase = 'play'; phaseT = 0; cornerFocus = -1; menuSelected = -1;
    particles.clear();
    painter.bake(level);
    guard(PLAY_GUARD_MS);
    // A page not yet finished starts with the pencil showing a way, after the narrator's invitation.
    if (!(data.best[page]! > 0)) startDemo(false, 1.4);
    // The invitation is said once a visit, on page 1. Sound off or locked leaves it for the next time page 1 opens.
    if (page === 0 && !invited) invited = say([START_CLIP]);
    if (audio.context) prepareSfx(audio, 'fanfare', FANFARE);
  }
  function startDemo(adopt: boolean, delay = 0): void {
    if (!level.solution.length) return;
    demoFrom = time + delay; demoAdopt = adopt; guided = true;
    if (delay === 0) say(WATCH_CLIPS);
  }
  function demoOn(): boolean { return demoFrom >= 0; }
  function finishDemo(): void {
    if (demoAdopt) {
      // The keyboard player asked the pencil to draw: its line becomes the drawing, ready for Go.
      strokes = level.solution.map(s => s.map((p): P2 => [p[0], p[1]]));
    }
    demoFrom = -1; demoAdopt = false;
  }
  const inkUsed = (): number => inkLength(strokes);
  const inkLeft = (): number => Math.max(0, level.ink - inkUsed());

  // ---------------------------------------------------------------- drawing
  const zoneAt = (x: number, y: number): boolean => (level.noDraw ?? []).some(z => inRect(x, y, z, 0.15));
  function beginStroke(px: number, py: number): void {
    if (demoOn() && !demoAdopt) demoFrom = -1;
    if (demoAdopt) return;
    idleT = 0;
    drawing = []; strokes.push(drawing); havePrev = false;
    addPoint(px, py);
  }
  /** Walks the pointer's path every 0.25 cm, so a fast drag cannot hop over a no-pencil box. */
  function addPoint(px: number, py: number): void {
    if (!drawing) return;
    painter.toLevel(px, py, tmp);
    const fx = havePrev ? prev[0] : tmp[0], fy = havePrev ? prev[1] : tmp[1];
    const tx = tmp[0], ty = tmp[1];
    prev[0] = tx; prev[1] = ty; havePrev = true;
    const n = Math.max(1, Math.ceil(Math.hypot(tx - fx, ty - fy) / 0.25));
    for (let k = 1; k <= n; k++) addSample(fx + ((tx - fx) * k) / n, fy + ((ty - fy) * k) / n);
  }
  function addSample(x: number, y: number): void {
    if (!drawing) return;
    const last = drawing[drawing.length - 1];
    if (zoneAt(x, y)) {
      // the pencil lifts at the box's edge and starts a new line when it leaves
      zoneFlash = 1;
      if (drawing.length) { drawing = []; strokes.push(drawing); }
      return;
    }
    if (last && Math.hypot(x - last[0], y - last[1]) < 0.3) return;
    let px = x, py = y;
    if (last) {
      const d = Math.hypot(x - last[0], y - last[1]), left = inkLeft();
      if (left <= 0.02) return;
      if (d > left) { px = last[0] + ((x - last[0]) * left) / d; py = last[1] + ((y - last[1]) * left) / d; }
      if (time - scratchAt > 0.16) { scratchAt = time; play('paper-rustle', 'A', 0.35); }
    }
    drawing.push([px, py]);
  }
  function endStroke(): void {
    if (drawing && drawing.length > 2) {
      const i = strokes.indexOf(drawing);
      if (i >= 0) strokes[i] = tidyStroke(level, drawing);
    }
    drawing = null; carry = false;
    strokes = strokes.filter(s => s.length > 0);
  }
  function undo(): void {
    if (phase !== 'play') return;
    endStroke();
    if (!strokes.length) return;
    strokes.pop(); play('backspace', 'A');
  }

  // ---------------------------------------------------------------- run
  function go(): void {
    void audio.unlock();
    if (phase === 'run') { toPin(false); return; }
    if (phase !== 'play') return;
    endStroke();
    if (demoAdopt) return;
    if (demoOn()) demoFrom = -1;
    sim = new Sim(level, strokes);
    phase = 'run'; phaseT = 0; tackOut = 0; tickAt = 0;
    play('go', 'A');
    if (audio.context) prepareSfx(audio, 'fanfare', FANFARE);
  }
  /** The marble goes back to its pin; lines stay. A miss only brings the pencil's help closer. */
  function toPin(miss: boolean): void {
    if (miss) {
      misses++;
      if (misses === 2 || misses % 4 === 0) startDemo(false, 1);
      else if (time - voiceAt > 6) say(AGAIN_CLIPS);
    }
    sim = null; phase = 'play'; phaseT = 0; tackOut = 0; idleT = 0;
    play('pop', 'B', 0.7);
  }
  function finishRound(): void {
    if (!sim) return;
    stars = starsFor(level, inkUsed());
    while (data.best.length <= page) data.best.push(0);
    data.best[page] = Math.max(data.best[page] ?? 0, stars);
    data.rounds++;
    data.page = (page + 1) % PAGE_COUNT;
    // Award before showing: the round counts at once, so leaving mid-celebration loses nothing.
    const bag = rewards(services); bag.rounds[GAME_ID] = (bag.rounds[GAME_ID] ?? 0) + 1;
    if (services.config.rewardsEnabled) bag.stars++;
    services.save.flush();
    phase = 'celebration'; phaseT = 0; starsPlayed = 0; cornerFocus = -1; restEntered = false;
    play('fanfare', FANFARE.variant!);
    confettiBurst(particles, painter.ox + level.cup.x * painter.s, painter.oy + (level.cup.y - level.cup.h) * painter.s, 60, 360);
  }
  const celebrationLocked = (): boolean => phaseT < Math.max(1.5, STAR_START + (stars - 1) * STAR_GAP_SECONDS + STAR_HIT_SECONDS);
  function enterRest(): void {
    phase = 'rest'; phaseT = 0; guard(MENU_GUARD_MS); particles.clear();
    if (!restEntered) { restEntered = true; services.save.flush(); services.roundBoundary(); }
  }
  function leave(again: boolean): void {
    if (phase !== 'rest') return;
    if (again) { play('whoosh', 'A'); openPage(data.page); } else exitToHub();
  }
  function exitToHub(): void { voice.stop(); services.save.flush(); services.nav.toHub(); }
  function guard(ms: number): void { inputAfter = performance.now() + ms; menuSelected = -1; }

  function splash(x: number, y: number, ink: boolean): void {
    const px = painter.ox + x * painter.s, py = painter.oy + y * painter.s, s = painter.s;
    particles.burst(ink ? 14 : 8, (spec, i) => {
      const a = (i / 14) * Math.PI * 2 + services.random() * 0.5, v = s * (3 + services.random() * 6);
      spec.x = px; spec.y = py; spec.vx = Math.cos(a) * v; spec.vy = Math.sin(a) * v - s * 4;
      spec.life = 0.6 + services.random() * 0.4; spec.size = s * (ink ? 0.25 : 0.18); spec.endSize = s * 0.05;
      spec.gravity = s * 30; spec.drag = 0.5;
      spec.hue = ink ? 230 : 215; spec.saturation = ink ? 35 : 80; spec.lightness = ink ? 18 : 70; spec.alpha = 0.9;
    });
  }
  function sound(kind: Kind, speed: number): void {
    if (time - hitAt < 0.06) return;
    hitAt = time;
    const v = Math.min(1, 0.25 + speed / 140);
    if (kind === 'pad') play('pop-big', 'A', v); else play('tick', kind === 'ruler' ? 'B' : kind === 'cup' ? 'C' : 'A', v);
  }

  // ---------------------------------------------------------------- update
  function update(dt: number): void {
    time += dt; phaseT += dt;
    zoneFlash = Math.max(0, zoneFlash - dt * 2.5);
    if (phase === 'play') {
      if (drawing && !carry && !input.pointer.down) endStroke(); // focus lost without a pointerup
      if (demoOn() && time >= demoFrom) {
        if (time - demoFrom < dt * 1.5 && !demoAdopt && time - voiceAt > 2) say(WATCH_CLIPS);
        if (time - demoFrom >= level.solution.length * DEMO_STROKE_SECONDS) finishDemo();
      }
      if (!demoOn() && !drawing && !strokes.length) { idleT += dt; if (idleT > IDLE_DEMO_SECONDS) { idleT = 0; startDemo(false); } }
    } else if (phase === 'run' && sim) {
      sim.advance(dt);
      tackOut = Math.min(1, tackOut + dt * 4);
      if (sim.hitKind) { sound(sim.hitKind, sim.hitSpeed); sim.hitKind = null; sim.hitSpeed = 0; }
      if (sim.rolled - tickAt > 2.5) { tickAt = sim.rolled; play('tick', 'D', 0.18); }
      if (sim.outcome !== 'running') {
        lastOutcome = sim.outcome;
        if (sim.outcome === 'win') finishRound();
        else {
          if (sim.outcome === 'blot') { splash(sim.x, sim.y, true); play('miss', 'A', 0.6); }
          else if (sim.outcome === 'lost') play('whoosh', 'B', 0.6);
          else play('miss', 'B', 0.5);
          phase = 'back'; phaseT = 0; backT = 0;
        }
      }
    } else if (phase === 'back') {
      backT += dt;
      if (backT >= BACK_SECONDS) toPin(true);
    } else if (phase === 'celebration') {
      const shown = Math.min(stars, Math.max(0, Math.floor((phaseT - STAR_START - STAR_HIT_SECONDS) / STAR_GAP_SECONDS) + 1));
      if (shown > starsPlayed) { play('star', 'B', 1, starsPlayed); starsPlayed = shown; }
      if (phaseT >= CELEBRATION_SECONDS) enterRest();
    }
    goButton.visible = undoButton.visible = phase === 'play' || phase === 'run' || phase === 'back';
    undoButton.enabled = phase === 'play' && strokes.length > 0 && !demoAdopt;
    goButton.enabled = phase === 'play' || phase === 'run';
    goButton.focused = keyMode && goButton.visible && cornerFocus < 0;
  }

  // ---------------------------------------------------------------- render
  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }
  const controlX = (i: number): number => W / 2 + (i - 0.5) * controlsRadius * 3.2;
  function renderPage(ctx: CanvasRenderingContext2D): void {
    painter.back(ctx);
    painter.begin(ctx);
    painter.zoneFlash(ctx, level, zoneFlash);
    // after the pencil has shown a way, its dashes stay faintly on the page to trace over
    if (guided && !demoOn()) for (const s of level.solution) painter.ghost(ctx, s, 1, 0.5);
    painter.strokes(ctx, strokes, 1);
    const t = sim && (phase === 'run' || phase === 'back') ? sim.t : 0;
    if (level.spinners) for (const s of level.spinners) painter.spinner(ctx, s, t);
    if (demoOn() && time >= demoFrom) renderDemo(ctx);
    painter.tack(ctx, level.start, phase === 'play' ? 0 : tackOut);
    if (phase === 'play') {
      // waiting on its pin, the marble rocks a little
      const wob = Math.sin(time * 2.1) * 0.04;
      painter.marble(ctx, level.start[0] + wob, level.start[1], wob * 3, 1, 1);
    } else if (sim) {
      const fade = phase === 'back' ? Math.max(0, 1 - backT / 0.35) : 1;
      painter.marble(ctx, sim.x, sim.y, sim.angle, 1, sim.outcome === 'blot' ? 0 : fade);
    }
    painter.end(ctx);
    painter.front(ctx);
  }
  function renderDemo(ctx: CanvasRenderingContext2D): void {
    const e = time - demoFrom, k = Math.floor(e / DEMO_STROKE_SECONDS), path = level.solution[k];
    if (!path) return;
    for (let j = 0; j < k; j++) painter.ghost(ctx, level.solution[j]!, 1, 0.8);
    const c = (e % DEMO_STROKE_SECONDS) / DEMO_STROKE_SECONDS, start = path[0]!, end = path[path.length - 1]!;
    let draw = 1, lift = 0, alpha = 1;
    if (c < 0.55) { draw = c / 0.55; pointAlong(path, draw, tip); }
    else if (c < 0.7) { tip[0] = end[0]; tip[1] = end[1]; lift = ((c - 0.55) / 0.15) * 1.2; }
    else {
      const q = (c - 0.7) / 0.3, s = q * q * (3 - 2 * q);
      tip[0] = end[0] + (start[0] - end[0]) * s; tip[1] = end[1] + (start[1] - end[1]) * s;
      lift = 1.2 + Math.sin(s * Math.PI) * 2.2 - s * 1.2; alpha = Math.max(0, 1 - q * 2.2);
    }
    painter.ghost(ctx, path, draw, 1);
    painter.pencil(ctx, tip[0], tip[1], lift, Math.min(1, alpha + 0.4));
  }
  function renderCorners(ctx: CanvasRenderingContext2D): void {
    const hs = 1 + homeHover * 0.08, hr = cornerRadius * hs;
    if (homeHover > 0.01) {
      ctx.globalAlpha = 0.45 * homeHover; ctx.beginPath(); ctx.arc(homeX, cornerY, hr + 7, 0, Math.PI * 2);
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff8da'; ctx.stroke(); ctx.globalAlpha = 1;
    }
    chunkyCircle(ctx, homeX, cornerY, hr, '#a8d58f', OUTLINE, 4);
    drawSprite(ctx, sprites, BUTTON_HOME, homeX, cornerY, Math.round(cornerRadius * 1.3), 0, hs, hs);
    for (const b of buttons) b.render(ctx, sprites);
    if (goButton.visible && meterW > 40) painter.meter(ctx, meterX, meterY, meterW, inkLeft() / level.ink);
    if (cornerFocus >= 0) focusRing(ctx, cornerFocus === 0 ? homeX : soundX, cornerY, cornerRadius);
  }
  function renderResult(ctx: CanvasRenderingContext2D): void {
    drawStarRow(ctx, W / 2, Math.max(cornerY, H * 0.16), Math.min(46, W * 0.05), stars, phase === 'celebration' ? phaseT - STAR_START : 99, phase === 'rest' ? 0 : time);
    if (phase !== 'rest') return;
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff8e6'; ctx.fillRect(0, controlsY - controlsRadius - 30, W, H); ctx.globalAlpha = 1;
    for (let i = 0; i < 2; i++) {
      const x = controlX(i);
      chunkyCircle(ctx, x, controlsY, controlsRadius, i === 0 ? '#ffd166' : '#a8d58f', OUTLINE, 5);
      drawSprite(ctx, sprites, i === 0 ? BUTTON_PLAY : BUTTON_HOME, x, controlsY, Math.round(controlsRadius * 1.3));
      if (menuSelected === i) focusRing(ctx, x, controlsY, controlsRadius);
    }
  }

  // ---------------------------------------------------------------- hover and hit tests
  const onHome = (x: number, y: number): boolean => Math.hypot(x - homeX, y - cornerY) <= cornerRadius;
  function onButton(x: number, y: number): boolean {
    for (const b of buttons) if (b.visible && b.contains(x, y)) return true;
    return false;
  }
  const inPage = (y: number): boolean => y > pageTop - 8;
  function hoverMenu(x: number, y: number): number {
    for (let i = 0; i < 2; i++) if (Math.hypot(x - controlX(i), y - controlsY) <= controlsRadius) return i;
    return -1;
  }
  function hoverAt(x: number, y: number): CursorHover {
    if (onButton(x, y)) return null;
    if (onHome(x, y)) return 'press';
    if (phase === 'celebration') return celebrationLocked() ? null : 'press';
    if (performance.now() < inputAfter) return null;
    if (phase === 'play') return carry ? 'carry' : inPage(y) && !demoAdopt ? 'press' : null;
    if (phase === 'run') return inPage(y) ? 'press' : null;
    if (phase === 'rest') return hoverMenu(x, y) >= 0 ? 'press' : null;
    return null;
  }

  // ---------------------------------------------------------------- stats (verification)
  const stats: PencilPathStats = {
    get phase() { return phase; }, get page() { return page; }, get strokes() { return strokes; }, get ink() { return inkUsed(); },
    get misses() { return misses; }, get demo() { return demoOn(); }, get guided() { return guided; }, get stars() { return stars; },
    get outcome() { return lastOutcome; }, get marble() { return sim ? { x: sim.x, y: sim.y } : { x: level.start[0], y: level.start[1] }; },
    get view() { return { s: painter.s, ox: painter.ox, oy: painter.oy }; },
    get targets() {
      const out: { kind: string; x: number; y: number; w: number; h: number }[] = [];
      const box = (kind: string, cx: number, cy: number, r: number): void => { out.push({ kind, x: cx - r, y: cy - r, w: r * 2, h: r * 2 }); };
      box('corner-home', homeX, cornerY, cornerRadius); box('corner-sound', soundX, cornerY, cornerRadius);
      if (goButton.visible) { box('go', goButton.x, goButton.y, goButton.radius); box('undo', undoButton.x, undoButton.y, undoButton.radius); }
      if (phase === 'rest') { box('again', controlX(0), controlsY, controlsRadius); box('home', controlX(1), controlsY, controlsRadius); }
      return out;
    },
    load(i) { openPage(i); },
    draw(s) { endStroke(); strokes = s.map(st => st.map((p): P2 => [p[0], p[1]])); demoFrom = -1; },
    go() { go(); },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    resetWork() { workHead = workCount = 0; },
  };

  return {
    stats,
    hoverAt,
    enter() {
      void loadPencilPathArt(services);
      voice.preload(PENCIL_VOICE);
      data = services.save.gameData<PencilPathData>(GAME_ID, defaultData());
      sanitizePencilPathData(data as unknown as Record<string, unknown>, () => services.save.protect());
      sceneT = 0; keyMode = false;
      layout(services.canvas.width, services.canvas.height);
      openPage(data.page);
      if (services.debug.enabled) (window as unknown as { __pencilPath?: PencilPathStats }).__pencilPath = stats;
    },
    pause() { voice.stop(); if (drawing) endStroke(); services.save.flush(); },
    resume() { guard(phase === 'rest' ? MENU_GUARD_MS : PLAY_GUARD_MS); cornerFocus = -1; },
    exit() { voice.stop(); particles.clear(); services.save.flush(); },
    resize: layout,
    update(dt) {
      const started = performance.now(); sceneT += dt;
      syncSoundIcon(soundButton, services);
      const pt = input.pointer, mx = pt.inside ? pt.x : -9999, my = pt.inside ? pt.y : -9999;
      for (const b of buttons) b.update(dt, mx, my);
      if (drawing && carry) addPoint(pt.x, pt.y);
      update(dt);
      particles.update(dt);
      homeHover = approach(homeHover, pt.inside && pt.type === 'mouse' && onHome(pt.x, pt.y) ? 1 : 0, 14, dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H || services.canvas.dpr !== ratio) layout(view.width, view.height);
      renderPage(ctx);
      particles.render(ctx);
      if (phase === 'celebration' || phase === 'rest') renderResult(ctx);
      renderCorners(ctx);
      drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      const now = performance.now();
      if (event.type === 'pointerup') {
        dispatchUp(buttons, event.info.x, event.info.y);
        if (drawing && !carry) {
          const quick = now - downAt < TAP_MS && Math.hypot(event.info.x - downX, event.info.y - downY) < TAP_PX;
          if (quick) carry = true; // a tap: the line follows the pointer until the next press
          else endStroke();
        }
        return;
      }
      if (event.type === 'keyup') { dispatchUp(buttons, -1, -1); return; }
      if (event.type === 'pointermove') {
        if (drawing) addPoint(event.info.x, event.info.y);
        else if (phase === 'rest' && now >= inputAfter) { const i = hoverMenu(event.info.x, event.info.y); if (i >= 0) { if (menuSelected < 0) focusAt = now; menuSelected = i; } }
        return;
      }
      if (event.type === 'pointerdown') {
        keyMode = false;
        const { x, y } = event.info;
        if (drawing && carry) { endStroke(); return; }
        if (onHome(x, y)) { exitToHub(); return; }
        if (dispatchDown(buttons, x, y)) return;
        cornerFocus = -1;
        if (phase === 'celebration') { if (!celebrationLocked()) enterRest(); return; }
        if (now < inputAfter) return;
        if (phase === 'play' && inPage(y)) { downAt = now; downX = x; downY = y; beginStroke(x, y); return; }
        if (phase === 'run' && inPage(y)) { toPin(false); return; }
        if (phase === 'rest') { const i = hoverMenu(x, y); if (i >= 0) leave(i === 0); }
        return;
      }
      if (event.type !== 'anykey') return;
      const code = event.info.code;
      keyMode = true;
      if (code === 'Escape') { exitToHub(); return; }
      if (code === 'Tab') { cornerFocus = (cornerFocus + 2) % 3 - 1; return; }
      if (cornerFocus >= 0) {
        if (code.startsWith('Arrow')) { cornerFocus = 1 - cornerFocus; return; }
        if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { if (cornerFocus === 0) exitToHub(); else soundButton.pointerDown(soundX, cornerY); return; }
        cornerFocus = -1;
      }
      if (phase === 'celebration') { if (!celebrationLocked()) enterRest(); return; }
      if (now < inputAfter) return;
      if (phase === 'play') {
        if (code === 'Backspace' || code === 'Delete') { undo(); return; }
        if (demoAdopt) return;
        // No line yet: the pencil draws one for you. A line on the page: Go.
        if (!strokes.length) { startDemo(true); return; }
        go();
        return;
      }
      if (phase === 'run') { toPin(false); return; }
      if (phase === 'rest') {
        if (menuSelected < 0) { menuSelected = 0; focusAt = now; return; }
        if (code.startsWith('Arrow')) { menuSelected = 1 - menuSelected; return; }
        if (now < focusAt + FOCUS_HOLD_MS) return;
        leave(menuSelected === 0);
      }
    },
  };
}
