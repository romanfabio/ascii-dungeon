import { ENEMY_DEFS } from './enemy-defs';
import { isEnemy, type Enemy } from './entity';
import { type GameState } from './game-state';
import { DX, DY, type Point } from './geometry';
import { bfsDistances } from './pathfinding';

/**
 * Tiles an enemy cannot walk through: the bodies of enemies that block others (Bloodstones, other
 * chasers) and any `solid` tiles. Patrollers and spears are ignored: they move, and hitting them is
 * the player's problem, not the hunter's.
 */
export function blockersFor(self: Enemy, state: GameState): Set<number> {
  const blocked = new Set<number>();
  for (const e of state.entities) {
    if (!isEnemy(e) || e === self) continue;
    const behavior = ENEMY_DEFS[e.type].behavior;
    if (
      behavior === 'none' ||
      behavior === 'chase' ||
      behavior === 'sleep' ||
      behavior === 'gate' // shut: a wall; open: its cells are empty
    ) {
      for (const c of e.cells) blocked.add(c.y * state.floor.width + c.x);
    } else if (behavior === 'ambush') {
      blocked.add(e.pos.y * state.floor.width + e.pos.x); // its strike tiles are not walls
    }
    for (const c of e.solid) blocked.add(c.y * state.floor.width + c.x);
  }
  return blocked;
}

/**
 * Walking distances from an enemy's home tile (-1: unreachable), cached on the enemy the first time
 * it is needed. A leash is "field value <= radius". Kept out of `memory`, which holds numbers only.
 */
export function homeField(enemy: Enemy, state: GameState): Int16Array {
  enemy.field ??= Int16Array.from(
    bfsDistances(state.floor, { x: enemy.memory.hx as number, y: enemy.memory.hy as number }),
  );
  return enemy.field;
}

/**
 * Did the player's last turn move them? A wait repeats the tile in `state.trail`; the first turn
 * after a respawn compares with the start tile. Used for noise: waiting is silent.
 */
export function playerMoved(state: GameState): boolean {
  const { trail } = state;
  const last = trail[trail.length - 1];
  if (!last) return false;
  const before = trail.length >= 2 ? (trail[trail.length - 2] as Point) : state.floor.start;
  return last.x !== before.x || last.y !== before.y;
}

/** The neighbour of `from` with the smallest distance, if it is closer than `from` itself. */
export function stepDownhill(
  dist: Int32Array,
  width: number,
  height: number,
  from: Point,
): Point | null {
  let best = dist[from.y * width + from.x] as number;
  if (best <= 0) return null; // already there, or cut off
  let next: Point | null = null;
  for (let i = 0; i < 4; i++) {
    const x = from.x + (DX[i] as number);
    const y = from.y + (DY[i] as number);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const d = dist[y * width + x] as number;
    if (d >= 0 && d < best) {
      best = d;
      next = { x, y };
    }
  }
  return next;
}

/**
 * Moves `enemy` one tile along the shortest path to `target` (breadth-first distances from the
 * target, ties broken N, E, S, W). It stays put when it is already there or cut off. Returns whether
 * it moved. Uses no randomness.
 */
export function stepToward(
  enemy: Enemy,
  state: GameState,
  target: Point,
  blockers: ReadonlySet<number> = blockersFor(enemy, state),
): boolean {
  const { floor } = state;
  const dist = bfsDistances(floor, target, blockers);
  const next = stepDownhill(dist, floor.width, floor.height, enemy.pos);
  if (!next) return false;
  enemy.pos = next;
  enemy.cells = [{ ...next }];
  return true;
}
