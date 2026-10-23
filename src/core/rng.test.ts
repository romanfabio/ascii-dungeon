import { describe, expect, it } from 'vitest';
import { createRng, hashString } from './rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds', () => {
    expect(createRng('a').next()).not.toBe(createRng('b').next());
  });

  it('hashString is stable', () => {
    expect(hashString('abc')).toEqual(hashString('abc'));
    expect(hashString('abc')).not.toEqual(hashString('abd'));
  });

  it('next() stays in [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() and range() respect bounds and cover every value', () => {
    const rng = createRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.range(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });

  it('is roughly uniform', () => {
    const rng = createRng('uniform');
    const buckets = new Array<number>(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) buckets[rng.int(10)]!++;
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n * 0.01);
  });

  it('shuffle keeps all elements', () => {
    const rng = createRng('shuffle');
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    rng.shuffle(items);
    expect([...items].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
