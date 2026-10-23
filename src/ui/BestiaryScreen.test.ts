import { describe, expect, it } from 'vitest';
import { type BestiaryTypeId, BESTIARY_TYPES } from '../core/bestiary';
import { en } from '../i18n/en';
import { it as italian } from '../i18n/it';
import { setLanguage } from '../i18n/i18n';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { NO_INSETS } from '../render/layout';
import { DEFAULT_THEME } from '../render/themes';
import { BestiaryScreen } from './BestiaryScreen';
import { type ScreenContext } from './context';
import { wrapText } from './text-ui';

function setup(seen: readonly BestiaryTypeId[]) {
  const drawn: { text: string; size: number }[] = [];
  const noop = (): void => {};
  const renderer = {
    width: 1080,
    height: 2200,
    dpr: 2.6,
    insets: NO_INSETS,
    clear: noop,
    fillRect: noop,
    drawGlyph: noop,
    drawText: (text: string, _x: number, _y: number, size: number) => drawn.push({ text, size }),
  } as unknown as GlyphRenderer;
  const calls = { back: 0, renders: 0 };
  const ctx: ScreenContext = {
    settings: {} as ScreenContext['settings'],
    getTheme: () => DEFAULT_THEME,
    requestRender: () => calls.renders++,
    isTouch: () => false,
  };
  const screen = new BestiaryScreen(ctx, {
    seen,
    onBack: () => calls.back++,
  });
  const texts = (): string[] => {
    drawn.length = 0;
    screen.render(renderer);
    return drawn.map((d) => d.text);
  };
  return { screen, calls, texts, drawn };
}

describe('wrapText', () => {
  it('breaks at spaces and keeps long words whole', () => {
    expect(wrapText('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapText('abcdefghij kl', 5)).toEqual(['abcdefghij', 'kl']);
    expect(wrapText('', 5)).toEqual([]);
  });
});

describe('the Bestiary screen', () => {
  it('says nothing is met yet, and counts the entries', () => {
    setLanguage('en');
    const { texts } = setup([]);
    const shown = texts();
    expect(shown).toContain('BESTIARY');
    expect(shown).toContain('Nothing met yet');
    expect(shown).toContain(`Met: 0 of ${BESTIARY_TYPES.length}`);
  });

  it('lists only the types met, in unlock order, and opens an entry with a key or tap', () => {
    setLanguage('en');
    const { screen, texts, calls } = setup(['ghost', 'bloodstone']);
    const list = texts();
    expect(list).toContain(`Met: 2 of ${BESTIARY_TYPES.length}`);
    expect(list.indexOf('#  Bloodstone')).toBeGreaterThan(-1);
    expect(list.indexOf('#  Bloodstone')).toBeLessThan(list.indexOf('g  Ghost'));
    expect(list.some((t) => t.includes('Mimic'))).toBe(false);

    screen.onKey('Enter'); // the first entry
    const detail = texts();
    expect(detail).toContain('Bloodstone');
    expect(detail.join(' ')).toContain('never moves');
    expect(detail.join(' ')).toContain('You will see:');

    screen.onMove('E'); // the next entry
    expect(texts()).toContain('Ghost');
    screen.onKey('Escape'); // back to the list, not out
    expect(calls.back).toBe(0);
    expect(texts()).toContain('g  Ghost');
    screen.onKey('Escape');
    expect(calls.back).toBe(1);
  });

  it('has a text, a name and a tell in English and Italian for every entry', () => {
    for (const type of BESTIARY_TYPES) {
      const stem = `beast${type[0]?.toUpperCase()}${type.slice(1)}`;
      for (const suffix of ['', 'Text', 'Tell']) {
        const key = `${stem}${suffix}` as keyof typeof en;
        expect(en[key], `en ${key}`).toBeTruthy();
        expect(italian[key], `it ${key}`).toBeTruthy();
      }
    }
  });

  it('draws every entry in both languages without a line wider than the screen', () => {
    for (const language of ['en', 'it'] as const) {
      setLanguage(language);
      const { screen, texts, drawn } = setup([...BESTIARY_TYPES]);
      texts();
      screen.onKey('Enter');
      for (let i = 0; i < BESTIARY_TYPES.length; i++) {
        texts();
        for (const d of drawn) {
          // monospace glyphs are about 0.6 em wide
          expect(d.text.length * d.size * 0.6, `${language} ${d.text}`).toBeLessThanOrEqual(1080);
        }
        screen.onMove('E');
      }
    }
    setLanguage('en');
  });
});
