import { describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { NO_INSETS } from '../render/layout';
import { DEFAULT_THEME } from '../render/themes';
import { type ScreenContext } from './context';
import { LicensesScreen, licenseLines } from './LicensesScreen';
import licenseText from '../../public/licenses/THIRD_PARTY_LICENSES.txt?raw';

describe('licenseLines', () => {
  it('wraps to the width, keeps blank lines and shrinks a rule of = to fit', () => {
    const lines = licenseLines('=====================\nhello big wide world\n\nx', 10);
    expect(lines).toEqual(['==========', 'hello big', 'wide world', '', 'x']);
    expect(Math.max(...licenseLines(licenseText, 30).map((l) => l.length))).toBeLessThanOrEqual(30);
  });
});

describe('the licence file', () => {
  it('names every licence that ships with the game', () => {
    for (const needle of [
      'MIT License',
      'Capacitor',
      'SIL OPEN FONT LICENSE',
      'JetBrains Mono',
      'Apache License',
      'AndroidX',
      'Apache Cordova',
    ]) {
      expect(licenseText, needle).toContain(needle);
    }
  });
});

function setup(width = 900, height = 2000) {
  setLanguage('en');
  const drawn: string[] = [];
  const noop = (): void => {};
  const renderer = {
    width,
    height,
    dpr: 2.6,
    insets: NO_INSETS,
    clear: noop,
    fillRect: noop,
    drawGlyph: noop,
    drawText: (text: string) => drawn.push(text),
  } as unknown as GlyphRenderer;
  const calls = { back: 0, renders: 0 };
  const ctx: ScreenContext = {
    settings: {} as ScreenContext['settings'],
    getTheme: () => DEFAULT_THEME,
    requestRender: () => calls.renders++,
    isTouch: () => true,
  };
  const screen = new LicensesScreen(ctx, { onBack: () => calls.back++ });
  const shown = (): string[] => {
    drawn.length = 0;
    screen.render(renderer);
    return [...drawn];
  };
  return { screen, calls, shown };
}

describe('the Licenses screen', () => {
  it('shows page 1 with a back bar, and pages with keys, wait and taps', () => {
    const { screen, shown } = setup();
    const first = shown();
    expect(first).toContain('< Back');
    expect(first.some((l) => l.startsWith('1/'))).toBe(true);
    expect(first).toContain('ASCII DUNGEON: LICENCES');

    screen.onKey('Space');
    expect(shown().some((l) => l.startsWith('2/'))).toBe(true);
    screen.onWait();
    expect(shown().some((l) => l.startsWith('3/'))).toBe(true);
    screen.onMove('N');
    expect(shown().some((l) => l.startsWith('2/'))).toBe(true);
    screen.onPointerDown(450, 1800); // lower half: next
    expect(shown().some((l) => l.startsWith('3/'))).toBe(true);
    screen.onPointerDown(450, 400); // upper half: previous
    screen.onPointerDown(450, 400);
    screen.onPointerDown(450, 400); // already on the first page: stays
    expect(shown().some((l) => l.startsWith('1/'))).toBe(true);
  });

  it('can reach the last page, the Apache text included, and never goes past it', () => {
    const { screen, shown } = setup();
    shown();
    const text: string[] = [];
    for (let i = 0; i < 60; i++) {
      text.push(...shown());
      screen.onKey('PageDown');
    }
    expect(text.join(' ')).toContain('END OF TERMS AND CONDITIONS');
    const last = shown().find((l) => /^\d+\/\d+$/.test(l)) as string;
    const [page, pages] = last.split('/');
    expect(page).toBe(pages);
  });

  it('goes back with Esc or a tap on the top bar', () => {
    const { screen, calls, shown } = setup();
    shown();
    screen.onKey('Escape');
    screen.onPointerDown(100, 10);
    expect(calls.back).toBe(2);
  });
});
