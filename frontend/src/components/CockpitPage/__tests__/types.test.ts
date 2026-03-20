import { describe, it, expect } from 'vitest';
import { COCKPIT_VIEWS, TIME_RANGES } from '../types';
import type { CockpitViewMode, TimeRange } from '../types';

describe('CockpitPage/types', () => {
  it('exports exactly 4 cockpit views', () => {
    expect(COCKPIT_VIEWS).toHaveLength(4);
  });

  it('has correct view IDs', () => {
    const ids = COCKPIT_VIEWS.map(v => v.id);
    expect(ids).toEqual(['uebersicht', 'business', 'finanzen', 'trends']);
  });

  it('has German labels for all views', () => {
    const labels = COCKPIT_VIEWS.map(v => v.label);
    expect(labels).toEqual(['Übersicht', 'Business', 'Finanzen', 'Trends']);
  });

  it('exports exactly 4 time ranges', () => {
    expect(TIME_RANGES).toHaveLength(4);
  });

  it('has correct time range IDs', () => {
    const ids = TIME_RANGES.map(r => r.id);
    expect(ids).toEqual(['7d', '30d', '90d', '1y']);
  });

  it('has German labels for time ranges', () => {
    const labels = TIME_RANGES.map(r => r.label);
    expect(labels).toEqual(['7 Tage', '30 Tage', '90 Tage', '1 Jahr']);
  });

  it('CockpitViewMode type covers all IDs', () => {
    // Type-level check — if this compiles, the type is correct
    const modes: CockpitViewMode[] = ['uebersicht', 'business', 'finanzen', 'trends'];
    expect(modes).toHaveLength(4);
  });

  it('TimeRange type covers all IDs', () => {
    const ranges: TimeRange[] = ['7d', '30d', '90d', '1y'];
    expect(ranges).toHaveLength(4);
  });
});
