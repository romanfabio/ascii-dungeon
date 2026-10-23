import { type Dir } from '../core/geometry';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Space taken by notches and system bars, in the same units as the canvas (device pixels). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface Layout {
  /** The hearts row, on top. */
  lives: Rect;
  /** The stats row (floor, steps, time, buttons), under the lives row. */
  hud: Rect;
  hudFontPx: number;
  /** Where the map (or the camera's viewport of it) is drawn. */
  mapArea: Rect;
  /** Space reserved for the on-screen D-pad, or null when it is hidden. */
  dpad: Rect | null;
}

export interface LayoutOptions {
  insets?: Insets;
  /** Reserve room for the on-screen D-pad. */
  dpad: boolean;
}

/** Fraction of the height below the HUD given to the D-pad in portrait. */
const DPAD_PORTRAIT_SHARE = 0.35;

/**
 * Splits the canvas (device pixels) into a lives row, a HUD row, the map area and, optionally, the D-pad area:
 * below the map in portrait, to the right of it in landscape.
 */
export function computeLayout(
  width: number,
  height: number,
  dpr: number,
  opts: LayoutOptions,
): Layout {
  const insets = opts.insets ?? NO_INSETS;
  const content: Rect = {
    x: insets.left,
    y: insets.top,
    w: Math.max(1, width - insets.left - insets.right),
    h: Math.max(1, height - insets.top - insets.bottom),
  };

  const hudFontPx = Math.round(
    Math.min(26 * dpr, Math.max(14 * dpr, Math.min(width, height) * 0.035)),
  );
  const livesH = Math.min(Math.round(hudFontPx * 1.8), content.h);
  const hudH = Math.min(Math.round(hudFontPx * 2.2), content.h - livesH);
  const lives: Rect = { x: content.x, y: content.y, w: content.w, h: livesH };
  const hud: Rect = { x: content.x, y: content.y + livesH, w: content.w, h: hudH };
  const top = livesH + hudH;
  const below: Rect = { x: content.x, y: content.y + top, w: content.w, h: content.h - top };

  if (!opts.dpad) return { lives, hud, hudFontPx, mapArea: below, dpad: null };

  if (height >= width) {
    const dpadH = Math.round(below.h * DPAD_PORTRAIT_SHARE);
    return {
      lives,
      hud,
      hudFontPx,
      mapArea: { ...below, h: below.h - dpadH },
      dpad: { x: below.x, y: below.y + below.h - dpadH, w: below.w, h: dpadH },
    };
  }
  const dpadW = Math.round(Math.min(below.w * 0.3, below.h * 0.9));
  return {
    lives,
    hud,
    hudFontPx,
    mapArea: { ...below, w: below.w - dpadW },
    dpad: { x: below.x + below.w - dpadW, y: below.y, w: dpadW, h: below.h },
  };
}

export type DpadSize = 'S' | 'M' | 'L';

const DPAD_SIZE_FACTOR: Record<DpadSize, number> = { S: 0.65, M: 0.85, L: 1 };

export type DpadGeometry = Record<Dir, Rect> & {
  /** The centre button: wait a turn. */ wait: Rect;
};

/**
 * Four buttons in a plus shape (a 3x3 grid without the corners) plus the centre button that
 * waits a turn, as large as the area allows for the chosen size, centered in it.
 */
export function dpadGeometry(area: Rect, size: DpadSize): DpadGeometry {
  const cluster = Math.floor(Math.min(area.w, area.h) * 0.95 * DPAD_SIZE_FACTOR[size]);
  const cell = Math.floor(cluster / 3);
  const x0 = area.x + Math.floor((area.w - cell * 3) / 2);
  const y0 = area.y + Math.floor((area.h - cell * 3) / 2);
  const at = (col: number, row: number): Rect => ({
    x: x0 + col * cell,
    y: y0 + row * cell,
    w: cell,
    h: cell,
  });
  return { N: at(1, 0), E: at(2, 1), S: at(1, 2), W: at(0, 1), wait: at(1, 1) };
}

export interface HudButtons {
  zoom: Rect;
  pause: Rect;
}

/** Monospace glyphs are 0.6 em wide. */
export const GLYPH_WIDTH_EM = 0.6;

/**
 * Tappable HUD buttons "[Z]" and "[II]" at the right end of the HUD. Returned rectangles are the
 * touch targets (full HUD height, widened by a character each side); labels are drawn centered.
 */
export function hudButtons(layout: Layout): HudButtons {
  const { hud, hudFontPx } = layout;
  const charW = hudFontPx * GLYPH_WIDTH_EM;
  const pad = Math.round(hudFontPx * 0.6);
  const pauseW = Math.round(charW * 4);
  const zoomW = Math.round(charW * 3);
  const gap = Math.round(charW * 3);
  const pauseX = hud.x + hud.w - pad - pauseW;
  const zoomX = pauseX - gap - zoomW;
  const slack = Math.round(charW * 1.2);
  const target = (x: number, w: number): Rect => {
    const left = Math.max(hud.x, x - slack);
    const right = Math.min(hud.x + hud.w, x + w + slack);
    return { x: left, y: hud.y, w: right - left, h: hud.h };
  };
  return { zoom: target(zoomX, zoomW), pause: target(pauseX, pauseW) };
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}
