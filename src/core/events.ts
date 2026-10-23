import { type Point } from './geometry';

/** What happened as the result of an action; consumed by the UI layer. */
export type GameEvent =
  | { type: 'moved'; from: Point; to: Point }
  | { type: 'bumped'; at: Point }
  | { type: 'reachedExit' }
  | { type: 'hitEnemy'; enemyId: number; at: Point }
  | { type: 'enemySighted'; enemyId: number }
  | { type: 'enemyAlerted'; enemyId: number }
  | { type: 'enemySpawned'; enemyId: number }
  | { type: 'enemyRevealed'; enemyId: number }
  | { type: 'blinded'; turns: number }
  | { type: 'shoved'; tiles: number }
  | { type: 'pickupSighted' }
  | { type: 'lifeGained'; livesNow: number; floor: number }
  | { type: 'lifeFull' }
  | { type: 'lifeLost'; livesLeft: number }
  | { type: 'gameOver' };
