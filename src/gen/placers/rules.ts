import { CHASER_HOME_DISTANCE } from '../../core/enemy-defs';

/** Enemies are never placed closer than this (walking distance) to the start. */
export const MIN_ENEMY_START_DISTANCE = 6;
/** A chaser's home is at least this far (walking) from the start, so it never starts near you. */
export const MIN_CHASER_START_DISTANCE = CHASER_HOME_DISTANCE;
/** A patrol segment is a straight run of this many tiles (both ends included). */
export const MIN_PATROL_LENGTH = 3;
export const MAX_PATROL_LENGTH = 7;
/**
 * A pendulum lane is 4-7 tiles: a 3-tile lane that meets the route in its middle is on it every
 * other turn, so it could never be crossed.
 */
export const MIN_PENDULUM_LENGTH = 4;
export const MAX_PENDULUM_LENGTH = 7;
/** The two lanes of a pair meet the route this many route steps apart (at least, at most). */
export const MIN_PENDULUM_GAP = 2;
export const MAX_PENDULUM_GAP = 8;
/** A spear's fully extended length, base and tip included. */
export const MIN_SPEAR_LENGTH = 3;
export const MAX_SPEAR_LENGTH = 6;
