# CoreWiseLearn

A browser playground for two young children. Bubble Bay is the first game: pop sea creatures, hear warm musical feedback, collect stickers, and return to a world that stays as it was left. Each profile has its own progress and collection.

## Run locally

Use Node 24 and npm:

```sh
npm ci
npm run dev -- --port 5180
```

Open `http://localhost:5180/CoreWiseLearn/`. For an offline production check, run `npm run typecheck`, `npm run build`, then `npm run preview`. Visit once online before disconnecting. A pending app update waits for the hub: an update found anywhere else (during a round, on name entry, in the sticker book) applies once the child is back on the hub, which saves and reloads. On a first visit, before any service worker controls the page, the hub reloads once the new worker is active; if it does not activate within 4 s, the update waits for the next launch. The hub's own update reloads (the first-visit reload, and the fallback when the new version has not taken over after 4 s) happen at most once a minute per tab; when that limit stops one, the hub stays playable.

## Adult configuration

Edit `config.json` in the folder being served: `public/config.json` under `npm run dev`, or `dist/config.json` in a built copy (`npm run preview` or the copy on the children's laptop); editing `public/config.json` and rebuilding also works. The app fetches `config.json` fresh on every load, past the service worker's offline copy, so the change applies the next time the page loads. Only the answer to that fresh request is stored, in localStorage (`cwl.v1.config`); without a network answer the app uses that stored answer, then the copy precached at build time, then built-in defaults. Settings cover physical target scale, sound trim, keyboard layout, optional seeded profiles, break timing, and new sticker awards. Existing collections remain intact when rewards are disabled. There is no child-facing settings screen.

Leave profile seeds empty to start with name typing or a saved animal profile. Pick the child's avatar on each return. Names can change without changing profile ownership; the old name stays tied to the same child, so typing it still finds them.

Check Windows display scaling and measure targets on the actual laptop. If repeated Shift presses summon Sticky Keys, disable that keyboard shortcut in Windows Accessibility settings. Review touchpad three- and four-finger gestures if they switch apps accidentally. Browser fullscreen is best-effort and keeps an escape route; it cannot replace Windows parental controls.

## Development

- `npm run typecheck`: strict TypeScript compilation check.
- `npm run build`: production build, then a check that fails if any public file is missing from the precache and prints the total precache size. There is no size cap.
- `npm run check:precache`: inspect an existing production build.
- `node scripts/prepare-art.mjs input.png output.png --palette`: indexed-PNG preparation for flat art. Omit `--palette` for true-color art.

See [the design](docs/design.md), [v1.1 implementation](docs/plans/v1.1-implementation.md), [verification evidence and limits](docs/v1.1-verification.md), [shared style](docs/style-bible.md), [future worlds](docs/design/future-worlds.md), and [adding a game](docs/adding-a-game.md).

GitHub Pages remains manual and disabled until the owner chooses to publish. This continuation does not merge or deploy.
