import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { GAME_ID, sanitizePiggyData } from './data';
import { createPiggyParadeScene } from './scene';

export const piggyParade: GameDefinition = {
  id: GAME_ID,
  title: 'Piggy Parade',
  icon: 'piggy-parade/tile.webp',
  themes: ['money', 'coins', 'farm'],
  mode: 'round',
  validateSave: (bag, protect) => sanitizePiggyData(bag, protect),
  createScene: (services) => createPiggyParadeScene(services as unknown as AppServices),
};
