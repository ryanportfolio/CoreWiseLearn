import { sanitizeBubbleData, type AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { createBubblePopScene, GAME_ID } from './scene';

export const bubblePop: GameDefinition = {
  id: GAME_ID,
  title: 'Bubble Bay',
  icon: 'tiles/ocean-octopus.png',
  themes: ['numbers', 'motor', 'ocean'],
  validateSave: (bag, protect) => sanitizeBubbleData(bag, protect),
  createScene: (services) => createBubblePopScene(services as unknown as AppServices),
};
