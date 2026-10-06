/** Frog Pond save bag: hidden tier, word help, the last target, and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';
import { COMPOUNDS, RETIRED_COMPOUNDS } from './content';

export const GAME_ID = 'frog-pond';
/** The activities that exist. Each later activity adds its id here and a spot on the pond. */
export const ACTIVITY_IDS = ['rhyme', 'pot', 'sentences'] as const;
export type ActivityId = (typeof ACTIVITY_IDS)[number];

export interface PendingRound {
  /** Names this round across tabs, so two rounds with the same fields stay apart. */
  id: string;
  activity: ActivityId;
  stars: number; choices: string[]; chosen: string;
  rewardEnabled: boolean; restEntered: boolean;
  /** The round's target word, so the rest screen shows the same frog pad after a reload. */
  target: string;
}

export interface FrogPondData extends Record<string, unknown> {
  /** Hidden tier: decoy bugs and how fast the bugs fly. */
  tier: number;
  /** Finished rounds, all activities. 0 means the next round is the introduction. */
  rounds: number;
  /** 1 while the bugs say their word when the child points at them (after a long pause or several dodges). */
  assist: number;
  /** The last round's rhyme family (its rime, such as 'AT'), so the next round picks another. */
  lastRime: string;
  pending: PendingRound | null;
  /** Word fountain's own progress, kept apart from Rhyme snack's. The key keeps its first name, `pot`. */
  pot: PotData;
  /** Lily-pad sentences' own hidden tier, round count, word help and last sentence. */
  sentences: SentenceBag;
}

/** Word fountain's part of the bag. A bag from before Word fountain gets the default on load (the validator adds it). */
export interface PotData {
  /** Hidden tier: words and decoys per round, and how fast the bubbles drift. */
  tier: number;
  /** Finished Word fountain rounds. 0 means the next one is its introduction. */
  rounds: number;
  /** 1 while pressing a bubble says its word (after a long pause or several bonks). */
  assist: number;
  /** Every compound word the child has made, oldest first, each once: the pictures swimming in the pond. Retired words stay. */
  made: string[];
  /** The last round's words, so the next round picks others. */
  last: string[];
}

export const defaultPot = (): PotData => ({ tier: 0, rounds: 0, assist: 0, made: [], last: [] });

export interface SentenceBag extends Record<string, number> {
  /** Hidden tier 0..2: sentences of difficulty 1, 2 or 3. */
  tier: number;
  /** Finished Lily-pad sentences rounds. 0 means its next round is the introduction. */
  rounds: number;
  /** 1 while pressing a pad says its word (after a long pause or several out-of-order presses). */
  assist: number;
  /** Index into SENTENCES of the last round's sentence plus one (0: none), so the next round picks another. */
  last: number;
}
export const defaultSentenceBag = (): SentenceBag => ({ tier: 0, rounds: 0, assist: 0, last: 0 });

export const defaultData = (): FrogPondData => ({ tier: 0, rounds: 0, assist: 0, lastRime: '', pending: null, pot: defaultPot(), sentences: defaultSentenceBag() });

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const word = (v: unknown): v is string => typeof v === 'string' && v.length <= 12 && /^[A-Za-z]*$/.test(v);

export const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);

/**
 * Repair malformed fields in place; protect the stored document when anything was wrong. A missing field (a bag from
 * an older build, or none at all) takes its default without protecting.
 */
export function sanitizeFrogPondData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const checks: Record<string, (v: unknown) => boolean> = { tier: v => range(v, 2), rounds: count, assist: v => range(v, 1), lastRime: word };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in bag)) { bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  sanitizePot(bag, protect);
  sanitizeSentenceBag(bag, protect);
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!record(p) || typeof p.id !== 'string' || !ACTIVITY_IDS.includes(p.activity as ActivityId) || !range(p.stars, 3) || p.stars < 1 ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean' || !word(p.target)) {
    protect(); bag.pending = null;
  }
}

/** Every word the collection may hold: the offered words and the retired ones (BEDBUG, ZIPLINE, HAIRBALL), so a word made
 * before it was retired is never dropped. */
const COMPOUND_SET = new Set([...COMPOUNDS, ...RETIRED_COMPOUNDS].map(c => c.word));
/** A list of distinct compound words, at most `max` long. */
const words = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(w => typeof w === 'string' && COMPOUND_SET.has(w)) && new Set(v).size === v.length;

/**
 * Word fountain's part of the bag, repaired field by field. The collection is never reset: a list with a bad entry keeps
 * its good ones.
 */
function sanitizePot(bag: Record<string, unknown>, protect: () => void): void {
  if (!('pot' in bag)) { bag.pot = defaultPot(); return; }
  if (!record(bag.pot)) { protect(); bag.pot = defaultPot(); return; }
  const p = bag.pot, d = defaultPot();
  const checks: Record<string, (v: unknown) => boolean> = { tier: v => range(v, 2), rounds: count, assist: v => range(v, 1), made: v => words(v, COMPOUND_SET.size), last: v => words(v, 4) };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in p)) { p[key] = d[key as keyof PotData]; continue; }
    if (valid(p[key])) continue;
    protect();
    const v = p[key];
    p[key] = (key === 'made' || key === 'last') && Array.isArray(v) ? [...new Set(v.filter(w => typeof w === 'string' && COMPOUND_SET.has(w)))].slice(0, key === 'last' ? 4 : COMPOUND_SET.size) : d[key as keyof PotData];
  }
}

/** Repair Lily-pad sentences' fields the same way: a missing bag or field takes its default, a malformed one protects. */
function sanitizeSentenceBag(bag: Record<string, unknown>, protect: () => void): void {
  if (!('sentences' in bag)) { bag.sentences = defaultSentenceBag(); return; }
  const b = bag.sentences;
  if (!record(b)) { protect(); bag.sentences = defaultSentenceBag(); return; }
  const d = defaultSentenceBag();
  const checks: Record<string, (v: unknown) => boolean> = { tier: v => range(v, 2), rounds: count, assist: v => range(v, 1), last: v => range(v, 999) };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in b)) { b[key] = d[key]; continue; }
    if (!valid(b[key])) { protect(); b[key] = d[key]; }
  }
}
