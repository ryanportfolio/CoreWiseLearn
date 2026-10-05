import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { sanitizeRideData } from './data';
import { createRideFareScene, GAME_ID } from './scene';

export const rideFare: GameDefinition = {
  id: GAME_ID,
  title: 'Ride Fare',
  icon: 'ride-fare/tile.webp',
  themes: ['money', 'counting', 'animals'],
  mode: 'round',
  learning: ['counting'],
  validateSave: (bag, protect) => sanitizeRideData(bag, protect),
  createScene: (services) => createRideFareScene(services as unknown as AppServices),
};
