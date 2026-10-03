# Design brief

What the hub is for, what it refuses to do, and the decisions behind it. Rules that every game and every pull request follow. The research behind them is in `docs/research/`.

## Who and where

Two children, aged 4 and 5, playing alone on a Windows laptop with a mouse or trackpad and a keyboard. They recognize letters and numbers but cannot read. An adult is often in the room but not watching the screen. The laptop has an integrated GPU.

## What "addictive" means here

The owner's word for the goal is "addictive". Confirmed reading (owner, 2026-10-03): children come back because play is delightful, because they get better at it, and because their world grows. Never because something pressures, nags, or threatens loss. The red lines below are how that reading is enforced.

## Red lines

Any pull request that crosses one of these is wrong, whatever else it improves.

1. Reading is never required to navigate. Letters, words, numbers, and shape names can be play material, supported by demonstrations and, in future learning games, spoken cues.
2. Nothing is ever wrong, locked or lost. No game over. Misses only ease the hidden difficulty. Every finished round earns at least one star. A sticker choice follows while the game still has stickers the profile has not collected. With `rewardsEnabled: false` in `public/config.json` (an adult option, for example a reward-free week), finished rounds add no stars or stickers to the profile; existing collections stay intact.
3. No pressure characters. The mascot and any future pet are never sad, hurt, hungry or pleading, and never react to the child leaving.
4. No autoplay. Round games end on a still screen with Again and Home of equal size and brightness; nothing starts by itself. Creative games save creations when the child leaves and need no forced round or score.
5. No streaks, timers that punish, daily quotas, countdowns, or anything that rewards coming back on a schedule. The break nudge is the one asymmetry, and it leans toward stopping.
6. No random reward drops, no rarity, no gambling shapes. A sticker is a gift for finishing a round while uncollected stickers remain; the child chooses between two visible stickers. Offers come from the first sticker page (8 stickers per page) that still has uncollected stickers, so when only one sticker on that page is left, the child is offered that one sticker alone and still picks it. A completed collection remains playable without an endless upgrade ladder.
7. Everything to play is open from the start: every game, picture and mode. Nothing unlocks, so stars and the hidden tier never decide what a child can play.
8. Every interactive target is at least 96 CSS px on its shortest side, checked with a ruler on the real laptop (`uiScale` in config).
9. Mouse, trackpad and any key all work; there is no wrong button; any mouse button counts as a click.
10. Nothing leaves the device: no network calls at runtime except fetching the app's own files (no third-party requests, no analytics, nothing about the child sent anywhere), no external links. Play time is never tracked beyond the session nudge.
11. Avoid full-screen flashes and saturated-red flashes. Inspect combined effects during dense pops and celebrations. Individual effect limits alone do not establish formal flash-threshold compliance.
12. 60 fps on the integrated GPU, with the runtime resolution scale as the safety valve.

## Fixed decisions and why

- Vanilla TypeScript, Canvas 2D, Vite, installable PWA. Smallest bundle, fewest moving parts, works offline. See `.claude/reference/tech-stack.md`.
- Each world may use its own medium and palette. Bubble Bay keeps its chunky illustrated style; future dinosaurs can resemble clay, trains wooden toys, and workshops paper cutouts. Navigation symbols and interaction rules remain familiar. Generated assets may animate through reviewed parts or frames; code renders letters, numerals, and exact quantities.
- No voice for now (owner, 2026-10-03). The owner plans Gemini text-to-speech later, after everything else is done; name entry is a keyboard toy with one fixed note per letter until then. The research notes that 26 short letter-name clips would be the highest-value audio for letter learning.
- Owner composes the music. The app plays `public/music/<track>.mp3` quietly and crossfades between scenes; no procedural music ships.
- Sounds are warm and low. Every pitched effect sits on one pentatonic scale, no lead above C6, everything low-passed near 3 kHz. The owner rates effects in the sound lab (`docs/sound-lab.md`); ratings live in `docs/audio/`.
- Three hidden motor difficulty tiers, changed only between rounds after observed play. Learning games track content separately when their actions provide evidence about that skill. Bubble Bay's counting jar is exposure, not a test of counting knowledge.
- Each profile owns its progress, collections, creations, and future world. Stable IDs survive renaming; unnamed avatar profiles are saved. Profiles never merge or disappear automatically.
- Stars in Bubble Bay reflect attainable round accomplishments, never past records: finish, five pops, ten pops. The introductory eight-pop round earns three stars. Combos change feedback only. These counts are initial playtest settings.
- Browser and operating-system reduced-motion preferences are ignored by explicit owner direction. Full normal animation remains, including brief reward reveals and a still rest screen.
- Local only until the owner says otherwise. GitHub Pages is the eventual host.

## Pull request checklist

- [ ] Navigation needs no reading; learning text has a demonstration or spoken support.
- [ ] No character shows sadness, hunger or disappointment.
- [ ] Every round still ends on a still screen with equal Again and Home; creative play can save and leave freely.
- [ ] No reward depends on chance, streaks or the clock.
- [ ] Every new target measures at least 96 CSS px at `uiScale` 1.
- [ ] Any key and any mouse button still work everywhere.
- [ ] No per-frame allocation, `shadowBlur`, gradient or `fillText` in a hot path; `workMax` under budget.
- [ ] Zero console errors on every dev page and on the full flow.
