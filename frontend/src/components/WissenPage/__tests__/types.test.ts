import { describe, it, expect } from 'vitest';
import { WISSEN_VIEWS } from '../types';

describe('WISSEN_VIEWS', () => {
  it('has 5 entries', () => {
    expect(WISSEN_VIEWS).toHaveLength(5);
  });

  it('each entry has an id and label', () => {
    for (const view of WISSEN_VIEWS) {
      expect(view).toHaveProperty('id');
      expect(view).toHaveProperty('label');
      expect(typeof view.id).toBe('string');
      expect(typeof view.label).toBe('string');
    }
  });

  it('has the expected view ids in order', () => {
    const ids = WISSEN_VIEWS.map(v => v.id);
    expect(ids).toEqual(['dokumente', 'canvas', 'medien', 'verbindungen', 'lernen']);
  });

  it('has the expected German labels', () => {
    const labels = WISSEN_VIEWS.map(v => v.label);
    expect(labels).toEqual(['Dokumente', 'Canvas', 'Medien', 'Verbindungen', 'Lernen']);
  });
});
