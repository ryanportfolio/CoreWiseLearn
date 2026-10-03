# 06. Technical architecture and performance

Research digest, 2026-10-02. Scope: Canvas 2D on a weak integrated GPU, the game loop and pooling, the asset pipeline, Web Audio, PWA delivery on GitHub Pages, hardening input against accidental browser actions, and the game registry. Items marked "judgment" are expert judgment, not a sourced result.

## What the scaffold gets right, and four things to change

The engine in `src/engine/` already has a fixed-step loop with interpolation, a scene stack, typed-array particles, a save module and a registry. A library would add little: LittleJS is about 36 KB gzipped at its core ([LittleJS](https://github.com/KilledByAPixel/LittleJS)) and Kontra is built for js13k with opt-in modules ([Kontra](https://straker.github.io/kontra/)). Borrow their structure, not their code.

Four defects found in the scaffold during this review:

| File | Current | Change | Why |
|---|---|---|---|
| `src/engine/loop.ts` | `maxFrameTime` 0.25 s | 0.05 to 0.1 s | 0.25 s allows 15 catch-up steps in one frame, the "spiral of death" ([Gaffer](https://gafferongames.com/post/fix_your_timestep/)); LittleJS clamps at 50 ms ([engine.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engine.js)). A slow frame becomes brief slow motion instead of a stutter and skip. |
| `src/engine/canvas.ts` | `MAX_DPR = 1` | 1.5, plus a backing-pixel budget (below) | The spec fixes the DPR cap at 1.5. |
| `vite.config.ts`, `src/main.ts` | `registerType: 'autoUpdate'`, `registerSW({ immediate: true })` | `prompt` mode, applied silently on the hub | autoUpdate reloads open windows when a new version lands and can wipe a round; the plugin docs recommend `prompt` and warn that switching later "can be a pain" ([vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/auto-update)). Decide before the first deploy. |
| `src/engine/save.ts` | a missing migration step returns an empty save | back up the raw blob first, never replace unmigratable data, go read-only when the stored version is newer than the code | Current behavior can wipe a sticker book on one schema slip. Chained `if (oldVersion < N)` steps follow [idb](https://github.com/jakearchibald/idb). |

## Recommended folder layout

```
src/
  main.ts                 boot, SW registration (prompt mode), first-gesture unlock
  engine/                 game-agnostic; never imports from games/
    loop.ts               fixed 1/60 s step, 50-100 ms clamp, visibilitychange pause
    canvas.ts             DPR cap, pixel budget, resize and zoom handling
    input.ts              pointer + keyboard, swept hit test, browser-action guards
    audio.ts              one AudioContext, buses, compressor, soft clip, voice cap
    sprites.ts            offscreen bake cache, glyph atlas
    particles.ts          typed-array pool
    scene.ts              pushdown scene stack with enter/exit
    save.ts               versioned save, backup slot, persist()
    registry.ts           { meta, load } entries
    events.ts             allocation-free event bus (numeric type + 2 numbers)
  app/                    hub-owned cross-game systems
    services.ts           typed service interface handed to games
    difficulty.ts         per-profile tier controller
    rewards.ts            stars, sticker draw, unlocks
    session.ts            visible-play timer for the break nudge
  scenes/                 hub, name-entry, sticker-book, break-nudge, celebration
  games/<id>/
    meta.ts               id, icon, themes, order (eager)
    index.ts              create(services): Scene (lazy)
    tiers.ts              three rows of plain numbers
    assets.ts             typed manifest of keys -> hashed URLs
  audio/                  sfx recipes, music sequencer
  dev/                    dev-only pages, gated on import.meta.env.DEV
public/
  config.json             developer-edited config, precached, read-only
  art/, sfx/              runtime-named assets (unhashed, must be precached)
scripts/
  build-sprites.mjs       trim, alpha-bleed, outline, palette snap, resize
  check-precache.mjs      fails CI if a public/ file is missing from the SW manifest
  check-loudness.mjs      OfflineAudioContext render + peak check
```

## Game registry and per-game contract

Make each registry entry eager metadata plus a lazy loader: `{ meta, load: () => import('../games/bubble-pop') }`. Vite splits each dynamic import into its own chunk ([Vite glob import](https://vite.dev/guide/features.html#glob-import)); Excalibur constructs scenes only when they are presented for the same reason ([Excalibur](https://excaliburjs.com/docs/scenes/)). The PWA precaches every chunk, so this saves first-load parse time, not offline safety. Keep the explicit ordered array: array order sets hub layout.

Keep the game contract small (judgment, modeled on LittleJS's five callbacks and Kontra's `init/update/render/isAlive`):

- A game exports `create(services): Scene`, a `tiers` table of three rows of plain numbers, and emits one `roundEnd({ stars, tags })`.
- The hub owns stars, celebration, sticker draw, save writes, mascot, mute and the break nudge. If each game wires its own rewards, the third game costs as much as the first.
- Overlays (yawn, celebration) are scenes pushed over a running round and popped back, using the existing `SceneManager` push and pop ([Nystrom, State](https://gameprogrammingpatterns.com/state.html)).
- Give audio a null implementation so a suspended or failed context no-ops instead of throwing ([Nystrom, Service Locator](https://gameprogrammingpatterns.com/service-locator.html)).

Wrap each `load()` in a catch that reloads the page once: after an update, old JS in memory can request a hashed chunk the new worker no longer serves (inference; test by deploying twice with a window open).

**Difficulty knob ownership (conflict).** The adaptive lens changes tiers only at round boundaries; the pop-game and timing lenses ease continuously after misses. Use both, on disjoint knobs, because two loops moving one parameter cause the "spiraling loop" Hunicke describes ([Hunicke 2005](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf)). The tier, set at round start, owns rise speed, count cap and spacing. The in-round breather owns only spawn gaps and the hit-padding bonus.

## Loop, pooling and allocation

- Simulate at a fixed 1/60 s and interpolate pooled entities from stored previous and current positions held as plain numbers. rAF follows the display rate, and 75, 120 and 144 Hz panels are common ([MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)), so without interpolation a 60 Hz simulation judders on them. Draw the cursor-following character at the latest pointer position, not interpolated state (judgment).
- Drive motion and the round timer from elapsed time, never frame counts. Chrome Energy Saver turns on when unplugged and "may" change game performance ([Google](https://support.google.com/chrome/answer/12929150)).
- Preallocate every pool at scene enter and choose a full-pool policy per pool: particles skip the spawn, bubbles cap spawns by tier so the pool never fills, sound voices evict the oldest ([Nystrom, Object Pool](https://gameprogrammingpatterns.com/object-pool.html)). Do not copy Kontra's pool, which doubles inside `get()` and sorts dead objects in `update()` ([pool.js](https://github.com/straker/kontra/blob/main/src/pool.js)). Remove dead items by swap or by walking backwards.
- Pause loop, music, AudioContext and nudge timer on `visibilitychange`, not `blur`. MDN calls blur and focus imperfect proxies and notes that tabs playing audio are not throttled ([Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)). Count the 20-minute nudge in visible play time only.
- Dev hooks behind `?debug`: forced tier, RNG seed, time scale, frame-time overlay, input record and replay. A fixed step plus a seeded RNG makes a recorded round replay exactly ([Gaffer](https://gafferongames.com/post/fix_your_timestep/)), which gives a repeatable perf run without unit tests.

## Canvas 2D on a weak integrated GPU

| Rule | Source |
|---|---|
| Pre-render every bubble, character and glyph to an offscreen canvas or ImageBitmap at final device size, cropped snug to its content; draw at integer coordinates with no scaling in `drawImage`. A loose 300x100 cache canvas lost the gain a snug 100x40 one gave. | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [web.dev](https://web.dev/articles/canvas-performance) |
| Never call `getImageData` on the game canvas. On the second readback Chrome disables GPU acceleration for that canvas for good; one stroke went from 0.1 ms to 47 ms. Hit-test with geometry. | [Chromium source](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/canvas/canvas2d/base_rendering_context_2d.cc), [schiener.io](https://www.schiener.io/2024-08-02/canvas-willreadfrequently) |
| No `willReadFrequently` on any canvas drawn per frame; it forces a software canvas. Do load-time pixel work on a throwaway canvas, then convert with `createImageBitmap`. | [MDN getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext) |
| No `shadowBlur` in the loop (treat `ctx.filter` blur the same, unmeasured); bake glows into sprites. | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [Chromium state](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/canvas/canvas2d/canvas_rendering_context_2d_state.cc) |
| No per-frame `fillText`. Bake a glyph atlas (letters, digits, keyboard keys) only after `document.fonts.load()` resolves; a canvas drawn before the webfont loads keeps the fallback face (researcher observation in Chrome). Caching text cut Firefox on Linux from 10 ms to 1 ms per frame. | [Sertic](https://www.mirkosertic.de/blog/2015/03/tuning-html5-canvas-filltext/) |
| Resize AI art at build time; if it must happen at runtime, use `createImageBitmap` with `resizeQuality: 'high'`. `imageSmoothingQuality` defaults to low and is not Baseline. | [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap), [imageSmoothingQuality](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality) |
| Order draws by state (bubbles, then sparkles, then HUD) and set `fillStyle`, `globalAlpha` and smoothing once per group. | [web.dev](https://web.dev/articles/canvas-performance) |
| Skip the `desynchronized` hint and an OffscreenCanvas worker in v1; desynchronized can tear and forbids DOM above a canvas with alpha. | [Chrome](https://developer.chrome.com/blog/desynchronized) |

**Main canvas alpha (conflict).** The architecture lens sets `alpha: false`; the perf lens allows it only with a full repaint each frame. These agree once stated precisely: keep `alpha: false` (already set) and fill the whole background every frame, because `clearRect` on an opaque canvas yields black ([HTML spec](https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently)). A/B test a CSS backdrop under a transparent canvas only if profiling shows fill rate is the limit.

**Pixel budget.** Fill load grows with DPR squared. A 1920x1080 panel at 150% Windows scaling has a 1280x720 CSS viewport but a 2.07 M px buffer, so the DPR cap alone does not bound fill. Cap backing pixels near 1.5 M, then step an invisible resolution scale of 1.0, 0.85, 0.7 when p95 frame time stays above about 20 ms for 2 s, with hysteresis (judgment). Assign `canvas.width` and `height` only when the integer size changes, since assignment clears and reallocates.

| Viewport (CSS px) | DPR 1 | DPR 1.5 | DPR 2 |
|---|---|---|---|
| 1366x768 | 1.05 M px | 2.36 M px | 4.20 M px |

**Memory.** Each bitmap costs width x height x 4 bytes: a bubble baked at 288x288 (192 CSS px at DPR 1.5) is about 332 KB, so 6 colors x 3 sizes is about 6 MB.

**Pixel art** needs integer device-pixel scales with `imageSmoothingEnabled = false` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled)). At DPR 1.25 a 3x CSS zoom is 3.75 device pixels and rows go uneven, so bake pixel sprites to the nearest integer device multiple for the current DPR.

**Sizing and zoom.** Run game logic in CSS px on a full-window canvas, so `clientX` and `clientY` are game coordinates and no `getBoundingClientRect` call sits in the per-event path. Do not letterbox a fixed 1280x720 stage: on short windows it scales targets below the 96 px floor (judgment). Detect DPR changes by re-creating a `matchMedia('(resolution: Xdppx)')` query after each change ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)), plus a `ResizeObserver`, and debounce the sprite re-bake by about 150 ms. No web API reports physical screen size ([MDN Screen](https://developer.mozilla.org/en-US/docs/Web/API/Window/screen)), so expose a `uiScale` multiplier in `config.json` for a one-time ruler calibration.

**Rasterizer drift.** Chrome is moving its rasterizer from Skia Ganesh to Graphite, launched first on Apple Silicon Macs ([Google](https://blog.google/chromium/introducing-skia-graphite-chromes/)). Cached bitmaps stay cheap on either backend; live vector paths are the exposed workload. Check `chrome://gpu` for "Canvas: Hardware accelerated". Chrome's blocklist disables accelerated 2D canvas on Windows only for 2010-era Intel and NVidia drivers ([software_rendering_list.json](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/gpu/config/software_rendering_list.json)).

## Asset pipeline

- One Node build script turns raw generator output into shipped assets: trim, alpha-bleed or premultiply before resizing (transparent pixels with black RGB cause dark fringes, [Real-Time Rendering](https://www.realtimerendering.com/blog/gpus-prefer-premultiplication/)), outline at final size, palette snap, resize to about 144 to 256 px, emit a typed manifest. Keep raw sources out of `dist`.
- Each game has a typed asset manifest built from `new URL('./bubble.png', import.meta.url).href` or `import.meta.glob('./art/*.png', { query: '?url', import: 'default' })`, with the key union derived from it so a typo fails to compile ([Vite](https://vite.dev/guide/features.html#glob-import)). Shared assets load at boot and game assets on scene enter ([Phaser loader](https://docs.phaser.io/phaser/concepts/loader)). A failed load falls back to a placeholder sprite, never a dead screen.
- Assets chosen by name at runtime go in `public/`, with every URL built from a literal `import.meta.env.BASE_URL`; the bracket form `import.meta.env["BASE_URL"]` is not replaced ([Vite build](https://vite.dev/guide/build)).
- v1 loads individually cropped ImageBitmaps. If an atlas is packed later: shape padding of at least 2 px, 1 px extrude, at most 2048x2048 (16 MB decoded) per game ([TexturePacker](https://www.codeandweb.com/texturepacker/documentation/texture-settings)).
- Keep the first-load precache under about 15 MB for v1 (judgment). Native toddler pop apps run 47 MB to 1.15 GB ([iTunes Search API](https://itunes.apple.com/search?term=bubble+pop+baby+games+toddler&entity=software&limit=8&country=us)), but a web first load is more sensitive than an app store install.

## Web Audio

- One shared AudioContext with the default `interactive` latency hint and no `sampleRate` option; a rate different from the device forces resampling and can add large latency ([Web Audio spec](https://webaudio.github.io/web-audio-api/)). Log `baseLatency` and `outputLatency` at boot.
- Pre-render SFX at boot into AudioBuffers with vendored ZzFX `buildSamples` (MIT; change its hard-coded 44100 to `ctx.sampleRate`) and play each hit as a one-shot source with `playbackRate = 2^(semitones/12)` ([ZzFX](https://github.com/KilledByAPixel/ZzFX)). Do not call `zzfx()` or the jsfxr play path: both create their own AudioContext and never call `resume()` ([ZzFX.js](https://raw.githubusercontent.com/KilledByAPixel/ZzFX/master/ZzFX.js), [sfxr.js](https://raw.githubusercontent.com/chr15m/jsfxr/master/sfxr.js)). Skip Tone.js: 76.6 KB gzipped with a 0.1 s default lookahead ([Bundlephobia](https://bundlephobia.com/api/size?package=tone), [Tone wiki](https://github.com/Tonejs/Tone.js/wiki/Performance)).
- Schedule music with a lookahead scheduler on the audio clock (25 ms timer, 100 ms lookahead), so music holds steady when canvas frames drop ([web.dev](https://web.dev/articles/audio-scheduling)). Prefer synthesized music: decoded audio costs 192 KB per second per channel at 48 kHz, so a 30 s stereo loop is 11.5 MB ([Adenot](https://padenot.github.io/web-audio-perf/)). If sampled loops ship, use WAV, FLAC or Ogg rather than MP3, which records no encoder padding and clicks at the loop seam ([Gapless playback](https://en.wikipedia.org/wiki/Gapless_playback)).
- Graph: a throwaway GainNode per voice, sfx and music buses, master gain, DynamicsCompressorNode, then a WaveShaper soft clip near -3 dBFS. The compressor is not a brickwall limiter and applies automatic makeup gain, so a low threshold makes the bus louder ([spec](https://webaudio.github.io/web-audio-api/#DynamicsCompressorNode)). Cap voices around 8 and steal the oldest. Set gain and pan once per voice; never write AudioParam automation every frame ([Adenot](https://padenot.github.io/web-audio-perf/)).
- Gate every SFX call on `state === 'running'` and drop sounds while suspended, never queue them; queued starts fire together on resume and a mashing child gets a loud burst (judgment). Mute ramps master gain to 0 over about 15 ms instead of suspending, so the scheduler clock keeps running.
- Loudness: calibrate once per laptop with a sound level meter to 70 to 75 dB(A) and store the result as `masterTrimDb` in `config.json`. The WHO-ITU child figure is 75 dB for 40 hours a week ([WHO](https://www.who.int/publications/i/item/9789241515276)). A CI script renders each mix with OfflineAudioContext and fails on peak overruns.

**Audio unlock gesture (conflict).** Lenses disagree between the first name-entry keystroke, a click on a big start button, a deliberate click or key on the hub, and no start gate at all. The facts: Chrome's own unlock snippet listens for click, contextmenu, auxclick, dblclick, mousedown, mouseup, pointerup, touchend, keydown and keyup, and no hover or mousemove event ([Chrome](https://developer.chrome.com/blog/web-audio-autoplay)). MDN lists keydown (except Esc) and mousedown as activating events ([User activation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation)). Chrome says activation events are "still to be defined consistently across browsers" and recommends click ([autoplay](https://developer.chrome.com/blog/autoplay)). Recommendation: no "press to start" screen. Register capture-phase listeners for pointerdown, pointerup, click, keydown and keyup from boot. The first event creates or resumes the context and plays its own sound in the same handler. Keep the listeners until `statechange` reports `running`, and re-arm them whenever the state leaves `running`. Attract mode runs silent until then, and the mute icon shows a distinct "not on yet" state. Verify keydown unlock on the target Chrome and Edge builds; if it fails, the first click on the on-screen keyboard is the fallback.

## PWA and GitHub Pages

- Precache everything the game needs at install. This departs on purpose from Workbox's "precache less" advice ([Workbox](https://developer.chrome.com/docs/workbox/precaching-dos-and-donts)), because a 4 year old cannot diagnose a missing sound. vite-plugin-pwa precaches only js, css and html by default and drops files over 2 MiB; the current `globPatterns` is correct and must keep `html` ([static assets](https://vite-pwa-org.netlify.app/guide/static-assets), [FAQ](https://vite-pwa-org.netlify.app/guide/faq)).
- Load audio with `fetch` plus `decodeAudioData`, not `<audio>`, which avoids the service worker range-request problem ([Workbox media](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)).
- Use `prompt` mode and call `updateSW(true)` with no visible prompt, on the hub after a celebration. A waiting worker never activates on a refresh while a window stays open ([lifecycle](https://web.dev/articles/service-worker-lifecycle)). Check for updates on hub entry and hourly, skipping when offline, through `onRegisteredSW` ([periodic updates](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates)).
- GitHub Pages sends `max-age=600` with no header control ([community thread](https://github.com/orgs/community/discussions/11884)), so cache correctness comes from hashed filenames and Workbox revisions. Keep `sw.js` at one URL.
- Project sites share the `<owner>.github.io` origin, and quotas and eviction apply per origin ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). Prefix every storage key and cache name (for example `cwl.v1.`), never call `localStorage.clear()`, and consider a custom domain.
- Call `navigator.storage.persist()` after the first finished round; Chromium decides silently ([web.dev](https://web.dev/articles/persistent-storage)). Autosave on each award and on `visibilitychange` to hidden, never on `unload` ([Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)). Keep a developer-only JSON export.
- Manifest: explicit `id`, `start_url` and `scope` ending in `/<repo>/`, plus 192 and 512 px icons ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)). One `index.html` and no client routes, so the precached page answers every offline launch.

**Manifest display mode (conflict).** One lens uses `standalone`, another `fullscreen` with a `display_override` chain. The manifest fullscreen mode is separate from the Fullscreen API and the browser may override it ([MDN display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display)), and no source confirms desktop Windows honors it. Recommendation: `"display_override": ["fullscreen"]` with `"display": "standalone"`, so the guaranteed fallback is a window with no tabs or address bar, plus a scripted `requestFullscreen()` from the first real click or key. Layout must work windowed either way.

## Input hardening

| Hazard | Guard | Source |
|---|---|---|
| Right, middle, back and forward buttons | Act on `pointerdown` with no button filter; `preventDefault` on `contextmenu` | Some 4 year olds click mostly with the right button ([Hourcade](http://www.cs.umd.edu/~bederson/images/pubs_pdfs/p1411-hourcade.pdf)); [MDN contextmenu](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event) |
| Scroll, pinch zoom, swipe back | `overflow: hidden` and `overscroll-behavior: none` on html and body, `touch-action: none` on the canvas, a `{ passive: false }` wheel listener that cancels `ctrlKey` events, cancel Ctrl with plus, minus and 0 | [MDN wheel](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event), [overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior) |
| Held keys | Skip `event.repeat` for appending letters and for full sounds | [MDN repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat) |
| Wrong letters on AZERTY | Name entry reads `event.key` uppercased; game controls may use `event.code` | [MDN code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) |
| F5, Backspace, Tab, Space scroll | `preventDefault` on non-modifier keydowns; ignore modifier-only presses | judgment; test per browser |
| Esc, Ctrl+W, Alt+F4, Win, Alt+Tab | Try `navigator.keyboard.lock()` in scripted fullscreen (Esc then needs a 2 s hold); re-request fullscreen on the next click or key after a cooldown; no `beforeunload` dialog, which a non-reader cannot answer | [Chrome Keyboard Lock](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock), [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) |
| Fast sweeps skipping bubbles | Segment-versus-circle test from the previous to the current pointer position, in scalars; reset the previous position on pointer re-entry | Browsers coalesce moves and lose accuracy on fast movement ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents)) |
| Sticky Keys popup, three-finger gestures | One-time OS setup in the README: accessibility hotkeys off, touchpad gestures set to Nothing | [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-stickykeys), [BabySmash README](https://github.com/shanselman/babysmash) |

Skip Pointer Lock: Esc always exits it and re-locking needs a fresh gesture ([W3C](https://w3c.github.io/pointerlock/)).

**Cursor rendering (conflict).** Art direction hides the OS cursor and draws a large character with a halo; the input and pop-game lenses keep the native cursor. A canvas-drawn pointer trails the OS cursor by at least a frame, more when the GPU drops frames (judgment), and Chromium ignores custom cursor images larger than 128x128 and recommends 32x32 ([MDN cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/cursor)). Recommendation: keep the native cursor visible (optionally a custom image of at most 128 px with a keyword fallback), hit-test on the real pointer, draw a soft halo at the true hit radius on the canvas, and make the character a trailing buddy on a damped spring.

**Hit padding (conflict).** Values across lenses run from +12 px to 1.5x radius. One rule (judgment): hit radius is drawn radius x 1.25 + 8 px at tier 1, x 1.15 + 8 px at tier 2, x 1.0 + 8 px at tier 3, never below a 48 px radius (96 px diameter). At every tier, a click or key press snaps to the nearest bubble within 1.5x its radius. Padding varies by tier and belongs to the in-round breather, not the tier controller.

## Logging and comfort settings

**Logging (conflict).** The ethics lens forbids analytics and tracking session length; the adaptive and learning lenses want per-wave logs. Keep two separate stores. The difficulty controller keeps the few numbers per profile it needs to work. A playtest log is off by default (`playtestLog: false` in `config.json`), uses round-relative times only, has no daily or cumulative time field, uses profile slot 0 or 1 instead of the typed name, never leaves the device, and is wiped on export. FTC COPPA FAQ F.5 treats on-device data that is never transmitted as not collected ([FTC](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)). Store it in a preallocated `Int32Array` ring of 4096 rows x 4 ints (64 KB), so logging adds no per-frame allocation (judgment).

**Motion and comfort (conflict).** The spec allows only developer-edited JSON. Read `prefers-reduced-motion` at boot and on change into one `motionScale` multiplier ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)), and allow a per-profile override block in `config.json`. Both fit the spec, and neither needs child-facing UI.

## Measurable perf checks

Run on the children's laptop, in Chrome and Edge stable, plugged in and on battery, at the laptop's real Windows scaling.

| Check | Pass | How |
|---|---|---|
| Frame drops in the worst-case scene (tier 3, 4 simultaneous pops, celebration confetti) | under 1% dropped frames over a 60 s window; p95 frame time at or under 16.7 ms | DevTools Frame rendering stats and Performance panel ([web.dev smoothness](https://web.dev/articles/smoothness), [DevTools](https://developer.chrome.com/docs/devtools/rendering/performance)); in-page rAF FPS counters are a dev aid only |
| Per-frame allocation | flat JS heap during a round, no GC pause in a 60 s recording | Performance panel memory track |
| GPU raster | "Canvas: Hardware accelerated" | `chrome://gpu`, `edge://gpu` |
| Software fallback | about 30 fps held | launch with `--disable-gpu` |
| Fill-rate bound | if halving the resolution scale fixes drops, GPU fill is the limit | resolution scale key under `?debug` |
| Input to feedback | sound and burst start on the hit frame; under 100 ms end to end | Swink's 100 ms real-time ceiling ([review](https://lizengland.com/blog/2015/08/review-game-feel-by-steve-swink)); 240 fps phone video |
| Live particles | at most about 150 | counter overlay (judgment; tune by profiling) |
| Backing pixels | at most 1.5 M | log at each resize |
| First load | precache under about 15 MB; hub visible in about 1 s (judgment) | Network panel, SW manifest size |
| Offline | load, wait for the worker to control the page, go offline, normal reload, play a full round | Playwright against `vite preview` with the real base path; never shift-reload, which bypasses the worker ([lifecycle](https://web.dev/articles/service-worker-lifecycle)) |
| Precache completeness | every `public/` file present in the manifest | `scripts/check-precache.mjs` in CI |
| Third-party origins | zero | Network panel; self-host fonts ([Munich ruling](https://thehackernews.com/2022/01/german-court-rules-websites-embedding.html)) |
| Update safety | deploy twice with a round open; the round finishes and the update applies on the hub | manual |
| Audio headroom | no clipping at 20+ clicks per second; peak at or under -3 dBFS | OfflineAudioContext render in CI |
| Lockdown matrix | every key and gesture in the input table tested as the child's account | manual, after each Windows feature update |

Re-run this suite on each Chrome stable release while the Graphite rollout continues.
