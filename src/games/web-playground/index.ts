import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { sanitizeData } from './content';
import { createWebPlaygroundScene, GAME_ID } from './scene';

export const webPlayground: GameDefinition = {
  id: GAME_ID,
  title: 'Web Playground',
  icon: 'web-playground/tile.webp',
  themes: ['numbers', 'letters', 'city'],
  mode: 'round',
  learning: ['counting', 'letters'],
  validateSave: (bag, protect) => sanitizeData(bag, protect),
  createScene: (services) => createWebPlaygroundScene(services as unknown as AppServices),
};
