# Art and audio direction

Research digest section 5. Date: 2026-10-02. Every sourced claim links to its source. Items marked **(judgment)** are expert judgment with no direct source; tune them by watching the two children play.

## Decisions this section makes

The research disagreed on several art and audio points. These are the calls:

| Question | Decision |
|---|---|
| Cursor | Keep the OS cursor visible, using a custom CSS cursor image. Draw a halo on the canvas at the true hit radius. The mascot follows as a cosmetic buddy and is never the hit point. |
| What sets pop pitch | One parameter, one owner. The **note** is the count step (pop *n* of the current counted row). Bubble **size** sets the noise-body filter, not the note. **Combo** drives music layers and one flourish, not pitch. |
| Beat sync | Pop and keystroke sounds play in the same frame as the input. Only ambient motion and the music follow the beat. |
| Hit-stop and shake | None on ordinary pops. A gentle zoom is allowed only in the round-end finale. |
| Flash limit | At most 3 flashes per second, and any flashing region stays under 21,824 CSS px² (the stricter of the two figures found). |
| Mute | One mute button with three visible states: on, muted, blocked. A "music off" level exists only as `musicGain` in developer JSON. |
| Reduced motion | Read `prefers-reduced-motion`, with a developer JSON `motionScale` override. No settings screen. |
| Audio unlock | The first `pointerdown` or `keydown` anywhere unlocks audio and plays its own sound in the same handler. There is no "press to start" gate. Attract mode runs silent until then. |

## Shared visual rules

### One style bible for the whole hub

Toca Boca keeps "quality and consistency across all of our products" through a few fixed principles, and its artists are free inside them ([Motionographer](https://motionographer.com/2016/04/27/the-design-process-behind-toca-bocas-infectious-apps/)). Bluey uses a written style bible of do's and don'ts ([It's Nice That](https://www.itsnicethat.com/features/how-we-built-bluey-s-world-cartoon-background-scenery-art-director-catriona-drummond-animation-090725)). Keep a one-page `docs/style-bible.md` that fixes these shared anchors:

- corner-radius token: 20 to 30 percent of the shorter side **(judgment)**
- outline weight in CSS px
- palette tokens and tint ladder
- the mascot and eye spec
- the shadow rule and the icon set
- one line per game naming its medium (vector, pixel or AI sprite)

Each game may change medium, but not these anchors.

### Shape language

Bluey's art director: "Circles are round, friendly and soft", "Triangles are sharp, aggressive". The show's world is built from "big, friendly, rounded rectangles" ([It's Nice That](https://www.itsnicethat.com/features/how-we-built-bluey-s-world-cartoon-background-scenery-art-director-catriona-drummond-animation-090725)). No peer-reviewed test of this in 4 to 5 year olds was found, so treat it as a house rule. Its main effect here is on the monster theme: horns, teeth and spikes are drawn as rounded nubs.

Stage scenes flat and head-on, on one level ground plane, as Bluey does ([It's Nice That](https://www.itsnicethat.com/features/how-we-built-bluey-s-world-cartoon-background-scenery-art-director-catriona-drummond-animation-090725)). Use 3 to 4 parallax layers, each pre-rendered once **(judgment)**.

### Palette and chroma budget

- **Saturation by area.** Full-chroma hues go only on small interactive things. Large areas use lighter tints of the same hues. In an eye-tracking study of children aged 4 to 7, lightening toy colours raised their share of fixation from 0.51 to 0.74 until they got too close to white, where it dropped to 0.44 ([PMC10771309](https://pmc.ncbi.nlm.nih.gov/articles/PMC10771309/)). For each hue, store one "pop" value plus 2 to 3 tints, and draw backgrounds only from the tints.
- **One highlight colour.** Sesame Workshop says interactive elements should differ from the rest of the screen in colour, line weight and art style, sit on one strong highlight colour (bright yellow or neon green), and be animated. Nothing should look touchable unless it is ([Sesame 2012](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)).
- **Category colours.** Take them from Okabe-Ito (#E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #D55E00, #CC79A7) and colour-code at most about 8 items ([Wilke](https://clauswilke.com/dataviz/color-pitfalls.html)).
- **Colours the child learns to name.** These need prototypical hues, which Okabe-Ito shifts. For red, use #FF2000 or #FF1414, never dark red ([CUD](https://jfly.uni-koeln.de/color/)).
- **Never colour alone.** Pair every colour code with a shape or pattern, as WCAG requires ([WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). For example, red is always a star and blue is always a circle **(judgment)**. Check each screen in grayscale and with the Chrome DevTools colour-vision emulation.

### Outlines, shadows and contrast

Two findings seem to clash. Bluey bans black line art and neutral grey shadows ([It's Nice That](https://www.itsnicethat.com/features/how-we-built-bluey-s-world-cartoon-background-scenery-art-director-catriona-drummond-animation-090725)). The colour-vision guidance asks for thick, dark edges ([CUD](https://jfly.uni-koeln.de/color/)).

Resolution: draw a 3 to 4 CSS px outline in a dark tint of each object's own fill, and bake it into the cached sprite. Each interactive sprite needs at least 3:1 luminance contrast against its background ([WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). A small script in `scripts/` can compute every palette-against-background ratio and fail anything under 3:1.

Bubbles use a solid fill, a darker-tinted rim and a flat highlight blob, not a see-through soap look. Low contrast "hinders concentration" ([PMC10771309](https://pmc.ncbi.nlm.nih.gov/articles/PMC10771309/)), and a pale bubble on a pale sea will likely vanish on a weak panel **(judgment)**.

## Per-theme guidance

This whole table is **(judgment)**, applying the rules above. One warning applies across it: a 6 year old dismissed a site as "for babies" because of "the cartoons and trains" ([NN/g](https://www.nngroup.com/articles/childrens-websites-usability-issues/)). The vehicle theme will age out first, so give it a less toddler-styled look.

| Theme | Background tints | Interactive pop hues | Silhouette feature on the outline | Quirk ideas |
|---|---|---|---|---|
| Animals, sea, bugs | pale aqua, sand | coral, yellow, teal | fins, antennae, shell spiral | fish in a hat, a bug that sneezes |
| Vehicles, trains, rockets | sky tint, soft grey-green (no neutral grey) | primary red, blue, yellow | funnel, nose cone, round wheels | a train that toots off-key |
| Dinos, monsters, dragons | moss, dusk lilac | lime, orange, purple | rounded horn nubs, back plates as bumps | a dragon that sneezes bubbles |
| Fairy, candy, rainbow | blush, mint | pink, gold, violet | wings, wand star, swirl top | a cupcake that hiccups |

Toca puts "a weird, quirky element" in every scene ([Motionographer](https://motionographer.com/2016/04/27/the-design-process-behind-toca-bocas-infectious-apps/)). Sago Mini tunes "the silly factor" in playtests ([Crossplay](https://www.crossplay.news/p/making-games-for-young-children-is)). Make about 1 in 15 pops a funny variant **(judgment)**, and judge it by laughter.

Borrow Pikmin's trick for small characters (a leaf on the head) but not its "somber" mood ([Game Developer](https://www.gamedeveloper.com/business/early-pikmin-concepts-included-creatures-powered-by-ai-chips-and-yoshi-like-blobs)).

## Character design

- **Proportions.** Start at a 1:2 head-to-body ratio, with a wide round face, a high forehead, big eyes, and a small nose and mouth. Children aged 3 to 6 rated more baby-like faces cuter across species (p = .001) ([Borgi 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4019884/)). In an adult sample, 1:2 drew the longest fixation ([Chen and Lin 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13422462/)).
- **Eyes.** Don't push them bigger and don't drift toward realism. Children aged 5 to 7 preferred 100 percent eye size over 125 and 150, and their liking bottomed out at 80 percent realism ([Feng 2018](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0206343)). Draw solid dot eyes with one highlight: no lashes, teeth or fur texture.
- **Silhouette.** Each character gets one simple shape with one signature feature on its outline. It must still read as a black shape at 48 px. Kirby was kept simple "so that anyone would be able to draw him" ([Wikipedia](https://en.wikipedia.org/wiki/Kirby_(character))). A check script can threshold every cached sprite at 48 px for review **(judgment)**.
- **Face and emotion.** Kirby is "neutral... designed to reflect the player's emotions" ([Wikipedia](https://en.wikipedia.org/wiki/Kirby_(character))). Use a calm resting face and four states (idle smile, delight, curious, yawn), and show feeling through squash, bounce and blink.
- **Never sad, pleading or hurt.** Apps that prolong play use sad pets and lines like "Don't leave your friends hungry!" ([Krahl](https://arxiv.org/html/2512.17819v1); [Radesky 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)). Preschoolers were apprehensive with a responsive robot dog ([Kahn 2006](https://doi.org/10.1075/is.7.3.13kah)), so meet click-mashing with a ticklish giggle, never a flinch.
- **Feedback must be big.** Children under 6 missed subtle character faces as feedback ([NN/g](https://www.nngroup.com/articles/kids-cognition/)). Meaning goes in large shape, colour and motion changes. Expressions are extra flavour.
- **Choice of characters.** Offer three or more odd characters that are neither boy nor girl, instead of a boy/girl pair ([Guardian](https://www.theguardian.com/games/2018/dec/06/toca-boca-video-games-good-for-children)).
- **Anticipation and follow-through.** A small wind-up before a reaction and an overshoot after it ([Wikipedia](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)). On anything the child triggers, keep the wind-up under about 150 ms **(judgment)**.

## Cursor and demonstrations

A canvas-drawn cursor trails the real pointer by at least a frame, and the gap grows when frames drop **(judgment)**. So keep the OS cursor visible with a custom CSS image. Chromium caps cursor images at 128 px and recommends 32, and an image over the cap is ignored ([MDN cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/cursor)). Use 64 px with a keyword fallback **(judgment)**, and test it on the target Chrome.

On the canvas, draw a soft halo the exact size of the hit radius: white inner stroke, dark tinted outer stroke. The mascot springs toward the pointer, and hits always test against the real pointer position.

Attract demos should show this same cursor and buddy doing the action, never a cartoon hand. In a trial with children aged 2 to 5, only 50 percent understood an on-screen hand as their own ([Hiniker 2016](http://faculty.washington.edu/jkientz/papers/Hiniker-HiddenSymbols-IJHCS2016.pdf)).

## Typography and glyphs

- **Typeface.** Use Andika (SIL, OFL). By default it has single-story a and g, and I, l and 1 are three distinct shapes ([SIL features](https://software.sil.org/andika/support/features/)). No "kids' font" has measurable benefits: a meta-analysis found g = -0.04 ([Azzarello 2026](https://doi.org/10.1007/s11881-026-00389-8)). Choose on glyph shape and licence.
- **Licence.** A subset font file counts as modified, so it cannot keep the name "Andika" ([OFL FAQ](https://raw.githubusercontent.com/silnrsi/font-andika/master/OFL-FAQ.txt)). Ship the unmodified files, or a renamed subset with `OFL.txt` beside it.
- **Case.** Show uppercase only. In a study of 1,113 preschoolers, lowercase letters were harder, and q, d, l and b were the four hardest of all 52 forms ([Bowles 2014](https://files.eric.ed.gov/fulltext/ED613911.pdf)).
- **Size and weight.** Glyphs the child must identify are at least 56 CSS px; name tiles and keys are at least 96 px. This extrapolates from older readers ([Hughes and Wilkins 2000](https://api.crossref.org/works/10.1111/1467-9817.00126)). Use Medium or SemiBold weight, because both very thin and very bold strokes hurt letter recognition ([Beier 2019](https://doi.org/10.1016/j.actpsy.2019.102904)).
- **Rendering.** Bake glyphs into an atlas after `document.fonts.load()` resolves; don't call `fillText` per frame ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)).

## Motion, juice and limits

| Effect | Parameter | Source |
|---|---|---|
| Pop squash | Bubble squashes wide and flat for 80 to 120 ms before bursting; area stays constant | [Wikipedia](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation), timing (judgment) |
| Settle easing | `cubic-bezier(0.22,1,0.36,1)`, 0.42 s | [valdemird](https://valdemird.com/blog/game-feel-on-the-web/) |
| Overshoot easing | `cubic-bezier(0.34,1.56,0.64,1)` | (judgment) |
| Pop burst | 6 to 10 particles, life 0.55 to 0.95 s, angle 2πi/n plus up to 0.6 rad jitter | [valdemird](https://valdemird.com/blog/game-feel-on-the-web/) |
| Particle pool | Typed arrays, about 150 live at most | (judgment) |
| Flashing | At most 3 per second; flashing region under 21,824 CSS px² | [WCAG 2.3.1](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html), [G176](https://www.w3.org/WAI/WCAG21/Techniques/general/G176) |
| Celebration | About 3 s, fading to still; any input skips it; 4 to 6 variants with no back-to-back repeat | [Krahl](https://arxiv.org/html/2512.17819v1), variants (judgment) |

- **Effects point at the target.** Decorative animation unrelated to the content cut 4 to 5 year olds' comprehension from 3.02 to 2.18 and pulled their gaze away; animation tied to the content did no harm ([PMC11651708](https://pmc.ncbi.nlm.nih.gov/articles/PMC11651708/)). Pop effects radiate from the popped bubble and the counter. Parallax stays slow and low in contrast.
- **No hit-stop or shake.** At 2 to 4 pops a second, a per-pop freeze would likely read as stutter on a weak GPU, and shake moves the very targets the child is aiming at **(judgment)**.
- **Vary the celebration.** One toddler quit games early to avoid a repeated monkey dance ([Zoolingo review](https://itunes.apple.com/us/rss/customerreviews/page=1/id=611668665/sortby=mostrecent/json)).
- **Reduced motion.** When `prefers-reduced-motion` is set, multiply zoom, parallax and large scale pulses by `motionScale` and turn them into fades. The bubbles' rise stays, but slower ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).
- **Show progress as objects.** Children understood progress at 0.91 when they could watch a cup fill, against 0.65 for a separate progress bar ([Hiniker 2016](http://faculty.washington.edu/jkientz/papers/Hiniker-HiddenSymbols-IJHCS2016.pdf)). Popped bubbles land in a visible jar. The numeral sits in a fixed counter, not on the bubbles ([Sesame 2012](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)).

## Generated-art pipeline

1. **Split by role.** Anything that animates or reacts is drawn procedurally: mascot, bubbles, stars, confetti, UI. AI generation is only for static single images: stickers, skin stills, backgrounds. OpenAI's own guide says its model "may occasionally struggle to maintain visual consistency for recurring characters" ([OpenAI](https://developers.openai.com/api/docs/guides/image-generation)).
2. **Generate.** Ask for `background: "transparent"` with png or webp output, a fixed prompt template per game, and no outline. Feed the first approved sprite back as a reference image ([OpenAI](https://developers.openai.com/api/docs/guides/image-generation)). Use `quality: "low"` while exploring.
3. **Build script.** A Node script using sharp does every step, in this order:
   - trim the sprite
   - alpha-bleed or premultiply before resizing, because filtering toward transparent black leaves dark fringes ([Real-Time Rendering](https://www.realtimerendering.com/blog/gpus-prefer-premultiplication/); [TexturePacker](https://www.codeandweb.com/texturepacker/documentation/texture-settings))
   - downscale to final size (a 96 CSS px sprite at DPR 1.5 needs about 144 px; allow up to 256 for squash headroom)
   - draw a uniform outline after the resize **(judgment)**
   - snap to the game's 16 to 32 colour palette file ([Lospec](https://lospec.com/palette-list)), in OKLab for flat art **(judgment)**
   - write a typed manifest

   Runtime `imageSmoothingQuality` defaults to "low" and is not Baseline ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality)), so never rely on runtime scaling.
4. **Human review of every sprite.** A single disturbing image earns 1-star reviews ([Khan Academy Kids review](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1378467217/sortby=mostrecent/json)). Checklist:
   - round, friendly eyes
   - no bared teeth
   - no extra limbs or body artifacts
   - nothing semi-realistic
   - no resemblance to famous characters

   Never let the model draw letters, numerals or counted items. About 40 percent of videos recommended to children on YouTube were found to be AI slop that leans on the alphabet ([Wikipedia](https://en.wikipedia.org/wiki/AI_slop)).
5. **Provenance.** Log the prompt, model, date and edits for each asset. Purely AI output carries no copyright; hand edits and arrangement do ([US Copyright Office](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)). GitHub Pages is public, so assume anyone can download the sprites.
6. **Placeholders.** Kenney's CC0 packs make v1 playable with no legal risk ([Kenney](https://kenney.nl/support)).

**Pixel art.** Pixel art needs whole-number scaling with smoothing off. At 1.5x, source pixels render as alternating 1- and 2-pixel widths. Render to a 683x384 base canvas and scale it up by an integer ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)). Never put two pixel scales, or pixel art next to smooth vector, on one screen **(judgment)**. No study tests how well 4 to 5 year olds read pixel art, so playtest it first.

## Audio

### Graph and unlock

- **One context.** Create one `AudioContext` with the default "interactive" hint, and generate sound at `ctx.sampleRate`. A mismatched sample rate forces resampling ([Web Audio spec](https://webaudio.github.io/web-audio-api/)).
- **Unlock.** Use capture-phase listeners for `pointerdown`, `pointerup`, `click`, `keydown` and `keyup`; mouse movement never unlocks audio ([Chrome](https://developer.chrome.com/blog/web-audio-autoplay); [MDN user activation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation)). Re-arm the listeners whenever `statechange` leaves "running". An installed desktop PWA may already be allowed sound ([Chrome autoplay](https://developer.chrome.com/blog/autoplay)), but don't rely on it.
- **Drop, don't queue.** Ignore SFX calls while the context is suspended, so a burst of key mashing doesn't fire all at once on resume **(judgment)**.
- **Library choice.** Vendor only ZzFX's `buildSamples` (MIT). Stock `zzfx()` creates its own `AudioContext` at module load and never calls `resume()` ([ZzFX source](https://raw.githubusercontent.com/KilledByAPixel/ZzFX/master/ZzFX.js)). Skip Tone.js, which is 76.6 KB gzipped ([Bundlephobia](https://bundlephobia.com/api/size?package=tone)). Use sfxr.me and the ZzFX designer only for auditioning sounds.
- **Signal chain.** `sfxBus` and `musicBus` feed a master gain, then a `DynamicsCompressorNode`, then a `WaveShaper` soft clip at about -3 dBFS, then the destination. The compressor alone is not a brickwall limiter: finite attack lets transients overshoot. It also adds makeup gain to the whole mix, about +3.4 dB at a -6 dB threshold with ratio 20 ([Web Audio spec](https://webaudio.github.io/web-audio-api/#DynamicsCompressorNode)). Measure loudness after the compressor.
- **Pre-render.** Build all SFX into `AudioBuffer`s at boot. Each pop is then one `start()` call ([ZzFX README](https://github.com/KilledByAPixel/ZzFX); [Adenot](https://padenot.github.io/web-audio-perf/)).
- **Sync visuals.** Read `outputLatency` and delay the pop's visual burst by it, capped near 120 ms. This matters for Bluetooth headphones ([web.dev](https://web.dev/articles/audio-output-latency)).
- **Hidden tab.** Suspend the context on `visibilitychange` when the page is hidden.

### SFX parameters

| Sound | Recipe | Source |
|---|---|---|
| Pop body | Noise burst through a bandpass in the 400 to 1200 Hz range; smaller bubble, higher cutoff | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques), [Minnaert](https://en.wikipedia.org/wiki/Bubble_(physics)) |
| Pop note | Sine blip on major pentatonic steps 0, 2, 4, 7, 9, 12; note *n* of the counted row, up to about an octave and a fifth, then a resolving ring; detune within ±10 cents | [UDLR devlog](https://deertwoheads.itch.io/udlr-modify/devlog/695577/audio-breakdown), [valdemird](https://valdemird.com/blog/game-feel-on-the-web/) |
| Variation | Random variation only in an unpitched sparkle layer of 4 to 5 variants, never twice in a row; recognition sounds stay identical every time | [A Sound Effect](https://www.asoundeffect.com/game-audio-immersion/) |
| Envelope | Attack 5 to 12 ms, release 10 to 20 ms, frequent sounds under 150 ms | [valdemird](https://valdemird.com/blog/game-feel-on-the-web/), times (judgment) |
| EQ | High-pass near 120 Hz; cut 3 to 4 dB around 3 to 5 kHz on bright sounds | [SCENIHR](https://ec.europa.eu/health/ph_risk/committees/04_scenihr/docs/scenihr_o_018.pdf), values (judgment) |
| Miss | Soft bloop at about a third of success gain, or silence plus a visual wobble; never a buzzer or falling tones | [Paz 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12598441/), [Nintendo](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-3-big-brain-academy-brain-vs-brain-part-2/) |
| Name-entry key | Fixed pentatonic note per letter; ignore `KeyboardEvent.repeat`; merge presses within 30 ms; hovering a name bubble replays the name as a tune | [Sago Music Box](https://sagomini.com/article/music-box-letter-to-parents/), mapping (judgment) |
| Voices | Cap at 8 and steal the oldest; lower per-voice gain as the count rises | (judgment) |
| Round end | 1 to 3 rising notes in sync with the stars, music ducked about 6 dB, no hurry-up tempo or stings | [Kondo](https://shmuplations.com/kojikondo/), [20K](https://www.20k.org/episodes/super-mario-bros) |

**Why pitch follows the count.** Rising tones read as gain in Mario's stings ([20K](https://www.20k.org/episodes/super-mario-bros)). Children aged 3 to 5 recognise happy, high-energy music best (40.1 percent) and calm or sad music least (30.9 to 33.0 percent) ([Paz 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12598441/)). Tying the note to the count makes counting audible without voice. That is why size and combo get other parameters.

Space the beats of a counted set 400 to 600 ms apart **(judgment)**. Tone trains under about 100 ms per sound carry only approximate quantity ([Barth 2005](https://pmc.ncbi.nlm.nih.gov/articles/PMC1236560/)).

Every sound has a visual twin, because "most kids under 5 can't read and may not know how to turn the sound on" ([Google](https://developers.google.com/building-for-kids/designing-engaging-apps)).

### Music

- **Synthesize it.** A decoded stereo loop at 48 kHz costs 384 KB per second ([Adenot](https://padenot.github.io/web-audio-perf/)), so 5 phrases x 3 layers would run to about 110 MB.
- **Phrases.** Build music from 8-bar phrases in one key, played in random order with no immediate repeat ([Kondo](https://shmuplations.com/kojikondo/); [Engadget](https://www.engadget.com/2007-03-08-gdc-07-koji-kondo-and-the-art-of-interactive-music.html)). At 100 BPM a phrase lasts 19.2 s; with 5 phrases, each recurs about every 96 s **(judgment)**.
- **Scheduler.** Use a lookahead scheduler on the audio clock: a 25 ms timer with 100 ms lookahead ([web.dev](https://web.dev/articles/audio-scheduling)).
- **Layers.** Add layers in order (pad and bass, then percussion, then arpeggio), fading in on bar boundaries as the combo grows and thinning, never cutting, after misses ([Game Audio Co](https://www.thegameaudioco.com/making-your-game-s-music-more-dynamic-vertical-layering-vs-horizontal-resequencing)). Unlocking one hub music layer per pet stage makes progress audible ([Pokemon Smile](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Smile)).
- **Beat sync.** Idle bubbles and the mascot pulse on the beat, the way Mario Wonder syncs world motion. Input sounds are never quantized: a 1/16 note at 120 BPM is 125 ms of lag ([Nintendo](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-11-super-mario-bros-wonder-part-3/)).
- **Ducking.** Duck music with `setTargetAtTime`: tau 0.03 s down, 0.25 s up ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)). Duck it while a count is shown ([Meyer 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8916741)).
- **Break nudge.** Slow the tempo 20 to 30 percent and drop the percussion **(judgment)**. The mascot animation carries the message, since children recognise calm music poorly.

### Loudness

- **Target.** Design to the WHO-ITU child figure of 75 dB(A) over 40 hours a week, not the adult 80 ([WHO-ITU](https://www.who.int/publications/i/item/9789241515276)). Headphone hardware allows up to 100 dB(A), so the device won't protect the child.
- **Starting levels.** Music about -28 LUFS integrated, SFX at most -22 LUFS short-term, peaks at -6 dBFS before the soft clip **(judgment)**. For reference, broadcast is -23 LUFS ([EBU R128](https://en.wikipedia.org/wiki/EBU_R_128)).
- **Music level, where findings conflict.** Findings put music anywhere from 6 to 18 dB under SFX. Start at 12 dB under SFX peaks.
- **Calibrate per laptop.** Play pink noise at 100 percent Windows volume and measure 50 cm from the speakers. Set the developer JSON `masterTrimDb` so the reading is 70 to 75 dB(A) **(judgment)**.
- **Fades.** Fade the master in over 250 ms on unlock, and ramp mute over 30 to 50 ms.
- **Adult test.** Before shipping, an adult plays for 30 minutes and reworks any sound that grates. Otherwise the adult in the room is the likely one to mute it ([A Sound Effect](https://www.asoundeffect.com/game-audio-immersion/)).

## Exemplars to study

| Exemplar | Study for |
|---|---|
| [Bluey style bible](https://www.itsnicethat.com/features/how-we-built-bluey-s-world-cartoon-background-scenery-art-director-catriona-drummond-animation-090725) | Rounded rectangles, tinted outlines and shadows, flat staging |
| [Toca Boca](https://motionographer.com/2016/04/27/the-design-process-behind-toca-bocas-infectious-apps/) | Consistency across apps, one quirk per scene, flat shading on low-end devices |
| [Kirby](https://en.wikipedia.org/wiki/Kirby_(character)) | Simple silhouette, neutral face |
| [Pop-o-lot](https://kneebouncers.com/games/popolot) | Closest comparable game: a face revealed on each pop, no score |
| [Sago Mini Music Box](https://sagomini.com/article/music-box-letter-to-parents/) | Every tap plays the next note; no wrong input |
| [Mario coin and stings](https://medium.com/game-audio-lookout/musical-sound-effects-in-the-super-mario-series-b14872fb2d94) | SFX tuned to the music's key |
| [Ocarina of Time field music](https://www.engadget.com/2007-03-08-gdc-07-koji-kondo-and-the-art-of-interactive-music.html) | Phrase shuffling for long sessions |
| [Juicy Breakout](https://github.com/grapefrukt/juicy-breakout) | Per-effect toggles for choosing a calm subset |
| [ZzFX designer](https://killedbyapixel.github.io/ZzFX) and [sfxr.me](https://sfxr.me) | Fast sound auditioning |
