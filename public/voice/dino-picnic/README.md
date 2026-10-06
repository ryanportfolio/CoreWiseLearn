# Dino Picnic voice clips

Short spoken clips for Dino Picnic. All 11 below ship as MP3, in the teacher's voice: Gemini's Vindemiatrix with a soft Scottish accent, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/dino-picnic.json`. Edit the lines there and run the generator rather than replacing files by hand. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Put files here with these exact names, as MP3 (or OGG when there is no MP3):

| File | Said | When it plays |
| --- | --- | --- |
| `number-1.mp3` to `number-10.mp3` | "one" to "ten" | A dino's wish card appears (its number), and each time a dino eats a fruit from its plate (counting up from one). |
| `more.mp3` | "more" | The party hat appears and the child picks the dino with more fruit. |

Keep each clip under a second, trimmed of silence at both ends, and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
