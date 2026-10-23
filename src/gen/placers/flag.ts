import { type Placer } from './types';

/**
 * A floor flag with no tile of its own (the Shadow): the `;shadow` directive, set by
 * `gen/shadow.ts`, stands for it. The drawing loop never places it, and a finished floor must not
 * list it as a spawn.
 */
export const flagPlacer: Placer = {
  place() {
    return null;
  },
  validate(_ctx, _spawn, where) {
    return { problems: [`${where} is a floor flag, not a spawn`], fatal: true };
  },
};
