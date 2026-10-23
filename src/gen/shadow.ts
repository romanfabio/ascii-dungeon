import { ENEMY_DEFS, SHADOW_LAG } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { type Point } from '../core/geometry';
import { type Rng } from '../core/rng';
import { routeWalkOf } from './spear-timing';

/** About this share of the floors from the Shadow's unlock floor on has one. */
export const SHADOW_CHANCE = 0.5;

/** The longest lag the trail can hold (`TRAIL_LENGTH` in core/game-state.ts) with room to spare. */
export const MAX_SHADOW_LAG = 60;

/**
 * Could someone walking `walk` (the tile after each turn, a wait repeating its tile) be caught?
 * The Shadow only hurts a player who stood still on the tile it reaches, which is the tile they
 * stood on `lag` turns earlier.
 */
export function shadowCatches(walk: readonly Point[], lag: number): boolean {
  return walk.some((p, n) => {
    const before = n > 0 ? (walk[n - 1] as Point) : null;
    const waited = before !== null && before.x === p.x && before.y === p.y;
    const then = walk[n - lag];
    return waited && then !== undefined && n - lag >= 0 && then.x === p.x && then.y === p.y;
  });
}

/**
 * Maybe a Shadow for this floor: about SHADOW_CHANCE of the floors from its unlock floor on. The
 * floor is only given one if the fewest-turns way through the timed hazards never has to stand
 * still where the Shadow arrives, so a floor is always solvable with it. Returns the lag, or null.
 * Run last, on its own rng stream, so nothing else about the floor changes.
 */
export function placeShadow(map: FloorMap, rng: Rng): number | null {
  if (map.floorNumber < ENEMY_DEFS.shadow.minFloor) return null;
  if (rng.next() >= SHADOW_CHANCE) return null;
  const walk = routeWalkOf(map, map.spawns);
  if (!walk || shadowCatches(walk, SHADOW_LAG)) return null;
  return SHADOW_LAG;
}
