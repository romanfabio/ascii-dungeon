import { ENEMY_DEFS } from './enemy-defs';
import { enemyAt } from './enemies';
import { type Enemy } from './entity';
import { type GameEvent } from './events';
import { updateVisibility } from './fov';
import { type GameState } from './game-state';
import { type Point } from './geometry';
import { loseLife } from './lives';

/** Turns the player stays blinded after touching a `blind` enemy (a proposal: see the roster plan). */
export const BLIND_TURNS = 25;
/** Tiles a `shove` enemy throws the player back along their own footsteps. */
export const SHOVE_TILES = 4;

/**
 * The player moves `tiles` steps back along their trail (or to the floor's start when the trail is
 * shorter). Takes no steps and costs no life. It never lands on a tile that hurts right now: the
 * destination walks forward along the trail until it finds a safe one, and falls back to the
 * start tile. The trail is cut to match, so shoving twice keeps going back.
 */
export function shovePlayer(state: GameState, tiles: number): void {
  const { trail, floor, player } = state;
  let index = trail.length - 1 - tiles;
  while (index >= 0 && index < trail.length - 1 && enemyAt(state, trail[index] as Point)) index++;
  const target = index >= 0 ? (trail[index] as Point) : floor.start;
  player.pos = { ...target };
  trail.length = Math.max(0, index + 1);
  updateVisibility(state);
}

/**
 * Something touched the player: apply what its type's `contact` says. `at` is the tile where it
 * happened (the player's own tile unless they walked into it). Always starts with `hitEnemy`.
 *
 * - `life`: lose a life (`lifeLost`, then `gameOver` on the last one).
 * - `blind`: the sight radius collapses for BLIND_TURNS turns; the enemy is consumed until the
 *   player respawns (its behaviour's `reset` brings it back).
 * - `shove`: thrown back SHOVE_TILES along the trail; no life lost.
 */
export function resolveContact(state: GameState, enemy: Enemy, at?: Point): GameEvent[] {
  const events: GameEvent[] = [
    { type: 'hitEnemy', enemyId: enemy.id, at: { ...(at ?? state.player.pos) } },
  ];
  switch (ENEMY_DEFS[enemy.type].contact) {
    case 'life':
      events.push(...loseLife(state));
      break;
    case 'blind':
      state.blindTurns = BLIND_TURNS;
      enemy.cells = [];
      enemy.solid = [];
      enemy.warn = [];
      enemy.memory.gone = 1;
      enemy.blocksMovement = false; // nothing is left there to stop the player
      updateVisibility(state);
      events.push({ type: 'blinded', turns: BLIND_TURNS });
      break;
    case 'shove':
      shovePlayer(state, SHOVE_TILES);
      events.push({ type: 'shoved', tiles: SHOVE_TILES });
      break;
  }
  return events;
}
