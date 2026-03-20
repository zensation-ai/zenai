import { describe, it, expect } from 'vitest';
import { MEINE_KI_VIEWS } from '../types';
import type { MeineKIViewMode } from '../types';

describe('MeineKIPage/types', () => {
  it('exports exactly 4 views', () => {
    expect(MEINE_KI_VIEWS).toHaveLength(4);
  });

  it('has correct view IDs', () => {
    const ids = MEINE_KI_VIEWS.map(v => v.id);
    expect(ids).toEqual(['persona', 'wissen', 'prozeduren', 'stimme']);
  });

  it('has German labels', () => {
    const labels = MEINE_KI_VIEWS.map(v => v.label);
    expect(labels).toEqual(['Persona', 'Wissen', 'Prozeduren', 'Stimme']);
  });

  it('MeineKIViewMode covers all IDs', () => {
    const modes: MeineKIViewMode[] = ['persona', 'wissen', 'prozeduren', 'stimme'];
    expect(modes).toHaveLength(4);
  });
});
