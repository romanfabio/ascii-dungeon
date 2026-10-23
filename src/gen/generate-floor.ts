import { buildFloorMap, type FloorMap } from '../core/floor-map';
import { Grid } from '../core/grid';
import { createRng, hashString, type Rng } from '../core/rng';
import { Tile } from '../core/tiles';
import { braid, pruneDeadEnds } from './dead-ends';
import { hasLifePickup, limitsForFloor, minPathLength, paramsForFloor } from './difficulty';
import { fillWithMazes } from './growing-tree';
import { placeEnemies } from './enemies';
import { placeMimic } from './mimics';
import { placeLifePickup } from './pickups';
import { placeStartAndExit } from './placement';
import { dropCatchingHunters } from './safe-walk';
import { placeShadow } from './shadow';
import { carveRoomsAndMazes } from './rooms-and-mazes';
import { type GeneratorParams } from './types';
import { validateFloor } from './validate';

/**
 * Bump whenever generator output changes for the same seed (snapshot tests will fail).
 * Saves store this so a changed generator is detected.
 */
// 2: enemies; 3: patrollers; 4: spears; 5: 100-floor curve; 6: life pickups; 7: chasers
export const GENERATOR_VERSION = 21;

const MAX_ATTEMPTS = 10;

function carve(params: GeneratorParams, rng: Rng): Grid {
  const grid = new Grid(params.size, params.size, Tile.Wall);
  if (params.generator === 'rooms-and-mazes') {
    carveRoomsAndMazes(grid, rng, params);
    pruneDeadEnds(grid, rng, params.deadEndPruning);
  } else {
    fillWithMazes(grid, rng, params.newestBias);
  }
  braid(grid, rng, params.braidFactor);
  return grid;
}

function tryBuild(grid: Grid, rng: Rng, params: GeneratorParams, seed: number): FloorMap | null {
  const placement = placeStartAndExit(grid, rng, params.exitPercentile);
  if (!placement) return null;
  const map = buildFloorMap(grid.data, grid.width, grid.height, placement.start, placement.exit, {
    seed,
    floorNumber: params.floor,
  });
  return validateFloor(map, { minPathLength: minPathLength(params) }).length === 0 ? map : null;
}

/**
 * Adds the enemies, then the life pickup, to a finished terrain. Each uses its own rng stream so
 * the terrain (and the enemies, for the pickup) never change. If the result somehow fails
 * validation the floor simply has no enemies, and no pickup that fails it.
 */
function withEnemies(
  map: FloorMap,
  key: string,
  runSeed: string,
  params: GeneratorParams,
): FloorMap {
  const rng = createRng(`${key}:enemies`);
  map.spawns = placeEnemies(
    map,
    params.enemyCount,
    params.enemyTypes,
    rng,
    limitsForFloor(params.floor),
  );
  if (validateFloor(map).length > 0) map.spawns = [];

  if (hasLifePickup(params.floor)) {
    const pickup = placeLifePickup(map, createRng(`${key}:pickups`));
    if (pickup) map.pickups = [pickup];
    if (validateFloor(map).length > 0) map.pickups = [];
  }

  // The Mimic imitates the pickup, so it only appears where there is no real one.
  const mimic = placeMimic(map, createRng(`${key}:mimic`));
  if (mimic) {
    map.spawns = [...map.spawns, mimic];
    if (validateFloor(map).length > 0) map.spawns = map.spawns.filter((s) => s !== mimic);
  }

  // No hunter may catch a first walk down the proved way (see `dropCatchingHunters`).
  dropCatchingHunters(map, runSeed);

  // The Shadow is a flag on the floor, decided last: it needs the final enemies to check the way through.
  const shadow = placeShadow(map, createRng(`${key}:shadow`));
  if (shadow !== null) {
    map.directives.shadow = shadow;
    if (validateFloor(map).length > 0) delete map.directives.shadow;
  }
  return map;
}

/**
 * Deterministically generates a floor: the same run seed and floor number always give the same
 * map. Every returned map passes validateFloor (exit reachable, no isolated pockets, ...).
 */
export function generateFloor(runSeed: string, floor: number): FloorMap {
  const params = paramsForFloor(floor);
  const key = `${runSeed}:${params.floor}`;
  const rng = createRng(key);
  const seed = hashString(key)[0];

  // Retries keep drawing from the same rng stream, so the result stays deterministic.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const map = tryBuild(carve(params, rng), rng, params, seed);
    if (map) return withEnemies(map, key, runSeed, params);
  }

  // A perfect maze always passes validation.
  const fallback: GeneratorParams = {
    ...params,
    generator: 'growing-tree',
    newestBias: 1,
    braidFactor: 0,
    exitPercentile: 1,
  };
  const map = tryBuild(carve(fallback, rng), rng, fallback, seed);
  if (!map) throw new Error(`generateFloor: could not build floor ${floor} for seed ${runSeed}`);
  return withEnemies(map, key, runSeed, fallback);
}
