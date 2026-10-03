import type { GameDefinition } from '../../engine/registry';
import { createShapeWorkshopScene, GAME_ID } from './scene';

export const shapeWorkshop: GameDefinition = {
  id: GAME_ID,
  title: 'Shape Workshop',
  icon: 'shape-workshop/icon.webp',
  themes: ['shapes', 'creative', 'workshop'],
  mode: 'creative',
  learning: ['shapes'],
  createScene: services => createShapeWorkshopScene(services),
};
