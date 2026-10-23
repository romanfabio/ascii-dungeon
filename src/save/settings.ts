import {
  areBindingsValid,
  areWaitKeysValid,
  cloneBindings,
  DEFAULT_MOVE_BINDINGS,
  DEFAULT_WAIT_KEYS,
  type MoveBindings,
} from '../input/bindings';
import { type RepeatOptions } from '../input/input-manager';
import { LANGUAGE_SETTINGS, type LanguageSetting } from '../i18n/i18n';
import { type DpadSize } from '../render/layout';
import { THEME_IDS, type ThemeId } from '../render/themes';
import { parseAndMigrate, type Migration } from './migrate';

export const SETTINGS_VERSION = 1;

/** Upgrades from older settings versions; none exist yet. Add `1: (old) => ...` when v2 lands. */
const SETTINGS_MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type { DpadSize };
export type DpadVisibility = 'auto' | 'on' | 'off';

export interface Settings {
  version: typeof SETTINGS_VERSION;
  language: LanguageSetting;
  theme: ThemeId;
  /** On-screen D-pad (applied once touch controls exist). */
  dpadSize: DpadSize;
  dpadVisible: DpadVisibility;
  bindings: MoveBindings;
  /** Keys that wait one turn. */
  waitKeys: string[];
  repeatDelayMs: number;
  repeatIntervalMs: number;
}

export type RepeatPreset = 'slow' | 'normal' | 'fast';

export const REPEAT_PRESETS: Readonly<Record<RepeatPreset, RepeatOptions>> = {
  slow: { delayMs: 250, intervalMs: 130 },
  normal: { delayMs: 180, intervalMs: 90 },
  fast: { delayMs: 130, intervalMs: 60 },
};

export const REPEAT_PRESET_IDS: readonly RepeatPreset[] = ['slow', 'normal', 'fast'];

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    language: 'auto',
    theme: 'default',
    dpadSize: 'M',
    dpadVisible: 'auto',
    bindings: cloneBindings(DEFAULT_MOVE_BINDINGS),
    waitKeys: [...DEFAULT_WAIT_KEYS],
    repeatDelayMs: REPEAT_PRESETS.normal.delayMs,
    repeatIntervalMs: REPEAT_PRESETS.normal.intervalMs,
  };
}

/** The preset closest to the stored repeat timing (by interval). */
export function repeatPresetOf(s: Settings): RepeatPreset {
  let best: RepeatPreset = 'normal';
  let bestDist = Infinity;
  for (const id of REPEAT_PRESET_IDS) {
    const dist = Math.abs(REPEAT_PRESETS[id].intervalMs - s.repeatIntervalMs);
    if (dist < bestDist) {
      best = id;
      bestDist = dist;
    }
  }
  return best;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** Wait keys: older saves have none, and a clash with a direction key resets both. */
function sanitizeWaitKeys(value: unknown): string[] {
  return areWaitKeysValid(value) ? [...value] : [...DEFAULT_WAIT_KEYS];
}

function sanitizeBindings(value: unknown, waitKeys: readonly string[]): MoveBindings | null {
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    const candidate = { N: v.N, E: v.E, S: v.S, W: v.W } as MoveBindings;
    if (areBindingsValid(candidate, waitKeys)) return cloneBindings(candidate);
  }
  return null;
}

/** Reads stored settings, repairing or defaulting anything missing, corrupt or out of range. */
export function parseSettings(json: string | null): Settings {
  const d = defaultSettings();
  const raw = parseAndMigrate(json, SETTINGS_VERSION, SETTINGS_MIGRATIONS);
  if (!raw) return d;
  let waitKeys = sanitizeWaitKeys(raw.waitKeys);
  let bindings = sanitizeBindings(raw.bindings, waitKeys);
  if (!bindings) {
    // Fall back to the defaults, unless the stored wait keys can still be kept next to them.
    bindings = cloneBindings(DEFAULT_MOVE_BINDINGS);
    if (!areBindingsValid(bindings, waitKeys)) waitKeys = [...DEFAULT_WAIT_KEYS];
  }
  return {
    version: SETTINGS_VERSION,
    language: oneOf(raw.language, LANGUAGE_SETTINGS, d.language),
    theme: oneOf(raw.theme, THEME_IDS, d.theme),
    dpadSize: oneOf(raw.dpadSize, ['S', 'M', 'L'], d.dpadSize),
    dpadVisible: oneOf(raw.dpadVisible, ['auto', 'on', 'off'], d.dpadVisible),
    bindings,
    waitKeys,
    repeatDelayMs: clampNumber(raw.repeatDelayMs, 50, 1000, d.repeatDelayMs),
    repeatIntervalMs: clampNumber(raw.repeatIntervalMs, 30, 500, d.repeatIntervalMs),
  };
}
