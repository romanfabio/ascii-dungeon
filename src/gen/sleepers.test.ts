import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { bfsDistances, shortestPath } from '../core/pathfinding';
import { generateFloor } from './generate-floor';
import { validateFloor } from './validate';

const SEEDS = 150;
const sleepersOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'sleeper');
const countOn = (seed: string, floor: number): number =>
  sleepersOf(generateFloor(seed, floor)).length;

describe('generated sleepers', () => {
  it('never appear before floor 28, and do from floor 28 on', () => {
    expect(ENEMY_DEFS.sleeper.minFloor).toBe(28);
    let found = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 12, 27]) expect(countOn(`SLP${s}`, floor)).toBe(0);
      found += countOn(`SLP${s}`, 28);
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('are limited to one per floor before 65, two from then on', () => {
    expect([28, 64].map((f) => ENEMY_DEFS.sleeper.maxPerFloor(f))).toEqual([1, 1]);
    expect([65, 100].map((f) => ENEMY_DEFS.sleeper.maxPerFloor(f))).toEqual([2, 2]);
    let most = 0;
    let mostLate = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [28, 45, 64]) most = Math.max(most, countOn(`CAP${s}`, floor));
      for (const floor of [70, 90, 100]) mostLate = Math.max(mostLate, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(1);
    expect(mostLate).toBeLessThanOrEqual(2);
  }, 300_000);

  it('have a home off the shortest route and 12+ steps from the start, and floors stay valid', () => {
    for (const floor of [28, 50, 70]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`HOME${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed HOME${s} floor ${floor}: ${problems}`);
        const route = new Set(
          shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x),
        );
        const dist = bfsDistances(map, map.start);
        for (const z of sleepersOf(map)) {
          const i = z.pos.y * map.width + z.pos.x;
          expect(route.has(i)).toBe(false);
          expect(dist[i]).toBeGreaterThanOrEqual(ENEMY_DEFS.sleeper.homeDistance as number);
        }
      }
    }
  }, 180_000);

  it('are deterministic', () => {
    expect(generateFloor('ZDET', 45).spawns).toEqual(generateFloor('ZDET', 45).spawns);
  });

  it('are rejected by validation when a second is added before floor 65', () => {
    let map = generateFloor('ZBAD0', 45);
    for (let s = 1; sleepersOf(map).length === 0 && s < 200; s++) {
      map = generateFloor(`ZBAD${s}`, 45);
    }
    const real = sleepersOf(map)[0];
    expect(real).toBeDefined();
    if (!real) return;
    const dist = bfsDistances(map, map.start);
    const used = new Set(map.spawns.map((e) => e.pos.y * map.width + e.pos.x));
    const spare = map.tiles.findIndex(
      (_, i) =>
        (dist[i] as number) >= 12 && !used.has(i) && i !== map.exit.y * map.width + map.exit.x,
    );
    const x = spare % map.width;
    map.spawns = [...map.spawns, { type: 'sleeper', pos: { x, y: (spare - x) / map.width } }];
    expect(validateFloor(map).join(';')).toMatch(/2 sleepers on floor 45/);
  }, 60_000);
});
