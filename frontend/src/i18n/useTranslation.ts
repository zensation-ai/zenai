import { useState, useCallback } from 'react';
import { t as translate, setLocale as setAppLocale, getLocale, Locale } from './i18n';

/**
 * Phase 52: Standalone React hook for translations.
 *
 * Uses the lightweight i18n core (no React context required).
 * For context-based usage, prefer useI18n from i18n-context.
 */
export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  const changeLocale = useCallback((newLocale: Locale) => {
    setAppLocale(newLocale);
    setLocaleState(newLocale);
    // Trigger re-render across the app by dispatching storage event
    window.dispatchEvent(new StorageEvent('storage', { key: 'zenai_locale', newValue: newLocale }));
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return translate(key, params);
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return { t, locale, changeLocale };
}
