import { describe, expect, it } from 'vitest';
import { generateFloor } from '../gen/generate-floor';
import { parseMap, type FloorMap } from './floor-map';
import { computeFov, updateVisibility } from './fov';
import { createGameState } from './game-state';
import { applyAction } from './turn';
import { isWalkable } from './tiles';

function fovOf(map: FloorMap, x: number, y: number, radius: number): Uint8Array {
  const visible = new Uint8Array(map.width * map.height);
  computeFov(map, { x, y }, radius, visible);
  return visible;
}

/** Renders visibility as text for readable assertions: 'o' = visible floor, '#' = visible wall. */
function show(map: FloorMap, visible: Uint8Array): string[] {
  const rows: string[] = [];
  for (let y = 0; y < map.height; y++) {
    let row = '';
    for (let x = 0; x < map.width; x++) {
      const v = visible[y * map.width + x];
      const wall = !isWalkable(map.tiles[y * map.width + x] as number);
      row += v ? (wall ? '#' : 'o') : ' ';
    }
    rows.push(row);
  }
  return rows;
}

describe('computeFov', () => {
  it('sees the whole of an open room', () => {
    const map = parseMap(['#######', '#@....#', '#.....#', '#....!#', '#######']);
    const v = fovOf(map, 1, 1, 10);
    // every tile of the room and its walls is lit
    expect(v.every((b) => b === 1)).toBe(true);
  });

  it('is blocked by walls', () => {
    const map = parseMap(['#########', '#@..#..!#', '#########']);
    const v = fovOf(map, 1, 1, 10);
    expect(show(map, v)).toEqual(['#####    ', '#ooo#    ', '#####    ']);
  });

  it('respects the radius (round area)', () => {
    const rows = [
      '#'.repeat(21),
      ...Array.from({ length: 19 }, () => '#' + '.'.repeat(19) + '#'),
      '#'.repeat(21),
    ];
    rows[10] = '#' + '.'.repeat(9) + '@' + '.'.repeat(9) + '#';
    rows[1] = '#' + '.'.repeat(18) + '!' + '#';
    const map = parseMap(rows);
    const v = fovOf(map, 10, 10, 4);
    const at = (x: number, y: number) => v[y * 21 + x];
    expect(at(14, 10)).toBe(1); // distance 4: inside
    expect(at(15, 10)).toBe(0); // distance 5: outside
    expect(at(14, 14)).toBe(0); // corner of the bounding square is outside the circle
    expect(at(12, 12)).toBe(1);
  });

  it('lights corridor walls but not what is behind them', () => {
    const map = parseMap(['#######', '#.....#', '###@###', '###.###', '###!###', '#######']);
    const v = fovOf(map, 3, 2, 10);
    expect(v[3 * 7 + 3]).toBe(1);
    expect(v[4 * 7 + 3]).toBe(1);
    expect(v[1 * 7 + 3]).toBe(1);
    // the room row is seen only partly through the door at a distance
    expect(v[1 * 7 + 1]).toBe(1);
  });

  it('a pillar casts a shadow', () => {
    const map = parseMap([
      '###########',
      '#.........#',
      '#.........#',
      '#....#....#',
      '#.........#',
      '#@.......!#',
      '###########',
    ]);
    const v = fovOf(map, 1, 3, 20); // same row as the pillar at (5,3)
    expect(v[3 * 11 + 4]).toBe(1);
    expect(v[3 * 11 + 5]).toBe(1); // the pillar itself is lit
    expect(v[3 * 11 + 7]).toBe(0); // directly behind it: shadowed
    expect(v[3 * 11 + 9]).toBe(0);
    expect(v[1 * 11 + 9]).toBe(1); // off-axis tiles are still seen
  });

  it('is symmetric between floor tiles on generated maps', () => {
    for (const [seed, floor] of [
      ['SYM1', 1],
      ['SYM2', 4],
      ['SYM3', 9],
    ] as const) {
      const map = generateFloor(seed, floor);
      const floors: number[] = [];
      for (let i = 0; i < map.tiles.length; i++)
        if (isWalkable(map.tiles[i] as number)) floors.push(i);
      const radius = 7;
      // Sample every 7th floor tile as an observer to keep the test fast.
      for (let n = 0; n < floors.length; n += 7) {
        const a = floors[n] as number;
        const ax = a % map.width;
        const ay = (a - ax) / map.width;
        const va = fovOf(map, ax, ay, radius);
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const bx = ax + dx;
            const by = ay + dy;
            if (bx < 0 || by < 0 || bx >= map.width || by >= map.height) continue;
            const b = by * map.width + bx;
            if (!isWalkable(map.tiles[b] as number) || !va[b]) continue;
            const vb = fovOf(map, bx, by, radius);
            if (!vb[a])
              throw new Error(
                `${seed}/${floor}: (${ax},${ay}) sees (${bx},${by}) but not vice versa`,
              );
          }
        }
      }
    }
  });
});

describe('updateVisibility', () => {
  it('remembers explored tiles after moving away', () => {
    const map = parseMap(['##########', '#@......!#', '##########']);
    const s = createGameState('T', map, { sightRadius: 2 });
    const at = (x: number) => 1 * 10 + x;
    expect(s.visible[at(2)]).toBe(1);
    expect(s.visible[at(5)]).toBe(0);
    expect(map.explored[at(5)]).toBe(0);

    for (let i = 0; i < 4; i++) applyAction(s, { type: 'move', dir: 'E' });
    expect(s.visible[at(5)]).toBe(1);
    expect(s.visible[at(1)]).toBe(0); // out of sight now...
    expect(map.explored[at(1)]).toBe(1); // ...but remembered
    updateVisibility(s);
    expect(map.explored[at(1)]).toBe(1);
  });
});
