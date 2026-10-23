import { DIRS, type Dir } from '../core/geometry';

/** Physical key codes (KeyboardEvent.code), so WASD works on any keyboard layout. */
export type MoveBindings = Record<Dir, string[]>;

export const DEFAULT_MOVE_BINDINGS: MoveBindings = {
  N: ['KeyW', 'ArrowUp'],
  E: ['KeyD', 'ArrowRight'],
  S: ['KeyS', 'ArrowDown'],
  W: ['KeyA', 'ArrowLeft'],
};

/** Keys that wait one turn (the spear and other timed hazards make waiting a real move). */
export const DEFAULT_WAIT_KEYS: readonly string[] = ['Space', 'Period'];

/** Keys with a fixed meaning that cannot be bound to a direction. */
const RESERVED_KEYS = new Set(['Escape', 'Enter', 'NumpadEnter', 'F3']);

export function isReservedKey(code: string): boolean {
  return RESERVED_KEYS.has(code);
}

/** True if the list is a usable set of wait keys (at least one, no duplicates, nothing reserved). */
export function areWaitKeysValid(keys: unknown): keys is string[] {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    new Set(keys).size === keys.length &&
    keys.every((k) => typeof k === 'string' && k !== '' && !isReservedKey(k))
  );
}

export function cloneBindings(b: MoveBindings): MoveBindings {
  return { N: [...b.N], E: [...b.E], S: [...b.S], W: [...b.W] };
}

export function buildKeyMap(bindings: MoveBindings): Map<string, Dir> {
  const map = new Map<string, Dir>();
  for (const dir of DIRS) {
    for (const code of bindings[dir]) map.set(code, dir);
  }
  return map;
}

/** Every direction has at least one key, and no key is bound twice (nor to waiting). */
export function areBindingsValid(
  b: MoveBindings,
  waitKeys: readonly string[] = DEFAULT_WAIT_KEYS,
): boolean {
  const seen = new Set<string>(waitKeys);
  for (const dir of DIRS) {
    const keys = b[dir];
    if (!Array.isArray(keys) || keys.length === 0) return false;
    for (const code of keys) {
      if (typeof code !== 'string' || code === '' || isReservedKey(code) || seen.has(code)) {
        return false;
      }
      seen.add(code);
    }
  }
  return true;
}

export type AssignResult =
  | { ok: true; bindings: MoveBindings }
  | { ok: false; reason: 'reserved' }
  | { ok: false; reason: 'inUse'; dir: Dir | 'wait' };

/**
 * Makes `code` the primary key of `dir`, keeping that direction's secondary key. Refuses reserved
 * keys and keys already used by another direction (the caller shows why).
 */
export function assignKey(
  bindings: MoveBindings,
  dir: Dir,
  code: string,
  waitKeys: readonly string[] = DEFAULT_WAIT_KEYS,
): AssignResult {
  if (isReservedKey(code)) return { ok: false, reason: 'reserved' };
  if (waitKeys.includes(code)) return { ok: false, reason: 'inUse', dir: 'wait' };
  for (const other of DIRS) {
    if (other !== dir && bindings[other].includes(code)) {
      return { ok: false, reason: 'inUse', dir: other };
    }
  }
  const next = cloneBindings(bindings);
  next[dir] = [code, ...bindings[dir].slice(1).filter((c) => c !== code)];
  return { ok: true, bindings: next };
}

export type AssignWaitResult =
  | { ok: true; waitKeys: string[] }
  | { ok: false; reason: 'reserved' }
  | { ok: false; reason: 'inUse'; dir: Dir };

/** Makes `code` the primary wait key, keeping the secondary one. */
export function assignWaitKey(
  waitKeys: readonly string[],
  bindings: MoveBindings,
  code: string,
): AssignWaitResult {
  if (isReservedKey(code)) return { ok: false, reason: 'reserved' };
  for (const dir of DIRS) {
    if (bindings[dir].includes(code)) return { ok: false, reason: 'inUse', dir };
  }
  return { ok: true, waitKeys: [code, ...waitKeys.slice(1).filter((c) => c !== code)] };
}

/** Human-readable key name: "KeyW" -> "W", "ArrowUp" -> "Up". */
export function keyName(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  if (code === 'Period') return '.';
  if (code === 'Space') return 'Space';
  return code;
}
