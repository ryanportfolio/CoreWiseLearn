# Tech stack

> Non-default library choices and WHY they were made, so future sessions don't "fix" deliberate picks.

## Who this is for

A browser game hub for two children aged four and five who cannot read. It runs on one Windows laptop with a low-end integrated GPU at 1366x768, driven by mouse or trackpad and keyboard. Everything below follows from that: the machine is slow, the audience cannot read instructions, and the app has to keep working when the Wi-Fi does not.

## Choices

- **Vanilla TypeScript, no game framework.** The games are small 2D activities. A framework (Phaser, PixiJS) would add hundreds of kilobytes, its own update loop, and an abstraction layer to learn and work around. `src/engine/` holds the dozen small pieces the games actually need (loop, scenes, input, audio, particles, sprites, save, difficulty, session timer, registry, canvas), each a short typed module.
- **Canvas 2D, not WebGL.** On an integrated GPU, Canvas 2D is hardware accelerated for the fills, images and text these games draw, and it has no shader compile, context loss or driver variance to debug. Device pixel ratio is capped at 1.5 in `canvas.ts` so the backing store never grows past what the GPU can fill at 60 Hz.
- **Fixed 60 Hz update with render interpolation** (`loop.ts`). Game logic runs the same number of steps per second regardless of the display refresh rate, which keeps movement and timing-based difficulty consistent. The loop pauses while the tab is hidden and clamps long gaps so a sleep or debugger stop does not fast-forward the simulation.
- **Vite** for the build. Fast dev server, one config file, static output that GitHub Pages can host. `base` is `/CoreWiseLearn/` because Pages serves project sites under the repository name.
- **vite-plugin-pwa** uses `registerType: 'prompt'` with every runtime asset precached. Updates wait until the child is on the hub and flush saves before reload; a page no worker controls yet reloads once the new worker activates (details in `architecture.md`). The precached `config.json` is used only without a network answer, after the last fresh answer stored in localStorage: `src/app/config.ts` requests it with a query string the precache does not match, so an adult's edit applies on the next load. `scripts/check-precache.mjs` checks every public asset, reports total precache bytes, and fails if the service worker sets `ignoreURLParametersMatching`; the former 5 MB limit was removed by owner direction.
- **No runtime dependencies.** Development packages are `vite`, `typescript`, `vite-plugin-pwa`, `@types/node`, and `sharp` for offline image preparation. Andika is bundled locally with its OFL license. The service worker includes generated Workbox code.
- **Strict TypeScript** with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`. The cost is a few `?? 0` guards on typed-array reads; the benefit is catching the undefined-index bugs that otherwise show up as NaN positions on screen.
- **GitHub Pages via GitHub Actions** (`.github/workflows/deploy.yml`) as the eventual host. No hosting account, no secrets, no server. The workflow is manual-trigger only until Pages is enabled; see `deployment.md`.
- **localStorage for saves** (`save.ts`), versioned with a `schemaVersion` and a migration hook. The data is a few kilobytes per child; IndexedDB would be more machinery for no gain. The app does not call `navigator.storage.persist()` (owner decision, 2026-10-03): Firefox answers it with a written prompt the children cannot read. Without that request the saves are not protected from eviction, so a browser short on disk space could clear the site's data. The research docs that recommend the call are dated records, not the current rule.
- **Procedural sound first** (`audio.ts`). Short oscillator blips need no asset files and no decoding; the music slot accepts an `AudioBuffer` for when real tracks arrive. The AudioContext is created lazily and resumed on the first click or key press because browsers block audio before a gesture.
- **Input hardening in `input.ts`.** Wheel, touch scrolling, context menu, drag and the keyboard shortcuts that navigate or scroll (Space, Backspace, Tab, arrows, Ctrl+R and friends, F1/F3/F5/F6/F7/F10/F12) are blocked at the window level. F11 is deliberately left alone so an adult can toggle fullscreen.

## Performance caps

From the Canvas 2D probe of 2026-10-02 (`.tmp/perf-probe/` on the dev box; results under `D:\screenshots\CoreWiseLearn\perf-probe\`), run on a desktop GPU with 4x CPU throttling and halved again to stand in for the children's laptop. CPU-side costs only; integrated-GPU fill rate was not measurable here.

| Item | Cap | Why |
|---|---|---|
| Simultaneous sprites via `drawImage` | 600 | About 2.4 us per sprite throttled; 600 leaves half the 12 ms busiest-frame budget free |
| Per-sprite `save/translate/rotate/scale/restore` | avoid on the common path | 1.75x the cost of an axis-aligned `drawImage`; pre-bake a few rotation frames instead |
| Live particles | 1500, drawn with `arc` + `fill` | Measured cliff: `drawImage` of a 4 px sprite goes from 3 ms at 500 to 28 ms at 3000, while `arc` for 3000 adds about 1 ms |
| Total `drawImage` calls per frame | under 1500 | Past roughly 2000 Chrome stops batching cheaply |
| `shadowBlur` | banned | 2x CPU measured; the per-draw blur pass is known to hurt integrated GPUs |
| Device pixel ratio | cap 1.5 and about 1.5 million backing pixels; runtime scale 1 / 0.85 / 0.7 | Delivered-frame and work measurements trigger sustained-load downscaling with hysteresis |
| Per-frame gradients, static `fillText` | cache anyway | Measured free on this GPU, unmeasured on an integrated one |
| Digits that change every frame | draw as cached sprites | Not measured; the only text in the games |

## Things to keep

- DPR: see the caps table. The engine's cap lives in `src/engine/canvas.ts` (`MAX_DPR`).
- Keep `dist/` precached in full. The hub must open with no network.
- Reading is never needed to navigate. Letters and words may be learning material with demonstration or speech support.

retired 2026-10-02: autoUpdate service workers and fixed DPR 1; reason: approved v1.1 safe-update and adaptive-resolution design.
