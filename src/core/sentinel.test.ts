import { describe, expect, it } from 'vitest';
import { SENTINEL_CHARGE_TURNS, sentinelPeriod, sentinelStage } from './hazards';
import { enemiesOf, enemyAt, glyphForCell } from './enemies';
import { BEHAVIORS } from './behaviors';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('SEN', parseMap(map), { sightRadius: 8, ...opts });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const wait = (s: GameState) => applyAction(s, { type: 'wait' });
const sentinel = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;
const key = (cells: { x: number; y: number }[]): string[] =>
  cells.map((c) => `${c.x},${c.y}`).sort();

// Body at (1,1) facing east, beam x = 2..7 on row 1: period (1 + 1) % 3 = 2 -> 10 turns.
const ROOM = ['##########', '#t.....T.#', '#........#', '#@......!#', '##########'];
const BEAM = key([2, 3, 4, 5, 6, 7].map((x) => ({ x, y: 1 })));

describe('sentinels in maps', () => {
  it("parses 't' body and 'T' tip as one segment-style spawn and writes it back", () => {
    const map = parseMap(ROOM);
    expect(map.spawns).toEqual([{ type: 'sentinel', pos: { x: 1, y: 1 }, end: { x: 7, y: 1 } }]);
    expect(serializeMap(map)).toEqual(ROOM);
  });

  it('takes its cycle length from its position: 6, 8 or 10', () => {
    expect([0, 1, 2, 3].map((x) => sentinelPeriod({ x, y: 0 }))).toEqual([6, 8, 10, 6]);
    expect(sentinelPeriod({ x: 1, y: 1 })).toBe(10);
  });

  it('idles, charges for 2 turns, fires for one', () => {
    const stages = Array.from({ length: 10 }, (_, k) => sentinelStage(10, k));
    expect(stages).toEqual([
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
      'charge',
      'charge',
      'fire',
    ]);
    expect(SENTINEL_CHARGE_TURNS).toBe(2);
    expect(sentinelStage(6, 5)).toBe('fire');
    expect(sentinelStage(6, 3)).toBe('charge');
    expect(sentinelStage(6, 2)).toBe('idle');
  });
});

describe('the cycle in play', () => {
  it('marks the beam for two turns, then it hurts for one, then it idles again', () => {
    const s = game(ROOM);
    const seen: string[] = [];
    for (let k = 1; k <= 20; k++) {
      wait(s);
      const e = sentinel(s);
      seen.push(e.cells.length > 0 ? 'fire' : e.warn.length > 0 ? 'charge' : 'idle');
      if (e.warn.length > 0) expect(key(e.warn)).toEqual(BEAM);
      if (e.cells.length > 0) expect(key(e.cells)).toEqual(BEAM);
    }
    expect(seen.slice(0, 10)).toEqual([
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
      'charge',
      'charge',
      'fire',
      'idle',
    ]);
    // The cycle repeats (turn 10 is the idle one, so every turn is shifted by one).
    expect(seen.slice(10, 20)).toEqual(seen.slice(0, 10));
  });

  it('tells the player when a charge begins in view, once per charge', () => {
    const s = game(ROOM);
    const alerts: number[] = [];
    for (let k = 1; k <= 20; k++) {
      if (types(wait(s)).includes('enemyAlerted')) alerts.push(k);
    }
    expect(alerts).toEqual([7, 17]);
  });

  it('does not tell the player about a charge it cannot see', () => {
    const s = game(['##########', '#t.....T.#', '##########', '#@......!#', '##########']);
    expect(s.visible[1 * s.floor.width + 3]).toBe(0);
    const alerts = Array.from({ length: 10 }, () => types(wait(s))).flat();
    expect(alerts).not.toContain('enemyAlerted');
  });

  it('costs a life only when the beam fires on the player', () => {
    // The start tile is on the beam this time.
    const s = game(['##########', '#t..@..T.#', '#........#', '#.......!#', '##########']);
    for (let k = 1; k <= 8; k++) expect(types(wait(s))).not.toContain('lifeLost'); // charging is safe
    const events = wait(s); // turn 9: the beam fires
    expect(types(events)).toContain('hitEnemy');
    expect(types(events)).toContain('lifeLost');
    expect(s.lives).toBe(2);
  });

  it('can be crossed on the move, but not waited in', () => {
    const CROSSING = ['#########', '####!####', '#t.....T#', '####.####', '####@####', '#########']; // body at (1,2): period (1 + 2) % 3 = 0 -> 6 turns, fires on turn 5
    const dash = game(CROSSING);
    const north = (g: GameState) => applyAction(g, { type: 'move', dir: 'N' });
    north(dash);
    north(dash);
    expect(types(north(dash))).toEqual(['moved', 'reachedExit']);
    expect(dash.lives).toBe(3);

    const dawdle = game(CROSSING);
    north(dawdle);
    north(dawdle); // standing on the beam row, turn 2
    expect(types(wait(dawdle))).not.toContain('lifeLost'); // turn 3
    expect(types(wait(dawdle))).not.toContain('lifeLost'); // turn 4
    expect(types(wait(dawdle))).toContain('lifeLost'); // turn 5: fired
  });

  it('is reset by a respawn: the cycle starts over and nothing is marked', () => {
    const s = game(['##########', '#t..@..T.#', '#........#', '#.......!#', '##########']);
    for (let k = 1; k <= 9; k++) wait(s); // fired, hit, respawned
    expect(s.lives).toBe(2);
    expect(sentinel(s).memory.k).toBe(0);
    expect(sentinel(s).cells).toEqual([]);
    expect(sentinel(s).warn).toEqual([]);
  });
});

describe('the body', () => {
  it('is solid: it hurts when walked into, and it is not part of the timed hazard', () => {
    const s = game(['##########', '#t..@..T.#', '#........#', '#.......!#', '##########']);
    expect(sentinel(s).cells).toEqual([]);
    expect(sentinel(s).solid).toEqual([{ x: 1, y: 1 }]);
    expect(enemyAt(s, { x: 1, y: 1 })).toBe(sentinel(s));
    expect(enemyAt(s, { x: 3, y: 1 })).toBeUndefined(); // the beam is idle
  });

  it('walking into the body costs a life', () => {
    const s = game(['##########', '#t@.....T#', '#........#', '#.......!#', '##########']);
    const events = applyAction(s, { type: 'move', dir: 'W' });
    expect(types(events)).toEqual(['hitEnemy', 'lifeLost']);
  });

  it('is drawn as T (H in the colourblind theme) and the beam as = or I', () => {
    const s = game(ROOM);
    const e = sentinel(s);
    expect(BEHAVIORS.sentinel.solidGlyph?.(e, 0, false)).toBe('T');
    expect(BEHAVIORS.sentinel.solidGlyph?.(e, 0, true)).toBe('H');
    expect(glyphForCell(e, 0)).toBe('=');
    const vertical = game(['######', '#t#..#', '#.#..#', '#T#..#', '#@..!#', '######']);
    const v = sentinel(vertical);
    v.cells = v.warn = [];
    v.cells = [
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ];
    expect(glyphForCell(v, 0)).toBe('I');
  });

  it('shows as alert (the hunting colour) while charging and firing, and plain while idle', () => {
    const s = game(ROOM);
    const e = sentinel(s);
    expect(BEHAVIORS.sentinel.tone?.(e)).toBeUndefined();
    for (let k = 1; k <= 7; k++) wait(s);
    expect(BEHAVIORS.sentinel.tone?.(e)).toBe('alert');
  });
});
