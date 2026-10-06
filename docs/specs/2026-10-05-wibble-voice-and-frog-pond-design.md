# Wibble's voice and Frog Pond: design

Status: approved, 2026-10-05. Ships as four pull requests, in the order at the end.

## Goals

- Give the blue mascot a name, **Wibble**, and a voice that greets the child, says the letters of their name as they type it, names the games on the hub, and adds the occasional feel-good line.
- Add **Frog Pond**, a reading game for an early reader (first to second grade) with three activities: rhymes, sentence building with end punctuation, and compound words.
- Build a clip generator that turns a list of lines into checked voice files, so spoken words cost a script run instead of a recording session.

- Fill the empty voice slots of the six existing games that have them, using the four character voices.

Out of scope: in-game commentary from Wibble inside other games, and per-child spoken names.

## Voice cast

All clips come from Gemini 3.8 Flash TTS through OpenRouter, rendered once on the owner's machine and shipped as files. The game never calls the service.

| Role | Gemini voice | Director's notes (accent and character) |
|---|---|---|
| Wibble, the mascot | Zephyr | Yorkshire, northern England. Wibble, a small, round, wobbly blue jelly creature; giggly, warm, curious, delighted by everything. Voice: small, bright, giggly. |
| Northern postman (lead reading voice) | Achird | Broad Yorkshire, northern England. A kindly village postman in his fifties, gentle, unhurried, twinkly. |
| Scottish teacher | Vindemiatrix | Soft Scottish, Highlands. A gentle, encouraging primary-school teacher. |
| Storybook narrator | Charon | Warm received pronunciation, southern England. A children's television narrator, amused, cosy, a little posh. |
| London cheeky chap | Puck | Friendly London, light cockney. A cheeky, upbeat young market-stall lad. |

Every line shares one style note: "Talking to a five-year-old who is learning to read: slow, clear, every sound crisp, smiling." The characters are inspired by British children's television; none imitates a real performer, and Voice Replication is not used.

## Clip generator (`scripts/voice/`)

Input is one JSON file per clip folder (for example `scripts/voice/lines/wibble.json`) listing each clip's file name, voice role and text. The owner can edit these by hand.

For each line the script:

1. Sends the text to `POST https://openrouter.ai/api/v1/audio/speech` with model `google/gemini-3.8-flash-tts`, the role's voice, `response_format: "pcm"` (the only format Gemini accepts there; 24 kHz mono 16-bit), and an input in the director's-notes form: `### DIRECTOR'S NOTES` with the style and the role's notes, then `#### TRANSCRIPT` with the line.
2. Transcribes the result with `google/gemini-3.8-flash` and compares it with the line, ignoring case and punctuation and treating digits and number words as equal ("1" matches "one"). A line may list other accepted transcripts (a letter name may come back as "B" or "bee"). A mismatch is rendered again, up to three times; a line that still fails is reported and not written.
3. Trims silence from both ends, leaving 30 ms, normalises loudness to about -16 LUFS, and encodes a mono MP3 with ffmpeg (a dev tool already on the owner's machine; no npm dependency is added). MP3 because every existing game's loader accepts it and Shape Workshop accepts only MP3.
4. Writes the file into `public/voice/<folder>/`, updates that folder's clip list where the game uses one (`clips.json`, or `VOICE_CLIPS` in `src/games/letter-train/clips.ts`), and records a hash of the role, notes and text in `scripts/voice/lock.json`, so the next run renders only lines that changed.
5. Writes a listening page under `D:\screenshots\CoreWiseLearn\voice-review\` with every new clip, for the owner to approve before merge.

The API key comes from `OPENROUTER_API_KEY` in the environment and is never written to a file.

Lessons from the voice lab, built into the prompts:

- The model sometimes reads the director's notes aloud, and sometimes adds words ("Shh!", "First of all"). The transcription check catches both, and a retry usually fixes it.
- A note that describes delivery ("let the voice rise at the end") leaked repeatedly; the question mark in the line is enough.
- A bare letter is read as its sound ("M" became "Mmm"). Letter names are written out: "Em!", "Ay!", "Double-you!".

## Playing clips

A shared engine module plays voice clips on one channel: a new clip stops the one playing, so voices never stack or queue. It respects the speaker button, loads a folder's clips on first use, and treats a missing clip as silence with no error. The existing per-game loaders stay as they are.

## Wibble

**Name entry.** Each letter key pressed plays the letter's name in Wibble's voice, alongside the existing key note. Pressing Go spells the whole name back one letter at a time (about 0.35 s apart), then plays a greeting chosen from a small pool ("Ey up! In we go!", "Hiya! Let's play!"). Erasing a letter plays nothing. The names themselves are never spoken: a spoken name needs a pre-rendered clip of that name in a public repository, and the research rules out names leaving the device.

**Hub.** On the first arrival of a session Wibble says one hello line. Returning from a game, Wibble says a feel-good line about one time in three ("That were grand!", "Champion!"). Focusing or hovering a game tile for 0.4 s plays that game's name, so a child who cannot read hears what each tile is.

**Break nudge.** The yawning scene plays one sleepy line ("Ooh, I'm right sleepy...").

**Poking Wibble.** On the hub and on name entry, clicking Wibble makes it jiggle like jelly and say a ticklish line from a pool of about ten ("Ooh, that tickles!", "Hee hee!", "Wibble wobble!", "Boing!"), never the same line twice in a row. Its hit area is its body, at least 96 px on the shortest side at the hub's smallest mascot size (150 px). On the hub Wibble also joins keyboard navigation as one more control, so a key press on it pokes it; on name entry every key types a letter, so there it answers clicks only. A poke while Wibble is already talking adds the jiggle and no new line, so lines never stack. Pokes are the child's choice, so they do not count toward the one-line-per-minute cap on commentary. With the sound off, the jiggle still plays.

**Talking animation.** Wibble moves while it speaks, on every screen where it is drawn (name entry, hub, break nudge). When a clip loads, the player measures its loudness in 20 ms steps once and keeps that curve. While the clip plays, the loudness drives a jelly wobble: the body stretches up and squashes down with each syllable, pivoting on the feet through the existing `drawMascotAt` squash and stretch, with a small bounce on loud peaks. Between words it eases back to rest. The mouth also moves: a mouth-closed version of each pose is added to the art, and the drawing swaps between open and closed when the loudness crosses a threshold. The curve is read by index, so nothing is allocated per frame.

**Rules for every line** (from `docs/design.md` and the research): at most one commentary line per minute, never during active play, never sad, never asking the child to stay or come back, and nothing when the child leaves. Lines describe what happened or wonder aloud; they do not inflate.

## Voicing the existing games

Six games already play clips from `public/voice/<game>/` when the files exist; none ship yet. Each folder's README lists the exact file names and when they play. The generator fills them; no game code changes.

| Game | Clips | Voice |
|---|---|---|
| Letter Train | 26 letter names (`a.mp3` to `z.mp3`) | Northern postman |
| Ride Fare | penny, nickel, dime; numbers 1 to 20, then 30 to 90 | Northern postman |
| Dino Picnic | numbers 1 to 10; "more" | Scottish teacher |
| Web Playground | numbers 1 to 10; letters a to z; star, heart, kite | Scottish teacher |
| Piggy Parade | penny, nickel, dime, quarter; one, five, ten, twenty-five | London cheeky chap |
| Shape Workshop | circle, square, triangle, rectangle, star, heart, "half circle" | Storybook narrator |

The postman takes the two games with the most speech after Frog Pond. The London chap's market-stall character suits counting coins into piggies. 121 clips in all. Letter names are written out for the model ("Bee!", "Double-you!"), as the lab showed a bare letter is read as its sound.

## Frog Pond

One hub tile. Its scene is a pond with three spots, each shown by a picture: a frog on a lily pad (rhymes), a row of lily pads (sentences), and a bubbling pot (compound words; a stone fountain since the activity became Word fountain). Every round ends with stars and a sticker offer through the shared helpers, like the other games. A demonstration hand shows the first move of each activity; there is no instruction text.

**Rhyme snack.** The Scottish teacher says the target word (for example MAT), shown on the frog's lily pad. Bugs fly past carrying words. Clicking a rhyming bug: the frog's tongue catches it, the clip of that word plays in the postman's voice, and the frog puffs up with a sparkle. Each catch in a row plays the next note of a pentatonic scale, so catching every rhyme finishes a short tune. Clicking a word that does not rhyme: the bug dodges and the London voice says its word cheekily; nothing is lost. Some bugs may hide under leaves that flip when clicked. Word families come from the owner's list: -AT, -AN, -AP, -IG, -IT, -IP, -IN, -OG, -OP, -UT, -UG, -ET, -EN, -ID, -AG.

**Lily-pad sentences.** A picture shows a scene (a pig in a box). Word pads float in a scrambled order. The child clicks them in order and the frog hops pad to pad. The last step is a choice between a period pad and a question-mark pad; the sentence decides which is right ("The pig is in the box." against "Is the pig in the box?" or "Where is my hat?"). When the sentence is complete, the postman reads it with each word lighting up as it is spoken, and the picture acts it out. A pad clicked out of order wobbles and floats back. Pictures are built from a small set of characters and objects (pig, frog, bug, bat, jet, van, box, log, hat) and positions (in, on, by), so new sentences need no new art.

**Word pot** (renamed Word fountain on 2026-10-05: a stone fountain replaced the pot, and RAINBOW, POPCORN and BACKPACK replaced BEDBUG, ZIPLINE and HAIRBALL; see `docs/games/frog-pond.md`). Word bubbles float in a pot: halves of compound words and some that fit nothing. Clicking two joins them. A real word goes poof, the postman says it, and a picture of it swims out into the pond, where every word the child has made stays across sessions. A pair that makes no word bonks and both halves bounce back. The two halves join in reading order whichever is pressed first. A pot never holds both halves of another real word the halves can make (SEABED from SEAHORSE and BEDTIME), so every pair either makes one of the pot's words or bonks, every pot can be finished, and every word made has its picture. Word pot keeps its own hidden tier and word help, apart from Rhyme snack's. Words: pancake, football, starfish, bedtime, seahorse, baseball, ladybug, hopscotch, treetop, zipline, hairball, laptop, pigpen, bedbug, catfish, hotdog, sunset, hilltop, sandbox, bathtub. ("Batman" is left out: it is a trademark and its halves do not make the meaning.)

**Hearing words.** A word is spoken when it is used correctly, not when it is first clicked, so the child sounds it out first. The hidden difficulty starts speaking words on click after a long pause or several misses.

**Difficulty.** The existing adaptive difficulty moves sentences from 3 to 7 words, adds decoy words and bubbles, and speeds up the bugs. Misses only ease it.

**Performance.** Each word is drawn once into a cached image, never with text drawing inside a frame.

**Art.** New sprites in the house style (`public/art/manifest.json`): frog poses, bugs, lily pads, leaves, the pot, the sentence characters and objects, and one picture per compound word, generated the same way as the existing art.

## Pull requests, in order

1. **Wibble's voice.** Clip generator, shared voice player, Wibble clips (26 letter names, greetings, commentary, game names), the talking animation with mouth-closed poses, poking Wibble, and the name-entry, hub and break-nudge hooks. The same pull request voices the existing games: 121 clips from the generator, with updated clip lists and READMEs.
2. **Frog Pond: Rhyme snack.** The game shell, hub tile and first activity, with its word clips.
3. **Frog Pond: Lily-pad sentences.**
4. **Frog Pond: Word pot** (now Word fountain).

The "Market Stall and Coin Count Vault" session is adding two games in parallel. Frog Pond takes the next hub slot after theirs; this branch leaves the hub layout alone and syncs with `main` once their work merges.

## Verification

Each pull request: `npm run typecheck`, `npm run build`, and a headed-Chrome check of the changed screens with frame times from `window.__corewise.loop.stats`. The owner approves every new clip on the listening page before merge, and tests feel and sound on the children's laptop.
