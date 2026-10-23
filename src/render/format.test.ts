import { describe, expect, it } from 'vitest';
import { formatTime } from './format';

describe('formatTime', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1000, '00:01'],
    [83_000, '01:23'],
    [3_600_000, '60:00'],
    [7_385_000, '123:05'],
    [-5, '00:00'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatTime(ms)).toBe(expected);
  });
});
