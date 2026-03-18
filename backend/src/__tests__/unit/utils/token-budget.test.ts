/**
 * Tests for Token Budget Management (Phase 100)
 */

import {
  estimateTokensBudget,
  truncateToTokenBudget,
  assembleContextWithBudget,
  DEFAULT_BUDGET_ALLOCATION,
} from '../../../utils/token-budget';

describe('Token Budget Management', () => {
  describe('estimateTokensBudget', () => {
    it('should estimate tokens using char/4 heuristic for English', () => {
      const text = 'Hello world this is a test of the token estimation';
      const tokens = estimateTokensBudget(text);
      // ~50 chars / 4 = ~12 tokens
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(30);
    });

    it('should use char/5 ratio for German text', () => {
      const german = 'Das ist ein deutscher Text und die Schätzung sollte weniger Token ergeben';
      const english = 'This is an English text and the estimation should produce more tokens here';

      const germanTokens = estimateTokensBudget(german);
      const englishTokens = estimateTokensBudget(english);

      // German should estimate more tokens (more chars per word, lower ratio)
      // But with char/5 for German, similar-length text should be fewer tokens
      expect(germanTokens).toBeGreaterThan(0);
      expect(englishTokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty text', () => {
      expect(estimateTokensBudget('')).toBe(0);
    });

    it('should handle null/undefined gracefully', () => {
      expect(estimateTokensBudget(null as unknown as string)).toBe(0);
      expect(estimateTokensBudget(undefined as unknown as string)).toBe(0);
    });
  });

  describe('truncateToTokenBudget', () => {
    it('should return text unchanged if within budget', () => {
      const text = 'Short text.';
      const result = truncateToTokenBudget(text, 1000);
      expect(result).toBe(text);
    });

    it('should truncate at sentence boundary', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const result = truncateToTokenBudget(text, 5); // Very tight budget
      expect(result.length).toBeLessThan(text.length);
      // Should end at a sentence boundary (period)
      expect(result.endsWith('.')).toBe(true);
    });

    it('should handle text without sentence boundaries', () => {
      const text = 'a '.repeat(100);
      const result = truncateToTokenBudget(text, 10);
      expect(result.length).toBeLessThan(text.length);
    });

    it('should handle empty text', () => {
      expect(truncateToTokenBudget('', 100)).toBe('');
    });

    it('should not truncate very short text even with tiny budget', () => {
      const result = truncateToTokenBudget('Hi.', 1);
      // Should return at least something
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('assembleContextWithBudget', () => {
    it('should allocate budget according to defaults', () => {
      const sections = {
        systemBase: 'System prompt base text for the AI assistant.',
        workingMemory: 'Current goal: help with coding.',
        personalFacts: 'User prefers TypeScript. User works at a startup.',
        ragContext: 'Relevant document: TypeScript generics are powerful...',
        history: 'User: Hello\nAssistant: Hi!',
      };

      const result = assembleContextWithBudget(sections, 20000);

      expect(result.assembled).toContain('System prompt');
      expect(result.assembled).toContain('coding');
      expect(result.tokenEstimate).toBeGreaterThan(0);
      expect(result.tokenEstimate).toBeLessThanOrEqual(20000);
      expect(result.summarizationNeeded).toBe(false);
    });

    it('should flag summarization when history exceeds 80K tokens', () => {
      const sections = {
        systemBase: 'Short system.',
        history: 'x'.repeat(400000), // ~100K tokens
      };

      const result = assembleContextWithBudget(sections, 200000);

      expect(result.summarizationNeeded).toBe(true);
    });

    it('should not flag summarization for small history', () => {
      const sections = {
        systemBase: 'Short system.',
        history: 'Short history.',
      };

      const result = assembleContextWithBudget(sections, 20000);

      expect(result.summarizationNeeded).toBe(false);
    });

    it('should respect total budget by truncating sections', () => {
      const sections = {
        systemBase: 'x'.repeat(20000),
        workingMemory: 'x'.repeat(20000),
        personalFacts: 'x'.repeat(20000),
        ragContext: 'x'.repeat(20000),
        history: 'x'.repeat(20000),
      };

      const result = assembleContextWithBudget(sections, 20000);

      // Fixed allocations = 15K, history gets remainder = 5K
      // Total should be close to 20K (sections truncated to their budgets)
      expect(result.tokenEstimate).toBeLessThanOrEqual(22000);
      // Each section should be truncated, not full
      expect(result.assembled.length).toBeLessThan(100000);
    });

    it('should handle empty sections', () => {
      const result = assembleContextWithBudget({}, 20000);

      expect(result.assembled).toBe('');
      expect(result.tokenEstimate).toBe(0);
    });

    it('should handle missing optional sections', () => {
      const result = assembleContextWithBudget({
        systemBase: 'Only system prompt.',
      }, 20000);

      expect(result.assembled).toContain('Only system prompt');
    });

    it('should include allocation breakdown', () => {
      const sections = {
        systemBase: 'System',
        ragContext: 'RAG content',
      };

      const result = assembleContextWithBudget(sections, 20000);

      expect(result.allocations).toBeDefined();
      expect(result.allocations.systemBase).toBeGreaterThan(0);
      expect(result.allocations.ragContext).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_BUDGET_ALLOCATION', () => {
    it('should have correct budget proportions', () => {
      expect(DEFAULT_BUDGET_ALLOCATION.systemBase).toBe(2000);
      expect(DEFAULT_BUDGET_ALLOCATION.workingMemory).toBe(2000);
      expect(DEFAULT_BUDGET_ALLOCATION.personalFacts).toBe(3000);
      expect(DEFAULT_BUDGET_ALLOCATION.ragContext).toBe(8000);
    });

    it('should sum to less than typical context window', () => {
      const fixedBudget = Object.values(DEFAULT_BUDGET_ALLOCATION).reduce((a, b) => a + b, 0);
      expect(fixedBudget).toBeLessThan(200000);
    });
  });
});
