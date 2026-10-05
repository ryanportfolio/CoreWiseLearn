import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { sanitizeFrogPondData } from './data';
import { createFrogPondScene, GAME_ID } from './scene';

export const frogPond: GameDefinition = {
  id: GAME_ID,
  title: 'Frog Pond',
  icon: 'frog-pond/tile.webp',
  themes: ['words', 'reading', 'animals'],
  mode: 'round',
  learning: ['words', 'sounds'],
  validateSave: (bag, protect) => sanitizeFrogPondData(bag, protect),
  createScene: (services) => createFrogPondScene(services as unknown as AppServices),
};
