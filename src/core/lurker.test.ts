import { describe, expect, it } from 'vitest';
import { BEHAVIORS } from './behaviors';
import { enemiesOf, enemyAt } from './enemies';
import { ENEMY_DEFS, fixedTiles, spawnReach } from './enemy-defs';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { applyAction } from './turn';

// The lurker is the first tile of a dead end below the corridor tile (4,1); (4,3) is the pocket.
// The corridor is longer than a niche pocket may be, so it counts as the way out.
const MAP = ['#############', '#@.........!#', '####l########', '####.########', '#############'];
const R = { x: 4, y: 1 };

function game(map: string[] = MAP): GameState {
  return createGameState('LUR', parseMap(map), { sightRadius: 8 });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const lurker = (s: GameState) => enemiesOf(s)[0]!;
const east = (s: GameState, n = 1) => {
  const all: { type: string }[] = [];
  for (let i = 0; i < n; i++) all.push(...applyAction(s, { type: 'move', dir: 'E' }));
  return all;
};

describe('lurkers in maps and defs', () => {
  it("is written 'l' and round-trips", () => {
    const map = parseMap(MAP);
    expect(map.spawns).toEqual([{ type: 'lurker', pos: { x: 4, y: 2 } }]);
    expect(serializeMap(map)).toEqual(MAP);
  });

  it('is a body that reserves its dead end, and no stopping beside it', () => {
    const s = game();
    const spawn = s.floor.spawns[0]!;
    expect(ENEMY_DEFS.lurker.minFloor).toBe(52);
    expect(ENEMY_DEFS.lurker.maxPerFloor(60)).toBe(2);
    expect(spawnReach(spawn, s.floor)).toEqual([
      { x: 4, y: 2 },
      { x: 4, y: 3 },
    ]);
    expect(fixedTiles(spawn)).toEqual([{ x: 4, y: 2 }]);
    expect(ENEMY_DEFS.lurker.noStop?.(spawn, s.floor)).toEqual([R, { x: 4, y: 3 }]);
  });
});

describe('the lurk behaviour', () => {
  it('is hidden and invisible to the sighting rules until you end a turn beside it', () => {
    const s = game();
    expect(BEHAVIORS.lurk.hidden?.(lurker(s))).toBe(true);
    const events = east(s, 2); // (3,1): diagonal to it, not beside it
    expect(types(events)).not.toContain('enemySighted');
    expect(types(events)).not.toContain('enemyRevealed');
    expect(BEHAVIORS.lurk.hidden?.(lurker(s))).toBe(true);
  });

  it('shows itself and marks its surroundings the turn you arrive beside it', () => {
    const s = game();
    const events = east(s, 3); // onto (4,1)
    expect(s.player.pos).toEqual(R);
    expect(types(events)).toContain('enemyRevealed');
    expect(types(events)).toContain('enemyAlerted');
    expect(BEHAVIORS.lurk.hidden?.(lurker(s))).toBe(false);
    expect(
      lurker(s)
        .warn.map((c) => `${c.x},${c.y}`)
        .sort(),
    ).toEqual(['4,1', '4,3']);
    expect(s.lives).toBe(3); // a telegraph never hurts
  });

  it('is safe to dash past: it never strikes a player who keeps moving', () => {
    const s = game();
    const events = east(s, 6);
    expect(s.player.pos).toEqual({ x: 7, y: 1 });
    expect(types(events)).not.toContain('lifeLost');
    expect(s.lives).toBe(3);
  });

  it('is safe to step back, and to step away and return', () => {
    const s = game();
    east(s, 3);
    expect(types(applyAction(s, { type: 'move', dir: 'W' }))).not.toContain('lifeLost');
    const again = applyAction(s, { type: 'move', dir: 'E' }); // beside it again
    expect(types(again)).toContain('enemyAlerted');
    expect(types(again)).not.toContain('enemyRevealed'); // only the first time
    expect(s.lives).toBe(3);
  });

  it('strikes a player who stays a second turn beside it', () => {
    const s = game();
    east(s, 3);
    const events = applyAction(s, { type: 'wait' });
    expect(types(events)).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.lives).toBe(2);
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
  });

  it('costs a life to walk into, even while it is still hidden', () => {
    const s = game();
    east(s, 3);
    expect(enemyAt(s, { x: 4, y: 2 })).toBe(lurker(s));
    const events = applyAction(s, { type: 'move', dir: 'S' });
    expect(types(events)).toContain('hitEnemy');
    expect(types(events)).toContain('lifeLost');
  });

  it('stays revealed after a respawn but forgets what it was about to do', () => {
    const s = game();
    east(s, 3);
    loseLife(s);
    expect(BEHAVIORS.lurk.hidden?.(lurker(s))).toBe(false);
    expect(lurker(s).warn).toEqual([]);
    expect(lurker(s).cells).toEqual([{ x: 4, y: 2 }]);
    expect(s.lives).toBe(2);
  });
});
