import { type Dir } from './geometry';

/** Something the player (later: any actor) can do on its turn. */
export type Action = { type: 'move'; dir: Dir } | { type: 'wait' }; // future: 'pickup', 'use', 'attack'...
