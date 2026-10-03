# Design principles for ages 4 to 5

Research digest, section 1. Compiled 2026-10-02.

Rules that apply to every screen: input, discoverability without text, attention, how a 4 year old differs from a 5 year old, and accessibility. Each claim links to its source; "(expert judgment)" marks reasoning without a study behind it. Most child research is old, small or done on tablets, so treat numbers as starting values to tune by watching the two children.

## Decisions on conflicting findings

The research disagreed on these cross-cutting points. Conflicts about pitch mapping, hit-stop, beat timing, hub layout, collections, rewards, manifest and canvas settings belong to later sections.

| Topic | Range found | Decision |
|---|---|---|
| Bubble size and hit padding | +12 to +24 px, 15 to 25%, 1.5x snap; 110 to 180 px | Drawn bubble 120 to 160 CSS px at the lowest tier, never under 96. Hit radius = drawn radius + 16 px at every tier (padding never varies by tier). Clicks and keys snap to the nearest bubble within 1.5x its radius. |
| Bubble lifetime | 1.15 to 2.0 s versus never expire | Lowest tier: no expiry, at least 8 s on screen, escapes recycle and are not misses. Higher tiers: never under 2.5 s. |
| Target success rate | 80 to 90%, or 60 / 65 to 80 / 80% bands | Motor pace aims for about 85% of bubbles popped. Content uses the 60 / 65 to 80 / 80% bands per skill. |
| What moves when | Round boundary versus in-round easing | In-round: spawn interval and rise speed, eased over seconds. Between rounds: tier, content, bubble size. |
| Cursor | Native versus hidden with drawn character | Native cursor visible; halo at the true hit point; character trails as a companion. |
| Audio unlock | Keystroke, click, or start button | First pointerdown, click or non-Escape keydown anywhere unlocks and plays its own sound. No start gate. |
| Idle hints | 3 to 10 s | Games: glow 6 s, mascot gesture 10 s, one ghost demo 14 s, then quiet. Hub and name entry: glow 4 s. All in developer JSON. |
| Goals and decoys | Goal moments, 1-in-6 decoys versus no rule switches | v1 has no "avoid" or "pop only X" rules and no decoys. A matching "color of the moment" may add sparkle; a mismatch is a normal pop. |
| Numerals on bubbles | Counter only versus dot bubbles | v1: fixed counter, numeral beside dots. Dot bubbles wait for a later tier. |
| Flash area | 21,800 versus 87,000 CSS px squared | At most 3 flashes per second anywhere; anything flashing faster stays under 21,824. |
| After a round | Sticker book next versus neutral choice | Sticker flies in during the celebration; resting screen shows equal Again and Home; the book opens from the hub. |
| Break nudge | Bigger Home versus equal buttons | Equal buttons; dusk colors, yawn and quieter music carry the cue. |
| Sibling views | Read-only sibling book versus no comparison | None in v1. |
| Mute, motion, logging | Extra UI states, per-profile JSON, daily minutes | One mute icon; music and effect gains and a motion override live in developer JSON; `prefers-reduced-motion` is read. Nothing leaves the device and no play-time totals are stored. |

## Input: one forgiving action

### Pop on arrival, not on click

In Hourcade's study of thirteen 4 year olds, thirteen 5 year olds and thirteen adults, Fitts' law fit the children well (R squared 0.94 and 0.96) only up to first entering a target; then they hovered "to make sure they would click inside", re-entered and slipped off during the click. The authors suggest activating on crossing ([Hourcade et al.](https://api.drum.lib.umd.edu/server/api/core/bitstreams/6f012eb1-196c-4014-8a34-a031c977deaf/content)). Reader Rabbit Toddler shipped roll-over hotspots, including a Bubble Castle ([Wikipedia](https://en.wikipedia.org/wiki/Reader_Rabbit_Toddler)). Pop on first entry; click and any key are equal second triggers.

| Mouse click accuracy | Age 4 | Age 5 | Adult |
|---|---|---|---|
| 16 px | 43% | 74% | 90% |
| 32 px | 77% | 91% | 96% |
| 64 px | 90% | 97% | 99% |

A 5 year old one standard deviation below the mean hit 49% at 16 px, so size for the weaker child ([Hourcade et al.](https://api.drum.lib.umd.edu/server/api/core/bitstreams/6f012eb1-196c-4014-8a34-a031c977deaf/content)).

### What 96 CSS px means physically

NN/g recommends at least 2 cm targets for young children, measured on touch screens ([NN/g](https://www.nngroup.com/articles/children-ux-physical-development/)). The 96 px floor roughly equals Hourcade's 64 px tier physically, not more.

| Panel at 100% Windows scaling | 96 CSS px |
|---|---|
| 15.6 in, 1366x768 | about 24 mm |
| 14 in, 1366x768 | about 22 mm |
| 11.6 in, 1366x768 | about 18 mm |
| 15.6 in, 1920x1080 | about 17 mm (22 mm at 125%) |

No web API reports physical size ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/screen)). Measure the laptop with a ruler and set a `uiScale` multiplier in developer JSON. Define sizes in CSS px at final on-screen size and never letterbox a stage that shrinks targets in small windows (expert judgment).

### Every button does the same thing

Only 5 of 13 four year olds used the left button exclusively and 2 mostly used the right; the authors recommend identical functions on all buttons because children otherwise think the program is broken ([Hourcade, Bederson, Druin](http://www.cs.umd.edu/~bederson/images/pubs_pdfs/p1411-hourcade.pdf)). Act on `pointerdown` for any button and cancel `contextmenu`. In a 42-child classroom study, 52% of 4 year olds and 42% of 5 year olds had trouble with double-click, and about half with drag ([Agudo et al.](https://www.cin.ufpe.br/~if124/frame/turmas/turma_2013_1/artigos/mouse/05573189.pdf)). Sesame recommends registering input on press, not release ([Sesame Workshop](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)).

### Expect the trackpad

A 3 year old in NN/g's study could not link mouse movement to the cursor, and 5 year olds preferred the trackpad ([NN/g](https://www.nngroup.com/articles/children-ux-physical-development/)). Hover-to-pop needs no click or hold, the safest trackpad design. Test the cursor's path between frames against each bubble so a fast sweep during a dropped frame cannot skip one (expert judgment).

### Hover highlights, click launches

Accidental pops cost nothing, but a hub tile firing on hover would start games whenever the cursor drifts. Hub tiles and keyboard keys highlight on hover and activate on click or any key while hovered (expert judgment).

### Cursor and character

A canvas-drawn pointer trails the OS cursor by at least a frame, more when the GPU drops frames (expert judgment). Keep the native cursor (a custom CSS image is capped at 128x128, 32x32 recommended ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/cursor))) and hit-test on the real pointer. The character follows with a short lag and never owns the hit test.

## Discoverability without text

### Everything reacts

Children "mine-sweep the screen" and expect pictures to be interactive ([NN/g](https://www.nngroup.com/articles/childrens-websites-usability-issues/)). They press repeatedly until input visibly registers ([Sesame Workshop](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)), and contingent response is "perhaps the most basic element of engagement" ([Hirsh-Pasek et al.](https://kathyhirshpasek.com/wp-content/uploads/sites/9/2019/06/HirshPasek_ScienceofLearningApps.pdf)). Give every object a cheap squash and sound. Reserve one highlight color (bright yellow or neon green) for "touch me", animate interactive things gently, and mute the scenery ([Sesame Workshop](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)).

### Teach by showing

Sesame sets hint time-outs at 3 to 5 s on story screens and 6 to 8 s in games, using a glow or sparkle ([Sesame Workshop](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)). Demo rules:

- Use the real cursor-following character, not a cartoon hand: only 50% of children aged 2 to 5 understood a drawn hand as their own ([Hiniker et al.](http://faculty.washington.edu/jkientz/papers/Hiniker-HiddenSymbols-IJHCS2016.pdf)).
- Show the goal first, then the start state, then one action. Children grasped Mission PAW's goal-first demo; a child in Starfall's counting game never found the objective ([NN/g](https://www.nngroup.com/articles/kids-cognition/)).
- Move the ghost directly with no flourishes or misses; preschoolers copy unnecessary demonstrated actions ([Schleihauf and Hoehl](https://pmc.ncbi.nlm.nih.gov/articles/PMC8445421/)).
- Never gate play behind a demo. Across 45,000+ players, tutorials helped only the most complex game ([Andersen et al.](http://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf)).

Younger preschoolers learned a quantity concept only by watching, not playing ([Schroeder and Kirkorian](https://pmc.ncbi.nlm.nih.gov/articles/PMC5020045/)), so demos should model the counting, not only the pop.

### Short first path, literal icons

ScratchJr novices decoded 84% of icons, yet only 50% opened the project editor ([Blake-West and Bers](https://sites.bc.edu/devtech/wp-content/uploads/sites/181/2023/07/ScratchJr-design-in-practice-Low-fl_2023_International-Journal-of-Child-Com.pdf)). Name entry leads to one pulsing target. The hub fits one screen, with Home in the same corner everywhere; young children avoid scrolling and ignore the browser Back button ([NN/g](https://www.nngroup.com/articles/childrens-websites-usability-issues/)). Icons are literal pictures of the destination; a dated arcade-machine icon scored 63% with children aged 4 to 8 ([Wiebe et al.](https://home.cs.umanitoba.ca/~bunt/papers/2016-GI-Wiebe.pdf)).

### Progress as things

Children understood progress 91% of the time when a cup visibly filled, 65% with a separate bar ([Hiniker et al.](http://faculty.washington.edu/jkientz/papers/Hiniker-HiddenSymbols-IJHCS2016.pdf)). Popped bubbles land in a jar. Show the numeral in a fixed counter rather than on objects ([Sesame Workshop](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)) with matching dots, since even 7 year olds missed a bare "2" ([NN/g](https://www.nngroup.com/articles/kids-cognition/)).

### Sound starts on the first real input

Chrome's resume snippet listens for click, pointerup, keydown and similar, not mousemove ([Chrome](https://developer.chrome.com/blog/web-audio-autoplay)), and MDN lists non-Escape keydown and mouse pointerdown as activating ([MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation)). Hover never unlocks audio, so attract mode must work silently and the mute icon shows a "not started" state. Test keydown unlock on the target browser.

## Attention and pacing

**Effects point at the target.** In an eye-tracking study of 33 children aged 4 to 5, irrelevant animation cut comprehension (2.18 versus 3.02 static) and drew 30% of gaze; relevant animation did no harm ([eye-movement study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11651708/)). Effects radiate from the popped bubble and the counter; background motion stays slow and low contrast. That study used picture books, not reflex games.

**Slow and untimed at the bottom.** NN/g says designs for under-5s should not need "quick manual actions in response to a visual stimulus" ([NN/g](https://www.nngroup.com/articles/children-ux-physical-development/)), which is what a reflex game asks. The 2.5 s floor on higher tiers adds reaction time (median 775 ms at age 4 on an easy task ([Davidson et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC1513793/))) to Hourcade's movement times, which started only when the child moved the mouse.

**One rule per round.** At ages 4 and 5, accuracy was about 96% with one steady rule, 86% when the rule overrode a natural response, and 68% with two mixed rules ([Davidson et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC1513793/)). Change rules only between rounds, one dimension at a time ([Moriguchi and Phillips](https://pmc.ncbi.nlm.nih.gov/articles/PMC9953946/)).

**Impulsive input is normal.** Four year olds made 14 to 29% of responses in under 200 ms, adults under 4% ([Davidson et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC1513793/)). No cooldowns, no penalty for empty clicks, adaptation on rolling windows, and idle stretches left out of the skill sample ([Benitez and Robison](https://pmc.ncbi.nlm.nih.gov/articles/PMC9680391/)).

## How a 4 year old differs from a 5 year old

| Measure | Age 4 | Age 5 | Source |
|---|---|---|---|
| Click accuracy, 64 px | 90% | 97% | [Hourcade](https://api.drum.lib.umd.edu/server/api/core/bitstreams/6f012eb1-196c-4014-8a34-a031c977deaf/content) |
| Time to reach a 96 px target 512 px away | about 1.6 s | about 0.9 s | Hourcade Table 6, arithmetic |
| Spread between children (coefficient of variation) | 0.30 | 0.19 | Hourcade |
| Double-click problems | 52% | 42% | [Agudo](https://www.cin.ufpe.br/~if124/frame/turmas/turma_2013_1/artigos/mouse/05573189.pdf) |
| Mixed-rule accuracy | 69% | 68% | [Davidson](https://pmc.ncbi.nlm.nih.gov/articles/PMC1513793/) |
| "Pays attention 5 to 10 min" milestone | absent | present | [CDC 4](https://www.cdc.gov/act-early/milestones/4-years.html), [CDC 5](https://www.cdc.gov/act-early/milestones/5-years.html) |
| Uppercase letters named (of 23, Finnish sample) | 10.3 at 4.5 y | 13.1 at 5.0 y | [Torppa et al.](https://jyx.jyu.fi/bitstreams/db0ac366-61f2-40a8-8db4-fe450944b5f3/download) |

- Spread within an age exceeds the gap between ages. Key hidden tiers to each profile's own rounds, start new profiles at the lowest tier, and never assume the 5 year old is stronger.
- Rule switching did not improve from 4 to 5, so one rule per round applies to both.
- Run motor pace and content as separate estimators so a clumsy hand never shrinks the counting range ([Pelanek](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf); expert judgment). The content bands come from Max's Math Game, whose gains showed only in low-pretest children, post hoc ([Szkudlarek and Brannon](https://pmc.ncbi.nlm.nih.gov/articles/PMC5962682/)).
- Show uppercase, which preschoolers know better ([Bowles et al.](https://files.eric.ed.gov/fulltext/ED613911.pdf)), and feature each child's first initial, the letter they know best ([Reading League](https://www.thereadingleague.org/wp-content/uploads/2025/01/Brick-by-Brick-Insights-on-Alphabet-Instruction-From-Research.pdf)). Name entry accepts any keys and offers a one-click path for a child who cannot spell.
- The older child will reject babyish content; a 6 year old dismissed a site as "for babies, maybe 4 or 5" ([NN/g](https://www.nngroup.com/articles/childrens-websites-usability-issues/)). The top tier needs real headroom.

## Accessibility

**Color never carries meaning alone.** About 8% of males have a color vision deficiency ([Wilke](https://clauswilke.com/dataviz/color-pitfalls.html)), and WCAG requires a visible alternative to color ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). Use Okabe-Ito colors, pair every color with a shape or pattern, avoid red versus green as the only difference, and check grayscale. For color learning use prototypical hues such as #FF2000 for red ([Okabe and Ito](https://jfly.uni-koeln.de/color/)).

**Flashing.** WCAG passes three flashes or fewer per second, with a reference area of 87,296 CSS px squared ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)); a flashing region under a quarter of that passes automatically ([G176](https://www.w3.org/WAI/WCAG21/Techniques/general/G176)). Small confetti is fine; a full-canvas white burst is not.

**Motion.** Attract mode and idle hub animation run past 5 seconds unprompted, so input must stop them ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Under `prefers-reduced-motion`, swap shake and zoom for fades ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).

**Sound.** Sudden noises distress hypersensitive children more ([National Autistic Society](https://www.autism.org.uk/advice-and-guidance/topics/sensory-differences/sensory-differences/all-audiences)). Use soft attacks, a master limiter, a voice cap, and ignore key auto-repeat (expert judgment). No essential information comes from sound alone ([Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)).

**Predictability.** Changes to routine upset some children ([CDC](https://www.cdc.gov/autism/signs-symptoms/index.html)). Tiles keep fixed positions, new unlocks append, and Home and mute never move.

**Screen readers.** Give the shell basic semantics (canvas `aria-label`, `lang`, a focusable mute button) and spend the rest on color, motion, sound and motor support (expert judgment).

## Wellbeing rules that shape the UI

Of 133 apps used by children aged 3 to 5, only 19.6% had no manipulative feature, and 24.8% used characters to pressure play, such as My Talking Tom 2 saying "You're making me want to go to sleep" ([Radesky et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)). The yawning mascot sits near that line: it stays content and never reacts to the child leaving. Parents call episode ends natural stopping points ([Hiniker et al.](https://faculty.washington.edu/alexisr/ScreenTimeTantrums.pdf)), so rounds end on a still screen, and the ICO defines nudges by prominence and friction ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/)), so Again and Home stay equal.

## Do and do not

1. Do pop on first cursor entry, with click and any key as equal second triggers.
2. Do give every mouse button the same action and cancel the context menu.
3. Do draw bubbles 120 to 160 CSS px at the lowest tier, never under 96, with a fixed +16 px hit pad and 1.5x snap for clicks and keys.
4. Do hit-test the cursor's path between frames.
5. Do measure the laptop and set a developer `uiScale` if 96 px comes out under about 2 cm.
6. Do keep the native cursor and draw a halo at the true hit point.
7. Do make every visible object react to hover or click with motion and sound.
8. Do run the idle ladder (glow, mascot gesture, one ghost demo) and stop on any input.
9. Do show the goal first in demos, with the real character moving directly.
10. Do show counts as objects in a jar plus a fixed numeral beside dots.
11. Do keep the lowest tier untimed, with every bubble on screen at least 8 s.
12. Do keep separate per-profile estimators for motor pace and content.
13. Do pair every color with a shape and every sound with a visual.
14. Do unlock audio inside the first pointerdown, click or non-Escape keydown handler.
15. Do not require double-click, drag, press-and-hold or right-click.
16. Do not launch anything from the hub on hover alone.
17. Do not show instruction text, a start gate or a mandatory tutorial.
18. Do not switch rules mid-round or add bubbles the child must avoid.
19. Do not exceed three flashes per second or flash more than 21,824 CSS px squared.
20. Do not let the mascot look sad, plead or react to the child leaving.
21. Do not auto-advance after a round or make Again bigger than Home.
22. Do not compare the two children's stars or stickers, send data off the device, or store play-time totals.
