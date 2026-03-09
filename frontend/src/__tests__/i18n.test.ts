import { describe, test, expect, beforeEach } from 'vitest';
import { de } from '../i18n/locales/de';
import { en } from '../i18n/locales/en';
import { fr } from '../i18n/locales/fr';
import { es } from '../i18n/locales/es';
import { t, setLocale, getLocale, registerTranslations } from '../i18n/i18n';

// Helper to get all leaf keys from nested object
function getLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...getLeafKeys(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('i18n translations', () => {
  const locales = { de, en, fr, es };
  const deKeys = getLeafKeys(de).sort();

  test('all locales have same top-level sections as German', () => {
    const deSections = Object.keys(de).sort();
    for (const [, translations] of Object.entries(locales)) {
      expect(Object.keys(translations).sort()).toEqual(deSections);
    }
  });

  test('all locales have same leaf keys as German', () => {
    for (const [, translations] of Object.entries(locales)) {
      const keys = getLeafKeys(translations as Record<string, unknown>).sort();
      expect(keys).toEqual(deKeys);
    }
  });

  test('German translations match expected values', () => {
    expect(de.nav.dashboard).toBe('Dashboard');
    expect(de.common.save).toBe('Speichern');
    expect(de.chat.placeholder).toBe('Nachricht eingeben...');
    expect(de.ideas.title).toBe('Gedanken');
    expect(de.context.personal).toBe('Persönlich');
  });

  test('English translations differ from German where expected', () => {
    expect(en.common.save).toBe('Save');
    expect(en.common.cancel).toBe('Cancel');
    expect(en.chat.placeholder).not.toBe(de.chat.placeholder);
    expect(en.nav.ideas).toBe('Ideas');
  });

  test('French translations are properly translated', () => {
    expect(fr.common.save).toBe('Enregistrer');
    expect(fr.common.cancel).toBe('Annuler');
    expect(fr.nav.settings).toBe('Paramètres');
    expect(fr.ideas.title).toBe('Idées');
  });

  test('Spanish translations are properly translated', () => {
    expect(es.common.save).toBe('Guardar');
    expect(es.common.cancel).toBe('Cancelar');
    expect(es.nav.settings).toBe('Configuración');
    expect(es.ideas.title).toBe('Ideas');
  });

  test('all locales have non-empty string values', () => {
    for (const [, translations] of Object.entries(locales)) {
      const keys = getLeafKeys(translations as Record<string, unknown>);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const parts = key.split('.');
        let val: unknown = translations;
        for (const part of parts) {
          val = (val as Record<string, unknown>)[part];
        }
        expect(typeof val).toBe('string');
        expect((val as string).length).toBeGreaterThan(0);
      }
    }
  });

  test('all locales have correct number of keys', () => {
    const expectedCount = deKeys.length;
    for (const [, translations] of Object.entries(locales)) {
      expect(getLeafKeys(translations as Record<string, unknown>)).toHaveLength(expectedCount);
    }
  });
});

describe('i18n core', () => {
  beforeEach(() => {
    registerTranslations('de', de);
    registerTranslations('en', en);
    setLocale('de');
  });

  test('t returns German translation by default', () => {
    expect(t('common.save')).toBe('Speichern');
  });

  test('t returns English after locale change', () => {
    setLocale('en');
    expect(t('common.save')).toBe('Save');
  });

  test('t resolves nested keys', () => {
    expect(t('ideas.tabs.active')).toBe('Aktiv');
    expect(t('settings.tabs.profile')).toBe('Profil');
  });

  test('t falls back to key if not found', () => {
    expect(t('unknown.key')).toBe('unknown.key');
  });

  test('t handles params', () => {
    registerTranslations('de', { greeting: 'Hallo {name}' } as any);
    expect(t('greeting', { name: 'World' })).toBe('Hallo World');
  });

  test('getLocale returns current locale', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
  });
});
