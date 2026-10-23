import { describe, expect, it } from 'vitest';
import { parseMap, type EnemySpawn } from '../core/floor-map';
import { createRng } from '../core/rng';
import { MAX_SPEAR_LENGTH, MIN_SPEAR_LENGTH, placeEnemies } from './enemies';
import { routeSurvivable } from './spear-timing';
import { validateFloor } from './validate';

// A straight route along row 3 with side corridors above and below column 5.
const CROSS = [
  '###########',
  '#####.#####',
  '#####.#####',
  '#@.......!#',
  '#####.#####',
  '#####.#####',
  '###########',
];

const spear = (pos: [number, number], end: [number, number]): EnemySpawn => ({
  type: 'spear',
  pos: { x: pos[0], y: pos[1] },
  end: { x: end[0], y: end[1] },
});

describe('routeSurvivable', () => {
  const map = parseMap(CROSS);

  it('is true with no spears, or spears that never reach the route', () => {
    expect(routeSurvivable(map, [])).toBe(true);
    expect(routeSurvivable(map, [spear([5, 1], [5, 2])])).toBe(true); // stops short of row 3
  });

  it('is true when the route can be crossed in a quiet moment', () => {
    // From above (3 tiles): the route tile is the tip's last tile, free 3 turns out of 4.
    expect(routeSurvivable(map, [spear([5, 1], [5, 3])])).toBe(true);
    // The same from below.
    expect(routeSurvivable(map, [spear([5, 5], [5, 3])])).toBe(true);
  });

  it('is false when the crossing tile is covered right after any step onto it', () => {
    // The route tile is one tile from the base: it is hit the turn after the player steps on it.
    expect(routeSurvivable(map, [spear([5, 2], [5, 4])])).toBe(false);
    expect(routeSurvivable(map, [spear([5, 4], [5, 2])])).toBe(false);
  });

  it('accounts for several spears together', () => {
    // Offsets 2 from above and 1 from below on the same tile: the lower spear alone blocks it.
    expect(routeSurvivable(map, [spear([5, 1], [5, 3]), spear([5, 4], [5, 2])])).toBe(false);
  });

  it('validateFloor reports an impassable route and a base on the route', () => {
    const bad = parseMap(CROSS);
    bad.spawns = [spear([5, 2], [5, 4])];
    expect(validateFloor(bad).join()).toMatch(/impassable/);
    bad.spawns = [spear([3, 3], [3, 5])];
    expect(validateFloor(bad).join()).toMatch(/base on the route/);
  });
});

describe('spear placement', () => {
  const ROOM = [
    '###############',
    '#@............#',
    '#.###########.#',
    '#.............#',
    '#.###########.#',
    '#.............#',
    '#######!#######',
  ];

  it('gives a straight 3-6 tile reach, base off the route, never overlapping another enemy', () => {
    const room = parseMap(ROOM);
    for (let s = 0; s < 100; s++) {
      const spawns = placeEnemies(
        room,
        4,
        ['spear', 'bloodstone', 'patroller'],
        createRng(`S${s}`),
      );
      room.spawns = spawns;
      // (this hand-made room has its exit in the border wall: ignore that one complaint)
      expect(validateFloor(room).filter((p) => !p.includes('border'))).toEqual([]);
      for (const sp of spawns.filter((e) => e.type === 'spear')) {
        const end = sp.end as { x: number; y: number };
        const len = Math.abs(end.x - sp.pos.x) + Math.abs(end.y - sp.pos.y) + 1;
        expect(len).toBeGreaterThanOrEqual(MIN_SPEAR_LENGTH);
        expect(len).toBeLessThanOrEqual(MAX_SPEAR_LENGTH);
      }
    }
  });

  it('only keeps a route-crossing spear when the route stays passable', () => {
    // Lots of spears on a corridor-and-branches map: whatever is placed must be survivable.
    const map = parseMap(CROSS);
    for (let s = 0; s < 100; s++) {
      const spawns = placeEnemies(map, 6, ['spear'], createRng(`X${s}`));
      expect(routeSurvivable(map, spawns)).toBe(true);
    }
  });
});
