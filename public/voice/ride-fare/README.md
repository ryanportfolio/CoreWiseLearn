# Ride Fare voice clips

Short spoken clips for Ride Fare. All 30 below ship as MP3, in the village postman's voice: Gemini's Achird with a Yorkshire accent, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/ride-fare.json`. Edit the lines there and run the generator rather than replacing files by hand. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Put files here with these exact names, as MP3 (or OGG when there is no MP3):

| File | Said | When it plays |
| --- | --- | --- |
| `penny.mp3` | "penny" | The child picks up a penny. |
| `nickel.mp3` | "nickel" | The child picks up a nickel. |
| `dime.mp3` | "dime" | The child picks up a dime (age-6 steps). |
| `number-1.mp3` to `number-20.mp3` | "one" to "twenty" | A new fare appears (the number of cups to light). |
| `number-30.mp3`, `number-40.mp3` up to `number-90.mp3` | "thirty" to "ninety" | Age-6 fares above twenty, and the counter passing each ten. |

Keep each clip under a second, trimmed of silence at both ends, and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
