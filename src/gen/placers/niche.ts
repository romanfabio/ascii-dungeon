import { spawnReach } from '../../core/enemy-defs';
import { DX, DY } from '../../core/geometry';
import { nicheSides } from '../../core/segment';
import { routeSurvivable } from '../spear-timing';
import { routeCells } from './fields';
import { type Placer } from './types';

/** How many niches are put through the route proof before the placer gives up. */
const PROOF_TRIES = 6;

/**
 * A Lurker's niche: the first tile of a small dead end that branches off the route. Exactly one
 * side of the tile opens out (to a route tile) and every other side is a small closed pocket, so
 * the Lurker's body shuts off a few tiles at most (they are reserved for it) and the only way to
 * be beside it is to be on the route. Kept only if the hazard proof, which forbids waiting on that
 * route tile, still passes. The tile the drawing loop offered is ignored.
 */
export const nichePlacer: Placer = {
  place(ctx, type, _cell, rng, placed) {
    const { map } = ctx;
    const { width, height } = map;
    const spots: number[] = [];
    for (const r of routeCells(map)) {
      const x = r % width;
      const y = (r - x) / width;
      for (let d = 0; d < 4; d++) {
        const nx = x + (DX[d] as number);
        const ny = y + (DY[d] as number);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (!ctx.open(n)) continue; // off the route, far from the start, free
        const spawn = { type, pos: { x: nx, y: ny } };
        const open = nicheSides(map, spawn.pos).filter((side) => !side.pocket);
        if (open.length !== 1) continue;
        if (!spawnReach(spawn, map).every((c) => ctx.roomy(c.y * width + c.x))) continue;
        spots.push(n);
      }
    }
    rng.shuffle(spots);
    for (const n of spots.slice(0, PROOF_TRIES)) {
      const x = n % width;
      const spawn = { type, pos: { x, y: (n - x) / width } };
      if (routeSurvivable(map, [...placed, spawn])) return spawn;
    }
    return null;
  },
  validate(ctx, spawn, where) {
    const { map } = ctx;
    const { width } = map;
    const route = ctx.route();
    const problems: string[] = [];
    if (route.has(spawn.pos.y * width + spawn.pos.x)) problems.push(`${where} is on the route`);
    const open = nicheSides(map, spawn.pos).filter((side) => !side.pocket);
    const [side] = open;
    if (open.length !== 1 || !side || !route.has(side.from.y * width + side.from.x)) {
      problems.push(`${where} is not a dead end that branches off the route`);
    }
    return { problems };
  },
};
