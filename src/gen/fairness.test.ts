import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { parseMap } from '../core/floor-map';
import { MAX_HUNTER_TYPES } from './difficulty';
import { brokenPromise, runDasher, runExplorer, runPlanner } from './fairness';
import { measureFloor } from './fairness-report';
import { generateFloor } from './generate-floor';

describe('the scripted players', () => {
  const corridor = parseMap(['#########', '#@.....!#', '#########']);

  it('the dasher and the planner walk a bare corridor to the exit without losing a life', () => {
    const dash = runDasher(corridor, 'T');
    expect([dash.outcome, dash.livesLost, dash.turns]).toEqual(['exit', 0, 6]);
    const plan = runPlanner(corridor, 'T');
    expect([plan?.outcome, plan?.livesLost, plan?.turns]).toEqual(['exit', 0, 6]);
  });

  it('the dasher is hit by a Bloodstone on its way, and the hit is attributed to it', () => {
    const map = parseMap(['#########', '#@..x..!#', '#.......#', '#########']);
    // The shortest route may go round it: block the way so that it cannot.
    const narrow = parseMap(['#########', '#@..x..!#', '#########']);
    const run = runDasher(narrow, 'T');
    expect(run.livesLost).toBe(1);
    expect(run.hitBy).toEqual(['bloodstone']);
    expect(run.outcome).toBe('dead');
    expect(map.spawns).toHaveLength(1);
  });

  it('the explorer finds the exit of an unseen maze and only knows what it has seen', () => {
    let exits = 0;
    for (let s = 0; s < 10; s++) {
      const run = runExplorer(generateFloor(`F${s}`, 8), `F${s}`);
      if (run.outcome === 'exit') exits++;
    }
    expect(exits).toBeGreaterThanOrEqual(9);
  });

  it('judges a hit by the promise the type made', () => {
    expect(brokenPromise('bloodstone', 'dasher')).toBe(true);
    expect(brokenPromise('spear', 'dasher')).toBe(false); // timed: you wait for it
    expect(brokenPromise('spear', 'planner')).toBe(true);
    expect(brokenPromise('chaser', 'planner')).toBe(false); // hunters are tuned, not promised
    expect(ENEMY_DEFS.blinker.guarantee).toBe('reachable');
  });

  it('measureFloor reports rates for the dasher and the planner', () => {
    const row = measureFloor(30, 5, false);
    expect(row.seeds).toBe(5);
    expect(row.dasher.lost).toBeLessThanOrEqual(5);
    expect(row.explorer).toBeUndefined();
  });
});

describe('fair floors', () => {
  it('a planner who waits where the proof says never loses a life on the first walk (safe walk)', () => {
    let walked = 0;
    for (const floor of [24, 30, 40, 50, 60, 80, 100]) {
      for (let s = 0; s < 30; s++) {
        const seed = `SAFE${s}`;
        const run = runPlanner(generateFloor(seed, floor), seed);
        if (!run) continue;
        walked++;
        if (run.livesLost > 0) {
          throw new Error(`seed ${seed} floor ${floor}: planner hit by ${run.hitBy.join(',')}`);
        }
        // It only stops short when a Shade it walked into blinded it (no life lost, no tile moved).
        if (run.outcome !== 'exit') expect(run.blinded).toBeGreaterThan(0);
      }
    }
    expect(walked).toBeGreaterThan(150);
  }, 300_000);

  it('a floor holds at most 3 different hunter types', () => {
    for (const floor of [20, 40, 70, 100]) {
      for (let s = 0; s < 60; s++) {
        const map = generateFloor(`MIX${s}`, floor);
        const kinds = new Set(
          map.spawns.filter((e) => ENEMY_DEFS[e.type].hunter).map((e) => e.type),
        );
        expect(kinds.size).toBeLessThanOrEqual(MAX_HUNTER_TYPES);
      }
    }
  }, 120_000);
});
