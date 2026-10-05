/**
 * Coin Vault tuning: motor tiers, the tasks each learning step asks for, the lock rule, and the rules that change
 * difficulty between rounds. Motor tiers and learning steps are separate and never change inside a round.
 */
import type { Tier } from '../../engine/difficulty';
import { BUILT_STEP, LEARN_WINDOW, TOP_STEP, type VaultData } from './data';

export const PENNY = 0, NICKEL = 1, DIME = 2, QUARTER = 3;
export const COIN_NAMES = ['penny', 'nickel', 'dime', 'quarter'] as const;
export const COIN_VALUE = [1, 5, 10, 25] as const;
/** True diameters in millimetres; code keeps these ratios. */
export const COIN_MM = [19.05, 21.21, 17.91, 24.26] as const;
export const DIME_MM = 17.91;
/** The dime never draws below this many CSS px. */
export const MIN_DIME_PX = 96;
/** Dishes on the mat, left to right: the largest value first. */
export const DISH_ORDER = [QUARTER, DIME, NICKEL, PENNY] as const;

export interface TierParams {
  /** Tasks (visitors) in one round. */
  tasks: number;
  /** Most places in the row; extra coins of one kind stack on a place. */
  places: number;
  /** Dime diameter in layout units (the other coins follow the true ratios). */
  dime: number;
  /** How far outside the mat a released coin still counts as dropped on it, in layout units. */
  snap: number;
  /** Most coins in one collection. */
  coins: number;
  /** A single press (click) on a coin sends it straight to where it goes. */
  oneTap: boolean;
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { tasks: 3, places: 4, dime: 120, snap: 80, coins: 6, oneTap: true },
  { tasks: 4, places: 5, dime: 108, snap: 56, coins: 9, oneTap: false },
  { tasks: 4, places: 6, dime: 96, snap: 40, coins: 12, oneTap: false },
];

export interface TaskPlan {
  /** Learning step whose content this task shows (the warm-up shows the step below). */
  step: number;
  /** The round's opening task from the step below, or a demonstration: records no evidence. */
  warmup: boolean;
  /** 'count': move the coins to the dishes and pick a tag. 'lock': fill the second lock with a different mix. */
  kind: 'count' | 'lock';
  /** Counting: coins per kind (penny, nickel, dime, quarter). */
  coins: number[];
  /** Counting: lined up by kind, largest first (step 1); otherwise spilled as a pile. */
  sorted: boolean;
  /** The amount in cents: the collection's total, or each lock's amount. */
  total: number;
  /** Counting: the three tag amounts in screen order; one equals `total`. */
  tags: number[];
  /** Lock: the coins the visitor put in the first lock (fewest coins), per kind. */
  first: number[];
  /** Lock: the row offers quarters (only when the amount is 25¢ or more). */
  quarters: boolean;
}

const plan = (step: number, kind: 'count' | 'lock', total: number): TaskPlan =>
  ({ step, warmup: false, kind, coins: [0, 0, 0, 0], sorted: step <= 1, total, tags: [], first: [0, 0, 0, 0], quarters: false });

/** Content step for task `index` of a round at learning step `step`: the first task above step 1 warms up with the step below. */
export function taskStep(step: number, index: number): { step: number; warmup: boolean } {
  const s = Math.max(1, Math.min(TOP_STEP, step));
  const warmup = index === 0 && s > 1;
  return { step: Math.min(BUILT_STEP, warmup ? s - 1 : s), warmup };
}

/** Coins per kind for the fewest-coins way to make `cents` (quarters only when allowed), into `out`. Returns the coin count. */
export function fewest(cents: number, quarters: boolean, out: number[]): number {
  let rest = cents, n = 0;
  for (let k = QUARTER; k >= PENNY; k--) {
    if (k === QUARTER && !quarters) { out[k] = 0; continue; }
    out[k] = Math.floor(rest / COIN_VALUE[k]!); rest -= out[k]! * COIN_VALUE[k]!; n += out[k]!;
  }
  return n;
}
const sumCoins = (c: readonly number[]): number => c[0]! + c[1]! + c[2]! + c[3]!;
export const valueOf = (c: readonly number[]): number => c[0]! + 5 * c[1]! + 10 * c[2]! + 25 * c[3]!;

/**
 * Coins worth `cents` in at most `cap` coins (no quarters unless `quarters`): the fewest-coins way, then some coins
 * broken into smaller ones (a dime into two nickels, a nickel into five pennies) toward a random count up to the cap,
 * so collections mix kinds. Returns false when even the fewest coins exceed the cap.
 */
function mixCoins(cents: number, cap: number, quarters: boolean, random: () => number, out: number[]): boolean {
  if (fewest(cents, quarters, out) > cap) return false;
  const target = sumCoins(out) + Math.floor(random() * (cap - sumCoins(out) + 1));
  for (let guard = 0; guard < 40 && sumCoins(out) < target; guard++) {
    const room = target - sumCoins(out), r = random();
    // The last dime and the last nickel stay whole, so a collection keeps its larger kinds.
    const dime = out[DIME]! > 1 && room >= 1, nickel = out[NICKEL]! > 1 && room >= 4;
    if (dime && (r < 0.55 || !nickel)) { out[DIME]!--; out[NICKEL]! += 2; continue; }
    if (nickel) { out[NICKEL]!--; out[PENNY]! += 5; continue; }
    break;
  }
  return true;
}

/** Steps 1 and 2: pennies, nickels and dimes, 11 to 99¢ (most under 60), at most `cap` coins. */
function countingTask(step: number, cap: number, random: () => number, last: number): TaskPlan {
  const out = [0, 0, 0, 0];
  let total = 0;
  for (let i = 0; i < 40; i++) {
    total = 11 + Math.floor(88 * Math.pow(random(), 1.6));
    if (total !== last && fewest(total, false, out) <= cap) break;
  }
  while (fewest(total, false, out) > cap) total--;
  const p = plan(step, 'count', total);
  mixCoins(total, cap, false, random, p.coins);
  return p;
}

/** Step 3: quarters alone (25, 50, 75 or 100¢), or 1 to 3 quarters with dimes, nickels and pennies up to 100¢. */
function quarterTask(cap: number, alone: boolean, random: () => number, last: number): TaskPlan {
  if (alone) {
    let q = 1 + Math.floor(random() * Math.min(4, cap));
    if (q * 25 === last) q = 1 + (q % Math.min(4, cap));
    const p = plan(3, 'count', q * 25); p.coins[QUARTER] = q;
    return p;
  }
  const rest = [0, 0, 0, 0];
  for (let i = 0; i < 40; i++) {
    const q = 1 + Math.floor(random() * Math.min(3, cap - 1)), room = 100 - 25 * q;
    const r = 1 + Math.floor((room - 1) * Math.pow(random(), 1.3));
    if (25 * q + r === last && i < 39) continue;
    if (!mixCoins(r, cap - q, false, random, rest)) continue;
    const p = plan(3, 'count', 25 * q + r);
    p.coins[QUARTER] = q; p.coins[PENNY] = rest[PENNY]!; p.coins[NICKEL] = rest[NICKEL]!; p.coins[DIME] = rest[DIME]!;
    return p;
  }
  const p = plan(3, 'count', 26); p.coins[QUARTER] = 1; p.coins[PENNY] = 1;
  return p;
}

/** Step 4: two locks want the same amount, 10 to 50¢; the visitor fills the first with the fewest coins. */
function lockTask(random: () => number, last: number): TaskPlan {
  let total = 10 + Math.floor(random() * 41);
  if (total === last) total = 10 + ((total - 9) % 41);
  const p = plan(4, 'lock', total);
  p.quarters = total >= 25;
  fewest(total, p.quarters, p.first);
  return p;
}

/**
 * Three tag amounts, one of them `total`. The others differ from it by one coin's worth (the collection's own coins
 * first), never fall below the collection's smallest coin, never repeat, and stay at or under 100¢.
 */
function makeTags(p: TaskPlan, random: () => number): void {
  let smallest = 25;
  for (let k = PENNY; k <= QUARTER; k++) if (p.coins[k]! > 0) { smallest = COIN_VALUE[k]!; break; }
  const own: number[] = [], other: number[] = [];
  for (let k = PENNY; k <= QUARTER; k++) {
    if (k === QUARTER && p.step < 3) continue;
    for (const sign of [-1, 1]) {
      const v = p.total + sign * COIN_VALUE[k]!;
      if (v < smallest || v > 100 || v === p.total || own.includes(v) || other.includes(v)) continue;
      (p.coins[k]! > 0 ? own : other).push(v);
    }
  }
  const pickFrom = (list: number[]): number => list.splice(Math.floor(random() * list.length), 1)[0]!;
  const tags = [p.total];
  while (tags.length < 3 && (own.length || other.length)) {
    const v = own.length && (random() < 0.75 || !other.length) ? pickFrom(own) : pickFrom(other);
    if (!tags.includes(v)) tags.push(v);
  }
  // Very small totals with few neighbours: any free amount near the total.
  for (let v = p.total + 2; tags.length < 3; v++) if (!tags.includes(v)) tags.push(v);
  for (let i = tags.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = tags[i]!; tags[i] = tags[j]!; tags[j] = t; }
  p.tags = tags;
}

/**
 * A task for a content step. `index` is the task's place in the round (step 3's first counted task is quarters alone),
 * `last` the previous task's total, avoided where there is a choice.
 */
export function planTask(step: number, warmup: boolean, index: number, cap: number, random: () => number, last: number): TaskPlan {
  let p: TaskPlan;
  if (step >= 4) p = lockTask(random, last);
  else if (step === 3) p = quarterTask(cap, !warmup && index <= 1, random, last);
  else p = countingTask(step, cap, random, last);
  p.warmup = warmup;
  if (p.kind === 'count') makeTags(p, random);
  return p;
}

/** The introduction's task: a dime and two pennies, 12¢, counted with the helper hand. */
export function introTask(): TaskPlan {
  const p = plan(1, 'count', 12); p.coins[DIME] = 1; p.coins[PENNY] = 2; p.warmup = true;
  p.tags = [11, 12, 17];
  return p;
}

/**
 * Step 4's lock rule: whether the open lock takes a coin worth `value` now. `cur` holds the coins already in it, `rest`
 * the cents still unlit. A coin worth more than the rest is refused. A coin that would leave the lock only one way to
 * finish (under 5¢ left, pennies only) is refused when that way repeats the first lock's coins exactly. Pennies can
 * always finish a lock that was not refused, so the lock is never stuck.
 */
export function lockTakes(kind: number, cur: ArrayLike<number>, rest: number, first: ArrayLike<number>): boolean {
  const value = COIN_VALUE[kind]!;
  if (value > rest) return false;
  const left = rest - value;
  if (left >= 5) return true;
  const pennies = cur[PENNY]! + (kind === PENNY ? 1 : 0) + left;
  return !(pennies === first[PENNY] &&
    cur[NICKEL]! + (kind === NICKEL ? 1 : 0) === first[NICKEL] &&
    cur[DIME]! + (kind === DIME ? 1 : 0) === first[DIME] &&
    cur[QUARTER]! + (kind === QUARTER ? 1 : 0) === first[QUARTER]);
}

const push = (list: number[], value: number, max: number): void => { list.push(value); while (list.length > max) list.shift(); };
const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record one counted task at the current step. Step changes wait for applyLearning between rounds. */
export function recordTask(data: VaultData, right: boolean): void { push(data.learn, right ? 1 : 0, LEARN_WINDOW); }

/** The progression may go one step past the last built step (that step repeats the built content for now). */
export const STEP_CAP = Math.min(TOP_STEP, BUILT_STEP + 1);

/**
 * Between rounds: `counted` is the round's counted tasks (1 = right). Moves up on a clean round of three or more, or
 * six right in the last eight; moves down on two or fewer in the last six; a child who plays only with keys at steps 1
 * and 2 (no counted task) moves up after three rounds, up to step 3.
 */
export function applyLearning(data: VaultData, counted: readonly number[]): void {
  const before = data.step;
  if (data.step <= 2 && counted.length === 0) data.quietRounds++; else data.quietRounds = 0;
  const recent = data.learn.slice(-6);
  if (counted.length >= 3 && sum(counted) === counted.length) data.step++;
  else if (data.learn.length >= LEARN_WINDOW && sum(data.learn) >= 6) data.step++;
  else if (recent.length >= 6 && sum(recent) <= 2 && data.step > 1) data.step--;
  if (data.step === before && data.quietRounds >= 3 && data.step < 3) data.step++;
  data.step = Math.max(1, Math.min(STEP_CAP, data.step));
  if (data.step !== before) { data.learn.length = 0; data.quietRounds = 0; }
}

/** Between rounds: motor tier from pointer carries only (keys, the tier-0 send, demonstrations and hints never count). */
export function applyMotor(data: VaultData, tier: Tier, hits: number, misses: number): void {
  const attempts = hits + misses, rate = attempts ? hits / attempts : 1;
  if (attempts >= 8 && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
  else if (attempts >= 12 && rate >= 0.9) {
    data.qualifyingRounds++;
    if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
  } else data.qualifyingRounds = 0;
}

/** Every finished round earns three stars; a hopped-back coin or a wrong tag never costs one. */
export const ROUND_STARS = 3;
