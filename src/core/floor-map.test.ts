import { describe, expect, it } from 'vitest';
import { parseMap, serializeMap } from './floor-map';
import { bfsDistances, labelComponents } from './pathfinding';
import { Tile } from './tiles';

const MAP = ['#######', '#@..#.#', '#.#.#.#', '#.#...#', '#.#.#!#', '#######'];

describe('floor-map', () => {
  it('round-trips parse/serialize', () => {
    expect(serializeMap(parseMap(MAP))).toEqual(MAP);
  });

  it('finds start, exit and optimal path length', () => {
    const map = parseMap(MAP);
    expect(map.start).toEqual({ x: 1, y: 1 });
    expect(map.exit).toEqual({ x: 5, y: 4 });
    expect(map.tiles[4 * 7 + 5]).toBe(Tile.Exit);
    expect(map.optimalPathLength).toBe(7);
  });

  it('rejects malformed maps', () => {
    expect(() => parseMap([])).toThrow();
    expect(() => parseMap(['###', '#@#'])).toThrow(/exit/);
    expect(() => parseMap(['###', '#!#'])).toThrow(/start/);
    expect(() => parseMap(['###', '#@!#'])).toThrow(/length/);
    expect(() => parseMap(['#@!9#'])).toThrow(/unknown/);
  });
});

describe('pathfinding', () => {
  it('bfsDistances marks walls and unreachable cells -1', () => {
    const map = parseMap(['#####', '#@#.#', '#..!#', '#####'].map((l) => l));
    const dist = bfsDistances(map, map.start);
    expect(dist[1 * 5 + 1]).toBe(0);
    expect(dist[2 * 5 + 3]).toBe(3);
    expect(dist[1 * 5 + 2]).toBe(-1); // wall
    expect(dist[0]).toBe(-1);
  });

  it('labelComponents separates disconnected regions', () => {
    const map = parseMap(['#######', '#@.#..#', '#.##..#', '#####!#', '#######']);
    const { count, labels } = labelComponents(map);
    expect(count).toBe(2);
    expect(labels[1 * 7 + 1]).not.toBe(labels[1 * 7 + 4]);
    // unreachable exit reports -1
    expect(map.optimalPathLength).toBe(-1);
  });
});
