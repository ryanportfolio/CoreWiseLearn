/**
 * Break nudge: an overlay pushed on top of whatever is running. It dims the
 * frozen scene beneath, slides up a yawning mascot with drifting "z" and
 * stars, and after a second shows one big play button that pops the overlay.
 *
 * The scene manager renders only the top scene, so the scene beneath is
 * captured once into a dimmed snapshot on enter (and again on resize).
 */

import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { AppServices } from '../../app/services';
import { createButton, dispatchDown, dispatchUp } from '../../ui/button';
import { chunkyText, drawSprite, OUTLINE } from '../../ui/draw';
import { starPath } from '../../ui/celebrate';
import { easeOutBack, easeOutCubic } from '../../ui/tween';
import { playSfx } from '../../audio/sfx';
import { artName, artRequest, buttonRadius, circleTarget, loadAllArt, type LayoutTarget } from '../hub/shared';

const YAWN = 'mascot/yawn';
const PLAY = 'buttons/play-arrow';
const DIM = 0.55;
const BUTTON_DELAY = 1;
const SLIDE_SECONDS = 0.9;
const DRIFTERS = 10;

/** Load (or finish loading) the nudge's art. Never rejects. */
export function loadBreakNudgeAssets(services: AppServices): Promise<void> {
  return loadAllArt(services, [artRequest(services, `${YAWN}.png`, 'blob', '#3b9bff'), artRequest(services, `${PLAY}.png`, 'play', '#ffffff')]);
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

  let width = services.canvas.width;
  let height = services.canvas.height;
  let snapshot: HTMLCanvasElement | undefined;
  let time = 0;
  let dismissed = false;
  let spawnTimer = 0;
  let spawnIndex = 0;

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
  const buttons = [playButton];
  const layoutInfo: BreakNudgeLayout = { targets: [] };

  function dismiss(): void {
    if (dismissed || !playButton.visible) return;
    dismissed = true;
    playSfx(audio, 'button');
    void scenes.pop();
  }

  function layout(): void {
    // The mascot art fills about 65 percent of its square, feet near 85 percent down.
    mascotSize = Math.min(height * 0.62, width * 0.5);
    mascotX = width / 2;
    mascotY = height * 0.4;
    const r = buttonRadius(height, 0.1, 92);
    playButton.radius = r;
    playButton.x = width / 2;
    playButton.y = Math.min(height - r - Math.max(16, height * 0.04), mascotY + mascotSize * 0.36 + r + 12);
    if (import.meta.env.DEV) layoutInfo.targets = [circleTarget('play', playButton)];
  }

  /** Draw the scene beneath once and keep a dimmed copy at device resolution. */
  function takeSnapshot(): void {
    const src = services.canvas.element;
    const ctx = services.canvas.ctx;
    if (below) below.render({ ctx, width, height }, 0);
    const canvas = snapshot && snapshot.width === src.width && snapshot.height === src.height ? snapshot : document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const sctx = canvas.getContext('2d');
    if (sctx) {
      sctx.drawImage(src, 0, 0);
      sctx.fillStyle = `rgba(16, 12, 36, ${DIM})`;
      sctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    snapshot = canvas;
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
    playButton.icon = artName(PLAY);
  });

  const scene: Scene & { layout?: BreakNudgeLayout } = {
    enter() {
      width = services.canvas.width;
      height = services.canvas.height;
      layout();
      takeSnapshot();
      playButton.icon = artName(PLAY);
      time = 0;
      dismissed = false;
      spawnTimer = 0.5;
      playButton.visible = false;
      age.fill(0);
      life.fill(0);
      playSfx(audio, 'yawn');
    },
    update(dt) {
      time += dt;
      if (!playButton.visible && time >= BUTTON_DELAY) {
        playButton.visible = true;
        playButton.popIn(0);
      }
      playButton.update(dt, input.pointer.inside ? input.pointer.x : -9999, input.pointer.inside ? input.pointer.y : -9999);
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
      if (snapshot) ctx.drawImage(snapshot, 0, 0, width, height);
      else {
        ctx.fillStyle = '#1b1f3b';
        ctx.fillRect(0, 0, width, height);
      }

      const slide = easeOutBack(Math.min(1, time / SLIDE_SECONDS), 1.2);
      const breathe = time > SLIDE_SECONDS ? Math.sin((time - SLIDE_SECONDS) * 1.8) * 0.025 : 0;
      const y = mascotY + (height - mascotY + mascotSize) * (1 - slide);
      drawSprite(ctx, services.sprites, artName(YAWN), mascotX, y, mascotSize, 0, 1 + breathe, 1 - breathe);

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

      playButton.render(ctx, services.sprites);
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'pointerdown') {
        dispatchDown(buttons, event.info.x, event.info.y);
      } else if (event.type === 'pointerup') {
        dispatchUp(buttons, event.info.x, event.info.y);
      } else if (event.type === 'anykey' && (event.info.key === 'Enter' || event.info.key === 'Escape')) {
        dismiss();
      }
    },
    resize(w: number, h: number) {
      width = w;
      height = h;
      layout();
      // The manager resizes the scenes beneath first, so this redraws a correct snapshot.
      takeSnapshot();
    },
  };
  if (import.meta.env.DEV) scene.layout = layoutInfo;
  return scene;
}
