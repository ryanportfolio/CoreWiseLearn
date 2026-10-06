/** Rhyme snack round planning: which family, which target, which rhymes and decoys, and the hidden tiers. Pure logic. */
import type { Tier } from '../../engine/difficulty';
import { RHYME_FAMILIES, type RhymeFamily } from './content';

export interface RhymeTier {
  /** Rhyming bugs to catch. */
  rhymes: number;
  /** Bugs whose word does not rhyme. */
  decoys: number;
  /** Flying speed in layout px per second (1366x768 layout). */
  speed: number;
  /** Decoys may share the target's vowel (CAP against CAT), which is harder to tell apart. */
  near: boolean;
}

export const RHYME_TIERS: readonly RhymeTier[] = [
  { rhymes: 3, decoys: 2, speed: 34, near: false },
  { rhymes: 4, decoys: 3, speed: 50, near: false },
  { rhymes: 4, decoys: 4, speed: 66, near: true },
];
/** The first round ever: two rhymes, one decoy, slow. */
export const INTRO_TIER: RhymeTier = { rhymes: 2, decoys: 1, speed: 30, near: false };
export const ROUND_STARS = 3;

export interface RhymePlan {
  rime: string;
  target: string;
  /** Rhyming words, then decoys; `rhymes` says how many of `words` rhyme. */
  words: string[];
  rhymes: number;
}

/** The vowel of a rime ('AT' -> 'A'). */
const vowel = (rime: string): string => rime[0] ?? '';

function take<T>(list: T[], random: () => number): T {
  return list.splice(Math.floor(random() * list.length) % list.length, 1)[0]!;
}

export function tierParams(tier: Tier, intro: boolean): RhymeTier {
  return intro ? INTRO_TIER : RHYME_TIERS[tier]!;
}

/**
 * One round: a family other than `lastRime`, a target from it, `rhymes` other words from it and `decoys` words from
 * other families (no two from one family). Without `near`, decoys come only from families with another vowel; with it,
 * one decoy shares the target's vowel when such a family exists.
 */
export function planRhyme(params: RhymeTier, lastRime: string, random: () => number, introFamily?: string): RhymePlan {
  const families = RHYME_FAMILIES.filter(f => f.rime !== lastRime);
  const family: RhymeFamily = (introFamily && RHYME_FAMILIES.find(f => f.rime === introFamily)) || families[Math.floor(random() * families.length) % families.length]!;
  const pool = family.words.slice();
  const target = take(pool, random);
  const rhymeCount = Math.min(params.rhymes, pool.length);
  const words: string[] = [];
  for (let i = 0; i < rhymeCount; i++) words.push(take(pool, random));
  const others = RHYME_FAMILIES.filter(f => f !== family);
  const far = others.filter(f => vowel(f.rime) !== vowel(family.rime));
  const near = others.filter(f => vowel(f.rime) === vowel(family.rime));
  const picks: RhymeFamily[] = [];
  if (params.near && near.length && params.decoys > 0) picks.push(take(near, random));
  const farPool = far.slice();
  while (picks.length < params.decoys && farPool.length) picks.push(take(farPool, random));
  for (const f of picks) words.push(take(f.words.slice(), random));
  return { rime: family.rime, target, words, rhymes: rhymeCount };
}

/**
 * The tune the catches play, as pentatonic degrees (0 = C4, 5 = C5): each catch plays the next note and the last catch
 * of the round lands on the high C, so catching every rhyme finishes the phrase.
 */
const TUNES: Readonly<Record<number, readonly number[]>> = {
  1: [5], 2: [2, 5], 3: [0, 2, 5], 4: [0, 2, 3, 5], 5: [0, 1, 2, 3, 5],
};
export function tuneDegree(catchIndex: number, rhymes: number): number {
  const tune = TUNES[Math.max(1, Math.min(5, rhymes))]!;
  return tune[Math.min(tune.length - 1, catchIndex)]!;
}
/** The 'key' sound's index that plays pentatonic degree `d` (it spreads 26 letters over ten degrees). */
export const keyIndexForDegree = (d: number): number => Math.round(d * 2.5);
