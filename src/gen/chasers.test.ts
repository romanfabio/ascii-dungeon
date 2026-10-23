import { describe, expect, it } from 'vitest';
import { type FloorMap } from '../core/floor-map';
import { bfsDistances, shortestPath } from '../core/pathfinding';
import { CHASER_CROWD_FLOOR, MAX_CHASERS_LATE, maxChasersForFloor } from './difficulty';
import { MIN_CHASER_START_DISTANCE } from './enemies';
import { generateFloor } from './generate-floor';
import { validateFloor } from './validate';

const SEEDS = 80;
const chasersOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'chaser');
const chasersOn = (seed: string, floor: number) => chasersOf(generateFloor(seed, floor));

describe('how many chasers a floor may have', () => {
  it('one before floor 60, up to three from then on', () => {
    expect(CHASER_CROWD_FLOOR).toBe(60);
    expect(MAX_CHASERS_LATE).toBe(3);
    expect([35, 59].map(maxChasersForFloor)).toEqual([1, 1]);
    expect([60, 100].map(maxChasersForFloor)).toEqual([3, 3]);
  });
});

describe('generated chasers', () => {
  it('never appear before floor 35, and do from floor 35 on', () => {
    let found = 0;
    for (let s = 0; s < SEEDS; s++) {
      for (const floor of [2, 10, 20, 34]) expect(chasersOn(`CHA${s}`, floor)).toEqual([]);
      found += chasersOn(`CHA${s}`, 45).length;
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('are limited to one per floor before 60, and a few later', () => {
    let crowded = 0;
    for (let s = 0; s < SEEDS; s++) {
      for (const floor of [35, 45, 59]) {
        expect(chasersOn(`CAP${s}`, floor).length).toBeLessThanOrEqual(1);
      }
      for (const floor of [60, 80, 100]) {
        const n = chasersOn(`CAP${s}`, floor).length;
        expect(n).toBeLessThanOrEqual(3);
        if (n >= 2) crowded++;
      }
    }
    expect(crowded).toBeGreaterThan(0);
  }, 60_000);

  it('have their home off the shortest route and 12+ steps from the start, and pass validation', () => {
    for (const floor of [35, 50, 70, 100]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`HOME${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed HOME${s} floor ${floor}: ${problems}`);
        const route = new Set(
          shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x),
        );
        const dist = bfsDistances(map, map.start);
        for (const c of map.spawns.filter((e) => e.type === 'chaser')) {
          const i = c.pos.y * map.width + c.pos.x;
          expect(route.has(i)).toBe(false);
          expect(dist[i]).toBeGreaterThanOrEqual(MIN_CHASER_START_DISTANCE);
        }
      }
    }
  }, 120_000);

  it('are deterministic', () => {
    for (const floor of [45, 80]) {
      expect(generateFloor('CHADET', floor).spawns).toEqual(generateFloor('CHADET', floor).spawns);
    }
  });

  it('are rejected by validation when too close to the start, or too many for the floor', () => {
    let map = generateFloor('CHABAD0', 45);
    for (let s = 1; chasersOf(map).length === 0 && s < 60; s++)
      map = generateFloor(`CHABAD${s}`, 45);
    const real = chasersOf(map)[0];
    expect(real).toBeDefined();
    if (!real) return;
    expect(validateFloor(map)).toEqual([]);

    // A second chaser breaks the one-per-floor limit before floor 60.
    const dist = bfsDistances(map, map.start);
    const spare = map.tiles.findIndex(
      (_, i) =>
        (dist[i] as number) >= MIN_CHASER_START_DISTANCE &&
        !map.spawns.some((e) => e.pos.y * map.width + e.pos.x === i) &&
        i !== map.exit.y * map.width + map.exit.x,
    );
    const x = spare % map.width;
    map.spawns = [...map.spawns, { type: 'chaser', pos: { x, y: (spare - x) / map.width } }];
    expect(validateFloor(map).join(';')).toMatch(/2 chasers on floor 45/);

    // A chaser that starts on top of the player's start is too close.
    map.spawns = [{ ...real, pos: { ...map.start } }];
    expect(validateFloor(map).join(';')).toMatch(/too close to the start|start or exit/);
  }, 60_000);
});
