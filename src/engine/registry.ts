/**
 * Game registry. Each game in src/games/<id>/ exports a GameDefinition and is
 * listed here so the hub menu can show it and launch it.
 */

import type { Scene } from './scene';
import { registerSaveValidator, type AppServices, type SaveBagValidator } from '../app/services';
import { bubblePop } from '../games/bubble-pop';

/** Everything a game may need from the hub, handed in when its scene is created. */
export type GameServices = AppServices;

export interface GameDefinition {
  /** Stable id used for save data and URLs. Lowercase, no spaces. */
  id: string;
  /** Adult-facing title (players cannot read; the hub shows the icon). */
  title: string;
  /** Icon image path under public/art/ (resolved with services.art()); a path starting with `art/` or `/` is used as given. */
  icon: string;
  /** Free-form tags such as "numbers", "letters", "colours", "motor". */
  themes: string[];
  /** Round games award on completion; creative games save when the child leaves. */
  mode?: 'round' | 'creative';
  /** Content practice is tracked separately from pointer or keyboard control. */
  learning?: readonly ('letters' | 'sounds' | 'words' | 'counting' | 'shapes' | 'colors')[];
  /** Optional future bundle loader. Failure is recovered once at a safe hub boundary. */
  load?: () => Promise<void>;
  /**
   * Optional check for this game's saved bag. bootApp registers it before the
   * save loads, so a malformed bag is caught before any write, even if the game is never opened.
   * Keep it in cheap code: this definition is imported at startup.
   */
  validateSave?: SaveBagValidator;
  /** Build a fresh scene for a play session. */
  createScene(services: GameServices): Scene;
}

const games: GameDefinition[] = [
  bubblePop,
  // Add games here in hub order. See docs/adding-a-game.md.
];

export function allGames(): readonly GameDefinition[] {
  return games;
}

export function findGame(id: string): GameDefinition | undefined {
  return games.find((g) => g.id === id);
}

/** Register every listed game's save validator. bootApp calls this before creating the save store. */
export function registerSaveValidators(): void {
  for (const game of games) if (game.validateSave) registerSaveValidator(game.id, game.validateSave);
}

export function gamesWithTheme(theme: string): GameDefinition[] {
  return games.filter((g) => g.themes.includes(theme));
}
