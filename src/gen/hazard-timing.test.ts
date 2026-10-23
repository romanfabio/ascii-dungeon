import { describe, expect, it } from 'vitest';
import { parseMap } from '../core/floor-map';
import { type PeriodicHazard } from '../core/hazards';
import { routeSurvivable } from './hazard-timing';

describe('routeSurvivable with tiles you must not stop on', () => {
  const map = parseMap(['#######', '#@...!#', '#######']);
  // The tile at x = 3 hurts on phases 0 and 1 of 4: you can only step onto it on phase 2.
  const gate: PeriodicHazard = {
    period: 4,
    hurtAt: (phase) => (phase < 2 ? [{ x: 3, y: 1 }] : []),
  };
  const at = (...xs: number[]) => xs.map((x) => ({ x, y: 1 }));

  it('needs a wait on the way, which is fine while waiting is allowed', () => {
    expect(routeSurvivable(map, [gate])).toBe(true);
  });

  it('is false when every tile where the wait could happen is a no-stop tile', () => {
    expect(routeSurvivable(map, [gate], at(1, 2))).toBe(false);
  });

  it('is true when a quiet tile remains, and when the no-stop tiles are off the route', () => {
    expect(routeSurvivable(map, [gate], at(2))).toBe(true); // wait at the start instead
    expect(routeSurvivable(map, [gate], at(4))).toBe(true);
    expect(routeSurvivable(map, [gate], [{ x: 1, y: 3 }])).toBe(true);
  });

  it('never blocks a dash: with nothing timed, no-stop tiles change nothing', () => {
    expect(routeSurvivable(map, [], at(1, 2, 3, 4))).toBe(true);
  });
});
