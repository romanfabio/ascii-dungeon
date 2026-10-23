import { Grid } from '../core/grid';
import { labelComponents } from '../core/pathfinding';
import { type Rng } from '../core/rng';
import { Tile } from '../core/tiles';
import { fillWithMazes } from './growing-tree';

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Room, b: Room): boolean {
  // Touching counts as overlapping: rooms always keep at least one wall tile between them.
  return a.x + a.w >= b.x && b.x + b.w >= a.x && a.y + a.h >= b.y && b.y + b.h >= a.y;
}

function placeRooms(grid: Grid, rng: Rng, attempts: number): void {
  const rooms: Room[] = [];
  for (let i = 0; i < attempts; i++) {
    const base = rng.range(1, 3) * 2 + 1; // 3, 5 or 7
    const extra = rng.range(0, 2) * 2;
    const wide = rng.chance(0.5);
    const w = wide ? base + extra : base;
    const h = wide ? base : base + extra;
    if (w > grid.width - 2 || h > grid.height - 2) continue;

    const room: Room = {
      x: 1 + 2 * rng.int(Math.floor((grid.width - 1 - w) / 2) + 1),
      y: 1 + 2 * rng.int(Math.floor((grid.height - 1 - h) / 2) + 1),
      w,
      h,
    };
    if (rooms.some((r) => overlaps(room, r))) continue;
    rooms.push(room);
    for (let y = room.y; y < room.y + h; y++) {
      for (let x = room.x; x < room.x + w; x++) grid.set(x, y, Tile.Floor);
    }
  }
}

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(a: number): number {
    let root = a;
    while (this.parent[root] !== root) root = this.parent[root] as number;
    while (this.parent[a] !== root) {
      const next = this.parent[a] as number;
      this.parent[a] = root;
      a = next;
    }
    return root;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

/**
 * Rooms and Mazes (after Bob Nystrom): random non-overlapping rooms, mazes filling the rest, then
 * doors between regions until everything is connected, plus a few extra doors for loops.
 */
export function carveRoomsAndMazes(
  grid: Grid,
  rng: Rng,
  opts: { roomAttempts: number; newestBias: number; extraConnectorChance: number },
): void {
  placeRooms(grid, rng, opts.roomAttempts);
  fillWithMazes(grid, rng, opts.newestBias);

  // Every walkable region so far is isolated (walls separate them), so components = regions.
  const field = { width: grid.width, height: grid.height, tiles: grid.data };
  const { labels, count } = labelComponents(field);

  const connectors: { idx: number; a: number; b: number }[] = [];
  const w = grid.width;
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      const idx = y * w + x;
      if (grid.data[idx] !== Tile.Wall) continue;
      let a = labels[idx - 1] as number;
      let b = labels[idx + 1] as number;
      if (a < 0 || b < 0) {
        a = labels[idx - w] as number;
        b = labels[idx + w] as number;
      }
      if (a >= 0 && b >= 0 && a !== b) connectors.push({ idx, a, b });
    }
  }
  rng.shuffle(connectors);

  const regions = new UnionFind(count);
  for (const c of connectors) {
    if (regions.union(c.a, c.b) || rng.chance(opts.extraConnectorChance)) {
      grid.data[c.idx] = Tile.Floor;
    }
  }
}
