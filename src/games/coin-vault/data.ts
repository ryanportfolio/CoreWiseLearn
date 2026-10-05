/** Coin Vault save bag: motor tier, learning step with its evidence, first-time demonstrations, and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';

export const GAME_ID = 'coin-vault';
/** Highest learning step in the design (docs/games/coin-vault.md). Saves keep any step up to it. */
export const TOP_STEP = 8;
/** Highest step whose content is built (all eight). */
export const BUILT_STEP = 8;

export interface PendingRound {
  /** Names this round across tabs, so two rounds with the same fields stay apart. */
  id: string;
  stars: number; tasks: number; choices: string[]; chosen: string;
  rewardEnabled: boolean; restEntered: boolean; tier: Tier; visitorOffset: number;
}

export interface VaultData extends Record<string, unknown> {
  /** Motor tier: coin and place size, snap distance, coins per collection, tasks per round. */
  tier: number;
  qualifyingRounds: number;
  rounds: number;
  /** Learning step, 1 to TOP_STEP. */
  step: number;
  /** Finished rounds in a row at steps 1 and 2 with no counted task (keys only). */
  quietRounds: number;
  /** Recent counted tasks at the current step, 1 = right. */
  learn: number[];
  /** Steps whose first-time demonstration this profile has seen, one bit per step (bit n = step n). */
  demos: number;
  pending: PendingRound | null;
}

export const LEARN_WINDOW = 8;

export const defaultData = (): VaultData => ({
  tier: 0, qualifyingRounds: 0, rounds: 0, step: 1, quietRounds: 0, learn: [], demos: 0, pending: null,
});

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const bits = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => n === 0 || n === 1);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Repair malformed fields in place; protect the stored document when anything was wrong. A missing field (a bag from
 * an older build, or none at all) takes its default without protecting. Unknown fields are kept.
 */
export function sanitizeVaultData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const checks: Record<string, (v: unknown) => boolean> = {
    tier: v => range(v, 2), qualifyingRounds: count, rounds: count, step: v => range(v, TOP_STEP) && (v as number) >= 1,
    quietRounds: count, learn: v => bits(v, LEARN_WINDOW), demos: v => range(v, 511),
  };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in bag)) { bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!record(p) || typeof p.id !== 'string' || !range(p.stars, 3) || p.stars < 1 || !count(p.tasks) || !range(p.tier, 2) || !range(p.visitorOffset, 5) ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean') {
    protect(); bag.pending = null;
  }
}
