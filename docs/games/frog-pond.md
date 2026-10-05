# Frog Pond

A round game for an early reader (first to second grade) on a pond. A frog sits on its lily pad and bugs fly over the water carrying words. This first pull request builds the game's shell and its first activity, **Rhyme snack**: the frog eats the bugs whose word rhymes with the word on its pad. Lily-pad sentences and Word pot follow in later pull requests (`docs/specs/2026-10-05-wibble-voice-and-frog-pond-design.md`). Learning tags: `words` and `sounds`.

The hub also serves a 4 and a 5 year old who cannot read. Nothing in Frog Pond needs reading to get around: the words are play material, every word is spoken by the time it matters, and the controls are the familiar Home, sound, Again and Home.

## The pond and its activities

Frog Pond opens on the pond with one spot per activity, each shown by a picture (Rhyme snack's is the frog on its lily pad). While Rhyme snack is the only activity, the game skips the pond and opens straight into it, so there is no extra press. The list of activities is `ACTIVITY_IDS` in `src/games/frog-pond/data.ts`; adding an activity adds its id there and a spot appears. Again replays the same activity; with more than one activity it returns to the pond. The chooser can be seen today with `?debug&pond` on the dev page: a press on a spot opens it; with keys, the first key shows focus, arrows and Tab move it, and any other key opens the spot.

## Rhyme snack: the action and its response

- **The target.** The round's word is drawn in big dark green capitals on the frog's lily pad, and the Scottish teacher says it 0.7 s into the round (once audio can play; the page's first press unlocks it). Pressing the frog or its pad says it again and the frog does a small hop. The word on the pad swells briefly each time it is said.
- **The bugs.** A ladybird, a bee and a dragonfly, taking turns, each carry a word on a cream card hanging from two short threads. They fly in from the sides one after another (0.35 s apart, quickly at first) and then wander slowly over the pond: above the frog, and down to the bank on either side of it. They turn gently on their own, bounce softly off the edges and the frog's box, and slide apart when their cards would overlap. The bee is drawn side on and turns round to fly left; the ladybird and the dragonfly face the child and lean into the way they fly. Wings flutter (a quick small squash) and the bodies bob slowly.
- **A rhyming bug.** The bug stops, the frog opens its mouth and its tongue (drawn in code: a pink line with a dark rim and a round tip) shoots out to the bug in 0.16 s. On contact the northern postman says the word, the next note of the round's tune plays and a small sparkle bursts at the bug. The tongue pulls the bug back in 0.24 s, the bug and its card shrinking as they go; on the gulp the frog switches to its puffed pose (eyes shut, cheeks round), wobbles wide then tall for 0.75 s, and sparkles burst from its head with a soft pop. A rhyme pressed while the tongue is out waits its turn and is caught next.
- **The tune.** Each catch plays the next note of a short phrase on the pentatonic scale (the `key` marimba sound): with 2 rhymes E4 then C5, with 3 C4 E4 C5, with 4 C4 E4 G4 C5. The last catch of the round always lands on the high C, then a sparkling `pop-big` finishes the phrase, so catching every rhyme finishes a tune. A dodge in between does not reset it.
- **A bug whose word does not rhyme.** It hops up and away from the pointer (or from the frog, with the keyboard), spinning once, its card wiggling, with a giggly "boing" (`button` C), and the London lad says its word cheekily. It then flies on, quickly at first. Nothing is lost and no bug leaves; the dodge only eases the hidden tier.
- **The water.** A press on open water makes a small ring of droplets and nothing else.
- **Round end.** When the last rhyme is gulped, the frog stays puffed, does a happy hop with a bright `go` chime and a sparkle burst 0.55 s later, and the round ends 1.5 s after the last catch.

The frog is content, curious or delighted. It never looks hungry, sad or impatient, and a bug that dodges is playing, never escaping.

## Hearing words

A word is spoken when it is used: the postman says a rhyme when the frog catches it, the London lad says a decoy when it dodges. Pointing at a bug says nothing at first, so the child reads the card before choosing.

**Word help** is the hidden help for a child who is stuck. It turns on in a round after 3 dodges, or after 14 s without a catch (not counting the introduction's demonstration); the teacher then says the target again. While it is on, pointing at a bug, or giving it keyboard focus, for 0.45 s makes the teacher say its word, once per stay, never over a word already being said. Word help carries into the next round when the round had 3 dodges or a long pause, and switches off after a round with no dodge at all. It is stored in the save bag (`assist`).

The spec's wording is that word help speaks words "on click". In Rhyme snack every press already settles the bug (caught or dodged, and spoken either way), so word help speaks a word when the child points at a bug or focuses it instead.

## Discovery without words

The first round ever is an introduction: the AT family, two rhymes and one decoy, flying slowly. 1.6 s in, the cartoon glove (Ride Fare's helper hand, turned to point down) comes down from above to the nearest rhyming bug, presses it and the frog catches it with the full response. Play input waits until that catch. The glove then taps the next rhyming bug, from above so its card stays in view, until the child does anything. The demonstrated catch records nothing.

In every later round (and in the introduction after its demonstration), after 8 s without a press or a pointer movement the see-through glove taps the rhyming bug nearest the frog for 2.4 s while the teacher says the target again, then fades. It repeats after another quiet 8 s.

## Round flow

1. **Play** until every rhyming bug is caught (see above).
2. **Celebration:** the frog bounces puffed on its pad, confetti, and three stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.2 s.
3. **Sticker choice,** while this game's four stickers are not all owned and `rewardsEnabled` is true: the shared `createStickerOffers` helper shows two stickers, each floating on a lily pad, with the small sticker book beside them. Same guard as every game: input ignored for 1.2 s, nothing focused, the first key only shows focus; `warm` and `warmBook` run during the celebration.
4. **Still rest:** the sticker book with the new sticker (or, with no gift, the frog on its pad with the round's word), the stars, and Again and Home of equal size and colour. `services.roundBoundary()` runs when rest is reached.

Stars: every finished round earns 3. Dodges never cost a star. Awards persist once, as in Ride Fare: round count, stars, the offered pair and the round's target go into the game bag's `pending` field with a unique round `id`, and `save.flush()` runs before the celebration shows. Leaving or reloading returns to the choice or the rest; leaving rest by any route clears `pending`.

## Words and rounds

Words come from `RHYME_FAMILIES` in `src/games/frog-pond/content.ts`: 18 families (-AT, -AN, -AP, -IG, -IT, -IP, -IN, -OG, -OP, -UT, -UG, -ET, -EN, -ID, -AG from the owner's list, plus -OT, -UN, -ED), 110 words, upper case on screen like the reader's own list. No word is in two families, so any other family's word is a safe decoy. "Vat" was taken out of the AT family: the voice model said "that" in all three voices, nine renders in a row.

A round (`planRhyme` in `rhyme-rules.ts`) picks a family other than the last round's, a target from it, the tier's number of other words from it as rhymes, and decoys from other families, one family each. At tiers 0 and 1 decoys come only from families with another vowel (CAT against DOG); at tier 2 one decoy shares the target's vowel (CAT against CAP), which is harder to tell apart. Any word can be the target.

## Hidden tier

| Tier | Rhymes | Decoys | Speed (px/s at 1366x768) |
| --- | --- | --- | --- |
| Introduction | 2 | 1 | 30 |
| 0 | 3 | 2 | 34 |
| 1 | 4 | 3 | 50 |
| 2 | 4 | 4, one with the target's vowel | 66 |

Speeds scale with the window. Each catch is a hit and each dodge a miss for the engine's adaptive tier (`createAdaptiveTier` in `src/engine/difficulty.ts`: window 10, at least 6 attempts, up at 85 percent, down at 50 percent, 4 attempts' cooldown). The tier it reaches is saved at the round's end and used from the next round, never mid-round. The introduction and the demonstrated catch record nothing, and a forced debug tier records nothing. Misses only ease it.

A small window holds fewer bugs: decoys are dropped (never rhymes, and never the last decoy) until the bugs' press areas cover at most 40 percent of the open water. At 800x600 tier 2 shows 7 bugs instead of 8.

## Keyboard-only and mouse-only play

Mouse: press a bug, the frog, or the water; any button. Keyboard: the first key in a round shows a focus ring (cream and dark, round-cornered) on the bug nearest the top middle and does nothing else. Arrows then move focus to the nearest bug in that direction (wrapping round when there is none), Tab and Shift+Tab step through the bugs in order, and any other key presses the focused bug, at most once every 150 ms. When the focused bug is caught, focus moves to the nearest bug still flying. Moving the mouse hides the ring until the next key. After the round, the choice and rest work as in every round game; Escape goes to the hub and Tab reaches the corner buttons.

## Layout

Everything scales with `u`, the smaller of width / 1366 and height / 768 (0.45 to 1.405), times `uiScale`. The lily pad image is 440u (at most half the width and 0.62 of the height) at the bottom centre, the frog 0.62 of it with its feet on the back of the pad, and the target word 0.13 of the pad high on the pad's front. Bug images are 128u (at least 120 px), cards 54u high (at least 44 px). A bug's press area is its body plus its card, at least 96 px wide (measured 96 to 146 px wide and 141 to 221 px tall from 800x600 to 1920x1080). Bugs stay below the corner buttons, inside the window, and out of the box around the frog and its pad, so a press on a bug can never land on Home.

## Sound

| Moment | Sound |
| --- | --- |
| Tongue shoots | `whoosh` A, quiet |
| Catch (tongue reaches the bug) | `key` A at the tune's next note, and the postman's clip |
| Gulp | `pop` B |
| Last catch | `pop-big` A after the gulp; `go` A with the happy hop |
| Dodge | `button` C, and the London lad's clip |
| Press on the frog | `button` A, quiet, and the teacher's clip |
| Round end, stars, sticker, Again, Home | `fanfare` D, `star` B, `sticker` C, `whoosh` A, `button` B |

The fanfare is prepared ahead with `prepareSfxStep` in idle periods, as in Ride Fare. Music: track name `frog-pond` (`public/music/frog-pond.mp3`, composed by the owner; silence until it exists).

## Voice clips

330 clips in `public/voice/frog-pond/`, three per word: `say-<word>` (Scottish teacher), `catch-<word>` (northern postman) and `dodge-<word>` (London lad), rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/frog-pond.json`. The folder's README lists when each plays. They play on the shared voice channel (`src/audio/voice-player.ts`), so a new word stops the one before; the scene stops speech when it is left or covered. Wibble names the game on the hub with `public/voice/wibble/game-frog-pond.mp3`.

Accepted transcripts in the clip check (real accent variants or same-sounding spellings, each heard on every render): "finn" for fin (two voices), "caught" for cot (all three voices), "peg" for the teacher's pig and "when" for her win (the Highland short i), and for the Yorkshire postman's short u, which sounds like the u in "put": "shot" or "shoot" for shut, "boog" or "bog" for bug, "jog" for jug, "took" or "tog" for tug, "boon" or "bon" for bun. Four lines changed punctuation to get past the check: `catch-cut` and `catch-hid` say "Cut." and "Hid." (the exclamation made the model add whole sentences), `dodge-shut` and `dodge-rid` say "Shut!" and "Rid!" (the question was heard as "Shot?" and "Red?"). The owner approves every clip on the listening page before merge: `D:/screenshots/CoreWiseLearn/voice-review/frog-pond/index.html`.

## Performance

No allocation in update or render: bugs live in preallocated typed arrays (9 at most), particles are pooled (220 for play, 120 for the round end), and the tongue, threads and focus ring are a few path strokes. Every word is baked once into a canvas when its round starts (`bakeCard` in `cards.ts`: a cream card with the word in Andika, on a CPU canvas with `willReadFrequently`, read back one pixel so the drawing happens then), and the pad's target word once per round and size, so no frame draws text. Frog poses, the pad, the bugs and the glove are scaled once per layout, ahead of their first draw. No gradients or `shadowBlur`.

Measured at 1366x768 on the dev box (100 Hz panel, muted headed Chrome, `?debug` dev page, word help on, the pointer sweeping over bugs and every decoy dodged twice before every rhyme was caught): tier 0, scene `workMean` 0.15 ms, `workP95` 0.4 ms, `workMax` 0.9 ms; tier 2 (8 bugs), `workMean` 0.16 ms, `workP95` 0.4 ms, `workMax` 0.6 ms; loop `workMean` 0.17 and 0.22 ms. Delivered frames: mean 10.0 ms, 99th percentile 10.2 and 10.3 ms, longest 11.1 ms, none over 20 ms. In a fresh browser the first catch and the first celebration frame each took about 4 ms once (the first `key` and fanfare sounds and the confetti), within the frame.

## Art

The frog in three poses (sitting, mouth open, puffed), the lily pad, the three bugs and the pond background were generated for Frog Pond before this pull request (`frogPondArt` in `public/art/manifest.json`). The tongue, the cards, the threads, the sparkles and the focus ring are drawn in code. The helper glove is Ride Fare's `ride-fare/helper-hand.webp`, turned to point down.

`frog-pond/tile.webp` (512x512) is the hub tile: the frog on its lily pad smiling up at a ladybird. Generated on 2026-10-05 with Codex CLI 0.159.0 (`codex exec -m gpt-6-astra`, reasoning effort medium) and its built-in `image_gen` tool, first attempt; the image model is not reported. frog-sit, lily-pad and bug-ladybird were attached as style references, and the prompt asked for the same flat chunky vector style and frog, no text, background, frame or tongue, on a transparent 1024x1024 canvas. Prepared like the other Frog Pond sprites (alpha under 12 cleared, cropped, fitted to 410 px on 512x512, WebP quality 92 with alpha quality 100). The raw image and the Codex log are in `D:/CoreWise/_artifacts/CoreWiseLearn/frog-pond-art/`.

Stickers: `frog-pond-frog` (the puffed frog), `frog-pond-ladybird`, `frog-pond-bee` and `frog-pond-dragonfly`, using the game's own sprites.

## Files

- `src/games/frog-pond/`: `index.ts` (definition and save validator), `scene.ts` (the shell: pond chooser, round end, save bag, corner buttons), `rhyme.ts` (Rhyme snack), `rhyme-rules.ts` (tiers, round plans, the tune), `cards.ts` (baked words), `voice.ts` (clip names), `data.ts` (save bag: tier, rounds, word help, last family, pending round, and its validator), `content.ts` (words for all three activities).
- `dev/frog-pond.html`, `src/dev/frog-pond.ts`: isolated dev page.
- Debug (only with `?debug`): `?debug&tier=0..2&rounds=N&help=0|1&seed=N&pond` forces the tier, the round count (`rounds=0` replays the introduction), word help, the random seed, and shows the pond chooser. `window.__frogPond` is a read-only stats object: phase, activity, tier (and the live adaptive tier), rounds, the target, word help, the bugs with their words, states and press rectangles, keyboard focus, the hand and tongue states, catches, dodges, the notes played, the frog's box, the targets on screen (pond spots, sticker choices, Again, Home, corner buttons) and frame work (`workMean`, `workP95`, `workMax`, `resetWork()`).
- Shared edits: one registry entry after Ride Fare, four stickers appended to `STICKERS`, one music track name, Wibble's `game-frog-pond` line.
