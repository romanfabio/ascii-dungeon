import { type FloorMap } from '../../core/floor-map';
import { DX, DY } from '../../core/geometry';
import { isWalkable } from '../../core/tiles';
import { routeSurvivable } from '../spear-timing';
import { routeCells } from './fields';
import { type Placer } from './types';

/** A gate is at least this many steps from the start and from the exit along the route. */
export const MIN_GATE_FROM_START = 8;
export const MIN_GATE_FROM_EXIT = 5;
/** Two gates are never closer than this (Manhattan), so they do not form a double door. */
export const MIN_GATE_SPACING = 3;

/** Is the tile a plain corridor tile: exactly two walkable neighbours, opposite each other? */
export function isCorridorTile(map: FloorMap, i: number): boolean {
  const x = i % map.width;
  const y = (i - x) / map.width;
  const open: boolean[] = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + (DX[d] as number);
    const ny = y + (DY[d] as number);
    open.push(
      nx >= 0 &&
        ny >= 0 &&
        nx < map.width &&
        ny < map.height &&
        isWalkable(map.tiles[ny * map.width + nx] as number),
    );
  }
  const count = open.filter(Boolean).length;
  // Directions are N, E, S, W: opposite ones are 0/2 and 1/3.
  return count === 2 && ((open[0] && open[2]) || (open[1] && open[3])) === true;
}

/**
 * A gate on the shortest route: the only kind of enemy that may stand on it, because it always
 * opens. It takes a plain corridor tile of the route (not near the start or exit, not next to
 * another gate); the tile the drawing loop offered is ignored, since that one is never on the
 * route. Kept only if the hazard proof shows the route can be walked by waiting for it to open.
 */
export const gatePlacer: Placer = {
  place(ctx, type, _cell, rng, placed) {
    const { map } = ctx;
    const route = routeCells(map);
    const width = map.width;
    const options: number[] = [];
    route.forEach((i, index) => {
      if (index < MIN_GATE_FROM_START || route.length - 1 - index < MIN_GATE_FROM_EXIT) return;
      if (!ctx.roomy(i) || !isCorridorTile(map, i)) return;
      const x = i % width;
      const y = (i - x) / width;
      const crowded = placed.some(
        (s) => s.type === type && Math.abs(s.pos.x - x) + Math.abs(s.pos.y - y) < MIN_GATE_SPACING,
      );
      if (!crowded) options.push(i);
    });
    if (options.length === 0) return null;
    const cell = options[rng.int(options.length)] as number;
    const x = cell % width;
    const spawn = { type, pos: { x, y: (cell - x) / width } };
    return routeSurvivable(map, [...placed, spawn]) ? spawn : null;
  },
  validate(ctx, spawn, where) {
    const problems: string[] = [];
    const i = spawn.pos.y * ctx.map.width + spawn.pos.x;
    if (!ctx.route().has(i)) problems.push(`${where} is not on the route`);
    if (!isCorridorTile(ctx.map, i)) problems.push(`${where} is not in a corridor`);
    return { problems };
  },
};
