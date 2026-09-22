import { getStore } from './account';

export function clearCivaSession(): void {
  const store = getStore();
  store.set('civaSessionToken', null);
  store.set('syncTurnsToCiva', false);
}

export function getCivaSessionToken(): string | null {
  const token = getStore().get('civaSessionToken');
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}
