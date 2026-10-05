/** Frog Pond save bag: hidden tier, word help, the last target, and the unresolved round gift. */
import { STICKERS } from '../../app/stickers';
import type { Tier } from '../../engine/difficulty';

export const GAME_ID = 'frog-pond';
/** The activities that exist. Each later activity adds its id here and a spot on the pond. */
export const ACTIVITY_IDS = ['rhyme'] as const;
export type ActivityId = (typeof ACTIVITY_IDS)[number];

export interface PendingRound {
  /** Names this round across tabs, so two rounds with the same fields stay apart. */
  id: string;
  activity: ActivityId;
  stars: number; choices: string[]; chosen: string;
  rewardEnabled: boolean; restEntered: boolean;
  /** The round's target word, so the rest screen shows the same frog pad after a reload. */
  target: string;
}

export interface FrogPondData extends Record<string, unknown> {
  /** Hidden tier: decoy bugs and how fast the bugs fly. */
  tier: number;
  /** Finished rounds, all activities. 0 means the next round is the introduction. */
  rounds: number;
  /** 1 while the bugs say their word when the child points at them (after a long pause or several dodges). */
  assist: number;
  /** The last round's rhyme family (its rime, such as 'AT'), so the next round picks another. */
  lastRime: string;
  pending: PendingRound | null;
}

export const defaultData = (): FrogPondData => ({ tier: 0, rounds: 0, assist: 0, lastRime: '', pending: null });

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const word = (v: unknown): v is string => typeof v === 'string' && v.length <= 12 && /^[A-Za-z]*$/.test(v);

export const toTier = (n: unknown): Tier => (n === 1 ? 1 : n === 2 ? 2 : 0);

/**
 * Repair malformed fields in place; protect the stored document when anything was wrong. A missing field (a bag from
 * an older build, or none at all) takes its default without protecting.
 */
export function sanitizeFrogPondData(bag: Record<string, unknown>, protect: () => void): void {
  const d = defaultData();
  const checks: Record<string, (v: unknown) => boolean> = { tier: v => range(v, 2), rounds: count, assist: v => range(v, 1), lastRime: word };
  for (const [key, valid] of Object.entries(checks)) {
    if (!(key in bag)) { bag[key] = d[key]; continue; }
    if (!valid(bag[key])) { protect(); bag[key] = d[key]; }
  }
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!record(p) || typeof p.id !== 'string' || !ACTIVITY_IDS.includes(p.activity as ActivityId) || !range(p.stars, 3) || p.stars < 1 ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean' || !word(p.target)) {
    protect(); bag.pending = null;
  }
}
