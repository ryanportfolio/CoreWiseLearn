/**
 * Ride Fare tuning: motor tiers, the riders each learning step asks for, and the rules that change difficulty between
 * rounds. Motor tiers and learning steps are separate and never change inside a round.
 */
import type { Tier } from '../../engine/difficulty';
import { LEARN_WINDOW, type RideData } from './data';

export const PENNY = 0, NICKEL = 1, DIME = 2;
export const COIN_NAMES = ['penny', 'nickel', 'dime'] as const;
export const COIN_VALUE = [1, 5, 10] as const;
/** True diameters in millimetres; code keeps these ratios. */
export const COIN_MM = [19.05, 21.21, 17.91] as const;
export const DIME_MM = 17.91;
/** The dime never draws below this many CSS px. */
export const MIN_DIME_PX = 96;

/**
 * Last learning step built so far. Progression stops here; the steps above it (dimes, the numeral, the swap stand,
 * change) come in a later build and are reached by raising this number.
 */
export const BUILT_STEP = 4;

export interface TierParams {
  /** Riders in one round. */
  riders: number;
  /** Most places on the tray; extra coins of one kind stack on a place. */
  places: number;
  /** Dime diameter in layout units (the other coins follow the true ratios). */
  dime: number;
  /** Fare-box width in layout units. */
  box: number;
  /** How far outside the fare box a released coin still counts as dropped on it, in layout units. */
  snap: number;
  /** A single press (click) on a coin sends it straight into the slot. */
  oneTap: boolean;
}

export const TIERS: readonly [TierParams, TierParams, TierParams] = [
  { riders: 3, places: 3, dime: 120, box: 380, snap: 80, oneTap: true },
  { riders: 4, places: 4, dime: 108, box: 350, snap: 56, oneTap: false },
  { riders: 4, places: 6, dime: 96, box: 320, snap: 40, oneTap: false },
];

export interface TrayItem { kind: number; count: number; unlimited: boolean }
export interface RiderPlan {
  /** Learning step whose content this rider shows (a warm-up rider shows the step below). */
  step: number;
  /** Cups to light; 0 at step 1, where the coin plate stands in for cups. */
  fare: number;
  /** Step 1: the coin pictures on the plate, largest coin first. */
  plate: number[];
  tray: TrayItem[];
}

/** Content step for rider `index` of a round at `step`: the first rider above step 2 warms up with the step below. */
export function riderStep(step: number, index: number): number {
  const s = Math.max(1, Math.min(BUILT_STEP, step));
  return index === 0 && s > 2 ? s - 1 : s;
}

/** The introduction's taught rider: fare 6, a nickel and pennies; the helper pays the nickel, the child adds a penny. */
export function introRider(): RiderPlan {
  return { step: 3, fare: 6, plate: [], tray: [{ kind: NICKEL, count: 1, unlimited: false }, { kind: PENNY, count: 5, unlimited: false }] };
}

/** A rider for a content step. `last` is the previous rider's fare or plate size, avoided where there is a choice. */
export function planRider(step: number, random: () => number, last: number): RiderPlan {
  if (step <= 1) {
    // Pennies and nickels only (dimes arrive at age 6, step 5). One to three pictures, the nickel first.
    let n = 1 + Math.floor(random() * 3);
    if (n === last) n = 1 + ((n + Math.floor(random() * 2)) % 3);
    const plate: number[] = [];
    for (let i = 0; i < n; i++) plate.push(random() < 0.4 ? NICKEL : PENNY);
    plate.sort((a, b) => b - a);
    const nickels = plate.filter(k => k === NICKEL).length, pennies = n - nickels;
    const tray: TrayItem[] = [];
    // The needed coins plus one coin of the kind the plate does not show, when there is one.
    tray.push({ kind: NICKEL, count: nickels || 1, unlimited: false });
    tray.push({ kind: PENNY, count: pennies || 1, unlimited: false });
    return { step: 1, fare: 0, plate, tray };
  }
  if (step === 2) {
    let fare = 1 + Math.floor(random() * 5);
    if (fare === last) fare = 1 + (fare % 5);
    return { step: 2, fare, plate: [], tray: [{ kind: PENNY, count: fare + 1, unlimited: false }] };
  }
  if (step === 3) return { step: 3, fare: 5, plate: [], tray: [{ kind: NICKEL, count: 1, unlimited: false }, { kind: PENNY, count: 5, unlimited: false }] };
  let fare = 6 + Math.floor(random() * 5);
  if (fare === last) fare = 6 + ((fare - 5) % 5);
  // The penny stack never runs out, so a fare is always payable whatever order the coins come in.
  return { step: 4, fare, plate: [], tray: [{ kind: NICKEL, count: 1, unlimited: false }, { kind: PENNY, count: 5, unlimited: true }] };
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
 * child who plays only with keys at steps 1 and 2 moves up after three rounds, up to step 3. Never above BUILT_STEP.
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
  data.step = Math.max(1, Math.min(BUILT_STEP, data.step));
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
