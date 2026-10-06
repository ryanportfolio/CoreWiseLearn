# Voice, sound and generated art

> How the games get their spoken clips, sound effects and pictures. Detail lives in the files named here; this page says which tool does what and what every new game needs.

## Every new game ships voice

The children cannot read, so a game is not finished until it speaks. In the same change that adds the game:

1. **Its name on the hub.** Add a `game-<id>` line to `scripts/voice/lines/wibble.json` (the text is the game's title with "!", as the other `game-` lines) and render it. The hub plays it when a tile is hovered or focused for 0.4 s (`src/ui/wibble.ts`).
2. **Its learning material.** Every word, number, letter, coin or shape name the game shows as learning material gets a clip, played when the child uses it correctly (Frog Pond's rule: hearing a word on first click comes only as hidden help after a long pause or several misses). Write `scripts/voice/lines/<id>.json` with `"folder": "<id>"`, pick a role (below), render, and list every clip with when it plays in `public/voice/<id>/README.md` and the game's doc in `docs/games/`.
3. **The game plays them.** Most games list their clips at build time with `import.meta.glob('/public/voice/<id>/*.mp3')`, so a missing clip is silence with no request (see `src/games/coin-vault/voice.ts`, or the shared player in `src/audio/voice-player.ts`, which Frog Pond and Wibble use: one channel, a new clip stops the old one, `preload` loads a few at a time and `prioritize` puts the round's clips first). Shape Workshop, Web Playground and Letter Train read a clip list instead; the lines file's `list` field rewrites it.
4. **The owner listens.** The generator writes a listening page under `D:\screenshots\CoreWiseLearn\voice-review\<folder>\index.html`; point the owner to it in the handover.

`npm run build` runs `scripts/check-voice.mjs` first. It fails when a registered game has no `game-<id>` line, no lines file of its own, or a line whose MP3 is missing. A game that cannot speak yet goes in `scripts/voice/exempt.json` with the reason; the check fails again once the game has lines, so the exemption cannot go stale.

## Making voice clips

`node scripts/voice/generate.mjs scripts/voice/lines/<file>.json` (`--dry-run`, `--only a,b`, `--force`). Full behaviour, the lines-file format, the `list` options and the model quirks: `scripts/voice/README.md`. Needs `OPENROUTER_API_KEY` (see `secrets.md`) and ffmpeg.

- Speech: `google/gemini-3.8-flash-tts` through OpenRouter, `response_format: "pcm"` only. A check model (`google/gemini-3.8-flash`) transcribes each take and a mismatch renders again, up to three takes.
- Roles, in `scripts/voice/roles.json`, one shared style ("talking to a five-year-old who is learning to read"):

| Role | Gemini voice | Who | Used by |
|---|---|---|---|
| `wibble` | Zephyr | Yorkshire, the giggly blue jelly mascot | Hub, name entry, break nudge |
| `postman` | Achird | Broad Yorkshire village postman, the lead reading voice | Letter Train, Ride Fare, Frog Pond words |
| `teacher` | Vindemiatrix | Soft Highland Scottish primary teacher | Dino Picnic, Web Playground, Frog Pond targets |
| `narrator` | Charon | Warm received pronunciation, children's TV narrator | Shape Workshop, Coin Vault |
| `londoner` | Puck | Friendly light cockney market-stall lad | Piggy Parade, Market Stall, Frog Pond dodges |

  Give a new game a role whose character fits it, and spread games across roles. A new role is a `roles.json` entry: describe the person, never the delivery.
- Write lines the way they should sound: letter names spelled out ("Em!", "Double-you!"), and add same-sounding words to `accept` up front. The known mishearings and fixes are in `pitfalls.md` (2026-10-05 entries).
- `scripts/voice/lock.json` hashes each rendered line, so reruns render only what changed. Changing only `accept` does not re-render; use `--only`.
- Run `npm run build` after rendering so the game and the offline cache pick the clips up.
- Sentence clips that light words as they are read need word timings: `scripts/voice/word-onsets.py` (faster-whisper; steps in `scripts/voice/README.md`).

## Sound effects and music

Sound effects are synthesised in code, never files: `playSfx(audio, name, options)` from `src/audio/sfx.ts`, 14 names in variants A to D, all on the C major pentatonic scale so they never clash with the music. The list, the variants and how to render the fanfare ahead of time: `docs/audio/README.md` and `docs/adding-a-game.md`. Music plays from files in `public/music/` (see the README there); tracks come from the owner.

## Generated art

- Generate with the `codex-image-gen` skill: Codex CLI `codex exec` with its built-in image_gen tool (Frog Pond used `-m gpt-6-astra`, medium effort; the backend picks the image model and does not name it). Attach existing sprites as style references.
- House style for sprites: flat chunky vector, thick even dark navy outline, flat saturated fills, one soft highlight per part, simple faces with dark eyes, a white shine dot and pink cheeks; a fully transparent square canvas, one centred subject filling about 80 percent; no text, letters, numbers or logos; no faces on objects (animals and characters may have one).
- Preparation for sprites (a scratch sharp script; `scripts/prepare-art.mjs` fits and encodes but does not crop): clear alpha under 12, crop to the alpha bounds, fit the longest side to 410 px centred on a 512x512 transparent canvas with Lanczos 3, WebP quality 92 with alpha quality 100.
- Record every image's prompt, references, date, attempts and preparation in `public/art/manifest.json` (and update its file count and total bytes), and keep raw outputs outside the repo under `D:/CoreWise/_artifacts/CoreWiseLearn/`. World-level style rules and older art records: `docs/style-bible.md`.
- Check every new picture by eye on a contact sheet under `D:\screenshots\CoreWiseLearn\` before it ships; small pictures must read at swimmer or tile size.
