import { type Action } from './actions';
import { resolveContact } from './contact';
import { detectSightings, enemyAt, runEnemyTurn } from './enemies';
import { type GameEvent } from './events';
import { TRAIL_LENGTH, type GameState } from './game-state';
import { DIR_VEC } from './geometry';
import { updateVisibility } from './fov';
import { collectPickups, detectPickupSightings } from './pickups';
import { isWalkable, Tile } from './tiles';

/** Newly seen enemies and pickups. */
function detectAllSightings(state: GameState): GameEvent[] {
  return [...detectSightings(state), ...detectPickupSightings(state)];
}

/** Blindness counts down once per turn that takes time (before anything can renew it). */
function tickBlindness(state: GameState): void {
  if (state.blindTurns > 0 && --state.blindTurns === 0) updateVisibility(state);
}

/**
 * The rest of a turn that took time: enemies act, then anything touching the player costs a life
 * (unless the player has just respawned), then newly seen enemies and pickups are reported.
 */
function finishTurn(state: GameState, events: GameEvent[]): GameEvent[] {
  state.turn++;
  tickBlindness(state);
  state.trail.push({ ...state.player.pos });
  if (state.trail.length > TRAIL_LENGTH) state.trail.shift();
  events.push(...runEnemyTurn(state));

  if (state.graceTurns > 0) {
    state.graceTurns--;
  } else {
    const hit = enemyAt(
      state,
      state.player.pos,
      events.some((e) => e.type === 'moved'),
    );
    if (hit) events.push(...resolveContact(state, hit));
  }

  events.push(...detectAllSightings(state));
  return events;
}

/** Applies one player action to the state (in place) and reports what happened. */
export function applyAction(state: GameState, action: Action): GameEvent[] {
  if (state.lives <= 0) return []; // the run is over
  if (action.type === 'wait') return finishTurn(state, []);

  const { floor, player } = state;
  const vec = DIR_VEC[action.dir];
  const target = { x: player.pos.x + vec.x, y: player.pos.y + vec.y };

  // Walking into an enemy costs a life; the player does not move.
  const enemy = enemyAt(state, target, true);
  if (enemy) {
    state.turn++;
    tickBlindness(state);
    return [...resolveContact(state, enemy, target), ...detectAllSightings(state)];
  }

  const inBounds =
    target.x >= 0 && target.y >= 0 && target.x < floor.width && target.y < floor.height;
  const tile = inBounds ? (floor.tiles[target.y * floor.width + target.x] as number) : Tile.Wall;
  const blocked = state.entities.some(
    (e) => e.blocksMovement && e.pos.x === target.x && e.pos.y === target.y,
  );
  if (!isWalkable(tile) || blocked) return [{ type: 'bumped', at: target }];

  const from = player.pos;
  player.pos = target;
  state.stats.floorSteps++;
  state.stats.totalSteps++;
  updateVisibility(state);

  const events: GameEvent[] = [{ type: 'moved', from, to: target }];
  if (tile === Tile.Exit) {
    state.turn++; // reaching the exit ends the floor: the enemies do not get a turn
    events.push({ type: 'reachedExit' });
    return events;
  }
  // A pickup is taken before the enemies act, so a life gained here can still be lost this turn.
  events.push(...collectPickups(state));
  return finishTurn(state, events);
}
