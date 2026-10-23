import { describe, expect, it } from 'vitest';
import { parseMap, serializeMap } from './floor-map';
import { createGameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

const MAP = ['#########', '#@..+..x#', '#.#####.#', '#......!#', '#########'];

function game(map: string[] = MAP, opts = {}) {
  return createGameState('T', parseMap(map), { sightRadius: 2, ...opts });
}

const step = (s: ReturnType<typeof game>, dir: 'N' | 'E' | 'S' | 'W' = 'E') =>
  applyAction(s, { type: 'move', dir });

describe('pickups in maps', () => {
  it("parses '+' as a life pickup on a floor tile and writes it back", () => {
    const map = parseMap(MAP);
    expect(map.pickups).toEqual([{ type: 'life', pos: { x: 4, y: 1 } }]);
    expect(map.tiles[1 * map.width + 4]).toBe(1); // floor underneath
    expect(serializeMap(map)).toEqual(MAP);
    expect(serializeMap(map, { enemies: false })[1]).toBe('#@......#');
    expect(serializeMap(map, { pickups: false })[1]).toBe('#@.....x#');
  });

  it('createGameState lays the pickup on the floor, unless the run already took it', () => {
    expect(game().pickups).toEqual([{ type: 'life', pos: { x: 4, y: 1 }, seen: false }]);
    const taken = game(MAP, { lifePickups: [0] }); // parseMap floors are numbered 0
    expect(taken.pickups).toEqual([]);
    expect(game(MAP, { lifePickups: [10, 20] }).pickups).toHaveLength(1);
  });
});

describe('collecting a life', () => {
  it('restores one life, removes the pickup and reports it before the enemy turn', () => {
    const s = game();
    loseLife(s); // 2 lives, back on the start tile
    step(s);
    step(s);
    const events = step(s); // the third step lands on the pickup at x = 4
    expect(events.map((e) => e.type)).toContain('lifeGained');
    expect(events.find((e) => e.type === 'lifeGained')).toEqual({
      type: 'lifeGained',
      livesNow: 3,
      floor: 0,
    });
    expect(s.lives).toBe(3);
    expect(s.pickups).toHaveLength(0);
  });

  it('is not taken at full lives: it stays and says why', () => {
    const s = game();
    step(s);
    step(s);
    const events = step(s);
    expect(events.map((e) => e.type)).toContain('lifeFull');
    expect(events.map((e) => e.type)).not.toContain('lifeGained');
    expect(s.lives).toBe(3);
    expect(s.pickups).toHaveLength(1);
  });

  it('can be taken later, once a life has been lost', () => {
    const s = game();
    for (let i = 0; i < 3; i++) step(s); // on the pickup at 3/3
    loseLife(s);
    expect(s.pickups).toHaveLength(1);
    for (let i = 0; i < 3; i++) step(s);
    expect(s.lives).toBe(3);
    expect(s.pickups).toHaveLength(0);
  });

  it('a life gained can be lost again on the same turn', () => {
    // The Bloodstone is right behind the pickup: walking on it, then into the stone.
    const s = game(['########', '#@+x..!#', '########']);
    loseLife(s);
    expect(s.lives).toBe(2);
    step(s); // onto '+': 3 lives
    expect(s.lives).toBe(3);
    const events = step(s); // into the stone
    expect(events.map((e) => e.type)).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.lives).toBe(2);
  });

  it('never goes above maxLives', () => {
    const s = game();
    s.maxLives = 3;
    s.lives = 3;
    step(s);
    step(s);
    step(s);
    expect(s.lives).toBe(3);
  });
});

describe('seeing a pickup', () => {
  const LONG = ['###########', '#@......+.#', '#........!#', '###########'];

  it('reports pickupSighted once, when it comes into view', () => {
    const s = game(LONG, { sightRadius: 3 });
    expect(s.pickups[0]?.seen).toBe(false);
    const types = (): string[] => step(s).map((e) => e.type);
    expect(types()).toEqual(['moved']); // x = 2, distance 6
    expect(types()).toEqual(['moved']); // 5
    expect(types()).toEqual(['moved']); // 4
    expect(types()).toEqual(['moved', 'pickupSighted']); // x = 5, distance 3
    expect(types()).toEqual(['moved']);
    expect(s.pickups[0]?.seen).toBe(true);
  });

  it('a pickup in view when the floor starts is marked seen without an event', () => {
    const s = game(['#####', '#@+.#', '#..!#', '#####'], { sightRadius: 4 });
    expect(s.pickups[0]?.seen).toBe(true);
    expect(step(s, 'S').some((e) => e.type === 'pickupSighted')).toBe(false);
  });
});
