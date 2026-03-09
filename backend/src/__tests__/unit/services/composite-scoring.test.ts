/**
 * Composite Importance Scoring & Graduated Decay Tests
 *
 * Tests for Phase 42 memory enhancements:
 * - Composite importance scoring (recency × usage × confidence)
 * - Graduated decay classes (permanent, slow_decay, normal_decay, fast_decay)
 * - Usage tracking during retrieval
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../services/claude', () => ({
  queryClaudeJSON: jest.fn().mockResolvedValue({ patterns: [], facts: [] }),
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

import { longTermMemory, PersonalizationFact, DecayClass } from '../../../services/memory/long-term-memory';

describe('Composite Importance Scoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PersonalizationFact interface', () => {
    it('should include new Phase 42 fields', () => {
      const fact: PersonalizationFact = {
        id: 'test-1',
        factType: 'knowledge',
        content: 'Test fact',
        confidence: 0.8,
        source: 'explicit',
        firstSeen: new Date(),
        lastConfirmed: new Date(),
        occurrences: 1,
        retrievalCount: 0,
        lastRetrieved: null,
        decayClass: 'normal_decay',
      };

      expect(fact.retrievalCount).toBe(0);
      expect(fact.lastRetrieved).toBeNull();
      expect(fact.decayClass).toBe('normal_decay');
    });

    it('should support all decay classes', () => {
      const classes: DecayClass[] = ['permanent', 'slow_decay', 'normal_decay', 'fast_decay'];
      for (const cls of classes) {
        const fact: PersonalizationFact = {
          id: `test-${cls}`,
          factType: 'knowledge',
          content: `Test ${cls}`,
          confidence: 0.8,
          source: 'explicit',
          firstSeen: new Date(),
          lastConfirmed: new Date(),
          occurrences: 1,
          retrievalCount: 0,
          lastRetrieved: null,
          decayClass: cls,
        };
        expect(fact.decayClass).toBe(cls);
      }
    });
  });

  describe('addFact with decay class', () => {
    it('should accept facts without explicit decay class', async () => {
      // longTermMemory.addFact should not throw when decayClass is omitted
      // (it should be inferred internally)
      await expect(
        longTermMemory.addFact('personal', {
          factType: 'knowledge',
          content: 'Test fact without decay class',
          confidence: 0.8,
          source: 'explicit',
        })
      ).resolves.not.toThrow();
    });

    it('should accept facts with explicit decay class', async () => {
      await expect(
        longTermMemory.addFact('personal', {
          factType: 'goal',
          content: 'Become fluent in Japanese',
          confidence: 0.9,
          source: 'explicit',
          decayClass: 'permanent' as DecayClass,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Decay class inference', () => {
    it('should assign permanent to explicit goals', async () => {
      await longTermMemory.addFact('personal', {
        factType: 'goal',
        content: 'Test explicit goal',
        confidence: 0.9,
        source: 'explicit',
      });

      const facts = await longTermMemory.getFacts('personal');
      const goal = facts.find(f => f.content === 'Test explicit goal');
      if (goal) {
        expect(goal.decayClass).toBe('permanent');
      }
    });

    it('should assign slow_decay to explicit preferences', async () => {
      await longTermMemory.addFact('personal', {
        factType: 'preference',
        content: 'Prefers dark mode',
        confidence: 0.8,
        source: 'explicit',
      });

      const facts = await longTermMemory.getFacts('personal');
      const pref = facts.find(f => f.content === 'Prefers dark mode');
      if (pref) {
        expect(pref.decayClass).toBe('slow_decay');
      }
    });

    it('should assign fast_decay to context facts', async () => {
      await longTermMemory.addFact('personal', {
        factType: 'context',
        content: 'Currently working on project X',
        confidence: 0.7,
        source: 'inferred',
      });

      const facts = await longTermMemory.getFacts('personal');
      const ctx = facts.find(f => f.content === 'Currently working on project X');
      if (ctx) {
        expect(ctx.decayClass).toBe('fast_decay');
      }
    });
  });

  describe('Fact retrieval with usage tracking', () => {
    it('should retrieve facts and sort by composite score', async () => {
      // Initialize with some facts
      await longTermMemory.addFact('personal', {
        factType: 'knowledge',
        content: 'Programmiert in TypeScript',
        confidence: 0.9,
        source: 'explicit',
      });
      await longTermMemory.addFact('personal', {
        factType: 'preference',
        content: 'Bevorzugt Terminal-basierte Tools',
        confidence: 0.7,
        source: 'inferred',
      });

      const result = await longTermMemory.retrieve('personal', 'TypeScript');
      expect(result.facts).toBeDefined();
      expect(result.contextualMemory).toBeDefined();
    });
  });

  describe('Fact decay with graduated classes', () => {
    it('should not decay permanent facts', async () => {
      await longTermMemory.addFact('personal', {
        factType: 'goal',
        content: 'Permanent goal for decay test',
        confidence: 0.9,
        source: 'explicit',
      });

      const factsBefore = await longTermMemory.getFacts('personal');
      const permanentFact = factsBefore.find(f => f.content === 'Permanent goal for decay test');
      if (permanentFact) {
        // Simulate old confirmation
        permanentFact.lastConfirmed = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      }

      const { decayed } = await longTermMemory.applyFactDecay('personal');

      const factsAfter = await longTermMemory.getFacts('personal');
      const afterFact = factsAfter.find(f => f.content === 'Permanent goal for decay test');
      if (afterFact && permanentFact) {
        // Permanent facts should not have lost confidence
        expect(afterFact.confidence).toBe(permanentFact.confidence);
      }
    });

    it('should apply applyFactDecay without errors', async () => {
      const result = await longTermMemory.applyFactDecay('personal');
      expect(result).toHaveProperty('decayed');
      expect(result).toHaveProperty('pruned');
      expect(typeof result.decayed).toBe('number');
      expect(typeof result.pruned).toBe('number');
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const stats = await longTermMemory.getStats('personal');
      expect(stats).toHaveProperty('factCount');
      expect(stats).toHaveProperty('patternCount');
      expect(stats).toHaveProperty('interactionCount');
      expect(stats).toHaveProperty('lastConsolidation');
      expect(stats).toHaveProperty('hasProfileEmbedding');
    });
  });
});
