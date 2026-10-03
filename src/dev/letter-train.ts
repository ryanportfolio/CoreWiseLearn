/** Letter Train dev page: ?debug&tier=0..2&stage=0..4&seed=1&name=LEO&demo (demo replays the first-round hand). */
import { bootApp } from '../app/boot';
import { toStage } from '../games/letter-train/content';
import { createLetterTrainScene, loadLetterTrainArt, type LetterTrainStats } from '../games/letter-train/scene';

const params = new URLSearchParams(location.search);
const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile((params.get('name') ?? 'LEO').toUpperCase().replace(/[^A-Z]/g, '') || 'LEO');
const missing = await loadLetterTrainArt(services);
if (missing.length) console.warn(`[dev] missing Letter Train art: ${[...new Set(missing)].join(', ')}`);
const stage = services.debug.enabled && params.has('stage') ? { stage: toStage(Number(params.get('stage'))) } : {};
const scene = createLetterTrainScene(services, stage);
window.__letterTrain = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __letterTrain?: LetterTrainStats } }
