import { describe, expect, it } from 'vitest';
import { enemiesOf } from './enemies';
import { parseMap, serializeMap } from './floor-map';
import { createGameState } from './game-state';
import { applyAction } from './turn';

// The patrol runs along the top corridor from x = 4 to x = 8 (5 tiles), starting at x = 4.
const MAP = ['#############', '#@..p....P..#', '#...........#', '#..........!#', '#############'];

function game(map: string[] = MAP, opts = {}) {
  return createGameState('T', parseMap(map), { sightRadius: 3, ...opts });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);

describe('Patroller in maps', () => {
  it("is written 'p' ... 'P' and round-trips", () => {
    const map = parseMap(MAP);
    expect(map.spawns).toEqual([{ type: 'patroller', pos: { x: 4, y: 1 }, end: { x: 9, y: 1 } }]);
    expect(serializeMap(map)).toEqual(MAP);
    expect(serializeMap(map, { enemies: false })[1]).toBe('#@..........#');
  });

  it('pairs each p with the nearest free P in its row or column', () => {
    const map = parseMap(['#######', '#@p..P#', '#.....#', '#p...P#', '#....!#', '#######']);
    expect(map.spawns.map((s) => [s.pos, s.end])).toEqual([
      [
        { x: 2, y: 1 },
        { x: 5, y: 1 },
      ],
      [
        { x: 1, y: 3 },
        { x: 5, y: 3 },
      ],
    ]);
    expect(() => parseMap(['#####', '#@p!#', '#####'])).toThrow(/end marker/);
    expect(() => parseMap(['#####', '#@P!#', '#####'])).toThrow(/end marker without/);
  });
});

describe('Patroller behaviour', () => {
  it('walks one tile per turn and bounces at both ends', () => {
    const s = game();
    const [p] = enemiesOf(s);
    const xs: number[] = [];
    for (let i = 0; i < 14; i++) {
      applyAction(s, { type: 'wait' });
      xs.push(p?.pos.x as number);
    }
    expect(xs).toEqual([5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 5, 6, 7, 8]);
    expect(p?.cells).toEqual([{ x: 8, y: 1 }]);
  });

  it('every turn that takes time moves it, but bumping a wall does not', () => {
    const s = game();
    const [p] = enemiesOf(s);
    applyAction(s, { type: 'move', dir: 'N' }); // wall: no turn
    expect(p?.pos.x).toBe(4);
    applyAction(s, { type: 'move', dir: 'S' });
    expect(p?.pos.x).toBe(5);
  });

  // Patrol x = 4..6 (p at 4, P at 6); the player starts at x = 1.
  const SHORT = ['#########', '#@..p.P.#', '#.......#', '#......!#', '#########'];

  it('costs a life when the player walks into it', () => {
    const s = game(SHORT);
    expect(types(applyAction(s, { type: 'move', dir: 'E' }))).toContain('moved'); // player 2, patroller 5
    applyAction(s, { type: 'move', dir: 'E' }); // player 3, patroller 6
    applyAction(s, { type: 'move', dir: 'E' }); // player 4, patroller turns back to 5
    expect(s.player.pos).toEqual({ x: 4, y: 1 });
    expect(enemiesOf(s)[0]?.pos.x).toBe(5);

    const events = applyAction(s, { type: 'move', dir: 'E' }); // into the patroller at 5

    expect(types(events)).toEqual(['hitEnemy', 'lifeLost']);
    expect(events[0]).toMatchObject({ enemyId: 1, at: { x: 5, y: 1 } });
    expect(s.lives).toBe(2);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
  });

  it('costs a life when it walks onto the player', () => {
    const s = game(SHORT);
    applyAction(s, { type: 'move', dir: 'E' }); // player 2, patroller 5
    applyAction(s, { type: 'move', dir: 'E' }); // player 3, patroller 6
    applyAction(s, { type: 'move', dir: 'E' }); // player 4, patroller 5
    // standing still, the player lets the patroller arrive
    const events = applyAction(s, { type: 'wait' }); // patroller 5 -> 4: onto the player
    expect(types(events)).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.lives).toBe(2);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
  });

  it('cannot hit during the grace turn after a respawn', () => {
    const s = game();
    const [p] = enemiesOf(s);
    s.graceTurns = 1;
    s.player.pos = { x: 5, y: 1 }; // the patroller steps here next
    expect(p?.pos.x).toBe(4);
    const events = applyAction(s, { type: 'wait' });
    expect(types(events)).not.toContain('hitEnemy');
    expect(s.graceTurns).toBe(0);
    expect(s.lives).toBe(3);
  });
});

describe('Patroller sighting', () => {
  it('is reported again each time it comes back into view', () => {
    // The player stands at x = 3 with sight radius 2; the patroller walks x = 5..10 and back, so
    // it is in view at x = 5 only: it leaves at once and returns every 10 turns.
    const s = game(['##############', '#..@.p....P..#', '#...........!#', '##############'], {
      sightRadius: 2,
    });
    const [p] = enemiesOf(s);
    expect(p?.seen).toBe(true); // in view when the floor starts (no event then)
    let sightings = 0;
    for (let i = 0; i < 24; i++) {
      for (const e of applyAction(s, { type: 'wait' })) {
        if (e.type === 'enemySighted') sightings++;
      }
    }
    expect(sightings).toBe(2); // back in view on turns 10 and 20
  });

  it('a Bloodstone is reported only once however often it is seen', () => {
    const s = game(['##########', '#@....x..#', '########!#', '##########'], { sightRadius: 2 });
    let sightings = 0;
    const walk = (dir: 'E' | 'W'): void => {
      for (const e of applyAction(s, { type: 'move', dir })) {
        if (e.type === 'enemySighted') sightings++;
      }
    };
    for (let i = 0; i < 3; i++) walk('E');
    for (let i = 0; i < 3; i++) walk('W');
    for (let i = 0; i < 3; i++) walk('E');
    expect(sightings).toBe(1);
  });
});
