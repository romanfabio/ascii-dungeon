import { describe, expect, it } from 'vitest';
import { DIRS } from '../core/geometry';
import { computeLayout, dpadGeometry, hudButtons, rectContains, type Rect } from './layout';

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('computeLayout', () => {
  it('without a D-pad the map gets everything below the two HUD rows', () => {
    const l = computeLayout(1920, 1080, 1, { dpad: false });
    const top = l.hud.y + l.hud.h;
    expect(l.dpad).toBeNull();
    expect(l.mapArea).toEqual({ x: 0, y: top, w: 1920, h: 1080 - top });
  });

  it('stacks the lives row above the stats row, above the map', () => {
    const l = computeLayout(1080, 2200, 2.6, { dpad: true });
    expect(l.lives.y).toBe(0);
    expect(l.hud.y).toBe(l.lives.y + l.lives.h);
    expect(l.mapArea.y).toBe(l.hud.y + l.hud.h);
    expect(overlap(l.lives, l.hud)).toBe(false);
    expect(overlap(l.lives, l.mapArea)).toBe(false);
  });

  it('puts the D-pad under the map in portrait (about 35% of the height)', () => {
    const l = computeLayout(1080, 2200, 2.6, { dpad: true });
    expect(l.dpad).not.toBeNull();
    const dpad = l.dpad as Rect;
    expect(dpad.y).toBe(l.mapArea.y + l.mapArea.h);
    expect(dpad.y + dpad.h).toBe(2200);
    expect(dpad.h / (2200 - l.lives.h - l.hud.h)).toBeCloseTo(0.35, 1);
    expect(overlap(l.mapArea, dpad)).toBe(false);
    expect(overlap(l.hud, l.mapArea)).toBe(false);
  });

  it('puts the D-pad beside the map in landscape', () => {
    const l = computeLayout(2000, 1000, 1, { dpad: true });
    const dpad = l.dpad as Rect;
    expect(dpad.x).toBe(l.mapArea.x + l.mapArea.w);
    expect(dpad.x + dpad.w).toBe(2000);
    expect(overlap(l.mapArea, dpad)).toBe(false);
  });

  it('keeps everything inside the safe area', () => {
    const insets = { top: 90, right: 20, bottom: 60, left: 20 };
    const l = computeLayout(1080, 2200, 2.6, { dpad: true, insets });
    const safe: Rect = { x: 20, y: 90, w: 1040, h: 2200 - 90 - 60 };
    expect(inside(l.lives, safe)).toBe(true);
    expect(inside(l.hud, safe)).toBe(true);
    expect(inside(l.mapArea, safe)).toBe(true);
    expect(inside(l.dpad as Rect, safe)).toBe(true);
  });
});

describe('dpadGeometry', () => {
  const area: Rect = { x: 0, y: 1500, w: 1080, h: 700 };

  it('puts the wait button in the centre of the plus, touching no other button', () => {
    const g = dpadGeometry(area, 'M');
    expect(g.wait.w).toBe(g.N.w);
    expect(g.wait.x).toBe(g.N.x);
    expect(g.wait.y).toBe(g.W.y);
    for (const dir of DIRS) expect(overlap(g.wait, g[dir])).toBe(false);
    expect(inside(g.wait, area)).toBe(true);
  });

  it('lays out a plus shape of equal square buttons inside the area', () => {
    const g = dpadGeometry(area, 'M');
    const size = g.N.w;
    for (const dir of DIRS) {
      expect(g[dir].w).toBe(size);
      expect(g[dir].h).toBe(size);
      expect(inside(g[dir], area)).toBe(true);
    }
    expect(g.N.x).toBe(g.S.x);
    expect(g.W.y).toBe(g.E.y);
    expect(g.N.y + size).toBe(g.W.y);
    expect(g.W.x + size).toBe(g.N.x);
    expect(g.N.x + size).toBe(g.E.x);
    expect(g.W.y + size).toBe(g.S.y);
  });

  it('buttons do not overlap each other', () => {
    const g = dpadGeometry(area, 'L');
    for (const a of DIRS)
      for (const b of DIRS) if (a !== b) expect(overlap(g[a], g[b])).toBe(false);
  });

  it('bigger sizes give bigger buttons', () => {
    const s = dpadGeometry(area, 'S').N.w;
    const m = dpadGeometry(area, 'M').N.w;
    const l = dpadGeometry(area, 'L').N.w;
    expect(s).toBeLessThan(m);
    expect(m).toBeLessThan(l);
  });
});

describe('hudButtons', () => {
  it('are inside the HUD, in order, and do not overlap', () => {
    const l = computeLayout(1080, 2200, 2.6, { dpad: true });
    const b = hudButtons(l);
    expect(b.zoom.x + b.zoom.w).toBeLessThanOrEqual(b.pause.x);
    expect(b.pause.x + b.pause.w).toBeLessThanOrEqual(l.hud.x + l.hud.w);
    expect(rectContains(b.pause, b.pause.x + 1, l.hud.y + 1)).toBe(true);
    expect(rectContains(b.zoom, b.pause.x + 1, l.hud.y + 1)).toBe(false);
    expect(b.pause.h).toBe(l.hud.h);
  });
});
