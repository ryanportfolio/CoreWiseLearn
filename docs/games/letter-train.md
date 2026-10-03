# Letter Train

A round game in Little Train Town, a world of painted wooden toys. A wooden train pulls in with a block slot in every car; letter blocks wait on the platform below. The child moves each block onto the car that shows the same letter. When every car is full, the train toots, rolls out and drops a star into the row at the top. Three trains make a round.

Game id `letter-train`, `mode: 'round'`, `learning: ['letters']`.

## The action and its response

- Press on a block: it lifts off the platform with a short wooden knock pitched to its letter (the name-entry note for that letter) and follows the pointer.
- Release it over a car (drag), or click a block and then click a car (click, click): the block flies to that car.
- Right car: the block clicks into the slot with a wooden knock, squashes and settles. The car's animal passenger hops and cheers; each cheer climbs one note higher along the train. Wood-coloured sparkles burst from the slot. If the car showed a different case (`a` for `A`), its letter moves onto a small plate on the car's side, so the pair stays visible.
- Other car: the block slides back to its place on the platform along a soft arc, with the soft "miss" sound. The car where it belongs wiggles, so the child sees where it goes. Nothing is marked wrong.
- Released anywhere else: it slides back to the platform.
- Last car filled: the train toots (smoke puffs, a deep "go"), rolls out to the right, and a wooden star flies from the engine into the next empty socket at the top. The next train pulls in from the left while its blocks pop up onto the platform.

## Discovery without words

The first train of the first round runs a demonstration. A white glove hand glides in, presses the first block, carries it to its car and drops it in; the car's passenger cheers. Then the hand leaves and the child carries on with the remaining blocks.

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

- Stages 0 to 2 pick distinct letters for each train and never put look-alikes on the same train (b d p q, m w, n u, i l, M W).
- Stage 3 uses the active profile's name, followed by capital-to-small trains to make three. A name longer than fits on one train (5 letters at 1366 px wide) continues on the next train. A profile without a name skips this stage.
- Stage 4 words: cat, dog, sun, bus, hat, cup, pig, bed, never repeating the last four words used. The picture is generated art and contains no letters; it rides on a wooden sign above the engine. From stage 4 on, the last train (or trains) of every round spells the child's name when there is one; words fill the rest of the three trains.
- In stages 3 and 4 only the next car to fill is open; it glows. Other cars wait.

Learning evidence: an attempt is a block released on an open car by pointer, or a letter typed on the keyboard that matches a block on the platform. A pointer attempt on the right car is a hit, on another open car a miss. A typed letter that matches a block counts as a hit (the child found the key with that letter); a typed letter with no block is not an attempt. The demonstration, keyboard placements with arrows or any other key, and drops onto a car that is not yet open are not attempts.

Change rule, applied between rounds only: the last 12 attempts of the current stage are kept. At least 10 attempts with 85 percent or more hits moves up one stage; at least 8 attempts with 50 percent or fewer hits moves down one stage. The window clears on every change.

## Motor tiers (separate from learning)

Three hidden tiers, changed only between rounds:

| Tier | Block size at 1366x768 | Cars (stages 0 to 2) | Drop help |
|---|---|---|---|
| 0 | 150 px | 2 | a held block is pulled toward an open car within 1.3 block widths; release anywhere in that zone places it |
| 1 | 132 px | 3 | pull within 1.0 block widths |
| 2 | 116 px | 4 | pull within 0.7 block widths |

Every tier also allows click, click. Blocks never go below 96 px; on small screens the number of cars drops to what fits. Name and word trains take as many cars as their letters need (up to what fits) and shrink blocks toward 96 px to fit. When even one car and the engine do not fit (phone-width screens), the cars stay in view and the engine runs off the right edge.

Motor attempt: a pointer drag released above the platform. A hit when it lands in some car's drop zone, whatever the letter; a miss otherwise. Click, click placements count as hits. Promotion needs two rounds in a row with at least 8 motor attempts and 90 percent hits; one round with at least 4 attempts and under 70 percent drops one tier. The demonstration and keyboard play never count.

## Keyboard-only play

- A highlighted block on the platform (gold ring) and a highlighted car (gold arrow above it) are always shown.
- Typing a letter places the platform block with that letter onto its car.
- Left and Right arrows move the block highlight; Up and Down move the car highlight between open cars.
- Any other key places the highlighted block into the highlighted car. After a miss, the car highlight moves to where that block belongs, so pressing any key repeatedly always finishes the train.
- Escape goes home. Tab cycles focus through Home and the sound button, as in Bubble Bay.

## Round, reward and rest

1. Three trains. Each departing train earns one star, so every finished round earns three stars. Misses never take a star away.
2. Celebration: every passenger who rode this round jumps on the platform, confetti falls, the three stars slam into place one by one with the fanfare. It cannot be skipped during its first 1.5 seconds or before the third star lands; after that any click or key skips it. It ends by itself after 4 seconds.
3. Sticker choice, while this game's stickers remain uncollected and `rewardsEnabled` is true: two passengers, each riding a wagon. Input is ignored for 1.2 seconds. No wagon has focus until the first key, which only shows focus; the next key chooses. Hover shows focus too. With one sticker left, it is the only choice.
4. Still rest: the chosen passenger in its wagon, the three stars, and Again and Home buttons of the same size and colour. Nothing moves. Input is ignored for 0.6 seconds, no button has focus until the first key, and `services.roundBoundary()` runs when the rest state is reached.

Awards persist exactly once before they are shown: `finishRound` writes the round count, stars and a pending record (stars, offered stickers, chosen sticker, passengers) into the game bag and calls `save.flush()` before the celebration starts. Choosing writes the sticker and the chosen id together. Leaving during celebration or choice keeps the pending record, and the next visit resumes at the choice or the rest.

Pause and resume (break nudge) stop and restart the music and re-arm the input guard; play state is untouched.

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

`public/voice/letter-train/<letter>.ogg` or `.mp3` (`a` to `z`, lower case file names). When a block clicks in, the clip for its letter plays if the file exists; otherwise nothing happens. The game finds clips at build time with `import.meta.glob`, so missing clips cause no requests. No clips ship.

## Art

Medium: painted wooden toys. Everything is a transparent WebP sprite except the opaque background. Letters, the slot outlines and the plates are drawn in code with the bundled Andika font and baked into canvases when a train arrives.

| File (under `public/art/letter-train/`) | Use |
|---|---|
| `town.webp` 1536x1024 | Background: toy town, track at 54.8 percent height, plank platform |
| `engine.webp` | Engine with a bear driver; also the hub tile icon |
| `wagon-red/yellow/green/blue.webp` | Cars and the sticker-choice wagons |
| `passengers/*.webp` (6) | Passengers and stickers |
| `words/*.webp` (8) | Picture cues for cat, dog, sun, bus, hat, cup, pig, bed |
| `block-red/yellow/green/blue.webp` | Blank block faces; letters are baked on top |
| `star.webp`, `hand.webp` | Round stars; demonstration hand |

Provenance: generated on 2026-10-03 through Codex CLI 0.159.0 (`codex exec`, agent model `gpt-6-astra`, reasoning medium) calling its `image_gen` tool. The tool does not report the image model. Every request attached the Little Train Town quarter of `D:/screenshots/CoreWiseLearn/concepts/four-worlds-v1.1.png` as the style reference. Six requests, each 1536x1024:

- Shared style text: painted wooden toys for preschoolers; chunky hand-carved shapes with visible wood grain; glossy paint in tomato red, sunflower yellow, sky blue, leaf green and cream with worn edges showing bare wood; chunky pegs; soft light from the upper left. Shared negatives: no text, letters, numbers, logos or watermarks; no extra objects; no frames; no shadows or glow outside the objects.
- Background: opaque; soft hazy sky and distant toy town in the top 45 percent; one straight horizontal toy track across the full width near 60 percent height; an empty plank platform below; no train, vehicles, animals, people or signs.
- Engine: one side-view toy steam engine facing right, bear cub driver in a blue cap leaning out of the cab, blue boiler, red cab, yellow bands, red wheels, transparent background.
- Wagons: four identical open-top box wagons in red, yellow, green and blue, plain side panels, empty, 2 by 2 grid, transparent.
- Passengers: six seated peg-toy animals (bunny, duckling, elephant, hippo, mouse, lamb) with both paws raised in a cheer and big smiles, 3 by 2 grid, transparent.
- Words: cat, dog, sun, bus, hat, cup, pig, bed as wooden toys, no writing anywhere, 4 by 2 grid, transparent.
- Blocks: four blank alphabet-block faces (red, yellow, green, blue frames, cream centre, no letters), a gold wooden star, a white glove hand pointing up and left, 3 by 2 grid, transparent.

Processing (`sharp`, script kept outside the build): each sheet is cut into its grid cells; alpha below 24 becomes 0 and alpha of 200 or more becomes 255; edge pixels take their colour from nearby opaque pixels so the generator's coloured glow cannot tint the rim; specks and slivers from neighbouring cells are dropped; each object is trimmed with 4 px padding, resized with Lanczos and written as WebP at quality 90, alpha quality 100. The background is WebP quality 82 at full size. Edges were checked on cream and on the dark outline colour. The raw sheets, the exact prompts, the style reference crop and the processing script are kept outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/letter-train/`.

## Performance plan

- Sprites draw through the sprite store's scaled cache. Wagon fronts are drawn from the same cached canvas with a source rectangle, so passengers and blocks sit inside the wagons without extra art.
- Block faces, slots and plates are baked once per train (letter glyph plus face) and drawn with `drawImage`. No `fillText`, gradients or `shadowBlur` per frame.
- Blocks, cars, star flights and the hand use fixed pools allocated at scene creation. Sparkles, smoke and confetti share one pooled particle system of 220.
- Layout and cache rebuilds happen on resize or train arrival. Art is decoded with `img.decode()` and scaled to its display sizes as soon as it loads, outside the frame loop; the background is not drawn until then. Block and slot canvases for a new train are baked one per update while it pulls in.

Measured on the development machine in headed Chrome at 1366x768 (dev page, tier 2, four cars, a full round): loop work mean 0.15 to 0.25 ms; the largest single frame was 5.6 ms, on the first drag of the round; every later frame stayed under 4 ms. The children's laptop remains the final check.
