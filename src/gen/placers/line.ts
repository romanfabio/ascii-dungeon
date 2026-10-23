import { fixedTiles } from '../../core/enemy-defs';
import { spawnCells, type EnemySpawn, type FloorMap } from '../../core/floor-map';
import { DIR_VEC, DIRS } from '../../core/geometry';
import { SENTINEL_MIN_BEAM, SENTINEL_RANGE } from '../../core/hazards';
import { bfsDistances } from '../../core/pathfinding';
import { isWalkable } from '../../core/tiles';
import { routeSurvivable } from '../spear-timing';
import { badShape } from './segment';
import { type Placer } from './types';

/** Walking distances from the start with `blocked` tiles as walls, and how many tiles are reachable. */
function reach(map: FloorMap, blocked: ReadonlySet<number>): { dist: Int32Array; count: number } {
  const dist = bfsDistances(map, map.start, blocked);
  let count = 0;
  for (const d of dist) if (d >= 0) count++;
  return { dist, count };
}

/**
 * A body with a beam: the body stands with its back to a wall (the end of a corridor, or the edge of
 * a room), off the route, and the beam runs straight ahead over free tiles for up to SENTINEL_RANGE
 * tiles (at least SENTINEL_MIN_BEAM). The beam may cross the route: the spawn is kept only if the
 * hazard proof shows the route can still be walked, and only if its permanent body does not cut
 * any part of the floor off from the start.
 */
export const linePlacer: Placer = {
  place(ctx, type, cell, rng, placed) {
    const { map } = ctx;
    const { width } = map;
    const x0 = cell % width;
    const y0 = (cell - x0) / width;
    for (const dir of rng.shuffle([...DIRS])) {
      const v = DIR_VEC[dir];
      const behind = (y0 - v.y) * width + (x0 - v.x);
      if (isWalkable(map.tiles[behind] as number)) continue; // the body needs a wall at its back

      let run = 0;
      while (run < SENTINEL_RANGE) {
        const x = x0 + v.x * (run + 1);
        const y = y0 + v.y * (run + 1);
        if (x < 0 || y < 0 || x >= width || y >= map.height || !ctx.roomy(y * width + x)) break;
        run++;
      }
      if (run < SENTINEL_MIN_BEAM) continue;

      const spawn: EnemySpawn = {
        type,
        pos: { x: x0, y: y0 },
        end: { x: x0 + v.x * run, y: y0 + v.y * run },
      };
      if (!routeSurvivable(map, [...placed, spawn])) continue;

      const fixed = new Set<number>();
      for (const s of placed) for (const c of fixedTiles(s)) fixed.add(c.y * width + c.x);
      const before = reach(map, fixed);
      if ((before.dist[cell] as number) < 0) continue; // already walled off by earlier enemies
      fixed.add(cell);
      if (reach(map, fixed).count < before.count - 1) continue; // the body would seal something off
      return spawn;
    }
    return null;
  },
  validate(ctx, spawn, where) {
    const length = spawnCells(spawn).length;
    if (badShape(spawn, length, SENTINEL_MIN_BEAM + 1, SENTINEL_RANGE + 1)) {
      return { problems: [`${where} has a bad beam`], fatal: true };
    }
    const problems: string[] = [];
    if (ctx.route().has(spawn.pos.y * ctx.map.width + spawn.pos.x)) {
      problems.push(`${where} has its body on the route`);
    }
    return { problems };
  },
};
