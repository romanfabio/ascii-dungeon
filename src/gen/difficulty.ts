import { ENEMY_DEFS, enemyTypesForFloor, type EnemyTypeId } from '../core/enemy-defs';
import { type GeneratorParams } from './types';

export const MAX_SIZE = 61;
/** The run has this many floors: clearing the last one wins. */
export const FINAL_FLOOR = 100;
/** Floor at which difficulty stops increasing (the last one). */
export const MAX_DIFFICULTY_FLOOR = FINAL_FLOOR;
/** The map reaches its largest size on this floor. */
export const MAX_SIZE_FLOOR = 60;
/** Floors up to and including this one use rooms and corridors. */
export const LAST_ROOMS_FLOOR = 10;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Most enemies on a floor (reached on the final floor). */
export const MAX_ENEMIES = 24;

/** About this share of the eligible floors has a Mimic (see `hasMimicFloor`). */
export const MIMIC_CHANCE = 1 / 3;

/** The Mimic imitates the life pickup, so it never appears on a floor that has a real one. */
export function mimicEligible(floor: number): boolean {
  return floor >= ENEMY_DEFS.mimic.minFloor && !hasLifePickup(floor);
}

/** A life pickup lies on every this-many-th floor (10, 20 ... 90); the final floor has none. */
export const LIFE_PICKUP_EVERY = 10;

export function hasLifePickup(floor: number): boolean {
  return floor % LIFE_PICKUP_EVERY === 0 && floor < FINAL_FLOOR;
}

// Per-type caps live in the enemy defs next to the unlock floor (`EnemyDef.maxPerFloor`).
export { CHASER_CROWD_FLOOR, MAX_CHASERS_LATE } from '../core/enemy-defs';

export function maxChasersForFloor(floor: number): number {
  return ENEMY_DEFS.chaser.maxPerFloor(floor);
}

/** A floor may spend this many threat units per enemy it gets (`EnemyDef.cost` is the price). */
export const THREAT_PER_ENEMY = 1.6;
/** A type unlocked within this many floors has its weight multiplied by SPOTLIGHT_FACTOR. */
export const SPOTLIGHT_FLOORS = 3;
export const SPOTLIGHT_FACTOR = 4;

/**
 * The threat budget and the spotlight (a newly unlocked type is drawn SPOTLIGHT_FACTOR times as
 * often for SPOTLIGHT_FLOORS floors). They came on with the first new type, the Wanderer (M13).
 */
export const ROSTER_RULES_ACTIVE = true;

/**
 * A floor never has more than this many different hunter types (Wanderer, Sleeper, Chaser, Ghost,
 * Shade): late floors stay varied and readable instead of holding them all. (The Shadow does not
 * count: it can no longer take a life.)
 */
export const MAX_HUNTER_TYPES = 3;

/** Threat units a floor may spend; heavy types use it up faster than light ones. */
export function budgetForFloor(floor: number): number {
  return Math.round(THREAT_PER_ENEMY * enemyCountForFloor(floor));
}

/** Weight multiplier of a type on a floor: SPOTLIGHT_FACTOR just after it unlocks, else 1. */
export function spotlightWeight(type: EnemyTypeId, floor: number): number {
  const since = floor - ENEMY_DEFS[type].minFloor;
  return since >= 0 && since < SPOTLIGHT_FLOORS ? SPOTLIGHT_FACTOR : 1;
}

/** What `placeEnemies` is allowed to spend and how it weighs the types on a floor. */
export interface PlacementLimits {
  /** Stop drawing once the enemies placed cost at least this much (the last one may overshoot). */
  budget?: number;
  /** Spawn weight of a type; default is its def weight. */
  weightOf?: (type: EnemyTypeId) => number;
  /** At most this many different hunter types (`EnemyDef.hunter`) on the floor. */
  maxHunterTypes?: number;
}

export function limitsForFloor(floor: number): PlacementLimits {
  if (!ROSTER_RULES_ACTIVE) return {};
  return {
    budget: budgetForFloor(floor),
    weightOf: (type) => ENEMY_DEFS[type].weight * spotlightWeight(type, floor),
    maxHunterTypes: MAX_HUNTER_TYPES,
  };
}

/** None on floor 1; then 1 on floor 2, growing evenly to MAX_ENEMIES on the final floor. */
export function enemyCountForFloor(floor: number): number {
  if (floor <= 1) return 0;
  return Math.round(lerp(1, MAX_ENEMIES, clamp01((floor - 2) / (FINAL_FLOOR - 2))));
}

/** Odd map size: 21 on floor 1, growing in steps of 2 to MAX_SIZE on MAX_SIZE_FLOOR. */
export function sizeForFloor(floor: number): number {
  const steps = Math.round(((MAX_SIZE - 21) / 2) * clamp01((floor - 1) / (MAX_SIZE_FLOOR - 1)));
  return 21 + 2 * steps;
}

/** Maps a floor number (1-based) to generator parameters. All difficulty tuning lives here. */
export function paramsForFloor(floor: number): GeneratorParams {
  const f = Math.max(1, Math.floor(floor));
  const t = clamp01((f - 1) / (MAX_DIFFICULTY_FLOOR - 1));
  const size = sizeForFloor(f);
  const rooms = f <= LAST_ROOMS_FLOOR;
  const roomsT = clamp01((f - 1) / (LAST_ROOMS_FLOOR - 1));
  return {
    floor: f,
    size,
    generator: rooms ? 'rooms-and-mazes' : 'growing-tree',
    newestBias: lerp(0.25, 1, t),
    braidFactor: lerp(0.5, 0, t),
    deadEndPruning: rooms ? lerp(1, 0.6, roomsT) : 0,
    roomAttempts: rooms ? size * 2 : 0,
    extraConnectorChance: rooms ? lerp(0.08, 0.04, roomsT) : 0,
    sightRadius: Math.round(lerp(10, 4, t)),
    exitPercentile: lerp(0.75, 1, t),
    enemyCount: enemyCountForFloor(f),
    enemyTypes: enemyTypesForFloor(f),
  };
}

/** Shortest acceptable start -> exit walking distance for a generated floor. */
export function minPathLength(params: GeneratorParams): number {
  return Math.floor(params.size * 0.9);
}
