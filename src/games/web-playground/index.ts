import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { createWebPlaygroundScene, GAME_ID } from './scene';

export const webPlayground: GameDefinition = {
  id: GAME_ID,
  title: 'Web Playground',
  icon: 'web-playground/tile.webp',
  themes: ['numbers', 'letters', 'city'],
  mode: 'round',
  learning: ['counting', 'letters'],
  createScene: (services) => createWebPlaygroundScene(services as unknown as AppServices),
};
