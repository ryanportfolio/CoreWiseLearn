# Market Stall

A round game about paying and getting change. The child runs a bread stall on a harbour, seen from behind the counter. Animal customers come to the counter one at a time with something to buy: a loaf, a pretzel, a pie. Each item has a price tag, and the customer puts a payment in the wooden dish on the counter. The child checks whether the payment is enough and, when it is more than the price, counts the change back from the till into the customer's open paw, counting up from the price (27, 28, 29, 30). Then the customer takes the item and the change and leaves happily. It covers Common Core 2.MD.C.8 (money word problems with $ and ¢). Learning tag: `counting` (the shared list of learning tags has no `money`; adding one is a change to shared code and needs the owner's OK).

Nothing is bought or kept by the child. The child is the seller and serves someone else; the till refills every round; there is no wallet, balance, shop or goal that spans sessions, and money never touches stars or stickers (`docs/research/07-money.md` section 2; `docs/research/08-money-grades-1-2.md` section 6, "Shared rules"). The selected concept is `docs/games/market-stall/concept.webp` (the owner's pick, MS2, 2026-10-05).

Market Stall starts where Ride Fare stops (fares to 99¢ with pennies, nickels and dimes, and handing back 1 to 9 pennies from a dime) and adds quarters, bills, the $ sign, counting up the change and change from $1 and $20.

## The action and its response

There are two kinds of action. Which one a customer asks for depends on the learning step (table below).

- **Decide: enough, or more please.** The item with its price tag and the customer's closed purse sit on the counter. Pressing the item hands it over ("enough"); pressing the purse asks for more. Both are single presses with any mouse button or a tap. The item lifts and glides into the customer's arms (0.4 s) or the purse gives a small hop (0.2 s).
- **Count out the change.** The till holds coins in round wells (or bills in long slots). Press a coin and carry it to the customer's open paw: drag it there and let go, or click the coin and then click the paw (the coin follows the pointer between the clicks). At motor tier 0 a click (a press released within 0.3 s and 24 px) on a coin sends it straight to the paw; a drag still carries it. A coin released within the tier's snap distance of the paw zone counts as dropped on it. Bills work the same way.
- **Each piece of change pays at once:** the coin flies to the paw (0.3 s) and joins a small pile there (drawn at 0.6 of its size, overlapping, never counted by the child). The counter numeral on the board climbs by the coin's value, one step per cent with a soft rising tick (a penny one step; a nickel five steps 60 ms apart; a dime ten steps 30 ms apart; a quarter 25 steps 14 ms apart, so every pour takes about 0.3 s), and the change cups on the board turn from orange-red to cream as the counter passes them. A $1 bill adds one dollar, a $5 bill five, a $10 bill ten, with the same tick pour.
- **Too much:** a coin or bill worth more than the change still owed touches the paw, shows its value as a small ring of dots for 0.25 s (25 for a quarter shown as two rows of ten and a five, drawn in code), and hops back to its well with a soft giggle while the customer smiles. Nothing changes on the board.
- **Done:** when the counter reaches the payment, the board's cups pulse once (0.35 s), the customer switches to its happy pose, scoops the change and the item and walks off to the right along the quay (0.8 s). The next customer walks in from the left (0.6 s), sets the item down, the tag swings, and the payment drops into the dish (coins one after another, 0.12 s apart; a bill flutters down, 0.3 s). The payment then pours into the board's cups (as above). The child can act as soon as the pour ends: about 2.2 s from the last change coin to the next customer ready.
- **The customers** are content, curious or delighted. None is ever shown waiting impatiently, sad, pleading or disappointed.

### Enough or more: what happens after each choice

Rules from 08 section 6 notes; no choice is ever wrong on screen.

| Payment | Child hands the item over | Child asks for more (purse) |
| --- | --- | --- |
| Exact | The customer takes the item and leaves happily. Counted right. | The purse opens and shows it is empty (0.5 s); the customer laughs, takes the item and leaves happily. Counted not right. |
| Short | The customer looks at the board, smiles, and adds the coin or bill that makes it exact from its purse; the unlit cups fill; the customer takes the item and leaves. Counted not right. | The customer nods, takes coins or bills from the purse into the dish until the payment is exact; the unlit cups fill; the item then glows and the child hands it over (this second press records nothing). Counted right. |
| More (step 5 only) | Change counting starts (the till slides up). Counted right for the decision. | The purse opens and shows it is empty; then change counting starts. Counted not right for the decision. |

## Discovery without words

The very first round shows the goal first: the otter stands at the counter, the board shows a price of 27¢ with 30 cups (27 yellow, 3 orange-red change cups), three pennies hop from the till into its paw one after another while the counter climbs 28, 29, 30, and the otter waves and walks off with its loaf (about 2.5 s). Then the heron steps up with a 26¢ pretzel and three dimes; while the dimes pour, the linocut helper hand rises from the bottom edge, presses a penny in the till, carries it to the heron's paw and lets go; the counter climbs to 27. The hand then rests on the penny well and taps it in a loop until the child does anything, so the child finishes the change with three pennies. The first change cup lights about 5 s after the game opens. The introduction's other customers come from the child's current step. The introduction records no evidence, changes no motor tier and always earns three stars.

Idle: after 6 quiet seconds the hand shows the next helpful action, then fades, and repeats every 7 s while the child stays idle. In change counting it carries a see-through hint coin (in a pulsing warm halo, paying nothing) from the largest coin or bill that still fits to the paw. In a decision it taps the board's unlit cups (short) or the full rows (exact), then rests over the purse (short) or the item (exact). A customer finished after a hint still leaves happily but records no learning evidence. After two bounces or two not-right choices on one customer, the hint comes after 4 s instead of 6 s (08 section 6, "Easing after misses").

**First-time demonstrations.** The first customer whose content is a new step for a profile gets one ghost-hand demonstration of that step's new idea; the save remembers which steps' demonstrations the profile has seen (`demos`, one bit per step), so each plays once per profile. The demonstrated customer records no evidence.

- Step 1: the first exact payment: the hand presses the item (it goes to the customer). The first short payment: the hand taps the unlit cups, then the purse; the customer adds a coin.
- Step 2: as in the introduction (one penny to the paw, the child finishes).
- Step 3: the first bill: a $5 bill drops into the dish and five cups (one per dollar, in a row with the 5 and 5 split) light; the hand taps the price tag, then the cups.
- Step 4: the hand carries one $1 bill from the till to the paw; the counter climbs from the price by 1.
- Step 5: a quarter drops into the dish and 25 cups pour (two full rows of ten and five more); the hand traces the rows.
- Step 6: price 23¢, paid with two quarters: the hand moves two pennies (24, 25), then a nickel (30); the child finishes with two dimes.
- Step 7: the $1 bill drops into the dish and 100 cups pour, ten rows of ten; the hand moves the first coin.
- Step 8: the hand moves a $1 bill, then a $5 bill ($13: 14, 15, 20).
- Step 9: no hand: the two tags slide together into one, and the two cup groups slide into one grid before the payment pours.

## Round structure and attempts

1. **Customers:** 3 per round at motor tier 0, 4 at tiers 1 and 2. Six customers (heron, otter, pelican, puffin, seal, bear) take turns in a fixed rotation that continues across rounds; each brings one of eight goods (round loaf, long loaf, braided loaf, pretzel, fish biscuit, pie, honey jar, cake), never the same good twice in a row. Above step 1 the first customer of a round comes from the step below (a warm-up that records nothing); the rest come from the current step. At step 9, the top, a round's customers come from steps 7, 9, 8 and 9 in that order (only the step-9 customers count), so the child keeps getting varied full rounds.
2. **Celebration:** the round's customers stand in a row along the quay behind the counter, each in its happy pose holding its good, waving; confetti; stars land one by one. Input is ignored for the first 1.5 s and until the last star lands; it ends by itself at 4.6 s.
3. **Sticker choice:** while this game's six stickers are not all owned and `rewardsEnabled` is true, the shared `createStickerOffers` helper (`src/ui/sticker-offer.ts`, reused, not copied) shows two stickers standing on the counter, with the small sticker book beside them; its `warm` and `warmBook` run during the celebration. Same guard as every game: input ignored for 1.2 s, nothing focused, the first key only shows focus.
4. **Still rest:** the empty stall with the harbour, the sticker book with the new sticker (or the round's customers waving when there is no gift), the stars, and Again and Home of equal size and colour. `services.roundBoundary()` runs when rest is reached.

Stars: every finished round earns 3. Bounces and not-right choices never cost a star. Awards persist once, as in Ride Fare and Bubble Bay: round count, stars and the offered pair go into the game bag's `pending` field with a unique round `id` and `save.flush()` before the celebration shows; leaving or reloading returns to the choice or the rest; leaving rest by any route clears `pending`. The till, the dish, every payment and every coin and bill are play material only and are never saved.

**Attempts (motor):** one carry or one decision press counts once, whatever the input style. Releasing a carried coin or bill on the paw zone (with the tier's snap distance) is one hit; releasing it anywhere off the till is one miss and it slides back to its well (released over the till, it just goes back). A press on the item or the purse during a decision is one hit; a press on empty play space is one miss. A coin that bounces back because it was too much still reached the target and is a hit. Picking up, key presses, the tier-0 one-press send, demonstrations and hints never count. At the end of a round: 8 or more attempts with under 70 percent hits moves down a tier; 12 or more at 90 percent or better is a qualifying round, and two in a row move up a tier (Ride Fare's rule).

## Motor tiers (hidden, between rounds)

The layout unit `u` is `min(width / 1366, height / 768)` kept between 0.45 and 1.405, times the config `uiScale`.

| Tier | Customers | Dime diameter | Bill size | Snap distance | Paw zone | Item zone, purse zone | Till kinds | Input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 3 | 120u | 240 x 120u | 80u | 170 x 130u | 210 x 190u, 170 x 170u | only the kinds the change needs | one press sends a coin or bill to the paw; a drag also carries it |
| 1 | 4 | 108u | 220 x 110u | 56u | 150 x 120u | 190 x 170u, 150 x 150u | the needed kinds plus one more | drag, or click then click the paw |
| 2 | 4 | 96u | 200 x 100u | 40u | 130 x 110u | 170 x 150u, 130 x 130u | all four kinds of that till | drag, or click then click the paw |

- **Coins keep the true diameter ratios** (dime 17.91 mm, penny 19.05, nickel 21.21, quarter 24.26): at tier 2 and 1366x768 the dime is 96 px, the penny 102, the nickel 114 and the quarter 130; at tier 0 120, 128, 142 and 163. The dime never draws below 96 CSS px at any window size or tier; when `u` is smaller, coins keep that floor.
- **Bills** are 2:1. Their short side never draws below 96 CSS px (so never under 192 x 96), and at 1366x768 they are at most 240 x 120 CSS px, inside the 280 x 140 cap of 08 section 5. A bill in the payment dish is drawn at 0.8 of its size (it is not a target).
- **Every zone is at least 96 CSS px on both sides** at every window size (the u-sized numbers above are floored at 96). The item zone covers the item and its tag; the purse zone covers the purse; the paw zone is centred on the customer's open paw. Zones never overlap each other, a till well or slot, or a corner button.
- **The till's distractor kinds** are the only motor change in content: a "more" kind is the next larger coin (or bill) the change does not need, falling back to the next smaller; it can still be used where it fits (any correct change counts), and bounces where it does not. They never change the learning step's numbers.

## Learning steps (hidden, separate from motor)

Learning evidence is one result per customer of the current step (not the warm-up customer, not a demonstrated or hinted one). A choice counts as deliberate when the press that made it came at least 0.7 s after the child's previous press in play; with keys, when the child moved the highlight with an arrow key and waited at least 0.4 s before the action key (08 section 6, "Shared rules"). A customer whose deciding press or any change piece was not deliberate records nothing, so a stream of quick presses plays fully but counts nothing.

| Step | Age, grade | New idea | Price and payment | What the child does | Counted right |
| --- | --- | --- | --- | --- | --- |
| 1 | 6, grade 1 | Is it enough? | Tag in ¢, 10 to 50¢. Payment in pennies, nickels and dimes (largest coins first: dimes for the tens, a nickel when 5 or more is left, then pennies; at most 9 coins), exact half the time, else short by 1 to 10¢. Board: the price as cups (rows of ten, split 5 and 5), the payment pours yellow into them. No till. | Hands the item over or asks for more. | First deliberate decision right (hand over when exact, ask when short) |
| 2 | 6, grade 1 stretch | Count up the change | Prices 11 to 49¢ that are not a multiple of 10; payment the next ten in dimes (for example 26¢, paid 30¢). The cups past the price show orange-red. Till: pennies (plus distractors by tier). | Moves change to the paw; the counter climbs from the price (27, 28, 29, 30). | Change exact with no piece bounced |
| 3 | 6 to 7, grade 1 | Whole-dollar prices with $ and bills | Tag in $, $1 to $10. Payment in $1 and $5 bills, exact half the time, else short by $1 to $3. One cup per dollar. No till. | Hands the item over or asks for more. | First deliberate decision right |
| 4 | 7, grade 1 to 2 | Change in dollars | Prices $1 to $9; paid with a $5 bill (prices $1 to $4) or a $10 bill. Change 1 to 9 dollars. Till: $1 bills (plus distractors). | Counts the change up in $1 bills ($7, paid $10: 8, 9, 10). | Change exact with no piece bounced |
| 5 | 7, grade 2 | Quarters in the payment | Prices 26 to 99¢; payment includes at least one quarter (largest coins first), exact, short by 1 to 10¢, or more by 1 to 24¢ (a third each). Till for change: pennies, nickels, dimes (a quarter well at tier 2 bounces, since change is under 25¢). | Decides; when the payment is more, counts the change up. | Decision right, and change exact with no piece bounced when change was owed |
| 6 | 7, grade 2 | Count up through the next 5 and 10 | Change 10 to 50¢: price 10 to 89¢ with a ones digit other than 0 and 5 half the time, payment the price rounded up to a multiple of 25 or 10 plus whole dimes or quarters (for example 23¢, paid 50¢ in two quarters). Till: all four coins. | Counts up: pennies to the next 5, a nickel to the next 10, then dimes (or a quarter) to the payment. Any correct change counts. | Change exact with no piece bounced |
| 7 | 7 to 8, grade 2 | Change from $1 | Prices 5 to 95¢; the customer pays with a $1 bill, which pours 100¢ as ten rows of ten cups. Till: all four coins. | Counts up to 100¢ with any coins. | Change exact with no piece bounced |
| 8 | 8, grade 2 | $20 and bigger jumps | Prices $1 to $19, paid with a $20 bill (prices $11 to $19), or a $10 and a $5 (prices $11 to $14) or a $10 (prices $1 to $9). Till: $1, $5 and $10 bills (a $20 slot at tier 2 bounces). | Counts up with $1 bills, then $5 and $10 bills ($13: 14, 15, then 20). | Change exact with no piece bounced |
| 9 | 8, end of grade 2 stretch | Two items | Two items, both in ¢ (each 5 to 60¢, total 20 to 95¢) paid with a $1 bill, or both in $ (each $1 to $12, total $5 to $19) paid with $20. The two tags slide together into one tag showing the total; the two cup groups slide into one grid; then the payment pours. | Counts up the change. | Change exact with no piece bounced |

Steps 1 and 2 need nothing Ride Fare did not teach except the yes-or-more choice and counting up past 10, so a strong 6-year-old can reach them. Step 3 of 08 section 6 (bills, the $ sign and dollar change together) is split here into steps 3 and 4 so each step adds one idea (R1 audit). Steps 5 to 9 follow 08 steps 4 to 8. Amounts never mix $ and ¢ in one tag; a payment is all coins or all bills, except the $1 bill at steps 7 and 9, which pours its 100¢ as cups before the change. No decimal point anywhere (see "Currency illustrations").

**Moving between steps** (between rounds only; 08 section 6, copied from Ride Fare): at the current step, move up one step when every counted customer of the round was right and there were at least 3, or when 6 of the step's last 8 counted customers were right; move down one step when 2 or fewer of the last 6 were right (never below step 1). A step change resets that step's window. Every round above step 1 opens with one warm-up customer from the step below.

**Easing and no stall.** Every task can always be finished: the till's wells never run out (each well shows a stack of up to five coins with offset rims and refills from below), a coin or bill that is too much just bounces, and the change owed is always reachable with the till's kinds (pennies or $1 bills are always present when change is owed, at every tier). A short payment always becomes exact (the customer tops it up after either choice). A child who struggles at a step moves back one step and gets full rounds of that content. A keyboard-only child who never uses the arrows records no evidence; after 3 finished rounds at step 1 or 2 with no counted customer, the step moves up by one, up to step 3; beyond that only evidence moves it. Struggling inside a round only brings the idle hint sooner; the content never changes mid-round.

## Mistake handling

There is no wrong state. A coin or bill that is too much hops back to its well with a soft giggle (three quiet `pop` A notes) and the customer smiles; no error sound, no red, no shake. A piece dropped on empty space slides back to its well with a `whoosh`. A not-right decision plays out as in the table above, with the customer laughing or nodding, never frowning. Coins and bills can never be lost: any piece not given as change always returns to the till. Repeated presses while a piece is still flying or pouring send nothing more; the pressed piece gives a small hop.

## Keyboard-only and mouse-only play

- **Mouse or trackpad only:** every action is a press, a drag or a click-click; any mouse button counts. The context menu is cancelled.
- **Keyboard only:** a bobbing arrow and a warm ring mark the highlighted target.
  - Decision: the highlight starts on the item. Left and Right (Up and Down the same) switch between the item and the purse. Any other key presses the highlighted one (at most one action every 150 ms).
  - Change: the highlight starts on the well or slot of the largest piece that fits the change still owed. Arrows move through every well or slot of the till, in reading order, including kinds that are too much; the highlight stays where the child put it. Any other key sends the highlighted piece to the paw (at most one every 150 ms, and none while a piece is flying or pouring: the highlighted piece hops instead). A piece that is too much hops back, and the highlight then moves to the largest piece that fits, so a child who only presses one key still finishes every customer.
  - There is only one drop target in each phase (the paw in change counting; no carrying in a decision), so keys never need to aim a carried piece. A piece the mouse picked up and a key then sends counts as a key action: never a motor attempt, and the customer records evidence only under the arrow-and-0.4-s rule.
  - During play every key plays, Escape, Tab and Enter included. After the round, Escape goes home and Tab reaches the corner Home and sound buttons; choice and rest follow the shared rule (first key shows focus, arrows move, the next key chooses).

## Layout

The background `harbour-stall.webp` cover-fits the window. In windows taller than they are wide it is drawn at 1.3 times the cover size, anchored at its bottom edge and centred, so the counter fills more of the screen (scale 0.61 at 390x600, still below 1.0). Its counter's back edge is background row 767 of 1280 (measured), called `Yc` on screen; the stall posts sit at 0.015 to 0.05 and 0.95 to 0.985 of its width. Background scale and `Yc` are computed from the loaded image when the scaled background is made (pitfall 2026-10-04: a background that finishes loading after the first layout).

Sprite measurements (fractions of each file, measured from its pixels): `board.webp` panel 0.11 to 0.89 of the width, 0.18 to 0.89 of the height; `tag.webp` writing area 0.06 to 0.94 wide, 0.32 to 0.94 tall (below the hole); `dish.webp` floor 0.10 to 0.90 wide, 0.15 to 0.75 tall; `till-well.webp` hollow 0.16 to 0.84 (round); `till-slot.webp` floor 0.06 to 0.94 wide, 0.12 to 0.88 tall; `till-tray.webp` rim 0.08 of its height on every side; bills' plain area for the numeral 0.06 to 0.46 of the width, 0.12 to 0.88 of the height (the animal starts at 0.48 to 0.57).

- **Corner buttons:** the shared Home and sound buttons as in Ride Fare (radius 60u, at least 48 px, 12 px from the edges).
- **Board** (upper left, hangs in front of the harbour): 320u wide (337u tall), left edge 24u, top 8u below the corner buttons' lower edge (140 at 1366x768). Its panel holds the counter numeral in its top 0.2 (digits 0.16 of the panel's height) and the cups below in rows of ten split 5 and 5 (a gap of 0.6 of a cup pitch between the fives; one cup per cent, or one per dollar at $ steps). Cup pitch is the smaller of the panel width / 10.6 and the cup area's height / the number of rows; each cup is 0.9 of the pitch. At 1366x768: pitch 23.5 px (21 px cups) for up to 7 rows, 19 px (17 px cups) for 10 rows. Cups never draw under 12 px: where a customer's amount would make them smaller, the board grows for that customer (as Ride Fare's fare box grows at its step 6) until its panel holds them at 12 px (a 10-row panel at least 166 px tall, a board of 222 x 234 px), moving the item right of it where they would meet. Unlit price cups are pale sockets with a dark rim; payment cups light warm yellow; change cups (past the price) light orange-red, and turn cream as the counter passes them during change counting.
- **Customer:** 520u tall (all six sprites share one height), centred at 0.55 of the window width, with the counter's back edge cutting it at 0.68 of its height (one rectangle `clip()`). The heron is drawn mirrored so every waiting paw is on the right. Paw centre in the waiting pose (fraction of the sprite, after mirroring; approximate, round 2 measures from pixels): heron (0.88, 0.52), otter (0.90, 0.44), pelican (0.88, 0.58), puffin (0.88, 0.52), seal (0.88, 0.52), bear (0.90, 0.53). The paw zone (tier table) is centred there.
- **Item and tag:** the item 170u wide, its left edge 355u left of the customer's centre, resting 30u below `Yc` (it stands on the counter's back strip, in front of the customer's lower body). The tag 150u wide hangs over the item's lower right (offset 70u right, 60u down from the item's top left). Tag numeral digits are 0.36 of the tag's height (40 px at 1366x768). At step 9 the second item stands 180u further left and its tag slides onto the first one.
- **Purse:** 140u wide (160u at tier 0, 120u at tier 2), centred 330u right of the customer's centre, resting 30u below `Yc`.
- **Dish** (bottom left): 440u wide, left edge 24u, bottom 12u above the window's bottom. The payment lies on its floor, largest pieces first from the left (so the child can count from the largest coin): coins of one kind as a fan (each coin 0.4 of a diameter right of the last), up to two rows of fans; bills fanned. Pieces in the dish are drawn at 0.8 of their tier size.
- **Till** (bottom right): the tray's right edge 24u from the window's right edge, its bottom 12u above the window's bottom. Coin till: one round well per kind the tier offers, each well the tier's quarter diameter plus 28u across, 12u apart, the tray padded 24u around them. Bill till: one slot per kind, each 1.12 times the bill width and 1.85:1, 12u apart, 24u padding. The tray is baked from `till-tray.webp` as nine parts: corners at one scale, edges and floor repeated along the grain in mirrored copies, so nothing draws above 1.0 of its pixels. Each well shows the stack of its coins (or the top bill of its slot) centred on it; a well or slot is the press target, at least 96 CSS px on both sides.
- **Fit:** where the till and dish do not fit side by side with a 12u gap, first the dish narrows (down to 2.2 times the payment's widest piece at its 0.8 size), then the till's wells and slots close their 12u gaps to 4u, then the till goes to two rows (wells or slots in a 2 x 2 or 2 x 1 grid), rising over the counter's back edge; the item, tag and purse then move up to stay 8u above the till, and the customer, item, tag, purse and board shrink together in 5 percent steps (down to 0.6) until the paw zone, item zone and purse zone are clear of each other, of the till and of the corner buttons. Coins, bills and their wells never shrink below their floors.

At the four checked sizes (tier 1 unless named):

- **1366x768 (u = 1):** `Yc` 475. Board 320 x 337 at (24, 140). Customer 520 tall, top at 121, centre x 751. Item 170 x 147 at (396, 358), tag 150 x 111 at (466, 418). Purse 140 x 145, centre x 1081. Dish 440 x 240 at (24, 516). Coin till with four wells: 4 x 174 + 36 + 48 = 780 x 222 at (562, 534). Bill till with three slots ($1, $5, $10; bills 220 x 110): 810 x 181 at (532, 575). Coins tier 1: dime 108, penny 115, nickel 128, quarter 146. Mock-up: `.tmp/art/mock-1366.png` in round 1.
- **1920x1080 (u = 1.405):** the same layout scaled; background scale exactly 1.0, `Yc` 667. Tier 0 is the largest drawing of every sprite (asset table).
- **800x600 (u = 0.586):** background scale 0.469, `Yc` 359. Coins at their floors (dime 96, penny 102, nickel 114, quarter 130), bills 192 x 96. Board 188 x 198 below the Home button (cups 21 px for up to 2 rows); for 10-row amounts it grows to 222 x 234 so the cups stay at 12 px. Customer 305 tall. Dish 258 wide; the coin till with four wells (146 px each) does not fit beside it, so it goes 2 x 2 (316 x 316) at the right, rising about 75 px over the counter's back edge, with the purse moved up above it and the customer at 0.85.
- **390x600 (portrait, u = 0.45):** background at 1.3 times cover size, anchored at the bottom: `Yc` 287. Board 144 x 152 at the left below the Home button, growing to 222 x 234 for 10-row amounts (over the counter's back strip; the item then stands right of it). Customer 140 tall (0.6 of 234) at the right, peeking in. Item and purse stand on the counter's back strip. Dish across the left half above the till (180 wide, coins at 0.8 of their floors), till 2 x 2 below at the bottom right; the dish and till may overlap the lower edge of each other's padding but never each other's pieces.

## How code draws amounts, cups and numerals

- Numerals, $ and ¢ come from the bundled Andika font (`src/app/font.ts`, loaded before any bake), baked once per size into glyph strips on CPU canvases: "0123456789$¢" in deep ink (`#1d3461`) for tags, bills and the board's counter, and in orange-red for the counter while change is counting. A numeral is drawn by copying glyphs from its strip at whole pixels. The $ is drawn at 0.72 of the digit size and raised 0.12 of the em, before the number ($13); the ¢ follows the number at full size (26¢).
- **Bill numerals:** every bill shows "$1", "$5", "$10" or "$20" in the plain area left of the animal (0.06 to 0.46 of the bill's width), centred at 0.27 of its width and 0.5 of its height, digits 0.34 of the bill's height (41 px on a 240 x 120 bill, 37 px at tier 1, 33 px at the 96 px floor), so "$20" fits the plain area and every denomination's digits are the same size. The same numeral is drawn on bills in the dish (at their 0.8 size), in the till and in the paw.
- **Tags** show the price ("26¢" or "$7"); at step 9 the merged tag shows the total. **The board** shows the counter: the price while a decision is open, then the climbing count during change counting. There is no running total of the payment in numerals: the payment is shown as cups.
- Cups are baked once per size (unlit, yellow, orange-red, cream) on CPU canvases; the dot ring a bouncing coin shows uses one baked dot.
- Nothing counted or exact is in any image: every numeral, $, ¢, cup and dot is drawn in code, and the bills' numerals are drawn in code on blank art.

## Sound

Effects come from `src/audio/sfx.ts`; this game passes a variant on each call. No new sounds.

| Moment | Effect |
| --- | --- |
| Pick up a coin or bill | `pop` B, quiet |
| Payment piece lands in the dish | `pop` D |
| Each cup lights (payment pour) and each counter step (change) | `tick` C, pitch index = the count within its ten |
| Hand the item over | `go` C |
| Ask for more (purse hop) | `pop` C |
| Change complete, cups pulse | `pop-big` C |
| Piece too much, giggle | three `pop` A notes 90 ms apart, quiet |
| Piece dropped on nothing returns | `whoosh` D |
| Customer walks in / out | `whoosh` B / `whoosh` A |
| Tags merge (step 9) | `pop-big` B |
| Round end, stars, sticker, Again, Home | `fanfare` D, `star` B, `sticker` C, `whoosh` A, `button` B |

The fanfare is prepared ahead with `prepareSfxStep` as in Ride Fare and Bubble Bay.

Music: track name `market-stall` (`public/music/market-stall.mp3`, composed by the owner; silence until it exists), added to `MusicTrack` and `MUSIC_TRACKS` in `src/audio/music.ts`; `startMusic` on entry, `stopMusic` on exit.

## Voice clip slots

Optional clips live in `public/voice/market-stall/` (a README there names them): `penny`, `nickel`, `dime`, `quarter` when a coin of that kind is picked up; `one-dollar`, `five-dollars`, `ten-dollars`, `twenty-dollars` when a bill is picked up; `number-1` to `number-20`, `number-25`, `number-30` to `number-90` by tens, `number-75` and `number-100` when a price appears and when the counter finishes the change. The game lists the files present at build time with `import.meta.glob`, so a missing clip is skipped with no request. None ship.

## Performance

No allocation in update or render: coins and bills in flight (24), paw-pile pieces (16) and particles (160) are pooled. Every sprite is drawn at a fixed size per layout and animated with transforms, so one layout keeps one cached scaled canvas per sprite size; the cache is released when the canvas size, pixel ratio, tier or fit changes, and on exit. Cups, the dot, the hint halo, the glyph strips and the baked till tray are made on CPU canvases (`willReadFrequently: true`, pitfalls 2026-10-03) when their size changes, never per frame. The background is rescaled only when the canvas size or pixel ratio changes; at 765 KB it is decoded ahead by `src/engine/sprites.ts`'s idle decode for images of 1 M pixels or more. No gradients, `shadowBlur` or `fillText` per frame. The customer is clipped with one rectangle `clip()` per frame. The celebration, choice and rest art is scaled ahead in idle periods during play, one sprite per idle period, with the same idle rule as Ride Fare (run a step with 4 ms to spare, or after a timeout or 500 ms of waiting). Target at 1366x768: scene `workMean` under 0.3 ms and `workMax` under 3 ms after the first 3 s, as Ride Fare measured; round 2 measures it.

## Currency illustrations

The legal finding is in `docs/research/08-money-grades-1-2.md` section 5 (not legal advice; a reading of public statutes, regulations and agency pages):

- 18 U.S.C. 504 permits illustrations of US currency only in black and white and at under 75 percent or over 150 percent of the real note's size in each dimension, with the plates destroyed after final use; 31 CFR 411.1 allows colour illustrations under the same size rule if they are one-sided and every file used to make them is destroyed after final use. 18 U.S.C. 474 makes an impression "in the likeness of" a note, "or any part thereof", a crime outside those exceptions. A published web game cannot meet the destruction condition (its image files stay on the server and in every browser cache), so it cannot rely on the illustration exceptions at all.
- An original, stylized toy bill with no element of a real note is not an illustration or likeness of any genuine note, in 08's reading. Inside the limits below, 08 found no meaningful risk, so the owner's stop condition was not triggered.

Design limits this game follows (08 section 5, points 1 to 9, plus the owner's 2026-10-05 note that each bill must clearly read as 1, 5, 10 or 20):

1. Original art only: the bill sprites were generated from text prompts with the game's concept image (and, for $5, $10 and $20, the game's own processed $1 bill) as the only image inputs. No real note, scan or photo of one was given to the image model.
2. No real-note elements: no portrait of a person (an animal silhouette instead: gull $1, fish $5, crab $10, whale $20), no seals, serial numbers, signatures, lettering, lathe-work or guilloche borders, security-thread or watermark look, buildings, corner circles or inner frame.
3. Not a real note's colours: every bill is the same butter-cream paper with a deep-blue outline and an orange-red animal, one toy palette; colour never stands for value.
4. Non-genuine proportions: exactly 2:1 (a real note is about 2.35:1), with big rounded corners and a thick soft outline.
5. Size: every drawn bill is at most 240 x 120 CSS px at 1366x768 (cap 280 x 140), about 61 x 30 mm on the children's 15.6-inch laptop, well under 75 percent of a real note (156 x 66.3 mm); short side never under 96 CSS px.
6. One side only: bills never flip and have no back.
7. Visibly a toy: flat linocut colour, a big code-drawn numeral with $, a friendly animal.
8. No bill-shaped advertising (18 U.S.C. 475).
9. Recorded here and in the asset table (each bill marked original art).

Coins are stylized linocut coins with a simple head and a simple tails design, copper penny and silver others, smooth edges on penny and nickel and reeded edges on dime and quarter, and no inscriptions, lettering, numbers or dates (08 section 5, "Coins").

**Decimal point (open decision for the owner).** No amount in this game uses a decimal point: ¢ amounts are whole cents ("26¢"), $ amounts are whole dollars ("$7"), and the only place both meet is the $1 bill pouring 100¢ (no "$1.00" is written). This follows Common Core, Florida, New York and North Carolina; Texas and Virginia teach "$0.45" in grade 2. The owner did not object to leaving decimals out; it stays open, and if the owner wants it, it would be an extra top step in Coin Vault rather than here (08 section 6, "Open questions").

## Art

Medium: hand-carved linocut block print in four inks (deep blue, warm orange-red, mustard yellow, warm cream paper), bold carved gouge marks, slightly imperfect ink coverage and paper grain, flat shapes, matching the concept. Shared controls (Home, sound, play arrow) reuse the existing art. Everything counted or exact is drawn in code (see above). No image contains text, letters, numerals or a group of things to count.

All bitmaps were generated on 2026-10-05 with the built-in `image_gen` tool in Codex CLI 0.159.0 (`codex exec -m gpt-6-astra -c model_reasoning_effort=medium -c model_provider=openai`). The tool did not report the image model. Every request attached the selected concept (`ms2.png`, 1672x941) as its first reference and shared one style block (the linocut description above, with no text, letters, numbers, dollar or cent signs, logos, inscriptions or interface). Second references: the earlier $1 bill for the other bills, the till tray for the bill slot, the first board for the final board, the heron customer for the heron sticker and the tile. Sprite requests asked for a transparent background; every result came back with a clean alpha channel.

Processing (`sharp`, scripts kept with the sources): regions of alpha above 128 were found and isolated, alpha under 16 cleared and over 235 made solid, colours at soft edges replaced by nearby solid colours (no dark or light fringe), specks under 300 px removed, cropped to the alpha bounds with 4 px padding, resized with Lanczos 3 and written as WebP quality 80, alpha quality 50. The two poses of each customer share one scale (waiting pose 760 px tall); both are anchored at the feet. Coins: each face's bounding box, inset 2 px, resized to 384x384 (at most 1.6 percent from round) and given an exact anti-aliased round alpha edge. Bills: made exactly 2:1 by resampling only the plain cream run between the left corners and the animal (uniform along the width, so the outline, corners and animal keep their shape), then 512x256. The bill slot was made 1.85:1 the same way along its height, between its top and bottom rims. Each file was checked on mid-grey and dark grounds (contact sheet with the sources) and at 1:1 for halos.

`harbour-stall.webp` follows the three-strip method (PR #13, as Ride Fare): the 1536x1024 base was cut into three overlapping 683x1024 portrait strips, each enlarged to 1024x1536 (Lanczos 3) and redrawn in its own request with the concept attached; the stitch script registered each strip to the base enlarged 1.5 times (alignment error 11.8 to 14.2), replaced each strip's broad colour (Gaussian sigma 32 px) with the base's, joined neighbours along the vertical path of least difference (6 px feather), and resized the 2304x1536 mosaic to 1920x1280 (Lanczos 3); WebP quality 80, opaque. No visible join at 1:1. It shows the striped awning edge, the two stall posts, the harbour (sky, gulls, sea, two boats, pilings, a jetty, the lighthouse and houses) and the empty plank counter with a small loaf basket and a wheat jug at its far ends: no customer, coins, bills, dish, till, tag, board or goods.

### Asset table

"Largest drawn" is the biggest size any screen draws the file in a 1920x1080 window at device pixel ratio 1 (u = 1.405, tier 0 unless named), including animation scale; every one is at most the file's own size. Prompts and logs are in the sources folder's `prompts/` (file name = prompt name).

| File in `public/art/market-stall/` | Pixels | Largest drawn at 1920x1080 | Source and processing |
| --- | --- | --- | --- |
| `harbour-stall.webp` | 1920x1280 | 1920x1280 cover-fit (scale 1.0) | `bg` base, then `bg-s0-1`, `bg-s1-1`, `bg-s2-1`; three-strip stitch, opaque, 765 KB |
| `coin-penny-heads.webp`, `coin-penny-tails.webp` | 384x384 | 257 (quarter at tier 0 is the largest coin: 229, picked up 1.12x; scale 0.67) | `coin-penny`; bounding box to square, round mask |
| `coin-nickel-heads.webp`, `coin-nickel-tails.webp` | 384x384 | 257 | `coin-nickel`; as above |
| `coin-dime-heads.webp`, `coin-dime-tails.webp` | 384x384 | 257 | `coin-dime`; as above |
| `coin-quarter-heads.webp`, `coin-quarter-tails.webp` | 384x384 | 257 (scale 0.67) | `coin-quarter`; as above |
| `bill-1.webp` | 512x256 | 378 x 189 (240u at tier 0, picked up 1.12x; scale 0.74) | Original art, no real note used as input. `bill-1s` (third attempt: the first two were 2.2 to 2.3:1 with the gull too large); plain run resampled to exactly 2:1 |
| `bill-5.webp` | 512x256 | 378 x 189 | Original art, no real note used as input. `bill-5s` (third attempt), with an earlier processed $1 bill as template; 2:1 as above |
| `bill-10.webp` | 512x256 | 378 x 189 | Original art, no real note used as input. `bill-10s` (third attempt), template as above; 2:1 as above |
| `bill-20.webp` | 512x256 | 378 x 189 | Original art, no real note used as input. `bill-20s` (third attempt), template as above; 2:1 as above |
| `heron-wait.webp`, `heron-happy.webp` | 400x760, 432x758 | 731 tall (520u), 753 in its 1.03 happy hop (scale 0.99) | `cust-heron`; shared scale 0.765; drawn mirrored |
| `otter-wait.webp`, `otter-happy.webp` | 492x760, 449x758 | as above | `cust-otter`; scale 0.758 |
| `pelican-wait.webp`, `pelican-happy.webp` | 578x760, 620x753 | as above | `cust-pelican`; scale 0.811 |
| `puffin-wait.webp`, `puffin-happy.webp` | 618x760, 610x753 | as above | `cust-puffin`; scale 0.860 |
| `seal-wait.webp`, `seal-happy.webp` | 508x760, 549x759 | as above | `cust-seal`; scale 0.805 |
| `bear-wait.webp`, `bear-happy.webp` | 583x760, 558x758 | as above | `cust-bear`; scale 0.788 |
| `goods-loaf-round.webp`, `goods-loaf-long.webp`, `goods-loaf-braid.webp`, `goods-pretzel.webp` | 320x277, 302x320, 320x288, 320x286 | 239 wide (170u; scale 0.75), 263 in the 1.1 hand-over lift | `goods-a` sheet of four; scale 0.64 to 0.66 |
| `goods-fish-biscuit.webp`, `goods-pie.webp`, `goods-honey.webp`, `goods-cake.webp` | 320x243, 320x254, 308x320, 320x313 | as above | `goods-b` sheet of four; scale 0.68 to 0.76 |
| `tag.webp` | 320x236 | 211 wide (150u), 232 in its 1.1 swing (scale 0.73) | `tag`; scale 0.242 |
| `purse-closed.webp`, `purse-open.webp` | 277x288, 314x251 | 225 wide (160u at tier 0; scale 0.81), 1.1 in its hop: 0.89 | `purse` sheet of two states; shared scale 0.480 |
| `board.webp` | 531x560 | 450 wide (320u; scale 0.85) | `board3` (third attempt: the first was too tall and narrow, the second too short for ten rows of cups); scale 0.585 |
| `dish.webp` | 640x349 | 618 wide (440u; scale 0.97) | `dish`; scale 0.433 |
| `till-tray.webp` | 1428x586 | baked: four tier-0 wells make a 1191 x 336 tray; corners at 336/586 = 0.57, edges and floor repeated along the grain at most 1.0 | `till-tray`; kept at raw size |
| `till-well.webp` | 320x318 | 268 (quarter 163u + 28u at tier 0; scale 0.84) | `till-parts` (left object); scale 0.620 |
| `till-slot.webp` | 420x227 | 378 wide (1.12 x the 240u tier-0 bill; scale 0.90) | `slot` (second attempt: the first, in `till-parts`, was 2.4:1), with the till tray as reference; middle band stretched to 1.85:1 |
| `helper-hand.webp` | 239x256 | 211 tall (150u; scale 0.82) | `hand`; scale 0.270 |
| `tile.webp` | 512x512 | hub tile, drawn like every other game's 512 px icon | `tile2` (second attempt: the first heron was white, unlike the customer), with the heron customer as reference |
| `sticker-heron.webp` | 309x512 | sticker offer and book sizes of the shared helper, as every game's 512 px stickers | `sticker-heron2` (second attempt, heron customer as reference): the heron in its sun hat hugging a round loaf |
| `sticker-lighthouse.webp` | 380x512 | as above | `sticker-lighthouse`: a striped lighthouse on a rock with a wave |
| `sticker-boat.webp` | 510x512 | as above | `sticker-boat`: a fishing boat with a mustard sail on a wave |
| `sticker-gull.webp` | 355x512 | as above | `sticker-gull`: a smiling gull on a post top |
| `sticker-otter.webp` | 487x512 | as above | `sticker-otter`: the otter in its knitted cap floating on its back, hugging a starfish |
| `sticker-pretzel.webp` | 512x443 | as above | `sticker-pretzel`: a pretzel with a happy face |

Total 49 files, 2.93 MB (the background is 765 KB of that). Generated but not shipped: a goat customer (its waiting paw did not read as held out), a woven change mat (the paw is the change target), the first two boards, the first three sets of bills and the first slot.

Raw images, prompts, Codex logs, strips, the stitch output and all scripts are kept outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/market-stall/art-sources/`; the Codex originals are also under `C:/Users/Home/.codex/generated_images/`.

## Files (planned for round 2)

- `src/games/market-stall/`: `index.ts` (definition and save validator), `scene.ts`, `rules.ts` (tiers, steps, customers, payments, till contents, progression), `data.ts` (save bag: tier, step, evidence window, demonstrations seen (`demos`), pending round, and its validator), `voice.ts`.
- `dev/market-stall.html`, `src/dev/market-stall.ts`: isolated dev page with `?debug&tier=0..2&step=1..9&rounds=N&seed=N` and a read-only `window.__marketStall` stats object, as Ride Fare's.
- `public/voice/market-stall/README.md`: the clip slots above.
- Shared edits: one registry entry, six stickers appended to `STICKERS` (ids `market-stall-heron`, `-lighthouse`, `-boat`, `-gull`, `-otter`, `-pretzel`), one music track name.
