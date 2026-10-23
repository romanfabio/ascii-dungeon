import { type GameState } from './game-state';
import { type Point } from './geometry';
import { type TileField } from './pathfinding';
import { Tile } from './tiles';

/**
 * Symmetric shadowcasting (Albert Ford): if A can see B, B can see A, and corridors have no
 * gaps. Slopes are kept as exact integer fractions, so there are no floating-point edge cases.
 *
 * Marks every tile visible from `origin` within `radius` (a round area) in `visible`
 * (cleared first). Walls are visible when lit; the map edge counts as wall.
 */
export function computeFov(
  map: TileField,
  origin: Point,
  radius: number,
  visible: Uint8Array,
): void {
  visible.fill(0);
  const { width, height, tiles } = map;
  const maxDistSq = (radius + 0.5) * (radius + 0.5);

  const isBlocking = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= width || y >= height || tiles[y * width + x] === Tile.Wall;

  const reveal = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const dx = x - origin.x;
    const dy = y - origin.y;
    if (dx * dx + dy * dy <= maxDistSq) visible[y * width + x] = 1;
  };

  reveal(origin.x, origin.y);

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    // Rotates quadrant-local (depth, col) into map coordinates.
    const toMap = (depth: number, col: number): [number, number] => {
      switch (quadrant) {
        case 0:
          return [origin.x + col, origin.y - depth]; // north
        case 1:
          return [origin.x + depth, origin.y + col]; // east
        case 2:
          return [origin.x + col, origin.y + depth]; // south
        default:
          return [origin.x - depth, origin.y + col]; // west
      }
    };

    // Slopes are fractions sn/sd (start) and en/ed (end), denominators positive.
    const scan = (depth: number, sn: number, sd: number, en: number, ed: number): void => {
      if (depth > radius) return;
      const minCol = Math.floor((2 * depth * sn + sd) / (2 * sd)); // round(depth * start), ties up
      const maxCol = Math.ceil((2 * depth * en - ed) / (2 * ed)); // round(depth * end), ties down

      let prevWall: boolean | null = null;
      for (let col = minCol; col <= maxCol; col++) {
        const [x, y] = toMap(depth, col);
        const wall = isBlocking(x, y);
        const symmetric = col * sd >= depth * sn && col * ed <= depth * en;
        if (wall || symmetric) reveal(x, y);

        if (prevWall === true && !wall) {
          sn = 2 * col - 1;
          sd = 2 * depth;
        }
        if (prevWall === false && wall) {
          scan(depth + 1, sn, sd, 2 * col - 1, 2 * depth);
        }
        prevWall = wall;
      }
      if (prevWall === false) scan(depth + 1, sn, sd, en, ed);
    };

    scan(1, -1, 1, 1, 1);
  }
}

/** Sight radius while blinded (`state.blindTurns > 0`). */
export const BLIND_SIGHT = 3;

/** How far the player sees right now: the floor's radius, clamped while blinded. */
export function effectiveSight(state: GameState): number {
  return state.blindTurns > 0 ? Math.min(state.sightRadius, BLIND_SIGHT) : state.sightRadius;
}

/** Recomputes what the player sees and adds it to the floor's explored memory. */
export function updateVisibility(state: GameState): void {
  const { floor, player, visible } = state;
  computeFov(floor, player.pos, effectiveSight(state), visible);
  for (let i = 0; i < visible.length; i++) {
    if (visible[i]) floor.explored[i] = 1;
  }
}
