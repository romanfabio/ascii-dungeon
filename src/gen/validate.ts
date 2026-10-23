import { ENEMY_DEFS, fixedTiles, spawnReach, type EnemyTypeId } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { pointsEqual } from '../core/geometry';
import { bfsDistances, shortestPath } from '../core/pathfinding';
import { isWalkable, Tile } from '../core/tiles';
import { routeCells } from './placers/fields';
import { MIN_ENEMY_START_DISTANCE, PLACERS, type ValidateContext } from './placers';
import { MAX_SHADOW_LAG, shadowCatches } from './shadow';
import { routeSurvivable, routeWalkOf } from './spear-timing';

/**
 * Enemy rules: every tile an enemy can occupy (a patroller's segment, a spear's full reach) is
 * walkable, away from the start and exit and used by no other enemy; no type exceeds its cap for
 * the floor; and each placer's own rules hold (shape, home distance, base off the route).
 * `footprint` enemies (Bloodstones, patrollers) must leave the exit reachable with all their tiles
 * blocked, and the route must stay walkable against the timed hazards.
 */
function validateSpawns(map: FloorMap, distFromStart: Int32Array): string[] {
  const problems: string[] = [];
  const { width, tiles } = map;
  const used = new Set<number>();
  const blocked = new Set<number>(); // tiles that are never free: only `footprint` types
  let route: Set<number> | null = null;
  const ctx: ValidateContext = {
    map,
    fromStart: distFromStart,
    route: () => (route ??= new Set(routeCells(map))),
  };
  const counts = new Map<EnemyTypeId, number>();
  for (const spawn of map.spawns) {
    const { pos } = spawn;
    const def = ENEMY_DEFS[spawn.type];
    const where = `${spawn.type} at ${pos.x},${pos.y}`;
    counts.set(spawn.type, (counts.get(spawn.type) ?? 0) + 1);
    const rules = PLACERS[def.placement].validate(ctx, spawn, where);
    problems.push(...rules.problems);
    if (rules.fatal) continue;
    for (const c of spawnReach(spawn, map)) {
      const i = c.y * width + c.x;
      if (!isWalkable(tiles[i] as number)) problems.push(`${where} is not on a walkable tile`);
      if (pointsEqual(c, map.start) || pointsEqual(c, map.exit)) {
        problems.push(`${where} is on the start or exit`);
      }
      if ((distFromStart[i] as number) < MIN_ENEMY_START_DISTANCE) {
        problems.push(`${where} is too close to the start`);
      }
      if (used.has(i)) problems.push(`two enemies share ${c.x},${c.y}`);
      used.add(i);
      // Timed and hunting types move, so the tile they start on is not permanently blocked.
    }
  }
  for (const spawn of map.spawns) {
    for (const c of fixedTiles(spawn)) blocked.add(c.y * width + c.x);
  }
  for (const [type, n] of counts) {
    if (n > ENEMY_DEFS[type].maxPerFloor(map.floorNumber)) {
      problems.push(`${n} ${type}s on floor ${map.floorNumber}`);
    }
  }
  if (blocked.size > 0) {
    const dist = bfsDistances(map, map.start, blocked);
    if ((dist[map.exit.y * width + map.exit.x] as number) < 0) {
      problems.push('enemies block every route to the exit');
    }
  }
  if (!routeSurvivable(map, map.spawns)) problems.push('timed enemies make the route impassable');
  return problems;
}

/**
 * Floor flags: a Shadow only from its unlock floor on, with a lag the trail can hold, and only
 * where the fewest-turns way past the timed enemies never stands still where it arrives.
 */
function validateDirectives(map: FloorMap): string[] {
  const lag = map.directives.shadow;
  if (lag === undefined) return [];
  const problems: string[] = [];
  if (map.floorNumber < ENEMY_DEFS.shadow.minFloor) {
    problems.push(`a shadow on floor ${map.floorNumber}`);
  }
  if (!Number.isInteger(lag) || lag < 1 || lag > MAX_SHADOW_LAG) {
    problems.push(`bad shadow lag ${lag}`);
    return problems;
  }
  const walk = routeWalkOf(map, map.spawns);
  if (!walk || shadowCatches(walk, lag)) problems.push('the shadow catches a player waiting');
  return problems;
}

/**
 * Pickup rules: on a walkable tile away from the start, the exit and every tile an enemy can
 * occupy, off the shortest route, and reachable with the fixed enemies blocked.
 */
function validatePickups(map: FloorMap, distFromStart: Int32Array): string[] {
  const problems: string[] = [];
  if (map.pickups.length === 0) return problems;
  const { width, tiles } = map;
  const route = new Set(shortestPath(map, map.start, map.exit).map((p) => p.y * width + p.x));
  const enemyCells = new Set<number>();
  const fixed = new Set<number>();
  for (const spawn of map.spawns) {
    for (const c of spawnReach(spawn, map)) enemyCells.add(c.y * width + c.x);
    for (const c of fixedTiles(spawn)) fixed.add(c.y * width + c.x);
  }
  const reachable = bfsDistances(map, map.start, fixed);
  const seen = new Set<number>();
  for (const { type, pos } of map.pickups) {
    const i = pos.y * width + pos.x;
    const where = `${type} pickup at ${pos.x},${pos.y}`;
    if (!isWalkable(tiles[i] as number)) problems.push(`${where} is not on a walkable tile`);
    if (pointsEqual(pos, map.start) || pointsEqual(pos, map.exit)) {
      problems.push(`${where} is on the start or exit`);
    }
    if ((distFromStart[i] as number) < MIN_ENEMY_START_DISTANCE) {
      problems.push(`${where} is too close to the start`);
    }
    if (route.has(i)) problems.push(`${where} is on the shortest route`);
    if (enemyCells.has(i)) problems.push(`${where} shares a tile with an enemy`);
    if ((reachable[i] as number) < 0) problems.push(`${where} cannot be reached`);
    if (seen.has(i)) problems.push(`two pickups share ${pos.x},${pos.y}`);
    seen.add(i);
  }
  return problems;
}

/** Returns a list of problems with a generated floor (empty = valid). */
export function validateFloor(map: FloorMap, opts: { minPathLength?: number } = {}): string[] {
  const problems: string[] = [];
  const { width, height, tiles } = map;

  if (width % 2 === 0 || height % 2 === 0)
    problems.push(`dimensions ${width}x${height} are not odd`);

  let borderOk = true;
  for (let x = 0; x < width && borderOk; x++) {
    if (tiles[x] !== Tile.Wall || tiles[(height - 1) * width + x] !== Tile.Wall) borderOk = false;
  }
  for (let y = 0; y < height && borderOk; y++) {
    if (tiles[y * width] !== Tile.Wall || tiles[y * width + width - 1] !== Tile.Wall)
      borderOk = false;
  }
  if (!borderOk) problems.push('border is not solid wall');

  const startTile = tiles[map.start.y * width + map.start.x] as number;
  const exitTile = tiles[map.exit.y * width + map.exit.x] as number;
  if (!isWalkable(startTile)) problems.push('start is not walkable');
  if (exitTile !== Tile.Exit) problems.push('exit tile is not an Exit tile');
  if (pointsEqual(map.start, map.exit)) problems.push('start and exit are the same tile');

  let exits = 0;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === Tile.Exit) exits++;
  if (exits !== 1) problems.push(`expected exactly 1 exit tile, found ${exits}`);

  const dist = bfsDistances(map, map.start);
  const exitDist = dist[map.exit.y * width + map.exit.x] as number;
  if (exitDist < 0) problems.push('exit is not reachable from start');
  if (exitDist !== map.optimalPathLength) {
    problems.push(
      `optimalPathLength ${map.optimalPathLength} does not match BFS distance ${exitDist}`,
    );
  }

  let unreachable = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (isWalkable(tiles[i] as number) && dist[i] === -1) unreachable++;
  }
  if (unreachable > 0) problems.push(`${unreachable} walkable tiles are unreachable`);

  if (opts.minPathLength !== undefined && exitDist < opts.minPathLength) {
    problems.push(`path length ${exitDist} is below the minimum ${opts.minPathLength}`);
  }
  problems.push(...validateSpawns(map, dist));
  problems.push(...validateDirectives(map));
  problems.push(...validatePickups(map, dist));
  return problems;
}
