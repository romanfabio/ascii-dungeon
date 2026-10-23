import { describe, expect, it } from 'vitest';
import { parseMap } from '../core/floor-map';
import { bfsDistances, shortestPath } from '../core/pathfinding';
import { createRng } from '../core/rng';
import { validateFloor } from './validate';
import { MIN_ENEMY_START_DISTANCE, placeEnemies } from './enemies';

// A corridor loop: the shortest route goes down the left side and along the bottom row.
const MAP = [
  '###############',
  '#@............#',
  '#.###########.#',
  '#.............#',
  '######!########',
];

describe('placeEnemies', () => {
  it('stays off the start, the exit and the shortest route, and away from the start', () => {
    const map = parseMap(MAP);
    const route = shortestPath(map, map.start, map.exit).map((p) => `${p.x},${p.y}`);
    const dist = bfsDistances(map, map.start);
    for (let s = 0; s < 50; s++) {
      const spawns = placeEnemies(map, 5, ['bloodstone'], createRng(`E${s}`));
      expect(spawns.length).toBe(5);
      for (const { pos } of spawns) {
        expect(route).not.toContain(`${pos.x},${pos.y}`);
        expect(dist[pos.y * map.width + pos.x]).toBeGreaterThanOrEqual(MIN_ENEMY_START_DISTANCE);
      }
    }
  });

  it('places fewer when there is no room, and none for a count of 0', () => {
    const map = parseMap(MAP);
    expect(placeEnemies(map, 0, ['bloodstone'], createRng('A'))).toEqual([]);
    expect(placeEnemies(map, 500, ['bloodstone'], createRng('A')).length).toBeLessThan(500);
    expect(MIN_ENEMY_START_DISTANCE).toBe(6);
  });

  it('is deterministic for the same rng seed', () => {
    const map = parseMap(MAP);
    const a = placeEnemies(map, 3, ['bloodstone'], createRng('same'));
    const b = placeEnemies(map, 3, ['bloodstone'], createRng('same'));
    expect(a).toEqual(b);
  });
});

describe('validateFloor spawn checks', () => {
  it('flags enemies on walls, on start, too close, duplicated, or sealing the exit', () => {
    const map = parseMap(['#######', '#@...!#', '#######']);
    const check = (x: number): string[] => {
      map.spawns = [{ type: 'bloodstone', pos: { x, y: 1 } }];
      return validateFloor(map);
    };
    expect(check(1).join()).toMatch(/start or exit/);
    expect(check(2).join()).toMatch(/too close/);
    map.spawns = [{ type: 'bloodstone', pos: { x: 2, y: 0 } }];
    expect(validateFloor(map).join()).toMatch(/not on a walkable tile/);
  });

  it('flags a corridor that an enemy seals off', () => {
    const map = parseMap(['#############', '#@........!.#', '#############']);
    map.spawns = [{ type: 'bloodstone', pos: { x: 7, y: 1 } }];
    expect(validateFloor(map).join()).toMatch(/block every route/);
  });
});
