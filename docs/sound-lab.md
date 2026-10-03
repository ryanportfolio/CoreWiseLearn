# Sound lab

The sound lab is a page for listening to every sound effect in the game,
trying other versions of each one, adjusting them, and recording which ones
you like. Your ratings and settings are saved as a file that guides the next
round of sound changes. The game itself does not change until those changes
are made in the code.

## Opening it

1. In the project folder, start the dev server: `npm run dev`
2. Open http://localhost:5173/CoreWiseLearn/dev/sound-lab.html (if the dev
   server picked another port, use the port it prints).
3. Click anything on the page once. Browsers keep sound off until the first
   click.

## What is on the page

The bar at the top:

- **Play all** plays every sound once, in order.
- **Play 20 s of gameplay** plays sounds in the order and rhythm of a bubble
  round: pops that climb in pitch, score ticks, one miss, one big pop, the
  round-complete fanfare and a sticker. Use it to judge how the sounds work
  together and whether any of them wear on you.
- **Mute** silences everything. It stays muted after a reload, and it shares
  the setting with the game.
- **Export** and **Import** are described below.

Each sound has its own row:

- **Play** plays the sound with the sliders as they are now.
- **Combo 0 to 11**, **A to Z** and **Stars 1 to 3** (on pop, key and star
  only) play the climbing sequences a child hears: a pop combo, typing the
  alphabet, three stars landing.
- **Stars** rate the sound from 1 to 5. Click the same star again to clear
  it.
- **Notes** is a short free-text field, for example "too clicky" or "love
  this one".
- **A, B, C and D** play four versions of the sound:
  - A is the sound as it ships today.
  - B is one octave lower and darker.
  - C is woodier: more knock and noise, more ring, shorter.
  - D is softer and rounder: gentler start, longer ring, darker.
- **Make selected variant current** copies the last version you played
  (A to D) into the sliders, so you can adjust from there. The row then shows
  which version you started from, and adds "edited" once you move a slider.

## The sliders

Each slider plays the sound when you let go of it. A dimmed slider does
nothing for that particular sound.

- **Pitch** moves the sound up or down in semitones. 12 is one octave; -12
  is one octave lower.
- **Brightness** removes everything above the chosen frequency. Lower values
  sound darker, softer and less piercing.
- **Level** is how loud the sound is.
- **Attack** is how quickly the sound starts. Higher values give a softer,
  slower start.
- **Decay** is how long the sound rings after it starts. Higher values ring
  longer.
- **Waveform** blends the tone from a pure, flute-like sound (toward the
  minus side) to a reedier one (toward the plus side).
- **Overtone** is the ring or sparkle on top of the note, like the shimmer
  on a bell.
- **Noise** is the knock, click or fizz layer, like a mallet hitting wood or
  a bubble bursting.

## Saving, export and import

Everything you change is saved in the browser as you go, so closing or
reloading the page keeps your ratings, notes and slider settings.

**Export** does three things with the same data: it downloads
`sound-lab.json` to your browser's downloads folder, copies it to the
clipboard, and prints it in the browser console. Send that file (or paste
the clipboard) to whoever is retuning the sounds.

The file lists all 14 sounds. For each one it has the rating, the notes, the
version you started from, whether you edited it after that, the slider
settings, the original settings for comparison, and when you last changed
it.

**Import** loads a file you exported earlier, so you can continue on another
day or another computer. It replaces the ratings and settings on the page
with the ones in the file.
