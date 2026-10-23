import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, fixedTiles, spawnReach } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { SWEEPER_MAX_ARM, SWEEPER_MIN_ARM, sweeperArmLength } from '../core/hazards';
import { bfsDistances } from '../core/pathfinding';
import { generateFloor } from './generate-floor';
import { MIN_ENEMY_START_DISTANCE } from './enemies';
import { routeCells } from './placers/fields';
import { routeSurvivable } from './spear-timing';
import { validateFloor } from './validate';

const SEEDS = 150;
const sweepersOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'sweeper');
const countOn = (seed: string, floor: number): number =>
  sweepersOf(generateFloor(seed, floor)).length;

describe('generated sweepers', () => {
  it('never appear before floor 44, and do from floor 44 on', () => {
    expect(ENEMY_DEFS.sweeper.minFloor).toBe(44);
    let found = 0;
    for (let s = 0; s < 40; s++) {
      for (const floor of [2, 12, 43]) expect(countOn(`SWP${s}`, floor)).toBe(0);
      found += countOn(`SWP${s}`, 44);
    }
    expect(found).toBeGreaterThan(10);
  }, 60_000);

  it('are limited to one per floor before floor 70, two from then on', () => {
    expect([44, 69].map((f) => ENEMY_DEFS.sweeper.maxPerFloor(f))).toEqual([1, 1]);
    expect([70, 100].map((f) => ENEMY_DEFS.sweeper.maxPerFloor(f))).toEqual([2, 2]);
    let most = 0;
    let mostLate = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [44, 50, 60]) most = Math.max(most, countOn(`CAP${s}`, floor));
      for (const floor of [70, 80, 100]) mostLate = Math.max(mostLate, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(1);
    expect(mostLate).toBe(2);
  }, 180_000);

  it('have a pivot off the route, an arm of 2-4, every swept tile far from the start; floors stay valid', () => {
    let seen = 0;
    for (const floor of [44, 60, 80]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`RULES${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed RULES${s} floor ${floor}: ${problems}`);
        const route = new Set(routeCells(map));
        const dist = bfsDistances(map, map.start);
        for (const sw of sweepersOf(map)) {
          seen++;
          expect(route.has(sw.pos.y * map.width + sw.pos.x)).toBe(false);
          expect(sweeperArmLength(sw)).toBeGreaterThanOrEqual(SWEEPER_MIN_ARM);
          expect(sweeperArmLength(sw)).toBeLessThanOrEqual(SWEEPER_MAX_ARM);
          for (const c of spawnReach(sw, map)) {
            expect(dist[c.y * map.width + c.x]).toBeGreaterThanOrEqual(MIN_ENEMY_START_DISTANCE);
          }
          // The pivot is a permanent wall: it seals nothing off (judged against what came before).
          const before = new Set<number>();
          for (const other of map.spawns.slice(0, map.spawns.indexOf(sw))) {
            for (const c of fixedTiles(other)) before.add(c.y * map.width + c.x);
          }
          const count = (blocked: Set<number>): number =>
            [...bfsDistances(map, map.start, blocked)].filter((d) => d >= 0).length;
          const without = count(before);
          before.add(sw.pos.y * map.width + sw.pos.x);
          expect(count(before)).toBe(without - 1);
        }
        expect(routeSurvivable(map, map.spawns)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(60);
  }, 300_000);

  it('are deterministic', () => {
    expect(generateFloor('WDET', 50).spawns).toEqual(generateFloor('WDET', 50).spawns);
  });

  it('are rejected by validation when one too many is added', () => {
    let map = generateFloor('WBAD0', 50);
    for (let s = 1; sweepersOf(map).length === 0 && s < 100; s++) {
      map = generateFloor(`WBAD${s}`, 50);
    }
    const real = sweepersOf(map)[0];
    expect(real).toBeDefined();
    if (!real) return;
    map.spawns = [...map.spawns, { ...real }];
    expect(validateFloor(map).join(';')).toMatch(/2 sweepers on floor 50/);
  }, 60_000);
});
