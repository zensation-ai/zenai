import { describe, it, expect } from 'vitest';
import { SYSTEM_SECTIONS, ALL_SYSTEM_TABS } from '../types';
import type { SystemTab } from '../types';

describe('SystemPage/types', () => {
  it('exports exactly 5 sections', () => {
    expect(SYSTEM_SECTIONS).toHaveLength(5);
  });

  it('each section has 2 tabs', () => {
    SYSTEM_SECTIONS.forEach(section => {
      expect(section.tabs).toHaveLength(2);
    });
  });

  it('has 10 total tabs', () => {
    expect(ALL_SYSTEM_TABS).toHaveLength(10);
  });

  it('has expected section IDs', () => {
    const ids = SYSTEM_SECTIONS.map(s => s.id);
    expect(ids).toEqual(['account', 'general', 'security', 'extensions', 'system']);
  });

  it('has all expected tab IDs', () => {
    const expected: SystemTab[] = [
      'profil', 'konto', 'allgemein', 'ki',
      'sicherheit', 'datenschutz',
      'integrationen', 'erweiterungen',
      'system', 'daten',
    ];
    expect(ALL_SYSTEM_TABS).toEqual(expected);
  });

  it('has German labels for all sections', () => {
    const labels = SYSTEM_SECTIONS.map(s => s.label);
    expect(labels).toEqual([
      'Profil & Konto',
      'Allgemein & KI',
      'Sicherheit & Datenschutz',
      'Integrationen & Erweiterungen',
      'System & Daten',
    ]);
  });
});
