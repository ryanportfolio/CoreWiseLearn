/**
 * Ride Fare tuning: motor tiers, the riders each learning step asks for, and the rules that change difficulty between
 * rounds. Motor tiers and learning steps are separate and never change inside a round.
 */
import type { Tier } from '../../engine/difficulty';
import { LEARN_WINDOW, TOP_STEP, type RideData } from './data';

export const PENNY = 0, NICKEL = 1, DIME = 2;
export const COIN_NAMES = ['penny', 'nickel', 'dime'] as const;
export const COIN_VALUE = [1, 5, 10] as const;
/** True diameters in millimetres; code keeps these ratios. */
export const COIN_MM = [19.05, 21.21, 17.91] as const;
export const DIME_MM = 17.91;
/** The dime never draws below this many CSS px. */
export const MIN_DIME_PX = 96;

export interface TierParams {
  /** Riders in one round. */
  riders: number;
  /** Most places on the tray; extra coins of one kind stack on a place. */
  places: number;
  /** Dime diameter in layout units (the other coins follow the true ratios). */
  dime: number;
  /** Fare-box width in layout units. */
  box: number;
  /** How far outside a target (fare box, swap stand, paws) a released coin still counts as dropped on it, in layout units. */
  snap: number;
  /** A single press (click) on a coin sends it straight to the target the step asks for next. */
  oneTap: boolean;
  /** The animal's paws target at step 8, in CSS px at u = 1 (never under 96 on its shortest side). */
  paws: readonly [number, number];
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { riders: 3, places: 3, dime: 120, box: 380, snap: 80, oneTap: true, paws: [160, 120] },
  { riders: 4, places: 4, dime: 108, box: 350, snap: 56, oneTap: false, paws: [140, 110] },
  { riders: 4, places: 6, dime: 96, box: 320, snap: 40, oneTap: false, paws: [120, 100] },
];

export interface TrayItem { kind: number; count: number; unlimited: boolean }
export interface RiderPlan {
  /** Learning step whose content this rider shows (a warm-up rider shows the step below). */
  step: number;
  /** The fare in cents: cups to light (at steps 1 and 7 the value of the plate's coins). */
  fare: number;
  /** Steps 1 and 7: the coin pictures on the plate, largest coin first; the fare box takes only these coins. */
  plate: number[];
  tray: TrayItem[];
  /** Step 7: the swap stand is open; `extra` lists the kinds of the empty tray places swapped coins land in. */
  swap: boolean;
  extra: number[];
  /** Step 8: the coin the animal pays with (10 for a dime); the child hands back the change. 0 otherwise. */
  animalPays: number;
}

const rider = (step: number, fare: number, tray: TrayItem[], plate: number[] = []): RiderPlan =>
  ({ step, fare, plate, tray, swap: false, extra: [], animalPays: 0 });
const item = (kind: number, count: number, unlimited = false): TrayItem => ({ kind, count, unlimited });

/** At the top step a round mixes riders from steps 5, 6 and 8 (the step-8 riders are the counted ones). */
const TOP_MIX = [5, 8, 6, 8] as const;

/** Content step for rider `index` of a round at `step`: the first rider above step 2 warms up with the step below. */
export function riderStep(step: number, index: number): number {
  const s = Math.max(1, Math.min(TOP_STEP, step));
  if (s === TOP_STEP) return TOP_MIX[index % TOP_MIX.length]!;
  return index === 0 && s > 2 ? s - 1 : s;
}

/** The introduction's taught rider: fare 6, a nickel and pennies; the helper pays the nickel, the child adds a penny. */
export function introRider(): RiderPlan {
  return rider(3, 6, [item(NICKEL, 1), item(PENNY, 5)]);
}

/** Step 7 rider: the plate wants a nickel (from five pennies) or a dime (from two nickels, or from ten pennies). */
export function swapRider(variant: number): RiderPlan {
  const plan = variant === 0 ? rider(7, 5, [item(PENNY, 5)], [NICKEL])
    : variant === 1 ? rider(7, 10, [item(NICKEL, 2)], [DIME])
      : rider(7, 10, [item(PENNY, 10)], [DIME]);
  plan.swap = true;
  plan.extra = variant === 0 ? [NICKEL] : variant === 1 ? [DIME] : [NICKEL, DIME];
  return plan;
}

/** A rider for a content step. `last` is the previous rider's fare (or plate size at step 1), avoided where there is a choice. */
export function planRider(step: number, random: () => number, last: number): RiderPlan {
  if (step <= 1) {
    // Pennies and nickels only (dimes arrive at age 6, step 5). One to three pictures, the nickel first.
    let n = 1 + Math.floor(random() * 3);
    if (n === last) n = 1 + ((n + Math.floor(random() * 2)) % 3);
    const plate: number[] = [];
    for (let i = 0; i < n; i++) plate.push(random() < 0.4 ? NICKEL : PENNY);
    plate.sort((a, b) => b - a);
    const nickels = plate.filter(k => k === NICKEL).length, pennies = n - nickels;
    // The needed coins plus one coin of the kind the plate does not show, when there is one.
    const plan = rider(1, nickels * 5 + pennies, [item(NICKEL, nickels || 1), item(PENNY, pennies || 1)], plate);
    return plan;
  }
  if (step === 2) {
    let fare = 1 + Math.floor(random() * 5);
    if (fare === last) fare = 1 + (fare % 5);
    return rider(2, fare, [item(PENNY, fare + 1)]);
  }
  if (step === 3) return rider(3, 5, [item(NICKEL, 1), item(PENNY, 5)]);
  if (step === 4) {
    let fare = 6 + Math.floor(random() * 5);
    if (fare === last) fare = 6 + ((fare - 5) % 5);
    // The penny stack never runs out, so a fare is always payable whatever order the coins come in.
    return rider(4, fare, [item(NICKEL, 1), item(PENNY, 5, true)]);
  }
  if (step === 5) {
    // Fares 11 to 20 on two panels of ten; one or two dimes (a second dime is too much below 20), one or two nickels.
    let fare = 11 + Math.floor(random() * 10);
    if (fare === last) fare = 11 + ((fare - 10) % 10);
    const dimes = fare === 20 || random() < 0.4 ? 2 : 1, nickels = random() < 0.5 ? 2 : 1;
    return rider(5, fare, [item(DIME, dimes), item(NICKEL, nickels), item(PENNY, 5, true)]);
  }
  if (step === 6) {
    // Fares 21 to 99 cents, most of them under 60 so a round stays short; every coin kind never runs out.
    let fare = 21 + Math.floor(Math.pow(random(), 1.6) * 79);
    if (fare === last) fare = fare < 99 ? fare + 1 : 21;
    return rider(6, fare, [item(DIME, 5, true), item(NICKEL, 5, true), item(PENNY, 5, true)]);
  }
  if (step === 7) {
    // Rotate the swaps; a nickel fare (5) is followed by a dime fare where there is a choice.
    const r = random();
    return swapRider(last === 5 ? (r < 0.6 ? 1 : 2) : r < 0.45 ? 0 : r < 0.8 ? 1 : 2);
  }
  // Step 8: the animal pays a dime for a fare of 1 to 9 cents; the child hands back the change in pennies.
  let fare = 1 + Math.floor(random() * 9);
  if (fare === last) fare = 1 + (fare % 9);
  const plan = rider(8, fare, [item(PENNY, 5, true)]);
  plan.animalPays = 10;
  return plan;
}

/**
 * Place the tray items on at most `places` places: every coin on its own place when they fit, else one stack per kind
 * and the spare places split coins off the biggest stacks. Returns kinds and counts per place, largest coin first.
 */
export function arrangeTray(items: readonly TrayItem[], places: number, outKind: number[], outCount: number[], outUnlimited: boolean[]): number {
  outKind.length = 0; outCount.length = 0; outUnlimited.length = 0;
  const sorted = items.filter(i => i.count > 0).sort((a, b) => b.kind - a.kind);
  let total = 0;
  for (const it of sorted) total += it.count;
  if (total <= places && sorted.every(i => !i.unlimited)) {
    for (const it of sorted) for (let k = 0; k < it.count; k++) { outKind.push(it.kind); outCount.push(1); outUnlimited.push(false); }
    return outKind.length;
  }
  const stacks = sorted.map(i => ({ kind: i.kind, count: i.count, unlimited: i.unlimited, singles: 0 }));
  let spare = Math.max(0, places - stacks.length);
  while (spare > 0) {
    let best = -1;
    for (let i = 0; i < stacks.length; i++) if (stacks[i]!.count > 1 && (best < 0 || stacks[i]!.count > stacks[best]!.count)) best = i;
    if (best < 0) break;
    stacks[best]!.count--; stacks[best]!.singles++; spare--;
  }
  for (const st of stacks) {
    for (let k = 0; k < st.singles; k++) { outKind.push(st.kind); outCount.push(1); outUnlimited.push(false); }
    outKind.push(st.kind); outCount.push(st.count); outUnlimited.push(st.unlimited);
  }
  return outKind.length;
}

const push = (list: number[], value: number, max: number): void => { list.push(value); while (list.length > max) list.shift(); };
const sum = (list: readonly number[]): number => { let s = 0; for (const n of list) s += n; return s; };

/** Record one counted rider at the current step. Step changes wait for applyLearning between rounds. */
export function recordRider(data: RideData, exact: boolean): void { push(data.learn, exact ? 1 : 0, LEARN_WINDOW); }

/** Exposure steps move on after two finished rounds whatever happened. */
const EXPOSURE = (step: number): boolean => step === 2 || step === 7;

/**
 * Between rounds: `counted` is the round's counted riders (1 = exact). Moves up on a clean round of three or more, or
 * six exact in the last eight; moves down on two or fewer in the last six; exposure steps move up after two rounds; a
 * child who plays only with keys at steps 1 and 2 moves up after three rounds, up to step 3. Never above TOP_STEP.
 */
export function applyLearning(data: RideData, counted: readonly number[]): void {
  const before = data.step;
  data.stepRounds++;
  if (data.step <= 2 && counted.length === 0) data.quietRounds++; else data.quietRounds = 0;
  const recent = data.learn.slice(-6);
  if (EXPOSURE(data.step)) { if (data.stepRounds >= 2) data.step++; }
  else if (counted.length >= 3 && sum(counted) === counted.length) data.step++;
  else if (data.learn.length >= LEARN_WINDOW && sum(data.learn) >= 6) data.step++;
  else if (recent.length >= 6 && sum(recent) <= 2 && data.step > 1) data.step--;
  if (data.step === before && data.quietRounds >= 3 && data.step < 3) data.step++;
  data.step = Math.max(1, Math.min(TOP_STEP, data.step));
  if (data.step !== before) { data.learn.length = 0; data.stepRounds = 0; data.quietRounds = 0; }
}

/** Between rounds: motor tier from pointer carries only (keys, the tier-0 send, demonstrations and hints never count). */
export function applyMotor(data: RideData, tier: Tier, hits: number, misses: number): void {
  const attempts = hits + misses, rate = attempts ? hits / attempts : 1;
  if (attempts >= 8 && rate < 0.7) { data.tier = Math.max(0, tier - 1); data.qualifyingRounds = 0; }
  else if (attempts >= 12 && rate >= 0.9) {
    data.qualifyingRounds++;
    if (data.qualifyingRounds >= 2) { data.tier = Math.min(2, tier + 1); data.qualifyingRounds = 0; }
  } else data.qualifyingRounds = 0;
}

/** Every finished round earns three stars; a bounced coin never costs one. */
export const ROUND_STARS = 3;
