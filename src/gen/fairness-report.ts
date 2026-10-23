import { type EnemyTypeId } from '../core/enemy-defs';
import { generateFloor } from './generate-floor';
import { runDasher, runExplorer, runPlanner } from './fairness';

export interface FairnessRow {
  floor: number;
  seeds: number;
  dasher: { lost: number; byType: Partial<Record<EnemyTypeId, number>> };
  planner: { lost: number; noWalk: number; byType: Partial<Record<EnemyTypeId, number>> };
  explorer?: {
    exited: number;
    dead: number;
    timeout: number;
    livesLostPerFloor: number;
    avgTurns: number;
    blindedPerFloor: number;
    byType: Partial<Record<EnemyTypeId, number>>;
  };
}

function tally(into: Partial<Record<EnemyTypeId, number>>, types: readonly EnemyTypeId[]): void {
  for (const t of types) into[t] = (into[t] ?? 0) + 1;
}

/** Runs the players over `seeds` generated floors (`F${n}` seeds) at one floor number. */
export function measureFloor(floor: number, seeds: number, withExplorer: boolean): FairnessRow {
  const row: FairnessRow = {
    floor,
    seeds,
    dasher: { lost: 0, byType: {} },
    planner: { lost: 0, noWalk: 0, byType: {} },
  };
  if (withExplorer) {
    row.explorer = {
      exited: 0,
      dead: 0,
      timeout: 0,
      livesLostPerFloor: 0,
      avgTurns: 0,
      blindedPerFloor: 0,
      byType: {},
    };
  }
  let explorerTurns = 0;
  let explorerLives = 0;
  let explorerBlind = 0;
  for (let s = 0; s < seeds; s++) {
    const seed = `F${s}`;
    const map = generateFloor(seed, floor);
    const dash = runDasher(map, seed);
    if (dash.livesLost > 0) {
      row.dasher.lost++;
      tally(row.dasher.byType, dash.hitBy);
    }
    const plan = runPlanner(map, seed);
    if (!plan) row.planner.noWalk++;
    else if (plan.livesLost > 0) {
      row.planner.lost++;
      tally(row.planner.byType, plan.hitBy);
    }
    if (row.explorer) {
      const ex = runExplorer(map, seed);
      row.explorer[ex.outcome === 'exit' ? 'exited' : ex.outcome === 'dead' ? 'dead' : 'timeout']++;
      explorerTurns += ex.turns;
      explorerLives += ex.livesLost;
      explorerBlind += ex.blinded;
      tally(row.explorer.byType, ex.hitBy);
    }
  }
  if (row.explorer) {
    row.explorer.avgTurns = Math.round(explorerTurns / seeds);
    row.explorer.livesLostPerFloor = explorerLives / seeds;
    row.explorer.blindedPerFloor = explorerBlind / seeds;
  }
  return row;
}
