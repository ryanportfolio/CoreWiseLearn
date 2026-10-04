# Web Playground

A round game in a toy-scale comic city. An original kid hero in a red hood, blue gloves and a yellow star badge holds up a number or a letter; the child finds the matching floating web ball, and the hero catches it with a web. Then the child joins numbered or lettered web points in order to spin a picture that sparkles.

Owner direction (2026-10-03): the game is for the nephew, who loves Spider-Man, so it keeps a web-slinging city vibe, but the hero is original. No Spider-Man name, logo, mask, spider shapes or likeness appear in code, art or prompts. The core activity is numbers and letters, not swinging; one short swing is the transition between the two activities.

Registry: `id: 'web-playground'`, `mode: 'round'`, `learning: ['counting', 'letters']`, themes `numbers`, `letters`, `city`.

## One round

1. **Swing in** (about 1.7 s). The hero swings into the day city on a web line and lands on the rooftop at the left. This shows the web before the child does anything.
2. **Catch** (6 catches). Three to five round web balls float gently over the sky, each with a numeral or a capital letter. The hero holds up a comic sign with the wanted glyph; for numbers the sign also shows that many dots in a ten-frame (two rows of five). The child clicks the matching ball. The hero shoots a web (a short "thwip"), the ball is pulled in, pops into a small burst and flies to a string of caught balls at the top. A new ball floats in to replace it, and the sign changes. The new ball never repeats a glyph already floating; when every value is in use (five values, five balls) it takes the value just caught.
3. **Swing across** (about 1.6 s, automatic). The hero swings off to the right while the city pans from day to dusk. Nothing to press; it always succeeds.
4. **Connect** (5, 7 or 10 points). Web points with numerals 1, 2, 3 ... or letters A, B, C ... sit around a hidden picture: a star, a heart or a kite, taking turns by round. Point 1 (or A) starts lit. Each click on the next point shoots a web thread to it with a climbing note. After the last point the thread closes the shape, the picture fills with colour and sparkles. The threads always make the picture that fills in: star and kite threads are straight and the star and kite are exactly those polygons; heart threads curve along the heart outline between points, so five points already spin a heart, not a pentagon. Heart points sit at equal straight-line gaps from their neighbours (not equal steps along the curve), so the two points either side of the tip are as far apart as any other pair.

   The picture is fitted to the view, at its own proportions or stretched up to 20 percent: first in the space right of the hero (above him on narrow views) with the tier's point size, then with points at the 100 px floor. Where neighbouring points would still come closer than 16 px, the picture grows just enough into the space between the corner buttons, on the same bottom line, as long as no point or outline comes near those buttons; then the same again with 8 px. A view too small for that many points without overlap gets fewer: 10 become 7, 7 become 5. Where even five points do not fit (a large uiScale on a short view, such as the kite at 800x600 with uiScale 2), space is reclaimed for them: the picture may reach down to the bottom of the view instead of keeping its usual margin, first right of the hero and then across the whole width, above and beside him. Connect points are drawn over the hero, so none is ever hidden behind him. At every size from 390x600 up and every uiScale from 0.75 to 2, no two points overlap and none is under 100 px. At 1366x768 every picture keeps all its points. At 800x600 only the ten-point kite drops to 7. At 390x600 the ten-point star drops to 7, and hearts and kites use 5. The count is chosen when the round starts and again when the connect begins. A resize during the connect keeps it while it still fits; when it no longer does, only points still to come are dropped: the same picture is laid out again with the most points that fit (any count for hearts and kites, 8, 7 or 5 for stars, which are drawn in one stroke), first in the usual area and then in reclaimed space, as long as every joined point and the next one remain, so the joined numerals or letters stay joined and the next one stays next. If even that cannot fit (many points already joined, then a much smaller view), the points still to come go too, along with any joined points past the most that fit: the joined points that fit stay joined, the picture closes with them, and the round ends a step early. Smaller spacing alone cannot help, because by then the points already sit at the 100 px floor and the least gap. After the connect, while the finished picture fills in and through the celebration, a resize refits the picture so it stays whole and centred in the view.
5. **Celebration**, then the **sticker choice**, then the **still rest** with Again and Home.

Rounds alternate numbers and letters: the first round, and every second one after, uses numbers.

## Immediate response to every action

- Matching ball: hero switches to the shooting pose, web line extends in 0.15 s, the ball is pulled to the hero's hand in 0.35 s, pops (pooled particles), a pitched pop that climbs with each catch, and the ball flies to the caught string, drawn above the sign.
- A different ball: it wiggles and makes a soft low boop, and the hint starts (below). Nothing is lost; the count never goes down.
- Empty sky: a small white web puff where the pointer landed. No sound, no penalty.
- A ball still dropping in (0.6 s) is not a target until it has landed in the play area, clear of the corner buttons: a click on it gets a puff and a wiggle and records nothing, and a key waits for it (the hero hops). Its drop can pass under the sound button; a click there always toggles the sound.
- A click while a catch is still flying in (about 0.6 s): a web puff, and the ball under the pointer wiggles. Nothing is recorded. A key in that moment makes the hero hop and the sign wobble. The next request comes 0.12 s after the pop.
- A click during the swing-in, the swing across or the picture filling in: a web puff.
- Next connect point: a thread shoots from the last point; the point bounces and its note rises one step on the pentatonic scale.
- Any other connect point: wiggle and soft boop, and the next point glows.

## Discovery without words

- The swing-in shows the web.
- First round of a profile: the hero holds up the first sign, waits 1.2 s, then catches the matching ball himself. The next request shows its glow from the start. From the third request on, the glow waits.
- First connect of a profile: the hero draws the thread from point 1 to point 2 himself, then point 3 glows.
- The hint (after a few seconds without input, or after a different ball or point): the hero switches to his outstretched-arm pose, turns so his hand aims at the wanted ball or next point and reaches towards it in a slow pulse, for as long as the hint lasts. The target bounces (scale pulse), sits on a wide pulsing yellow halo, wears a thick yellow ring and has a big bouncing arrow above it. The dotted trail from his hand fades out where it passes near another ball or point, so it never crosses a target it does not lead to. The hero also hops every 8 s. Nothing times out and nothing happens without the child, apart from the two first-round demonstrations.

## Learning progression (separate from motor tiers)

Two hidden levels per profile, `numberLevel` and `letterLevel`, 0 to 2. They change only between rounds.

| Level | Numbers: sign | Numbers: balls | Numbers: connect | Letters: sign | Letters: balls | Letters: connect |
|---|---|---|---|---|---|---|
| 0 | numeral and dots | 1 to 5 | 1 to 5 | capital | A to E | A to E |
| 1 | numeral and dots | 1 to 10 | 1 to 7 | capital | A to Z | A to G |
| 2 | dots only | 1 to 10 | 1 to 10 | small letter | capitals A to Z | A to J |

Level 2 asks for a real skill: count the dots and find the numeral, or pair a small letter with its capital.

**What counts as learning evidence:**

- A click on a ball before its glow appeared: correct if it matches, wrong if not.
- A click on a connect point before its glow appeared, but only when the step needs the glyph: the next point is not clearly the nearest unjoined point to the last joined one (some other unjoined point is no more than 15 percent farther away, or nearer). When the next point is plainly the nearest neighbour along the outline, a child can follow the shape without reading, so the click joins the thread as usual and records nothing, right or wrong. With the current layouts: the five- and seven-point stars need the glyph on every step but the last; the ten-point star on about half its steps; a heart on its first step only (both neighbours of point 1 are equally near); a kite on one or two steps. The rest of a walk round a heart or kite records nothing. `stepNeedsGlyph()` in `content.ts` holds the rule.
- A key whose character matches the wanted glyph (digit keys for numbers, letter keys for letters) before the glow: correct, in both activities, because choosing that key names the glyph.
- Anything after the glow, any non-matching key, and the hero's own demonstrations: assisted, not evidence.
- A click on the ball or point that wears the keyboard ring (below): assisted, not evidence, because the ring shows the answer. A pointer press hides the ring until the next key, so mouse play without the ring records as above.
- Ten has no single key, so a keyboard catch of 10 is always assisted.

**Level change after a round of that type:** up one level after two rounds in a row with at least 7 correct and at most 1 wrong; down one level when a round has at least 3 wrong and wrong is at least half of correct. Otherwise the streak counter resets. Nothing is shown to the child.

## Motor tiers (separate from learning)

Three hidden tiers, changed only between rounds.

| Tier | Ball diameter | Balls on screen | Float wobble | Hit padding | Connect point diameter |
|---|---|---|---|---|---|
| 0 | 150 px | 3 | 8 px | 1.25 | 124 px |
| 1 | 130 px | 4 | 16 px | 1.15 | 112 px |
| 2 | 112 px | 5 | 26 px | 1.08 | 100 px |

Sizes are at 1366x768 and scale with the view; balls and points never go below 100 px across, so the drawn disc still measures at least 96 px after edge smoothing. The connect point's visible paper disc is the full point diameter, outline included. When the ball area is less than 2.5 balls wide (a narrow window such as 390x600), the catch uses three balls in a zigzag column so none overlap. Where the balls' places would bring two of them within 2 px of each other at the widest bob and sway (a large config `uiScale`), the balls shrink until they fit, never below 100 px; still crowded at 100 px, the bob and sway calm down to half their width; still crowded, the catch uses the narrow column (its balls sized the same way), then a calmer bob and sway again. At 800x600 and uiScale 1, tier 2 keeps its five balls with a bob and sway about 10 percent calmer. Past its 1366x768 size the sign grows only with the hero and into the room between the corner buttons and his head, so a large `uiScale` cannot make it bury him. A resize into a narrow view during the catch gives each floating ball its own place in that column: the wanted ball keeps one and any balls beyond three float away. A resize back to a wider view drops new balls into the empty places, up to the tier's count. A motor attempt is a pointer press during catch or connect while input is open. It is a hit when it lands inside the visible ball or point, and near when only the padding catches it. Keys are not motor attempts. Up one tier after two rounds in a row with at least 10 attempts and at least 90 percent hits; down one tier when a round has at least 6 attempts and fewer than 70 percent land inside the padded area.

## Stars and rewards

Every finished round earns at least one star:

- one star for the six catches,
- one star for the finished picture,
- one star for at least three finds without the glow (by click or matching key).

The first round of a profile earns three stars. Stars, the round count and the pending gift are saved in one immediate write before the celebration shows them (`pending` in the game bag, then `save.flush()`); re-entering with a pending round resumes at the sticker choice or the rest and never awards again. Each pending round carries a unique `id` (`crypto.randomUUID()`, with a fallback where that is missing), so when two tabs of one profile finish rounds with the same fields, the save still keeps them apart: choosing a gift in one tab never clears the other tab's waiting gift. Rounds saved before ids existed load and resume as before.

**Celebration** (4 s): the hero cheers in front of the finished picture, the stars land one by one with the shared star sound, and the caught balls are counted out in a row with a ticking numeral that sits just right of the last ball counted. A tap or key skips it, but not in the first 1.5 s or before the stars have appeared.

**Sticker choice** (while uncollected stickers remain and `rewardsEnabled` is true): two of this game's six stickers, drawn as stickers by the shared sticker-offer helper (`src/ui/sticker-offer.ts`; see `.claude/reference/architecture.md`): each has a white die-cut edge, a peeled-back corner and a slight tilt, bobs gently, and lifts while focused or hovered. A small closed sticker book with the hub's purple and star stands beside them; it takes no input: a click on it picks nothing, even where it reaches into an offer's tap area. The coloured ring frames they once sat in are gone. On a pick the sticker lifts, flies along a short arc into the book, shrinking, and the book bounces once as it lands while the other offer sinks and fades; the rest follows 0.92 s after the pick. Offers follow the sticker book's pages (8 stickers per page across the whole sticker list, in order): both come from this game's uncollected stickers on the earliest book page that still has one, chosen at random among them. When only one of this game's stickers is left on that page, it is offered alone; once that page is done, offers move to the next page. The page is counted from each sticker's place in the full list, so this game's six stickers can span two book pages. Input is ignored for 1.2 s. Nothing is focused at first; the first key only shows focus, arrows move it, and any other key chooses once the focus has shown for 0.25 s. Clicking a sticker (anywhere in its round tap area that the book does not cover) chooses it.

**Rest:** the sticker book with the chosen sticker on its cover in the middle (the emblem when no sticker was offered), the hero waving, Again and Home buttons of equal size and colour, at least 96 px across at every allowed `uiScale` (0.75 to 2). After a pick the book takes 0.45 s to move from beside the offers to the middle; then nothing moves. Input is ignored for 1.2 s and the keys work as on the choice. `services.roundBoundary()` runs once when the rest is reached.

## Keyboard-only play

- Catch: any key catches. A matching key catches its ball and counts as evidence; any other key catches the wanted ball. After a key, the wanted ball wears a light-and-dark keyboard ring so the next key press is predictable; a pointer press hides the ring until the next key (as in Letter Train), and a click on a ringed ball or point is assisted.
- Connect: a matching key draws to its point; any other key draws to the next point, which wears the keyboard ring.
- During the round (swing-in to the filled picture) every key plays, Escape, Tab and Enter included; no key leaves the round. The corner Home button still leaves at a click.
- On the celebration (once it can be skipped), the choice and the rest (after their 1.2 s guard): Escape goes Home, Tab cycles focus over the Home and sound corners, arrows switch between them, Enter activates the focused corner. These match Bubble Bay. The corner buttons sit at Bubble Bay's corner positions and sizes, so the break nudge's sound button covers this game's.

## Pause, resume and leaving

`pause()` stops music and flushes; `resume()` restarts music. During the round it blocks input for 0.35 s so the click that closed the break overlay cannot catch a ball, and play continues where it was. On the choice or rest it starts their guard over as on first appearance: nothing focused, input ignored for 1.2 s. Home during play leaves without awarding; Home during the celebration or choice keeps the pending gift, and the next entry resumes at the choice exactly once. Reaching the rest clears the stored round (everything is awarded by then), so leaving the rest by any route (Again, Home, the corner Home, Escape, a reload) starts a new round on the next entry.

## Art

Medium: kid comic book. Bold even black ink lines, flat saturated colours, light Ben-Day halftone dots on shadow sides, red and royal blue accents with sunny yellow. Everything is rounded and toy-like. Web balls, web points, threads, the sign, glyphs, dots, the pictures and corner web decorations are drawn in code. Letters, numerals and dots are never in generated images.

| File (public/art/web-playground/) | Use | Size |
|---|---|---|
| `hero-wave.webp` | hero idle on the rooftop, rest screen | 327x504 |
| `hero-shoot.webp` | web shot pose | 459x464 |
| `hero-swing.webp` | swings, celebration jump | 319x509 |
| `hero-cheer.webp` | picture finished, celebration | 406x495 |
| `city-day.webp` | catch background | 1920x1280 |
| `city-dusk.webp` | connect and reward background | 1920x1280 |
| `kitten.webp` | rooftop friend; sticker | 445x512 |
| `pigeon.webp` | rooftop friend in the day city; sticker | 512x496 |
| `girl.webp` | friend with a red balloon in the dusk city; sticker | 435x512 |
| `emblem.webp` | the hero's star badge; sticker; rest picture when no sticker is offered | 491x387 |
| `tile.webp` | hub icon: the hero mid-swing; sticker | 512x489 |

Stickers (appended to `STICKERS`): `web-playground-hero` (hero waving), `web-playground-swing` (hub icon art), `web-playground-kitten`, `web-playground-balloon` (the girl), `web-playground-pigeon`, `web-playground-badge` (emblem).

Provenance is listed at the end of this file.

## Sound

Shared effects only (`src/audio/sfx.ts`); no new patches. The scene sets `pop: 'C'` and `whoosh: 'C'` (the woody, shorter family suits comic thwips) on enter and puts them back to `'A'` on exit.

| Moment | Effect |
|---|---|
| web shot | `whoosh` |
| ball caught, point joined | `pop`, index climbs with each catch or point |
| other ball or point | `hover` at 60 percent: a soft boop |
| picture closes | `pop-big`, then `fanfare` |
| swing across | `whoosh` variant D |
| stars land | `star` with index |
| celebration count | `tick` |
| sticker chosen | `sticker` |
| Again, Home | `whoosh`, `button` |

Music: track `web-playground` (owner composes it; a missing file plays silence).

## Voice clip slots

No clips ship. `public/voice/web-playground/clips.json` lists the clip files that exist (shipped empty). When a request or point needs a glyph, the scene plays `number-<n>.mp3` or `letter-<x>.mp3` if that name is listed, and `picture-<star|heart|kite>.mp3` when a picture finishes. Unlisted names are skipped silently, so no request is made for a missing file. A clip plays only if it is still the current prompt when its file has loaded and decoded: a newer prompt, a catch or join, the round ending, a pause (the break nudge) or leaving the game drops it. See `public/voice/web-playground/README.md`.

## Performance plan

- Both backgrounds are decoded off the main thread after loading, then cover-fitted once per canvas size and pixel ratio into device-resolution canvases, at most one per frame (day first, then dusk), so the opening frames under the fade stay short. Each frame is one blit (two during the pan).
- The picture's fanfare is rendered ahead once per session like Bubble Bay's: the long first step of `prepareSfxStep(audio, 'fanfare')` runs when a round starts, under the enter fade or on the still rest after Again, and the note steps run in idle periods during play, so the frame the picture fills does not build the notes.
- The celebration counter's ten digits are baked in an idle period during play at the counter's current size (again after a resize changes that size) and drawn once under the backdrop, which uploads them, so the first celebration makes no canvas and calls no `fillText`. Fanfare notes take an idle period only when it has at least 4 ms left; a shorter period that timed out bakes the digits instead, so a busy machine that never offers 4 ms still has them ready (the fanfare then builds live when it plays, as before). A resize during the celebration keeps the baked size until the next idle period has baked the new one.
- Each web ball (disc, web pattern, rim and glyph) and each connect point is baked into a canvas when its value, the layout or the canvas pixel ratio changes, never per frame. The engine's adaptive resolution changes the ratio without changing the view size; every glyph canvas is then baked again at the new ratio, and each backdrop's old canvas stays drawn, stretched to the view, until its new one is made. The sign is baked when the request changes. Glyphs use the bundled Andika font after `ensureDisplayFont()`.
- Balls, flights and points live in fixed pools; particles use the shared pooled system with a capacity of 160.
- Per frame: drawImage calls, a few arcs and lines for web threads and glows, one filled path for the picture. No gradients, shadowBlur, fillText or allocation in update or render.
- Work time is measured into a ring buffer exposed on `stats.workMean` and `stats.workMax` like Bubble Bay.

## Art provenance

All art was generated on 2026-10-03 with the `codex-image-gen` skill: Codex CLI 0.159.0 (`codex exec -m gpt-6-astra -c model_reasoning_effort=medium -c model_provider=openai -s workspace-write`) calling its built-in `image_gen` tool. The tool did not report the image model's identifier. No prompt mentioned any existing character; prompts asked for an original hero with an uncovered face and excluded masks, spiders, web patterns, logos and text. Each result was reviewed by eye at full size and on light and dark backgrounds before use. The raw PNGs are kept outside the checkout in `D:/CoreWise/_artifacts/CoreWiseLearn/web-playground/`.

Processing: a scratch Node script with sharp split each transparent sheet into its parts by connected alpha regions (small separate pieces such as burst lines join their nearest part), trimmed the empty margin, scaled the longest side to 512 px with Lanczos resampling and wrote WebP at quality 92 with alpha quality 100. The first backgrounds were cover-resized to 1366x911 and written as WebP quality 86 without alpha (replaced, see below). No palette reduction.

| Source | Prompt summary | Produced |
|---|---|---|
| `hero-sheet-raw.png` (1024x1024, transparent, no reference) | A 2 by 2 character sheet of one original preschool kid hero, about five, chibi proportions: face fully visible with big brown eyes and rosy cheeks, soft red hood, red bodysuit with a royal blue belly panel, blue gloves and boots, a yellow chest badge with a white star, yellow wristbands, no cape. Poses: waving; one arm stretched out as if shooting a rope; swinging with one arm up and knees tucked; cheering and jumping. Kid comic-book style: even black ink lines, flat saturated colour, light Ben-Day dots, one highlight. No text, logos, spiders, web patterns, masks, villains or scenery. | `hero-wave`, `hero-shoot`, `hero-swing`, `hero-cheer` |
| `bg-day-raw.png` (1536x1024, opaque) | A friendly toy-scale comic city seen from a rooftop on a sunny late morning: a long flat rooftop with a red brick parapet, a red water tower at the left and potted plants along the bottom 20 percent; rounded block-like buildings in red, royal blue, sunny yellow and cream with round windows, striped red-and-blue awnings and rooftop gardens in the lower half; open calm sky in the upper half. Same comic style. No text, signs with writing, people, animals, spiders, webs, vehicles, frames or dark shapes. | `city-day` |
| `bg-dusk-raw.png` (1536x1024, opaque) | The same scene at a warm dusk: sky from peach and pink to calm violet-blue with a few early stars, many cosy lit yellow windows. | `city-dusk` |
| `friends-sheet-raw.png` (1024x1024, transparent, hero sheet attached as style reference) | A 2 by 2 sheet in the hero's style: a smiling orange tabby kitten sitting; a cheerful girl about four with curly black hair in two puffs, a yellow raincoat and blue boots, waving and holding a red balloon; a plump friendly grey-lavender pigeon waving one wing; a round badge, yellow disc with a red rim, a white star and short blue comic burst lines. No text, spiders, webs, masks, sad faces or scenery. | `kitten`, `girl`, `pigeon`, `emblem` |
| `hero-swing-raw.png` (1024x1024, transparent, processed `hero-swing.webp` attached as character reference) | The same hero mid-swing, flying left to right, one arm up holding a thick white rope that leaves the top right edge, legs kicked back, laughing, a few blue curved motion lines. No text, spiders, web patterns, masks or background. | `tile` |

Both city backgrounds were redrawn at 1920x1280 on 2026-10-03, so a 1920x1080 window at pixel ratio 1 never draws them larger than their own pixels (they were drawn at 1.41 times before). The image tool returns at most 1536x1024 for a 3:2 picture, so each 1536x1024 raw was cut into three overlapping 683x1024 portrait strips, each enlarged to 1024x1536 and attached to its own request (same tool chain) asking for a sharper, faithful redraw of exactly that strip. A scratch script then placed each returned strip where it best matched the raw enlarged 1.5 times, replaced each strip's broad colour (Gaussian blur, sigma 32 px) with the raw's so colours and shapes stay the original's, joined neighbouring strips along the vertical path where they differ least (6 px feather) and resized the 2304x1536 result to 1920x1280 with Lanczos 3; WebP quality 80, opaque (day 234 KB, dusk 187 KB). Both cities keep their own layout and the parapet height the scene uses (`BG_W` and `BG_H` in `scene.ts` now hold 1920x1280, the files' size). Strips, prompts, Codex logs, the stitched PNGs and the scripts are in `D:/CoreWise/_artifacts/CoreWiseLearn/hd-game-backgrounds/`.

## Verification notes (2026-10-03)

Checked in headed Chrome on the real GPU, window parked offscreen, against the production build served by `vite preview` and the dev page. Captures are in `D:/screenshots/CoreWiseLearn/games/web-playground/`.

- Mouse only: name entry, hub tile, a full round with an empty-sky click, a wrong ball (glow appears, `wrong` 1), idle glow after 4 s in a later round, a wrong connect point, early celebration tap ignored, sticker choice (early click ignored), rest, Again, Home mid-round (no award), sticker book page 4 showing the new stickers.
- Keyboard only: name entry, hub by arrows, a full round with any keys, celebration first key ignored, Escape during the celebration keeps the gift pending, re-entry resumes at the choice with the same 3 stars (no second award), first key only focuses, arrows move, break nudge at the rest and resume without a restart, rest focus and Home.
- Two profiles in one browser keep separate rounds, stars and stickers.
- Hub with five tiles (three temporary stub entries, not committed) at 1366x768, 800x600 and 390x600.
- Work time at 1366x768: game ring `workMax` 0.2 to 0.6 ms, loop `workMax` 0.3 to 0.6 ms. Zero console errors or warnings.

## Verification notes, round G2 fixes (2026-10-03)

Production build served by `vite preview` on port 5224, headed Chrome on the real GPU with the window parked offscreen, `?debug` (and `&tier=2` for the size checks). Script: `.tmp/verify/g2.mjs` (not committed). Captures: `D:/screenshots/CoreWiseLearn/games/web-playground/g2/`.

- Disc sizes measured on the canvas (outline edge to outline edge on the row through the centre): tier 2 at 1366x768, balls 111 to 112 px and points 99 to 100 px; at 800x600 and 390x600, balls and points 99 to 100 px.
- Heart threads curve along the outline and match the filled heart (`m12`, `m13`). The hint shows the hero aiming his outstretched arm, a dotted trail to the target, halo, ring, arrow and bounce (`m02`, `m06`, `m11`).
- A click during a catch leaves a puff and a wiggle and records nothing; a click on a ball still dropping in counts as a click on that ball (`m03`, `m05`). The flying ball draws over the sign (`m04a`). The counter sits beside the last counted ball (`m07`, `m08`).
- Leaving the rest by the corner Home and by Escape stores no pending round; re-entry starts a new round. Leaving during the choice resumes at the choice with the same stars; choosing adds one sticker, and Again adds nothing.
- Learning evidence on a five-point heart: step 1 recorded, steps 2 to 4 not. On a five-point kite, a wrong click at step 1 recorded one wrong.
- Mouse and keyboard rounds end to end, zero console errors or warnings. Keyboard round work time at 1366x768: game ring mean 0.07 ms, max 1.3 ms; loop work max 1.3 ms.

## Verification notes, round G4 consistency pass (2026-10-03)

Production build served by `vite preview` on port 5224, headed Chrome on the real GPU with the window parked offscreen, fullscreen requests stubbed to fail. Script: `.tmp/g4/g4.mjs` (not committed). Captures: `D:/screenshots/CoreWiseLearn/games/web-playground/g4/`.

- Escape, Tab and Enter during the catch and the connect each caught a ball or joined a point and stayed in the round. Escape early in the celebration did nothing. On the rest, Tab then Enter went Home.
- Break nudge over the rest with keys every 300 ms: after the nudge closed, keys at 301, 612 and 922 ms were ignored, the key at 1231 ms only showed focus (shown 1240 ms after the rest came back), and the next one, at 1542 ms, pressed Again.
- Corner Home and sound buttons measured on the canvas match Bubble Bay's exactly at 1366x768 and 800x600.
- Connect points at 1366x768, 800x600 and 390x600 for every picture and level: no two discs closer than 8 px; at 1366x768 and 800x600 at least 16 px; none outside the view or under a corner button.
- Resize from 1366x768 to 390x600 during a five-ball catch: three balls at least 64 px apart; back to 1366x768, five balls again.
- Work time at 1366x768 (loop `workLast` per frame): opening at most 7.7 ms (was 17.5 ms), catch with keys every 120 ms 4.0 ms, connect 5.8 ms, picture filling with the fanfare 3.2 ms, celebration 2.3 ms, choice 6.4 ms. No delivered frame interval above 10.4 ms on the 100 Hz display. Zero console errors or warnings in every scenario.
- Sticker book page 4 shows all six stickers inside their slots.
