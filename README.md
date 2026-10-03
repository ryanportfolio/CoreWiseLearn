# CoreWiseLearn

A browser playground for two young children. Bubble Bay is the first game: pop sea creatures, hear warm musical feedback, collect stickers, and return to a world that stays as it was left. Each profile has its own progress and collection.

## Run locally

Use Node 24 and npm:

```sh
npm ci
npm run dev -- --port 5180
```

Open `http://localhost:5180/CoreWiseLearn/`. For an offline production check, run `npm run typecheck`, `npm run build`, then `npm run preview`. Visit once online before disconnecting. A pending app update waits for a safe hub screen.

## Adult configuration

Edit `public/config.json` and rebuild. Settings cover physical target scale, sound trim, keyboard layout, optional seeded profiles, break timing, and new sticker awards. Existing collections remain intact when rewards are disabled. There is no child-facing settings screen.

Leave profile seeds empty to start with name typing or a saved animal profile. Pick the child's avatar on each return. Names can change without changing profile ownership.

Check Windows display scaling and measure targets on the actual laptop. If repeated Shift presses summon Sticky Keys, disable that keyboard shortcut in Windows Accessibility settings. Review touchpad three- and four-finger gestures if they switch apps accidentally. Browser fullscreen is best-effort and keeps an escape route; it cannot replace Windows parental controls.

## Development

- `npm run typecheck`: strict TypeScript compilation check.
- `npm run build`: production build and complete precache/payload verification.
- `npm run check:precache`: inspect an existing production build.
- `node scripts/prepare-art.mjs input.png output.png --palette`: indexed-PNG preparation for flat art. Omit `--palette` for true-color art.

See [the design](docs/design.md), [v1.1 implementation](docs/plans/v1.1-implementation.md), [verification evidence and limits](docs/v1.1-verification.md), [shared style](docs/style-bible.md), [future worlds](docs/design/future-worlds.md), and [adding a game](docs/adding-a-game.md).

GitHub Pages remains manual and disabled until the owner chooses to publish. This continuation does not merge or deploy.
