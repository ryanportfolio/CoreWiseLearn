# Commands

> Build / dev / test / deploy commands for this project.

All commands run from the repo root with npm (Node 20.19 or newer, or 22.12 or newer, which is what Vite 8 and Rolldown require; 24 is what the machine uses).

| Command | What it does |
|---|---|
| `npm install` | Install development dependencies including sharp for offline art preparation. There are no runtime dependencies. |
| `npm run dev` | Vite dev server with hot reload at `http://localhost:5173/CoreWiseLearn/`. The service worker is not active in dev. |
| `npm run dev -- --port 5181` | Same, on a chosen port, so several agents can run a server at once. |
| `npm run typecheck` | `tsc --noEmit` against `tsconfig.json` (strict). Run before every commit. |
| `npm run build` | Production build into `dist/`, then check complete public-asset precaching and total byte reporting. |
| `npm run check:precache` | Check an already-built production bundle. |
| `node scripts/prepare-art.mjs input.png output.png --palette` | Prepare separate optimized flat-art output; omit palette for true color. |
| `npm run preview` | Serve `dist/` at `http://localhost:4173/CoreWiseLearn/`. Use this, not `dev`, to check offline behaviour and installability. |
| `node scripts/make-icons.mjs` | Regenerate the placeholder PNG icons in `public/icons/`. |

Per-scene dev pages: with the dev server running, `/CoreWiseLearn/dev/<scene>.html` boots one scene alone with stub navigation (see `dev/README.md`). Add `?seed` on hub pages for a test profile, `?round=10` and `?tier=2` on the bubble-pop page.

Deploy: manual only for now. `.github/workflows/deploy.yml` is `workflow_dispatch` and GitHub Pages is not enabled; see `deployment.md` for the steps to turn it on.

Frame-time measurement: the running app exposes `window.__corewise.loop.stats` (defined in `src/engine/loop.ts`), so a browser script can read timings without touching game code. Frame interval, the time between frames: `last`, `mean`, `max`, `p95`, `fps` and `samples()`. Work, the time spent in update plus render: `workLast`, `workMean`, `workMax`, `workP95` and `workSamples()`. Also `count` (samples held), `frames` (frames since start) and `updatesLastFrame`. `mean` is the time between frames, locked to the display refresh, not the update and render cost; read `workMean` and `workP95` for cost.
