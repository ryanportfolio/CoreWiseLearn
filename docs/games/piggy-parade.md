# Piggy Parade

A round game in a clay barn. Coins roll down a wooden chute onto a hay tray; clay piggy banks stand on a barn shelf, each wearing one coin as a belly badge. The child puts each coin into the piggy wearing the same coin. The game teaches what US coins look like (penny, nickel, dime, quarter), then heads and tails, and at the top of its hidden progression shows what coins are worth with dots and, at age 6, numerals with the ¢ sign. Nothing is counted by the child and nothing is bought. Learning tag: none of the existing `learning` values in `src/engine/registry.ts` fits; a `money` value needs that union widened, which is a shared-code change for the owner to approve. Until then the definition sets no tag.

The owner's settled design is in the round brief; the research behind it is [07. Money for ages 4 to 6](../research/07-money.md) (sections 1, 2 and 4, game A). The selected concept is [`piggy-parade/concept.webp`](piggy-parade/concept.webp).

## The action and its response

- **Put a coin in a piggy.** Three ways, all always on, none wrong: drag a coin from the tray and let go over a piggy; click a coin (it lifts and follows the pointer) and then click a piggy; or press a piggy while a coin is highlighted on the tray, which sends that coin flying to the piggy. Any mouse button counts.
- **The right piggy:** the coin flips up in an arc, spins (a horizontal squash of its sprite), drops into the slot on the piggy's back with a clink, and the piggy switches to its happy pose (eyes shut, mouth open, arms up) and wiggles for 0.5 s (rotation of plus and minus 6 degrees about its feet). Each coin makes that piggy 2 percent plumper, up to 8 percent, so the piggies visibly fill up over a round; the clink's pitch rises with the number of coins that piggy holds.
- **A different piggy:** the coin bumps the piggy's snout with a soft pop, rolls back to its place on the tray, and the piggy wearing that coin wiggles while its belly badge glows for 1 s. No error sound, no frown, nothing lost. After a second miss with the same coin, the helper hand points at the matching piggy, and the next drop of that coin on any piggy curves into the matching one (an assisted drop, which records nothing).
- **A coin let go over nothing** floats back to its tray place with a soft whoosh.
- **New coins** roll down the chute one at a time, spinning, clatter onto the hay with a small straw puff, wobble flat and settle in the next free tray place. The tray refills until the round's coins are used up.
- **The hen and chick** bob and peep (a quiet pop) when pressed. They are scenery: a press on them counts nothing.

Piggies are content, curious or delighted. They are never sad, hungry or waiting impatiently, and the coins are never a reward or a balance: the tray refills every round, nothing carries over, and no coin touches stars or stickers.

## Discovery without words

The first round ever is an introduction: two piggies (penny and quarter), four coins, tier 0 sizes. The clay helper hand rises from below, presses the highlighted penny, carries it to the piggy wearing the penny and lets go; the belly badge glows as the hand arrives and the piggy swallows the coin with its full response. The hand then taps the next highlighted coin in a loop until the child does anything. The introduction always earns three stars and records no evidence of any kind.

In every later round, after 6 s with no input the hand lifts a see-through hint coin (in a warm halo, drawn at 60 percent opacity so it never looks like a real coin) from the highlighted coin to its matching piggy, whose badge glows, then fades. It repeats every 8 s while the child stays idle and never moves a real coin. The demonstration matches the tier's main input: at tier 0 the hand presses the piggy, at tier 1 it clicks the coin and then the piggy, at tier 2 it drags.

## Round flow

1. **Play.** The round has a fixed number of coins (6, 8 or 10 by motor tier); the tray holds up to the tier's count at once and the chute delivers the rest as places free up. The coins of a round are drawn so every piggy gets at least one, in a shuffled order with no more than two of one kind in a row. Round progress shows as small clay coin-shaped dots along the bottom edge between the corner buttons: dots still to come are soft cream, used ones gold. These dots are decoration, never something to count.
2. **Line-up (step 8 only, at the round start).** See the learning steps.
3. **Celebration.** All piggies switch to their happy pose and dance in turn with a jingle of clinks; straw confetti; stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.6 s.
4. **Sticker choice,** while this game's six stickers are not all owned and `rewardsEnabled` is true: two stickers drawn by the shared helper `createStickerOffers` (`src/ui/sticker-offer.ts`), resting on two small hay bundles, with the small sticker book beside them. Same rules as Dino Picnic: input ignored for 1.2 s, nothing focused, the first key only shows focus; on a pick the sticker flies into the book and rest follows after `PICK_SECONDS`. `warm` and `warmBook` run during the celebration.
5. **Still rest:** the sticker book with the chosen sticker (or the four piggies in their content pose when there is no gift), the stars, and Again and Home of equal size and colour. Same input guard as the choice. `services.roundBoundary()` runs when rest is reached.

Stars: every finished round earns 3. Misses never cost a star.

Awards persist once: the round count, stars and the offered pair go into the game bag's `pending` field with a unique `id` (`crypto.randomUUID`, or a time and random string where that is unavailable) and `save.flush()` before the celebration shows. Choosing writes the sticker and `pending.chosen` together. Leaving or reloading during the celebration or choice returns to the choice; after rest it returns to rest; leaving rest by any route clears `pending`. Pause and resume through the break nudge keep the round where it was: coins in flight finish where they were heading, nothing restarts.

## Motor tiers (hidden, between rounds)

| Tier | Coins on tray at once | Coins per round | Piggy size | Snap distance | Hand demonstrates |
| --- | --- | --- | --- | --- | --- |
| 0 | 2 | 6 | 1.12 | 0.5 piggy widths | press the piggy |
| 1 | 4 | 8 | 1.0 | 0.25 piggy widths | click coin, click piggy |
| 2 | 6 | 10 | 0.9 | 0.1 piggy widths | drag |

- **Coins on tray** is capped by what fits in one row on the hay (see Layout); coins that do not fit wait in the chute.
- **Piggy size** multiplies the layout's piggy height; the fit can shrink it, never below a 96 px wide press zone.
- **Snap distance:** a released coin goes to a piggy if the release point is inside that piggy's press zone grown sideways and upward by the snap distance; growth stops at the midpoint between neighbouring piggies, so zones never overlap. While a coin is carried, the piggy it would go to shows a soft ring at its feet.
- **Drag vs click-click:** every tier accepts all three inputs. The tier changes only what the hand demonstrates; at tier 0 the highlighted coin also floats slightly above the hay so a single press on a piggy is the obvious move.
- **Coin sizes are not a motor knob:** they always follow the true diameter ratios.

Attempts, as in Dino Picnic: one deliberate placement counts once whatever the input style. A drop or press that lands on a piggy (right or wrong) is a hit; a coin let go over nothing, or a press on empty play space, is a miss. Picking a coin up counts nothing. Presses on the hen, chick, tray edge or a coin in flight count nothing. Keys, demonstrations, the introduction and the step-8 line-up never count. At round end: 8 or more attempts with under 70 percent hits moves down a tier; 12 or more at 90 percent or better is a qualifying round, and two qualifying rounds in a row move up a tier.

## Learning steps (separate from motor)

The step decides which coins and piggies appear and what the badges show. Piggy colours (pink, mint, butter yellow, sky blue) and their order on the shelf are shuffled every round in steps 1 to 5, so the belly badge is the only cue to the right piggy; colour never stands for a coin.

| Step | Piggies and badges | Coins on the tray | New idea |
| --- | --- | --- | --- |
| 1 | penny, quarter; heads | heads | copper vs silver and small vs big, the most different pair |
| 2 | penny, dime; heads | heads | close size, different colour |
| 3 | penny, nickel, dime; heads | heads | two silver coins of different size |
| 4 | all four; heads | heads | nickel vs quarter, same colour |
| 5 | all four; tails | heads | the same coin has two faces |
| 6 | all four on the wooden steps, in value order (penny lowest on the left, quarter highest on the right); heads; value dots on each step | heads | coins are worth different amounts; the dime stands above the bigger nickel |
| 7 | as 6, with 1¢, 5¢, 10¢, 25¢ beside the dots | heads | the written value |
| 8 | as 7, with the line-up at the round start | heads | value does not follow size |

- **Value dots (steps 6 to 8):** drawn in code on the front of each step: the penny's step 1 dot, the nickel's 5, the dime's 10 as two rows of five, the quarter's 25 as five rows of five. When a coin lands in its piggy, that step's dots pulse once from left to right with soft ticks (a show of the value, not a task). Numerals and the ¢ sign at step 7 and 8 come from the bundled Andika glyph cache, baked once per size.
- **Line-up (step 8):** one coin of each kind rolls onto the tray in size order (dime, penny, nickel, quarter). After a 1 s pause the coins hop into value order (penny, nickel, dime, quarter): the dime jumps over the penny and the nickel in one arc while each coin's dots pop up above it. About 5 s; any press or key speeds it to its end, and those four coins then join the round as its first coins.
- **Evidence** is one result per deliberate drop: right piggy or not. A drop is deliberate when it is made with the pointer (drag release, second click, or a press on a piggy while a coin is highlighted), at least 0.6 s after the previous drop, for a coin the hand has not pointed at, and not an assisted drop. Keys never record evidence, because steady key pressing would drop by habit. The introduction records nothing.
- **Advancing:** after at least 2 rounds at a step, 7 or more right out of the last 8 deliberate drops at that step moves up one step at the next round. Steps 6 to 8 advance on the same matching evidence; the value shown there is exposure and is never tested, as the research recommends for this age.
- **Easing:** 4 or fewer right out of the last 8 at a step moves back one step (never below step 1). Only drops at the current step count, so one hard round cannot drop a child two steps.
- **No stall:** a child who has played 3 rounds at a step without moving up gets every second round as a review round of the step below, played as a full round with its own stars and sticker. Review drops count only toward the review step's record and can never move the child down. A 4-year-old who stays at steps 1 to 4 gets full, complete rounds there indefinitely; a child who never reaches the value steps loses nothing.

A struggling child is eased within a round as well: after two misses with one coin, the hand points and the next drop is assisted (above); after 6 idle seconds the hand demonstrates.

## Keyboard-only and mouse-only play

- **Keyboard:** a bobbing arrow and a glowing ring mark the highlighted coin, starting on the leftmost coin on the tray. Left and Right move between coins. Any other key picks the coin up; the highlight then moves to the piggies, starting on the piggy it chose last time (on the first pick, the leftmost piggy). Left and Right move between piggies, Up and Down too in the two-shelf layout. Any other key drops. After a miss the highlight moves to the matching piggy, so steady key pressing alternates miss and right and the round always moves on. At most one action every 120 ms. During play every key plays (Escape, Tab and Enter included). After the round, the shared rules apply: Escape goes home, Tab reaches the corner Home and sound buttons, and choice and rest use first-key-shows-focus.
- **Mouse or trackpad only:** every action works with drag, with click-then-click, or with a single press on a piggy. A carried coin (click-click) follows the pointer until the next press anywhere: on a piggy it drops, elsewhere it floats back. Any mouse button counts.

## Layout

Sizes below are CSS px. `s = min(width / 1366, height / 768)`; `u` is `config.uiScale`.

**Coins** keep the true diameter ratios: dime 17.91 mm, penny 19.05, nickel 21.21, quarter 24.26. The dime is `max(96, 100 s) u` px; the others scale from it (penny x1.064, nickel x1.184, quarter x1.355). At 1366x768: dime 100, penny 106, nickel 118, quarter 135. At 1920x1080: dime 141, penny 150, nickel 167, quarter 191. At 800x600 and 390x600 the dime sits on its 96 px floor (quarter 130). A lifted or carried coin draws at 1.12 times; line-up coins at 1.2 times. Belly badges use one scale for all four coins so their ratios hold: `min(0.9, 0.5 x piggy width / quarter diameter)` times the coin's tray size, centred at 50 percent of the piggy sprite's width and 64 percent of its height.

**Landscape (width at least 0.9 times height): 1366x768, 1920x1080, 800x600**

| Piece | Place |
| --- | --- |
| Background | `barn.webp` cover-fitted |
| Chute | left edge, x 0 to 0.20 w, y 0.20 h to 0.66 h; its open end is above the tray's left end |
| Shelf | x 0.20 w to 0.92 w (width capped at the sprite's 1503 px), plank top at 0.57 h |
| Piggies | one equal slot per piggy across the shelf (2, 3 or 4 by step), feet on the plank; height 0.30 h times the tier size, width at most 0.9 of a slot |
| Tray | x 0.10 w to 0.89 w (capped at 1510 px), top edge at 0.66 h; it runs off the bottom edge as in the concept; coins sit in one row on the hay at 0.78 h |
| Hen | right of the shelf, x 0.92 w to 1.0 w, feet at 0.62 h, 0.17 h tall |
| Chick | bottom-right corner, x 0.90 w to 0.98 w, feet at 0.97 h, 0.15 h tall |
| Steps (steps 6 to 8) | replace the shelf: x 0.20 w to 0.92 w, bottom at 0.68 h; piggies stand on the four block tops (at 59, 39, 21 and 2 percent of the sprite's height), height 0.22 h |

- 1366x768: shelf 984 wide; with four piggies, slots 246 and piggies 230 tall and 208 wide at tier 1 (tier 0 is held to the slot: 221 wide); tray 1079 wide, hay row about 930 wide, so 6 coins of up to 135 fit.
- 1920x1080: shelf 1382 wide; piggies 324 tall at tier 1, 363 at tier 0 with two or three piggies (the largest piggy drawn anywhere); tray 1510 (capped); steps 1382 wide and 429 tall.
- 800x600: shelf 576 wide, slots 144, piggies 143 tall and 130 wide; tray 632 wide, hay row about 540: at most 3 coins at once.

**Portrait (narrower than 0.9 times height): 390x600**

- Two shelves of two piggies: plank tops at 0.42 h and 0.66 h, each shelf 0.92 w wide; piggies `min(0.22 h, 0.42 w / 0.905)` tall (132 tall, 119 wide at 390x600).
- No chute: new coins roll in from the left edge along the hay.
- Tray 0.98 w wide, top edge at 0.70 h; at most 2 coins at once (two quarters need 276 px of the 330 px hay row).
- Hen and chick are hidden.
- Steps levels: the steps sprite spans 0.98 w (bottom at 0.70 h) and the four piggies stand one per block, each 96 px wide (four blocks of 97 px at 390 px).

**Fit:** at every round start and resize the layout is tried as placed; then with piggies shrunk in 5 percent steps down to a 96 px wide press zone; then with fewer coins on the tray; then (landscape only) the two-shelf layout. No press zone overlaps another, the tray coins or a corner button. Every piggy press zone (its sprite box plus the snap growth) is at least 96 px on its shortest side, as is every coin (the dime's floor).

## Mistakes

A wrong piggy, a coin let go over nothing and a press on empty space all have gentle responses (snout bump and roll back, float back, nothing). They only ease the hidden difficulty: wrong drops count toward learning steps, misses toward the motor tier. Neither affects stars, stickers or anything the child can see.

## Art

Medium: handmade claymation in a red barn, matching the concept: soft plasticine with fingerprints, warm golden light from the upper left. Dino Picnic is also clay; Piggy Parade stays apart through the barn interior, the barn-red and hay-gold palette and the pastel piggies. Coins are smooth metal with soft relief, as in the concept. Dots, numerals, the ¢ sign, the progress dots, the hint coin's halo and the carry ring are drawn in code. No image contains text, numbers or a group of things to count.

All bitmaps were generated on 2026-10-04 with the built-in `image_gen` tool in Codex CLI 0.159.0 (agent model `gpt-6-astra`, reasoning medium, `model_provider=openai`); the tool did not report the image model. Every request attached the concept image (`.tmp/money-proto/p2.png` of the kids-browser-game-hub worktree, copied here as `piggy-parade/concept.webp`); the mint, butter yellow and sky blue piggy sheets also attached the finished pink sheet. Every prompt shared one style block ("handmade claymation look, soft plasticine/modelling clay with faint fingerprints and tool marks, rounded chunky forms, gentle matte sheen, warm golden studio light from the upper left, soft and friendly", plus the barn palette) and excluded text, letters, numbers, dates, logos, inscriptions, UI and frames. Sprites asked for a real transparent background with no shadow or glow.

Processing (`sharp`, scripts retained with the sources): the generator's alpha was already clean (each object solid, the rest fully transparent; the colour stored behind the transparency is discarded). A script took each object by its connected regions (alpha above 128, judged by each region's centre so an object reaching past the middle of a two-object sheet stays whole), dropped alpha under 12 and specks under 0.5 percent of the object, cropped with 8 px padding, gave every pixel with alpha under 250 the colour of its nearest solid pixel (no dark or glow fringe), resized with Lanczos 3 and wrote WebP quality 80, alpha quality 50. Coins: the disc's box was made square around its centre and the edge cut to an exact circle (the raw discs were round within 0.8 percent). Piggy frames: both poses share one box anchored at the feet, so a frame swap does not move the body. Every file was checked on mid-grey and dark backgrounds at full size for halos and stray pixels.

`barn.webp` was made by the three-strip method of PR #13: the 1536x1024 `bg-raw-1.png` was cut into three overlapping 683x1024 portrait strips, each enlarged to 1024x1536 and redrawn by its own request (same tool chain) as a sharper, faithful version of exactly that strip; the stitch script registered each strip on the raw enlarged 1.5 times, replaced each strip's broad colour (Gaussian blur, sigma 32 px) with the raw's, joined neighbours along the vertical path where they differ least (6 px feather) and resized the 2304x1536 mosaic to 1920x1280 with Lanczos 3; WebP quality 80, opaque. Alignment error 7.8 to 8.7 grey levels per strip, no uncovered pixels.

Raw sheets, prompts, Codex logs and the scripts are in `D:/CoreWise/_artifacts/CoreWiseLearn/piggy-parade/art-sources/`; the Codex originals are also under `C:/Users/Home/.codex/generated_images/`.

### Asset table

Largest drawn size is the biggest any screen draws the file in a 1920x1080 window at device pixel ratio 1, in its longest dimension unless noted; each is at most the file's own size.

| File in `public/art/piggy-parade/` | Pixels | Largest drawn (1920x1080) | Prompt file (in `art-sources/prompts/`) | Raw |
| --- | --- | --- | --- | --- |
| `barn.webp` | 1920x1280 opaque | 1920x1280 (cover fit, scale 1.0) | `bg-raw-1.prompt.txt`, strips `barn-s0-1` to `barn-s2-1.prompt.txt` | `bg-raw-1.png`, `barn-s*-1.png` |
| `coin-penny-heads.webp`, `coin-penny-tails.webp` | 320x320 | 180 (line-up, 150 x 1.2) | `coin-penny-1.prompt.txt` | `coin-penny-1.png` |
| `coin-nickel-heads.webp`, `coin-nickel-tails.webp` | 320x320 | 200 (line-up, 167 x 1.2) | `coin-nickel-1.prompt.txt` | `coin-nickel-1.png` |
| `coin-dime-heads.webp`, `coin-dime-tails.webp` | 320x320 | 169 (line-up, 141 x 1.2) | `coin-dime-1.prompt.txt` | `coin-dime-1.png` |
| `coin-quarter-heads.webp`, `coin-quarter-tails.webp` | 320x320 | 229 (line-up, 191 x 1.2) | `coin-quarter-1.prompt.txt` | `coin-quarter-1.png` |
| `piggy-pink-content.webp`, `piggy-pink-happy.webp` | 433x480 | 415 tall (tier 0: 363, times 1.06 wiggle stretch and 1.08 plumpness) | `pig-pink-2.prompt.txt` | `pig-pink-2.png` |
| `piggy-mint-{content,happy}.webp` | 437x480 | 415 tall | `pig-mint-2.prompt.txt` | `pig-mint-2.png` |
| `piggy-yellow-{content,happy}.webp` | 435x480 | 415 tall | `pig-yellow-2.prompt.txt` | `pig-yellow-2.png` |
| `piggy-blue-{content,happy}.webp` | 436x480 | 415 tall | `pig-blue-2.prompt.txt` | `pig-blue-2.png` |
| `shelf.webp` | 1503x260 | 1382 wide | `shelf-1.prompt.txt` | `shelf-1.png` |
| `tray.webp` | 1510x404 | 1510 wide (capped) | `tray-1.prompt.txt` | `tray-1.png` |
| `chute.webp` | 560x552 | 525 wide, 518 tall | `chute-1.prompt.txt` | `chute-1.png` |
| `steps.webp` | 1514x470 | 1382 wide | `steps-2.prompt.txt` | `steps-2.png` |
| `hen.webp` | 313x320 | 193 tall (184 x 1.05 bob) | `hen-chick-1.prompt.txt` | `hen-chick-1.png` (left) |
| `chick.webp` | 211x256 | 170 tall (162 x 1.05 bob) | `hen-chick-1.prompt.txt` | `hen-chick-1.png` (right) |
| `helper-hand.webp` | 232x256 | 173 tall | `hand-1.prompt.txt` | `hand-1.png` |
| `tile.webp` | 512x512 | 389 (hub tile, at most 0.36 h) | `tile-1.prompt.txt` | `tile-1.png` |
| `sticker-sunflower-piggy.webp` | 487x512 | 324 (offer, at most 0.30 h) | `stickers-a-1.prompt.txt` | `stickers-a-1.png` (left) |
| `sticker-hen-nest.webp` | 457x512 | 324 | `stickers-a-1.prompt.txt` | `stickers-a-1.png` (right) |
| `sticker-chick-hat.webp` | 419x512 | 324 | `stickers-b-1.prompt.txt` | `stickers-b-1.png` (left) |
| `sticker-tractor.webp` | 512x428 | 324 | `stickers-b-1.prompt.txt` | `stickers-b-1.png` (right) |
| `sticker-mud-piglet.webp` | 485x512 | 324 | `stickers-c-1.prompt.txt` | `stickers-c-1.png` (left) |
| `sticker-calf.webp` | 386x512 | 324 | `stickers-c-1.prompt.txt` | `stickers-c-1.png` (right) |

Stickers (ids `piggy-parade-<name>`): a mint piglet hugging a sunflower, a hen on a straw nest with one egg, a chick in a straw sun hat, a red toy tractor, a sky-blue piglet splashing in mud, a cream calf with a bell. None shows a coin, money or a price. The hub tile shows the pink piggy with one penny dropping into its slot.

Rejected or replaced generations, kept with the sources: `pig-pink-1` (body turned sideways, no front belly for the badge), `steps-1` (too tall: the tallest block would have pushed the top piggy off a 16:9 screen), `pig-yellow-1` (made before the pink sheet was attached as a reference; consistent, but the set uses the referenced `-2` sheets). The first `pig-mint-1` and `pig-blue-1` runs produced nothing because the pink sheet's path was wrong. The `steps-2` request also passed a second image path that did not exist; its log does not show whether the concept reached the tool, but the result matches the wood of the shelf and tray. Total shipped art: 828 KB.

## Sound

Existing effects from `src/audio/sfx.ts` only, with a variant passed on each call as Dino Picnic does.

| Moment | Effect |
| --- | --- |
| Coin bounces on the chute / lands on the hay | `tick` C, quiet / `pop` B, quiet |
| Coin picked up | `pop` B, quiet |
| Coin drops into the right piggy (clink) | `pop` C, pitch index = coins now in that piggy |
| Piggy wiggle | `pop-big` D, quiet |
| Coin bumps a different piggy's snout | `pop` A, quiet (no miss sound) |
| Coin rolls or floats back to the tray | `whoosh` D |
| Hen or chick pressed | `pop` A, quiet |
| Step dots pulse (steps 6 to 8) | `tick` C, pitch index = dot row |
| Line-up hops (step 8) | `tick` A, pitch index = position |
| Round end, stars, sticker, Again, Home | `fanfare` D, `star` B, `sticker` C, `whoosh` A, `button` B |

The fanfare is rendered ahead with `prepareSfxStep` as in Bubble Bay. Music: track name `piggy-parade` (`public/music/piggy-parade.mp3`, composed by the owner; silence until it exists), started and stopped like Bubble Bay.

## Voice clip slots

Optional clips in `public/voice/piggy-parade/` (README there names them): `penny`, `nickel`, `dime`, `quarter` play when a coin of that kind drops into its piggy; `number-1`, `number-5`, `number-10`, `number-25` play when a step's dots pulse (steps 6 to 8). A clip plays only if its file exists at build time (listed with `import.meta.glob`); a missing one is skipped with no request. None ship; naming coins is out of scope until voice exists.

## Performance

- No allocation in update or render. Coins (pool of 16, the most a round plus the line-up can show), flights and straw particles (pool of 120) are pooled; sprite names are built once into lookup tables.
- Every sprite draws at one fixed size per layout from the shared scaled-sprite cache and animates with transforms only: the coin spin is a horizontal scale, the wiggle a rotation, plumpness a scale. When the canvas size, pixel ratio, tier or fitted scale changes, the scene releases its scaled canvases and rebuilds them; leaving releases all of them, the backdrop included.
- Value dots, numerals with ¢, the progress dots, the hint halo and the carry ring are baked on CPU canvases (`willReadFrequently: true`, each bake ending with `getImageData(0, 0, 1, 1)`) only when their size or the pixel ratio changes, never per frame. No gradients, `shadowBlur` or `fillText` per frame.
- The backdrop is rescaled only when the canvas size or pixel ratio changes. The 1920x1280 background gets the early decode in `src/engine/sprites.ts`.
- Budget: `window.__corewise.loop.stats.workMean` and `workMax` well under 12 ms at 1366x768 throughout play, the line-up and the round end.

## Files (planned)

- `src/games/piggy-parade/`: `index.ts` (definition), `scene.ts`, `rules.ts` (tiers, steps, round coins), `data.ts` (save bag and its validator, set as `validateSave`), `voice.ts`.
- `dev/piggy-parade.html`, `src/dev/piggy-parade.ts`: dev page with `?debug&tier=0..2&step=1..8&seed=N`.
- Shared edits: one registry entry, six stickers appended to `STICKERS`, one music track name.
