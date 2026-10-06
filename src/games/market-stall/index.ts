import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { sanitizeStallData } from './data';
import { createMarketStallScene, GAME_ID } from './scene';

export const marketStall: GameDefinition = {
  id: GAME_ID,
  title: 'Market Stall',
  icon: 'market-stall/tile.webp',
  themes: ['money', 'counting', 'animals'],
  mode: 'round',
  learning: ['counting'],
  validateSave: (bag, protect) => sanitizeStallData(bag, protect),
  createScene: (services) => createMarketStallScene(services as unknown as AppServices),
};
