import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { createDinoPicnicScene, GAME_ID } from './scene';

export const dinoPicnic: GameDefinition = {
  id: GAME_ID,
  title: 'Dino Picnic',
  icon: 'dino-picnic/tile.webp',
  themes: ['numbers', 'counting', 'dinosaurs'],
  mode: 'round',
  learning: ['counting'],
  createScene: (services) => createDinoPicnicScene(services as unknown as AppServices),
};
