# Pitfalls

> Accumulated project-specific gotchas. Dated entries, newest at the bottom. If this file exceeds ~200 lines, split by area (`pitfalls-<area>.md`) and update the CLAUDE.md index.

## 2026-10-02: the playwright-iso MCP browser is one browser for the whole session

`.mcp.json` starts one `@playwright/mcp --isolated` server per Claude session, and every subagent in that session shares its single browser and page. `--isolated` means an in-memory profile, not one browser per agent. Observed: a `page.reload()` from the name-entry agent landed on the hub agent's tab, and an init script ran there and wrote five test profiles into that origin's localStorage. Cost: one polluted verification run and a re-seed.

Fix for parallel browser work: each agent opens its own `BrowserContext` through `browser_run_code_unsafe` and keeps every action on that page:

```js
async (page) => {
  const ctx = await page.context().browser().newContext();
  const p = await ctx.newPage();
  await p.goto('http://localhost:5182/dev/hub.html?seed');
  // ... checks on p ...
  await ctx.close();
}
```

Never mix `browser_navigate`, `browser_click` or `browser_snapshot` (which act on the shared page) with checks that another agent may be running. Separate dev-server ports per agent (5181 to 5184) keep origins, and so localStorage, apart.

Two more quirks of the same browser, both confirmed by two agents:

- `page.screenshot` with a relative path writes into the main checkout's `.tmp`, not the worktree's. Always pass an absolute path (under `D:\screenshots\CoreWiseLearn\`).
- `globalThis` does not survive between `browser_run_code_unsafe` calls, so a page handle made in one call is gone in the next. Keep a whole check in one script file passed with `filename`, or find your page again by scanning `browser.contexts()` for your port.
- The save store writes its in-memory data back on `pagehide`, so `localStorage.clear()` followed by a reload does not reset a profile. Use a fresh context, or seed with `addInitScript` guarded by a `sessionStorage` flag.

## 2026-10-02: Vite watched `.tmp` and reloaded every dev page on scratch writes

A smoke run lost its 75 s round when another agent wrote `.tmp/wa.html` and Vite full-page-reloaded the game. `server.watch.ignored` in `vite.config.ts` now excludes `.tmp` and `.playwright-mcp`. Source edits by a parallel agent still reload; run end-to-end checks after the builders finish, or on `npm run preview`. The same happens when `scripts/voice/generate.mjs` writes clips into `public/voice/<folder>/` (2026-10-05): files listed by an `import.meta.glob` are module dependencies, so each new clip reloaded every dev page and browser checks failed with "Execution context was destroyed". Render clips before browser checks, or give the check's dev server a config that adds `**/public/voice/**` to `server.watch.ignored`.

## 2026-10-02: stopping a background `npm run dev` leaves Vite holding the port

Killing the Bash background task that started `npm run dev -- --port 5183` ended the npm wrapper but not the Vite node process, which kept the port (two agents hit this, ports 5182 and 5183). Free it with `taskkill /PID <pid> /F` after `netstat -ano | findstr :5183`. Starting Vite with `node node_modules/vite/bin/vite.js --port 5183` as the background task does not reliably help: a later agent had that command refused by the command hook ("command contains control characters"), and a `.tmp/serve.sh` wrapper that `exec`s node still left the port held after the task stopped. Plan on the `taskkill` step, or give the owner the command for their own terminal tab.

The background task also ends by itself at its time limit, 30 minutes unless the Bash call sets `timeout` (at most 7200000 ms). On 2026-10-03 a dev server started with the default stopped partway through a long check run, and every page after that failed with `ERR_CONNECTION_REFUSED`, which cost a rerun. Give a dev server that has to outlast a long check the longest `timeout`.

## 2026-10-02: `loop.stats.mean` is the vsync interval, not the frame cost

The dev box has a 100 Hz panel, so `loop.stats.mean` reads 10.0 ms on every page no matter how little work a scene does. Two builders burned time trying to get it "under 4 ms". The budget number is `loop.stats.workMean` and `workMax` (milliseconds inside update plus render), added to `src/engine/loop.ts` for this reason.

The work numbers have their own blind spot (2026-10-03): `workSamples()`, `workMean` and `workMax` time only the update and render inside the frame callback. Work a scene does in `requestIdleCallback` (Bubble Bay prepares its end-of-round art there) is not counted, so a check of idle-time preparation must also read the delivered frame intervals (`loop.stats.samples()` or its own rAF deltas) to see whether that work delayed a frame.

## 2026-10-02: opening chrome://gpu in the probe window throttled the probe tab

In the Canvas 2D perf probe, opening `chrome://gpu` as a second tab of the probe's window before the run left the probe tab ticking at about 1 Hz after that tab was closed, and once crashed the page. Cost two aborted runs. Fix: capture `chrome://gpu` last, in its own `browser.newContext()`.

## 2026-10-02: this development machine is a desktop with a discrete GPU

The box is an AMD Radeon RX 6600 XT desktop with a 100 Hz panel, not the children's laptop. Frame times measured here say nothing about integrated-GPU fill rate; Chrome CPU throttling (4x) slows only the main thread. Treat every GPU-side cost under 10 ms as unmeasured, and read `.claude/reference/tech-stack.md` "Performance caps" for the numbers that were derived from the probe.

## 2026-10-03: running loop does not mean the name screen accepts input

`bootApp` starts the loop on a loading scene before the initial art promises finish and name entry is installed. A probe that typed after `loop.running` alone lost its first letters and created the wrong profile. Wait for the actual name scene (`window.__nameEntry` in a dev build; production needs the installed scene with `handleInput`) and its input guard before typing; verify the name before Enter. Production navigation and offline probes must use the same readiness condition.

## 2026-10-03: a passing typecheck through rtk can print nothing

The Bash hook runs commands through the rtk wrapper, which trims output. A passing `tsc` or `npm run typecheck` then prints nothing, or only npm's `> tsc --noEmit -p tsconfig.json` line, so the output alone does not show that the check ran and passed. Judge the result by the exit code (`npm run typecheck; echo "exit $?"`), not by the output.

## 2026-10-03: `img.decode()` does not spare a canvas draw the decode

In Chrome, awaiting `HTMLImageElement.decode()` does not stop the first canvas `drawImage` of that image from decoding it again: the first draw of a 1920x1080 WebP took about 9 ms either way (headed probe). A backed-out change cost one measurement round. What `src/engine/sprites.ts` does instead, in an idle callback for images of 1 M pixels or more: draw the image into a scratch canvas at its native size, draw both that canvas and the image into a 1x1 canvas with high-quality smoothing, then shrink the scratch canvas to 0x0. That makes Chrome decode the image ahead of time; every later draw still uses the image itself. If this early decode throws, the image still counts as loaded and its first draw pays the decode. `createImageBitmap(img)` also decodes ahead but blocks the main thread for the whole decode.

## 2026-10-03: a bake on a GPU canvas stalls the screen the first time a session uses its draw modes

The sticker offers' bakes (`src/ui/sticker-offer.ts`) ran in idle callbacks and took 0.3 ms of JavaScript, yet the first gifted celebration of every fresh browser froze for 55 to 75 ms. A Chrome trace showed the GPU process building shader programs (`shader_compile`, `D3DCompile`) for the bake's new mixes of image draw, `source-in` / `destination-in` / `destination-out` composites and path fills: about eight programs, 12 to 20 ms each, while the frames on screen waited. Later rounds in the same browser were smooth because the programs were built. Fix: bake on a CPU canvas (`getContext('2d', { willReadFrequently: true })`), which needs no shader programs; the GPU only uploads the finished canvas on its first draw.

A CPU canvas has its own trap: it records draw calls and draws them only when its pixels are next used (as a `drawImage` source, `getImageData`, or the first frame that shows it). Splitting a bake into steps across idle callbacks did nothing until each step ended with `ctx.getImageData(0, 0, 1, 1)`; before that, 60 recorded copies all drew inside one 10 to 12 ms step. Cost: one measurement round.

Measuring Bubble Bay's round end with no input during a `?debug&round=` round puts a 20 to 60 ms gap on the pick: the pick is then the page's first gesture, and the first gesture builds the audio graph (`src/engine/audio.ts`). Press a key during play so the measurement shows what a child who played sees.

## 2026-10-04: test harness traps when overriding config or leaving a dev page's scene

`src/app/config.ts` fetches `config.json?fresh=<time>`, so a Playwright route on `**/config.json` never matches and the page quietly keeps the repo's `uiScale`; route `**/config.json*` and read `window.__corewise.config` to confirm. A dev page holds one scene, and `scenes.pop()` does nothing when no scene is below, so the scene's `exit()` never runs; to test leaving, call `scenes.setTransition(undefined)` and then `scenes.replace(<empty scene>)`, which runs `exit()` at once. Cost: two reruns of a check that had passed on the wrong layout or without leaving.

## 2026-10-03: a preview or dev page keeps showing the old build after a merge

The app registers its service worker with `registerType: 'prompt'` and applies a waiting update only when the child reaches the hub (`src/main.ts`). A page opened on name entry after a rebuild keeps running the precached old build, so a fixed screen still looks unfixed. The owner saw the old name-entry keys after #10 merged and needed Ctrl+Shift+R (a hard reload bypasses the service worker); reaching the hub once also installs the new build. Before calling a change missing on a preview, hard-reload or check in a fresh browser profile.

## 2026-10-04: removing a worktree whose `node_modules` links to the shared install deleted part of it

Hand-made worktrees here link `node_modules` to one shared install (a directory junction, `mklink /J`). Cleanup ran `cmd //c "rmdir ..\<worktree>\node_modules"` from Git Bash; it printed "The system cannot find the path specified." and left the link in place, and the `git worktree remove --force` that followed deleted files through it: `.bin`, `vite` and `tsc` went missing from the shared install. Repair cost a stop of both running Vite servers (a running Vite holds `rolldown-binding.win32-x64-msvc.node` open, so `npm ci` fails with EPERM until they stop), `npm ci`, and a restart. Remove the link first and check it is gone before deleting anything: `node -e "const fs=require('fs'),p=process.argv[1];if(fs.lstatSync(p).isSymbolicLink())fs.unlinkSync(p)" <worktree>/node_modules` (Node's `unlinkSync` removes a junction without following it), confirm `find <worktree> -maxdepth 3 -type l` prints nothing, then `git worktree remove`.

## 2026-10-04: a background that finishes loading after the first layout draws at full size

A game scene computes its background's cover-fit scale in `layout()`, which runs on `enter()` and on resize. Ride Fare loads its own art in `enter()` without waiting, so the first layout ran before `launch-field.webp` had loaded, found no image and kept a scale of 1. The scaled background was made at that stale scale as soon as the image arrived, so it drew at its full 1920x1280 in a smaller window, cropped instead of fitted, and nothing remade it until the window size changed. Confirmed in Ride Fare round 3 (2026-10-04). Fix (`ensureBackground()` in `src/games/ride-fare/scene.ts`): compute the scale and offset from the loaded image at the moment the scaled background is first made, never from a value the layout stored while the image was missing. A game that loads art after `enter()` must do the same for every size it derives from an image's natural size.

## 2026-10-05: Gemini TTS on OpenRouter speaks its directions and misreads bare letters

`POST /api/v1/audio/speech` with `google/gemini-3.8-flash-tts` accepts only `response_format: "pcm"` (24 kHz mono 16-bit); `mp3` and `wav` return 400. A style instruction written before the line ("Say cheerfully, in a Yorkshire accent: ...") is read aloud. The `### DIRECTOR'S NOTES` / `#### TRANSCRIPT` input form usually keeps notes silent, but in the voice lab about one clip in six still read the notes aloud or added words ("Shh!", "First of all"), and a delivery note ("let the voice rise at the end") leaked on every retry until it was removed. A bare letter such as "M" comes back as its sound ("Mmm"); write the name ("Em!"). Every clip therefore goes through the transcription check in `scripts/voice/generate.mjs`, which re-renders mismatches. Cost: two lab reruns and a dropped prompt line.

## 2026-10-05: single-word clips fail the check on accents, v, and some punctuation

Rendering 330 one-word clips for Frog Pond (`scripts/voice/lines/frog-pond.json`) failed 24 lines after three renders each. Causes, confirmed by rerunning: the Yorkshire postman's short u (as in "put") is transcribed as another word ("bog" for bug, "jog" for jug, "took" for tug, "shot" for shut, "boon" for bun); the Highland teacher's short i comes back as "peg" for pig and "when" for win; "cot" is heard as "caught" and "fin" as "Finn" in every voice; "Vat" came back as "That" in all three voices nine times, so the word was dropped from the content. Punctuation matters for very short lines: "Cut!" and "Hid!" made the postman add whole sentences or read his notes three times running and passed at once as "Cut." and "Hid."; the London lad's "Shut?" and "Rid?" were heard as "Shot?" and "Red?" and passed as "Shut!" and "Rid!". Fix: add a real accent variant or same-sounding spelling to `accept` only after it fails the same way on every render, try another punctuation mark before changing a word, and list each accept in the game's doc. Cost: four rerun rounds.

## 2026-10-05: the playwright-iso browser plays sound aloud, and `launch-chrome.mjs` finds no Playwright here

The `mcp__playwright-iso__*` browser is not muted, so a check that catches bugs or presses buttons plays every sound and voice clip on the owner's speakers; the owner asked for muted checks. `scripts/lib/launch-chrome.mjs` needs `playwright` or `playwright-core`, which is not in this repo's `node_modules`. Fix used: copy `launch-chrome.mjs` and `window-place.ps1` into a scratch folder under `.tmp/`, link `.tmp/<folder>/node_modules/playwright-core` to an existing copy in the npx cache (`C:/Users/Home/AppData/Local/npm-cache/_npx/<hash>/node_modules/playwright-core`, any version; `channel: 'chrome'` uses the system Chrome) with `mklink /J`, and launch with `launchPlacedChrome({ place: 'offscreen', args: ['--mute-audio'] })`. `--mute-audio` silences output only: the AudioContext runs, so `window.__voice.log` still records every clip. Remove the junction with Node's `fs.unlinkSync` before deleting the folder (see the 2026-10-04 entry). Cost: one switch of browsers mid-check.
