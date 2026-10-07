# Coin Vault voice clips

Spoken clips for Coin Vault. All 492 below ship as MP3, in the narrator's voice: Gemini's Charon, a warm southern English children's television narrator, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/coin-vault.json`. Edit the lines there and run the generator rather than replacing files by hand. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

The owner chose the narrator for everything Coin Vault says (2026-10-06), so the game does not use the London lad's clips in `public/voice/money/`.

Every spoken amount or sentence is one whole clip; the game never joins two clips into one amount. The owner heard the joined "Make" + "forty cents." and asked for whole sentences with a falling, statement ending (2026-10-06), so "Make forty cents." and "One dollar and twenty-five cents." are each one recording. Each of those was checked for statement intonation (the check model was asked whether the voice falls like a statement or rises like a question) and rendered again until it read as a statement.

| File | Said | When it plays |
| --- | --- | --- |
| `penny`, `nickel`, `dime`, `quarter` | "Penny." ... "Quarter." | The child picks up that coin. |
| `one-dollar`, `five-dollars`, `ten-dollars`, `twenty-dollars` | "One dollar." ... "Twenty dollars." | The child picks up that bill. |
| `count-mine` | "Can you count my money?" | A visitor rises with money to count (every task except a lock). |
| `number-1` to `number-100` | "One." ... "One hundred." | The count-on: each group's running total under $1, in cents for coins or dollars for bills (a bill count-on reaches at most $100). Exactly 100¢ is `number-100`, unless the $1 bill lies on the board. |
| `dollar-and-1` to `dollar-and-50` | "One dollar and one cent." ... "One dollar and fifty cents." | An amount from 101 to 150¢ ("$1 and N¢"): a running total of the count-on at steps 6 and 8, and the matching tag. |
| `cents-1` to `cents-100` | "One cent.", "Two cents." ... "One hundred cents." | The matching tag of a cents task ("45¢", "100¢"), the amount of a filled lock, and step 8b's finished tag. |
| `dollars-1` to `dollars-100` | "One dollar." ... "One hundred dollars." | The matching tag of a dollars task ("$45") and step 8b's finished tag. `dollars-1` is also the count-on's running total of 100¢ while the $1 bill lies on the board (step 8's "$1 and N¢" collections, and step 6 after the trade). |
| `make-10` to `make-99` | "Make ten cents." ... "Make ninety-nine cents." | A lock task's visitor rises and asks for its amount (step 4: 10 to 50¢, step 5: 26 to 99¢). |
| `saved-1` | "I saved it!" | The task's end when the jar reaches the visitor's goal (always, after a lock). |
| `saved-2` | "All counted!" | The task's end when the jar is not full yet. |
| `dollars-110` to `dollars-150` | "One hundred ten dollars." ... "One hundred fifty dollars." | Not played now: step 8's look-alike tags ("$110" to "$150") are never the matching tag. |

Every amount the game says has a clip: counted totals run from 11¢ to 150¢ and $6 to $100, and locks from 10¢ to 99¢ (`rules.ts`). Tags that are not the matching one and the visitor's goal are not spoken.

Keep each clip trimmed of silence at both ends and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
