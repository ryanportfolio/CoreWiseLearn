/**
 * Bubble Bay dev page: ?debug&round=10&tier=2&seed=1&timeScale=2.
 * `?nudge=<seconds>` shows the break nudge at the first round end after that much play, as the app does, and
 * window.__bubblePopNudge() covers the game with the nudge at any moment (over the sticker choice, for example).
 */
import { bootApp } from '../app/boot';
import { createBreakNudgeScene, loadBreakNudgeAssets } from '../scenes/break-nudge';
import { createBubblePopScene, loadBubblePopArt, scheduledPops, type BubblePopStats } from '../games/bubble-pop/scene';

const params = new URLSearchParams(location.search);
for (const tier of [0, 1, 2] as const) console.assert(scheduledPops(tier) >= 10, `Tier ${tier} must offer enough bubbles for three stars`);
const nudgeAfter = Number(params.get('nudge'));
const nudge = (): void => { void services.scenes.push(createBreakNudgeScene(services)); };
const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
  ...(nudgeAfter > 0 ? { nudgeAfterSeconds: nudgeAfter, onNudge: nudge } : {}),
});
services.save.selectProfile('LEO');
const missing = await loadBubblePopArt(services);
if (missing.length) console.warn(`[dev] missing Bubble Bay art: ${[...new Set(missing)].join(', ')}`);
await loadBreakNudgeAssets(services);
const round = Number(params.get('round'));
const scene = createBubblePopScene(services, services.debug.enabled && round > 0 ? { roundSeconds: Math.max(3, Math.min(180, round)) } : {});
window.__bubblePop = scene.stats;
window.__bubblePopNudge = nudge;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __bubblePop?: BubblePopStats; __bubblePopNudge?: () => void } }
