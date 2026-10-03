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
/** Time of this tab's last reload into an update; stops a reload loop if a worker never activates. */
const UPDATE_RELOAD_KEY = 'cwl.v1.update-reload';
/** How long the hub waits for the new worker before reloading or giving up. */
const UPDATE_WAIT_MS = 4000;
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
    catch (error) { applyingUpdate = false; console.warn('Update deferred.', error); return; }
    if (!navigator.serviceWorker?.controller) {
      // A tab no worker controls (a first visit) never gets the controlling event
      // Workbox reloads on. The hub is a safe point: reload once the new worker runs.
      if (await workerActivated(UPDATE_WAIT_MS)) reloadForUpdate();
      else skipUpdate();
    } else {
      // Normally onNeedReload reloads within moments. Never leave the hub frozen.
      setTimeout(() => { if (applyingUpdate && !workerReloadReady) reloadForUpdate(); }, UPDATE_WAIT_MS);
    }
  } else if (reloadPending) {
    // One recovery per tab session. Repeated failures stay on the playable hub.
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) { applyingUpdate = false; return; }
      sessionStorage.setItem(RELOAD_KEY, '1');
      location.reload();
    } catch { applyingUpdate = false; }
  }
}

/** Leave this update for the next launch and keep the hub playable. */
function skipUpdate(): void {
  updatePending = false;
  applyingUpdate = false;
}

/** Reload into the new version from the hub, at most once a minute per tab. */
function reloadForUpdate(): void {
  if (route !== 'hub' || nudging) { skipUpdate(); return; }
  try {
    const last = Number(sessionStorage.getItem(UPDATE_RELOAD_KEY));
    if (last && Date.now() - last < 60_000) { skipUpdate(); return; }
    sessionStorage.setItem(UPDATE_RELOAD_KEY, String(Date.now()));
  } catch { skipUpdate(); return; }
  location.reload();
}

/** Resolve true once the waiting (or installing) worker is active, false on timeout or failure. */
async function workerActivated(ms: number): Promise<boolean> {
  let registration: ServiceWorkerRegistration | undefined;
  try { registration = await navigator.serviceWorker?.getRegistration(); } catch { return false; }
  const worker = registration?.waiting ?? registration?.installing;
  if (!worker) return !!registration?.active;
  return new Promise((resolve) => {
    const finish = (ok: boolean): void => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      resolve(ok);
    };
    const check = (): void => {
      if (worker.state === 'activated') finish(true);
      else if (worker.state === 'redundant') finish(false);
    };
    const timer = setTimeout(() => finish(worker.state === 'activated'), ms);
    worker.addEventListener('statechange', check);
    check();
  });
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

/** A nudge the session counted as shown that never reached the screen; retried at the next round end. */
let nudgeOwed = false;

function showNudge(): boolean {
  if (nudging) return true;
  // A reload into an update is under way; the nudge would vanish with the page.
  if (applyingUpdate) return false;
  nudging = true;
  nudgeOwed = false;
  const nudge = createBreakNudgeScene(services);
  // A push asked for inside another scene change (a game restoring into its rest
  // screen) is queued by the scene manager and lands right after that change.
  void services.scenes.push(nudge).then(() => {
    if (services.scenes.current !== nudge) {
      nudging = false;
      nudgeOwed = true;
      return;
    }
    // The nudge pops itself; watch for that so a later nudge can show again.
    const check = (): void => {
      if (services.scenes.depth <= 1) nudging = false;
      else setTimeout(check, 1000);
    };
    setTimeout(check, 1000);
  }, (error: unknown) => {
    console.warn('Break nudge could not be shown; retrying at the next round end.', error);
    nudging = false;
    nudgeOwed = true;
  });
  return true;
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
  onRoundBoundary: () => { if (nudgeOwed) showNudge(); },
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
