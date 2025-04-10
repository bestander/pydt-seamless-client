import axios from 'axios';

const PYDT_API_BASE_URL = 'https://api.playyourdamnturn.com';

export interface PYDTUser {
  displayName: string;
  turnsPlayed: number;
  steamProfileUrl: string;
  steamId: string;
  avatarFull: string;
  avatarMedium: string;
  vacationMode: boolean;
  lastTurnEndDate: string;
  dayOfWeekQueue: string;
  timeTaken: number;
  turnLengthBuckets: { [key: string]: number };
  statsByGameType: any[];
}

export interface PYDTGame {
  gameId: string;
  displayName: string;
  inProgress: boolean;
  completed: boolean;
  players: {
    steamId: string;
    displayName: string;
  }[];
  currentPlayerSteamId: string;
  lastTurnEndDate: string;
  createdAt: string;
  updatedAt: string;
  gameType: string;
  gameSpeed: string;
  mapSize: string;
  mapFile: string;
  version: number;
  turnsPlayed: number;
  fastTurns: number;
  slowTurns: number;
  turnsSkipped: number;
  slots: number;
  humans: number;
}

export class PYDTApi {
  private token: string | null = null;
  private baseUrl = 'https://api.playyourdamnturn.com';

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new Error('No token set');
    }

    const headers = {
      'Authorization': this.token,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    console.log(`Making API request to ${this.baseUrl}${endpoint}`);
    console.log('Headers:', headers);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    console.log('Response status:', response.status, response.statusText);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('API error:', error);
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('API response data:', data);
    return data;
  }

  async getUserData(): Promise<any> {
    return this.request('/user');
  }

  async getGames(): Promise<PYDTGame[]> {
    const response = await this.request<{ data: PYDTGame[] }>('/user/games');
    return response.data;
  }
}

export const pydtApi = new PYDTApi(); 