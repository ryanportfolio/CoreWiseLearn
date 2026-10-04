/** Piggy Parade save bag: motor tier, learning step and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';

export const GAME_ID = 'piggy-parade';
/** Highest learning step the progression can reach (steps above the built ones play the last built step). */
export const MAX_STEP = 8;

export interface PendingRound {
  /** Names this round across tabs, so two rounds with the same fields stay apart. */
  id: string;
  stars: number; coins: number; choices: string[]; chosen: string;
  rewardEnabled: boolean; restEntered: boolean; tier: Tier;
  /** Piggy colours of the finished round in shelf order, so the rest screen shows the same piggies. */
  colors: number[];
}

export interface PiggyData extends Record<string, unknown> {
  /** Motor tier: coins on the tray, coins per round, piggy size and snap distance. */
  tier: number;
  qualifyingRounds: number;
  /** Finished rounds; 0 means the next round is the introduction. */
  rounds: number;
  /** Learning step, 1 to MAX_STEP. */
  step: number;
  /** Rounds played at the current step, review rounds included. */
  stepRounds: number;
  /** Recent deliberate drops at the current step, 1 = the right piggy. */
  learn: number[];
  pending: PendingRound | null;
}

export const defaultData = (): PiggyData => ({ tier: 0, qualifyingRounds: 0, rounds: 0, step: 1, stepRounds: 0, learn: [], pending: null });

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const bits = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => n === 0 || n === 1);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Repair malformed fields in place; protect the stored document when anything was wrong. Missing fields get defaults. */
export function sanitizePiggyData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const checks: Record<string, (v: unknown) => boolean> = {
    tier: v => range(v, 2), qualifyingRounds: count, rounds: count, step: v => range(v, MAX_STEP) && v >= 1,
    stepRounds: count, learn: v => bits(v, 8),
  };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in bag)) { bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!record(p) || typeof p.id !== 'string' || !range(p.stars, 3) || p.stars < 1 || !count(p.coins) || !range(p.tier, 2) ||
    !Array.isArray(p.colors) || p.colors.length > 4 || !p.colors.every(c => range(c, 3)) ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean') {
    protect(); bag.pending = null;
  }
}
