# Shared style and the worlds

The children should recognize how to play while discovering a different place in each game. Keep the existing joyful Bubble Bay illustrations and the sound families chosen in the owner's sound lab.

## Familiar controls

- Navigation uses the same home, speaker, profile, play, and book silhouettes throughout. Targets have at least 96 CSS pixels in each dimension, with extra invisible hit padding where needed.
- Rounded panels use a 28 px corner radius and a 6 px outline at normal scale. Bubble Bay's outline is #2b2140. Tinted outlines are allowed inside future illustrated worlds.
- Foreground targets use simple silhouettes and a clear rim against the immediate background. Color always has another cue, such as a shape, creature, or position.
- Shadows are one flat offset shape. Render them into cached art; avoid live blur filters.
- Andika is bundled under its SIL Open Font License. Load it before baking glyphs. Navigation does not depend on text; learning material may use both cases and words.
- Characters use simple eyes and clear poses: content, delighted, curious, or yawning. No sadness, hunger, injury, pleading, or reaction to absence.
- Bubble Bay accents: sea #45bdd6, cream #fff6d9, coral #ff7a59, yellow #ffd23f, lavender #c084fc. Shape and contrast remain recognizable in grayscale.

## World directions

| World | Medium | Play and future learning |
| --- | --- | --- |
| Bubble Bay | Bright chunky illustration | Pop creatures, hear rising notes, see quantities collect |
| Dinosaur Playground | Soft handmade clay | Cause and effect; a future picnic practices quantities |
| Little Train Town | Painted wooden toys | Build paths; a future letter train practices letters and words |
| Rainbow Workshop | Layered paper cutouts | Create creatures and pictures; a future shape workshop practices shapes and names |

The concept sheet is a visual direction, not a screenshot of implemented games. It lives outside production assets at `D:/screenshots/CoreWiseLearn/concepts/four-worlds-v1.1.png`.

## Asset preparation

Use the built-in image generator for new bitmap art. Preserve the prompt, available model metadata, generation date, and reference roles. Review faces, anatomy, edges, and recognizability before shipping. Do not invent a model name when the generation tool does not report one.

Keep animated parts separate and review their poses or frames. Draw exact letters, numerals, and quantities in code. `scripts/prepare-art.mjs` resizes into a separate output file and preserves alpha; `--palette` is optional for flat illustrations. Clay and paper worlds may retain true color. Review transparent edges on light and dark backgrounds; add bleeding or trim only when the specific asset needs it.

Current v1 art was reduced to indexed PNGs for the offline payload. Reviewed originals are retained outside the checkout. No new runtime image request or image-generation service is used by the children's browser.

## Motion and sound

One immediate local reaction per action: a short squash, a warm pitched pop, and a small pooled burst. Avoid screen shake, hit-stop, full-screen flashes, and growing particle counts. Check combined effects while rapidly sweeping across targets. Browser and operating-system motion preferences do not change the animation. Reward reveals remain brief and the final rest screen stays still.

Preserve the owner's rated sound variants. Count controls pop pitch, while the sound's body may follow bubble size. Master trim is an adult JSON setting. Music is supplied by the owner; no synthesized replacement track ships.

## Tidepool rewards

Bubble Bay's reward scene stays in the ocean. Illustrated coral and mint shells present the actual offered creatures. Stars sit above a separate counting tray. The tray keeps ten spaces visible; up to ten it labels the quantity it shows. Each animal fills its round space, and the tray grows where the screen has room, up to 1.25 times its base width: 600 px wide with animals about 71 px across at 1366x768. Where the screen is too short or narrow for that, it grows less or keeps its base size, so the offers, the rest art and the controls keep their sizes. When a round exceeds ten, the tray's numeral is hidden and a separate ocean bubble shows the cumulative total, with room for three digits, so the tray's partial ten never reads as the score. On narrow screens this bubble sits above the tray. A light and dark contour around the whole selected shell makes keyboard focus visible in grayscale.

When a gift follows, the celebration shows closed shells where the offers will appear, and the choice opens them over 0.3 s: each closed shell squashes down onto its base, then in a single frame becomes the open shell, stretched tall and springing back, behind a bold gold ring with a dark contour and a burst of chunky outlined gold and coral stars, with a low, warm pop (the deeper B version of the big pop sound), while the sticker grows up out of the bowl in front of the ring. The ring's gold is 6 percent of the shell's drawn size, its longest side, which is its height (at least 4 px). It thins over the second half of its 0.3 s, gold and contour together, and is gone before the gold is thinner than 4 px, or than half its full width where that is less (shells under about 133 px tall, down to 2 px on shells under about 67 px tall), so it never ends as a bare dark hoop. The closed and open shells are never drawn at the same time, so the sticker never shows through a half-faded closed shell. When no gift follows (full collection, or rewards turned off in config), the celebration shows the round's own popped creatures rising in bubbles, never a shell or a collectible on a pedestal. The choice and the rest screen start with nothing focused and ignore input for 1.2 s, and start over the same way when they come back from under another screen such as the break nudge, so keys pressed into the nudge do not choose or start a round; after that the first key press only shows focus and a later press acts. The corner Home and sound buttons act at once. On selection the chosen shell lifts slightly and settles without getting smaller, and the other shell sinks and fades over 0.25 s. Where Again and Home fit beside it, the chosen shell keeps its offer size at rest with the two controls on either side; on narrow screens it moves above them. Where the space above the controls is smaller than the offer size (a narrow screen after a round above ten, where the total bubble pushes the tray down), the offers are drawn at the rest size, so the chosen shell never gets smaller. Again and Home have equal size and color.

New reward art was generated with the built-in OpenAI image_gen tool on 2026-10-02. The tool did not expose its model identifier. The prompt requested four isolated handcrafted storybook underwater objects: a peach/coral open scallop shell, a mint/turquoise open scallop shell, a wide shallow ivory shell counting tray, and a plump gold five-point star without a face. It specified fine teal contours, pearlescent materials, rounded silhouettes, upper-left light, and no text, characters, or faces. The follow-up requested removal of external glow and transparent exterior pixels while preserving the objects.

The source sheet is retained at `C:/Users/Home/.codex/generated_images/01a0ff7b-3c60-7450-80ac-6d78e2f1e516/exec-78b1530c-cb96-47ef-a233-73328f1a6df8.png`. The composition reference, generated from the existing choice capture and asset sheet, is `exec-a8e77ced-4f5e-4c38-9eed-257a49da6a04.png` in the same directory. Both originals remain outside the browser payload. Sharp extracts separate objects, trims transparent space, and writes WebP at quality 92 with alpha quality 100. Runtime shell widths are 480 pixels, the tray is 640 pixels wide, and the star is 160 pixels wide. The sprite store caches their display sizes. Bubble Bay prepares the sizes the end of the round draws one per idle period between frames, so the first celebration of a session does not stall while art is scaled. Stars, tray, creatures, shells and buttons are prepared during play; the two offered stickers are known only once the round ends, so their sizes are prepared during the celebration, before the choice shows them. Art that has not loaded is looked for again after 0.5, 1, 2 and 4 s; after that it is checked once more each time the end-of-round sizes are planned again (when a round starts or ends, when the screen size changes, and at the eleventh pop on a narrow screen). The round-end fanfare is rendered ahead once per session so the frame a round ends does not build its notes: the render's one long step (about 4 ms, 16 ms on a slow laptop) runs when the session's first round starts, before that round's first frame, while the screen is still: under the enter fade when the game opens into a new round, or on the still rest screen after Again when the game opened onto a finished round restored from the save and the round starts from there. Its notes are added one at a time in the same idle periods, each well under the time the period has left. Existing creature art is unchanged.

Six sticker characters and two closed shells were generated on 2026-10-03 with Codex CLI 0.159.0 (`codex exec -m gpt-6-astra`) using its built-in image_gen tool. The image model is chosen by the backend and the log does not name it. Every prompt locked the existing sticker style (flat chunky vector, thick navy outline, flat saturated fills, one soft highlight), a transparent square canvas, one subject filling about 80 percent, and a compact silhouette so nothing pokes out of the shell. The six stickers replace hub tile and button art for the same sticker ids, so saved collections keep working; the hub tiles keep their own art. One line per asset:

- `stickers/happy-star.webp`: a chubby tangerine star character with a big smiling face, rosy cheeks and two stubby arms, one raised in a wave, more orange than the gold rating stars. Second attempt; the first had arms that read as notches.
- `stickers/red-rocket.webp`: an upright red and white rocket character with a happy face in its porthole, three short fins and a short flame tucked under the base. First attempt.
- `stickers/rainbow-candy.webp`: a round rainbow swirl lollipop character with a happy face and a very short white stick. First attempt.
- `stickers/green-dino.webp`: a seated baby dinosaur, green with a pale belly, small orange back plates and a tail curled beside its body. First attempt.
- `stickers/rainbow-unicorn.webp`: a seated baby unicorn, white with pink hooves, a rainbow mane and tail and a short golden horn. First attempt.
- `stickers/ocean-friend.webp`: a round teal baby octopus with short curled tentacles, distinct from the orange tile octopus and the purple creature octopus. First attempt.
- `rewards/shell-closed-mint.webp`: the open mint shell closed, as a front view with broad rounded ribs and a soft pearl glow along the seam. Generated new with the open mint shell as style reference and an earlier closed coral attempt as shape reference; second attempt.
- `rewards/shell-closed-coral.webp`: the open coral shell closed, matched to the closed mint shell's shape and seam glow. Generated new with the open coral shell as style reference and the chosen closed mint shell as twin reference; third attempt.

Raw outputs were 1254x1254 RGBA PNGs. Preparation removed matte fringe and specks, made interiors fully opaque, cropped to the alpha bounds, fitted stickers to a 410 px longest side on a 512x512 transparent canvas and shells to the open shells' 480 px width, and wrote WebP at quality 92 with alpha quality 100. Prompts, raw files and per-attempt verdicts are retained outside the browser payload.

The former 5 MB total precache limit was removed by explicit owner direction for this visual round. The build still reports total bytes and rejects missing offline assets. Download and rendering optimization, including delivered-frame and update/render timing checks, remain required in the final verification round. This policy does not require converting the existing art library to WebP.

