# Letter Train

A round game in Little Train Town, a world of painted wooden toys. A wooden train pulls in with a block slot in every car; letter blocks wait on the platform below. The child moves each block onto the car that shows the same letter. When every car is full, the train toots, rolls out and drops a star into the row at the top. Three trains make a round.

Game id `letter-train`, `mode: 'round'`, `learning: ['letters']`.

## The action and its response

- Press on a block: it lifts off the platform with a short wooden knock pitched to its letter (the name-entry note for that letter) and follows the pointer.
- Release it over a car (drag), or click a block and then click a car (click, click): the block flies to that car.
- Right car: the block clicks into the slot with a wooden knock, squashes and settles. The car's animal passenger hops and cheers; each cheer climbs one note higher along the train. Wood-coloured sparkles burst from the slot. If the car showed a different case (`a` for `A`), its letter moves onto a small plate on the car's side, so the pair stays visible.
- Other car: the block slides back to its place on the platform along a soft arc, with the soft "miss" sound. The car where it belongs wiggles, so the child sees where it goes. Nothing is marked wrong.
- Released anywhere else: it slides back to the platform.
- Last car filled: the train toots (smoke puffs, a deep "go", 0.5 s), rolls out to the right (1.1 s), and a wooden star flies from the engine into the next empty socket at the top. The next train pulls in from the left (1.6 s) while its blocks pop up onto the platform. Blocks respond the moment they appear, so the child can carry a block onto a car that is still rolling in. From the last block clicking in to the next block responding takes about 1.8 s.
- A tap while nothing can be moved (the train tooting or leaving, or before the blocks pop up) throws a small burst of gold wood chips where the finger landed; a key at that moment puffs smoke from the chimney (or throws the chips on the platform when the engine is off screen).

## Discovery without words

The first train of the first round runs a demonstration once the train stops, unless the child has already started on their own while it pulled in. A carved wooden helper hand with a striped cuff glides in, presses the first block, carries it to its car and drops it in; the car's passenger cheers. Then the hand leaves and the child carries on with the remaining blocks.

Idle help: after 6 seconds without a placement, the hand comes back and shows the next move with a see-through copy of a block gliding to its car, and the target car wiggles. It repeats every 8 seconds of idleness and stops the moment the child touches anything. The hand never places a block after the first demonstration.

## Learning progression (separate from motor tiers)

Five stages, saved per profile:

| Stage | Blocks | Cars show |
|---|---|---|
| 0 Same capitals | `A` | `A` |
| 1 Same small letters | `a` | `a` |
| 2 Capital to small | `A` | `a` |
| 3 My name | the child's name, one letter per car, filled left to right | the name |
| 4 Three-letter words | the word's letters, filled left to right | the word, with a picture riding above the engine |

- Stages 0 to 2 pick distinct letters for each train and never put look-alikes on the same train (b d p q, m w, n u, i l, M W). Within a round no letter rides twice while the stage's letters allow it: each train first picks from letters no earlier train of the round used, and only a pool too small for the train lets used letters back in. The capital-to-small trains that fill stage 3 also leave out the letters of the name.
- Stage 2 (and the capital-to-small trains that fill stage 3) leaves out the ten letters whose capital and small forms have the same shape (C K O P S U V W X Z), so every pair asks the child to connect two different shapes.
- Stage 3 uses the active profile's name, followed by capital-to-small trains to make three. A name longer than fits on one train (5 letters at 1366 px wide) continues on the next train. A profile without a name skips this stage.
- Stage 4 words: cat, dog, hen, bus, hat, cup, pig, fox, never repeating the last four words used. The picture is generated art and contains no letters; it rides on a wooden sign above the engine. No word puts two look-alikes on one train (`hen` replaced `sun`, whose n and u are look-alikes, in round G4). From stage 4 on, the last train (or trains) of every round spells the child's name when there is one; words fill the rest of the three trains.
- In stages 3 and 4 only the next car to fill is open; it glows. Other cars wait.

Learning evidence: an attempt is a block the child puts on an open car with the mouse or trackpad, by dragging it there or by clicking the block and then the car. The right car is a hit, another open car a miss. Only these pointer attempts ask the child to match a block to a car, so only they count, hits and misses alike. Nothing done on the keyboard counts: a typed letter only asks the child to find a key, and at stage 2 typing `x` would place the `X` block without the child ever pairing `X` with `x`; any other key places the highlighted pair, which is always right. Keyboard play therefore neither raises nor lowers the stage. The demonstration and drops onto a car that is not yet open are not attempts either.

Change rule, applied between rounds only: the last 12 attempts of the current stage are kept. At least 10 attempts with 85 percent or more hits moves up one stage; at least 8 attempts with 50 percent or fewer hits moves down one stage. The window clears on every change.

## Motor tiers (separate from learning)

Three hidden tiers, changed only between rounds:

| Tier | Block size at 1366x768 | Cars (stages 0 to 2) | Drop help |
|---|---|---|---|
| 0 | 150 px | 2 | a held block is pulled toward an open car within 1.3 block widths; release anywhere in that zone places it |
| 1 | 132 px | 3 | pull within 1.0 block widths |
| 2 | 116 px | 4 | pull within 0.7 block widths |

Every tier also allows click, click. Blocks never go below 96 px; on small screens the number of cars drops to what fits. Name and word trains take as many cars as their letters need (up to what fits) and shrink blocks toward 96 px to fit. When even one car and the engine do not fit (phone-width screens), the cars stay in view and the engine runs off the right edge; the word picture then rides further back along the train, so it stays in view. When the row of cars itself would not fit at the block size (a three-letter word at 390 px wide), the cars, their slots and the engine shrink until the row fits; the platform blocks keep at least 96 px, and each car's drop zone stays the tier's pull radius around its slot (at least 0.7 block widths, so at least 134 px across).

Motor attempt: a pointer drag released above the platform. A hit when it lands in some car's drop zone, whatever the letter; a miss otherwise. Click, click placements count as hits. Promotion needs two rounds in a row with at least 8 motor attempts and 90 percent hits; one round with at least 4 attempts and under 70 percent drops one tier. The demonstration and keyboard play never count.

## Keyboard-only play

- The keyboard target is a highlighted block on the platform (gold ring) and a highlighted car (gold arrow above it). By default the pair always matches: the first open car and the block that belongs on it. So the first press of any key on every train places a block correctly, and pressing one key over and over finishes every train with no miss.
- The highlights appear after the first key press and stay while the child uses the keyboard. The key that shows them starts from the default pair (a block picked with the pointer and its car, or else the first open car and its block), never from a pair left over from earlier arrow presses, so it places only a block that belongs where it goes. A first arrow only shows the highlights. Any mouse or trackpad press hides them again, so a mouse player never sees an arrow over a car that the block they picked does not belong to. Picking a block with the pointer also moves the keyboard pair to that block and its car.
- Typing a letter places the platform block with that letter onto its car. A letter that is on no block places the highlighted pair, like any other key.
- Left and Right arrows move the block highlight; Up and Down move the car highlight between open cars. A pair the child chose with the arrows can miss; after a miss both highlights move to that block and the car where it belongs.
- Keys work while the train pulls in, as soon as the first block appears.
- During play Escape, Tab and Enter act like any other key: they place the highlighted pair and never leave the game. As in Bubble Bay, Escape goes home and Tab cycles focus through the corner Home and sound buttons (Enter presses the focused one) only after the round: on the celebration once its 1.5 second lock has passed, and on the choice and rest once their input guard has passed. The corner Home button works by pointer at any time.

## Round, reward and rest

1. Three trains. Each departing train earns one star, so every finished round earns three stars. Misses never take a star away.
2. Celebration: every passenger who rode this round jumps on the platform, confetti falls, the three stars slam into place one by one with the fanfare. It cannot be skipped during its first 1.5 seconds or before the third star lands; after that any click or key skips it. It ends by itself after 4 seconds.
3. Sticker choice, while this game's stickers remain uncollected and `rewardsEnabled` is true: two passengers, each riding a wagon. Input is ignored for 1.2 seconds. No wagon has focus until the first key, which only shows focus; arrows move it, and a later key chooses once the focus has shown for 0.25 seconds. Hover shows focus too. With one sticker left, it is the only choice.
4. Still rest: the chosen passenger in its wagon, the three stars, and Again and Home buttons of the same size and colour. Nothing moves. Input is ignored for 1.2 seconds, no button has focus until the first key (which only shows focus; a later key acts once it has shown for 0.25 seconds), and `services.roundBoundary()` runs when the rest state is reached. Leaving the rest by any route (Again, Home, Escape, the corner Home, the break nudge's Home) closes the finished round, so the next visit starts a new round.

Awards persist exactly once before they are shown: `finishRound` writes the round count, stars and a pending record (stars, offered stickers, chosen sticker, passengers) into the game bag and calls `save.flush()` before the celebration starts. Choosing writes the sticker and the chosen id together. Leaving during celebration or choice keeps the pending record, and the next visit resumes at the choice or the rest.

Pause and resume (break nudge) stop and restart the music; play state is untouched. When the choice or rest comes back on top, it starts over as when it first appeared: nothing focused and input ignored for 1.2 seconds. During play, resume ignores input for 0.35 seconds.

## Stickers

Six painted wooden passengers, also used in the cars: `letter-train-bunny`, `letter-train-duckling`, `letter-train-elephant`, `letter-train-hippo`, `letter-train-mouse`, `letter-train-lamb`.

## Sound mapping

Existing effects only, chosen per call with `variant` (the game never changes the app-wide variant table):

| Moment | Effect |
|---|---|
| Lift or select a block | `key`, index = letter position in the alphabet |
| Block clicks in | `button` B (wooden tok) |
| Passenger cheers | `star`, index = cars filled so far |
| Block slides back | `miss` D (soft) |
| Car wiggle hint | `hover` |
| Train moving | `tick` C, quiet, every 0.3 s |
| Toot | `go` B (deeper) |
| Train leaves | `whoosh` |
| Star lands in its socket | `star` |
| Celebration, stars, sticker | `fanfare`, `star`, `sticker` |
| Again, Home, corners | `whoosh`, `button` |

Music track `letter-train` (owner supplies `public/music/letter-train.mp3`; silence until then).

## Voice clip slot

`public/voice/letter-train/<letter>.ogg` or `.mp3` (`a` to `z`, lower case file names). When a block clicks in, the clip for its letter plays if one is listed; otherwise nothing happens. The owner lists the files in `VOICE_CLIPS` in `src/games/letter-train/clips.ts`, a hand-edited list. The game only requests listed clips, so a missing clip causes no request, and the clips ship once from `public/` with no hashed copy in the bundle (checked with a test clip: one `dist/voice/letter-train/a.ogg`, precached once, nothing under `dist/assets`). No clips ship.

## Art

Medium: painted wooden toys. Everything is a transparent WebP sprite except the opaque background. Letters, the slot outlines and the plates are drawn in code with the bundled Andika font and baked into canvases when a train arrives.

| File (under `public/art/letter-train/`) | Use |
|---|---|
| `town.webp` 1536x1024 | Background: toy town, track at 54.8 percent height, plank platform |
| `engine.webp` | Engine with a bear driver, side view |
| `icon.webp` 624x624 | Hub tile icon: the same engine from the front three-quarter view, square |
| `wagon-red/yellow/green/blue.webp` | Cars and the sticker-choice wagons |
| `passengers/*.webp` (6) 482x482 | Passengers and stickers; each animal (longest side 360 px) sits centred in a transparent square so it fits inside the sticker book's dashed circle; the game multiplies passenger draw sizes by 482/360 |
| `words/*.webp` (8) | Picture cues for cat, dog, hen, bus, hat, cup, pig, fox |
| `block-red/yellow/green/blue.webp` | Blank block faces; letters are baked on top |
| `star.webp` | Round stars |
| `hand.webp` 256x256 | Demonstration and hint hand: carved wooden hand with a red and yellow cuff, fingertip at the top-left corner |

Provenance: generated on 2026-10-03 through Codex CLI 0.159.0 (`codex exec`, agent model `gpt-6-astra`, reasoning medium) calling its `image_gen` tool. The tool does not report the image model. Every request attached the Little Train Town quarter of `D:/screenshots/CoreWiseLearn/concepts/four-worlds-v1.1.png` as the style reference. Six requests, each 1536x1024:

- Shared style text: painted wooden toys for preschoolers; chunky hand-carved shapes with visible wood grain; glossy paint in tomato red, sunflower yellow, sky blue, leaf green and cream with worn edges showing bare wood; chunky pegs; soft light from the upper left. Shared negatives: no text, letters, numbers, logos or watermarks; no extra objects; no frames; no shadows or glow outside the objects.
- Background: opaque; soft hazy sky and distant toy town in the top 45 percent; one straight horizontal toy track across the full width near 60 percent height; an empty plank platform below; no train, vehicles, animals, people or signs.
- Engine: one side-view toy steam engine facing right, bear cub driver in a blue cap leaning out of the cab, blue boiler, red cab, yellow bands, red wheels, transparent background.
- Wagons: four identical open-top box wagons in red, yellow, green and blue, plain side panels, empty, 2 by 2 grid, transparent.
- Passengers: six seated peg-toy animals (bunny, duckling, elephant, hippo, mouse, lamb) with both paws raised in a cheer and big smiles, 3 by 2 grid, transparent.
- Words: cat, dog, sun, bus, hat, cup, pig, bed as wooden toys, no writing anywhere, 4 by 2 grid, transparent. The bed picture was dropped in round G2 (b and d on one train).
- Blocks: four blank alphabet-block faces (red, yellow, green, blue frames, cream centre, no letters), a gold wooden star, a white glove hand pointing up and left, 3 by 2 grid, transparent. The glove was replaced in round G2.

Round G2, 2026-10-03, same tool chain (Codex CLI 0.159.0, `codex exec -m gpt-6-astra`, reasoning medium, `image_gen`), one 2 by 2 sheet. Style references: the Little Train Town crop, the round G1 engine sheet and the round G1 word sheet. Shared style text and negatives as above, plus "a white cartoon glove" in the negatives. Cells: the same engine and bear driver seen from the front three-quarter view, compact enough to fill a square, with a puff of smoke (hub icon); a chunky carved wooden hand painted warm peach, index finger pointing up and left, a red and yellow striped cuff, explicitly no white glove, stitch lines, seams or buttons (helper hand); a sitting orange wooden toy fox (word picture); a red-brown wooden toy hen (spare, kept outside the checkout as a possible replacement for `sun`, whose n and u are also look-alikes). The tool returned 1254x1254 and Codex resized it to 1536x1536 (bicubic). Processing as above; the icon was then centred on a 624 px transparent square (content about 82 percent of the side, like the other hub icons), and the six passengers were re-cut from the round G1 sheet and centred on 482 px squares. The G2 sheet, prompt and script are with the others in `D:/CoreWise/_artifacts/CoreWiseLearn/letter-train/`.

Round G4, 2026-10-03: the spare hen from the G2 sheet (prompt: "a plump red-brown wooden toy hen with a red comb, standing side-on, smiling, on no base"; processed with the fox by the same G2 script, 265x320 transparent WebP) became `words/hen.webp`, replacing `words/sun.webp`. No new image was generated.

Processing (`sharp`, script kept outside the build): each sheet is cut into its grid cells; alpha below 24 becomes 0 and alpha of 200 or more becomes 255; edge pixels take their colour from nearby opaque pixels so the generator's coloured glow cannot tint the rim; specks and slivers from neighbouring cells are dropped; each object is trimmed with 4 px padding, resized with Lanczos and written as WebP at quality 90, alpha quality 100. The background is WebP quality 82 at full size. Edges were checked on cream and on the dark outline colour. The raw sheets, the exact prompts, the style reference crop and the processing script are kept outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/letter-train/`.

## Performance plan

- Sprites draw through the sprite store's scaled cache. Wagon fronts are drawn from the same cached canvas with a source rectangle, so passengers and blocks sit inside the wagons without extra art.
- Block faces, slots and plates are baked once per train (letter glyph plus face) at the canvas's device pixel ratio and drawn with `drawImage` at their CSS size, so letters stay crisp at 100 and 150 percent scaling. When the pixel ratio changes (resize, browser zoom, the engine's automatic resolution step), the old canvases keep drawing while one is rebaked per update. No `fillText`, gradients or `shadowBlur` per frame.
- Sprite names are built once at module load; drawing never builds strings or closures.
- Everything the round end draws (celebration riders at their size, the sticker-choice and rest wagons and passengers, the rest buttons) is queued when the last train of a round starts and scaled one image per update while that train is played. A choice or rest restored on entry (after a reload or a return visit) queues the same riders and buttons and holds them back until each is scaled, one per update under the enter fade. Each scaled image is drawn once under the backdrop on the frame after it is made, so its upload is done before it shows.
- The round-end fanfare is rendered ahead once per session, as in Bubble Bay: its one long step (`prepareSfxStep`) runs when a round starts, while the screen is still, and the short note steps run in idle periods during play. The sticker flight from choice to rest draws the rest-size art under a canvas transform instead of scaling art to a new size every frame.
- Blocks, cars, star flights and the hand use fixed pools allocated at scene creation. Sparkles, smoke and confetti share one pooled particle system of 220.
- Layout and cache rebuilds happen on resize or train arrival. Art is decoded with `img.decode()` and scaled to its display sizes as soon as it loads, outside the frame loop; the background is not drawn until then. Block and slot canvases for a new train are baked one per update while it pulls in.

Measured on the development machine in headed Chrome at 1366x768 (production build, fresh page, mouse round at tier 0, per-frame scene work from the last placement to the rest screen): the first celebration frame took 1.2 to 3.1 ms across four runs, the first sticker-choice frame 0.1 to 0.2 ms, the first rest frame 0.5 to 0.9 ms; every other frame stayed under 1.2 ms (round G1: 8.2 to 10.2 ms at the celebration start and 7.2 ms at the choice). The children's laptop remains the final check.
