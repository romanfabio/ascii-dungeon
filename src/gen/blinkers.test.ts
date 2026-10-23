import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { bfsDistances, shortestPath } from '../core/pathfinding';
import { generateFloor } from './generate-floor';
import { validateFloor } from './validate';

const SEEDS = 150;
const blinkersOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'blinker');
const countOn = (seed: string, floor: number): number =>
  blinkersOf(generateFloor(seed, floor)).length;

describe('generated blinkers', () => {
  it('never appear before floor 30, and do from floor 30 on', () => {
    expect(ENEMY_DEFS.blinker.minFloor).toBe(30);
    let found = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 12, 29]) expect(countOn(`BLK${s}`, floor)).toBe(0);
      found += countOn(`BLK${s}`, 30);
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('are limited to two per floor', () => {
    let most = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [31, 50, 80]) most = Math.max(most, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(2);
  }, 120_000);

  it('have a roomy home off the route, 8+ steps from the start, and floors stay valid', () => {
    const { leash } = ENEMY_DEFS.blinker;
    for (const floor of [30, 50, 80]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`HOME${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed HOME${s} floor ${floor}: ${problems}`);
        const route = new Set(
          shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x),
        );
        const dist = bfsDistances(map, map.start);
        for (const b of blinkersOf(map)) {
          const i = b.pos.y * map.width + b.pos.x;
          expect(route.has(i)).toBe(false);
          expect(dist[i]).toBeGreaterThanOrEqual(ENEMY_DEFS.blinker.homeDistance as number);
          const near = bfsDistances(map, b.pos);
          const room = [...near].filter((d) => d > 0 && d <= (leash?.radius ?? 0)).length;
          expect(room).toBeGreaterThanOrEqual(leash?.minTiles ?? 0);
        }
      }
    }
  }, 180_000);

  it('are deterministic', () => {
    expect(generateFloor('BDET', 45).spawns).toEqual(generateFloor('BDET', 45).spawns);
  });

  it('are rejected by validation when a third is added', () => {
    let map = generateFloor('BBAD0', 45);
    for (let s = 1; blinkersOf(map).length < 2 && s < 300; s++) {
      map = generateFloor(`BBAD${s}`, 45);
    }
    expect(blinkersOf(map)).toHaveLength(2);
    const extra = blinkersOf(map)[0];
    if (!extra) return;
    const dist = bfsDistances(map, map.start);
    const used = new Set(map.spawns.map((e) => e.pos.y * map.width + e.pos.x));
    const spare = map.tiles.findIndex(
      (_, i) =>
        (dist[i] as number) >= 8 && !used.has(i) && i !== map.exit.y * map.width + map.exit.x,
    );
    const x = spare % map.width;
    map.spawns = [...map.spawns, { type: 'blinker', pos: { x, y: (spare - x) / map.width } }];
    expect(validateFloor(map).join(';')).toMatch(/3 blinkers on floor 45/);
  }, 120_000);
});
