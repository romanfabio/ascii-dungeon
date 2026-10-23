import { en, type TextKey } from './en';
import { it } from './it';

export type Language = 'en' | 'it';
export type LanguageSetting = 'auto' | Language;

export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['auto', 'en', 'it'];

const TABLES: Record<Language, Record<TextKey, string>> = { en, it };

/** 'auto' follows the browser/OS language: Italian if it starts with "it", otherwise English. */
export function resolveLanguage(setting: LanguageSetting, browserLanguage: string): Language {
  if (setting !== 'auto') return setting;
  return browserLanguage.toLowerCase().startsWith('it') ? 'it' : 'en';
}

let current: Language = 'en';

export function setLanguage(setting: LanguageSetting): void {
  const browser = typeof navigator !== 'undefined' ? navigator.language : 'en';
  current = resolveLanguage(setting, browser ?? 'en');
}

export function getLanguage(): Language {
  return current;
}

/** Looks up a text and fills `{name}` placeholders. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  return TABLES[current][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
