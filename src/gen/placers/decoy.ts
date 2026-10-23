import { fixedTiles, spawnReach } from '../../core/enemy-defs';
import { type FloorMap } from '../../core/floor-map';
import { type Point } from '../../core/geometry';
import { bfsDistances } from '../../core/pathfinding';
import { type Rng } from '../../core/rng';
import { isWalkable } from '../../core/tiles';
import { hasLifePickup } from '../difficulty';
import { distanceFromRoute, openNeighbours, routeCells } from './fields';
import { MIN_ENEMY_START_DISTANCE } from './rules';
import { type Placer } from './types';

/** The life pickup and the Mimic lie at least this many steps from the shortest route, if the floor allows. */
export const PREFERRED_PICKUP_DETOUR = 8;
/** Tried in order when nothing is far enough off the route (small floors). */
const DETOUR_FALLBACKS = [PREFERRED_PICKUP_DETOUR, 6, 4, 2];

export interface DeadEndOptions {
  /** Tiles that must not be used: every tile an enemy can occupy. */
  avoid: ReadonlySet<number>;
  /** Tiles treated as walls when checking the spot can be reached (the fixed enemies). */
  blocked: ReadonlySet<number>;
  /**
   * The least distance from the route that is acceptable once the preferred ones fail. The pickup
   * takes the farthest tile there is (default 1: just off the route); the Mimic needs 2, so that
   * every tile it can strike is off the route too.
   */
  minRouteDistance?: number;
}

/**
 * A spot for something that lies off the shortest start-exit route: at least PREFERRED_PICKUP_DETOUR
 * steps from it (relaxed on small floors), in a dead end when one qualifies, never on the exit or
 * within MIN_ENEMY_START_DISTANCE of the start, never on an `avoid` tile and always reachable with
 * the `blocked` tiles treated as walls. Null when nothing qualifies. Shared by the life pickup
 * (`gen/pickups.ts`) and the Mimic that imitates it.
 */
export function pickDeadEndOffRoute(map: FloorMap, rng: Rng, opts: DeadEndOptions): Point | null {
  const { width } = map;
  const fromRoute = distanceFromRoute(map, routeCells(map));
  const fromStart = bfsDistances(map, map.start);
  const reachable = bfsDistances(map, map.start, opts.blocked);
  const floorDistance = opts.minRouteDistance ?? 1;

  const usable: number[] = [];
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isWalkable(map.tiles[i] as number) || opts.avoid.has(i)) continue;
    if (i === map.exit.y * width + map.exit.x) continue;
    if ((fromStart[i] as number) < MIN_ENEMY_START_DISTANCE) continue; // also rejects unreachable
    if ((reachable[i] as number) < 0) continue;
    if ((fromRoute[i] as number) < 1) continue; // never on the route
    usable.push(i);
  }
  if (usable.length === 0) return null;

  const at = (cell: number): Point => {
    const x = cell % width;
    return { x, y: (cell - x) / width };
  };
  for (const detour of DETOUR_FALLBACKS) {
    const far = usable.filter((i) => (fromRoute[i] as number) >= detour);
    if (far.length === 0) continue;
    const deadEnds = far.filter((i) => openNeighbours(map, i) === 1);
    const pool = deadEnds.length > 0 ? deadEnds : far;
    return at(pool[rng.int(pool.length)] as number);
  }
  // Nothing is even two steps off the route: take the farthest tile there is.
  const best = Math.max(...usable.map((i) => fromRoute[i] as number));
  if (best < floorDistance) return null;
  const pool = usable.filter((i) => fromRoute[i] === best);
  return at(pool[rng.int(pool.length)] as number);
}

/** Enemy tiles and the fixed ones among them, for `pickDeadEndOffRoute`. */
export function enemyTileSets(map: FloorMap): { avoid: Set<number>; blocked: Set<number> } {
  const avoid = new Set<number>();
  const blocked = new Set<number>(); // everything that never moves away
  for (const spawn of map.spawns) {
    for (const c of spawnReach(spawn, map)) avoid.add(c.y * map.width + c.x);
    for (const c of fixedTiles(spawn)) blocked.add(c.y * map.width + c.x);
  }
  return { avoid, blocked };
}

/**
 * The Mimic's kind of placement: a decoy dressed as the life pickup. It is not drawn with the
 * other types; `gen/mimics.ts` places it in its own pass, with the same spot rule as the pickup.
 */
export const decoyPlacer: Placer = {
  place() {
    return null; // never drawn by the weighted loop
  },
  validate(ctx, spawn, where) {
    const problems: string[] = [];
    if (hasLifePickup(ctx.map.floorNumber)) {
      problems.push(`${where} is on a floor with a real life pickup`);
    }
    // Every tile it can strike (its neighbours) must be off the route, so it is a pure footprint.
    const fromRoute = distanceFromRoute(ctx.map, [...ctx.route()]);
    if ((fromRoute[spawn.pos.y * ctx.map.width + spawn.pos.x] as number) < 2) {
      problems.push(`${where} is too near the route`);
    }
    return { problems };
  },
};
