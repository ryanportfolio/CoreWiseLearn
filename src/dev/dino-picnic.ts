/** Dino Picnic dev page: ?debug&tier=2&seed=1&stage=2&rounds=1 (rounds=0 replays the introduction). */
import { bootApp } from '../app/boot';
import { defaultData, GAME_ID, type PicnicData } from '../games/dino-picnic/data';
import { createDinoPicnicScene, loadDinoPicnicArt, type DinoPicnicStats } from '../games/dino-picnic/scene';

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
const data = services.save.gameData<PicnicData>(GAME_ID, defaultData());
if (services.debug.enabled) {
  const stage = Number(params.get('stage')), rounds = Number(params.get('rounds'));
  if (params.has('stage') && (stage === 0 || stage === 1 || stage === 2)) data.stage = stage;
  if (params.has('rounds') && Number.isSafeInteger(rounds) && rounds >= 0) { data.rounds = rounds; data.pending = null; }
}
const missing = await loadDinoPicnicArt(services);
if (missing.length) console.warn(`[dev] missing Dino Picnic art: ${[...new Set(missing)].join(', ')}`);
const scene = createDinoPicnicScene(services);
window.__dinoPicnic = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __dinoPicnic?: DinoPicnicStats } }
