import { ENEMY_DEFS } from '../../core/enemy-defs';
import { bfsDistances } from '../../core/pathfinding';
import { isWalkable } from '../../core/tiles';
import { type Placer } from './types';

/** Is `pos` at least `buffer` tiles (straight line) from every tile of the route? */
function farFromRoute(
  width: number,
  route: ReadonlySet<number>,
  pos: { x: number; y: number },
  buffer: number,
): boolean {
  for (const i of route) {
    const dx = (i % width) - pos.x;
    const dy = Math.floor(i / width) - pos.y;
    if (dx * dx + dy * dy < buffer * buffer) return false;
  }
  return true;
}

/**
 * One tile off the route (the drawing loop only offers `open` tiles), at least the type's
 * `homeDistance` from the start when it has one: Bloodstone, Chaser, and later most hunters.
 */
export const pointPlacer: Placer = {
  place(ctx, type, cell) {
    const min = ENEMY_DEFS[type].homeDistance;
    if (min !== undefined && (ctx.fromStart[cell] as number) < min) return null;
    const leash = ENEMY_DEFS[type].leash;
    if (leash) {
      // A leashed type needs room to roam: enough walkable tiles within its radius of home.
      const { map } = ctx;
      const x0 = cell % map.width;
      const near = bfsDistances(map, { x: x0, y: (cell - x0) / map.width });
      let room = 0;
      for (let i = 0; i < near.length; i++) {
        const d = near[i] as number;
        if (d > 0 && d <= leash.radius && isWalkable(map.tiles[i] as number)) room++;
      }
      if (room < leash.minTiles) return null;
    }
    const x = cell % ctx.map.width;
    const y = (cell - x) / ctx.map.width;
    const buffer = ENEMY_DEFS[type].routeBuffer;
    if (buffer !== undefined && !farFromRoute(ctx.map.width, ctx.route, { x, y }, buffer))
      return null;
    return { type, pos: { x, y } };
  },
  validate(ctx, spawn, where) {
    const def = ENEMY_DEFS[spawn.type];
    const problems: string[] = [];
    const home = spawn.pos.y * ctx.map.width + spawn.pos.x;
    if (def.homeDistance !== undefined && (ctx.fromStart[home] as number) < def.homeDistance) {
      problems.push(`${where} is too close to the start`);
    }
    if (def.routeBuffer !== undefined) {
      const route = ctx.route();
      if (!farFromRoute(ctx.map.width, route, spawn.pos, def.routeBuffer)) {
        problems.push(`${where} is too close to the route`);
      }
    }
    // A hunter's home stays off the route; the others are kept clear by the exit-reachable check.
    if (def.guarantee !== 'footprint' && ctx.route().has(home)) {
      problems.push(`${where} has its home on the route`);
    }
    return { problems };
  },
};
