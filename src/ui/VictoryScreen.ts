import { t } from '../i18n/i18n';
import { formatTime } from '../render/format';
import { type Theme } from '../render/themes';
import { type GameOverSummary } from './GameScreen';
import { SummaryScreen, type SummaryLine, type SummaryScreenOptions } from './SummaryScreen';

export interface VictoryOptions extends SummaryScreenOptions {
  /** The run's totals; `floor` is the final floor. */
  summary: GameOverSummary & { lives: number };
}

/** The last floor is cleared: the run's totals, then back to the title. */
export class VictoryScreen extends SummaryScreen {
  constructor(private readonly opts: VictoryOptions) {
    super(opts);
  }

  protected lines(theme: Theme): SummaryLine[] {
    const { summary } = this.opts;
    return [
      { text: t('victory'), color: theme.exit, scale: 1.8 },
      { text: '', color: theme.hudText },
      { text: t('victoryFloors', { floors: summary.floor }), color: theme.player },
      { text: '', color: theme.hudText },
      { text: t('gameOverSteps', { steps: summary.totalSteps }), color: theme.hudText },
      { text: t('gameOverTime', { time: formatTime(summary.totalTimeMs) }), color: theme.hudText },
      { text: t('gameOverDeaths', { deaths: summary.deaths }), color: theme.hudText },
      { text: t('victoryLives', { lives: summary.lives }), color: theme.heart },
      { text: '', color: theme.hudText },
      { text: t('pressToContinue'), color: theme.hudDim, scale: 0.8 },
    ];
  }
}
