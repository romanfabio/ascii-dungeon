import { describe, expect, it } from 'vitest';
import { enemiesOf, enemyAt } from './enemies';
import { parseMap, serializeMap } from './floor-map';
import { createGameState } from './game-state';
import { applyAction } from './turn';

const MAP = ['#######', '#@..x.#', '#.###.#', '#...!.#', '#######'];

function game(map: string[] = MAP, opts = {}) {
  return createGameState('T', parseMap(map), { sightRadius: 2, ...opts });
}

describe('enemies in maps', () => {
  it("parses 'x' as a Bloodstone standing on a floor tile and writes it back", () => {
    const map = parseMap(MAP);
    expect(map.spawns).toEqual([{ type: 'bloodstone', pos: { x: 4, y: 1 } }]);
    expect(map.tiles[1 * map.width + 4]).toBe(1); // floor underneath: it is not part of the terrain
    expect(serializeMap(map)).toEqual(MAP);
    expect(serializeMap(map, { enemies: false })[1]).toBe('#@....#');
  });

  it('createGameState places one enemy entity per spawn, with ids from 1', () => {
    const s = game();
    const enemies = enemiesOf(s);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]).toMatchObject({
      id: 1,
      kind: 'enemy',
      type: 'bloodstone',
      glyph: '#',
      pos: { x: 4, y: 1 },
      cells: [{ x: 4, y: 1 }],
    });
    expect(enemyAt(s, { x: 4, y: 1 })?.id).toBe(1);
    expect(enemyAt(s, { x: 3, y: 1 })).toBeUndefined();
  });
});

describe('walking into a Bloodstone', () => {
  it('costs a life, does not move the player, and sends them back to the start', () => {
    const s = game();
    applyAction(s, { type: 'move', dir: 'E' });
    applyAction(s, { type: 'move', dir: 'E' });
    expect(s.player.pos).toEqual({ x: 3, y: 1 });

    const events = applyAction(s, { type: 'move', dir: 'E' });

    expect(events.map((e) => e.type)).toEqual(['hitEnemy', 'lifeLost']);
    expect(events[0]).toEqual({ type: 'hitEnemy', enemyId: 1, at: { x: 4, y: 1 } });
    expect(s.lives).toBe(2);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(s.stats.floorSteps).toBe(0);
    expect(s.stats.totalSteps).toBe(2); // the steps already walked stay in the run total
  });

  it('three hits end the run', () => {
    const s = game();
    const bump = (): string[] => {
      applyAction(s, { type: 'move', dir: 'E' });
      applyAction(s, { type: 'move', dir: 'E' });
      return applyAction(s, { type: 'move', dir: 'E' }).map((e) => e.type);
    };
    bump();
    bump();
    expect(bump()).toEqual(['hitEnemy', 'lifeLost', 'gameOver']);
    expect(s.lives).toBe(0);
  });

  it('a Bloodstone does not block sight', () => {
    const s = game(['#######', '#@.x..#', '#....!#', '#######'], { sightRadius: 6 });
    const { width } = s.floor;
    expect(s.visible[1 * width + 5]).toBe(1); // the tile behind it is visible
  });
});

describe('sighting', () => {
  it('reports enemySighted once, on the step that brings the enemy into view', () => {
    const s = game(['##########', '#@......x#', '#.......!#', '##########'], { sightRadius: 3 });
    expect(enemiesOf(s)[0]?.seen).toBe(false);
    const types = (): string[] => applyAction(s, { type: 'move', dir: 'E' }).map((e) => e.type);
    expect(types()).toEqual(['moved']); // x = 2, distance 6
    expect(types()).toEqual(['moved']); // 5
    expect(types()).toEqual(['moved']); // 4
    expect(types()).toEqual(['moved', 'enemySighted']); // x = 5, distance 3
    expect(types()).toEqual(['moved']); // already seen: no second event
    expect(enemiesOf(s)[0]?.seen).toBe(true);
  });

  it('enemies already in view when the floor starts are marked seen without an event', () => {
    const s = game(['#####', '#@x.#', '#..!#', '#####'], { sightRadius: 4 });
    expect(enemiesOf(s)[0]?.seen).toBe(true);
    const events = applyAction(s, { type: 'move', dir: 'S' });
    expect(events.some((e) => e.type === 'enemySighted')).toBe(false);
  });
});
