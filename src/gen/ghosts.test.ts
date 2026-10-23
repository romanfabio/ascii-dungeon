import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, GHOST_NOTICE_DISTANCE } from '../core/enemy-defs';
import { type EnemySpawn, type FloorMap } from '../core/floor-map';
import { bfsDistances } from '../core/pathfinding';
import { generateFloor } from './generate-floor';
import { routeCells } from './placers/fields';
import { validateFloor } from './validate';

const SEEDS = 150;
const ghostsOf = (map: FloorMap): EnemySpawn[] => map.spawns.filter((s) => s.type === 'ghost');
const countOn = (seed: string, floor: number): number =>
  ghostsOf(generateFloor(seed, floor)).length;

describe('generated ghosts', () => {
  it('never appear before floor 65, and do from floor 65 on', () => {
    expect(ENEMY_DEFS.ghost.minFloor).toBe(65);
    let found = 0;
    for (let s = 0; s < 40; s++) {
      for (const floor of [2, 40, 64]) expect(countOn(`GHO${s}`, floor)).toBe(0);
      found += countOn(`GHO${s}`, 65);
    }
    expect(found).toBeGreaterThan(15); // the hunter cap leaves some floors without one
  }, 60_000);

  it('are limited to one per floor before floor 90, two from then on', () => {
    let most = 0;
    let mostLate = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [65, 75, 89]) most = Math.max(most, countOn(`CAP${s}`, floor));
      for (const floor of [90, 100]) mostLate = Math.max(mostLate, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(1);
    expect(mostLate).toBe(2);
  }, 180_000);

  it('sleep 8+ tiles (straight line) from every route tile, so a dash never wakes them', () => {
    let seen = 0;
    for (const floor of [65, 80, 100]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`RULES${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed RULES${s} floor ${floor}: ${problems}`);
        const route = routeCells(map);
        const dist = bfsDistances(map, map.start);
        for (const ghost of ghostsOf(map)) {
          seen++;
          expect(dist[ghost.pos.y * map.width + ghost.pos.x]).toBeGreaterThanOrEqual(12);
          for (const i of route) {
            const dx = (i % map.width) - ghost.pos.x;
            const dy = Math.floor(i / map.width) - ghost.pos.y;
            expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThan(GHOST_NOTICE_DISTANCE);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(100);
  }, 300_000);

  it('are deterministic', () => {
    expect(generateFloor('GDET', 70).spawns).toEqual(generateFloor('GDET', 70).spawns);
  });

  it('are rejected by validation when one too many is added or one is too near the route', () => {
    let map = generateFloor('GBAD0', 70);
    for (let s = 1; ghostsOf(map).length === 0 && s < 100; s++) map = generateFloor(`GBAD${s}`, 70);
    const real = ghostsOf(map)[0];
    expect(real).toBeDefined();
    if (!real) return;
    map.spawns = [...map.spawns, { ...real }];
    expect(validateFloor(map).join(';')).toMatch(/2 ghosts on floor 70/);
    const route = routeCells(map);
    const at = route[Math.floor(route.length / 2)] as number;
    map.spawns = [{ type: 'ghost', pos: { x: at % map.width, y: Math.floor(at / map.width) } }];
    expect(validateFloor(map).join(';')).toMatch(/too close to the route/);
  }, 60_000);
});
