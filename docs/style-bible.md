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

Bubble Bay's reward scene stays in the ocean. Illustrated coral and mint shells present the actual offered creatures. Stars sit above a separate counting tray. The tray keeps ten spaces visible and labels the quantity currently shown. When a round exceeds ten, a separate ocean bubble shows the cumulative total, with room for three digits. On narrow screens this bubble sits above the tray. A light and dark contour around the whole selected shell makes keyboard focus visible in grayscale. The chosen creature remains large in a single shell at rest; Again and Home have equal size and color.

New reward art was generated with the built-in OpenAI image_gen tool on 2026-10-02. The tool did not expose its model identifier. The prompt requested four isolated handcrafted storybook underwater objects: a peach/coral open scallop shell, a mint/turquoise open scallop shell, a wide shallow ivory shell counting tray, and a plump gold five-point star without a face. It specified fine teal contours, pearlescent materials, rounded silhouettes, upper-left light, and no text, characters, or faces. The follow-up requested removal of external glow and transparent exterior pixels while preserving the objects.

The source sheet is retained at `C:/Users/Home/.codex/generated_images/01a0ff7b-3c60-7450-80ac-6d78e2f1e516/exec-78b1530c-cb96-47ef-a233-73328f1a6df8.png`. The composition reference, generated from the existing choice capture and asset sheet, is `exec-a8e77ced-4f5e-4c38-9eed-257a49da6a04.png` in the same directory. Both originals remain outside the browser payload. Sharp extracts separate objects, trims transparent space, and writes WebP at quality 92 with alpha quality 100. Runtime shell widths are 480 pixels, the tray is 640 pixels wide, and the star is 160 pixels wide. The sprite store caches their display sizes. Existing creature art is unchanged.

The former 5 MB total precache limit was removed by explicit owner direction for this visual round. The build still reports total bytes and rejects missing offline assets. Download and rendering optimization, including delivered-frame and update/render timing checks, remain required in the final verification round. This policy does not require converting the existing art library to WebP.

