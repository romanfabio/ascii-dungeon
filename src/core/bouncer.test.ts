import { describe, expect, it } from 'vitest';
import { BEHAVIORS } from './behaviors';
import { SHOVE_TILES } from './contact';
import { enemiesOf, glyphForCell } from './enemies';
import { BOUNCER_CLOSED, BOUNCER_PERIOD, bouncerClosed } from './hazards';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { blockersFor } from './pathing';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('BNC', parseMap(map), { sightRadius: 8, ...opts });
}

const strip = (row: string): string[] => {
  const wall = '#'.repeat(row.length + 2);
  return [wall, `#${row}#`, wall];
};

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const bouncer = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;
const east = (s: GameState) => applyAction(s, { type: 'move', dir: 'E' });
const wait = (s: GameState) => applyAction(s, { type: 'wait' });
const closed = (s: GameState): boolean => bouncer(s).cells.length > 0;

// The player at x = 1, the gate at x = 9.
const CORRIDOR = strip('@.......y...!');

describe('bouncers in maps', () => {
  it("parses 'y' and writes it back; Y shut (V in the colourblind theme), y when closing", () => {
    expect(parseMap(CORRIDOR).spawns).toEqual([{ type: 'bouncer', pos: { x: 9, y: 1 } }]);
    expect(serializeMap(parseMap(CORRIDOR))).toEqual(CORRIDOR);
    const s = game(CORRIDOR);
    expect(glyphForCell(bouncer(s), 0)).toBe('Y');
    expect(glyphForCell(bouncer(s), 0, true)).toBe('V');
    expect(BEHAVIORS.gate.warnGlyph).toBe('y');
  });
});

describe('the gate cycle', () => {
  it(`is shut for ${BOUNCER_CLOSED} turns of ${BOUNCER_PERIOD}, then open, marked on the last open turn`, () => {
    const s = game(CORRIDOR);
    expect(closed(s)).toBe(true); // phase 0
    const states: string[] = [];
    for (let k = 1; k <= 2 * BOUNCER_PERIOD; k++) {
      wait(s);
      expect(closed(s)).toBe(bouncerClosed(k));
      states.push(closed(s) ? 'shut' : bouncer(s).warn.length > 0 ? 'closing' : 'open');
    }
    expect(states.slice(0, 8)).toEqual([
      'shut',
      'shut',
      'shut',
      'shut',
      'open',
      'open',
      'closing',
      'shut',
    ]);
    expect(states.slice(8)).toEqual(states.slice(0, 8));
  });

  it('can be walked through while it is open', () => {
    const s = game(strip('@y...!'));
    for (let k = 0; k < BOUNCER_CLOSED; k++) wait(s); // wait for it to open
    expect(types(east(s))).not.toContain('shoved'); // onto the gate tile
    expect(s.player.pos.x).toBe(2);
    east(s);
    expect(s.player.pos.x).toBe(3);
    expect(s.lives).toBe(3);
  });
});

describe('touching it', () => {
  it('walking into a shut gate shoves you back along your footsteps: no life lost, no refund', () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 7; i++) east(s); // x = 8, the gate is open for the last of these turns
    wait(s); // it shuts
    expect(closed(s)).toBe(true);
    const steps = s.stats.floorSteps;
    const events = east(s); // into the gate
    expect(types(events)).toEqual(['hitEnemy', 'shoved']);
    expect(events).toContainEqual({ type: 'shoved', tiles: SHOVE_TILES });
    expect(s.lives).toBe(3);
    expect(s.player.pos.x).toBe(5); // four entries back in the trail
    expect(s.stats.floorSteps).toBe(steps);
  });

  it('a shove at the start of the floor lands on the start tile', () => {
    const s = game(strip('@y...!'));
    expect(closed(s)).toBe(true);
    const events = east(s);
    expect(types(events)).toEqual(['hitEnemy', 'shoved']);
    expect(s.player.pos).toEqual(s.floor.start);
    expect(s.lives).toBe(3);
  });

  it('closing on the player shoves them off its tile', () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 7; i++) east(s); // x = 8 after turn 7, the gate is open
    const events = east(s); // x = 9: onto the gate tile, and it shuts at the end of this turn
    expect(types(events)).toContain('shoved');
    expect(s.lives).toBe(3);
    expect(s.player.pos.x).toBe(5);
  });

  it('is put back to its start (shut, phase 0) by a respawn', () => {
    const s = game(CORRIDOR);
    for (let k = 0; k < 6; k++) wait(s);
    expect(closed(s)).toBe(false);
    loseLife(s);
    expect(closed(s)).toBe(true);
    expect(bouncer(s).memory.k).toBe(0);
    expect(bouncer(s).warn).toEqual([]);
  });
});

describe('other enemies', () => {
  it('see a shut gate as a wall and an open one as free', () => {
    const s = game(strip('@..........c.y..!'));
    const [chaser, gate] = enemiesOf(s) as [Enemy, Enemy];
    const index = 1 * s.floor.width + gate.pos.x;
    expect(chaser.type).toBe('chaser');
    expect(blockersFor(chaser, s).has(index)).toBe(true);
    for (let k = 0; k < 6; k++) wait(s);
    expect(gate.cells).toEqual([]);
    expect(blockersFor(chaser, s).has(index)).toBe(false);
  });
});
