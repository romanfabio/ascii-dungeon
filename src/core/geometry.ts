export interface Point {
  x: number;
  y: number;
}

export type Dir = 'N' | 'E' | 'S' | 'W';

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];

export const DIR_VEC: Readonly<Record<Dir, Point>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/** Same order as DIRS (N, E, S, W), for index-based hot loops. */
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
