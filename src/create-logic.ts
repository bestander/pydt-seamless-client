import { CivaAuthError } from './civa-api';
import type { CivaPin, CivaPlayer, Inspection, PinOption } from './civa-types';
import type { BuildResult } from './importer';

export type SeatRole = 'account' | 'open' | 'ai';

export interface SeatDraft {
  index: number;
  civilization: string;
  leader: string;
  playerName?: string;
  /** The pre-matched civa account: the player search's exact-name hit, else inspect's suggestedAccount. */
  match: CivaPlayer | null;
  matchedBy: 'search' | 'suggestion' | null;
}

/** What the window starts with. */
export interface CreateDraft {
  gameName: string;
  owner: CivaPlayer;
  seats: SeatDraft[];
  rulesets: PinOption[];
  defaultPin: CivaPin;
  warnings: string[];
}

export interface CreateChoice {
  pin: CivaPin;
  mode: 'mirror' | 'playable';
  seats: Array<{ index: number; role: SeatRole; accountId: string | null }>;
}

/** The default ruleset: the featured `classic` when inspect says the state loads under it, else the first that loads. */
export function defaultPinOf(rulesets: PinOption[]): CivaPin {
  const featuredClassic = rulesets.find(r => r.ok && 'featured' in r.pin && r.pin.featured === 'classic');
  return (featuredClassic ?? rulesets.find(r => r.ok) ?? rulesets[0])?.pin ?? { featured: 'classic' };
}

/**
 * Pre-match each seat to a civa account by the saved player name: the player search first (an exact,
 * case-insensitive name), inspect's `suggestedAccount` as the fallback. A search that fails is not fatal.
 */
export async function prematchSeats(
  inspection: Inspection,
  seats: BuildResult['seats'],
  search: (name: string) => Promise<CivaPlayer[]>,
): Promise<SeatDraft[]> {
  return Promise.all(seats.map(async (seat): Promise<SeatDraft> => {
    const suggestion = inspection.seats.find(s => s.index === seat.index)?.suggestedAccount ?? null;
    let found: CivaPlayer | null = null;
    if (seat.playerName && seat.playerName.trim().length >= 2) {
      try {
        const hits = await search(seat.playerName.trim());
        found = hits.find(h => h.name.toLowerCase() === seat.playerName!.trim().toLowerCase()) ?? null;
      } catch (error) {
        if (error instanceof CivaAuthError) throw error;
      }
    }
    const match = found ?? suggestion;
    return {
      index: seat.index,
      civilization: seat.civilizationName,
      leader: seat.leaderName,
      ...(seat.playerName ? { playerName: seat.playerName } : {}),
      match,
      matchedBy: found ? 'search' : suggestion ? 'suggestion' : null,
    };
  }));
}

/** Check the window's choices before anything is sent. Returns a message, or undefined when they are fine. */
export function validateChoice(choice: CreateChoice, owner: CivaPlayer): string | undefined {
  const held = choice.seats.filter(s => s.role === 'account');
  if (held.some(s => !s.accountId)) return 'Pick a Civa account for every seat set to "Account", or set it to Open or AI.';
  const ids = held.map(s => s.accountId);
  if (new Set(ids).size !== ids.length) return 'A Civa account can hold only one seat.';
  if (!ids.includes(owner.id)) return `You (${owner.name}) must hold one of the seats: match one seat to your own Civa account.`;
  return undefined;
}

export function toCreateRequest(choice: CreateChoice, envelope: unknown, gameName: string) {
  const seatMap: Record<string, string | null> = {};
  const aiSeats: number[] = [];
  for (const s of choice.seats) {
    seatMap[String(s.index)] = s.role === 'account' ? s.accountId : null;
    if (s.role === 'ai') aiSeats.push(s.index);
  }
  return { envelope, mode: choice.mode, ruleset: choice.pin, seatMap, aiSeats: choice.mode === 'playable' ? aiSeats : [], gameName };
}
