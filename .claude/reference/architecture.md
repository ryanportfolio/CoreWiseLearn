# Architecture

> System flow, auth strategy, state management, cross-cutting structure. Keep it terse: pointers into code, not essays.

## 2026-10-02: v1.1 structure

`src/app/boot.ts` assembles config, canvas, input, audio, saves, sprites, session timing, scene manager, and loop. Config and the bundled display font load before scenes bake caches. `src/main.ts` owns navigation and applies waiting service-worker updates only from the hub.

Games receive `AppServices`, store separate bags under the active profile, and register in `src/engine/registry.ts`. Optional registry fields distinguish round/creative play and learning content. Bubble Bay is the only implemented game. Future worlds live in `docs/design/future-worlds.md`.

Saves use stable profile IDs, persisted avatar/color identity, and schema migrations. Every profile owns its rewards and future creations. Guests are saved profiles. Award choices must persist before animations and resume after re-entry. Corrupt, unsupported, or newer data must remain preserved.

The session timer counts visible time with an active profile. A due nudge waits for `services.roundBoundary()`; scene overlays must preserve the game. Full navigation clears overlays before replacing the root scene.

Rendering uses a fixed simulation step, interpolation, cached sprites/glyphs, and pooled particles. Resolution adjusts independently of CSS target sizes using delivered-frame intervals and work timings. Performance on the real children's laptop remains a separate acceptance check.

Save flushes compare this tab with its last persisted view, validate the latest stored document, and merge only local field/profile edits. Clean stale tabs do not write. A newer, malformed, or unsupported remote document stops writes and preserves its bytes. Different-profile edits are retained; simultaneous edits to the same field use the last successful write. Browser and OS motion preferences are deliberately ignored; motionScale is no longer a config option.
