import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, type EnemyDef } from '../core/enemy-defs';
import { createRng } from '../core/rng';
import { generateFloor } from './generate-floor';
import {
  budgetForFloor,
  enemyCountForFloor,
  limitsForFloor,
  ROSTER_RULES_ACTIVE,
  SPOTLIGHT_FACTOR,
  SPOTLIGHT_FLOORS,
  spotlightWeight,
  THREAT_PER_ENEMY,
} from './difficulty';
import { placeEnemies } from './enemies';
import { PLACERS } from './placers';
import { ENEMY_TYPE_IDS } from '../core/enemy-defs';

describe('placer registry', () => {
  it('has a placer for every placement kind a type uses', () => {
    for (const id of ENEMY_TYPE_IDS) expect(PLACERS[ENEMY_DEFS[id].placement]).toBeDefined();
  });
});

describe('threat budget and spotlight', () => {
  it('the budget is 1.6 threat units per enemy the floor gets', () => {
    expect(THREAT_PER_ENEMY).toBe(1.6);
    expect(budgetForFloor(1)).toBe(0);
    for (const floor of [2, 30, 60, 100]) {
      expect(budgetForFloor(floor)).toBe(Math.round(1.6 * enemyCountForFloor(floor)));
    }
    expect(budgetForFloor(100)).toBe(38);
  });

  it('a type is spotlighted for the floors right after it unlocks', () => {
    const unlock = ENEMY_DEFS.spear.minFloor;
    expect(spotlightWeight('spear', unlock - 1)).toBe(1);
    expect(spotlightWeight('spear', unlock)).toBe(SPOTLIGHT_FACTOR);
    expect(spotlightWeight('spear', unlock + SPOTLIGHT_FLOORS - 1)).toBe(SPOTLIGHT_FACTOR);
    expect(spotlightWeight('spear', unlock + SPOTLIGHT_FLOORS)).toBe(1);
  });

  it('is switched on, with the budget and the spotlight weights', () => {
    expect(ROSTER_RULES_ACTIVE).toBe(true);
    const limits = limitsForFloor(13);
    expect(limits.budget).toBe(budgetForFloor(13));
    expect(limits.weightOf?.('wanderer')).toBe(ENEMY_DEFS.wanderer.weight * SPOTLIGHT_FACTOR);
    expect(limits.weightOf?.('bloodstone')).toBe(ENEMY_DEFS.bloodstone.weight);
  });
});

describe('placeEnemies limits', () => {
  const MAP = generateFloor('LIM', 50);
  const bare = (): typeof MAP => ({ ...MAP, spawns: [], pickups: [] });

  it('stops drawing once the budget is spent, overshooting by at most one enemy', () => {
    const cost = ENEMY_DEFS.bloodstone.cost;
    const spawns = placeEnemies(bare(), 20, ['bloodstone'], createRng('B'), { budget: 5 * cost });
    expect(spawns).toHaveLength(5);
    const heavy = placeEnemies(bare(), 20, ['chaser'], createRng('B'), { budget: 1 });
    expect(heavy).toHaveLength(1);
  });

  it('never draws a type beyond its per-floor cap, and stops when nothing is drawable', () => {
    const def = ENEMY_DEFS.bloodstone as EnemyDef;
    const before = def.maxPerFloor;
    def.maxPerFloor = () => 2;
    try {
      const spawns = placeEnemies(bare(), 10, ['bloodstone'], createRng('CAP'));
      expect(spawns).toHaveLength(2);
      const mixed = placeEnemies(bare(), 10, ['bloodstone', 'patroller'], createRng('CAP'));
      expect(mixed.filter((s) => s.type === 'bloodstone').length).toBeLessThanOrEqual(2);
      expect(mixed.length).toBeGreaterThan(2);
    } finally {
      def.maxPerFloor = before;
    }
  });

  it('draws by the given weights', () => {
    const spawns = placeEnemies(bare(), 12, ['bloodstone', 'patroller'], createRng('W'), {
      weightOf: (t) => (t === 'patroller' ? 1 : 0),
    });
    expect(spawns.length).toBeGreaterThan(0);
    expect(spawns.every((s) => s.type === 'patroller')).toBe(true);
  });
});
