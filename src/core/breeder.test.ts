import { describe, expect, it } from 'vitest';
import { enemiesOf } from './enemies';
import { BREED_INTERVAL, BREED_MAX, ENEMY_DEFS } from './enemy-defs';
import { updateVisibility } from './fov';
import { parseMap, serializeMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { loseLife } from './lives';
import { bfsDistances, shortestPath } from './pathfinding';
import { applyAction } from './turn';

// The route runs along the top; a roomy chamber below it holds the mother at (7,4).
const MAP = [
  '###############',
  '#@...........!#',
  '######.########',
  '#.............#',
  '#......b......#',
  '#.............#',
  '###############',
];

function game(map: string[] = MAP): GameState {
  return createGameState('BRE', parseMap(map), { sightRadius: 4 });
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const young = (s: GameState) => enemiesOf(s).filter((e) => e.type === 'brood');
const wait = (s: GameState, n = 1) => {
  const all: { type: string }[] = [];
  for (let i = 0; i < n; i++) all.push(...applyAction(s, { type: 'wait' }));
  return all;
};

describe('breeders in maps and defs', () => {
  it("is written 'b' and round-trips; its young have no map character", () => {
    const map = parseMap(MAP);
    expect(map.spawns).toEqual([{ type: 'breeder', pos: { x: 7, y: 4 } }]);
    expect(serializeMap(map)).toEqual(MAP);
    expect(ENEMY_DEFS.brood.mapChar).toBeUndefined();
    expect(ENEMY_DEFS.brood.placement).toBe('flag');
  });

  it('has the agreed numbers', () => {
    const def = ENEMY_DEFS.breeder;
    expect([def.minFloor, def.cost, def.homeDistance]).toEqual([72, 3, 12]);
    expect([71, 89, 90, 100].map((f) => def.maxPerFloor(f))).toEqual([1, 1, 2, 2]);
    expect([BREED_INTERVAL, BREED_MAX]).toEqual([12, 5]);
  });
});

describe('the breed behaviour', () => {
  it('adds a young one every 12 turns, beside the mother, never on the route', () => {
    const s = game();
    expect(types(wait(s, BREED_INTERVAL - 1))).not.toContain('enemySpawned');
    expect(young(s)).toHaveLength(0);
    const events = wait(s);
    expect(types(events)).toContain('enemySpawned');
    const [first] = young(s);
    expect(first).toBeDefined();
    const route = new Set(
      shortestPath(s.floor, s.floor.start, s.floor.exit).map((p) => `${p.x},${p.y}`),
    );
    const walk = bfsDistances(s.floor, { x: 7, y: 4 })[first!.pos.y * s.floor.width + first!.pos.x];
    expect(walk).toBe(1); // the nearest ring first
    expect(route.has(`${first!.pos.x},${first!.pos.y}`)).toBe(false);
    expect(first!.memory.child).toBe(1);
    expect(first!.memory.mother).toBe(enemiesOf(s)[0]!.id);
  });

  it('stops at 5 young, and they never stand on the route, the start or the exit', () => {
    const s = game();
    wait(s, BREED_INTERVAL * 12);
    expect(young(s)).toHaveLength(BREED_MAX);
    const route = new Set(
      shortestPath(s.floor, s.floor.start, s.floor.exit).map((p) => `${p.x},${p.y}`),
    );
    const seen = new Set<string>();
    for (const kid of young(s)) {
      const key = `${kid.pos.x},${kid.pos.y}`;
      expect(route.has(key)).toBe(false);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(
        bfsDistances(s.floor, { x: 7, y: 4 })[kid.pos.y * s.floor.width + kid.pos.x],
      ).toBeLessThanOrEqual(6);
    }
    expect(s.lives).toBe(3);
  });

  it('is deterministic: the same seed and turns give the same young', () => {
    const run = (): string[] => {
      const s = game();
      wait(s, BREED_INTERVAL * 5);
      return young(s).map((k) => `${k.pos.x},${k.pos.y}`);
    };
    expect(run()).toEqual(run());
  });

  it('never seals you in: a spot that would cut you off from the exit stays empty', () => {
    // A stub below the route: the mother at its end, the player in the middle of it.
    const stub = ['#########', '#@.....!#', '####.####', '####.####', '####b####', '#########'];
    const s = game(stub);
    s.player.pos = { x: 4, y: 3 };
    updateVisibility(s);
    wait(s, BREED_INTERVAL); // only (4,2) is free, and it would shut the player in
    expect(young(s)).toHaveLength(0);
    s.player.pos = { x: 4, y: 1 }; // back on the route: now the stub can be closed behind them
    updateVisibility(s);
    wait(s, BREED_INTERVAL);
    expect(young(s).map((k) => `${k.pos.x},${k.pos.y}`)).toEqual(['4,3']);
  });

  it('keeps two steps from a life pickup', () => {
    const map = ['#########', '#@.....!#', '####.####', '####.####', '####b####', '#########'];
    const s = game(map);
    s.pickups = [{ type: 'life', pos: { x: 4, y: 2 }, seen: true }];
    wait(s, BREED_INTERVAL);
    expect(young(s)).toHaveLength(0); // (4,3) touches the pickup, (4,2) is the pickup
  });

  it('shows a young one that appears in view as sighted, and a respawn removes them all', () => {
    const s = game();
    s.player.pos = { x: 5, y: 4 }; // in the chamber, 2 from the mother
    updateVisibility(s);
    wait(s, BREED_INTERVAL - 1);
    const events = wait(s);
    expect(types(events)).toContain('enemySpawned');
    expect(types(events)).toContain('enemySighted');
    expect(young(s).length).toBeGreaterThan(0);
    loseLife(s);
    expect(young(s)).toHaveLength(0);
    wait(s, BREED_INTERVAL - 1);
    expect(young(s)).toHaveLength(0); // her clock starts over
    wait(s);
    expect(young(s)).toHaveLength(1);
  });
});
