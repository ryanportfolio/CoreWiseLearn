# Letter Train voice clips

Optional spoken letter names for Letter Train. None ship yet.

When a letter block clicks into its car, the game plays the clip for that letter if the file is here, and plays nothing if it is not.

## File names

One file per letter, named with the lower-case letter: `a.ogg`, `b.ogg` ... `z.ogg`. MP3 also works (`a.mp3`); when both exist, the OGG is used. Upper- and lower-case blocks of the same letter share one clip.

## Recording

- Say only the letter name ("bee" for `b`), warm and clear, under one second.
- Trim silence at both ends; mono; about -16 LUFS so clips sit with the sound effects.

## How the game finds them

The build lists the files in this folder (`import.meta.glob` in `src/games/letter-train/voice.ts`), so a missing clip makes no network request. After adding or removing clips, run `npm run build` again.
