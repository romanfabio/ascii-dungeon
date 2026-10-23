import { describe, expect, it } from 'vitest';
import { enemiesOf } from './enemies';
import { ENEMY_DEFS, SHADOW_LAG } from './enemy-defs';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { createRng } from './rng';
import { applyAction } from './turn';
import { DIRS } from './geometry';

// A long corridor with the exit just below the start, so a walk east and back is a dead end.
const CORRIDOR = [
  '###################################',
  '#@................................#',
  '#!#################################',
  ';shadow 20',
];

function game(map: string[] = CORRIDOR): GameState {
  return createGameState('SHD', parseMap(map), { sightRadius: 6 });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const shadow = (s: GameState) => enemiesOf(s).find((e) => e.type === 'shadow');
const move = (s: GameState, dir: 'E' | 'W' | 'N' | 'S', n = 1) => {
  const all: { type: string }[] = [];
  for (let i = 0; i < n; i++) all.push(...applyAction(s, { type: 'move', dir }));
  return all;
};
const wait = (s: GameState, n = 1) => {
  const all: { type: string }[] = [];
  for (let i = 0; i < n; i++) all.push(...applyAction(s, { type: 'wait' }));
  return all;
};

describe('the shadow directive', () => {
  it('is a floor flag: parsed, written back, and no spawn', () => {
    const map = parseMap(CORRIDOR);
    expect(map.directives).toEqual({ shadow: 20 });
    expect(map.spawns).toEqual([]);
    expect(serializeMap(map)).toEqual(CORRIDOR);
  });

  it('adds a shadow at the start of the floor, with the lag of the flag; none without it', () => {
    const s = game();
    expect(shadow(s)).toBeDefined();
    expect(shadow(s)?.memory.lag).toBe(20);
    expect(shadow(game(CORRIDOR.slice(0, 3)))).toBeUndefined();
    expect(shadow(game([...CORRIDOR.slice(0, 3), ';shadow 7']))?.memory.lag).toBe(7);
  });

  it('is a flag-only type: no map character, never placed by the drawing loop', () => {
    expect(ENEMY_DEFS.shadow.mapChar).toBeUndefined();
    expect(ENEMY_DEFS.shadow.placement).toBe('flag');
    expect(ENEMY_DEFS.shadow.minFloor).toBe(58);
    expect(SHADOW_LAG).toBe(20);
  });
});

describe('the shadow', () => {
  it('is absent until the trail is longer than the lag, then 20 turns behind you', () => {
    const s = game();
    move(s, 'E', 20);
    expect(shadow(s)?.cells).toEqual([]); // 20 turns: still nothing
    move(s, 'E');
    expect(shadow(s)?.cells).toEqual([{ x: 2, y: 1 }]); // on turn 21 it stands where you were after turn 1
    move(s, 'E', 3);
    expect(s.player.pos).toEqual({ x: 25, y: 1 });
    expect(shadow(s)?.cells).toEqual([{ x: 5, y: 1 }]);
    expect(s.lives).toBe(3);
  });

  it('catches a player who stands still for 21 turns, but not for 20', () => {
    const s = game();
    expect(types(wait(s, 20))).not.toContain('lifeLost');
    const events = wait(s);
    expect(types(events)).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.lives).toBe(2);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(shadow(s)?.cells).toEqual([]); // a respawn clears the trail, and the shadow with it
  });

  it('lets you walk through it, even head-on in a dead end: backtracking is never fatal', () => {
    const s = game();
    const events = [...move(s, 'E', 30), ...move(s, 'W', 30)];
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(types(events)).not.toContain('lifeLost');
    expect(types(events)).not.toContain('hitEnemy');
    expect(s.lives).toBe(3);
    expect(shadow(s)?.blocksMovement).toBe(false);
  });

  it('does not hurt a player who waits 19 turns, then moves on, and one who keeps moving', () => {
    const s = game();
    wait(s, 19);
    expect(types(move(s, 'E', 12))).not.toContain('lifeLost');
    expect(types(move(s, 'W', 12))).not.toContain('lifeLost');
    expect(s.lives).toBe(3);
  });

  it('never hurts any walk that does not wait (random walks in a room)', () => {
    const room = [
      '#############',
      '#@..........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#..........!#',
      '#############',
      ';shadow 20',
    ];
    for (let seed = 0; seed < 40; seed++) {
      const s = game(room);
      const rng = createRng(`WALK${seed}`);
      for (let turn = 0; turn < 120; turn++) {
        const dir = DIRS[rng.int(4)] as 'N' | 'E' | 'S' | 'W';
        const before = s.player.pos;
        const events = applyAction(s, { type: 'move', dir });
        if (types(events).includes('reachedExit')) break;
        // A bump takes no turn; every real move is a mover and so safe.
        expect(types(events)).not.toContain('lifeLost');
        void before;
      }
      expect(s.lives).toBe(3);
    }
  });

  it('is drawn only where the player can see it and stops auto-repeat when it comes into view', () => {
    const s = game();
    const events = move(s, 'E', 40 - 14); // the shadow trails 20 behind: well out of the sight radius
    expect(types(events)).not.toContain('enemySighted');
    // Going back towards it brings it into view.
    const back = move(s, 'W', 16);
    expect(types(back)).toContain('enemySighted');
  });

  it('is reset by a respawn', () => {
    const s = game();
    move(s, 'E', 25);
    expect(shadow(s)?.cells).toHaveLength(1);
    loseLife(s);
    expect(shadow(s)?.cells).toEqual([]);
  });
});
