/**
 * Unit Tests for Causal Engine (Knowledge Graph)
 *
 * Tests cause-effect pair extraction, causal chain traversal,
 * and narrative explanation generation.
 */

import {
  extractCausalPairs,
  buildCausalChain,
  explainWhy,
} from '../../../services/knowledge-graph/causal-engine';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../services/claude/core', () => ({
  generateClaudeResponse: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import { generateClaudeResponse } from '../../../services/claude/core';

var mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
var mockGenerateClaudeResponse = generateClaudeResponse as jest.MockedFunction<typeof generateClaudeResponse>;

describe('Causal Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockGenerateClaudeResponse.mockReset();
  });

  // ===========================================
  // extractCausalPairs
  // ===========================================

  describe('extractCausalPairs', () => {
    it('should return parsed causal pairs from Claude JSON response', async () => {
      const pairs = [
        { cause: 'Sleep deprivation', effect: 'Reduced cognitive performance', confidence: 0.9 },
        { cause: 'Exercise', effect: 'Improved memory consolidation', confidence: 0.85 },
      ];
      mockGenerateClaudeResponse.mockResolvedValueOnce(JSON.stringify(pairs));

      const result = await extractCausalPairs('Lack of sleep hurts cognition; exercise improves memory.', 'operations');

      expect(result).toHaveLength(2);
      expect(result[0].cause).toBe('Sleep deprivation');
      expect(result[0].effect).toBe('Reduced cognitive performance');
      expect(result[0].confidence).toBe(0.9);
      expect(result[1].cause).toBe('Exercise');
    });

    it('should return empty array when Claude returns empty JSON array', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('[]');

      const result = await extractCausalPairs('No causal content here.', 'operations');

      expect(result).toEqual([]);
    });

    it('should return empty array on Claude error', async () => {
      mockGenerateClaudeResponse.mockRejectedValueOnce(new Error('API error'));

      const result = await extractCausalPairs('some text', 'operations');

      expect(result).toEqual([]);
    });

    it('should handle malformed JSON gracefully', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('not valid json {{{');

      const result = await extractCausalPairs('some text', 'operations');

      expect(result).toEqual([]);
    });
  });

  // ===========================================
  // buildCausalChain
  // ===========================================

  describe('buildCausalChain', () => {
    it('should return empty chain for unknown entity (no DB rows)', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      const result = await buildCausalChain('unknown-entity-id', 'operations');

      expect(result).toEqual([]);
    });

    it('should build a single-hop chain when one caused_by relation exists', async () => {
      // First call: direct caused_by relations for the root entity
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            source_id: 'entity-a',
            target_id: 'entity-b',
            strength: '0.8',
          },
        ],
      } as never);
      // Second call: next hop — no further relations
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      const result = await buildCausalChain('entity-a', 'operations');

      expect(result).toHaveLength(1);
      expect(result[0].sourceId).toBe('entity-a');
      expect(result[0].targetId).toBe('entity-b');
      expect(result[0].confidence).toBeGreaterThan(0);
      expect(result[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should apply confidence decay over multiple hops', async () => {
      // Hop 1
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ source_id: 'a', target_id: 'b', strength: '1.0' }],
      } as never);
      // Hop 2
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ source_id: 'b', target_id: 'c', strength: '1.0' }],
      } as never);
      // Hop 3 — no more relations
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      const result = await buildCausalChain('a', 'operations', 5);

      expect(result).toHaveLength(2);
      // Second hop should have lower confidence than first due to decay
      expect(result[1].confidence).toBeLessThan(result[0].confidence);
    });

    it('should respect maxDepth limit', async () => {
      // Always return a next hop to test depth limiting
      mockQueryContext.mockResolvedValue({
        rows: [{ source_id: 'x', target_id: 'y', strength: '0.9' }],
      } as never);

      const result = await buildCausalChain('root', 'operations', 2);

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await buildCausalChain('entity-a', 'operations');

      expect(result).toEqual([]);
    });
  });

  // ===========================================
  // explainWhy
  // ===========================================

  describe('explainWhy', () => {
    it('should return null explanation for unknown entity with empty chain', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      const result = await explainWhy('unknown-entity', 'operations');

      expect(result).toBeNull();
    });

    it('should ask Claude for narrative when chain is non-empty', async () => {
      // DB returns one hop
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ source_id: 'entity-a', target_id: 'entity-b', strength: '0.75' }],
      } as never);
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      mockGenerateClaudeResponse.mockResolvedValueOnce(
        'Entity A causes Entity B through a direct causal pathway.'
      );

      const result = await explainWhy('entity-a', 'operations');

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(mockGenerateClaudeResponse).toHaveBeenCalledTimes(1);
    });

    it('should return null on Claude error even with valid chain', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ source_id: 'entity-a', target_id: 'entity-b', strength: '0.75' }],
      } as never);
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      mockGenerateClaudeResponse.mockRejectedValueOnce(new Error('Claude timeout'));

      const result = await explainWhy('entity-a', 'operations');

      expect(result).toBeNull();
    });
  });
});
