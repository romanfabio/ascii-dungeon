/**
 * Fairness measurement (roster plan, section 6): scripted players on generated floors.
 *   npm run fairness -- --floors 28,40,58,72 --seeds 100 [--explorer]
 * dasher = shortest route, never waits; planner = the generator's proved walk; explorer = a
 * cautious fog-of-war explorer (slower, add --explorer). See src/gen/fairness.ts.
 */
import { parseArgs } from 'node:util';
import { type EnemyTypeId } from '../src/core/enemy-defs';
import { brokenPromise } from '../src/gen/fairness';
import { measureFloor } from '../src/gen/fairness-report';

const { values } = parseArgs({
  options: {
    floors: { type: 'string', default: '8,20,30,40,50,60,72,80,100' },
    seeds: { type: 'string', default: '60' },
    explorer: { type: 'boolean', default: false },
  },
});
const seeds = Number(values.seeds);

const pct = (n: number): string => `${((100 * n) / seeds).toFixed(0)}%`;
const types = (
  by: Partial<Record<EnemyTypeId, number>>,
  kind: 'dasher' | 'planner' | 'explorer',
): string =>
  Object.entries(by)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(
      ([t, n]) =>
        `${t} ${n}${kind !== 'explorer' && brokenPromise(t as EnemyTypeId, kind) ? ' (!)' : ''}`,
    )
    .join(', ') || '-';

console.log(`${seeds} seeds per floor. (!) = hit by a type that promised this player a free way.`);
for (const floor of values.floors.split(',').map(Number)) {
  const row = measureFloor(floor, seeds, values.explorer);
  console.log(`\nfloor ${floor}`);
  console.log(
    `  dasher  loses a life on ${pct(row.dasher.lost)} of floors: ${types(row.dasher.byType, 'dasher')}`,
  );
  console.log(
    `  planner loses a life on ${pct(row.planner.lost)} of floors${row.planner.noWalk ? `, no walk on ${row.planner.noWalk}` : ''}: ${types(row.planner.byType, 'planner')}`,
  );
  const ex = row.explorer;
  if (ex) {
    console.log(
      `  explorer: exit ${pct(ex.exited)}, dead ${pct(ex.dead)}, timeout ${pct(ex.timeout)}; ` +
        `${ex.livesLostPerFloor.toFixed(2)} lives lost and ${ex.blindedPerFloor.toFixed(2)} blinds per floor, ${ex.avgTurns} turns on average`,
    );
    console.log(`            lives lost to: ${types(ex.byType, 'explorer')}`);
  }
}
