import { describe, expect, it } from 'vitest';
import { segmentPeriod, segmentTipOffset } from './behaviors';
import { enemiesOf, glyphForCell } from './enemies';
import { parseMap, serializeMap } from './floor-map';
import { createGameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

// A horizontal spear: base at x = 3, reaching up to x = 7 (5 tiles).
const MAP = ['#############', '#@..s....S..#', '#...........#', '#..........!#', '#############'];

function game(map: string[] = MAP, opts = {}) {
  return createGameState('T', parseMap(map), { sightRadius: 3, ...opts });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);

/** The spear drawn as text, base first: ">" then "->" then "-->"... */
function drawn(s: ReturnType<typeof game>): string {
  const [spear] = enemiesOf(s);
  return (spear?.cells ?? []).map((_, k) => glyphForCell(spear!, k)).join('');
}

describe('segment timing helpers', () => {
  it('the tip walks out to len - 1 and back, starting at 0', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => segmentTipOffset(3, p))).toEqual([
      0, 1, 2, 1, 0, 1, 2, 1, 0,
    ]);
    expect(segmentPeriod(3)).toBe(4);
    expect(segmentPeriod(6)).toBe(10);
  });
});

describe('Spear in maps', () => {
  it("is written 's' ... 'S' and round-trips, telling spears from patrollers", () => {
    const map = parseMap(MAP);
    expect(map.spawns).toEqual([{ type: 'spear', pos: { x: 4, y: 1 }, end: { x: 9, y: 1 } }]);
    expect(serializeMap(map)).toEqual(MAP);

    const both = parseMap(['#########', '#@s.S..!#', '#p..P...#', '#########']);
    expect(both.spawns.map((s) => [s.type, s.end])).toEqual([
      ['spear', { x: 4, y: 1 }],
      ['patroller', { x: 4, y: 2 }],
    ]);
    expect(() => parseMap(['#####', '#@s!#', '#####'])).toThrow(/no end marker/);
  });
});

describe('Spear behaviour', () => {
  it('grows from length 1 to its reach and shrinks back, one tile per turn', () => {
    const s = game();
    expect(drawn(s)).toBe('>');
    const lengths: string[] = [];
    for (let i = 0; i < 12; i++) {
      applyAction(s, { type: 'wait' });
      lengths.push(drawn(s));
    }
    expect(lengths).toEqual([
      '->',
      '-->',
      '--->',
      '---->',
      '----->',
      '---->',
      '--->',
      '-->',
      '->',
      '>',
      '->',
      '-->',
    ]);
  });

  it('draws the tip as an arrow pointing the way it extends, with a shaft behind it', () => {
    const afterTwoTurns = (rows: string[]): string => {
      const g = game(rows);
      for (let i = 0; i < 2; i++) applyAction(g, { type: 'wait' });
      return drawn(g);
    };
    const east = ['#########', '#@..s..S#', '#......!#', '#########'];
    const west = ['#########', '#@..S..s#', '#......!#', '#########'];
    const south = ['#######', '#@.s..#', '#.....#', '#..S.!#', '#.....#', '#######'];
    const north = ['#######', '#@.S..#', '#.....#', '#..s.!#', '#.....#', '#######'];
    expect(afterTwoTurns(east)).toBe('-->');
    expect(afterTwoTurns(west)).toBe('--<'); // listed base first
    expect(afterTwoTurns(south)).toBe('||v');
    expect(afterTwoTurns(north)).toBe('||^');
  });

  it('every tile of it hurts: the shaft as well as the tip', () => {
    // The spear reaches x = 4..8 at full length; the player stands in the way.
    const s = game(['#############', '#@.s.S......#', '#..........!#', '#############']);
    // base x = 3, tip reach x = 5. Player walks to x = 2 (next to the base) and waits.
    applyAction(s, { type: 'move', dir: 'E' }); // player 2; spear length 2 (x 3..4)
    expect(types(applyAction(s, { type: 'wait' }))).toEqual([]); // length 3 (x 3..5)
    expect(s.lives).toBe(3);
    // Walking into the extended shaft at x = 3 hurts.
    const events = applyAction(s, { type: 'move', dir: 'E' });
    expect(types(events)).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
  });

  it('hits when it extends onto a player who stands still', () => {
    const s = game(['#############', '#@..s.S.....#', '#..........!#', '#############'], {
      sightRadius: 3,
    });
    s.player.pos = { x: 5, y: 1 }; // just beyond the base at x = 4; the spear is at length 1
    s.graceTurns = 0;
    // the spear's first step reaches x = 5, where the player stands
    expect(types(applyAction(s, { type: 'wait' }))).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.lives).toBe(2);
  });

  it('starts its cycle again when the player respawns', () => {
    const s = game();
    for (let i = 0; i < 3; i++) applyAction(s, { type: 'wait' });
    expect(drawn(s)).toBe('--->');
    loseLife(s);
    expect(drawn(s)).toBe('>');
    applyAction(s, { type: 'wait' });
    expect(drawn(s)).toBe('->');
  });

  it('the one-turn grace after a respawn protects the tile next to the base', () => {
    // base x = 1, the start x = 2: the spear's first step reaches the start tile
    const s = game(['##########', '#s@.S...!#', '#........#', '##########']);
    loseLife(s);
    expect(s.graceTurns).toBe(1);
    expect(types(applyAction(s, { type: 'wait' }))).toEqual([]); // reaches x = 2: grace protects
    expect(s.lives).toBe(2);
    expect(types(applyAction(s, { type: 'wait' }))).toEqual(['hitEnemy', 'lifeLost']); // x = 1..3
    expect(s.lives).toBe(1);
  });
});

describe('wait', () => {
  it('takes a turn without moving or counting a step', () => {
    const s = game();
    const events = applyAction(s, { type: 'wait' });
    expect(events).toEqual([]);
    expect(s.turn).toBe(1);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(s.stats.floorSteps).toBe(0);
    expect(s.stats.totalSteps).toBe(0);
  });

  it('lets a patroller and a spear move', () => {
    const s = game(['##########', '#@s.S.p.P#', '#.......!#', '##########']);
    const before = enemiesOf(s).map((e) => e.cells.length + ':' + e.pos.x);
    applyAction(s, { type: 'wait' });
    const after = enemiesOf(s).map((e) => e.cells.length + ':' + e.pos.x);
    expect(after).not.toEqual(before);
  });
});
