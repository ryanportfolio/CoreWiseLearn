/** Bubble Bay dev page: ?debug&round=10&tier=2&seed=1&timeScale=2. */
import { bootApp } from '../app/boot';
import { createBubblePopScene, loadBubblePopArt, scheduledPops, type BubblePopStats } from '../games/bubble-pop/scene';

const params = new URLSearchParams(location.search);
for (const tier of [0, 1, 2] as const) console.assert(scheduledPops(tier) >= 10, `Tier ${tier} must offer enough bubbles for three stars`);
const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const missing = await loadBubblePopArt(services);
if (missing.length) console.warn(`[dev] missing Bubble Bay art: ${[...new Set(missing)].join(', ')}`);
const round = Number(params.get('round'));
const scene = createBubblePopScene(services, services.debug.enabled && round > 0 ? { roundSeconds: Math.max(3, Math.min(180, round)) } : {});
window.__bubblePop = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __bubblePop?: BubblePopStats } }
