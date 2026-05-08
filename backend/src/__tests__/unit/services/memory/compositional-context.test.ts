import {
  CompositionalContextEncoder,
  ContextType,
  orthogonalize,
  projectToSubspace,
} from '../../../../services/memory/compositional-context';

describe('Compositional Context Embeddings', () => {
  describe('orthogonalize', () => {
    it('should make vectors orthogonal (dot product ≈ 0)', () => {
      const a = [1, 1, 0, 0];
      const b = [1, 0, 1, 0];
      const orthB = orthogonalize(b, a);
      const dotProduct = a.reduce((sum, val, i) => sum + val * orthB[i], 0);
      expect(Math.abs(dotProduct)).toBeLessThan(0.001);
    });

    it('should preserve direction when already orthogonal', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const orthB = orthogonalize(b, a);
      expect(orthB[1]).toBeCloseTo(1);
    });
  });

  describe('CompositionalContextEncoder', () => {
    let encoder: CompositionalContextEncoder;

    beforeEach(() => {
      encoder = new CompositionalContextEncoder(4, 2); // 4D embedding, 2D shared
    });

    it('should encode memory with shared + context components', () => {
      const embedding = [0.5, 0.3, 0.7, 0.1];
      const encoded = encoder.encode(embedding, 'operations');
      // Encoded should have same dimensionality
      expect(encoded.length).toBe(4);
    });

    it('should produce similar shared components across contexts', () => {
      const embedding = [0.5, 0.3, 0.7, 0.1];
      const personalEncoded = encoder.encode(embedding, 'operations');
      const workEncoded = encoder.encode(embedding, 'finance');

      // Shared components (first 2 dims) should be identical
      const sharedPersonal = personalEncoded.slice(0, 2);
      const sharedWork = workEncoded.slice(0, 2);
      for (let i = 0; i < 2; i++) {
        expect(sharedPersonal[i]).toBeCloseTo(sharedWork[i], 3);
      }
    });

    it('should produce different context components for different contexts', () => {
      const embedding = [0.5, 0.3, 0.7, 0.1];
      const personalEncoded = encoder.encode(embedding, 'operations');
      const workEncoded = encoder.encode(embedding, 'finance');

      // Context components (last 2 dims) should differ
      const ctxPersonal = personalEncoded.slice(2);
      const ctxWork = workEncoded.slice(2);
      const areDifferent = ctxPersonal.some((v, i) => Math.abs(v - ctxWork[i]) > 0.01);
      expect(areDifferent).toBe(true);
    });

    it('should enable cross-context recall via shared component', () => {
      const memories = [
        { embedding: [0.9, 0.1, 0.5, 0.5], context: 'people' as ContextType, content: 'TypeScript generics' },
        { embedding: [0.8, 0.2, 0.3, 0.7], context: 'finance' as ContextType, content: 'Generic API patterns' },
        { embedding: [0.1, 0.9, 0.5, 0.5], context: 'operations' as ContextType, content: 'Cooking recipe' },
      ];

      const query = [0.85, 0.15, 0.4, 0.6]; // Similar to generics
      const results = encoder.crossContextRecall(query, memories, 'finance');

      // Should find TypeScript generics from learning context (cross-context)
      // Should NOT find cooking recipe (different shared component)
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.content.includes('TypeScript'))).toBe(true);
    });
  });
});
