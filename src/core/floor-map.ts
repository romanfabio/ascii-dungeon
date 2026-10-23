import { ENEMY_DEFS, ENEMY_TYPE_IDS, enemyTypeForMapChar, type EnemyTypeId } from './enemy-defs';
import { type Point } from './geometry';
import { bfsDistances } from './pathfinding';
import { PICKUP_CHARS, pickupTypeForMapChar, type PickupSpawn } from './pickups';
import { Tile, TILE_DEFS, type TileType } from './tiles';

/** Where an enemy starts on a floor. Enemies are not part of the tile map. */
export interface EnemySpawn {
  type: EnemyTypeId;
  pos: Point;
  /** Patrollers: the other end of their straight segment (they start at `pos`). */
  end?: Point;
}

export { spawnCells } from './segment';

export interface FloorMap {
  width: number;
  height: number;
  /** TileType per cell, row-major. */
  tiles: Uint8Array;
  /** 1 = seen at least once. */
  explored: Uint8Array;
  start: Point;
  exit: Point;
  /** Enemies to place when the floor starts (in id order). */
  spawns: EnemySpawn[];
  /** Collectables lying on the floor (the extra life; see `gen/pickups.ts`). */
  pickups: PickupSpawn[];
  /**
   * Floor-wide flags that have no tile (ASCII lines such as `;shadow 20`): name -> value, 1 when
   * written without one.
   */
  directives: Record<string, number>;
  /** Walking distance start -> exit, or -1 if unreachable. */
  optimalPathLength: number;
  seed: number;
  floorNumber: number;
}

export interface FloorMeta {
  seed?: number;
  floorNumber?: number;
  spawns?: EnemySpawn[];
  pickups?: PickupSpawn[];
  directives?: Record<string, number>;
}

/** Assembles a FloorMap: writes the exit tile and computes the optimal path length. */
export function buildFloorMap(
  tiles: Uint8Array,
  width: number,
  height: number,
  start: Point,
  exit: Point,
  meta: FloorMeta = {},
): FloorMap {
  tiles[exit.y * width + exit.x] = Tile.Exit;
  const dist = bfsDistances({ width, height, tiles }, start);
  return {
    width,
    height,
    tiles,
    explored: new Uint8Array(width * height),
    start,
    exit,
    spawns: meta.spawns ?? [],
    pickups: meta.pickups ?? [],
    directives: meta.directives ?? {},
    optimalPathLength: dist[exit.y * width + exit.x] as number,
    seed: meta.seed ?? 0,
    floorNumber: meta.floorNumber ?? 0,
  };
}

/** Is `ch` the end marker of some segment enemy ('P' for patrollers, 'S' for spears)? */
function isEndChar(ch: string): boolean {
  return ENEMY_TYPE_IDS.some((id) => ENEMY_DEFS[id].endChar === ch);
}

/** Gives every segment enemy the nearest unclaimed end marker of its kind in its row or column. */
function pairSegmentEnds(spawns: EnemySpawn[], ends: { pos: Point; ch: string }[]): void {
  const free = [...ends];
  for (const spawn of spawns) {
    const endChar = ENEMY_DEFS[spawn.type].endChar;
    if (endChar === undefined) continue;
    let best = -1;
    let bestDist = Infinity;
    free.forEach((e, i) => {
      if (e.ch !== endChar) return;
      if (e.pos.x !== spawn.pos.x && e.pos.y !== spawn.pos.y) return;
      const d = Math.abs(e.pos.x - spawn.pos.x) + Math.abs(e.pos.y - spawn.pos.y);
      if (d > 0 && d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    if (best < 0) {
      throw new Error(`parseMap: ${spawn.type} at ${spawn.pos.x},${spawn.pos.y} has no end marker`);
    }
    spawn.end = (free.splice(best, 1)[0] as { pos: Point }).pos;
  }
  if (free.length > 0) throw new Error('parseMap: end marker without an enemy to belong to');
}

/**
 * Parses ASCII art: '#' wall, '.' floor, '@' player start, '!' exit, and an enemy character
 * ('x' = Bloodstone) for an enemy standing on a floor tile. A patroller is written 'p' at its
 * start and 'P' at the other end of its straight segment; a spear is 's' at its base and 'S' at
 * its tip when fully extended. Each start takes the nearest unclaimed end marker of its kind in
 * its row or column. '+' is a life pickup lying on a floor tile.
 * Lines after the grid that start with ';' are directives (`;shadow 20`, or `;flag` for 1).
 * All grid lines must have the same length; exactly one '@' and one '!' are required.
 */
export function parseMap(allLines: readonly string[], meta: FloorMeta = {}): FloorMap {
  const directives: Record<string, number> = {};
  const lines = allLines.filter((line) => {
    if (!line.startsWith(';')) return true;
    const [name, value] = line.slice(1).trim().split(/\s+/);
    if (!name) throw new Error(`parseMap: empty directive '${line}'`);
    const n = value === undefined ? 1 : Number(value);
    if (!Number.isFinite(n)) throw new Error(`parseMap: bad directive '${line}'`);
    directives[name] = n;
    return false;
  });
  const height = lines.length;
  const width = lines[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error('parseMap: empty map');

  const tiles = new Uint8Array(width * height);
  let start: Point | null = null;
  let exit: Point | null = null;
  const spawns: EnemySpawn[] = [];
  const pickups: PickupSpawn[] = [];
  const segmentEnds: { pos: Point; ch: string }[] = [];
  for (let y = 0; y < height; y++) {
    const line = lines[y] as string;
    if (line.length !== width) {
      throw new Error(`parseMap: line ${y} has length ${line.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const ch = line[x];
      let tile: number = Tile.Floor;
      if (ch === '#') {
        tile = Tile.Wall;
      } else if (ch === '.') {
        tile = Tile.Floor;
      } else if (ch === '@') {
        if (start) throw new Error('parseMap: multiple start tiles');
        start = { x, y };
      } else if (ch === '!') {
        if (exit) throw new Error('parseMap: multiple exit tiles');
        exit = { x, y };
        tile = Tile.Exit;
      } else if (ch !== undefined && pickupTypeForMapChar(ch)) {
        pickups.push({ type: pickupTypeForMapChar(ch) as PickupSpawn['type'], pos: { x, y } });
      } else if (ch !== undefined && isEndChar(ch)) {
        segmentEnds.push({ pos: { x, y }, ch });
      } else if (ch !== undefined && enemyTypeForMapChar(ch)) {
        spawns.push({ type: enemyTypeForMapChar(ch) as EnemyTypeId, pos: { x, y } });
      } else {
        throw new Error(`parseMap: unknown character '${ch}' at ${x},${y}`);
      }
      tiles[y * width + x] = tile;
    }
  }
  if (!start) throw new Error('parseMap: missing start tile (@)');
  if (!exit) throw new Error('parseMap: missing exit tile (!)');
  pairSegmentEnds(spawns, segmentEnds);
  return buildFloorMap(tiles, width, height, start, exit, {
    ...meta,
    spawns,
    pickups,
    directives: { ...meta.directives, ...directives },
  });
}

/**
 * Inverse of parseMap. `enemies: false` prints the bare terrain; `pickups` follows `enemies`
 * unless given.
 */
export function serializeMap(
  map: FloorMap,
  opts: { enemies?: boolean; pickups?: boolean } = {},
): string[] {
  const spawnChar = new Map<number, string>();
  if (opts.pickups ?? opts.enemies ?? true) {
    for (const p of map.pickups) spawnChar.set(p.pos.y * map.width + p.pos.x, PICKUP_CHARS[p.type]);
  }
  if (opts.enemies ?? true) {
    for (const s of map.spawns) {
      const mapChar = ENEMY_DEFS[s.type].mapChar;
      if (mapChar) spawnChar.set(s.pos.y * map.width + s.pos.x, mapChar);
      const endChar = ENEMY_DEFS[s.type].endChar;
      if (s.end && endChar) spawnChar.set(s.end.y * map.width + s.end.x, endChar);
    }
  }
  const lines: string[] = [];
  for (let y = 0; y < map.height; y++) {
    let line = '';
    for (let x = 0; x < map.width; x++) {
      if (x === map.start.x && y === map.start.y) {
        line += '@';
      } else {
        line +=
          spawnChar.get(y * map.width + x) ??
          TILE_DEFS[map.tiles[y * map.width + x] as TileType].glyph;
      }
    }
    lines.push(line);
  }
  if (opts.enemies ?? true) {
    for (const [name, value] of Object.entries(map.directives)) {
      lines.push(value === 1 ? `;${name}` : `;${name} ${value}`);
    }
  }
  return lines;
}
