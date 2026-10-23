import { describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { NO_INSETS } from '../render/layout';
import { DEFAULT_THEME } from '../render/themes';
import { type ScreenContext } from './context';
import { MenuScreen } from './MenuScreen';
import { type MenuItem } from './text-ui';

class TestMenu extends MenuScreen {
  protected title(): string {
    return 'TEST';
  }
  protected items(): MenuItem[] {
    return [{ label: 'One' }];
  }
  protected activate(): void {}
}

function texts(touch: boolean, width = 900): string[] {
  const drawn: string[] = [];
  const noop = (): void => {};
  const renderer = {
    width,
    height: 2000,
    dpr: 2.6,
    insets: NO_INSETS,
    clear: noop,
    fillRect: noop,
    drawGlyph: noop,
    drawText: (text: string) => drawn.push(text),
  } as unknown as GlyphRenderer;
  const ctx: ScreenContext = {
    settings: {} as ScreenContext['settings'],
    getTheme: () => DEFAULT_THEME,
    requestRender: noop,
    isTouch: () => touch,
  };
  new TestMenu(ctx).render(renderer);
  return drawn;
}

describe('MenuScreen footer hint', () => {
  it('explains the keys with a keyboard or mouse', () => {
    setLanguage('en');
    expect(texts(false)).toContain('Move keys: select / change   Enter: OK   Esc: back');
  });

  it('is left out on a touch screen, where it is meaningless and wider than a phone', () => {
    setLanguage('en');
    const drawn = texts(true);
    expect(drawn).toContain('One');
    expect(drawn.some((t) => t.includes('Esc'))).toBe(false);
  });
});
