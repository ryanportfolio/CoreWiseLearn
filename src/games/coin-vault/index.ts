import type { AppServices } from '../../app/services';
import type { GameDefinition } from '../../engine/registry';
import { sanitizeVaultData } from './data';
import { createCoinVaultScene, GAME_ID } from './scene';

export const coinVault: GameDefinition = {
  id: GAME_ID,
  title: 'Coin Vault',
  icon: 'coin-vault/tile.webp',
  themes: ['money', 'counting', 'animals'],
  mode: 'round',
  learning: ['counting'],
  validateSave: (bag, protect) => sanitizeVaultData(bag, protect),
  createScene: (services) => createCoinVaultScene(services as unknown as AppServices),
};
