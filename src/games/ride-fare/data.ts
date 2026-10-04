/** Ride Fare save bag: motor tier, learning step with its evidence, and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';

export const GAME_ID = 'ride-fare';
/** Highest learning step in the design (docs/games/ride-fare.md). Saves keep any step up to it. */
export const TOP_STEP = 8;

export interface PendingRound {
  /** Names this round across tabs, so two rounds with the same fields stay apart. */
  id: string;
  stars: number; riders: number; choices: string[]; chosen: string;
  rewardEnabled: boolean; restEntered: boolean; tier: Tier; animalOffset: number;
}

export interface RideData extends Record<string, unknown> {
  /** Motor tier: coins on the tray, coin and fare-box size, snap distance. */
  tier: number;
  qualifyingRounds: number;
  rounds: number;
  /** Learning step, 1 to TOP_STEP. */
  step: number;
  /** Finished rounds at the current step (exposure steps move on after two). */
  stepRounds: number;
  /** Finished rounds in a row at steps 1 and 2 with no counted rider (keys only). */
  quietRounds: number;
  /** Recent counted riders at the current step, 1 = paid exactly. */
  learn: number[];
  pending: PendingRound | null;
}

export const LEARN_WINDOW = 8;

export const defaultData = (): RideData => ({
  tier: 0, qualifyingRounds: 0, rounds: 0, step: 1, stepRounds: 0, quietRounds: 0, learn: [], pending: null,
});

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const bits = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => n === 0 || n === 1);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Repair malformed fields in place; protect the stored document when anything was wrong. A missing field (a bag from
 * an older build, or none at all) takes its default without protecting.
 */
export function sanitizeRideData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const checks: Record<string, (v: unknown) => boolean> = {
    tier: v => range(v, 2), qualifyingRounds: count, rounds: count, step: v => range(v, TOP_STEP) && (v as number) >= 1,
    stepRounds: count, quietRounds: count, learn: v => bits(v, LEARN_WINDOW),
  };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in bag)) { bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!record(p) || typeof p.id !== 'string' || !range(p.stars, 3) || p.stars < 1 || !count(p.riders) || !range(p.tier, 2) || !range(p.animalOffset, 5) ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean') {
    protect(); bag.pending = null;
  }
}
