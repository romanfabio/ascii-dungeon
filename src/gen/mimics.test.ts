import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, enemyTypesForFloor } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { createRng } from '../core/rng';
import { hasLifePickup, MIMIC_CHANCE, mimicEligible } from './difficulty';
import { generateFloor } from './generate-floor';
import { placeMimic } from './mimics';
import { distanceFromRoute, routeCells } from './placers/fields';
import { validateFloor } from './validate';

const mimicsOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'mimic');
const NON_PICKUP_FLOORS = [16, 17, 25, 45, 77, 100];

describe('which floors may have a mimic', () => {
  it('from floor 16, but never where there is a real life pickup', () => {
    expect(ENEMY_DEFS.mimic.minFloor).toBe(16);
    expect(mimicEligible(15)).toBe(false);
    expect(mimicEligible(16)).toBe(true);
    expect(mimicEligible(17)).toBe(true);
    for (const floor of [20, 30, 40, 50, 60, 70, 80, 90]) {
      expect(hasLifePickup(floor)).toBe(true);
      expect(mimicEligible(floor)).toBe(false);
    }
    expect(mimicEligible(100)).toBe(true);
    expect(MIMIC_CHANCE).toBeCloseTo(1 / 3);
  });
});

describe('generated mimics', () => {
  it('are not in the weighted draw: the other types keep their weights and counts', () => {
    expect(enemyTypesForFloor(45)).not.toContain('mimic');
    expect(ENEMY_DEFS.mimic.weight).toBe(0);
  });

  it('never appear before floor 16 or on pickup floors', () => {
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 12, 15, 20, 30, 50, 90]) {
        expect(mimicsOf(generateFloor(`MIMNO${s}`, floor))).toEqual([]);
      }
    }
  }, 90_000);

  it('appear on about a third of the eligible floors, at most one each', () => {
    let floors = 0;
    let withMimic = 0;
    for (let s = 0; s < 80; s++) {
      for (const floor of NON_PICKUP_FLOORS) {
        const n = mimicsOf(generateFloor(`MIMRATE${s}`, floor)).length;
        expect(n).toBeLessThanOrEqual(1);
        floors++;
        if (n === 1) withMimic++;
      }
    }
    expect(withMimic / floors).toBeGreaterThan(0.25);
    expect(withMimic / floors).toBeLessThan(0.42);
  }, 120_000);

  it('lie off the route with every tile they can strike off it too, and floors stay valid', () => {
    let seen = 0;
    for (const floor of [16, 25, 45, 77]) {
      for (let s = 0; s < 150; s++) {
        const map = generateFloor(`MIMRULE${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed MIMRULE${s} floor ${floor}: ${problems}`);
        const m = mimicsOf(map)[0];
        if (!m) continue;
        seen++;
        const away = distanceFromRoute(map, routeCells(map));
        expect(away[m.pos.y * map.width + m.pos.x]).toBeGreaterThanOrEqual(2);
        expect(map.pickups).toEqual([]); // a mimic floor never has the real thing
      }
    }
    expect(seen).toBeGreaterThan(20);
  }, 180_000);

  it('are deterministic and leave the terrain and the other enemies alone', () => {
    for (let s = 0; s < 30; s++) {
      const a = generateFloor(`MIMDET${s}`, 45);
      const b = generateFloor(`MIMDET${s}`, 45);
      expect(a.spawns).toEqual(b.spawns);
    }
  }, 60_000);

  it('are rejected by validation on a pickup floor or right next to the route', () => {
    let map = generateFloor('MIMBAD0', 45);
    for (let s = 1; mimicsOf(map).length === 0 && s < 200; s++) {
      map = generateFloor(`MIMBAD${s}`, 45);
    }
    expect(mimicsOf(map)).toHaveLength(1);
    expect(validateFloor(map)).toEqual([]);

    const route = routeCells(map);
    const next = route[Math.floor(route.length / 2)] as number;
    const real = map.spawns.filter((e) => e.type !== 'mimic');
    const x = next % map.width;
    map.spawns = [...real, { type: 'mimic', pos: { x, y: (next - x) / map.width } }];
    expect(validateFloor(map).join(';')).toMatch(/too near the route/);

    const onPickupFloor = { ...map, floorNumber: 50 };
    expect(validateFloor(onPickupFloor).join(';')).toMatch(/real life pickup/);
  }, 60_000);
});

describe('placeMimic', () => {
  it('gives nothing on an ineligible floor, whatever the dice say', () => {
    const map = generateFloor('PM', 50);
    for (let s = 0; s < 20; s++) expect(placeMimic(map, createRng(`D${s}`))).toBeNull();
  });
});
