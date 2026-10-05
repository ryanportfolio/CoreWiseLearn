/** Ride Fare dev page: ?debug&tier=0..2&step=1..8&rounds=N&seed=N (rounds=0 replays the introduction). */
import { bootApp } from '../app/boot';
import { createRideFareScene, loadRideFareArt, type RideFareStats } from '../games/ride-fare/scene';

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const missing = await loadRideFareArt(services);
if (missing.length) console.warn(`[dev] missing Ride Fare art: ${[...new Set(missing)].join(', ')}`);
const scene = createRideFareScene(services);
window.__rideFare = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __rideFare?: RideFareStats } }
