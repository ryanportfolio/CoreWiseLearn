# Pencil Path voice clips

Short spoken clips for Pencil Path. All 5 below ship as MP3, in the narrator's voice: Gemini's Charon with a warm received pronunciation, rendered by `scripts/voice/generate.mjs` from `scripts/voice/lines/pencil-path.json`. Edit the lines there and run the generator rather than replacing files by hand. The game plays a clip only when its file is in this folder when the app is built; a missing clip is skipped without a sound or a request.

Pencil Path teaches no words, numbers or letters, so its clips invite and show. The win has no voice: the fanfare, confetti and stars mark it. None of them says anything is wrong.

| File | Said | When it plays |
| --- | --- | --- |
| `start.mp3` | "Draw a path to the cup!" | Page 1 opens, the first time in a visit. No other page has an invitation. |
| `watch-1.mp3` | "Watch the pencil!" | The pencil starts showing a way: after two misses, after ten seconds on a blank page, or when a keyboard player asks it to draw. Not when the start clip was under two seconds ago. |
| `watch-2.mp3` | "Look, like this!" | As above. |
| `again-1.mp3` | "Ooh, nearly! Let's have another go." | The marble pops back onto its pin after a miss, at most once every six seconds, and not on the miss that starts the pencil's help. |
| `again-2.mp3` | "Back it comes! Try a new line." | As above. |

Wibble names the game on the hub with `public/voice/wibble/game-pencil-path.mp3` ("Pencil Path!").

Keep each clip short, trimmed of silence at both ends, and at a similar loudness to the sound effects. After adding or removing files, run `npm run build` so the game and the offline cache pick them up.
