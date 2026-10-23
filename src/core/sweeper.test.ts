import { describe, expect, it } from 'vitest';
import { BEHAVIORS } from './behaviors';
import { enemiesOf, enemyAt, glyphForCell } from './enemies';
import { spawnReach } from './enemy-defs';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { SWEEPER_PERIOD } from './hazards';
import { loseLife } from './lives';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('SWP', parseMap(map), { sightRadius: 8, ...opts });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const sweeper = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;
const wait = (s: GameState) => applyAction(s, { type: 'wait' });
const key = (cells: { x: number; y: number }[]): string[] =>
  cells.map((c) => `${c.x},${c.y}`).sort();

// Pivot at (5,3), arm of 3 tiles pointing east at the start. The player is far away at (1,6).
const ROOM = [
  '############',
  '#..........#',
  '#..........#',
  '#....w..W..#',
  '#..........#',
  '#..........#',
  '#@.......!.#',
  '############',
];
const ARM_E = key([6, 7, 8].map((x) => ({ x, y: 3 })));
const ARM_S = key([4, 5, 6].map((y) => ({ x: 5, y })));
const ARM_W = key([4, 3, 2].map((x) => ({ x, y: 3 })));
const ARM_N = key([2, 1].map((y) => ({ x: 5, y }))); // cut short by the wall after two tiles

describe('sweepers in maps', () => {
  it("parses 'w' pivot and 'W' tip as one segment-style spawn and writes it back", () => {
    const map = parseMap(ROOM);
    expect(map.spawns).toEqual([{ type: 'sweeper', pos: { x: 5, y: 3 }, end: { x: 8, y: 3 } }]);
    expect(serializeMap(map)).toEqual(ROOM);
  });

  it('knows every tile it can reach: the pivot and the arm in all four directions', () => {
    const s = game(ROOM);
    const reach = key(spawnReach(s.floor.spawns[0]!, s.floor));
    expect(reach).toEqual(
      key([{ x: 5, y: 3 }])
        .concat(ARM_E, ARM_S, ARM_W, ARM_N)
        .sort(),
    );
  });
});

describe('the sweep', () => {
  it('starts on the marked direction and turns a quarter clockwise every turn, cut short by walls', () => {
    const s = game(ROOM);
    expect(SWEEPER_PERIOD).toBe(4);
    expect(key(sweeper(s).cells)).toEqual(ARM_E);
    const seen: string[][] = [];
    for (let k = 1; k <= 8; k++) {
      wait(s);
      seen.push(key(sweeper(s).cells));
    }
    expect(seen.slice(0, 4)).toEqual([ARM_S, ARM_W, ARM_N, ARM_E]);
    expect(seen.slice(4)).toEqual(seen.slice(0, 4)); // and round again
  });

  it('marks the arm of the next turn', () => {
    const s = game(ROOM);
    expect(key(sweeper(s).warn)).toEqual(ARM_S); // at the start the arm is east, south is next
    wait(s);
    expect(key(sweeper(s).warn)).toEqual(ARM_W);
    wait(s);
    wait(s);
    expect(key(sweeper(s).warn)).toEqual(ARM_E);
  });

  it('a wall right next to the pivot makes that turn free', () => {
    // Pivot at (1,1) in a corner, arm of 2 pointing south: north and west are walls.
    const s = game(['#####', '#w..#', '#...#', '#W..#', '#..!#', '#@..#', '#####']);
    const cellsPerTurn: number[] = [sweeper(s).cells.length];
    for (let k = 1; k <= 4; k++) {
      wait(s);
      cellsPerTurn.push(sweeper(s).cells.length);
    }
    // south (2 tiles), west (wall: free), north (wall: free), east (2 tiles), south again.
    expect(cellsPerTurn).toEqual([2, 0, 0, 2, 2]);
  });

  it('the arm hurts when the turn comes, the marks never do', () => {
    // Pivot (5,3) facing east; the player stands where the south arm will be.
    const s = game(ROOM.map((r, y) => (y === 6 ? '#....@...!.#' : y === 5 ? r : r)));
    expect(s.player.pos).toEqual({ x: 5, y: 6 });
    expect(s.lives).toBe(3);
    const events = wait(s); // the arm turns south and covers (5,4)..(5,6)
    expect(types(events)).toContain('hitEnemy');
    expect(types(events)).toContain('lifeLost');
    expect(s.lives).toBe(2);
    // The warning at the start (the south arm was marked) did not hurt.
  });

  it('the pivot is solid: touching it costs a life, and it is not part of the arm', () => {
    const s = game(ROOM);
    expect(enemyAt(s, { x: 5, y: 3 })).toBe(sweeper(s));
    expect(key(sweeper(s).cells)).not.toContain('5,3');
    expect(sweeper(s).solid).toEqual([{ x: 5, y: 3 }]);
  });

  it('is drawn X (% in the colourblind theme) with = and I arms', () => {
    const s = game(ROOM);
    const e = sweeper(s);
    expect(BEHAVIORS.sweep.solidGlyph?.(e, 0, false)).toBe('X');
    expect(BEHAVIORS.sweep.solidGlyph?.(e, 0, true)).toBe('%');
    expect(glyphForCell(e, 0)).toBe('='); // east
    wait(s);
    expect(glyphForCell(e, 0)).toBe('I'); // south
  });

  it('is reset by a respawn: the arm points the starting way again', () => {
    const s = game(ROOM);
    wait(s);
    wait(s);
    loseLife(s);
    expect(sweeper(s).memory.k).toBe(0);
    expect(key(sweeper(s).cells)).toEqual(ARM_E);
    expect(key(sweeper(s).warn)).toEqual(ARM_S);
  });
});
