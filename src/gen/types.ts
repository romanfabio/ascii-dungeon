import { type EnemyTypeId } from '../core/enemy-defs';

export type GeneratorKind = 'rooms-and-mazes' | 'growing-tree';

export interface GeneratorParams {
  floor: number;
  /** Odd; the map is size x size. */
  size: number;
  generator: GeneratorKind;
  /** Growing Tree: 1 = recursive backtracker (long corridors), 0 = Prim-like (short dead ends). */
  newestBias: number;
  /** Chance that each dead end is opened into a neighbouring corridor (adds loops). */
  braidFactor: number;
  /** Fraction of dead-end corridors removed (rooms-and-mazes only). */
  deadEndPruning: number;
  /** Rooms-and-mazes: how many random rooms to try to place. */
  roomAttempts: number;
  /** Rooms-and-mazes: chance of an extra door between two already-joined regions. */
  extraConnectorChance: number;
  /** Player sight radius in tiles. */
  sightRadius: number;
  /** 0..1: where on the sorted start-distance list the exit is placed (1 = farthest). */
  exitPercentile: number;
  /** How many enemies to place (fewer if the floor has no room for them). */
  enemyCount: number;
  /** Enemy types that may appear on this floor. */
  enemyTypes: EnemyTypeId[];
}
