# Research digest: preschool game hub

Compiled 2026-10-02. Six sections of sourced research for the kids' browser game hub (two children aged 4 and 5, solo play, Windows laptop with a weak integrated GPU, mouse, trackpad and keyboard). Every number is a starting value to tune by watching the two children play. Items marked "judgment" in the sections have no study behind them.

Proposed changes to the developer build prompt are in [prompt-amendments.md](prompt-amendments.md).

## Sections

### [01. Design principles for ages 4 to 5](01-design-principles.md)

Rules for every screen: input, teaching without text, attention, age differences and accessibility. The three recommendations that change the most: pop a bubble the moment the cursor enters it, with any mouse button or any key as an equal second trigger, because children hover and slip off targets during the click. Size for the weaker child: a 4 year old clicks a 64 px target 90% of the time and a 32 px one only 77%, and 96 CSS px falls under the 2 cm minimum on small or high-resolution panels, so measure the laptop and set a `uiScale` in developer JSON. Keep one rule per round and no time pressure at the bottom tier: accuracy fell from about 96% to 68% when 4 and 5 year olds had to mix two rules.

### [02. The pop game: mechanics and feel](02-pop-game-feel.md)

A design brief for the v1 bubble game. The three recommendations that change the most: bubbles never time out; difficulty comes from rise speed (45 to 60 px/s at tier 1, 13 to 17 s on screen), live cap and spacing, and tier 1 escapes recycle rather than count as misses. Counting is built into every pop, not layered on top: popped bubbles fly into a jar of 10, the numeral appears beside dots at 3, 5 and 10, and pop pitch climbs a pentatonic step per count. Stars cannot come from pop rate, because the adaptive controller holds pop rate near 85%; give 1 star for finishing, 2 for beating the child's own median longest combo, 3 for that plus a completed 10-count.

### [03. Name entry and typing feedback](03-name-entry-typing.md)

Treat the screen as an identity ritual and a keyboard toy, not letter teaching. The three recommendations that change the most: never auto-resume the last profile; show recent names as bubbles with an initial, a critter and a color assigned at creation and forced to differ from the sibling's, and require one click. Give each letter one fixed pentatonic note so each name becomes a stable tune, with mash protection (skip held-key repeats, merge presses within 30 ms, at most about 8 sounds per second). Cap names at 10 letters, not 12, and check the laptop's Windows scaling first: at 150% the keyboard, name row and recents do not fit at the 96 px floor.

### [04. Rewards, progression and ethical engagement](04-rewards-progression-ethics.md)

Expected tangible rewards lower later interest in an activity a child already enjoys, so the stars and sticker book are the spec's main motivational risk. The three recommendations that change the most: one sticker per finished round regardless of stars, drawn without replacement, with the child picking one of two wrapped gifts and each sticker playing a short cause-and-effect animation when clicked. Every round ends on a still screen with equal Again and Home icons and nothing auto-advancing. The mascot and the future pet never look sad, never react to the child leaving, and never change while the children are away; a ten-item red-line list and a PR checklist enforce this.

### [05. Art and audio direction](05-art-audio-direction.md)

A shared style bible with per-game media. The three recommendations that change the most: AI image generation is only for static stills (stickers, backgrounds, skin stills); everything that animates or reacts (mascot, bubbles, stars, confetti, UI) is drawn in code, because image models do not hold a recurring character steady, and every generated sprite gets human review. Bubbles are solid with a tinted rim, not see-through, with at least 3:1 contrast checked by a script. Audio runs through buses, a compressor and a soft clip, is calibrated per laptop to 70 to 75 dB(A), and gives each sound parameter one owner: count sets the note, size sets the noise body, combo sets the music layers.

### [06. Technical architecture and performance](06-tech-architecture-perf.md)

Canvas 2D on a weak GPU, loop and pooling, assets, Web Audio, PWA delivery and input hardening. The three recommendations that change the most: fix four defects in the existing scaffold (a 0.25 s loop clamp that allows 15 catch-up steps, a DPR cap of 1 instead of 1.5, an auto-updating service worker that can reload mid-round, and a save migration that can wipe the sticker book). Cap the canvas at about 1.5 M backing pixels and step down an invisible resolution scale when frames run long, since fill load grows with DPR squared. Measure performance on the children's laptop in Chrome and Edge, plugged in and on battery, rather than trusting CPU throttling on a fast machine.

## Where the sections disagree

The sections were written in parallel and give different values in a few places. Editorial calls, carried into the prompt amendments:

| Topic | Values found | Call |
|---|---|---|
| Hit padding | 01: drawn radius + 16 px at every tier. 02: radius x 1.25 / 1.15 / 1.10 by tier, set at round start. 06: x 1.25 / 1.15 / 1.0 plus 8 px, owned by the in-round breather. | Use 02's table, set at round start, with a 96 px hit-diameter floor and 1.5x snap for clicks and keys. The in-round breather owns only the spawn gap and the drift assist, so no two loops move one knob. |
| Bubble lifetime | 01: higher tiers expire, never under 2.5 s. 02: never expire. | Never expire (02). Tier 3 rise speed already gives 5.5 to 7 s on screen. |
| Idle hint ladder | 01 and 03: 6, 10, 14 s. 02: 6, 12 s, then 8 s quiet. | 6 s glow, 10 s mascot gesture, 14 s one ghost demo, quiet after two loops. All values in JSON. |
| Flash area | 02: 87,296 CSS px squared as the hard rule. 01, 04, 05: 21,824. | 21,824 CSS px squared, the stricter figure, so no luminance measurement is needed. |
| Celebration skip | 02: any input after about 1 s. 04: from the first frame. | Skippable from the first frame (04), with a 250 to 400 ms guard before the rest screen accepts input. |
| Celebration variants | 02: at least 6. 04 and 05: 4 to 6. | Ship 4, grow to 6; never repeat the last one. |

## Top 15 findings

1. Pop on cursor entry rather than on click: children hover to make sure they are inside a target and slip off during the click, and the study authors themselves suggest activating on crossing ([01](01-design-principles.md), [02](02-pop-game-feel.md)).
2. Size targets for the weaker child, because spread within one age is larger than the gap between ages, and calibrate 96 CSS px with a ruler since it can be as small as 17 mm on a 15.6 inch 1080p panel ([01](01-design-principles.md)).
3. NN/g says designs for under-5s should not need quick reactions to a visual stimulus, so tier 1 bubbles rise slowly, never time out and recycle when they escape ([02](02-pop-game-feel.md)).
4. Accuracy for 4 and 5 year olds fell from about 96% with one rule to 68% with two mixed rules, so v1 has no decoys and no "pop only red" phases ([01](01-design-principles.md), [02](02-pop-game-feel.md)).
5. Bubble-popping apps scored 0 on active learning, so counting must live inside every pop: a jar of 10, a numeral beside dots, and a pitch that rises with the count ([02](02-pop-game-feel.md), [05](05-art-audio-direction.md)).
6. Keep two separate adaptive estimators, motor pop rate held near 85% and counting content on 60 / 65 to 80 / 80% bands, and change tiers only at round boundaries so a clumsy hand never shrinks the counting range ([02](02-pop-game-feel.md), [06](06-tech-architecture-perf.md)).
7. If stars came from pop rate, every round would score the same under the controller, so stars come from beating the child's own recent combo and finishing a 10-count ([02](02-pop-game-feel.md)).
8. Expected tangible rewards lowered children's later free-choice interest (d = -0.43), so stickers come as gifts for playing: one per round, no random drops, the child picks one of two, and each sticker does something when clicked ([04](04-rewards-progression-ethics.md)).
9. Of 133 apps used by 3 to 5 year olds, 24.8% used characters to pressure play, so the mascot and pet are never sad, pleading or affected by the child leaving ([01](01-design-principles.md), [04](04-rewards-progression-ethics.md)).
10. Parents describe autoplay as a feature they fight against, so every round ends on a still screen with equal-size Again and Home and nothing auto-starts ([01](01-design-principles.md), [04](04-rewards-progression-ethics.md)).
11. Only 50% of children aged 2 to 5 read a cartoon hand as their own, so the native cursor stays visible with a halo at the hit radius, and demos move the same cursor-following character ([01](01-design-principles.md), [05](05-art-audio-direction.md)).
12. Mouse movement never unlocks audio, so there is no start gate: the first click or key anywhere unlocks sound and plays its own effect, sounds made while locked are dropped, and the mute icon shows a waiting state ([03](03-name-entry-typing.md), [06](06-tech-architecture-perf.md)).
13. A child's own name supplies about half the letters they use, but without voice the screen cannot teach letter names, so name entry is a no-error keyboard toy with one fixed note per letter and a click-to-pick name list that never auto-resumes ([03](03-name-entry-typing.md)).
14. Image models do not hold a recurring character steady, so AI art is limited to reviewed static stills and must never draw letters, numerals or counted items ([05](05-art-audio-direction.md)).
15. The existing scaffold allows 15 catch-up steps per frame, caps DPR at 1, can reload a round on a service worker update and can wipe a save on a migration slip; fix all four before building on it ([06](06-tech-architecture-perf.md)).

## Exemplar games to play

Grouped by what to learn. "Avoid" entries are counter-examples: play them once to see the pattern the hub must not ship.

**Input and first contact**

- Reader Rabbit Toddler: roll-over hotspots, including a bubble castle, that fire without a click ([01](01-design-principles.md)).
- Pop-o-lot (Kneebouncers): the closest comparable game, a face revealed on each pop and no score ([05](05-art-audio-direction.md)).
- Baby Smash and AlphaBaby: every key does something and nothing is an error; Baby Smash also shows what a native app can lock down that a page cannot ([03](03-name-entry-typing.md), [06](06-tech-architecture-perf.md)).
- JumpStart Toddlers: any key or mouse movement is rewarded ([03](03-name-entry-typing.md)).

**Teaching without words**

- Mission PAW: a goal-first demonstration that children understood ([01](01-design-principles.md), [02](02-pop-game-feel.md)).
- ScratchJr: literal icons that children decoded, and a first path that half of novices still failed to find ([01](01-design-principles.md)).
- Avoid: Starfall's counting game, where a child never found the goal, and Puppy Quest, where 7 year olds missed a bare numeral ([01](01-design-principles.md), [02](02-pop-game-feel.md)).
- Avoid: Panda Restaurant 3, whose subtle feedback children under 6 ignored ([02](02-pop-game-feel.md)).

**Difficulty and pacing**

- Big Brain Academy: eases fast, climbs slowly, and reworked its wrong-answer sound for children ([02](02-pop-game-feel.md)).
- The Number Race and Max's Math Game: deadlines removed for slow children, and the content accuracy bands used here ([01](01-design-principles.md), [02](02-pop-game-feel.md)).
- Pikmin: no clock on the first day until the first success ([02](02-pop-game-feel.md)).
- Left 4 Dead (read the GDC 2009 talk; the game is not for the children): the build-up, peak, fade and relax cycle, scaled down to a 75 s round ([02](02-pop-game-feel.md)).

**Surprise and delight**

- Super Mario Bros. Wonder: at least one surprise per course, and world motion synced to the beat while input sounds stay instant ([02](02-pop-game-feel.md), [05](05-art-audio-direction.md)).
- Peggle: a loud, simple finale ([02](02-pop-game-feel.md)).
- Toca Boca apps: one quirky element per scene and consistent style across apps ([05](05-art-audio-direction.md)).
- Sago Mini Music Box and Sound Box: every tap plays the next note and no input is wrong ([03](03-name-entry-typing.md), [05](05-art-audio-direction.md)).

**Rewards without manipulation**

- Pok Pok Playroom: no reward systems; deeper play is rewarded with more play ([04](04-rewards-progression-ethics.md)).
- PBS KIDS apps: the only group in the 133-app audit with no manipulative features apart from autoplay ([04](04-rewards-progression-ethics.md)).
- Kirby's Epic Yarn: no death, and every level awards a medal ([04](04-rewards-progression-ethics.md)).
- Khan Academy Kids: the child chooses a prize; also a counter-example for asking a child's age, and for how one disturbing image draws 1-star reviews ([03](03-name-entry-typing.md), [04](04-rewards-progression-ethics.md), [05](05-art-audio-direction.md)).
- Avoid: My Talking Tom 2 ("You're making me want to go to sleep"), Tamagotchi (pets that die), Animal Crossing's real-time clock (absence made visible) and Zoolingo (a repeated celebration dance children quit to avoid) ([01](01-design-principles.md), [02](02-pop-game-feel.md), [04](04-rewards-progression-ethics.md)).

**Feel, sound and music**

- Juicy Breakout: per-effect toggles, useful for choosing a calm subset of juice ([05](05-art-audio-direction.md)).
- Super Mario Bros. coin and stings: effects tuned to the music's key, rising notes for gain ([02](02-pop-game-feel.md), [05](05-art-audio-direction.md)).
- The Legend of Zelda: Ocarina of Time field music: phrase shuffling that holds up over long sessions ([05](05-art-audio-direction.md)).
- Pokemon Smile: progress made audible as added music layers ([05](05-art-audio-direction.md)).

**Character and art**

- Kirby: one simple silhouette and a neutral face that reflects the player's mood ([03](03-name-entry-typing.md), [05](05-art-audio-direction.md)).
- Bluey (a show, but its style bible is the model): rounded rectangles, tinted outlines and shadows, flat staging ([05](05-art-audio-direction.md)).
