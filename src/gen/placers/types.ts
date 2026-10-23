import { type EnemyTypeId } from '../../core/enemy-defs';
import { type EnemySpawn, type FloorMap } from '../../core/floor-map';
import { type Rng } from '../../core/rng';
import { type FloorFields } from './fields';

/** What a placer sees while it fills a floor. */
export interface PlaceContext extends FloorFields {
  /** 1 = an enemy already uses this tile. */
  taken: Uint8Array;
  /** Walkable, off the start and exit, far enough from the start and not taken. */
  roomy(i: number): boolean;
  /** `roomy` and off the shortest route. */
  open(i: number): boolean;
}

/** One spawn, or several that only make sense together (the two lanes of a pendulum pair). */
export type Placed = EnemySpawn | EnemySpawn[] | null;

/** What a placer sees while it checks a finished floor. */
export interface ValidateContext {
  map: FloorMap;
  fromStart: Int32Array;
  /** The shortest route as tile indices; computed on first use. */
  route(): ReadonlySet<number>;
}

/**
 * The geometry of one kind of enemy (`EnemyDef.placement`): where it may stand and what it
 * covers. `placeEnemies` keeps the drawing loop (types, caps, budget) and asks the placer.
 */
export interface Placer {
  /**
   * Builds the spawn for `type` standing on `cell`, or null when this tile will not do (no room,
   * too close to the start, no fair timing). `placed` are the spawns accepted so far.
   */
  place(
    ctx: PlaceContext,
    type: EnemyTypeId,
    cell: number,
    rng: Rng,
    placed: readonly EnemySpawn[],
  ): Placed;
  /**
   * Rules of this kind that a spawn on a finished floor must obey. Returns problems; a non-empty
   * result for a bad shape also stops the generic per-tile checks for that spawn (`fatal`).
   */
  validate(
    ctx: ValidateContext,
    spawn: EnemySpawn,
    where: string,
  ): { problems: string[]; fatal?: boolean };
}
