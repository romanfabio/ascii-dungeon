import { describe, expect, it } from 'vitest';
import { enemiesOf } from './enemies';
import { ENEMY_DEFS } from './enemy-defs';
import { parseMap, serializeMap } from './floor-map';
import { createGameState } from './game-state';
import { pendulumHazard } from './hazards';
import { loseLife } from './lives';
import { applyAction } from './turn';

// A lane of 5 tiles runs down x = 5 (q at the top, Q at the bottom) and crosses the corridor
// that leads from the start to the exit at (5,3). Its cycle is 8 turns.
const MAP = [
  '###########',
  '#####q#####',
  '#####.#####',
  '#@.......!#',
  '#####.#####',
  '#####Q#####',
  '###########',
];
const CROSSING = { x: 5, y: 3 };

function game(map: string[] = MAP) {
  return createGameState('PEN', parseMap(map), { sightRadius: 8 });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);

describe('Pendulum in maps', () => {
  it("is written 'q' ... 'Q' and round-trips", () => {
    const map = parseMap(MAP);
    expect(map.spawns).toEqual([{ type: 'pendulum', pos: { x: 5, y: 1 }, end: { x: 5, y: 5 } }]);
    expect(serializeMap(map)).toEqual(MAP);
    expect(serializeMap(map, { enemies: false })[1]).toBe('#####.#####');
  });

  it('is timed, unlocks on floor 48 and looks and walks like a Patroller', () => {
    const def = ENEMY_DEFS.pendulum;
    expect([def.minFloor, def.glyph, def.altGlyph, def.behavior]).toEqual([48, '&', '$', 'swing']);
    expect(def.guarantee).toBe('timing');
    expect([47, 69, 70, 100].map((f) => def.maxPerFloor(f))).toEqual([2, 2, 4, 4]);
  });
});

describe('Pendulum behaviour', () => {
  it('walks its lane one tile per turn and bounces at both ends', () => {
    const s = game();
    const [p] = enemiesOf(s);
    const ys: number[] = [];
    for (let i = 0; i < 10; i++) {
      applyAction(s, { type: 'wait' });
      ys.push(p?.pos.y as number);
    }
    expect(ys).toEqual([2, 3, 4, 5, 4, 3, 2, 1, 2, 3]);
    expect(p?.cells).toEqual([{ x: 5, y: 3 }]);
  });

  it('is on the crossing at phases 2 and 6 of its 8-turn cycle, as the hazard says', () => {
    const hazard = pendulumHazard(parseMap(MAP).spawns[0]!);
    expect(hazard.period).toBe(8);
    const onCrossing = [0, 1, 2, 3, 4, 5, 6, 7].filter((phase) =>
      hazard.hurtAt(phase).some((c) => c.x === CROSSING.x && c.y === CROSSING.y),
    );
    expect(onCrossing).toEqual([2, 6]);
  });

  it('costs a life exactly when the hazard says: the dash is only safe in some windows', () => {
    const hazard = pendulumHazard(parseMap(MAP).spawns[0]!);
    const hurts = (phase: number): boolean =>
      hazard.hurtAt(phase % 8).some((c) => c.x === CROSSING.x && c.y === CROSSING.y);
    const outcomes: boolean[] = [];
    for (let wait = 0; wait < 16; wait++) {
      const s = game();
      for (let i = 0; i < wait; i++) applyAction(s, { type: 'wait' });
      let lost = false;
      for (let i = 0; i < 8 && !lost; i++) {
        lost = types(applyAction(s, { type: 'move', dir: 'E' })).includes('lifeLost');
      }
      outcomes.push(lost);
      // The player steps onto the crossing on their 4th move: it must be free right then and
      // after the pendulum's next step.
      expect(lost, `after ${wait} waits`).toBe(hurts(wait + 3) || hurts(wait + 4));
    }
    expect(outcomes[0]).toBe(false); // an immediate dash gets across
    expect(outcomes[2]).toBe(true); // two waits later it meets the pendulum on the crossing
    expect(outcomes.slice(0, 8).filter(Boolean).length).toBeGreaterThan(0);
  });

  it('is reset by a respawn: back at its starting end', () => {
    const s = game();
    const [p] = enemiesOf(s);
    for (let i = 0; i < 3; i++) applyAction(s, { type: 'wait' });
    expect(p?.pos).toEqual({ x: 5, y: 4 });
    loseLife(s);
    expect(enemiesOf(s)[0]?.pos).toEqual({ x: 5, y: 1 });
  });
});
