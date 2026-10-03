import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { createLetterTrainScene } from './scene';
import { GAME_ID, sanitizeLetterTrainData } from './save';

export const letterTrain: GameDefinition = {
  id: GAME_ID,
  title: 'Letter Train',
  icon: 'letter-train/icon.webp',
  themes: ['letters', 'words'],
  mode: 'round',
  learning: ['letters'],
  validateSave: (bag, protect) => sanitizeLetterTrainData(bag, protect),
  createScene: (services) => createLetterTrainScene(services as unknown as AppServices),
};
