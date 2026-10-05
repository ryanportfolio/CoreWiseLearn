/**
 * Break nudge: an overlay pushed on top of whatever is running. It dims the
 * frozen scene beneath, slides up a yawning mascot with drifting "z" and
 * stars, and after a second shows one big play button that pops the overlay.
 *
 * The scene manager renders only the top scene, so the scene beneath is
 * captured once into a snapshot on enter (and again on resize). The snapshot
 * fades into a blurred, dimmed copy, so the controls drawn in it turn into
 * soft shapes and never read as a second set of buttons beside the nudge's.
 *
 * A game can restore straight into its rest screen and reach a round
 * boundary inside its enter(), so the nudge may arrive before the scene
 * beneath has drawn a single frame (it would still be black under its enter
 * fade, with its art loading). Then the nudge lets that scene run and draw
 * live under the dim until it has been up SETTLE_SECONDS, and only then takes
 * the snapshot.
 */

import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { AppServices } from '../../app/services';
import { createKeyboardNavigation } from '../../ui/navigation';
import { createButton, dispatchDown, dispatchUp } from '../../ui/button';
import { chunkyText, OUTLINE } from '../../ui/draw';
import { starPath } from '../../ui/celebrate';
import { clamp01, easeInOutSine, easeOutBack, easeOutCubic, pulse } from '../../ui/tween';
import { createMascotMotion, drawMascotMoving, loadMascotMouths, mascotFeetY, resetMascotMotion, stepMascotMotion } from '../../ui/mascot';
import { WIBBLE, wibbleVoice } from '../../ui/wibble';
import { playSfx } from '../../audio/sfx';
import { artName, artRequest, buttonRadius, circleTarget, createSoundButton, soundArt, syncSoundIcon, loadAllArt, type LayoutTarget } from '../hub/shared';

const YAWN = 'mascot/yawn';
const PLAY = 'buttons/play-arrow';
const DIM = 0.55;
const BUTTON_DELAY = 0;
const SLIDE_SECONDS = 0.9;
const DRIFTERS = 10;
/** The dim fades in over this long. */
const DIM_SECONDS = 0.4;
/** The sharp snapshot crossfades into the blurred, pre-dimmed copy over this long. */
const SOFTEN_SECONDS = 0.4;
/** Blur of the pre-dimmed copy, in logical px: enough to turn icons into soft shapes. */
const BLUR_PX = 9;
/** One dim colour for the fade and the pre-dimmed copy, so nothing shifts when the copy takes over. */
const DIM_FILL = 'rgb(70, 47, 99)';
/**
 * How long the scene beneath must have been on screen before a still copy of
 * it looks right: past its enter fade (ENTER_FADE_SECONDS) with its art loaded.
 */
const SETTLE_SECONDS = 1;
/** A slow yawn stretch, the first one with the yawn sound on enter, then one every YAWN_EVERY seconds. */
const YAWN_SECONDS = 1.6;
const YAWN_EVERY = 6;
/**
 * Keys do nothing for this long, as on a round's reward screens, so a child
 * pressing keys steadily is not sent anywhere. The first key after it only
 * shows focus on Play; a non-arrow key acts once focus has shown this long.
 * Wall-clock milliseconds, like the reward screens, so a debug time scale
 * does not shorten them.
 */
const KEY_GUARD_MS = 1200;
const FOCUS_HOLD_MS = 250;
/** A press on the backdrop bounces Play and Home once, over this long, to show where to press. */
const BOUNCE_SECONDS = 0.45;
const BOUNCE_SCALE = 0.2;
/** Wibble's sleepy lines start this long after the nudge enters, as it finishes sliding up, with this pause between them. */
const SLEEPY_AT = 0.8;
const SLEEPY_GAP = 0.45;

/** Load (or finish loading) the nudge's art. Never rejects. */
export function loadBreakNudgeAssets(services: AppServices): Promise<void> {
  return Promise.all([
    loadAllArt(services, [artRequest(services, `${YAWN}.png`, 'blob', '#3b9bff'), artRequest(services, `${PLAY}.png`, 'play', '#ffffff'), artRequest(services, 'buttons/home.png', 'home', '#ffffff'), ...soundArt(services)]),
    loadMascotMouths(services, [YAWN]),
  ]).then(() => undefined);
}

export interface BreakNudgeLayout {
  targets: LayoutTarget[];
}

/** Pre-render a glyph sprite (a chunky "z" or a star) once. */
function makeGlyph(kind: 'z' | 'star', px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  if (kind === 'z') {
    chunkyText(ctx, 'z', px / 2, px / 2, px * 0.72, '#e9e4ff');
  } else {
    starPath(ctx, px / 2, px / 2 + px * 0.03, px * 0.4);
    ctx.fillStyle = '#ffe14d';
    ctx.fill();
    ctx.lineWidth = Math.max(4, px * 0.07);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  return c;
}

export function createBreakNudgeScene(services: AppServices): Scene {
  const { audio, input, scenes } = services;
  // The manager calls enter() after this scene is on the stack, so capture the scene beneath now.
  const below = scenes.current;
  /** Seconds the scene beneath still has to run live before the snapshot (0 when it was already seen long enough). */
  const settle = below ? Math.max(0, SETTLE_SECONDS - scenes.shownSeconds) : 0;

  let width = services.canvas.width;
  let height = services.canvas.height;
  /** The scene beneath, as drawn, and a blurred, dimmed copy that takes over from it. */
  let snapshot: HTMLCanvasElement | undefined;
  let dimmed: HTMLCanvasElement | undefined;
  /** True while the scene beneath runs and draws live (see SETTLE_SECONDS). */
  let live = false;
  /** Nudge time when the snapshot was taken; the crossfade to the blurred copy starts here. */
  let snapAt = 0;
  let time = 0;
  let dismissed = false;
  let spawnTimer = 0;
  let spawnIndex = 0;
  /** performance.now() when the nudge entered, and when the keyboard focus first showed. */
  let enteredAt = 0;
  let focusAt = 0;
  /** Seconds since a backdrop press started the buttons' bounce; negative when idle. */
  let bounce = -1;

  const voice = wibbleVoice(services);
  const motion = createMascotMotion();
  /** The sleepy lines have been started this visit. */
  let sleepyStarted = false;

  let mascotSize = 300;
  let mascotX = 0;
  let mascotY = 0;

  const zGlyph = makeGlyph('z', 96);
  const starGlyph = makeGlyph('star', 96);

  // Drifting particles in a fixed pool: x, y, age, life, phase, kind (0 = z, 1 = star).
  const dx = new Float32Array(DRIFTERS);
  const dy = new Float32Array(DRIFTERS);
  const age = new Float32Array(DRIFTERS);
  const life = new Float32Array(DRIFTERS);
  const phase = new Float32Array(DRIFTERS);
  const kind = new Uint8Array(DRIFTERS);

  const playButton = createButton({
    x: 0,
    y: 0,
    radius: 80,
    fill: '#22c55e',
    icon: artName(PLAY),
    iconScale: 0.58,
    onPress: () => dismiss(),
  });
  playButton.visible = false;
  const homeButton = createButton({ x: 0, y: 0, radius: 80, fill: '#fb923c', icon: artName('buttons/home'), onPress: () => { if (dismissed || time < 0.4) return; dismissed = true; void scenes.pop().then(() => services.nav.toHub()); } });
  const soundButton = createSoundButton(services);
  // Left to right as on a round's rest screen (Again then Home), so the nudge's pair agrees with the softened one beneath.
  const buttons = [playButton, homeButton, soundButton];
  const keyboard = createKeyboardNavigation(() => buttons, { anyKey: true, input });
  const layoutInfo: BreakNudgeLayout = { targets: [] };

  function dismiss(): void {
    if (dismissed || !playButton.visible || time < 0.4) return;
    dismissed = true;
    playSfx(audio, 'button');
    void scenes.pop();
  }

  function layout(): void {
    // The mascot art fills about 65 percent of its square, feet near 85 percent down.
    mascotSize = Math.min(height * 0.62, width * 0.5);
    mascotX = width / 2;
    mascotY = height * 0.4;
    const r = buttonRadius(height, 0.1 * services.config.uiScale, 92);
    playButton.radius = r;
    playButton.x = width / 2 - r - 18;
    playButton.y = Math.min(height - r - Math.max(16, height * 0.04), mascotY + mascotSize * 0.36 + r + 12);
    homeButton.radius = r; homeButton.x = width / 2 + r + 18; homeButton.y = playButton.y;
    // The corner place and size game scenes use for their sound button (Bubble Bay's corner layout), so
    // this one covers the softened copy beneath and only one sound control shows.
    const u = Math.min(1.5, Math.max(0.4, Math.min(width / 1366, height / 768))) * services.config.uiScale;
    const corner = Math.max(48, Math.min(60 * u, width / 8, height / 6));
    soundButton.radius = corner; soundButton.x = width - corner - 12; soundButton.y = corner + 12;
    if (import.meta.env.DEV) layoutInfo.targets = [circleTarget('home', homeButton), circleTarget('play', playButton), circleTarget('sound', soundButton)];
  }

  /** Draw the scene beneath once and keep it, plus a blurred, dimmed copy, at device resolution. */
  function takeSnapshot(): void {
    const src = services.canvas.element;
    const ctx = services.canvas.ctx;
    if (below) below.render({ ctx, width, height }, 0);
    const canvas = snapshot && snapshot.width === src.width && snapshot.height === src.height ? snapshot : document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d')?.drawImage(src, 0, 0);
    snapshot = canvas;
    const dim = dimmed && dimmed.width === src.width && dimmed.height === src.height ? dimmed : document.createElement('canvas');
    dim.width = src.width;
    dim.height = src.height;
    const dctx = dim.getContext('2d');
    if (dctx) {
      // The sharp copy first, so the blur's soft edges at the borders fade into the scene, not into black.
      dctx.drawImage(src, 0, 0);
      dctx.filter = `blur(${Math.round(BLUR_PX * (src.width / Math.max(1, width)))}px)`;
      dctx.drawImage(src, 0, 0);
      dctx.filter = 'none';
      dctx.globalAlpha = DIM;
      dctx.fillStyle = DIM_FILL;
      dctx.fillRect(0, 0, dim.width, dim.height);
      dctx.globalAlpha = 1;
    }
    dimmed = dim;
  }

  function spawnDrifter(): void {
    let slot = -1;
    for (let i = 0; i < DRIFTERS; i++) {
      if ((age[i] ?? 0) >= (life[i] ?? 0)) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return;
    spawnIndex++;
    const side = spawnIndex % 2 === 0 ? 1 : -1;
    dx[slot] = mascotX + side * mascotSize * (0.12 + Math.random() * 0.2);
    dy[slot] = mascotY - mascotSize * 0.3;
    age[slot] = 0;
    life[slot] = 3.2 + Math.random() * 1.2;
    phase[slot] = Math.random() * Math.PI * 2;
    kind[slot] = spawnIndex % 3 === 0 ? 1 : 0;
  }

  layout();
  void loadBreakNudgeAssets(services).then(() => {
    playButton.icon = artName(PLAY); homeButton.icon = artName('buttons/home');
  });

  const scene: Scene & { layout?: BreakNudgeLayout } = {
    enter() {
      width = services.canvas.width;
      height = services.canvas.height;
      layout();
      time = 0;
      snapAt = 0;
      live = settle > 0;
      if (!live) takeSnapshot();
      playButton.icon = artName(PLAY);
      dismissed = false;
      spawnTimer = 0.5;
      playButton.visible = true;
      // Nothing is focused until a key arrives after KEY_GUARD_MS.
      keyboard.focus(undefined);
      enteredAt = performance.now();
      bounce = -1;
      age.fill(0);
      life.fill(0);
      resetMascotMotion(motion);
      sleepyStarted = false;
      voice.preload(WIBBLE);
      playSfx(audio, 'yawn');
    },
    exit() {
      // Leaving the nudge (Play or Home) silences Wibble at once.
      voice.stop();
    },
    update(dt) {
      time += dt;
      if (live && below) {
        // The scene beneath has not been seen yet: let it finish its entry, then keep a still copy.
        below.update(dt);
        if (time >= settle) {
          live = false;
          takeSnapshot();
          snapAt = time;
        }
      }
      if (!playButton.visible && time >= BUTTON_DELAY) {
        playButton.visible = true;
        playButton.popIn(0);
      }
      for (const button of buttons) button.update(dt, input.pointer.inside ? input.pointer.x : -9999, input.pointer.inside ? input.pointer.y : -9999);
      syncSoundIcon(soundButton, services);
      if (bounce >= 0) { bounce += dt; if (bounce >= BOUNCE_SECONDS) bounce = -1; }
      if (!sleepyStarted && time >= SLEEPY_AT) {
        sleepyStarted = true;
        voice.sequence(WIBBLE, ['sleepy-1', 'sleepy-2'], 0, SLEEPY_GAP);
      }
      stepMascotMotion(motion, dt, voice.isSpeaking(), voice.speakingLevel());
      spawnTimer -= dt;
      if (spawnTimer <= 0 && time > SLIDE_SECONDS * 0.6) {
        spawnDrifter();
        spawnTimer = 0.75;
      }
      for (let i = 0; i < DRIFTERS; i++) {
        const a = age[i] ?? 0;
        if (a >= (life[i] ?? 0)) continue;
        age[i] = a + dt;
        dy[i] = (dy[i] ?? 0) - 34 * dt;
        dx[i] = (dx[i] ?? 0) + Math.sin(a * 1.6 + (phase[i] ?? 0)) * 22 * dt;
      }
    },
    render(view: SceneContext) {
      const { ctx } = view;
      const dim = DIM * easeOutCubic(time / DIM_SECONDS);
      if (live && below) {
        below.render(view, 0);
        ctx.globalAlpha = dim;
        ctx.fillStyle = DIM_FILL;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      } else if (snapshot && dimmed) {
        // The dim fades in over the sharp copy while the blurred, pre-dimmed copy fades in on top;
        // after that the frame is a single blit.
        const soften = easeOutCubic((time - snapAt) / SOFTEN_SECONDS);
        if (soften < 1) {
          ctx.drawImage(snapshot, 0, 0, width, height);
          ctx.globalAlpha = dim;
          ctx.fillStyle = DIM_FILL;
          ctx.fillRect(0, 0, width, height);
          ctx.globalAlpha = soften;
        }
        ctx.drawImage(dimmed, 0, 0, width, height);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#1b1f3b';
        ctx.fillRect(0, 0, width, height);
      }

      // Slides up from below, then breathes and yawns slowly: a long stretch up and a sink back,
      // the first one with the yawn sound. Drawn from its feet so the stretch grows upward.
      const slide = easeOutBack(Math.min(1, time / SLIDE_SECONDS), 1.2);
      const breathe = Math.sin(time * 1.8) * 0.02;
      const yawn = easeInOutSine(pulse(clamp01((time % YAWN_EVERY) / YAWN_SECONDS)));
      const sy = 1 + 0.07 * yawn - breathe;
      const sx = 1 - 0.04 * yawn + breathe;
      const ground = mascotY + mascotFeetY(YAWN) * mascotSize + (height - mascotY + mascotSize) * (1 - slide);
      drawMascotMoving(ctx, services.sprites, motion, artName(YAWN), YAWN, mascotX, ground, mascotSize, 0, 0, sx, sy);

      const saved = ctx.globalAlpha;
      for (let i = 0; i < DRIFTERS; i++) {
        const a = age[i] ?? 0;
        const l = life[i] ?? 0;
        if (a >= l) continue;
        const t = a / l;
        const alpha = t < 0.15 ? t / 0.15 : 1 - easeOutCubic((t - 0.15) / 0.85);
        const size = 34 + 40 * t;
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(kind[i] === 1 ? starGlyph : zGlyph, (dx[i] ?? 0) - size / 2, (dy[i] ?? 0) - size / 2, size, size);
      }
      ctx.globalAlpha = saved;

      if (bounce >= 0) {
        // Up and back once, with a small dip at the end.
        const p = bounce / BOUNCE_SECONDS;
        const scale = 1 + BOUNCE_SCALE * Math.sin(p * Math.PI * 2 * 0.75) * (1 - p);
        for (const button of buttons) {
          if (button === soundButton) { button.render(ctx, services.sprites); continue; }
          ctx.save();
          ctx.translate(button.x, button.y);
          ctx.scale(scale, scale);
          ctx.translate(-button.x, -button.y);
          button.render(ctx, services.sprites);
          ctx.restore();
        }
      } else {
        for (const button of buttons) button.render(ctx, services.sprites);
      }
    },
    handleInput(event: SceneInputEvent) {
      if (dismissed || time < 0.4) return;
      if (event.type === 'pointerdown') {
        // A press anywhere else (the softened screen beneath, the mascot) only bounces Play and Home.
        if (!dispatchDown(buttons, event.info.x, event.info.y) && bounce < 0) bounce = 0;
      } else if (event.type === 'pointerup') {
        dispatchUp(buttons, event.info.x, event.info.y);
      } else if (performance.now() - enteredAt < KEY_GUARD_MS) {
        return;
      } else if (event.type === 'keydown' && !event.info.repeat) {
        const key = event.info.key;
        // The first key only shows focus on Play; arrows and Tab move it; a later key presses what is shown.
        if (!keyboard.selected) { keyboard.focus(playButton); focusAt = performance.now(); return; }
        if (key !== 'Tab' && !key.startsWith('Arrow') && performance.now() < focusAt + FOCUS_HOLD_MS) return;
        keyboard.key(key);
      } else if (event.type === 'keyup') {
        keyboard.keyUp(event.info.key);
      }
    },
    resize(w: number, h: number) {
      width = w;
      height = h;
      layout();
      // The manager resizes the scenes beneath first, so this redraws a correct snapshot.
      // While the scene beneath still draws live, it has already resized itself.
      if (!live) takeSnapshot();
    },
  };
  if (import.meta.env.DEV) scene.layout = layoutInfo;
  return scene;
}
