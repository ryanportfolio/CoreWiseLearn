/**
 * Dev entry for the hub. Query parameters:
 *   ?seed        test profile MIA with stickers (?seed=empty clears the profile)
 *   ?games=N     register N stand-in games after the real ones, to check the tile layout (dev only)
 *   ?return      every hub button comes straight back to a new hub, as when a child
 *                comes home: from a game tile, keyboard focus starts on that game's
 *                tile; from the avatar, rename or book button, on the first tile
 */

import { allGames, type GameDefinition } from '../engine/registry';
import { STICKERS } from '../app/stickers';
import { createHubScene, loadHubAssets } from '../scenes/hub';
import { bootDev, instrumentWork, seedFromQuery } from '../scenes/hub/dev-support';

const query = new URLSearchParams(location.search);
const comeBack = (): void => void services.scenes.replace(createHubScene(services));
const services = bootDev(query.has('return') ? { toGame: comeBack, toNameEntry: comeBack, toStickerBook: comeBack } : {});
seedFromQuery(services);

const fakeCount = Number(query.get('games') ?? '0');
if (fakeCount > 0) {
  // Dev only: the registry array is module state; pushing stand-ins lets the layout be checked.
  const list = allGames() as GameDefinition[];
  for (let i = 0; i < fakeCount; i++) {
    const def = STICKERS[i % STICKERS.length];
    if (!def) continue;
    list.push({
      id: `fake-${i + 1}`,
      title: `Stand-in ${i + 1}`,
      // Alternate the two accepted path forms.
      icon: i % 2 === 0 ? def.path : `art/${def.path}`,
      themes: [],
      createScene: () => ({ update() {}, render() {} }),
    });
  }
}

await loadHubAssets(services);
instrumentWork(services);
await services.scenes.push(createHubScene(services));
services.loop.start();
