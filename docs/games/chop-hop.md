# Chop Hop

Chop Hop replaces Bubble Bay's octopus tile in the first hub slot. It uses the supplied study's current game, custom sword skins, models, worlds, controls, and math bonus. Bubble Bay's saved progress and stickers stay in existing profiles.

The game runs in an iframe at `/games/chop-hop/index.html`. Its Home and sound buttons belong to the hub and stay visible. Escape enters or leaves fullscreen. If the browser needs another gesture before entering fullscreen, the next tap or key completes the request. Tab moves to Home, then sound, then back into the game. Mouse, touch, and the supplied game's keyboard controls work inside the frame. The money counter sits below Home at every screen size.

The supplied animated loading intro is registered before the engine begins loading assets. The hub initially shows the same background and logo, then uncovers the iframe as soon as the intro's artwork is ready, so the progress animation remains visible while the game loads.

The parent gives the frame the selected profile's `chop-hop.save` before PlayCanvas starts. The frame keeps `ChopHop_Save` in memory and sends writes to the parent. It never reads an old shared game save. Leaving flushes the current game save into the profile. Break screens hide the frame and pause its simulation, sound, and pending transitions until play resumes.

Wibble says "Chop Hop!" on the hub. The supplied game has sound effects; its existing math bonus has no spoken numbers yet, recorded in `scripts/voice/exempt.json`.

## Export

Run `node scripts/export-chop-hop.mjs <study-folder>` to copy the effective mod-over-original game into `public/games/chop-hop/`. The exporter does not build or change the study. The iframe bridge is maintained in `public/games/chop-hop/corewise-bridge.js`. `export-manifest.json` records the exported files and hashes. The hub icon uses the supplied blue sword shop icon, encoded as WebP.

The static package is about 38 MB before compression. The PWA precaches its HTML, engine, scene, audio, textures, GLBs, and physics files. Every runtime request stays on the site's own origin.
