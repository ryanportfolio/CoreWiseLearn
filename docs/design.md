# Design brief

What the hub is for, what it refuses to do, and the decisions behind it. Rules that every game and every pull request follow. The research behind them is in `docs/research/`.

## Who and where

Two children, aged 4 and 5, playing alone on a Windows laptop with a mouse or trackpad and a keyboard. They recognize letters and numbers but cannot read. An adult is often in the room but not watching the screen. The laptop has an integrated GPU.

## What "addictive" means here

The owner's word for the goal is "addictive". Confirmed reading (owner, 2026-10-03): children come back because play is delightful, because they get better at it, and because their world grows. Never because something pressures, nags, or threatens loss. The red lines below are how that reading is enforced.

## Red lines

Any pull request that crosses one of these is wrong, whatever else it improves.

1. No instruction text. The only text on screen is a child's name and numbers.
2. Nothing is ever wrong, locked or lost. No game over. Misses only ease the hidden difficulty. Every finished round earns at least one star and a sticker.
3. No pressure characters. The mascot and any future pet are never sad, hurt, hungry or pleading, and never react to the child leaving.
4. No autoplay. Every round ends on a still screen with Again and Home of equal size and brightness; nothing starts by itself.
5. No streaks, timers that punish, daily quotas, countdowns, or anything that rewards coming back on a schedule. The break nudge is the one asymmetry, and it leans toward stopping.
6. No random reward drops, no rarity, no gambling shapes. A sticker is a gift for finishing a round; the child picks one of two.
7. All games stay open. Unlocks come from book and page completion, never from star thresholds, so the hidden tier can never split the siblings' collections.
8. Every interactive target is at least 96 CSS px on its shortest side, checked with a ruler on the real laptop (`uiScale` in config).
9. Mouse, trackpad and any key all work; there is no wrong button; any mouse button counts as a click.
10. Nothing leaves the device: no network calls at runtime, no analytics, no external links. Play time is never tracked beyond the session nudge.
11. Flashes: at most 3 per second, under 21,824 CSS px squared, never saturated red.
12. 60 fps on the integrated GPU, with the runtime resolution scale as the safety valve.

## Fixed decisions and why

- Vanilla TypeScript, Canvas 2D, Vite, installable PWA. Smallest bundle, fewest moving parts, works offline. See `.claude/reference/tech-stack.md`.
- Flat chunky vector art, generated as still images and reviewed by hand. Anything that animates or must be recognized repeatedly (mascot poses, UI, counters, letters, numerals) is drawn in code or reviewed frame by frame; the model never draws letters, numerals or counted items.
- No voice for now (owner, 2026-10-03). The owner plans Gemini text-to-speech later, after everything else is done; name entry is a keyboard toy with one fixed note per letter until then. The research notes that 26 short letter-name clips would be the highest-value audio for letter learning.
- Owner composes the music. The app plays `public/music/<track>.mp3` quietly and crossfades between scenes; no procedural music ships.
- Sounds are warm and low. Every pitched effect sits on one pentatonic scale, no lead above C6, everything low-passed near 3 kHz. The owner rates effects in the sound lab (`docs/sound-lab.md`); ratings live in `docs/audio/`.
- One hidden adaptive difficulty per game, three tiers, changed only between rounds, never shown.
- Local only until the owner says otherwise. GitHub Pages is the eventual host.

## Pull request checklist

- [ ] No new text a child would need to read.
- [ ] No character shows sadness, hunger or disappointment.
- [ ] Every round still ends on a still screen with equal Again and Home.
- [ ] No reward depends on chance, streaks or the clock.
- [ ] Every new target measures at least 96 CSS px at `uiScale` 1.
- [ ] Any key and any mouse button still work everywhere.
- [ ] No per-frame allocation, `shadowBlur`, gradient or `fillText` in a hot path; `workMax` under budget.
- [ ] Zero console errors on every dev page and on the full flow.
