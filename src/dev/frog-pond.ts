/**
 * Frog Pond dev page: ?debug&tier=0..2&rounds=N&help=0|1&seed=N&pond&sentence=N (rounds=0 replays every activity's
 * introduction; pond shows the activity chooser; sentence picks Lily-pad sentences' sentence by its index in SENTENCES).
 */
import { bootApp } from '../app/boot';
import { createFrogPondScene, loadFrogPondArt, type FrogPondStats } from '../games/frog-pond/scene';

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const missing = await loadFrogPondArt(services);
if (missing.length) console.warn(`[dev] missing Frog Pond art: ${[...new Set(missing)].join(', ')}`);
const scene = createFrogPondScene(services);
window.__frogPond = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __frogPond?: FrogPondStats } }
