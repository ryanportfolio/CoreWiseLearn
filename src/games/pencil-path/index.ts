import type { GameDefinition } from '../../engine/registry';
import { GAME_ID, sanitizePencilPathData } from './data';
import { createPencilPathScene } from './scene';

export const pencilPath: GameDefinition = {
  id: GAME_ID,
  title: 'Pencil Path',
  icon: 'pencil-path/tile.webp',
  themes: ['motor', 'drawing'],
  mode: 'round',
  validateSave: (bag, protect) => sanitizePencilPathData(bag, protect),
  createScene: createPencilPathScene,
};
