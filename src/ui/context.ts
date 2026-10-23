import { type SettingsStore } from '../save/stores';
import { type Theme } from '../render/themes';

/** What every screen gets from the app: live settings, the active theme, and a redraw request. */
export interface ScreenContext {
  settings: SettingsStore;
  /** Current theme (read at render time, so theme changes apply to screens already on the stack). */
  getTheme(): Theme;
  requestRender(): void;
  /** Is the primary input a finger (a phone or tablet)? Keyboard-only hints are hidden then. */
  isTouch(): boolean;
}
