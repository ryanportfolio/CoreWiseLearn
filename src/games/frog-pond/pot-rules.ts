/** Word pot round planning: which compound words, which decoys, and the hidden tiers. Pure logic. */
import type { Tier } from '../../engine/difficulty';
import { COMPOUNDS, DECOYS, EXTRA_COMPOUNDS, type Compound } from './content';

export interface PotTier {
  /** Compound words to make. */
  words: number;
  /** Bubbles that fit nothing. */
  decoys: number;
  /** Drifting speed in layout px per second (1366x768 layout). */
  speed: number;
}

export const POT_TIERS: readonly PotTier[] = [
  { words: 2, decoys: 1, speed: 12 },
  { words: 3, decoys: 2, speed: 18 },
  { words: 4, decoys: 3, speed: 24 },
];
/** The first Word pot round ever: two words (the glove makes the first), one decoy, slow. */
export const POT_INTRO: PotTier = { words: 2, decoys: 1, speed: 9 };

export const potParams = (tier: Tier, intro: boolean): PotTier => (intro ? POT_INTRO : POT_TIERS[tier]!);

export interface PotPlan {
  /** The round's compound words, in the order they were picked. */
  compounds: Compound[];
  /** Every bubble's word: the compounds' halves, then the decoys. */
  bubbles: string[];
  /** How many of `bubbles` are halves (the rest are decoys). */
  halves: number;
}

export const COMPOUND_WORDS: readonly string[] = COMPOUNDS.map(c => c.word);
const ALL: readonly Compound[] = [...COMPOUNDS, ...EXTRA_COMPOUNDS];

/**
 * The listed word two bubbles make, in either order ('cake' and 'pan' make 'pancake'), or undefined. Extras count, so
 * the planner can keep their halves apart.
 */
export function joinWord(a: string, b: string): Compound | undefined {
  for (const c of ALL) if ((c.parts[0] === a && c.parts[1] === b) || (c.parts[0] === b && c.parts[1] === a)) return c;
  return undefined;
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)) % (i + 1); const t = out[i]!; out[i] = out[j]!; out[j] = t; }
  return out;
}

/** True when `word` can join the pot: no shared bubble, and it makes no listed word with any bubble already there. */
function fits(word: string, pot: readonly string[]): boolean {
  return !pot.includes(word) && pot.every(w => !joinWord(word, w));
}

/**
 * One pot: `words` compounds, then `decoys` bubbles that fit nothing. Every two bubbles in the pot make a listed word
 * exactly when they are the two halves of one of the round's compounds, so the pot can always be finished and no extra
 * word (seabed, sunfish) can be made by accident. Words the child has not made yet come first, then words not in the
 * last round.
 */
export function planPot(params: PotTier, made: readonly string[], last: readonly string[], random: () => number): PotPlan {
  const rank = (c: Compound): number => (made.includes(c.word) ? 2 : 0) + (last.includes(c.word) ? 1 : 0);
  const order = shuffled(COMPOUNDS, random).sort((a, b) => rank(a) - rank(b));
  const compounds: Compound[] = [], bubbles: string[] = [];
  for (const c of order) {
    if (compounds.length >= params.words) break;
    const [a, b] = c.parts;
    if (a === b || !fits(a, bubbles) || !fits(b, bubbles)) continue;
    compounds.push(c); bubbles.push(a, b);
  }
  const halves = bubbles.length;
  for (const d of shuffled(DECOYS, random)) {
    if (bubbles.length - halves >= params.decoys) break;
    if (fits(d, bubbles)) bubbles.push(d);
  }
  return { compounds, bubbles, halves };
}
