import { describe, expect, it } from 'vitest';
import type { Civ6Save } from 'civ6-savegame-parser';
import { fogOfWar } from './build';

const grass = { type: 'GRASS', variation: 0 };

describe('fog of war from a save', () => {
  it('remembers revealed plots and shares an ally\'s sight and memory', () => {
    const save = {
      alliances: [{ a: 0, b: 1, type: 'ALLIANCE_MILITARY', startTurn: 1 }],
      players: [
        { playerId: 0, revealedPlots: [0], relations: [{ playerId: 1, state: 'ALLIED' }] },
        { playerId: 1, revealedPlots: [1], relations: [{ playerId: 0, state: 'ALLIED' }] },
      ],
    } as unknown as Civ6Save;
    const map = [[grass, grass], [grass, grass]];
    const slots = new Map([[0, 'ai_pydt_seat_0'], [1, 'ai_pydt_seat_1']]);
    const fog = fogOfWar(save, { width: 2, height: 2 }, map, slots);
    expect(fog.pairs).toBe(1);
    expect(fog.visionPartners.ai_pydt_seat_0).toEqual(['ai_pydt_seat_1']);
    expect(fog.visitedTilesByPlayer.ai_pydt_seat_0.map(t => `${t.position.x},${t.position.y}`).sort()).toEqual(['0,1', '1,1']);
  });
});
