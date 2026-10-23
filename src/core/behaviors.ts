import {
  BLINKER_INTERVAL,
  BLINKER_LEASH,
  BLINKER_WARN_TURNS,
  BREED_INTERVAL,
  BREED_MAX,
  BREED_PICKUP_DISTANCE,
  BREED_REACH,
  BREED_START_DISTANCE,
  ENEMY_DEFS,
  spawnReach,
  GHOST_GIVE_UP_TURNS,
  GHOST_NOTICE_DISTANCE,
  GHOST_PERIOD,
  SHADOW_LAG,
  SHADE_GIVE_UP_TURNS,
  SHADE_NOTICE_DISTANCE,
  SHADE_PERIOD,
} from './enemy-defs';
import { isEnemy, type Enemy } from './entity';
import { type GameEvent } from './events';
import { type EnemySpawn, type FloorMap } from './floor-map';
import { computeFov } from './fov';
import { type GameState } from './game-state';
import { DX, DY, pointsEqual, type Point } from './geometry';
import { bfsDistances, shortestPath } from './pathfinding';
import { Tile } from './tiles';
import {
  BOUNCER_PERIOD,
  bouncerClosed,
  SENTINEL_CHARGE_TURNS,
  sentinelPeriod,
  sentinelStage,
} from './hazards';
import { homeField, playerMoved, stepToward } from './pathing';
import { type Rng } from './rng';
import { spawnEnemy } from './enemies';
import { armTiles, directionIndex, segmentMemory, segmentPoint, stepAlongSegment } from './segment';

// The segment maths lives in segment.ts; these stay importable from here.
export { segmentPeriod, segmentTipOffset } from './segment';

export type BehaviorId =
  | 'none'
  | 'patrol'
  | 'swing'
  | 'spear'
  | 'chase'
  | 'wander'
  | 'ambush'
  | 'sentinel'
  | 'sleep'
  | 'blink'
  | 'gate'
  | 'drift'
  | 'sweep'
  | 'lurk'
  | 'trail'
  | 'haunt'
  | 'breed';

/** What one enemy type does. Registered in BEHAVIORS; `EnemyDef.behavior` picks it. */
export interface Behavior {
  /** Builds `enemy.memory` (and anything else beyond the basics) from the spawn. */
  init?(enemy: Enemy, spawn: EnemySpawn, floor: FloorMap): void;
  /** Runs once per enemy after every player action that took a turn. */
  act(enemy: Enemy, state: GameState, rng: Rng): GameEvent[];
  /** Puts the enemy back to its starting state when the player respawns. */
  reset?(enemy: Enemy, state: GameState): void;
  /** Which glyph one of the enemy's cells shows; the def's glyph (or alt glyph) by default. */
  glyph?(enemy: Enemy, cellIndex: number, alt: boolean): string;
  /** Which glyph one of the enemy's `solid` tiles shows; the def's glyph (or alt glyph) by default. */
  solidGlyph?(enemy: Enemy, solidIndex: number, alt: boolean): string;
  /** The glyph drawn on this enemy's `warn` tiles; ':' by default. */
  warnGlyph?: string;
  /**
   * How it is drawn: `alert` is the `enemyHunting` colour (hunting, revealed, firing), `pickup`
   * is the life pickup's colours (a disguise), `warn` is the telegraph colour (stirring); nothing
   * is the type's usual look.
   */
  tone?(enemy: Enemy): 'alert' | 'pickup' | 'warn' | 'shade' | undefined;
  /**
   * Is it standing still in its place right now? Only then does a `remembered` type stay drawn
   * out of sight (a Sleeper that is awake must not show through the fog). Default: yes.
   */
  dormant?(enemy: Enemy): boolean;
  /** Is it invisible right now (a Lurker nobody has stood beside)? Not drawn, never reported. */
  hidden?(enemy: Enemy): boolean;
  /**
   * Does a player who moves pass through it harmlessly? Then only a player who stood still this
   * turn can be hurt by it (the Shadow).
   */
  passable?(enemy: Enemy): boolean;
}

/** Walks the segment, hurting only the tile it stands on. */
const patrol: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, segmentMemory(spawn));
  },
  act(enemy) {
    const m = enemy.memory;
    stepAlongSegment(m);
    enemy.pos = segmentPoint(m, m.i as number);
    enemy.cells = [{ ...enemy.pos }];
    return [];
  },
};

/**
 * A patrol that starts over at its first end when the player respawns. Every timed hazard is
 * proved from phase 0 at the start of each attempt (`gen/hazard-timing.ts`), so a pendulum that
 * kept walking through a respawn could break the proof; the plain Patroller never touches the
 * route and does not need this.
 */
const swing: Behavior = {
  ...patrol,
  reset(enemy) {
    enemy.memory.i = 0;
    enemy.memory.dir = 1;
    enemy.pos = segmentPoint(enemy.memory, 0);
    enemy.cells = [{ ...enemy.pos }];
  },
};

/** Sets a spear's cells to its base and every tile out to the tip (all of them hurt). */
function layOutSpear(enemy: Enemy): void {
  const m = enemy.memory;
  enemy.cells = Array.from({ length: (m.i as number) + 1 }, (_, k) => segmentPoint(m, k));
}

/**
 * A spear grows from its base to full length and shrinks back, one tile per turn. Its tip is the
 * `patrol` walk; the whole length from the base to the tip is dangerous.
 */
const spear: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, segmentMemory(spawn));
    layOutSpear(enemy);
  },
  act(enemy) {
    stepAlongSegment(enemy.memory);
    layOutSpear(enemy);
    return [];
  },
  glyph(enemy, index) {
    const dx = enemy.memory.dx as number;
    const dy = enemy.memory.dy as number;
    if (index === enemy.cells.length - 1) return dx > 0 ? '>' : dx < 0 ? '<' : dy > 0 ? 'v' : '^';
    return dx !== 0 ? '-' : '|';
  },
  reset(enemy) {
    enemy.memory.i = 0;
    enemy.memory.dir = 1;
    layOutSpear(enemy);
  },
};

/** How far a chaser sees the player (line of sight, like the player's own field of view). */
export const CHASER_SIGHT = 5;
/** Turns without seeing the player before a hunting chaser gives up and walks home. */
export const CHASER_GIVE_UP_TURNS = 8;
/** Turns a chaser stays idle after the player respawns, so they can step away. */
export const CHASER_COOLDOWN_TURNS = 4;

/** What a chaser is doing, kept in its `memory.mode`. */
export const ChaseMode = { Idle: 0, Hunt: 1, Return: 2 } as const;

/**
 * Waits at home. Once it sees the player (line of sight within CHASER_SIGHT) it hunts: one tile per
 * turn along the shortest path to the player, whatever it can see. After CHASER_GIVE_UP_TURNS
 * turns without seeing them it walks home and idles again; seeing the player on the way back
 * restarts the hunt. Ties between equally short steps go in N, E, S, W order, so a seed always
 * plays out the same. It uses no randomness.
 */
const chase: Behavior = {
  init(enemy, spawn) {
    // Idle at home: the tile it returns to after giving up or after the player respawns.
    Object.assign(enemy.memory, { hx: spawn.pos.x, hy: spawn.pos.y, mode: 0, lost: 0, cool: 0 });
  },
  act(enemy, state) {
    const m = enemy.memory;
    const events: GameEvent[] = [];
    if ((m.cool as number) > 0) {
      m.cool = (m.cool as number) - 1;
      return events;
    }

    const { floor, player } = state;
    const view = new Uint8Array(floor.width * floor.height);
    computeFov(floor, enemy.pos, CHASER_SIGHT, view);
    if (view[player.pos.y * floor.width + player.pos.x] === 1) {
      if (m.mode !== ChaseMode.Hunt) {
        m.mode = ChaseMode.Hunt;
        // Only worth interrupting the player's walking if they can see it happen.
        if (state.visible[enemy.pos.y * floor.width + enemy.pos.x] === 1) {
          events.push({ type: 'enemyAlerted', enemyId: enemy.id });
        }
      }
      m.lost = 0;
    } else if (m.mode === ChaseMode.Hunt) {
      m.lost = (m.lost as number) + 1;
      if ((m.lost as number) >= CHASER_GIVE_UP_TURNS) m.mode = ChaseMode.Return;
    }
    if (m.mode === ChaseMode.Idle) return events;

    const home = { x: m.hx as number, y: m.hy as number };
    const target = m.mode === ChaseMode.Hunt ? player.pos : home;
    stepToward(enemy, state, target);
    if (m.mode === ChaseMode.Return && pointsEqual(enemy.pos, home)) m.mode = ChaseMode.Idle;
    return events;
  },
  tone: (enemy) => (enemy.memory.mode === ChaseMode.Hunt ? 'alert' : undefined),
  glyph(enemy, _index, alt) {
    const def = ENEMY_DEFS[enemy.type];
    const base = alt ? def.altGlyph : def.glyph;
    return enemy.memory.mode === ChaseMode.Hunt ? base.toUpperCase() : base;
  },
  reset(enemy) {
    const m = enemy.memory;
    enemy.pos = { x: m.hx as number, y: m.hy as number };
    enemy.cells = [{ ...enemy.pos }];
    m.mode = ChaseMode.Idle;
    m.lost = 0;
    m.cool = CHASER_COOLDOWN_TURNS;
  },
};

/** A wanderer moves on every second enemy turn. */
export const WANDER_PERIOD = 2;
/** Chance it stands still instead of moving, when it is its turn. */
export const WANDER_PAUSE = 0.25;
/** Chance it keeps its heading when it can. */
export const WANDER_KEEP_HEADING = 0.7;
/** It never ends a move farther than this many walking steps from its home tile. */
export const WANDER_LEASH = 12;
/** It never steps within this many tiles (Manhattan) of the start, so a respawn is safe. */
export const WANDER_START_BUFFER = 2;

/**
 * Ambles around home at half the player's speed: on its turn it pauses 25% of the time, otherwise
 * it steps to a free neighbour, keeping its heading 70% of the time when that is possible. It
 * never steps onto the exit, another enemy's tiles, the start's neighbourhood, or beyond its leash
 * (a distance field from home, built on first use and kept in `enemy.field`). Walking onto the
 * player is contact like any other. Its randomness comes from the attempt-seeded enemy stream.
 */
const wander: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, { hx: spawn.pos.x, hy: spawn.pos.y, hd: -1, t: 0 });
  },
  act(enemy, state, rng) {
    const m = enemy.memory;
    m.t = (m.t as number) + 1;
    if ((m.t as number) % WANDER_PERIOD !== 0) return [];
    if (rng.next() < WANDER_PAUSE) return [];

    const { floor } = state;
    const field = homeField(enemy, state);
    const taken = new Set<number>();
    for (const other of state.entities) {
      if (!isEnemy(other) || other === enemy) continue;
      for (const c of [...other.cells, ...other.solid]) taken.add(c.y * floor.width + c.x);
    }
    const free: number[] = [];
    for (let d = 0; d < 4; d++) {
      const x = enemy.pos.x + (DX[d] as number);
      const y = enemy.pos.y + (DY[d] as number);
      if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) continue;
      const i = y * floor.width + x;
      const tile = floor.tiles[i] as number;
      if (tile === Tile.Wall || tile === Tile.Exit || taken.has(i)) continue;
      if (Math.abs(x - floor.start.x) + Math.abs(y - floor.start.y) <= WANDER_START_BUFFER)
        continue;
      const home = field[i] as number;
      if (home < 0 || home > WANDER_LEASH) continue;
      free.push(d);
    }
    if (free.length === 0) return [];

    const keep = free.includes(m.hd as number) && rng.next() < WANDER_KEEP_HEADING;
    const dir = keep ? (m.hd as number) : (free[rng.int(free.length)] as number);
    m.hd = dir;
    enemy.pos = { x: enemy.pos.x + (DX[dir] as number), y: enemy.pos.y + (DY[dir] as number) };
    enemy.cells = [{ ...enemy.pos }];
    return [];
  },
  reset(enemy) {
    const m = enemy.memory;
    enemy.pos = { x: m.hx as number, y: m.hy as number };
    enemy.cells = [{ ...enemy.pos }];
    m.hd = -1;
    m.t = 0;
  },
};

/** A mimic reveals itself when the player comes this close (walking distance, in view). */
export const MIMIC_REVEAL_DISTANCE = 2;

/** What an ambusher is doing, kept in `memory.st`. */
export const AmbushState = { Disguised: 0, Armed: 1 } as const;

/** The walkable tiles next to a tile. */
function openNeighbourTiles(state: GameState, from: { x: number; y: number }): Point[] {
  const { floor } = state;
  const tiles: Point[] = [];
  for (let d = 0; d < 4; d++) {
    const x = from.x + (DX[d] as number);
    const y = from.y + (DY[d] as number);
    if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) continue;
    if (floor.tiles[y * floor.width + x] !== Tile.Wall) tiles.push({ x, y });
  }
  return tiles;
}

/** Never moves; its tile always hurts. `memory.warned` = the player was next to it last turn. */
function layOutAmbusher(enemy: Enemy, strike: Point[]): void {
  enemy.cells = [{ ...enemy.pos }, ...strike];
}

/**
 * What an armed ambusher does each turn: when the player ends a turn next to it, the tiles around
 * it are marked (`warn`, `enemyAlerted`); if the player is still next to it one turn later it
 * strikes and those tiles hurt for that turn. Stepping away in between is always safe.
 */
function watchNeighbours(enemy: Enemy, state: GameState, events: GameEvent[]): void {
  const m = enemy.memory;
  const dx = Math.abs(state.player.pos.x - enemy.pos.x);
  const dy = Math.abs(state.player.pos.y - enemy.pos.y);
  layOutAmbusher(enemy, []); // a strike lasts one turn
  const next = dx + dy === 1;
  if (next && m.warned === 1) {
    layOutAmbusher(enemy, openNeighbourTiles(state, enemy.pos));
    enemy.warn = [];
    m.warned = 0;
  } else if (next) {
    m.warned = 1;
    enemy.warn = openNeighbourTiles(state, enemy.pos);
    events.push({ type: 'enemyAlerted', enemyId: enemy.id });
  } else {
    m.warned = 0;
    enemy.warn = [];
  }
}

/**
 * The Mimic (the Lurker shares its strike, `watchNeighbours`). Disguised as a life pickup it does nothing until the
 * player is within MIMIC_REVEAL_DISTANCE (walking distance, in view): then it shows itself
 * (`enemyRevealed`). Armed, it watches its neighbours: when the player ends a turn next to it, those
 * tiles are marked (`warn`, `enemyAlerted`); if they are still next to it one turn later it strikes
 * and the tiles around it hurt for that turn. Stepping away in between is always safe. A strike
 * that lands costs a life and the respawn resets it, so there is no cool-down to model. It uses
 * no randomness.
 */
const ambush: Behavior = {
  init(enemy) {
    Object.assign(enemy.memory, { st: AmbushState.Disguised, warned: 0 });
  },
  act(enemy, state) {
    const m = enemy.memory;
    const events: GameEvent[] = [];
    const { player, floor } = state;
    const dx = Math.abs(player.pos.x - enemy.pos.x);
    const dy = Math.abs(player.pos.y - enemy.pos.y);

    if (m.st === AmbushState.Disguised) {
      if (dx + dy > MIMIC_REVEAL_DISTANCE) return events;
      if (state.visible[enemy.pos.y * floor.width + enemy.pos.x] !== 1) return events;
      const walk = bfsDistances(floor, enemy.pos)[
        player.pos.y * floor.width + player.pos.x
      ] as number;
      if (walk < 0 || walk > MIMIC_REVEAL_DISTANCE) return events;
      m.st = AmbushState.Armed;
      events.push({ type: 'enemyRevealed', enemyId: enemy.id });
      return events;
    }

    watchNeighbours(enemy, state, events);
    return events;
  },
  glyph(enemy, index, alt) {
    if (enemy.memory.st === AmbushState.Disguised) return ENEMY_DEFS[enemy.type].glyph;
    if (index > 0) return '*';
    return alt ? 'W' : 'M';
  },
  tone: (enemy) => (enemy.memory.st === AmbushState.Disguised ? 'pickup' : 'alert'),
  reset(enemy) {
    const m = enemy.memory;
    m.st = AmbushState.Disguised;
    m.warned = 0;
    layOutAmbusher(enemy, []);
    enemy.warn = [];
  },
};

/**
 * A trap in a one-tile dead end beside the route. It is invisible (not drawn, never reported)
 * until the player ends a turn next to it: then it shows itself (`enemyRevealed`) and marks the
 * tiles around it like an armed Mimic, and a second turn there is a strike. It stays drawn and
 * armed from then on, also after a respawn (the player has learned where it is). Walking into its
 * tile always costs a life. It uses no randomness.
 */
const lurk: Behavior = {
  init(enemy) {
    Object.assign(enemy.memory, { st: AmbushState.Disguised, warned: 0 });
  },
  act(enemy, state) {
    const m = enemy.memory;
    const events: GameEvent[] = [];
    if (m.st === AmbushState.Disguised) {
      const dx = Math.abs(state.player.pos.x - enemy.pos.x);
      const dy = Math.abs(state.player.pos.y - enemy.pos.y);
      if (dx + dy !== 1) return events;
      m.st = AmbushState.Armed;
      events.push({ type: 'enemyRevealed', enemyId: enemy.id });
    }
    watchNeighbours(enemy, state, events);
    return events;
  },
  glyph(enemy, index, alt) {
    if (index > 0) return '*';
    return alt ? 'K' : 'L';
  },
  tone: (enemy) => (enemy.memory.st === AmbushState.Disguised ? undefined : 'alert'),
  hidden: (enemy) => enemy.memory.st === AmbushState.Disguised,
  reset(enemy) {
    enemy.memory.warned = 0;
    layOutAmbusher(enemy, []);
    enemy.warn = [];
  },
};

/**
 * The Shadow: where the player stood `memory.lag` turns ago (`state.trail`; a wait repeats a tile,
 * so waiting lets it catch up). Until the trail is that long it is absent (no cells). It is
 * intangible to a player who moves, even head-on, and only hurts one that stood still this turn
 * with it arriving on them, so a dash, a detour or a dead end can never cost a life. It uses no
 * randomness; a respawn clears the trail, which removes it.
 */
const trail: Behavior = {
  init(enemy, _spawn, floor) {
    enemy.memory.lag = floor.directives.shadow ?? SHADOW_LAG;
    enemy.cells = [];
    enemy.blocksMovement = false; // you can step onto it (and through it)
  },
  act(enemy, state) {
    const { trail: steps } = state;
    const at = steps[steps.length - 1 - (enemy.memory.lag as number)];
    enemy.cells = at ? [{ ...at }] : [];
    if (at) enemy.pos = { ...at };
    return [];
  },
  reset(enemy) {
    enemy.cells = [];
  },
  tone: () => 'shade',
  passable: () => true,
};

/** What a ghost is doing, kept in `memory.mode`. */
export const HauntMode = { Idle: 0, Hunt: 1, Return: 2 } as const;

/**
 * A ghost ignores the maze. Idle at home it feels the player within GHOST_NOTICE_DISTANCE (straight
 * line, no sight needed) and starts to hunt, always with an `enemyAlerted`, even unseen, so nobody
 * is ambushed silently. Hunting, it drifts one tile every GHOST_PERIOD turns straight at the player
 * (the axis with the larger distance, ties on x), through walls and Bloodstones; after
 * GHOST_GIVE_UP_TURNS turns without the player in range it drifts home the same way and idles. Its
 * tile hurts, which may be rock: the player can only meet it on a tile they can stand on. It uses
 * no randomness.
 */
const haunt: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, {
      hx: spawn.pos.x,
      hy: spawn.pos.y,
      mode: HauntMode.Idle,
      lost: 0,
      t: 0,
    });
  },
  act(enemy, state) {
    const m = enemy.memory;
    const events: GameEvent[] = [];
    const { floor, player } = state;
    const home = { x: m.hx as number, y: m.hy as number };
    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const near = dx * dx + dy * dy <= GHOST_NOTICE_DISTANCE * GHOST_NOTICE_DISTANCE;

    if (m.mode !== HauntMode.Hunt) {
      if (near) {
        events.push({ type: 'enemyAlerted', enemyId: enemy.id });
        m.mode = HauntMode.Hunt;
        m.lost = 0;
      }
    } else if (near) {
      m.lost = 0;
    } else {
      m.lost = (m.lost as number) + 1;
      if ((m.lost as number) >= GHOST_GIVE_UP_TURNS) m.mode = HauntMode.Return;
    }
    if (m.mode === HauntMode.Idle) return events;

    m.t = (m.t as number) + 1;
    if ((m.t as number) % GHOST_PERIOD !== 0) return events;
    const target = m.mode === HauntMode.Hunt ? player.pos : home;
    const gx = target.x - enemy.pos.x;
    const gy = target.y - enemy.pos.y;
    const along = Math.abs(gx) >= Math.abs(gy) ? 'x' : 'y';
    const next = { ...enemy.pos };
    if (along === 'x' && gx !== 0) next.x += Math.sign(gx);
    else if (gy !== 0) next.y += Math.sign(gy);
    if (next.x >= 0 && next.y >= 0 && next.x < floor.width && next.y < floor.height) {
      enemy.pos = next;
      enemy.cells = [{ ...next }];
    }
    if (m.mode === HauntMode.Return && pointsEqual(enemy.pos, home)) m.mode = HauntMode.Idle;
    return events;
  },
  tone: (enemy) => (enemy.memory.mode === HauntMode.Hunt ? 'alert' : undefined),
  reset(enemy) {
    const m = enemy.memory;
    enemy.pos = { x: m.hx as number, y: m.hy as number };
    enemy.cells = [{ ...enemy.pos }];
    m.mode = HauntMode.Idle;
    m.lost = 0;
    m.t = 0;
  },
};

/** The tiles that never become free: Bloodstones, young ones, mothers and solid bodies. */
function permanentTiles(state: GameState): Set<number> {
  const { width } = state.floor;
  const tiles = new Set<number>();
  for (const e of state.entities) {
    if (!isEnemy(e)) continue;
    const def = ENEMY_DEFS[e.type];
    if (def.behavior === 'none' || def.behavior === 'breed' || def.body) {
      tiles.add(e.pos.y * width + e.pos.x);
    }
    for (const c of e.solid) tiles.add(c.y * width + c.x);
  }
  return tiles;
}

/**
 * Where a breeder's next young one goes: the nearest walkable tile (1 to BREED_REACH walking steps
 * from her, ties drawn from `rng`) that is off the shortest route, the start and the exit, at least
 * BREED_START_DISTANCE steps from the start, away from every enemy tile and life pickup and from
 * the player, and that leaves the exit reachable from where the player stands (so a young one can
 * close a side branch but never seals the player in). Null when no tile qualifies.
 */
function pickYoungTile(mother: Enemy, state: GameState, rng: Rng): Point | null {
  const { floor, player } = state;
  const { width } = floor;
  const fromMother = bfsDistances(floor, mother.pos);
  const fromStart = bfsDistances(floor, floor.start);
  const route = new Set(shortestPath(floor, floor.start, floor.exit).map((p) => p.y * width + p.x));
  const used = new Set<number>();
  for (const spawn of floor.spawns) {
    for (const c of spawnReach(spawn, floor)) used.add(c.y * width + c.x);
  }
  for (const e of state.entities) {
    if (!isEnemy(e)) continue;
    for (const c of [...e.cells, ...e.solid]) used.add(c.y * width + c.x);
  }
  const blocked = permanentTiles(state);
  const exit = floor.exit.y * width + floor.exit.x;

  const free = (i: number): boolean => {
    const x = i % width;
    const y = (i - x) / width;
    if (route.has(i) || used.has(i) || i === exit) return false;
    if (x === player.pos.x && y === player.pos.y) return false;
    if ((fromStart[i] as number) < BREED_START_DISTANCE) return false;
    return !state.pickups.some(
      (p) => Math.abs(p.pos.x - x) + Math.abs(p.pos.y - y) < BREED_PICKUP_DISTANCE,
    );
  };
  for (let d = 1; d <= BREED_REACH; d++) {
    const ring: number[] = [];
    fromMother.forEach((dist, i) => {
      if (dist === d && free(i)) ring.push(i);
    });
    rng.shuffle(ring);
    for (const i of ring) {
      const sealed = bfsDistances(floor, player.pos, new Set([...blocked, i]));
      if ((sealed[exit] as number) >= 0) return { x: i % width, y: Math.floor(i / width) };
    }
  }
  return null;
}

/**
 * The Breeder: a motionless mother (a Bloodstone that hurts when touched) who adds a young one
 * (`brood`, also a Bloodstone) every BREED_INTERVAL turns, at most BREED_MAX of them, placed by
 * `pickYoungTile` so the shortest route and your way to the exit always stay free. They appear
 * while you play (`enemySpawned`; `enemySighted` when one appears in view) and a respawn removes
 * them all and restarts her clock.
 */
const breed: Behavior = {
  init(enemy) {
    enemy.memory.k = 0;
  },
  act(enemy, state, rng) {
    const m = enemy.memory;
    m.k = (m.k as number) + 1;
    if ((m.k as number) % BREED_INTERVAL !== 0) return [];
    const young = state.entities.filter(
      (e) => isEnemy(e) && e.memory.child === 1 && e.memory.mother === enemy.id,
    );
    if (young.length >= BREED_MAX) return [];
    const at = pickYoungTile(enemy, state, rng);
    if (!at) return [];
    const born = spawnEnemy(state, { type: 'brood', pos: at });
    born.enemy.memory.mother = enemy.id;
    return [born.event];
  },
  reset(enemy) {
    enemy.memory.k = 0;
  },
};

/** The beam tiles of a sentinel: every tile of its segment but the body. */
function beamOf(enemy: Enemy): Point[] {
  const m = enemy.memory;
  return Array.from({ length: (m.len as number) - 1 }, (_, i) => segmentPoint(m, i + 1));
}

/**
 * A turret: the body (`solid`, it blocks and hurts) faces along its beam. Its cycle (6, 8 or 10
 * turns, from its position) is idle, then SENTINEL_CHARGE_TURNS turns with the beam tiles marked
 * (`warn`), then one turn firing: the beam tiles are in `cells` and hurt. A charge that begins in
 * view fires `enemyAlerted`. It uses no randomness; `hazard` in the def mirrors it for the route proof.
 */
const sentinel: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, segmentMemory(spawn), {
      per: sentinelPeriod(spawn.pos),
      k: 0,
    });
    enemy.solid = [{ ...spawn.pos }];
    enemy.cells = [];
  },
  act(enemy, state) {
    const m = enemy.memory;
    m.k = (m.k as number) + 1;
    const stage = sentinelStage(m.per as number, m.k as number);
    const beam = beamOf(enemy);
    enemy.cells = stage === 'fire' ? beam : [];
    enemy.warn = stage === 'charge' ? beam : [];
    const { width } = state.floor;
    const starting =
      stage === 'charge' &&
      (m.k as number) % (m.per as number) === (m.per as number) - 1 - SENTINEL_CHARGE_TURNS;
    const inView = [...enemy.solid, ...beam].some((c) => state.visible[c.y * width + c.x] === 1);
    return starting && inView ? [{ type: 'enemyAlerted', enemyId: enemy.id }] : [];
  },
  reset(enemy) {
    enemy.memory.k = 0;
    enemy.cells = [];
    enemy.warn = [];
  },
  glyph(enemy) {
    return (enemy.memory.dx as number) !== 0 ? '=' : 'I';
  },
  solidGlyph(_enemy, _index, alt) {
    return alt ? 'H' : 'T';
  },
  tone(enemy) {
    return enemy.warn.length > 0 || enemy.cells.length > 0 ? 'alert' : undefined;
  },
};

/** A sleeper hears the player's moves within this many walking steps (walls count). */
export const SLEEPER_WAKE_DISTANCE = 4;
/** Enemy turns a woken sleeper hunts before it gives up and walks home. */
export const SLEEPER_AWAKE_TURNS = 12;

/** What a sleeper is doing, kept in `memory.mode`. */
export const SleepMode = { Asleep: 0, Stirring: 1, Awake: 2, Returning: 3 } as const;

/**
 * Sleeps at home like a Bloodstone. A player move that ends within SLEEPER_WAKE_DISTANCE walking
 * steps wakes it (waiting is silent): it stirs for one turn (`enemyAlerted` if in view), then hunts
 * like the Chaser for SLEEPER_AWAKE_TURNS turns, then walks home ignoring the player and falls
 * asleep there (never in place, so it cannot plug a corridor for good). It uses no randomness.
 */
const sleep: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, {
      hx: spawn.pos.x,
      hy: spawn.pos.y,
      mode: SleepMode.Asleep,
      left: 0,
    });
  },
  act(enemy, state) {
    const m = enemy.memory;
    const events: GameEvent[] = [];
    const { floor, player } = state;
    const home = { x: m.hx as number, y: m.hy as number };

    if (m.mode === SleepMode.Asleep) {
      const near = Math.abs(player.pos.x - enemy.pos.x) + Math.abs(player.pos.y - enemy.pos.y);
      if (near > SLEEPER_WAKE_DISTANCE || !playerMoved(state)) return events;
      const walk = bfsDistances(floor, enemy.pos)[
        player.pos.y * floor.width + player.pos.x
      ] as number;
      if (walk < 0 || walk > SLEEPER_WAKE_DISTANCE) return events;
      m.mode = SleepMode.Stirring;
      if (state.visible[enemy.pos.y * floor.width + enemy.pos.x] === 1) {
        events.push({ type: 'enemyAlerted', enemyId: enemy.id });
      }
      return events;
    }

    if (m.mode === SleepMode.Stirring) {
      m.mode = SleepMode.Awake;
      m.left = SLEEPER_AWAKE_TURNS;
    }
    if (m.mode === SleepMode.Awake) {
      stepToward(enemy, state, player.pos);
      m.left = (m.left as number) - 1;
      if ((m.left as number) <= 0) m.mode = SleepMode.Returning;
    } else {
      stepToward(enemy, state, home); // Returning
      if (pointsEqual(enemy.pos, home)) m.mode = SleepMode.Asleep;
    }
    // Out of sight and on the move, it must be announced again when it comes back into view.
    if (
      m.mode !== SleepMode.Asleep &&
      state.visible[enemy.pos.y * floor.width + enemy.pos.x] !== 1
    ) {
      enemy.seen = false;
    }
    return events;
  },
  glyph(enemy, _index, alt) {
    const def = ENEMY_DEFS[enemy.type];
    const base = alt ? def.altGlyph : def.glyph;
    const m = enemy.memory.mode;
    return m === SleepMode.Stirring || m === SleepMode.Awake ? base.toUpperCase() : base;
  },
  tone(enemy) {
    const m = enemy.memory.mode;
    return m === SleepMode.Awake ? 'alert' : m === SleepMode.Stirring ? 'warn' : undefined;
  },
  dormant: (enemy) => enemy.memory.mode === SleepMode.Asleep,
  reset(enemy) {
    const m = enemy.memory;
    enemy.pos = { x: m.hx as number, y: m.hy as number };
    enemy.cells = [{ ...enemy.pos }];
    m.mode = SleepMode.Asleep;
    m.left = 0;
  },
};

/** A blinker never lands within this many tiles (Manhattan) of the start. */
export const BLINK_START_BUFFER = 3;

/** The tiles it may land on now: inside its leash, free, off the exit and away from the start. */
function blinkTargets(enemy: Enemy, state: GameState): Point[] {
  const { floor } = state;
  const field = homeField(enemy, state);
  const taken = new Set<number>();
  for (const other of state.entities) {
    if (!isEnemy(other)) continue;
    for (const c of [...other.cells, ...other.solid]) taken.add(c.y * floor.width + c.x);
  }
  const targets: Point[] = [];
  for (let i = 0; i < field.length; i++) {
    const d = field[i] as number;
    if (d < 0 || d > BLINKER_LEASH || taken.has(i)) continue;
    const x = i % floor.width;
    const y = (i - x) / floor.width;
    if (floor.tiles[i] === Tile.Exit) continue;
    if (Math.abs(x - floor.start.x) + Math.abs(y - floor.start.y) <= BLINK_START_BUFFER) continue;
    targets.push({ x, y });
  }
  return targets;
}

/**
 * A roaming Bloodstone. Every BLINKER_INTERVAL turns it jumps to a tile inside its leash. The
 * landing tile is picked BLINKER_WARN_TURNS turns earlier and shown as a `?` (`warn`,
 * `enemyAlerted` if you can see it), so you have two moves to be somewhere else; if you stand on it
 * when it lands that is contact. It hurts only the tile it stands on. The pick uses the
 * attempt-seeded enemy stream, so attempt N of a floor always blinks the same way.
 */
const blink: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, { hx: spawn.pos.x, hy: spawn.pos.y, k: 0, dx: -1, dy: -1 });
  },
  act(enemy, state, rng) {
    const m = enemy.memory;
    m.k = (m.k as number) + 1;
    const phase = (m.k as number) % BLINKER_INTERVAL;
    const { width } = state.floor;

    if (phase === 0) {
      if ((m.dx as number) >= 0) {
        enemy.pos = { x: m.dx as number, y: m.dy as number };
        enemy.cells = [{ ...enemy.pos }];
      }
      enemy.warn = [];
      m.dx = -1;
      m.dy = -1;
      return [];
    }
    if (phase !== BLINKER_INTERVAL - BLINKER_WARN_TURNS) return [];

    const targets = blinkTargets(enemy, state);
    const target = targets[rng.int(targets.length)];
    if (!target) return []; // nowhere to go: it stays put
    m.dx = target.x;
    m.dy = target.y;
    enemy.warn = [target];
    const seen =
      state.visible[target.y * width + target.x] === 1 ||
      state.visible[enemy.pos.y * width + enemy.pos.x] === 1;
    return seen ? [{ type: 'enemyAlerted', enemyId: enemy.id }] : [];
  },
  warnGlyph: '?',
  reset(enemy) {
    const m = enemy.memory;
    enemy.pos = { x: m.hx as number, y: m.hy as number };
    enemy.cells = [{ ...enemy.pos }];
    enemy.warn = [];
    m.k = 0;
    m.dx = -1;
    m.dy = -1;
  },
};

/**
 * A gate on the route. It is shut on the first BOUNCER_CLOSED turns of each BOUNCER_PERIOD (its
 * tile is in `cells`: it blocks, and touching it shoves you back), then open; the last open
 * turn marks it (`warn`, drawn `y`) because it closes on the next. It uses no randomness.
 */
const gate: Behavior = {
  init(enemy) {
    Object.assign(enemy.memory, { k: 0 });
    enemy.cells = [{ ...enemy.pos }];
    // Shut or open, `cells` says whether it hurts; the open gate must not block the player's way.
    enemy.blocksMovement = false;
  },
  act(enemy) {
    const m = enemy.memory;
    m.k = (m.k as number) + 1;
    enemy.cells = bouncerClosed(m.k as number) ? [{ ...enemy.pos }] : [];
    enemy.warn = (m.k as number) % BOUNCER_PERIOD === BOUNCER_PERIOD - 1 ? [{ ...enemy.pos }] : [];
    return [];
  },
  warnGlyph: 'y',
  reset(enemy) {
    enemy.memory.k = 0;
    enemy.cells = [{ ...enemy.pos }];
    enemy.warn = [];
  },
};

/** What a shade is doing, kept in `memory.mode`. */
export const DriftMode = { Idle: 0, Drift: 1, Return: 2 } as const;

/**
 * A slow drifter. Idle at home it feels the player within SHADE_NOTICE_DISTANCE walking steps
 * (walls count, line of sight does not matter) and drifts toward them, one tile on every second
 * turn. After SHADE_GIVE_UP_TURNS turns without the player that close it drifts home and idles.
 * Touching it blinds (`contact: 'blind'`): the Shade is then consumed (`memory.gone`) until the
 * player respawns. It uses no randomness.
 */
const drift: Behavior = {
  init(enemy, spawn) {
    Object.assign(enemy.memory, {
      hx: spawn.pos.x,
      hy: spawn.pos.y,
      mode: DriftMode.Idle,
      lost: 0,
      t: 0,
      gone: 0,
    });
  },
  act(enemy, state) {
    const m = enemy.memory;
    if (m.gone === 1) return [];
    const events: GameEvent[] = [];
    const { floor, player } = state;
    const home = { x: m.hx as number, y: m.hy as number };

    const near = (): boolean => {
      const manhattan = Math.abs(player.pos.x - enemy.pos.x) + Math.abs(player.pos.y - enemy.pos.y);
      if (manhattan > SHADE_NOTICE_DISTANCE) return false;
      const walk = bfsDistances(floor, enemy.pos)[
        player.pos.y * floor.width + player.pos.x
      ] as number;
      return walk >= 0 && walk <= SHADE_NOTICE_DISTANCE;
    };

    if (m.mode === DriftMode.Idle || m.mode === DriftMode.Return) {
      if (near()) {
        if (state.visible[enemy.pos.y * floor.width + enemy.pos.x] === 1) {
          events.push({ type: 'enemyAlerted', enemyId: enemy.id });
        }
        m.mode = DriftMode.Drift;
        m.lost = 0;
      }
    } else if (near()) {
      m.lost = 0;
    } else {
      m.lost = (m.lost as number) + 1;
      if ((m.lost as number) >= SHADE_GIVE_UP_TURNS) m.mode = DriftMode.Return;
    }
    if (m.mode === DriftMode.Idle) return events;

    m.t = (m.t as number) + 1;
    if ((m.t as number) % SHADE_PERIOD !== 0) return events;
    stepToward(enemy, state, m.mode === DriftMode.Drift ? player.pos : home);
    if (m.mode === DriftMode.Return && pointsEqual(enemy.pos, home)) m.mode = DriftMode.Idle;
    return events;
  },
  tone: () => 'shade',
  reset(enemy) {
    const m = enemy.memory;
    enemy.pos = { x: m.hx as number, y: m.hy as number };
    enemy.cells = [{ ...enemy.pos }];
    m.mode = DriftMode.Idle;
    m.lost = 0;
    m.t = 0;
    m.gone = 0;
    enemy.blocksMovement = true;
  },
};

/**
 * A pivot with one arm. The pivot (`solid`) always hurts when touched; the arm points at a
 * direction that turns a quarter clockwise on every enemy turn (period 4), and its tiles hurt (they
 * are `cells`). The direction the arm will take next turn is marked (`warn`), so the rhythm can
 * be read. Walls cut an arm short, so a wall right next to the pivot makes that turn free. It
 * uses no randomness; `hazard` in the def mirrors it for the route proof.
 */
const sweep: Behavior = {
  init(enemy, spawn, floor) {
    const end = spawn.end ?? spawn.pos;
    const len = Math.abs(end.x - spawn.pos.x) + Math.abs(end.y - spawn.pos.y);
    const d0 = directionIndex(spawn.pos, end);
    Object.assign(enemy.memory, { ax: spawn.pos.x, ay: spawn.pos.y, d0, len, k: 0, d: d0 });
    enemy.solid = [{ ...spawn.pos }];
    layOutArm(enemy, floor);
  },
  act(enemy, state) {
    const m = enemy.memory;
    m.k = (m.k as number) + 1;
    m.d = ((m.d0 as number) + (m.k as number)) % 4;
    layOutArm(enemy, state.floor);
    return [];
  },
  reset(enemy, state) {
    const m = enemy.memory;
    m.k = 0;
    m.d = m.d0;
    layOutArm(enemy, state.floor);
  },
  glyph(enemy) {
    return (enemy.memory.d as number) % 2 === 1 ? '=' : 'I';
  },
  solidGlyph(_enemy, _index, alt) {
    return alt ? '%' : 'X';
  },
  tone: (enemy) => (enemy.cells.length > 0 ? 'alert' : undefined),
};

/** The arm in its current direction hurts; the arm of the next direction is marked. */
function layOutArm(enemy: Enemy, floor: FloorMap): void {
  const m = enemy.memory;
  const pivot = { x: m.ax as number, y: m.ay as number };
  enemy.cells = armTiles(floor, pivot, m.d as number, m.len as number);
  enemy.warn = armTiles(floor, pivot, ((m.d as number) + 1) % 4, m.len as number);
}

export const BEHAVIORS: Readonly<Record<BehaviorId, Behavior>> = {
  // Still enemies (the Bloodstone) do nothing.
  none: { act: () => [] },
  patrol,
  swing,
  spear,
  chase,
  wander,
  ambush,
  sentinel,
  sleep,
  blink,
  gate,
  drift,
  sweep,
  lurk,
  trail,
  haunt,
  breed,
};
