/** Coin Vault dev page: ?debug&tier=0..2&step=1..8&rounds=N&seed=N (rounds=0 replays the introduction). */
import { bootApp } from '../app/boot';
import { createCoinVaultScene, loadCoinVaultArt, type CoinVaultStats } from '../games/coin-vault/scene';

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const missing = await loadCoinVaultArt(services);
if (missing.length) console.warn(`[dev] missing Coin Vault art: ${[...new Set(missing)].join(', ')}`);
const scene = createCoinVaultScene(services);
window.__coinVault = scene.stats;
await services.scenes.push(scene);
services.loop.start();
declare global { interface Window { __coinVault?: CoinVaultStats } }
