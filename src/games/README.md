# Games

Each game lives in its own folder here, for example `src/games/bubble-pop/`. The folder's `index.ts` exports one `GameDefinition` (see `src/engine/registry.ts`):

```ts
import type { GameDefinition } from '../../engine/registry';

export const bubblePop: GameDefinition = {
  id: 'bubble-pop',
  title: 'Bubble Pop',
  icon: 'tiles/ocean-octopus.webp',
  themes: ['numbers', 'motor', 'ocean'],
  createScene: (services) => createBubblePopScene(services),
};
```

`icon` is a path under `public/art/` (the hub resolves it with `services.art()`); a path starting with `art/` or `/` is used as given.

To make the hub see it, import the definition in `src/engine/registry.ts` and add it to the `games` array. There is no auto-discovery on purpose: the order of that array is the order the hub menu shows the games in. The full recipe, including assets, sounds, stickers and the dev page, is in `docs/adding-a-game.md`.

Rules for a game folder:

- Keep everything the game needs (scene code, tuning constants, theme data) inside its folder. Shared behaviour belongs in `src/engine/`, shared drawing in `src/ui/`.
- Save state only through the per-game bag from `save.ts` (`services.save.gameData(id, defaults)`), keyed by the game's `id`. Stickers and stars go through `rewards(services)` from `src/app/services.ts`.
- Use `difficulty.ts` for tier changes rather than inventing a second mechanism.
- Players are four and five years old and cannot read. Icons and sounds carry meaning; any text is for the adult.
