import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { createLetterTrainScene, GAME_ID } from './scene';

export const letterTrain: GameDefinition = {
  id: GAME_ID,
  title: 'Letter Train',
  icon: 'letter-train/icon.webp',
  themes: ['letters', 'words'],
  mode: 'round',
  learning: ['letters'],
  createScene: (services) => createLetterTrainScene(services as unknown as AppServices),
};
