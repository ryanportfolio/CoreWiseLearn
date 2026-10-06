# Frog Pond

A round game for an early reader (first to second grade) on a pond. A frog sits on its lily pad and bugs fly over the water carrying words. The first pull request built the game's shell and its first activity, **Rhyme snack**: the frog eats the bugs whose word rhymes with the word on its pad. **Word fountain** (below) joins the halves of compound words into words whose pictures stay in the pond. **Lily-pad sentences** (below) has the child build a sentence about a picture by pressing its words in order, then pick its end mark (`docs/specs/2026-10-05-wibble-voice-and-frog-pond-design.md`). Learning tags: `words` and `sounds`.

The hub also serves a 4 and a 5 year old who cannot read. Nothing in Frog Pond needs reading to get around: the words are play material, every word is spoken by the time it matters, and the controls are the familiar Home, sound, Again and Home.

## The pond and its activities

Frog Pond opens on the pond with one spot per activity, each shown by a picture: Rhyme snack's is the frog on its lily pad, Word fountain's the small stone fountain, wobbling gently, Lily-pad sentences' a small frog on the first of three word pads in a row, bobbing in turn. With a single activity the game would skip the pond and open straight into it. The list of activities is `ACTIVITY_IDS` in `src/games/frog-pond/data.ts`; adding an activity adds its id there and a spot appears. Again returns to the pond. On the pond a press on a spot opens it (each spot's press area is a circle 240 px across at 1366x768), and pointing at a spot shows the focus ring on it; with keys, the first key shows focus, arrows and Tab move it, and any other key opens the spot.

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

Rounds come in sets of three (`SET_ROUNDS` in `data.ts`), so a child plays three rounds before the sticker offer breaks the flow (owner's request, 2026-10-05).

1. **Play** until every rhyming bug is caught (see above).
2. **Between rounds,** after the set's first and second round: the finished round stays on screen and keeps moving, the set's stars so far show at the top with the newest slamming in (`star` B), and 1.6 s later the next round of the same activity starts by itself. Input is ignored except the corner buttons and Escape.
3. **Celebration,** after the set's third round: the frog bounces puffed on its pad, confetti, and three stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.2 s.
4. **Sticker choice,** while this game's four stickers are not all owned and `rewardsEnabled` is true: the shared `createStickerOffers` helper shows two stickers, each floating on a lily pad, with the small sticker book beside them. Same guard as every game: input ignored for 1.2 s, nothing focused, the first key only shows focus; `warm` and `warmBook` run during the celebration.
5. **Still rest:** the sticker book with the new sticker (or, with no gift, the frog on its pad with the round's word), the stars, and Again and Home of equal size and colour. `services.roundBoundary()` runs when rest is reached.

Stars: every finished round earns 1, added to the saved total as the round ends, so leaving mid-set loses nothing; a set shows its 3 at the celebration. Dodges never cost a star. The set's count (`setDone`, 0 to 2) is saved and kept across visits, and any activity's rounds count toward it. Awards persist once, as in Ride Fare: the round count, the offered pair and the round's target go into the game bag's `pending` field with a unique round `id`, and `save.flush()` runs before the celebration shows. Leaving or reloading returns to the choice or the rest; leaving rest by any route clears `pending`.

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

Lily-pad sentences adds 79 clips from `scripts/voice/lines/frog-pond-sentences.json`: `read-<the-words>` (46, the northern postman reading each sentence, its end mark in the text, so a question rises on its own) and `say-<word>` (33, the Scottish teacher, for sentence words neither other activity has, such as `say-the`, `say-under`, `say-i`). The other 30 sentence words reuse Rhyme snack's and Word pot's `say-` clips (ball, box and fox were rendered by both branches with the same text and voice; Word fountain's files are kept). Ten lines needed a second or third render. Two accepted transcripts were added, both words that sound the same: "two" for `say-to` and "bye" for `say-by` (each heard that way on all three renders). The postman's pace varies a lot between sentences (1.5 s for "What is in the bag?", 7.3 s for "I like to jog with my dog.", with pauses of up to a second between words); listen for that on the review page.

Accepted transcripts in the clip check (real accent variants or same-sounding spellings, each heard on every render): "finn" for fin (two voices), "caught" for cot (all three voices), "peg" for the teacher's pig and "when" for her win (the Highland short i), and for the Yorkshire postman's short u, which sounds like the u in "put": "shot" or "shoot" for shut, "boog" or "bog" for bug, "jog" for jug, "took" or "tog" for tug, "boon" or "bon" for bun. Four lines changed punctuation to get past the check: `catch-cut` and `catch-hid` say "Cut." and "Hid." (the exclamation made the model add whole sentences), `dodge-shut` and `dodge-rid` say "Shut!" and "Rid!" (the question was heard as "Shot?" and "Red?"). The owner approves every clip on the listening page before merge: `D:/screenshots/CoreWiseLearn/voice-review/frog-pond/index.html`.

## Performance

No allocation in update or render: bugs live in preallocated typed arrays (9 at most), particles are pooled (220 for play, 120 for the round end), and the tongue, threads and focus ring are a few path strokes. Every word is baked once into a canvas when its round starts (`bakeCard` in `cards.ts`: a cream card with the word in Andika, on a CPU canvas with `willReadFrequently`, read back one pixel so the drawing happens then), and the pad's target word once per round and size, so no frame draws text. Frog poses, the pad, the bugs and the glove are scaled once per layout, ahead of their first draw. No gradients or `shadowBlur`.

Measured at 1366x768 on the dev box (100 Hz panel, muted headed Chrome, `?debug` dev page, word help on, the pointer sweeping over bugs and every decoy dodged twice before every rhyme was caught): tier 0, scene `workMean` 0.15 ms, `workP95` 0.4 ms, `workMax` 0.9 ms; tier 2 (8 bugs), `workMean` 0.16 ms, `workP95` 0.4 ms, `workMax` 0.6 ms; loop `workMean` 0.17 and 0.22 ms. Delivered frames: mean 10.0 ms, 99th percentile 10.2 and 10.3 ms, longest 11.1 ms, none over 20 ms. In a fresh browser the first catch and the first celebration frame each took about 4 ms once (the first `key` and fanfare sounds and the confetti), within the frame.

## Word fountain

The third activity (`pot.ts`, planned by `pot-rules.ts`): a small stone fountain plays at the bottom of the pond, and word bubbles rise out of its spray and drift over the water. It was first built as Word pot, with a cooking pot; its activity id, save key and file names keep that first name (`pot`), so saves made before the rename load unchanged. Most are halves of compound words; a few fit nothing. Joining two halves makes a word, and the word's picture swims out into the pond, where every word the child has ever made keeps swimming.

### The action and its response

- **The fountain and the bubbles.** The fountain (`frog-pond/fountain.webp`) sits at the bottom centre, wobbling as it breathes, and white droplets leave the tip of its centre jet about eight times a second, arc out to either side and fall back towards its basin. At the start of a round the word bubbles pop out of the jet's tip one after another (0.16 s apart, each with a soft `pop`), arc up to spread-out places over the water in 0.8 s, and then drift slowly, wobbling like jelly and bobbing. They turn gently on their own, bounce softly off the edges, and slide apart when they would overlap. Each bubble is a pale soap bubble with a shine and its word in dark capitals.
- **The first press** lifts a bubble: it grows by 14 percent with a little overshoot, floats up and stops drifting, and a pale yellow halo pulses round it, with a quiet `button` A bloop. Pressing it again puts it back among the others (`button` B).
- **The second press** slams the two together: they rush to meet in 0.24 s, squashing as they go, the halves in reading order whichever was pressed first (TUB then BATH meets as BATH TUB).
- **A real word** goes poof: a ring of pale water droplets and coloured sparkles, a `pop-big`, and the northern postman says the word. In the bubbles' place the word appears on a cream card, its first half in blue and its second in orange, and its picture slams in above it. Both hold for 1.1 s, then the picture swims out in an arc to its place in the pond over 0.9 s, shrinking to swimming size while the card shrinks into the label under it. It lands with a splash ring and a soft `pop`. The word joins the save at once, so a reload mid-round keeps it.
- **A pair that makes no word** bonks: the two squash against each other with a wobble, a rubbery `button` C boing and a few sparkles, and bounce apart quickly before drifting on. Nothing is lost; the bonk only eases the hidden tier.
- **The pond.** Every word made, in any round, swims in the water as its picture with its two-colour label underneath, bobbing and tilting, with a white ripple ring under it. Swimmers stay on the water (off the grassy banks in the bottom corners and out of the fountain) and slide apart when they meet. Pressing a swimmer makes it hop and the postman says its word. A word made again swims to its picture already in the pond, which hops.
- **The fountain and the water.** Pressing the fountain wobbles it with a soft `button` D and a few bubbles; pressing open water makes a small ring of droplets.
- **Round end.** When the last word's picture has landed, the fountain does a happy hop with a bright `go` chime and a burst of sparkles, and the round ends 1.4 s after the landing. The celebration shows the fountain bouncing with the round's first word's picture above it; the rest screen without a sticker shows the same, still.

### Hearing words

A compound word is spoken when it is made, never before, so the child reads the halves first. **Word help** turns on in a round after 3 bonks, or after 14 s without a word made (not counting the introduction's demonstration). While it is on, lifting a bubble makes the Scottish teacher say its word, and a bonk says the second bubble's word, so a child who is stuck hears every word they try. Word help carries into the next round when the round had 3 bonks or a long pause, and switches off after a round with no bonk at all. Unlike Rhyme snack, here a first press settles nothing, so word help speaks on the press itself, as the spec says.

### Discovery without words

The first Word fountain round ever is an introduction: two words and one decoy, drifting slowly. 2.2 s in, the cartoon glove comes down from above to one half of a word and presses it (it lifts), glides to the other half and presses that, and the word is made with the full response. Play input waits until that word is made, so an early press cannot skip the demonstration, and the demonstrated word records nothing for the tier (it does join the pond). The glove then shows the other pair until the child does anything: it taps one half, glides to its partner, taps it, and glides back, every 2.4 s. In every later round, after 8 s without a press or a pointer movement, the see-through glove shows a pair the same way for 2.6 s, then fades; it repeats after another quiet 8 s.

### Words and rounds

Words come from `COMPOUNDS` in `content.ts`: 34 compound words, each with a picture `frog-pond/cw-<word>.webp`. On 2026-10-05, a few hours after the game went live, RAINBOW, POPCORN and BACKPACK replaced BEDBUG, ZIPLINE and HAIRBALL, and FOOTBALL's picture became an American football. The three replaced words are `RETIRED_COMPOUNDS`: never offered again, but still valid in a saved collection, with their pictures and clips, so a child who made one still sees it swim in the pond. Later the same day the owner approved 14 more words for variety: CUPCAKE, BULLDOG, MAILBOX, GOLDFISH, SNOWMAN, SNOWBALL, SAILBOAT, TOOTHBRUSH, SUNFLOWER, JELLYFISH, PINECONE, BEEHIVE, FIREFLY and RAINCOAT. A collection now holds up to 37 words (34 offered and 3 retired). Decoys come from `DECOYS` (14 short words that join nothing). TWIG replaced FOX as a decoy when FIRE became a half, since FIRE and FOX make FIREFOX. Each round's bubbles (`planPot`) take words the child has not made yet first, then words not in the last round, and add decoys.

Two halves from different words can make a real word too (SEA and BED from SEAHORSE and BEDTIME make SEABED), and some of those are listed in `EXTRA_COMPOUNDS`. Word fountain never puts both halves of such a word, or of a retired word (BED and BUG), in one round: `planPot` only adds a word, or a decoy, when it makes no listed word (from `COMPOUNDS`, `RETIRED_COMPOUNDS` or `EXTRA_COMPOUNDS`, in either order) with any bubble already there. So every two bubbles make a word exactly when they are the two halves of one of the round's words. This was chosen over accepting the extras because an accepted extra would use up one half of two of the round's words and strand their partners, the extras have no pictures for the pond, and every round stays finishable. The new halves (rain, bow, back, pack, pop, corn) added CORNDOG, HORSEBACK, PACKHORSE and SETBACK to the extras, and CAKEPOP and POPSTAR, which are usually written as two words but which a child may know; rarer words they make (SUNBOW, SEABOW, POPTOP, CORNBALL, CORNCAKE, SANDPACK, and POPPET with the decoy PET) are left out, and a bonk on them loses nothing. The 14 added words brought 14 more extras: FIREMAN, MAILMAN, SANDMAN, HORSEMAN, FIREBALL, FIREBOAT, SAILFISH, HORSEFLY, FLOWERBED and SEASTAR, and DOGMAN, GOLDSTAR, SNOWCONE and PINETREE, usually two words but known to children (Dog Man, gold stars, snow cones, pine trees). Rarer words the new halves make (SEAMAN, BASEMAN, FOOTMAN, BOATMAN, BULLPEN, BACKFIRE, BRUSHFIRE, FIREBUG, FIREDOG, FIREBOX, FLYBALL, SANDFLY, SUNDOG, SEADOG, TOPCOAT, SNOWPACK, CORNFLOWER, CONEFLOWER) are left out. The candidates came from checking every pair of halves and decoys, in both orders, against a 370,000-word English list, then judging by hand which a child might know. Two halves that share no listed word (PIG and BALL) simply bonk. Checked over 4,500 planned rounds when the activity was built, again after the word change over 12,000 (a Node script running `planPot`: 3,000 each for the introduction and the three tiers, with random collections that sometimes held retired words), and after the 14 added words over 80,000 (20,000 each) twice, once with a fixed-seed generator and once with `Math.random`: every offered word and every decoy came up, and no round was short of words or decoys, held a repeated bubble or a word that is neither a half nor a decoy, let two bubbles make a listed word that was not one of its own, or offered a retired word. When the child has made almost every word, the few left can clash with each other; the planner then takes a word already made rather than leave the round short (in the `Math.random` run with 34 words, 0.5 percent of introduction rounds and 3.3 percent of tier-2 rounds took a made word while enough unmade words were left, because those clashed).

### Hidden tier

| Tier | Words | Decoys | Drift (px/s at 1366x768) |
| --- | --- | --- | --- |
| Introduction | 2 | 1 | 9 |
| 0 | 2 | 1 | 12 |
| 1 | 3 | 2 | 18 |
| 2 | 4 | 3 | 24 |

Word fountain keeps its own tier, word help and introduction in the save bag (`pot`), apart from Rhyme snack's, because making compound words is a different skill from hearing rhymes. Each word made is a hit and each bonk a miss for its own adaptive tier (the same settings as Rhyme snack: window 10, at least 6 attempts, up at 85 percent, down at 50 percent, 4 attempts' cooldown), applied from the next round. The tier's attempt window is kept across rounds; it is only reset when the tier itself changes. A small window holds fewer bubbles: decoys are dropped (never halves) until the bubbles fit with room to drift (their squares cover at most 45 percent of the area they drift in). At 800x600 tier 2 shows 9 bubbles instead of 11.

### Keyboard and mouse

Mouse: press a bubble, a swimmer, the fountain or the water; any button. Keyboard: the first key in a round shows a round focus ring (cream and dark) on the bubble nearest the top middle and does nothing else. Arrows then move focus to the nearest bubble in that direction (wrapping round when there is none), Tab and Shift+Tab step through the bubbles, and any other key presses the focused bubble (lift, put back, or join), at most once every 150 ms. Bubbles still rising out of the fountain cannot be focused or pressed. After a join, focus moves to the nearest bubble still drifting. Swimmers answer the mouse only; they are a reward, not part of the round.

### Layout

The fountain is 280u (at most 0.38 of the height and 0.3 of the width) with its basin at the bottom centre. Bubbles drift between the corner buttons' bottom edge and the tip of the fountain's centre jet (0.22 of the sprite from its top), across the full width; their letters are 36u high (at least 28 px) and each bubble is at least 104 px across. Swimming pictures are 104u (at least 96 px) with a 30u label (at least 26 px); they swim from 0.42 of the height down to the bottom, behind the fountain and the bubbles. A made word's picture appears at 190u (at least 140 px) on a 60u card. Measured smallest press area: 104 px (a bubble) at 1366x768 and 96 px (a swimmer) at 800x600.

### Sound

| Moment | Sound |
| --- | --- |
| A bubble pops out of the spray | `pop` A, quiet |
| Lift / put back | `button` A / `button` B, quiet |
| Two bubbles rush together | `whoosh` A, quiet |
| A word | `pop-big` A, and the postman's clip |
| A picture lands in the pond | `pop` B, quiet |
| A bonk | `button` C |
| Press the fountain | `button` D, quiet |
| Press a swimmer | `button` A, quiet, and the postman's clip |
| The last word lands | `go` A with the fountain's hop |

### Voice clips

82 clips in `public/voice/frog-pond/`, rendered from `scripts/voice/lines/frog-pond-words.json`: `make-<word>` for the 37 compound words (the 34 offered and the 3 retired) in the postman's voice ("Pancake!"), and `say-<word>` in the teacher's voice for the 45 halves and decoys that Rhyme snack had not already given her (cake, foot, ball, star, fish, time, sea, horse, base, lady, scotch, tree, line, hair, hill, sand, box, bath, tub, fox, jam, bib; since the word change rain, bow, back, pack, corn; and since the 14 added words cup, bull, mail, gold, snow, sail, boat, tooth, brush, flower, jelly, pine, cone, bee, hive, fire, fly, coat). Line and hair now belong only to retired words, and fox, no longer a decoy, stays for Lily-pad sentences. The other 27 halves and decoys in use reuse Rhyme snack's `say-` clips (pop, man and the new decoy twig among them). Two lines accept another transcript, each after failing the same way on all three renders: `make-hotdog` accepts "hot dog" (the two-word spelling) and `say-sea` accepts "see" (the same sound). `say-bow` must sound like the bow in rainbow: written "Bow." it came out rhyming with "cow" (the check model, asked which vowel it heard, said so three times out of three), and "Bo." and "Beau." failed all three renders, heard as "Ball", "Bowl" and "Boo". It is written "Boh." and accepts "beau", which is what the check heard; the same question then answered "go" three times out of three. `say-pack` took two renders; `make-rainbow`, `make-popcorn` and `make-backpack` passed first time as written. Of the 32 clips for the 14 added words, 26 passed first time; `make-beehive` (first heard as "b, ee, beehive"), `say-mail` ("Male."), `say-gold` ("Cold.") and `say-hive` ("How've") passed on the second render. `say-sail` failed all three, heard as "sale", "Sale." and "Seal", and `say-bee` failed all three, heard as "B." each time; both are the same sounds, so `say-sail` now accepts "sale" and `say-bee` accepts "b" and "be", and both passed on the next render. A single letter in the accept list also makes the generator ask for the letter's name, which for B is the same sound. Word fountain needs no clip for the extras, since they can never be made.

### Performance

Nothing allocates in update or render: bubbles (12 at most), swimmers (37, every word a collection can hold) and made-word reveals (4) live in preallocated typed arrays, and particles are pooled (260). Every bubble, card and label is baked once per round and size on a CPU canvas (`pot-cards.ts`, read back one pixel, as in `cards.ts`). Pictures are scaled once per layout at their two sizes; animation scales them with the canvas transform, never by asking for a new size, so no frame resamples art. The halo, focus ring and ripples are a few path strokes; the spray droplets are pooled particles, one spawned every 0.12 s (each spawn builds the particle's small colour string in `particles.ts`, as the pot's rising bubbles did three times a second). No gradients or `shadowBlur`.

Measured when built (100 Hz panel, muted headed Chrome off screen, `?debug&tier=2&made=20`: the full pond of 20 swimmers and a tier-2 pot, with the pointer sweeping, a bonk, and every word made by mouse; every frame of the 10 s of play): at 1366x768, loop `workMean` 0.46 ms, `workP95` 0.9 ms, `workMax` 2.1 ms; at 800x600, `workMean` 0.52 ms, `workP95` 1.1 ms, `workMax` 5.3 ms (one frame). Delivered frames: mean 10.0 ms, 99th percentile 10.2 ms, longest 11.5 and 11.6 ms, none over 20 ms of about 1,030 per run.

Measured again with the fountain (same box and Chrome, `?debug&pond&rounds=1&tier=2`, a pond of 19 pictures including BEDBUG and ZIPLINE and a tier-2 round offering RAINBOW, POPCORN, BACKPACK and BEDTIME, all four made by mouse, so 22 swimmers by the end; every frame from the bubbles settling to the last word made, about 11.4 s): at 1366x768, loop `workMean` 0.29 ms, `workP95` 0.5 ms, `workMax` 2.3 ms; at 800x600, 0.33, 0.5 and 1.6 ms. Delivered frames: mean 10.0 ms, 99th percentile 10.1 ms, longest 11.7 and 12.4 ms, none over 20 ms of about 1,140 per run. The round's first half second is not smooth: in the frames after the press that opens the round, 4 or 5 arrive 50 to 110 ms apart while the bubbles start to rise, with little frame work (one frame of 22 ms work with a full pond), with an empty pond as well as a full one. With the rising bubbles' `pop` sounds switched off as a test, the longest of those gaps fell to about 50 ms, so the sound effects' first plays are most of the cost; measured the same way, Rhyme snack's and Lily-pad sentences' openings have no gap over 30 ms after the press. Not changed here, and not compared with the build before the fountain.

Measured again after the 14 added words, with the full collection (same box, AMD Radeon RX 6600 XT, `?debug&pond&rounds=1&tier=2&made=37`: 37 swimmers, a tier-2 round, the pointer sweeping for 1.5 s, one bonk, and all four words made by mouse; every frame from 2.5 s after the round opened to the last word, about 1,340 frames): at 1366x768, loop `workMean` 0.62 ms, `workP95` 1.1 ms, `workMax` 3.4 ms, and the scene's own (`window.__frogPond`) 0.47, 0.6 and 1.2 ms; at 800x600, loop 0.66, 1.3 and 2.7 ms, scene 0.46, 0.7 and 1.0 ms. Delivered frames: `loop.stats.p95` 10.1 to 10.2 ms, mean 10.0 ms, longest 10.3 ms at 800x600 and one frame of 20 ms at 1366x768, none over 20 ms. The pond is crowded, though: counting pairs of swimmers whose press areas overlap by more than a quarter, 23 swimmers gave 3 pairs at 1366x768 and 18 at 800x600, and 37 give 15 to 21 (two runs) and 50, so many labels hide behind other pictures, worst at 800x600 (screenshots in `D:\screenshots\CoreWiseLearn\more-words\`). Not changed here.

### Save bag

The Frog Pond bag gains one field, `pot`: `tier`, `rounds`, `assist` (word help), `made` (every compound word made, oldest first, each once) and `last` (the last round's words). A bag from before Word fountain gets the default on load (`sanitizeFrogPondData` adds it without protecting, the bag's usual rule for a missing field), so no migration in `src/engine/save.ts` is needed. Malformed fields are repaired one by one and protect the stored document; a `made` list with a bad entry keeps its good ones, so the collection is never reset. The check accepts the retired words (`RETIRED_COMPOUNDS`) in `made` and `last`, so a collection holding BEDBUG, ZIPLINE or HAIRBALL loads unchanged; checked in the browser by saving a collection with BEDBUG and ZIPLINE, reloading, and finding both swimming in the pond.

## Art

The frog in three poses (sitting, mouth open, puffed), the lily pad, the three bugs and the pond background were generated for Frog Pond before this pull request (`frogPondArt` in `public/art/manifest.json`). The tongue, the cards, the threads, the sparkles and the focus ring are drawn in code. The helper glove is Ride Fare's `ride-fare/helper-hand.webp`, turned to point down.

`frog-pond/tile.webp` (512x512) is the hub tile: the frog on its lily pad smiling up at a ladybird. Generated on 2026-10-05 with Codex CLI 0.159.0 (`codex exec -m gpt-6-astra`, reasoning effort medium) and its built-in `image_gen` tool, first attempt; the image model is not reported. frog-sit, lily-pad and bug-ladybird were attached as style references, and the prompt asked for the same flat chunky vector style and frog, no text, background, frame or tongue, on a transparent 1024x1024 canvas. Prepared like the other Frog Pond sprites (alpha under 12 cleared, cropped, fitted to 410 px on 512x512, WebP quality 92 with alpha quality 100). The raw image and the Codex log are in `D:/CoreWise/_artifacts/CoreWiseLearn/frog-pond-art/`.

Stickers: `frog-pond-frog` (the puffed frog), `frog-pond-ladybird`, `frog-pond-bee` and `frog-pond-dragonfly`, using the game's own sprites, and from Word fountain `frog-pond-starfish` and `frog-pond-seahorse` (two of its pictures). Any Frog Pond round offers any of the six.

Word fountain's first pictures (`cw-<word>.webp`) were generated with the other Frog Pond sprites. On 2026-10-05 the fountain (`fountain.webp`, replacing the first build's cooking pot, `pot.webp`), cw-rainbow, cw-popcorn, cw-backpack, a new cw-football (an American football: brown leather, white laces) and a new cw-sunset (the sun setting over the sea under orange and pink sky, with no face) were made the same way (`frogPondArt` in `public/art/manifest.json`). The chooser spot draws the same fountain sprite. The bubbles, cards, labels, halo, ripples and spray droplets are drawn in code.

## Lily-pad sentences

A picture at the top of the pond shows a scene: a pig in a box, a cat wearing a hat, a dog beside a jet. The words of one sentence about it float on lily pads below, in a scrambled order. The child presses them in reading order and the frog hops along a row of pads as the sentence builds. The last step is a choice between a full stop pad and a question mark pad. Then the postman reads the sentence, each word lighting up as he says it, and the picture acts it out. The sentences, their pictures and their length tags are `SENTENCES` in `content.ts`; the activity is `sentences.ts` and its round planning `sentence-rules.ts`.

### The screen

- **The picture** sits at the top centre between the corner buttons: a cream-edged panel with sky and grass, 230u tall and 1.6 times as wide (at most 0.3 of the window's height), baked once per size. It is built from the scene sprites (pig, frog, bug, bat, cat, dog, hen, fox, jet, van, box, log, hat, bag, cap, ball, pen, lid, rock, twig) and the sentence's relation: alone, `by` (side by side), `on` (standing on top), `in` (inside a box or bag, or a hat turned upside down like a bowl: the container is drawn, then what is in it, then the container's front again below its rim), `under` (peeking out from behind and below), and `with` (a hat or cap worn on the head, anything else held beside). Pressing the picture makes its main character do a small hop.
- **The row** runs across the pond under the picture: the frog's own plain pad on the left, then one faint empty pad per word and one for the end mark, so the row shows how long the sentence is. Row pads hug their word (at least 1.5 times as wide as tall) and the row shrinks to fit the window, so a seven-word sentence stays readable at 800x600.
- **The floating pads** bob over the open water below the row, one per word, in a grid of up to four across and two down (the second row offset half a cell). Each drifts gently from side to side and bobs a few pixels, every pad on its own phase. The words are drawn in the case the sentence uses: the first word starts with a capital, which shows where a sentence starts. Each word is baked once on the plain word pad sprite (`frog-pond/word-pad.webp`, stretched sideways to fit), and so are the full stop pad (a round dot) and the question mark pad; nothing draws text in a frame.

### The action and its response

- **The right word.** Its pad glides into its place in the row in 0.32 s, turning from the wide floating pad into the narrower row pad on the way, and settles with a small swell. The frog hops onto it, the Scottish teacher says the word and a marimba note plays, one step higher for each word. When two pads show the same word ("the" twice), either one is right.
- **A word out of order.** The pad lifts a little toward the row, wobbles and floats back to its place with a giggly "boing". Nothing is lost and no pad leaves.
- **The end mark.** When the last word lands, a full stop pad and a question mark pad rise from the water (in random order, left and right). The words decide which is right: a sentence that starts with a question word (`QUESTION_STARTERS`: Do, What, Where, Is, Can) ends with a question mark, every other one with a full stop. The wrong mark wobbles back like a wrong word. The right one joins the row with a sparkle and the other sinks away.
- **The reading.** The frog hops back to its own pad, then the northern postman reads the whole sentence. Each word's pad glows pale yellow and swells as he says it, and the frog hops onto it; the end mark lights as his voice ends.
- **The act-out.** Then the picture plays the sentence for 1.6 s: something in, on or by another thing hops out to the side and back in with a big hop, landing squashed; a rock, log or lid lifts to show what is under it and drops back; a worn hat jumps off and spins back onto the head; a van drives off and back, a jet flies a loop, anything else hops twice. The frog puffs up happily, a chime plays with a sparkle, and the round ends 0.7 s later.

### Hearing words

A word is spoken when it is used: the teacher says each word as its pad joins the row, and the postman reads the finished sentence. Nothing is said when the round starts, so the child reads the picture and the words first.

**Word help** turns on in a round after 3 out-of-order presses, or after 14 s without a right press (not counting the introduction's demonstration). While it is on, a press on a pad out of order also says that pad's word, so pressing pads is a way to hear them. It carries into the next sentence round after a round with 3 such presses or a long pause, and switches off after a round with none. It is stored in the sentence bag (`sentences.assist`).

### How the words light up in time

The postman's sentence is one clip, so it sounds like natural speech; per-word clips played one after another sounded choppy. A table of when each word starts in each clip (`READ_TIMING` in `read-timing.ts`) is measured once, offline, by `scripts/voice/word-onsets.py`. That script runs the Whisper speech recogniser (faster-whisper, model small.en, on the CPU) for its word timings and the clip's loudness in 10 ms steps for the exact starts, because the postman often pauses between words and Whisper puts its word boundaries somewhere in those pauses (see the script for the rule). In the game, the scene reads how far the clip has played from the voice player's audio clock (`voicePlayer(audio).elapsed()`, output latency allowed for) every frame and lights each word once that time passes its start. In the checks the lights came 0 to 20 ms after each measured start, one or two frames. With the sound off, or if the clip does not start within 1.2 s, the same table runs on the game's own clock, and a sentence missing from the table lights a word every 0.45 s.

### Discovery without words

The first sentence round ever is an introduction: "Pigs sit on logs" (a pig standing on a log), with the pads drifting least. 1.6 s in, the cartoon glove comes down from above to the "Pigs" pad and presses it; the pad joins the row with the full response. Every press and key waits until that press, so an early press cannot skip it. The glove then taps the next right pad until the child does anything. The demonstrated press records nothing. In every later round, after 8 s without a press or a pointer movement, the see-through glove taps the next right pad (or the right end mark) for 2.4 s, and again after another quiet 8 s.

### Hidden tier and rounds

| Tier | Sentences | Side drift (px at 1366x768) |
| --- | --- | --- |
| Introduction | "Pigs sit on logs" | 6 |
| 0 | difficulty 1: three or four words (14 sentences, 5 of them questions) | 8 |
| 1 | difficulty 2: five words (13 sentences, 6 questions) | 12 |
| 2 | difficulty 3: six or seven words (19 sentences, 6 questions) | 16 |

A round picks a sentence of its tier other than the last round's, and scrambles its pads so the first pad on the water is never the sentence's first word. Each right press is a hit and each out-of-order press (words or marks) a miss for its own adaptive tier (`createAdaptiveTier`, the same settings as Rhyme snack). Lily-pad sentences keeps its own tier, round count, word help and last sentence in the save bag's `sentences` field, so a reader strong at rhymes still starts on short sentences, and its own tracker, whose attempts add up across rounds until the tier moves. The tier reached is saved at the round's end and used from the next round; the introduction and a forced debug tier record nothing. Misses only ease it.

Round end, stars and the sticker offer work as in Rhyme snack (see Round flow): every finished round earns a star and counts toward the set of three, and the set's end offers this game's stickers. With no gift, the rest screen shows the frog on a plain lily pad. `rounds` in the save bag still counts every activity, so Rhyme snack's introduction checks its own count (`rounds` less Word fountain's and the sentence rounds).

### Keyboard-only and mouse-only play

Mouse: press a pad, the picture or the water; any button. Keyboard: the first key in a round shows a focus ring on the pad nearest the top middle of the water and does nothing else. Arrows then move focus to the nearest pad in that direction (wrapping round when there is none), Tab and Shift+Tab step through the pads, and any other key presses the focused pad, at most once every 150 ms. A pad that has joined the row, or an end mark still rising (its first 0.25 s), cannot take focus or be pressed. Moving the mouse hides the ring until the next key.

### Layout and targets

Word pads are 96u tall (at least 72 px), the frog 116u (at least 84 px), all scaled with `u` like Rhyme snack. A floating pad's press area is the pad, at least 96 px on each side: measured 166x96 px at 800x600, and 112 px tall and about 230 px wide (wider for longer words) at 1366x768. The floating pads keep 44u clear of the bottom edge and never overlap (checked at 800x600 with seven pads). The frog stands on the back edge of its pad so the word stays in view. Everything sits below the corner buttons except the picture, which sits between them.

### Sound

| Moment | Sound |
| --- | --- |
| Right press | `key` A, one note higher per word, and the teacher's word |
| Pad lands in the row | `pop` B, quiet |
| Out-of-order press | `button` C, and the teacher's word while word help is on |
| End marks rise | `whoosh` A, quiet |
| Right end mark lands | `pop-big` A with a sparkle |
| Act-out starts and ends | `whoosh` A; `go` A with a sparkle |
| Press on the picture | `button` A, quiet |

### Measured

1366x768 on the dev box (100 Hz panel, muted headed Chrome off screen, `?debug` dev page), whole rounds from the first press through the reading into the act-out, with wrong presses and the wrong end mark: scene `workMean` 0.13 to 0.23 ms and `workP95` 0.2 to 0.6 ms over eight rounds at tiers 0 to 2 (mouse and keyboard); loop `workMean` 0.16 to 0.27 ms, `workP95` 0.3 to 0.7 ms; the longest frame of work 2.2 ms. Delivered frames: 95th percentile 10.1 to 10.2 ms, longest 11.3 ms. No console errors.

## Files

- `src/games/frog-pond/`: `index.ts` (definition and save validator), `scene.ts` (the shell: pond chooser, round end, save bag, corner buttons), `rhyme.ts` (Rhyme snack), `rhyme-rules.ts` (tiers, round plans, the tune), `pot.ts` (Word fountain), `pot-rules.ts` (its tiers, round plans and `joinWord`), `pot-cards.ts` (baked bubbles and two-colour cards), `sentences.ts` (Lily-pad sentences), `sentence-rules.ts` (its tiers, round plans and clip names), `read-timing.ts` (when each word starts in the sentence clips; generated), `cards.ts` (baked words and word pads), `voice.ts` (clip names), `data.ts` (save bag: tier, rounds, word help, last family, pending round, Word fountain's `pot` part, Lily-pad sentences' `sentences` part, and its validator), `content.ts` (words for all three activities).
- `dev/frog-pond.html`, `src/dev/frog-pond.ts`: isolated dev page.
- Debug (only with `?debug`): `?debug&tier=0..2&rounds=N&help=0|1&seed=N&made=N&pond&sentence=N` forces the tier, the round count of each activity (`rounds=0` replays all three introductions), word help in all three, the random seed, fills Word fountain's pond with the first N collection words (`made=23` for frame timing with the full pond, retired words included), shows the pond chooser, and picks Lily-pad sentences' sentence by its index in `SENTENCES`. `window.__frogPond` is a read-only stats object: phase, activity, tier (and the live adaptive tier), rounds, the target, word help, the bugs with their words, states and press rectangles, keyboard focus, the hand and tongue states, catches, dodges, the notes played, the frog's box, the targets on screen (pond spots, sticker choices, Again, Home, corner buttons) and frame work (`workMean`, `workP95`, `workMax`, `resetWork()`). `__frogPond.pot` has Word fountain's bubbles (word, state, half or decoy, press circle), swimmers, the lifted bubble, focus, word help, the hand, words made, bonks, the round's words, the reveals running and the fountain's rectangle. `__frogPond.sentences` holds that activity's state: the sentence and its end mark, the pads with their words, states and press rectangles, the next word, the step (play, back, read, act, done), the word lit and a log of when each lit in clip time, whether the clip started, keyboard focus, word help, the hand, misses, the frog and the picture's rectangle. `window.__frogPond` is a read-only stats object: phase, activity, tier (and the live adaptive tier), rounds, the target, word help, the bugs with their words, states and press rectangles, keyboard focus, the hand and tongue states, catches, dodges, the notes played, the frog's box, the targets on screen (pond spots, sticker choices, Again, Home, corner buttons) and frame work (`workMean`, `workP95`, `workMax`, `resetWork()`).
- `scripts/voice/lines/frog-pond-words.json`: Word fountain's clips.
- Shared edits: one registry entry after Ride Fare, six stickers appended to `STICKERS`, one music track name, Wibble's `game-frog-pond` line. Lily-pad sentences adds one method to the shared voice player, `elapsed()` (seconds of the current clip heard), in `src/audio/voice-player.ts`.
