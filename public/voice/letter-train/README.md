# Letter Train voice clips

Optional spoken letter names for Letter Train. None ship yet.

When a letter block clicks into its car, the game plays the clip for that letter if the file is here, and plays nothing if it is not.

## File names

One file per letter, named with the lower-case letter: `a.ogg`, `b.ogg` ... `z.ogg`. MP3 also works (`a.mp3`); when both exist, the OGG is used. Upper- and lower-case blocks of the same letter share one clip.

## Recording

- Say only the letter name ("bee" for `b`), warm and clear, under one second.
- Trim silence at both ends; mono; about -16 LUFS so clips sit with the sound effects.

## How the game finds them

The game only asks for clips listed in `src/games/letter-train/clips.ts`. After adding a file here, add its name to `VOICE_CLIPS` in that file (for example `'a.ogg'`) and run `npm run build` again. A letter that is not listed is never requested, so missing clips cause no network traffic. The clips ship once, from this folder; the build does not make a second hashed copy.
