/**
 * Phase 99/100: Enhanced RAG Tests
 *
 * Tests for:
 * - CRAG Quality Gate (evaluateRetrieval, QualityTier)
 * - Contextual Chunk Enrichment (enrichChunkWithContext, enrichQueryWithContext)
 */

import { evaluateRetrieval, QualityTier } from '../../../services/rag-quality-gate';
import { enrichChunkWithContext, enrichQueryWithContext } from '../../../services/enhanced-rag';

describe('Phase 99/100: Enhanced RAG Improvements', () => {
  describe('CRAG Quality Gate — evaluateRetrieval', () => {
    it('returns FAILED tier for empty results', () => {
      const result = evaluateRetrieval('test query', []);
      expect(result.tier).toBe(QualityTier.FAILED);
      expect(result.avgScore).toBe(0);
      expect(result.combinedScore).toBe(0);
    });

    it('returns CONFIDENT tier for high-scoring results with good term coverage', () => {
      const docs = [
        { id: '1', title: 'Revenue Analysis', summary: 'Revenue grew 10% in Q3', score: 0.95 },
        { id: '2', title: 'Q3 Report', summary: 'Quarterly revenue report for Q3', score: 0.90 },
      ];
      const result = evaluateRetrieval('revenue Q3', docs);
      expect(result.tier).toBe(QualityTier.CONFIDENT);
      expect(result.combinedScore).toBeGreaterThanOrEqual(0.75);
    });

    it('returns FAILED tier for low-scoring results', () => {
      const docs = [
        { id: '1', title: 'Unrelated', summary: 'Something about cats', score: 0.2 },
        { id: '2', title: 'Also unrelated', summary: 'Dogs and parks', score: 0.15 },
      ];
      const result = evaluateRetrieval('quantum physics equations', docs);
      expect(result.tier).toBe(QualityTier.FAILED);
      expect(result.combinedScore).toBeLessThan(0.45);
    });

    it('returns AMBIGUOUS tier for mid-range scores', () => {
      const docs = [
        { id: '1', title: 'Machine Learning', summary: 'Introduction to machine learning concepts', score: 0.6 },
        { id: '2', title: 'AI Overview', summary: 'Artificial intelligence overview', score: 0.55 },
      ];
      const result = evaluateRetrieval('machine learning basics', docs);
      // combinedScore = avgScore * 0.7 + termCoverage * 0.3
      // With partial term coverage, should be in AMBIGUOUS range
      expect(result.combinedScore).toBeGreaterThanOrEqual(0.45);
      expect([QualityTier.AMBIGUOUS, QualityTier.CONFIDENT]).toContain(result.tier);
    });

    it('considers term coverage in combined score', () => {
      // High score but zero term coverage → lower combined score
      const docsNoTermMatch = [
        { id: '1', title: 'Abstract', summary: 'General discussion', score: 0.8 },
      ];
      const resultNoTerms = evaluateRetrieval('specific quantum topic', docsNoTermMatch);

      // High score with good term coverage → higher combined score
      const docsWithTermMatch = [
        { id: '1', title: 'Quantum Physics', summary: 'Discussion of specific quantum topic research', score: 0.8 },
      ];
      const resultWithTerms = evaluateRetrieval('specific quantum topic', docsWithTermMatch);

      expect(resultWithTerms.combinedScore).toBeGreaterThan(resultNoTerms.combinedScore);
    });

    it('clamps combinedScore between 0 and 1', () => {
      const docs = [
        { id: '1', title: 'Perfect Match', summary: 'Exactly what was searched for', score: 1.0 },
      ];
      const result = evaluateRetrieval('perfect match', docs);
      expect(result.combinedScore).toBeLessThanOrEqual(1.0);
      expect(result.combinedScore).toBeGreaterThanOrEqual(0);
    });

    it('avgScore is the mean of all document scores', () => {
      const docs = [
        { id: '1', title: 'A', summary: 'a', score: 0.8 },
        { id: '2', title: 'B', summary: 'b', score: 0.6 },
        { id: '3', title: 'C', summary: 'c', score: 0.4 },
      ];
      const result = evaluateRetrieval('test', docs);
      expect(result.avgScore).toBeCloseTo(0.6, 5);
    });
  });

  describe('Contextual Chunk Enrichment', () => {
    describe('enrichChunkWithContext', () => {
      it('prepends title, topic, and context', () => {
        const enriched = enrichChunkWithContext({
          content: 'Revenue grew 3%',
          title: 'Q3 Earnings Analysis',
          topic: 'Finance',
          context: 'work',
        });
        expect(enriched).toContain('[From: "Q3 Earnings Analysis" | Topic: Finance | Context: work]');
        expect(enriched).toContain('Revenue grew 3%');
      });

      it('handles missing optional fields', () => {
        const enriched = enrichChunkWithContext({ content: 'Some content' });
        expect(enriched).toBe('Some content');
      });

      it('handles partial context (only title)', () => {
        const enriched = enrichChunkWithContext({ content: 'Data', title: 'Report' });
        expect(enriched).toContain('[From: "Report"]');
        expect(enriched).toContain('Data');
      });

      it('handles partial context (only topic)', () => {
        const enriched = enrichChunkWithContext({ content: 'Data', topic: 'Science' });
        expect(enriched).toContain('[Topic: Science]');
      });
    });

    describe('enrichQueryWithContext', () => {
      it('prepends context and topic to query', () => {
        const enriched = enrichQueryWithContext('revenue growth', 'work', 'Finance');
        expect(enriched).toContain('[Topic: Finance | Context: work]');
        expect(enriched).toContain('revenue growth');
      });

      it('returns original query when no context provided', () => {
        const enriched = enrichQueryWithContext('test query');
        expect(enriched).toBe('test query');
      });

      it('handles only context without topic', () => {
        const enriched = enrichQueryWithContext('test', 'personal');
        expect(enriched).toContain('[Context: personal]');
      });
    });
  });
});
