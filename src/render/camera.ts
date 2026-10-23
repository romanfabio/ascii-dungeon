import { type Point } from '../core/geometry';
import { type Rect } from './layout';

/** The part of the map on screen, and where/how big it is drawn. */
export interface View {
  /** Top-left map tile shown. */
  tileX: number;
  tileY: number;
  /** Number of map tiles shown across and down. */
  cols: number;
  rows: number;
  /** Side of one square cell, in whole device pixels. */
  cell: number;
  glyphPx: number;
  /** Pixel rectangle covered by the shown tiles, centered in the map area. */
  rect: Rect;
}

export interface CameraOptions {
  /** Smallest cell size (device px) worth drawing before the camera starts following. */
  minCell: number;
  /** Show the whole map even if tiny. */
  zoomOut: boolean;
}

/** Largest odd number <= n (at least 1), so the focus tile can sit exactly in the middle. */
function oddFloor(n: number): number {
  const odd = n % 2 === 1 ? n : n - 1;
  return Math.max(1, odd);
}

/**
 * Chooses what to draw. If the whole map fits at a readable size (or `zoomOut` is set) the whole
 * map is shown; otherwise the camera shows an area around `focus` at the minimum readable size,
 * clamped so it never shows past the map edges.
 */
export function computeView(
  area: Rect,
  mapCols: number,
  mapRows: number,
  focus: Point,
  opts: CameraOptions,
): View {
  const fitCell = Math.max(1, Math.floor(Math.min(area.w / mapCols, area.h / mapRows)));
  let cols = mapCols;
  let rows = mapRows;
  let cell = fitCell;

  if (!opts.zoomOut && fitCell < opts.minCell) {
    const minCell = Math.max(1, Math.round(opts.minCell));
    cols = Math.min(mapCols, oddFloor(Math.floor(area.w / minCell)));
    rows = Math.min(mapRows, oddFloor(Math.floor(area.h / minCell)));
    cell = Math.max(1, Math.floor(Math.min(area.w / cols, area.h / rows)));
    // Rounding the cell size up may leave room for more tiles.
    cols = Math.min(mapCols, oddFloor(Math.floor(area.w / cell)));
    rows = Math.min(mapRows, oddFloor(Math.floor(area.h / cell)));
  }

  const clamp = (v: number, max: number): number => Math.min(Math.max(0, v), max);
  const tileX = clamp(focus.x - Math.floor(cols / 2), mapCols - cols);
  const tileY = clamp(focus.y - Math.floor(rows / 2), mapRows - rows);
  const w = cols * cell;
  const h = rows * cell;
  return {
    tileX,
    tileY,
    cols,
    rows,
    cell,
    glyphPx: Math.max(6, Math.round(cell * 0.9)),
    rect: {
      x: area.x + Math.floor((area.w - w) / 2),
      y: area.y + Math.floor((area.h - h) / 2),
      w,
      h,
    },
  };
}

export function isInView(view: View, x: number, y: number): boolean {
  return (
    x >= view.tileX && y >= view.tileY && x < view.tileX + view.cols && y < view.tileY + view.rows
  );
}

/** Top-left pixel of a map tile. Only meaningful for tiles inside the view. */
export function tilePixel(view: View, x: number, y: number): Point {
  return {
    x: view.rect.x + (x - view.tileX) * view.cell,
    y: view.rect.y + (y - view.tileY) * view.cell,
  };
}
