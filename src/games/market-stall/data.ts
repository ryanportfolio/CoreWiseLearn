/** Market Stall save bag: motor tier, learning step with its evidence, demonstrations seen and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';

export const GAME_ID = 'market-stall';
/** Highest learning step in the design (docs/games/market-stall.md). Saves keep any step up to it. */
export const TOP_STEP = 9;
/**
 * Which learning-step table the bag's `step` and `demos` refer to. Table 1 (before round RD1) had decision steps;
 * table 2 is the cashier game, where every customer is owed change. A bag without this field is from table 1.
 */
export const STEP_TABLE = 2;
/** Table 1's steps 1 to 9 mapped to the nearest table-2 step (round RD1). */
const OLD_STEP = [1, 1, 1, 6, 6, 4, 4, 5, 7, 9] as const;
/** Table-2 demonstration bit n comes from this table-1 bit (-1: a new idea, not seen yet). Bit 0 is unused. */
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
  /** Learning step, 1 to TOP_STEP, in step table `table`. */
  step: number;
  /** The step table `step` and `demos` refer to (STEP_TABLE; older bags are mapped on load). */
  table: number;
  /** Finished rounds in a row at steps 1 and 2 with no counted customer (keys only). */
  quietRounds: number;
  /** Recent counted customers at the current step, 1 = right. */
  learn: number[];
  /** Demonstrations this profile has seen: bit n = step n's new idea (bit 0 unused). */
  demos: number;
  /** Where the customer rotation stands (the next round's first customer). */
  turn: number;
  pending: PendingRound | null;
}

export const LEARN_WINDOW = 8;
export const CUSTOMER_COUNT = 6;
export const GOODS_COUNT = 8;

export const defaultData = (): StallData => ({
  tier: 0, qualifyingRounds: 0, rounds: 0, step: 1, table: STEP_TABLE, quietRounds: 0, learn: [], demos: 0, turn: 0, pending: null,
});

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const bits = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => n === 0 || n === 1);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const indexes = (v: unknown, below: number): boolean => Array.isArray(v) && v.length <= 6 && v.every(n => Number.isSafeInteger(n) && n >= 0 && n < below);

/**
 * Repair malformed fields in place; protect the stored document when anything was wrong. A missing field (a bag from
 * an older build, or none at all) takes its default without protecting. A bag from step table 1 keeps its progress:
 * its step moves to the nearest table-2 step and its demonstrations to the matching bits (never a reset).
 */
export function sanitizeStallData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const oldTable = !('table' in bag) && 'step' in bag;
  const checks: Record<string, (v: unknown) => boolean> = {
    tier: v => range(v, 2), qualifyingRounds: count, rounds: count, step: v => range(v, TOP_STEP) && (v as number) >= 1,
    quietRounds: count, learn: v => bits(v, LEARN_WINDOW), demos: v => range(v, (1 << (TOP_STEP + 1)) - 1), turn: v => range(v, CUSTOMER_COUNT - 1),
    table: v => v === STEP_TABLE,
  };
  for (const [key, valid] of Object.entries(checks)) {
    if (key === 'table' && oldTable) continue;
    if (!(key in bag)) { bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  if (oldTable) migrateTable1(bag);
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

/** Move a step-table-1 bag to table 2: nearest step, matching demonstration bits, a fresh evidence window. */
function migrateTable1(bag: Record<string, unknown>): void {
  const step = bag.step as number, demos = bag.demos as number;
  bag.step = OLD_STEP[step] ?? 1;
  let out = 0;
  for (let bit = 1; bit <= TOP_STEP; bit++) { const from = OLD_DEMO[bit]!; if (from >= 0 && (demos & (1 << from)) !== 0) out |= 1 << bit; }
  bag.demos = out;
  // Evidence and quiet rounds were gathered at the old steps' content.
  bag.learn = []; bag.quietRounds = 0; bag.table = STEP_TABLE;
}
