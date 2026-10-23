import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { bfsDistances, shortestPath } from '../core/pathfinding';
import { generateFloor } from './generate-floor';
import { validateFloor } from './validate';

const SEEDS = 150;
const shadesOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'shade');
const countOn = (seed: string, floor: number): number =>
  shadesOf(generateFloor(seed, floor)).length;

describe('generated shades', () => {
  it('never appear before floor 40, and do from floor 40 on', () => {
    expect(ENEMY_DEFS.shade.minFloor).toBe(40);
    let found = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 12, 39]) expect(countOn(`SHD${s}`, floor)).toBe(0);
      found += countOn(`SHD${s}`, 40);
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('are limited to two per floor', () => {
    let most = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [41, 60, 90]) most = Math.max(most, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(2);
  }, 120_000);

  it('have a home off the shortest route and 10+ steps from the start, and floors stay valid', () => {
    for (const floor of [40, 60, 90]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`HOME${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed HOME${s} floor ${floor}: ${problems}`);
        const route = new Set(
          shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x),
        );
        const dist = bfsDistances(map, map.start);
        for (const sh of shadesOf(map)) {
          const i = sh.pos.y * map.width + sh.pos.x;
          expect(route.has(i)).toBe(false);
          expect(dist[i]).toBeGreaterThanOrEqual(ENEMY_DEFS.shade.homeDistance as number);
        }
      }
    }
  }, 240_000);

  it('are deterministic', () => {
    expect(generateFloor('HDET', 45).spawns).toEqual(generateFloor('HDET', 45).spawns);
  });

  it('are rejected by validation when a third is added', () => {
    let map = generateFloor('HBAD0', 45);
    for (let s = 1; shadesOf(map).length < 2 && s < 300; s++) {
      map = generateFloor(`HBAD${s}`, 45);
    }
    expect(shadesOf(map)).toHaveLength(2);
    const dist = bfsDistances(map, map.start);
    const used = new Set(map.spawns.map((e) => e.pos.y * map.width + e.pos.x));
    const spare = map.tiles.findIndex(
      (_, i) =>
        (dist[i] as number) >= 10 && !used.has(i) && i !== map.exit.y * map.width + map.exit.x,
    );
    const x = spare % map.width;
    map.spawns = [...map.spawns, { type: 'shade', pos: { x, y: (spare - x) / map.width } }];
    expect(validateFloor(map).join(';')).toMatch(/3 shades on floor 45/);
  }, 120_000);
});
