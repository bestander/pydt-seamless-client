import { getStore } from './account';

/**
 * The civa user API token (`civa_user_…`), minted on civa's account page and pasted once. It lives in
 * electron-store and goes out only as an `Authorization: Bearer` header; it is never logged.
 */
export function getCivaApiToken(): string | null {
  const token = getStore().get('civaApiToken');
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

export function setCivaApiToken(token: string): void {
  getStore().set('civaApiToken', token.trim());
}

export function clearCivaToken(): void {
  const store = getStore();
  store.set('civaApiToken', null);
  store.set('syncTurnsToCiva', false);
}

/** The pre-1.5 session cookie is no longer used; drop it so an old value does not linger on disk. */
export function dropLegacyCivaSession(): void {
  const store = getStore() as unknown as { has(key: string): boolean; delete(key: string): void };
  if (store.has('civaSessionToken')) store.delete('civaSessionToken');
}
