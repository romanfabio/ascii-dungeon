import { type RunSave } from '../save/save';
import { t } from '../i18n/i18n';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { type ScreenContext } from './context';
import { MenuScreen } from './MenuScreen';
import { type MenuItem } from './text-ui';

export interface TitleScreenOptions {
  /** The run to continue, if a save exists. */
  run: RunSave | null;
  deepestFloor: number;
  onNewRun(): void;
  onContinue(): void;
  onSettings(): void;
  onBestiary(): void;
}

type Entry = 'continue' | 'new' | 'bestiary' | 'settings';

/** The first screen: Continue (when a run is saved), New Run, Settings. */
export class TitleScreen extends MenuScreen {
  private readonly entries: Entry[];

  constructor(
    ctx: ScreenContext,
    private readonly opts: TitleScreenOptions,
  ) {
    super(ctx);
    this.entries = opts.run
      ? ['continue', 'new', 'bestiary', 'settings']
      : ['new', 'bestiary', 'settings'];
  }

  protected title(): string {
    return t('appTitle');
  }

  protected override subtitle(): string | undefined {
    return this.opts.deepestFloor > 0
      ? t('deepestFloor', { floor: this.opts.deepestFloor })
      : undefined;
  }

  protected items(): MenuItem[] {
    return this.entries.map((entry) => {
      switch (entry) {
        case 'continue':
          return { label: t('continueRun', { floor: this.opts.run?.floor ?? 1 }) };
        case 'new':
          return { label: t('newRun') };
        case 'bestiary':
          return { label: t('bestiary') };
        case 'settings':
          return { label: t('settings') };
      }
    });
  }

  protected activate(index: number): void {
    switch (this.entries[index]) {
      case 'continue':
        this.opts.onContinue();
        break;
      case 'new':
        this.opts.onNewRun();
        break;
      case 'bestiary':
        this.opts.onBestiary();
        break;
      case 'settings':
        this.opts.onSettings();
        break;
    }
  }

  override render(r: GlyphRenderer): void {
    super.render(r);
    this.drawBanner(r);
  }

  /** A little dungeon corridor under the menu: # # # @ . . . ! # # # */
  private drawBanner(r: GlyphRenderer): void {
    const layout = this.menu.layout;
    if (!layout) return;
    const theme = this.ctx.getTheme();
    const cells = ['#', '#', '#', '@', '.', '.', '.', '!', '#', '#', '#'];
    const colors = [
      theme.wall,
      theme.wall,
      theme.wall,
      theme.player,
      theme.floor,
      theme.floor,
      theme.floor,
      theme.exit,
      theme.wall,
      theme.wall,
      theme.wall,
    ];
    const cell = Math.round(layout.base * 1.3);
    const x0 = Math.round(layout.centerX - (cells.length * cell) / 2);
    const y0 = Math.round(layout.titleCenterY - layout.titleSize * 2.6 - cell);
    if (y0 < 0) return;
    cells.forEach((ch, i) => {
      r.drawGlyph(ch, x0 + i * cell, y0, cell, Math.round(cell * 0.9), colors[i] as string);
    });
  }
}
