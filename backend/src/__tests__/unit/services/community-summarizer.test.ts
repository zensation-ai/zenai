/**
 * Phase 58: Community Summarizer Tests
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

jest.mock('../../../services/knowledge-graph/graph-reasoning', () => ({
  detectCommunities: jest.fn(),
}));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  })),
}));

import { queryContext } from '../../../utils/database-context';
import { detectCommunities } from '../../../services/knowledge-graph/graph-reasoning';
import { CommunitySummarizer } from '../../../services/knowledge-graph/community-summarizer';
import Anthropic from '@anthropic-ai/sdk';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockDetectCommunities = detectCommunities as jest.MockedFunction<typeof detectCommunities>;

function getMockCreate(): jest.Mock {
  // Each CommunitySummarizer instantiation calls `new Anthropic()` which returns a mock
  // We can get the last mock instance's create function
  const MockAnthropicClass = Anthropic as unknown as jest.Mock;
  const lastInstance = MockAnthropicClass.mock.results[MockAnthropicClass.mock.results.length - 1]?.value;
  return lastInstance?.messages?.create;
}

describe('CommunitySummarizer', () => {
  let summarizer: CommunitySummarizer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    summarizer = new CommunitySummarizer();
  });

  // ===========================================
  // buildCommunitySummaries
  // ===========================================

  describe('buildCommunitySummaries', () => {
    it('should build summaries for detected communities', async () => {
      mockDetectCommunities.mockResolvedValueOnce([
        {
          id: 'comm-1',
          name: null,
          description: null,
          memberIds: ['e1', 'e2'],
          memberCount: 2,
          coherenceScore: 0.8,
          createdAt: new Date().toISOString(),
        },
      ]);

      // Fetch entities
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'e1', name: 'React', type: 'technology', description: 'UI Library', importance: 8 },
          { id: 'e2', name: 'Vue', type: 'technology', description: 'Framework', importance: 7 },
        ],
      } as any);

      // Fetch relations
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { source_entity_id: 'e1', target_entity_id: 'e2', relation_type: 'similar_to', description: 'Both UI frameworks', strength: 0.8 },
        ],
      } as any);

      // Claude summary
      getMockCreate().mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({ summary: 'A group of UI frameworks', keyThemes: ['UI', 'frontend'] }),
        }],
      });

      // Store in DB
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const summaries = await summarizer.buildCommunitySummaries('personal');
      expect(summaries.length).toBe(1);
      expect(summaries[0].summary).toBe('A group of UI frameworks');
      expect(summaries[0].keyThemes).toEqual(['UI', 'frontend']);
    });

    it('should handle empty graph (no communities)', async () => {
      mockDetectCommunities.mockResolvedValueOnce([]);

      const summaries = await summarizer.buildCommunitySummaries('personal');
      expect(summaries).toEqual([]);
    });

    it('should skip communities with no entities', async () => {
      mockDetectCommunities.mockResolvedValueOnce([
        {
          id: 'comm-empty',
          name: null,
          description: null,
          memberIds: ['nonexistent'],
          memberCount: 1,
          coherenceScore: 0,
          createdAt: new Date().toISOString(),
        },
      ]);

      // No entities found
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // No relations
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const summaries = await summarizer.buildCommunitySummaries('personal');
      expect(summaries).toEqual([]);
    });

    it('should use fallback summary when Claude fails', async () => {
      mockDetectCommunities.mockResolvedValueOnce([
        {
          id: 'comm-fail',
          name: null,
          description: null,
          memberIds: ['e1'],
          memberCount: 1,
          coherenceScore: 0.5,
          createdAt: new Date().toISOString(),
        },
      ]);

      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'e1', name: 'Lonely', type: 'concept', description: 'Alone', importance: 5 }],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      getMockCreate().mockRejectedValueOnce(new Error('Claude unavailable'));

      // Store in DB
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const summaries = await summarizer.buildCommunitySummaries('personal');
      expect(summaries.length).toBe(1);
      expect(summaries[0].summary).toContain('Lonely');
    });
  });

  // ===========================================
  // getCommunitySummaries
  // ===========================================

  describe('getCommunitySummaries', () => {
    it('should return summaries from database', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'comm-1',
          community_level: 1,
          entity_ids: ['e1', 'e2'],
          summary: 'AI technologies',
          key_themes: ['AI', 'ML'],
          entity_count: 2,
          edge_count: 1,
          updated_at: '2026-01-01T00:00:00Z',
        }],
      } as any);

      // Fetch entity names
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ name: 'TensorFlow' }, { name: 'PyTorch' }],
      } as any);

      const summaries = await summarizer.getCommunitySummaries('personal');
      expect(summaries.length).toBe(1);
      expect(summaries[0].summary).toBe('AI technologies');
      expect(summaries[0].entityNames).toEqual(['TensorFlow', 'PyTorch']);
    });

    it('should handle database errors', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const summaries = await summarizer.getCommunitySummaries('personal');
      expect(summaries).toEqual([]);
    });
  });

  // ===========================================
  // searchCommunitySummaries
  // ===========================================

  describe('searchCommunitySummaries', () => {
    it('should search by vector similarity', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'comm-1',
          community_level: 1,
          entity_ids: ['e1'],
          summary: 'Machine learning cluster',
          key_themes: ['ML'],
          entity_count: 3,
          edge_count: 2,
          updated_at: '2026-01-01T00:00:00Z',
          similarity: '0.89',
        }],
      } as any);

      const results = await summarizer.searchCommunitySummaries('machine learning', 'personal', 5);
      expect(results.length).toBe(1);
      expect(results[0].summary).toBe('Machine learning cluster');
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Search failed'));

      const results = await summarizer.searchCommunitySummaries('query', 'personal');
      expect(results).toEqual([]);
    });
  });

  // ===========================================
  // refreshStaleCommunitySummaries
  // ===========================================

  describe('refreshStaleCommunitySummaries', () => {
    it('should delete stale and rebuild', async () => {
      // Delete stale
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'old-1' }] } as any);

      // buildCommunitySummaries internals
      mockDetectCommunities.mockResolvedValueOnce([]);

      const count = await summarizer.refreshStaleCommunitySummaries('personal', 24);
      expect(count).toBe(0); // No new summaries (empty graph)
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('DELETE FROM graph_communities_v2'),
        [24]
      );
    });

    it('should handle refresh errors', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Refresh failed'));

      const count = await summarizer.refreshStaleCommunitySummaries('personal');
      expect(count).toBe(0);
    });
  });

  // ===========================================
  // Single-entity community
  // ===========================================

  describe('single-entity community', () => {
    it('should handle communities with a single entity', async () => {
      mockDetectCommunities.mockResolvedValueOnce([
        {
          id: 'single',
          name: null,
          description: null,
          memberIds: ['e1'],
          memberCount: 1,
          coherenceScore: 1.0,
          createdAt: new Date().toISOString(),
        },
      ]);

      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'e1', name: 'Singleton', type: 'concept', description: 'Single entity', importance: 5 }],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      getMockCreate().mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ summary: 'A single concept', keyThemes: ['singleton'] }) }],
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const summaries = await summarizer.buildCommunitySummaries('personal');
      expect(summaries.length).toBe(1);
      expect(summaries[0].entityCount).toBe(1);
    });
  });
});
