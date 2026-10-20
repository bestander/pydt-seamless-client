import { describe, expect, it } from 'vitest';
import { defaultPinOf, prematchSeats, toCreateRequest, validateChoice } from './create-logic';
import type { Inspection, PinOption } from './civa-types';

const owner = { id: 'acc-owner', name: 'Owner' };
const inspection = (suggested: Record<number, { id: string; name: string }> = {}): Inspection => ({
  issues: [], sourceTurn: 3, currentSeat: 0, mapWidth: 5, mapHeight: 5, warnings: [], rulesets: [],
  seats: [0, 1, 2].map(index => ({ index, civilizationName: 'C', leaderName: 'L', isCurrent: index === 0, ...(suggested[index] ? { suggestedAccount: suggested[index] } : {}) })),
});
const seats = [
  { index: 0, slot: 0, civilization: 'CIVILIZATION_A', leader: 'LEADER_A', civilizationName: 'A', leaderName: 'La', playerName: 'Owner', isHuman: true, isCurrent: true },
  { index: 1, slot: 1, civilization: 'CIVILIZATION_B', leader: 'LEADER_B', civilizationName: 'B', leaderName: 'Lb', playerName: 'bob', isHuman: true, isCurrent: false },
  { index: 2, slot: 2, civilization: 'CIVILIZATION_C', leader: 'LEADER_C', civilizationName: 'C', leaderName: 'Lc', isHuman: false, isCurrent: false },
];

describe('seat pre-matching', () => {
  it('matches by exact name through the player search, falls back to inspect, and leaves the rest open', async () => {
    const search = async (name: string) => name === 'Owner' ? [{ id: 'x', name: 'Ownership' }, owner] : [];
    const drafts = await prematchSeats(inspection({ 1: { id: 'acc-bob', name: 'Bob' } }), seats, search);
    expect(drafts[0]).toMatchObject({ match: owner, matchedBy: 'search' });
    expect(drafts[1]).toMatchObject({ match: { id: 'acc-bob', name: 'Bob' }, matchedBy: 'suggestion' });
    expect(drafts[2]).toMatchObject({ match: null, matchedBy: null });
  });

  it('does not take a prefix hit that is not the same name', async () => {
    const drafts = await prematchSeats(inspection(), seats.slice(0, 1), async () => [{ id: 'x', name: 'Ownership' }]);
    expect(drafts[0]!.match).toBeNull();
  });

  it('carries on when the search fails', async () => {
    const drafts = await prematchSeats(inspection({ 0: owner }), seats.slice(0, 1), async () => { throw new Error('offline'); });
    expect(drafts[0]).toMatchObject({ match: owner, matchedBy: 'suggestion' });
  });
});

describe('the ruleset default', () => {
  const opt = (over: Partial<PinOption>): PinOption => ({ source: 'featured', pin: { featured: 'classic' }, label: 'x', ok: true, ...over });
  it('is the featured classic when it loads, else the first that does', () => {
    expect(defaultPinOf([opt({ pin: { builtin: 'blitz' }, source: 'builtin' }), opt({})])).toEqual({ featured: 'classic' });
    expect(defaultPinOf([opt({ ok: false }), opt({ pin: { builtin: 'epic' }, source: 'builtin' })])).toEqual({ builtin: 'epic' });
  });
});

describe('the window\'s choices', () => {
  const choice = (roles: Array<[string, string | null]>, mode: 'mirror' | 'playable' = 'mirror') => ({
    pin: { featured: 'classic' } as const, mode,
    seats: roles.map(([role, accountId], index) => ({ index, role: role as 'account' | 'open' | 'ai', accountId })),
  });

  it('requires the token owner to hold a seat, one account per seat, and an account for every Account seat', () => {
    expect(validateChoice(choice([['account', 'acc-bob'], ['open', null]]), owner)).toMatch(/must hold one of the seats/);
    expect(validateChoice(choice([['account', owner.id], ['account', owner.id]]), owner)).toMatch(/only one seat/);
    expect(validateChoice(choice([['account', owner.id], ['account', null]]), owner)).toMatch(/Pick a Civa account/);
    expect(validateChoice(choice([['account', owner.id], ['account', 'acc-bob'], ['ai', null]]), owner)).toBeUndefined();
  });

  it('turns them into seatMap and aiSeats, with AI seats only for a playable game', () => {
    const c = choice([['account', owner.id], ['open', null], ['ai', null]], 'playable');
    expect(toCreateRequest(c, { e: 1 }, 'G')).toEqual({ envelope: { e: 1 }, mode: 'playable', ruleset: { featured: 'classic' }, seatMap: { 0: owner.id, 1: null, 2: null }, aiSeats: [2], gameName: 'G' });
    expect(toCreateRequest({ ...c, mode: 'mirror' }, {}, 'G').aiSeats).toEqual([]);
  });
});
