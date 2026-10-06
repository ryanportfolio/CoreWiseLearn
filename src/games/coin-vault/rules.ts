/**
 * Coin Vault tuning: motor tiers, the tasks each learning step asks for, the lock rules, and the rules that change
 * difficulty between rounds. Motor tiers and learning steps are separate and never change inside a round.
 */
import type { Tier } from '../../engine/difficulty';
import { BUILT_STEP, LEARN_WINDOW, TOP_STEP, type VaultData } from './data';

export const PENNY = 0, NICKEL = 1, DIME = 2, QUARTER = 3;
/** Bills share the piece index space with coins: 4 to 7 are the $1, $5, $10 and $20 bills (larger index, larger value). */
export const BILL1 = 4, BILL5 = 5, BILL10 = 6, BILL20 = 7;
export const COIN_NAMES = ['penny', 'nickel', 'dime', 'quarter'] as const;
export const PIECE_NAMES = ['penny', 'nickel', 'dime', 'quarter', 'bill-1', 'bill-5', 'bill-10', 'bill-20'] as const;
export const COIN_VALUE = [1, 5, 10, 25] as const;
/** Bill values in whole dollars, $1 first. */
export const BILL_VALUE = [1, 5, 10, 20] as const;
/** True diameters in millimetres; code keeps these ratios. */
export const COIN_MM = [19.05, 21.21, 17.91, 24.26] as const;
export const DIME_MM = 17.91;
/** The dime never draws below this many CSS px. */
export const MIN_DIME_PX = 96;
/** Dishes on the mat, left to right: the largest value first. */
export const DISH_ORDER = [QUARTER, DIME, NICKEL, PENNY] as const;
/** Amount forms: cents ("45¢", and "$1 and 25¢" above 100) or whole dollars ("$45"). */
export const CENTS = 0, DOLLARS = 1;

export interface TierParams {
  /** Tasks (visitors) in one round at step 1; above step 1 a round adds the warm-up so it still has three counted tasks. */
  tasks: number;
  /** Most places in the row; extra coins of one kind stack on a place. */
  places: number;
  /** Dime diameter in layout units (the other coins follow the true ratios). */
  dime: number;
  /** Bill width in layout units (2:1; never under 192 x 96 CSS px). */
  bill: number;
  /** How far outside the mat a released coin still counts as dropped on it, in layout units. */
  snap: number;
  /** Most coins in one collection. */
  coins: number;
  /** Most bills in one collection. */
  bills: number;
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { tasks: 3, places: 4, dime: 120, bill: 220, snap: 80, coins: 6, bills: 4 },
  { tasks: 4, places: 5, dime: 108, bill: 210, snap: 56, coins: 9, bills: 6 },
  { tasks: 4, places: 6, dime: 96, bill: 200, snap: 40, coins: 12, bills: 8 },
];
/** Tasks in a round: every round has at least three counted tasks (a round above step 1 also opens with a warm-up). */
export const roundTasks = (tier: Tier, step: number): number => Math.max(TIERS[tier].tasks, step > 1 ? 4 : 3);

export interface TaskPlan {
  /** Learning step whose content this task shows (the warm-up shows the step below). */
  step: number;
  /** The round's opening task from the step below, or a demonstration: records no evidence. */
  warmup: boolean;
  /**
   * 'count': move the pieces to the mat and pick a tag. 'lock': fill the open lock (step 4: a different mix from the
   * first lock; step 5: the fewest coins, one per slot). 'symbol': count, then finish the tag with the $ or ¢ block.
   */
  kind: 'count' | 'lock' | 'symbol';
  /** CENTS or DOLLARS: what `total`, the cups and the tags count in. */
  unit: number;
  /** Counting: coins per kind (penny, nickel, dime, quarter). */
  coins: number[];
  /** Counting: bills per kind ($1, $5, $10, $20). In a CENTS task only a $1 bill appears, worth 100¢. */
  bills: number[];
  /** Counting: lined up by kind, largest first; otherwise spilled as a pile. */
  sorted: boolean;
  /** The amount: the collection's total, or the lock's amount (cents, or dollars for a DOLLARS task). */
  total: number;
  /** Counting: the tag amounts in screen order; one equals `total` in the task's own form. */
  tags: number[];
  /** Each tag's form, CENTS or DOLLARS. */
  tagForms: number[];
  /** Lock (step 4): the coins the visitor put in the first lock (fewest coins), per kind. */
  first: number[];
  /** Lock: the row offers quarters (step 4 only when the amount is 25¢ or more; step 5 always). */
  quarters: boolean;
  /** Step 5: the lock's slots, as many as the fewest coins for the amount. */
  slots: number;
  /**
   * What the visitor is saving for, in the task's unit: the jar fills toward it with the counted amount. A lock task's
   * goal is the lock's amount (always reached); a counted collection's goal is a round amount in the step's range that
   * is never the total or a tag, below the total about half the time (reached) and above it otherwise (not yet).
   */
  goal: number;
}

const plan = (step: number, kind: TaskPlan['kind'], total: number): TaskPlan => ({
  step, warmup: false, kind, unit: CENTS, coins: [0, 0, 0, 0], bills: [0, 0, 0, 0], sorted: step <= 1, total, tags: [], tagForms: [CENTS, CENTS, CENTS],
  first: [0, 0, 0, 0], quarters: false, slots: 0, goal: total,
});

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
/** Bills per kind for the fewest-bills way to make `dollars`, into `out`. Returns the bill count. */
export function fewestBills(dollars: number, out: number[]): number {
  let rest = dollars, n = 0;
  for (let k = 3; k >= 0; k--) { out[k] = Math.floor(rest / BILL_VALUE[k]!); rest -= out[k]! * BILL_VALUE[k]!; n += out[k]!; }
  return n;
}
const sumCoins = (c: readonly number[]): number => c[0]! + c[1]! + c[2]! + c[3]!;
export const valueOf = (c: readonly number[]): number => c[0]! + 5 * c[1]! + 10 * c[2]! + 25 * c[3]!;

/**
 * Coins worth `cents` in at most `cap` coins (no quarters unless `quarters`): the fewest-coins way, then some coins
 * broken into smaller ones (a dime into two nickels, a nickel into five pennies, and with `breakQuarters` a quarter into
 * two dimes and a nickel) toward a random count up to the cap, so collections mix kinds. Returns false when even the
 * fewest coins exceed the cap.
 */
function mixCoins(cents: number, cap: number, quarters: boolean, random: () => number, out: number[], breakQuarters = false): boolean {
  if (fewest(cents, quarters, out) > cap) return false;
  const target = sumCoins(out) + Math.floor(random() * (cap - sumCoins(out) + 1));
  for (let guard = 0; guard < 40 && sumCoins(out) < target; guard++) {
    const room = target - sumCoins(out), r = random();
    // The last quarter, dime and nickel stay whole, so a collection keeps its larger kinds.
    const quarter = breakQuarters && out[QUARTER]! > 1 && room >= 2;
    const dime = out[DIME]! > 1 && room >= 1, nickel = out[NICKEL]! > 1 && room >= 4;
    if (quarter && r < 0.35) { out[QUARTER]!--; out[DIME]! += 2; out[NICKEL]!++; continue; }
    if (dime && (r < 0.7 || !nickel)) { out[DIME]!--; out[NICKEL]! += 2; continue; }
    if (nickel) { out[NICKEL]!--; out[PENNY]! += 5; continue; }
    if (quarter) { out[QUARTER]!--; out[DIME]! += 2; out[NICKEL]!++; continue; }
    break;
  }
  return true;
}
/** Bills worth `dollars` in at most `cap` bills, broken from the fewest toward a random count ($20 into two $10s, $10 into two $5s, $5 into five $1s). */
function mixBills(dollars: number, cap: number, random: () => number, out: number[]): boolean {
  if (fewestBills(dollars, out) > cap) return false;
  // Every bill collection has at least two bills: a lone $20 or $10 is broken into two bills.
  if (sumCoins(out) === 1 && cap >= 2) {
    if (out[3]) { out[3] = 0; out[2] = 2; } else if (out[2]) { out[2] = 0; out[1] = 2; } else if (out[1] && cap >= 5) { out[1] = 0; out[0] = 5; }
  }
  const target = sumCoins(out) + Math.floor(random() * (cap - sumCoins(out) + 1));
  for (let guard = 0; guard < 40 && sumCoins(out) < target; guard++) {
    const room = target - sumCoins(out), r = random();
    const twenty = out[3]! > 1 && room >= 1, ten = out[2]! > 1 && room >= 1, five = out[1]! > 1 && room >= 4;
    if (twenty && (r < 0.4 || (!ten && !five))) { out[3]!--; out[2]! += 2; continue; }
    if (ten && (r < 0.75 || !five)) { out[2]!--; out[1]! += 2; continue; }
    if (five) { out[1]!--; out[0]! += 5; continue; }
    if (twenty) { out[3]!--; out[2]! += 2; continue; }
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

/** Mixed coins with quarters worth `lo` to `hi` cents in at most `cap` coins (steps 6 and 8). */
function mixedTask(step: number, lo: number, hi: number, cap: number, random: () => number, last: number): TaskPlan {
  const out = [0, 0, 0, 0];
  let total = lo;
  for (let i = 0; i < 60; i++) {
    const t = lo + Math.floor(random() * (hi - lo + 1));
    if (fewest(t, true, out) > cap || (t === last && i < 59)) continue;
    total = t; break;
  }
  while (fewest(total, true, out) > cap && total > lo) total--;
  const p = plan(step, 'count', total);
  mixCoins(total, cap, true, random, p.coins, true);
  return p;
}

/** Bills worth $`lo` to $`hi` in at most `cap` bills, lined up greatest to least (steps 7 and 8). */
function billTask(step: number, lo: number, hi: number, cap: number, random: () => number, last: number): TaskPlan {
  const out = [0, 0, 0, 0];
  let total = lo;
  for (let i = 0; i < 60; i++) {
    const t = lo + Math.floor((hi - lo + 1) * Math.pow(random(), 1.2));
    if (t > hi || fewestBills(t, out) > cap || (t === last && i < 59)) continue;
    total = t; break;
  }
  const p = plan(step, 'count', total);
  p.unit = DOLLARS; p.sorted = true;
  mixBills(total, cap, random, p.bills);
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

/** Step 5: one lock, 26 to 99¢, with exactly as many slots as the fewest coins for the amount. */
function fewestTask(random: () => number, last: number): TaskPlan {
  let total = 26 + Math.floor(random() * 74);
  if (total === last) total = 26 + ((total - 25) % 74);
  const p = plan(5, 'lock', total);
  p.quarters = true;
  p.slots = fewest(total, true, [0, 0, 0, 0]);
  return p;
}

/** Shuffle the tags and their forms together. */
function shuffleTags(p: TaskPlan, random: () => number): void {
  for (let i = p.tags.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = p.tags[i]!; p.tags[i] = p.tags[j]!; p.tags[j] = t;
    const f = p.tagForms[i]!; p.tagForms[i] = p.tagForms[j]!; p.tagForms[j] = f;
  }
}

/**
 * Neighbours of the total that differ by one piece's worth (the collection's own pieces first), within [lo, hi].
 * Coin values for CENTS tasks, bill values for DOLLARS tasks.
 */
function neighbours(p: TaskPlan, lo: number, hi: number, own: number[], other: number[]): void {
  const values: readonly number[] = p.unit === DOLLARS ? BILL_VALUE : COIN_VALUE;
  const have = p.unit === DOLLARS ? p.bills : p.coins;
  for (let k = 0; k < 4; k++) {
    if (p.unit === CENTS && k === QUARTER && p.step < 3) continue;
    for (const sign of [-1, 1]) {
      const v = p.total + sign * values[k]!;
      if (v < lo || v > hi || v === p.total || own.includes(v) || other.includes(v)) continue;
      (have[k]! > 0 ? own : other).push(v);
    }
  }
}
const pickFrom = (list: number[], random: () => number): number => list.splice(Math.floor(random() * list.length), 1)[0]!;

/**
 * Three tag amounts, one of them `total`. The others differ from it by one piece's worth (the collection's own pieces
 * first), never fall below the collection's smallest piece, never repeat, and stay in the step's range: at or under
 * 100¢ at steps 1 to 3, above 100¢ at step 6 (so every tag reads "$1 and N¢"), at or under $100 at step 7.
 */
function makeTags(p: TaskPlan, random: () => number): void {
  let smallest = p.unit === DOLLARS ? 20 : 25;
  const have = p.unit === DOLLARS ? p.bills : p.coins, values: readonly number[] = p.unit === DOLLARS ? BILL_VALUE : COIN_VALUE;
  for (let k = 0; k < 4; k++) if (have[k]! > 0) { smallest = values[k]!; break; }
  const lo = p.step === 6 ? 101 : smallest, hi = p.step === 6 ? 199 : 100;
  const own: number[] = [], other: number[] = [];
  neighbours(p, lo, hi, own, other);
  const tags = [p.total];
  while (tags.length < 3 && (own.length || other.length)) {
    const v = own.length && (random() < 0.75 || !other.length) ? pickFrom(own, random) : pickFrom(other, random);
    if (!tags.includes(v)) tags.push(v);
  }
  // Very small totals with few neighbours: any free amount near the total.
  for (let v = p.total + 2; tags.length < 3; v++) if (!tags.includes(v)) tags.push(v);
  p.tags = tags; p.tagForms = [p.unit, p.unit, p.unit];
  shuffleTags(p, random);
}

/**
 * Step 8a: the matching tag, its look-alike (the same digits with the other symbol: 45¢ and $45; "$1 and 5¢" and
 * $15), and one neighbour in the matching form.
 */
function lookAlikeTags(p: TaskPlan, random: () => number): void {
  const cents = p.unit === CENTS ? p.total - 100 * p.bills[0]! : 0;
  const look = p.unit === DOLLARS ? p.total : p.bills[0] ? Number(`1${cents}`) : p.total;
  const lookForm = p.unit === DOLLARS ? CENTS : DOLLARS;
  const own: number[] = [], other: number[] = [];
  if (p.bills[0] && p.unit === CENTS) {
    // "$1 and N¢": a neighbour that keeps the "$1 and" form.
    for (const c of COIN_VALUE) for (const sign of [-1, 1]) { const v = p.total + sign * c; if (v > 100 && v < 200 && !own.includes(v)) (p.coins[COIN_VALUE.indexOf(c)]! > 0 ? own : other).push(v); }
  } else neighbours(p, 1, 99, own, other);
  const near = own.length ? pickFrom(own, random) : other.length ? pickFrom(other, random) : p.total + 2;
  p.tags = [p.total, look, near]; p.tagForms = [p.unit, lookForm, p.unit];
  shuffleTags(p, random);
}

/** Step 8's collections: coins up to 99¢, bills up to $99, or (`withBill`) a $1 bill with 1 to 50¢ in coins. */
function step8Collection(cap: number, billCap: number, which: number, random: () => number, last: number, kind: TaskPlan['kind']): TaskPlan {
  let p: TaskPlan;
  if (which === 1) p = billTask(8, 6, 99, billCap, random, last);
  else if (which === 2) {
    p = mixedTask(8, 1, 50, Math.max(1, cap - 1), random, last - 100);
    p.total += 100; p.bills[0] = 1; p.sorted = true;
  } else p = mixedTask(8, 11, 99, cap, random, last);
  p.kind = kind;
  if (kind === 'count') p.sorted = p.sorted || p.unit === DOLLARS;
  return p;
}

/**
 * A task for a content step. `index` is the task's place in the round (step 3's first counted task is quarters alone;
 * step 8 alternates: odd places finish a tag with a symbol block, even places pick between look-alike tags), `last`
 * the previous task's total, avoided where there is a choice.
 */
export function planTask(step: number, warmup: boolean, index: number, cap: number, billCap: number, random: () => number, last: number): TaskPlan {
  let p: TaskPlan;
  if (step >= 8) {
    if (index % 2 === 1) { p = step8Collection(cap, billCap, random() < 0.5 ? 0 : 1, random, last, 'symbol'); p.tags = [p.total]; p.tagForms = [p.unit]; }
    else { p = step8Collection(cap, billCap, Math.floor(random() * 3), random, last, 'count'); lookAlikeTags(p, random); }
    p.warmup = warmup;
    p.goal = makeGoal(p, random);
    return p;
  }
  if (step === 7) p = billTask(7, 6, 100, billCap, random, last);
  else if (step === 6) p = mixedTask(6, 105, 150, cap, random, last);
  else if (step === 5) p = fewestTask(random, last);
  else if (step === 4) p = lockTask(random, last);
  else if (step === 3) p = quarterTask(cap, !warmup && index <= 1, random, last);
  else p = countingTask(step, cap, random, last);
  p.warmup = warmup;
  if (p.kind === 'count') makeTags(p, random);
  p.goal = makeGoal(p, random);
  return p;
}

/**
 * The visitor's saving goal for a task (TaskPlan.goal). Goals are multiples of 5 (¢ or $), never the total and never
 * one of the tags, so the goal never shows the answer. Reached (goal under the total, at least 0.6 of it) or not yet
 * (goal over the total, at most 1.6 times it), each about half the time, inside the step's range: 10 to 100¢ for
 * coins up to a dollar, 101 to 199¢ ("$1 and N¢") above it, $5 to $100 for bills.
 */
export function makeGoal(p: TaskPlan, random: () => number): number {
  if (p.kind === 'lock') return p.total;
  const t = p.total, [lo, hi] = p.unit === DOLLARS ? [5, 100] : t > 100 ? [105, 195] : [10, 100];
  const free = (g: number): boolean => g >= lo && g <= hi && g !== t && !p.tags.includes(g);
  const below: number[] = [], above: number[] = [];
  for (let g = Math.ceil(t * 0.6 / 5) * 5; g < t; g += 5) if (free(g)) below.push(g);
  for (let g = Math.floor(t / 5) * 5 + 5; g <= t * 1.6 + 5; g += 5) if (free(g)) above.push(g);
  const reach = random() < 0.5;
  const list = (reach && below.length) || !above.length ? below : above;
  if (list.length) return list[Math.floor(random() * list.length)]!;
  // Nothing round fits (a tiny total): the nearest free amount below the total, else above it.
  for (let g = t - 1; g >= Math.min(lo, t - 1) && g > 0; g--) if (g !== t && !p.tags.includes(g)) return g;
  for (let g = t + 1; ; g++) if (!p.tags.includes(g)) return g;
}

/** The introduction's task: a dime and two pennies, 12¢, counted with the helper hand; the squirrel saves for 10¢. */
export function introTask(): TaskPlan {
  const p = plan(1, 'count', 12); p.coins[DIME] = 1; p.coins[PENNY] = 2; p.warmup = true;
  p.tags = [11, 12, 17]; p.goal = 10;
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

const scratch = [0, 0, 0, 0];
/**
 * Step 5's lock rule: a coin is taken only if the rest can still be made with the slots left, that is when the fewest
 * coins for the rest minus this coin is exactly one less than the slots left. The greedy coin always qualifies, so the
 * lock can always be finished.
 */
export function fewestTakes(kind: number, rest: number, slotsLeft: number): boolean {
  const value = COIN_VALUE[kind]!;
  if (value > rest || slotsLeft <= 0) return false;
  return fewest(rest - value, true, scratch) === slotsLeft - 1;
}

const push = (list: number[], value: number, max: number): void => { list.push(value); while (list.length > max) list.shift(); };
const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record one counted task at the current step. Step changes wait for applyLearning between rounds. */
export function recordTask(data: VaultData, right: boolean): void { push(data.learn, right ? 1 : 0, LEARN_WINDOW); }

/** Highest step the progression reaches: every step is built. */
export const STEP_CAP = Math.min(TOP_STEP, BUILT_STEP);

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
