import { DX, DY, type Point } from './geometry';
import { isWalkable } from './tiles';

/** Minimal view of a tile map: enough for pathfinding and analysis. */
export interface TileField {
  width: number;
  height: number;
  tiles: Uint8Array;
}

/**
 * BFS walking distance from `from` to every cell; -1 where unreachable or not walkable.
 * Cells (as indices) in `blocked` count as walls.
 */
export function bfsDistances(
  field: TileField,
  from: Point,
  blocked?: ReadonlySet<number>,
): Int32Array {
  const { width, height, tiles } = field;
  const dist = new Int32Array(width * height).fill(-1);
  const start = from.y * width + from.x;
  if (!isWalkable(tiles[start] as number) || blocked?.has(start)) return dist;

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const cur = queue[head++] as number;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const d = (dist[cur] as number) + 1;
    for (let i = 0; i < 4; i++) {
      const nx = cx + (DX[i] as number);
      const ny = cy + (DY[i] as number);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (dist[n] !== -1 || !isWalkable(tiles[n] as number) || blocked?.has(n)) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  return dist;
}

/**
 * One shortest walking route from `from` to `to`, both included (empty if unreachable).
 * Deterministic: ties are broken by neighbour order.
 */
export function shortestPath(field: TileField, from: Point, to: Point): Point[] {
  const { width } = field;
  const dist = bfsDistances(field, to);
  let d = dist[from.y * width + from.x] as number;
  if (d < 0) return [];
  const path: Point[] = [{ ...from }];
  let { x, y } = from;
  while (d > 0) {
    for (let i = 0; i < 4; i++) {
      const nx = x + (DX[i] as number);
      const ny = y + (DY[i] as number);
      if (dist[ny * width + nx] === d - 1) {
        x = nx;
        y = ny;
        break;
      }
    }
    d--;
    path.push({ x, y });
  }
  return path;
}

/** Label 4-connected walkable components: -1 for non-walkable cells, otherwise 0..count-1. */
export function labelComponents(field: TileField): { labels: Int32Array; count: number } {
  const { width, height, tiles } = field;
  const labels = new Int32Array(width * height).fill(-1);
  const stack = new Int32Array(width * height);
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -1 || !isWalkable(tiles[i] as number)) continue;
    let sp = 0;
    stack[sp++] = i;
    labels[i] = count;
    while (sp > 0) {
      const cur = stack[--sp] as number;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (DX[k] as number);
        const ny = cy + (DY[k] as number);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (labels[n] !== -1 || !isWalkable(tiles[n] as number)) continue;
        labels[n] = count;
        stack[sp++] = n;
      }
    }
    count++;
  }
  return { labels, count };
}
