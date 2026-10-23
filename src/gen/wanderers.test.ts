import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { bfsDistances, shortestPath } from '../core/pathfinding';
import { generateFloor } from './generate-floor';
import { validateFloor } from './validate';

const SEEDS = 150;
const wanderersOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'wanderer');
const countOn = (seed: string, floor: number): number =>
  wanderersOf(generateFloor(seed, floor)).length;

describe('generated wanderers', () => {
  it('never appear before floor 12, and do from floor 12 on', () => {
    expect(ENEMY_DEFS.wanderer.minFloor).toBe(12);
    let found = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 8, 11]) expect(countOn(`WAN${s}`, floor)).toBe(0);
      found += countOn(`WAN${s}`, 12);
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('are limited to three per floor', () => {
    let most = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [13, 40, 90]) most = Math.max(most, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(3);
  }, 60_000);

  it('have a home off the shortest route and 8+ steps from the start, and floors stay valid', () => {
    for (const floor of [12, 30]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`HOME${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed HOME${s} floor ${floor}: ${problems}`);
        const route = new Set(
          shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x),
        );
        const dist = bfsDistances(map, map.start);
        for (const w of wanderersOf(map)) {
          const i = w.pos.y * map.width + w.pos.x;
          expect(route.has(i)).toBe(false);
          expect(dist[i]).toBeGreaterThanOrEqual(ENEMY_DEFS.wanderer.homeDistance as number);
        }
      }
    }
  }, 120_000);

  it('are drawn more often in the floors right after they unlock (spotlight)', () => {
    let spot = 0;
    let later = 0;
    for (let s = 0; s < 80; s++) {
      spot += countOn(`SPOT${s}`, 13);
      later += countOn(`SPOT${s}`, 16);
    }
    expect(spot).toBeGreaterThan(later);
  }, 60_000);

  it('are deterministic', () => {
    expect(generateFloor('WDET', 30).spawns).toEqual(generateFloor('WDET', 30).spawns);
  });

  it('are rejected by validation when a fourth is added', () => {
    let map = generateFloor('WBAD0', 40);
    for (let s = 1; wanderersOf(map).length < 3 && s < 200; s++)
      map = generateFloor(`WBAD${s}`, 40);
    expect(wanderersOf(map)).toHaveLength(3);
    const dist = bfsDistances(map, map.start);
    const used = new Set(map.spawns.map((e) => e.pos.y * map.width + e.pos.x));
    const spare = map.tiles.findIndex(
      (_, i) =>
        (dist[i] as number) >= 8 && !used.has(i) && i !== map.exit.y * map.width + map.exit.x,
    );
    const x = spare % map.width;
    map.spawns = [...map.spawns, { type: 'wanderer', pos: { x, y: (spare - x) / map.width } }];
    expect(validateFloor(map).join(';')).toMatch(/4 wanderers on floor 40/);
  }, 60_000);
});
