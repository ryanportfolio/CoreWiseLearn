# Voice clip generator

`generate.mjs` turns a list of lines into short MP3 voice clips for the games. For each line it asks Gemini text-to-speech (through OpenRouter) to say the line in a character voice, transcribes the result to check the words came out right, trims the silence, levels the loudness and writes `public/voice/<folder>/<file>.mp3`. The game never calls the service; the clips are rendered once on the owner's machine and shipped as files.

It needs Node 20 or later, ffmpeg, and an OpenRouter key in the `OPENROUTER_API_KEY` environment variable. The key is only sent to OpenRouter; the script never prints it or writes it to a file. No npm package is added.

## Running it

```
node scripts/voice/generate.mjs scripts/voice/lines/wibble.json
```

- Pass one or more lines files. Lines that have not changed since their last render are skipped.
- `--dry-run` lists what would be rendered and stops. No key or network is needed.
- `--force` renders every line in the given files again.
- `--only letter-g,tickle-2` renders just those lines (by file name), whatever the lock file says. Use it to get a fresh take of a clip that sounds wrong.

The run prints one line per clip, then a summary: how many were rendered, skipped and failed, what the check heard for each failure, and roughly what the run cost. The cost is the rise in the key's usage figure from OpenRouter between the start and the end of the run. OpenRouter updates that figure with a delay, so it can miss the last requests of one run and count them in the next. The exit code is 1 when any line failed.

## What happens to each line

1. **Speech.** `POST https://openrouter.ai/api/v1/audio/speech` with the model and voice from `roles.json`, `response_format: "pcm"` and this input:

   ```
   ### DIRECTOR'S NOTES
   Style: <style from roles.json>
   <the role's notes>

   #### TRANSCRIPT
   <the line's text>
   ```

   For a letter line (one whose `accept` list includes a single letter) the notes get one more sentence: "Say the name of this letter of the alphabet."
2. **Trim.** Silence is cut from both ends, leaving 30 ms, with a 5 ms fade so the cut never clicks. The edges are set by sound within 20 dB of the clip's loudest moment, widened to take in quieter sound less than 150 ms away (a soft "h" or "s", or the burst of a final "p"). That drops the quiet breaths and lone clicks the model sometimes leaves a few hundred milliseconds before or after the words.
3. **Level.** ffmpeg's EBU R128 meter measures the loudness and the clip is turned up or down to -16 LUFS, unless that would push its peak above -1.5 dBFS, in which case it stops there. Short clips are repeated to 3 seconds for the measurement, which does not change the result.
4. **Check.** The trimmed clip goes to `POST https://openrouter.ai/api/v1/chat/completions` with the `checkModel` from `roles.json` and the prompt "Transcribe this audio exactly, word for word, with punctuation. Reply with the transcript only." The transcript passes if it matches the line's text or any `accept` entry after both are lower-cased, apostrophes removed, other punctuation turned into spaces, and digits spelled out ("25" and "twenty-five" both become "twenty five").
5. **Retry.** A clip that fails the check is rendered again, up to 3 renders in all. A line that still fails is reported and its MP3 is not written; an earlier good file stays in place.
6. **Write.** The clip is encoded as mono MP3 (libmp3lame, 64 kbps, 24 kHz) to `public/voice/<folder>/<file>.mp3`, and its hash goes into `lock.json`.

Four lines are worked on at a time. Network errors, timeouts and HTTP 408, 429 and 5xx answers are retried after 1, 2, 4 and 8 seconds.

ffmpeg is found with `where.exe ffmpeg` (or `which` outside Windows), then at `C:\Users\Home\ffmpeg\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe`. Set `FFMPEG` to a full path to use another copy.

## Lines files

One JSON file per clip folder, in `scripts/voice/lines/`:

```json
{
  "folder": "wibble",
  "role": "wibble",
  "list": "clips.json:names",
  "lines": [
    { "file": "letter-m", "text": "Em!", "accept": ["m", "em"] },
    { "file": "hello-1", "text": "Hello! I'm Wibble!" },
    { "file": "number-1", "text": "One!", "role": "teacher" }
  ]
}
```

- `folder`: the clips go to `public/voice/<folder>/`.
- `role`: the voice role for every line, from `roles.json`. A line can name its own `role` instead.
- `file`: the clip's file name without `.mp3`. Lowercase letters, digits and dashes. Game code refers to these names, so don't rename a clip without changing the game.
- `text`: what is said. Write it the way it should sound (see the quirks below).
- `accept` (optional): other transcripts that count as right, such as "b" for "Bee!".
- `list` (optional): which clip list to rewrite after the run, for games that only request listed clips. Each list holds every audio file in the folder, not only the ones from this run.

| `list` | Writes | Used by |
| --- | --- | --- |
| left out | nothing; the game finds its clips at build time | Wibble, Dino Picnic, Piggy Parade, Ride Fare |
| `clips.json:names` | `public/voice/<folder>/clips.json` with names without `.mp3`, for example `["circle", "star"]` | Shape Workshop |
| `clips.json:files` | `public/voice/<folder>/clips.json` with file names, for example `["number-1.mp3", "letter-a.mp3"]` | Web Playground |
| `letter-train` | the `VOICE_CLIPS` array in `src/games/letter-train/clips.ts`, for example `'a.mp3'` | Letter Train |

Run `npm run build` after a run so the game and the offline cache pick up the new clips.

## Reviewing clips

Each run writes a listening page to `D:\screenshots\CoreWiseLearn\voice-review\<folder>\index.html` (or `.tmp/voice-review/` in the repo when the D drive is missing or read-only; the run says so). It lists every clip rendered for that folder with a play button, the text, what the check heard, the length and the longest pause inside the clip, and has a button to play them all in order. Clips from earlier runs stay on the page; the ones from the latest run are marked "new". A line that failed shows in red with its last take, so you can hear what went wrong. A long pause can mean an extra sound the check did not write down, so listen to those. The owner listens to every new clip there before it is committed.

## lock.json

Maps `<folder>/<file>` to a SHA-256 hash of the model, voice, role notes, style and text used to render it. A line is rendered again when its hash changes or its MP3 is missing. Changing a role's notes or the shared style re-renders every line in that role. Changing only `accept` does not; use `--only` to re-check a line.

## Adding a voice role

Add an entry under `roles` in `roles.json`:

```json
"pirate": {
  "voice": "Algenib",
  "notes": "Accent: West Country, Cornwall.\nCharacter: a jolly old pirate, chuckly and kind."
}
```

`voice` is one of the Gemini TTS voice names (Zephyr, Puck, Charon, Achird, Vindemiatrix and the rest). `notes` describe the accent and the character, one per line. A role may also set its own `model` or `style` to override the shared ones. Write who the character is, not how to say a line: describe a person and let the punctuation in the text carry the delivery.

## Model quirks

- Only `response_format: "pcm"` works for Gemini on this endpoint. The answer is raw 24 kHz mono 16-bit little-endian audio with no header.
- The model sometimes reads the director's notes aloud, whole or in part, or adds words of its own ("Ooh, can you see this letter here?", "That's right!"). The transcript check catches this and the retry nearly always fixes it. Very short lines, such as single letters, leak most often: about half the letter lines needed a second or third render.
- A note about delivery ("let the voice rise at the end") is read aloud more often than one about the character. Leave delivery to punctuation: a question mark is enough.
- A bare letter is read as its sound: "M" came out as "Mmm". Spell letter names out ("Em!", "Ay!", "Double-you!") and accept the single letter in the check. Without the letter-name sentence in the notes, "Ess!" once came back as "Ass" and "Ay!" as "I", so keep it.
- The Yorkshire voice says R as "Ah", which is how the letter is named in that accent; `letter-r` accepts "ah".
- Laughter does not transcribe reliably. "Hee hee!" may come back as "Hehehe", "[laughter]" or something unrelated, and "Ha ha, you found me!" as "You found me!" with the laugh left out. Accept the words without the laugh and listen to those clips on the review page.
- The check model hears some proper names loosely: "Bubble Bay" came back as "Boople Bay", "Purple Bay" and "Bauble Bay" before a take passed. Retrying is usually enough; change the text only when the word itself is ambiguous.
