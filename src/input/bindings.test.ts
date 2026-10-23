import { describe, expect, it } from 'vitest';
import {
  areBindingsValid,
  assignKey,
  buildKeyMap,
  cloneBindings,
  DEFAULT_MOVE_BINDINGS,
  keyName,
} from './bindings';

describe('bindings', () => {
  it('defaults are valid and map WASD + arrows', () => {
    expect(areBindingsValid(DEFAULT_MOVE_BINDINGS)).toBe(true);
    const map = buildKeyMap(DEFAULT_MOVE_BINDINGS);
    expect(map.get('KeyW')).toBe('N');
    expect(map.get('ArrowLeft')).toBe('W');
    expect(map.size).toBe(8);
  });

  it('detects invalid bindings', () => {
    const dup = cloneBindings(DEFAULT_MOVE_BINDINGS);
    dup.E = ['KeyW'];
    expect(areBindingsValid(dup)).toBe(false);
    const empty = cloneBindings(DEFAULT_MOVE_BINDINGS);
    empty.S = [];
    expect(areBindingsValid(empty)).toBe(false);
    const reserved = cloneBindings(DEFAULT_MOVE_BINDINGS);
    reserved.S = ['Escape'];
    expect(areBindingsValid(reserved)).toBe(false);
  });

  it('assignKey replaces the primary key and keeps the secondary', () => {
    const r = assignKey(DEFAULT_MOVE_BINDINGS, 'N', 'KeyI');
    expect(r).toEqual({
      ok: true,
      bindings: { ...DEFAULT_MOVE_BINDINGS, N: ['KeyI', 'ArrowUp'] },
    });
  });

  it('assignKey does not mutate its input', () => {
    const before = cloneBindings(DEFAULT_MOVE_BINDINGS);
    assignKey(DEFAULT_MOVE_BINDINGS, 'N', 'KeyI');
    expect(DEFAULT_MOVE_BINDINGS).toEqual(before);
  });

  it('assignKey refuses keys used by another direction', () => {
    expect(assignKey(DEFAULT_MOVE_BINDINGS, 'N', 'KeyD')).toEqual({
      ok: false,
      reason: 'inUse',
      dir: 'E',
    });
  });

  it('assignKey refuses reserved keys', () => {
    expect(assignKey(DEFAULT_MOVE_BINDINGS, 'N', 'Escape')).toEqual({
      ok: false,
      reason: 'reserved',
    });
  });

  it('assigning a direction its own secondary key leaves no duplicates', () => {
    const r = assignKey(DEFAULT_MOVE_BINDINGS, 'N', 'ArrowUp');
    expect(r.ok && r.bindings.N).toEqual(['ArrowUp']);
  });

  it('keyName is readable', () => {
    expect(keyName('KeyW')).toBe('W');
    expect(keyName('ArrowUp')).toBe('Up');
    expect(keyName('Digit4')).toBe('4');
    expect(keyName('Numpad8')).toBe('Num8');
    expect(keyName('Space')).toBe('Space');
  });
});
