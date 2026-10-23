import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { parseMap, type FloorMap } from '../core/floor-map';
import { generateFloor } from './generate-floor';
import { routeCells } from './placers/fields';
import {
  isCorridorTile,
  MIN_GATE_FROM_EXIT,
  MIN_GATE_FROM_START,
  MIN_GATE_SPACING,
} from './placers/gate';
import { routeSurvivable } from './spear-timing';
import { validateFloor } from './validate';

const SEEDS = 150;
const bouncersOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'bouncer');
const countOn = (seed: string, floor: number): number =>
  bouncersOf(generateFloor(seed, floor)).length;

describe('generated bouncers', () => {
  it('never appear before floor 32, and do from floor 32 on', () => {
    expect(ENEMY_DEFS.bouncer.minFloor).toBe(32);
    let found = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 12, 31]) expect(countOn(`BNC${s}`, floor)).toBe(0);
      found += countOn(`BNC${s}`, 32);
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('are limited to two per floor', () => {
    let most = 0;
    for (let s = 0; s < 100; s++) {
      for (const floor of [33, 50, 80]) most = Math.max(most, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(2);
  }, 120_000);

  it('stand on the route, in a corridor, away from the ends and from each other', () => {
    let seen = 0;
    for (const floor of [32, 50, 80]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`ROUTE${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed ROUTE${s} floor ${floor}: ${problems}`);
        const route = routeCells(map);
        const gates = bouncersOf(map);
        for (const g of gates) {
          seen++;
          const i = g.pos.y * map.width + g.pos.x;
          const index = route.indexOf(i);
          expect(index).toBeGreaterThanOrEqual(MIN_GATE_FROM_START);
          expect(route.length - 1 - index).toBeGreaterThanOrEqual(MIN_GATE_FROM_EXIT);
          expect(isCorridorTile(map, i)).toBe(true);
          for (const other of gates) {
            if (other === g) continue;
            const d = Math.abs(other.pos.x - g.pos.x) + Math.abs(other.pos.y - g.pos.y);
            expect(d).toBeGreaterThanOrEqual(MIN_GATE_SPACING);
          }
        }
        expect(routeSurvivable(map, map.spawns)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(40);
  }, 240_000);

  it('are deterministic', () => {
    expect(generateFloor('NDET', 45).spawns).toEqual(generateFloor('NDET', 45).spawns);
  });

  it('are rejected by validation when off the route or not in a corridor, or a third is added', () => {
    let map = generateFloor('NBAD0', 45);
    for (let s = 1; bouncersOf(map).length < 2 && s < 300; s++) {
      map = generateFloor(`NBAD${s}`, 45);
    }
    expect(bouncersOf(map)).toHaveLength(2);
    const gate = bouncersOf(map)[0];
    if (!gate) return;
    map.spawns = [...map.spawns, { ...gate }];
    expect(validateFloor(map).join(';')).toMatch(/3 bouncers on floor 45/);

    const route = new Set(routeCells(map));
    const off = map.tiles.findIndex(
      (t, i) => t !== 0 && !route.has(i) && isCorridorTile(map, i) && i !== 0,
    );
    const x = off % map.width;
    map.spawns = [{ type: 'bouncer', pos: { x, y: (off - x) / map.width } }];
    expect(validateFloor(map).join(';')).toMatch(/not on the route|too close to the start/);
  }, 120_000);
});

describe('the route proof with gates', () => {
  it('accepts a single gate (wait for it to open) and two gates in a row', () => {
    const strip = (row: string): string[] => {
      const wall = '#'.repeat(row.length + 2);
      return [wall, `#${row}#`, wall];
    };
    const one = parseMap(strip('@....y.....!'));
    expect(routeSurvivable(one, one.spawns)).toBe(true);
    const two = parseMap(strip('@...y...y...!'));
    expect(routeSurvivable(two, two.spawns)).toBe(true);
  });
});
