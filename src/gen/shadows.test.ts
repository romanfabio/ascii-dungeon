import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, SHADOW_LAG } from '../core/enemy-defs';
import { type Point } from '../core/geometry';
import { generateFloor } from './generate-floor';
import { MAX_SHADOW_LAG, shadowCatches } from './shadow';
import { routeWalkOf } from './spear-timing';
import { validateFloor } from './validate';

const p = (x: number): Point => ({ x, y: 0 });

describe('shadowCatches', () => {
  it('is false for a walk that never waits, however it doubles back', () => {
    const walk = [
      ...Array.from({ length: 30 }, (_, i) => p(i)),
      ...Array.from({ length: 30 }, (_, i) => p(29 - i)),
    ];
    expect(shadowCatches(walk, 20)).toBe(false);
  });

  it('is true when a wait lands on the tile the player stood on `lag` turns earlier', () => {
    const wait = Array.from({ length: 22 }, () => p(0)); // 22 turns on one tile
    expect(shadowCatches(wait, 20)).toBe(true);
    expect(shadowCatches(wait.slice(0, 20), 20)).toBe(false); // only 20 turns: not yet
  });

  it('counts a return to the tile and a wait there too', () => {
    // On tile 0 for 10 turns, away for 1, back for 10 more: the second stay is 20 turns later.
    const walk = [
      ...Array.from({ length: 10 }, () => p(0)),
      p(1),
      ...Array.from({ length: 10 }, () => p(0)),
    ];
    expect(shadowCatches(walk, 11)).toBe(true);
    expect(shadowCatches(walk, 20)).toBe(true); // the last turn is 20 after the first
    expect(shadowCatches(walk, 25)).toBe(false);
  });
});

describe('generated shadows', () => {
  it('never appear before floor 58, and on about half the floors from there on', () => {
    expect(ENEMY_DEFS.shadow.minFloor).toBe(58);
    let some = 0;
    let total = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 40, 57]) {
        expect(generateFloor(`SHD${s}`, floor).directives.shadow).toBeUndefined();
      }
      for (const floor of [58, 70, 90]) {
        total++;
        if (generateFloor(`SHD${s}`, floor).directives.shadow === SHADOW_LAG) some++;
      }
    }
    expect(some / total).toBeGreaterThan(0.3);
    expect(some / total).toBeLessThan(0.7);
  }, 120_000);

  it('leave the floor valid and the fewest-turns way through safe from it', () => {
    let seen = 0;
    for (const floor of [58, 75, 100]) {
      for (let s = 0; s < 100; s++) {
        const map = generateFloor(`FAIR${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed FAIR${s} floor ${floor}: ${problems}`);
        const lag = map.directives.shadow;
        if (lag === undefined) continue;
        seen++;
        const walk = routeWalkOf(map, map.spawns);
        expect(walk).not.toBeNull();
        expect(shadowCatches(walk as Point[], lag)).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(80);
  }, 300_000);

  it('are deterministic and add no spawn of their own', () => {
    const a = generateFloor('SDET', 60);
    expect(a.directives).toEqual(generateFloor('SDET', 60).directives);
    expect(a.spawns.some((s) => s.type === 'shadow')).toBe(false);
  });

  it('are rejected by validation on too early a floor, with a bad lag, or as a spawn', () => {
    const early = generateFloor('SBAD', 40);
    early.directives.shadow = 20;
    expect(validateFloor(early).join(';')).toMatch(/a shadow on floor 40/);

    const map = generateFloor('SBAD', 60);
    map.directives.shadow = 0;
    expect(validateFloor(map).join(';')).toMatch(/bad shadow lag 0/);
    map.directives.shadow = MAX_SHADOW_LAG + 1;
    expect(validateFloor(map).join(';')).toMatch(/bad shadow lag/);
    delete map.directives.shadow;
    map.spawns = [...map.spawns, { type: 'shadow', pos: { ...map.start } }];
    expect(validateFloor(map).join(';')).toMatch(/is a floor flag, not a spawn/);
  });
});
