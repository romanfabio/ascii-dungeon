import { markVisibleEnemiesSeen, placeFloorEnemies } from './enemies';
import { createPlayer, type Entity } from './entity';
import { type FloorMap } from './floor-map';
import { updateVisibility } from './fov';
import { type Point } from './geometry';
import { MAX_LIVES } from './lives';
import { createPickup, markVisiblePickupsSeen, type Pickup } from './pickups';
import { createRng, type Rng } from './rng';

export interface GameStats {
  floorSteps: number;
  totalSteps: number;
  floorTimeMs: number;
  totalTimeMs: number;
  /** Lives lost so far in this run. */
  deaths: number;
}

export interface GameState {
  runSeed: string;
  floor: FloorMap;
  player: Entity;
  /** Everything other than the player: the floor's enemies (items later). */
  entities: Entity[];
  /** Pickups still lying on the floor (a taken one is removed). */
  pickups: Pickup[];
  /** 1 = currently in the player's line of sight. */
  visible: Uint8Array;
  sightRadius: number;
  stats: GameStats;
  turn: number;
  /** Lives left in the run; carried across floors. */
  lives: number;
  maxLives: number;
  /** > 0 right after a respawn: moving enemies cannot hit yet. */
  graceTurns: number;
  /**
   * Random stream for enemy behaviours, seeded from the run seed and floor number, and re-seeded
   * with the attempt number on every respawn (so attempt N of a floor always plays the same).
   */
  enemyRng: Rng;
  /**
   * The player's tile after every turn that took time (a wait repeats the tile), newest last, at
   * most TRAIL_LENGTH long. Cleared on respawn. Read by `shovePlayer` and the Shadow.
   */
  trail: Point[];
  /** 0 on a fresh floor, plus one for every life lost on it. */
  attempt: number;
  /** > 0: the sight radius is clamped (`effectiveSight`). Counts down per turn that takes time. */
  blindTurns: number;
  /** The id the next enemy spawned at runtime gets (`spawnEnemy`). */
  nextEnemyId: number;
}

/** The trail keeps this many tiles. */
export const TRAIL_LENGTH = 64;

export interface FloorStartOptions {
  sightRadius?: number;
  /** Carried over from the previous floor. */
  totalSteps?: number;
  totalTimeMs?: number;
  lives?: number;
  deaths?: number;
  /** Floors whose life pickup this run has already taken: it does not lie there again. */
  lifePickups?: readonly number[];
}

export const DEFAULT_SIGHT_RADIUS = 8;

/** Starts a floor with the player on its start tile and the first field of view computed. */
export function createGameState(
  runSeed: string,
  floor: FloorMap,
  opts: FloorStartOptions = {},
): GameState {
  const state: GameState = {
    runSeed,
    floor,
    player: createPlayer(floor.start),
    entities: [],
    pickups: opts.lifePickups?.includes(floor.floorNumber) ? [] : floor.pickups.map(createPickup),
    visible: new Uint8Array(floor.width * floor.height),
    sightRadius: opts.sightRadius ?? DEFAULT_SIGHT_RADIUS,
    stats: {
      floorSteps: 0,
      totalSteps: opts.totalSteps ?? 0,
      floorTimeMs: 0,
      totalTimeMs: opts.totalTimeMs ?? 0,
      deaths: opts.deaths ?? 0,
    },
    turn: 0,
    lives: Math.min(MAX_LIVES, Math.max(1, opts.lives ?? MAX_LIVES)),
    maxLives: MAX_LIVES,
    graceTurns: 0,
    enemyRng: createRng(`${runSeed}:${floor.floorNumber}:behavior`),
    trail: [],
    attempt: 0,
    blindTurns: 0,
    nextEnemyId: 1,
  };
  placeFloorEnemies(state);
  updateVisibility(state);
  markVisibleEnemiesSeen(state);
  markVisiblePickupsSeen(state);
  return state;
}
