# Adding a game

Create a folder in `src/games/`, export a `GameDefinition`, and add it to `src/engine/registry.ts`. Use Bubble Bay as the current worked example. No new runtime dependency is needed.

## Define play before code

Describe the action, its immediate response, and how a child discovers it without reading. Choose round play or creative play. Round games finish with a celebration, then equal Again and Home controls. The celebration becomes skippable only after its earned stars have appeared and a short lock has passed (1.5 s in Bubble Bay), so the press that ends the round cannot skip it. Creative games save on leaving and need no score or forced finish.

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

An optional `load()` can preload a later bundle. The app catches a failed load and permits one reload at a safe hub boundary. Asset URLs use `services.art()` or `services.base`; the deployed base is `/`.

A game that keeps a save bag should also set `validateSave: (bag, protect) => ...`. `bootApp` registers it (through `registerSaveValidator` in `src/app/services.ts`) before the save is read, and the save store runs it on this game's bag in every profile when the save loads, before each write merges with what another tab stored, and when it adopts a bag or profile another tab stored. So a damaged bag is caught even if the child never opens the game. The validator replaces each invalid value in place with a safe one and calls `protect()` when it does; the store then never overwrites the stored bytes on this visit. Filling a missing field with its default needs no `protect()`; leave valid values alone. Keep it in cheap code (the definition file or a small module it imports, not the scene) because every definition loads at startup. Bubble Bay's is `sanitizeBubbleData`. Games without a validator have their bags left as stored.

## Shared services

- Implement the `Scene` lifecycle. Add pause/resume handlers so a break overlay does not restart play. The break nudge can arrive before your scene has been on top for 1 s (`services.scenes.shownSeconds`), for example when it restores straight into its rest screen; the nudge then keeps calling your scene's `update` and `render` after it is covered (after `pause()`, or after `exit()` for a scene with no `pause()`; see `src/engine/scene.ts`) until that second is up, then keeps a still copy of it. Your scene must keep drawing correctly in that time.
- Use `services.input`. Targets are at least 96 CSS pixels in both dimensions. Anything the child can drag can also be carried with a click, so no move needs a held button: a press released within 0.3 s and 24 px picks the thing up, it follows the pointer with no button held, and the next press puts it down as letting go of a drag at that spot would. Dino Picnic, Piggy Parade, Ride Fare, Letter Train, Shape Workshop and the sticker book all do this; copy the `carry` pattern from one of their scenes. Keyboard players need a visible default target and navigation independent of the mouse. The exception is a reward choice, a round-end rest screen and the break nudge: each starts with nothing focused, ignores keys for its first 1.2 s and then the first key only shows focus, so a child pressing keys steadily cannot choose by accident. Bubble Bay's choice and rest screens keep two keys that act at once after that guard: Escape goes straight to the hub (an unchosen gift stays pending) and Tab moves focus to the corner Home and sound buttons. `createKeyboardNavigation` in `src/ui/navigation.ts` provides arrow and Tab movement (Shift+Tab goes back); with `anyKey`, as the hub, sticker book and break nudge use it, every key that is not an arrow or Tab activates the focused control once per press. The sticker book has two exceptions: while a sticker is picked up, every key goes to the sticker (arrows move it, any other key puts it down, and Tab then also moves focus), and Left and Right step through its controls in reading order.
- Store data with `services.save.gameData(id, defaults)`. Stable profile IDs own data. Renaming preserves ownership and keeps the old name as an alias of the same profile. Respect protected storage and never replace future or corrupt saves.
- Persist awards exactly once before displaying them. Keep unfinished choices in the game bag and call `save.flush()` at award and exit boundaries. Respect `config.rewardsEnabled`.
- Call `services.roundBoundary()` after celebration reaches the still rest state. A pending break can appear then, never during play; one that cannot show yet stays due and is retried at the next round end.
- Use shared sound buses and owner-rated effects. Music comes from the owner. Future speech clips are bundled locally. The round-end fanfare takes a few milliseconds of main thread to build; render it ahead with `prepareSfx(audio, 'fanfare')` (`src/audio/sfx.ts`), called before it is needed and away from busy frames, and `playSfx` then plays the rendered buffer. `prepareSfx` does all the work in one call. To spread it out, call `prepareSfxStep(audio, 'fanfare')` instead, once per slice, until it returns true: the first call sets up the render and is the one long step (do it while nothing on screen moves), each later call adds one note (or the chord, or the low sub note), short enough for an idle period between frames, and the last starts the render, which runs off the main thread. Bubble Bay makes the first call when a round starts and the rest in idle callbacks. For other effects both do nothing.
- Cache scaled art and glyphs; load the bundled font before baking text. Pool particles and moving objects. Avoid per-frame allocations, blur, gradients, and text rasterization.
- Use `services.random()` for reproducible debug runs. Forced tiers and time scaling require `?debug`.

## Register and verify

Add one registry entry and, if needed, stickers in `src/app/stickers.ts`. A round game that offers stickers at its end draws them with `createStickerOffers` (`src/ui/sticker-offer.ts`): the sticker look, the small sticker book beside the offers, the flight into it on a pick (`PICK_SECONDS` before the rest screen) and the book on the rest screen, so every game's offers match; call its `warm` and `warmBook` during the celebration so the look is baked before the choice shows. The sticker book makes as many pages of 8 as the sticker list needs and sizes each sticker's art to fit its slot. To check a different list in a dev page, pass it to `createStickerBookScene(services, { stickers })` and `loadStickerBookAssets(services, stickers)` (`src/scenes/sticker-book/index.ts`). Add an isolated dev page following `dev/_template.html`.

Run `npm run typecheck` and `npm run build`. After `vite build`, `scripts/check-precache.mjs` fails the build if any file under `public/` is missing from the service worker's precache list, and prints the entry count and total precache size. There is no size cap for now (owner, 2026-10-03); download size is optimized at the end. `scripts/prepare-art.mjs` resizes one image into a separate PNG (palette reduction is optional). New generated art ships as transparent WebP prepared outside that script; see `.claude/reference/deployment.md`. Retain asset prompts, dates, and available model metadata.

Check the whole journey with mouse only and keyboard only in headed Chrome through `scripts/lib/launch-chrome.mjs`, with `CHROME_PLACE=offscreen`. Verify separate profiles, immediate awards, offline reload, normal animation under both operating-system motion preferences, and exits. Measure delivered frame intervals separately from update/render work. CPU throttling is a development proxy; the children's laptop is the final performance check.
