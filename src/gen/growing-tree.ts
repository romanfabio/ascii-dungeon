import { DX, DY } from '../core/geometry';
import { Grid } from '../core/grid';
import { type Rng } from '../core/rng';
import { Tile } from '../core/tiles';

/**
 * Carves mazes into every odd-coordinate cell that is still solid wall, using the Growing Tree
 * algorithm. Cells sit on odd coordinates and corridors between them on even ones, so the
 * outer border always stays wall. Rooms (or any other floor) already in the grid are left alone.
 *
 * `newestBias` 1 behaves like a recursive backtracker (long winding corridors); 0 behaves like
 * Prim's algorithm (many short dead ends).
 */
export function fillWithMazes(grid: Grid, rng: Rng, newestBias: number): void {
  const starts: number[] = [];
  for (let y = 1; y < grid.height; y += 2) {
    for (let x = 1; x < grid.width; x += 2) starts.push(grid.index(x, y));
  }
  rng.shuffle(starts);

  const w = grid.width;
  const h = grid.height;
  const data = grid.data;
  const options: number[] = [];

  for (const startIdx of starts) {
    if (data[startIdx] !== Tile.Wall) continue;
    data[startIdx] = Tile.Floor;
    const active: number[] = [startIdx];

    while (active.length > 0) {
      const pick = rng.next() < newestBias ? active.length - 1 : rng.int(active.length);
      const cur = active[pick] as number;
      const cx = cur % w;
      const cy = (cur - cx) / w;

      options.length = 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + 2 * (DX[d] as number);
        const ny = cy + 2 * (DY[d] as number);
        if (nx < 1 || ny < 1 || nx > w - 2 || ny > h - 2) continue;
        if (data[ny * w + nx] === Tile.Wall) options.push(d);
      }

      if (options.length === 0) {
        active.splice(pick, 1);
        continue;
      }
      const d = rng.pick(options);
      const mx = cx + (DX[d] as number);
      const my = cy + (DY[d] as number);
      const nx = cx + 2 * (DX[d] as number);
      const ny = cy + 2 * (DY[d] as number);
      data[my * w + mx] = Tile.Floor;
      data[ny * w + nx] = Tile.Floor;
      active.push(ny * w + nx);
    }
  }
}
