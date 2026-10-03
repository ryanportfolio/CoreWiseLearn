# Dino Picnic

A round game in the Dinosaur Playground world. Baby clay dinosaurs sit at a picnic blanket, each with a leaf plate and a wish card that shows a quantity as dots with the numeral beside them. The child fills each plate with exactly that many fruits. Learning tag: `counting`.

## The action and its response

- **Feed a dino.** Press anywhere on a dino, its card or its plate: one fruit hops from the basket onto that plate. Pressing the basket picks up a fruit; drag it to a plate and let go, or click the basket and then click a plate (the fruit follows the pointer between the two clicks).
- **Each press fills a dot at once:** one hollow dot on the card fills with a picture of the fruit and pulses while the fruit is still in the air, so the card shows full as soon as enough fruit is on its way. Presses while the last fruit is still flying send nothing more (the dino only wiggles; a carried fruit floats back to the basket), and the highlight moves to a dino that still wants fruit.
- **Each fruit lands** with a squash, a small crumb burst and a pop whose pitch rises with the count on that plate, and the dino opens its mouth in a happy "aaah" and wiggles. Up to three fruits sit in a row at full size (31 percent of the plate width); rows of four and five use smaller fruit so the whole row stays on the leaf.
- **When the plate matches the card,** the dino bobs for 0.8 s. If nothing more arrives, it eats the fruits one by one (each chomp is a rising note and a counted dot), then dances with confetti. The card shrinks away and a new wish appears after a short pause.
- **Too many:** a press after the plate is already full sends a spare fruit; it touches the full plate and bounces back to the basket while the dino giggles (three soft quick notes) in its delighted pose. Nothing is scolded and nothing is taken away.
- **Which dino has more?** From counting stage 2, each round ends with two comparisons. Fruit drops onto two plates in loose heaps (each layer one fruit narrower and nestled between the fruits below, jittered and tilted, with every fruit visible) and a clay party hat floats between the dinos. The child presses the dino with more. The hat lands on the chosen dino; the piles then slide into rows of five, and the extra fruits on the bigger plate glow and bounce. If the child picked the smaller pile, that dino giggles with the hat for a moment, then the hat hops over to the bigger pile. Both dinos eat and dance either way.

The dinos are content, curious or delighted. They are never shown hungry, sad or waiting impatiently.

## Discovery without words

The first round ever is an introduction: one dino, cards of 2, 1 and 3. A clay helper hand comes up from below and points at the first card's dots, tapping each in turn; every tapped dot pulses with a soft tick. The hand then presses the basket, carries a fruit to the plate and lets go, so the first dot fills in front of the child. The hand then taps the basket in a loop until the child does anything. That round always earns three stars and records no evidence.

After six quiet seconds in any round, the hand carries a hint fruit from the basket to the highlighted plate and lets it fade. The hint fruit sits in a pulsing warm halo with a white rim and is slightly see-through, so it is easy to see but does not look like a fruit on the plate; it never changes a plate or a card. It repeats at most every seven seconds while the child stays idle. The first comparison ever is demonstrated the same way: the hand moves to the dino with more fruit and presses it.

In every later comparison, after six quiet seconds the hand rises again and points at the dino with more fruit for three seconds without choosing, and repeats every eight seconds while the child stays idle. A press anywhere that is not on a dino (and any press or key while the fruit is still dropping) makes both dinos hop with a soft pop.

## Round flow

1. Orders: 4 plates at tier 0, 6 plates at tiers 1 and 2. Round progress shows as a row of small leaf plates along the bottom edge, filling as plates are eaten.
2. Comparisons (stage 2 only): 2 per round, after the plates.
3. Celebration: three dinos dance, confetti, stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.6 s.
4. Sticker choice, while this game's six stickers are not all owned and `rewardsEnabled` is true: two stickers on leaf plates. Input is ignored for 1.2 s, nothing is focused, and the first key only shows focus; a later key acts once focus has shown for 0.25 s.
5. Still rest: the chosen sticker on a leaf plate (or the three dinos when there is no gift), the stars, and Again and Home of equal size and colour. The same guard as the choice: input ignored for 1.2 s, no focus until a key or the pointer shows it. `services.roundBoundary()` runs when rest is reached. When the break nudge covered the choice or rest and is dismissed, the guard starts over as on first appearance.

The round-end fanfare is rendered ahead once per session with `prepareSfxStep`, as in Bubble Bay: the long first step when a round starts (under the enter fade, or on the still rest after Again), the short note steps in idle periods during play.

Stars: 3 in the introduction. Otherwise 1 for finishing, a second when at least half the plates were filled without a spare fruit, a third when every plate was. Comparisons do not affect stars.

Awards persist once: the round count, stars and the offered pair are written to the game bag's `pending` field with `save.flush()` before the celebration shows. Choosing a sticker writes the sticker and `pending.chosen` together. Leaving or reloading during the celebration or the choice returns to the choice; after rest it returns to rest; Leaving rest by any route (Again, Home, the corner Home, Escape, the break nudge's Home) clears `pending`, so the next entry starts a new round; a gift not yet chosen when leaving during the celebration or the choice comes back exactly once.

## Motor tiers (hidden, between rounds)

| Tier | Dinos at once | Size | Basket |
| --- | --- | --- | --- |
| 0 | 1 | 1.15 | beside the plate, right |
| 1 | 2 | 1.0 | bottom centre, between plates |
| 2 | 3 | 0.9 | bottom-left corner, farthest |

Every dino target (card, body and plate) is at least 96 CSS px in both directions, as is the basket (radius at least 48 px). Neighbouring press zones never overlap: where the tier's places leave too little room for the widest wish card (narrow screens such as 390x600 with three dinos), the dinos spread evenly across the width and the cards shrink to fit between them. No press zone overlaps the basket or a corner button, and no wish card leaves the top of the screen: where a large config `uiScale` asks for more than fits (uiScale 2 at 1366x768, for example), the dinos first stand lower, with the progress row moving up between the corner buttons, and then the dinos, plates, cards and basket shrink in 5 percent steps until everything fits. The basket's press circle stays fully on screen. The rest screen's Again and Home keep a radius of at least 48 px at every uiScale. Attempts: one deliberate placement counts once, whatever the input style. A press on a dino sends a fruit and counts one hit; picking a fruit up from the basket counts nothing, and putting it down counts one hit on a dino or one miss elsewhere (a drag and a click-then-click count the same). Letting go over the basket after a long press drops the fruit back in and counts nothing. A press on empty play space counts one miss. In a comparison only a press that chooses a dino counts; other presses there only make the dinos hop. Key presses, demonstrations and the introduction never count. At the end of a round: 8 or more attempts with under 70 percent on target moves down a tier; 12 or more at 90 percent or better counts as a qualifying round, and two in a row move up a tier.

## Counting progression (separate from motor)

| Stage | Quantities on cards | Notes |
| --- | --- | --- |
| 0 | 1 to 3 | one row of dots |
| 1 | 1 to 5, mostly 2 to 5 | one row of dots |
| 2 | 1 to 10, mostly 3 to 10 | two rows, grouped in fives; comparisons start |

Evidence is one result per plate that the child filled: exact (no spare fruit sent to it while it was being filled or settling) or not. Plates in the introduction are excluded. A press on the same dino within 150 ms of the previous one is treated as the same press, so a bounce or double-click does not send a spare. Between rounds, 6 or more exact plates in the last 8 move up a stage; 2 or fewer in the last 6 move down one.

Comparisons record whether the child chose the plate with more, only for deliberate choices: a pointer press at least 0.6 s after the hat appears, or a key press at least 0.5 s after the keyboard focus was shown. The demonstrated comparison is excluded, as is any comparison in which the hand has already pointed at the answer. Level 0 compares 1 to 5 (difference at least 2); 4 of the last 5 correct moves to level 1 (1 to 10); 1 or fewer moves back.

## Keyboard-only play

A bobbing arrow above the card and a ring around the plate mark the highlighted dino; it starts on the first dino that is still filling. Arrow keys move between dinos. Any other key sends one fruit to the highlighted dino (at most one every 120 ms). In comparisons the first key shows the highlight, arrows switch, and the next key chooses. During play every key plays, Escape, Tab and Enter included, so key mashing never leaves the round. After the round (celebration once it can be skipped, choice and rest once their guard has passed) Escape goes home and Tab cycles focus to the Home and sound corners, where Enter activates them. Choice and rest use the shared rule: first key shows focus, arrows move, the next key chooses.

## Art

Medium: soft handmade clay (plasticine with fingerprint texture), true colour WebP. Shared controls (Home, sound, play arrow) reuse the existing art. Numerals and dots are drawn in code: the numeral uses the bundled Andika glyph cache (`drawCounter`), and every quantity is placed fruit by fruit in code. The party hat is drawn in code once per layout size and pixel ratio.

All bitmaps were generated on 2026-10-03 with the built-in `image_gen` tool in Codex CLI 0.159.0 (agent model `gpt-6-astra`, reasoning medium). The tool did not report the image model. Each run attached one reference: the clay Dinosaur Playground quadrant cropped from `D:/screenshots/CoreWiseLearn/concepts/four-worlds-v1.1.png`. Every prompt shared this style block: "soft handmade plasticine/modelling clay, rounded chunky forms, faint fingerprint and tool texture, gentle matte sheen, warm soft light from the upper left, saturated but warm colours, simple big friendly eyes with one white highlight, rosy cheeks", and excluded text, letters, numerals, logos, frames, cast shadows, glow, sharp teeth or claws, and sad, hungry, pleading or scared expressions. Sprite sheets asked for a transparent background.

| Files in `public/art/dino-picnic/` | Prompt subject |
| --- | --- |
| `dino-green-{content,chomp,happy}.webp` | One baby long-necked sauropod, leaf green with darker spots and a cream belly, three times in a row with the same pose: mouth closed smiling; mouth open in a happy "aaah"; eyes shut in joy with little arms raised. |
| `dino-orange-*.webp` | The same sheet for a chubby tangerine triceratops with a scalloped peach frill and three rounded cream horns. |
| `dino-blue-*.webp` | The same sheet for a round sky-blue stegosaurus with darker spots and rounded yellow plates. |
| `fruit-{strawberry,apple,orange,pear,watermelon,banana}.webp` | Six single clay fruits in a 3 by 2 grid, one fruit each, no faces. |
| `leaf-plate.webp`, `basket.webp`, `helper-hand.webp` | An empty round leaf plate with a curled rim, an empty low wicker basket with a handle, a chubby white clay glove hand pointing up-left. |
| `sticker-{hatchling,pterosaur,rex,ankylosaurus,parasaurolophus,cake}.webp` | Six collectibles: purple hatchling in a spotted egg, teal pterosaur gliding, coral baby tyrannosaurus hugging a strawberry, yellow ankylosaurus, pink parasaurolophus humming, a strawberry cake slice on a leaf. |
| `tile.webp` | Hub icon: a green baby dino sitting and holding up a leaf plate with one strawberry. |
| `meadow.webp` | Opaque 3:2 background: clay valley with palms, a small distant volcano, a wide empty lawn and an empty coral gingham blanket; no characters or food. |

Processing (`sharp`, script retained with the sources): each sheet's alpha channel was already clean (opaque objects, fully transparent surroundings; the colour behind the transparency is discarded). Objects were found as connected regions of alpha above 128, isolated so no neighbour's pixels remain, and padded 8 px. The three poses of each dino share one box anchored at the tail tip and the feet, so frames swap without the body jumping. Sprites were resized with sharp's default filter and written as WebP quality 90 with alpha quality 100: dinos 384 px tall, fruit 160 px, plate 360 px, basket 400 px, hand 200 px, stickers and tile 512 px. The background is 1366 x 911 WebP quality 86. Every result was checked on light and dark backgrounds for halos and stray pixels. Total: about 880 KB.

Raw sheets, prompts and the processing script are retained outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/dino-picnic/art-sources/`; the Codex originals are under `C:/Users/Home/.codex/generated_images/`.

## Sound

Effects come from `src/audio/sfx.ts`; this game passes a variant on each call instead of changing the app-wide setting.

| Moment | Effect |
| --- | --- |
| Card appears | `pop-big` D, quiet |
| Fruit lands on a plate | `pop` C, pitch index = count on that plate |
| Pick up from the basket | `pop` B, quiet |
| Spare fruit giggle | three `pop` A notes 90 ms apart, quiet |
| Fruit dropped on nothing returns | `whoosh` D |
| Dino eats a fruit | `pop` D, pitch index = fruit number |
| Dance | `go` C |
| Comparison fruit drops | `tick` C |
| Hat appears / hat lands on the bigger pile | `pop-big` B / `pop-big` C |
| Hat moves | `whoosh` B |
| Round end, stars, sticker, Again, Home | `fanfare` D, `star` B, `sticker` C, `whoosh` A, `button` B |

Music: track name `dino-picnic` (`public/music/dino-picnic.mp3`, composed by the owner; silence until it exists).

## Voice clip slots

Optional clips live in `public/voice/dino-picnic/` (see the README there): `number-1` to `number-10` play when a card appears (its number) and on each chomp while eating (counting up); `more` plays when the comparison hat appears. `src/games/dino-picnic/voice.ts` lists the files present at build time with `import.meta.glob`, so a missing clip is skipped with no request. None ship.

## Performance

No allocation in update or render: dinos, flights (32) and particles (220) are pooled; fruit positions are computed into one shared point; sprite and voice clip names are built once into lookup tables at load. Plate fruit is 31 percent of the plate width (73 px at 1366x768 with two dinos, 84 px with one, 66 px with three); rows of four and five draw the same cached fruit at a smaller transform scale, so a row spans at most 86 percent of the plate. Every sprite is drawn at a fixed size per layout and animated with transforms, so the scaled-sprite cache does not grow. Card numerals come from cached glyph canvases; the hat and the hint fruit's halo are baked at the canvas pixel ratio, only when their size or that ratio changes, and the backdrop is rescaled only when the canvas size or pixel ratio changes (the loop lowers the ratio on slow frames and raises it again on fast ones without changing the size), so a round's end or a comparison's start does no baking. No gradients, `shadowBlur` or `fillText` per frame.

## Files

- `src/games/dino-picnic/`: `index.ts` (definition), `scene.ts`, `rules.ts` (tiers, stages, stars), `data.ts` (save bag and validation), `voice.ts`.
- `dev/dino-picnic.html`, `src/dev/dino-picnic.ts`: isolated dev page; `?debug&tier=0..2&stage=0..2&rounds=N&seed=N`.
- Shared edits: one registry entry, six stickers appended to `STICKERS`, one music track name.
