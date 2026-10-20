import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGame, lookupMirror, searchPlayers, whoami } from './civa-api';
import { convertSave, inspectOrThrow, syncTurnToCiva } from './civa-sync';
import { toCreateRequest } from './create-logic';

/**
 * End to end against a local civa (`cd server && ADMIN_PLAYER_IDS=player1 PORT=3911 npm start`, classic uploaded
 * and featured, a token minted for a player). Set CIVA_API_BASE_URL=http://localhost:3911/api and
 * CIVA_TEST_TOKEN; needs consecutive saves 72, 73 and 74 in ~/Downloads (skipped otherwise).
 */
const token = process.env.CIVA_TEST_TOKEN;
const saves = ['72', '73', '74'].map(n => join(homedir(), 'Downloads', `${n}.Civ6Save`));
const ready = !!token && !!process.env.CIVA_API_BASE_URL && saves.every(existsSync);

(ready ? describe : describe.skip)('create, then sync turns, against a local civa', () => {
  const pydtGameId = `e2e-${Date.now().toString(36)}`;

  it('creates a mirror from the first save with the owner seated, then adds the next two turns', async () => {
    const owner = await whoami(token!);
    expect((await searchPlayers(token!, owner.name.slice(0, 3))).map(p => p.id)).toContain(owner.id);
    expect((await lookupMirror(token!, pydtGameId)).mirrored).toBe(false);
    expect(await syncTurnToCiva(token!, pydtGameId, readFileSync(saves[0]!), 'e2e')).toEqual({ kind: 'not-mirrored' });

    const pin = { featured: 'classic' } as const;
    const built = await convertSave(token!, readFileSync(saves[0]!), pydtGameId, pin, 'e2e');
    const inspection = await inspectOrThrow(token!, built);
    expect(inspection.rulesets.find(r => r.ok)).toBeTruthy();
    const choice = { pin, mode: 'mirror' as const, seats: built.seats.map(s => ({ index: s.index, role: s.index === 0 ? 'account' as const : 'open' as const, accountId: s.index === 0 ? owner.id : null })) };
    const created = await createGame(token!, toCreateRequest(choice, built.envelope, 'e2e'));
    expect(created.gameId).toMatch(/^game-/);
    expect((await lookupMirror(token!, pydtGameId)).gameId).toBe(created.gameId);

    const second = await syncTurnToCiva(token!, pydtGameId, readFileSync(saves[1]!), 'e2e');
    expect(second).toMatchObject({ kind: 'uploaded', gameId: created.gameId });
    const third = await syncTurnToCiva(token!, pydtGameId, readFileSync(saves[2]!), 'e2e');
    expect(third).toMatchObject({ kind: 'uploaded' });
    expect((third as { turn: number }).turn).toBeGreaterThan((second as { turn: number }).turn);
  });

  it('creates a playable game with an AI seat from the same save', async () => {
    const owner = await whoami(token!);
    const pin = { featured: 'classic' } as const;
    const built = await convertSave(token!, readFileSync(saves[0]!), pydtGameId, pin, 'e2e playable');
    const seats = built.seats.map(s => ({ index: s.index, role: s.index === 0 ? 'account' as const : s.index === 1 ? 'ai' as const : 'open' as const, accountId: s.index === 0 ? owner.id : null }));
    const created = await createGame(token!, toCreateRequest({ pin, mode: 'playable', seats }, built.envelope, 'e2e playable'));
    expect(created).toMatchObject({ mode: 'playable' });
    expect(created.gameId).toMatch(/^game-/);
  });
});
