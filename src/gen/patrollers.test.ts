import { describe, expect, it } from 'vitest';
import { parseMap, spawnCells } from '../core/floor-map';
import { shortestPath } from '../core/pathfinding';
import { createRng } from '../core/rng';
import { MAX_PATROL_LENGTH, MIN_PATROL_LENGTH, placeEnemies } from './enemies';
import { validateFloor } from './validate';

const ROOM = [
  '#############',
  '#@..........#',
  '#.#########.#',
  '#...........#',
  '#.#########.#',
  '#...........#',
  '######!######',
];

describe('patroller placement', () => {
  it('gives a straight 3-7 tile segment off the route, sharing no tile with another enemy', () => {
    const map = parseMap(ROOM);
    const route = new Set(shortestPath(map, map.start, map.exit).map((p) => `${p.x},${p.y}`));
    for (let s = 0; s < 100; s++) {
      const spawns = placeEnemies(map, 3, ['patroller'], createRng(`P${s}`));
      const used = new Set<string>();
      for (const spawn of spawns) {
        const cells = spawnCells(spawn);
        expect(cells.length).toBeGreaterThanOrEqual(MIN_PATROL_LENGTH);
        expect(cells.length).toBeLessThanOrEqual(MAX_PATROL_LENGTH);
        for (const c of cells) {
          const key = `${c.x},${c.y}`;
          expect(route.has(key)).toBe(false);
          expect(used.has(key)).toBe(false);
          used.add(key);
        }
      }
    }
  });

  it('places nothing where no straight segment fits', () => {
    const map = parseMap(['##########', '#@......!#', '##########']);
    expect(placeEnemies(map, 3, ['patroller'], createRng('none'))).toEqual([]);
  });

  it('is deterministic for the same rng seed', () => {
    const map = parseMap(ROOM);
    const a = placeEnemies(map, 2, ['patroller', 'bloodstone'], createRng('same'));
    const b = placeEnemies(map, 2, ['patroller', 'bloodstone'], createRng('same'));
    expect(a).toEqual(b);
  });
});

describe('patrol segment validation', () => {
  it('rejects segments that are bent, too short or too long', () => {
    const map = parseMap(ROOM);
    const check = (end: { x: number; y: number }): string => {
      map.spawns = [{ type: 'patroller', pos: { x: 3, y: 3 }, end }];
      return validateFloor(map).join();
    };
    expect(check({ x: 4, y: 4 })).toMatch(/bad patrol segment/);
    expect(check({ x: 4, y: 3 })).toMatch(/bad patrol segment/);
    expect(check({ x: 11, y: 3 })).toMatch(/bad patrol segment/);
  });

  it('rejects a segment that crosses the route or another enemy', () => {
    const map = parseMap(ROOM);
    // Along row 3 the shortest route (down column 1, then to the exit) is crossed at x = 1.
    map.spawns = [{ type: 'patroller', pos: { x: 1, y: 3 }, end: { x: 5, y: 3 } }];
    expect(validateFloor(map).join()).toMatch(/too close|block/);
    map.spawns = [
      { type: 'bloodstone', pos: { x: 8, y: 3 } },
      { type: 'patroller', pos: { x: 6, y: 3 }, end: { x: 10, y: 3 } },
    ];
    expect(validateFloor(map).join()).toMatch(/share/);
  });
});
