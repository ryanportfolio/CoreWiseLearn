import type { GameDefinition } from '../../engine/registry';
import { createChopHopScene } from './scene';

export const chopHop: GameDefinition = {
  id: 'chop-hop',
  title: 'Chop Hop',
  icon: 'tiles/chop-hop.webp',
  themes: ['motor', 'numbers'],
  validateSave: (bag, protect) => {
    if (bag.save != null && (typeof bag.save !== 'object' || Array.isArray(bag.save))) protect();
  },
  createScene: createChopHopScene,
};
