# Coin Vault voice clips

Optional short spoken clips for Coin Vault. None ship yet: naming coins, bills and numbers waits until the owner records a voice. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Put files here with these exact names, as MP3 (or OGG when there is no MP3):

| File | Said | When it plays |
| --- | --- | --- |
| `penny.mp3` | "penny" | The child picks up a penny. |
| `nickel.mp3` | "nickel" | The child picks up a nickel. |
| `dime.mp3` | "dime" | The child picks up a dime. |
| `quarter.mp3` | "quarter" | The child picks up a quarter. |
| `one-dollar.mp3` | "one dollar" | The child picks up a $1 bill (a later step). |
| `five-dollars.mp3` | "five dollars" | The child picks up a $5 bill (a later step). |
| `ten-dollars.mp3` | "ten dollars" | The child picks up a $10 bill (a later step). |
| `twenty-dollars.mp3` | "twenty dollars" | The child picks up a $20 bill (a later step). |
| `number-1.mp3` to `number-20.mp3` | "one" to "twenty" | A dish's count-on reaches that running total, or the matching tag is picked. |
| `number-25.mp3` | "twenty-five" | As above (a quarter's count-on). |
| `number-30.mp3`, `number-40.mp3` up to `number-100.mp3` | "thirty" to "one hundred" | As above, for totals that are a whole ten. |

Keep each clip under a second, trimmed of silence at both ends, and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
