# Pencil Path

A glass marble waits on a push pin at the top of a sketchbook page. The child draws lines with the pencil, presses Go, and the marble drops and rolls along them. The page is done when the marble lands in the red paper cup. Twelve pages, in `src/games/pencil-path/levels.ts`, each built around one idea: a slide, a jump over a hatched no-pencil strip, steering round an ink blot, bouncing off a pink eraser, diving low to climb into a raised cup, using a wooden ruler, getting past a spinning pencil, a short pencil, a high path over ink, sending the marble back the way it came, two spinning pencils, and all of them together.

The game was first built in the Games repo (github.com/ryanportfolio/Games, `games/pencil-path`) and ported here for this hub's rules: no words on screen, a voice, no failing, 96 px controls, and no gradients, text or allocations per frame.

## The action and its response

- Pressing on the page and dragging draws a pencil line (with a paper rustle). A quick press, under 0.3 s and 24 px, starts a line that follows the pointer with no button held; the next press ends it.
- When the pencil lifts, the line is tidied: a line close to one smooth curve becomes that curve, so a wobbly slide has no small dips for the marble to stop in. A line that is clearly another shape keeps its shape and loses only its jitter. A tidied line is kept only if it stays out of every no-pencil box.
- The pencil meter at the top shortens from its tip as pencil is used. When it runs out, the pencil stops drawing; Undo gives the pencil back.
- Go (the play arrow) drops the marble: its pin swings away and the marble rolls under gravity, with soft ticks as it rolls and a tick or a pop for each bump. Pressing Go or the page while it rolls puts the marble back on its pin.
- Drawing into a hatched box lifts the pencil at the box's edge (the box flashes) and draws again once the pointer leaves it.

## Discovery without words

- The first time page 1 opens in a visit, the narrator invites once ("Draw a path to the cup!"). No other page has an invitation.
- On any page not finished yet, the pencil draws a way as a dashed line, lifts off and glides back. The dashes stay faint on the page to trace over.
- A page left blank for ten seconds gets the same demonstration.
- The marble rocks gently on its pin while it waits.

## Round flow

A round is one page. Landing in the cup plays the fanfare and confetti; stars slam in at the top (three when the line used little pencil, two or one otherwise; every finished page earns at least one), with no voice. After the stars, a still rest screen shows Again (the play arrow, which opens the next page) and Home. `services.roundBoundary()` runs once on reaching the rest screen. The round and the reward star are written before the celebration shows.

Star thresholds per page come from the shortest winning drawing a search of thousands of random drawings found: three stars up to twice that length plus 6 cm, two stars up to three times plus 10 cm.

## Misses ease, never fail

The marble touching ink, rolling off the page, or stopping outside the cup is a miss. The marble fades (ink splashes if it was ink) and pops back onto its pin with the child's lines untouched. The second miss on a page starts the pencil's demonstration, and so does every fourth after that. There is no other difficulty change: the pages are fixed and all open, and the game always continues from the page after the last one finished.

## Fairness check

`node scripts/check-pencil-path.mjs` runs the game's own physics (`physics.ts` imports nothing, so Node runs it directly). Every page must win with its reference drawing within its pencil and outside the no-pencil boxes, must not win with nothing drawn, and must still win for at least 65% of 300 wobbly copies of the reference drawing (smooth wobble of up to 0.9 cm, ends up to 1 cm short or long, tidied as on pen-up). At this writing all twelve pass at 69% to 100%.

## Keyboard-only play

Any key on a page with no line asks the pencil to draw its line; when it finishes, that line is the drawing, and the next key presses Go. Go shows the focus ring while keys are in use. Backspace or Delete undoes the last line. Escape goes home; Tab moves focus to the corner Home and Sound buttons (arrows switch between them, Enter or Space presses). On the rest screen the first key shows focus, arrows move it, and the next key presses it.

## Art

The page is drawn in code: cream paper with fibres and a centimetre dot grid, hatched no-pencil boxes, ink blots, wooden rulers with tick marks, pink erasers, and a red paper cup whose front walls are drawn over the marble so it sits inside. The marble is glass with an orange swirl that turns as it rolls. Home, Go, Undo and Sound use the shared button art. The hub tile, `public/art/pencil-path/tile.webp`, is recorded in `public/art/manifest.json`.

## Sound

Shared effects only (`src/audio/sfx.ts`): `paper-rustle` while drawing, `go` on release, `tick` for rolling and bumps, `pop-big` for an eraser, `miss` or `whoosh` for a miss, `pop` as the marble returns, `backspace` for Undo, `star` per star, `fanfare` at the cup (prepared when a page opens and on Go), and `whoosh` for Again. No music.

## Voice clip slots

See `public/voice/pencil-path/README.md`.

## Performance

The paper, the page's objects and the cup's back are baked into one window-sized layer, and the cup's front walls into another, when the page or the window changes. The marble is three baked pieces. Per frame there are paths and image copies only; physics steps allocate nothing. In headed Chrome at 1366x768 the scene's update and render took 0.2 ms at the 95th percentile.

## Files

- `index.ts` definition, `data.ts` save bag and validator (`page`, `best`, `rounds`)
- `scene.ts` round shell, drawing, demonstration, keyboard
- `physics.ts` marble physics, shape assist
- `levels.ts` the twelve pages and their reference drawings
- `paint.ts` drawing
- `voice.ts` clip lists
- `scripts/check-pencil-path.mjs` fairness check; `dev/pencil-path.html` dev page (`?debug` exposes `window.__pencilPath`)
