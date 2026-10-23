import { describe, expect, it } from 'vitest';
import { parseMap } from './floor-map';
import { createGameState } from './game-state';
import { gainLife, loseLife, MAX_LIVES } from './lives';
import { applyAction } from './turn';

function game(opts = {}) {
  return createGameState('T', parseMap(['#####', '#@..#', '#.#!#', '#####']), opts);
}

describe('lives', () => {
  it('a run starts with full lives and no deaths', () => {
    const s = game();
    expect(s.lives).toBe(MAX_LIVES);
    expect(s.maxLives).toBe(MAX_LIVES);
    expect(s.stats.deaths).toBe(0);
    expect(s.graceTurns).toBe(0);
  });

  it('carries lives and deaths in from the previous floor, within 1..max', () => {
    const s = game({ lives: 2, deaths: 1 });
    expect(s.lives).toBe(2);
    expect(s.stats.deaths).toBe(1);
    expect(game({ lives: 99 }).lives).toBe(MAX_LIVES);
    expect(game({ lives: 0 }).lives).toBe(1);
  });

  it('loseLife respawns on the start tile and resets only the floor steps', () => {
    const s = game({ totalSteps: 10, totalTimeMs: 5000 });
    applyAction(s, { type: 'move', dir: 'E' });
    applyAction(s, { type: 'move', dir: 'E' });
    s.stats.floorTimeMs = 3000;
    const exploredBefore = s.floor.explored.slice();

    const events = loseLife(s);

    expect(events).toEqual([{ type: 'lifeLost', livesLeft: 2 }]);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(s.lives).toBe(2);
    expect(s.stats.deaths).toBe(1);
    expect(s.stats.floorSteps).toBe(0);
    expect(s.stats.totalSteps).toBe(12); // kept
    expect(s.stats.floorTimeMs).toBe(3000); // kept
    expect(s.stats.totalTimeMs).toBe(5000); // kept
    expect([...s.floor.explored]).toEqual([...exploredBefore]); // fog memory kept
    expect(s.graceTurns).toBe(1);
  });

  it('the last life reports lifeLost then gameOver, and the run stops accepting actions', () => {
    const s = game({ lives: 1 });
    expect(loseLife(s)).toEqual([{ type: 'lifeLost', livesLeft: 0 }, { type: 'gameOver' }]);
    expect(s.lives).toBe(0);
    expect(applyAction(s, { type: 'move', dir: 'E' })).toEqual([]);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
  });

  it('the grace turn counts down as turns pass', () => {
    const s = game();
    loseLife(s);
    expect(s.graceTurns).toBe(1);
    applyAction(s, { type: 'move', dir: 'E' });
    expect(s.graceTurns).toBe(0);
    applyAction(s, { type: 'wait' });
    expect(s.graceTurns).toBe(0);
  });

  it('gainLife never exceeds the maximum', () => {
    const s = game({ lives: 1 });
    gainLife(s);
    gainLife(s);
    gainLife(s);
    expect(s.lives).toBe(MAX_LIVES);
  });
});
