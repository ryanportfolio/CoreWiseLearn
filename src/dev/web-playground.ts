/** Web Playground dev page: ?debug&tier=2&seed=1&mode=letters&level=1&fresh. */
import { bootApp } from '../app/boot';
import { createWebPlaygroundScene, loadWebPlaygroundArt } from '../games/web-playground/scene';

const params = new URLSearchParams(location.search);
const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
if (params.has('fresh')) services.save.deleteProfile('LEO');
services.save.selectProfile('LEO');
const missing = await loadWebPlaygroundArt(services);
if (missing.length) console.warn(`[dev] missing Web Playground art: ${[...new Set(missing)].join(', ')}`);
const mode = params.get('mode'), level = Number(params.get('level'));
const scene = createWebPlaygroundScene(services, {
  ...(mode === 'numbers' || mode === 'letters' ? { mode } : {}),
  ...(params.has('level') && (level === 0 || level === 1 || level === 2) ? { level } : {}),
});
window.__webPlayground = scene.stats;
await services.scenes.push(scene);
services.loop.start();
