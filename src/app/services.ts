/**
 * Everything a scene or game receives from the app. Scenes depend on this
 * shape, never on globals, so each can be booted alone from a dev entry.
 */

import { STICKERS } from './stickers';
import { OCEAN_THEME } from '../games/bubble-pop/theme';
import type { AppConfig, DebugOptions } from './config';
import type { GameCanvas } from '../engine/canvas';
import type { Input } from '../engine/input';
import type { Audio } from '../engine/audio';
import type { SceneManager } from '../engine/scene';
import type { SaveStore, Profile } from '../engine/save';
import type { SpriteStore } from '../engine/sprites';
import type { SessionTimer } from '../engine/session';
import type { GameLoop } from '../engine/loop';

/** Navigation. main.ts fills these in; dev entries may stub them. */
export interface Nav {
  toNameEntry(profileId?: string): void;
  toHub(): void;
  toGame(id: string): void;
  toStickerBook(): void;
}

export interface AppServices {
  config: AppConfig;
  debug: DebugOptions;
  random(): number;
  roundBoundary(): void;
  canvas: GameCanvas;
  input: Input;
  audio: Audio;
  scenes: SceneManager;
  save: SaveStore;
  sprites: SpriteStore;
  session: SessionTimer;
  loop: GameLoop;
  nav: Nav;
  /** Site base for asset URLs, e.g. "/". Always ends with a slash. */
  base: string;
  /** Convenience: `${base}art/<path>` */
  art(path: string): string;
  /** Active profile, or undefined before a name is chosen. */
  profile(): Profile | undefined;
}

/** Sticker and star records shared by the hub, sticker book and every game. */
export interface RewardsBag extends Record<string, unknown> {
  /** Sticker ids earned, in order. Duplicates allowed; the book shows counts. */
  stickers: string[];
  /** Total stars ever earned across games. */
  stars: number;
  /** Rounds completed per game id. */
  rounds: Record<string, number>;
}

export const REWARDS_GAME_ID = '_rewards';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const range = (value: unknown, max: number): value is number => count(value) && value <= max;

/** Validate before any profile operation can persist a malformed nested record. */
export function sanitizeBubbleData(bag: Record<string, unknown>, protect: () => void, creatureCount = OCEAN_THEME.creatures.length): void {
  const defaults = { tier: 0, bestCount: 0, rounds: 0, qualifyingRounds: 0, lastCelebration: -1 };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!(key in bag)) { bag[key] = fallback; continue; }
    const valid = key === 'tier' ? range(bag[key], 2) : key === 'lastCelebration' ? bag[key] === -1 || range(bag[key], 3) : count(bag[key]);
    if (!valid) { protect(); bag[key] = fallback; }
  }
  if (!('pending' in bag)) bag.pending = null;
  const p = bag.pending;
  if (p === null) return;
  if (!record(p) || !count(p.count) || !range(p.stars, 3) || p.stars < 1 || !range(p.tier, 2) || !range(p.variant, 3) ||
    !Array.isArray(p.tally) || p.tally.length > 256 || !p.tally.every(n => range(n, creatureCount - 1)) ||
    !Array.isArray(p.choices) || p.choices.length > 2 || !p.choices.every(id => typeof id === 'string' && STICKERS.some(s => s.game === 'bubble-pop' && s.id === id)) ||
    new Set(p.choices).size !== p.choices.length || typeof p.chosen !== 'string' || (p.chosen !== '' && !p.choices.includes(p.chosen)) ||
    typeof p.rewardEnabled !== 'boolean' || typeof p.restEntered !== 'boolean') {
    protect(); bag.pending = null;
  }
}

export function sanitizeRewardsData(bag: Record<string, unknown>, protect: () => void): void {
  if (!('stickers' in bag)) bag.stickers = [];
  if (!('stars' in bag)) bag.stars = 0;
  if (!('rounds' in bag)) bag.rounds = {};
  for (const key of ['stickers', 'seen']) {
    if (!(key in bag)) continue;
    const ids = bag[key];
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) {
      protect(); bag[key] = Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
    }
  }
  if (!count(bag.stars)) { protect(); bag.stars = 0; }
  if (!record(bag.rounds) || !Object.values(bag.rounds).every(count)) {
    protect(); bag.rounds = record(bag.rounds) ? Object.fromEntries(Object.entries(bag.rounds).filter(([, n]) => count(n))) : {};
  }
  if ('positions' in bag) {
    const positions = bag.positions;
    const validPosition = (p: unknown): boolean => record(p) && typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y);
    if (!record(positions) || !Object.values(positions).every(validPosition)) {
      protect(); bag.positions = record(positions) ? Object.fromEntries(Object.entries(positions).filter(([, p]) => validPosition(p))) : {};
    }
  }
}

/**
 * Checks one game's saved bag. Replace anything invalid with a safe value in
 * place and call `protect()` when you do, so the stored bytes are never overwritten.
 */
export type SaveBagValidator = (bag: Record<string, unknown>, protect: () => void) => void;

const saveValidators = new Map<string, SaveBagValidator>();

/**
 * Register a game's save-bag validator. Call it before the save store is
 * created (bootApp does this for every registry game with `validateSave`).
 * A later call for the same id replaces the earlier validator.
 */
export function registerSaveValidator(gameId: string, validator: SaveBagValidator): void {
  saveValidators.set(gameId, validator);
}

/** Run each registered game's validator, then the rewards check. Bags with no validator are left as they are. */
export function sanitizeSavedGames(games: Record<string, Record<string, unknown>>, protect: () => void): void {
  for (const [gameId, validate] of saveValidators) {
    if (games[gameId]) validate(games[gameId], protect);
  }
  if (games[REWARDS_GAME_ID]) sanitizeRewardsData(games[REWARDS_GAME_ID], protect);
}

export function rewards(services: AppServices): RewardsBag {
  const bag = services.save.gameData<RewardsBag>(REWARDS_GAME_ID, { stickers: [], stars: 0, rounds: {} });
  sanitizeRewardsData(bag, () => services.save.protect());
  return bag;
}
