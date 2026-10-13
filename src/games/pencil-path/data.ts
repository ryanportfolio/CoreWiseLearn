/** Pencil Path's save bag and its validator. Cheap code: the definition imports it at startup. */
export const GAME_ID = 'pencil-path';
export const PAGE_COUNT = 12;

export interface PencilPathData extends Record<string, unknown> {
  /** The page the child plays next (0-based); a finished page moves it on, and after the last it starts again. */
  page: number;
  /** Most stars won on each page, 0 for a page not finished yet. */
  best: number[];
  /** Pages finished, all time. */
  rounds: number;
}

export const defaultData = (): PencilPathData => ({ page: 0, best: [], rounds: 0 });

const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Replaces each invalid value with a safe one and calls protect() when it does; fills missing fields silently. */
export function sanitizePencilPathData(bag: Record<string, unknown>, protect: () => void): void {
  if (!('page' in bag)) bag.page = 0;
  else if (!count(bag.page) || bag.page >= PAGE_COUNT) { protect(); bag.page = 0; }
  if (!('best' in bag)) bag.best = [];
  else if (!Array.isArray(bag.best) || bag.best.length > PAGE_COUNT || !bag.best.every(s => count(s) && s <= 3)) {
    protect();
    bag.best = Array.isArray(bag.best) ? bag.best.slice(0, PAGE_COUNT).map(s => (count(s) && s <= 3 ? s : 0)) : [];
  }
  if (!('rounds' in bag)) bag.rounds = 0;
  else if (!count(bag.rounds)) { protect(); bag.rounds = 0; }
}
