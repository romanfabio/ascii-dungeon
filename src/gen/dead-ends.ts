import { DX, DY } from '../core/geometry';
import { Grid } from '../core/grid';
import { type Rng } from '../core/rng';
import { isWalkable, Tile } from '../core/tiles';

function walkableNeighbors(grid: Grid, x: number, y: number): number {
  let n = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + (DX[d] as number);
    const ny = y + (DY[d] as number);
    if (grid.inBounds(nx, ny) && isWalkable(grid.get(nx, ny))) n++;
  }
  return n;
}

function findDeadEnds(grid: Grid): number[] {
  const result: number[] = [];
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (isWalkable(grid.get(x, y)) && walkableNeighbors(grid, x, y) === 1) {
        result.push(grid.index(x, y));
      }
    }
  }
  return result;
}

/**
 * Fills in dead-end corridors back to the nearest junction. Each dead end is removed with
 * probability `fraction`. Never disconnects the map (only leaves are removed).
 */
export function pruneDeadEnds(grid: Grid, rng: Rng, fraction: number): void {
  if (fraction <= 0) return;
  for (const idx of findDeadEnds(grid)) {
    if (!rng.chance(fraction)) continue;
    let x = idx % grid.width;
    let y = (idx - x) / grid.width;
    while (isWalkable(grid.get(x, y)) && walkableNeighbors(grid, x, y) === 1) {
      let next: [number, number] | null = null;
      for (let d = 0; d < 4; d++) {
        const nx = x + (DX[d] as number);
        const ny = y + (DY[d] as number);
        if (grid.inBounds(nx, ny) && isWalkable(grid.get(nx, ny))) next = [nx, ny];
      }
      grid.set(x, y, Tile.Wall);
      if (!next) break;
      [x, y] = next;
    }
  }
}

/**
 * Turns dead ends into loops: each dead end is, with probability `factor`, connected to a
 * corridor on the other side of an adjacent wall. Never disconnects the map.
 */
export function braid(grid: Grid, rng: Rng, factor: number): void {
  if (factor <= 0) return;
  for (const idx of findDeadEnds(grid)) {
    const x = idx % grid.width;
    const y = (idx - x) / grid.width;
    if (walkableNeighbors(grid, x, y) !== 1) continue; // already fixed by an earlier braid
    if (!rng.chance(factor)) continue;

    const options: number[] = [];
    for (let d = 0; d < 4; d++) {
      const wx = x + (DX[d] as number);
      const wy = y + (DY[d] as number);
      const fx = x + 2 * (DX[d] as number);
      const fy = y + 2 * (DY[d] as number);
      if (fx < 1 || fy < 1 || fx > grid.width - 2 || fy > grid.height - 2) continue;
      if (grid.get(wx, wy) === Tile.Wall && isWalkable(grid.get(fx, fy))) options.push(d);
    }
    if (options.length === 0) continue;
    const d = rng.pick(options);
    grid.set(x + (DX[d] as number), y + (DY[d] as number), Tile.Floor);
  }
}
