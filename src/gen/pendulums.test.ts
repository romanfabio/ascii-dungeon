import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { spawnCells, type EnemySpawn, type FloorMap } from '../core/floor-map';
import { generateFloor } from './generate-floor';
import { MIN_ENEMY_START_DISTANCE } from './enemies';
import { routeCells } from './placers/fields';
import {
  MAX_PENDULUM_GAP,
  MAX_PENDULUM_LENGTH,
  MIN_PENDULUM_GAP,
  MIN_PENDULUM_LENGTH,
} from './placers/rules';
import { routeSurvivable } from './spear-timing';
import { validateFloor } from './validate';
import { bfsDistances } from '../core/pathfinding';

const SEEDS = 150;
const pendulumsOf = (map: FloorMap): EnemySpawn[] =>
  map.spawns.filter((s) => s.type === 'pendulum');
const countOn = (seed: string, floor: number): number =>
  pendulumsOf(generateFloor(seed, floor)).length;

/** Where along the route (step number) a lane meets it, and whether the lane runs across it. */
function meeting(map: FloorMap, spawn: EnemySpawn): { step: number; across: boolean } {
  const route = routeCells(map);
  const cells = spawnCells(spawn).map((c) => c.y * map.width + c.x);
  const at = cells.findIndex((i) => route.includes(i));
  return {
    step: route.indexOf(cells[at] as number),
    across: at > 0 && at < cells.length - 1,
  };
}

describe('generated pendulums', () => {
  it('never appear before floor 48, and do from floor 48 on', () => {
    expect(ENEMY_DEFS.pendulum.minFloor).toBe(48);
    let found = 0;
    for (let s = 0; s < 40; s++) {
      for (const floor of [2, 20, 47]) expect(countOn(`PEN${s}`, floor)).toBe(0);
      found += countOn(`PEN${s}`, 48);
    }
    expect(found).toBeGreaterThan(40);
  }, 60_000);

  it('are limited to one pair per floor before floor 70, two pairs from then on', () => {
    let most = 0;
    let mostLate = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [48, 55, 65]) most = Math.max(most, countOn(`CAP${s}`, floor));
      for (const floor of [70, 85, 100]) mostLate = Math.max(mostLate, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(2);
    expect(mostLate).toBe(4);
  }, 180_000);

  it('meet the route in exactly one tile, in pairs 2-8 route steps apart, and stay passable', () => {
    let lanes = 0;
    let pairs = 0;
    let across = 0;
    for (const floor of [48, 60, 80]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`RULES${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed RULES${s} floor ${floor}: ${problems}`);
        const dist = bfsDistances(map, map.start);
        const found = pendulumsOf(map);
        for (const lane of found) {
          lanes++;
          const cells = spawnCells(lane);
          expect(cells.length).toBeGreaterThanOrEqual(MIN_PENDULUM_LENGTH);
          expect(cells.length).toBeLessThanOrEqual(MAX_PENDULUM_LENGTH);
          for (const c of cells) {
            expect(dist[c.y * map.width + c.x]).toBeGreaterThanOrEqual(MIN_ENEMY_START_DISTANCE);
          }
          if (meeting(map, lane).across) across++;
        }
        if (found.length % 2 === 0) {
          for (let i = 0; i < found.length; i += 2) {
            const gap = Math.abs(
              meeting(map, found[i] as EnemySpawn).step -
                meeting(map, found[i + 1] as EnemySpawn).step,
            );
            expect(gap).toBeGreaterThanOrEqual(MIN_PENDULUM_GAP);
            expect(gap).toBeLessThanOrEqual(MAX_PENDULUM_GAP);
            pairs++;
          }
        }
        expect(routeSurvivable(map, map.spawns)).toBe(true);
      }
    }
    expect(lanes).toBeGreaterThan(300);
    expect(pairs).toBeGreaterThan(150); // pairs are the norm, singles the fallback
    expect(across).toBeGreaterThan(0); // some lanes really cross the route
  }, 300_000);

  it('are deterministic', () => {
    expect(generateFloor('PDET', 52).spawns).toEqual(generateFloor('PDET', 52).spawns);
  });

  it('are rejected by validation when one lane too many is added', () => {
    let map = generateFloor('PBAD0', 50);
    for (let s = 1; pendulumsOf(map).length === 0 && s < 100; s++) {
      map = generateFloor(`PBAD${s}`, 50);
    }
    const real = pendulumsOf(map)[0];
    expect(real).toBeDefined();
    if (!real) return;
    // Too many lanes for the floor.
    map.spawns = [...map.spawns, { ...real }, { ...real }];
    expect(validateFloor(map).join(';')).toMatch(/pendulums on floor 50/);
  }, 60_000);
});
