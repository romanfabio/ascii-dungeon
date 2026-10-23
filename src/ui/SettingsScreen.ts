import { LANGUAGE_SETTINGS, t, type LanguageSetting } from '../i18n/i18n';
import { type TextKey } from '../i18n/en';
import { THEME_IDS, type ThemeId } from '../render/themes';
import {
  REPEAT_PRESET_IDS,
  REPEAT_PRESETS,
  repeatPresetOf,
  type DpadSize,
  type DpadVisibility,
  type RepeatPreset,
} from '../save/settings';
import { type ScreenContext } from './context';
import { cycle, MenuScreen } from './MenuScreen';
import { type MenuItem } from './text-ui';

export interface SettingsScreenOptions {
  onControls(): void;
  onBack(): void;
}

const LANGUAGE_LABELS: Record<LanguageSetting, TextKey> = {
  auto: 'languageAuto',
  en: 'languageEn',
  it: 'languageIt',
};
const THEME_LABELS: Record<ThemeId, TextKey> = {
  default: 'themeDefault',
  'high-contrast': 'themeHighContrast',
  colorblind: 'themeColorblind',
};
const REPEAT_LABELS: Record<RepeatPreset, TextKey> = {
  slow: 'repeatSlow',
  normal: 'repeatNormal',
  fast: 'repeatFast',
};

// Language names are shown in their own language regardless of the current one.
const ownName = (l: LanguageSetting): string | null =>
  l === 'en' ? 'English' : l === 'it' ? 'Italiano' : null;

const DPAD_VISIBILITIES: readonly DpadVisibility[] = ['auto', 'on', 'off'];
const DPAD_SIZES: readonly DpadSize[] = ['S', 'M', 'L'];
const DPAD_VISIBLE_LABELS: Record<DpadVisibility, TextKey> = {
  auto: 'dpadAuto',
  on: 'dpadOn',
  off: 'dpadOff',
};
const DPAD_SIZE_LABELS: Record<DpadSize, TextKey> = {
  S: 'sizeSmall',
  M: 'sizeMedium',
  L: 'sizeLarge',
};

const ROWS = [
  'language',
  'theme',
  'keyRepeat',
  'dpadVisible',
  'dpadSize',
  'controls',
  'back',
] as const;

export class SettingsScreen extends MenuScreen {
  constructor(
    ctx: ScreenContext,
    private readonly opts: SettingsScreenOptions,
  ) {
    super(ctx);
  }

  protected title(): string {
    return t('settingsTitle');
  }

  protected items(): MenuItem[] {
    const s = this.ctx.settings.get();
    return [
      { label: t('language'), value: ownName(s.language) ?? t(LANGUAGE_LABELS[s.language]) },
      { label: t('theme'), value: t(THEME_LABELS[s.theme]) },
      { label: t('keyRepeat'), value: t(REPEAT_LABELS[repeatPresetOf(s)]) },
      { label: t('dpadVisible'), value: t(DPAD_VISIBLE_LABELS[s.dpadVisible]) },
      { label: t('dpadSize'), value: t(DPAD_SIZE_LABELS[s.dpadSize]) },
      { label: t('controls') },
      { label: t('back') },
    ];
  }

  protected activate(index: number): void {
    switch (ROWS[index]) {
      case 'controls':
        return this.opts.onControls();
      case 'back':
        return this.opts.onBack();
      default:
        this.adjust(index, 1);
    }
  }

  protected override adjust(index: number, delta: 1 | -1): void {
    const settings = this.ctx.settings;
    const s = settings.get();
    switch (ROWS[index]) {
      case 'language':
        settings.update({ language: cycle(LANGUAGE_SETTINGS, s.language, delta) });
        break;
      case 'theme':
        settings.update({ theme: cycle(THEME_IDS, s.theme, delta) });
        break;
      case 'dpadVisible':
        settings.update({ dpadVisible: cycle(DPAD_VISIBILITIES, s.dpadVisible, delta) });
        break;
      case 'dpadSize':
        settings.update({ dpadSize: cycle(DPAD_SIZES, s.dpadSize, delta) });
        break;
      case 'keyRepeat': {
        const preset = REPEAT_PRESETS[cycle(REPEAT_PRESET_IDS, repeatPresetOf(s), delta)];
        settings.update({ repeatDelayMs: preset.delayMs, repeatIntervalMs: preset.intervalMs });
        break;
      }
    }
  }

  protected override back(): void {
    this.opts.onBack();
  }
}
