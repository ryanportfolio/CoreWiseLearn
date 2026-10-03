/** Dino Picnic save bag: motor tier, learning stage and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';

export const GAME_ID = 'dino-picnic';

export interface PendingRound {
  stars: number; happy: number; orders: number; choices: string[]; chosen: string;
  rewardEnabled: boolean; restEntered: boolean; tier: Tier; dinoOffset: number;
}

export interface PicnicData extends Record<string, unknown> {
  /** Motor tier: plate count and target sizes. */
  tier: number;
  qualifyingRounds: number;
  rounds: number;
  /** Counting stage: 0 = 1 to 3, 1 = 1 to 5, 2 = up to 10 in fives. */
  stage: number;
  /** Recent deliberate plates in the current stage, 1 = filled exactly. */
  learn: number[];
  /** Comparison level: 0 = 1 to 5, 1 = up to 10. */
  compareLevel: number;
  /** Recent deliberate comparisons, 1 = chose the plate with more. */
  compare: number[];
  /** Comparisons shown so far; the first one is demonstrated. */
  comparisons: number;
  pending: PendingRound | null;
}

export const defaultData = (): PicnicData => ({
  tier: 0, qualifyingRounds: 0, rounds: 0, stage: 0, learn: [], compareLevel: 0, compare: [], comparisons: 0, pending: null,
});

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const bits = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => n === 0 || n === 1);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Repair malformed fields in place; protect the stored document when anything was wrong. */
export function sanitizePicnicData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const checks: Record<string, (v: unknown) => boolean> = {
    tier: v => range(v, 2), qualifyingRounds: count, rounds: count, stage: v => range(v, 2),
    learn: v => bits(v, 8), compareLevel: v => range(v, 1), compare: v => bits(v, 5), comparisons: count,
  };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in bag)) { bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!record(p) || !range(p.stars, 3) || p.stars < 1 || !count(p.happy) || !count(p.orders) || !range(p.tier, 2) || !range(p.dinoOffset, 2) ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean') {
    protect(); bag.pending = null;
  }
}
