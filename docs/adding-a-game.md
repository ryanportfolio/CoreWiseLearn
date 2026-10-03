# Adding a game

A game is one folder under `src/games/`, one line in the registry, and the art and stickers it needs. Nothing else in the app changes. Use `src/games/bubble-pop/` as the worked example.

## 1. Decide the game in a few lines

Before code, write down in `docs/design/` or in the folder's README:

- the one action the child repeats (pop, drag, steer, paint) and what makes it feel good;
- what counts as a hit and a miss for the adaptive difficulty, and what the three hidden tiers change;
- the round shape: how long, how it ends, how stars are earned (always at least one);
- the hidden learning (counting, colours, shapes, letters) and how it rides on the mechanic without a quiz feel.

The rules in `CLAUDE.md` under "What this project is" are the hard limits: no instruction text, nothing ever wrong or locked, 96 px targets, mouse or any key, 60 fps on a weak laptop.

## 2. Make the folder

```
src/games/<id>/
  index.ts     exports the GameDefinition and createScene
  theme.ts     data for backgrounds, sprites, palette (so skins are data, not code)
  tuning.ts    tier table and round constants, optional
```

`index.ts` exports:

```ts
export const myGame: GameDefinition = {
  id: 'my-game',
  title: 'My Game',          // adult facing only
  icon: 'tiles/my-game.png', // under public/art/
  themes: ['colours', 'motor'],
  createScene: (services) => createMyGameScene(services),
};
```

`createScene` receives the full `AppServices` (`src/app/services.ts`): canvas, input, audio, scenes, save, sprites, session, nav, and `art()` for asset URLs.

## 3. Build the scene on the engine

- Implement `Scene` from `src/engine/scene.ts`: `enter`, `exit`, `update(dt)`, `render(view, alpha)`, `handleInput(event)`, `resize(width, height)`. Add `pause` and `resume` if an overlay such as the break nudge should not replay your entrance.
- Load art in an exported `load<Game>Assets(services)` with `services.sprites.loadAll`, naming sprites by their path without extension. Draw them with `drawSprite` from `src/ui/draw.ts` so they come from the scaled cache. Draw a placeholder when a file is missing so the scene still runs.
- Difficulty: `createAdaptiveTier` from `src/engine/difficulty.ts`; record every hit and miss; load the saved tier from `services.save.gameData(id, { tier: 0 })` on enter and save on change and at round end.
- Rewards at round end: push a sticker id into `rewards(services).stickers`, add stars to `.stars`, increment `.rounds[id]`, then `services.save.save()`. Sticker ids come from `src/app/stickers.ts`; add your game's stickers there with `game: '<id>'`.
- Sounds: call `playSfx(services.audio, name, { index })` from `src/audio/sfx.ts`. Add a name there if the palette lacks one; keep it warm and low. Music: `startMusic(services.audio, track)` on enter, `stopMusic` on exit; add a track in `src/audio/music.ts` if the existing four do not fit.
- Celebrations: `confettiBurst`, `confettiRain`, `drawStarRow`, `drawCounter` from `src/ui/celebrate.ts`. Follow `docs/design/motion.md` for timing.
- Leaving: call `services.nav.toHub()` from a big home button; offer replay in place.

Performance rules that every game keeps: no allocations in `update` or `render`, pooled objects and particles, at most about 600 sprites and 1500 particles on screen, particles drawn with `arc`, no `shadowBlur`, no per-frame gradients or `fillText` (use `drawCounter` or cached glyphs). Read `window.__corewise.loop.stats.workMean` and `workMax` in the browser; keep `workMax` under 12 ms with Chrome CPU throttling at 4x.

## 4. Art

Generate with the `codex-image-gen` skill in the locked style (flat chunky vector, thick dark outlines, saturated flat fills, big friendly eyes, no text). The pipeline from the first batch, including the dependency-free resizer, is described in `public/art/manifest.json` and was run from `.tmp/art/`; sprites are 512x512 with the subject at 80 percent, backgrounds 1536x864, each under 1 MB. Add the new files under `public/art/<group>/` and the tile icon under `public/art/tiles/`. Update `manifest.json`.

## 5. Register and wire

1. Import the definition in `src/engine/registry.ts` and add it to the `games` array. Order there is hub order.
2. `main.ts` already preloads hub, name-entry, sticker-book and nudge art. If your game needs its art before its first frame, either load it inside your scene's `enter` with a loading state, or add your loader to the `Promise.all` in `main.ts`.

## 6. Dev page and checks

Copy `dev/_template.html` to `dev/<id>.html`, replace `SCENE`, and write `src/dev/<id>.ts` that calls `bootApp` with logging nav stubs, selects a test profile, loads assets, pushes your scene and starts the loop. Support `?round=10` and `?tier=2` style query parameters for fast testing.

Run `npm run dev -- --port 51xx`, open `http://localhost:51xx/CoreWiseLearn/dev/<id>.html` in headed Chrome, and check: zero console errors; a full round completes with mouse only and with keyboard only; the tier rises after a streak and falls after misses; the round always ends with at least one star and a sticker in `localStorage` under `corewise.save`; replay and home work; `workMax` under budget. Save screenshots under `D:\screenshots\CoreWiseLearn\<id>\`. Then `npm run typecheck` and `npm run build`.

## 7. Record

Add the game's tuning facts to `.claude/reference/` only if they are standing truths other sessions need; everything else stays in the folder. Note any quirk that cost a retry in `.claude/reference/pitfalls.md`.
