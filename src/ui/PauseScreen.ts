import { t } from '../i18n/i18n';
import { type ScreenContext } from './context';
import { MenuScreen } from './MenuScreen';
import { type MenuItem } from './text-ui';

export interface PauseScreenOptions {
  seed: string;
  onResume(): void;
  onRestartFloor(): void;
  onSettings(): void;
  onQuitToTitle(): void;
}

export class PauseScreen extends MenuScreen {
  constructor(
    ctx: ScreenContext,
    private readonly opts: PauseScreenOptions,
  ) {
    super(ctx);
  }

  protected title(): string {
    return t('paused');
  }

  protected override subtitle(): string {
    return t('runSeed', { seed: this.opts.seed });
  }

  protected items(): MenuItem[] {
    return [
      { label: t('resume') },
      { label: t('restartFloor') },
      { label: t('settings') },
      { label: t('quitToTitle') },
    ];
  }

  protected activate(index: number): void {
    switch (index) {
      case 0:
        return this.opts.onResume();
      case 1:
        return this.opts.onRestartFloor();
      case 2:
        return this.opts.onSettings();
      case 3:
        return this.opts.onQuitToTitle();
    }
  }

  protected override back(): void {
    this.opts.onResume();
  }
}
