import { spawnCells, type FloorMap } from '../../core/floor-map';
import { DIR_VEC, DIRS, type Point } from '../../core/geometry';
import { type Rng } from '../../core/rng';
import { routeSurvivable } from '../spear-timing';
import { MAX_PATROL_LENGTH, MAX_SPEAR_LENGTH, MIN_PATROL_LENGTH, MIN_SPEAR_LENGTH } from './rules';
import { type Placer } from './types';

/**
 * The far end of a straight segment that starts at `cell` and runs over tiles accepted by
 * `usable`, in a random direction: `min` to `max` tiles long. Null if no direction has room.
 */
export function segmentEnd(
  map: FloorMap,
  usable: (index: number) => boolean,
  cell: number,
  min: number,
  max: number,
  rng: Rng,
): Point | null {
  const { width } = map;
  const x0 = cell % width;
  const y0 = (cell - x0) / width;
  for (const dir of rng.shuffle([...DIRS])) {
    const vec = DIR_VEC[dir];
    let run = 1;
    while (run < max) {
      const x = x0 + vec.x * run;
      const y = y0 + vec.y * run;
      if (x < 0 || y < 0 || x >= width || y >= map.height || !usable(y * width + x)) break;
      run++;
    }
    if (run < min) continue;
    const len = rng.range(min, run);
    return { x: x0 + vec.x * (len - 1), y: y0 + vec.y * (len - 1) };
  }
  return null;
}

/** Shared by the straight-segment types: is it straight, and a legal length? */
export function badShape(
  spawn: { pos: Point; end?: Point },
  length: number,
  min: number,
  max: number,
): boolean {
  const { pos, end } = spawn;
  if (!end) return true;
  return !(pos.x === end.x || pos.y === end.y) || length < min || length > max;
}

/** A straight 3-7 tile run off the route, walked back and forth (the Patroller). */
export const segmentPlacer: Placer = {
  place(ctx, type, cell, rng) {
    const end = segmentEnd(ctx.map, ctx.open, cell, MIN_PATROL_LENGTH, MAX_PATROL_LENGTH, rng);
    const x = cell % ctx.map.width;
    return end ? { type, pos: { x, y: (cell - x) / ctx.map.width }, end } : null;
  },
  validate(_ctx, spawn, where) {
    const length = spawnCells(spawn).length;
    if (badShape(spawn, length, MIN_PATROL_LENGTH, MAX_PATROL_LENGTH)) {
      return { problems: [`${where} has a bad patrol segment`], fatal: true };
    }
    return { problems: [] };
  },
};

/**
 * A reach of 3-6 tiles from a base off the route; the reach itself may cross the route (a timing
 * puzzle solved by waiting), and is only kept when the hazard proof passes.
 */
export const reachPlacer: Placer = {
  place(ctx, type, cell, rng, placed) {
    const end = segmentEnd(ctx.map, ctx.roomy, cell, MIN_SPEAR_LENGTH, MAX_SPEAR_LENGTH, rng);
    if (!end) return null;
    const x = cell % ctx.map.width;
    const spawn = { type, pos: { x, y: (cell - x) / ctx.map.width }, end };
    return routeSurvivable(ctx.map, [...placed, spawn]) ? spawn : null;
  },
  validate(ctx, spawn, where) {
    const length = spawnCells(spawn).length;
    if (badShape(spawn, length, MIN_SPEAR_LENGTH, MAX_SPEAR_LENGTH)) {
      return { problems: [`${where} has a bad reach`], fatal: true };
    }
    const problems: string[] = [];
    if (ctx.route().has(spawn.pos.y * ctx.map.width + spawn.pos.x)) {
      problems.push(`${where} has its base on the route`);
    }
    return { problems };
  },
};
