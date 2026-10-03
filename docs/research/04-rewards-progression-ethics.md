# Rewards, progression and ethical engagement

Research digest, 2026-10-02. Covers per-pop feedback, stars, celebration, stickers, unlocks, the future pet or world, and the break nudge. Items marked "judgment" have no direct source.

## The short version

1. The pop itself is the main reward. Stars, stickers and the pet are a quiet frame around it.
2. Every reward is deterministic and earned inside the session: one sticker per finished round, no random drops, streaks, daily bonuses or timers.
3. Nothing in the hub reacts to the child being absent, idle or leaving except by going calm and sleepy. No character is ever sad.
4. Every round ends on a still screen with a free choice. Nothing auto-starts.
5. Health is measured by how the children stop and whether they come back unprompted, never by minutes played.

## What the evidence says about rewards at this age

Expected, tangible rewards for an activity a child already enjoys lower later free-choice interest in that activity. Bubble popping is exactly that kind of activity, so the spec's stars and sticker book are its main motivational risk.

| Finding | Number | Source |
|---|---|---|
| Engagement-contingent tangible rewards, free-choice motivation | d = -0.40 | [Deci, Koestner & Ryan 1999](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf) |
| Completion-contingent | d = -0.36 | same |
| Performance-contingent | d = -0.28 | same |
| Same rewards, children vs college students | d = -0.43 vs -0.21 | same |
| Unexpected tangible rewards (9 studies) | d = 0.01 | same |
| Task-noncontingent rewards, "gifts" (7 studies) | d = -0.14, not significant | same |
| Positive feedback | d = +0.33, but effect found in college students, not children | same |
| 20-month-olds helping after a toy reward vs praise vs nothing | 53% vs 81% vs 89% | [Warneken & Tomasello 2008](https://www.eva.mpg.de/documents/AmericanPsychologicalAss/Warneken_Extrinsic_DevPsych_2008_1554561.pdf) |

[Lepper and Greene (1975)](https://bingschool.stanford.edu/sites/bingschool/files/1975_leppergreene.pdf) found 4 to 5 year olds who expected a reward for puzzles, or were told a camera was watching, showed less interest in the puzzles two weeks later. The evidence is contested ([overjustification summary](https://en.wikipedia.org/wiki/Overjustification_effect) notes Feingold and Mahoney found no drop for token rewards), so treat it as directional. So frame rewards as gifts for playing, not prizes for performing. Note that the "unexpected" lab condition does not survive repetition: a sticker after every round becomes expected within a few rounds, so end-of-round placement keeps it out of mind during play but does not make it a surprise.

Three findings point to better reward forms:

- **Causally rich rewards.** 3 and 4 year olds who saw a short cause-and-effect explanation of an object after each trial persisted longer than those given weak information or nothing, and trended longer than those given stickers ([Alvarez & Booth 2014](https://pubmed.ncbi.nlm.nih.gov/24033222/)). Hirsh-Pasek et al. cite this and warn that task-unrelated stickers dilute felt accomplishment ([Hirsh-Pasek et al. 2015](https://kathyhirshpasek.com/wp-content/uploads/sites/9/2015/09/Psychological-Science-in-the-Public-Interest-2015-Hirsh-Pasek-3-34.pdf)).
- **Process over person.** Person-focused feedback, praise included, produced more helpless responses in 5 and 6 year olds after a later setback than process feedback ([Kamins & Dweck 1999](https://pubmed.ncbi.nlm.nih.gov/10380873/)). Praise works when "genuine, specific, and used somewhat sparingly" ([Henderlong & Lepper 2002](https://jwilson.coe.uga.edu/EMAT7050/Students/Ramsey/HenderlongLepper2002.pdf)). All of this is verbal praise; transfer to wordless animation is an assumption.
- **Competence, autonomy, relatedness.** Rewards, pressure and evaluation build controlled motivation that is "not additive" with intrinsic motivation and typically undermines it ([Przybylski, Rigby & Ryan 2010](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf)). This is theory drawn mostly from older players.

The products parents trust most for this age leave rewards out. In an audit of 133 apps used by 160 children aged 3 to 5, PBS KIDS apps had no manipulative features apart from autoplay ([Radesky et al. 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)). Pok Pok's designers state "no reward systems" and say deeper play is "rewarded with more play" ([Game Developer](https://www.gamedeveloper.com/design/how-just-letting-kids-be-kids-drives-the-design-of-pok-pok-playroom)).

## The reward layers

### Per pop and per combo

The pop sound, squash and particles carry the moment-to-moment motivation; spend polish here before any meta system. Mid-round feedback stays small and attached to the bubble; big effects wait for round end, because extraneous "bells and whistles" distracted 3 year olds and continuous distraction impaired 4 year olds ([Hirsh-Pasek et al. 2015](https://kathyhirshpasek.com/wp-content/uploads/sites/9/2015/09/Psychological-Science-in-the-Public-Interest-2015-Hirsh-Pasek-3-34.pdf)). Meyer et al. list coins and stars flying to trackers as engagement-lowering distractions in children's apps ([Meyer et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8916741)), so no per-pop token counters.

Combos are additive only. A broken chain resets silently with no down-sound, no colour change and no lost points (judgment, consistent with the spec's no-failure rule). Combo tiers top out at a fixed cap so the effect budget per round is bounded.

### Round end: stars and celebration

| Rule | Value | Basis |
|---|---|---|
| Minimum stars for a finished round | 1, always | spec; [Kirby's Epic Yarn](https://en.wikipedia.org/wiki/Kirby%27s_Epic_Yarn) always awards a medal and has no death |
| Signal for 2 and 3 stars | longest combo, or beating the child's own recent median | judgment: if stars come from pop rate while the adaptive controller holds pop rate in a band, every round gets the same stars |
| Target share of 3-star rounds | about 60 to 70% | judgment, tune in playtest |
| Star display | earned stars fill in; no empty or grey slots | judgment from [Kamins & Dweck](https://pubmed.ncbi.nlm.nih.gov/10380873/) |
| Routine celebration length | about 4 s to the rest screen | judgment |
| Skippable | any click or key from the first frame | [Radesky et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/) codes lost exit control as manipulative |
| Variants | 4 to 6 cosmetic variants, no repeat of the last one | one Zoolingo parent reported a child quitting tasks early to avoid a repeated monkey dance ([App Store reviews](https://itunes.apple.com/us/rss/customerreviews/page=1/id=611668665/sortby=mostrecent/json)) |
| Flashing | 3 or fewer flashes per second; any flashing region under 21,824 CSS px squared | [WCAG 2.3.1](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html), [G176](https://www.w3.org/WAI/WCAG21/Techniques/general/G176) |

The flash numbers in the research disagreed (21,800 vs 87,296 px squared). Both are correct: 87,296 is the WCAG reference area, and G176 says a region under 25% of it (21,824) passes automatically. Use the stricter number so no luminance measurement is needed.

The celebration shows what the child did (pops tallying up, the combo as a linked chain), not a verdict such as a crown. A 1-star round gets the same confetti and jingle as a 3-star round with slightly less sparkle (judgment). Positive-only feedback is already the genre norm ([Nikolayev, Reich et al.](https://reacheveryreader.gse.harvard.edu/review-of-feedback-in-edutainment-games-for-preschoolers-in-the-usa)); the work is keeping it informational.

After the celebration comes a still rest screen: two icons of equal size, brightness and motion (replay arrow, house), no timer, no pulsing, no auto-advance. Hiniker and Kientz found preschoolers given autoplay kept watching even when prompted to plan other play ([UW News 2018](https://www.washington.edu/news/2018/05/01/apps-for-children-should-emphasize-parent-and-child-choice-researchers-say/)), and parents in a separate study described autoplay as "universally described as a feature parents fight against", with 93% reporting resistance at the end of screen time at least occasionally ([Hiniker et al. CHI 2016](https://faculty.washington.edu/alexisr/ScreenTimeTantrums.pdf)). Inputs that started before the rest screen appeared are ignored; a fresh, non-repeat press after a 250 to 400 ms guard is required (judgment), so a child mashing through the celebration does not restart or leave by accident.

### Stickers

| Rule | Detail |
|---|---|
| Cadence | one sticker per finished round, independent of star count |
| Selection | drawn without replacement from the child's unowned stickers on the current page |
| Child choice | offer two wrapped gifts; the child clicks one (judgment; Khan Academy Kids lets kids "choose a prize", [Common Sense Media](https://www.commonsensemedia.org/app-reviews/khan-academy-kids)) |
| Placement | automatic fly-and-stamp into the book; no dragging |
| v1 size | one book, 3 pages of 8 slots, one theme per page (judgment) |
| Duplicates | impossible; once the book is full, extra rewards upgrade owned stickers in book order (plain, glitter, gold) |
| Each sticker | clicking it in the book plays a 2 to 4 s cause-and-effect vignette with a sound |

Why without replacement: random draws with replacement follow the coupon-collector curve, where a 40-item set needs about 171 draws and the last 10% of items costs about half of them ([coupon collector](https://en.wikipedia.org/wiki/Coupon_collector%27s_problem)). Japan banned "complete gacha", where the last item becomes hard to get, in 2012 ([loot box](https://en.wikipedia.org/wiki/Loot_box)). A run of repeats is a loss moment the spec forbids. The identity of the sticker varies; the schedule does not, so this is not a variable-ratio reward.

A page of 8 fills in roughly 10 to 15 minutes, inside one 20-minute session. The vignette rule comes from the causally rich reward finding above ([Alvarez & Booth](https://pubmed.ncbi.nlm.nih.gov/24033222/)) and gives the book a reason to be opened that is about the content, not the count.

Optional config knob, default off: fade sticker cadence after a child's first N rounds of a game, following [Nugent's suggestion](https://www.edutopia.org/blog/praise-motivational-kids-apps-carolina-nugent) that extrinsic hooks can scale down once a child is into a game. It is one practitioner's opinion, so only switch it on to test.

### Unlockable characters and skins

Unlock at page and book completion, never at star thresholds, never behind a skill gate. Tying unlocks to stars would let the hidden tier split the siblings' collections unevenly, and Nintendo's recent design lets players progress without beating hard challenges ([Ask the Developer, Mario Wonder](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-11-super-mario-bros-wonder-part-3/)). Every hub game tile stays open at all times. Offer three or more odd, non-gendered characters and let the child pick the active one each session; that visible choice is the cheapest autonomy lever in the spec ([Przybylski et al.](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf)).

### Shared pet and world (future)

The pet only grows. It never hungers, sickens, shrinks, cries, dies, or changes while the children are away; when they return it wakes and waves.

- Tamagotchi pets die from poor care, and schools banned them over the constant attention they demanded ([Tamagotchi](https://en.wikipedia.org/wiki/Tamagotchi)). Krahl et al. found sad pet animations and prompts such as "Don't leave your friends hungry!" in popular Teacher Approved apps ([Krahl et al.](https://arxiv.org/html/2512.17819v1)).
- Growth comes from rounds completed, not the wall clock. Animal Crossing's real-time clock makes absence visible ([Animal Crossing](https://en.wikipedia.org/wiki/Animal_Crossing)); a daily bonus is coded as a lure by [Radesky et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/).
- Hatch the egg inside the first session; advance stages on combined rounds of both children; branch forms by play preference so every outcome is good; give growth a finite, completable arc (judgment).
- Swap "the child meets the pet's needs" for "the child teaches the pet": counted pops unlock a trick such as counting to 3. Children aged 3 to 6 learned English verbs efficiently by teaching a care-receiving robot ([Tanaka & Matsuzoe 2012](https://doi.org/10.5898/jhri.1.1.tanaka)).

### Break nudge

At about 20 minutes of visible play, wait for the current round to end, then run the yawn: the mascot is sleepy and content, never disappointed. Colours shift toward dusk and music slows and drops its percussion layer. No countdown, timer bar or loss. Fabricated time pressure appeared in 17.3% of apps, and preschoolers may not recognise it as fabricated ([Radesky et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)). Warned transitions were rated more upsetting than unwarned ones (3.36 vs 3.06 of 5, p = .002), and technology-mediated endings went better than parent-mediated ones ([Hiniker et al. 2016](https://faculty.washington.edu/alexisr/ScreenTimeTantrums.pdf)).

A mascot pointing at an option roughly doubled preschoolers' choice of it (26% vs 12.5% chance) in a preprint ([Research Square](https://doi.org/10.21203/rs.3.rs-10395354/v1)), so it must never pressure play but may point toward bed.

No source tests whether a non-locking character cue gets 4 and 5 year olds to stop. Treat the first release as an experiment.

## Conflicts in the research and the calls made

| Conflict | Call | Reason |
|---|---|---|
| Show silhouettes of the next 2 or 3 prizes and a pulsing last slot, vs no "almost there" cues | Silhouettes appear only inside the book. No previews on the hub or game screen, no percent, no pulsing last slot. Page tabs show one filled dot per owned sticker and no empty dots. | Silhouettes are the only text-free way to show what a slot holds; previews during play make the reward expected ([Deci et al.](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)); lures appeared in 45.1% of apps ([Radesky](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)) |
| Child picks a prize, vs draw without replacement, vs surprise every 2 to 4 rounds | Fixed cadence, two wrapped unowned gifts, child picks one | Random cadence is a variable-ratio schedule; random identity without replacement is bounded |
| Sticker per round vs per star | Per finished round | Decoupling from stars keeps stickers gift-like and stops the hidden tier skewing collections |
| Sticker book as default next step vs still two-choice screen | Still two-choice screen; the sticker visibly lands in the book during the celebration; the book is reached from the hub | Auto-advance and tunnelling are navigation constraints (45.9% of apps) |
| Break screen: big go-home default and hidden replay, vs equal prominence | Normal rounds: equal weight. At the break nudge only: a larger centred moon icon, with replay still visible at 96 px or more and one click away | The ICO code asks services to nudge 0 to 5 year olds toward breaks ([ICO Standard 13](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/)), so asymmetry toward stopping is the allowed direction; hiding replay would make it a lock |
| Read-only view of the sibling's book vs no cross-profile comparison | No sibling view in v1; revisit only if playtests show the children ask for it | Siblings this age notice and enforce rules; comparison invites competition, and the hub has a cooperative pet for relatedness |
| No analytics vs per-skill logs and daily minutes per avatar | Nothing ever leaves the device. Adaptive state is minimal per profile. A playtest log exists behind a JSON flag, off by default, with round-relative times only, wiped on export or after 14 days. One per-profile "minutes today" value may shorten re-yawn intervals after a JSON threshold; it is overwritten daily and never logged, exported or rewarded. | Radesky's authors tie manipulative design to measuring success by duration and frequency of use; the [Canadian Paediatric Society](https://pmc.ncbi.nlm.nih.gov/articles/PMC10186096/) advises about 1 hour or less per day, which a single nudge cannot reflect (judgment) |

## Red lines

The hub never ships any of these. They map to Radesky's four categories (parasocial pressure, time pressure, navigation constraints, lures) plus the commercial patterns in [Krahl et al.](https://arxiv.org/html/2512.17819v1).

1. A character that is sad, pleading, taunting or nagging, or that reacts to the child idling or leaving. My Talking Tom 2's "You're making me want to go to sleep" is the counter-example the yawn must avoid ([Radesky](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/)).
2. Countdowns, timers, "hurry" music or limited-time content.
3. Auto-start of the next round or game, auto-focus on a "next" tile, or any screen without a one-click exit.
4. Streaks, daily-login rewards, "come back tomorrow" hooks, play-longer bonuses, or random reward packs.
5. A pet or world that decays, waits or changes while the children are away.
6. Shops, currencies bought with money, ads, outbound links, sharing, chat.
7. Notification or push permission requests, icon badges, or an install prompt shown to the child.
8. Analytics, third-party scripts or fonts, or any network call carrying a name or play data. COPPA's 2025 amendments still allow engagement prompts, so legal compliance does not enforce lines 1 to 5 ([Davis Wright Tremaine](https://www.dwt.com/blogs/privacy--security-law-blog/2025/05/coppa-rule-ftc-amended-childrens-privacy)); the hub has to enforce them itself.
9. A cross-profile scoreboard or per-child credit on shared progress.
10. Losing earned progress. Save on every award and on `visibilitychange`, and call `navigator.storage.persist()` after the first finished round ([web.dev](https://web.dev/articles/persistent-storage)).

## Review checklist for every PR touching rewards, mascot, idle states or round end

Answer each with "none" or a justification in the PR body.

- **Parasocial:** does any character's emotion change because the child stopped, idled or declined?
- **Time:** is there a countdown, deadline or scarcity cue?
- **Navigation:** does anything start without a click, or make leaving cost more than staying?
- **Lures:** is a reward previewed, teased or placed at a decision point?
- **Absence test:** does the feature act when the child is absent or leaving? Does leaving cost anything? Would it exist if nobody measured session time? A yes to either of the first two means redesign. This test is synthesis, not a published instrument; it serves the [Child Rights by Design](https://childrightsbydesign.5rightsfoundation.com/principles/11-agency/) goal that children start and stop easily without feeling they lose out.

## Measuring that the design stays healthy

Two children and no telemetry means observation, not statistics. The [Digital Thriving Playbook](https://digitalthrivingplaybook.org/big-idea/age-appropriate-design/) frames good design as a child who onboards easily, returns to deepen play and enjoys it with family.

| Signal | How to get it | Healthy direction (judgment) |
|---|---|---|
| Who ends the session (child, parent, tantrum) | observer note per session | mostly the child, without protest |
| Rounds played after the yawn | playtest log | falls over the first week; zero to two is good |
| Rest-screen choice | playtest log: replay vs home, counted only if input comes more than 500 ms after the icons appear | home chosen sometimes |
| Unprompted hub starts with rewards on vs a reward-light week | JSON switch for stickers, compare game starts per hub visit | little difference; a large drop when stickers stop is the overjustification warning sign |
| Celebration skip time | ms from celebration start to first input | rising skip rate means celebrations are stale; rotate variants |
| Inventing own rules | observer note: is the child setting goals (only red, combos) by round 10? | yes |
| Opening the book between rounds | observer note | yes, and poking stickers rather than counting slots |

The reward-off comparison follows the overjustification literature, which measures harm as lower free-choice engagement once rewards stop ([Deci et al.](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)). It is a sanity check on two children with no control group, not proof.

## Open questions for the owner

- Whether to add per-profile re-yawn after a daily threshold, which goes beyond the spec's single nudge.
- Whether the future sandbox should be exempt from rounds and stars. [Toca Boca](https://tocaboca.com/about/) contrasts play with competition, getting stuck on a level and addiction, and a stars frame turns a toy back into a goal game.
- The brief asks for an "addictive" quality alongside a break nudge. This digest reads that as replay from delight, mastery and a growing world, not retention loops; confirm that reading in writing.
