# Background music

Put one looping music file per track in this folder. The game plays them in
the background, quieter than the sound effects (the music bus sits at 40% of
the effects level).

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
time. After adding or replacing a file, reload the page.
