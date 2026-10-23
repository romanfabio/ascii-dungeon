import { BEHAVIORS } from './behaviors';
import { ENEMY_DEFS } from './enemy-defs';
import { isEnemy, type Enemy } from './entity';
import { type EnemySpawn, type FloorMap } from './floor-map';
import { type GameEvent } from './events';
import { type GameState } from './game-state';
import { type Point } from './geometry';

/** The enemies on the floor, in id order (the order they act in). */
export function enemiesOf(state: GameState): Enemy[] {
  return state.entities.filter(isEnemy);
}

/** Builds the enemy for a spawn; its behaviour's `init` fills in the rest. */
export function createEnemy(id: number, spawn: EnemySpawn, floor: FloorMap): Enemy {
  const { type, pos } = spawn;
  const enemy: Enemy = {
    id,
    kind: 'enemy',
    pos: { ...pos },
    glyph: ENEMY_DEFS[type].glyph,
    blocksMovement: true,
    type,
    cells: [{ ...pos }],
    solid: [],
    warn: [],
    memory: {},
    seen: false,
  };
  BEHAVIORS[ENEMY_DEFS[type].behavior].init?.(enemy, spawn, floor);
  return enemy;
}

/** Puts the floor's own enemies on the state (a fresh floor, or the debug overlay's re-roll). */
export function placeFloorEnemies(state: GameState): void {
  const { floor } = state;
  state.entities = floor.spawns.map((s, i) => createEnemy(i + 1, s, floor));
  // The Shadow is a floor flag, not a spawn: it starts at the start tile (and is absent until the
  // trail is long enough).
  if (floor.directives.shadow) {
    const id = floor.spawns.length + 1;
    state.entities.push(createEnemy(id, { type: 'shadow', pos: { ...floor.start } }, floor));
  }
  state.nextEnemyId = state.entities.length + 1;
}

/**
 * Adds an enemy while the floor is being played (the Breeder's young). It is marked as a child
 * (`memory.child`), so `removeChildren` takes it away again when the player respawns.
 */
export function spawnEnemy(
  state: GameState,
  spawn: EnemySpawn,
): { enemy: Enemy; event: GameEvent } {
  const enemy = createEnemy(state.nextEnemyId++, spawn, state.floor);
  enemy.memory.child = 1;
  state.entities.push(enemy);
  return { enemy, event: { type: 'enemySpawned', enemyId: enemy.id } };
}

/** Removes every enemy that was spawned at runtime. */
export function removeChildren(state: GameState): void {
  state.entities = state.entities.filter((e) => !(isEnemy(e) && e.memory.child === 1));
}

/**
 * The enemy whose hurting cells (or solid body) cover `p`, if any. `moving`: the player moved this
 * turn, so an enemy that a mover passes through (the Shadow) does not count.
 */
export function enemyAt(state: GameState, p: Point, moving = false): Enemy | undefined {
  const covers = (c: Point): boolean => c.x === p.x && c.y === p.y;
  return enemiesOf(state).find(
    (e) =>
      (e.cells.some(covers) || e.solid.some(covers)) &&
      !(moving && BEHAVIORS[ENEMY_DEFS[e.type].behavior].passable?.(e)),
  );
}

/**
 * The glyph for one of an enemy's cells (index into `enemy.cells`, base first): its behaviour's
 * say (a spear's tip and shaft, a chaser that is upper case while it hunts), else the def's glyph.
 */
export function glyphForCell(enemy: Enemy, index: number, alt = false): string {
  const def = ENEMY_DEFS[enemy.type];
  const custom = BEHAVIORS[def.behavior].glyph?.(enemy, index, alt);
  return custom ?? (alt ? def.altGlyph : def.glyph);
}

/** Lets every enemy act once. */
export function runEnemyTurn(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const enemy of enemiesOf(state)) {
    events.push(...BEHAVIORS[ENEMY_DEFS[enemy.type].behavior].act(enemy, state, state.enemyRng));
  }
  return events;
}

/** In view, and not hidden: a Lurker nobody has stood beside is never seen. */
function inSight(state: GameState, enemy: Enemy): boolean {
  if (BEHAVIORS[ENEMY_DEFS[enemy.type].behavior].hidden?.(enemy)) return false;
  const { width } = state.floor;
  return [...enemy.cells, ...enemy.solid].some((c) => state.visible[c.y * width + c.x] === 1);
}

/**
 * Returns an `enemySighted` for every enemy that has just come into view: once for a
 * `remembered` type (a Bloodstone), and again each time a moving enemy returns to the sight line.
 */
export function detectSightings(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const enemy of enemiesOf(state)) {
    const visible = inSight(state, enemy);
    if (visible && !enemy.seen) events.push({ type: 'enemySighted', enemyId: enemy.id });
    enemy.seen = ENEMY_DEFS[enemy.type].remembered ? enemy.seen || visible : visible;
  }
  return events;
}

/** Marks the enemies already in view as seen without an event (the start of a floor). */
export function markVisibleEnemiesSeen(state: GameState): void {
  for (const enemy of enemiesOf(state)) if (inSight(state, enemy)) enemy.seen = true;
}
