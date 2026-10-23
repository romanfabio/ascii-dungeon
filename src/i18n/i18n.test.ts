import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { getLanguage, resolveLanguage, setLanguage, t } from './i18n';
import { it as itTable } from './it';

afterEach(() => setLanguage('en'));

describe('i18n', () => {
  it('resolves auto from the browser language', () => {
    expect(resolveLanguage('auto', 'it-IT')).toBe('it');
    expect(resolveLanguage('auto', 'IT')).toBe('it');
    expect(resolveLanguage('auto', 'en-US')).toBe('en');
    expect(resolveLanguage('auto', 'fr-FR')).toBe('en');
    expect(resolveLanguage('it', 'en-US')).toBe('it');
    expect(resolveLanguage('en', 'it-IT')).toBe('en');
  });

  it('fills placeholders and leaves unknown ones alone', () => {
    setLanguage('en');
    expect(t('descending', { floor: 4 })).toBe('Descending to floor 4...');
    expect(t('descending')).toBe('Descending to floor {floor}...');
  });

  it('switches language', () => {
    setLanguage('it');
    expect(getLanguage()).toBe('it');
    expect(t('resume')).toBe('Riprendi');
  });

  it('Italian has exactly the same placeholders as English for every key', () => {
    const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(itTable[key]), key).toEqual(placeholders(en[key]));
    }
  });
});
