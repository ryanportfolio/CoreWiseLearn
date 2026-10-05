# Shape Workshop voice clips

Short spoken shape names for Shape Workshop. All 7 below ship as MP3, in the narrator's voice: Gemini's Charon with a received-pronunciation accent, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/shape-workshop.json`. Edit the lines there and run the generator rather than replacing files by hand. The generator also rewrites `clips.json`.

## File names

One MP3 per shape, in this folder:

| File | Says |
| --- | --- |
| `circle.mp3` | "circle" |
| `square.mp3` | "square" |
| `triangle.mp3` | "triangle" |
| `rectangle.mp3` | "rectangle" |
| `star.mp3` | "star" |
| `heart.mp3` | "heart" |
| `semicircle.mp3` | "half circle" (the shape is named `semicircle` in the code) |

## When they play

- A piece of that shape lands in its outline while building a picture.
- A shape is chosen in the free-build tray, or stamped onto the sheet.

At most one clip plays every 0.6 seconds, at 90 percent volume on the sound-effects bus, and never while the speaker is muted.

## Adding a clip

1. Put the file here, for example `public/voice/shape-workshop/star.mp3`. Keep it under a second, mono, with no silence before the word.
2. Add its name without `.mp3` to the list in `clips.json` in this folder. The list is plain JSON: `[]` with no clips, `["star"]` with one, `["star", "circle"]` with two. Names use lowercase letters, digits and dashes only.
3. Run `npm run build` so the new file and list are precached for offline play.

No code changes are needed. The game reads `clips.json` once when it opens and only asks for clips listed there, so a shape without a listed clip never causes a request or a console error. A name listed without its file makes one failed request the first time that shape is said; the game stays silent and carries on.
