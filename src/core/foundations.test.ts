import { describe, expect, it } from 'vitest';
import { BEHAVIORS } from './behaviors';
import { BLIND_TURNS, resolveContact, SHOVE_TILES, shovePlayer } from './contact';
import { ENEMY_DEFS, ENEMY_TYPE_IDS, type ContactEffect } from './enemy-defs';
import { enemiesOf, enemyAt, removeChildren, spawnEnemy } from './enemies';
import { type Enemy } from './entity';
import { parseMap, serializeMap, spawnCells, type EnemySpawn } from './floor-map';
import { BLIND_SIGHT, effectiveSight } from './fov';
import { createGameState, TRAIL_LENGTH, type GameState } from './game-state';
import { HAZARD_PERIODS } from './hazards';
import { loseLife } from './lives';
import { blockersFor, stepToward } from './pathing';
import { createRng } from './rng';
import { applyAction } from './turn';

const strip = (row: string): string[] => {
  const wall = '#'.repeat(row.length + 2);
  return [wall, `#${row}#`, wall];
};
const game = (map: string[], opts = {}): GameState =>
  createGameState('T', parseMap(map), { sightRadius: 8, ...opts });
const types = (events: { type: string }[]): string[] => events.map((e) => e.type);
const east = (s: GameState) => applyAction(s, { type: 'move', dir: 'E' });
const wait = (s: GameState) => applyAction(s, { type: 'wait' });

/** Makes the Bloodstone behave like a type with another contact effect, while `run` runs. */
function withContact<T>(effect: ContactEffect, run: () => T): T {
  const def = ENEMY_DEFS.bloodstone;
  const before = def.contact;
  def.contact = effect;
  try {
    return run();
  } finally {
    def.contact = before;
  }
}

describe('the enemy registry', () => {
  it('gives every type every field the generator and the core rely on', () => {
    for (const id of ENEMY_TYPE_IDS) {
      const def = ENEMY_DEFS[id];
      expect(['life', 'blind', 'shove']).toContain(def.contact);
      expect(def.cost).toBeGreaterThanOrEqual(0);
      expect(def.maxPerFloor(50)).toBeGreaterThanOrEqual(1);
      expect([
        'point',
        'segment',
        'reach',
        'decoy',
        'line',
        'gate',
        'pivot',
        'crossing',
        'niche',
        'flag',
      ]).toContain(def.placement);
      // Timed types are exactly the ones with a hazard for the route proof.
      expect(def.guarantee === 'timing').toBe(def.hazard !== undefined);
    }
  });
});

describe('periodic hazards (the oracle for the route proof)', () => {
  // One sample spawn per timed type and length; the hazard must match the real behaviour exactly.
  const spears: EnemySpawn[] = [3, 4, 5, 6].flatMap((len) => [
    { type: 'spear', pos: { x: 2, y: 1 }, end: { x: 2 + len - 1, y: 1 } },
    { type: 'spear', pos: { x: 2 + len - 1, y: 3 }, end: { x: 2, y: 3 } },
  ]);
  // Periods 10, 6 and 8 (from the position), beams of 4-7 tiles and a short vertical one.
  const sentinels: EnemySpawn[] = [4, 5, 6, 7].flatMap((beam) => [
    { type: 'sentinel', pos: { x: 1, y: 1 }, end: { x: 1 + beam, y: 1 } },
    { type: 'sentinel', pos: { x: 8, y: 3 }, end: { x: 8 - beam, y: 3 } },
    { type: 'sentinel', pos: { x: 3, y: 2 }, end: { x: 3, y: 2 + Math.min(beam, 2) } },
  ]);
  const bouncers: EnemySpawn[] = [{ type: 'bouncer', pos: { x: 4, y: 2 } }];
  // Pivots in the middle (arms cut by the floor and ceiling), in a corner, with arms of 2-4 tiles.
  const sweepers: EnemySpawn[] = [
    { type: 'sweeper', pos: { x: 4, y: 2 }, end: { x: 7, y: 2 } },
    { type: 'sweeper', pos: { x: 4, y: 2 }, end: { x: 4, y: 4 } },
    { type: 'sweeper', pos: { x: 4, y: 2 }, end: { x: 2, y: 2 } },
    { type: 'sweeper', pos: { x: 1, y: 1 }, end: { x: 1, y: 3 } },
    { type: 'sweeper', pos: { x: 6, y: 1 }, end: { x: 6, y: 4 } },
  ];
  // Lanes of 4-7 tiles walked from either end, so the periods are 6, 8, 10 and 12.
  const pendulums: EnemySpawn[] = [4, 5, 6, 7].flatMap((len) => [
    { type: 'pendulum', pos: { x: 1, y: 2 }, end: { x: len, y: 2 } },
    { type: 'pendulum', pos: { x: 8, y: 1 }, end: { x: 8, y: Math.min(len, 4) } },
    { type: 'pendulum', pos: { x: 2 + len - 1, y: 3 }, end: { x: 2, y: 3 } },
  ]);
  const samples = [...spears, ...sentinels, ...bouncers, ...sweepers, ...pendulums];

  it.each(samples.map((s, i) => [`${s.type} #${i}`, s] as const))(
    '%s: the hazard footprint equals the real cells for two full cycles',
    (_name, spawn) => {
      const state = game([
        '##########',
        '#........#',
        '#........#',
        '#........#',
        '#@......!#',
        '##########',
      ]);
      const hazard = ENEMY_DEFS[spawn.type].hazard?.(spawn, state.floor);
      expect(hazard).toBeDefined();
      if (!hazard) return;
      expect(HAZARD_PERIODS).toContain(hazard.period);
      const { enemy } = spawnEnemy(state, spawn);
      const behavior = BEHAVIORS[ENEMY_DEFS[spawn.type].behavior];
      for (let phase = 0; phase <= 2 * hazard.period; phase++) {
        const real = enemy.cells.map((c) => `${c.x},${c.y}`).sort();
        const proved = hazard
          .hurtAt(phase % hazard.period)
          .map((c) => `${c.x},${c.y}`)
          .sort();
        expect(real, `phase ${phase}`).toEqual(proved);
        behavior.act(enemy, state, state.enemyRng);
      }
    },
  );
});

describe('segment helpers', () => {
  it('lists every tile of a spawn, base first', () => {
    expect(spawnCells({ type: 'patroller', pos: { x: 1, y: 1 }, end: { x: 3, y: 1 } })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });
});

describe('contact effects', () => {
  it("'life' is the old rule: hitEnemy then lifeLost", () => {
    const s = game(strip('@x....!'));
    expect(types(east(s))).toEqual(['hitEnemy', 'lifeLost']);
    expect(s.lives).toBe(2);
  });

  it("'blind' clamps the sight radius, costs no life and consumes the enemy", () => {
    const s = game(strip('@x.........!'));
    const events = withContact('blind', () => east(s));
    expect(events).toContainEqual({ type: 'blinded', turns: BLIND_TURNS });
    expect(s.lives).toBe(3);
    expect(s.blindTurns).toBe(BLIND_TURNS);
    expect(effectiveSight(s)).toBe(BLIND_SIGHT);
    expect(enemiesOf(s)[0]?.cells).toEqual([]);
    // The far end of the corridor is no longer lit.
    expect(s.visible[1 * s.floor.width + 10]).toBe(0);
  });

  it('blindness counts down once per turn that takes time and then the view comes back', () => {
    const s = game(strip('@x.........!'));
    withContact('blind', () => east(s));
    for (let i = 0; i < BLIND_TURNS; i++) {
      expect(effectiveSight(s)).toBe(BLIND_SIGHT);
      wait(s);
    }
    expect(s.blindTurns).toBe(0);
    expect(effectiveSight(s)).toBe(8);
    expect(s.visible[1 * s.floor.width + 8]).toBe(1);
  });

  it('blindness is cleared by a respawn', () => {
    const s = game(strip('@x.........!'));
    withContact('blind', () => east(s));
    loseLife(s);
    expect(s.blindTurns).toBe(0);
  });

  it("'shove' throws the player back along their trail without costing a life or refunding steps", () => {
    const s = game(strip('@.......x....!'));
    for (let i = 0; i < 7; i++) east(s); // x = 8 is the stone, so the player stops at x = 8 - 1
    expect(s.player.pos.x).toBe(8);
    const steps = s.stats.floorSteps;
    const events = withContact('shove', () => east(s));
    expect(types(events)).toEqual(['hitEnemy', 'shoved']);
    expect(s.lives).toBe(3);
    expect(s.player.pos.x).toBe(8 - SHOVE_TILES);
    expect(s.stats.floorSteps).toBe(steps);
    // The trail was cut to match, so the next shove keeps going back.
    expect(s.trail.at(-1)?.x).toBe(8 - SHOVE_TILES);
  });

  it('a shove with a short trail lands on the start tile', () => {
    const s = game(strip('@.x.....!'));
    east(s);
    withContact('shove', () => east(s)); // walks into the stone at x = 3
    expect(s.player.pos).toEqual(s.floor.start);
  });

  it('a shove never lands on a tile that hurts right now', () => {
    const s = game(strip('@.x.....!'));
    s.trail = [1, 2, 3, 4, 5].map((x) => ({ x, y: 1 }));
    s.player.pos = { x: 5, y: 1 };
    // The stone at x = 3 hurts: shoving 2 back would land on it, so the landing moves forward.
    shovePlayer(s, 2);
    expect(s.player.pos).toEqual({ x: 4, y: 1 });
    expect(s.trail.at(-1)).toEqual({ x: 4, y: 1 });
  });

  it('resolveContact reports where it happened', () => {
    const s = game(strip('@x....!'));
    const stone = enemiesOf(s)[0] as Enemy;
    expect(resolveContact(s, stone, { x: 2, y: 1 })[0]).toEqual({
      type: 'hitEnemy',
      enemyId: stone.id,
      at: { x: 2, y: 1 },
    });
  });
});

describe('the player trail and per-attempt state', () => {
  it('records the tile after every turn that took time; waits repeat it', () => {
    const s = game(strip('@.....!'));
    east(s);
    wait(s);
    east(s);
    expect(s.trail).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });

  it('a bump takes no turn and adds nothing', () => {
    const s = game(strip('@.....!'));
    applyAction(s, { type: 'move', dir: 'N' });
    expect(s.trail).toEqual([]);
  });

  it(`keeps only the last ${TRAIL_LENGTH} tiles`, () => {
    const s = game(strip('@.....!'));
    for (let i = 0; i < TRAIL_LENGTH + 10; i++) wait(s);
    expect(s.trail).toHaveLength(TRAIL_LENGTH);
  });

  it('a respawn clears the trail, counts the attempt and re-seeds the behaviour stream', () => {
    const a = game(strip('@x....!'));
    const b = game(strip('@x....!'));
    expect(a.attempt).toBe(0);
    wait(a);
    east(a); // dies on the stone
    expect(a.attempt).toBe(1);
    expect(a.trail).toEqual([]);
    a.enemyRng.next(); // use some of the stream in one game only
    east(b);
    // Attempt 2 of both games starts from the same stream whatever happened before.
    loseLife(a);
    loseLife(b);
    expect(a.attempt).toBe(2);
    expect(b.attempt).toBe(2);
    expect([a.enemyRng.next(), a.enemyRng.next()]).toEqual([b.enemyRng.next(), b.enemyRng.next()]);
    expect(createRng('T:1:behavior:1').next()).not.toBe(createRng('T:1:behavior:2').next());
  });
});

describe('enemies added while playing', () => {
  it('get fresh ids, fire enemySpawned, and are removed when the player respawns', () => {
    const s = game(strip('@x.........!'));
    expect(s.nextEnemyId).toBe(2);
    const { enemy, event } = spawnEnemy(s, { type: 'bloodstone', pos: { x: 8, y: 1 } });
    expect(enemy.id).toBe(2);
    expect(event).toEqual({ type: 'enemySpawned', enemyId: 2 });
    expect(enemiesOf(s)).toHaveLength(2);
    removeChildren(s);
    expect(enemiesOf(s).map((e) => e.id)).toEqual([1]);
    spawnEnemy(s, { type: 'bloodstone', pos: { x: 8, y: 1 } });
    loseLife(s);
    expect(enemiesOf(s).map((e) => e.id)).toEqual([1]);
  });
});

describe('solid and warn cells', () => {
  it('a solid tile blocks and hurts like a body, though it is not a hazard cell', () => {
    const s = game(strip('@x....!'));
    const stone = enemiesOf(s)[0] as Enemy;
    stone.cells = [];
    stone.solid = [{ x: 4, y: 1 }];
    expect(enemyAt(s, { x: 4, y: 1 })).toBe(stone);
    expect(enemyAt(s, { x: 2, y: 1 })).toBeUndefined();
  });

  it('warn cells do not hurt', () => {
    const s = game(strip('@x....!'));
    const stone = enemiesOf(s)[0] as Enemy;
    stone.warn = [{ x: 3, y: 1 }];
    expect(enemyAt(s, { x: 3, y: 1 })).toBeUndefined();
  });
});

describe('stepToward', () => {
  it('walks one tile along the shortest path, and stays when it is there or cut off', () => {
    const s = game(strip('@.c...!'));
    const c = enemiesOf(s)[0] as Enemy;
    expect(stepToward(c, s, { x: 1, y: 1 })).toBe(true);
    expect(c.pos).toEqual({ x: 2, y: 1 });
    expect(c.cells).toEqual([{ x: 2, y: 1 }]);
    expect(stepToward(c, s, c.pos)).toBe(false);
  });

  it('treats bloodstones and solid tiles as walls', () => {
    const s = game(strip('@.c.x.!'));
    const [chaser, stone] = enemiesOf(s) as [Enemy, Enemy];
    expect(blockersFor(chaser, s).has(1 * s.floor.width + 5)).toBe(true);
    expect(stepToward(chaser, s, { x: 6, y: 1 })).toBe(false); // the stone seals the corridor
    stone.cells = [];
    stone.solid = [{ x: 5, y: 1 }];
    expect(blockersFor(chaser, s).has(1 * s.floor.width + 5)).toBe(true);
  });
});

describe('map directives', () => {
  it('parse trailing ;lines and write them back', () => {
    const lines = [...strip('@..!'), ';shadow 20', ';flag'];
    const map = parseMap(lines);
    expect(map.directives).toEqual({ shadow: 20, flag: 1 });
    expect(map.height).toBe(3);
    expect(serializeMap(map)).toEqual(lines);
    expect(serializeMap(map, { enemies: false })).toEqual(strip('@..!'));
  });

  it('are empty for an ordinary map and rejected when malformed', () => {
    expect(parseMap(strip('@..!')).directives).toEqual({});
    expect(() => parseMap([...strip('@..!'), ';x nope'])).toThrow(/bad directive/);
  });
});
