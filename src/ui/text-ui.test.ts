import { describe, expect, it } from 'vitest';
import { fitMenuFont, fitTextSize, TextMenu, type MenuItem } from './text-ui';

describe('fitTextSize', () => {
  it('keeps the size when the text fits and shrinks it when it does not', () => {
    expect(fitTextSize('Back', 20, 400)).toBe(20);
    const text = 'Move keys: select / change   Enter: OK   Esc: back';
    const fitted = fitTextSize(text, 24, 300);
    expect(fitted).toBeLessThan(24);
    expect(text.length * 0.6 * fitted).toBeLessThanOrEqual(300);
  });

  it('never goes below a readable minimum, and ignores empty text', () => {
    expect(fitTextSize('a very long line of text indeed', 20, 10)).toBe(8);
    expect(fitTextSize('', 20, 10)).toBe(20);
  });
});

describe('fitMenuFont', () => {
  const items: MenuItem[] = [
    { label: 'Language', value: 'English' },
    { label: 'Theme', value: 'High contrast' },
    { label: 'Back' },
  ];

  it('keeps the font when everything fits', () => {
    expect(fitMenuFont(20, 1000, items)).toBe(20);
  });

  it('shrinks the font so the longest column fits half the width', () => {
    const base = 40;
    const width = 400;
    const fitted = fitMenuFont(base, width, items);
    expect(fitted).toBeLessThan(base);
    const margin = Math.round(base * 0.8);
    const gap = Math.round(base * 0.7);
    const half = width / 2 - margin - gap;
    // "High contrast" (13 chars) must fit in the half-width column at the fitted size
    expect(13 * 0.6 * fitted).toBeLessThanOrEqual(half + 1);
  });

  it('never goes below a readable minimum', () => {
    expect(fitMenuFont(40, 40, items)).toBeGreaterThanOrEqual(8);
  });
});

describe('TextMenu.move', () => {
  const items: MenuItem[] = [{ label: 'a' }, { label: 'b', disabled: true }, { label: 'c' }];

  it('skips disabled rows and wraps around', () => {
    const menu = new TextMenu();
    menu.move(1, items);
    expect(menu.selected).toBe(2);
    menu.move(1, items);
    expect(menu.selected).toBe(0);
    menu.move(-1, items);
    expect(menu.selected).toBe(2);
  });
});
