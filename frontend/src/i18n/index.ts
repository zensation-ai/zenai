// Phase 52: i18n - Initialize and register all locales
import { registerTranslations, setLocale, getLocale } from './i18n';
import { de } from './locales/de';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { es } from './locales/es';

registerTranslations('de', de);
registerTranslations('en', en);
registerTranslations('fr', fr);
registerTranslations('es', es);

// Initialize from stored preference
setLocale(getLocale());

// Re-export standalone i18n core
export { t, setLocale, getLocale, SUPPORTED_LOCALES } from './i18n';
export type { Locale } from './i18n';

// Re-export React context-based i18n
export { I18nProvider, useI18n } from './i18n-context';
export type { TranslationKey } from './types';

// Re-export standalone hook
export { useTranslation } from './useTranslation';
