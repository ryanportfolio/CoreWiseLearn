# Ride Fare

A round game about what coins are worth. Animal friends with little backpacks queue for a hot-air balloon ride. A brass fare box on the balloon basket shows the fare as a panel of round dot cups. The child drops coins from a wooden tray into the fare box; each coin lights as many cups as it is worth, one after another. When every cup is lit, the animal climbs into the basket, the balloon lifts off, drifts and lands again, and the next animal steps up. Learning tag: `money`.

Nothing is bought or kept. The child helps someone else ride; the tray refills every round; there is no wallet, balance, shop or goal that spans sessions, and coins never touch stars or stickers (`docs/research/07-money.md`, section 2, "Commercial framing"). The selected concept is `docs/games/ride-fare/concept.webp`.

## The action and its response

- **Pay a coin.** Press a coin on the tray and carry it to the fare box: drag it there and let go, or click the coin and then click the fare box (the coin follows the pointer between the two clicks). At motor tier 0 a single press on a coin sends it straight into the slot. A coin released within the snap distance of the fare box counts as dropped on it.
- **Each coin pays at once:** the coin flies to the slot, turns edge-on and slips in with a clink, and its value pours into the cups: a penny lights the next cup, a nickel lights five cups one after another (70 ms apart), a dime ten. Each lit cup glows warm yellow with a soft pitched tick that climbs with the cup number, so a nickel is heard as five quick steps. The coin's own dots are shown first for 0.3 s as a ring of glowing dots on the coin as it reaches the slot, so the five or ten are seen leaving one coin.
- **Too much:** a coin worth more than the unlit cups touches the slot, shows its dots for a moment, and hops back to its place on the tray with a soft giggle sound while the animal smiles. Nothing is lost and no cup changes.
- **Fare paid:** when the last cup lights, the cups pulse once together, the gate opens, the animal hops in (its waving pose, clipped at the basket rim so it stands inside), the balloon rises off the top of the screen, drifts across the sky small and lands back in 3.5 s with a new empty fare. The next animal in the queue walks up to the gate. During the flight the tray rests; presses then make the queue animals hop.
- **The animals** are content, curious or delighted. None is ever shown waiting impatiently, sad or pleading.

## Discovery without words

The very first round shows the goal first: the fare box with all cups already lit, the hedgehog climbing in and the balloon lifting off and landing (3 s). Then the start state: an empty fare of 5 and a tray with a nickel and pennies. The watercolour helper hand rises from the bottom edge, presses the nickel, carries it to the slot and lets go; the five dots pour out and five cups light. The hand then rests beside the tray and taps the next penny in a loop until the child does anything. That first rider's fare is then 6, so the child finishes it with one penny. The introduction records no evidence and always earns three stars.

Idle: after 6 quiet seconds the hand carries a hint coin (see-through, in a pulsing warm halo, never paying anything) from a coin that would fit to the fare box, then fades; it repeats every 7 s while the child stays idle. A hinted fare still counts as paid but records no learning evidence. The first time a new step appears (dimes, the numeral, the swap stand, change), its first rider gets one demonstration before the child plays, the same goal-first way.

## Round flow and attempts

1. **Riders:** 3 animals per round at motor tier 0, 4 at tiers 1 and 2. Six animals (hedgehog, bunny, fox, raccoon, bear, mouse) take turns; the queue on the path shows the round's remaining riders, so progress is visible as fewer animals waiting. The first rider of a round above step 2 comes from the step below (a warm-up), the rest from the current step.
2. **Celebration:** the balloon with every rider of the round floats past, confetti, stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.6 s.
3. **Sticker choice:** while this game's six stickers are not all owned and `rewardsEnabled` is true, the shared `createStickerOffers` helper (`src/ui/sticker-offer.ts`) shows two stickers on the swap stand's counter top, with the small sticker book beside them; its `warm` and `warmBook` run during the celebration. Same guard as every game: input ignored for 1.2 s, nothing focused, the first key only shows focus.
4. **Still rest:** the basket on the meadow, the sticker book with the new sticker (or the round's riders waving when there is no gift), the stars, and Again and Home of equal size and colour. `services.roundBoundary()` runs when rest is reached.

Stars: every finished round earns 3. Bounced coins never cost a star. Awards persist once, as in Bubble Bay and Dino Picnic: round count, stars and the offered pair go into the game bag's `pending` field with a unique round `id` and `save.flush()` before the celebration shows; leaving or reloading returns to the choice or the rest; leaving rest by any route clears `pending`. The tray, the fares and every coin are play material only and are never saved.

**Attempts (motor):** one carry counts once, whatever the input style. Releasing a carried coin on the fare box (within the snap distance) is one hit; releasing it anywhere else is one miss and the coin slides back to its place. A press on empty play space is one miss. A coin that bounces back because it was worth too much is still a hit: it reached the target. Picking up, key presses, the tier-0 one-press send, demonstrations and hints never count. At the end of a round: 8 or more attempts with under 70 percent hits moves down a tier; 12 or more at 90 percent or better is a qualifying round, and two in a row move up a tier.

## Motor tiers (hidden, between rounds)

The layout unit `u` is `min(width / 1366, height / 768)` CSS px, times the config `uiScale`.

| Tier | Riders | Tray places | Dime diameter | Fare box width | Snap distance | Input |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 3 | up to 3 | 120u | 460u (scale 1.15) | 80u outside the box | one press sends a coin; drag and click-click also work |
| 1 | 4 | up to 4 | 108u | 400u | 56u | drag, or click the coin then the box |
| 2 | 4 | up to 6 | 96u | 360u (scale 0.9) | 40u | drag, or click the coin then the box |

- **Coin sizes keep the true ratios** (dime 17.91 mm, penny 19.05, nickel 21.21): at tier 2 and 1366x768 the dime is 96 px, the penny 102 and the nickel 114. The dime never draws below 96 CSS px at any window size or tier; when `u` is smaller, coins keep that floor and the tray holds fewer places instead.
- **Tray places:** the learning step decides which coins the tray holds and how many of each; the tier decides how many places they sit in. When there are more coins than places, coins of one kind share a place as a stack (the top coin is the target, the coins below show as offset rims, up to five; the stack refills from below when its supply is unlimited). At tier 2 coins sit singly where places allow. Places are spaced at least 16u apart and every place is at least 96 CSS px wide.
- **Fare box:** its press zone is the whole box plus the snap distance and is never smaller than 200 x 128 CSS px. It never overlaps a tray place or a corner button.

## Learning steps (hidden, separate from motor)

Learning evidence is one result per rider whose fare the child paid with deliberate pointer choices: a drop, or a tier-0 one-press send, counts as deliberate when it comes at least 0.7 s after the previous one (choosing which coin is the skill in every step, so tier 0 records evidence too). Riders paid with any key press, after a hint, or in a demonstration record nothing. "Exact" means no coin bounced back while paying that rider (at step 8, no extra penny handed back).

Between rounds, at the current step: if every counted rider of the round was exact and there were at least 3, move up one step; otherwise 6 or more exact riders in the step's last 8 counted move up, and 2 or fewer in the last 6 move down one step (never below step 1). Exposure steps (2 and 7) move up after 2 finished rounds at that step whatever happened. A step change resets that step's window. A child who plays only with keys records no evidence, so after 3 finished rounds at step 1 or 2 with no counted rider the step moves up by one, up to step 3; beyond that only evidence moves it.

| Step | Age | Fare and tray | What the child does | Counted as exact |
| --- | --- | --- | --- | --- |
| 1 | 4 | A small coin plate on the fare box shows 1 to 3 coin pictures (pennies and nickels, then dimes in the last third of the step), drawn in code from the coin sprites. No cups. Tray: the needed coins plus one other kind. | Drops the same coins as the pictures; each matching coin lights its picture. A different coin bounces back. | No coin bounced |
| 2 | 4 to 5 | Pennies only, fares of 1 to 5 cups in one row of five. Tray: one penny stack with exactly enough pennies plus one spare. | Drops pennies; one cup each. Kept short because it overlaps Dino Picnic. | Exposure (2 rounds) |
| 3 | 5 | Fare 5. Tray: five pennies (a stack or singles) and one nickel. | Pays with the nickel (five cups at once) or five pennies; both work. | Paid with the nickel as the first deliberate drop |
| 4 | 5, stretch | Fares 6 to 10 in two rows of five. Tray: one nickel and five pennies. | A nickel and pennies; a nickel on a fare with fewer than five unlit cups bounces. | No coin bounced |
| 5 | 6 | Fares 11 to 20 on two panels of ten (the second panel is `fare-panel.webp` beside or below the box). Tray: one or two dimes, one or two nickels, unlimited pennies. | A dime lights ten cups, a whole panel; cups read in fives and tens. | No coin bounced |
| 6 | 6 | The fare also shows as a numeral with ¢ beside the cups (bundled Andika glyphs, baked once). Fares 21 to 99¢ show as rows of ten small cups (5, gap, 5) stacked in the panel, a dime lighting a row. Tray: unlimited dimes, nickels and pennies. | Counts on by 10s, 5s and 1s. A numeral counter beside the cups climbs as cups light. | No coin bounced |
| 7 | 6 | The swap stand stands on the meadow right of the basket. The rider's fare is 5 or 10, and the tray holds only pennies (5 or 10) at first. | Drops pennies onto the swap stand's counter, where five dotted circles are drawn in code; when the fifth lands, the pennies slide together into one nickel with their five dots still glowing inside it, which then hops onto the tray. Two nickels on the stand become a dime with ten dots inside. Then pays the fare with the new coin. | Exposure (2 rounds) |
| 8 | 6, stretch | Fares 1 to 9¢. The animal pays with a dime: it drops its dime in, ten cups light, and the cups beyond the fare glow in a separate change row under the panel. Tray: unlimited pennies. | Hands back pennies by dropping them on the animal's paws; each penny dims one change cup. When the change row is empty the animal hops in. A penny too many bounces back from the paws. | No penny bounced |

At step 8 the top of the progression is reached: rounds there mix riders from steps 5, 6 and 8, so the 6-year-old keeps getting varied full rounds.

**Easing and no stall.** Hidden difficulty never waits for "a nickel counts as five": every fare can always be paid with what is on the tray (a coin that is too much just bounces), so every round finishes. A child who struggles at steps 3 or 4 moves back to step 2 or 3 and gets full rounds of that content (with the step-1 coin plate as each round's warm-up rider). Steps 1 to 3 together are a complete game for a 4-year-old: matching coin pictures, filling penny cups, and seeing the nickel pour five. Struggling inside a round only brings the idle hint sooner (after 4 s instead of 6 s once two coins have bounced on the same rider); the content never changes mid-round.

## Mistake handling

There is no wrong state. A coin that is too much, or does not match a step-1 picture, hops back to its tray place with a soft giggle (three quiet `pop` A notes) and the animal smiles; no error sound, no red, no shake. A coin dropped on empty space slides back to its place with a `whoosh`. Coins can never be lost: any coin not in the slot always returns to the tray. Repeated presses while a coin is still pouring send nothing more; the press shows a small hop of the pressed coin.

## Keyboard-only and mouse-only play

- **Mouse or trackpad only:** every action is a press, a drag or a click-click; any mouse button counts. The context menu is cancelled.
- **Keyboard only:** a bobbing arrow and a warm ring mark the highlighted coin on the tray; it starts on a coin that fits the fare (or the leftmost). Left and Right (and Up and Down at narrow sizes with two tray rows) move between coins. Any other key sends the highlighted coin into the slot (at most one every 150 ms). At step 7 the swap stand is a second target: the first key picks the coin up and highlights the stand or the box, arrows choose, and the next key drops. At step 8 the same applies with the animal's paws. During play every key plays, Escape, Tab and Enter included. After the round, Escape goes home and Tab reaches the corner Home and sound buttons; choice and rest follow the shared rule (first key shows focus, arrows move, the next key chooses). Keys never record learning evidence.

## Layout

The background `launch-field.webp` cover-fits the window. Pieces are placed in layout units `u`; the tray sits on the bottom edge, the basket stands on the meadow above the tray's top edge, and the queue stands on the path.

- **1366x768 (u = 1):** tray across the bottom, centred, its top at 768 minus (tray height + 12); tray height is the largest coin diameter plus 36u (164 px at tier 1). Basket body 400u wide with its left edge at 40u, its bottom 2u above the tray top, so its rim is near y 210; the balloon envelope (480u wide) covers the upper ropes and runs off the top edge, as in the concept. Fare box centred on the basket's left two thirds, overhanging the basket's left side a little; the coin plate (step 1) and the second panel (step 5) sit just right of and below it inside the basket face. The current animal stands at the gate right of the basket, 260u tall; the queue of the round's next riders stands along the path from x 0.58 to 0.92 of the width, 0.55 to 0.8 of the gate height, farther ones smaller and higher. The swap stand (step 7) stands between the gate and the queue, 340u wide. Home top-left and sound top-right stay clear: no target within them.
- **1920x1080 (u = 1.406):** the same layout scaled. This is the size the asset table is checked at.
- **800x600 (u = 0.586):** coins at their 96 px floor (dime) make the tray 150 px tall; up to 5 tray places fit in one row. Basket and fare box scale by `u` with the fare box at least 200 x 128 CSS px. The queue shows two animals.
- **390x600 (portrait):** the tray has two rows of places (2 per row at the coin floor), stacked along the bottom. The basket and fare box fill the upper left at their minimum sizes, the current animal stands right of the gate at 0.8 of its usual height, and only the next rider peeks in from the right edge. The background crop then shows the meadow, lake and the start of the path.

The fit is recomputed at every round start and resize: if pieces overlap, the queue thins first, then the basket, envelope and fare box shrink in 5 percent steps to their minimums, then the tray drops a place (coins stack). No target ever shrinks below its 96 CSS px floor.

## Sound

Effects come from `src/audio/sfx.ts`; this game passes a variant on each call instead of changing the app-wide setting. No new sounds.

| Moment | Effect |
| --- | --- |
| Pick up a coin | `pop` B, quiet |
| Coin into the slot | `pop` D |
| Each cup lights | `tick` C, pitch index = cup number |
| Fare paid, cups pulse | `pop-big` C |
| Coin too much, giggle | three `pop` A notes 90 ms apart, quiet |
| Coin dropped on nothing returns | `whoosh` D |
| Animal hops in | `go` C |
| Balloon lifts off / lands | `whoosh` B / `pop-big` D |
| Swap: coins merge | `pop-big` B |
| Change penny to the paws | `pop` C, pitch index = pennies handed back |
| Round end, stars, sticker, Again, Home | `fanfare` D, `star` B, `sticker` C, `whoosh` A, `button` B |

The fanfare is prepared ahead with `prepareSfxStep` as in Bubble Bay and Dino Picnic.

Music: track name `ride-fare` (`public/music/ride-fare.mp3`, composed by the owner; silence until it exists), added to `MusicTrack` and `MUSIC_TRACKS` in `src/audio/music.ts`; `startMusic` on entry, `stopMusic` on exit.

## Voice clip slots

Optional clips live in `public/voice/ride-fare/` (a README there names them): `penny`, `nickel`, `dime` play when a coin of that kind is picked up; `number-1` to `number-20` and `number-30`, `number-40` up to `number-90` play when a fare appears (its value) and at step 6 as the counter passes each ten. The game lists the files present at build time with `import.meta.glob`, so a missing clip is skipped with no request. None ship; naming coins is out of scope until voice exists.

## Performance

No allocation in update or render: coins in flight (16), pouring dots (24) and particles (160) are pooled; cup positions are computed once per layout into a shared table. Every sprite is drawn at a fixed size per layout and animated with transforms, so one layout keeps one cached scaled canvas per sprite size; the scaled-canvas cache is released and warmed again when the canvas size, pixel ratio or tier changes, and on exit. Cups, the coin plate frame, dotted swap circles, the numeral and ¢ (Andika glyph cache) and the hint halo are baked on CPU canvases (`willReadFrequently: true`, see pitfalls) when their size changes, never per frame. The background is rescaled only when the canvas size or pixel ratio changes. No gradients, `shadowBlur` or `fillText` per frame. Animals inside the basket are clipped with one rectangle `clip()` per frame (save and restore, no path allocation). The tray is drawn as three slices (two end caps and a middle stretched only along the grain), each at a scale of 1.0 or less. Budget: `loop.stats.workMean` and `workMax` well under 12 ms at 1366x768.

## Art

Medium: storybook watercolour in the concept's golden late-afternoon light, true-colour WebP. Shared controls (Home, sound, play arrow) reuse the existing art. Everything counted or exact is drawn in code: cups and their lit state, dots inside and around coins, the dotted swap circles, the coin plate and the numerals with ¢. No image contains text, numerals or a group of things to count.

All bitmaps were generated on 2026-10-04 with the built-in `image_gen` tool in Codex CLI 0.159.0 (`codex exec -m gpt-6-astra -c model_reasoning_effort=medium`). The tool did not report the image model. Every request attached the selected concept (`r3.png`, 1672x941) as its first reference and shared one style block: soft storybook watercolour with gentle painterly edges, fine warm brown linework, rich warm colours and golden light from the right, matching the concept's shapes, proportions and palette, with no text, letters, numbers, logos, inscriptions or interface. Sprite requests asked for a transparent background; every result came back with a clean alpha channel (objects about 253, surroundings 0).

Processing (`sharp`, scripts kept with the sources): regions of alpha above 128 were found and isolated, alpha under 16 cleared and over 235 made solid, colours at soft edges replaced by nearby solid colours (no dark or light fringe), specks under 300 px removed, cropped to the alpha bounds with 4 px padding, resized with Lanczos 3 and written as WebP quality 80, alpha quality 50. The two poses of each animal share one scale (waiting pose 480 px tall) so they swap without the animal changing size; both are anchored at the feet. Coins: each face's circle was fitted from its alpha area and centroid, cropped 2 px inside it, resized to 384x384 and given an exact anti-aliased round alpha edge, so the coin fills its square and code scales it to the true ratios. Each file was checked on mid-grey, dark and light grounds at 1:1 for halos and stray pixels (contact sheet in the sources folder).

`launch-field.webp` follows the owner's three-strip method from PR #13: the 1536x1024 `bg-base.png` was cut into three overlapping 683x1024 portrait strips, each enlarged to 1024x1536 (Lanczos 3) and attached with the concept to its own request asking for a sharper, faithful redraw of exactly that strip. The PR #13 stitch script placed each strip where it best matched the base enlarged 1.5 times (alignment error 10 to 14), replaced each strip's broad colour (Gaussian sigma 32 px) with the base's, joined neighbours along the vertical path of least difference (6 px feather) and resized the 2304x1536 mosaic to 1920x1280 (Lanczos 3); WebP quality 80, opaque. It shows only the sky, mountains, lake, village, the empty meadow on the left, the empty path and fence on the right and plain grass along the bottom: no balloon, basket, animals, coins or tray.

### Asset table

"Largest drawn" is the biggest size any screen draws the file in a 1920x1080 window at device pixel ratio 1 (u = 1.406), including animation scale; every one is at most the file's own size.

| File in `public/art/ride-fare/` | Pixels | Largest drawn at 1920x1080 | Source (prompt in `prompts/`) and processing |
| --- | --- | --- | --- |
| `launch-field.webp` | 1920x1280 | 1920x1280 cover-fit (scale 1.0) | `bg-base`, then `bg-s0-1`, `bg-s1-1`, `bg-s2-1`; three-strip stitch, opaque, 422 KB |
| `basket.webp` | 687x1030 | 611 wide (basket sprite 435u) | `basket3` (third attempt: the first two were too shallow to carry the fare box); 1023x1534 raw, scale 0.671 |
| `envelope.webp` | 762x1110 | 675 wide (480u) | `envelope2` (second attempt: the first was too narrow); 1028x1497 raw, scale 0.741 |
| `fare-box.webp` | 720x454 | 679 wide (460u at tier 0, 1.05 pulse) | `farebox`; blank dark window about 67 percent of the box width where code draws the cups; scale 0.488 |
| `fare-panel.webp` | 600x264 | 469 wide (matched to the fare box window at tier 0, with pulse) | `panel`, with the fare box raw as second reference; scale 0.408 |
| `tray.webp` | 1511x449 | 250 tall (tier 0: nickel 142u plus 36u); width up to about 1250 by three slices, middle at most 0.83 | `tray2` (second attempt: the first was too shallow); kept at raw size |
| `coin-penny-heads.webp`, `coin-penny-tails.webp` | 384x384 | 300 (nickel at tier 0 is the largest coin: 200, picked up 1.12x is 224, swap reveal 1.3x is 260; any coin at most 300) | `coin-penny`; circle fit, round mask |
| `coin-nickel-heads.webp`, `coin-nickel-tails.webp` | 384x384 | 300 | `coin-nickel`; circle fit, round mask |
| `coin-dime-heads.webp`, `coin-dime-tails.webp` | 384x384 | 300 | `coin-dime`; circle fit, round mask |
| `hedgehog-wait.webp`, `hedgehog-wave.webp` | 307x480, 339x478 | 395 tall (gate 260u, hop 1.08) | `animal-hedgehog` sheet; shared scale 0.552 |
| `bunny-wait.webp`, `bunny-wave.webp` | 240x480, 281x471 | 395 tall | `animal-bunny`; scale 0.501 |
| `fox-wait.webp`, `fox-wave.webp` | 299x480, 333x480 | 395 tall | `animal-fox`; scale 0.559 |
| `raccoon-wait.webp`, `raccoon-wave.webp` | 310x480, 328x468 | 395 tall | `animal-raccoon`; scale 0.529 |
| `bear-wait.webp`, `bear-wave.webp` | 284x480, 321x481 | 395 tall | `animal-bear`; scale 0.545 |
| `mouse-wait.webp`, `mouse-wave.webp` | 368x480, 375x479 | 395 tall | `animal-mouse`; scale 0.550 |
| `swap-stand.webp` | 582x700 | 478 wide (340u) | `swapstand`; scale 0.693 |
| `helper-hand.webp` | 253x256 | 211 tall (150u) | `hand`; scale 0.259 |
| `tile.webp` | 512x512 | hub tile, drawn like every other game's 512 px icon | `tile3` (third attempt: the first had a tiny hedgehog, the second cut the balloon at the top edge; the second attempt was attached as composition reference) |
| `sticker-balloon.webp` | 364x512 | sticker offer and book sizes of the shared helper, as for every game's 512 px stickers | `sticker-balloon`: a smiling rainbow balloon with a small basket and a pink cloud |
| `sticker-hedgehog.webp` | 449x512 | as above | `sticker-hedgehog`: the hedgehog with its backpack, waving |
| `sticker-fox.webp` | 457x512 | as above | `sticker-fox`: a fox cub looking through a brass telescope |
| `sticker-bunny.webp` | 372x512 | as above | `sticker-bunny`: a bunny holding a dandelion puff |
| `sticker-bear.webp` | 412x512 | as above | `sticker-bear`: a bear cub in aviator goggles and a red scarf, waving |
| `sticker-mouse.webp` | 504x512 | as above | `sticker-mouse`: a mouse hugging a sunflower head |

Total 33 files, 1.54 MB (the background is 422 KB of that). The coin plate (step 1), the cups, the change row and the swap circles are drawn in code with these sprites.

Raw images, prompts, Codex logs, strips, the stitch output and all scripts are kept outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/ride-fare/art-sources/`; the Codex originals are also under `C:/Users/Home/.codex/generated_images/`.

## Files (planned)

- `src/games/ride-fare/`: `index.ts` (definition and save validator), `scene.ts`, `rules.ts` (tiers, steps, fares, tray contents), `data.ts` (save bag: tier, step, evidence windows, pending round), `voice.ts`.
- `dev/ride-fare.html`, `src/dev/ride-fare.ts`: isolated dev page; `?debug&tier=0..2&step=1..8&seed=N`.
- Shared edits: one registry entry, six stickers appended to `STICKERS`, one music track name.
