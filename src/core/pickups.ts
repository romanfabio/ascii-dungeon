import { type GameEvent } from './events';
import { type GameState } from './game-state';
import { type Point, pointsEqual } from './geometry';
import { gainLife } from './lives';

/** Collectables lying on a floor. Only the extra life exists so far. */
export type PickupType = 'life';

/** Where a pickup lies when the floor is generated. Pickups are not part of the tile map. */
export interface PickupSpawn {
  type: PickupType;
  pos: Point;
}

/** A pickup still on the floor of a running game. */
export interface Pickup extends PickupSpawn {
  /** Has it been in view yet? Drives `pickupSighted` (reported once). */
  seen: boolean;
}

/** The character a pickup is written with in ASCII maps (and drawn with). */
export const PICKUP_CHARS: Readonly<Record<PickupType, string>> = { life: '+' };

export function pickupTypeForMapChar(ch: string): PickupType | undefined {
  return (Object.keys(PICKUP_CHARS) as PickupType[]).find((t) => PICKUP_CHARS[t] === ch);
}

export function createPickup(spawn: PickupSpawn): Pickup {
  return { type: spawn.type, pos: { ...spawn.pos }, seen: false };
}

function inSight(state: GameState, pickup: Pickup): boolean {
  return state.visible[pickup.pos.y * state.floor.width + pickup.pos.x] === 1;
}

/**
 * The player stands on a tile: picks up whatever lies there. A life is only taken while one is
 * missing; at full lives it stays where it is and `lifeFull` explains why nothing happened.
 */
export function collectPickups(state: GameState): GameEvent[] {
  const index = state.pickups.findIndex((p) => pointsEqual(p.pos, state.player.pos));
  if (index < 0) return [];
  if (state.lives >= state.maxLives) return [{ type: 'lifeFull' }];
  state.pickups.splice(index, 1);
  gainLife(state);
  return [{ type: 'lifeGained', livesNow: state.lives, floor: state.floor.floorNumber }];
}

/** Reports a `pickupSighted` for every pickup that has just come into view. */
export function detectPickupSightings(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const pickup of state.pickups) {
    if (pickup.seen || !inSight(state, pickup)) continue;
    pickup.seen = true;
    events.push({ type: 'pickupSighted' });
  }
  return events;
}

/** Marks the pickups already in view as seen without an event (the start of a floor). */
export function markVisiblePickupsSeen(state: GameState): void {
  for (const pickup of state.pickups) if (inSight(state, pickup)) pickup.seen = true;
}
