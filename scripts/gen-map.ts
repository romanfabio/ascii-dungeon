/**
 * Prints generated floors as ASCII.
 *
 *   npm run gen -- --seed ABC123 --floor 8
 *   npm run gen -- --seed ABC123 --floor 8 --blank     (floor tiles as spaces)
 *   npm run gen -- --table [--seeds 50] [--max-floor 100]   (per-floor difficulty stats)
 */
import { parseArgs } from 'node:util';
import { ENEMY_DEFS, ENEMY_TYPE_IDS } from '../src/core/enemy-defs';
import { serializeMap } from '../src/core/floor-map';
import { paramsForFloor } from '../src/gen/difficulty';
import { generateFloor } from '../src/gen/generate-floor';
import { analyzeFloor } from '../src/gen/stats';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: 'ASCII123' },
    floor: { type: 'string', default: '1' },
    blank: { type: 'boolean', default: false },
    table: { type: 'boolean', default: false },
    seeds: { type: 'string', default: '30' },
    'max-floor': { type: 'string', default: '100' },
  },
});

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

if (values.table) {
  const seeds = Number(values.seeds);
  const maxFloor = Number(values['max-floor']);
  console.log('floor  size  gen              path  deadEnds  loops  walkable%  sight  enemies  ms');
  for (let floor = 1; floor <= maxFloor; floor++) {
    const params = paramsForFloor(floor);
    const paths: number[] = [];
    const deadEnds: number[] = [];
    const loops: number[] = [];
    const density: number[] = [];
    const enemies: number[] = [];
    const t0 = performance.now();
    for (let s = 0; s < seeds; s++) {
      const map = generateFloor(`SEED${s}`, floor);
      const stats = analyzeFloor(map);
      enemies.push(map.spawns.length);
      paths.push(stats.pathLength);
      deadEnds.push(stats.deadEnds);
      loops.push(stats.loops);
      density.push((stats.walkable / (params.size * params.size)) * 100);
    }
    const ms = (performance.now() - t0) / seeds;
    console.log(
      [
        String(floor).padStart(5),
        String(params.size).padStart(5),
        params.generator.padEnd(16),
        avg(paths).toFixed(0).padStart(5),
        avg(deadEnds).toFixed(0).padStart(9),
        avg(loops).toFixed(0).padStart(6),
        avg(density).toFixed(0).padStart(10),
        String(params.sightRadius).padStart(6),
        avg(enemies).toFixed(1).padStart(8),
        ms.toFixed(1).padStart(5),
      ].join('  '),
    );
  }
} else {
  const floor = Number(values.floor);
  const map = generateFloor(values.seed, floor);
  const stats = analyzeFloor(map);
  const params = paramsForFloor(floor);
  // The legend comes from the enemy defs, so a new type shows up without touching this script.
  const legend = ENEMY_TYPE_IDS.map((id) => {
    const def = ENEMY_DEFS[id];
    return `${def.mapChar}${def.endChar ? `..${def.endChar}` : ''} ${id}`;
  }).join(', ');
  let lines = serializeMap(map);
  if (values.blank) lines = lines.map((l) => l.replaceAll('.', ' '));
  console.log(lines.join('\n'));
  console.log(
    `\nseed=${values.seed} floor=${floor} size=${map.width}x${map.height} generator=${params.generator}` +
      `\npath=${stats.pathLength} deadEnds=${stats.deadEnds} loops=${stats.loops} sightRadius=${params.sightRadius}` +
      `\nenemies=${map.spawns.length} (${legend}, + life pickup)`,
  );
}
