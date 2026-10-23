import { fixedTiles } from '../../core/enemy-defs';
import { type EnemySpawn, type FloorMap } from '../../core/floor-map';
import { DX, DY } from '../../core/geometry';
import { SWEEPER_MAX_ARM, SWEEPER_MIN_ARM, sweeperArmLength } from '../../core/hazards';
import { bfsDistances } from '../../core/pathfinding';
import { armTiles } from '../../core/segment';
import { routeSurvivable } from '../spear-timing';
import { type Placer } from './types';

/** Walking distances from the start with `blocked` tiles as walls, and how many tiles are reachable. */
function reach(map: FloorMap, blocked: ReadonlySet<number>): { dist: Int32Array; count: number } {
  const dist = bfsDistances(map, map.start, blocked);
  let count = 0;
  for (const d of dist) if (d >= 0) count++;
  return { dist, count };
}

/**
 * A pivot off the route with an arm of SWEEPER_MIN_ARM to SWEEPER_MAX_ARM tiles that sweeps all
 * four directions (walls cut it short). At least two directions must have room for the arm, and
 * every tile any arm can reach must be free of other enemies and far from the start. The arms may
 * cross the route: the spawn is kept only if the hazard proof says the route can be walked, and only
 * if the permanent pivot does not seal part of the floor off.
 */
export const pivotPlacer: Placer = {
  place(ctx, type, cell, rng, placed) {
    const { map } = ctx;
    const { width } = map;
    const x0 = cell % width;
    const y0 = (cell - x0) / width;
    const pos = { x: x0, y: y0 };
    const free = (d: number, len: number): number => {
      let run = 0;
      for (const t of armTiles(map, pos, d, len)) {
        if (!ctx.roomy(t.y * width + t.x)) return -1; // an arm tile that must stay clear
        run++;
      }
      return run;
    };
    const len = rng.range(SWEEPER_MIN_ARM, SWEEPER_MAX_ARM);
    for (const d0 of rng.shuffle([0, 1, 2, 3])) {
      const runs = [0, 1, 2, 3].map((d) => free(d, len));
      if (runs.some((r) => r < 0)) return null; // some arm would reach tiles that are not free
      const run = runs[d0] as number;
      if (run < SWEEPER_MIN_ARM) continue;
      if (runs.filter((r) => r >= SWEEPER_MIN_ARM).length < 2) return null;
      const arm = Math.min(len, run);
      const spawn: EnemySpawn = {
        type,
        pos,
        end: { x: x0 + (DX[d0] as number) * arm, y: y0 + (DY[d0] as number) * arm },
      };
      if (!routeSurvivable(map, [...placed, spawn])) continue;

      const fixed = new Set<number>();
      for (const s of placed) for (const c of fixedTiles(s)) fixed.add(c.y * width + c.x);
      const before = reach(map, fixed);
      if ((before.dist[cell] as number) < 0) return null; // already walled off by earlier enemies
      fixed.add(cell);
      if (reach(map, fixed).count < before.count - 1) return null; // the pivot would seal something off
      return spawn;
    }
    return null;
  },
  validate(ctx, spawn, where) {
    const arm = sweeperArmLength(spawn);
    const end = spawn.end;
    if (
      !end ||
      !(spawn.pos.x === end.x || spawn.pos.y === end.y) ||
      arm < SWEEPER_MIN_ARM ||
      arm > SWEEPER_MAX_ARM
    ) {
      return { problems: [`${where} has a bad arm`], fatal: true };
    }
    const problems: string[] = [];
    if (ctx.route().has(spawn.pos.y * ctx.map.width + spawn.pos.x)) {
      problems.push(`${where} has its pivot on the route`);
    }
    return { problems };
  },
};
