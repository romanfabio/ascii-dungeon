import { t } from '../i18n/i18n';
import { formatTime } from '../render/format';
import { type Theme } from '../render/themes';
import { type GameOverSummary } from './GameScreen';
import { SummaryScreen, type SummaryLine, type SummaryScreenOptions } from './SummaryScreen';

export interface GameOverOptions extends SummaryScreenOptions {
  summary: GameOverSummary;
}

/** The run is over: what you reached, then back to the title on a key press or tap. */
export class GameOverScreen extends SummaryScreen {
  constructor(private readonly opts: GameOverOptions) {
    super(opts);
  }

  protected lines(theme: Theme): SummaryLine[] {
    const { summary } = this.opts;
    return [
      { text: t('gameOver'), color: theme.heart, scale: 1.8 },
      { text: '', color: theme.hudText },
      { text: t('gameOverFloor', { floor: summary.floor }), color: theme.player },
      { text: '', color: theme.hudText },
      { text: t('gameOverSteps', { steps: summary.totalSteps }), color: theme.hudText },
      { text: t('gameOverTime', { time: formatTime(summary.totalTimeMs) }), color: theme.hudText },
      { text: t('gameOverDeaths', { deaths: summary.deaths }), color: theme.hudText },
      { text: '', color: theme.hudText },
      { text: t('pressToContinue'), color: theme.hudDim, scale: 0.8 },
    ];
  }
}
