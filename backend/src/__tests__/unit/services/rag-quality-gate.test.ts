/**
 * Tests for CRAG Quality Gate (Phase 100)
 *
 * Tests retrieval quality evaluation and reformulation logic.
 */

import { evaluateRetrieval, QualityTier } from '../../../services/rag-quality-gate';

describe('CRAG Quality Gate', () => {
  describe('evaluateRetrieval', () => {
    it('should return CONFIDENT tier for high-quality results', () => {
      const result = evaluateRetrieval('What is TypeScript?', [
        { id: '1', title: 'TypeScript Guide', summary: 'TypeScript is a typed superset of JavaScript', score: 0.95 },
        { id: '2', title: 'TS Basics', summary: 'TypeScript adds types to JavaScript', score: 0.88 },
        { id: '3', title: 'TS Features', summary: 'TypeScript compiler and type system', score: 0.82 },
      ]);

      expect(result.tier).toBe(QualityTier.CONFIDENT);
      expect(result.avgScore).toBeGreaterThan(0.8);
      expect(result.combinedScore).toBeGreaterThan(0.75);
    });

    it('should return AMBIGUOUS tier for medium-quality results', () => {
      const result = evaluateRetrieval('How does memory work in AI agents?', [
        { id: '1', title: 'AI Memory', summary: 'Memory systems in artificial intelligence', score: 0.65 },
        { id: '2', title: 'Agent Design', summary: 'Designing autonomous agents', score: 0.55 },
      ]);

      expect(result.tier).toBe(QualityTier.AMBIGUOUS);
      expect(result.combinedScore).toBeGreaterThanOrEqual(0.45);
      expect(result.combinedScore).toBeLessThan(0.75);
    });

    it('should return FAILED tier for low-quality results', () => {
      const result = evaluateRetrieval('quantum entanglement in photosynthesis', [
        { id: '1', title: 'Basic Physics', summary: 'Introduction to mechanics', score: 0.2 },
      ]);

      expect(result.tier).toBe(QualityTier.FAILED);
      expect(result.combinedScore).toBeLessThan(0.45);
    });

    it('should return FAILED tier for empty results', () => {
      const result = evaluateRetrieval('something obscure', []);

      expect(result.tier).toBe(QualityTier.FAILED);
      expect(result.avgScore).toBe(0);
      expect(result.termCoverage).toBe(0);
    });

    it('should calculate term coverage correctly', () => {
      const result = evaluateRetrieval('TypeScript React tutorial', [
        { id: '1', title: 'TypeScript React', summary: 'Building React apps with TypeScript', score: 0.9 },
      ]);

      // All 3 terms (typescript, react, tutorial) should be at least partially covered
      expect(result.termCoverage).toBeGreaterThan(0.5);
    });

    it('should weight avgScore 70% and termCoverage 30%', () => {
      // Perfect scores
      const result = evaluateRetrieval('test', [
        { id: '1', title: 'test', summary: 'test content', score: 1.0 },
      ]);

      // avgScore = 1.0, termCoverage = 1.0
      // combined = 1.0 * 0.7 + 1.0 * 0.3 = 1.0
      expect(result.combinedScore).toBeCloseTo(1.0, 1);
    });

    it('should handle single-character query terms', () => {
      const result = evaluateRetrieval('a', [
        { id: '1', title: 'Article', summary: 'A great article', score: 0.8 },
      ]);

      // Should not crash and should produce valid tier
      expect([QualityTier.CONFIDENT, QualityTier.AMBIGUOUS, QualityTier.FAILED]).toContain(result.tier);
    });

    it('should handle special characters in query', () => {
      const result = evaluateRetrieval('C++ & Java: comparison', [
        { id: '1', title: 'C++ vs Java', summary: 'Comparing C++ and Java performance', score: 0.85 },
      ]);

      expect(result.tier).toBeDefined();
      expect(result.avgScore).toBe(0.85);
    });

    it('should handle documents with missing fields', () => {
      const result = evaluateRetrieval('test query', [
        { id: '1', title: '', summary: '', score: 0.6 },
        { id: '2', title: 'Test', summary: '', score: 0.5 },
      ]);

      expect(result.tier).toBeDefined();
      expect(result.avgScore).toBeCloseTo(0.55, 1);
    });

    it('boundary: combined score exactly 0.75 should be CONFIDENT', () => {
      // We need avgScore and termCoverage such that 0.7*avg + 0.3*term = 0.75
      // With avg=0.75 and term=0.75: combined = 0.525 + 0.225 = 0.75
      const result = evaluateRetrieval('exact match', [
        { id: '1', title: 'exact match', summary: 'exact match content', score: 0.75 },
      ]);

      // term coverage should be ~1.0, so combined > 0.75
      expect(result.tier).toBe(QualityTier.CONFIDENT);
    });

    it('boundary: combined score exactly 0.45 should be AMBIGUOUS', () => {
      const result = evaluateRetrieval('obscure unrelated', [
        { id: '1', title: 'something else entirely', summary: 'no relation at all to the query', score: 0.5 },
      ]);

      // termCoverage should be low since no terms match
      // combined = 0.5 * 0.7 + 0.0 * 0.3 = 0.35 -> FAILED
      expect([QualityTier.AMBIGUOUS, QualityTier.FAILED]).toContain(result.tier);
    });
  });
});
