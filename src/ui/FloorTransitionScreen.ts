import { type Screen } from '../app/Screen';
import { t } from '../i18n/i18n';
import { formatTime } from '../render/format';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { type Theme } from '../render/themes';
import { type FloorSummary } from './GameScreen';

/** Ignore input right after the screen appears so a held key can't skip it by accident. */
const INPUT_GRACE_MS = 350;

const MODIFIER_PREFIXES = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS'];

interface Line {
  text: string;
  color: string;
  scale?: number;
}

export interface FloorTransitionOptions {
  summary: FloorSummary;
  getTheme(): Theme;
  onContinue(): void;
}

/** Shown between floors: what you just did, then waits for a key press or tap. */
export class FloorTransitionScreen implements Screen {
  private readonly shownAt = performance.now();
  private done = false;

  constructor(private readonly opts: FloorTransitionOptions) {}

  render(r: GlyphRenderer): void {
    const { summary } = this.opts;
    const theme = this.opts.getTheme();
    const lines: Line[] = [
      { text: t('floorCleared', { floor: summary.floor }), color: theme.exit, scale: 1.5 },
      { text: '', color: theme.hudText },
      {
        text: t('clearedSteps', { steps: summary.steps, best: summary.bestSteps }),
        color: theme.hudText,
      },
      { text: t('clearedTime', { time: formatTime(summary.timeMs) }), color: theme.hudText },
      { text: '', color: theme.hudText },
      { text: t('descending', { floor: summary.floor + 1 }), color: theme.player },
      { text: '', color: theme.hudText },
      { text: t('pressToContinue'), color: theme.hudDim, scale: 0.8 },
    ];

    const base = Math.round(Math.max(14 * r.dpr, Math.min(r.width, r.height) * 0.045));
    const lineH = (l: Line): number => Math.round(base * (l.scale ?? 1) * 1.5);
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
          Math.round(base * (line.scale ?? 1)),
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
    if (this.done || performance.now() - this.shownAt < INPUT_GRACE_MS) return;
    this.done = true;
    this.opts.onContinue();
  }
}
