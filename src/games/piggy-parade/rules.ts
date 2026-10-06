/**
 * Piggy Parade tuning and the rules that change difficulty between rounds.
 * Motor tiers and learning steps are separate and never change inside a round.
 */
import type { Tier } from '../../engine/difficulty';
import { MAX_STEP, type PiggyData } from './data';

export const COIN_NAMES = ['penny', 'nickel', 'dime', 'quarter'] as const;
export const PENNY = 0, NICKEL = 1, DIME = 2, QUARTER = 3;
/** True US coin diameters in millimetres, in COIN_NAMES order. */
export const DIAMETER_MM = [19.05, 21.21, 17.91, 24.26] as const;
/** Each coin's diameter divided by the dime's, so the dime's size sets them all. */
export const RATIO = DIAMETER_MM.map(d => d / DIAMETER_MM[DIME]);

export interface TierParams {
  /** Most coins resting on the tray at once (the layout may fit fewer). */
  tray: number;
  /** Coins in one round. */
  coins: number;
  /** Multiplier on the layout's piggy height. */
  size: number;
  /** How far a piggy's drop zone grows sideways and upward, in piggy widths. */
  snap: number;
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { tray: 2, coins: 6, size: 1.12, snap: 0.5 },
  { tray: 4, coins: 8, size: 1, snap: 0.25 },
  { tray: 6, coins: 10, size: 0.9, snap: 0.1 },
];

/** Each coin's value in cents, in COIN_NAMES order (penny, nickel, dime, quarter is also value order). */
export const VALUE = [1, 5, 10, 25] as const;

/**
 * The coins and badges of one learning step. Every coin and badge shows its front with its value tag (money labels,
 * owner 2026-10-06), so step 5, which once showed the badges' backs, now plays like step 4. `stairs`: piggies stand on
 * the steps in value order with value dots; `labels`: 1¢ 5¢ 10¢ 25¢ beside the dots; `lineup`: the round opens with
 * the size-then-value line-up.
 */
export interface StepContent {
  readonly kinds: readonly number[];
  readonly stairs: boolean; readonly labels: boolean; readonly lineup: boolean;
}
const ALL = [PENNY, NICKEL, DIME, QUARTER] as const;
const plain = (kinds: readonly number[]): StepContent => ({ kinds, stairs: false, labels: false, lineup: false });
const STEPS: readonly StepContent[] = [
  plain([PENNY, QUARTER]),
  plain([PENNY, DIME]),
  plain([PENNY, NICKEL, DIME]),
  plain(ALL),
  plain(ALL),
  { kinds: ALL, stairs: true, labels: false, lineup: false },
  { kinds: ALL, stairs: true, labels: true, lineup: false },
  { kinds: ALL, stairs: true, labels: true, lineup: true },
];
export const stepContent = (step: number): StepContent => STEPS[Math.max(1, Math.min(STEPS.length, step)) - 1]!;
/** The introduction round: penny and quarter, four coins, the easiest motor tier. */
export const INTRO: StepContent = STEPS[0]!;
export const INTRO_COINS = 4;
export const LEARN_WINDOW = 8;

/**
 * The coins of a round: every kind at least once, the rest at random, shuffled with no more than two of one kind in a
 * row (where the kinds allow it).
 */
export function roundCoins(kinds: readonly number[], n: number, random: () => number, out: number[]): void {
  out.length = 0;
  for (let i = 0; i < n; i++) out.push(i < kinds.length ? kinds[i]! : kinds[Math.floor(random() * kinds.length)]!);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = out[i]!; out[i] = out[j]!; out[j] = t; }
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 2; i < out.length; i++) {
      if (out[i] !== out[i - 1] || out[i] !== out[i - 2]) continue;
      for (let j = 0; j < out.length; j++) {
        if (out[j] === out[i]) continue;
        const t = out[i]!; out[i] = out[j]!; out[j] = t;
        break;
      }
    }
  }
}

/**
 * The step a round plays. After three rounds at a step without moving up, every second round reviews the step below:
 * a full round with its own stars and sticker that records no evidence.
 */
export function roundStep(data: PiggyData): { step: number; review: boolean } {
  const review = data.step > 1 && data.stepRounds >= 3 && data.stepRounds % 2 === 1;
  return { step: review ? data.step - 1 : data.step, review };
}

const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record one deliberate drop at the current step. Step changes wait for applyLearning between rounds. */
export function recordDrop(data: PiggyData, right: boolean): void {
  data.learn.push(right ? 1 : 0);
  while (data.learn.length > LEARN_WINDOW) data.learn.shift();
}

/**
 * Between rounds: after at least two rounds at a step, 7 or more right of the last 8 deliberate drops moves up a step;
 * 4 or fewer moves back one (never below step 1). A child with too little evidence simply keeps playing full rounds.
 */
export function applyLearning(data: PiggyData): void {
  data.stepRounds++;
  if (data.learn.length < LEARN_WINDOW) return;
  const right = sum(data.learn);
  if (right >= 7 && data.stepRounds >= 2 && data.step < MAX_STEP) { data.step++; data.stepRounds = 0; data.learn.length = 0; }
  else if (right <= 4 && data.step > 1) { data.step--; data.stepRounds = 0; data.learn.length = 0; }
}

/**
 * Between rounds: motor tier from pointer placements only (keys, the hand and the introduction never count). A round
 * gives enough evidence when the child placed at least three quarters of its coins with the pointer; then a hit rate
 * under 70 percent moves down a tier, and 90 percent or better qualifies. Two qualifying rounds in a row move up.
 */
export function applyMotor(data: PiggyData, tier: Tier, hits: number, misses: number, coins: number): void {
  const attempts = hits + misses, rate = attempts ? hits / attempts : 1;
  const enough = attempts >= Math.ceil(coins * 0.75);
  if (enough && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
  else if (enough && rate >= 0.9) {
    data.qualifyingRounds++;
    if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
  } else data.qualifyingRounds = 0;
}

/** Every finished round earns three stars; misses never cost one. */
export const ROUND_STARS = 3;
