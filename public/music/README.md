# Background music

Put one looping music file per track in this folder. The game plays them in
the background, quieter than the sound effects. The music bus starts at -12 dB
(about 25% amplitude), with a separate master trim of -6 dB from config.json.
The owner supplies the tracks and tunes their levels on the intended laptop.

## File names

| File | Plays during |
|---|---|
| `name-entry.mp3` | Typing a name on the first screen |
| `hub.mp3` | The main menu with the game tiles |
| `ocean.mp3` | The bubble-popping game |
| `sticker-book.mp3` | The sticker book |

Use the names exactly as shown, all lower case.

## Formats

MP3 or OGG (Vorbis). The game looks for the `.mp3` first and uses the `.ogg`
only when there is no MP3. If an MP3 loop has a small gap or click where it
repeats, export the same piece as OGG and delete the MP3: OGG loops without
any padding.

## Exporting a loop

- Cut the file exactly on the loop point, with no silence at the start or the
  end. The last beat should lead straight back into the first.
- 44.1 kHz sample rate. Mono or stereo both work.
- Keep each file under 2 MB. About 30 to 90 seconds at 128 kbps fits easily.
- Mix it at a normal level. The game turns the music down by itself, so there
  is no need to export it quietly.

The player skips up to 0.1 seconds of pure digital silence at each end, which
covers the padding most MP3 encoders add, but a clean cut sounds best.

## Missing files

A missing file just means silence for that track. The game keeps working and
writes one line to the browser console, so you can add the tracks one at a
time.

The list of music files is read once, when `npm run dev` starts or when
`npm run build` runs, so a reload alone does not pick up a new file:

- After adding or removing a file, stop `npm run dev` (Ctrl+C), start it again,
  then reload the page.
- After replacing a file under the same name, reloading the page is enough in
  `npm run dev`.
- For `npm run preview` or a copy for the children's laptop, run
  `npm run build` again after any change to this folder.
