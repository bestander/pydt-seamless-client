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
  getUrl: string;
  putUrl: string;
}

interface TurnSubmitResponse {
  putUrl: string;
}

interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export class PYDTApi {
  private baseUrl: string;
  private logger: Logger;

  constructor(baseUrl: string, logger: Logger) {
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  async getUserData(token: string): Promise<any> {
    this.logger.log(`Making request to ${this.baseUrl}/user/getCurrent`);
    const response = await fetch(`${this.baseUrl}/user/getCurrent`, {
      method: 'GET',
      headers: {
        'Authorization': `${token}`
      }
    });
    this.logger.log(`Response status for ${this.baseUrl}/user/getCurrent: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`Failed to get user data: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getGames(token: string): Promise<{data: PYDTGame[], pollUrl: string}> {
    this.logger.log(`Making request to ${this.baseUrl}/user/games`);
    const response = await fetch(`${this.baseUrl}/user/games`, {
      method: 'GET',
      headers: {
        'Authorization': `${token}`
      }
    });
    this.logger.log(`Response status for ${this.baseUrl}/user/games: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`Failed to get games: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data || !data.data) {
      this.logger.error('Invalid response format from /user/games');
      return {data: [], pollUrl: ''};
    }
    return data;
  }

  async getSteamProfiles(token: string, steamIds: string[]): Promise<SteamProfile[]> {
    this.logger.log(`Fetching Steam profiles for ${steamIds.length} IDs`);
    const response = await fetch(`${this.baseUrl}/user/steamProfiles?steamIds=${steamIds.join(',')}`, {
      headers: {
        'Authorization': token
      }
    });
    
    if (!response.ok) {
      this.logger.error(`Failed to fetch Steam profiles: ${response.status} ${response.statusText}`);
      return [];
    }
    
    return response.json();
  }

  async getTurnUrl(token: string, gameId: string): Promise<{downloadUrl: string}> {
    this.logger.log(`Making request to ${this.baseUrl}/game/${gameId}/turn`);
    const response = await fetch(`${this.baseUrl}/game/${gameId}/turn?compressed=yup`, {
      method: 'GET',
      headers: {
        'Authorization': `${token}`
      }
    });
    this.logger.log(`Response status for ${this.baseUrl}/game/${gameId}/turn: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`Failed to get turn URL: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async startTurnSubmit(token: string, gameId: string): Promise<TurnSubmitResponse> {
    this.logger.log(`Making request to ${this.baseUrl}/game/${gameId}/turn/startSubmit`);
    const response = await fetch(`${this.baseUrl}/game/${gameId}/turn/startSubmit`, {
      method: 'POST',
      headers: {
        'Authorization': `${token}`
      }
    });
    this.logger.log(`Response status for ${this.baseUrl}/game/${gameId}/turn/startSubmit: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`Failed to start turn submit: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async finishTurnSubmit(token: string, gameId: string): Promise<PYDTGame> {
    this.logger.log(`Making request to ${this.baseUrl}/game/${gameId}/turn/finishSubmit`);
    const response = await fetch(`${this.baseUrl}/game/${gameId}/turn/finishSubmit`, {
      method: 'POST',
      headers: {
        'Authorization': `${token}`
      }
    });
    this.logger.log(`Response status for ${this.baseUrl}/game/${gameId}/turn/finishSubmit: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`Failed to finish turn submit: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async submitTurn(token: string, gameId: string, turnData: any): Promise<any> {
    this.logger.log(`Making request to ${this.baseUrl}/game/submitTurn`);
    const response = await fetch(`${this.baseUrl}/game/submitTurn`, {
      method: 'POST',
      headers: {
        'Authorization': `${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        gameId,
        ...turnData
      })
    });
    this.logger.log(`Response status for ${this.baseUrl}/game/submitTurn: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`Failed to submit turn: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

export const pydtApi = new PYDTApi(PYDT_API_BASE_URL, console); 