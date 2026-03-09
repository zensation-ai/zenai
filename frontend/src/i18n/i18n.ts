/**
 * Phase 52: i18n Core
 *
 * Simple, lightweight i18n with nested key support.
 * No external dependencies.
 */

type Translations = Record<string, string | Record<string, string | Record<string, string>>>;

let currentLocale = 'de';
let translations: Record<string, Translations> = {};

export type Locale = 'de' | 'en' | 'fr' | 'es';
export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'de', label: 'Deutsch', flag: 'DE' },
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'fr', label: 'Français', flag: 'FR' },
  { code: 'es', label: 'Español', flag: 'ES' },
];

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  try {
    localStorage.setItem('zenai_locale', locale);
  } catch {
    // localStorage may be unavailable in tests
  }
}

export function getLocale(): Locale {
  try {
    return (localStorage.getItem('zenai_locale') as Locale) || 'de';
  } catch {
    return 'de';
  }
}

export function registerTranslations(locale: string, data: Translations): void {
  translations[locale] = { ...translations[locale], ...data };
}

// Resolve nested key like "nav.dashboard" → translations[locale].nav.dashboard
export function t(key: string, params?: Record<string, string | number>): string {
  const parts = key.split('.');
  let result: unknown = translations[currentLocale];

  for (const part of parts) {
    if (result && typeof result === 'object') {
      result = (result as Record<string, unknown>)[part];
    } else {
      result = undefined;
      break;
    }
  }

  // Fallback to German, then to key itself
  if (typeof result !== 'string') {
    let fallback: unknown = translations['de'];
    for (const part of parts) {
      if (fallback && typeof fallback === 'object') {
        fallback = (fallback as Record<string, unknown>)[part];
      } else {
        fallback = undefined;
        break;
      }
    }
    result = typeof fallback === 'string' ? fallback : key;
  }

  // Replace params: "Hello {name}" + {name: "World"} → "Hello World"
  if (params && typeof result === 'string') {
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      result
    );
  }

  return result as string;
}

// Initialize from localStorage
currentLocale = getLocale();
