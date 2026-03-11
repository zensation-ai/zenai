/**
 * Phase 47: RAG Query Decomposition Tests
 */

import { decomposeQuery } from '../../../services/rag-query-decomposition';

describe('RAG Query Decomposition', () => {
  describe('Simple queries', () => {
    it('should not decompose simple queries', () => {
      const result = decomposeQuery('Was ist Machine Learning?');
      expect(result.isComplex).toBe(false);
      expect(result.decompositionType).toBe('simple');
      expect(result.subQueries).toHaveLength(1);
    });

    it('should keep original query for simple search', () => {
      const result = decomposeQuery('Zeige mir alle Projekte');
      expect(result.subQueries[0].query).toBe('Zeige mir alle Projekte');
    });
  });

  describe('Comparison queries', () => {
    it('should decompose vs comparison', () => {
      const result = decomposeQuery('React vs Vue - welches Framework ist besser?');
      expect(result.isComplex).toBe(true);
      expect(result.decompositionType).toBe('comparison');
      expect(result.subQueries.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect German comparison patterns', () => {
      const result = decomposeQuery('Was ist der Unterschied zwischen Docker und Kubernetes?');
      expect(result.decompositionType).toBe('comparison');
    });

    it('should detect pro/contra queries', () => {
      const result = decomposeQuery('Pro und Contra von Microservices');
      expect(result.decompositionType).toBe('comparison');
    });
  });

  describe('Multi-part queries', () => {
    it('should decompose multi-part questions', () => {
      const result = decomposeQuery('Was ist React und außerdem wie funktioniert das Virtual DOM?');
      expect(result.decompositionType).toBe('multi_part');
    });
  });

  describe('Causal queries', () => {
    it('should decompose why questions', () => {
      const result = decomposeQuery('Warum ist PostgreSQL besser als MySQL für diesen Anwendungsfall?');
      expect(result.isComplex).toBe(true);
      // Could be causal or comparison depending on pattern priority
      expect(['causal', 'comparison']).toContain(result.decompositionType);
    });

    it('should detect ursache patterns', () => {
      const result = decomposeQuery('Was ist die Ursache für den Leistungsabfall?');
      expect(result.decompositionType).toBe('causal');
      expect(result.subQueries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Temporal queries', () => {
    it('should decompose evolution questions', () => {
      const result = decomposeQuery('Wie hat sich das Projekt seit Januar entwickelt?');
      expect(result.isComplex).toBe(true);
      expect(result.decompositionType).toBe('temporal');
      expect(result.subQueries.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect trend patterns', () => {
      const result = decomposeQuery('Was ist der Trend bei den Verkaufszahlen?');
      expect(result.decompositionType).toBe('temporal');
    });
  });

  describe('SubQuery properties', () => {
    it('should assign priorities', () => {
      const result = decomposeQuery('Vergleiche React und Vue Framework');
      for (const sub of result.subQueries) {
        expect(sub.priority).toBeGreaterThanOrEqual(1);
        expect(sub.purpose).toBeTruthy();
      }
    });

    it('should preserve original query', () => {
      const query = 'Was ist der Unterschied zwischen A und B?';
      const result = decomposeQuery(query);
      expect(result.original).toBe(query);
    });
  });
});
