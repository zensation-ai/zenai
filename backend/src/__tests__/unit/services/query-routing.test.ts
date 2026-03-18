/**
 * Phase 101 B3: Query Routing Tests
 *
 * Tests for classifyQueryComplexity function.
 */

import { classifyQueryComplexity } from '../../../services/enhanced-rag';

describe('classifyQueryComplexity', () => {
  it('classifies short simple query as simple', () => {
    expect(classifyQueryComplexity('Was ist Python?')).toBe('simple');
  });

  it('classifies single-word query as simple', () => {
    expect(classifyQueryComplexity('Python')).toBe('simple');
  });

  it('classifies comparison query as complex', () => {
    expect(classifyQueryComplexity('Vergleich zwischen Python und JavaScript')).toBe('complex');
  });

  it('classifies causal query as complex', () => {
    expect(classifyQueryComplexity('Warum ist Python langsamer als C?')).toBe('complex');
  });

  it('classifies multi-part query (long) as complex', () => {
    const longQuery = 'Erklaere mir die Unterschiede zwischen synchroner und asynchroner Programmierung und wann ich welche verwenden sollte';
    expect(classifyQueryComplexity(longQuery)).toBe('complex');
  });

  it('classifies "unterschied" keyword as complex', () => {
    expect(classifyQueryComplexity('Was ist der Unterschied zwischen REST und GraphQL?')).toBe('complex');
  });

  it('classifies vs. query as complex', () => {
    expect(classifyQueryComplexity('React vs. Vue fuer grosse Projekte')).toBe('complex');
  });
});
