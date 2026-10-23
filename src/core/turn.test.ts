import { describe, expect, it } from 'vitest';
import { parseMap } from './floor-map';
import { createGameState } from './game-state';
import { applyAction } from './turn';

function game() {
  return createGameState('T', parseMap(['#####', '#@..#', '#.#!#', '#####']));
}

describe('applyAction', () => {
  it('moves onto a free tile and counts the step', () => {
    const s = game();
    const events = applyAction(s, { type: 'move', dir: 'E' });
    expect(events).toEqual([{ type: 'moved', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }]);
    expect(s.player.pos).toEqual({ x: 2, y: 1 });
    expect(s.stats.floorSteps).toBe(1);
    expect(s.stats.totalSteps).toBe(1);
    expect(s.turn).toBe(1);
  });

  it('bumps into walls without moving or spending a step', () => {
    const s = game();
    expect(applyAction(s, { type: 'move', dir: 'N' })).toEqual([
      { type: 'bumped', at: { x: 1, y: 0 } },
    ]);
    expect(applyAction(s, { type: 'move', dir: 'W' })).toHaveLength(1);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(s.stats.floorSteps).toBe(0);
    expect(s.turn).toBe(0);
  });

  it('does not walk out of the map', () => {
    const s = createGameState('T', parseMap(['@.!']));
    expect(applyAction(s, { type: 'move', dir: 'W' })[0]?.type).toBe('bumped');
    expect(applyAction(s, { type: 'move', dir: 'N' })[0]?.type).toBe('bumped');
  });

  it('reports reachedExit when stepping on the exit', () => {
    const s = game();
    applyAction(s, { type: 'move', dir: 'E' });
    const events = applyAction(s, { type: 'move', dir: 'E' });
    expect(events.map((e) => e.type)).toEqual(['moved']);
    const last = applyAction(s, { type: 'move', dir: 'S' });
    expect(last.map((e) => e.type)).toEqual(['moved', 'reachedExit']);
    expect(s.stats.floorSteps).toBe(3);
  });

  it('is blocked by entities that block movement', () => {
    const s = game();
    s.entities.push({
      id: 1,
      kind: 'player',
      pos: { x: 2, y: 1 },
      glyph: 'x',
      blocksMovement: true,
    });
    expect(applyAction(s, { type: 'move', dir: 'E' })[0]?.type).toBe('bumped');
  });

  it('wait advances the turn only', () => {
    const s = game();
    expect(applyAction(s, { type: 'wait' })).toEqual([]);
    expect(s.turn).toBe(1);
    expect(s.stats.floorSteps).toBe(0);
  });

  it('carries total steps between floors', () => {
    const s = createGameState('T', parseMap(['@.!']), { totalSteps: 40 });
    expect(s.stats.floorSteps).toBe(0);
    expect(s.stats.totalSteps).toBe(40);
  });
});
