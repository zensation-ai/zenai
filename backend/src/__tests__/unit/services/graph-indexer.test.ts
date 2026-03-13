/**
 * Phase 58: Graph Indexer Tests
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../services/knowledge-graph/graph-builder', () => ({
  graphBuilder: {
    extractFromText: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import { graphBuilder } from '../../../services/knowledge-graph/graph-builder';
import { GraphIndexer } from '../../../services/knowledge-graph/graph-indexer';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockExtractFromText = graphBuilder.extractFromText as jest.MockedFunction<typeof graphBuilder.extractFromText>;

describe('GraphIndexer', () => {
  let indexer: GraphIndexer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    indexer = new GraphIndexer();
  });

  // ===========================================
  // indexIdea
  // ===========================================

  describe('indexIdea', () => {
    it('should index a single idea', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'idea-1', title: 'Test Idea', summary: 'A test', raw_content: 'Full content' }],
      } as any);

      mockExtractFromText.mockResolvedValueOnce({
        entities: [{ name: 'Test', type: 'concept' as const, description: 'A test concept', importance: 5 }],
        relations: [],
        entityCount: 1,
        relationCount: 0,
      });

      const result = await indexer.indexIdea('idea-1', 'personal');
      expect(result.entityCount).toBe(1);
      expect(mockExtractFromText).toHaveBeenCalledWith(
        expect.stringContaining('Test Idea'),
        'idea-1',
        'personal'
      );
    });

    it('should return empty result for non-existent idea', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await indexer.indexIdea('nonexistent', 'personal');
      expect(result.entityCount).toBe(0);
      expect(mockExtractFromText).not.toHaveBeenCalled();
    });

    it('should skip ideas with very short text', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'idea-short', title: 'Hi', summary: '', raw_content: '' }],
      } as any);

      const result = await indexer.indexIdea('idea-short', 'personal');
      expect(result.entityCount).toBe(0);
      expect(mockExtractFromText).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // indexBatch
  // ===========================================

  describe('indexBatch', () => {
    it('should process unindexed ideas', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'idea-1', title: 'Idea 1', summary: 'First idea', raw_content: 'Content 1' },
          { id: 'idea-2', title: 'Idea 2', summary: 'Second idea', raw_content: 'Content 2' },
        ],
      } as any);

      mockExtractFromText
        .mockResolvedValueOnce({ entities: [], relations: [], entityCount: 2, relationCount: 1 })
        .mockResolvedValueOnce({ entities: [], relations: [], entityCount: 1, relationCount: 0 });

      const result = await indexer.indexBatch('personal', { limit: 10 });
      expect(result.processedCount).toBe(2);
      expect(result.entitiesCreated).toBe(3);
      expect(result.relationsCreated).toBe(1);
    });

    it('should continue on individual idea errors', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'idea-ok', title: 'Good Idea', summary: 'Works fine', raw_content: 'Content' },
          { id: 'idea-fail', title: 'Bad Idea', summary: 'Will fail', raw_content: 'Content' },
        ],
      } as any);

      mockExtractFromText
        .mockResolvedValueOnce({ entities: [], relations: [], entityCount: 1, relationCount: 0 })
        .mockRejectedValueOnce(new Error('Extraction failed'));

      const result = await indexer.indexBatch('personal');
      expect(result.processedCount).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('idea-fail');
    });

    it('should respect sinceHours parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await indexer.indexBatch('personal', { sinceHours: 24 });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("INTERVAL '1 hour'"),
        expect.arrayContaining([24])
      );
    });

    it('should not run if already indexing', async () => {
      // Start a long-running batch
      mockQueryContext.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ rows: [] } as any), 100)));

      const batch1Promise = indexer.indexBatch('personal');

      // Try to start another
      const batch2 = await indexer.indexBatch('personal');
      expect(batch2.errors).toContain('Indexing already in progress');

      await batch1Promise;
    });
  });

  // ===========================================
  // getIndexingStatus
  // ===========================================

  describe('getIndexingStatus', () => {
    it('should return indexing statistics', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '100' }] } as any) // total ideas
        .mockResolvedValueOnce({ rows: [{ indexed: '45' }] } as any) // indexed
        .mockResolvedValueOnce({ rows: [{ last_indexed: '2026-03-14T10:00:00Z' }] } as any); // last indexed

      const status = await indexer.getIndexingStatus('personal');
      expect(status.totalIdeas).toBe(100);
      expect(status.indexedIdeas).toBe(45);
      expect(status.lastIndexedAt).toBeInstanceOf(Date);
    });

    it('should handle no indexed ideas', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '50' }] } as any)
        .mockResolvedValueOnce({ rows: [{ indexed: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [{ last_indexed: null }] } as any);

      const status = await indexer.getIndexingStatus('personal');
      expect(status.totalIdeas).toBe(50);
      expect(status.indexedIdeas).toBe(0);
      expect(status.lastIndexedAt).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const status = await indexer.getIndexingStatus('personal');
      expect(status.totalIdeas).toBe(0);
      expect(status.indexedIdeas).toBe(0);
      expect(status.lastIndexedAt).toBeNull();
    });
  });

  // ===========================================
  // isIndexing
  // ===========================================

  describe('isIndexing', () => {
    it('should return false when not indexing', () => {
      expect(indexer.isIndexing()).toBe(false);
    });
  });
});
