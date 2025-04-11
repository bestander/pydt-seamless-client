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
  gameTurnRangeKey: number;
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
    console.log(`Request method: ${options.method || 'GET'}`);
    console.log(`Skip auth: ${skipAuth}`);
    console.log(`Headers: ${JSON.stringify(headers)}`);

    try {
      console.log(`Sending fetch request to ${url}`);
      const response = await fetch(url, {
        ...options,
        headers,
      });

      console.log(`Response status for ${url}: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: 'Could not parse error response' };
        }
        console.error(`API error for ${url}:`, errorData);
        throw new Error(`API request failed: ${response.status} ${response.statusText} ${JSON.stringify(errorData)}`);
      }

      console.log(`Parsing JSON response from ${url}`);
      let data;
      try {
        data = await response.json();
        console.log(`API response data for ${url}:`, data);
      } catch (e: any) {
        console.error(`Error parsing JSON response from ${url}:`, e);
        throw new Error(`Failed to parse JSON response: ${e.message}`);
      }
      
      return data;
    } catch (error: any) {
      console.error(`Request error for ${url}:`, error);
      console.error(`Error details: ${error.message || 'Unknown error'}`);
      console.error(`Error stack: ${error.stack || 'No stack trace'}`);
      
      // Check if it's a network error
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('Network error detected. This might be due to connectivity issues or CORS restrictions.');
      }
      
      // Add more context to the error
      const enhancedError = new Error(`API request failed for ${url}: ${error.message || 'Unknown error'}`);
      enhancedError.stack = error.stack;
      (enhancedError as any).originalError = error;
      
      throw enhancedError;
    }
  }

  async getUserData(): Promise<any> {
    return this.request('/user/getCurrent');
  }

  async getGames(): Promise<PYDTGame[]> {
    console.log('Fetching games from API');
    try {
      console.log('Making request to /user/games');
      const response = await this.request<{ data: PYDTGame[], pollUrl?: string }>('/user/games');
      console.log('Raw response from /user/games:', response);
      
      if (!response) {
        console.error('Empty response from /user/games');
        throw new Error('Empty response from /user/games');
      }
      
      if (response.pollUrl) {
        console.log(`Received poll URL: ${response.pollUrl}`);
        this.pollUrl = response.pollUrl;
      } else {
        console.log('No poll URL received in response');
      }
      
      if (!response.data) {
        console.error('No data property in response:', response);
        throw new Error('No data property in response from /user/games');
      }
      
      console.log(`Received ${Array.isArray(response.data) ? response.data.length : 'non-array'} games`);
      return response.data;
    } catch (error: any) {
      console.error('Error in getGames:', error);
      console.error(`Error details: ${error.message || 'Unknown error'}`);
      console.error(`Error stack: ${error.stack || 'No stack trace'}`);
      
      // Try to get more information about the error
      if (error.originalError) {
        console.error('Original error:', error.originalError);
      }
      
      // Return an empty array instead of throwing to prevent the app from crashing
      console.log('Returning empty array due to error in getGames');
      return [];
    }
  }

  async getSteamProfiles(steamIds: string[]): Promise<SteamProfile[]> {
    const response = await this.request<SteamProfile[]>(`/user/steamProfiles?steamIds=${steamIds.join(',')}`);
    return response;
  }

  async pollGames(): Promise<PYDTGame[]> {
    if (!this.pollUrl) {
      console.error('No poll URL available for polling games');
      throw new Error('No poll URL available');
    }
    
    console.log(`Polling games using URL: ${this.pollUrl}`);
    
    try {
      const response = await this.request<PYDTGame[]>(this.pollUrl, {}, true);
      console.log(`Successfully polled games, received ${Array.isArray(response) ? response.length : 'non-array'} games`);
      return response;
    } catch (error) {
      console.error(`Error in pollGames for URL ${this.pollUrl}:`, error);
      // If the poll URL is no longer valid, reset it
      console.log('Resetting poll URL due to error');
      this.pollUrl = null;
      throw error;
    }
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

  hasPollUrl(): boolean {
    return this.pollUrl !== null;
  }
}

export const pydtApi = new PYDTApi(); 