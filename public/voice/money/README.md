# Money voice clips

Spoken money words for Market Stall. All 238 clips below ship as MP3 in one voice, the cheeky London market-stall lad (Gemini's Puck, role `londoner`), rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/money.json`. Edit the lines there and run the generator rather than replacing files by hand. A game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Each spoken amount is one whole clip so it sounds natural. A dollars-and-cents amount is two clips back to back: `dollars-and-1` ("One dollar and") then `cents-25` ("Twenty-five cents."). Phrases that end mid-sentence (`costs`, `pay`) are always followed by an amount clip.

| File | Said | What it is for |
| --- | --- | --- |
| `cents-1` to `cents-99` | "One cent.", "Two cents." ... "Ninety-nine cents." | Saying a price, a payment, change owed or a total under a dollar. |
| `dollars-1` to `dollars-20` | "One dollar." ... "Twenty dollars." | Saying a whole-dollar amount. |
| `dollars-and-1` to `dollars-and-4` | "One dollar and" ... "Four dollars and" | The first half of a dollars-and-cents amount, followed by a `cents-` clip. |
| `count-1` to `count-100` | "One!" ... "One hundred!" | Counting up aloud, one clip per coin or step (the cashier counting change). |
| `penny`, `nickel`, `dime`, `quarter` | "Penny." ... "Quarter." | The child picks up or taps a coin. |
| `bill-1`, `bill-5`, `bill-10`, `bill-20` | "One-dollar bill." ... "Twenty-dollar bill." | The child picks up or taps a bill. |
| `costs` | "That costs" | Market Stall: the customer asks the price, followed by the amount. |
| `pay` | "Here's," | Market Stall: the customer hands over money, followed by the amount. |
| `change-please` | "My change, please!" | Market Stall: the customer waits for change. |
| `too-much` | "Ooh, that's too much!" | Market Stall: the child gave back more change than owed (said kindly; nothing is wrong). |
| `thanks-1`, `thanks-2`, `thanks-3` | "Thank you!", "Cheers!", "Lovely, thanks!" | Market Stall: a sale is done. Pick one at random. |

Notes from rendering:

- `costs` has no punctuation and `pay` has a comma: asked whether each take sounds finished or about to go on, the check model heard "continues" on every try for these takes. "Here's" without the comma came back as "He's" or "His" on three renders.
- `pay` accepts "here is" in the transcript check; `too-much` accepts "Oh, that's too much!" and "Ooh, that is too much!".
- The shared voice style is slow and clear, so amounts run about 1.5 to 2.9 seconds. Takes over 3 seconds or with long pauses inside were rendered again.

After adding or removing files, run `npm run build` so the games and the offline cache pick them up.
