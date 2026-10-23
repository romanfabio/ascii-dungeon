import { type EnemySpawn } from './floor-map';
import { DX, DY, type Point } from './geometry';
import { type TileField } from './pathfinding';
import { isWalkable } from './tiles';

/**
 * Segment enemies (patrollers and spears) keep their state in `enemy.memory`: the segment start
 * (ax, ay), its direction (dx, dy) and length `len`, the current offset `i` along it and the
 * walking direction `dir` (+1 / -1). Each turn `i` moves one step and bounces at both ends.
 */
export function stepAlongSegment(m: Record<string, number>): void {
  let next = (m.i as number) + (m.dir as number);
  if (next < 0 || next >= (m.len as number)) {
    m.dir = -(m.dir as number);
    next = (m.i as number) + (m.dir as number);
  }
  m.i = next;
}

/** The point `offset` tiles along the segment. */
export function segmentPoint(m: Record<string, number>, offset: number): Point {
  return {
    x: (m.ax as number) + (m.dx as number) * offset,
    y: (m.ay as number) + (m.dy as number) * offset,
  };
}

/**
 * Where the tip of a segment that bounces between offset 0 and `len - 1` is after `phase` turns
 * (starting at offset 0, heading out). Used by the generator to check timing without simulating.
 */
export function segmentTipOffset(len: number, phase: number): number {
  const period = 2 * (len - 1);
  const p = ((phase % period) + period) % period;
  return p <= len - 1 ? p : period - p;
}

/** Turns of one full out-and-back cycle. */
export function segmentPeriod(len: number): number {
  return 2 * (len - 1);
}

/** Every tile an enemy can ever occupy: its tile, or the whole straight segment. */
export function spawnCells(spawn: EnemySpawn): Point[] {
  const { pos, end } = spawn;
  if (!end) return [{ ...pos }];
  const dx = Math.sign(end.x - pos.x);
  const dy = Math.sign(end.y - pos.y);
  const len = Math.abs(end.x - pos.x) + Math.abs(end.y - pos.y) + 1;
  return Array.from({ length: len }, (_, i) => ({ x: pos.x + dx * i, y: pos.y + dy * i }));
}

/**
 * The walkable tiles from the one next to `pivot` in direction `dir` (0 N, 1 E, 2 S, 3 W, clockwise)
 * out to `len` tiles, cut short at the first wall. A sweeper's arm.
 */
export function armTiles(field: TileField, pivot: Point, dir: number, len: number): Point[] {
  const tiles: Point[] = [];
  for (let i = 1; i <= len; i++) {
    const x = pivot.x + (DX[dir] as number) * i;
    const y = pivot.y + (DY[dir] as number) * i;
    if (x < 0 || y < 0 || x >= field.width || y >= field.height) break;
    if (!isWalkable(field.tiles[y * field.width + x] as number)) break;
    tiles.push({ x, y });
  }
  return tiles;
}

/** A Lurker may close off at most this many tiles behind it (a small dead end). */
export const NICHE_POCKET_MAX = 8;

/** What lies on one side of a niche tile: the walkable neighbour, and whether it is a small closed pocket. */
export interface NicheSide {
  from: Point;
  /** The tiles of the pocket (including `from`) when everything behind `from` is at most NICHE_POCKET_MAX tiles. */
  pocket: Point[] | null;
}

/**
 * The sides of a niche tile `pos`: for each walkable neighbour, whether the region behind it (with
 * `pos` blocked) is a small closed pocket (a dead end that only `pos` leads into) or opens out
 * into the rest of the floor. A Lurker stands where exactly one side opens out: the route.
 */
export function nicheSides(field: TileField, pos: Point): NicheSide[] {
  const { width, height, tiles } = field;
  const home = pos.y * width + pos.x;
  const sides: NicheSide[] = [];
  for (let d = 0; d < 4; d++) {
    const x = pos.x + (DX[d] as number);
    const y = pos.y + (DY[d] as number);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (!isWalkable(tiles[y * width + x] as number)) continue;
    const seen = new Set<number>([home, y * width + x]);
    const queue: Point[] = [{ x, y }];
    for (let head = 0; head < queue.length && queue.length <= NICHE_POCKET_MAX; head++) {
      const at = queue[head] as Point;
      for (let k = 0; k < 4; k++) {
        const nx = at.x + (DX[k] as number);
        const ny = at.y + (DY[k] as number);
        const i = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (seen.has(i) || !isWalkable(tiles[i] as number)) continue;
        seen.add(i);
        queue.push({ x: nx, y: ny });
      }
    }
    sides.push({ from: { x, y }, pocket: queue.length <= NICHE_POCKET_MAX ? queue : null });
  }
  return sides;
}

/** The direction index (0 N, 1 E, 2 S, 3 W) from `from` towards `to` along a row or column. */
export function directionIndex(from: Point, to: Point): number {
  if (to.y < from.y) return 0;
  if (to.x > from.x) return 1;
  if (to.y > from.y) return 2;
  return 3;
}

/** The segment state `stepAlongSegment` and `segmentPoint` read, built from a spawn with an end. */
export function segmentMemory(spawn: EnemySpawn): Record<string, number> {
  const { pos, end } = spawn;
  if (!end) return {};
  const len = Math.abs(end.x - pos.x) + Math.abs(end.y - pos.y) + 1;
  return {
    ax: pos.x,
    ay: pos.y,
    dx: Math.sign(end.x - pos.x),
    dy: Math.sign(end.y - pos.y),
    len,
    i: 0,
    dir: 1,
  };
}
