# Frog Pond voice clips

Spoken words for Frog Pond's Rhyme snack, Word fountain and Lily-pad sentences. Every word in the rhyme families (`RHYME_FAMILIES` in `src/games/frog-pond/content.ts`, 110 words) has three clips here, one per voice, 330 MP3 files. Word fountain adds 50: `make-<word>` for its 20 compound words and the 3 it no longer offers (bedbug, zipline, hairball, still in saved collections), and `say-<word>` for the 27 halves and decoys that are not rhyme words. `say-bow` is written "Boh." in the lines file, because "Bow." came out rhyming with "cow". Lily-pad sentences adds 79 (below). 451 MP3 files in all. They are rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/frog-pond.json` (Rhyme snack), `scripts/voice/lines/frog-pond-words.json` (Word fountain) and `scripts/voice/lines/frog-pond-sentences.json` (Lily-pad sentences); edit the lines there and run the generator rather than replacing files by hand. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

| File | Voice | Said | When it plays |
| --- | --- | --- | --- |
| `say-<word>.mp3` | Scottish teacher (Gemini's Vindemiatrix) | the word, calmly ("Cat.") | The round's target word, about 0.7 s into the round, when the child presses the frog or its pad, and when the idle hint starts. With word help on (after a long pause or several dodges), also the word of a bug the child points at or focuses for 0.45 s. |
| `catch-<word>.mp3` | Northern postman (Achird) | the word, pleased ("Cat!") | The frog's tongue reaches a rhyming bug. |
| `dodge-<word>.mp3` | London lad (Puck) | the word, cheekily ("Cat?") | A bug whose word does not rhyme hops aside. |
| `make-<word>.mp3` | Northern postman (Achird) | a compound word, pleased ("Pancake!") | Word fountain: two halves make the word, or the child presses its picture in the pond. |
| `say-<word>.mp3` (Word fountain) | Scottish teacher | a half or decoy ("Cake.") | Word fountain with word help on: the child lifts a bubble, or a bonk (the second bubble's word). Halves and decoys that are rhyme words use the Rhyme snack clip of the same name. |

`<word>` is the word in lower case, as in `content.ts`: `say-cat.mp3`, `catch-twig.mp3`, `dodge-flag.mp3`.

A few clips use slightly different text, because the model kept saying something else: `catch-cut` and `catch-hid` say "Cut." and "Hid." (the exclamation took three renders and still failed), and `dodge-shut` and `dodge-rid` say "Shut!" and "Rid!" (the question was heard as "Shot?" and "Red?"). Some lines accept an accent variant in the transcription check; they are listed in the lines file and in `docs/games/frog-pond.md`.

## Lily-pad sentences

79 more clips, rendered from `scripts/voice/lines/frog-pond-sentences.json`:

| File | Voice | Said | When it plays |
| --- | --- | --- | --- |
| `read-<words>.mp3` | Northern postman | one whole sentence with its end mark ("The pig is in the box.", "Is the pig in the box?") | The sentence is complete; each word lights up as he says it, from the table in `src/games/frog-pond/read-timing.ts`. |
| `say-<word>.mp3` | Scottish teacher | a sentence word that neither Rhyme snack nor Word fountain already has ("The.", "Under.") | A word's pad joins the sentence row, and with word help on, a pad pressed out of order. Sentence words that are also rhyme words or Word fountain words (ball, box, fox) use the clips above. |

`<words>` is the sentence's words in lower case joined by dashes: `read-the-pig-is-in-the-box.mp3`. After re-rendering a `read-` clip, run `scripts/voice/word-onsets.py` (see `scripts/voice/README.md`) so the words still light up in time.

Keep each word clip under a second, trimmed of silence at both ends. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
