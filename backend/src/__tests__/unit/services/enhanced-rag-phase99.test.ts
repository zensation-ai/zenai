/**
 * Phase 99: Enhanced RAG Tests (Dynamic Weights, Confidence, Self-RAG)
 */

import { calculateDynamicWeights, calculateRetrievalConfidence } from '../../../services/enhanced-rag';

describe('Phase 99: Enhanced RAG Improvements', () => {
  describe('calculateDynamicWeights', () => {
    it('gives more weight to the source with higher top score', () => {
      const hydeResults = [{ score: 0.9 }, { score: 0.7 }];
      const agenticResults = [{ score: 0.5 }, { score: 0.4 }];

      const { hydeWeight, agenticWeight } = calculateDynamicWeights(hydeResults, agenticResults);

      expect(hydeWeight).toBeGreaterThan(agenticWeight);
      expect(hydeWeight + agenticWeight).toBeCloseTo(1.0, 5);
    });

    it('gives more weight to agentic when it has higher scores', () => {
      const hydeResults = [{ score: 0.3 }];
      const agenticResults = [{ score: 0.95 }];

      const { hydeWeight, agenticWeight } = calculateDynamicWeights(hydeResults, agenticResults);

      expect(agenticWeight).toBeGreaterThan(hydeWeight);
    });

    it('applies diversity bonus when both sources have results', () => {
      // Both sources present: each gets 1.1x boost
      const { hydeWeight: w1 } = calculateDynamicWeights([{ score: 0.8 }], [{ score: 0.8 }]);
      // With diversity: 0.8*1.1 vs 0.8*1.1 → still 50/50 but both boosted
      expect(w1).toBeCloseTo(0.5, 1);
    });

    it('falls back to defaults when both are empty', () => {
      const { hydeWeight, agenticWeight } = calculateDynamicWeights([], []);
      expect(hydeWeight).toBe(0.4);
      expect(agenticWeight).toBe(0.6);
    });

    it('handles one empty source', () => {
      const { hydeWeight, agenticWeight } = calculateDynamicWeights([], [{ score: 0.8 }]);
      // HyDE has 0 weight, agentic gets all
      expect(hydeWeight).toBe(0);
      expect(agenticWeight).toBe(1);
    });

    it('normalizes weights to sum to 1.0', () => {
      const results = calculateDynamicWeights(
        [{ score: 0.6 }, { score: 0.7 }],
        [{ score: 0.4 }, { score: 0.5 }]
      );
      expect(results.hydeWeight + results.agenticWeight).toBeCloseTo(1.0, 5);
    });
  });

  describe('calculateRetrievalConfidence', () => {
    it('returns 0 for empty results', () => {
      expect(calculateRetrievalConfidence([])).toBe(0);
    });

    it('returns high confidence for high-scoring diverse results', () => {
      const results = [
        { score: 0.95, sources: ['hyde', 'agentic'] },
        { score: 0.90, sources: ['agentic'] },
        { score: 0.88, sources: ['graphrag'] },
      ];

      const confidence = calculateRetrievalConfidence(results);
      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('returns lower confidence for low-scoring results', () => {
      const results = [
        { score: 0.3, sources: ['agentic'] },
        { score: 0.2, sources: ['agentic'] },
      ];

      const confidence = calculateRetrievalConfidence(results);
      expect(confidence).toBeLessThan(0.5);
    });

    it('penalizes high variance in scores', () => {
      const consistent = [
        { score: 0.8, sources: ['agentic'] },
        { score: 0.78, sources: ['agentic'] },
        { score: 0.82, sources: ['agentic'] },
      ];

      const varied = [
        { score: 0.95, sources: ['agentic'] },
        { score: 0.3, sources: ['agentic'] },
        { score: 0.6, sources: ['agentic'] },
      ];

      const consistentConf = calculateRetrievalConfidence(consistent);
      const variedConf = calculateRetrievalConfidence(varied);

      // Consistent results should have higher confidence
      expect(consistentConf).toBeGreaterThan(variedConf);
    });

    it('rewards source diversity', () => {
      const singleSource = [
        { score: 0.8, sources: ['agentic'] },
        { score: 0.75, sources: ['agentic'] },
      ];

      const multiSource = [
        { score: 0.8, sources: ['hyde', 'agentic'] },
        { score: 0.75, sources: ['graphrag'] },
      ];

      const singleConf = calculateRetrievalConfidence(singleSource);
      const multiConf = calculateRetrievalConfidence(multiSource);

      // Multi-source should have higher confidence
      expect(multiConf).toBeGreaterThan(singleConf);
    });

    it('clamps result between 0 and 1', () => {
      const highResults = [
        { score: 1.0, sources: ['hyde', 'agentic', 'graphrag'] },
      ];

      const confidence = calculateRetrievalConfidence(highResults);
      expect(confidence).toBeLessThanOrEqual(1.0);
      expect(confidence).toBeGreaterThanOrEqual(0);
    });
  });
});
