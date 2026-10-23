import { type FloorMap } from '../core/floor-map';
import { isWalkable } from '../core/tiles';

export interface FloorStats {
  walkable: number;
  deadEnds: number;
  /** Independent cycles in the walkable graph: 0 for a perfect maze. */
  loops: number;
  pathLength: number;
}

export function analyzeFloor(map: FloorMap): FloorStats {
  const { width, height, tiles } = map;
  let walkable = 0;
  let edges = 0;
  let deadEnds = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isWalkable(tiles[y * width + x] as number)) continue;
      walkable++;
      let neighbors = 0;
      if (x > 0 && isWalkable(tiles[y * width + x - 1] as number)) neighbors++;
      if (x < width - 1 && isWalkable(tiles[y * width + x + 1] as number)) {
        neighbors++;
        edges++;
      }
      if (y > 0 && isWalkable(tiles[(y - 1) * width + x] as number)) neighbors++;
      if (y < height - 1 && isWalkable(tiles[(y + 1) * width + x] as number)) {
        neighbors++;
        edges++;
      }
      if (neighbors === 1) deadEnds++;
    }
  }
  return { walkable, deadEnds, loops: edges - walkable + 1, pathLength: map.optimalPathLength };
}
