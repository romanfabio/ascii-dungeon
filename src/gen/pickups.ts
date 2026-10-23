import { type FloorMap } from '../core/floor-map';
import { type PickupSpawn } from '../core/pickups';
import { type Rng } from '../core/rng';
import { distanceFromRoute } from './placers/fields';
import { enemyTileSets, pickDeadEndOffRoute, PREFERRED_PICKUP_DETOUR } from './placers/decoy';

// Moved to the placers (the Mimic shares them); still importable from here.
export { distanceFromRoute, PREFERRED_PICKUP_DETOUR };

/**
 * Picks where the floor's life pickup lies: off the shortest start-exit route and at least
 * PREFERRED_PICKUP_DETOUR steps from it (relaxed on small floors), in a dead end when one
 * qualifies. It is never on the exit or within MIN_ENEMY_START_DISTANCE of the start, never on a
 * tile an enemy can occupy, and always reachable with every fixed enemy tile (Bloodstones,
 * patrollers) blocked (spears and chasers move, and the pickup is optional anyway).
 * Run after `placeEnemies`, on its own rng stream, so terrain and enemies never change.
 */
export function placeLifePickup(map: FloorMap, rng: Rng): PickupSpawn | null {
  const pos = pickDeadEndOffRoute(map, rng, enemyTileSets(map));
  return pos ? { type: 'life', pos } : null;
}
