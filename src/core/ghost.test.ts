import { describe, expect, it } from 'vitest';
import { BEHAVIORS, HauntMode } from './behaviors';
import { enemiesOf } from './enemies';
import { ENEMY_DEFS, GHOST_GIVE_UP_TURNS, GHOST_NOTICE_DISTANCE, GHOST_PERIOD } from './enemy-defs';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

// The player starts in the top corridor; the ghost sleeps in the bottom one, behind two walls.
const MAP = [
  '####################',
  '#@................!#',
  '##################.#',
  '##################.#',
  '##################.#',
  '#........g.........#',
  '####################',
];
const HOME = { x: 9, y: 5 };

function game(map: string[] = MAP): GameState {
  return createGameState('GHO', parseMap(map), { sightRadius: 3 });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const ghost = (s: GameState) => enemiesOf(s)[0]!;
const wait = (s: GameState, n = 1) => {
  const all: { type: string }[] = [];
  for (let i = 0; i < n; i++) all.push(...applyAction(s, { type: 'wait' }));
  return all;
};
const east = (s: GameState) => applyAction(s, { type: 'move', dir: 'E' });
/** Puts the player on a tile (a test shortcut) without taking a turn. */
function place(s: GameState, x: number, y: number): void {
  s.player.pos = { x, y };
}

describe('ghosts in maps and defs', () => {
  it("is written 'g' and round-trips", () => {
    const map = parseMap(MAP);
    expect(map.spawns).toEqual([{ type: 'ghost', pos: HOME }]);
    expect(serializeMap(map)).toEqual(MAP);
  });

  it('has the agreed numbers', () => {
    const def = ENEMY_DEFS.ghost;
    expect([def.minFloor, def.cost, def.routeBuffer, def.homeDistance]).toEqual([65, 3, 8, 12]);
    expect([64, 89, 90, 100].map((f) => def.maxPerFloor(f))).toEqual([1, 1, 2, 2]);
    expect([GHOST_NOTICE_DISTANCE, GHOST_PERIOD, GHOST_GIVE_UP_TURNS]).toEqual([7, 2, 12]);
  });
});

describe('the haunt behaviour', () => {
  it('stays idle while you are out of range, however near by walking or by sight', () => {
    const s = game();
    const events = wait(s, 6);
    expect(types(events)).not.toContain('enemyAlerted');
    expect(ghost(s).pos).toEqual(HOME);
    expect(ghost(s).memory.mode).toBe(HauntMode.Idle);
  });

  it('feels you through the walls at a straight-line distance of 7, and says so even unseen', () => {
    const s = game();
    let alertedAt = -1;
    for (let step = 1; step <= 8; step++) {
      const events = east(s);
      const dx = HOME.x - s.player.pos.x;
      const dy = HOME.y - s.player.pos.y;
      if (types(events).includes('enemyAlerted')) {
        alertedAt = step;
        expect(dx * dx + dy * dy).toBeLessThanOrEqual(49);
        break;
      }
      expect(dx * dx + dy * dy).toBeGreaterThan(49);
    }
    expect(alertedAt).toBeGreaterThan(0);
    expect(s.visible[HOME.y * s.floor.width + HOME.x]).not.toBe(1); // it is behind rock: unseen
    expect(ghost(s).memory.mode).toBe(HauntMode.Hunt);
  });

  it('drifts one tile every second turn straight at you, through rock', () => {
    const s = game();
    place(s, 9, 1); // straight above it, 4 tiles of rock and corridor between
    wait(s); // turn 1: it notices (and does not move yet)
    const trace: string[] = [];
    for (let i = 0; i < 4; i++) {
      wait(s);
      trace.push(`${ghost(s).pos.x},${ghost(s).pos.y}`);
    }
    // It notices on turn 1 and then moves on every second turn: 2 and 4 of these.
    expect(trace).toEqual(['9,4', '9,4', '9,3', '9,3']);
    // It went through the wall at (9,4) and (9,3): both are rock.
    expect(s.floor.tiles[3 * s.floor.width + 9]).toBe(0);
  });

  it('moves along the longer axis first, and on a tie along x', () => {
    const s = game();
    place(s, 5, 1); // dx = -4, dy = -4 from home: a tie
    wait(s);
    wait(s); // its first step
    expect(ghost(s).pos).toEqual({ x: 8, y: 5 });
    place(s, 8, 1); // now dx = 0, dy = -4: along y
    wait(s);
    wait(s);
    expect(ghost(s).pos).toEqual({ x: 8, y: 4 });
  });

  it('hurts when it reaches a player who waits in range, and only then', () => {
    const s = game();
    place(s, 9, 1);
    let lost = false;
    for (let i = 0; i < 20 && !lost; i++) lost = types(wait(s)).includes('lifeLost');
    expect(lost).toBe(true);
    expect(s.lives).toBe(2);
  });

  it('gives up 12 turns after you leave its range, then drifts home and idles', () => {
    // A long map, so that the player can really be out of reach while it drifts after them.
    const wide = 60;
    const top = '#@' + '.'.repeat(wide - 4) + '!#';
    const wall = '#'.repeat(wide);
    const bottom = '#' + '.'.repeat(8) + 'g' + '.'.repeat(wide - 11) + '#';
    const s = game([top, wall, wall, wall, wall, bottom, wall]);
    expect(s.floor.spawns[0]?.pos).toEqual({ x: 9, y: 5 });
    place(s, 9, 1);
    wait(s, 4); // hunting, it has moved off home
    expect(ghost(s).memory.mode).toBe(HauntMode.Hunt);
    place(s, 50, 1); // far away: out of range, and the ghost cannot close the gap in time
    wait(s, GHOST_GIVE_UP_TURNS - 1);
    expect(ghost(s).memory.mode).toBe(HauntMode.Hunt);
    wait(s);
    expect(ghost(s).memory.mode).toBe(HauntMode.Return);
    wait(s, 30);
    expect(ghost(s).pos).toEqual({ x: 9, y: 5 });
    expect(ghost(s).memory.mode).toBe(HauntMode.Idle);
  });

  it('is sent home idle by a respawn', () => {
    const s = game();
    place(s, 9, 1);
    wait(s, 4);
    expect(ghost(s).pos).not.toEqual(HOME);
    loseLife(s);
    expect(ghost(s).pos).toEqual(HOME);
    expect(ghost(s).memory.mode).toBe(HauntMode.Idle);
    expect(BEHAVIORS.haunt.tone?.(ghost(s))).toBeUndefined();
  });
});
