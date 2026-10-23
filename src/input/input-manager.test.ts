import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Dir } from '../core/geometry';
import { InputManager } from './input-manager';

describe('InputManager', () => {
  let moves: Dir[];
  let input: InputManager;

  beforeEach(() => {
    vi.useFakeTimers();
    moves = [];
    input = new InputManager((d) => moves.push(d), { delayMs: 180, intervalMs: 90 });
  });
  afterEach(() => {
    input.dispose();
    vi.useRealTimers();
  });

  it('moves once immediately on press', () => {
    input.press('E');
    expect(moves).toEqual(['E']);
  });

  it('repeats after the delay, then at the interval', () => {
    input.press('E');
    vi.advanceTimersByTime(179);
    expect(moves).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(moves).toHaveLength(2);
    vi.advanceTimersByTime(90);
    expect(moves).toHaveLength(3);
    vi.advanceTimersByTime(270);
    expect(moves).toHaveLength(6);
  });

  it('stops repeating on release', () => {
    input.press('S');
    vi.advanceTimersByTime(200);
    input.release('S');
    const count = moves.length;
    vi.advanceTimersByTime(1000);
    expect(moves).toHaveLength(count);
  });

  it('a quick tap moves exactly once', () => {
    input.press('N');
    vi.advanceTimersByTime(50);
    input.release('N');
    vi.advanceTimersByTime(1000);
    expect(moves).toEqual(['N']);
  });

  it('ignores a repeated press of an already-held direction', () => {
    input.press('W');
    input.press('W');
    expect(moves).toEqual(['W']);
  });

  it('the latest direction wins and the previous one resumes on release', () => {
    input.press('N');
    input.press('E');
    expect(moves).toEqual(['N', 'E']);
    vi.advanceTimersByTime(180);
    expect(moves.at(-1)).toBe('E');

    input.release('E');
    const count = moves.length;
    vi.advanceTimersByTime(179);
    expect(moves).toHaveLength(count); // back to N after the delay, no instant move
    vi.advanceTimersByTime(1);
    expect(moves.at(-1)).toBe('N');
  });

  it('releasing a non-active direction does not disturb repeating', () => {
    input.press('N');
    input.press('E');
    input.release('N');
    vi.advanceTimersByTime(180);
    expect(moves.at(-1)).toBe('E');
  });

  it('releaseAll cancels everything', () => {
    input.press('N');
    input.press('E');
    input.releaseAll();
    const count = moves.length;
    vi.advanceTimersByTime(1000);
    expect(moves).toHaveLength(count);
  });
});
