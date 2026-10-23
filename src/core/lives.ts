import { BEHAVIORS } from './behaviors';
import { ENEMY_DEFS } from './enemy-defs';
import { enemiesOf, removeChildren } from './enemies';
import { type GameEvent } from './events';
import { updateVisibility } from './fov';
import { type GameState } from './game-state';
import { createRng } from './rng';

/** Lives at the start of a run, and the most you can ever have (a life pickup refills up to it). */
export const MAX_LIVES = 3;

/**
 * The player loses one life: back to the floor's start tile with the floor step counter reset.
 * The explored map, the floor timer and the run totals are kept. The attempt counter goes up, the
 * trail and any blindness are cleared, the behaviour stream is re-seeded from the attempt number
 * and every enemy goes back to its starting state, so attempt N of a floor always plays the same.
 * Returns `lifeLost`, followed by `gameOver` when that was the last life.
 */
export function loseLife(state: GameState): GameEvent[] {
  state.lives = Math.max(0, state.lives - 1);
  state.stats.deaths++;
  state.player.pos = { ...state.floor.start };
  state.stats.floorSteps = 0;
  state.graceTurns = 1;
  state.attempt++;
  state.trail = [];
  state.blindTurns = 0;
  state.enemyRng = createRng(
    `${state.runSeed}:${state.floor.floorNumber}:behavior:${state.attempt}`,
  );
  // Timed hazards start their cycle again, so every attempt at a floor begins the same way.
  removeChildren(state);
  for (const enemy of enemiesOf(state)) {
    BEHAVIORS[ENEMY_DEFS[enemy.type].behavior].reset?.(enemy, state);
  }
  updateVisibility(state);

  const events: GameEvent[] = [{ type: 'lifeLost', livesLeft: state.lives }];
  if (state.lives === 0) events.push({ type: 'gameOver' });
  return events;
}

/** Adds a life, up to `maxLives` (the life pickup and a debug key). */
export function gainLife(state: GameState): void {
  state.lives = Math.min(state.maxLives, state.lives + 1);
}
