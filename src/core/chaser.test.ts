import { describe, expect, it } from 'vitest';
import { ChaseMode, CHASER_COOLDOWN_TURNS, CHASER_GIVE_UP_TURNS } from './behaviors';
import { enemiesOf, glyphForCell } from './enemies';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('T', parseMap(map), { sightRadius: 8, ...opts });
}

/** A one-tile-wide corridor drawn from a single row. */
const strip = (row: string): string[] => {
  const wall = '#'.repeat(row.length + 2);
  return [wall, `#${row}#`, wall];
};

const chaser = (s: GameState, i = 0): Enemy => enemiesOf(s)[i] as Enemy;
const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const wait = (s: GameState) => applyAction(s, { type: 'wait' });
const east = (s: GameState) => applyAction(s, { type: 'move', dir: 'E' });

// The player at x = 1, the chaser at x = 8.
const CORRIDOR = strip('@......c.......!');

describe('chasers in maps', () => {
  it("parses 'c' as a chaser home and writes it back", () => {
    const map = parseMap(CORRIDOR);
    expect(map.spawns).toEqual([{ type: 'chaser', pos: { x: 8, y: 1 } }]);
    expect(serializeMap(map)).toEqual(CORRIDOR);
  });

  it('starts idle at home, drawn lower case', () => {
    const s = game(CORRIDOR);
    expect(chaser(s).memory).toMatchObject({ hx: 8, hy: 1, mode: ChaseMode.Idle });
    expect(glyphForCell(chaser(s), 0)).toBe('c');
    expect(glyphForCell(chaser(s), 0, true)).toBe('o');
  });
});

describe('noticing the player', () => {
  it('ignores the player beyond 5 tiles and starts hunting at 5, alerting the player', () => {
    const s = game(CORRIDOR);
    // Distances from x = 8: the player at x = 2 is 6 away, at x = 3 it is 5.
    expect(types(east(s))).toEqual(['moved']);
    expect(chaser(s).memory.mode).toBe(ChaseMode.Idle);
    expect(chaser(s).pos).toEqual({ x: 8, y: 1 });

    const events = east(s);
    expect(types(events)).toContain('enemyAlerted');
    expect(chaser(s).memory.mode).toBe(ChaseMode.Hunt);
    expect(chaser(s).pos).toEqual({ x: 7, y: 1 }); // it already took its first step
    expect(glyphForCell(chaser(s), 0)).toBe('C');
    expect(glyphForCell(chaser(s), 0, true)).toBe('O');
  });

  it('does not see through walls', () => {
    const s = game(['#######', '#@#..c#', '#...#.#', '#!...##', '#######']);
    wait(s);
    expect(chaser(s).memory.mode).toBe(ChaseMode.Idle); // 4 tiles away, behind a wall
  });

  it('does not alert a player who cannot see it', () => {
    // The player sees 2 tiles; the chaser sees 5.
    const s = game(CORRIDOR, { sightRadius: 2 });
    east(s);
    const events = east(s);
    expect(chaser(s).memory.mode).toBe(ChaseMode.Hunt);
    expect(types(events)).not.toContain('enemyAlerted');
  });
});

describe('hunting', () => {
  it('moves one tile per turn and never catches a player who keeps walking away', () => {
    const s = game(strip('...c..@...................!'));
    for (let i = 0; i < 15; i++) {
      const events = east(s);
      expect(types(events)).not.toContain('lifeLost');
      expect(s.player.pos.x - chaser(s).pos.x).toBe(3); // the gap never closes
    }
    expect(s.lives).toBe(3);
  });

  it('catches a player who waits: contact costs a life and sends the chaser home', () => {
    const s = game(strip('@..c...........!'));
    const all: string[] = [];
    for (let i = 0; i < 4; i++) all.push(...types(wait(s)));
    expect(all).toContain('hitEnemy');
    expect(all).toContain('lifeLost');
    expect(s.lives).toBe(2);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(chaser(s).pos).toEqual({ x: 4, y: 1 }); // home again
    expect(chaser(s).memory.mode).toBe(ChaseMode.Idle);
  });

  it('walking into a hunting chaser costs a life too', () => {
    const s = game(strip('@...c.........!'));
    expect(types(east(s))).not.toContain('lifeLost'); // it notices them and steps up to 4
    expect(types(wait(s))).not.toContain('lifeLost'); // it steps next to them, at 3
    expect(chaser(s).pos).toEqual({ x: 3, y: 1 });
    const next = east(s); // and the player walks into it
    expect(types(next)).toEqual(expect.arrayContaining(['hitEnemy', 'lifeLost']));
  });

  it('follows the shortest path around walls, one tile per turn', () => {
    //  The player at (1,1), the chaser at (5,1); the way round is along row 3.
    const s = game(['#######', '#@#..c#', '#.#.#.#', '#.....#', '#!#####', '#######']);
    chaser(s).memory.mode = ChaseMode.Hunt;
    const trail: string[] = [];
    for (let i = 0; i < 4; i++) {
      wait(s);
      trail.push(`${chaser(s).pos.x},${chaser(s).pos.y}`);
    }
    // 5,1 -> 5,2 -> 5,3 -> 4,3 -> 3,3; each step is one tile closer by walking distance.
    expect(trail).toEqual(['5,2', '5,3', '4,3', '3,3']);
  });

  it('treats Bloodstones as walls and never stacks on another chaser', () => {
    const s = game(strip('@........cc.......!'));
    chaser(s, 0).memory.mode = ChaseMode.Hunt;
    chaser(s, 1).memory.mode = ChaseMode.Hunt;
    for (let i = 0; i < 3; i++) {
      wait(s);
      const a = chaser(s, 0).pos;
      const b = chaser(s, 1).pos;
      expect(a).not.toEqual(b);
    }
    // The second chaser queues up behind the first instead of passing through it.
    expect(chaser(s, 1).pos.x).toBeGreaterThan(chaser(s, 0).pos.x);

    // The Bloodstone (enemy 1) cuts the corridor: the chaser (enemy 2) cannot get to the player.
    const blocked = game(strip('@x..c......!'));
    chaser(blocked, 1).memory.mode = ChaseMode.Hunt;
    for (let i = 0; i < 5; i++) wait(blocked);
    expect(chaser(blocked, 1).pos).toEqual({ x: 5, y: 1 });
    expect(blocked.lives).toBe(3);
  });
});

describe('giving up and going home', () => {
  // A Bloodstone between them keeps the chaser from reaching the player, who is out of its sight.
  const FAR = strip('@x..............c..!'); // enemy 1 is the Bloodstone, enemy 2 the chaser (home at x = 17)

  it(`after ${CHASER_GIVE_UP_TURNS} turns without sight it walks home and idles`, () => {
    const s = game(FAR);
    const c = chaser(s, 1);
    c.pos = { x: 15, y: 1 }; // 2 tiles from home
    c.cells = [{ ...c.pos }];
    c.memory.mode = ChaseMode.Hunt;

    for (let i = 0; i < CHASER_GIVE_UP_TURNS - 1; i++) wait(s);
    expect(c.memory.mode).toBe(ChaseMode.Hunt);
    wait(s);
    expect(c.memory.mode).toBe(ChaseMode.Return);

    for (let i = 0; i < 3; i++) wait(s);
    expect(c.pos).toEqual({ x: 17, y: 1 });
    expect(c.memory.mode).toBe(ChaseMode.Idle);
    expect(glyphForCell(c, 0)).toBe('c');
  });

  it('seeing the player on the way home starts the hunt again', () => {
    const s = game(strip('@.....c.......!'));
    const c = chaser(s);
    c.memory.mode = ChaseMode.Return;
    c.pos = { x: 3, y: 1 };
    c.cells = [{ ...c.pos }];
    wait(s);
    expect(c.memory.mode).toBe(ChaseMode.Hunt);
  });
});

describe('after the player respawns', () => {
  it(`goes home and ignores the player for ${CHASER_COOLDOWN_TURNS} turns`, () => {
    const s = game(strip('@..c...........!'));
    const c = chaser(s);
    c.pos = { x: 6, y: 1 };
    c.cells = [{ ...c.pos }];
    c.memory.mode = ChaseMode.Hunt;

    loseLife(s);
    expect(c.pos).toEqual({ x: 4, y: 1 });
    expect(c.memory).toMatchObject({ mode: ChaseMode.Idle, cool: CHASER_COOLDOWN_TURNS });

    for (let i = 0; i < CHASER_COOLDOWN_TURNS; i++) {
      wait(s);
      expect(c.memory.mode).toBe(ChaseMode.Idle);
      expect(c.pos).toEqual({ x: 4, y: 1 });
    }
    wait(s); // the cool-down is over: it sees the player, 3 tiles away
    expect(c.memory.mode).toBe(ChaseMode.Hunt);
  });
});
