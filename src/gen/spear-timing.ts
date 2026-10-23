import { ENEMY_DEFS } from '../core/enemy-defs';
import { type EnemySpawn, type FloorMap } from '../core/floor-map';
import { type Point } from '../core/geometry';
import { type PeriodicHazard } from '../core/hazards';
import { routeSurvivable as hazardsSurvivable, routeWalk } from './hazard-timing';

/** The timed hazards among some spawns (every type whose def provides one). */
export function hazardsOf(spawns: readonly EnemySpawn[], map: FloorMap): PeriodicHazard[] {
  return spawns.flatMap((s) => {
    const hazard = ENEMY_DEFS[s.type].hazard;
    return hazard ? [hazard(s, map)] : [];
  });
}

/**
 * Can the player walk the shortest route without touching a timed enemy (the spears, and later the
 * other timed types)? A thin wrapper over the type-agnostic proof in `hazard-timing.ts`.
 */
export function routeSurvivable(map: FloorMap, spawns: readonly EnemySpawn[]): boolean {
  return hazardsSurvivable(map, hazardsOf(spawns, map), noStopOf(spawns, map));
}

/** Tiles where the player must not stand still (next to a Lurker). */
function noStopOf(spawns: readonly EnemySpawn[], map: FloorMap): Point[] {
  return spawns.flatMap((s) => ENEMY_DEFS[s.type].noStop?.(s, map) ?? []);
}

/** A fewest-turns walk of the shortest route past the timed enemies (see `routeWalk`), or null. */
export function routeWalkOf(map: FloorMap, spawns: readonly EnemySpawn[]): Point[] | null {
  return routeWalk(map, hazardsOf(spawns, map), noStopOf(spawns, map));
}
