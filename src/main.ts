/**
 * App entry: boots the engine, wires navigation between scenes, preloads
 * art, and starts at the name-entry screen. Games are listed in
 * src/engine/registry.ts; nothing here is game specific.
 */

import { registerSW } from 'virtual:pwa-register';
import { bootApp } from './app/boot';
import type { AppServices } from './app/services';
import type { Scene } from './engine/scene';
import { findGame } from './engine/registry';
import { createNameEntryScene, loadNameEntryArt } from './scenes/name-entry';
import { createHubScene, loadHubAssets } from './scenes/hub';
import { createStickerBookScene, loadStickerBookAssets } from './scenes/sticker-book';
import { createBreakNudgeScene, loadBreakNudgeAssets } from './scenes/break-nudge';
import { playSfx } from './audio/sfx';
import { OUTLINE } from './ui/draw';

registerSW({ immediate: true });

/** Shown while art loads: a soft pulsing bubble, nothing to read. */
function createLoadingScene(): Scene {
  let t = 0;
  return {
    update(dt) {
      t += dt;
    },
    render({ ctx, width, height }) {
      ctx.fillStyle = '#8fd3ff';
      ctx.fillRect(0, 0, width, height);
      const r = Math.min(width, height) * (0.08 + 0.015 * Math.sin(t * 3));
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    },
  };
}

let services: AppServices;
let nudging = false;

function showNudge(): void {
  if (nudging) return;
  nudging = true;
  void services.scenes.push(createBreakNudgeScene(services)).then(() => {
    // The nudge pops itself; watch for that so a later nudge can show again.
    const check = (): void => {
      if (services.scenes.depth <= 1) nudging = false;
      else setTimeout(check, 1000);
    };
    setTimeout(check, 1000);
  });
}

services = bootApp({
  nav: {
    toNameEntry: () => void services.scenes.replace(createNameEntryScene(services)),
    toHub: () => void services.scenes.replace(createHubScene(services)),
    toStickerBook: () => void services.scenes.replace(createStickerBookScene(services)),
    toGame: (id) => {
      const def = findGame(id);
      if (!def) {
        console.warn(`nav.toGame: no game registered with id "${id}"`);
        playSfx(services.audio, 'miss');
        return;
      }
      void services.scenes.replace(def.createScene(services));
    },
  },
  nudgeAfterSeconds: 20 * 60,
  onNudge: showNudge,
});

void services.scenes.replace(createLoadingScene());
services.loop.start();

await Promise.all([
  loadNameEntryArt(services),
  loadHubAssets(services),
  loadStickerBookAssets(services),
  loadBreakNudgeAssets(services),
]);

// Always start at name entry: a returning child taps their bubble, a new one types.
void services.scenes.replace(createNameEntryScene(services));
