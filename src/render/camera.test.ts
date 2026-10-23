import { describe, expect, it } from 'vitest';
import { computeView, isInView, tilePixel } from './camera';
import { type Rect } from './layout';

const phoneArea: Rect = { x: 0, y: 90, w: 1080, h: 1400 }; // portrait map area, device px

describe('computeView', () => {
  it('shows the whole map when it fits at a readable size', () => {
    const v = computeView(phoneArea, 21, 21, { x: 3, y: 3 }, { minCell: 40, zoomOut: false });
    expect(v.cols).toBe(21);
    expect(v.rows).toBe(21);
    expect(v.tileX).toBe(0);
    expect(v.tileY).toBe(0);
    expect(v.cell).toBe(Math.floor(1080 / 21));
  });

  it('follows the player when the whole map would be too small', () => {
    const v = computeView(phoneArea, 61, 61, { x: 30, y: 30 }, { minCell: 47, zoomOut: false });
    expect(v.cell).toBeGreaterThanOrEqual(47);
    expect(v.cols).toBeLessThan(61);
    expect(v.cols % 2).toBe(1);
    // the player is in the middle of the viewport
    expect(v.tileX).toBe(30 - Math.floor(v.cols / 2));
    expect(v.tileY).toBe(30 - Math.floor(v.rows / 2));
    expect(isInView(v, 30, 30)).toBe(true);
  });

  it('the viewport fills (but never exceeds) the area', () => {
    const v = computeView(phoneArea, 61, 61, { x: 30, y: 30 }, { minCell: 47, zoomOut: false });
    expect(v.rect.w).toBeLessThanOrEqual(phoneArea.w);
    expect(v.rect.h).toBeLessThanOrEqual(phoneArea.h);
    expect(phoneArea.w - v.rect.w).toBeLessThan(v.cell * 2);
    expect(v.rect.x).toBeGreaterThanOrEqual(phoneArea.x);
  });

  it('clamps at the map edges so no empty space is shown', () => {
    const corner = computeView(phoneArea, 61, 61, { x: 1, y: 1 }, { minCell: 47, zoomOut: false });
    expect(corner.tileX).toBe(0);
    expect(corner.tileY).toBe(0);
    const far = computeView(phoneArea, 61, 61, { x: 59, y: 59 }, { minCell: 47, zoomOut: false });
    expect(far.tileX).toBe(61 - far.cols);
    expect(far.tileY).toBe(61 - far.rows);
    expect(isInView(far, 59, 59)).toBe(true);
  });

  it('zoomOut shows the whole map however small', () => {
    const v = computeView(phoneArea, 61, 61, { x: 30, y: 30 }, { minCell: 47, zoomOut: true });
    expect(v.cols).toBe(61);
    expect(v.rows).toBe(61);
    expect(v.tileX).toBe(0);
    expect(v.cell).toBe(Math.floor(1080 / 61));
  });

  it('never shows more than exists on a small map in a big area', () => {
    const v = computeView(phoneArea, 9, 9, { x: 4, y: 4 }, { minCell: 200, zoomOut: false });
    expect(v.cols).toBeLessThanOrEqual(9);
    expect(v.tileX).toBeGreaterThanOrEqual(0);
  });

  it('tilePixel maps tiles inside the view to pixels', () => {
    const v = computeView(phoneArea, 61, 61, { x: 30, y: 30 }, { minCell: 47, zoomOut: false });
    const p = tilePixel(v, v.tileX, v.tileY);
    expect(p).toEqual({ x: v.rect.x, y: v.rect.y });
    const q = tilePixel(v, v.tileX + 2, v.tileY + 1);
    expect(q).toEqual({ x: v.rect.x + 2 * v.cell, y: v.rect.y + v.cell });
  });
});
