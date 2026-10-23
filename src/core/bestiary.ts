import { BEHAVIORS } from './behaviors';
import { ENEMY_DEFS, ENEMY_TYPE_IDS, type EnemyTypeId } from './enemy-defs';
import { isEnemy } from './entity';
import { type GameEvent } from './events';
import { type GameState } from './game-state';

/** Enemy types that have an entry in the Bestiary: all of them but the Breeder's young. */
export type BestiaryTypeId = Exclude<EnemyTypeId, 'brood'>;

/** The entries, in unlock order (ties in the order of the roster). */
export const BESTIARY_TYPES: readonly BestiaryTypeId[] = ENEMY_TYPE_IDS.filter(
  (id): id is BestiaryTypeId => id !== 'brood',
)
  .map((id, i) => ({ id, i }))
  .sort((a, b) => ENEMY_DEFS[a.id].minFloor - ENEMY_DEFS[b.id].minFloor || a.i - b.i)
  .map(({ id }) => id);

/** The entry a type belongs to: the Breeder's young are read about under the Breeder. */
export function bestiaryEntry(type: EnemyTypeId): BestiaryTypeId {
  return type === 'brood' ? 'breeder' : type;
}

export function isBestiaryType(value: unknown): value is BestiaryTypeId {
  return BESTIARY_TYPES.includes(value as BestiaryTypeId);
}

/**
 * The types a batch of events introduces to the player: one that came into view, warned them,
 * revealed itself or touched them. A disguised Mimic does not count when merely seen (it looks like
 * a life pickup); it counts once it reveals itself. A hidden Lurker is never reported before it
 * reveals itself, so it needs no rule.
 */
export function typesMet(state: GameState, events: readonly GameEvent[]): BestiaryTypeId[] {
  const met = new Set<BestiaryTypeId>();
  for (const event of events) {
    if (
      event.type !== 'enemySighted' &&
      event.type !== 'enemyAlerted' &&
      event.type !== 'enemyRevealed' &&
      event.type !== 'hitEnemy'
    ) {
      continue;
    }
    const enemy = state.entities.find((e) => e.id === event.enemyId);
    if (!enemy || !isEnemy(enemy)) continue;
    const disguised = BEHAVIORS[ENEMY_DEFS[enemy.type].behavior].tone?.(enemy) === 'pickup';
    if (event.type === 'enemySighted' && disguised) continue;
    met.add(bestiaryEntry(enemy.type));
  }
  return [...met];
}
