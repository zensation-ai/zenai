/**
 * Tests for LLM-Based Episodic Consolidation (Phase 100)
 *
 * Tests that episode consolidation uses Claude Haiku for fact extraction
 * instead of simple string truncation, with fallback to old method.
 */

import { extractFactsFromEpisodes } from '../../../services/memory/llm-consolidation';

jest.mock('../../../services/claude/core', () => ({
  generateClaudeResponse: jest.fn(),
}));

jest.mock('../../../services/claude/client', () => ({
  MODEL_CONFIG: {
    default: 'claude-sonnet-4-20250514',
    haiku: 'claude-haiku-4-5-20251001',
  },
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  getClaudeClient: jest.fn(),
  executeWithProtection: jest.fn(),
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { generateClaudeResponse } = require('../../../services/claude/core');
const { generateEmbedding } = require('../../../services/ai');
const { queryContext } = require('../../../utils/database-context');

describe('LLM-Based Episodic Consolidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockEpisodes = [
    {
      id: 'ep-1',
      trigger: 'Tell me about TypeScript generics',
      response: 'TypeScript generics allow you to write reusable, type-safe code...',
      retrievalStrength: 0.8,
    },
    {
      id: 'ep-2',
      trigger: 'How do I use React hooks?',
      response: 'React hooks like useState and useEffect let you use state in function components...',
      retrievalStrength: 0.7,
    },
  ];

  describe('extractFactsFromEpisodes', () => {
    it('should call Claude Haiku to extract semantic facts', async () => {
      generateClaudeResponse.mockResolvedValueOnce(JSON.stringify([
        { content: 'User is interested in TypeScript generics', fact_type: 'knowledge', confidence: 0.85 },
        { content: 'User works with React hooks', fact_type: 'knowledge', confidence: 0.8 },
      ]));

      const facts = await extractFactsFromEpisodes(mockEpisodes);

      expect(facts).toHaveLength(2);
      expect(facts[0].content).toContain('TypeScript');
      expect(generateClaudeResponse).toHaveBeenCalledTimes(1);
    });

    it('should respect max 3 facts output', async () => {
      generateClaudeResponse.mockResolvedValueOnce(JSON.stringify([
        { content: 'Fact 1', fact_type: 'knowledge', confidence: 0.9 },
        { content: 'Fact 2', fact_type: 'knowledge', confidence: 0.8 },
        { content: 'Fact 3', fact_type: 'knowledge', confidence: 0.7 },
        { content: 'Fact 4', fact_type: 'knowledge', confidence: 0.6 },
        { content: 'Fact 5', fact_type: 'knowledge', confidence: 0.5 },
      ]));

      const facts = await extractFactsFromEpisodes(mockEpisodes);

      expect(facts.length).toBeLessThanOrEqual(3);
    });

    it('should fall back to substring method on Claude error', async () => {
      generateClaudeResponse.mockRejectedValueOnce(new Error('API error'));

      const facts = await extractFactsFromEpisodes(mockEpisodes);

      // Should get fallback facts from substring method
      expect(facts).toHaveLength(2); // One per episode
      expect(facts[0].content).toContain('Interaktion');
    });

    it('should fall back on invalid JSON response', async () => {
      generateClaudeResponse.mockResolvedValueOnce('This is not JSON');

      const facts = await extractFactsFromEpisodes(mockEpisodes);

      // Should get fallback facts
      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0].content).toContain('Interaktion');
    });

    it('should handle empty episode list', async () => {
      const facts = await extractFactsFromEpisodes([]);

      expect(facts).toHaveLength(0);
      expect(generateClaudeResponse).not.toHaveBeenCalled();
    });

    it('should validate fact_type in Claude response', async () => {
      generateClaudeResponse.mockResolvedValueOnce(JSON.stringify([
        { content: 'Valid fact', fact_type: 'knowledge', confidence: 0.9 },
        { content: 'Invalid type', fact_type: 'invalid_type', confidence: 0.8 },
      ]));

      const facts = await extractFactsFromEpisodes(mockEpisodes);

      // Invalid fact_type should be corrected to 'context'
      const typedFacts = facts.filter(f => f.fact_type === 'knowledge' || f.fact_type === 'context');
      expect(typedFacts).toHaveLength(facts.length);
    });

    it('should clamp confidence to 0-1 range', async () => {
      generateClaudeResponse.mockResolvedValueOnce(JSON.stringify([
        { content: 'High confidence', fact_type: 'knowledge', confidence: 1.5 },
        { content: 'Low confidence', fact_type: 'knowledge', confidence: -0.2 },
      ]));

      const facts = await extractFactsFromEpisodes(mockEpisodes);

      for (const fact of facts) {
        expect(fact.confidence).toBeGreaterThanOrEqual(0);
        expect(fact.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include episode context in Claude prompt', async () => {
      generateClaudeResponse.mockResolvedValueOnce('[]');

      await extractFactsFromEpisodes(mockEpisodes);

      const userPrompt = generateClaudeResponse.mock.calls[0][1];
      expect(userPrompt).toContain('TypeScript generics');
      expect(userPrompt).toContain('React hooks');
    });
  });
});
