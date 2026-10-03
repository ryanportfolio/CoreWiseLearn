/**
 * Letter Train's save-bag check. Kept apart from the scene so the game definition can register it at startup
 * (validateSave) without the check depending on drawing code.
 */
import { STICKERS } from '../../app/stickers';
import { WORDS } from './content';

export const GAME_ID = 'letter-train';
export const PASSENGERS = ['bunny', 'duckling', 'elephant', 'hippo', 'mouse', 'lamb'] as const;
/** Most cars (and blocks) on one train. */
export const MAX_CARS = 6;
/** Learning attempts kept for the stage decision. */
export const LEARN_WINDOW = 12;

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validate this game's save bag in place; anything malformed falls back and protects the stored document. */
export function sanitizeLetterTrainData(bag: Record<string, unknown>, protect: () => void): void {
  const fix = (key: string, ok: (v: unknown) => boolean, fallback: unknown): void => {
    if (!(key in bag)) { bag[key] = fallback; return; }
    if (!ok(bag[key])) { protect(); bag[key] = fallback; }
  };
  fix('tier', v => v === 0 || v === 1 || v === 2, 0);
  fix('qualifyingRounds', count, 0);
  fix('rounds', count, 0);
  fix('stage', v => v === 0 || v === 1 || v === 2 || v === 3 || v === 4, 0);
  fix('learn', v => Array.isArray(v) && v.length <= LEARN_WINDOW && v.every(n => n === 0 || n === 1), []);
  fix('recentWords', v => Array.isArray(v) && v.length <= WORDS.length && v.every(w => typeof w === 'string'), []);
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  const ids = STICKERS.filter(s => s.game === GAME_ID).map(s => s.id);
  if (!rec(p) || p.stars !== 3 || !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && ids.includes(id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean' || !(p.tier === 0 || p.tier === 1 || p.tier === 2) ||
    !Array.isArray(p.passengers) || p.passengers.length > MAX_CARS || !p.passengers.every(n => count(n) && n < PASSENGERS.length)) {
    protect(); bag.pending = null;
  }
}
