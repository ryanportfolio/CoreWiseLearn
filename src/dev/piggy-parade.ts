/** Piggy Parade dev page: ?debug&tier=0..2&step=1..8&rounds=N&seed=N (rounds=0 replays the introduction). */
import { bootApp } from '../app/boot';
import { createPiggyParadeScene, loadPiggyParadeArt, type PiggyParadeStats } from '../games/piggy-parade/scene';

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
// The scene reads step and rounds from the URL itself when ?debug is on, as the full app does.
const missing = await loadPiggyParadeArt(services);
if (missing.length) console.warn(`[dev] missing Piggy Parade art: ${[...new Set(missing)].join(', ')}`);
const scene = createPiggyParadeScene(services);
window.__piggyParade = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __piggyParade?: PiggyParadeStats } }
