# Name entry and typing feedback

Research digest, section 3. Compiled 2026-10-02 for the developer building the hub. Items marked **(judgment)** are expert judgment, not sourced findings.

## What this screen is for

Treat name entry as an identity ritual and a keyboard toy, not as letter instruction.

- **The child's own name is the strongest letter hook.** In two Dutch samples (N=35 and N=79, ages about 4 to 6), 52% of the letters children used to spell new words came from their own name ([Both-de Vries and Bus 2008](https://files.eric.ed.gov/fulltext/EJ899643.pdf)). Preschoolers know their own name letters best, especially the first ([Treiman et al. 2007](https://academic.oup.com/chidev/article-abstract/78/5/1458/8275025); [Treiman and Broderick 1998](https://doi.org/10.1006/jecp.1998.2448)).
- **Typing is a weak route to letter learning.** Handwriting training beat typing training for preschool letter recognition (Longcamp 2005, cited in [Frontiers 2021](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2021.679191/full)), and letter writing, not name writing, predicted spelling ([Puranik et al. 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3172137/)). Don't claim learning outcomes here; save tracing for a later game.
- **Without voice, the screen can teach letter shapes but not letter names or sounds**, which is what the evidence ties to letter knowledge ([Reading League 2025](https://www.thereadingleague.org/wp-content/uploads/2025/01/Brick-by-Brick-Insights-on-Alphabet-Instruction-From-Research.pdf)). AlphaBaby speaks letter names ([Macworld](https://www.macworld.com/article/180950/alphababy.html)). This is a known cost of the no-voice decision; if it is ever relaxed, 26 short letter-name clips are the highest-value audio to add.
- **Don't gate on spelling.** The CDC's age-4 milestones have no letter items; at 5 they list "names some letters" ([CDC 4 years](https://www.cdc.gov/act-early/milestones/4-years.html), [CDC 5 years](https://www.cdc.gov/act-early/milestones/5-years.html)). The 4 year old may not type their name alone.

## Per-keystroke feedback

Every key press gets a sound and a motion on the same frame. Children press harder, longer or again until they see input register ([Sesame Workshop 2012](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)), and Hirsh-Pasek et al. call contingent response the most basic element of engagement ([Hirsh-Pasek et al. 2015](https://kathyhirshpasek.com/wp-content/uploads/sites/9/2019/06/HirshPasek_ScienceofLearningApps.pdf)). Swink puts the real-time ceiling at 100 ms ([Swink review](https://lizengland.com/blog/2015/08/review-game-feel-by-steve-swink)).

| Input | Name changes? | Response |
|---|---|---|
| Letter key, first press | Appends uppercase letter | Tile pops in, letter's fixed note, character squash and hop |
| First letter of a new name | Appends | Larger reaction: double-scale tile, two-note flourish, character jump **(judgment)** |
| Digit 1 to 9 | No | That many sparkles, one rising tick each **(judgment)** |
| Space, Enter | Commits if 1+ letters | See commit rules |
| Backspace | Removes last letter | Drawn eraser rubs it out with a soft pop ([NN/g: children chose the eraser over undo](https://www.nngroup.com/articles/kids-cognition/)) |
| Any other key | No | Generic sparkle and blip; never an error |
| Held key (`event.repeat`) | No | Nothing, or a throttled sparkle |
| Modifier alone or Ctrl/Alt/Meta chord | No | Ignored |

Precedent: AlphaBaby shows letters for letter keys and shapes for everything else ([Macworld](https://www.macworld.com/article/180950/alphababy.html)); JumpStart Toddlers rewards any key or mouse movement ([Wikipedia](https://en.wikipedia.org/wiki/JumpStart_Toddlers)); a pre-K typing guide calls mashing "the first stage of keyboard learning" ([typinggameskids](https://typinggameskids.com/typing-games-for-prek/)); Typejoy treats a wrong key as a no-op that never breaks flow ([typejoy](https://github.com/ahrazzle/typejoy)).

The reacting character keeps a calm resting smile and shows emotion through motion (squash, hop, blink, color flash), not by switching faces, as HAL keeps Kirby neutral so he does not conflict with the player's emotions ([Kirby, Wikipedia](https://en.wikipedia.org/wiki/Kirby_(character))). Use a short wind-up and overshoot ([twelve principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)), with anticipation under about 150 ms, varied motion between presses, and at most one puff and one reaction per frame **(judgment)**. It is never sad or pleading; Radesky et al. documented apps that guilt children through characters ([Radesky 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)). Mashing earns giggles, not flinches.

## Uppercase handling

Show every letter uppercase (typed tiles, keycaps, avatar badges) and store a case-folded key.

- Uppercase is easier: in 1,113 preschoolers lowercase was substantially harder, and the four hardest of all 52 letters were lowercase q, d, l and b ([Bowles et al. 2014](https://files.eric.ed.gov/fulltext/ED613911.pdf)); see also [Worden and Boettcher 1990](https://api.crossref.org/works/10.1080/10862969009547711). Keycaps are uppercase too. Never show lowercase b, d, p, q or l alone. A JSON switch (`nameCase: "upper" | "title"`) can change this later.
- Read the character from `KeyboardEvent.key`, uppercased. `code` is the physical key and gives wrong letters on AZERTY ([MDN code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code)); with `key`, Caps Lock and Shift make no difference.
- Skip appends when `event.repeat` is true ([MDN repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat)); it is Baseline only since 2025, so treat `undefined` as false and keep a keyup fallback. Weezy3D logged a phantom held key from repeat-only keydowns ([Weezy3D](https://raw.githubusercontent.com/matthewod11-stack/Weezy3D/main/PROGRESS.md)). Ignore multi-character `key` values (`Dead`, `Process`, `Unidentified`).
- Typeface: Andika (SIL, OFL) has single-story a and g by default and distinct I, l and 1 ([Andika features](https://software.sil.org/andika/support/features/)). No study shows a children's font improves recognition, so choose on shapes and license. Self-host it; a Munich court fined a site for remote Google Fonts ([The Hacker News](https://thehackernews.com/2022/01/german-court-rules-websites-embedding.html)).
- Bake the glyph atlas only after `document.fonts.load()` resolves; a canvas drawn earlier keeps the fallback face (researcher observation; see [Sertic 2015](https://www.mirkosertic.de/blog/2015/03/tuning-html5-canvas-filltext/) on fillText cost).

## On-screen keyboard layout

| Option | Row width (96 px keys, 8 px gaps) | Height (3 rows) |
|---|---|---|
| A to Z, rows of 9/9/8 (default) | 928 px | 304 px |
| QWERTY, 10-key top row | 1032 px | 304 px |

- Default to ABC order. The CEC says ABC is cognitively easier for students who know the alphabet ([CEC 2011](https://ccc.exceptionalchildren.org/sites/default/files/2021-02/TechnologySpotlight_Summer2011OnscreenKeyboards.pdf)), but it writes for special-education users and also says QWERTY suits students who will use a standard keyboard. Make layout a JSON option and compare find-time with the two children.
- Light the matching on-screen key on every physical press, which links the two layouts without text **(judgment)**.
- Keys at least 96 CSS px, with invisible hit padding filling gaps so a near-miss snaps to the nearest key. NN/g recommends 2 cm targets for young children ([NN/g physical](https://www.nngroup.com/articles/children-ux-physical-development/)); 96 px is about 2.2 cm on a 14 inch 1366x768 panel but 1.8 cm on 11.6 inch, so measure the laptop and consider 110 px. Four year olds hit 90% of 64 px targets ([Hourcade et al.](https://www.cs.umd.edu/hcil/trs/2003-16/2003-16.pdf)).
- Every mouse button types; 2 of 13 four year olds mostly used the right button ([Hourcade, Bederson, Druin 2004](http://www.cs.umd.edu/~bederson/images/pubs_pdfs/p1411-hourcade.pdf)). Act on `pointerdown` with no button filter and cancel `contextmenu`.
- Typed letters sit in fixed-width tiles, 96 px with 16 px gaps (10 letters use 1104 px). Extra spacing reduced crowding for dyslexic readers ([Zorzi et al. 2012](https://api.crossref.org/works/10.1073/pnas.1205566109)). Sources cap names at 10 or 12 letters; use 10 so tiles stay at 96 px, with a soft bounce on the 11th.
- **Layout risk.** At 150% Windows scaling a 1366x768 panel leaves about 911x512 CSS px before browser chrome, possibly about 900x390 in a tab **(judgment estimate)**, and the keyboard, name row and recents do not fit at the 96 px floor. Run as an installed PWA and check the laptop's scale setting before building the layout.

## Sound mapping

- **One fixed note per letter**, from a major pentatonic scale over about two octaves, so mashing stays consonant ([UDLR devlog](https://deertwoheads.itch.io/udlr-modify/devlog/695577/audio-breakdown); [Sago Mini Sound Box](https://sagomini.com/article/soundbox-letter-to-parents/)). One source instead has keystroke *i* play scale step *i*, so name length is heard as a rising run. Recommend the fixed note: recognition sounds should stay identical every time ([A Sound Effect](https://www.asoundeffect.com/game-audio-immersion/)), and each name becomes a stable tune. Show the count visually on commit.
- Tune notes to the music's key, as later Mario effects do ([Mario SFX](https://medium.com/game-audio-lookout/musical-sound-effects-in-the-super-mario-series-b14872fb2d94)). Play immediately; never quantize keystrokes to the beat.
- Pre-render the 26 notes into AudioBuffers at boot (OfflineAudioContext), keeping detune within about +/-10 cents rather than the +/-4% of web examples ([valdemird](https://valdemird.com/blog/game-feel-on-the-web/)) **(judgment)**.
- Mash protection **(judgment)**: merge presses within about 30 ms; cap sound at about 8 per second, with extra presses animating silently (GAG lists avoiding repeated inputs, [GAG](https://gameaccessibilityguidelines.com/full-list/)); cap about 8 voices, stealing the oldest; use 5 to 12 ms attack ramps; route all audio through one master gain and a final DynamicsCompressorNode ([web.dev](https://web.dev/articles/webaudio-games)). Sudden loud sounds distress hypersensitive children ([National Autistic Society](https://www.autism.org.uk/advice-and-guidance/topics/sensory-differences/sensory-differences/all-audiences)).
- Pair every sound with a visual; the screen works fully muted ([Google Building for Kids](https://developers.google.com/building-for-kids/designing-engaging-apps)). Name-entry music sits well under keystroke sounds **(judgment)**.

### Audio unlock (sources conflict)

Sources split three ways. Some unlock on the first keystroke: [MDN user activation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation) counts keydown (except Esc), and Chrome's unlock shim listens for keydown ([Chrome web-audio-autoplay](https://developer.chrome.com/blog/web-audio-autoplay)). Others require a click on a start button, because Chrome says activation events are inconsistent across browsers and recommends click ([Chrome autoplay](https://developer.chrome.com/blog/autoplay)). A third view forbids any start gate; Toca dropped its touch-to-start intro as too complicated ([Business Insider archive](https://web.archive.org/web/2016/http://uk.businessinsider.com/toca-boca-ceo-bjorn-jeffery-interviewed-by-8-year-old-2015-5)).

**Recommendation.** No gate. Create one AudioContext at boot and resume it from capture-phase listeners on `pointerdown`, `pointerup`, `click`, `keydown` and `keyup`, playing that first input's own sound in the same handler. Hover never unlocks. Until the context reports `running`, drop SFX rather than queue them (a suspended clock would fire every queued note at once on resume **(judgment)**), pulse the mute icon in a "sound waiting" state, and run attract mode silent. Test keydown unlock on the target Chrome/Edge build; the first click on an on-screen key is the fallback. Installed desktop PWAs may get sound up front ([Chrome autoplay](https://developer.chrome.com/blog/autoplay)); don't rely on it.

## Returning-child flow

**Picker.** On every launch after the first, show recent-name bubbles with the most recent child first and gently pulsing, and require one click. Never auto-resume: with siblings, the last profile is a coin flip, and auto-resume would credit the wrong child **(judgment)**. First-ever launch goes straight to typing. A letter typed on the picker opens typing with that letter and prefix-filters the bubbles.

**Bubbles.**

- Each shows the uppercase initial as a large badge, a critter and a fixed color, three cues for a non-reader (Sesame recommends name plus unique icon, [Sesame](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)). The full name sits small beneath, for adults.
- Siblings may share an initial, so assign critter and color at creation and force them to differ from existing profiles; a pure hash of the name, proposed elsewhere, can collide. Children pick images for interest, not memorability ([Assal et al.](https://arxiv.org/html/1610.09743v1)), so if the child chooses, offer 3 options excluding lookalikes.
- Size bubbles at about 150 px; a miss here strands the child **(judgment)**. Keep about 6 visible and store at most about 5 profiles, evicting only an unused one with no unlocks.
- Hover replays the name tune and wiggles; only a click launches. Children mine-sweep the screen ([NN/g children's UX](https://www.nngroup.com/articles/childrens-websites-usability-issues/)). Ignore a second click on the same bubble within about 400 ms, since children double-click by accident ([Assal et al.](https://arxiv.org/html/1610.09743v1)).

**Matching typed names.**

- Normalize with NFKC, lowercase, trim, drop non-letters, and collapse only runs of 3+ repeated letters so "Anna" stays distinct from "Ana". Store the name as typed ([W3C](https://www.w3.org/International/questions/qa-personal-names)).
- Exact normalized match means the same child; a unique prefix match lights that bubble.
- Fuzzy matching is risky: Mia, Max and Mya sit within one or two edits. Allow edit-distance-1 suggestions only for names of 4+ letters, shown as a pulsing "is this you?" bubble, never an automatic merge. Partial names are expected; readable name writing tracked knowledge of the first letter only ([PMC2815302](https://pmc.ncbi.nlm.nih.gov/articles/PMC2815302/)).
- Pre-seed both children in the developer JSON with name, critter, color and aliases (`mia, mi, miaa, m`), so a child who cannot spell has a bubble from day one and misspellings resolve with no fuzzy logic.
- Offer a big one-click "surprise animal" bubble for a child who cannot type; GAG asks that play start without menu layers ([GAG](https://gameaccessibilityguidelines.com/full-list/)).

**Handoff.** An optional ghost-name hint (faint letters, next key pulsing, any key still works) follows Both-de Vries and Bus's advice to support name writing with prompts ([2008](https://files.eric.ed.gov/fulltext/EJ899643.pdf)); keep it off the path to play. Nothing sits between name and the first game: in ScratchJr only 50% of novices managed to open the editor ([Blake-West and Bers 2023](https://sites.bc.edu/devtech/wp-content/uploads/sites/181/2023/07/ScratchJr-design-in-practice-Low-fl_2023_International-Journal-of-Child-Com.pdf)). Aim for under 30 s from launch to play **(judgment)**.

**State.** Keep the hidden tier per profile; the two children differ widely ([Hourcade et al.](https://www.cs.umd.edu/hcil/trs/2003-16/2003-16.pdf)). Sources conflict on a new name's starting tier, easiest ([Big Brain Academy developers](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-3-big-brain-academy-brain-vs-brain-part-2/), [Pelanek](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)) versus middle. Recommend easiest: an unsupervised child facing a hard first round may quit. Don't collect age as Khan Academy Kids does ([Common Sense Media](https://www.commonsensemedia.org/app-reviews/khan-academy-kids)). Names stay in localStorage; data never transmitted is not collection under FTC FAQ F.5 ([FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)). Call `navigator.storage.persist()` and back up the raw save before migrating, because eviction deletes an origin's data wholesale ([MDN storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).

## Commit rules (sources conflict)

One view saves only on explicit confirm so mashed "ASDFJKL" never becomes a profile ([typinggameskids](https://typinggameskids.com/typing-games-for-prek/)); another says cut steps and start at the fun part ([New Yorker on Toca](http://www.newyorker.com/online/blogs/culture/2013/04/best-kids-ipad-app-toca-boca.html)). **Recommendation:** a big pulsing play-arrow appears after the first letter; clicking it, Enter or Space commits. It is the "go play" button, not a dialog. On commit, letters bounce in order, the name tune replays, and the letter count appears as a numeral beside matching dots (Sesame advises numerals in a counter, not on objects, [Sesame](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)).

## Keyboard hazards

Assume any key can leave the game. Call `preventDefault` on Backspace, Tab, Space, arrows and F-keys; skip Ctrl/Alt/Meta chords; give the mute button `tabindex -1` and blur it after clicks. `Keyboard.lock()` can capture Esc in fullscreen, needs user activation and is not Baseline ([MDN Keyboard.lock](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock)); Alt+F4, Ctrl+W and the Windows key cannot be blocked from a page, while native Baby Smash locks more ([Baby Smash](https://www.babysmash.com/)). Test with the children's hands. Arm no adult key chord here, since every key types **(judgment)**.

## Idle and attract behavior

Sources range from 3 to 10 s; Sesame uses 3 to 5 s for story-like screens and 6 to 8 s for games ([Sesame](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf)). Recommend this ladder, values in JSON:

| Idle | Hint |
|---|---|
| 6 s | Newest bubble (or first letter key) glows |
| 10 s | Character points at it |
| 14 s | Ghost cursor types the mascot's name on the on-screen keyboard, one straight glide per key |
| After 2 loops | Go quiet; character dozes; never escalate |

Any input cancels it. Baby Smash keeps animating when left alone ([Baby Smash](https://www.babysmash.com/)), and preschoolers learned more from watching than playing on new tasks ([Schroeder and Kirkorian 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5020045/)).

## What to avoid

Lowercase-only display; text instructions; a start gate; features that need sound; queued or unlimited sounds; repeat-stacked letters; buzzers or "wrong" states; sad or wilting faces, including on bubbles of names not played lately ([Radesky 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)); auto-resume; launching on hover; fuzzy-merging short names; asking age; names leaving the device; remote fonts; logging which keys were pressed (count only); claiming the screen teaches letters.

## Proposed interaction script

1. **Boot, silent.** Bubbles drift, newest pulsing; the character's eyes follow the cursor; the mute icon pulses "waiting".
2. **Returning child clicks a bubble.** That pointerdown unlocks audio; the bubble plays its name tune and bursts, the character cheers, the first game opens.
3. **Returning child presses a letter instead.** Keydown unlocks audio; the letter appears large with its note and non-matching bubbles dim. A unique prefix match pulses that bubble; Enter or a click logs in.
4. **New child types "M".** Big first-letter reaction; the play-arrow appears.
5. **"I", "A".** Tiles pop in with fixed notes, the character hops a different way each time, matching on-screen keys light.
6. **Mashing, holding, stray keys.** One letter per press, at most about 8 sounds per second then silent sparkles; held keys add nothing; arrows and F-keys sparkle; Backspace erases with a pop; "3" bursts three sparkles with three rising ticks.
7. **Enter or play-arrow.** Tiles bounce left to right with the name tune, "3" appears beside three dots, and a new bubble is minted with a critter and color distinct from the sibling's. The child goes straight to the first game at the easiest tier.
8. **Idle.** The hint ladder above.
