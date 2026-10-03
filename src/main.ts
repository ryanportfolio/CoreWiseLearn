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

let updatePending = false;
let applyingUpdate = false;
let reloadPending = false;
let workerReloadReady = false;
let route: 'loading' | 'name' | 'hub' | 'book' | 'game' = 'loading';
const RELOAD_KEY = 'cwl.v1.chunk-reload';
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updatePending = true;
    void applyPendingUpdate();
  },
  onNeedReload() {
    // Another tab can activate a worker while this child is still playing.
    // Override Workbox's default immediate reload for every controlling event.
    updatePending = false;
    workerReloadReady = true;
    applyingUpdate = false;
    void applyPendingUpdate();
  },
});

async function applyPendingUpdate(): Promise<void> {
  if (route !== 'hub' || nudging || applyingUpdate || navigationBusy) return;
  if (!updatePending && !reloadPending && !workerReloadReady) return;
  services.save.flush();
  applyingUpdate = true;
  if (workerReloadReady) {
    location.reload();
  } else if (updatePending) {
    try { await updateSW(true); }
    catch (error) { applyingUpdate = false; console.warn('Update deferred.', error); }
  } else if (reloadPending) {
    // One recovery per tab session. Repeated failures stay on the playable hub.
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) { applyingUpdate = false; return; }
      sessionStorage.setItem(RELOAD_KEY, '1');
      location.reload();
    } catch { applyingUpdate = false; }
  }
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadPending = true;
  void applyPendingUpdate();
});

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
let navigationBusy = false;

async function navigate(next: typeof route, scene: Scene): Promise<void> {
  if (navigationBusy || applyingUpdate) return;
  navigationBusy = true;
  try {
    // Leaving a nudge also removes the game it covered.
    while (services.scenes.depth > 1) await services.scenes.pop();
    nudging = false;
    await services.scenes.replace(scene);
    route = next;
  } finally { navigationBusy = false; }
  if (next === 'hub') void applyPendingUpdate();
}

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
    toNameEntry: (profileId) => void navigate('name', createNameEntryScene(services, profileId ? { renameProfileId: profileId } : undefined)),
    toHub: () => void navigate('hub', createHubScene(services)),
    toStickerBook: () => void navigate('book', createStickerBookScene(services)),
    toGame: (id) => {
      const def = findGame(id);
      if (!def) {
        console.warn(`nav.toGame: no game registered with id "${id}"`);
        playSfx(services.audio, 'miss');
        return;
      }
      if (def.load) {
        void def.load().then(() => navigate('game', def.createScene(services))).catch((error: unknown) => {
          console.warn('Game bundle unavailable; returning to the hub.', error);
          reloadPending = true;
          void navigate('hub', createHubScene(services));
        });
      } else void navigate('game', def.createScene(services));
    },
  },
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
await navigate('name', createNameEntryScene(services));
