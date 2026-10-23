import { type EnemyTypeId } from './enemy-defs';
import { type Point } from './geometry';

export interface Entity {
  id: number;
  kind: 'player' | 'enemy'; // future: 'item'
  pos: Point;
  glyph: string;
  blocksMovement: boolean;
}

export interface Enemy extends Entity {
  kind: 'enemy';
  /** Key into ENEMY_DEFS. */
  type: EnemyTypeId;
  /** Every tile that hurts right now: one for a Bloodstone, several for a spear. */
  cells: Point[];
  /**
   * Tiles that block movement and hurt on contact but are not part of the timed hazard in `cells`
   * (a Sentinel's body, a Breeder's mother). `enemyAt` checks both; the hazard proof reads `cells`.
   */
  solid: Point[];
  /** Tiles that will hurt soon (a telegraph). Drawn dimmer than `cells`; they do not hurt. */
  warn: Point[];
  /** Optional cached distance field (a leash); kept out of `memory`, which holds numbers only. */
  field?: Int16Array;
  /** Behaviour state (patrol index, phase...); starts empty. */
  memory: Record<string, number>;
  /**
   * Is it in view? Drives `enemySighted`: stays true for a `remembered` type once seen (reported
   * once), follows the sight line for moving types (reported each time it comes back into view).
   */
  seen: boolean;
}

export function createPlayer(pos: Point): Entity {
  return { id: 0, kind: 'player', pos: { ...pos }, glyph: '@', blocksMovement: true };
}

export function isEnemy(entity: Entity): entity is Enemy {
  return entity.kind === 'enemy';
}
