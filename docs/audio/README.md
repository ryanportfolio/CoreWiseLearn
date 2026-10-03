# Sound effects

All sound effects are generated in code (`src/audio/sfx.ts`); no audio files
ship for them. Scenes call `playSfx(audio, name, options)` with one of 14
names: pop, pop-big, miss, key, backspace, go, button, hover, star, fanfare,
sticker, yawn, whoosh and tick. Background music is separate: it plays from
files in `public/music/` (see the README there).

## Variants

Every effect comes in four versions, A to D. A is the default.

| Variant | What it sounds like |
|---|---|
| A | The sound as designed. |
| B | Deeper: one octave lower and darker. |
| C | Woody: more knock and noise, more ring on top, shorter. |
| D | Soft and round: a slower start, a longer ring, darker. |

Three effects have their own versions instead of, or on top of, the shared
ones:

- **button** has four separate designs. A is a cartoon "bloop" (a quick
  pitch-up with a tiny wobble), B a wooden "tok" with a low thump, C a
  rubbery "boing" that dips and springs back up, D a two-note "bu-dum" with a
  soft knock.
- **star** C is a soft bell over a low note that glides gently up into the
  star's pitch.
- **whoosh** D keeps the soft, round character but is turned up to match the
  other versions.

The variants are listed in one table, `SFX_VARIANTS` in `src/audio/sfx.ts`.
The shared entries change the sound's settings (pitch, brightness, envelope,
noise and so on). An entry for one effect can replace the shared one, either
with different settings or with its own design. To add a fifth version E,
add `'E'` to the `SfxVariant` type and to `SFX_VARIANT_IDS`, then an E entry
under `shared`, and under `byEffect` for any effect that needs its own take.

## How a game picks its variants

A game or theme sets the versions it wants once, usually when its scene
starts:

```ts
import { setSfxVariants } from '../../audio/sfx';

setSfxVariants({ pop: 'B', 'pop-big': 'B', miss: 'D' });
```

From then on, `playSfx(audio, 'pop')` plays pop B. The setting covers the
whole app, so a scene that wants the defaults back sets them to `'A'` when it
starts. A single call can also ask for a version directly:
`playSfx(audio, 'pop', { variant: 'C' })`.

## The owner's ratings, 2026-10-03

The owner rated every sound in the sound lab (`dev/sound-lab.html`); the
export is saved next to this file as `sound-lab-2026-10-03.json`. Across
nearly every sound they wrote that the variants are good and could serve as
families for different games. That is why variants are now part of the game
code rather than a lab-only experiment.

| Sound | Rating | Owner's note | What changed |
|---|---|---|---|
| pop, pop-big, fanfare, sticker | 5 | Likes all versions. | Nothing. |
| miss, key, backspace, go | 4 | Likes all versions. | Nothing. |
| star | 4 | Likes all except C. | C replaced with a new idea: a soft bell over a low note gliding up. |
| yawn | 3 | No note. | Nothing yet. |
| whoosh | not rated | D is hard to hear. | D turned up to match the others. |
| tick | 5 | Good but hard to hear (raised the level to 2x). | Twice as loud by default, slightly lower and a touch longer, so it carries without sounding sharp. |
| hover | 2 | Hard to hear (raised the level to 2x). | Twice as loud by default and longer (about 70 ms to silence instead of 30), still soft. |
| button | 1 | Edited it, still "not fun". | Redesigned from scratch as four new low, warm takes (above). The bloop is the default because it is the most playful and short enough for menus pressed many times. Buttons ship at 70% level so they stay below the pops. |

Preview recordings of the round 2 sounds are in
`D:\CoreWise\_artifacts\CoreWiseLearn\audio-preview\round2\` on the owner's
machine.
