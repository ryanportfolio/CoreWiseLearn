# Shape Workshop voice clips

Short spoken shape names for Shape Workshop. No clips ship yet; the game plays without them.

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
2. Add its name without `.mp3` to `VOICE_CLIPS` in `src/games/shape-workshop/voice.ts`, for example `['star']`.

The game only asks for clips listed there, so a missing file never causes a request or a console error. Every file in `public/` is precached for offline play by the next build.
