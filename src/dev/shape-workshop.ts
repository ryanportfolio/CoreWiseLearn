/**
 * Shape Workshop dev page. Query options:
 *   ?fresh          clear this profile's workshop save first (demo plays again)
 *   ?debug&tier=2   force a motor tier (debug only)
 *   ?level=2        start at a learning level
 *   ?picture=cat    open that picture
 * window.__shapeWorkshop exposes the scene's stats for checks.
 */
import { bootApp } from '../app/boot';
import { createShapeWorkshopScene, GAME_ID, loadShapeWorkshopArt } from '../games/shape-workshop/scene';

const params = new URLSearchParams(location.search);
const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const bag = services.save.gameData<Record<string, unknown>>(GAME_ID, {});
if (params.has('fresh')) for (const key of Object.keys(bag)) delete bag[key];
const level = Number(params.get('level'));
if (level === 1 || level === 2) bag.level = level;
const picture = params.get('picture');
if (picture) bag.currentId = picture;
services.save.flush();
await loadShapeWorkshopArt(services);
await services.scenes.push(createShapeWorkshopScene(services));
services.loop.start();
