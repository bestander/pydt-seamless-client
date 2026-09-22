import * as path from 'path';
import * as os from 'os';

export const POLL_INTERVAL_MS = 60000; // 60 seconds in milliseconds
export const STEAM_PROFILES_CACHE_DURATION = 180 * 60 * 1000; // 180 minutes in milliseconds

/** Civa REST API (override with CIVA_API_URL for local dev). */
export const CIVA_API_BASE_URL = process.env.CIVA_API_URL ?? 'https://civa.us/api';

export function getSaveDirectory(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Sid Meier\'s Civilization VI', 'Sid Meier\'s Civilization VI', 'Saves', 'Hotseat');
  } else if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Documents', 'My Games', 'Sid Meier\'s Civilization VI', 'Saves', 'Hotseat');
  } else {
    throw new Error('Unsupported platform for save directory');
  }
} 