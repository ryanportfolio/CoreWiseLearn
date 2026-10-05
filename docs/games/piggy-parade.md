# Piggy Parade

A round game in a clay barn. Coins roll down a wooden chute onto a hay tray; clay piggy banks stand on a barn shelf, each wearing one coin as a belly badge. The child puts each coin into the piggy wearing the same coin. The game teaches what US coins look like (penny, nickel, dime, quarter), then heads and tails, and at the top of its hidden progression shows what coins are worth with dots and, at age 6, numerals with the ¢ sign. Nothing is counted by the child and nothing is bought. Learning tag: none of the existing `learning` values in `src/engine/registry.ts` fits; a `money` value needs that union widened, which is a shared-code change for the owner to approve. Until then the definition sets no tag.

The owner's settled design is in the round brief; the research behind it is [07. Money for ages 4 to 6](../research/07-money.md) (sections 1, 2 and 4, game A). The selected concept is [`piggy-parade/concept.webp`](piggy-parade/concept.webp).

## The action and its response

- **Put a coin in a piggy.** Three ways, all always on, none wrong: drag a coin from the tray and let go over a piggy; click a coin (it lifts and follows the pointer) and then click a piggy; or press a piggy while a coin is highlighted on the tray, which sends that coin flying to the piggy. Hovering a coin on the tray moves the highlight to it. Any mouse button counts.
- **The right piggy:** the coin flies up in an arc, spinning (a horizontal squash of its sprite), arrives edge-on above the slot on the piggy's back and drops in behind the piggy's head with a clink and a soft "boing" (the `button` C sound, the closest thing to an oink in the existing set). The piggy switches to its happy pose (eyes shut, mouth open, arms up) for 0.9 s and wiggles for 0.5 s (rotation of up to 6 degrees either way about its feet). The piggies visibly fill up over a round in two ways: each coin makes that piggy 2 percent wider and 1 percent taller (up to 8 and 4 percent), and the swallowed coins pile up as a small stack of that coin beside the piggy's right foot. The clink's pitch rises with the number of coins that piggy holds; the hen hops.
- **A different piggy:** the coin bumps the piggy's snout with a soft pop (the piggy squashes a little), rolls back to its place on the tray with a whoosh, and the piggy wearing that coin wiggles while its belly badge glows for 1 s. No error sound, no frown, nothing lost. After a second miss with the same coin, the helper hand points at the matching piggy, and the next drop of that coin on any piggy curves into the matching one (an assisted drop, which records nothing).
- **A coin let go over nothing** floats back to its tray place with a soft whoosh. Let go over its own tray place, it just settles back.
- **New coins** roll down the chute one at a time (at half size, since the chute stands further back), fall off its open end while growing to full size, land on the hay with a small straw puff, roll like a wheel to the next free tray place, wobble and settle upright, so the face always reads the right way up. The tray refills until the round's coins are used up.
- **The hen and chick** are scenery: they bob gently and the hen hops when a coin goes into a piggy. They are not pressable.

Piggies are content, curious or delighted. They are never sad, hungry or waiting impatiently, and the coins are never a reward or a balance: the tray refills every round, nothing carries over, and no coin touches stars or stickers.

## Discovery without words

The first round ever is an introduction: two piggies (penny and quarter), four coins, tier 0 sizes, two coins on the tray. As soon as the first coin rests, the clay helper hand rises from below, presses the highlighted coin (whichever of penny or quarter came first), carries it to the piggy wearing the same coin and lets go; the belly badge glows as the hand arrives and the piggy swallows the coin with its full response. Play input waits during these 2.9 s. The hand then taps the next highlighted coin in a loop until the child does anything. The introduction always earns three stars and records no evidence of any kind.

In every later round, after 6 s with no input the hand lifts a see-through hint coin (in a warm halo, drawn at 60 percent opacity so it never looks like a real coin) from the highlighted coin to its matching piggy, whose badge glows, then fades. It repeats every 8 s while the child stays idle and never moves a real coin. The demonstration matches the tier's main input: at tier 0 the hand presses the piggy and the hint coin flies there by itself, at tier 1 it taps the coin, carries the hint coin and taps the piggy, at tier 2 it presses the coin and carries the hint coin with the finger held down.

## Round flow

1. **Play.** The round has a fixed number of coins (6, 8 or 10 by motor tier; 4 in the introduction); the tray holds up to the tier's count at once and the chute delivers the rest, one every 0.45 s, as places free up. The coins of a round are drawn so every piggy gets at least one, in a shuffled order with no more than two of one kind in a row. There is no separate progress indicator: the piggies filling up (their coin stacks and plumpness) and the chute running dry show how far the round has come, and nothing on screen besides the value dots of steps 6 to 8 is a row of dots that could be mistaken for something to count. Once every coin is in a piggy, the round ends 0.7 s later.
2. **Line-up (step 8 only, before play).** At step 8 every round opens with the line-up described under the learning steps (4.5 s). The round's coins start down the chute when it ends.
3. **Celebration.** The shelf stays; all piggies switch to their happy pose and dance in turn (one hop each, 0.35 s apart, each with a clink and a puff of straw), then bounce together; confetti; stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.6 s.
4. **Sticker choice,** while this game's six stickers are not all owned and `rewardsEnabled` is true: two stickers drawn by the shared helper `createStickerOffers` (`src/ui/sticker-offer.ts`) over the barn, with the small sticker book beside them. There are no hay bundles under them (no sprite exists for them; the offers stand on their own as in the helper's default look). Same rules as Dino Picnic: input ignored for 1.2 s, nothing focused, the first key only shows focus; on a pick the sticker flies into the book and rest follows after `PICK_SECONDS`. `warm` and `warmBook` run during the celebration.
5. **Still rest:** the sticker book with the chosen sticker (or, when there is no gift, the round's piggies in their content pose on a short shelf), the stars, and Again and Home of equal size and colour. Same input guard as the choice. `services.roundBoundary()` runs when rest is reached.

Stars: every finished round earns 3. Misses never cost a star.

Awards persist once: the round count, stars, the offered pair and the round's piggy colours go into the game bag's `pending` field with a unique `id` (`crypto.randomUUID`, or a time and random string where that is unavailable) and `save.flush()` before the celebration shows. Choosing writes the sticker and `pending.chosen` together. Leaving or reloading during the celebration or choice returns to the choice; after rest it returns to rest; leaving rest by any route clears `pending`. Pause and resume through the break nudge keep the round where it was: coins in flight finish where they were heading, nothing restarts.

## Motor tiers (hidden, between rounds)

| Tier | Coins on tray at once | Coins per round | Piggy size | Snap distance | Hand demonstrates |
| --- | --- | --- | --- | --- | --- |
| 0 | 2 | 6 | 1.12 | 0.5 piggy widths | press the piggy |
| 1 | 4 | 8 | 1.0 | 0.25 piggy widths | click coin, click piggy |
| 2 | 6 | 10 | 0.9 | 0.1 piggy widths | drag |

- **Coins on tray** is capped at the round start by how many of the round's biggest coin fit in one row on the hay, 10 px apart (see Layout); coins that do not fit wait in the chute.
- **Piggy size** multiplies the layout's piggy height; the fit can shrink it, never below a 96 px wide body.
- **Snap distance:** a released coin goes to a piggy if the release point is inside that piggy's drop zone: its sprite box grown sideways and upward by the snap distance and reaching 0.02 h below its feet. Growth stops 2 px short of the midpoint to a neighbouring piggy on the same shelf, so zones never overlap, and the top of a zone that would reach into a corner button stops 4 px below it. While a coin is carried, the piggy it would go to shows a soft ring at its feet.
- **Drag vs click-click:** every tier accepts all three inputs. The tier changes only what the hand demonstrates; at tier 0 the highlighted coin also floats slightly above the hay so a single press on a piggy is the obvious move.
- **Coin sizes are not a motor knob:** they always follow the true diameter ratios.

Attempts: one placement with the pointer counts once, whatever the input style. A coin put on a piggy (right or wrong, by drag release, second click or a press on a piggy with a coin highlighted) is a hit; a coin let go over nothing (a drag released away from its own tray place, or the second press of a click-click carry off every piggy) is a miss. Picking a coin up counts nothing, and so does a press when no coin is in hand and the press misses every piggy. Keys, the hand, the introduction and the step-8 line-up never count. At round end the round has enough evidence when the child made at least three quarters of its coin count in pointer attempts (5, 6 or 8 for rounds of 6, 8 or 10 coins); then a hit rate under 70 percent moves down a tier, and 90 percent or better is a qualifying round. Two qualifying rounds in a row move up a tier; any other round resets the count. A steady, accurate pointer player reaches tier 1 after the second round following the introduction and tier 2 after the fourth (checked in the browser: tiers 0, 0, 1, 1, 2 over rounds 2 to 6). A keyboard-only child stays at their motor tier, since keys say nothing about pointer control.

## Learning steps (separate from motor)

The step decides which coins and piggies appear and what the badges show. Piggy colours (pink, mint, butter yellow, sky blue) are shuffled every round at every step, and their order on the shelf too in steps 1 to 5, so the belly badge is the only cue to the right piggy; colour never stands for a coin. On the steps (6 to 8) the order is always value order.

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

- **Value dots (steps 6 to 8):** drawn in code on the front face of each step: the penny's step 1 dot, the nickel's 5 in one row, the dime's 10 as two rows of five, the quarter's 25 as five rows of five. Each row of five (and the penny's single dot) sits in its own dark groove, and rows stand 1.3 dot pitches apart, so the groups of five read apart. All four steps use one dot size, the largest that fits every face, so no coin's dots look bigger than another's (at 1366x768: 27 px dots at step 6, 19 px at steps 7 and 8; at 1920x1080: 38 and 28 px; at 390x600: 12 px). When a coin lands in its piggy, that step's dots pulse once, row by row and left to right within a row, with a soft tick per row, and its label pops (a show of the value, not a task). A drop on a step's front face counts as a drop on its piggy.
- **Labels (steps 7 and 8):** 1¢, 5¢, 10¢ and 25¢ in the bundled Andika font, cream with a brown rim, one size for all four (0.12 of a block's width, 16 to 44 px: 28 px at 1366x768, 40 at 1920x1080, 16 at 390x600). Each label stands beside its dots, to their left and level with their middle, when the faces are wide enough for that to leave bigger dots (landscape); otherwise above them (portrait). Baked once per size and pixel ratio.
- **Line-up (step 8):** at the start of every step-8 round one coin of each kind rolls in from the left along the hay, smallest first, and stops in size order (dime, penny, nickel, quarter); each coin hops in turn (0.9 to 1.6 s). Labels appear under the coins (1.5 s); then the coins move into value order (penny, nickel, dime, quarter) in 0.9 s, the dime jumping over the penny and the nickel in one high arc while they slide left. Left to right, each coin hops as its step's dots pulse (from 2.7 s), and at 4.0 s the four roll off the right end of the tray. Play starts at 4.5 s; these coins are a show and do not join the round. The first time a profile sees it, it plays to its end and input waits; once it has played out once (`lineupSeen` in the save), any press or key ends it at once and play starts. Coins in the line-up are drawn at tray size, smaller only where four do not fit the hay (portrait: 0.67 at 390x600); they are not targets.
- **First-time demonstrations:** the first round a profile plays at step 6, and again at step 7, opens like the introduction: the hand carries the first highlighted coin to its piggy on the steps, the coin goes in and that step's dots pulse (and at step 7 its label pops); play input waits for those 2.9 s and the hand then taps the next coin until the child acts. At step 8 the first line-up is the demonstration, and the hand rises at 1.2 s to ride under the dime as it jumps. Each shows once per profile (`demos` bits in the save); the demonstrated coin records nothing.
- **Evidence** is one result per deliberate drop: right piggy or not. A drop is deliberate when the child chose it, at least 0.6 s after the previous drop, for a coin the hand has not shown (by an idle hint for that coin or by pointing after two misses), not an assisted drop, outside the introduction and outside a review round.
  - **With the pointer** every drop is chosen: a drag release, a second click, or a press on a piggy while a coin is highlighted.
  - **With keys** a drop is chosen when the child moved the piggy highlight with an arrow key while holding that coin and then waited at least 0.4 s before the drop key. A key pressed straight through (the highlight still where it started) plays fully but records nothing, because steady key pressing would drop by habit. So a keyboard child who picks piggies with the arrows advances like a pointer child (checked: keyboard-only rounds with arrow choices moved from step 1 to 3 in the four rounds after the introduction), while a child mashing one key records nothing and keeps getting full rounds at their step.
- **Advancing:** after at least 2 rounds at a step, 7 or more right out of the last 8 deliberate drops at that step moves up one step at the next round, up to step 8, the top. Steps 6 to 8 advance on the same matching evidence; the value shown there is exposure and is never tested, as the research recommends for this age. The line-up records nothing.
- **Easing:** 4 or fewer right out of the last 8 at a step moves back one step (never below step 1). Only drops at the current step count, so one hard round cannot drop a child two steps.
- **No stall:** steps change only on evidence, and every round is a full round with stars and a sticker whatever the evidence. A child who has played 3 rounds at a step (step 2 or higher) without moving gets every second round as a review round of the step below, a full round that records no evidence. The same holds at step 8, where there is no step above: a child who stays there gets step-7 rounds mixed in (checked: an accurate pointer player climbed from step 1 to 8 in 15 rounds and then played 8, 8, 8, 7, 8). A 4-year-old who stays at steps 1 to 4, or a keyboard child who never uses the arrows, gets full, complete rounds there indefinitely; a child who never reaches the value steps loses nothing.

A struggling child is eased within a round as well: after two misses with one coin, the hand points and the next drop is assisted (above); after 6 idle seconds the hand demonstrates.

## Keyboard-only and mouse-only play

- **Keyboard:** a bobbing arrow and a glowing ring mark the highlighted coin, starting on the leftmost coin on the tray. Left and Right (and Up and Down) move between resting coins. Any other key picks the coin up: it lifts above its tray place, and the highlight (a ring at the feet and an arrow above the head) moves to the piggies, starting on the piggy chosen last time (on the first pick, the leftmost piggy), or on the matching piggy when this coin has already missed once. Left and Right move between piggies; Up and Down move between shelves in the two-shelf layout and act like Left and Right otherwise. Any other key drops. So steady key pressing alternates at worst one miss and one right drop per coin, and the round always moves on. At most one acting key every 120 ms. During play every key plays (Escape, Tab and Enter included). After the round, the shared rules apply: Escape goes home, Tab reaches the corner Home and sound buttons, and choice and rest use first-key-shows-focus.
- **Mouse or trackpad only:** every action works with drag, with click-then-click, or with a single press on a piggy. A carried coin (click-click) follows the pointer until the next press anywhere: on a piggy it drops, elsewhere it floats back. A coin lifted by a key can also be placed with a press. Any mouse button counts.

## Layout

Sizes below are CSS px. `s = min(width / 1366, height / 768)`; `u` is `config.uiScale`. The pixel sizes in this section and in the asset table assume `uiScale` 1, the default. A larger `uiScale` makes the coins bigger, up to the dime's cap of 210 px (a carried quarter is then 320 px, its sprite's own size, so coins never draw past their pixels); the tray then holds fewer coins, and everything else follows the screen, not `uiScale`.

**Coins** keep the true diameter ratios: dime 17.91 mm, penny 19.05, nickel 21.21, quarter 24.26. The dime is `min(210, max(96, 100 s u))` px; the others scale from it (penny x1.064, nickel x1.184, quarter x1.355), rounded. At 1366x768: dime 100, penny 106, nickel 118, quarter 135. At 1920x1080: dime 141, penny 150, nickel 166, quarter 190. At 800x600 and 390x600 the dime sits on its 96 px floor (penny 102, nickel 114, quarter 130). A lifted or carried coin draws at 1.12 times (dime 112 and quarter 151 at 1366x768); coins on the chute at half size. Belly badges use one scale for all four coins so their ratios hold: `min(0.9, 0.5 x piggy width / quarter diameter)` times the coin's tray size, centred at 50 percent of the piggy sprite's width and 64 percent of its height. A coin's hit area is the square around it, as wide as the coin, so every coin target is at least the dime's 96 px.

**Landscape (width at least 0.9 times height): 1366x768, 1920x1080, 800x600**

| Piece | Place |
| --- | --- |
| Background | `barn.webp` cover-fitted |
| Chute | the largest size that fits inside the box x 0 to 0.20 w, y 0.20 h to 0.66 h with the sprite's own aspect (560:552) and never above its own pixels, bottom-left aligned (left edge at 0, bottom at 0.66 h). Its groove runs from 20 / 12 percent to 90 / 86 percent of the sprite (x / y); the open end is above the tray's left end. |
| Shelf | width `min(0.72 w, 1503)` centred at 0.56 w (filling 0.20 w to 0.92 w until the cap), plank top at 0.57 h (the plank's top edge is 4 percent down the sprite) |
| Piggies | one equal slot per piggy across the shelf (2, 3 or 4 by step), feet on the plank; height 0.30 h times the tier size, width at most 0.9 of a slot (height follows from the width then) |
| Tray | x 0.10 w to 0.89 w (capped at 1510 px, centred in that span), top edge at 0.66 h; it runs off the bottom edge as in the concept. The hay spans 7 to 92 percent of the sprite's width; coins sit in one row at 33 percent of the tray's height (and always below every drop zone). Tray places are spread evenly along the hay. |
| Hen | height `min(0.17 h, 0.08 w / 0.978)` (the sprite's 313:320 aspect fits it inside the 0.08 w column), centred at 0.96 w, feet at 0.62 h |
| Chick | height `min(0.15 h, 0.08 w / 0.824)`, centred at 0.94 w, feet at 0.97 h |
| Helper hand | height `max(80, 110 s)` (110 at 1366x768, 155 at 1920x1080); its fingertip, at the sprite's top-left, is put on the target point |
| Steps (steps 6 to 8) | `steps.webp` replaces the shelf: width `min(0.72 w, 1514)` centred at 0.56 w (0.20 w to 0.92 w), the sprite's bottom at 0.68 h, its own aspect. Block centres at 13.4, 37.9, 62.4 and 86.4 percent of the sprite's width; feet stand 66.8, 46.8, 28.1 and 8.9 percent down it; the front faces start 71.3, 51.5, 32.3 and 13.2 percent down and show down to the tray's top edge. One piggy per block, in value order |
| Piggies on the steps | 0.30 h times the tier size, but at most 0.9 of a block wide (a block is 0.24 of the steps' width) and short enough that the top piggy's slot is 0.6 dime diameters plus 8 px below the screen's top; never under a 96 px wide body. Drop zones as above, reaching down over the step's front face to the tray's top edge |

- 1366x768: shelf 984 wide; with four piggies, slots 246 and piggies 230 tall and 209 wide at tier 1; tier 0 is held to 0.9 of the slot, 221 wide and 244 tall; drop zones 242 to 278 wide and 298 tall at tier 1. Tray 1079 wide, hay row 917, so 6 quarters fit; chute 273 by 269; hen 112 tall (114 at the top of its bob); chick 115 tall. On the steps: 984 by 305, piggies 176 tall and 160 wide at every tier (the top-slot limit), drop zones 235 to 238 wide and 300 to 418 tall.
- 1920x1080: shelf 1382 wide; piggies 324 tall at tier 1, 363 at tier 0 with two or three piggies (the largest piggy drawn anywhere); tray 1510 (capped); chute 384 by 379; hen 157 tall (160 at the top of its bob) and chick 162 tall. On the steps: 1382 by 429 (the sprite at 0.913), piggies 251 tall.
- 800x600: shelf 576 wide, slots 144, piggies 143 tall and 130 wide; tray 632 wide, hay row about 537: at most 3 coins at once; chute 160 by 158.

**Portrait (narrower than 0.9 times height): 390x600**

- Steps 1 to 5 with three or four piggies: two shelves of two piggies, plank tops at 0.42 h and 0.66 h, each shelf 0.92 w wide; a third piggy stands alone in the middle of the lower shelf. Two piggies: one shelf with its plank at 0.60 h.
- Piggies `min(0.22 h, 0.42 w / 0.905)` tall times the tier size; each row's slot is 0.46 w. At 390x600: 132 tall, 119 wide at tier 1; at tier 0 the fit shrinks them to 140 tall and 127 wide so the top row clears the corner buttons. Each drop zone is half its row (193 px wide) and 142 to 152 px tall.
- No chute: new coins roll in from the left edge along the hay.
- Tray 0.98 w wide, top edge at 0.70 h; the coin row moves down below the lower drop zones; at most 2 coins at once (two quarters need 280 px of the 325 px hay row).
- Hen and chick are hidden.
- **Steps (6 to 8):** one row of four piggies, each in a quarter of the width (at 390 px: 96.5 px wide, zones 97 px wide with a 1 px gap between neighbours). The steps sprite is drawn 1.03 times the screen's width so each block is a quarter of it, and 1.5 times taller than its own aspect so the faces hold their dots (still under its own pixels in both directions); its bottom is at 0.70 h and the tray's top edge moves down to 0.72 h.

**Fit:** at every round start and resize, the piggies are placed at their layout height; while a top-row piggy would reach into a corner button they shrink in 5 percent steps, never below a 96 px wide body. The tray's coin count is fixed at the round start from the hay row. No drop zone overlaps another, the tray coins or a corner button. Every drop zone is at least 96 px on its shortest side (it is at least as wide and as tall as its piggy), as is every coin (the dime's floor) and every control after the round (Again and Home at least 96 px across, sticker choices at least 110).

## Mistakes

A wrong piggy, a coin let go over nothing and a press on empty space all have gentle responses (snout bump and roll back, float back, nothing). They only ease the hidden difficulty: wrong drops count toward learning steps, misses toward the motor tier. Neither affects stars, stickers or anything the child can see.

## Art

Medium: handmade claymation in a red barn, matching the concept: soft plasticine with fingerprints, warm golden light from the upper left. Dino Picnic is also clay; Piggy Parade stays apart through the barn interior, the barn-red and hay-gold palette and the pastel piggies. Coins are smooth metal with soft relief, as in the concept. Dots, numerals, the ¢ sign, the hint coin's halo and the carry ring are drawn in code. No image contains text, numbers or a group of things to count.

All bitmaps were generated on 2026-10-04 with the built-in `image_gen` tool in Codex CLI 0.159.0 (agent model `gpt-6-astra`, reasoning medium, `model_provider=openai`); the tool did not report the image model. Every request attached the concept image (`.tmp/money-proto/p2.png` of the kids-browser-game-hub worktree, copied here as `piggy-parade/concept.webp`); the mint, butter yellow and sky blue piggy sheets also attached the finished pink sheet. Every prompt shared one style block ("handmade claymation look, soft plasticine/modelling clay with faint fingerprints and tool marks, rounded chunky forms, gentle matte sheen, warm golden studio light from the upper left, soft and friendly", plus the barn palette) and excluded text, letters, numbers, dates, logos, inscriptions, UI and frames. Sprites asked for a real transparent background with no shadow or glow.

Processing (`sharp`, scripts retained with the sources): the generator's alpha was already clean (each object solid, the rest fully transparent; the colour stored behind the transparency is discarded). A script took each object by its connected regions (alpha above 128, judged by each region's centre so an object reaching past the middle of a two-object sheet stays whole), dropped alpha under 12 and specks under 0.5 percent of the object, cropped with 8 px padding, gave every pixel with alpha under 250 the colour of its nearest solid pixel (no dark or glow fringe), resized with Lanczos 3 and wrote WebP quality 80, alpha quality 50. Coins: the disc's box was made square around its centre and the edge cut to an exact circle (the raw discs were round within 0.8 percent). Piggy frames: both poses share one box anchored at the feet, so a frame swap does not move the body. Every file was checked on mid-grey and dark backgrounds at full size for halos and stray pixels.

`barn.webp` was made by the three-strip method of PR #13: the 1536x1024 `bg-raw-1.png` was cut into three overlapping 683x1024 portrait strips, each enlarged to 1024x1536 and redrawn by its own request (same tool chain) as a sharper, faithful version of exactly that strip; the stitch script registered each strip on the raw enlarged 1.5 times, replaced each strip's broad colour (Gaussian blur, sigma 32 px) with the raw's, joined neighbours along the vertical path where they differ least (6 px feather) and resized the 2304x1536 mosaic to 1920x1280 with Lanczos 3; WebP quality 80, opaque. Alignment error 7.8 to 8.7 grey levels per strip, no uncovered pixels.

Raw sheets, prompts, Codex logs and the scripts are in `D:/CoreWise/_artifacts/CoreWiseLearn/piggy-parade/art-sources/`; the Codex originals are also under `C:/Users/Home/.codex/generated_images/`.

### Asset table

Largest drawn size is the biggest any screen draws the file in a 1920x1080 window at device pixel ratio 1 with `uiScale` 1, in its longest dimension unless noted, taken from the code's drawn rectangles (round 3 build, `window.__piggyParade.drawn`); each is at most the file's own size. The step-8 line-up draws coins at their tray size or smaller.

| File in `public/art/piggy-parade/` | Pixels | Largest drawn (1920x1080) | Prompt file (in `art-sources/prompts/`) | Raw |
| --- | --- | --- | --- | --- |
| `barn.webp` | 1920x1280 opaque | 1920x1280 (cover fit, scale 1.0) | `bg-raw-1.prompt.txt`, strips `barn-s0-1` to `barn-s2-1.prompt.txt` | `bg-raw-1.png`, `barn-s*-1.png` |
| `coin-penny-heads.webp`, `coin-penny-tails.webp` | 320x320 | 168 carried (150 x 1.12) | `coin-penny-1.prompt.txt` | `coin-penny-1.png` |
| `coin-nickel-heads.webp`, `coin-nickel-tails.webp` | 320x320 | 186 carried (166 x 1.12) | `coin-nickel-1.prompt.txt` | `coin-nickel-1.png` |
| `coin-dime-heads.webp`, `coin-dime-tails.webp` | 320x320 | 158 carried (141 x 1.12) | `coin-dime-1.prompt.txt` | `coin-dime-1.png` |
| `coin-quarter-heads.webp`, `coin-quarter-tails.webp` | 320x320 | 213 carried (190 x 1.12) | `coin-quarter-1.prompt.txt` | `coin-quarter-1.png` |
| `piggy-pink-content.webp`, `piggy-pink-happy.webp` | 433x480 | 382 tall (tier 0: 363, times 1.04 plumpness and 1.012 breathing); 375 wide (329 times 1.08 plumpness, 1.012 breathing and 1.05 snout squash) | `pig-pink-2.prompt.txt` | `pig-pink-2.png` |
| `piggy-mint-{content,happy}.webp` | 437x480 | 382 tall | `pig-mint-2.prompt.txt` | `pig-mint-2.png` |
| `piggy-yellow-{content,happy}.webp` | 435x480 | 382 tall | `pig-yellow-2.prompt.txt` | `pig-yellow-2.png` |
| `piggy-blue-{content,happy}.webp` | 436x480 | 382 tall | `pig-blue-2.prompt.txt` | `pig-blue-2.png` |
| `shelf.webp` | 1503x260 | 1382 wide | `shelf-1.prompt.txt` | `shelf-1.png` |
| `tray.webp` | 1510x404 | 1510 wide (capped) | `tray-1.prompt.txt` | `tray-1.png` |
| `chute.webp` | 560x552 | 384 wide, 379 tall | `chute-1.prompt.txt` | `chute-1.png` |
| `steps.webp` | 1514x470 | 1382 wide (scale 0.913); in portrait the 1.5 times taller draw stays under 0.5 of its pixels vertically | `steps-2.prompt.txt` | `steps-2.png` |
| `hen.webp` | 313x320 | 160 tall (157 x 1.02 bob) | `hen-chick-1.prompt.txt` | `hen-chick-1.png` (left) |
| `chick.webp` | 211x256 | 162 tall (it bobs by moving, not scaling) | `hen-chick-1.prompt.txt` | `hen-chick-1.png` (right) |
| `helper-hand.webp` | 232x256 | 155 tall | `hand-1.prompt.txt` | `hand-1.png` |
| `tile.webp` | 512x512 | 292 (the hub draws a tile's icon at 0.75 of the tile, and a tile is at most 0.36 h) | `tile-1.prompt.txt` | `tile-1.png` |
| `sticker-sunflower-piggy.webp` | 487x512 | 376 (offer: 0.82 of the 425 px choice size, times 1.08 when focused) | `stickers-a-1.prompt.txt` | `stickers-a-1.png` (left) |
| `sticker-hen-nest.webp` | 457x512 | 376 | `stickers-a-1.prompt.txt` | `stickers-a-1.png` (right) |
| `sticker-chick-hat.webp` | 419x512 | 376 | `stickers-b-1.prompt.txt` | `stickers-b-1.png` (left) |
| `sticker-tractor.webp` | 512x428 | 376 | `stickers-b-1.prompt.txt` | `stickers-b-1.png` (right) |
| `sticker-mud-piglet.webp` | 485x512 | 376 | `stickers-c-1.prompt.txt` | `stickers-c-1.png` (left) |
| `sticker-calf.webp` | 386x512 | 376 | `stickers-c-1.prompt.txt` | `stickers-c-1.png` (right) |

Stickers (ids `piggy-parade-<name>`): a mint piglet hugging a sunflower, a hen on a straw nest with one egg, a chick in a straw sun hat, a red toy tractor, a sky-blue piglet splashing in mud, a cream calf with a bell. None shows a coin, money or a price. The hub tile shows the pink piggy with one penny dropping into its slot.

Rejected or replaced generations, kept with the sources: `pig-pink-1` (body turned sideways, no front belly for the badge), `steps-1` (too tall: the tallest block would have pushed the top piggy off a 16:9 screen), `pig-yellow-1` (made before the pink sheet was attached as a reference; consistent, but the set uses the referenced `-2` sheets). The first `pig-mint-1` and `pig-blue-1` runs produced nothing because the pink sheet's path was wrong. The `steps-2` request also passed a second image path that did not exist; its log does not show whether the concept reached the tool, but the result matches the wood of the shelf and tray. Total shipped art: 828 KB.

## Sound

Existing effects from `src/audio/sfx.ts` only, with a variant passed on each call as Dino Picnic does.

| Moment | Effect |
| --- | --- |
| Coin starts down the chute / lands on the hay / settles in its place | `tick` C, quiet / `pop` B, quiet / `tick` C, quiet |
| Coin picked up (pointer, key or the hand) | `pop` B, quiet |
| Coin thrown toward a piggy | `whoosh` B, very quiet |
| Coin drops into the right piggy (clink) | `pop` C, pitch index = coins now in that piggy |
| The piggy's happy "oink" | `button` C (the rubbery boing), quiet |
| Coin bumps a different piggy's snout | `pop` A, quiet (no miss sound) |
| Coin rolls or floats back to the tray | `whoosh` D |
| A piggy pressed with no coin on the tray | `pop` A, quiet (the piggy wiggles) |
| Celebration: each piggy's hop | `pop` C, rising pitch |
| Step dots pulse (steps 6 to 8) | `tick` C, pitch index = dot row, quiet |
| Line-up: coins roll in / hop in size order / start the reorder / land in value order / roll off | `whoosh` D, quiet / `tick` A, pitch index = position / `whoosh` B / `pop` C / `whoosh` D |
| Round end, stars, sticker, Again, Home | `fanfare` D, `star` B, `sticker` C, `whoosh` A, `button` B |

The fanfare is rendered ahead with `prepareSfxStep` as in Dino Picnic: the first step at the round start, the rest in idle periods. Music: track name `piggy-parade` (`public/music/piggy-parade.mp3`, composed by the owner; silence until it exists), started and stopped like Bubble Bay.

## Voice clip slots

Optional clips in `public/voice/piggy-parade/` (README there names them): `penny`, `nickel`, `dime`, `quarter` play when a coin of that kind drops into its piggy; `number-1`, `number-5`, `number-10`, `number-25` play when a step's dots pulse after a coin lands (steps 6 to 8; not during the line-up, where four would overlap). A clip plays only if its file exists at build time (listed with `import.meta.glob`); a missing one is skipped with no request. None ship; naming coins is out of scope until voice exists.

## Performance

- No allocation in update or render. Coins (pool of 16) and straw particles (pool of 160) are pooled; sprite names are built once into lookup tables.
- Every sprite draws at one fixed size per layout from the shared scaled-sprite cache and animates with transforms only: rolling and wobble are rotations, the spin and the chute's half size are scales, the wiggle a rotation, plumpness a scale. When the canvas size, pixel ratio, tier, piggy count or piggy size changes, the scene releases its scaled canvases and rebuilds them; leaving releases all of them, the backdrop included.
- The hint coin's halo is the only bake: a radial gradient made once per size on a CPU canvas (`willReadFrequently: true`, ending with `getImageData(0, 0, 1, 1)`). The highlight rings, arrows and carry ring are plain stroked and filled paths each frame (no gradients, no `shadowBlur`, no text). Steps 6 to 8 bake on CPU canvases the same way, once per size and pixel ratio, at the round start or on a resize: one value dot, the two groove shapes (a row of five, a single dot) and the four labels, the labels after the bundled font has loaded (`ensureDisplayFont`). Each frame draws them with `drawImage` only, scaled for the pulse; the line-up allocates nothing per frame.
- End-of-round piggy and button sizes are scaled ahead in idle periods during play, one canvas per idle period, as in Dino Picnic; the sticker offers bake through `warm` and `warmBook` during the celebration.
- The backdrop is rescaled only when the canvas size or pixel ratio changes. The 1920x1280 background gets the early decode in `src/engine/sprites.ts`.
- Budget: `window.__corewise.loop.stats.workMean` and `workMax` well under 12 ms at 1366x768 throughout play and the round end.

## Debug

With `?debug` in the URL (the full app or the dev page `dev/piggy-parade.html`): `tier=0..2` forces a motor tier (`services.debug.tier`; the real tier logic is then skipped), `step=1..8` starts at a learning step (and skips the introduction unless `rounds` is given), `rounds=N` sets the round count (`rounds=0` replays the introduction), `seed=N` makes coin orders and piggy colours repeatable. Step and rounds apply once per page load, and not at all while the profile has a finished round waiting for its sticker choice or rest, so reloading a debug URL never throws that round away. `window.__piggyParade` is a live read-only stats object: `step`, `roundStep`, `tier`, `rounds`, `phase`, `coins` (every coin on screen and every belly badge: kind, face, centre x and y, drawn diameter `d`, state, all in CSS px), `targets` (each piggy's drop zone as top-left x, y, w, h in CSS px), `hitRects` (every interactive hit rectangle on screen), `drawn` (drawn sizes for the sharpness check, the steps' scale, dot and label sizes included), `values` (steps 6 to 8: per step its coin, dot count, rows, dots per row, label text and whether the label is on screen, dot size and the box the value fills), `lineup` (running, seconds in, skippable, coin order left to right), `demos` and `lineupSeen`, plus input and round counters.

## Files

- `src/games/piggy-parade/`: `index.ts` (definition), `scene.ts`, `rules.ts` (tiers, steps, round coins, learning and motor rules), `data.ts` (save bag and its validator, set as `validateSave`), `voice.ts`.
- `dev/piggy-parade.html`, `src/dev/piggy-parade.ts`: dev page.
- `public/voice/piggy-parade/README.md`: the clip slots.
- Shared edits: one registry entry, six stickers appended to `STICKERS`, one music track name.
