import { ENEMY_DEFS, spawnReach, type EnemyTypeId } from '../core/enemy-defs';
import { type EnemySpawn, type FloorMap } from '../core/floor-map';
import { type Rng } from '../core/rng';
import { isWalkable } from '../core/tiles';
import { type PlacementLimits } from './difficulty';
import { floorFields } from './placers/fields';
import { MIN_ENEMY_START_DISTANCE, PLACERS, type PlaceContext } from './placers';

// The rules numbers live with the placers; they stay importable from here.
export {
  MAX_PATROL_LENGTH,
  MAX_SPEAR_LENGTH,
  MIN_CHASER_START_DISTANCE,
  MIN_ENEMY_START_DISTANCE,
  MIN_PATROL_LENGTH,
  MIN_SPEAR_LENGTH,
} from './placers';

function weightedType(
  types: readonly EnemyTypeId[],
  rng: Rng,
  weightOf: (type: EnemyTypeId) => number,
): EnemyTypeId {
  const total = types.reduce((sum, t) => sum + weightOf(t), 0);
  let roll = rng.next() * total;
  for (const type of types) {
    roll -= weightOf(type);
    if (roll < 0) return type;
  }
  return types[types.length - 1] as EnemyTypeId;
}

/**
 * Picks where enemies start. The drawing loop here picks a random free tile, draws a type by
 * weight among those still under their per-floor cap and the threat budget, and hands the tile to
 * the type's placer (`gen/placers/`, chosen by `EnemyDef.placement`), which builds the spawn or
 * says no. Every tile an enemy can ever occupy (its tile, a patroller's whole segment, a spear's
 * full reach) is at least MIN_ENEMY_START_DISTANCE from the start, off the start and exit, and
 * shared with no other enemy.
 *
 * Solvability: `footprint` types (Bloodstone, Patroller) never touch the shortest start -> exit
 * route, so that route is free of them however they move. A spear's base is also off the route,
 * but its reach may cross it (a timing puzzle you solve by waiting); such a spear is only kept if
 * the hazard proof (`routeSurvivable`) shows the route can still be walked with all the timed
 * enemies in play. Places fewer than `count` if there is no room.
 * The caller supplies a dedicated rng so terrain generation is unaffected.
 */
export function placeEnemies(
  map: FloorMap,
  count: number,
  types: readonly EnemyTypeId[],
  rng: Rng,
  limits: PlacementLimits = {},
): EnemySpawn[] {
  if (count <= 0 || types.length === 0) return [];
  const { width } = map;
  const fields = floorFields(map);
  const { route, fromStart, exitIndex } = fields;

  // taken[i] = 1: an enemy already uses tile i. Everything else that is walkable and far enough
  // from the start is usable by a spear; `open` also excludes the route (for the other types).
  const taken = new Uint8Array(map.tiles.length);
  const roomy = (i: number): boolean =>
    isWalkable(map.tiles[i] as number) &&
    i !== exitIndex &&
    (fromStart[i] as number) >= MIN_ENEMY_START_DISTANCE && // also rejects unreachable (-1)
    !taken[i];
  const open = (i: number): boolean => roomy(i) && !route.has(i);
  const ctx: PlaceContext = { ...fields, taken, roomy, open };

  const candidates: number[] = [];
  for (let i = 0; i < map.tiles.length; i++) if (open(i)) candidates.push(i);

  const weightOf = limits.weightOf ?? ((t: EnemyTypeId) => ENEMY_DEFS[t].weight);
  const budget = limits.budget ?? Infinity;
  const maxHunters = limits.maxHunterTypes ?? Infinity;
  const counts = new Map<EnemyTypeId, number>();
  let spent = 0;
  const spawns: EnemySpawn[] = [];
  while (spawns.length < count && spent < budget && candidates.length > 0) {
    const pick = rng.int(candidates.length);
    const cell = candidates[pick] as number;
    candidates[pick] = candidates[candidates.length - 1] as number; // swap-remove
    candidates.pop();
    if (!open(cell)) continue; // already taken by a segment

    // Once a type has its share of the floor it is no longer drawn.
    const hunters = new Set(spawns.filter((s) => ENEMY_DEFS[s.type].hunter).map((s) => s.type));
    const drawable = types.filter(
      (t) =>
        (counts.get(t) ?? 0) < ENEMY_DEFS[t].maxPerFloor(map.floorNumber) &&
        // A new kind of hunter only while the floor has room for another kind.
        !(ENEMY_DEFS[t].hunter && !hunters.has(t) && hunters.size >= maxHunters),
    );
    if (drawable.length === 0) break;
    const type = weightedType(drawable, rng, weightOf);

    const result = PLACERS[ENEMY_DEFS[type].placement].place(ctx, type, cell, rng, spawns);
    if (!result) continue; // no room (or no fair placement) here: try another tile

    // A placer may hand back several spawns that belong together (a pendulum pair).
    for (const spawn of Array.isArray(result) ? result : [result]) {
      for (const c of spawnReach(spawn, map)) taken[c.y * width + c.x] = 1;
      counts.set(type, (counts.get(type) ?? 0) + 1);
      spent += ENEMY_DEFS[type].cost;
      spawns.push(spawn);
    }
  }
  return spawns;
}
