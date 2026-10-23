import { describe, expect, it } from 'vitest';
import { WANDER_KEEP_HEADING, WANDER_LEASH, WANDER_PAUSE, WANDER_START_BUFFER } from './behaviors';
import { enemiesOf, glyphForCell } from './enemies';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('WAN', parseMap(map), { sightRadius: 8, ...opts });
}

const wait = (s: GameState) => applyAction(s, { type: 'wait' });
const wanderer = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;

/** An open room `w` x `h` with the player in the top-left corner and the exit at the bottom-right. */
function room(w: number, h: number, at: { x: number; y: number }): string[] {
  const rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x): string =>
      x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.',
    ),
  );
  rows[1]![1] = '@';
  rows[h - 2]![w - 2] = '!';
  rows[at.y]![at.x] = 'r';
  return rows.map((r) => r.join(''));
}

/** Waits `n` turns and returns where the wanderer was after each one. */
function walk(s: GameState, n: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < n; i++) {
    wait(s);
    seen.push(`${wanderer(s).pos.x},${wanderer(s).pos.y}`);
  }
  return seen;
}

describe('wanderers in maps', () => {
  it("parses 'r' as a wanderer and writes it back; glyph r, alternative e", () => {
    const map = room(9, 7, { x: 5, y: 3 });
    expect(parseMap(map).spawns).toEqual([{ type: 'wanderer', pos: { x: 5, y: 3 } }]);
    expect(serializeMap(parseMap(map))).toEqual(map);
    const s = game(map);
    expect(glyphForCell(wanderer(s), 0)).toBe('r');
    expect(glyphForCell(wanderer(s), 0, true)).toBe('e');
  });
});

describe('wanderer movement', () => {
  const MAP = room(41, 41, { x: 20, y: 20 });

  it('acts on every second turn only: it never moves on the first of two', () => {
    const s = game(MAP);
    const home = { ...wanderer(s).pos };
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < 40; i++) {
      wait(s);
      positions.push({ ...wanderer(s).pos });
    }
    // Turns 1, 3, 5 ... are idle: the position equals the one before.
    for (let i = 0; i < positions.length; i += 2) {
      const before = i === 0 ? home : positions[i - 1];
      expect(positions[i]).toEqual(before);
    }
    expect(positions.at(-1)).not.toEqual(home);
  });

  it('pauses about a quarter of the turns it could move', () => {
    const s = game(MAP);
    let active = 0;
    let paused = 0;
    for (let i = 0; i < 4000; i++) {
      const before = { ...wanderer(s).pos };
      wait(s);
      if (i % 2 === 1) {
        active++;
        if (wanderer(s).pos.x === before.x && wanderer(s).pos.y === before.y) paused++;
      }
    }
    expect(paused / active).toBeGreaterThan(WANDER_PAUSE - 0.07);
    expect(paused / active).toBeLessThan(WANDER_PAUSE + 0.07);
  });

  it('mostly keeps its heading, but does turn', () => {
    const s = game(MAP);
    let steps = 0;
    let straight = 0;
    let last: { x: number; y: number } | null = null;
    let prev = { ...wanderer(s).pos };
    for (let i = 0; i < 4000; i++) {
      wait(s);
      const now = { ...wanderer(s).pos };
      if (now.x === prev.x && now.y === prev.y) continue;
      const d = { x: now.x - prev.x, y: now.y - prev.y };
      if (last) {
        steps++;
        if (d.x === last.x && d.y === last.y) straight++;
      }
      last = d;
      prev = now;
    }
    // Keeping the heading 70% of the time, plus the chance the random pick is the same one.
    expect(straight / steps).toBeGreaterThan(WANDER_KEEP_HEADING - 0.1);
    expect(straight / steps).toBeLessThan(0.95);
  });

  it('never goes beyond its leash from home', () => {
    const s = game(MAP);
    const home = { x: 20, y: 20 };
    let far = 0;
    for (let i = 0; i < 6000; i++) {
      wait(s);
      const d = Math.abs(wanderer(s).pos.x - home.x) + Math.abs(wanderer(s).pos.y - home.y);
      expect(d).toBeLessThanOrEqual(WANDER_LEASH);
      far = Math.max(far, d);
    }
    expect(far).toBeGreaterThan(WANDER_LEASH - 4); // it does use the room
  });

  it('never steps near the start or onto the exit', () => {
    const s = game(room(15, 9, { x: 6, y: 3 }));
    const exit = s.floor.exit;
    for (let i = 0; i < 4000; i++) {
      wait(s);
      const { x, y } = wanderer(s).pos;
      expect(Math.abs(x - s.floor.start.x) + Math.abs(y - s.floor.start.y)).toBeGreaterThan(
        WANDER_START_BUFFER,
      );
      expect(x === exit.x && y === exit.y).toBe(false);
    }
    expect(s.lives).toBe(3); // so a player standing at the start is never touched
  });

  it('does not walk through other enemies', () => {
    const s = game(['########', '#@.r.x.#', '######!#']);
    const home = enemiesOf(s)[0]?.type === 'wanderer' ? wanderer(s) : (enemiesOf(s)[1] as Enemy);
    for (let i = 0; i < 400; i++) {
      wait(s);
      expect(home.pos.x).toBeLessThan(5);
    }
  });
});

describe('determinism', () => {
  const MAP = room(41, 41, { x: 20, y: 20 });

  it('the same seed walks the same way', () => {
    expect(walk(game(MAP), 200)).toEqual(walk(game(MAP), 200));
  });

  it('after a respawn the walk is the same whatever came before (the stream is re-seeded)', () => {
    const a = game(MAP);
    const b = game(MAP);
    walk(a, 7);
    walk(b, 30);
    loseLife(a);
    loseLife(b);
    expect(a.attempt).toBe(b.attempt);
    expect(wanderer(a).pos).toEqual({ x: 20, y: 20 }); // back home, heading cleared
    expect(walk(a, 100)).toEqual(walk(b, 100));
  });
});
