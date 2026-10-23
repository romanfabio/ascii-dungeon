import { ENEMY_DEFS, type EnemyTypeId } from '../../core/enemy-defs';
import { type EnemySpawn } from '../../core/floor-map';
import { DX, DY, type Point } from '../../core/geometry';
import { type Rng } from '../../core/rng';
import { spawnCells } from '../../core/segment';
import { routeSurvivable } from '../spear-timing';
import { routeCells } from './fields';
import {
  MAX_PENDULUM_GAP,
  MAX_PENDULUM_LENGTH,
  MIN_PENDULUM_GAP,
  MIN_PENDULUM_LENGTH,
} from './rules';
import { badShape } from './segment';
import { type PlaceContext, type Placer } from './types';

/** How many route tiles are tried as the first lane, and as the partner of each. */
const FIRST_TRIES = 10;
const PARTNER_TRIES = 6;

/**
 * A lane that meets the route at the route tile `cell` and nowhere else: either straight across it
 * (tiles on both sides of the route, the patroller passes through) or running out from it (the
 * route tile is the lane's end). The other lane tiles must be `free` and the route tile `crossOk`.
 * Crossing lanes are preferred whenever one fits. The start end is random. Null if nothing fits.
 */
function laneAt(
  ctx: PlaceContext,
  type: EnemyTypeId,
  cell: number,
  free: (i: number) => boolean,
  crossOk: (i: number) => boolean,
  rng: Rng,
): EnemySpawn | null {
  const { map } = ctx;
  if (!crossOk(cell)) return null;
  const x = cell % map.width;
  const y = (cell - x) / map.width;

  // How many free tiles run on from the route tile in each direction (N, E, S, W).
  const room = [0, 1, 2, 3].map((d) => {
    let n = 0;
    while (n < MAX_PENDULUM_LENGTH - 1) {
      const nx = x + (DX[d] as number) * (n + 1);
      const ny = y + (DY[d] as number) * (n + 1);
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) break;
      if (!free(ny * map.width + nx)) break;
      n++;
    }
    return n;
  });

  // Options are [direction, tiles that way, opposite direction, tiles that way].
  const across: [number, number, number, number][] = [];
  const along: [number, number, number, number][] = [];
  for (const d of [0, 1]) {
    const back = d + 2;
    for (let a = 1; a <= (room[d] as number); a++) {
      for (let b = 1; b <= (room[back] as number); b++) {
        const length = a + b + 1;
        if (length >= MIN_PENDULUM_LENGTH && length <= MAX_PENDULUM_LENGTH) {
          across.push([d, a, back, b]);
        }
      }
    }
  }
  for (let d = 0; d < 4; d++) {
    for (let a = MIN_PENDULUM_LENGTH - 1; a <= (room[d] as number); a++) along.push([d, a, d, 0]);
  }
  const options = across.length > 0 ? across : along;
  if (options.length === 0) return null;
  const [d1, a, d2, b] = options[rng.int(options.length)] as [number, number, number, number];
  const one: Point = { x: x + (DX[d1] as number) * a, y: y + (DY[d1] as number) * a };
  const other: Point =
    b === 0 ? { x, y } : { x: x + (DX[d2] as number) * b, y: y + (DY[d2] as number) * b };
  // The lane is walked from `pos` to `end`: which of the two ends it starts at is a coin toss.
  return rng.next() < 0.5 ? { type, pos: one, end: other } : { type, pos: other, end: one };
}

/**
 * The pendulums: patrol lanes that meet the shortest route (the only patrollers that may). They
 * come in pairs whose route tiles are 2-8 route steps apart; a floor that fits only one lane gets a
 * single, and a floor that fits none gets nothing. Whatever is placed must pass the hazard proof,
 * together with every other timed enemy. The tile the drawing loop offered is ignored (it is never
 * on the route).
 */
export const crossingPlacer: Placer = {
  place(ctx, type, _cell, rng, placed) {
    const { map } = ctx;
    const have = placed.filter((s) => s.type === type).length;
    const room = ENEMY_DEFS[type].maxPerFloor(map.floorNumber) - have;
    if (room < 1) return null;
    const route = routeCells(map);
    const last = route.length - 1;
    const usable = (k: number): boolean => k >= 1 && k < last && ctx.roomy(route[k] as number);
    const firsts: number[] = [];
    for (let k = 1; k < last; k++) if (usable(k)) firsts.push(k);
    rng.shuffle(firsts);

    let single: EnemySpawn | null = null;
    let tried = 0;
    for (const k of firsts) {
      if (tried >= FIRST_TRIES) break;
      // Most route tiles are plain corridor: only a junction has a lane worth trying.
      const first = laneAt(ctx, type, route[k] as number, ctx.open, ctx.roomy, rng);
      if (!first) continue;
      tried++;
      if (room >= 2) {
        const used = new Set(spawnCells(first).map((c) => c.y * map.width + c.x));
        const free = (i: number): boolean => ctx.open(i) && !used.has(i);
        const crossOk = (i: number): boolean => ctx.roomy(i) && !used.has(i);
        const partners: number[] = [];
        for (let j = k - MAX_PENDULUM_GAP; j <= k + MAX_PENDULUM_GAP; j++) {
          if (Math.abs(j - k) >= MIN_PENDULUM_GAP && usable(j)) partners.push(j);
        }
        rng.shuffle(partners);
        let proofs = 0;
        for (const j of partners) {
          if (proofs >= PARTNER_TRIES) break;
          const second = laneAt(ctx, type, route[j] as number, free, crossOk, rng);
          if (!second) continue;
          proofs++;
          if (routeSurvivable(map, [...placed, first, second])) return [first, second];
        }
      }
      // A lone lane is only a fallback, and never a second lone lane on the same floor.
      if (!single && have === 0 && routeSurvivable(map, [...placed, first])) single = first;
    }
    return single;
  },
  validate(ctx, spawn, where) {
    const cells = spawnCells(spawn);
    if (badShape(spawn, cells.length, MIN_PENDULUM_LENGTH, MAX_PENDULUM_LENGTH)) {
      return { problems: [`${where} has a bad pendulum lane`], fatal: true };
    }
    const route = ctx.route();
    const onRoute = cells.filter((c) => route.has(c.y * ctx.map.width + c.x)).length;
    // Exactly one tile: a lane that never meets the route is a patroller, one along it is unfair.
    return onRoute === 1
      ? { problems: [] }
      : { problems: [`${where} meets the route ${onRoute} times`] };
  },
};
