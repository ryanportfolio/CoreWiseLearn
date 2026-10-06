# Coin Vault voice clips

Spoken clips for Coin Vault. All 354 below ship as MP3, in the narrator's voice: Gemini's Charon, a warm southern English children's television narrator, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/coin-vault.json`. Edit the lines there and run the generator rather than replacing files by hand. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

The owner chose the narrator for everything Coin Vault says (2026-10-06), so the game does not use the London lad's clips in `public/voice/money/`.

Each spoken amount is one whole clip. An amount over a dollar in cents ("$1 and 25¢") is two clips back to back: `dollars-and-1` ("One dollar and") then `cents-25` ("Twenty-five cents."). Clips play on one channel, so the second starts when the first ends.

| File | Said | When it plays |
| --- | --- | --- |
| `penny`, `nickel`, `dime`, `quarter` | "Penny." ... "Quarter." | The child picks up that coin. |
| `one-dollar`, `five-dollars`, `ten-dollars`, `twenty-dollars` | "One dollar." ... "Twenty dollars." | The child picks up that bill. |
| `number-1` to `number-100` | "One." ... "One hundred." | The count-on: each group's running total, in cents for coins or dollars for bills (a bill count-on reaches at most $100). |
| `cents-1` to `cents-100` | "One cent.", "Two cents." ... "One hundred cents." | A cents amount: the matching tag, a lock's amount, the visitor's goal, a collection's total. |
| `dollars-1` to `dollars-100` | "One dollar." ... "One hundred dollars." | A whole-dollar amount: a bill collection's total, its tags and goal ($5 to $100), and step 8's "$45"-style look-alike of a cents tag. |
| `dollars-110` to `dollars-150` | "One hundred ten dollars." ... "One hundred fifty dollars." | Step 8's look-alike tag for "$1 and 10¢" to "$1 and 50¢" (the same digits with $: "$110" to "$150"). |
| `dollars-and-1` | "One dollar and" | The first half of an amount from 101 to 199¢ ("$1 and N¢"): step 6 and 8 totals and running totals over 100, their tags, and goals of 105 to 195¢. Always followed by a `cents-` clip. |
| `count-mine` | "Can you count my money?" | The visitor arrives with money to count. |
| `make` | "Make" | The visitor asks for a lock's amount, followed by the amount clip. |
| `saved-1` | "I saved it!" | The visitor's goal is reached. |
| `saved-2` | "All counted!" | The counting is done. |

Every amount the game can show has a clip: counted totals run from 11¢ to 150¢ and $6 to $100; tags from 1¢ to 199¢ and $1 to $150; locks 10¢ to 99¢; goals up to 195¢ and $5 to $100 (`rules.ts`).

Keep each clip trimmed of silence at both ends and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
