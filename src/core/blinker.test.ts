import { describe, expect, it } from 'vitest';
import { BEHAVIORS, BLINK_START_BUFFER } from './behaviors';
import { BLINKER_INTERVAL, BLINKER_LEASH, BLINKER_WARN_TURNS } from './enemy-defs';
import { enemiesOf, glyphForCell } from './enemies';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('BLK', parseMap(map), { sightRadius: 8, ...opts });
}

const wait = (s: GameState) => applyAction(s, { type: 'wait' });
const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const blinker = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;
const at = (e: Enemy): string => `${e.pos.x},${e.pos.y}`;

/** An open room `w` x `h`: the player top-left, the exit bottom-right, a blinker at `home`. */
function room(w: number, h: number, home: { x: number; y: number }): string[] {
  const rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x): string =>
      x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.',
    ),
  );
  rows[1]![1] = '@';
  rows[h - 2]![w - 2] = '!';
  rows[home.y]![home.x] = 'k';
  return rows.map((r) => r.join(''));
}

const BIG = room(31, 31, { x: 15, y: 15 });

describe('blinkers in maps', () => {
  it("parses 'k' and writes it back; glyph k, alternative j, landing mark ?", () => {
    const map = room(9, 7, { x: 5, y: 3 });
    expect(parseMap(map).spawns).toEqual([{ type: 'blinker', pos: { x: 5, y: 3 } }]);
    expect(serializeMap(parseMap(map))).toEqual(map);
    const s = game(map);
    expect(glyphForCell(blinker(s), 0)).toBe('k');
    expect(glyphForCell(blinker(s), 0, true)).toBe('j');
    expect(BEHAVIORS.blink.warnGlyph).toBe('?');
  });
});

describe('the jump', () => {
  it(`announces the landing ${BLINKER_WARN_TURNS} turns ahead, then jumps there every ${BLINKER_INTERVAL} turns`, () => {
    const s = game(BIG);
    const home = at(blinker(s));
    let announced: string | null = null;
    for (let k = 1; k <= 3 * BLINKER_INTERVAL; k++) {
      wait(s);
      const phase = k % BLINKER_INTERVAL;
      const warn = blinker(s).warn;
      if (phase === BLINKER_INTERVAL - BLINKER_WARN_TURNS || phase === BLINKER_INTERVAL - 1) {
        expect(warn).toHaveLength(1);
        const w = `${warn[0]?.x},${warn[0]?.y}`;
        if (phase === BLINKER_INTERVAL - BLINKER_WARN_TURNS) announced = w;
        else expect(w).toBe(announced); // still the same tile one turn later
      } else {
        expect(warn).toEqual([]);
      }
      if (phase === 0) {
        expect(at(blinker(s))).toBe(announced); // it lands exactly where it said
        expect(blinker(s).cells).toEqual([blinker(s).pos]);
      } else if (k < BLINKER_INTERVAL) {
        expect(at(blinker(s))).toBe(home); // it sits still between jumps
      }
    }
  });

  it('fires enemyAlerted when the landing is announced in view, once per jump', () => {
    const s = game(BIG);
    const alerts: number[] = [];
    for (let k = 1; k <= 3 * BLINKER_INTERVAL; k++) {
      if (types(wait(s)).includes('enemyAlerted')) alerts.push(k);
    }
    // The room is lit around the player only; the blinker is 14 tiles away, so nothing is seen.
    expect(alerts).toEqual([]);
    const close = game(room(15, 9, { x: 6, y: 4 }));
    const seen: number[] = [];
    for (let k = 1; k <= 3 * BLINKER_INTERVAL; k++) {
      if (types(wait(close)).includes('enemyAlerted')) seen.push(k);
    }
    expect(seen).toEqual([6, 14, 22]);
  });

  it('stays inside its leash and off the exit, the start area and other enemies', () => {
    // Home near the start, and a bloodstone right beside it; the exit is within reach of a second one.
    const near = game(room(21, 9, { x: 7, y: 3 }));
    const stone = game(
      room(21, 9, { x: 10, y: 4 }).map((row, y) =>
        y === 4 ? `${row.slice(0, 11)}x${row.slice(12)}` : row,
      ),
    );
    const exitSide = game(room(21, 9, { x: 17, y: 5 }));
    for (const s of [near, stone, exitSide]) {
      const b = enemiesOf(s).find((e) => e.type === 'blinker') as Enemy;
      const home = { ...b.pos };
      const start = s.floor.start;
      for (let k = 1; k <= 150 * BLINKER_INTERVAL; k++) {
        wait(s);
        const { x, y } = b.pos;
        expect(Math.abs(x - home.x) + Math.abs(y - home.y)).toBeLessThanOrEqual(BLINKER_LEASH);
        expect(Math.abs(x - start.x) + Math.abs(y - start.y)).toBeGreaterThan(BLINK_START_BUFFER);
        expect(x === s.floor.exit.x && y === s.floor.exit.y).toBe(false);
        for (const other of enemiesOf(s)) {
          if (other !== b) expect(other.cells.some((c) => c.x === x && c.y === y)).toBe(false);
        }
      }
      expect(s.lives).toBe(3);
    }
  });

  it('costs a life if the player stands on the announced tile when it lands', () => {
    const s = game(BIG);
    for (let k = 1; k <= BLINKER_INTERVAL - BLINKER_WARN_TURNS; k++) wait(s);
    const target = blinker(s).warn[0];
    expect(target).toBeDefined();
    if (!target) return;
    s.player.pos = { ...target }; // as if the player had walked there and ignored the warning
    s.trail = [{ ...target }];
    wait(s); // turn 7: still announced, nothing happens
    expect(s.lives).toBe(3);
    const events = wait(s); // turn 8: it lands on them
    expect(types(events)).toContain('hitEnemy');
    expect(types(events)).toContain('lifeLost');
    expect(s.lives).toBe(2);
  });
});

describe('determinism and respawn', () => {
  const jumps = (s: GameState, n: number): string[] => {
    const seen: string[] = [];
    for (let k = 1; k <= n * BLINKER_INTERVAL; k++) {
      wait(s);
      if (k % BLINKER_INTERVAL === 0) seen.push(at(blinker(s)));
    }
    return seen;
  };

  it('the same seed blinks the same way', () => {
    expect(jumps(game(BIG), 12)).toEqual(jumps(game(BIG), 12));
  });

  it('a respawn puts it back home and every attempt blinks identically', () => {
    const a = game(BIG);
    const b = game(BIG);
    jumps(a, 2);
    jumps(b, 5);
    loseLife(a);
    loseLife(b);
    expect(at(blinker(a))).toBe('15,15');
    expect(blinker(a).warn).toEqual([]);
    expect(a.attempt).toBe(b.attempt);
    expect(jumps(a, 8)).toEqual(jumps(b, 8));
  });
});
