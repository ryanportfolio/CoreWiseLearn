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

/** A $1 bill in a payment counted in cents (steps 7 and 9): it pours 100¢. Drawn as the $1 bill. */
export const K_DOLLAR = 4;
const ALL_COINS = [PENNY, NICKEL, DIME, QUARTER] as const;
const ALL_BILLS = [B1, B5, B10, B20] as const;

export interface TierParams {
  /** Customers in one round at step 1 (above step 1 a round adds a warm-up customer at tier 0; see roundSize). */
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
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { customers: 3, dime: 120, bill: 240, snap: 80, paw: [170, 130], item: [210, 190], purse: [170, 170], purseW: 160, extra: 0 },
  { customers: 4, dime: 108, bill: 220, snap: 56, paw: [150, 120], item: [190, 170], purse: [150, 150], purseW: 140, extra: 1 },
  { customers: 4, dime: 96, bill: 200, snap: 40, paw: [130, 110], item: [170, 150], purse: [130, 130], purseW: 120, extra: 2 },
];

export interface CustomerPlan {
  /** Learning step this customer counts toward (a warm-up customer shows the step below and counts nothing). */
  step: number;
  /** Content step 1 to TOP_STEP: what the customer brings. */
  content: number;
  /** Whole-dollar amounts with bills ($), else cents with coins (¢; a K_DOLLAR piece is a $1 bill worth 100¢). */
  dollars: boolean;
  /** Price in cents or dollars (at step 9 the total of both items). */
  price: number;
  /** The items' own prices: one, or two at step 9 (their tags slide together into the total). */
  parts: number[];
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


export const valueOf = (kind: number, dollars: boolean): number => (dollars ? BILL_VALUE[kind]! : kind === K_DOLLAR ? 100 : COIN_VALUE[kind]!);
const sumOf = (kinds: readonly number[], dollars: boolean): number => { let s = 0; for (const k of kinds) s += valueOf(k, dollars); return s; };
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
/** Quarters and dimes for a multiple of 5 from 20 up (as many quarters as leave a multiple of ten), largest first. */
function quartersAndDimes(amount: number): number[] {
  let q = Math.floor(amount / 25);
  while (q > 0 && (amount - q * 25) % 10 !== 0) q--;
  const out: number[] = Array(q).fill(QUARTER);
  for (let left = amount - q * 25; left >= 10; left -= 10) out.push(DIME);
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
/** Coins (or bills) worth no more than the change, from `kinds`; the smallest is always included. */
const neededFor = (change: number, kinds: readonly number[], dollars: boolean): number[] =>
  kinds.filter((k, i) => i === 0 || valueOf(k, dollars) <= change);

/**
 * Content step for customer `index` of round number `round` at learning step `step`: the first customer above step 1
 * warms up with the step below. At the top step the warm-up comes from step 7 and step 8 in turn (round by round) and
 * every later customer is a step-9 customer, so each round counts at least three and still varies.
 */
export function customerStep(step: number, index: number, round = 0): number {
  const s = Math.max(1, Math.min(TOP_STEP, step));
  if (s === TOP_STEP) return index === 0 ? TOP_STEP - 2 + (round % 2) : TOP_STEP;
  return index === 0 && s > 1 ? s - 1 : s;
}
/** Customers in a round: every round has at least three counted customers (above step 1 the warm-up comes on top). */
export const roundSize = (step: number, tier: Tier): number => TIERS[tier].customers + (tier === 0 && step > 1 ? 1 : 0);
export const contentOf = (step: number): number => Math.max(1, Math.min(TOP_STEP, step));

const plan = (step: number, content: number, dollars: boolean, price: number, pay: number[], topUp: number[], decide: boolean, change: number, till: number[], parts = [price]): CustomerPlan =>
  ({ step, content, dollars, price, parts, pay, topUp, decide, change, till });

/**
 * A customer for learning step `step` (content from contentOf(step)). `last` is the previous customer's price, avoided
 * where there is a choice; `exact` forces (true) or forbids (false) an exact payment at the decision steps.
 */
export function planCustomer(step: number, tier: Tier, random: () => number, last: number, exact?: boolean): CustomerPlan {
  const content = contentOf(step);
  const pick = (lo: number, hi: number): number => { let n = lo + Math.floor(random() * (hi - lo + 1)); if (n === last && hi > lo) n = n < hi ? n + 1 : lo; return n; };
  const any = (lo: number, hi: number): number => lo + Math.floor(random() * (hi - lo + 1));
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
    return plan(step, 2, false, price, Array(payTens).fill(DIME), [], false, payTens * 10 - price, tillKinds([PENNY], ALL_COINS, tier));
  }
  if (content === 3) {
    // Whole-dollar prices $1 to $10 in $1 and $5 bills, exact half the time, else short by $1 to $3.
    const price = pick(1, 10), isExact = price === 1 || (exact ?? random() < 0.5);
    const short = isExact ? 0 : 1 + Math.floor(random() * Math.min(3, price - 1));
    return plan(step, 3, true, price, billsFor(price - short, [B1, B5]), billsFor(short, [B1]), true, 0, []);
  }
  if (content === 4) {
    // Prices $1 to $9 paid with a $5 bill (prices $1 to $4, half the time) or a $10 bill; change in $1 bills.
    const price = pick(1, 9), bill = price < 5 && random() < 0.5 ? B5 : B10;
    return plan(step, 4, true, price, [bill], [], false, BILL_VALUE[bill] - price, tillKinds([B1], [B1, B5, B10], tier));
  }
  if (content === 5) {
    // Prices 26 to 99 cents; a payment with at least one quarter (largest coins first) that is exact, short by 1 to
    // 10 cents or more by 1 to 24 cents (at most 100), a third each. The child decides; when it is more, counts the change.
    const price = pick(26, 99);
    const mode = exact === true ? 0 : exact === false ? 1 + Math.floor(random() * 2) : Math.floor(random() * 3);
    if (mode === 1) {
      const short = 1 + Math.floor(random() * Math.min(10, price - 25));
      return plan(step, 5, false, price, coinsFor(price - short, ALL_COINS), coinsFor(short, [PENNY, NICKEL, DIME]), true, 0, []);
    }
    if (mode === 2) {
      const change = 1 + Math.floor(random() * Math.min(24, 100 - price));
      return plan(step, 5, false, price, coinsFor(price + change, ALL_COINS), [], true, change, tillKinds(neededFor(change, [PENNY, NICKEL, DIME], false), ALL_COINS, tier));
    }
    return plan(step, 5, false, price, coinsFor(price, ALL_COINS), [], true, 0, []);
  }
  if (content === 6) {
    // Change of 10 to 50 cents: a price of 10 to 89 cents (half the time its ones digit is not 0 or 5), paid with a
    // multiple of 10 or of 25 in quarters and dimes (price 23, paid two quarters). Counted up through the next 5 and 10.
    for (let tries = 0; tries < 40; tries++) {
      let price = pick(10, 89);
      if (random() < 0.5) while (price % 5 === 0) price++;
      const options: number[] = [];
      for (let p = price + 10; p <= Math.min(100, price + 50); p++) if (p % 10 === 0 || p % 25 === 0) options.push(p);
      if (!options.length) continue;
      const pay = options[Math.floor(random() * options.length)]!, change = pay - price;
      const needed = change >= 25 ? [PENNY, NICKEL, DIME, QUARTER] : [PENNY, NICKEL, DIME];
      return plan(step, 6, false, price, quartersAndDimes(pay), [], false, change, tillKinds(needed, ALL_COINS, tier));
    }
    return demoPlan(6, step, tier);
  }
  if (content === 7) {
    // Change from $1: prices 5 to 95 cents, paid with a $1 bill that pours 100 cups; counted up to 100 with any coins.
    const price = pick(5, 95), change = 100 - price;
    return plan(step, 7, false, price, [K_DOLLAR], [], false, change, tillKinds(neededFor(change, ALL_COINS, false), ALL_COINS, tier));
  }
  if (content === 8) {
    // $20 and bigger jumps: prices $1 to $19 paid with a $20 bill, or (prices $11 to $14, half the time) with $10 and $5.
    const price = pick(1, 19), pay = price >= 11 && price <= 14 && random() < 0.5 ? [B10, B5] : [B20];
    const change = sumOf(pay, true) - price;
    return plan(step, 8, true, price, pay, [], false, change, tillKinds(neededFor(change, [B1, B5, B10], true), ALL_BILLS, tier));
  }
  // Step 9: two items, both in cents (each 5 to 60, total 20 to 95) paid with a $1 bill, or both in dollars (each $1 to
  // $12, total $5 to $19) paid with a $20 bill. The tags slide together and the cups combine before the payment.
  if (random() < 0.5) {
    for (;;) {
      const a = any(5, 60), b = any(5, 60), total = a + b;
      if (total < 20 || total > 95 || total === last || Math.ceil(a / 10) + Math.ceil(b / 10) > 10) continue;
      return plan(step, 9, false, total, [K_DOLLAR], [], false, 100 - total, tillKinds(neededFor(100 - total, ALL_COINS, false), ALL_COINS, tier), [a, b]);
    }
  }
  for (;;) {
    const a = any(1, 12), b = any(1, 12), total = a + b;
    if (total < 5 || total > 19 || total === last) continue;
    return plan(step, 9, true, total, [B20], [], false, 20 - total, tillKinds(neededFor(20 - total, [B1, B5, B10], true), ALL_BILLS, tier), [a, b]);
  }
}

/**
 * The first customer of a step whose demonstration needs fixed numbers: step 6 is 23¢ paid with two quarters (the hand
 * gives two pennies and a nickel: 24, 25, 30), step 8 is $13 paid with $20 (the hand gives two $1 bills: 14, 15).
 */
export function demoPlan(content: number, step: number, tier: Tier): CustomerPlan {
  if (content === 8) return plan(step, 8, true, 13, [B20], [], false, 7, tillKinds([B1, B5], ALL_BILLS, tier));
  return plan(step, 6, false, 23, [QUARTER, QUARTER], [], false, 27, tillKinds([PENNY, NICKEL, DIME, QUARTER], ALL_COINS, tier));
}

/** The introduction's first customer: the goal, price 27¢ paid with three dimes, three pennies of change. */
export function goalCustomer(): CustomerPlan { return plan(2, 2, false, 27, [DIME, DIME, DIME], [], false, 3, [PENNY]); }
/** The introduction's taught customer: price 26¢ paid with three dimes; the helper gives the first penny. */
export function taughtCustomer(tier: Tier): CustomerPlan {
  return plan(2, 2, false, 26, [DIME, DIME, DIME], [], false, 4, tillKinds([PENNY], ALL_COINS, tier));
}

const push = (list: number[], value: number, max: number): void => { list.push(value); while (list.length > max) list.shift(); };
const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record one counted customer at the current step. Step changes wait for applyLearning between rounds. */
export function recordCustomer(data: StallData, right: boolean): void { push(data.learn, right ? 1 : 0, LEARN_WINDOW); }

/**
 * Between rounds: `counted` is the round's counted customers (1 = right). Moves up on a clean round of three or more,
 * or six right in the last eight; moves down on two or fewer in the last six; a child who plays only with keys at
 * steps 1 and 2 moves up after three rounds, up to step 3. Never above TOP_STEP.
 */
export function applyLearning(data: StallData, counted: readonly number[]): void {
  const before = data.step, top = TOP_STEP;
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
