# Market Stall voice clips

Short spoken clips for Market Stall. All 38 below ship as MP3, in the market-stall lad's voice: Gemini's Puck with a light London accent, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/market-stall.json`. Edit the lines there and run the generator rather than replacing files by hand. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Put files here with these exact names, as MP3 (or OGG when there is no MP3):

| File | Said | When it plays |
| --- | --- | --- |
| `penny.mp3` | "penny" | The child picks up a penny. |
| `nickel.mp3` | "nickel" | The child picks up a nickel. |
| `dime.mp3` | "dime" | The child picks up a dime. |
| `quarter.mp3` | "quarter" | The child picks up a quarter. |
| `one-dollar.mp3` | "one dollar" | The child picks up a $1 bill. |
| `five-dollars.mp3` | "five dollars" | The child picks up a $5 bill. |
| `ten-dollars.mp3` | "ten dollars" | The child picks up a $10 bill. |
| `twenty-dollars.mp3` | "twenty dollars" | The child picks up a $20 bill. |
| `number-1.mp3` to `number-20.mp3` | "one" to "twenty" | A new price appears, and the change counter reaches the payment. |
| `number-25.mp3`, `number-75.mp3`, `number-100.mp3` | "twenty-five", "seventy-five", "one hundred" | The same, for those amounts. |
| `number-30.mp3`, `number-40.mp3` up to `number-90.mp3` | "thirty" to "ninety" | The same, for prices and payments on a whole ten. |

Keep each clip under a second, trimmed of silence at both ends, and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
