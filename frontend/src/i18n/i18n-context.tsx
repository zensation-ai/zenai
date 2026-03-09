import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Locale, TranslationKey } from './types';
import { de } from './locales/de';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { es } from './locales/es';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const translations: Record<Locale, any> = { de, en, fr, es };

const LOCALE_STORAGE_KEY = 'zenai_locale';

const LOCALE_LABELS: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  locales: Record<Locale, string>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && stored in translations) {
      return stored as Locale;
    }
  } catch {
    // localStorage may be unavailable
  }
  const browserLang = navigator.language.split('-')[0];
  if (browserLang in translations) {
    return browserLang as Locale;
  }
  return 'de';
}

/**
 * Resolve a dot-separated key against a nested translation object.
 * e.g. "nav.dashboard" → translations[locale].nav.dashboard
 */
function resolveKey(obj: unknown, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // localStorage may be unavailable
    }
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return resolveKey(translations[locale], key)
        || resolveKey(translations['de'], key)
        || key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, locales: LOCALE_LABELS }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
