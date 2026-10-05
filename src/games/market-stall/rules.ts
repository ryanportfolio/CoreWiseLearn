/**
 * Market Stall tuning: motor tiers, the customers each learning step brings, the till's contents and the rules that
 * change difficulty between rounds. Motor tiers and learning steps are separate and never change inside a round.
 */
import type { Tier } from '../../engine/difficulty';
import { LEARN_WINDOW, TOP_STEP, type StallData } from './data';

/** Coin kinds, smallest value first. */
export const PENNY = 0, NICKEL = 1, DIME = 2, QUARTER = 3;
export const COIN_NAMES = ['penny', 'nickel', 'dime', 'quarter'] as const;
export const COIN_VALUE = [1, 5, 10, 25] as const;
/** True diameters in millimetres; code keeps these ratios. */
export const COIN_MM = [19.05, 21.21, 17.91, 24.26] as const;
export const DIME_MM = 17.91;
/** The dime never draws below this many CSS px; a bill's short side never below MIN_BILL_PX. */
export const MIN_DIME_PX = 96, MIN_BILL_PX = 96;
/** Bill kinds: $1, $5, $10, $20. */
export const B1 = 0, B5 = 1, B10 = 2, B20 = 3;
export const BILL_VALUE = [1, 5, 10, 20] as const;
export const BILL_NAMES = ['one-dollar', 'five-dollars', 'ten-dollars', 'twenty-dollars'] as const;

/** The highest learning step this build has content for. The step above it repeats this step's content for now. */
export const BUILT_STEP = 4;

export interface TierParams {
  /** Customers in one round. */
  customers: number;
  /** Dime diameter and bill width in layout units (the other coins follow the true ratios; bills are 2:1). */
  dime: number; bill: number;
  /** How far outside the paw zone a released piece still counts as dropped on it, in layout units. */
  snap: number;
  /** Zones in layout units (each floored at 96 CSS px): the customer's open paw, the item with its tag, the purse. */
  paw: readonly [number, number]; item: readonly [number, number]; purse: readonly [number, number];
  /** Purse drawn width in layout units. */
  purseW: number;
  /** Till kinds: 0 = only the kinds the change needs, 1 = one more, 2 = every kind of that till. */
  extra: number;
  /** A single press (click) on a piece sends it straight to the paw. */
  oneTap: boolean;
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { customers: 3, dime: 120, bill: 240, snap: 80, paw: [170, 130], item: [210, 190], purse: [170, 170], purseW: 160, extra: 0, oneTap: true },
  { customers: 4, dime: 108, bill: 220, snap: 56, paw: [150, 120], item: [190, 170], purse: [150, 150], purseW: 140, extra: 1, oneTap: false },
  { customers: 4, dime: 96, bill: 200, snap: 40, paw: [130, 110], item: [170, 150], purse: [130, 130], purseW: 120, extra: 2, oneTap: false },
];

export interface CustomerPlan {
  /** Learning step this customer counts toward (a warm-up customer shows the step below and counts nothing). */
  step: number;
  /** Content step 1 to BUILT_STEP: what the customer brings. */
  content: number;
  /** Whole-dollar amounts with bills ($), else cents with coins (¢). */
  dollars: boolean;
  /** Price in cents or dollars. */
  price: number;
  /** The payment's pieces (coin or bill kinds), largest first. */
  pay: number[];
  /** A short payment: the pieces the customer adds from its purse to make it exact. */
  topUp: number[];
  /** The child decides "enough" or "more, please". */
  decide: boolean;
  /** Change owed after the payment (0 = none). */
  change: number;
  /** Kinds the till offers for the change, smallest first (empty when no change is owed). */
  till: number[];
}

const sumOf = (kinds: readonly number[], dollars: boolean): number => {
  let s = 0; for (const k of kinds) s += dollars ? BILL_VALUE[k]! : COIN_VALUE[k]!; return s;
};
export const valueOf = (kind: number, dollars: boolean): number => (dollars ? BILL_VALUE[kind]! : COIN_VALUE[kind]!);
export const paid = (plan: CustomerPlan): number => sumOf(plan.pay, plan.dollars) + sumOf(plan.topUp, plan.dollars);

/** Coins for an amount, largest first, from the given kinds (dimes for the tens, a nickel for 5 or more, then pennies). */
function coinsFor(amount: number, kinds: readonly number[]): number[] {
  const out: number[] = [];
  let left = amount;
  for (let k = kinds.length - 1; k >= 0; k--) { const kind = kinds[k]!; while (left >= COIN_VALUE[kind]!) { out.push(kind); left -= COIN_VALUE[kind]!; } }
  return out;
}
function billsFor(amount: number, kinds: readonly number[]): number[] {
  const out: number[] = [];
  let left = amount;
  for (let k = kinds.length - 1; k >= 0; k--) { const kind = kinds[k]!; while (left >= BILL_VALUE[kind]!) { out.push(kind); left -= BILL_VALUE[kind]!; } }
  return out;
}

/** The till's kinds: the needed ones, plus (tier 1) the next larger kind the change does not need, or (tier 2) all. */
export function tillKinds(needed: readonly number[], all: readonly number[], tier: Tier): number[] {
  const extra = TIERS[tier].extra;
  if (extra === 2) return all.slice();
  const out = needed.slice();
  if (extra === 1) {
    const top = Math.max(...needed);
    const more = all.find(k => k > top && !out.includes(k)) ?? [...all].reverse().find(k => !out.includes(k));
    if (more !== undefined) out.push(more);
  }
  return out.sort((a, b) => a - b);
}

/** Content step for customer `index` of a round at learning step `step`: the first customer above step 1 warms up with the step below. */
export function customerStep(step: number, index: number): number {
  const s = Math.max(1, Math.min(TOP_STEP, step));
  return index === 0 && s > 1 ? s - 1 : s;
}
export const contentOf = (step: number): number => Math.max(1, Math.min(BUILT_STEP, step));

const plan = (step: number, content: number, dollars: boolean, price: number, pay: number[], topUp: number[], decide: boolean, change: number, till: number[]): CustomerPlan =>
  ({ step, content, dollars, price, pay, topUp, decide, change, till });

/**
 * A customer for learning step `step` (content from contentOf(step)). `last` is the previous customer's price, avoided
 * where there is a choice; `exact` forces (true) or forbids (false) an exact payment at the decision steps.
 */
export function planCustomer(step: number, tier: Tier, random: () => number, last: number, exact?: boolean): CustomerPlan {
  const content = contentOf(step);
  const pick = (lo: number, hi: number): number => { let n = lo + Math.floor(random() * (hi - lo + 1)); if (n === last && hi > lo) n = n < hi ? n + 1 : lo; return n; };
  if (content === 1) {
    // Prices 10 to 50 cents; the payment in pennies, nickels and dimes is exact half the time, else short by 1 to 10.
    const price = pick(10, 50), isExact = exact ?? random() < 0.5;
    const short = isExact ? 0 : 1 + Math.floor(random() * Math.min(10, price - 1));
    const kinds = [PENNY, NICKEL, DIME];
    return plan(step, 1, false, price, coinsFor(price - short, kinds), coinsFor(short, kinds), true, 0, []);
  }
  if (content === 2) {
    // Prices 11 to 49 cents that are not a multiple of 10, paid with the next ten in dimes; change in pennies.
    let price = pick(11, 49);
    if (price % 10 === 0) price += price === 40 ? -1 : 1;
    const payTens = Math.ceil(price / 10);
    return plan(step, 2, false, price, Array(payTens).fill(DIME), [], false, payTens * 10 - price, tillKinds([PENNY], [PENNY, NICKEL, DIME, QUARTER], tier));
  }
  if (content === 3) {
    // Whole-dollar prices $1 to $10 in $1 and $5 bills, exact half the time, else short by $1 to $3.
    const price = pick(1, 10), isExact = price === 1 || (exact ?? random() < 0.5);
    const short = isExact ? 0 : 1 + Math.floor(random() * Math.min(3, price - 1));
    return plan(step, 3, true, price, billsFor(price - short, [B1, B5]), billsFor(short, [B1]), true, 0, []);
  }
  // Step 4: prices $1 to $9 paid with a $5 bill (prices $1 to $4, half the time) or a $10 bill; change in $1 bills.
  const price = pick(1, 9), bill = price < 5 && random() < 0.5 ? B5 : B10;
  return plan(step, 4, true, price, [bill], [], false, BILL_VALUE[bill] - price, tillKinds([B1], [B1, B5, B10], tier));
}

/** The introduction's first customer: the goal, price 27¢ paid with three dimes, three pennies of change. */
export function goalCustomer(): CustomerPlan { return plan(2, 2, false, 27, [DIME, DIME, DIME], [], false, 3, [PENNY]); }
/** The introduction's taught customer: price 26¢ paid with three dimes; the helper gives the first penny. */
export function taughtCustomer(tier: Tier): CustomerPlan {
  return plan(2, 2, false, 26, [DIME, DIME, DIME], [], false, 4, tillKinds([PENNY], [PENNY, NICKEL, DIME, QUARTER], tier));
}

const push = (list: number[], value: number, max: number): void => { list.push(value); while (list.length > max) list.shift(); };
const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record one counted customer at the current step. Step changes wait for applyLearning between rounds. */
export function recordCustomer(data: StallData, right: boolean): void { push(data.learn, right ? 1 : 0, LEARN_WINDOW); }

/**
 * Between rounds: `counted` is the round's counted customers (1 = right). Moves up on a clean round of three or more,
 * or six right in the last eight; moves down on two or fewer in the last six; a child who plays only with keys at
 * steps 1 and 2 moves up after three rounds, up to step 3. Never above the step after the last built one (it repeats
 * the last built step's content until the next steps are built) unless a save already holds a higher step.
 */
export function applyLearning(data: StallData, counted: readonly number[]): void {
  const before = data.step, top = Math.max(before, Math.min(TOP_STEP, BUILT_STEP + 1));
  if (data.step <= 2 && counted.length === 0) data.quietRounds++; else data.quietRounds = 0;
  const recent = data.learn.slice(-6);
  if (counted.length >= 3 && sum(counted) === counted.length) data.step++;
  else if (data.learn.length >= LEARN_WINDOW && sum(data.learn) >= 6) data.step++;
  else if (recent.length >= 6 && sum(recent) <= 2 && data.step > 1) data.step--;
  if (data.step === before && data.quietRounds >= 3 && data.step < 3) data.step++;
  data.step = Math.max(1, Math.min(top, data.step));
  if (data.step !== before) { data.learn.length = 0; data.quietRounds = 0; }
}

/** Between rounds: motor tier from pointer carries and decision presses only (keys, the tier-0 send, demonstrations and hints never count). */
export function applyMotor(data: StallData, tier: Tier, hits: number, misses: number): void {
  const attempts = hits + misses, rate = attempts ? hits / attempts : 1;
  if (attempts >= 8 && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
  else if (attempts >= 12 && rate >= 0.9) {
    data.qualifyingRounds++;
    if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
  } else data.qualifyingRounds = 0;
}

/** Every finished round earns three stars; a bounced piece or a not-right choice never costs one. */
export const ROUND_STARS = 3;
