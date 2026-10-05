# Wibble voice clips

Wibble, the blue jelly mascot, speaks these clips on the name-entry screen, on the hub and in the break nudge. The voice is Gemini's Zephyr with a Yorkshire accent, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/wibble.json`. Edit the lines there and run the generator rather than replacing files by hand.

The game finds the clips at build time by reading this folder, so there is no clip list to update. A missing clip is silence, with no request and no error. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.

| Files | Said | When it plays |
| --- | --- | --- |
| `letter-a.mp3` to `letter-z.mp3` | The letter's name: "Ay!", "Bee!" ... "Zed!" | Name entry: each letter key pressed. Pressing Go spells the whole name back, one letter about every 0.35 s. Erasing a letter plays nothing. |
| `greet-1.mp3` to `greet-3.mp3` | "Ey up! In we go!", "Hiya! Let's play!", "Ooh, here we go!" | Name entry: after the name is spelled back on Go. One at random. |
| `hello-1.mp3` to `hello-3.mp3` | "Hello! I'm Wibble!", "Ey up! What shall we play?", "Hiya! I'm ever so glad you're here!" | Hub: the first arrival of a session. One at random. |
| `back-1.mp3` to `back-6.mp3` | "That were fun!", "Champion!", "Ooh, I liked that one!", "What shall we do next?", "Ooh, look at all these games!", "I wonder what's in there..." | Hub: returning from a game, about one time in three. |
| `tickle-1.mp3` to `tickle-10.mp3` | "Ooh, that tickles!", "Hee hee!", "Wibble wobble!", "Boing!" and six more | Hub and name entry: the child pokes Wibble. One at random, never the same line twice in a row, and none while Wibble is already talking. |
| `sleepy-1.mp3`, `sleepy-2.mp3` | "Ooh, I'm right sleepy...", "Shall we have a little rest?" | The break nudge, when Wibble yawns. |
| `game-bubble-pop.mp3`, `game-dino-picnic.mp3`, `game-letter-train.mp3`, `game-web-playground.mp3`, `game-shape-workshop.mp3`, `game-piggy-parade.mp3`, `game-ride-fare.mp3` | The game's name: "Bubble Bay!", "Dino Picnic!" ... "Ride Fare!" | Hub: a game tile is focused or hovered for 0.4 s, so a child who cannot read hears what it is. |

Clips play on one voice channel: a new clip stops the one playing, so voices never stack. They stay silent while the speaker is muted. Commentary (the hello, back and sleepy lines) is held to at most one line a minute and never plays during active play; pokes are the child's own choice and are not counted.

Each clip is mono MP3, trimmed to 30 ms of silence at each end and levelled to about -16 LUFS, so they sit with the sound effects.
