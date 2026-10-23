import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, spawnReach } from '../core/enemy-defs';
import { type EnemySpawn, type FloorMap } from '../core/floor-map';
import { bfsDistances } from '../core/pathfinding';
import { nicheSides, NICHE_POCKET_MAX } from '../core/segment';
import { generateFloor } from './generate-floor';
import { MIN_ENEMY_START_DISTANCE } from './enemies';
import { routeCells } from './placers/fields';
import { routeSurvivable } from './spear-timing';
import { validateFloor } from './validate';

const SEEDS = 150;
const lurkersOf = (map: FloorMap): EnemySpawn[] => map.spawns.filter((s) => s.type === 'lurker');
const countOn = (seed: string, floor: number): number =>
  lurkersOf(generateFloor(seed, floor)).length;

describe('generated lurkers', () => {
  it('never appear before floor 52, and do from floor 52 on', () => {
    expect(ENEMY_DEFS.lurker.minFloor).toBe(52);
    let found = 0;
    for (let s = 0; s < 40; s++) {
      for (const floor of [2, 30, 51]) expect(countOn(`LUR${s}`, floor)).toBe(0);
      found += countOn(`LUR${s}`, 52);
    }
    expect(found).toBeGreaterThan(30);
  }, 60_000);

  it('are limited to two per floor', () => {
    let most = 0;
    for (let s = 0; s < 80; s++) {
      for (const floor of [52, 60, 90]) most = Math.max(most, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(2);
  }, 120_000);

  it('stand on a dead end that branches off the route, never on it, with the floor still valid', () => {
    let seen = 0;
    for (const floor of [52, 70, 90]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`RULES${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed RULES${s} floor ${floor}: ${problems}`);
        const route = new Set(routeCells(map));
        const dist = bfsDistances(map, map.start);
        for (const lurker of lurkersOf(map)) {
          seen++;
          const at = lurker.pos.y * map.width + lurker.pos.x;
          expect(route.has(at)).toBe(false);
          const sides = nicheSides(map, lurker.pos);
          const open = sides.filter((side) => !side.pocket);
          expect(open).toHaveLength(1);
          expect(route.has(open[0]!.from.y * map.width + open[0]!.from.x)).toBe(true);
          for (const side of sides) {
            expect(side.pocket?.length ?? 0).toBeLessThanOrEqual(NICHE_POCKET_MAX);
          }
          for (const c of spawnReach(lurker, map)) {
            expect(dist[c.y * map.width + c.x]).toBeGreaterThanOrEqual(MIN_ENEMY_START_DISTANCE);
            expect(route.has(c.y * map.width + c.x)).toBe(false);
          }
        }
        expect(routeSurvivable(map, map.spawns)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(100);
  }, 300_000);

  it('share their dead end with nothing else', () => {
    for (let s = 0; s < SEEDS; s++) {
      const map = generateFloor(`SHARE${s}`, 60);
      const mine = new Set<number>();
      for (const lurker of lurkersOf(map)) {
        for (const c of spawnReach(lurker, map)) mine.add(c.y * map.width + c.x);
      }
      for (const other of map.spawns.filter((e) => e.type !== 'lurker')) {
        for (const c of spawnReach(other, map)) expect(mine.has(c.y * map.width + c.x)).toBe(false);
      }
      for (const pickup of map.pickups) {
        expect(mine.has(pickup.pos.y * map.width + pickup.pos.x)).toBe(false);
      }
    }
  }, 120_000);

  it('are deterministic', () => {
    expect(generateFloor('LDET', 55).spawns).toEqual(generateFloor('LDET', 55).spawns);
  });

  it('are rejected by validation when one too many is added', () => {
    let map = generateFloor('LBAD0', 55);
    for (let s = 1; lurkersOf(map).length < 2 && s < 100; s++) map = generateFloor(`LBAD${s}`, 55);
    const real = lurkersOf(map)[0];
    expect(real).toBeDefined();
    if (!real) return;
    map.spawns = [...map.spawns, { ...real }];
    expect(validateFloor(map).join(';')).toMatch(/3 lurkers on floor 55/);
  }, 60_000);
});
