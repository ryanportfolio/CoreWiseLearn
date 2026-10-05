# Coin Vault

A round game about counting money, for ages 6 to 8 (US grades 1 and 2). Animal visitors peek over the far edge of a wooden counting desk, each holding a little cloth sack of money. The child counts it for them: each coin or bill goes into its dish on a green felt mat and pours its value into a counting board of cups. Then the child picks the total from three amount tags. Later steps add vault locks that ask for an amount to be built, a $1 bill that 100 cups trade for, paper bills, and the $ and ¢ signs. When a visitor's money is counted it rolls into a tree-stump vault, the round door swings shut and the visitor waves. Learning tag: `counting` (themes `money`, `counting`, `animals`, as Ride Fare).

Nothing is bought or kept. The child counts someone else's money; the vault empties every round; there is no wallet, balance, shop or goal that spans sessions, and money never touches stars or stickers (`docs/research/07-money.md` section 2, `docs/research/08-money-grades-1-2.md` section 6). The selected concept is `docs/games/coin-vault/concept.webp` (the owner's pick, cv2, 2026-10-05). The research behind the steps is [08. Money for grades 1 and 2](../research/08-money-grades-1-2.md); its sections 5 and 6 are binding.

## The action and its response

- **Count a coin or bill.** Press a coin (or bill) in the row along the bottom and carry it to the mat: drag it there and let go, or click it and then click the mat (it follows the pointer between the two clicks). At motor tier 0 a click (released within 0.3 s and 24 px) sends it straight to its place; a drag still carries it. Where it lands:
  - A coin goes into its own dish (quarter, dime, nickel, penny, left to right). Dropped anywhere on the mat, or on another kind's dish, it slides over into its own dish: sorting is shown, never scored, and nothing bounces.
  - A bill (step 7) goes onto one fanned pile on the mat, each new bill a little to the right of the last.
- **Each coin pours at once:** the coin flies into its dish (0.3 s) and settles there at 0.4 of its play size, in rows of five; at the same moment its value pours into the counting board, one cup after another: a penny lights one cup, a nickel five (70 ms apart), a dime ten (32 ms apart), a quarter twenty-five (16 ms apart, about 0.4 s). A bill at step 7 pours one cup per dollar the same way (a $20 lights twenty cups). Each lit cup glows warm gold with a soft tick that climbs through each row of ten. The board never shows a running numeral: the cups are the count.
- **All counted:** when the row is empty, the dishes count on from the largest: the quarter dish pulses and the cups its coins lit pulse together, then the dime dish and its cups, then the nickel, then the penny (0.35 s each; empty dishes are skipped). Then three amount tags slide up into the row.
- **Pick a tag:** pressing the matching tag lifts it (1.08x), it flies to the vault door and settles over the door's rectangular plate, where the amount stays in small numerals. The coins roll out of their dishes in an arc into the vault's doorway (40 ms apart), the round door swings shut (0.45 s), the keyhole drawn on the round plate turns, and the visitor switches to its happy pose and waves (0.8 s), then sinks behind the desk edge. The board's cups go out, the door swings open, and the next visitor rises with its sack while the purse tips over and the next coins slide out into the row: 2.2 s from the pick to the next coin ready.
- **Locks (steps 4 and 5):** instead of tags, one or two wooden lock plates lie across the mat, each with a brass padlock and its amount drawn on the plank. The board shows the open lock's amount as unlit cups. The row holds four stacks that never run out (quarter, dime, nickel, penny). A coin dropped on the mat goes into the open lock's slots and lights its cups. When the last cup lights, the padlock's lock plate pulses, the coins roll into the vault and the door shuts as above.
- **Visitors** are content, curious or delighted, never impatient, sad or pleading.

## Discovery without words

The very first round shows the goal first (about 2 s): the dishes already hold a dime and two pennies, the board's twelve cups are lit, a "12¢" tag sits on the door, the coins roll into the vault, the door swings shut and the squirrel waves. The door swings open again, the squirrel rises with its sack, the purse tips and a dime and two pennies slide into the row. While they are still sliding, the coloured-pencil helper hand rises from the bottom edge, presses the dime, carries it to the dime dish and lets go; ten cups pour. The hand then rests on the next penny and taps it in a loop until the child does anything. After the last penny the count-on plays and three tags rise; the hand does not point at a tag. The introduction's other two visitors come from the child's current step. The introduction records no evidence, changes no motor tier and always earns three stars.

Idle: after 6 quiet seconds the hand carries a see-through hint coin (in a pulsing warm halo; it never pours anything) from the row to where it goes, then fades; it repeats every 7 s while the child stays idle. While counting it shows the largest coin or bill left; at a lock, the largest coin the lock takes; at the tag pick, and at step 8's symbol blocks, it does not point: the dishes count on again from the largest instead. A task whose lock was hinted records no learning evidence; a count-on replay does not point at the answer, so a tag picked after one still counts.

**First-time demonstrations.** The first task of step 4, 6 or 8 a profile meets gets one short ghost-hand demonstration of its new idea; the save remembers which ones the profile has seen (`demos`), so each plays once per profile. The demonstrated task records no evidence.

- Step 4: the visitor fills the first lock itself (its coins fly from the purse into the slots); the hand then carries a different coin from the row into the second lock, then taps the next useful coin until the child acts.
- Step 6: the first trade plays slowly (1.2 s): the hundred lit cups slide together and become a $1 bill on the board's upper half while the hand points at it.
- Step 8: the hand carries the matching symbol block onto the tag's empty box, then the child plays the next task.

## Round flow and attempts

1. **Tasks:** 3 visitors per round at motor tier 0, 4 at tiers 1 and 2. Six visitors (squirrel, rabbit, badger, hedgehog, owl, beaver) take turns, one per task. A visitor brings one collection to count (steps 1 to 3, 6 and 7), one lock task (steps 4 and 5), or one $ and ¢ task (step 8). Every round above step 1 opens with one warm-up task from the step below, which records nothing; the rest come from the current step.
2. **Celebration:** the vault door is shut and every visitor of the round pops up along the desk edge in its happy pose, waving, with confetti; stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.6 s.
3. **Sticker choice:** while this game's six stickers are not all owned and `rewardsEnabled` is true, the shared `createStickerOffers` helper (`src/ui/sticker-offer.ts`, reused, not copied) shows two stickers with the small sticker book beside them, standing on the felt mat; its `warm` and `warmBook` run during the celebration. Same guard as every game: input ignored for 1.2 s, nothing focused, the first key only shows focus.
4. **Still rest:** the closed vault, the sticker book with the new sticker (or the round's visitors waving when there is no gift), the stars, and Again and Home of equal size and colour. `services.roundBoundary()` runs when rest is reached.

Stars: every finished round earns 3; a hopped-back coin or a wrong tag never costs a star. Awards persist once, as in Bubble Bay and Ride Fare: round count, stars and the offered pair go into the game bag's `pending` field with a unique round `id` and `save.flush()` before the celebration shows; leaving or reloading returns to the choice or the rest; leaving rest by any route clears `pending`. Coins, bills, dishes, locks and the vault are play material only and are never saved. Pause and resume through the break nudge keep play exactly where it was.

**Attempts (motor):** one carry counts once, whatever the input style. Releasing a carried coin or bill inside the mat's zone (with the tier's snap distance around the mat) is one hit; releasing it anywhere else is one miss and it slides back to its place in the row (released over the row, it just goes back). A press on a tag or a symbol block is one hit. A press on empty play space is one miss. A coin that hops back from a lock is still a hit. Picking up, key presses, the tier-0 one-press send, demonstrations and hints never count. At the end of a round: 8 or more attempts with under 70 percent hits moves down a tier; 12 or more at 90 percent or better is a qualifying round, and two in a row move up a tier.

## Motor tiers (hidden, between rounds)

The layout unit `u` is `min(width / 1366, height / 768)` kept between 0.45 and 1.405, times the config `uiScale`.

| Tier | Tasks | Row places | Dime diameter | Bill size | Snap distance | Coins (bills) per collection | Input |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 3 | up to 4 | 120u | 220 x 110u | 80u | at most 6 (4) | one press sends; a drag also carries |
| 1 | 4 | up to 5 | 108u | 210 x 105u | 56u | at most 9 (6) | drag, or click then mat |
| 2 | 4 | up to 6 | 96u | 200 x 100u | 40u | at most 12 (8) | drag, or click then mat |

- **Coins keep the true ratios** (dime 17.91 mm, penny 19.05, nickel 21.21, quarter 24.26): at tier 2 and 1366x768 the dime is 96 px, the penny 102, the nickel 114 and the quarter 130; at tier 0 the dime is 120 and the quarter 163. The dime never draws below 96 CSS px at any window size or tier; when `u` is smaller, coins keep that floor and the row holds fewer places.
- **Bills** keep a 2:1 shape, never below 192 x 96 CSS px and never above 280 x 140 CSS px at 1366x768 (the largest, tier 0 lifted 1.08x, is 238 x 119).
- **Row places:** the learning step decides which coins come and how many; the tier decides how many places they sit in. When there are more coins than places, coins of one kind share a place as a stack (the top coin is the target; up to five coins below show as offset rims). Places are the quarter's diameter plus 16u wide (at least 96 CSS px) by the row's height (the quarter's diameter plus 36u). The number of coins per collection is the tier's cap; the step's amount range is met with fewer, larger coins when the cap is low.
- **Drop zones:** the mat is one zone; in the counting steps each dish owns its column of the mat (split halfway between neighbouring dishes, full mat height), so every dish zone is at least 110 x 272 CSS px at 800x600 and 187 x 369 at 1366x768 tier 0. Two locks own the mat's upper and lower halves; one lock owns the whole mat. Dishes grow with the coins (1.43 to 1.6 times their coin's diameter), so tier 0 dishes are larger.

## Learning steps (hidden, separate from motor)

From research doc 08, section 6, all eight steps kept as written there.

**Evidence.** Each counted task of the current step (not the warm-up) gives one result, right or not:

- A pointer choice counts when the press that made it came at least 0.7 s after the child's previous press in play. A key choice counts when the child moved the highlight with an arrow key and then waited at least 0.4 s before the action key. A choice made during a demonstration, right after a hint that pointed at the answer (a lock hint), or by mashing records nothing for that task.
- Tag tasks (steps 1 to 3, 6, 7 and 8a): right means the first deliberate tag pick was the matching tag. A task with no deliberate pick records nothing.
- Lock tasks (steps 4 and 5): right means the lock was filled with deliberate choices and no coin hopped back.
- Step 8b: right means the first deliberate block choice was the right symbol.

**Moving between steps** (between rounds only): move up one step when every counted result of the round at the current step was right and there were at least 3, or when 6 of the last 8 at the step were right; move down one step (never below step 1) when 2 or fewer of the last 6 were right. A step change resets that step's window. **No stall:** a child who stays on a step keeps getting full rounds there; a child who plays only with keys and never uses the arrows records no evidence, so after 3 finished rounds at step 1 or 2 with no counted result the step moves up by one, up to step 3, as in Ride Fare. Beyond that only evidence moves it. Struggling inside a round only brings the idle hint sooner (after 4 s instead of 6 s once two choices on the same task went wrong); the content never changes mid-round.

| Step | Age | Material | What the child does | Right when |
| --- | --- | --- | --- | --- |
| 1 | 6 | Pennies, nickels and dimes, totals 11 to 99¢ (most under 60: 11 + 88 r^1.6 for a random r), lined up in the row by kind, dimes first, then nickels, then pennies. Three ¢ tags. | Moves every coin to its dish; counts on with the cups; picks the tag. | Right tag at first deliberate pick |
| 2 | 6 to 7 | The same kind of collection, spilled as a pile: the places are in random order and each coin is turned and nudged up to 12u off its place. | Sorts the coins into the dishes (any order works; the highlight and the hint start with the largest), then picks the tag. | Right tag (sorting not scored) |
| 3 | 7 | Collections with quarters, up to 100¢. In each round the first counted task is quarters alone (1 to 4 quarters: 25, 50, 75 or 100¢); the rest are 1 to 3 quarters with dimes, nickels and pennies. | As step 2; the quarter pours 25 cups. | Right tag |
| 4 | 7 | Two locks want the same amount, 10 to 50¢. The visitor fills the first lock with the fewest coins. The row has unlimited quarters (only when the amount is 25¢ or more), dimes, nickels and pennies. | Fills the second lock with a different mix. A coin worth more than the cups still unlit hops back; a coin that would finish the second lock with exactly the first lock's coins hops back too, and the hint then shows a smaller coin. | Second lock filled with no coin hopping back (a different mix is then guaranteed) |
| 5 | 7 to 8 | One lock, 26 to 99¢, with exactly as many dashed slots as the fewest-coins answer. Unlimited stacks of all four coins. | Fills the slots. A coin is taken only if the rest can still be made with the slots left: taking coin c with k slots left needs the fewest coins for the remaining amount minus c to be exactly k minus 1. Any other coin hops back with a smile. | Lock filled with no coin hopping back |
| 6 | 8 | Mixed coins with quarters totalling 105 to 150¢. | Counts as in step 3. When the hundredth cup lights, all hundred cups slide together into a $1 bill that lies on the board's upper half; the rest of the cents pour into rows 6 to 10. Tags read like "$1 and 25¢". | Right tag |
| 7 | 8 | Bills only: $1, $5, $10 and $20, totals $6 to $100, lined up greatest to least. The board counts one cup per dollar. Tags in whole dollars ("$45"). | Moves each bill onto the pile; counts on; picks the tag. | Right tag |
| 8 | 8 | Two kinds of task, alternating. (a) A coin collection up to 99¢, a bill collection up to $99, or a $1 bill with coins up to $1 and 99¢; the tags include the matching tag and its look-alike that differs only by symbol or form (45¢ and $45; $1 and 5¢ and $15). (b) After counting, one tag shows the numeral with an empty dashed box where the symbol goes, and two symbol blocks ($ and ¢) sit in the row. | (a) Picks the matching tag. (b) Moves the right block into the box; the wrong block hops back. | (a) Right tag; (b) right symbol at first deliberate choice |

- **Tags.** One tag is right; the other two differ from it by one coin's worth (1, 5, 10 or 25¢, or $1, $5 or $10 at step 7), never fall below the smallest coin or bill in the collection, never repeat each other, and never name the same amount in another form (no "125¢" next to "$1 and 25¢"). At step 8 the look-alike is one of them. Their order is shuffled.
- **Easing.** A child who struggles at any step from 2 to 8 moves back one step and gets full rounds of that content, each opening with a warm-up from the step below. Steps 1 to 3 together are a full game for a strong 6-year-old: counting mixed coins that Ride Fare already taught, sorting, and quarters.
- **Never stuck.** Every task can be finished with what is on the desk: a wrong tag fades out and the choice stays open until the matching tag is picked; locks draw from stacks that never run out, the hop-back rules above only refuse coins that could not lead to a full lock, and pennies always can; a wrong symbol block hops back and the right one stays.
- **The decimal point** is not used anywhere. Amounts over a dollar read "$1 and 25¢", whole dollars "$45", cents "45¢". This follows Common Core, Florida, New York and North Carolina (08 section 4). Texas and Virginia teach $0.45 in grade 2; it could be a step 9 later. **This is a decision open to the owner.**

## Mistake handling

There is no wrong state. A tag that does not match tilts gently twice and sinks back, fading to nothing over 0.4 s, while the visitor smiles and the dishes count on again from the largest; the other two tags stay. A coin that a lock does not take, or a symbol block that does not fit, hops back to its place with a soft giggle (three quiet `pop` A notes); no error sound, no red, no shake. A coin dropped off the mat slides back with a `whoosh`. Coins and bills are never lost: anything not in a dish, lock or the pile always returns to the row. Presses while a coin is still pouring send nothing more; the pressed coin gives a small hop.

## Keyboard-only and mouse-only play

- **Mouse or trackpad only:** every action is a press, a drag or a click-click; any mouse button counts. The context menu is cancelled.
- **Keyboard only:** a bobbing arrow and a warm ring mark the highlighted piece.
  - Counting: the highlight starts on the largest coin or bill in the row (leftmost of that kind). Left and Right (Up and Down step the same way) move through every piece in the row. Any other key sends the highlighted piece to its dish or the pile (at most one every 150 ms; none while a piece is still on its way); the highlight then moves to the largest piece left.
  - Tags: when the tags rise the highlight is on the left tag. Arrows move between the three tags; any other key picks the highlighted one. A wrong tag fades and the highlight moves to the next tag still there.
  - Locks: the highlight starts on the largest coin the open lock takes. Arrows move through the four stacks; any other key sends the highlighted coin into the open lock. A coin that hops back leaves the highlight on the largest coin the lock takes, so a child who presses one key still fills every lock.
  - Step 8b: the highlight starts on the left block; arrows switch blocks; any other key moves the highlighted block into the box.
  - During play every key plays, Escape, Tab and Enter included. After the round, Escape goes home and Tab reaches the corner Home and sound buttons; choice and rest follow the shared rule (first key shows focus, arrows move, the next key chooses).
- A piece lifted with a key stays a key carry if the mouse then drops it; it is never a motor attempt.

## Layout

The background `desk.webp` (1920x1280) cover-fits the window. The desk's far edge is at y 329 of the background's own pixels, so on screen the edge line is `E = offsetY + 329 x scale` (163 at 1366x768, 229 at 1920x1080, 154 at 800x600 and 390x600). Everything else is placed in layout units `u`. The corner Home and sound buttons are the shared ones (radius `max(48, min(60 x cu, W/8, H/6))`, 12 px from the corners: 120 px across at 1366x768). Measured once from the sprites' pixels: the stump's doorway ring spans 0.29 to 0.69 of its width (the doorway's centre at 0.49 and 0.62 of its height), the board's cream inset 0.07 to 0.93 by 0.073 to 0.923, the door's round plate 0.338 to 0.667 by 0.14 to 0.462 and its rectangular plate 0.257 to 0.74 by 0.552 to 0.729, the tag's writable face 0.27 to 0.97 of its width (left of that are the eyelet and twine), the lock plate's free plank 0.18 to 0.97 (the padlock is left of it), the bill's plain side panels 0.04 to 0.31 and 0.69 to 0.96 of its width (the oval is between), and each visitor's straight body cut at 0.93 to 0.95 of its waiting pose's height (the sack hangs below it).

Landscape windows (width at least height):

- **Top band (above the desk edge):** the visitor stands right of Home (16u gap), 180u tall (less if needed so its head stays 4 px inside the window), its body cut on the desk edge so the sack and paws hang over the desk. The stump is 330u wide (less if its top would leave the window), its base 6u below the edge, its left edge at `max(visitor right + 24u, W/2 - 230u)`. The door is 0.41 of the stump's width across; it hinges on the doorway ring's right edge (0.69 of the stump's width) at the doorway's centre height: open, it hangs to the right of the hinge; closing, it scales from 1 to -1 about the hinge over 0.45 s, so the closed door (its own mirror image) covers the doorway.
- **Counting board:** 360u wide (0.886 as tall), 20u from the right edge, its top 14u below the desk edge. Cups sit in its inset in 10 rows of ten split 5 and 5 (a gap of 0.6 of a pitch), pitch `min(inset width / 10.6, inset height / 10.4)`, cup 0.86 of the pitch: 22 px at 1366x768, 32 px at 1920x1080, 13 px at 800x600. After a trade (step 6) the $1 bill lies over rows 1 to 5, as large as fits that half (2:1).
- **Mat:** from 20u on the left to 16u left of the board, from 14u below the desk edge to 12u above the row. It is drawn in three slices: the outer fifths of the sprite as end caps scaled by the height's scale, the middle three fifths stretched to fill (at most 0.99 of its pixels at 1920x1080). Its inner area is inset 6 percent left and right and 10 percent top and bottom.
- **Dishes:** quarter, dime, nickel, penny left to right in the mat's inner area, each `k` times its coin's diameter wide (two-thirds as tall), `k = min(1.6, room / the four diameters)`, spread evenly, the outer two raised 10u (a gentle arc).
- **Locks:** two plates stacked in the inner area with a 16u gap, or one plate up to 150u tall, centred, keeping the sprite's 4.72:1 shape. Amount numeral on the plank just right of the padlock; the slots (step 5) or coins (step 4) fill the rest, coins drawn at up to 0.7 of the plate's height.
- **Row:** along the bottom, 20u in from each side, its bottom 12u above the window's bottom. The purse, 170u wide, sits at its left end; the places are spread evenly to its right. When counting is done the purse slides out to the left and three tags, each up to 330u wide (2.52:1, at least 96 px tall), slide up into the row with 24u between them. Step 8b's two symbol blocks are 120u (at least 96 px) square, centred, 24u apart.
- **Fit:** where a large `uiScale` leaves too little height, the visitor, stump and board shrink first (down to 0.6), then the coins in 10 percent steps toward the dime's 96 px floor and the spacing toward its size at u = 0.45; places, dish zones, lock zones, tags and blocks never go under 96 CSS px on either side.

Portrait windows (height greater than width): the visitor (at most 100 px tall) and the stump with its door share the gap between the corner buttons, both standing on the desk edge. Below the edge the mat (two dishes by two, each owning a quarter of the mat; locks stacked in it, owning its halves) takes the left 200 px and the board the rest of the width on the right; the row stays along the bottom. When the tags rise they stand one above another, 96 px tall, from just above the window's bottom, over the mat and row; the top tag may cover the board's bottom frame but never its cups.

At the four checked sizes (from the layout script kept with the art sources; numbers for tier 0 and tier 2):

- **1366x768 (u = 1):** edge 163; visitor 156 x 169 at (148, 4); stump 288 x 165 at (453, 4); door 118 across; board 360 x 319 at (986, 177), cups 22 px; mat 950 x 369 (tier 0) or 950 x 401 (tier 2) at (20, 177); tier 0 dishes quarter 232 x 155, dime 171 x 114, nickel 203 x 135, penny 182 x 122; row 199 (tier 0) or 166 (tier 2) tall with 4 or 6 places of 179 or 146 px; tags 330 x 131; locks 659 x 139 (two) or 708 x 150 (one); bills 220 x 110 (tier 0) or 200 x 100 (tier 2).
- **1920x1080 (u = 1.405):** the same layout scaled; edge 229; visitor 240 tall; stump 407 wide; board 506 x 448, cups 32 px; tier 0 quarter 228 px, bill 309 x 155, tags 464 x 184. This is the size the asset table is checked at.
- **800x600 (u = 0.586):** every coin at its floor (dime 96, penny 102, nickel 114, quarter 130), bills 192 x 96; edge 154; visitor 97 x 105; board 211 x 187, cups 13 px; mat 556 x 272; dish zones 110 to 174 px wide by 272 tall; row 151 tall with 4 places; tags 242 x 96.
- **390x600 (portrait, u = 0.45):** edge 154; visitor 92 x 100 and stump 60 x 34 between the corner buttons; mat 200 x 280 at (9, 160) with four dish zones of 100 x 140; board 164 x 145 at (217, 160), cups 10 px (the one size where cups go under 12 px); row 146 tall with 2 places; tags 242 x 96 at y 298, 398 and 498.

## Drawing amounts, cups and numerals

Code draws everything counted or exact; the art has no text, numbers or counted groups.

- **Coins** are the sprites scaled to the true diameters above, each showing heads or tails at random (the same face in the row and in its dish). In a dish they lie at 0.4 of play size (smaller where the dish is small) in rows of five, overlapping by 15 percent. In step 5's slots they fill dashed rings drawn in code.
- **Cups:** unlit cups are warm grey sockets, lit cups warm gold with a darker rim, both baked once per size. After a trade the $1 bill covers rows 1 to 5.
- **Numerals, $ and ¢:** glyph strips of `0123456789$¢` and the word `and` in the bundled Andika font (`src/app/font.ts`), dark brown `#4a2f1c` on the cream art, baked once per size and copied at whole pixels. Sizes at 1366x768: tags 0.42 of the tag's height (55 px on a 131 px tag), shrunk to fit the face for long amounts such as "$1 and 25¢"; lock amounts 0.45 of the plate's height; the door plate 0.6 of its height (at least 14 px; it is a keepsake, not something to read from).
- **Bills:** the denomination numeral (1, 5, 10 or 20) in both plain side panels at 0.52 of the bill's height (57 px on a 110 px bill), the bill's main cue. At the steps that use $ notation (6, 7 and 8) the left panel reads "$20" instead, shrunk to fit the panel (at least 0.3 of the bill's height), and the right panel keeps the plain numeral. The animal silhouette in the middle is a second cue ($1 mouse, $5 rabbit, $10 fox, $20 bear); colour never stands for value (all four bills are the same butter cream).
- **Symbol box (step 8b):** a dashed rounded square drawn on the tag where the symbol goes, the blocks show `$` or `¢` at 0.6 of their size.

## Currency illustrations

Research doc 08 section 5 is the finding; summary here. 18 U.S.C. 504 permits illustrations of US currency only under conditions: black and white, or (under 31 CFR 411.1) colour if one-sided, under 75 percent or over 150 percent of the real note's size in each dimension, and with every file used to make it destroyed after final use. 18 U.S.C. 474 makes it a crime to make an impression "in the likeness of" a note or any part of it outside those exceptions. A published web game keeps its image files for as long as it is live, so it could never meet the destruction condition, and 504(2) withholds the exception from electronic reproduction anyway. The game therefore stays outside "illustration" and "likeness" altogether: its bills are original toy art, not pictures of real notes. In our reading (not legal advice) such bills carry no meaningful risk, so the owner's stop condition was not triggered.

Limits every bill in this game keeps (08 section 5, "Design limits"):

1. Original art only; the image model never saw a real note (the only reference attached was the game's own concept, which shows a toy bill).
2. No portrait of any person (a friendly animal silhouette instead), no seals, serial numbers, signatures, lettering or numerals in the art, no lathe-work or guilloche borders, no corner circles or inner frame echoing a real note's layout, no buildings, no security thread.
3. Not a real note's colours: one butter-cream toy palette for all four, never green and black, purple, orange or green and peach.
4. Squat 2:1 shape with rounded corners (a real note is about 2.35:1). The generated bills came out 2.21 to 2.42:1 and were cut to exactly 2:1 by removing a strip from each plain side panel (no stretching).
5. Drawn at most 280 x 140 CSS px at 1366x768 (largest drawn here: 238 x 119 lifted at tier 0; the step-6 bill on the board 263 x 131).
6. One side only; bills never flip.
7. A thick soft outline, flat colour and a big code-drawn numeral make it plainly a toy.
8. No bill-shaped advertising or promotional art (18 U.S.C. 475).

Coins: stylized, no inscriptions, dates or lettering (18 U.S.C. 489 covers physical tokens; a drawn coin is not one).

## Sound

Effects come from `src/audio/sfx.ts` with a variant on each call; no new sounds.

| Moment | Effect |
| --- | --- |
| Pick up a coin or bill | `pop` B, quiet |
| Coin lands in its dish, bill on the pile, coin in a lock | `pop` D |
| Each cup lights | `tick` C, pitch index = cup number within its row of ten |
| A dish counts on (pulse) | `pop` C, pitch index = dish order |
| Matching tag picked | `pop-big` C |
| Tag fades, coin or block hops back | three `pop` A notes 90 ms apart, quiet |
| Piece dropped off the mat returns | `whoosh` D |
| Coins roll into the vault / door shuts | `whoosh` B / `pop-big` D |
| Visitor waves | `go` C |
| Trade: 100 cups become $1 | `pop-big` B |
| A lock fills | `pop-big` C |
| Symbol block placed | `pop` C |
| A coin slides into the row | `tick` B, quiet, pitch index = place |
| Round end, stars, sticker, Again, Home | `fanfare` D, `star` B, `sticker` C, `whoosh` A, `button` B |

The fanfare is prepared ahead with `prepareSfxStep` as in Bubble Bay and Ride Fare. Music: track name `coin-vault` (`public/music/coin-vault.mp3`, composed by the owner; silence until it exists), added to `MusicTrack` and `MUSIC_TRACKS` in `src/audio/music.ts`; `startMusic` on entry, `stopMusic` on exit.

## Voice clip slots

Optional clips live in `public/voice/coin-vault/` (a README there names them): `penny`, `nickel`, `dime`, `quarter`, `one-dollar`, `five-dollars`, `ten-dollars`, `twenty-dollars` play when that coin or bill is picked up; `number-1` to `number-20`, then `number-25`, `number-30`, `number-40` up to `number-100` by tens, play as each dish's count-on reaches its running total and when a matching tag is picked. The game lists the files present at build time with `import.meta.glob`, so a missing clip is skipped with no request. None ship.

## Performance

No allocation in update or render: coins and bills in flight (32), coins rolling into the vault (20) and particles (160) are pooled. Every sprite is drawn at a fixed size per layout and animated with transforms; one cached scaled canvas per sprite size, released when the canvas size, pixel ratio, tier or fit changes, and on exit. The mat's three slices, the unlit and lit cups, the dashed slot ring and symbol box, the hint halo, and the glyph strips are baked on CPU canvases (`willReadFrequently: true`, see pitfalls) when their size changes, never per frame; each bake step ends with `getImageData(0, 0, 1, 1)`. Tag, lock and bill numerals are copied from the strips into one cached canvas per tag or bill when the task starts. The background is rescaled only when the canvas size or pixel ratio changes, and its cover-fit is computed from the loaded image when the scaled copy is made (pitfall 2026-10-04). No gradients, `shadowBlur` or `fillText` per frame. The door swing is a scale transform of the cached door; the visitor is drawn whole (its cut sits on the desk edge, so no clip is needed). Celebration, choice and rest art is scaled ahead in idle periods as in Ride Fare (4 ms rule, 500 ms cap). Target: scene `workMean` under 0.5 ms and `workMax` under 3 ms at 1366x768 after the first 3 s.

## Art

Medium: coloured pencil on warm toned paper, visible hatching and grain, honey wood, sage-green felt, russet red, warm cream, soft silver and copper; true-colour WebP. Shared controls (Home, sound, play arrow) reuse the existing art.

All bitmaps were generated on 2026-10-05 with the built-in `image_gen` tool in Codex CLI 0.159.0 (`codex exec -m gpt-6-astra -c model_reasoning_effort=medium -c model_provider=openai`). The tool did not report the image model. Every request attached the selected concept (`cv2.png`, 1672x941) as its first and only reference and shared one style block (soft coloured-pencil drawing on warm toned paper, visible hatching and grain, soft warm brown outlines, the concept's shapes, proportions and palette, no text, letters, numbers, logos, inscriptions or interface). No real banknote or coin photo was ever given to the model. Sprite requests asked for a transparent background; every result came back with a clean alpha channel.

Processing (`sharp`; scripts kept with the sources): regions of alpha above 128 found and isolated, alpha under 16 cleared and over 235 made solid, colours at soft edges replaced by nearby solid colours (no dark or light fringe), specks under 300 px removed, cropped to the alpha bounds with 4 px padding, resized with Lanczos 3 and written as WebP quality 80, alpha quality 50. The two poses of each visitor share one scale (waiting pose 400 px tall). Coins: each face's circle fitted from its alpha area and centroid, cropped 2 px inside, resized to 384x384 with an exact anti-aliased round edge. Bills: cropped, then cut from 2.21 to 2.42:1 to exactly 2:1 by removing one vertical strip from each plain side panel (at 0.2 and 0.8 of the width, 48 px crossfade at each join), then resized to 640x320. Dishes, the tag and the symbol block were cut from shared sheets. Every file was checked on light, mid-grey and dark grounds for halos and stray pixels (contact sheet with the sources).

`desk.webp` follows the three-strip method (PR #13, Ride Fare): the 1536x1024 base `bg-base3` (third attempt: the first was too saturated and smooth for coloured pencil, the second put the desk edge too high) was cut into three overlapping 683x1024 strips, each enlarged to 1024x1536 and redrawn faithfully in its own request (`bg-s0-1`, `bg-s1-1`, `bg-s2-1`, concept and strip attached). The PR #13 stitch script registered each strip on the base enlarged 1.5 times (alignment error 9.6 to 12.5), locked broad colour to the base (Gaussian sigma 32), joined neighbours along the least-different vertical path (6 px feather) and resized the 2304x1536 mosaic to 1920x1280 (Lanczos 3), WebP quality 80, opaque. A straight-line scan finds no vertical seam (only the plank joins). It shows only the forest floor behind the desk (moss, ferns, ivy and pinecones toward the corners) and the empty desk: no stump, mat, dishes, purse, coins, bills or animals.

### Asset table

"Largest drawn" is the biggest size any screen draws the file in a 1920x1080 window at device pixel ratio 1 (u = 1.405), including lifts and pulses; every one is at most the file's own size.

| File in `public/art/coin-vault/` | Pixels | Largest drawn at 1920x1080 | Source (prompt in `prompts/`) and processing |
| --- | --- | --- | --- |
| `desk.webp` | 1920x1280 | 1920x1280 cover-fit (scale 1.0) | `bg-base3`, then `bg-s0-1`, `bg-s1-1`, `bg-s2-1`; three-strip stitch, opaque, 465 KB |
| `coin-penny-heads.webp`, `coin-penny-tails.webp` | 384x384 | 256 (the tier-0 quarter, 228, lifted 1.12x; scale 0.67; the penny itself at most 200) | `coin-penny-2` (second attempt: the first was a realistic engraved render, not pencil); circle fit, round mask |
| `coin-nickel-heads.webp`, `coin-nickel-tails.webp` | 384x384 | 256 | `coin-nickel-2` (second attempt, same reason); smooth edge |
| `coin-dime-heads.webp`, `coin-dime-tails.webp` | 384x384 | 256 | `coin-dime-2` (second attempt); reeded edge |
| `coin-quarter-heads.webp`, `coin-quarter-tails.webp` | 384x384 | 256 | `coin-quarter-2` (second attempt); reeded edge |
| `bill-1.webp` | 640x320 | 373 x 186 (the step-6 bill on the board; scale 0.58) | `bill-1-2`, mouse silhouette; original art, no real note used as input; 2.31:1 cut to 2:1 |
| `bill-5.webp` | 640x320 | 334 x 167 (tier-0 bill lifted 1.08x; scale 0.52) | `bill-5-2`, rabbit silhouette; original art, no real note used as input; 2.21:1 cut to 2:1 |
| `bill-10.webp` | 640x320 | 334 x 167 | `bill-10-2`, fox silhouette; original art, no real note used as input; 2.42:1 cut to 2:1 |
| `bill-20.webp` | 640x320 | 334 x 167 | `bill-20-2`, bear silhouette; original art, no real note used as input; 2.29:1 cut to 2:1. (First attempts `bill-*` had colour animal drawings and 2.4:1 shapes; replaced.) |
| `squirrel-wait.webp`, `squirrel-happy.webp` | 368x400, 374x377 | 240 tall (180u, capped so the head stays in the window; scale 0.6); celebration row at 0.8 of that | `visitor-squirrel` sheet; shared scale 0.533 |
| `rabbit-wait.webp`, `rabbit-happy.webp` | 213x400, 262x347 | 240 tall | `visitor-rabbit`; scale 0.425 |
| `badger-wait.webp`, `badger-happy.webp` | 359x400, 399x403 | 240 tall | `visitor-badger`; scale 0.551 |
| `hedgehog-wait.webp`, `hedgehog-happy.webp` | 385x400, 386x375 | 240 tall | `visitor-hedgehog`; scale 0.561 |
| `owl-wait.webp`, `owl-happy.webp` | 397x400, 471x377 | 240 tall | `visitor-owl`; scale 0.594 |
| `beaver-wait.webp`, `beaver-happy.webp` | 345x400, 398x371 | 240 tall | `visitor-beaver`; scale 0.548 |
| `vault-stump.webp` | 700x401 | 407 x 233 (scale 0.58) | `stump`; doorway empty, hinges on its right |
| `vault-door.webp` | 420x420 | 167 (scale 0.40) | `door`; blank round and rectangular plates |
| `mat.webp` | 1489x683 | 1336 x 564 in three slices (caps 0.83, middle at most 0.99) | `mat` |
| `dish-quarter.webp` | 560x389 | 326 x 218, 346 in its 1.06 pulse (scale 0.62) | `dishes2` sheet, bottom right (second attempt: the first sheet's dishes were 330 px wide) |
| `dish-dime.webp`, `dish-nickel.webp`, `dish-penny.webp` | 560x374, 560x375, 560x374 | at most 302 wide in the pulse | `dishes2` sheet |
| `count-board.webp` | 760x673 | 506 x 448 (scale 0.67) | `board2` (second attempt: the first was 1.5:1, too wide for ten rows) |
| `lock-plate.webp` | 1450x307 | 1013 x 214 (scale 0.70) | `lock` |
| `tag.webp` | 640x254 | 464 x 184, 501 lifted (scale 0.78) | `tag-block` sheet, left |
| `symbol-block.webp` | 278x280 | 169, 186 lifted (scale 0.67) | `tag-block` sheet, right |
| `purse.webp` | 420x274 | 239 x 156 (scale 0.57) | `purse` |
| `helper-hand.webp` | 256x244 | 211 tall (150u; scale 0.86) | `hand` |
| `tile.webp` | 512x512 | hub tile, drawn like every other game's 512 px icon | `tile`: the squirrel peeking round the stump vault, door ajar |
| `sticker-squirrel.webp` | 469x512 | sticker offer and book sizes of the shared helper | `sticker-squirrel`: the squirrel hugging an acorn |
| `sticker-vault.webp` | 512x500 | as above | `sticker-vault`: the stump vault, door closed, ivy and a flower |
| `sticker-purse.webp` | 444x512 | as above | `sticker-purse`: the closed purse tied with a bow and an oak leaf |
| `sticker-acorn.webp` | 512x499 | as above | `sticker-acorn`: one acorn with an oak leaf |
| `sticker-beaver.webp` | 512x507 | as above | `sticker-beaver`: a beaver hugging a pencil |
| `sticker-owl.webp` | 408x512 | as above | `sticker-owl`: an owl in reading glasses on a mossy branch |

Total 45 files, 2.17 MB (the background is 465 KB of that). No sticker or the tile shows money, coins, prices or amounts.

Raw images, prompts, Codex logs, strips, the stitch output, the layout script, the mock-ups and all processing scripts are kept outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/coin-vault/art-sources/`; the Codex originals are also under `C:/Users/Home/.codex/generated_images/`.

## Files (planned)

- `src/games/coin-vault/`: `index.ts` (definition and save validator), `scene.ts`, `rules.ts` (tiers, steps, collections, tags, lock rules, progression), `data.ts` (save bag: tier, step, evidence window, demonstrations seen, pending round, validator), `voice.ts`.
- `dev/coin-vault.html`, `src/dev/coin-vault.ts`: isolated dev page.
- Debug (only with `?debug`): `?debug&tier=0..2&step=1..8&rounds=N&seed=N`; `window.__coinVault` is a read-only stats object (step, tier, phase, pieces in the row with hit rectangles, dish and lock zones, tags with their amounts, lit cups, the vault state, targets for sticker choice, Again and Home).
- Shared edits: one registry entry, six stickers appended to `STICKERS` (ids `coin-vault-squirrel`, `coin-vault-vault`, `coin-vault-purse`, `coin-vault-acorn`, `coin-vault-beaver`, `coin-vault-owl`), one music track name.
