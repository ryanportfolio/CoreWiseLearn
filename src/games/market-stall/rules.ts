/**
 * Market Stall tuning: motor tiers, the customers each learning step brings, the till's contents and the rules that
 * change difficulty between rounds. Motor tiers and learning steps are separate and never change inside a round.
 * Every customer pays more than the price and the child, the cashier, counts the change back up from the price.
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
/** Bill kinds at the $ steps: $1, $5, $10, $20. */
export const B1 = 0, B5 = 1, B10 = 2, B20 = 3;
export const BILL_VALUE = [1, 5, 10, 20] as const;
export const BILL_NAMES = ['one-dollar', 'five-dollars', 'ten-dollars', 'twenty-dollars'] as const;

/**
 * Bills in an amount counted in cents (the ¢ steps that pay with bills, and dollars-and-cents amounts): a $1 bill is
 * worth 100¢ and a $5 bill 500¢. Drawn as the $1 and $5 bills.
 */
export const K_DOLLAR = 4, K_FIVE = 5;
const ALL_COINS = [PENNY, NICKEL, DIME, QUARTER] as const;
const ALL_BILLS = [B1, B5, B10, B20] as const;
/** Change in dollars and cents: the four coins and the $1 bill. */
const MIXED = [PENNY, NICKEL, DIME, QUARTER, K_DOLLAR] as const;

export interface TierParams {
  /** Customers in one round at step 1 (above step 1 a round adds a warm-up customer at tier 0; see roundSize). */
  customers: number;
  /** Dime diameter and bill width in layout units (the other coins follow the true ratios; bills are 2:1). */
  dime: number; bill: number;
  /** How far outside the paw zone a released piece still counts as dropped on it, in layout units. */
  snap: number;
  /** The customer's open paw zone in layout units (floored at 96 CSS px). */
  paw: readonly [number, number];
  /** Till kinds: 0 = only the kinds the change needs, 1 = one more, 2 = every kind of that till. */
  extra: number;
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { customers: 3, dime: 120, bill: 240, snap: 80, paw: [170, 130], extra: 0 },
  { customers: 4, dime: 108, bill: 220, snap: 56, paw: [150, 120], extra: 1 },
  { customers: 4, dime: 96, bill: 200, snap: 40, paw: [130, 110], extra: 2 },
];

export interface CustomerPlan {
  /** Learning step this customer counts toward (a warm-up customer shows the step below and counts nothing). */
  step: number;
  /** Content step 1 to TOP_STEP: what the customer brings. */
  content: number;
  /** Whole-dollar amounts with bills ($), else cents (¢; K_DOLLAR and K_FIVE pieces are bills worth 100¢ and 500¢). */
  dollars: boolean;
  /** Price in cents or dollars (at step 9 the total of both items). */
  price: number;
  /** The items' own prices: one, or two at step 9 (their tags slide together into the total). */
  parts: number[];
  /** The payment's pieces (coin or bill kinds), largest first. Always worth more than the price. */
  pay: number[];
  /** Change owed after the payment (always more than 0). */
  change: number;
  /** Kinds the till offers for the change, smallest first. */
  till: number[];
}

export const valueOf = (kind: number, dollars: boolean): number =>
  (dollars ? BILL_VALUE[kind]! : kind === K_DOLLAR ? 100 : kind === K_FIVE ? 500 : COIN_VALUE[kind]!);
const sumOf = (kinds: readonly number[], dollars: boolean): number => { let s = 0; for (const k of kinds) s += valueOf(k, dollars); return s; };
export const paid = (plan: CustomerPlan): number => sumOf(plan.pay, plan.dollars);
/** Every kind a till of this plan's unit can hold, smallest first. */
const kindsOf = (dollars: boolean, mixed: boolean): readonly number[] => (dollars ? ALL_BILLS : mixed ? MIXED : ALL_COINS);

/**
 * The next piece when counting up from `at` with `left` still owed, as the demonstrations teach: ones (pennies or $1
 * bills) to the next 5, a five (a nickel or $5 bill) to the next 10, then tens (dimes or $10 bills); in cents at a
 * whole dollar with a dollar or more owed, a $1 bill. If that kind is not available (`has`) or is too much, the largest
 * smaller of those that fits; else the largest available kind that fits; -1 when nothing fits.
 */
export function nextPiece(at: number, left: number, dollars: boolean, has: (kind: number) => boolean): number {
  const fits = (k: number): boolean => has(k) && valueOf(k, dollars) <= left;
  if (!dollars && at % 100 === 0 && fits(K_DOLLAR)) return K_DOLLAR;
  const want = at % 5 !== 0 ? 0 : at % 10 !== 0 ? 1 : 2;
  for (let k = want; k >= 0; k--) if (fits(k)) return k;
  let best = -1;
  for (const k of kindsOf(dollars, true)) if (fits(k) && (best < 0 || valueOf(k, dollars) > valueOf(best, dollars))) best = k;
  return best;
}
/** The kinds counting up from `price` to `pay` uses when every kind of `all` is in the till, smallest first. */
function countUpKinds(price: number, pay: number, dollars: boolean, all: readonly number[]): number[] {
  const used = new Set<number>();
  for (let at = price; at < pay;) {
    const k = nextPiece(at, pay - at, dollars, kind => all.includes(kind));
    if (k < 0) break;
    used.add(k); at += valueOf(k, dollars);
  }
  return [...used].sort((a, b) => a - b);
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
/** The kinds counting up needs, with pennies always there (so a child can always give ones). */
const withPennies = (kinds: number[]): number[] => (kinds.includes(PENNY) ? kinds : [PENNY, ...kinds]);

/** Scratch for payable: reach[a] = 1 when `a` can be made (reused, so a check allocates nothing). */
const reach = new Uint8Array(1001);
/**
 * Whether `amount` (in the plan's unit) can be paid exactly from a till holding `n` kinds `kinds[0..n-1]`, as many of
 * each as wanted. 0 is always payable.
 */
export function payable(amount: number, kinds: ArrayLike<number>, n: number, dollars: boolean): boolean {
  if (amount <= 0) return amount === 0;
  if (amount >= reach.length) return false;
  reach.fill(0, 0, amount + 1); reach[0] = 1;
  for (let a = 1; a <= amount; a++) {
    for (let i = 0; i < n; i++) { const v = valueOf(kinds[i]!, dollars); if (v <= a && reach[a - v]) { reach[a] = 1; break; } }
  }
  return reach[amount] === 1;
}
/**
 * The rule for every step: the scene takes a piece only when it is no more than the change still owed (`left`) and
 * what is left after it can still be paid from the till. Every till holds the unit piece (a penny, or a $1 bill at the
 * $ steps), so the second part never turns a piece away in play; it is the guarantee that no round can get stuck.
 */
export function accepts(kind: number, left: number, kinds: ArrayLike<number>, n: number, dollars: boolean): boolean {
  const v = valueOf(kind, dollars);
  return v <= left && payable(left - v, kinds, n, dollars);
}

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
/** Steps whose board shows the price and payment as cups, with the change owed as orange-red cups (1 to 3). */
export const CUP_STEPS = 3;

const plan = (step: number, content: number, dollars: boolean, price: number, pay: number[], change: number, till: number[], parts = [price]): CustomerPlan =>
  ({ step, content, dollars, price, parts, pay, change, till });

/**
 * A dollars-and-cents customer: price in cents paid with $2 (two $1 bills) or $5; change in coins and $1 bills. The
 * till always holds pennies: without them a $1.70 item paid with $2 got a till of dimes and quarters at tier 1, and a
 * quarter (accepted, 25¢ of 30¢) left 5¢ that nothing in the till could pay (round RD2).
 */
function mixedPlan(step: number, content: number, price: number, five: boolean, tier: Tier, parts = [price]): CustomerPlan {
  const pay = five ? [K_FIVE] : [K_DOLLAR, K_DOLLAR], total = five ? 500 : 200;
  return plan(step, content, false, price, pay, total - price, tillKinds(withPennies(countUpKinds(price, total, false, MIXED)), MIXED, tier), parts);
}

/** A customer for learning step `step` (content from contentOf(step)). `last` is the previous customer's price, avoided where there is a choice. */
export function planCustomer(step: number, tier: Tier, random: () => number, last: number): CustomerPlan {
  const content = contentOf(step);
  const pick = (lo: number, hi: number): number => { let n = lo + Math.floor(random() * (hi - lo + 1)); if (n === last && hi > lo) n = n < hi ? n + 1 : lo; return n; };
  const any = (lo: number, hi: number): number => lo + Math.floor(random() * (hi - lo + 1));
  if (content === 1) {
    // Prices 1 to 9 cents paid with a dime; change 1 to 9 cents, counted up in pennies.
    const price = pick(1, 9);
    return plan(step, 1, false, price, [DIME], 10 - price, tillKinds([PENNY], [PENNY, NICKEL, DIME], tier));
  }
  if (content === 2) {
    // Prices 5 to 20 cents paid with a quarter; change 5 to 20 cents in pennies, nickels and dimes.
    const price = pick(5, 20), change = 25 - price;
    return plan(step, 2, false, price, [QUARTER], change, tillKinds(withPennies(countUpKinds(price, 25, false, [PENNY, NICKEL, DIME])), [PENNY, NICKEL, DIME], tier));
  }
  if (content === 3) {
    // Prices 11 to 49 cents that are not a multiple of 10, paid with the next ten in dimes; change in pennies.
    let price = pick(11, 49);
    if (price % 10 === 0) price += price === 40 ? -1 : 1;
    const payTens = Math.ceil(price / 10);
    return plan(step, 3, false, price, Array(payTens).fill(DIME), payTens * 10 - price, tillKinds([PENNY], [PENNY, NICKEL], tier));
  }
  if (content === 4) {
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
      return plan(step, 4, false, price, quartersAndDimes(pay), change, tillKinds(needed, ALL_COINS, tier));
    }
    return demoPlan(4, step, tier);
  }
  if (content === 5) {
    // Change from $1: prices 5 to 95 cents, paid with a $1 bill; counted up to 100 with any coins.
    const price = pick(5, 95), change = 100 - price;
    return plan(step, 5, false, price, [K_DOLLAR], change, tillKinds(neededFor(change, ALL_COINS, false), ALL_COINS, tier));
  }
  if (content === 6) {
    // Prices $1 to $9 paid with a $5 bill (prices $1 to $4, half the time) or a $10 bill; change in $1 bills.
    const price = pick(1, 9), bill = price < 5 && random() < 0.5 ? B5 : B10;
    return plan(step, 6, true, price, [bill], BILL_VALUE[bill] - price, tillKinds([B1], [B1, B5, B10], tier));
  }
  if (content === 7) {
    // $20 and bigger jumps: prices $1 to $19 paid with a $20 bill, or (prices $11 to $14, half the time) with $10 and $5.
    const price = pick(1, 19), pay = price >= 11 && price <= 14 && random() < 0.5 ? [B10, B5] : [B20];
    const change = sumOf(pay, true) - price;
    return plan(step, 7, true, price, pay, change, tillKinds(neededFor(change, [B1, B5, B10], true), ALL_BILLS, tier));
  }
  if (content === 8) {
    // Dollars and cents: prices 25¢ to $1.95 in steps of 5¢, paid with $2 (two $1 bills) or, half the time, $5.
    // Amounts from $1 up are written with a decimal point ($1.25).
    const price = 5 * pick(5, 39);
    return mixedPlan(step, 8, price, random() < 0.5, tier);
  }
  // Step 9: two items. A third of the customers: both in cents (each 5 to 60, total 20 to 95) paid with a $1 bill; a
  // third: both in dollars (each $1 to $12, total $5 to $19) paid with $20; a third: both in dollars and cents (each
  // 25¢ to $1.50 in steps of 5¢, total $1.05 or more) paid with $2 when the total is at most $1.95, else $5.
  const kind = Math.floor(random() * 3);
  if (kind === 0) {
    for (;;) {
      const a = any(5, 60), b = any(5, 60), total = a + b;
      if (total < 20 || total > 95 || total === last) continue;
      return plan(step, 9, false, total, [K_DOLLAR], 100 - total, tillKinds(neededFor(100 - total, ALL_COINS, false), ALL_COINS, tier), [a, b]);
    }
  }
  if (kind === 1) {
    for (;;) {
      const a = any(1, 12), b = any(1, 12), total = a + b;
      if (total < 5 || total > 19 || total === last) continue;
      return plan(step, 9, true, total, [B20], 20 - total, tillKinds(neededFor(20 - total, [B1, B5, B10], true), ALL_BILLS, tier), [a, b]);
    }
  }
  for (;;) {
    const a = 5 * any(5, 30), b = 5 * any(5, 30), total = a + b;
    if (total < 105 || total === last) continue;
    return mixedPlan(step, 9, total, total > 195, tier, [a, b]);
  }
}

/**
 * The first customer of a step whose demonstration needs fixed numbers: step 2 is 13¢ paid with a quarter (the hand
 * gives two pennies and a nickel: 14, 15, 20), step 4 is 23¢ paid with two quarters (24, 25, 30), step 7 is $13 paid
 * with $20 (the hand gives two $1 bills: 14, 15), step 8 is 75¢ paid with $2 (a nickel, a dime and a dime: 80, 90, $1.00).
 */
export function demoPlan(content: number, step: number, tier: Tier): CustomerPlan {
  if (content === 2) return plan(step, 2, false, 13, [QUARTER], 12, tillKinds([PENNY, NICKEL], [PENNY, NICKEL, DIME], tier));
  if (content === 7) return plan(step, 7, true, 13, [B20], 7, tillKinds([B1, B5], ALL_BILLS, tier));
  if (content === 8) return mixedPlan(step, 8, 75, false, tier);
  return plan(step, 4, false, 23, [QUARTER, QUARTER], 27, tillKinds([PENNY, NICKEL, DIME, QUARTER], ALL_COINS, tier));
}
/** Steps whose first customer is a fixed demonstration customer (demoPlan). */
export const DEMO_PLAN_STEPS = [2, 4, 7, 8] as const;

/** The introduction's first customer: the goal, price 7¢ paid with a dime, three pennies of change. */
export function goalCustomer(): CustomerPlan { return plan(1, 1, false, 7, [DIME], 3, [PENNY]); }
/** The introduction's taught customer: price 6¢ paid with a dime; the helper gives the first penny. */
export function taughtCustomer(tier: Tier): CustomerPlan {
  return plan(1, 1, false, 6, [DIME], 4, tillKinds([PENNY], [PENNY, NICKEL, DIME], tier));
}

const push = (list: number[], value: number, max: number): void => { list.push(value); while (list.length > max) list.shift(); };
const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record one counted customer at the current step. Step changes wait for applyLearning between rounds. */
export function recordCustomer(data: StallData, right: boolean): void { push(data.cashLearn, right ? 1 : 0, LEARN_WINDOW); }

/**
 * Between rounds: `counted` is the round's counted customers (1 = right). Moves up on a clean round of three or more,
 * or six right in the last eight; moves down on two or fewer in the last six; a child who plays only with keys at
 * steps 1 and 2 moves up after three rounds, up to step 3. Never above TOP_STEP.
 */
export function applyLearning(data: StallData, counted: readonly number[]): void {
  const before = data.cashStep, top = TOP_STEP;
  if (data.cashStep <= 2 && counted.length === 0) data.cashQuiet++; else data.cashQuiet = 0;
  const recent = data.cashLearn.slice(-6);
  if (counted.length >= 3 && sum(counted) === counted.length) data.cashStep++;
  else if (data.cashLearn.length >= LEARN_WINDOW && sum(data.cashLearn) >= 6) data.cashStep++;
  else if (recent.length >= 6 && sum(recent) <= 2 && data.cashStep > 1) data.cashStep--;
  if (data.cashStep === before && data.cashQuiet >= 3 && data.cashStep < 3) data.cashStep++;
  data.cashStep = Math.max(1, Math.min(top, data.cashStep));
  if (data.cashStep !== before) { data.cashLearn.length = 0; data.cashQuiet = 0; }
}

/** Between rounds: motor tier from pointer carries only (keys, demonstrations and hints never count). */
export function applyMotor(data: StallData, tier: Tier, hits: number, misses: number): void {
  const attempts = hits + misses, rate = attempts ? hits / attempts : 1;
  if (attempts >= 8 && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
  else if (attempts >= 12 && rate >= 0.9) {
    data.qualifyingRounds++;
    if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
  } else data.qualifyingRounds = 0;
}

/** Every finished round earns three stars; a bounced piece never costs one. */
export const ROUND_STARS = 3;
