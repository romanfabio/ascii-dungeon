import { type EnemySpawn } from './floor-map';
import { type Point } from './geometry';
import { type TileField } from './pathfinding';
import { armTiles, directionIndex, segmentPeriod, segmentTipOffset, spawnCells } from './segment';

/**
 * A hazard that is a pure function of the turn number, which is what lets the generator prove a
 * floor can be walked without simulating the game (`gen/hazard-timing.ts`). Every timed type
 * (spear, and later sentinel, sweeper, pendulum, bouncer) provides one through `EnemyDef.hazard`.
 */
export interface PeriodicHazard {
  /** Turns of one full cycle; one of HAZARD_PERIODS, so every joint cycle divides 120. */
  period: number;
  /** The tiles that hurt after `phase` enemy turns (phase 0 = the floor start or a respawn). */
  hurtAt(phase: number): readonly Point[];
}

/**
 * The only cycle lengths allowed, so the joint cycle of any set of hazards divides 120. (2 is the
 * two-tile spear: the generator never builds one, but the proof accepts it.)
 */
export const HAZARD_PERIODS: readonly number[] = [2, 4, 6, 8, 10, 12];

/** A sentinel's beam reaches this many tiles from the tile in front of it. */
export const SENTINEL_RANGE = 7;
/** The shortest beam the generator builds (a shorter run is not worth a turret). */
export const SENTINEL_MIN_BEAM = 4;
/** Turns the beam tiles are marked before it fires. */
export const SENTINEL_CHARGE_TURNS = 2;
/** A sentinel's cycle length, picked from its position so the ASCII format stays lossless. */
export const SENTINEL_PERIODS: readonly number[] = [6, 8, 10];

export function sentinelPeriod(pos: Point): number {
  return SENTINEL_PERIODS[(pos.x + pos.y) % SENTINEL_PERIODS.length] as number;
}

/** Where a sentinel is in its cycle after `phase` enemy turns: idle, charging (marked) or firing. */
export function sentinelStage(period: number, phase: number): 'idle' | 'charge' | 'fire' {
  const k = ((phase % period) + period) % period;
  if (k === period - 1) return 'fire';
  return k >= period - 1 - SENTINEL_CHARGE_TURNS ? 'charge' : 'idle';
}

/** A sentinel: the beam (every spawn tile but the body) hurts on the last phase of its cycle. */
export function sentinelHazard(spawn: EnemySpawn): PeriodicHazard {
  const beam = spawnCells(spawn).slice(1);
  const period = sentinelPeriod(spawn.pos);
  return { period, hurtAt: (phase) => (sentinelStage(period, phase) === 'fire' ? beam : []) };
}

/** A bouncer's cycle: closed on phases 0..BOUNCER_CLOSED-1, open (and then closing) on the rest. */
export const BOUNCER_PERIOD = 8;
export const BOUNCER_CLOSED = 5;

/** Is a bouncer shut after `phase` enemy turns? */
export function bouncerClosed(phase: number): boolean {
  return ((phase % BOUNCER_PERIOD) + BOUNCER_PERIOD) % BOUNCER_PERIOD < BOUNCER_CLOSED;
}

/**
 * A bouncer: its tile "hurts" (blocks, and shoves) while it is closed. Touching it is never lethal,
 * but the route proof treats it like any hazard, so a floor is only kept if the gate can be
 * passed by waiting for it to open, never by being thrown back.
 */
export function bouncerHazard(spawn: EnemySpawn): PeriodicHazard {
  const tile = [{ ...spawn.pos }];
  return { period: BOUNCER_PERIOD, hurtAt: (phase) => (bouncerClosed(phase) ? tile : []) };
}

/** A sweeper's arm is this many tiles long at most (and at least), and turns a quarter each turn. */
export const SWEEPER_MIN_ARM = 2;
export const SWEEPER_MAX_ARM = 4;
export const SWEEPER_PERIOD = 4;

/** The arm length of a sweeper spawn: the distance from its pivot to the arm tip. */
export function sweeperArmLength(spawn: EnemySpawn): number {
  const end = spawn.end ?? spawn.pos;
  return Math.abs(end.x - spawn.pos.x) + Math.abs(end.y - spawn.pos.y);
}

/** The direction (0 N ... 3 W) the arm points after `phase` turns: clockwise from its start. */
export function sweeperDirection(spawn: EnemySpawn, phase: number): number {
  const d0 = directionIndex(spawn.pos, spawn.end ?? spawn.pos);
  return (d0 + (((phase % SWEEPER_PERIOD) + SWEEPER_PERIOD) % SWEEPER_PERIOD)) % 4;
}

/** A sweeper: the arm in each of the four directions in turn; walls cut an arm short. */
export function sweeperHazard(spawn: EnemySpawn, map: TileField): PeriodicHazard {
  const len = sweeperArmLength(spawn);
  const arms = [0, 1, 2, 3].map((d) => armTiles(map, spawn.pos, d, len));
  return {
    period: SWEEPER_PERIOD,
    hurtAt: (phase) => arms[sweeperDirection(spawn, phase)] as Point[],
  };
}

/** A spear: base out to the tip, which bounces along the reach (every tile in between hurts). */
export function spearHazard(spawn: EnemySpawn): PeriodicHazard {
  const cells = spawnCells(spawn);
  return {
    period: segmentPeriod(cells.length),
    hurtAt: (phase) => cells.slice(0, segmentTipOffset(cells.length, phase) + 1),
  };
}

/**
 * A pendulum: a patroller's walk, so the only tile that hurts is the one it stands on. Its tip
 * bounces along the lane exactly like a spear's, which is why the cycle is `2 (len - 1)` turns.
 */
export function pendulumHazard(spawn: EnemySpawn): PeriodicHazard {
  const cells = spawnCells(spawn);
  return {
    period: segmentPeriod(cells.length),
    hurtAt: (phase) => [cells[segmentTipOffset(cells.length, phase)] as Point],
  };
}
