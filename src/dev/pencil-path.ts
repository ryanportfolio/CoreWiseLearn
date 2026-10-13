/**
 * Pencil Path dev page: ?debug&seed=N. window.__pencilPath exposes the scene's state and three hooks for browser
 * checks: load(page), draw(strokes in page centimetres) and go().
 */
import { bootApp } from '../app/boot';
import { createPencilPathScene, loadPencilPathArt, type PencilPathStats } from '../games/pencil-path/scene';

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const missing = await loadPencilPathArt(services);
if (missing.length) console.warn(`[dev] missing Pencil Path art: ${[...new Set(missing)].join(', ')}`);
const scene = createPencilPathScene(services);
window.__pencilPath = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __pencilPath?: PencilPathStats } }
