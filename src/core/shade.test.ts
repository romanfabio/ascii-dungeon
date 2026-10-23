import { describe, expect, it } from 'vitest';
import { BEHAVIORS, DriftMode } from './behaviors';
import { BLIND_TURNS, resolveContact } from './contact';
import { SHADE_GIVE_UP_TURNS, SHADE_NOTICE_DISTANCE, SHADE_PERIOD } from './enemy-defs';
import { enemiesOf, glyphForCell } from './enemies';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { BLIND_SIGHT, effectiveSight, updateVisibility } from './fov';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('SHD', parseMap(map), { sightRadius: 8, ...opts });
}

const strip = (row: string): string[] => {
  const wall = '#'.repeat(row.length + 2);
  return [wall, `#${row}#`, wall];
};

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const shade = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;
const mode = (s: GameState): number => shade(s).memory.mode as number;
const east = (s: GameState) => applyAction(s, { type: 'move', dir: 'E' });
const wait = (s: GameState) => applyAction(s, { type: 'wait' });

// The player at x = 1, the shade at x = 12 in a long corridor.
const CORRIDOR = strip('@..........u..............!');

describe('shades in maps', () => {
  it("parses 'u' and writes it back; glyph u (v in the colourblind theme), its own colour", () => {
    expect(parseMap(CORRIDOR).spawns).toEqual([{ type: 'shade', pos: { x: 12, y: 1 } }]);
    expect(serializeMap(parseMap(CORRIDOR))).toEqual(CORRIDOR);
    const s = game(CORRIDOR);
    expect(glyphForCell(shade(s), 0)).toBe('u');
    expect(glyphForCell(shade(s), 0, true)).toBe('v');
    expect(BEHAVIORS.drift.tone?.(shade(s))).toBe('shade');
  });
});

describe('drifting', () => {
  it(`feels you within ${SHADE_NOTICE_DISTANCE} walking steps, even without line of sight`, () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 5; i++) wait(s);
    expect(mode(s)).toBe(DriftMode.Idle); // eleven steps away
    // Walls count, sight does not: six steps away round a corner it feels you.
    const bend = game(['#######', '#@#u###', '#.#.###', '#...###', '#####!#', '#######']);
    expect(shade(bend).type).toBe('shade');
    expect(bend.visible[1 * bend.floor.width + 3]).toBe(0);
    const events = wait(bend);
    expect(mode(bend)).toBe(DriftMode.Drift);
    expect(types(events)).not.toContain('enemyAlerted'); // out of the player's view
  });

  it('drifts one tile every second turn', () => {
    const s = game(strip('@.....u..........!'));
    const xs: number[] = [];
    for (let i = 0; i < 6; i++) {
      wait(s);
      xs.push(shade(s).pos.x);
    }
    expect(SHADE_PERIOD).toBe(2);
    // Noticed at once; moves on turns 2, 4 and 6 only.
    expect(xs).toEqual([7, 6, 6, 5, 5, 4]);
  });

  it('announces itself when it notices you in view', () => {
    const s = game(strip('@.....u..........!'));
    expect(types(wait(s))).toContain('enemyAlerted');
  });

  it(`gives up after ${SHADE_GIVE_UP_TURNS} turns without you close, drifts home and idles`, () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 6; i++) east(s); // x = 7, five steps away
    wait(s);
    expect(mode(s)).toBe(DriftMode.Drift);
    s.player.pos = { x: 25, y: 1 }; // far away now
    s.trail = [{ x: 25, y: 1 }];
    updateVisibility(s);
    for (let i = 0; i < SHADE_GIVE_UP_TURNS; i++) wait(s);
    expect(mode(s)).toBe(DriftMode.Return);
    for (let i = 0; i < 40 && mode(s) !== DriftMode.Idle; i++) wait(s);
    expect(mode(s)).toBe(DriftMode.Idle);
    expect(shade(s).pos).toEqual({ x: 12, y: 1 });
  });
});

describe('touching it', () => {
  it('blinds without costing a life, and the shade vanishes', () => {
    const s = game(strip('@u....!'));
    const events = east(s);
    expect(types(events)).toEqual(['hitEnemy', 'blinded']);
    expect(s.lives).toBe(3);
    expect(s.blindTurns).toBe(BLIND_TURNS);
    expect(effectiveSight(s)).toBe(BLIND_SIGHT);
    expect(shade(s).cells).toEqual([]);
    expect(shade(s).memory.gone).toBe(1);
    // Nothing is left to block the tile it stood on.
    expect(types(east(s))).toEqual(['moved']);
    expect(s.player.pos.x).toBe(2);
  });

  it('a shade drifting onto you blinds you too', () => {
    const s = game(strip('@..u...!'));
    let blinded = false;
    for (let i = 0; i < 6 && !blinded; i++) blinded = types(wait(s)).includes('blinded');
    expect(blinded).toBe(true);
    expect(s.lives).toBe(3);
  });

  it('a second touch while blind refreshes the timer but never shrinks the view further', () => {
    const s = game(strip('@u...............u..!'));
    east(s); // the first shade
    for (let i = 0; i < 10; i++) wait(s);
    expect(s.blindTurns).toBeLessThan(BLIND_TURNS);
    const second = enemiesOf(s)[1] as Enemy;
    resolveContact(s, second);
    expect(s.blindTurns).toBe(BLIND_TURNS);
    expect(effectiveSight(s)).toBe(BLIND_SIGHT);
    expect(s.lives).toBe(3);
  });

  it('a respawn brings it back at home, and clears the blindness', () => {
    const s = game(strip('@u....!'));
    east(s);
    loseLife(s);
    expect(s.blindTurns).toBe(0);
    expect(shade(s).memory.gone).toBe(0);
    expect(shade(s).cells).toEqual([{ x: 2, y: 1 }]);
    expect(shade(s).blocksMovement).toBe(true);
    expect(mode(s)).toBe(DriftMode.Idle);
  });
});
