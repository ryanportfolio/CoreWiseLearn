/**
 * Dino Picnic tuning and the rules that change difficulty between rounds.
 * Motor tiers and counting stages are separate and never change inside a round.
 */
import type { Tier } from '../../engine/difficulty';
import type { PicnicData } from './data';

export interface TierParams {
  /** Dinos at the picnic at once. */
  dinos: 1 | 2 | 3;
  /** Size multiplier for dinos, plates, cards and the basket. */
  scale: number;
  /** Dino centres as fractions of the width. */
  slots: readonly number[];
  /** Basket centre as fractions of the view; farther away on higher tiers. */
  basketX: number;
  basketY: number;
  /** Plates to fill in one round. */
  orders: number;
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { dinos: 1, scale: 1.15, slots: [0.42], basketX: 0.76, basketY: 0.8, orders: 4 },
  { dinos: 2, scale: 1, slots: [0.27, 0.73], basketX: 0.5, basketY: 0.83, orders: 6 },
  { dinos: 3, scale: 0.9, slots: [0.3, 0.56, 0.82], basketX: 0.1, basketY: 0.83, orders: 6 },
];

/** Largest quantity a counting stage asks for. */
export const STAGE_MAX = [3, 5, 10] as const;
/** Introductory round: one dino, targets demonstrated first. */
export const INTRO_TARGETS = [2, 1, 3] as const;
export const LEARN_WINDOW = 8, COMPARE_WINDOW = 5;

/** A plate quantity for the stage, avoiding the last one and any shown on another card. */
export function pickTarget(stage: number, random: () => number, avoid: (n: number) => boolean): number {
  const max = STAGE_MAX[Math.max(0, Math.min(2, stage))] ?? 3;
  // Later stages lean toward the new, larger quantities while keeping some easy ones.
  const min = stage === 2 ? 3 : stage === 1 ? 2 : 1;
  for (let attempt = 0; attempt < 12; attempt++) {
    const low = random() < 0.25 ? 1 : min;
    const n = low + Math.floor(random() * (max - low + 1));
    if (!avoid(n)) return n;
  }
  for (let n = 1; n <= max; n++) if (!avoid(n)) return n;
  return 1;
}

/** Two different quantities for a "which has more" comparison. */
export function pickComparison(level: number, random: () => number): [number, number] {
  const max = level >= 1 ? 10 : 5;
  const a = 1 + Math.floor(random() * max);
  let b = a;
  for (let attempt = 0; attempt < 20 && Math.abs(a - b) < 2; attempt++) b = 1 + Math.floor(random() * max);
  if (Math.abs(a - b) < 2) b = a <= max - 2 ? a + 2 : a - 2;
  return [a, b];
}

/** Comparisons start once 1 to 5 is solid (stage 2 reached). */
export const comparisonsPerRound = (data: PicnicData): number => (data.stage >= 2 ? 2 : 0);

const push = (list: number[], value: number, max: number): void => { list.push(value); while (list.length > max) list.shift(); };
const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record deliberate counting evidence. Stage changes wait for applyLearning between rounds. */
export function recordPlate(data: PicnicData, exact: boolean): void { push(data.learn, exact ? 1 : 0, LEARN_WINDOW); }
export function recordComparison(data: PicnicData, correct: boolean): void { push(data.compare, correct ? 1 : 0, COMPARE_WINDOW); }

/** Between rounds: promote a solid stage, ease a stage that is not landing yet. */
export function applyLearning(data: PicnicData): void {
  const recent = data.learn.slice(-6);
  if (data.learn.length >= LEARN_WINDOW && sum(data.learn) >= 6 && data.stage < 2) { data.stage++; data.learn.length = 0; }
  else if (recent.length >= 6 && sum(recent) <= 2 && data.stage > 0) { data.stage--; data.learn.length = 0; }
  if (data.compare.length >= COMPARE_WINDOW && sum(data.compare) >= 4 && data.compareLevel < 1) { data.compareLevel = 1; data.compare.length = 0; }
  else if (data.compare.length >= COMPARE_WINDOW && sum(data.compare) <= 1 && data.compareLevel > 0) { data.compareLevel = 0; data.compare.length = 0; }
}

/** Between rounds: motor tier from pointer presses only (keys and demonstrations never count). */
export function applyMotor(data: PicnicData, tier: Tier, hits: number, misses: number): void {
  const attempts = hits + misses, rate = attempts ? hits / attempts : 1;
  if (attempts >= 8 && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
  else if (attempts >= 12 && rate >= 0.9) {
    data.qualifyingRounds++;
    if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
  } else data.qualifyingRounds = 0;
}

/**
 * Every finished round earns three stars: extra fruit never costs one (owner decision, 2026-10-03). It still counts as
 * counting evidence through recordPlate. A pending round saved under the older rule keeps the stars it stored.
 */
export const ROUND_STARS = 3;
