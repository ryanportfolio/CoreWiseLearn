# Adding a game

Create a folder in `src/games/`, export a `GameDefinition`, and add it to `src/engine/registry.ts`. Use Bubble Bay as the current worked example. No new runtime dependency is needed.

## Define play before code

Describe the action, its immediate response, and how a child discovers it without reading. Choose round play or creative play. Round games finish with a skippable celebration and equal Again and Home controls. Creative games save on leaving and need no score or forced finish.

Define motor difficulty separately from learning content. Infer a learning skill only when the game asks the child to use it. Specify which attempts count, how assistance and idle time are handled, and when difficulty changes. Changes belong between rounds or activities.

Each game may have its own medium and palette. Keep familiar home, mute, play, profile, and book controls. Read `docs/design.md` and `docs/style-bible.md` for shared rules.

## Add the definition

```ts
export const myGame: GameDefinition = {
  id: 'my-game',
  title: 'My Game',
  icon: 'tiles/my-game.png',
  themes: ['shapes'],
  mode: 'round',
  learning: ['shapes'],
  createScene: services => createMyGameScene(services),
};
```

An optional `load()` can preload a later bundle. The app catches a failed load and permits one reload at a safe hub boundary. Asset URLs use `services.art()` or `services.base`; the deployed base is `/CoreWiseLearn/`.

## Shared services

- Implement the `Scene` lifecycle. Add pause/resume handlers so a break overlay does not restart play.
- Use `services.input`. Targets are at least 96 CSS pixels in both dimensions. Keyboard players need a visible default target and navigation independent of the mouse.
- Store data with `services.save.gameData(id, defaults)`. Stable profile IDs own data. Renaming preserves ownership. Respect protected storage and never replace future or corrupt saves.
- Persist awards exactly once before displaying them. Keep unfinished choices in the game bag and call `save.flush()` at award and exit boundaries. Respect `config.rewardsEnabled`.
- Call `services.roundBoundary()` after celebration reaches the still rest state. A pending break can appear then, never during play.
- Use shared sound buses and owner-rated effects. Music comes from the owner. Future speech clips are bundled locally.
- Cache scaled art and glyphs; load the bundled font before baking text. Pool particles and moving objects. Avoid per-frame allocations, blur, gradients, and text rasterization.
- Use `services.random()` for reproducible debug runs. Forced tiers and time scaling require `?debug`.

## Register and verify

Add one registry entry and, if needed, stickers in `src/app/stickers.ts`. Add an isolated dev page following `dev/_template.html`.

Run `npm run typecheck` and `npm run build`. The build verifies the full public-asset precache and 5 MB v1 budget. Prepare bitmap assets with `scripts/prepare-art.mjs`; palette reduction is optional. Retain asset prompts, dates, and available model metadata.

Check the whole journey with mouse only and keyboard only in headed Chrome through `scripts/lib/launch-chrome.mjs`, with `CHROME_PLACE=offscreen`. Verify separate profiles, immediate awards, offline reload, normal animation under both operating-system motion preferences, and exits. Measure delivered frame intervals separately from update/render work. CPU throttling is a development proxy; the children's laptop is the final performance check.
