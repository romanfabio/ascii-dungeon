import { type Point } from '../core/geometry';
import { Grid } from '../core/grid';
import { bfsDistances } from '../core/pathfinding';
import { type Rng } from '../core/rng';
import { isWalkable } from '../core/tiles';

export interface Placement {
  start: Point;
  exit: Point;
}

function toPoint(idx: number, width: number): Point {
  const x = idx % width;
  return { x, y: (idx - x) / width };
}

/**
 * Start = one end of a long path (the cell farthest from a random cell).
 * Exit = the reachable cell at `exitPercentile` of the walking distance from the start.
 * Returns null if the grid has fewer than two walkable cells.
 */
export function placeStartAndExit(grid: Grid, rng: Rng, exitPercentile: number): Placement | null {
  const w = grid.width;
  const field = { width: w, height: grid.height, tiles: grid.data };

  const floorCells: number[] = [];
  for (let i = 0; i < grid.data.length; i++) {
    if (isWalkable(grid.data[i] as number)) floorCells.push(i);
  }
  if (floorCells.length < 2) return null;

  const seed = rng.pick(floorCells);
  const fromSeed = bfsDistances(field, toPoint(seed, w));
  let startIdx = seed;
  for (const i of floorCells) {
    if ((fromSeed[i] as number) > (fromSeed[startIdx] as number)) startIdx = i;
  }

  const start = toPoint(startIdx, w);
  const dist = bfsDistances(field, start);
  const candidates = floorCells.filter((i) => (dist[i] as number) > 0);
  if (candidates.length === 0) return null;
  // Shuffle first so ties are broken randomly; the sort is stable.
  rng.shuffle(candidates);
  candidates.sort((a, b) => (dist[a] as number) - (dist[b] as number));

  const p = Math.min(1, Math.max(0, exitPercentile));
  const exitIdx = candidates[Math.round(p * (candidates.length - 1))] as number;
  return { start, exit: toPoint(exitIdx, w) };
}
