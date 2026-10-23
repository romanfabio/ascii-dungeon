import { type EnemySpawn, type FloorMap } from '../core/floor-map';
import { type Rng } from '../core/rng';
import { MIMIC_CHANCE, mimicEligible } from './difficulty';
import { enemyTileSets, pickDeadEndOffRoute } from './placers/decoy';

/**
 * Maybe a Mimic for this floor: about MIMIC_CHANCE of the eligible floors (from its unlock floor,
 * never one with a real life pickup) get one, in a dead end off the route like the pickup it
 * imitates, and far enough from the route that every tile it can strike is off it too.
 * Run after `placeEnemies` on its own rng stream, so terrain and the other enemies never change.
 */
export function placeMimic(map: FloorMap, rng: Rng): EnemySpawn | null {
  if (!mimicEligible(map.floorNumber)) return null;
  if (rng.next() >= MIMIC_CHANCE) return null;
  const pos = pickDeadEndOffRoute(map, rng, { ...enemyTileSets(map), minRouteDistance: 2 });
  return pos ? { type: 'mimic', pos } : null;
}
