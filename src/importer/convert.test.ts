import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEnvelope, parseSave, pydtGameIdFromFileName, validateEnvelope } from './index';
import { classicSchema } from './mapping.test';
import { axialMapSize } from './coords';

/**
 * Converts a real save from ~/Downloads (as the old importer's tests did) and checks the result against the
 * schema civa served (test-fixtures/classic-schema.json, refreshed by scripts/capture-schema.mjs). Skipped when
 * no save is present. With CIVA_TEST_URL and CIVA_TEST_TOKEN set it also runs civa's own `inspect` on it.
 */
const CANDIDATES = [process.env.PYDT_TEST_SAVE, '74.Civ6Save', 'turn124.Civ6Save']
  .filter((p): p is string => !!p)
  .map(p => (p.includes('/') ? p : join(homedir(), 'Downloads', p)));
const savePath = CANDIDATES.find(existsSync);

describe('file names', () => {
  it('reads the PYDT game id off a save name', () => {
    expect(pydtGameIdFromFileName('/x/00000000-1111-2222-3333-444444444444_321.Civ6Save')).toBe('00000000-1111-2222-3333-444444444444');
    expect(pydtGameIdFromFileName('!GO!-bob-Game.Civ6Save')).toBeUndefined();
  });
});

(savePath ? describe : describe.skip)('a real save, converted', () => {
  const save = savePath ? parseSave(readFileSync(savePath)) : undefined!;
  const pydtGameId = '00000000-1111-2222-3333-444444444444';
  const result = savePath ? buildEnvelope(save, { schema: classicSchema, pin: { featured: 'classic' }, pydtGameId }) : undefined!;
  const state = result?.envelope.state as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('validates against the schema civa serves', () => {
    expect(validateEnvelope(classicSchema, result.envelope)).toEqual([]);
  });

  it('fills the fingerprint, seats and source turn', () => {
    const env = result.envelope as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const size = axialMapSize({ width: save.map.width, height: save.map.height });
    expect(env.fingerprint).toMatchObject({ mapWidth: size, mapHeight: size, pydtGameId });
    expect(env.fingerprint.seats).toHaveLength(result.seats.length);
    expect(env.seats.map((s: any) => s.index)).toEqual(result.seats.map(s => s.index)); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(env.sourceTurn).toBe(save.metadata.turn);
    expect(state.turnNumber).toBe(save.metadata.turn);
    expect(state.currentPlayerIndex).toBeGreaterThanOrEqual(0);
  });

  it('puts every tile, city and unit on civa vocabulary ids', () => {
    const vocab = classicSchema.vocabulary;
    expect(state.map).toHaveLength(state.mapSize);
    for (const row of state.map) for (const tile of row) {
      expect(vocab.terrain).toContain(tile.type);
      if (tile.feature) expect(vocab.features).toContain(tile.feature);
      if (tile.resource) expect(vocab.resources).toContain(tile.resource);
    }
    expect(state.cities.length).toBeGreaterThan(0);
    for (const city of state.cities) for (const b of city.buildings) expect(vocab.buildings).toContain(b);
    expect(state.units.length).toBeGreaterThan(0);
    for (const unit of state.units) expect(vocab.units).toContain(unit.type);
    const ids = state.units.map((u: any) => u.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every river edge is mirrored on its neighbour', () => {
    const map = state.map as Array<Array<{ riverEdges?: number }>>;
    // civa's side i faces the delta getNeighbors returns at index i; side i here is side (i+3)%6 there.
    const sideDelta = [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }];
    let edges = 0;
    for (let y = 0; y < map.length; y++) for (let x = 0; x < map.length; x++) {
      const mask = map[y]![x]!.riverEdges ?? 0;
      for (let side = 0; side < 6; side++) {
        if (!(mask & (1 << side))) continue;
        const n = map[y + sideDelta[side]!.y]?.[x + sideDelta[side]!.x];
        if (!n) continue;
        expect(((n.riverEdges ?? 0) >> ((side + 3) % 6)) & 1).toBe(1);
        edges++;
      }
    }
    expect(edges).toBeGreaterThan(0);
  });

  const liveUrl = process.env.CIVA_TEST_URL;
  const liveToken = process.env.CIVA_TEST_TOKEN;
  (liveUrl && liveToken ? it : it.skip)("is accepted by civa's inspect", async () => {
    const res = await fetch(`${liveUrl}/mirror-games/inspect`, {
      method: 'POST', headers: { Authorization: `Bearer ${liveToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(result.envelope),
    });
    const body = await res.json() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (res.status !== 200 || body.issues?.length) console.log(JSON.stringify(body).slice(0, 3000));
    expect(res.status).toBe(200);
    expect(body.issues).toEqual([]);
    expect(body.rulesets.some((r: any) => r.ok)).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
});
