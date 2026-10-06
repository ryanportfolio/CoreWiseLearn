/** Market Stall dev page: ?debug&tier=0..2&step=1..9&rounds=N&seed=N (rounds=0 replays the introduction). */
import { bootApp } from '../app/boot';
import { createMarketStallScene, loadMarketStallArt, type MarketStallStats } from '../games/market-stall/scene';

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const missing = await loadMarketStallArt(services);
if (missing.length) console.warn(`[dev] missing Market Stall art: ${[...new Set(missing)].join(', ')}`);
const scene = createMarketStallScene(services);
window.__marketStall = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __marketStall?: MarketStallStats } }
