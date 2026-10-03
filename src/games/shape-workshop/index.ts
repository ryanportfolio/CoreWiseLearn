import type { GameDefinition } from '../../engine/registry';
import { createShapeWorkshopScene, GAME_ID } from './scene';
import { sanitize } from './save';

export const shapeWorkshop: GameDefinition = {
  id: GAME_ID,
  title: 'Shape Workshop',
  icon: 'shape-workshop/icon.webp',
  themes: ['shapes', 'creative', 'workshop'],
  mode: 'creative',
  learning: ['shapes'],
  validateSave: (bag, protect) => sanitize(bag, protect),
  createScene: services => createShapeWorkshopScene(services),
};
