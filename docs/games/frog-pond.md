# Frog Pond

A round game for an early reader (first to second grade) on a pond. A frog sits on its lily pad and bugs fly over the water carrying words. This first pull request builds the game's shell and its first activity, **Rhyme snack**: the frog eats the bugs whose word rhymes with the word on its pad. **Word pot** (below) joins the halves of compound words into words whose pictures stay in the pond. Lily-pad sentences follows in a later pull request (`docs/specs/2026-10-05-wibble-voice-and-frog-pond-design.md`). Learning tags: `words` and `sounds`.

The hub also serves a 4 and a 5 year old who cannot read. Nothing in Frog Pond needs reading to get around: the words are play material, every word is spoken by the time it matters, and the controls are the familiar Home, sound, Again and Home.

## The pond and its activities

Frog Pond opens on the pond with one spot per activity, each shown by a picture: Rhyme snack's is the frog on its lily pad, Word pot's the bubbling pot, wobbling gently. With a single activity the game would skip the pond and open straight into it. The list of activities is `ACTIVITY_IDS` in `src/games/frog-pond/data.ts`; adding an activity adds its id there and a spot appears. Again replays the same activity; with more than one activity it returns to the pond. On the pond a press on a spot opens it, and pointing at a spot shows the focus ring on it; with keys, the first key shows focus, arrows and Tab move it, and any other key opens the spot.

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

## Word pot

The third activity (`pot.ts`, planned by `pot-rules.ts`): a pot bubbles at the bottom of the pond, and word bubbles rise out of it and drift over the water. Most are halves of compound words; a few fit nothing. Joining two halves makes a word, and the word's picture swims out into the pond, where every word the child has ever made keeps swimming.

### The action and its response

- **The pot and the bubbles.** The pot (`frog-pond/pot.webp`) sits at the bottom centre, wobbling as it breathes, and a small pale bubble rises from its mouth about three times a second. At the start of a round the word bubbles pop out of its mouth one after another (0.16 s apart, each with a soft `pop`), arc up to spread-out places over the water in 0.8 s, and then drift slowly, wobbling like jelly and bobbing. They turn gently on their own, bounce softly off the edges, and slide apart when they would overlap. Each bubble is a pale soap bubble with a shine and its word in dark capitals.
- **The first press** lifts a bubble: it grows by 14 percent with a little overshoot, floats up and stops drifting, and a pale yellow halo pulses round it, with a quiet `button` A bloop. Pressing it again puts it back among the others (`button` B).
- **The second press** slams the two together: they rush to meet in 0.24 s, squashing as they go, the halves in reading order whichever was pressed first (TUB then BATH meets as BATH TUB).
- **A real word** goes poof: a ring of pale water droplets and coloured sparkles, a `pop-big`, and the northern postman says the word. In the bubbles' place the word appears on a cream card, its first half in blue and its second in orange, and its picture slams in above it. Both hold for 1.1 s, then the picture swims out in an arc to its place in the pond over 0.9 s, shrinking to swimming size while the card shrinks into the label under it. It lands with a splash ring and a soft `pop`. The word joins the save at once, so a reload mid-round keeps it.
- **A pair that makes no word** bonks: the two squash against each other with a wobble, a rubbery `button` C boing and a few sparkles, and bounce apart quickly before drifting on. Nothing is lost; the bonk only eases the hidden tier.
- **The pond.** Every word made, in any round, swims in the water as its picture with its two-colour label underneath, bobbing and tilting, with a white ripple ring under it. Swimmers stay on the water (off the grassy banks in the bottom corners and out of the pot) and slide apart when they meet. Pressing a swimmer makes it hop and the postman says its word. A word made again swims to its picture already in the pond, which hops.
- **The pot and the water.** Pressing the pot wobbles it with a soft `button` D and a few bubbles; pressing open water makes a small ring of droplets.
- **Round end.** When the last word's picture has landed, the pot does a happy hop with a bright `go` chime and a burst of sparkles, and the round ends 1.4 s after the landing. The celebration shows the pot bouncing with the round's first word's picture above it; the rest screen without a sticker shows the same, still.

### Hearing words

A compound word is spoken when it is made, never before, so the child reads the halves first. **Word help** turns on in a round after 3 bonks, or after 14 s without a word made (not counting the introduction's demonstration). While it is on, lifting a bubble makes the Scottish teacher say its word, and a bonk says the second bubble's word, so a child who is stuck hears every word they try. Word help carries into the next pot when the round had 3 bonks or a long pause, and switches off after a pot with no bonk at all. Unlike Rhyme snack, here a first press settles nothing, so word help speaks on the press itself, as the spec says.

### Discovery without words

The first Word pot round ever is an introduction: two words and one decoy, drifting slowly. 2.2 s in, the cartoon glove comes down from above to one half of a word and presses it (it lifts), glides to the other half and presses that, and the word is made with the full response. Play input waits until that word is made, so an early press cannot skip the demonstration, and the demonstrated word records nothing for the tier (it does join the pond). The glove then shows the other pair until the child does anything: it taps one half, glides to its partner, taps it, and glides back, every 2.4 s. In every later round, after 8 s without a press or a pointer movement, the see-through glove shows a pair the same way for 2.6 s, then fades; it repeats after another quiet 8 s.

### Words and pots

Words come from `COMPOUNDS` in `content.ts`: the spec's 20 compound words, each with a picture `frog-pond/cw-<word>.webp`. Decoys come from `DECOYS` (14 short words that join nothing). A pot (`planPot`) picks its words with the ones the child has not made yet first, then ones not in the last pot, and adds decoys.

Two halves from different words can make a real word too (SEA and BED from SEAHORSE and BEDTIME make SEABED), and some of those are listed in `EXTRA_COMPOUNDS`. Word pot never puts both halves of such a word in one pot: `planPot` only adds a word, or a decoy, when it makes no listed word (from `COMPOUNDS` or `EXTRA_COMPOUNDS`, in either order) with any bubble already there. So every two bubbles make a word exactly when they are the two halves of one of the pot's words. This was chosen over accepting the extras because an accepted extra would use up one half of two of the pot's words and strand their partners, the extras have no pictures for the pond, and every pot stays finishable. Two halves that share no listed word (PIG and BALL) simply bonk. Checked in the browser over 4,500 planned pots across the three tiers: no pot was short of words or decoys, held a repeated bubble, or let two bubbles make a word that was not one of its own. When the child has made almost every word, the few left can clash with each other; the planner then takes a word already made rather than leave the pot short (165 of the 4,500 pots).

### Hidden tier

| Tier | Words | Decoys | Drift (px/s at 1366x768) |
| --- | --- | --- | --- |
| Introduction | 2 | 1 | 9 |
| 0 | 2 | 1 | 12 |
| 1 | 3 | 2 | 18 |
| 2 | 4 | 3 | 24 |

Word pot keeps its own tier, word help and introduction in the save bag (`pot`), apart from Rhyme snack's, because making compound words is a different skill from hearing rhymes. Each word made is a hit and each bonk a miss for its own adaptive tier (the same settings as Rhyme snack: window 10, at least 6 attempts, up at 85 percent, down at 50 percent, 4 attempts' cooldown), applied from the next pot. The tier's attempt window is kept across rounds; it is only reset when the tier itself changes. A small window holds fewer bubbles: decoys are dropped (never halves) until the bubbles fit with room to drift (their squares cover at most 45 percent of the area they drift in). At 800x600 tier 2 shows 9 bubbles instead of 11.

### Keyboard and mouse

Mouse: press a bubble, a swimmer, the pot or the water; any button. Keyboard: the first key in a round shows a round focus ring (cream and dark) on the bubble nearest the top middle and does nothing else. Arrows then move focus to the nearest bubble in that direction (wrapping round when there is none), Tab and Shift+Tab step through the bubbles, and any other key presses the focused bubble (lift, put back, or join), at most once every 150 ms. Bubbles still rising out of the pot cannot be focused or pressed. After a join, focus moves to the nearest bubble still drifting. Swimmers answer the mouse only; they are a reward, not part of the round.

### Layout

The pot is 280u (at most 0.38 of the height and 0.3 of the width) with its feet at the bottom centre. Bubbles drift between the corner buttons' bottom edge and the pot's mouth, across the full width; their letters are 36u high (at least 28 px) and each bubble is at least 104 px across. Swimming pictures are 104u (at least 96 px) with a 30u label (at least 26 px); they swim from 0.42 of the height down to the bottom, behind the pot and the bubbles. A made word's picture appears at 190u (at least 140 px) on a 60u card. Measured smallest press area: 104 px (a bubble) at 1366x768 and 96 px (a swimmer) at 800x600.

### Sound

| Moment | Sound |
| --- | --- |
| A bubble pops out of the pot | `pop` A, quiet |
| Lift / put back | `button` A / `button` B, quiet |
| Two bubbles rush together | `whoosh` A, quiet |
| A word | `pop-big` A, and the postman's clip |
| A picture lands in the pond | `pop` B, quiet |
| A bonk | `button` C |
| Press the pot | `button` D, quiet |
| Press a swimmer | `button` A, quiet, and the postman's clip |
| The last word lands | `go` A with the pot's hop |

### Voice clips

42 new clips in `public/voice/frog-pond/`, rendered from `scripts/voice/lines/frog-pond-words.json`: `make-<word>` for the 20 compound words in the postman's voice ("Pancake!"), and `say-<word>` in the teacher's voice for the 22 halves and decoys that Rhyme snack had not already given her (cake, foot, ball, star, fish, time, sea, horse, base, lady, scotch, tree, line, hair, hill, sand, box, bath, tub, fox, jam, bib). The other 25 halves and decoys reuse Rhyme snack's `say-` clips. Two lines accept another transcript, each after failing the same way on all three renders: `make-hotdog` accepts "hot dog" (the two-word spelling) and `say-sea` accepts "see" (the same sound). Word pot needs no clip for the extras, since they can never be made.

### Performance

Nothing allocates in update or render: bubbles (12 at most), swimmers (20) and made-word reveals (4) live in preallocated typed arrays, and particles are pooled (260). Every bubble, card and label is baked once per round and size on a CPU canvas (`pot-cards.ts`, read back one pixel, as in `cards.ts`). Pictures are scaled once per layout at their two sizes; animation scales them with the canvas transform, never by asking for a new size, so no frame resamples art. The halo, focus ring and ripples are a few path strokes. No gradients or `shadowBlur`.

Measured on the dev box (100 Hz panel, muted headed Chrome off screen, `?debug&tier=2&made=20`: the full pond of 20 swimmers and a tier-2 pot, with the pointer sweeping, a bonk, and every word made by mouse; every frame of the 10 s of play): at 1366x768, loop `workMean` 0.46 ms, `workP95` 0.9 ms, `workMax` 2.1 ms; at 800x600, `workMean` 0.52 ms, `workP95` 1.1 ms, `workMax` 5.3 ms (one frame). Delivered frames: mean 10.0 ms, 99th percentile 10.2 ms, longest 11.5 and 11.6 ms, none over 20 ms of about 1,030 per run.

### Save bag

The Frog Pond bag gains one field, `pot`: `tier`, `rounds`, `assist` (word help), `made` (every compound word made, oldest first, each once) and `last` (the last pot's words). A bag from before Word pot gets the default on load (`sanitizeFrogPondData` adds it without protecting, the bag's usual rule for a missing field), so no migration in `src/engine/save.ts` is needed. Malformed fields are repaired one by one and protect the stored document; a `made` list with a bad entry keeps its good ones, so the collection is never reset.

## Art

The frog in three poses (sitting, mouth open, puffed), the lily pad, the three bugs and the pond background were generated for Frog Pond before this pull request (`frogPondArt` in `public/art/manifest.json`). The tongue, the cards, the threads, the sparkles and the focus ring are drawn in code. The helper glove is Ride Fare's `ride-fare/helper-hand.webp`, turned to point down.

`frog-pond/tile.webp` (512x512) is the hub tile: the frog on its lily pad smiling up at a ladybird. Generated on 2026-10-05 with Codex CLI 0.159.0 (`codex exec -m gpt-6-astra`, reasoning effort medium) and its built-in `image_gen` tool, first attempt; the image model is not reported. frog-sit, lily-pad and bug-ladybird were attached as style references, and the prompt asked for the same flat chunky vector style and frog, no text, background, frame or tongue, on a transparent 1024x1024 canvas. Prepared like the other Frog Pond sprites (alpha under 12 cleared, cropped, fitted to 410 px on 512x512, WebP quality 92 with alpha quality 100). The raw image and the Codex log are in `D:/CoreWise/_artifacts/CoreWiseLearn/frog-pond-art/`.

Stickers: `frog-pond-frog` (the puffed frog), `frog-pond-ladybird`, `frog-pond-bee` and `frog-pond-dragonfly`, using the game's own sprites, and from Word pot `frog-pond-starfish` and `frog-pond-seahorse` (two of its pictures). Any Frog Pond round offers any of the six.

Word pot's pot and its 20 pictures (`cw-<word>.webp`) were generated with the other Frog Pond sprites; the bubbles, cards, labels, halo and ripples are drawn in code.

## Files

- `src/games/frog-pond/`: `index.ts` (definition and save validator), `scene.ts` (the shell: pond chooser, round end, save bag, corner buttons), `rhyme.ts` (Rhyme snack), `rhyme-rules.ts` (tiers, round plans, the tune), `pot.ts` (Word pot), `pot-rules.ts` (its tiers, pot plans and `joinWord`), `pot-cards.ts` (baked bubbles and two-colour cards), `cards.ts` (baked words), `voice.ts` (clip names), `data.ts` (save bag: tier, rounds, word help, last family, pending round, Word pot's `pot` part, and its validator), `content.ts` (words for all three activities).
- `dev/frog-pond.html`, `src/dev/frog-pond.ts`: isolated dev page.
- Debug (only with `?debug`): `?debug&tier=0..2&rounds=N&help=0|1&seed=N&made=N&pond` forces the tier, the round count of both activities (`rounds=0` replays the introductions), word help in both, the random seed, fills Word pot's pond with the first N compound words (`made=20` for frame timing with a full pond), and shows the pond chooser. `window.__frogPond` is a read-only stats object: phase, activity, tier (and the live adaptive tier), rounds, the target, word help, the bugs with their words, states and press rectangles, keyboard focus, the hand and tongue states, catches, dodges, the notes played, the frog's box, the targets on screen (pond spots, sticker choices, Again, Home, corner buttons) and frame work (`workMean`, `workP95`, `workMax`, `resetWork()`). `__frogPond.pot` has Word pot's bubbles (word, state, half or decoy, press circle), swimmers, the lifted bubble, focus, word help, the hand, words made, bonks, the pot's words and the reveals running.
- `scripts/voice/lines/frog-pond-words.json`: Word pot's clips.
- Shared edits: one registry entry after Ride Fare, six stickers appended to `STICKERS`, one music track name, Wibble's `game-frog-pond` line.
