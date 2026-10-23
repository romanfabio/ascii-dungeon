import { describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/i18n';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { NO_INSETS } from '../render/layout';
import { DEFAULT_THEME } from '../render/themes';
import { GameOverScreen } from './GameOverScreen';
import { VictoryScreen } from './VictoryScreen';

function recorder(): { renderer: GlyphRenderer; texts: string[] } {
  const texts: string[] = [];
  const noop = (): void => {};
  const renderer = {
    width: 800,
    height: 600,
    dpr: 1,
    insets: NO_INSETS,
    clear: noop,
    fillRect: noop,
    drawGlyph: noop,
    drawText: (text: string) => texts.push(text),
  } as unknown as GlyphRenderer;
  return { renderer, texts };
}

const SUMMARY = { floor: 100, totalSteps: 31415, totalTimeMs: 3_725_000, deaths: 4, lives: 1 };

describe('VictoryScreen', () => {
  it('shows the run totals', () => {
    setLanguage('en');
    const { renderer, texts } = recorder();
    new VictoryScreen({
      summary: SUMMARY,
      getTheme: () => DEFAULT_THEME,
      onContinue: () => {},
    }).render(renderer);
    expect(texts).toContain('YOU ESCAPED!');
    expect(texts).toContain('All 100 floors cleared');
    expect(texts).toContain('STEPS  31415');
    expect(texts).toContain('TIME   62:05');
    expect(texts).toContain('LIVES LOST  4');
    expect(texts).toContain('LIVES LEFT  1');
  });

  it('ignores input during the grace period, then any key or tap continues once', () => {
    const onContinue = vi.fn();
    const screen = new VictoryScreen({
      summary: SUMMARY,
      getTheme: () => DEFAULT_THEME,
      onContinue,
    });
    screen.onKey('Space'); // right after it appears: ignored
    screen.onPointerDown();
    expect(onContinue).not.toHaveBeenCalled();

    const ready = new VictoryScreen({
      summary: SUMMARY,
      getTheme: () => DEFAULT_THEME,
      onContinue,
      graceMs: 0,
    });
    expect(ready.onKey('ShiftLeft')).toBe(false); // a modifier alone does not count
    expect(onContinue).not.toHaveBeenCalled();
    ready.onKey('Space');
    ready.onPointerDown();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('GameOverScreen', () => {
  it('shows the floor reached and the totals', () => {
    setLanguage('en');
    const { renderer, texts } = recorder();
    new GameOverScreen({
      summary: { floor: 12, totalSteps: 900, totalTimeMs: 61_000, deaths: 3 },
      getTheme: () => DEFAULT_THEME,
      onContinue: () => {},
    }).render(renderer);
    expect(texts).toContain('GAME OVER');
    expect(texts).toContain('You reached floor 12');
    expect(texts).toContain('LIVES LOST  3');
  });
});
