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
  pollUrl?: string;
  round: number;
}

export interface SteamProfile {
  avatar: string;
  avatarfull: string;
  avatarmedium: string;
  personaname: string;
  profileurl: string;
  steamid: string;
  timezone: string;
  vacationMode: boolean;
}

export interface TurnInfo {
  downloadUrl: string;
  size: number;
  version: string;
}

interface TurnSubmitResponse {
  putUrl: string;
}

export class PYDTApi {
  private token: string | null = null;
  private baseUrl = 'https://api.playyourdamnturn.com';
  private pollUrl: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, skipAuth: boolean = false): Promise<T> {
    if (!this.token && !skipAuth) {
      throw new Error('No token set');
    }

    const headers = skipAuth
      ? { 'Content-Type': 'application/json' }
      : {
          'Authorization': this.token!,
          'Content-Type': 'application/json',
          ...options.headers,
        };

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    console.log(`Making API request to ${url}`);
    console.log('Headers:', headers);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    console.log('Response status:', response.status, response.statusText);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('API error:', error);
      throw new Error(`API request failed: ${response.status} ${response.statusText} ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    console.log('API response data:', data);
    return data;
  }

  async getUserData(): Promise<any> {
    return this.request('/user/getCurrent');
  }

  async getGames(): Promise<PYDTGame[]> {
    const response = await this.request<{ data: PYDTGame[], pollUrl?: string }>('/user/games');
    if (response.pollUrl) {
      this.pollUrl = response.pollUrl;
    }
    return response.data;
  }

  async getSteamProfiles(steamIds: string[]): Promise<SteamProfile[]> {
    const response = await this.request<SteamProfile[]>(`/user/steamProfiles?steamIds=${steamIds.join(',')}`);
    return response;
  }

  async pollGames(): Promise<PYDTGame[]> {
    if (!this.pollUrl) {
      throw new Error('No poll URL available');
    }
    const response = await this.request<PYDTGame[]>(this.pollUrl, {}, true);
    return response;
  }

  async getTurnUrl(gameId: string): Promise<TurnInfo> {
    return this.request<TurnInfo>(`/game/${gameId}/turn?compressed=yup`);
  }

  async startTurnSubmit(gameId: string): Promise<TurnSubmitResponse> {
    return this.request(`/game/${gameId}/turn/startSubmit`, {
      method: 'POST'
    });
  }

  async finishTurnSubmit(gameId: string): Promise<PYDTGame> {
    return this.request(`/game/${gameId}/turn/finishSubmit`, {
      method: 'POST'
    });
  }
}

export const pydtApi = new PYDTApi(); 