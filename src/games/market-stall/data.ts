/** Market Stall save bag: motor tier, learning step with its evidence, demonstrations seen and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';

export const GAME_ID = 'market-stall';
/** Highest learning step in the design (docs/games/market-stall.md). Saves keep any step up to it. */
export const TOP_STEP = 9;
/**
 * The cashier game's progress (round RD1's step table, every customer owed change) lives in its own fields:
 * `cashStep`, `cashDemos`, `cashLearn` and `cashQuiet`. The build before it (decision steps) keeps its own in `step`,
 * `demos`, `learn` and `quietRounds`, which this build reads once to start from and never writes. Two tabs on one save
 * (an old cached build and this one) then each read values of their own meaning, because the save merges field by
 * field and neither build writes the other's fields (round RD2).
 */
/** Old-table steps 1 to 9 mapped to the nearest cashier step. */
const OLD_STEP = [1, 1, 1, 6, 6, 4, 4, 5, 7, 9] as const;
/** Cashier demonstration bit n comes from this old-table bit (-1: a new idea, not seen yet). Bit 0 is unused. */
const OLD_DEMO = [-1, 2, -1, 2, 6, 7, 4, 8, -1, 9] as const;

export interface PendingRound {
  /** Names this round across tabs, so two rounds with the same fields stay apart. */
  id: string;
  stars: number; customers: number; choices: string[]; chosen: string;
  rewardEnabled: boolean; restEntered: boolean; tier: Tier;
  /** The round's customers (indexes into the customer list) and the goods each carried, for the celebration and rest. */
  who: number[]; goods: number[];
}

export interface StallData extends Record<string, unknown> {
  /** Motor tier: piece size, zone sizes, snap distance, till kinds. */
  tier: number;
  qualifyingRounds: number;
  rounds: number;
  /** Learning step in the cashier table, 1 to TOP_STEP. */
  cashStep: number;
  /** Finished rounds in a row at steps 1 and 2 with no counted customer (keys only). */
  cashQuiet: number;
  /** Recent counted customers at the current step, 1 = right. */
  cashLearn: number[];
  /** Demonstrations this profile has seen: bit n = cashier step n's new idea (bit 0 unused). */
  cashDemos: number;
  /** Where the customer rotation stands (the next round's first customer). */
  turn: number;
  pending: PendingRound | null;
}

export const LEARN_WINDOW = 8;
export const CUSTOMER_COUNT = 6;
export const GOODS_COUNT = 8;

/** The cashier progress fields, which a bag gets from cashierStart when it has none (never from these defaults). */
const CASH_KEYS = ['cashStep', 'cashQuiet', 'cashLearn', 'cashDemos'] as const;
export const defaultData = (): StallData => ({
  tier: 0, qualifyingRounds: 0, rounds: 0, cashStep: 1, cashQuiet: 0, cashLearn: [], cashDemos: 0, turn: 0, pending: null,
});
/** Defaults for the save's gameData: everything but the cashier progress fields, which cashierStart fills. */
export function bagDefaults(): StallData {
  const d: Record<string, unknown> = defaultData();
  for (const k of CASH_KEYS) delete d[k];
  return d as StallData;
}

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const bits = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => n === 0 || n === 1);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const indexes = (v: unknown, below: number): boolean => Array.isArray(v) && v.length <= 6 && v.every(n => Number.isSafeInteger(n) && n >= 0 && n < below);
const stepOk = (v: unknown): v is number => range(v, TOP_STEP) && v >= 1;
const demosOk = (v: unknown): v is number => range(v, (1 << (TOP_STEP + 1)) - 1);

/**
 * Repair malformed fields in place; protect the stored document when anything was wrong. A missing field (a bag from
 * an older build, or none at all) takes its default without protecting, except the cashier progress fields: those stay
 * missing until the scene's cashierStart derives them, so the derived values are this tab's change and get saved. The
 * old build's fields (`step`, `demos`, `learn`, `quietRounds`) are its own: never checked or changed here.
 */
export function sanitizeStallData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const checks: Record<string, (v: unknown) => boolean> = {
    tier: v => range(v, 2), qualifyingRounds: count, rounds: count, turn: v => range(v, CUSTOMER_COUNT - 1),
    cashStep: stepOk, cashQuiet: count, cashLearn: v => bits(v, LEARN_WINDOW), cashDemos: demosOk,
  };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in bag)) { if (!(CASH_KEYS as readonly string[]).includes(key)) bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!record(p) || typeof p.id !== 'string' || !range(p.stars, 3) || p.stars < 1 || !range(p.customers, 6) || !range(p.tier, 2) ||
    !indexes(p.who, CUSTOMER_COUNT) || !indexes(p.goods, GOODS_COUNT) ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean') {
    protect(); bag.pending = null;
  }
}

/**
 * Fill any missing cashier progress field (the scene calls this after gameData and sanitizeStallData). From the old
 * build's fields: its step moves to the nearest cashier step and its demonstrations to the matching bits; evidence and
 * quiet rounds start fresh (they were gathered at the old steps' content). A bag written by the first cashier build
 * (round RD1, marked `table: 2`) already holds cashier values in `step` and `demos` and is copied as it is. A bag with
 * none of these starts at step 1. Never a reset of anything already saved.
 */
export function cashierStart(bag: Record<string, unknown>): void {
  const rd1 = bag.table === 2;
  if (!('cashStep' in bag)) bag.cashStep = !stepOk(bag.step) ? 1 : rd1 ? bag.step : OLD_STEP[bag.step] ?? 1;
  if (!('cashDemos' in bag)) {
    let out = 0;
    if (demosOk(bag.demos)) {
      if (rd1) out = bag.demos;
      else for (let bit = 1; bit <= TOP_STEP; bit++) { const from = OLD_DEMO[bit]!; if (from >= 0 && (bag.demos & (1 << from)) !== 0) out |= 1 << bit; }
    }
    bag.cashDemos = out;
  }
  if (!('cashLearn' in bag)) bag.cashLearn = rd1 && bits(bag.learn, LEARN_WINDOW) ? bag.learn.slice() : [];
  if (!('cashQuiet' in bag)) bag.cashQuiet = rd1 && count(bag.quietRounds) ? bag.quietRounds : 0;
}
