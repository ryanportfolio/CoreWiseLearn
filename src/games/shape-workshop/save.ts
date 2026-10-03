/** Per-profile save bag for Shape Workshop, validated on entry. */

import { PICTURE_IDS, PICTURES } from './pictures';
import { SHAPES } from './paper';

export const SHEET_COUNT = 6;
/** Numbers per stamp: shape, colour, x, y (0..1000 of the sheet), size (1000ths of sheet width), turn (degrees). */
export const STAMP_STRIDE = 6;
export const MAX_STAMPS = 160;

export interface Wip { open: number[]; placed: number[] }

export interface WorkshopData extends Record<string, unknown> {
  tier: number; motorStreak: number;
  level: number; learnStreak: number;
  demo: boolean; freeDemo: boolean;
  made: Record<string, number>;
  currentId: string;
  wip: Record<string, Wip>;
  sheets: number[][];
  lastSheet: number;
  /** Per shape: [first-try hits, wrong-outline misses]. */
  evidence: Record<string, number[]>;
}

export function defaults(): WorkshopData {
  return {
    tier: 0, motorStreak: 0, level: 0, learnStreak: 0, demo: false, freeDemo: false,
    made: {}, currentId: '', wip: {}, sheets: [], lastSheet: 0, evidence: {},
  };
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const range = (v: unknown, max: number): v is number => count(v) && v <= max;

function validWip(id: string, w: unknown): w is Wip {
  const pic = PICTURES.find(p => p.id === id);
  if (!pic || !record(w) || !Array.isArray(w.open) || !Array.isArray(w.placed)) return false;
  const n = pic.parts.length;
  const open = w.open as unknown[];
  return open.length > 0 && open.every(i => range(i, n - 1)) && new Set(open).size === open.length &&
    w.placed.every(i => open.includes(i)) && new Set(w.placed).size === w.placed.length && w.placed.length < w.open.length;
}

function validSheet(s: unknown): s is number[] {
  if (!Array.isArray(s) || s.length % STAMP_STRIDE !== 0 || s.length > MAX_STAMPS * STAMP_STRIDE) return false;
  for (let i = 0; i < s.length; i += STAMP_STRIDE) {
    if (!range(s[i], SHAPES.length - 1) || !range(s[i + 1], 6) || !range(s[i + 2], 1000) || !range(s[i + 3], 1000) ||
      !range(s[i + 4], 400) || !Number.isSafeInteger(s[i + 5]) || Math.abs(s[i + 5] as number) > 360) return false;
  }
  return true;
}

/** Repair malformed fields in place; any repair also protects the stored document. */
export function sanitize(bag: Record<string, unknown>, protect: () => void): void {
  const fresh = defaults();
  const fix = (key: keyof WorkshopData): void => { protect(); bag[key] = fresh[key]; };
  for (const key of Object.keys(fresh) as (keyof WorkshopData)[]) if (!(key in bag)) bag[key] = fresh[key];
  if (!range(bag.tier, 2)) fix('tier');
  if (!range(bag.level, 2)) fix('level');
  if (!count(bag.motorStreak)) fix('motorStreak');
  if (!count(bag.learnStreak)) fix('learnStreak');
  if (typeof bag.demo !== 'boolean') fix('demo');
  if (typeof bag.freeDemo !== 'boolean') fix('freeDemo');
  if (!record(bag.made) || !Object.entries(bag.made).every(([k, v]) => (PICTURE_IDS as readonly string[]).includes(k) && count(v))) fix('made');
  if (typeof bag.currentId !== 'string' || (bag.currentId !== '' && !(PICTURE_IDS as readonly string[]).includes(bag.currentId))) fix('currentId');
  if (!record(bag.wip) || !Object.entries(bag.wip).every(([k, v]) => validWip(k, v))) fix('wip');
  if (!Array.isArray(bag.sheets) || bag.sheets.length > SHEET_COUNT || !bag.sheets.every(validSheet)) fix('sheets');
  if (!range(bag.lastSheet, SHEET_COUNT - 1)) fix('lastSheet');
  if (!record(bag.evidence) || !Object.entries(bag.evidence).every(([k, v]) => (SHAPES as readonly string[]).includes(k) && Array.isArray(v) && v.length === 2 && v.every(count))) fix('evidence');
  const sheets = bag.sheets as number[][];
  while (sheets.length < SHEET_COUNT) sheets.push([]);
}
