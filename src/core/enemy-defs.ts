import { type BehaviorId } from './behaviors';
import {
  bouncerHazard,
  pendulumHazard,
  sentinelHazard,
  spearHazard,
  sweeperArmLength,
  sweeperHazard,
  type PeriodicHazard,
} from './hazards';
import { type EnemySpawn } from './floor-map';
import { type Point } from './geometry';
import { type TileField } from './pathfinding';
import { armTiles, nicheSides, spawnCells } from './segment';

/** Enemy types are data: adding one is mostly a new entry here (plus a behaviour if it moves). */
export type EnemyTypeId =
  | 'bloodstone'
  | 'patroller'
  | 'wanderer'
  | 'mimic'
  | 'spear'
  | 'sentinel'
  | 'sleeper'
  | 'bouncer'
  | 'blinker'
  | 'shade'
  | 'sweeper'
  | 'pendulum'
  | 'lurker'
  | 'shadow'
  | 'ghost'
  | 'breeder'
  | 'brood'
  | 'chaser';

/** What touching an enemy does (`core/contact.ts`). */
export type ContactEffect = 'life' | 'blind' | 'shove';

/** Which placer in `gen/placers/` finds a spot for it. */
export type PlacementKind =
  | 'point'
  | 'segment'
  | 'reach'
  | 'decoy'
  | 'line'
  | 'gate'
  | 'pivot'
  | 'crossing'
  | 'niche'
  | 'flag';

/**
 * What the generator promises about the shortest start -> exit route (roster plan, section 1):
 * `footprint` never touches it, `timing` may cross it but is proven passable, `construction` is
 * safe by how it is built, `reachable` only keeps the exit reachable, `none` promises nothing.
 */
export type Guarantee = 'footprint' | 'timing' | 'construction' | 'reachable' | 'none';

export interface EnemyDef {
  glyph: string;
  /** Character used in ASCII maps (none for a floor flag such as the Shadow). */
  mapChar?: string;
  /** Glyph used when a theme must not rely on colour alone (colorblind-safe). */
  altGlyph: string;
  /** Segment enemies: the map character that marks the far end of the segment. */
  endChar?: string;
  behavior: BehaviorId;
  /** First floor it can appear on. */
  minFloor: number;
  /** Relative spawn frequency among the types allowed on a floor. */
  weight: number;
  /** Lives lost on contact. */
  damage: number;
  /** Stays drawn (dimmed) once seen; moving enemies hide when out of sight. */
  remembered: boolean;
  /** What touching it does. */
  contact: ContactEffect;
  /** Threat budget units (`budgetForFloor` in gen/difficulty.ts). */
  cost: number;
  placement: PlacementKind;
  guarantee: Guarantee;
  /** A hunter-class type: a floor holds at most MAX_HUNTER_TYPES different ones (`gen/difficulty.ts`). */
  hunter?: boolean;
  /** Most of this type on one floor. */
  maxPerFloor(floor: number): number;
  /** Walking distance its starting tile must be from the start, if more than the common minimum. */
  homeDistance?: number;
  /**
   * Straight-line (not walking) distance its home keeps from every tile of the shortest route, for
   * a type that ignores the maze (the Ghost).
   */
  routeBuffer?: number;
  /** Timed types only: the hazard the route proof reads. */
  hazard?(spawn: EnemySpawn, map: TileField): PeriodicHazard;
  /**
   * Every tile it can ever hurt or occupy, when that is more than `spawnCells` (a sweeper's arms in
   * all four directions). Placement keeps all of them clear and away from the start.
   */
  reach?(spawn: EnemySpawn, map: TileField): Point[];
  /**
   * Types that range over, or fill, an area around their home (the Blinker, the Breeder): it must hold at
   * least `minTiles` walkable tiles within `radius` walking steps, or the placer tries another tile.
   */
  leash?: { radius: number; minTiles: number };
  /**
   * Ambushing types only: the tiles where the player must not stand still (a Lurker's
   * neighbours). The route proof never makes the player wait on such a tile.
   */
  noStop?(spawn: EnemySpawn, map: TileField): Point[];
  /** Its home tile is a permanent solid body (`enemy.solid`): reachability checks treat it as a wall. */
  body?: boolean;
}

/** Every tile a spawn can ever hurt or occupy (its `reach`, or else the segment it walks). */
export function spawnReach(spawn: EnemySpawn, map: TileField): Point[] {
  return ENEMY_DEFS[spawn.type].reach?.(spawn, map) ?? spawnCells(spawn);
}

/**
 * The tiles of a spawn that never become free: everything for a `footprint` type, just the home
 * tile for a type with a solid body. Reachability checks (pickups, decoys) treat them as walls.
 */
export function fixedTiles(spawn: EnemySpawn): Point[] {
  const def = ENEMY_DEFS[spawn.type];
  if (def.guarantee === 'footprint') return spawnCells(spawn);
  return def.body ? [{ ...spawn.pos }] : [];
}

/** At most one chaser per floor, then up to this many from CHASER_CROWD_FLOOR on. */
export const MAX_CHASERS_LATE = 3;
export const CHASER_CROWD_FLOOR = 60;
/** At most 2 sentinels per floor, then up to this many from SENTINEL_CROWD_FLOOR on. */
export const MAX_SENTINELS_LATE = 4;
export const SENTINEL_CROWD_FLOOR = 60;
/** At most one sleeper per floor, then up to this many from SLEEPER_CROWD_FLOOR on. */
export const MAX_SLEEPERS_LATE = 2;
export const SLEEPER_CROWD_FLOOR = 65;
/** A breeder adds a young one every this many turns, up to BREED_MAX of them, within BREED_REACH steps. */
export const BREED_INTERVAL = 12;
export const BREED_MAX = 5;
export const BREED_REACH = 6;
/** A young one never appears closer than this (walking) to the start, or than 2 steps to a life pickup. */
export const BREED_START_DISTANCE = 3;
export const BREED_PICKUP_DISTANCE = 2;
/** At most one breeder per floor, two from this floor on. */
export const BREEDER_CROWD_FLOOR = 90;
/** A ghost feels the player within this straight-line distance, walls or not. */
export const GHOST_NOTICE_DISTANCE = 7;
/** Its home keeps at least this straight-line distance from every route tile (so a dash never wakes it). */
export const GHOST_ROUTE_BUFFER = 8;
/** A ghost drifts on every this-many-th turn (half the player's speed). */
export const GHOST_PERIOD = 2;
/** Turns without the player within GHOST_NOTICE_DISTANCE before it drifts home. */
export const GHOST_GIVE_UP_TURNS = 12;
/** A ghost's home is at least this far (walking) from the start. */
export const GHOST_HOME_DISTANCE = 12;
/** At most one ghost per floor, two from this floor on. */
export const GHOST_CROWD_FLOOR = 90;
/** The Shadow stands where the player was this many turns ago (the `;shadow` directive's value). */
export const SHADOW_LAG = 20;
/** A sleeper's home is at least this far (walking) from the start. */
export const SLEEPER_HOME_DISTANCE = 12;
/** At most one sweeper per floor, two from this floor on. */
export const SWEEPER_CROWD_FLOOR = 70;
/** At most one pair of pendulums per floor, two pairs from this floor on. */
export const PENDULUM_CROWD_FLOOR = 70;
/** A shade feels the player within this many walking steps (no line of sight needed). */
export const SHADE_NOTICE_DISTANCE = 6;
/** A shade drifts on every this-many-th turn (half the player's speed). */
export const SHADE_PERIOD = 2;
/** Turns without the player within SHADE_NOTICE_DISTANCE before a shade drifts home. */
export const SHADE_GIVE_UP_TURNS = 10;
/** A shade's home is at least this far (walking) from the start. */
export const SHADE_HOME_DISTANCE = 10;
/** A blinker jumps every BLINKER_INTERVAL turns, announcing the landing BLINKER_WARN_TURNS before. */
export const BLINKER_INTERVAL = 8;
export const BLINKER_WARN_TURNS = 2;
/** It lands within this many walking steps of home; its home needs this many tiles to jump to. */
export const BLINKER_LEASH = 6;
export const BLINKER_MIN_TILES = 6;
/** A chaser's home is at least this far (walking) from the start, so it never starts near you. */
export const CHASER_HOME_DISTANCE = 12;

const unlimited = (): number => Infinity;

export const ENEMY_DEFS: Readonly<Record<EnemyTypeId, EnemyDef>> = {
  // A dark red block that never moves; walking into it costs a life.
  bloodstone: {
    glyph: '#',
    mapChar: 'x',
    altGlyph: '%',
    behavior: 'none',
    minFloor: 2,
    weight: 1,
    damage: 1,
    remembered: true,
    contact: 'life',
    cost: 1,
    placement: 'point',
    guarantee: 'footprint',
    maxPerFloor: unlimited,
  },
  // Walks a straight segment back and forth, one tile per turn.
  patroller: {
    glyph: '&',
    mapChar: 'p',
    altGlyph: '$',
    endChar: 'P',
    behavior: 'patrol',
    minFloor: 8,
    weight: 1,
    damage: 1,
    remembered: false,
    contact: 'life',
    cost: 1,
    placement: 'segment',
    guarantee: 'footprint',
    maxPerFloor: unlimited,
  },
  // Ambles around its home tile at half your speed, with no purpose (see its behaviour).
  wanderer: {
    glyph: 'r',
    mapChar: 'r',
    altGlyph: 'e',
    behavior: 'wander',
    minFloor: 12,
    weight: 1,
    damage: 1,
    hunter: true,
    remembered: false,
    contact: 'life',
    cost: 1,
    placement: 'point',
    guarantee: 'reachable',
    maxPerFloor: () => 3,
    homeDistance: 8,
  },
  // Dressed as the life pickup (`+`) until you come within 2 steps, then strikes the tiles around
  // it. Not drawn with the other types: gen/mimics.ts places it in its own pass (weight 0).
  mimic: {
    glyph: '+',
    mapChar: 'm',
    altGlyph: '+',
    behavior: 'ambush',
    minFloor: 16,
    weight: 0,
    damage: 1,
    remembered: true,
    contact: 'life',
    cost: 0,
    placement: 'decoy',
    guarantee: 'footprint',
    maxPerFloor: () => 1,
  },
  // Grows from its base to full length and shrinks back, one tile per turn; every tile of it
  // hurts. Its glyphs depend on the length and direction (see its behaviour's `glyph`), so
  // `glyph` is a stub.
  spear: {
    glyph: '>',
    mapChar: 's',
    altGlyph: '>',
    endChar: 'S',
    behavior: 'spear',
    minFloor: 20,
    weight: 1,
    damage: 1,
    remembered: false,
    contact: 'life',
    cost: 2,
    placement: 'reach',
    guarantee: 'timing',
    maxPerFloor: unlimited,
    hazard: spearHazard,
  },
  // A springy gate on the route: shut for 5 turns of 8, then open. Touching it while shut throws
  // you back along your footsteps (no life lost). The only enemy allowed on the route.
  bouncer: {
    glyph: 'Y',
    mapChar: 'y',
    altGlyph: 'V',
    behavior: 'gate',
    minFloor: 32,
    weight: 1,
    damage: 0,
    remembered: false,
    contact: 'shove',
    cost: 1,
    placement: 'gate',
    guarantee: 'timing',
    maxPerFloor: () => 2,
    hazard: bouncerHazard,
  },
  // A turret on a wall: marks its beam for 2 turns, then fires it for one (see its behaviour). The
  // spawn is segment-style (`t` body, `T` beam tip); the body is solid and always remembered.
  sentinel: {
    glyph: 'T',
    mapChar: 't',
    altGlyph: 'H',
    endChar: 'T',
    behavior: 'sentinel',
    minFloor: 24,
    weight: 1,
    damage: 1,
    remembered: true,
    contact: 'life',
    cost: 2,
    placement: 'line',
    guarantee: 'timing',
    maxPerFloor: (floor) => (floor >= SENTINEL_CROWD_FLOOR ? MAX_SENTINELS_LATE : 2),
    hazard: sentinelHazard,
    body: true,
  },
  // A pivot with one arm that turns a quarter clockwise every turn; the next position is marked.
  // The spawn is segment-style (`w` pivot, `W` arm tip at the start); the pivot is solid.
  sweeper: {
    glyph: 'X',
    mapChar: 'w',
    altGlyph: '%',
    endChar: 'W',
    behavior: 'sweep',
    minFloor: 44,
    weight: 1,
    damage: 1,
    remembered: true,
    contact: 'life',
    cost: 2,
    placement: 'pivot',
    guarantee: 'timing',
    maxPerFloor: (floor) => (floor >= SWEEPER_CROWD_FLOOR ? 2 : 1),
    hazard: sweeperHazard,
    reach: (spawn, map) => [
      { ...spawn.pos },
      ...[0, 1, 2, 3].flatMap((d) => armTiles(map, spawn.pos, d, sweeperArmLength(spawn))),
    ],
    body: true,
  },
  // A patroller whose lane meets the shortest route: you time your way across it. Placed in pairs
  // (`q` start, `Q` far end), one lane at a time counts towards the cap.
  pendulum: {
    glyph: '&',
    mapChar: 'q',
    altGlyph: '$',
    endChar: 'Q',
    behavior: 'swing',
    minFloor: 48,
    weight: 0.5, // about half the floors (it was on nearly all of them): see the M26 notes
    damage: 1,
    remembered: false,
    contact: 'life',
    cost: 2,
    placement: 'crossing',
    guarantee: 'timing',
    maxPerFloor: (floor) => (floor >= PENDULUM_CROWD_FLOOR ? 4 : 2),
    hazard: pendulumHazard,
  },
  // A trap on the first tile of a small dead end that branches off the route, invisible until you end a turn next to it (see
  // its behaviour). Never on the route; the route proof never makes you wait beside it.
  lurker: {
    glyph: 'L',
    mapChar: 'l',
    altGlyph: 'K',
    behavior: 'lurk',
    minFloor: 52,
    weight: 1,
    damage: 1,
    remembered: true,
    contact: 'life',
    cost: 2,
    placement: 'niche',
    guarantee: 'construction',
    maxPerFloor: () => 2,
    noStop: (spawn, map) => [0, 1, 2, 3].flatMap((d) => armTiles(map, spawn.pos, d, 1)),
    // Its tile, and the small dead end it shuts off (nothing else is placed there).
    reach: (spawn, map) => [
      { ...spawn.pos },
      ...nicheSides(map, spawn.pos).flatMap((side) => side.pocket ?? []),
    ],
    body: true,
  },
  // Your own footsteps, SHADOW_LAG turns late (see its behaviour). It is a floor flag, not a placed
  // spawn: the `;shadow` directive makes `placeFloorEnemies` add it at the start tile.
  shadow: {
    glyph: '~',
    altGlyph: '^',
    behavior: 'trail',
    minFloor: 58,
    weight: 0,
    damage: 1,
    remembered: false,
    contact: 'life',
    cost: 3,
    placement: 'flag',
    guarantee: 'construction',
    maxPerFloor: () => 1,
  },
  // Ignores the maze: once it feels you (straight-line distance 7, through rock) it drifts straight
  // at you at half your speed, through walls. See its behaviour.
  ghost: {
    glyph: 'g',
    mapChar: 'g',
    altGlyph: 'G',
    behavior: 'haunt',
    minFloor: 65,
    weight: 1,
    damage: 1,
    hunter: true,
    remembered: false,
    contact: 'life',
    cost: 3,
    placement: 'point',
    guarantee: 'reachable',
    maxPerFloor: (floor) => (floor >= GHOST_CROWD_FLOOR ? 2 : 1),
    homeDistance: GHOST_HOME_DISTANCE,
    routeBuffer: GHOST_ROUTE_BUFFER,
  },
  // A mother who adds a static young one beside her every BREED_INTERVAL turns (see its behaviour).
  breeder: {
    glyph: 'B',
    mapChar: 'b',
    altGlyph: '8',
    behavior: 'breed',
    minFloor: 72,
    weight: 1,
    damage: 1,
    remembered: true,
    contact: 'life',
    cost: 3,
    placement: 'point',
    guarantee: 'footprint',
    maxPerFloor: (floor) => (floor >= BREEDER_CROWD_FLOOR ? 2 : 1),
    homeDistance: 12,
    // She needs room around her for her young.
    leash: { radius: BREED_REACH, minTiles: BREED_MAX + 1 },
  },
  // A young one of the breeder: a Bloodstone that appears while you play. Never placed by the
  // generator (a floor flag, like the Shadow, never in `spawns`) and gone again on a respawn.
  brood: {
    glyph: 'b',
    altGlyph: 'o',
    behavior: 'none',
    minFloor: 72,
    weight: 0,
    damage: 1,
    remembered: true,
    contact: 'life',
    cost: 0,
    placement: 'flag',
    guarantee: 'construction',
    maxPerFloor: unlimited,
  },
  // A slow drifter whose touch blinds instead of hurting: the sight radius collapses for a while
  // (contact 'blind'). It vanishes until the player respawns. See its behaviour.
  shade: {
    glyph: 'u',
    mapChar: 'u',
    altGlyph: 'v',
    behavior: 'drift',
    minFloor: 40,
    weight: 1,
    damage: 0,
    hunter: true,
    remembered: false,
    contact: 'blind',
    cost: 1,
    placement: 'point',
    guarantee: 'construction',
    maxPerFloor: () => 2,
    homeDistance: SHADE_HOME_DISTANCE,
  },
  // A roaming Bloodstone: sits on a tile, then jumps within its leash, announcing the landing tile
  // two turns ahead with a `?` (see its behaviour). Hidden out of sight. Its fairness is the
  // announcement, not the route (a blind dash can be hit), so it only promises `reachable`.
  blinker: {
    glyph: 'k',
    mapChar: 'k',
    altGlyph: 'j',
    behavior: 'blink',
    minFloor: 30,
    weight: 1,
    damage: 1,
    remembered: false,
    contact: 'life',
    cost: 2,
    placement: 'point',
    guarantee: 'reachable',
    maxPerFloor: () => 2,
    homeDistance: 8,
    leash: { radius: BLINKER_LEASH, minTiles: BLINKER_MIN_TILES },
  },
  // Sleeps like a Bloodstone until it hears you move nearby, then hunts for 12 turns and walks home.
  sleeper: {
    glyph: 'z',
    mapChar: 'z',
    altGlyph: 'n',
    behavior: 'sleep',
    minFloor: 28,
    weight: 1,
    damage: 1,
    hunter: true,
    remembered: true,
    contact: 'life',
    cost: 3,
    placement: 'point',
    guarantee: 'reachable',
    maxPerFloor: (floor) => (floor >= SLEEPER_CROWD_FLOOR ? MAX_SLEEPERS_LATE : 1),
    homeDistance: SLEEPER_HOME_DISTANCE,
  },
  // Waits at its home tile until it sees the player, then hunts them tile by tile (see behaviors).
  // Drawn lower case while idle and upper case while hunting (see its behaviour's `glyph`).
  chaser: {
    glyph: 'c',
    mapChar: 'c',
    altGlyph: 'o',
    behavior: 'chase',
    minFloor: 35,
    weight: 1,
    damage: 1,
    hunter: true,
    remembered: false,
    contact: 'life',
    cost: 3,
    placement: 'point',
    guarantee: 'reachable',
    maxPerFloor: (floor) => (floor >= CHASER_CROWD_FLOOR ? MAX_CHASERS_LATE : 1),
    homeDistance: CHASER_HOME_DISTANCE,
  },
};

export const ENEMY_TYPE_IDS = Object.keys(ENEMY_DEFS) as EnemyTypeId[];

/** The enemy types the weighted draw may use on a floor (decoys have their own pass). */
export function enemyTypesForFloor(floor: number): EnemyTypeId[] {
  return ENEMY_TYPE_IDS.filter(
    (id) =>
      ENEMY_DEFS[id].minFloor <= floor &&
      ENEMY_DEFS[id].placement !== 'decoy' &&
      ENEMY_DEFS[id].placement !== 'flag',
  );
}

/** The type written as `ch` in ASCII maps, or null. */
export function enemyTypeForMapChar(ch: string): EnemyTypeId | null {
  return ENEMY_TYPE_IDS.find((id) => ENEMY_DEFS[id].mapChar === ch) ?? null;
}
