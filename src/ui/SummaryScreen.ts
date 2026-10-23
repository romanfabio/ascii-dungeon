import { type Screen } from '../app/Screen';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { type Theme } from '../render/themes';

/** Ignore input right after the screen appears so a key still held can't skip it by accident. */
const DEFAULT_GRACE_MS = 600;

const MODIFIER_PREFIXES = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS'];

export interface SummaryLine {
  text: string;
  color: string;
  scale?: number;
}

export interface SummaryScreenOptions {
  getTheme(): Theme;
  onContinue(): void;
  graceMs?: number;
}

/** A centered block of text lines that waits for a key press or tap (Game Over, Victory). */
export abstract class SummaryScreen implements Screen {
  private readonly shownAt = performance.now();
  private done = false;

  constructor(private readonly base: SummaryScreenOptions) {}

  protected abstract lines(theme: Theme): SummaryLine[];

  render(r: GlyphRenderer): void {
    const theme = this.base.getTheme();
    const lines = this.lines(theme);
    const size = Math.round(Math.max(14 * r.dpr, Math.min(r.width, r.height) * 0.045));
    const lineH = (l: SummaryLine): number => Math.round(size * (l.scale ?? 1) * 1.5);
    const total = lines.reduce((sum, l) => sum + lineH(l), 0);

    r.clear(theme.background);
    let y = Math.round((r.height - total) / 2);
    for (const line of lines) {
      const h = lineH(line);
      if (line.text) {
        r.drawText(
          line.text,
          r.width / 2,
          y + h / 2,
          Math.round(size * (line.scale ?? 1)),
          line.color,
          'center',
        );
      }
      y += h;
    }
  }

  onKey(code: string): boolean {
    if (MODIFIER_PREFIXES.some((p) => code.startsWith(p))) return false;
    this.proceed();
    return true;
  }

  onPointerDown(): void {
    this.proceed();
  }

  private proceed(): void {
    if (this.done || performance.now() - this.shownAt < (this.base.graceMs ?? DEFAULT_GRACE_MS)) {
      return;
    }
    this.done = true;
    this.base.onContinue();
  }
}
