# The pop game: mechanics and feel

Research digest, section 2. Date: 2026-10-02.

This is a design brief for the v1 bubble pop game. All numbers are starting values to tune by watching the two children play. Items marked **(judgment)** are expert judgment, not taken from a source. Where the research disagreed, the conflict is named and one option is picked.

## The core constraint

NN/g says designs for children under 5 should not require "quick manual actions in response to a visual stimulus" ([NN/g](https://www.nngroup.com/articles/children-ux-physical-development/)). So the lowest tier must be slow, sparse and free of time pressure. Meyer et al. scored bubble-popping apps 0 on active learning because they "do not require more mental effort than a simple reaction" ([Meyer et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8916741)). To get past that, every pop has to count something. Counting cannot sit on top as a separate layer.

## Input: hover pops, click and keys are backups

Hourcade et al. tested thirteen 4 year olds, thirteen 5 year olds and thirteen adults. Children's pointing followed Fitts' law only up to the moment they first entered the target. After that, children "had a tendency to hover over the target" to make sure they clicked inside it. 4 year olds re-entered a 64 px target 0.63 times per trial. The authors themselves suggest crossing interfaces, where entering the target activates it ([Hourcade et al.](https://api.drum.lib.umd.edu/server/api/core/bitstreams/6f012eb1-196c-4014-8a34-a031c977deaf/content)).

Rules:

- **Pop on first entry** into the hit area. A press of any mouse button, or any key, also pops the nearest bubble within 1.5x its radius **(judgment)**. Some 4 year olds click mainly with the right button, so map every button to the same action and cancel `contextmenu` ([Hourcade, section 3.7.3](https://www.cs.umd.edu/hcil/trs/2003-16/2003-16.pdf)).
- **Test the swept segment** from last frame's pointer position to this frame's against each bubble circle. Browsers coalesce pointer moves into fewer events ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents)). At 20 fps a fast sweep jumps 150 px per frame and skips a 128 px bubble. Two scalars hold the previous position, so nothing allocates; reset them when the pointer re-enters the window **(judgment)**.
- **No double-click, hold or drag.** In a 42-child classroom study, 52.2% of 4 year olds had problems with double-click ([Agudo et al.](https://www.cin.ufpe.br/~if124/frame/turmas/turma_2013_1/artigos/mouse/05573189.pdf)).
- **No click cooldown, and no penalty for presses on empty space.** On Davidson's task, 4 year olds made 14% to 29% anticipatory responses, against 0.25% to 3.5% for adults ([Davidson et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC1513793/)).

**Cursor (conflict resolved).** The art-direction research wanted the OS cursor hidden and a large character drawn in its place. The input research wanted the native cursor kept. Keep the native cursor: a canvas-drawn pointer trails the real one by a frame or more on a weak GPU **(judgment)**. Hit-test the real pointer, draw a soft canvas halo at the true hit radius, and let the mascot trail as a buddy. MDN recommends 32x32 custom cursor images; Chromium caps them at 128x128 and ignores anything larger ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/cursor)). Hiniker found only 50% of children aged 2 to 5 understood a cartoon hand as a symbol of their own hand ([Hiniker et al. 2016](http://faculty.washington.edu/jkientz/papers/Hiniker-HiddenSymbols-IJHCS2016.pdf)), so the attract demo should move the real cursor-follow character, not a separate hand.

## Target size and hit padding

Hourcade's click accuracy at 16, 32 and 64 px was 43%, 77% and 90% for 4 year olds, and 74%, 91% and 97% for 5 year olds. A 5 year old one SD below the mean hit only 49% at 16 px ([Hourcade et al.](https://api.drum.lib.umd.edu/server/api/core/bitstreams/6f012eb1-196c-4014-8a34-a031c977deaf/content)). Physically, 96 CSS px is about 24 mm on a 15.6 inch 1366x768 panel but about 18 mm on an 11.6 inch one, which is below NN/g's 2 cm minimum ([NN/g](https://www.nngroup.com/articles/children-ux-physical-development/)).

The findings disagreed here. Padding values ranged from +12 px to +25%, and suggested bubble sizes from 110 to 180 px. One rule:

| Parameter | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Drawn diameter (CSS px) | 128 to 144 | 128 to 144 | 120 to 136 |
| Hit radius / drawn radius | 1.25 | 1.15 | 1.10 |
| Absolute hit diameter floor | 96 | 96 | 96 |

Size barely changes; padding varies by tier and changes only at round boundaries. Compton lists enlarged hitboxes on positive items as an invisible assist ([Compton](https://www.gamedeveloper.com/design/more-than-meets-the-eye-the-secrets-of-dynamic-difficulty-adjustment)). Values are **(judgment)**.

## Spawn, speed and lifetime

**Lifetime (conflict resolved).** Some findings used bubble lifetime as a difficulty knob. The timing research said never expire a bubble on a timer. Use rise speed as the knob and never time bubbles out. Hourcade's first-entry constants (4 yr: 386 + 448·ID ms; 5 yr: 167 + 280·ID ms) work out to about 2.0 s and 1.15 s to reach a 96 px bubble 1000 px away. Adding the 775 ms median choice reaction time Davidson measured at age 4 gives roughly 2.5 s in the worst case ([Hourcade](https://api.drum.lib.umd.edu/server/api/core/bitstreams/6f012eb1-196c-4014-8a34-a031c977deaf/content), [Davidson](https://pmc.ncbi.nlm.nih.gov/articles/PMC1513793/)). The Number Race removes the deadline entirely for slow children "so that if children are particularly slow at a task, they will still be able to succeed" ([Wilson et al. 2006](https://pmc.ncbi.nlm.nih.gov/articles/PMC1550244/)). Keep at least a 3x margin.

| Knob (owned by tier) | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Rise speed (CSS px/s) | 45 to 60 | 70 to 100 | 110 to 140 |
| Time on a 768 px field | 13 to 17 s | 8 to 11 s | 5.5 to 7 s |
| Live bubble cap | 2 to 4 | 4 to 6 | 6 to 8 |
| Minimum spacing between bubbles | 1.5 diameters | 1.2 | 1.0 |
| Escaped bubbles | recycle from bottom | float off | float off |
| Round length | 60 s | 75 s | 90 s |

Paths are straight, at constant speed, with at most 15 to 20 px of slow sway. A guide line did not help 4 to 5 year olds track a moving dot at any speed ([Flatters et al.](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0088692)), so motion they can predict matters more than motion that looks interesting. Never spawn twice in a row in the same column. Use a bag shuffle for colors so no color goes missing for long ([Bloquitos](https://github.com/SirHegel/bloquitos)). Speeds follow the arithmetic above; other values are **(judgment)**.

**Starve-proofing.** In one real toddler bubble app, 19 of 27 low reviews describe a level that asks for colors that never spawn ([App Store reviews](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1472415316/sortby=mostrecent/json)). Derive any count or color quota from the spawn schedule, and assert in dev builds that each round can be completed.

## Round structure

Venturelli's PopCap study recommends "time to learn and time to play", introducing one or two mechanics at a time ([Venturelli](https://sbgames.org/papers/sbgames09/artanddesign/60345.pdf)). Left 4 Dead's director cycles through Build Up, Sustain Peak, Peak Fade and Relax because "constant, unchanging combat is fatiguing" ([Booth, Valve](https://cdn.akamai.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)). Scaled down to a 75 s round:

| Phase | Time | What happens |
|---|---|---|
| Warm-up | 0 to 10 s | First bubble spawns within about 250 px of the pointer and pulses. One bubble at a time. First pop within about 1 s. |
| Waves | 10 to 60 s | 3 to 4 waves of 8 to 12 s with 4 to 6 s breathers between them |
| Finale | last 10 to 15 s | A generous bubble shower that makes 1 star nearly certain |
| Tally and celebration | about 4 s | See below |

**First round for a new name.** Pikmin's first day has no clock until the player finds the first ship part ([Wikipedia](https://en.wikipedia.org/wiki/Pikmin_(video_game))). Make a new name's first round untimed: it ends after about 8 pops and gives a guaranteed 3 stars **(judgment)**.

**One surprise per round.** Mouri put "at least one element in each course that would surprise or delight players" ([Nintendo, Wonder](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-11-super-mario-bros-wonder-part-3/)). About 1 in 15 spawns can be a silly variant, such as a bubble with a face, a rubber duck or a sock bubble. It pops into a bigger reaction and gives no extra score **(judgment)**.

**No rule changes in v1 (conflict resolved).** The preschool-UX research proposed goal moments like "pop the red ones", and the pop-catch research allowed harmless decoys. On Davidson's task, accuracy for 4 and 5 year olds dropped from about 96% under one steady rule to about 68% when rules mixed ([Davidson](https://pmc.ncbi.nlm.nih.gov/articles/PMC1513793/)). v1 ships with no "avoid" bubbles and no "only X" phases. Every bubble is a valid pop. A clump of 3 same-color bubbles can appear as a countable set that pays extra sparkle, but popping a different color still counts as a normal pop.

## Counting woven into the pop

**Placement (conflict resolved).** Sesame recommends that when counting a set, the numeral appear in a counter rather than on the object itself ([Sesame Workshop](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)). In Hiniker's study, 0.91 of children understood progress when they could see the cup filling, against 0.65 when progress showed only on a separate bar ([Hiniker](http://faculty.washington.edu/jkientz/papers/Hiniker-HiddenSymbols-IJHCS2016.pdf)). In v1, bubbles carry no numerals.

- A fixed counter holds a row of 10 theme icons (for example fish in a jar). Each pop flies one icon in, so the count is made of the objects the child acted on.
- At 3, 5 and 10, the numeral flashes beside the same number of dots. In Puppy Quest, 7 year olds did not connect a bare "2" with the game's goal ([NN/g](https://www.nngroup.com/articles/kids-cognition/)).
- At 10, the jar ring-chimes as a whole set, then empties into a stack that persists through the round.
- **Round-end tally.** Popped items land one at a time and the final numeral is held large. In Chan's trial, counting each item plus stating the total improved number mapping, while stating the total alone did not ([Chan 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7031487/)). The wordless version used here is untested.
- **Goal scene.** Rich counting books, where a character had a numerical goal, beat sparse ones on cardinal knowledge ([Carrazza and Levine](https://pmc.ncbi.nlm.nih.gov/articles/PMC11867842/)). "The whale wants 10 fish" works better than an abstract tally.

Count range follows a separate content estimator: 1 to 5 in the lowest content tier, up to 10 in the highest.

## Combos

The research did not agree on the chain window (1.5 s, 1.6 s, and 2.5 to 3 s). Use **2.5 s** **(judgment)**. An adult-tuned window would break constantly for these children. Combo milestones come at 3, 6 and 10 pops. Each adds sparkle, a mascot reaction and a music layer, and the effects stop growing after 10. When a chain breaks, the pips shrink silently with no down-sound. Show the chain as filling pips or a growing arc on the mascot, never as a multiplier number ([valdemird](https://valdemird.com/blog/game-feel-on-the-web/) gates its biggest effect to rare tiers; tier numbers are judgment).

## Sound

**Pitch (conflict resolved).** Three findings each claimed pop pitch: combo position, count position and bubble size. The count gets it. Pop *n* within the current group of 10 plays step *n* of a major pentatonic ladder: semitones 0, 2, 4, 7, 9, 12, 14, 16, 19, 21. That puts 1 to 10 across about 1.75 octaves. Rising pitch reads as gain: Kondo's coin is two rising notes ([Twenty Thousand Hertz](https://www.20k.org/episodes/super-mario-bros)). The pentatonic scale keeps any run of notes consonant ([UDLR devlog](https://deertwoheads.itch.io/udlr-modify/devlog/695577/audio-breakdown)). Bubble size changes only the noise-burst body, and combos change only music layers. Recognition sounds (star jingle, sticker reveal) stay identical every time ([A Sound Effect](https://www.asoundeffect.com/game-audio-immersion/)).

- **Play pops immediately; never snap them to the beat.** At 120 bpm, a 1/16 note is 125 ms of delay. Sync only ambient motion to the beat, as Wonder does ([Nintendo, Wonder](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-11-super-mario-bros-wonder-part-3/)).
- **Misses:** silence or a soft bloop, never a falling tone. Children aged 3 to 5 recognized calm (33.0%) and sad (30.9%) music least well ([Paz et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12598441/)). Big Brain Academy's team reworked its wrong sound because "children are sensitive to those sounds" ([Nintendo](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-3-big-brain-academy-brain-vs-brain-part-2/)).
- **Mixing:** cap at about 8 voices and steal the oldest. Route through master gain into a final `DynamicsCompressorNode` so stacked pops do not clip ([web.dev](https://web.dev/articles/webaudio-games)).
- **Unlock:** hover is not a user gesture ([Chrome](https://developer.chrome.com/blog/web-audio-autoplay)). The child reaches the pop game through a click or key in the hub, so audio is already running. Still, re-check `state` on every pointerdown and keydown in the game.

## Juice: what fits, what to avoid

Children under 6 ignored subtle feedback in Panda Restaurant 3 ([NN/g](https://www.nngroup.com/articles/kids-cognition/)), so feedback must be large. But low-relevance animation cut 4 to 5 year olds' comprehension from 3.02 to 2.18, and moved 29.9% of their fixations to irrelevant areas ([eye-tracking study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11651708/)). Every effect radiates from the popped bubble or the counter.

| Use | Values |
|---|---|
| Visible reaction in the hit frame, with sound on the same frame | under 100 ms total ([Swink via England](https://lizengland.com/blog/2015/08/review-game-feel-by-steve-swink)) |
| Squash wide and flat, then burst | 80 to 120 ms; area roughly constant ([valdemird](https://valdemird.com/blog/game-feel-on-the-web/)) |
| Particle burst from a typed-array pool | 6 to 10 particles, 0.55 to 0.95 s life, cap about 150 live |
| Ring flash around the bubble | one cached sprite |
| Mascot reaction | motion only; face stays happy |
| Ease-out curves for arrivals, back-out curves for rewards | never linear |

| Avoid | Why |
|---|---|
| Screen shake on pops | It moves the targets the child is aiming at. Eiserloh calls shake "like salt" ([GDC 2016](http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf)) |
| Hit-stop (conflict resolved) | One finding allowed a 2 to 3 frame freeze local to the bubble. Skip it: on a weak GPU it reads as stutter. Blue Tengu dropped freezes because "even a frame of hesitation feels weird" ([Blue Tengu](https://www.bluetengu.com/2014/12/12/art-of-screenshake-experiments/)) |
| `shadowBlur` in the loop | Bake glows into cached sprites |
| Large flashes | WCAG: at most 3 flashes per second and at most 87,296 CSS px² (341x256) per flash ([WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)). Use this as the hard rule. A 160 px ring is about 20,000 px², which also satisfies the stricter juice figure. |
| Busy ambient animation near the field mid-round | Distracts from the target ([Hirsh-Pasek et al.](https://kathyhirshpasek.com/wp-content/uploads/sites/9/2019/07/apps.pdf)) |
| Sad or drooping mascot after a miss | Kirby is "designed to reflect the player's emotions" ([Wikipedia](https://en.wikipedia.org/wiki/Kirby_(character))) |

## Adaptive tiers

**Two loops, separate knobs (conflict resolved).** One finding moved difficulty only at round boundaries. Others eased continuously within a round. Hunicke warns that stacked adjustments can cause "a spiraling loop of change" ([Hunicke 2005](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf)). So the work is split:

- **Tier, set at round start:** rise speed, live cap, spacing, hit padding, round length.
- **In-round breather, continuous:** spawn gap only, plus one assist that drifts a bubble toward an idle or struggling cursor. Changes spread over several seconds so the field never visibly thins after a miss ([Compton](https://www.gamedeveloper.com/design/more-than-meets-the-eye-the-secrets-of-dynamic-difficulty-adjustment)).

**Success target (conflict resolved).** The research proposed three bands: 80 to 88%, 85 to 90%, and 65 to 80%. They measure different things. **Motor pop rate** (bubbles popped / bubbles spawned, idle stretches excluded) targets **85%, with a band of 80 to 90%**. Wilson et al.'s 85% comes from theory and simulation, not from children ([Wilson et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/)). Lean to the high end in a no-fail game. **Content accuracy** (counting goals, later games) uses the Max's Math bands: ease under 60%, hold at 65 to 80%, raise at 80% or more ([Szkudlarek and Brannon](https://pmc.ncbi.nlm.nih.gov/articles/PMC5962682/)). Keep the two estimators separate so a clumsy hand never demotes the counting range ([Pelanek](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)).

| Rule | Value |
|---|---|
| New name starts at | Tier 1 |
| In-round ease trigger | 3 escapes in a row, or under 70% over the last 12 bubbles: lengthen spawn gap and drift one bubble toward the cursor |
| Tier down (between rounds) | Pop rate under 75% for the round |
| Tier up (between rounds) | 90% or more over 30+ bubbles, two rounds in a row |
| Step cap | One tier per round boundary; first round of a session starts one step below the stored tier |
| Excluded from samples | First 3 to 5 s of a round; stretches with no input for 3 s or more ([Benitez and Robison](https://pmc.ncbi.nlm.nih.gov/articles/PMC9680391/)) |
| State | Per name in localStorage, never shared between siblings |

These thresholds are **(judgment)** shaped by the cited sources. Big Brain Academy eases fast and climbs slowly because testers saw young children "start crying out of frustration" ([Nintendo](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-3-big-brain-academy-brain-vs-brain-part-2/)).

## Idle hints and attract mode

**Timing (conflict resolved).** The proposed idle thresholds ranged from 3 s to 10 s. Sesame sets 6 to 8 s for games ([Sesame Workshop](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)). The ladder:

1. 6 s idle: nearest bubble glows and drifts toward the cursor.
2. 12 s idle: the mascot glides to the bubble and pops it by hover alone, with no click shown, because children expect clicks.
3. Then quiet for 8 s before the ladder repeats. Any input cancels it instantly.

The ghost demo makes one straight glide and one pop, with no flourishes and no misses. Children over-imitate unnecessary demonstrated actions ([Schleihauf and Hoehl](https://pmc.ncbi.nlm.nih.gov/articles/PMC8445421/)). Show the goal first: the full jar and stars, then rising bubbles, then the pop. Mission PAW's goal-first demo worked, while Starfall, which never showed the goal, left a 5 year old lost ([NN/g](https://www.nngroup.com/articles/kids-cognition/)). In simple games, tutorials did not improve engagement ([Andersen et al.](http://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf)), so the game is live from frame 0.

## Stars and celebration

**Stars.** The controller holds pop rate near 85%, so stars cannot come from pop rate or every round would score the same. Give 1 star for finishing. Give 2 for beating the child's own median longest combo over recent rounds, and 3 for that plus a completed 10-count. Aim for about 60 to 70% of rounds at 3 stars **(judgment)**. Show earned stars filling in, never empty slots. Celebration stays almost the same at 1 star as at 3, because person-style feedback produced helpless responses in 5 to 6 year olds ([Kamins and Dweck](https://pubmed.ncbi.nlm.nih.gov/10380873/)).

**Timing:**

| Beat | Time |
|---|---|
| Finale shower ends, final tally lands item by item | about 1.5 s |
| Stars appear at 0.5 s intervals, one rising note each | 0.5 to 1.5 s |
| Confetti, music ducked under the jingle | about 2 s |
| Pause, then still screen with equal-size Again and Home icons | 2 to 3 s pause |

Any input after about 1 s skips straight to the still screen. Rotate at least 6 celebration variants with no back-to-back repeat. One reviewer's toddler quit games early "to avoid the monkey animation/dance" ([Zoolingo reviews](https://itunes.apple.com/us/rss/customerreviews/page=1/id=611668665/sortby=mostrecent/json)). Peggle's loud, simple finale started as a placeholder that players liked enough to keep ([Wikipedia](https://en.wikipedia.org/wiki/Peggle)).

**Post-round (conflict resolved).** One finding made the sticker book the default next step. The still screen wins: nothing auto-advances, and Again is no bigger, brighter or more animated than Home. Autoplay left preschoolers fewer chances to decide to stop ([UW News](https://www.washington.edu/news/2018/05/01/apps-for-children-should-emphasize-parent-and-child-choice-researchers-say/)); ICO Standard 13 defines nudges by prominence ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/)). A new sticker shows as a small wrapped gift on that screen, unrelated to star count. The 20-minute yawn plays only at this boundary, never mid-round.
