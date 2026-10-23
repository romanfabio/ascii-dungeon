import { describe, expect, it } from 'vitest';
import {
  enemyCountForFloor,
  FINAL_FLOOR,
  LAST_ROOMS_FLOOR,
  MAX_ENEMIES,
  MAX_SIZE,
  MAX_SIZE_FLOOR,
  paramsForFloor,
  sizeForFloor,
} from './difficulty';

describe('paramsForFloor', () => {
  const floors = Array.from({ length: FINAL_FLOOR }, (_, i) => paramsForFloor(i + 1));

  it('the run is 100 floors long', () => {
    expect(FINAL_FLOOR).toBe(100);
    expect(floors).toHaveLength(100);
  });

  it('always produces odd sizes, from 21 up to MAX_SIZE', () => {
    for (const p of floors) {
      expect(p.size % 2).toBe(1);
      expect(p.size).toBeLessThanOrEqual(MAX_SIZE);
    }
    expect(floors[0]!.size).toBe(21);
    expect(sizeForFloor(MAX_SIZE_FLOOR)).toBe(MAX_SIZE);
    expect(floors[29]!.size).toBeLessThan(MAX_SIZE); // still growing at floor 30
    expect(floors[FINAL_FLOOR - 1]!.size).toBe(MAX_SIZE);
  });

  it('moves every difficulty lever in one direction', () => {
    for (let i = 1; i < floors.length; i++) {
      const prev = floors[i - 1]!;
      const cur = floors[i]!;
      expect(cur.size).toBeGreaterThanOrEqual(prev.size);
      expect(cur.newestBias).toBeGreaterThanOrEqual(prev.newestBias);
      expect(cur.braidFactor).toBeLessThanOrEqual(prev.braidFactor);
      expect(cur.sightRadius).toBeLessThanOrEqual(prev.sightRadius);
      expect(cur.exitPercentile).toBeGreaterThanOrEqual(prev.exitPercentile);
      expect(cur.enemyCount).toBeGreaterThanOrEqual(prev.enemyCount);
    }
  });

  it('ramps gradually over the whole run and ends at the maximum on the final floor', () => {
    const last = floors[FINAL_FLOOR - 1]!;
    expect(last.newestBias).toBe(1);
    expect(last.braidFactor).toBe(0);
    expect(last.sightRadius).toBe(4);
    expect(last.exitPercentile).toBe(1);
    // Still easing in around the old plateau at floor 15.
    expect(floors[14]!.newestBias).toBeLessThan(0.5);
    expect(floors[14]!.sightRadius).toBeGreaterThanOrEqual(9);
    for (const p of floors) {
      expect(p.newestBias).toBeGreaterThanOrEqual(0);
      expect(p.newestBias).toBeLessThanOrEqual(1);
      expect(p.braidFactor).toBeGreaterThanOrEqual(0);
      expect(p.exitPercentile).toBeLessThanOrEqual(1);
      expect(p.sightRadius).toBeGreaterThanOrEqual(4);
    }
  });

  it('floors past the end behave like the final floor', () => {
    expect({ ...paramsForFloor(150), floor: FINAL_FLOOR }).toEqual(floors[FINAL_FLOOR - 1]);
  });

  it('uses rooms for the first floors and mazes afterwards', () => {
    expect(floors.slice(0, LAST_ROOMS_FLOOR).every((p) => p.generator === 'rooms-and-mazes')).toBe(
      true,
    );
    expect(floors.slice(LAST_ROOMS_FLOOR).every((p) => p.generator === 'growing-tree')).toBe(true);
  });

  it('has no enemies on floor 1, then more of them evenly up to the cap on the final floor', () => {
    expect([1, 2, 3, 10, 50, 99, 100, 130].map(enemyCountForFloor)).toEqual([
      0, 1, 1, 3, 12, 24, 24, 24,
    ]);
    expect(MAX_ENEMIES).toBe(24);
  });

  it('unlocks enemy types gradually', () => {
    expect(paramsForFloor(1).enemyTypes).toEqual([]);
    expect(paramsForFloor(2).enemyTypes).toEqual(['bloodstone']);
    expect(paramsForFloor(7).enemyTypes).toEqual(['bloodstone']);
    expect(paramsForFloor(8).enemyTypes).toEqual(['bloodstone', 'patroller']);
    expect(paramsForFloor(11).enemyTypes).toEqual(['bloodstone', 'patroller']);
    expect(paramsForFloor(12).enemyTypes).toEqual(['bloodstone', 'patroller', 'wanderer']);
    expect(paramsForFloor(19).enemyTypes).toEqual(['bloodstone', 'patroller', 'wanderer']);
    expect(paramsForFloor(20).enemyTypes).toEqual(['bloodstone', 'patroller', 'wanderer', 'spear']);
    expect(paramsForFloor(23).enemyTypes).not.toContain('sentinel');
    expect(paramsForFloor(24).enemyTypes).toContain('sentinel');
    expect(paramsForFloor(27).enemyTypes).not.toContain('sleeper');
    expect(paramsForFloor(28).enemyTypes).toContain('sleeper');
    expect(paramsForFloor(29).enemyTypes).not.toContain('blinker');
    expect(paramsForFloor(30).enemyTypes).toContain('blinker');
    expect(paramsForFloor(31).enemyTypes).not.toContain('bouncer');
    expect(paramsForFloor(32).enemyTypes).toContain('bouncer');
    expect(paramsForFloor(34).enemyTypes).not.toContain('chaser');
    expect(paramsForFloor(43).enemyTypes).not.toContain('sweeper');
    expect(paramsForFloor(44).enemyTypes).toContain('sweeper');
    expect(paramsForFloor(47).enemyTypes).not.toContain('pendulum');
    expect(paramsForFloor(48).enemyTypes).toContain('pendulum');
    expect(paramsForFloor(51).enemyTypes).not.toContain('lurker');
    expect(paramsForFloor(52).enemyTypes).toContain('lurker');
    expect(paramsForFloor(64).enemyTypes).not.toContain('ghost');
    expect(paramsForFloor(65).enemyTypes).toContain('ghost');
    expect(paramsForFloor(71).enemyTypes).not.toContain('breeder');
    expect(paramsForFloor(72).enemyTypes).toContain('breeder');
    expect(paramsForFloor(100).enemyTypes).not.toContain('brood');
    expect(paramsForFloor(39).enemyTypes).not.toContain('shade');
    expect(paramsForFloor(40).enemyTypes).toContain('shade');
    expect(paramsForFloor(35).enemyTypes).toEqual([
      'bloodstone',
      'patroller',
      'wanderer',
      'spear',
      'bouncer',
      'sentinel',
      'blinker',
      'sleeper',
      'chaser',
    ]);
  });
});
