/**
 * Dev entry for the sticker book. `?seed` writes the MIA test profile with
 * two unseen stickers, which drop in once; reload without `?seed` to see
 * them settled.
 */

import { createStickerBookScene, loadStickerBookAssets } from '../scenes/sticker-book';
import { bootDev, instrumentWork, seedFromQuery } from '../scenes/hub/dev-support';

const services = bootDev();
seedFromQuery(services);

await loadStickerBookAssets(services);
instrumentWork(services);
await services.scenes.push(createStickerBookScene(services));
services.loop.start();
