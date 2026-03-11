/**
 * Graph-Memory Bridge - Unit Tests
 */

import {
  getNeighbors,
  expandViaGraph,
  toContextParts,
  GraphExpansionResult,
} from '../../../../services/memory/graph-memory-bridge';

// Mock database-context
var mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock knowledge-graph for RELATION_TYPE_METADATA
jest.mock('../../../../services/knowledge-graph', () => ({
  RELATION_TYPE_METADATA: {
    similar_to: { label: 'Similar to', labelDe: 'Ähnlich zu', weight: 0.8, bidirectional: true, color: '#6366f1' },
    builds_on: { label: 'Builds on', labelDe: 'Baut auf', weight: 0.9, bidirectional: false, inverse: 'part_of', color: '#10b981' },
    contradicts: { label: 'Contradicts', labelDe: 'Widerspricht', weight: 0.7, bidirectional: true, color: '#ef4444' },
    supports: { label: 'Supports', labelDe: 'Unterstützt', weight: 0.85, bidirectional: false, color: '#22c55e' },
    part_of: { label: 'Part of', labelDe: 'Teil von', weight: 0.85, bidirectional: false, inverse: 'builds_on', color: '#8b5cf6' },
  },
}));

describe('Graph-Memory Bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ========================================
  // getNeighbors
  // ========================================
  describe('getNeighbors', () => {
    it('should return neighbors with relation annotations', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            source_id: 'idea-1',
            target_id: 'idea-2',
            relation_type: 'similar_to',
            strength: 0.85,
            reason: 'Both about AI',
            neighbor_id: 'idea-2',
            neighbor_title: 'AI in Healthcare',
            neighbor_summary: 'Using AI for medical diagnostics',
            direction: 'outgoing',
          },
          {
            source_id: 'idea-1',
            target_id: 'idea-3',
            relation_type: 'builds_on',
            strength: 0.7,
            reason: 'Extension',
            neighbor_id: 'idea-3',
            neighbor_title: 'ML Pipeline',
            neighbor_summary: 'End-to-end ML pipeline design',
            direction: 'outgoing',
          },
        ],
      });

      const result = await getNeighbors('idea-1', 'personal');

      expect(result).toHaveLength(2);
      expect(result[0].ideaId).toBe('idea-2');
      expect(result[0].title).toBe('AI in Healthcare');
      expect(result[0].relationLabel).toBe('Ähnlich zu');
      expect(result[0].strength).toBe(0.85);
      expect(result[1].relationLabel).toBe('Baut auf');
    });

    it('should use inverse label for incoming relations', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            source_id: 'idea-2',
            target_id: 'idea-1',
            relation_type: 'builds_on',
            strength: 0.8,
            reason: 'Builds on idea-1',
            neighbor_id: 'idea-2',
            neighbor_title: 'Extended Idea',
            neighbor_summary: 'An extension',
            direction: 'incoming',
          },
        ],
      });

      const result = await getNeighbors('idea-1', 'personal');

      expect(result).toHaveLength(1);
      // 'builds_on' incoming → inverse is 'part_of' → labelDe = 'Teil von'
      expect(result[0].relationLabel).toBe('Teil von');
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const result = await getNeighbors('idea-1', 'personal');

      expect(result).toEqual([]);
    });

    it('should respect minStrength parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await getNeighbors('idea-1', 'personal', { minStrength: 0.8 });

      // Check that the strength threshold was passed to the query
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining([0.8])
      );
    });

    it('should truncate long summaries', async () => {
      const longSummary = 'A'.repeat(300);
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          source_id: 'idea-1',
          target_id: 'idea-2',
          relation_type: 'similar_to',
          strength: 0.9,
          neighbor_id: 'idea-2',
          neighbor_title: 'Test',
          neighbor_summary: longSummary,
          direction: 'outgoing',
        }],
      });

      const result = await getNeighbors('idea-1', 'personal');

      expect(result[0].summary.length).toBeLessThanOrEqual(200);
    });
  });

  // ========================================
  // expandViaGraph
  // ========================================
  describe('expandViaGraph', () => {
    it('should expand seed ideas with graph neighbors', async () => {
      // Mock for getNeighbors (called per seed idea)
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            source_id: 'seed-1',
            target_id: 'neighbor-1',
            relation_type: 'supports',
            strength: 0.75,
            neighbor_id: 'neighbor-1',
            neighbor_title: 'Supporting Idea',
            neighbor_summary: 'Supports the seed idea',
            direction: 'outgoing',
          },
        ],
      });

      const result = await expandViaGraph(['seed-1'], 'personal');

      expect(result.contextParts).toHaveLength(1);
      expect(result.contextParts[0].content).toContain('Unterstützt');
      expect(result.contextParts[0].content).toContain('Supporting Idea');
      expect(result.contextParts[0].relevance).toBeGreaterThan(0.75); // boosted
      expect(result.expansionCount).toBe(1);
    });

    it('should not duplicate seed ideas in results', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            source_id: 'seed-1',
            target_id: 'seed-2', // Another seed, should be skipped
            relation_type: 'similar_to',
            strength: 0.9,
            neighbor_id: 'seed-2',
            neighbor_title: 'Seed 2',
            neighbor_summary: 'Also a seed',
            direction: 'outgoing',
          },
          {
            source_id: 'seed-1',
            target_id: 'new-idea',
            relation_type: 'builds_on',
            strength: 0.7,
            neighbor_id: 'new-idea',
            neighbor_title: 'New Discovery',
            neighbor_summary: 'Something new',
            direction: 'outgoing',
          },
        ],
      }).mockResolvedValueOnce({ rows: [] }); // For seed-2

      const result = await expandViaGraph(['seed-1', 'seed-2'], 'personal');

      // Only 'new-idea' should be in results (seed-2 is excluded)
      expect(result.contextParts).toHaveLength(1);
      expect(result.contextParts[0].neighborIdeaId).toBe('new-idea');
    });

    it('should return empty for no seed ideas', async () => {
      const result = await expandViaGraph([], 'personal');

      expect(result.contextParts).toEqual([]);
      expect(result.serendipityHints).toEqual([]);
      expect(result.expansionCount).toBe(0);
    });

    it('should handle serendipity mode', async () => {
      // 1-hop neighbors
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          source_id: 'seed-1',
          target_id: 'hop1',
          relation_type: 'similar_to',
          strength: 0.8,
          neighbor_id: 'hop1',
          neighbor_title: 'First Hop',
          neighbor_summary: 'Direct neighbor',
          direction: 'outgoing',
        }],
      });

      // 2-hop neighbors (serendipity)
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          neighbor_id: 'hop2',
          neighbor_title: 'Unexpected Connection',
          neighbor_summary: 'A surprising link',
          relation_type: 'contradicts',
          combined_strength: 0.4,
          direction: 'outgoing',
        }],
      });

      const result = await expandViaGraph(['seed-1'], 'personal', {
        enableSerendipity: true,
      });

      expect(result.contextParts).toHaveLength(1); // 1-hop
      expect(result.serendipityHints).toHaveLength(1); // 2-hop as question
      expect(result.serendipityHints[0]).toContain('Unexpected Connection');
    });

    it('should limit seed processing to 5 ideas max', async () => {
      const seeds = Array.from({ length: 10 }, (_, i) => `seed-${i}`);
      mockQueryContext.mockResolvedValue({ rows: [] });

      await expandViaGraph(seeds, 'personal');

      // Should only call getNeighbors for first 5 seeds
      expect(mockQueryContext).toHaveBeenCalledTimes(5);
    });
  });

  // ========================================
  // toContextParts
  // ========================================
  describe('toContextParts', () => {
    it('should convert graph neighbors to document type', () => {
      const expansion: GraphExpansionResult = {
        contextParts: [{
          content: '[Ähnlich zu "AI in Healthcare"] Using AI for diagnostics',
          relevance: 0.935,
          sourceIdeaId: 'seed-1',
          neighborIdeaId: 'idea-2',
          relationType: 'similar_to',
        }],
        serendipityHints: [],
        expansionCount: 1,
      };

      const parts = toContextParts(expansion);

      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('document');
      expect(parts[0].source).toBe('knowledge_graph');
      expect(parts[0].relevance).toBe(0.935);
    });

    it('should convert serendipity hints to hint type', () => {
      const expansion: GraphExpansionResult = {
        contextParts: [],
        serendipityHints: [
          'Hast du bedacht, dass "AI Ethics" hier relevant sein könnte?',
        ],
        expansionCount: 0,
      };

      const parts = toContextParts(expansion);

      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('hint');
      expect(parts[0].source).toBe('knowledge_graph');
      expect(parts[0].relevance).toBe(0.6); // SERENDIPITY_RELEVANCE
    });

    it('should handle mixed context parts and hints', () => {
      const expansion: GraphExpansionResult = {
        contextParts: [
          { content: 'Neighbor 1', relevance: 0.9, sourceIdeaId: 's1', neighborIdeaId: 'n1', relationType: 'supports' },
          { content: 'Neighbor 2', relevance: 0.8, sourceIdeaId: 's1', neighborIdeaId: 'n2', relationType: 'similar_to' },
        ],
        serendipityHints: ['Hint 1'],
        expansionCount: 2,
      };

      const parts = toContextParts(expansion);

      expect(parts).toHaveLength(3);
      expect(parts.filter(p => p.type === 'document')).toHaveLength(2);
      expect(parts.filter(p => p.type === 'hint')).toHaveLength(1);
    });

    it('should handle empty expansion', () => {
      const expansion: GraphExpansionResult = {
        contextParts: [],
        serendipityHints: [],
        expansionCount: 0,
      };

      const parts = toContextParts(expansion);

      expect(parts).toEqual([]);
    });
  });
});
