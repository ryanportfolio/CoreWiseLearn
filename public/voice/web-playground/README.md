# Web Playground voice clips

Web Playground can say each number, letter and picture name out loud. All 39 clips listed below ship as MP3, in the teacher's voice: Gemini's Vindemiatrix with a soft Scottish accent, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/web-playground.json`. Edit the lines there and run the generator rather than replacing files by hand. The generator also rewrites `clips.json`.

## Adding clips

1. Record one short clip per item, about one second, spoken warmly and slowly. Export MP3 (or OGG).
2. Put the files in this folder with exactly these names:
   - numbers: `number-1.mp3` to `number-10.mp3`
   - letters: `letter-a.mp3` to `letter-z.mp3` (small letter in the file name; one clip covers the capital and the small letter)
   - pictures: `picture-star.mp3`, `picture-heart.mp3`, `picture-kite.mp3`
3. Add each file name to `clips.json` in this folder, for example `["number-1.mp3", "letter-a.mp3"]`.
4. Rebuild (`npm run build`) so the clips are cached for offline play.

## When they play

- A number or letter clip plays when the hero shows that number or letter, and when the next web point to join has that glyph.
- A picture clip plays when the web picture is finished.

The game only asks for files listed in `clips.json`, so a missing clip never makes a request or an error. Clips play on the sound-effects bus and stay silent while sound is muted.
