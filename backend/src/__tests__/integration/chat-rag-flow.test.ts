import { classifyQueryComplexity } from '../../services/enhanced-rag';

describe('Chat → RAG → Response Flow', () => {
  test('simple query classified correctly', () => {
    expect(classifyQueryComplexity('Was ist React?')).toBe('simple');
  });
  test('comparison query is complex', () => {
    expect(classifyQueryComplexity('Vergleiche React und Angular')).toBe('complex');
  });
  test('causal query is complex', () => {
    expect(classifyQueryComplexity('Warum ist das Backend langsam?')).toBe('complex');
  });
});
