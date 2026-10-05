/**
 * Builds the engine and the AppServices bundle. main.ts and every dev entry
 * call this, then push a scene and start the loop.
 */

import { config, readDebug, seededRandom } from './config';
import { ensureDisplayFont } from './font';
import { createCanvas } from '../engine/canvas';
import { createLoop } from '../engine/loop';
import { createInput } from '../engine/input';
import { createAudio } from '../engine/audio';
import { createSceneManager, type SceneContext } from '../engine/scene';
import { createSaveStore } from '../engine/save';
import { registerSaveValidators } from '../engine/registry';
import { createSpriteStore } from '../engine/sprites';
import { createSessionTimer } from '../engine/session';
import { createCursor, type Cursor } from '../engine/cursor';
import type { AppServices, Nav } from './services';

await ensureDisplayFont();

export interface BootOptions {
  onRoundBoundary?: () => void;
  nav?: Partial<Nav>;
  nudgeAfterSeconds?: number;
  /** Return false when the nudge could not be shown; it stays due. */
  onNudge?: (elapsedSeconds: number) => void | boolean;
}

function missing(name: string): () => void {
  return () => console.warn(`nav.${name} not wired in this entry`);
}

export function bootApp(options: BootOptions = {}): AppServices {
  const element = document.getElementById('game');
  if (!(element instanceof HTMLCanvasElement)) throw new Error('#game canvas missing');

  const debug = readDebug();
  const canvas = createCanvas(element);
  const input = createInput(element);
  const audio = createAudio(config.masterTrimDb);
  const scenes = createSceneManager(input);
  const cursor = createCursor(element, input, scenes, config.uiScale);
  // Every game's save check must be in place before the stored save is read.
  registerSaveValidators();
  const save = createSaveStore();
  save.seedProfiles(config.profiles);
  const sprites = createSpriteStore();
  const session = createSessionTimer({
    nudgeAfterSeconds: options.nudgeAfterSeconds ?? config.breakAfterSeconds,
    ...(options.onNudge ? { onNudge: options.onNudge } : {}),
  });

  const view: SceneContext = {
    ctx: canvas.ctx,
    get width() {
      return canvas.width;
    },
    get height() {
      return canvas.height;
    },
  };

  let overlayAt = 0;
  let overlay = '';
  const loop = createLoop({
    frame: (seconds) => { if (save.active) session.tick(seconds); cursor.frame(seconds); },
    update: (dt) => {
      cursor.beginStep();
      scenes.update(dt);
      input.endFrame();
    },
    render: (alpha) => {
      scenes.render(view, alpha);
      if (debug.enabled) {
        const now = performance.now();
        if (now >= overlayAt) {
          overlay = 'DEBUG  frame p95 ' + loop.stats.p95.toFixed(1) + ' ms   work p95 ' + loop.stats.workP95.toFixed(1) + ' ms   scale ' + canvas.resolutionScale + '   DPR ' + canvas.dpr.toFixed(2) + '   [R] resolution';
          overlayAt = now + 250;
        }
        const ctx = canvas.ctx;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#172038'; ctx.fillRect(0, 0, canvas.width, 24);
        ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(overlay, 8, 12);
        ctx.restore();
      }
      cursor.render(canvas.ctx);
    },
    afterFrame: (interval, work) => canvas.observeFrame(interval, work),
  }, { timeScale: debug.timeScale });

  sprites.setPixelRatio(canvas.dpr);
  canvas.onResize((w, h) => {
    sprites.setPixelRatio(canvas.dpr);
    scenes.resize(w, h);
    cursor.resize(w, h, canvas.dpr);
  });
  // The canvas sized itself before this listener existed; seed the manager so
  // the first pushed scene receives resize() with real dimensions.
  scenes.resize(canvas.width, canvas.height);
  cursor.resize(canvas.width, canvas.height, canvas.dpr);
  let firstGesture = true;
  const onGesture = (event: Event): void => {
    void audio.unlock();
    if (!firstGesture || !event.isTrusted || (event instanceof KeyboardEvent && event.key === 'Escape')) return;
    firstGesture = false;
    const root = document.documentElement;
    const keyboard = (navigator as Navigator & { keyboard?: { lock(keys: string[]): Promise<void> } }).keyboard;
    if (!document.fullscreenElement && root.requestFullscreen) {
      void root.requestFullscreen().then(() => keyboard?.lock(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])).catch(() => {});
    }
  };
  window.addEventListener('pointerdown', onGesture, { capture: true });
  window.addEventListener('keydown', onGesture, { capture: true });
  if (debug.enabled) window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyR' || event.repeat || event.ctrlKey || event.metaKey) return;
    const scale = canvas.resolutionScale;
    canvas.setResolutionScale(scale === 1 ? 0.85 : scale === 0.85 ? 0.7 : 1);
  }, { capture: true });

  const rawBase = import.meta.env.BASE_URL;
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  const nav: Nav = {
    toNameEntry: options.nav?.toNameEntry ?? missing('toNameEntry'),
    toHub: options.nav?.toHub ?? missing('toHub'),
    toGame: options.nav?.toGame ?? missing('toGame'),
    toStickerBook: options.nav?.toStickerBook ?? missing('toStickerBook'),
  };

  const services: AppServices = {
    config,
    debug,
    random: debug.enabled ? seededRandom(debug.seed) : Math.random,
    roundBoundary() {
      save.flush();
      session.roundBoundary();
      options.onRoundBoundary?.();
    },
    canvas,
    input,
    audio,
    scenes,
    save,
    sprites,
    session,
    loop,
    nav,
    base,
    art: (path) => `${base}art/${path}`,
    profile: () => save.active,
  };

  window.__corewise = { loop, canvas, input, audio, scenes, save, session, config, cursor };
  return services;
}

declare global {
  interface Window {
    __corewise?: {
      loop: AppServices['loop'];
      canvas: AppServices['canvas'];
      input: AppServices['input'];
      audio: AppServices['audio'];
      scenes: AppServices['scenes'];
      // Optional so any other entry that sets this hook still compiles.
      save?: AppServices['save'];
      session?: AppServices['session'];
      config?: AppServices['config'];
      cursor?: Cursor;
    };
  }
}
