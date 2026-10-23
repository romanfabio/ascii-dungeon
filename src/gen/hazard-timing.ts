import { HAZARD_PERIODS, type PeriodicHazard } from '../core/hazards';
import { type FloorMap } from '../core/floor-map';
import { type Point } from '../core/geometry';
import { shortestPath } from '../core/pathfinding';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Can the player walk the shortest route, moving or waiting one turn at a time, without ever
 * touching a timed hazard? A hazard's footprint is a pure function of the turn number (it restarts
 * at phase 0 whenever the player respawns), so this searches (position on the route, turn mod the
 * joint cycle) instead of simulating the game. Only hazards that touch the route matter. Walking on
 * the route only is conservative: a floor that fails here may still have another way round, but a
 * floor that passes is always solvable.
 *
 * `noStop` lists tiles where the player must never end two turns in a row (next to a Lurker): on
 * the route they cannot be waited on, only passed through.
 *
 * Mirrors the game's turn order: the player moves (into a tile that hurts right now is a hit), then
 * the hazards take one step (a tile that hurts afterwards is a hit); reaching the exit ends the
 * floor before the hazards move.
 */
export function routeSurvivable(
  map: FloorMap,
  hazards: readonly PeriodicHazard[],
  noStop: readonly Point[] = [],
): boolean {
  return solve(map, hazards, noStop, false) !== null;
}

/**
 * A fewest-turns way through, as the tile the player stands on after each turn (a wait repeats
 * the tile), or null when there is none. The Shadow floor check replays it.
 */
export function routeWalk(
  map: FloorMap,
  hazards: readonly PeriodicHazard[],
  noStop: readonly Point[] = [],
): Point[] | null {
  return solve(map, hazards, noStop, true);
}

function solve(
  map: FloorMap,
  hazards: readonly PeriodicHazard[],
  noStop: readonly Point[],
  wantWalk: boolean,
): Point[] | null {
  for (const h of hazards) {
    if (!HAZARD_PERIODS.includes(h.period))
      throw new Error(`hazard period ${h.period} not allowed`);
  }
  if (hazards.length === 0 && !wantWalk) return [];
  const { width } = map;
  const route = shortestPath(map, map.start, map.exit);
  const routeIndex = new Map(route.map((p, i) => [p.y * width + p.x, i]));
  const dash = (): Point[] => route.slice(1);

  // Which route tiles hurt at which phase of the joint cycle (at most 120 phases).
  const cycle = hazards.reduce((acc, h) => (acc / gcd(acc, h.period)) * h.period, 1);
  const hurt = new Uint8Array(route.length * cycle);
  let touches = false;
  for (const h of hazards) {
    for (let phase = 0; phase < cycle; phase++) {
      for (const c of h.hurtAt(phase % h.period)) {
        const i = routeIndex.get(c.y * width + c.x);
        if (i !== undefined) {
          hurt[phase * route.length + i] = 1;
          touches = true;
        }
      }
    }
  }
  if (!touches) return dash();
  const covered = (i: number, phase: number): boolean => hurt[phase * route.length + i] === 1;
  const noWait = new Set<number>();
  for (const p of noStop) {
    const i = routeIndex.get(p.y * width + p.x);
    if (i !== undefined) noWait.add(i);
  }

  const last = route.length - 1;
  const seen = new Uint8Array(route.length * cycle);
  const queue = new Int32Array(route.length * cycle);
  const parent = wantWalk ? new Int32Array(route.length * cycle).fill(-1) : null;
  let head = 0;
  let tail = 0;
  seen[0] = 1; // start tile, phase 0
  queue[tail++] = 0;
  while (head < tail) {
    const state = queue[head++] as number;
    const i = Math.floor(state / cycle);
    const phase = state % cycle;
    for (const j of [i, i - 1, i + 1]) {
      if (j < 0 || j > last) continue;
      if (j === i && noWait.has(i)) continue; // waiting here is not allowed
      if (j !== i) {
        if (covered(j, phase)) continue; // walked into a hazard
        if (j === last) {
          // The exit: the floor ends before the hazards move.
          if (!parent) return [];
          const walk: Point[] = [route[last] as Point];
          for (let at = state; at > 0; at = parent[at] as number) {
            walk.push(route[Math.floor(at / cycle)] as Point);
          }
          return walk.reverse();
        }
      }
      const next = (phase + 1) % cycle;
      if (covered(j, next)) continue; // a hazard reached the player
      const key = j * cycle + next;
      if (seen[key]) continue;
      seen[key] = 1;
      if (parent) parent[key] = state;
      queue[tail++] = key;
    }
  }
  return null;
}
