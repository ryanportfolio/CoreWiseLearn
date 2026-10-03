/**
 * Dev entry for Bubble Pop. Query options:
 *   ?round=10  shorten the round to 10 seconds
 *   ?tier=2    start at a tier (0, 1 or 2)
 * Exposes window.__bubblePop (the scene's stats) for measurement scripts.
 */

import { bootApp } from '../app/boot';
import type { GameServices } from '../engine/registry';
import { bubblePop } from '../games/bubble-pop';
import { createBubblePopScene, loadBubblePopArt, GAME_ID, type BubblePopScene, type BubblePopStats } from '../games/bubble-pop/scene';

const params = new URLSearchParams(location.search);

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: (id) => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});

services.save.selectProfile('LEO');

const tierParam = params.get('tier');
if (tierParam === '0' || tierParam === '1' || tierParam === '2') {
  services.save.gameData(GAME_ID, { tier: 0, bestCount: 0 }).tier = Number(tierParam);
  services.save.save();
}

const missing = await loadBubblePopArt(services);
if (missing.length) console.info(`[dev] bubble-pop art missing, drawing placeholders: ${[...new Set(missing)].join(', ')}`);

const round = Number(params.get('round'));
const scene = (
  round > 0 ? createBubblePopScene(services, { roundSeconds: round }) : bubblePop.createScene(services as unknown as GameServices)
) as BubblePopScene;

window.__bubblePop = scene.stats;
await services.scenes.push(scene);
services.loop.start();

declare global {
  interface Window {
    __bubblePop?: BubblePopStats;
  }
}
