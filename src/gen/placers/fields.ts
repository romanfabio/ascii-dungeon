import { type FloorMap } from '../../core/floor-map';
import { DX, DY } from '../../core/geometry';
import { bfsDistances, shortestPath } from '../../core/pathfinding';
import { isWalkable } from '../../core/tiles';

/** The tile indices of the shortest start -> exit route, in walking order. */
export function routeCells(map: FloorMap): number[] {
  return shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x);
}

/** Walking distance from the nearest tile of `route` to every cell (-1: unreachable). */
export function distanceFromRoute(map: FloorMap, route: readonly number[]): Int32Array {
  const { width, height } = map;
  const dist = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const i of route) {
    dist[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const cur = queue[head++] as number;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (DX[k] as number);
      const ny = cy + (DY[k] as number);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (dist[n] !== -1 || !isWalkable(map.tiles[n] as number)) continue;
      dist[n] = (dist[cur] as number) + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}

/** Walkable neighbours of a cell: a dead end has exactly one. */
export function openNeighbours(map: FloorMap, i: number): number {
  const { width, height } = map;
  const x = i % width;
  const y = (i - x) / width;
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + (DX[k] as number);
    const ny = y + (DY[k] as number);
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (isWalkable(map.tiles[ny * width + nx] as number)) n++;
  }
  return n;
}

/** What the placers (and the validator) need to know about a floor, computed once per floor. */
export interface FloorFields {
  map: FloorMap;
  /** The shortest start -> exit route as a set of tile indices. */
  route: ReadonlySet<number>;
  /** Walking distance from the start (-1: unreachable). */
  fromStart: Int32Array;
  exitIndex: number;
}

export function floorFields(map: FloorMap): FloorFields {
  return {
    map,
    route: new Set(routeCells(map)),
    fromStart: bfsDistances(map, map.start),
    exitIndex: map.exit.y * map.width + map.exit.x,
  };
}
