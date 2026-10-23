import { describe, expect, it } from 'vitest';
import { BEHAVIORS, MIMIC_REVEAL_DISTANCE } from './behaviors';
import { enemiesOf, glyphForCell } from './enemies';
import { type Enemy } from './entity';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { applyAction } from './turn';

function game(map: string[], opts = {}): GameState {
  return createGameState('MIM', parseMap(map), { sightRadius: 8, ...opts });
}

const strip = (row: string): string[] => {
  const wall = '#'.repeat(row.length + 2);
  return [wall, `#${row}#`, wall];
};

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const mimic = (s: GameState): Enemy => enemiesOf(s)[0] as Enemy;
const east = (s: GameState) => applyAction(s, { type: 'move', dir: 'E' });
const west = (s: GameState) => applyAction(s, { type: 'move', dir: 'W' });
const wait = (s: GameState) => applyAction(s, { type: 'wait' });

// The player at x = 1, the mimic at x = 8, the corridor goes on past it.
const CORRIDOR = strip('@......m...!');

describe('mimics in maps', () => {
  it("parses 'm' and writes it back", () => {
    const map = parseMap(CORRIDOR);
    expect(map.spawns).toEqual([{ type: 'mimic', pos: { x: 8, y: 1 } }]);
    expect(serializeMap(map)).toEqual(CORRIDOR);
  });

  it('is drawn as a life pickup (+, in the pickup tones) while disguised', () => {
    const s = game(CORRIDOR);
    expect(glyphForCell(mimic(s), 0)).toBe('+');
    expect(glyphForCell(mimic(s), 0, true)).toBe('+');
    expect(BEHAVIORS.ambush.tone?.(mimic(s))).toBe('pickup');
  });
});

describe('reveal', () => {
  it(`happens at walking distance ${MIMIC_REVEAL_DISTANCE} in view, not before`, () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 4; i++) expect(types(east(s))).not.toContain('enemyRevealed'); // x = 5
    expect(mimic(s).memory.st).toBe(0);
    const events = east(s); // x = 6, two tiles away
    expect(events).toContainEqual({ type: 'enemyRevealed', enemyId: mimic(s).id });
    expect(glyphForCell(mimic(s), 0)).toBe('M');
    expect(glyphForCell(mimic(s), 0, true)).toBe('W');
    expect(BEHAVIORS.ambush.tone?.(mimic(s))).toBe('alert');
    // It is announced once.
    expect(types(wait(s))).not.toContain('enemyRevealed');
  });

  it('needs line of sight: a wall between two close tiles does not reveal it', () => {
    const s = game(['#####', '#@#m#', '#.!.#', '#####']);
    expect(mimic(s).type).toBe('mimic');
    // Two tiles apart as the crow flies, four steps by foot, and the wall blocks the view.
    for (const action of ['wait', 'wait'] as const) {
      expect(types(applyAction(s, { type: action }))).not.toContain('enemyRevealed');
    }
    expect(mimic(s).memory.st).toBe(0);
  });

  it('stepping onto a disguised mimic is an ordinary contact', () => {
    const s = game(strip('@m...!'));
    const events = east(s);
    expect(types(events)).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.lives).toBe(2);
  });
});

describe('the strike', () => {
  /** A player standing 2 tiles from the mimic, which has just been revealed. */
  function revealed(): GameState {
    const s = game(CORRIDOR);
    for (let i = 0; i < 5; i++) east(s);
    expect(mimic(s).memory.st).toBe(1);
    return s;
  }

  it('warns when the player ends a turn next to it, marking the tiles it will strike', () => {
    const s = revealed();
    expect(mimic(s).warn).toEqual([]);
    const events = east(s); // adjacent, x = 7
    expect(events).toContainEqual({ type: 'enemyAlerted', enemyId: mimic(s).id });
    expect(mimic(s).warn).toEqual([
      { x: 9, y: 1 },
      { x: 7, y: 1 },
    ]);
    expect(s.lives).toBe(3); // a warning never hurts
  });

  it('stepping back after the warning is always safe', () => {
    const s = revealed();
    east(s);
    const events = west(s);
    expect(types(events)).not.toContain('lifeLost');
    expect(mimic(s).warn).toEqual([]);
    expect(s.lives).toBe(3);
    // And it can be repeated: approach, retreat, approach, retreat.
    for (let i = 0; i < 3; i++) {
      east(s);
      west(s);
    }
    expect(s.lives).toBe(3);
  });

  it('strikes a player who stays next to it for another turn', () => {
    const s = revealed();
    east(s);
    const events = wait(s);
    expect(types(events)).toContain('hitEnemy');
    expect(types(events)).toContain('lifeLost');
    expect(s.lives).toBe(2);
    expect(s.player.pos).toEqual(s.floor.start);
  });

  it('does not strike a player who is two tiles away, and warns nobody', () => {
    const s = revealed();
    for (let i = 0; i < 6; i++) wait(s);
    expect(s.lives).toBe(3);
    expect(mimic(s).warn).toEqual([]);
  });

  it('a strike covers its own tile and the open tiles around it for that turn', () => {
    const s = revealed();
    east(s);
    // Peek at the cells the strike lays out, without the respawn that follows a hit.
    const lone = game(CORRIDOR);
    const m = mimic(lone);
    m.memory.st = 1;
    m.memory.warned = 1;
    lone.player.pos = { x: 7, y: 1 };
    BEHAVIORS.ambush.act(m, lone, lone.enemyRng);
    expect(m.cells.map((c) => c.x).sort((a, b) => a - b)).toEqual([7, 8, 9]);
    expect(glyphForCell(m, 0)).toBe('M');
    expect(glyphForCell(m, 1)).toBe('*');
  });
});

describe('respawn', () => {
  it('puts the mimic back in its disguise', () => {
    const s = game(CORRIDOR);
    for (let i = 0; i < 5; i++) east(s);
    east(s);
    wait(s); // struck, respawned
    expect(s.lives).toBe(2);
    expect(mimic(s).memory.st).toBe(0);
    expect(mimic(s).cells).toEqual([{ x: 8, y: 1 }]);
    expect(mimic(s).warn).toEqual([]);
    expect(glyphForCell(mimic(s), 0)).toBe('+');
  });
});
