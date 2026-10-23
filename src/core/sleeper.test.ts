import { describe, expect, it } from 'vitest';
import { BEHAVIORS, SLEEPER_AWAKE_TURNS, SLEEPER_WAKE_DISTANCE, SleepMode } from './behaviors';
import { enemiesOf, glyphForCell } from './enemies';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { updateVisibility } from './fov';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { blockersFor } from './pathing';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('SLP', parseMap(map), { sightRadius: 8, ...opts });
}

const strip = (row: string): string[] => {
  const wall = '#'.repeat(row.length + 2);
  return [wall, `#${row}#`, wall];
};

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const sleeper = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;
const east = (s: GameState) => applyAction(s, { type: 'move', dir: 'E' });
const wait = (s: GameState) => applyAction(s, { type: 'wait' });
const mode = (s: GameState): number => sleeper(s).memory.mode as number;

// The player at x = 1, the sleeper at x = 9, in a long corridor.
const CORRIDOR = strip('@.......z....................!');

describe('sleepers in maps', () => {
  it("parses 'z' and writes it back; z asleep, Z awake (n / N in the colourblind theme)", () => {
    const map = parseMap(CORRIDOR);
    expect(map.spawns).toEqual([{ type: 'sleeper', pos: { x: 9, y: 1 } }]);
    expect(serializeMap(map)).toEqual(CORRIDOR);
    const s = game(CORRIDOR);
    expect(glyphForCell(sleeper(s), 0)).toBe('z');
    expect(glyphForCell(sleeper(s), 0, true)).toBe('n');
    expect(BEHAVIORS.sleep.dormant?.(sleeper(s))).toBe(true);
    expect(BEHAVIORS.sleep.tone?.(sleeper(s))).toBeUndefined();
  });
});

describe('waking', () => {
  it(`a move that ends within ${SLEEPER_WAKE_DISTANCE} walking steps wakes it, not before`, () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 3; i++) expect(types(east(s))).not.toContain('enemyAlerted'); // x = 4
    expect(mode(s)).toBe(SleepMode.Asleep);
    const events = east(s); // x = 5, four steps away
    expect(events).toContainEqual({ type: 'enemyAlerted', enemyId: sleeper(s).id });
    expect(mode(s)).toBe(SleepMode.Stirring);
    expect(glyphForCell(sleeper(s), 0)).toBe('Z');
    expect(BEHAVIORS.sleep.tone?.(sleeper(s))).toBe('warn');
    expect(sleeper(s).pos).toEqual({ x: 9, y: 1 }); // it has not moved yet
  });

  it('waiting is silent: standing four steps away never wakes it', () => {
    const s = game(strip('@...z....!'));
    for (let i = 0; i < 30; i++) wait(s);
    expect(mode(s)).toBe(SleepMode.Asleep);
    east(s); // a step closer is noise
    expect(mode(s)).toBe(SleepMode.Stirring);
  });

  it('walls count: close as the crow flies but far on foot does not wake it', () => {
    const s = game(['#######', '#@#z..#', '#.#.###', '#.#.###', '#...!##', '#######']);
    expect(sleeper(s).type).toBe('sleeper');
    const events = applyAction(s, { type: 'move', dir: 'S' }); // three tiles away, eight on foot
    expect(types(events)).not.toContain('enemyAlerted');
    expect(mode(s)).toBe(SleepMode.Asleep);
  });

  it('stirs for one turn before it moves', () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 4; i++) east(s);
    expect(mode(s)).toBe(SleepMode.Stirring);
    wait(s); // the next turn: awake, and it steps towards the player
    expect(mode(s)).toBe(SleepMode.Awake);
    expect(sleeper(s).pos).toEqual({ x: 8, y: 1 });
    expect(BEHAVIORS.sleep.tone?.(sleeper(s))).toBe('alert');
    expect(BEHAVIORS.sleep.dormant?.(sleeper(s))).toBe(false);
  });
});

describe('hunting and going home', () => {
  /** Wakes the sleeper, then puts the player far away so it can hunt without reaching them. */
  function awake(): GameState {
    const s = game(CORRIDOR);
    for (let i = 0; i < 4; i++) east(s);
    s.player.pos = { x: 27, y: 1 };
    s.trail = [{ x: 27, y: 1 }];
    updateVisibility(s);
    return s;
  }

  it(`hunts for ${SLEEPER_AWAKE_TURNS} turns, walks home ignoring the player, and falls asleep there`, () => {
    const s = awake();
    wait(s); // awake, first step
    const startX = sleeper(s).pos.x;
    expect(startX).toBe(10);
    for (let i = 1; i < SLEEPER_AWAKE_TURNS; i++) wait(s);
    expect(sleeper(s).pos.x).toBe(9 + SLEEPER_AWAKE_TURNS);
    expect(mode(s)).toBe(SleepMode.Returning);
    expect(glyphForCell(sleeper(s), 0)).toBe('z');
    // Walking home: one tile per turn, back to x = 9, and asleep on arrival.
    for (let i = 0; i < SLEEPER_AWAKE_TURNS - 1; i++) {
      wait(s);
      expect(mode(s)).toBe(SleepMode.Returning);
    }
    wait(s);
    expect(sleeper(s).pos).toEqual({ x: 9, y: 1 });
    expect(mode(s)).toBe(SleepMode.Asleep);
  });

  it('is announced again when it comes back into view: it is not remembered while awake', () => {
    const s = awake();
    wait(s);
    expect(sleeper(s).seen).toBe(false); // out of the player's sight and on the move
  });

  it('is put back to sleep at home by a respawn', () => {
    const s = awake();
    wait(s);
    wait(s);
    loseLife(s);
    expect(mode(s)).toBe(SleepMode.Asleep);
    expect(sleeper(s).pos).toEqual({ x: 9, y: 1 });
    expect(sleeper(s).cells).toEqual([{ x: 9, y: 1 }]);
  });

  it('touching it costs a life, asleep or awake', () => {
    const s = game(strip('@z...!'));
    expect(types(east(s))).toEqual(['hitEnemy', 'lifeLost']);
  });
});

describe('other enemies', () => {
  it('see a sleeper as a wall, like a Bloodstone', () => {
    const s = game(strip('@..c.z..!'));
    const [chaser, sl] = enemiesOf(s) as [Enemy, Enemy];
    expect(chaser.type).toBe('chaser');
    expect(blockersFor(chaser, s).has(1 * s.floor.width + sl.pos.x)).toBe(true);
  });
});
