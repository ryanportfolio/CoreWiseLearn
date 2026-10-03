# Shape Workshop

A creative game in the Rainbow Workshop world. The child fits paper shapes into the faint outline of a picture; the finished picture comes alive and goes onto the child's own gallery shelf. A free-build sheet lets the child stamp shapes anywhere in any colour. Game id `shape-workshop`, `mode: 'creative'`, `learning: ['shapes']`.

## The action and its response

- **Build a picture.** The workbench shows a sheet of cream paper with a picture (rocket, fish, house, cat, car, flower). Some parts of the picture are already glued down in colour; the open parts are faint dashed outlines. A small glued part that sits on an open part (the fish's eye and stripe on its body, the rocket's heart on its body, the house's door and windows on its wall) waits off the sheet and pops on together with the part under it. Loose paper shapes lie in a tray beside the sheet. The child drags a shape onto the matching outline, or clicks the shape and then clicks the outline.
- **Match.** The piece snaps in: it stretches and turns to fit the outline, lands with a small slam and dip, a ring of paper sparkles bursts out, and a woody pop plays with a paper rustle. Each landed piece in a picture plays one note higher on the pentatonic scale. The pieces left in the tray slide up to close the gap.
- **Where outlines overlap.** Some outlines sit on or inside others (the rocket's window on its body, the cat's ears on its head, the car's wheels on its body). A piece dropped inside an outline of its own shape always goes in, whatever other outlines lie under it; when several outlines of its shape hold the drop point, the innermost (smallest) one takes it.
- **Not a match.** Dropped only on an outline of another shape, the piece gives a quick side-to-side wiggle and floats back to its place in the tray with a soft, low sound. Dropped on empty paper, it simply floats back. Nothing scolds and nothing is lost.
- **Picture done.** A short pause, a wave of little jumps across the parts, a fanfare and paper confetti, then the picture comes alive for about three seconds: the rocket rumbles and launches off the top and lands back; the fish swims with a flicking tail and rising bubbles; the house opens its door, lights its windows and puffs smoke; the cat stretches long, yawns and swishes its tail; the car spins its wheels, drives off the right edge and comes back from the left; the flower spins its star petals, waves its leaves and smiles. Then the picture shrinks and flies into the gallery button, which bounces. The next picture's outline and pieces deal in. The save counts the finished picture and makes the next picture current the moment the last piece lands, so leaving at any point during the celebration comes back to the next picture.
- **Free build.** A clean paper sheet with a tray of seven shapes and seven colour swatches. Clicking the sheet stamps the chosen shape in the chosen colour with a slam, a slight random turn and size, and a pop pitched by shape. Holding the button down and moving stamps a trail. Clicking a swatch recolours the tray. On a portrait screen too narrow for seven swatches, one swatch cell steps to the next colour on each click.
- **Gallery.** Two paper shelves. The top shelf holds the six pictures: finished ones in colour, gently moving (the fish swims in its frame, the rocket hovers), unfinished ones as faint outlines. The bottom shelf holds six free-build sheets as small previews. Clicking any frame opens it: a picture to build (again), or a sheet to keep stamping.

## Discovery without words

- First visit: a paper helper hand slides in, picks up the first open piece, carries it to its outline and places it. That placement is real and counts as part of the picture. The hand slides away.
- First visit to free build: the hand taps a shape, then taps the sheet twice; two real stamps appear.
- Idle in build (9 s without a placement, then every 12 s): the hand taps a piece that has an open outline, then glides to that outline and taps it; both pulse. The child still makes the move.
- Finished pictures fly into the gallery button, so the child sees where the pictures go.

## Creative, not rounds

No stars, no score, no rounds, no forced finish. A half-built picture and every free-build sheet are saved when the child leaves (Home, the break nudge, closing the tab after the save), and come back exactly as they were. The finished pictures and the sheets are the collection; there are no stickers. Completing a picture is the natural break point, so `services.roundBoundary()` is called when the picture has landed in the gallery button, letting a due break nudge appear between pictures, never during one.

## Motor tiers (hidden, between pictures only)

| Tier | Open pieces per picture | Picture scale | Snap distance |
| --- | --- | --- | --- |
| 0 | 3 | 100 percent of the sheet | 1.5 times the spot radius, at least 90 px |
| 1 | 5 | 95 percent | 1.25 times, at least 75 px |
| 2 | up to 8 | 90 percent | 1.1 times, at least 64 px |

Every outline keeps a hit area of at least 96 CSS px on its shortest side, whatever its drawn size. A drop counts as inside a matching outline when it lands within the drawn outline plus a 12 px rim, or within 48 px of the outline's centre; that check comes first. A drop inside only an outline of another shape is the gentle miss. A drop on bare paper still snaps into the nearest matching outline within the snap distance. A placement attempt with the pointer counts for motor skill: landing inside or within the snap distance of a matching outline is a hit; letting go between one and 2.5 snap distances from the nearest matching outline is a motor miss; letting go far away is not an attempt. After each picture: three or more attempts with more than a third missed drops a tier; a picture with no motor misses and every piece placed by the pointer counts toward a rise, and two such pictures in a row raise the tier.

## Learning progression (separate from motor)

Shapes: circle, square, triangle, rectangle, star, heart, semicircle. The open parts of a picture are chosen with as many different shapes as possible, biggest first, rotating the choice each time a picture is rebuilt.

| Level | What changes |
| --- | --- |
| 0 | The tray holds exactly the open pieces. Only upright parts are open. |
| 1 | Two extra shapes that fit nowhere join the tray. |
| 2 | Turned parts (the fish tail, the rocket fins, the upside-down star sun, the cat's upside-down heart nose) can be open: the upright piece in the tray must be recognised in its turned outline, and it turns as it snaps in. |

Learning evidence comes only from pointer placements the child makes unaided: a piece placed in a matching outline without first trying a wrong outline is a hit; a drop or click on an outline of a different shape is a miss. Keyboard placements (which choose the matching outline for the child), the demonstration, and placements within 8 s of a hint for that shape record nothing. After each picture: three or more hits and no misses counts toward a level rise, and two such pictures raise the level; three or more misses outnumbering the hits lowers it. Per-shape hit and miss counts are kept in the save for later voice and progress work.

## Keyboard-only play

- Build: the first open piece in the tray has a thick dark-and-light ring from the start, and its matching outline pulses with a bright ring and a small arrow. Arrow keys move the ring around the tray grid. Any other key (letters, Space, Enter) flies the ringed piece into its outline. An extra shape that fits nowhere hops toward the sheet and comes back.
- Free build: a ring cursor sits in the middle of the sheet (faint until a key is used). Holding an arrow key moves it. Any other key stamps at the cursor, moves the cursor one step along a wandering path (the heading turns a little at random, is pulled gently toward the emptiest part of the sheet, and bounces off the sheet's edges) and moves the tray choice to the next shape (and every so often the next colour), so key mashing spreads a varied collage across the sheet.
- Gallery: the first frame is ringed; arrows move between frames; any other key opens the ringed frame.
- Everywhere: Tab moves the ring to Home, the mode buttons and the speaker in turn and back to play; Enter presses a ringed button; Escape goes Home. Any mouse button works as a click.

## Screen layout

Top row: Home at the top left; at the top right the speaker, and beside it the gallery button (paper shelf with frames) and, in build mode, the free-build button (paper brush with shapes). On screens too narrow for four buttons in a row, the two mode buttons drop to a second row in build mode; free build shows only three top buttons (no brush), which fit in one row. Build: paper sheet on the left, tray grid on the right (one to four columns so each cell stays at least 100 px); on portrait screens the tray sits under the sheet. Free build: sheet on the left, shapes in a grid on the right, the seven swatches in a row along the bottom; on portrait screens the sheet fills the width under the top row and the shapes plus one stepping swatch sit in a grid of 96 px cells along the bottom. Gallery: two shelves of six frames (three columns on portrait screens). Every target is at least 96 CSS px. Checked at 1366x768, 800x600 and 390x600; at 390x600 the free-build sheet is 368 x 276 px, the full width between the side margins, with the eight 96 px cells in two rows of four below it.

## Sound mapping

Effects come from `src/audio/sfx.ts`, picked per call with `{ variant }` so other games keep their own families. No patches were added or changed.

| Moment | Effect |
| --- | --- |
| Pick up a piece, select a shape | `button` B (wooden tok) |
| Select a colour | `key` D, pitched by colour |
| Hint hand taps, keyboard ring moves, Tab | `hover` |
| Paper rustle on lift and on landing | `whoosh` C (woody, short), quiet |
| Piece snaps in | `pop` C, index climbs with each piece |
| Wrong outline | `miss` D (soft and round) |
| Free-build stamp | `pop` C, index by shape |
| Picture done | `fanfare` A |
| Rocket launch, car drive | `whoosh` A |
| Cat stretch | `yawn` D |
| Other alive moments | fish bubbles `pop` D; house door `button` D and windows `star` A; flower `star` C and `tick`; car start `button` C; rocket and car landing `pop` B |
| Picture lands in the gallery button | `sticker` A |
| A new sheet slides in | `whoosh` D |
| A full free-build sheet is clicked | `tick` and a small sparkle |

Music track `workshop` (`public/music/workshop.mp3`, composed by the owner; silent until it exists).

## Voice clip slots

`src/games/shape-workshop/voice.ts` plays `public/voice/shape-workshop/<shape>.mp3` (circle, square, triangle, rectangle, star, heart, semicircle) when a piece of that shape lands, and when a shape is chosen in free build. On entry the game reads the hand-edited list `public/voice/shape-workshop/clips.json` (a JSON array of clip names) and only requests a clip whose name is in it, so adding a clip needs no code change and missing clips make no network request and no console error. No clips ship; the list is `[]`. See `public/voice/shape-workshop/README.md`.

## Save data

`save.gameData('shape-workshop')`, per profile, validated on entry (malformed fields are reset and the stored document is protected):

- `tier`, `motorStreak`, `level`, `learnStreak`: hidden difficulty.
- `demo`, `freeDemo`: whether each demonstration has played.
- `made`: times each picture was finished.
- `currentId`: the picture on the workbench. `wip`: per picture, its open part indices and the ones already placed, so switching pictures in the gallery keeps each half-built picture.
- `sheets`: six free-build sheets, each a flat list of stamps (shape, colour, x, y, size, turn), at most 160 stamps per sheet; `lastSheet`.
- `evidence`: per-shape learning hits and misses.

A finished picture is written with one `save.flush()` at the moment the last piece lands, before the celebration shows. A full sheet keeps every stamp; further stamps only sparkle.

## Art

Medium: layered cut paper. Shapes, outlines, the paper sheets, shelves and frames are drawn in code from point lists with a slightly torn white rim, a flat offset shadow layer and a generated paper grain multiplied inside the shape, all baked once into cached canvases on entry, resize or picture change. Generated bitmaps (see Provenance) supply the workshop background, the paper grain, the helper hand, the hub icon and the two mode-button icons.

## Performance plan

- The sheet with its glued parts and outlines is baked into one canvas on picture change, resize, and after each landing settles; a frame draws that canvas plus at most a few moving pieces.
- The blank sheet and the tray are rebaked only when their size changes. On a picture change the new parts and pieces are baked within a 3 ms budget per frame before the sheet slides in, so the change costs no frame over about 6 ms of work on the development machine.
- Each piece is a cached canvas per (shape, colour, size); free-build stamps use one cached canvas per shape and colour (warmed one per frame after entry) and are baked into the sheet layer once their slam finishes.
- Gallery thumbnails are painted without extra canvases, one per frame and only when their picture or sheet changed, so opening the shelf with six full sheets costs at most about 8 ms in one frame on the development machine.
- Sparkles, paper confetti and puffs live in fixed pools; no arrays, closures, strings, gradients, `shadowBlur` or `fillText` in update or render.
- Work time is measured with `window.__corewise.loop.stats.workMean` and `workMax` at 1366x768. Entering free build with a full sheet (160 stamps) or resizing rebakes the sheet layer once, about 10 ms on the development machine.

## Provenance

All six bitmaps were generated on 2026-10-03 through the `codex-image-gen` skill: Codex CLI 0.159.0 (`codex exec -m gpt-6-astra -c model_reasoning_effort=medium -c model_provider=openai -s workspace-write`) drove Codex's built-in `image_gen` tool. The tool did not report which image model it used. The style reference for every asset except the paper grain was the Rainbow Workshop quarter (bottom right) of `D:/screenshots/CoreWiseLearn/concepts/four-worlds-v1.1.png`, cropped to 768 x 512. Raw outputs, the exact prompts, the reference crop and the processing script are kept outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/shape-workshop/art-originals/`. Every image was reviewed by eye at full size and on light and dark backgrounds before use.

Every prompt except the grain began with the same style paragraph: layered cut construction paper and felt-like paper, visible paper fibre texture, crisp cut edges with a thin lighter torn rim in places, depth only from flat offset shadow layers (no blur, glow or gradients), a bright rainbow palette (tomato red, tangerine, sunflower yellow, leaf green, sky blue, grape purple, bubblegum pink) and soft even light.

| Asset | Prompt subject | Raw | Processing | Shipped |
| --- | --- | --- | --- | --- |
| `public/art/shape-workshop/workshop-wall.webp` | Full-bleed 3:2 workshop wall: pale sky-blue paper wall, paper rainbow low at the far left, white paper clouds, a pale yellow paper sun, plain triangle bunting along the top edge, green paper hills, a light wood tabletop on the bottom 22 percent, the centre kept calm and nearly empty. No text, characters, game pieces or shapes on the table. | 1536 x 1024 opaque PNG | WebP quality 84, no alpha | 1536 x 1024, 130 KB |
| `public/art/shape-workshop/paper-grain.webp` | Flat, evenly lit, seamless white construction paper texture with fine fibres and flecks; no objects, folds, edges, shadows or tint. | 1024 x 1024 opaque PNG | 24 px border cropped (the raw had a darker edge), 512 x 512, greyscale, contrast stretched around a mean of 240, top-left 256 px corner mirrored into four quarters so the tile repeats without seams, WebP quality 88 | 512 x 512, 84 KB |
| `public/art/shape-workshop/hand.webp` | One chubby peach paper hand, index finger pointing straight up, other fingers curled, a short yellow paper cuff, one flat offset shadow; transparent background. | 1024 x 1024 RGBA PNG | Alpha below 40 cleared, trimmed, Lanczos to 320 px tall, WebP quality 92, alpha quality 100. The fingertip sits 38 percent across and 3 percent down; the scene uses that point as the hand's tip. | 181 x 320, 15 KB |
| `public/art/shape-workshop/icon.webp` (hub tile) | An upright rocket built only from flat paper shapes: red rectangle body, yellow triangle nose, blue circle window, two purple triangle fins, orange triangle flame, a small yellow star; slight tilt; transparent background. | 1024 x 1024 RGBA PNG | Same as the hand, 512 px tall | 358 x 512, 42 KB |
| `public/art/shape-workshop/gallery.webp` (gallery button) | A light wood paper shelf with two paper picture frames: an orange frame holding a circle-and-triangle fish, a pink frame holding a square-and-triangle house; transparent background. | 1254 x 1254 RGBA PNG (the tool ignored the requested 1024) | Same as the hand, 256 px wide | 256 x 192, 17 KB |
| `public/art/shape-workshop/brush.webp` (free-build button) | A chunky paper paintbrush (blue handle, yellow ferrule, red tip) with a green circle, purple star, pink heart and yellow triangle bursting from the tip; transparent background. | 1024 x 1024 RGBA PNG | Same as the hand, 256 px | 245 x 256, 16 KB |

The Home and speaker icons are the shared `buttons/home.png`, `buttons/sound-on.png` and `buttons/sound-off.png`. Every paper shape, outline, sheet, tray, frame, shelf, face, sparkle and confetti bit is drawn in code (`paper.ts`, `fx.ts`, `scene.ts`).
