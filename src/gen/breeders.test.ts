import { describe, expect, it } from 'vitest';
import { enemiesOf } from '../core/enemies';
import { BREED_MAX, ENEMY_DEFS } from '../core/enemy-defs';
import { type EnemySpawn, type FloorMap } from '../core/floor-map';
import { createGameState } from '../core/game-state';
import { bfsDistances } from '../core/pathfinding';
import { applyAction } from '../core/turn';
import { generateFloor } from './generate-floor';
import { routeCells } from './placers/fields';
import { validateFloor } from './validate';

const SEEDS = 120;
const breedersOf = (map: FloorMap): EnemySpawn[] => map.spawns.filter((s) => s.type === 'breeder');
const countOn = (seed: string, floor: number): number =>
  breedersOf(generateFloor(seed, floor)).length;

describe('generated breeders', () => {
  it('never appear before floor 72, and do from floor 72 on', () => {
    expect(ENEMY_DEFS.breeder.minFloor).toBe(72);
    let found = 0;
    for (let s = 0; s < 40; s++) {
      for (const floor of [2, 40, 71]) expect(countOn(`BRE${s}`, floor)).toBe(0);
      found += countOn(`BRE${s}`, 72);
    }
    expect(found).toBeGreaterThan(30);
  }, 60_000);

  it('are limited to one per floor before floor 90, two from then on', () => {
    let most = 0;
    let mostLate = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [72, 80, 89]) most = Math.max(most, countOn(`CAP${s}`, floor));
      for (const floor of [90, 100]) mostLate = Math.max(mostLate, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(1);
    expect(mostLate).toBe(2);
  }, 180_000);

  it('stand off the route, 12+ steps from the start, with room for their young', () => {
    let seen = 0;
    for (const floor of [72, 90, 100]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`RULES${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed RULES${s} floor ${floor}: ${problems}`);
        const route = new Set(routeCells(map));
        const fromStart = bfsDistances(map, map.start);
        for (const mother of breedersOf(map)) {
          seen++;
          const at = mother.pos.y * map.width + mother.pos.x;
          expect(route.has(at)).toBe(false);
          expect(fromStart[at]).toBeGreaterThanOrEqual(12);
          const near = bfsDistances(map, mother.pos);
          const room = [...near].filter((d) => d > 0 && d <= 6).length;
          expect(room).toBeGreaterThanOrEqual(BREED_MAX + 1);
        }
      }
    }
    expect(seen).toBeGreaterThan(100);
  }, 300_000);

  it('never close the way: after 500 turns of waiting the exit is still reachable and the route free', () => {
    let tested = 0;
    for (const floor of [72, 90, 100]) {
      for (let s = 0; s < 40; s++) {
        const map = generateFloor(`STRESS${s}`, floor);
        if (breedersOf(map).length === 0) continue;
        tested++;
        const state = createGameState(`STRESS${s}`, map, { sightRadius: 5 });
        const route = new Set(routeCells(map));
        for (let turn = 0; turn < 500; turn++) {
          applyAction(state, { type: 'wait' });
          if (state.lives < 3) break; // something timed caught the waiting player: not the test
        }
        const young = enemiesOf(state).filter((e) => e.type === 'brood');
        expect(young.length).toBeLessThanOrEqual(BREED_MAX * breedersOf(map).length);
        for (const kid of young) expect(route.has(kid.pos.y * map.width + kid.pos.x)).toBe(false);
        const blocked = new Set(
          enemiesOf(state)
            .filter((e) => e.type === 'brood' || e.type === 'breeder' || e.type === 'bloodstone')
            .map((e) => e.pos.y * map.width + e.pos.x),
        );
        const dist = bfsDistances(map, state.player.pos, blocked);
        expect(dist[map.exit.y * map.width + map.exit.x]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(tested).toBeGreaterThan(40);
  }, 300_000);

  it('are deterministic and the young are never part of a generated floor', () => {
    const a = generateFloor('BDET', 80);
    expect(a.spawns).toEqual(generateFloor('BDET', 80).spawns);
    expect(a.spawns.some((s) => s.type === 'brood')).toBe(false);
  });

  it('are rejected by validation when one too many is added, or a young one is listed', () => {
    let map = generateFloor('BBAD0', 75);
    for (let s = 1; breedersOf(map).length === 0 && s < 100; s++)
      map = generateFloor(`BBAD${s}`, 75);
    const real = breedersOf(map)[0];
    expect(real).toBeDefined();
    if (!real) return;
    map.spawns = [...map.spawns, { ...real }];
    expect(validateFloor(map).join(';')).toMatch(/2 breeders on floor 75/);
    map.spawns = [...map.spawns.slice(0, -1), { type: 'brood', pos: { ...map.start } }];
    expect(validateFloor(map).join(';')).toMatch(/is a floor flag, not a spawn/);
  }, 60_000);
});
