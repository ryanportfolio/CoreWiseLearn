# Piggy Parade voice clips

Optional short spoken clips for Piggy Parade. None ship yet. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Put files here with these exact names, as MP3 (or OGG when there is no MP3):

| File | Said | When it plays |
| --- | --- | --- |
| `penny.mp3` | "penny" | A penny drops into the piggy wearing the penny. |
| `nickel.mp3` | "nickel" | A nickel drops into its piggy. |
| `dime.mp3` | "dime" | A dime drops into its piggy. |
| `quarter.mp3` | "quarter" | A quarter drops into its piggy. |
| `number-1.mp3`, `number-5.mp3`, `number-10.mp3`, `number-25.mp3` | "one", "five", "ten", "twenty-five" | Value steps 6 to 8: a coin lands in its piggy and that step's dots pulse. |

Keep each clip under a second, trimmed of silence at both ends, and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
