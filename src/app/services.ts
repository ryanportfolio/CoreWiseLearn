/**
 * Everything a scene or game receives from the app. Scenes depend on this
 * shape, never on globals, so each can be booted alone from a dev entry.
 */

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
  toNameEntry(): void;
  toHub(): void;
  toGame(id: string): void;
  toStickerBook(): void;
}

export interface AppServices {
  canvas: GameCanvas;
  input: Input;
  audio: Audio;
  scenes: SceneManager;
  save: SaveStore;
  sprites: SpriteStore;
  session: SessionTimer;
  loop: GameLoop;
  nav: Nav;
  /** Site base for asset URLs, e.g. "/CoreWiseLearn/". Always ends with a slash. */
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

export function rewards(services: AppServices): RewardsBag {
  return services.save.gameData<RewardsBag>(REWARDS_GAME_ID, { stickers: [], stars: 0, rounds: {} });
}
