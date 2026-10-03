# Motion rules for the hub and games

Distilled from the motion-design skill's references on 2026-10-02, keeping only what applies to in-game animation for a 4 and 5 year old on a weak laptop. Trailer and video rules live in that skill and are not repeated here. Numbers are starting values; tune by eye in a dev page, then record what you kept.

## Easing and timing

- Arrivals ease out (cubic or quint). Never scale up from 0: start at 0.9 or larger, or come down from above 1 for a slam. Exits ease in at about 75 percent of the entrance duration. Things already on screen that move use ease in-out.
- Playful or physical motion uses a spring tuned by visual duration and bounce, so the element lands on time and the bounce plays after. Keep bounce at or below 0.4 for UI; letter and bubble pops may go higher.
- UI durations: 150 to 300 ms. Button hover grow and press squash: 90 to 120 ms. Scene transitions: 400 to 700 ms.
- Stagger a group so it does not read as one block: 20 to 40 ms between items for lists of keys or tiles; never wait for one item to finish before the next starts. Per-letter stagger belongs only to typing effects.
- Contrast carries feel: put slow drift (bubbles rising, mascot bob) beside fast snaps (a pop, a key press). Even timing on everything reads as mechanical.
- Secondary motion keeps held things alive: a per-item phase shift such as `cos(t + i * 1.5)` for sway, started while the entrance is still running, never after.
- Holds: after a celebration beat lands (stars, sticker), hold the layout still for 1.5 to 2 s with only shimmer, sway or twinkle moving, then let the child act.

## Squash, stretch, hitstop

From shipped code, as starting values:

- A hit object pops to scale 1.2 in 0.05 s, then springs back over 0.6 s with elastic-out, the two axes offset by 0.05 s (Juicy Breakout).
- Jump squash 0.6 wide by 1.4 tall, landing 1.4 by 0.6; scale returns to 1 at about 1.75 per second (Celeste).
- A moving object stretches `1 + 0.3 * speed` along travel and `1 - 0.2 * speed` across it, clamped to 0.85 to 1.35.
- Hitstop freezes the whole scene for 0.05 s (3 frames) on a normal hit and up to 0.1 s on a big one; longer kills the energy. Implement as a time-scale multiplier so it can also be a slowdown.
- Polish never changes the simulation: hitboxes and state stay independent of visual squash, shake and hitstop (Swink).

## Effects

- Explosion shape: fast out, slow away. The burst reaches full size in 2 or 3 frames, then drifts; a ring starts thick and thins rather than fading; one flash frame at most.
- Hit frame about 0.1 s, then staggered dissipation: kill the main glow first, sparks and dust last. Alpha curve 0, 0.5, 0.
- Scale feedback to importance. Both no juice and extreme juice lowered play time and motivation in a 3,018-player study; medium and high won. Save the biggest burst for one or two moments per round (combo milestone, round end).
- Effects must not contradict the material: no dust clouds underwater, no hard bounces on soft things.
- Shake is salt. For this audience, shake the victim (the bubble, the tile), not the camera. If a screen shake is ever used, keep it under 6 px and 0.15 s, drive it from smoothed noise, and use it once per round at most.
- Tempo carries intent: safe and calm effects pulse below about 60 beats per minute; nothing in these games should move faster than a heartbeat except a pop burst.

## Safety and comfort

- Flash limits: at most 3 flashes in any second, or space them 334 ms apart; flashed area under about 20 percent of the frame; no saturated red flashes. A full-screen white hit frame counts as a flash.
- Keep the full normal animation regardless of the browser or operating-system motion preference. Reward reveals remain brief and the final rest screen remains still.
- Pause everything when the tab is hidden; the loop already does this.

## Sound sync

- The visual hit lands on the audio hit or up to one frame before it, never after. Schedule sound on `AudioContext.currentTime` from the same event that starts the visual.
- Leave space before a big hit: the round-end fanfare reads better after 200 to 300 ms of quiet.

## Pitfalls to check in review

- Everything moving at once with even timing.
- Ease-in on arrivals, or scaling from 0.
- Layout checked only at key poses; collisions show up mid-transition.
- Static holds that look dead, or constant motion that never lets the eye rest.
- Juice on everything.
- Per-frame state that one scene sets and never clears, so re-entering a scene renders differently from a fresh load.
