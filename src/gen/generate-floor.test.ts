import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { serializeMap, spawnCells } from '../core/floor-map';
import { createRng } from '../core/rng';
import { Grid } from '../core/grid';
import { braid, pruneDeadEnds } from './dead-ends';
import { fillWithMazes } from './growing-tree';
import { minPathLength, paramsForFloor } from './difficulty';
import { generateFloor } from './generate-floor';
import { analyzeFloor } from './stats';
import { validateFloor } from './validate';
import { labelComponents, shortestPath } from '../core/pathfinding';
import { Tile } from '../core/tiles';

const SEEDS = 150;
// Floors across the whole 100-floor run: every kind of generator setting and enemy mix.
const FLOORS = [1, 2, 3, 5, 8, 9, 10, 11, 12, 14, 15, 20, 25, 30, 35, 40, 50, 60, 70, 75, 90, 100];

describe('generateFloor', () => {
  it(`produces valid, solvable floors with safe enemies for ${SEEDS} seeds x floors 1-20`, () => {
    for (const floor of FLOORS) {
      const params = paramsForFloor(floor);
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`PROP${s}`, floor);
        const problems = validateFloor(map, { minPathLength: minPathLength(params) });
        if (problems.length > 0) {
          throw new Error(`seed PROP${s} floor ${floor}: ${problems.join('; ')}`);
        }
        expect(map.width).toBe(params.size);
        // Enemies never sit on the shortest route (validateFloor already checks that the exit
        // stays reachable with every enemy cell blocked).
        const route = new Set(
          shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x),
        );
        // A timed enemy (spear, sentinel) may reach across the route (validateFloor proves it can
        // be crossed), but its base or body never sits on it. A gate (bouncer) is the one enemy
        // that stands on the route: it always opens. A pendulum lane meets it in one tile (its
        // own test checks that), and may start there.
        const cells = map.spawns.flatMap((e) =>
          ENEMY_DEFS[e.type].placement === 'gate' || ENEMY_DEFS[e.type].placement === 'crossing'
            ? []
            : ENEMY_DEFS[e.type].guarantee === 'timing'
              ? [e.pos]
              : spawnCells(e),
        );
        for (const c of cells) {
          if (route.has(c.y * map.width + c.x)) {
            throw new Error(`seed PROP${s} floor ${floor}: enemy on the shortest route`);
          }
        }
      }
    }
  }, 600_000);

  it('is deterministic', () => {
    for (const floor of [1, 3, 11, 40, 100]) {
      const a = generateFloor('DETERMINISM', floor);
      const b = generateFloor('DETERMINISM', floor);
      expect(serializeMap(a)).toEqual(serializeMap(b));
      expect(a.seed).toBe(b.seed);
    }
  });

  it('differs between seeds and between floors', () => {
    const a = serializeMap(generateFloor('ONE', 5)).join('\n');
    expect(serializeMap(generateFloor('TWO', 5)).join('\n')).not.toBe(a);
    expect(serializeMap(generateFloor('ONE', 6)).join('\n')).not.toBe(a);
  });

  it('gets harder: longer paths on deeper floors', () => {
    const avgPath = (floor: number): number => {
      let total = 0;
      for (let s = 0; s < 20; s++) total += generateFloor(`HARD${s}`, floor).optimalPathLength;
      return total / 20;
    };
    expect(avgPath(20)).toBeGreaterThan(avgPath(1));
    expect(avgPath(50)).toBeGreaterThan(avgPath(20));
    expect(avgPath(100)).toBeGreaterThan(avgPath(50));
  }, 60_000);

  it.each([1, 12, 50, 100])(
    'matches the snapshot for floor %i (bump GENERATOR_VERSION if intended)',
    (floor) => {
      // Terrain only: enemies use their own rng stream and have their own snapshot below.
      const map = generateFloor('TESTSEED', floor);
      expect(serializeMap(map, { enemies: false }).join('\n')).toMatchSnapshot();
    },
  );

  it.each([2, 10, 14, 16, 21, 26, 29, 30, 31, 33, 40, 41, 45, 49, 53, 60, 66, 70, 73, 100])(
    'matches the enemy snapshot for floor %i',
    (floor) => {
      const { spawns, directives } = generateFloor('TESTSEED', floor);
      const text = [
        ...spawns.map(
          (s) => `${s.type}@${s.pos.x},${s.pos.y}` + (s.end ? `->${s.end.x},${s.end.y}` : ''),
        ),
        ...Object.entries(directives).map(([name, value]) => `;${name} ${value}`),
      ];
      expect(text).toMatchSnapshot();
    },
  );
});

describe('generator building blocks', () => {
  it('fillWithMazes makes a perfect maze (connected, no loops)', () => {
    const grid = new Grid(31, 31, Tile.Wall);
    fillWithMazes(grid, createRng('maze'), 0.5);
    const field = { width: 31, height: 31, tiles: grid.data };
    expect(labelComponents(field).count).toBe(1);
    let cells = 0;
    let edges = 0;
    for (let y = 0; y < 31; y++) {
      for (let x = 0; x < 31; x++) {
        if (grid.get(x, y) === Tile.Wall) continue;
        cells++;
        if (grid.get(x + 1, y) !== Tile.Wall && x + 1 < 31) edges++;
        if (y + 1 < 31 && grid.get(x, y + 1) !== Tile.Wall) edges++;
      }
    }
    expect(edges).toBe(cells - 1); // tree
  });

  it('braiding adds loops and never disconnects; pruning removes dead ends', () => {
    const grid = new Grid(31, 31, Tile.Wall);
    const rng = createRng('braid');
    fillWithMazes(grid, rng, 0.8);
    const field = { width: 31, height: 31, tiles: grid.data };
    const base = labelComponents(field).count;
    expect(base).toBe(1);

    braid(grid, rng, 1);
    expect(labelComponents(field).count).toBe(1);

    pruneDeadEnds(grid, rng, 1);
    expect(labelComponents(field).count).toBe(1);
  });

  it('analyzeFloor reports no loops for a perfect-maze fallback-style floor', () => {
    const map = generateFloor('ANALYZE', 100);
    const stats = analyzeFloor(map);
    expect(stats.loops).toBe(0);
    expect(stats.deadEnds).toBeGreaterThan(0);
  });
});

describe('generateFloor enemies', () => {
  it('places none on floor 1 and the planned count from floor 2 on', () => {
    expect(generateFloor('ENEMIES', 1).spawns).toHaveLength(0);
    for (const floor of [2, 3, 4, 8, 20]) {
      const map = generateFloor('ENEMIES', floor);
      expect(map.spawns.length).toBeLessThanOrEqual(paramsForFloor(floor).enemyCount);
      expect(map.spawns.length).toBeGreaterThan(0);
    }
  });

  it('uses spears only from floor 20, each on a straight 3-6 tile reach', () => {
    let spears = 0;
    for (let s = 0; s < 40; s++) {
      for (const floor of [2, 8, 19]) {
        const types = generateFloor(`SPR${s}`, floor).spawns.map((e) => e.type);
        expect(types).not.toContain('spear');
      }
      for (const e of generateFloor(`SPR${s}`, 60).spawns) {
        if (e.type !== 'spear') continue;
        spears++;
        const length = spawnCells(e).length;
        expect(length).toBeGreaterThanOrEqual(3);
        expect(length).toBeLessThanOrEqual(6);
      }
    }
    expect(spears).toBeGreaterThan(0);
  });

  it('uses patrollers only from floor 8, each on a straight 3-7 tile segment', () => {
    let patrollers = 0;
    for (let s = 0; s < 30; s++) {
      for (const floor of [2, 3, 7]) {
        const types = generateFloor(`PAT${s}`, floor).spawns.map((e) => e.type);
        expect(types).not.toContain('patroller');
      }
      for (const e of generateFloor(`PAT${s}`, 40).spawns) {
        if (e.type === 'bloodstone') {
          expect(e.end).toBeUndefined();
          continue;
        }
        if (e.type !== 'patroller') continue;
        patrollers++;
        const end = e.end as { x: number; y: number };
        expect(e.pos.x === end.x || e.pos.y === end.y).toBe(true);
        const length = spawnCells(e).length;
        expect(length).toBeGreaterThanOrEqual(3);
        expect(length).toBeLessThanOrEqual(7);
      }
    }
    expect(patrollers).toBeGreaterThan(0);
  });

  it('keeps the enemy rng separate: terrain does not depend on enemies', () => {
    for (const floor of [2, 5, 12]) {
      const map = generateFloor('SEPARATE', floor);
      const bare = serializeMap(map, { enemies: false });
      map.spawns = [];
      expect(serializeMap(map)).toEqual(bare);
    }
  });
});
