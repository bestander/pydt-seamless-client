import { describe, expect, it } from 'vitest';
import { axialMapSize, hexDistance, toAxial } from './coords';

/** Odd-r neighbours of (x, y) in the external game's offset grid: odd rows lean east. */
function offsetNeighbours(x: number, y: number): Array<[number, number]> {
  const odd = y & 1;
  return [[x - 1, y], [x + 1, y], [x - 1 + odd, y + 1], [x + odd, y + 1], [x - 1 + odd, y - 1], [x + odd, y - 1]];
}

describe('external offset coordinates → civa axial', () => {
  const dims = { width: 74, height: 46 };

  it('keeps every neighbour pair adjacent after conversion', () => {
    for (let y = 0; y < dims.height; y++) {
      for (let x = 0; x < dims.width; x++) {
        const a = toAxial(x, y, dims);
        for (const [nx, ny] of offsetNeighbours(x, y)) {
          if (nx < 0 || ny < 0 || nx >= dims.width || ny >= dims.height) continue;
          expect(hexDistance(a, toAxial(nx, ny, dims))).toBe(1);
        }
      }
    }
  });

  it('flips both axes, keeps the odd-row shift a half hex east, and fits the square', () => {
    const size = axialMapSize(dims);
    expect(toAxial(0, 0, dims)).toEqual({ x: dims.width - 1, y: dims.height - 1 });
    expect(toAxial(dims.width - 1, dims.height - 1, dims).y).toBe(0);
    // East is -x: a plot one to the east lands one column lower.
    expect(toAxial(6, 4, dims).x).toBe(toAxial(5, 4, dims).x - 1);
    // World x = q + r/2: an odd row sits half a hex east of the even row below it.
    const even = toAxial(5, 4, dims), odd = toAxial(5, 5, dims);
    expect((odd.x + odd.y / 2) - (even.x + even.y / 2)).toBe(-0.5);
    const seen = new Set<string>();
    for (let y = 0; y < dims.height; y++) {
      for (let x = 0; x < dims.width; x++) {
        const p = toAxial(x, y, dims);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(size);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(size);
        seen.add(`${p.x},${p.y}`);
      }
    }
    expect(seen.size).toBe(dims.width * dims.height);
  });
});
