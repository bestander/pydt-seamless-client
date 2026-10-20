/**
 * External offset coordinates → civa axial coordinates.
 *
 * The external game stores the map as odd-r offset rows (odd rows shifted half a hex east) with
 * y = 0 on the southern edge. Civa's map is a square axial array (`map[r][q]`, pointy-top), and the way
 * its cameras look at it, r grows down the screen and q grows to the left, so both axes are flipped
 * and the odd-row shift is absorbed by the column:
 *
 *   r = (H - 1) - y
 *   q = (W - 1 - x) + floor(y / 2)
 *
 * The parallelogram this produces is wider than the rectangle: `axialMapSize` is the square that holds
 * all of it, and every cell outside the rectangle is filled with ocean.
 */

export interface Position {
  x: number;
  y: number;
}

export interface MapDims {
  width: number;
  height: number;
}

export function toAxial(x: number, y: number, dims: MapDims): Position {
  return {
    x: (dims.width - 1 - x) + Math.floor(y / 2),
    y: dims.height - 1 - y,
  };
}

/** Side of the square axial map that holds every converted tile. */
export function axialMapSize(dims: MapDims): number {
  const maxQ = (dims.width - 1) + Math.floor((dims.height - 1) / 2);
  return Math.max(maxQ + 1, dims.height);
}

/** The six neighbours of an axial tile (civa's `getNeighbors` order). */
export function neighbours(p: Position): Position[] {
  return [
    { x: p.x - 1, y: p.y }, { x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y - 1 },
    { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y + 1 },
  ];
}

/** Hex distance between two axial tiles. */
export function hexDistance(a: Position, b: Position): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return (Math.abs(dx) + Math.abs(dy) + Math.abs(dx + dy)) / 2;
}
