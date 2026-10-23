import { describe, expect, it } from 'vitest';
import { parseMap, serializeMap } from '../core/floor-map';
import { shortestPath } from '../core/pathfinding';
import { createRng } from '../core/rng';
import { FINAL_FLOOR, hasLifePickup, LIFE_PICKUP_EVERY } from './difficulty';
import { generateFloor } from './generate-floor';
import { distanceFromRoute, placeLifePickup, PREFERRED_PICKUP_DETOUR } from './pickups';
import { validateFloor } from './validate';

const PICKUP_FLOORS = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const SEEDS = 100;

describe('which floors have a life pickup', () => {
  it('every 10th floor from 10 to 90, and not the last floor', () => {
    expect(LIFE_PICKUP_EVERY).toBe(10);
    const floors = Array.from({ length: FINAL_FLOOR }, (_, i) => i + 1).filter(hasLifePickup);
    expect(floors).toEqual(PICKUP_FLOORS);
    expect(hasLifePickup(100)).toBe(false);
    expect(hasLifePickup(130)).toBe(false);
  });
});

describe('generated life pickups', () => {
  it('one on every pickup floor and none elsewhere', () => {
    for (let s = 0; s < 20; s++) {
      for (const floor of PICKUP_FLOORS) {
        expect(generateFloor(`PICK${s}`, floor).pickups).toHaveLength(1);
      }
      for (const floor of [1, 2, 9, 11, 19, 55, 99, 100]) {
        expect(generateFloor(`PICK${s}`, floor).pickups).toEqual([]);
      }
    }
  }, 60_000);

  it('follows the rules on every seed: valid, off the route, reachable, clear of enemies', () => {
    for (const floor of PICKUP_FLOORS) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`PICKRULES${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed PICKRULES${s} floor ${floor}: ${problems}`);
        expect(map.pickups).toHaveLength(1);
      }
    }
  }, 120_000);

  it('lies a real detour away: 8+ steps off the route on big floors, in a dead end when possible', () => {
    let deadEnds = 0;
    let total = 0;
    for (const floor of [40, 60, 90]) {
      for (let s = 0; s < 40; s++) {
        const map = generateFloor(`DETOUR${s}`, floor);
        const route = shortestPath(map, map.start, map.exit).map((p) => p.y * map.width + p.x);
        const away = distanceFromRoute(map, route);
        const pos = map.pickups[0]!.pos;
        expect(away[pos.y * map.width + pos.x]).toBeGreaterThanOrEqual(PREFERRED_PICKUP_DETOUR);
        const open = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(([dx, dy]) => map.tiles[(pos.y + dy!) * map.width + pos.x + dx!] !== 0).length;
        total++;
        if (open === 1) deadEnds++;
      }
    }
    expect(deadEnds / total).toBeGreaterThan(0.8);
  }, 60_000);

  it('is deterministic and never changes terrain or enemies', () => {
    for (const floor of [10, 50]) {
      const a = generateFloor('PICKDET', floor);
      const b = generateFloor('PICKDET', floor);
      expect(a.pickups).toEqual(b.pickups);
      const bare = serializeMap(a, { enemies: false });
      a.pickups = [];
      expect(serializeMap(a, { enemies: false })).toEqual(bare);
      expect(serializeMap(a)).not.toEqual(bare); // the enemies are still there
    }
  }, 60_000);
});

describe('placeLifePickup', () => {
  // The route is the top corridor; a short side branch hangs off it near the exit.
  const BRANCH = [
    '###########',
    '#@.......!#',
    '#######.###',
    '#######.###',
    '#######.###',
    '###########',
  ];

  it('relaxes the detour on a small floor instead of giving up', () => {
    const pickup = placeLifePickup(parseMap(BRANCH), createRng('SMALL'));
    // Nothing is 8, 6 or 4 steps off the route here: the end of the branch is the best there is.
    expect(pickup?.pos).toEqual({ x: 7, y: 4 });
  });

  it('never picks a tile an enemy can occupy', () => {
    // A bloodstone fills the dead end, so the pickup goes one tile before it.
    const map = parseMap(BRANCH.map((row, y) => (y === 4 ? '#######x###' : row)));
    expect(placeLifePickup(map, createRng('ENEMY'))?.pos).toEqual({ x: 7, y: 3 });
  });

  it('returns null when there is nowhere to put it', () => {
    const map = parseMap(['#####', '#@.!#', '#####']);
    expect(placeLifePickup(map, createRng('NONE'))).toBeNull();
  });
});
