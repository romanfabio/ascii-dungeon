/**
 * Prints a shortest solution as WASD keys: npm run solve -- --seed ABC123 --floor 1
 * Handy for testing the game without playing a whole floor by hand.
 */
import { parseArgs } from 'node:util';
import { DX, DY } from '../src/core/geometry';
import { bfsDistances } from '../src/core/pathfinding';
import { generateFloor } from '../src/gen/generate-floor';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: 'ASCII123' },
    floor: { type: 'string', default: '1' },
  },
});
const map = generateFloor(values.seed, Number(values.floor));
const dist = bfsDistances(map, map.start);
const KEYS = ['w', 'd', 's', 'a'];

// Walk back from the exit along strictly decreasing distances.
let { x, y } = map.exit;
const keys: string[] = [];
while (dist[y * map.width + x] !== 0) {
  const d = dist[y * map.width + x] as number;
  for (let i = 0; i < 4; i++) {
    const nx = x + (DX[i] as number);
    const ny = y + (DY[i] as number);
    if (dist[ny * map.width + nx] === d - 1) {
      keys.push(KEYS[(i + 2) % 4] as string); // moving from (nx,ny) to (x,y) is the opposite dir
      x = nx;
      y = ny;
      break;
    }
  }
}
console.log(keys.reverse().join(' '));
