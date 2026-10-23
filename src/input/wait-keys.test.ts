import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings } from '../save/settings';
import {
  areBindingsValid,
  areWaitKeysValid,
  assignKey,
  assignWaitKey,
  DEFAULT_MOVE_BINDINGS,
  DEFAULT_WAIT_KEYS,
  keyName,
} from './bindings';

describe('wait keys', () => {
  it('default to Space and the full stop, and are valid next to the movement keys', () => {
    expect(DEFAULT_WAIT_KEYS).toEqual(['Space', 'Period']);
    expect(areBindingsValid(DEFAULT_MOVE_BINDINGS)).toBe(true);
    expect(keyName('Space')).toBe('Space');
    expect(keyName('Period')).toBe('.');
  });

  it('a movement binding cannot take a wait key, and the wait key cannot take a movement key', () => {
    expect(assignKey(DEFAULT_MOVE_BINDINGS, 'N', 'Space')).toEqual({
      ok: false,
      reason: 'inUse',
      dir: 'wait',
    });
    expect(assignWaitKey(DEFAULT_WAIT_KEYS, DEFAULT_MOVE_BINDINGS, 'KeyW')).toEqual({
      ok: false,
      reason: 'inUse',
      dir: 'N',
    });
    expect(assignWaitKey(DEFAULT_WAIT_KEYS, DEFAULT_MOVE_BINDINGS, 'Escape')).toEqual({
      ok: false,
      reason: 'reserved',
    });
  });

  it('assignWaitKey makes the new key primary and keeps the second one', () => {
    const r = assignWaitKey(DEFAULT_WAIT_KEYS, DEFAULT_MOVE_BINDINGS, 'KeyX');
    expect(r.ok && r.waitKeys).toEqual(['KeyX', 'Period']);
    const same = assignWaitKey(DEFAULT_WAIT_KEYS, DEFAULT_MOVE_BINDINGS, 'Period');
    expect(same.ok && same.waitKeys).toEqual(['Period']);
  });

  it('validates a list of wait keys', () => {
    expect(areWaitKeysValid(['Space'])).toBe(true);
    expect(areWaitKeysValid([])).toBe(false);
    expect(areWaitKeysValid(['Space', 'Space'])).toBe(false);
    expect(areWaitKeysValid(['Enter'])).toBe(false);
    expect(areWaitKeysValid('Space')).toBe(false);
  });
});

describe('wait keys in settings', () => {
  it('older settings without them get the defaults', () => {
    const old = { ...defaultSettings() } as Record<string, unknown>;
    delete old.waitKeys;
    expect(parseSettings(JSON.stringify(old)).waitKeys).toEqual(DEFAULT_WAIT_KEYS);
  });

  it('keeps custom wait keys', () => {
    const s = { ...defaultSettings(), waitKeys: ['KeyX'] };
    expect(parseSettings(JSON.stringify(s)).waitKeys).toEqual(['KeyX']);
  });

  it('a wait key that clashes with a movement key resets both to the defaults', () => {
    const s = { ...defaultSettings(), waitKeys: ['KeyW'] };
    const parsed = parseSettings(JSON.stringify(s));
    expect(parsed.waitKeys).toEqual(DEFAULT_WAIT_KEYS);
    expect(parsed.bindings).toEqual(DEFAULT_MOVE_BINDINGS);
  });

  it('a stored movement binding on Space (from before waiting existed) falls back cleanly', () => {
    const s = { ...defaultSettings(), bindings: { ...DEFAULT_MOVE_BINDINGS, N: ['Space'] } };
    const parsed = parseSettings(JSON.stringify(s));
    expect(parsed.bindings).toEqual(DEFAULT_MOVE_BINDINGS);
    expect(parsed.waitKeys).toEqual(DEFAULT_WAIT_KEYS);
  });
});
