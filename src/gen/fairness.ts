import { enemiesOf } from '../core/enemies';
import { ENEMY_DEFS, type EnemyTypeId } from '../core/enemy-defs';
import { type Action } from '../core/actions';
import { type FloorMap } from '../core/floor-map';
import { createGameState, type GameState } from '../core/game-state';
import { DIRS, DX, DY, type Dir, type Point } from '../core/geometry';
import { shortestPath } from '../core/pathfinding';
import { isWalkable } from '../core/tiles';
import { applyAction } from '../core/turn';
import { paramsForFloor } from './difficulty';
import { routeWalkOf } from './spear-timing';

/**
 * Scripted players that run through the real game core on generated floors, so that "is this floor
 * fair?" is measured instead of argued (roster plan, section 6). Three of them:
 *
 * - **dasher**: walks the shortest route and never waits. Judged on its first attempt.
 * - **planner**: walks the fewest-turns way through the timed enemies that the generator proved
 *   (`routeWalkOf`), waiting where it says. Anything that still hits it is a bug in a proof, or a
 *   hunter. First attempt.
 * - **explorer**: a cautious explorer that only knows what it has seen (fog of war): it walks to
 *   the nearest unexplored edge of the map until the exit is known, steps round enemies it can see
 *   and waits when the next tile is one, and carries on after a respawn with what it has learned.
 *   Played until it reaches the exit, runs out of lives or out of turns.
 */
export type PlayerKind = 'dasher' | 'planner' | 'explorer';

export interface FloorRun {
  kind: PlayerKind;
  floor: number;
  /** `exit`: reached it; `dead`: out of lives (explorer) or hit on the first attempt (dasher, planner); `timeout`: gave up. */
  outcome: 'exit' | 'dead' | 'timeout';
  livesLost: number;
  turns: number;
  /** The type that cost each life lost, in order. */
  hitBy: EnemyTypeId[];
  /** The enemy ids behind `hitBy` (the id of a floor's own spawn is its index + 1). */
  hitIds: number[];
  /** Times the player was blinded (no life lost). */
  blinded: number;
}

/** The turn budget of an explorer: enough for a big maze and a few respawns. */
export const EXPLORER_MAX_TURNS = 6000;

function dirBetween(from: Point, to: Point): Dir {
  for (let d = 0; d < 4; d++) {
    if (from.x + (DX[d] as number) === to.x && from.y + (DY[d] as number) === to.y) {
      return DIRS[d] as Dir;
    }
  }
  throw new Error(`fairness: ${from.x},${from.y} and ${to.x},${to.y} are not neighbours`);
}

/** Plays `choose` until it says stop, the exit, or (when `firstAttempt`) the first life lost. */
function play(
  state: GameState,
  kind: PlayerKind,
  choose: (state: GameState) => Action | null,
  opts: { firstAttempt: boolean; maxTurns: number },
): FloorRun {
  const run: FloorRun = {
    kind,
    floor: state.floor.floorNumber,
    outcome: 'timeout',
    livesLost: 0,
    turns: 0,
    hitBy: [],
    hitIds: [],
    blinded: 0,
  };
  while (run.turns < opts.maxTurns) {
    const action = choose(state);
    if (!action) break;
    const typeOf = new Map(enemiesOf(state).map((e) => [e.id, e.type] as const));
    const events = applyAction(state, action);
    run.turns++;
    let touched: EnemyTypeId | undefined;
    let touchedId = 0;
    for (const e of events) {
      if (e.type === 'blinded') run.blinded++;
      if (e.type === 'hitEnemy') {
        touched = typeOf.get(e.enemyId);
        touchedId = e.enemyId;
      }
      if (e.type === 'lifeLost') {
        // A touch that costs a life is followed by `lifeLost`; shoves and blinds are not losses.
        run.livesLost++;
        if (touched) {
          run.hitBy.push(touched);
          run.hitIds.push(touchedId);
        }
      }
      if (e.type === 'reachedExit') {
        run.outcome = 'exit';
        return run;
      }
      if (e.type === 'gameOver') {
        run.outcome = 'dead';
        return run;
      }
    }
    if (opts.firstAttempt && run.livesLost > 0) {
      run.outcome = 'dead';
      return run;
    }
  }
  return run;
}

function freshState(map: FloorMap, seed: string): GameState {
  return createGameState(seed, map, { sightRadius: paramsForFloor(map.floorNumber).sightRadius });
}

/** The dasher: always the shortest way from where it stands, never waiting (a shove just re-routes it). */
export function runDasher(map: FloorMap, seed: string): FloorRun {
  const route = shortestPath(map, map.start, map.exit);
  return play(
    freshState(map, seed),
    'dasher',
    (state) => {
      const path = shortestPath(state.floor, state.player.pos, state.floor.exit);
      const next = path[1];
      return next ? { type: 'move', dir: dirBetween(state.player.pos, next) } : null;
    },
    { firstAttempt: true, maxTurns: route.length * 3 + 20 },
  );
}

/** The planner: the proved fewest-turns walk past the timed enemies. */
export function runPlanner(map: FloorMap, seed: string): FloorRun | null {
  const walk = routeWalkOf(map, map.spawns);
  if (!walk) return null;
  let step = 0;
  let from: Point = map.start;
  return play(
    freshState(map, seed),
    'planner',
    (state) => {
      // Off the walk (something threw it back): the proof's promise no longer applies.
      if (state.player.pos.x !== from.x || state.player.pos.y !== from.y) return null;
      const to = walk[step++];
      if (!to) return null;
      const action: Action =
        to.x === from.x && to.y === from.y
          ? { type: 'wait' }
          : { type: 'move', dir: dirBetween(from, to) };
      from = to;
      return action;
    },
    { firstAttempt: true, maxTurns: walk.length + 5 },
  );
}

/**
 * What the explorer knows about the enemies: the tiles of ones that never move and that it has
 * seen (it walks round those), and the tiles that hurt or are marked right now in view (it waits
 * for those to clear before stepping onto them).
 */
function enemyTiles(state: GameState): {
  fixed: Set<number>;
  now: Set<number>;
  gates: Set<number>;
} {
  const { width } = state.floor;
  const fixed = new Set<number>();
  const now = new Set<number>();
  const gates = new Set<number>();
  for (const e of enemiesOf(state)) {
    const def = ENEMY_DEFS[e.type];
    if (def.behavior === 'gate') {
      // A gate is timed from right beside it: wait there, not three tiles away.
      for (const c of e.cells) gates.add(c.y * width + c.x);
      continue;
    }
    const still = def.behavior === 'none' || def.behavior === 'breed' || def.body === true;
    for (const c of [...e.cells, ...e.solid, ...e.warn]) {
      const i = c.y * width + c.x;
      if (still && e.seen) fixed.add(i);
      else if (state.visible[i] === 1) {
        now.add(i);
        // Something that moves can step onto a neighbouring tile next turn: a careful player
        // does not walk in front of it either.
        if (!still) {
          for (let d = 0; d < 4; d++) {
            const n = (c.y + (DY[d] as number)) * width + c.x + (DX[d] as number);
            now.add(n);
          }
        }
      }
    }
    for (const c of e.solid) if (e.seen) fixed.add(c.y * width + c.x);
  }
  return { fixed, now, gates };
}

/** A walkable tile the explorer has seen. */
function knownWalkable(state: GameState, i: number): boolean {
  return state.floor.explored[i] === 1 && isWalkable(state.floor.tiles[i] as number);
}

/** Is it a seen tile with an unseen neighbour (somewhere left to look)? */
function isFrontier(state: GameState, i: number): boolean {
  const { width, height, explored } = state.floor;
  const x = i % width;
  const y = (i - x) / width;
  for (let d = 0; d < 4; d++) {
    const nx = x + (DX[d] as number);
    const ny = y + (DY[d] as number);
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (explored[ny * width + nx] !== 1) return true;
  }
  return false;
}

/**
 * Breadth-first over the tiles the explorer knows, round the `blocked` ones. With a `goal` it returns the
 * first step towards it (null if unreachable); without one it picks the exit if it has been seen,
 * else the nearest frontier, and returns that goal and the first step.
 */
function explorerStep(
  state: GameState,
  blocked: ReadonlySet<number>,
  goal: number | null,
): { goal: number; step: Point; ahead: Point[] } | null {
  const { floor, player } = state;
  const { width, height } = floor;
  const from = player.pos.y * width + player.pos.x;
  const exit = floor.exit.y * width + floor.exit.x;
  const prev = new Int32Array(width * height).fill(-2);
  prev[from] = -1;
  const queue = [from];
  let found = -1;
  for (let head = 0; head < queue.length && found < 0; head++) {
    const cur = queue[head] as number;
    const x = cur % width;
    const y = (cur - x) / width;
    for (let d = 0; d < 4; d++) {
      const nx = x + (DX[d] as number);
      const ny = y + (DY[d] as number);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (prev[n] !== -2 || !knownWalkable(state, n) || blocked.has(n)) continue;
      prev[n] = cur;
      queue.push(n);
      if (goal === null ? n === exit || (found < 0 && isFrontier(state, n)) : n === goal) {
        found = n;
        if (goal === null && n === exit) break;
      }
    }
  }
  if (goal === null && found >= 0 && prev[exit] !== -2) found = exit;
  if (found < 0) return null;
  const path: Point[] = [];
  for (let at = found; at !== from; at = prev[at] as number) {
    path.push({ x: at % width, y: Math.floor(at / width) });
  }
  path.reverse();
  return { goal: found, step: path[0] as Point, ahead: path.slice(0, EXPLORER_LOOKAHEAD) };
}

/** How many steps of its path the explorer checks for something in the way (a gate it can time). */
export const EXPLORER_LOOKAHEAD = 3;

/** The most turns the explorer waits for something it can see to get out of the way. */
export const EXPLORER_PATIENCE = 12;

/** The explorer: cautious, fog-bound, keeps its goal, carries on after a respawn. */
export function runExplorer(map: FloorMap, seed: string): FloorRun {
  let waited = 0;
  let goal: number | null = null;
  return play(
    freshState(map, seed),
    'explorer',
    (state) => {
      const { width } = state.floor;
      const exit = state.floor.exit.y * width + state.floor.exit.x;
      const here = state.player.pos.y * width + state.player.pos.x;
      // Keep the goal while there is still something to see there; the exit beats any goal.
      if (goal !== null && (goal === here || (goal !== exit && !isFrontier(state, goal))))
        goal = null;
      if (state.floor.explored[exit] === 1) goal = exit;
      const { fixed, now, gates } = enemyTiles(state);
      let plan = goal === null ? null : explorerStep(state, fixed, goal);
      if (!plan) plan = explorerStep(state, fixed, null);
      if (!plan) return null; // nothing left to explore
      goal = plan.goal;
      // Wait for something it can see to get off the next tile, and in the end risk it.
      const next = plan.step.y * width + plan.step.x;
      const blockedAhead = gates.has(next) || plan.ahead.some((p) => now.has(p.y * width + p.x));
      if (blockedAhead && waited++ < EXPLORER_PATIENCE) {
        return { type: 'wait' };
      }
      waited = 0;
      return { type: 'move', dir: dirBetween(state.player.pos, plan.step) };
    },
    { firstAttempt: false, maxTurns: EXPLORER_MAX_TURNS },
  );
}

/**
 * Is a hit by this type a broken promise for this player? The dasher is promised a free dash by
 * `footprint` and `construction` types; the planner, which waits where the proof says, by `timing`
 * types too. `reachable` types (hunters, the Blinker) may hit either: that is what they are tuned by.
 */
export function brokenPromise(type: EnemyTypeId, kind: 'dasher' | 'planner'): boolean {
  const g = ENEMY_DEFS[type].guarantee;
  return g === 'footprint' || g === 'construction' || (kind === 'planner' && g === 'timing');
}
