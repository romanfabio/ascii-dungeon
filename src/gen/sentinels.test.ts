import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, fixedTiles } from '../core/enemy-defs';
import { parseMap, spawnCells, type FloorMap } from '../core/floor-map';
import { SENTINEL_MIN_BEAM, SENTINEL_RANGE } from '../core/hazards';
import { bfsDistances } from '../core/pathfinding';
import { isWalkable } from '../core/tiles';
import { generateFloor } from './generate-floor';
import { routeCells } from './placers/fields';
import { routeSurvivable } from './spear-timing';
import { validateFloor } from './validate';

const SEEDS = 150;
const sentinelsOf = (map: FloorMap) => map.spawns.filter((s) => s.type === 'sentinel');
const countOn = (seed: string, floor: number): number =>
  sentinelsOf(generateFloor(seed, floor)).length;

describe('generated sentinels', () => {
  it('never appear before floor 24, and do from floor 24 on', () => {
    expect(ENEMY_DEFS.sentinel.minFloor).toBe(24);
    let found = 0;
    for (let s = 0; s < 60; s++) {
      for (const floor of [2, 12, 23]) expect(countOn(`SEN${s}`, floor)).toBe(0);
      found += countOn(`SEN${s}`, 24);
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('are limited to two per floor, four from floor 60', () => {
    expect([24, 59].map((f) => ENEMY_DEFS.sentinel.maxPerFloor(f))).toEqual([2, 2]);
    expect([60, 100].map((f) => ENEMY_DEFS.sentinel.maxPerFloor(f))).toEqual([4, 4]);
    let most = 0;
    let mostLate = 0;
    for (let s = 0; s < 80; s++) {
      for (const floor of [26, 40, 55]) most = Math.max(most, countOn(`CAP${s}`, floor));
      for (const floor of [70, 90]) mostLate = Math.max(mostLate, countOn(`CAP${s}`, floor));
    }
    expect(most).toBe(2);
    expect(mostLate).toBeLessThanOrEqual(4);
  }, 120_000);

  it('have a walled-in body off the route, a straight beam of 4-7 tiles, and valid floors', () => {
    let seen = 0;
    for (const floor of [24, 40, 70]) {
      for (let s = 0; s < SEEDS; s++) {
        const map = generateFloor(`RULES${s}`, floor);
        const problems = validateFloor(map);
        if (problems.length > 0) throw new Error(`seed RULES${s} floor ${floor}: ${problems}`);
        const route = new Set(routeCells(map));
        for (const sent of sentinelsOf(map)) {
          seen++;
          const cells = spawnCells(sent);
          const beam = cells.length - 1;
          expect(beam).toBeGreaterThanOrEqual(SENTINEL_MIN_BEAM);
          expect(beam).toBeLessThanOrEqual(SENTINEL_RANGE);
          expect(route.has(sent.pos.y * map.width + sent.pos.x)).toBe(false);
          // The body has its back to a wall: the tile behind it (opposite the beam) is solid.
          const end = sent.end as { x: number; y: number };
          const dx = Math.sign(end.x - sent.pos.x);
          const dy = Math.sign(end.y - sent.pos.y);
          const behind = (sent.pos.y - dy) * map.width + (sent.pos.x - dx);
          expect(isWalkable(map.tiles[behind] as number)).toBe(false);
          // Its permanent body seals nothing off (judged against the enemies placed before it).
          const before = new Set<number>();
          for (const other of map.spawns.slice(0, map.spawns.indexOf(sent))) {
            for (const c of fixedTiles(other)) before.add(c.y * map.width + c.x);
          }
          const count = (blocked: Set<number>): number =>
            [...bfsDistances(map, map.start, blocked)].filter((d) => d >= 0).length;
          const without = count(before);
          before.add(sent.pos.y * map.width + sent.pos.x);
          expect(count(before)).toBe(without - 1);
        }
      }
    }
    expect(seen).toBeGreaterThan(30);
  }, 240_000);

  it('are deterministic', () => {
    expect(generateFloor('SDET', 40).spawns).toEqual(generateFloor('SDET', 40).spawns);
  });

  it('are rejected by validation when a third is added before floor 60', () => {
    let map = generateFloor('SBAD0', 26);
    for (let s = 1; sentinelsOf(map).length < 2 && s < 300; s++) {
      map = generateFloor(`SBAD${s}`, 26);
    }
    expect(sentinelsOf(map)).toHaveLength(2);
    const extra = sentinelsOf(map)[0];
    if (!extra) return;
    map.spawns = [...map.spawns, { ...extra }];
    expect(validateFloor(map).join(';')).toMatch(/3 sentinels on floor 26/);
  }, 120_000);
});

describe('the route proof with sentinels', () => {
  it('accepts a beam that crosses the route in one tile', () => {
    const map = parseMap([
      '#########',
      '####!####',
      '#t.....T#',
      '####.####',
      '####@####',
      '#########',
    ]);
    expect(routeSurvivable(map, map.spawns)).toBe(true);
  });

  it('rejects a beam along the corridor the route follows when it cannot be out-walked', () => {
    // Body at (14,1): period (14 + 1) % 3 = 0 -> 6 turns, and the beam covers x = 7..13 of the route.
    const map = parseMap(
      ['################', '#@.........!..t#', '################'].map((row, y) =>
        y === 1 ? '#@.....T....!.t#' : row,
      ),
    );
    expect(map.spawns[0]?.type).toBe('sentinel');
    expect(routeSurvivable(map, map.spawns)).toBe(false);
    expect(validateFloor(map).join(';')).toMatch(/route impassable/);
  });
});
