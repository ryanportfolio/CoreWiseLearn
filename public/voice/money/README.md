# Money voice clips

Spoken money words and sentences for Market Stall (Coin Vault has its own clips in the narrator voice, `public/voice/coin-vault/`). All 492 clips below ship as MP3 in one voice, the cheeky London market-stall lad (Gemini's Puck, role `londoner`), rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/money.json`. Edit the lines there and run the generator rather than replacing files by hand. A game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Every sentence and every amount is one whole clip, with the voice falling at the end like a statement (except the one real question). Clips are never played back to back to make one sentence or one amount: the owner heard a joined "Make" + "forty cents." as janky and question-like (2026-10-06). Amounts in file names are in cents: `costs-1300` is "That costs thirteen dollars."

| File | Said | What it is for |
| --- | --- | --- |
| `item-0` to `item-7` | "I'd like the round loaf, please." ... "I'd like the cake, please." | Market Stall: the customer asks for its item (0 round loaf, 1 long loaf, 2 braided loaf, 3 pretzel, 4 fish biscuit, 5 cherry pie, 6 jar of honey, 7 cake). |
| `item-0-3`, `item-1-4` ... `item-7-2` | "I'd like the round loaf and the pretzel, please." | Market Stall step 9: a customer buying two items (the second item is always the first plus 3, wrapping at 8). |
| `costs-1` to `costs-95`, `costs-100` to `costs-300` in steps of 5, `costs-400` to `costs-1900` by whole dollars | "That costs seven cents.", "That costs one dollar and five cents.", "That costs thirteen dollars." | Market Stall: the price, once it is on the board. |
| `pay-10` to `pay-90`, `pay-100`, `pay-200`, `pay-500`, `pay-1000`, `pay-1500`, `pay-2000` | "Here's ten cents." ... "Here's twenty dollars." | Market Stall: the payment, once it has poured onto the board. |
| `how-much-change` | "How much change do I get?" | Market Stall: after the payment. A real question, so its voice rises. |
| `amount-105` to `amount-475` (dollars and cents in steps of 5¢, no whole dollars) | "One dollar and five cents." ... "Four dollars and seventy-five cents." | Market Stall: the change total as a customer leaves, from $1.05 up. |
| `cents-1` to `cents-99` | "One cent.", "Two cents." ... "Ninety-nine cents." | An amount under a dollar said on its own (Market Stall: the change total). |
| `dollars-1` to `dollars-20` | "One dollar." ... "Twenty dollars." | A whole-dollar amount said on its own (Market Stall: the change total). |
| `penny`, `nickel`, `dime`, `quarter` | "Penny." ... "Quarter." | The child picks up a coin (Market Stall: the first time that kind goes to a customer). |
| `bill-1`, `bill-5`, `bill-10`, `bill-20` | "One-dollar bill." ... "Twenty-dollar bill." | The child picks up a bill (Market Stall: the first time that kind goes to a customer). |
| `count-1` to `count-100` | "One!" ... "One hundred!" | Counting up aloud, one clip per coin or step. Not played yet. |
| `too-much` | "Ooh, that's too much!" | The child gave back more change than owed (said kindly; nothing is wrong). Not played yet. |
| `thanks-1`, `thanks-2`, `thanks-3` | "Thank you!", "Cheers!", "Lovely, thanks!" | A sale is done. Not played yet. |
| `change-please` | "My change, please!" | Not played: replaced by `how-much-change`. |
| `dollars-and-1` to `dollars-and-4`, `costs`, `pay` | "One dollar and" ..., "That costs", "Here's," | Not played: halves of a sentence, from before whole-sentence clips. The games must not join them to other clips. |

Market Stall's moments and pacing are in `docs/games/market-stall.md`, "Voice".

Notes from rendering:

- The transcript check (`google/gemini-3.1-flash-lite`) writes amounts from a dollar up as "$1.25" and "$13", so those lines also accept the written forms; a "costs" or "pay" line also accepts "7¢" and "here is".
- "Here's" was heard as "He is", "He's" or "His" on several takes (`pay-25`, `pay-80`, `pay-90`); a later take passed each time.
- After the word check, each new clip was asked three times whether its voice falls like a statement or rises like a question; any statement heard as a question even once was rendered again (21 clips, up to 6 takes for `pay-80`) until all three answers said statement.
- The shared voice style is slow and clear: the new sentences run 1.8 to 5.9 seconds (half under 3.7 s). Takes with a pause of 0.6 s or more inside, or over 6 seconds, were rendered again.

After adding or removing files, run `npm run build` so the games and the offline cache pick them up.
