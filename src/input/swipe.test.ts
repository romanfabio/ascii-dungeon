import { beforeEach, describe, expect, it } from 'vitest';
import { SwipeDetector } from './swipe';

describe('SwipeDetector', () => {
  let log: string[];
  let swipe: SwipeDetector;

  beforeEach(() => {
    log = [];
    swipe = new SwipeDetector(
      { press: (d) => log.push(`+${d}`), release: (d) => log.push(`-${d}`) },
      24,
    );
  });

  it('does nothing for a tap or a tiny drag', () => {
    swipe.down(100, 100);
    swipe.move(110, 105);
    swipe.up();
    expect(log).toEqual([]);
  });

  it('a flick presses once and releases on lift (one tile)', () => {
    swipe.down(100, 100);
    swipe.move(100, 60);
    swipe.move(100, 20);
    swipe.up();
    expect(log).toEqual(['+N', '-N']);
  });

  it('picks the dominant axis', () => {
    swipe.down(0, 0);
    swipe.move(30, 10);
    expect(log).toEqual(['+E']);
    swipe.up();
    swipe.down(0, 0);
    swipe.move(-10, 30);
    expect(log).toEqual(['+E', '-E', '+S']);
  });

  it('keeps the direction while the finger stays down (no re-press)', () => {
    swipe.down(0, 0);
    swipe.move(30, 0);
    swipe.move(31, 2);
    swipe.move(35, 3);
    expect(log).toEqual(['+E']);
  });

  it('switches direction after dragging the threshold the other way', () => {
    swipe.down(0, 0);
    swipe.move(30, 0); // E, anchor now (30, 0)
    swipe.move(30, 10); // small drift: still E
    expect(log).toEqual(['+E']);
    swipe.move(30, 40); // 40 px down from the anchor: S
    expect(log).toEqual(['+E', '-E', '+S']);
    swipe.move(0, 40); // 30 px left of the new anchor: W
    expect(log).toEqual(['+E', '-E', '+S', '-S', '+W']);
    swipe.up();
    expect(log.at(-1)).toBe('-W');
  });

  it('ignores moves without a gesture and a new down ends the old one', () => {
    swipe.move(100, 100);
    expect(log).toEqual([]);
    swipe.down(0, 0);
    swipe.move(40, 0);
    swipe.down(500, 500);
    expect(log).toEqual(['+E', '-E']);
    swipe.move(505, 500);
    expect(log).toEqual(['+E', '-E']);
  });

  it('respects a changed threshold', () => {
    swipe.setThreshold(100);
    swipe.down(0, 0);
    swipe.move(50, 0);
    expect(log).toEqual([]);
    swipe.move(120, 0);
    expect(log).toEqual(['+E']);
  });
});
