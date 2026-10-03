/**
 * Builds the engine and the AppServices bundle. main.ts and every dev entry
 * call this, then push a scene and start the loop.
 */

import { createCanvas } from '../engine/canvas';
import { createLoop } from '../engine/loop';
import { createInput } from '../engine/input';
import { createAudio } from '../engine/audio';
import { createSceneManager, type SceneContext } from '../engine/scene';
import { createSaveStore } from '../engine/save';
import { createSpriteStore } from '../engine/sprites';
import { createSessionTimer } from '../engine/session';
import type { AppServices, Nav } from './services';

export interface BootOptions {
  nav?: Partial<Nav>;
  nudgeAfterSeconds?: number;
  onNudge?: (elapsedSeconds: number) => void;
}

function missing(name: string): () => void {
  return () => console.warn(`nav.${name} not wired in this entry`);
}

export function bootApp(options: BootOptions = {}): AppServices {
  const element = document.getElementById('game');
  if (!(element instanceof HTMLCanvasElement)) throw new Error('#game canvas missing');

  const canvas = createCanvas(element);
  const input = createInput(element);
  const audio = createAudio();
  const scenes = createSceneManager(input);
  const save = createSaveStore();
  const sprites = createSpriteStore();
  const session = createSessionTimer({
    ...(options.nudgeAfterSeconds !== undefined ? { nudgeAfterSeconds: options.nudgeAfterSeconds } : {}),
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

  const loop = createLoop({
    update: (dt) => {
      session.tick(dt);
      scenes.update(dt);
    },
    render: (alpha) => scenes.render(view, alpha),
  });

  sprites.setPixelRatio(canvas.dpr);
  canvas.onResize((w, h) => {
    sprites.setPixelRatio(canvas.dpr);
    scenes.resize(w, h);
  });
  // The canvas sized itself before this listener existed; seed the manager so
  // the first pushed scene receives resize() with real dimensions.
  scenes.resize(canvas.width, canvas.height);
  input.on('pointerdown', () => void audio.unlock());
  input.on('anykey', () => void audio.unlock());

  const rawBase = import.meta.env.BASE_URL;
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  const nav: Nav = {
    toNameEntry: options.nav?.toNameEntry ?? missing('toNameEntry'),
    toHub: options.nav?.toHub ?? missing('toHub'),
    toGame: options.nav?.toGame ?? missing('toGame'),
    toStickerBook: options.nav?.toStickerBook ?? missing('toStickerBook'),
  };

  const services: AppServices = {
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

  window.__corewise = { loop, canvas, input, audio, scenes };
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
    };
  }
}
