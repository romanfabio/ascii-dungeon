import { ENEMY_DEFS } from '../core/enemy-defs';
import { type FloorMap } from '../core/floor-map';
import { runPlanner } from './fairness';

/** At most this many hunters are dropped from one floor. */
const MAX_DROPS = 8;

/**
 * The "safe walk" rule. The route proof keeps the timed enemies and the fixed ones fair, but the
 * hunters (`reachable` types: Wanderer, Sleeper, Chaser, Blinker, Ghost) react to the player, so
 * nothing proves a first walk past them. This plays it out on the real game core: a player who
 * walks the proved way and ignores everything else must reach the exit without losing a life. For
 * as long as such a walk is caught by a hunter, that hunter is dropped from the floor. Hunters then
 * only threaten detours, exploring and waiting, never a clean walk down the route.
 * The game plays out the same way every time (`runSeed` seeds the behaviour stream), so what is
 * simulated here is what the player will meet.
 */
export function dropCatchingHunters(map: FloorMap, runSeed: string): void {
  const isHunter = (type: string): boolean =>
    ENEMY_DEFS[type as keyof typeof ENEMY_DEFS].guarantee === 'reachable';
  for (let drops = 0; drops < MAX_DROPS; drops++) {
    if (!map.spawns.some((s) => isHunter(s.type))) return;
    const walk = runPlanner(map, runSeed);
    if (!walk || walk.livesLost === 0) return;
    const index = (walk.hitIds[0] ?? 0) - 1; // a floor's own spawn has the id index + 1
    const culprit = map.spawns[index];
    if (!culprit || !isHunter(culprit.type)) return; // not a hunter: not ours to drop
    map.spawns = map.spawns.filter((_, k) => k !== index);
  }
}
