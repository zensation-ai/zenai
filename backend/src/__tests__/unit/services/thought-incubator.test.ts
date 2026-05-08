/**
 * Unit Tests for Thought Incubator Service
 *
 * Tests loose thought capture, cluster assignment, maturity scoring,
 * consolidation, batch analysis, stats, and embedding backfill.
 *
 * @module tests/unit/services/thought-incubator
 */

// ---- Mocks (before imports) ----

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

const mockConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('../../../utils/database-context', () => ({
  getPool: jest.fn(() => ({ connect: mockConnect })),
  isValidContext: jest.fn((ctx: string) =>
    ['operations', 'finance', 'people', 'strategy', 'demo'].includes(ctx)
  ),
  AIContext: {},
}));

const mockGenerateEmbedding = jest.fn();
jest.mock('../../../utils/ollama', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  queryOllamaJSON: jest.fn(),
}));

jest.mock('../../../utils/embedding', () => ({
  formatForPgVector: jest.fn((v: number[]) => `[${v.join(',')}]`),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-001'),
}));

jest.mock('../../../services/learning-engine', () => ({
  learnFromThought: jest.fn().mockResolvedValue(undefined),
}));

// ---- Imports ----

import {
  addLooseThought,
  getLooseThoughts,
  getReadyClusters,
  getAllClusters,
  generateClusterSummary,
  consolidateCluster,
  dismissCluster,
  markClusterPresented,
  runBatchAnalysis,
  getIncubatorStats,
  backfillEmbeddings,
} from '../../../services/thought-incubator';

// ---- Helpers ----

const makeThoughtRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'thought-001',
  user_id: 'default',
  raw_input: 'A random thought about AI',
  source: 'text',
  user_tags: ['ai', 'test'],
  cluster_id: null,
  similarity_to_cluster: null,
  is_processed: false,
  created_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

const makeClusterRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'cluster-001',
  user_id: 'default',
  title: 'AI Thoughts',
  summary: 'A cluster about AI topics',
  suggested_type: 'idea',
  suggested_category: 'technical',
  thought_count: 5,
  confidence_score: 0.8,
  maturity_score: 0.75,
  status: 'ready',
  created_at: new Date('2026-03-18T10:00:00Z'),
  updated_at: new Date('2026-03-20T10:00:00Z'),
  thoughts: [],
  ...overrides,
});

// ---- Tests ----

describe('Thought Incubator Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  // ===========================================
  // addLooseThought
  // ===========================================

  describe('addLooseThought', () => {
    it('should create a thought with embedding and return it', async () => {
      // SET search_path
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // INSERT RETURNING *
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow({ id: 'test-uuid-001' })],
      } as any);

      const result = await addLooseThought('My thought', 'text', ['tag1'], 'user1', 'operations');

      expect(result.id).toBe('test-uuid-001');
      expect(result.raw_input).toBe('A random thought about AI');
      expect(result.source).toBe('text');
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('My thought');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should use default parameters when none provided', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow()],
      } as any);

      const result = await addLooseThought('Quick thought');

      expect(result).toBeDefined();
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Quick thought');
    });

    it('should handle empty embedding gracefully', async () => {
      mockGenerateEmbedding.mockResolvedValue([]);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow({ id: 'test-uuid-001' })],
      } as any);

      const result = await addLooseThought('Thought without embedding');

      expect(result).toBeDefined();
      // With empty embedding, null should be passed for the embedding column
      const insertCall = mockClientQuery.mock.calls[1];
      expect(insertCall[1][5]).toBeNull();
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockGenerateEmbedding.mockRejectedValue(new Error('Embedding failed'));

      await expect(addLooseThought('Failing thought')).rejects.toThrow('Embedding failed');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should handle voice source type', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow({ source: 'voice' })],
      } as any);

      const result = await addLooseThought('Voice note', 'voice');

      expect(result.source).toBe('voice');
    });

    it('should handle quick_jot source type', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow({ source: 'quick_jot' })],
      } as any);

      const result = await addLooseThought('Jot', 'quick_jot');

      expect(result.source).toBe('quick_jot');
    });

    it('should pass user_tags as JSON string', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow()],
      } as any);

      await addLooseThought('Tagged thought', 'text', ['alpha', 'beta']);

      const insertCall = mockClientQuery.mock.calls[1];
      expect(insertCall[1][4]).toBe(JSON.stringify(['alpha', 'beta']));
    });

    it('should return empty user_tags array when row has null', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow({ user_tags: null })],
      } as any);

      const result = await addLooseThought('No tags');

      expect(result.user_tags).toEqual([]);
    });
  });

  // ===========================================
  // getLooseThoughts
  // ===========================================

  describe('getLooseThoughts', () => {
    it('should return thoughts for user', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow(), makeThoughtRow({ id: 'thought-002' })],
      } as any);

      const results = await getLooseThoughts('user1', 50, true, 'operations');

      expect(results).toHaveLength(2);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should use default parameters', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const results = await getLooseThoughts();

      expect(results).toEqual([]);
    });

    it('should return empty array when no thoughts exist', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const results = await getLooseThoughts('user1');

      expect(results).toEqual([]);
    });

    it('should filter unprocessed when includeProcessed is false', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeThoughtRow({ is_processed: false })],
      } as any);

      const results = await getLooseThoughts('user1', 50, false, 'operations');

      expect(results).toHaveLength(1);
      // The SQL should include the filter
      const queryCall = mockClientQuery.mock.calls[1];
      expect(queryCall[0]).toContain('is_processed = false');
    });

    it('should not filter processed when includeProcessed is true', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await getLooseThoughts('user1', 50, true, 'operations');

      const queryCall = mockClientQuery.mock.calls[1];
      expect(queryCall[0]).not.toContain('is_processed = false');
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('Query failed'));

      await expect(getLooseThoughts('user1')).rejects.toThrow('Query failed');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should respect custom limit', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await getLooseThoughts('user1', 10);

      const queryCall = mockClientQuery.mock.calls[1];
      expect(queryCall[1][1]).toBe(10);
    });
  });

  // ===========================================
  // getReadyClusters
  // ===========================================

  describe('getReadyClusters', () => {
    it('should return clusters with ready status', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow(), makeClusterRow({ id: 'cluster-002' })],
      } as any);

      const results = await getReadyClusters('user1', 'operations');

      expect(results).toHaveLength(2);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should return empty array when no ready clusters', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const results = await getReadyClusters();

      expect(results).toEqual([]);
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('DB down'));

      await expect(getReadyClusters('user1')).rejects.toThrow('DB down');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ===========================================
  // getAllClusters
  // ===========================================

  describe('getAllClusters', () => {
    it('should return clusters with thoughts when includeThoughts is true', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow({ thoughts: [makeThoughtRow()] })],
      } as any);

      const results = await getAllClusters('user1', true, 'operations');

      expect(results).toHaveLength(1);
      expect(results[0].thoughts).toBeDefined();
    });

    it('should return clusters without thoughts when includeThoughts is false', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow()],
      } as any);

      const results = await getAllClusters('user1', false, 'operations');

      expect(results).toHaveLength(1);
      // Query should NOT contain LEFT JOIN
      const queryCall = mockClientQuery.mock.calls[1];
      expect(queryCall[0]).not.toContain('LEFT JOIN');
    });

    it('should include LEFT JOIN when includeThoughts is true', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await getAllClusters('user1', true, 'operations');

      const queryCall = mockClientQuery.mock.calls[1];
      expect(queryCall[0]).toContain('LEFT JOIN');
    });

    it('should use default parameters', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const results = await getAllClusters();

      expect(results).toEqual([]);
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('Network error'));

      await expect(getAllClusters('user1')).rejects.toThrow('Network error');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ===========================================
  // generateClusterSummary
  // ===========================================

  describe('generateClusterSummary', () => {
    it('should generate summary using AI and update cluster', async () => {
      const { queryOllamaJSON } = require('../../../utils/ollama');
      (queryOllamaJSON as jest.Mock).mockResolvedValue({
        title: 'AI Ideas',
        summary: 'A collection of AI-related ideas',
        suggested_type: 'idea',
        suggested_category: 'technical',
      });

      // SET search_path
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // SELECT thoughts
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          { raw_input: 'Thought 1', created_at: new Date() },
          { raw_input: 'Thought 2', created_at: new Date() },
        ],
      } as any);
      // UPDATE cluster
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await generateClusterSummary('cluster-001', 'operations');

      expect(result.title).toBe('AI Ideas');
      expect(result.summary).toBe('A collection of AI-related ideas');
      expect(result.suggested_type).toBe('idea');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should throw when cluster has no thoughts', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await expect(generateClusterSummary('empty-cluster')).rejects.toThrow('Cluster has no thoughts');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should throw when AI analysis returns null', async () => {
      const { queryOllamaJSON } = require('../../../utils/ollama');
      (queryOllamaJSON as jest.Mock).mockResolvedValue(null);

      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ raw_input: 'Thought 1', created_at: new Date() }],
      } as any);

      await expect(generateClusterSummary('cluster-001')).rejects.toThrow('AI analysis failed');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ===========================================
  // consolidateCluster
  // ===========================================

  describe('consolidateCluster', () => {
    it('should create idea from cluster and mark as consolidated', async () => {
      // SET search_path
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // SELECT cluster
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow({ title: 'My Cluster', summary: 'Summary text' })],
      } as any);
      // SELECT thoughts for raw transcript
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          { raw_input: 'Thought 1', created_at: new Date('2026-03-18') },
          { raw_input: 'Thought 2', created_at: new Date('2026-03-19') },
        ],
      } as any);
      // INSERT idea
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // UPDATE cluster status
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // COMMIT
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const ideaId = await consolidateCluster('cluster-001', undefined, 'operations');

      expect(ideaId).toBe('test-uuid-001');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should apply user overrides for title, type, category, priority', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow({ title: 'Original', summary: 'Desc' })],
      } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ raw_input: 'T1', created_at: new Date() }],
      } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await consolidateCluster('cluster-001', {
        title: 'Custom Title',
        type: 'task',
        category: 'business',
        priority: 'high',
      });

      // Find the INSERT INTO ideas call
      const insertCall = mockClientQuery.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO ideas')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][1]).toBe('Custom Title');
      expect(insertCall![1][2]).toBe('task');
      expect(insertCall![1][3]).toBe('business');
      expect(insertCall![1][4]).toBe('high');
    });

    it('should throw when cluster not found', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await expect(consolidateCluster('nonexistent')).rejects.toThrow('Cluster not found');
      // Should ROLLBACK on error
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should rollback transaction on error during idea creation', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow({ title: 'Cluster', summary: 'Summary' })],
      } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ raw_input: 'T1', created_at: new Date() }],
      } as any);
      // Fail on INSERT INTO ideas
      mockClientQuery.mockRejectedValueOnce(new Error('Insert failed'));
      // ROLLBACK
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await expect(consolidateCluster('cluster-001')).rejects.toThrow('Insert failed');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should use default type and category when cluster has none', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow({
          title: 'Title',
          summary: 'Desc',
          suggested_type: null,
          suggested_category: null,
        })],
      } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ raw_input: 'T1', created_at: new Date() }],
      } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await consolidateCluster('cluster-001');

      const insertCall = mockClientQuery.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO ideas')
      );
      expect(insertCall![1][2]).toBe('idea'); // default type
      expect(insertCall![1][3]).toBe('personal'); // default category
    });

    it('should handle empty embedding during consolidation', async () => {
      mockGenerateEmbedding.mockResolvedValue([]);

      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [makeClusterRow({ title: 'Title', summary: 'Desc' })],
      } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ raw_input: 'T1', created_at: new Date() }],
      } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const ideaId = await consolidateCluster('cluster-001');

      expect(ideaId).toBe('test-uuid-001');
      const insertCall = mockClientQuery.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO ideas')
      );
      // embedding param should be null
      expect(insertCall![1][7]).toBeNull();
    });
  });

  // ===========================================
  // dismissCluster
  // ===========================================

  describe('dismissCluster', () => {
    it('should set cluster status to dismissed', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await dismissCluster('cluster-001', 'operations');

      const updateCall = mockClientQuery.mock.calls[1];
      expect(updateCall[0]).toContain('dismissed');
      expect(updateCall[1]).toEqual(['cluster-001']);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should use default context', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await dismissCluster('cluster-001');

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('Update failed'));

      await expect(dismissCluster('cluster-001')).rejects.toThrow('Update failed');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ===========================================
  // markClusterPresented
  // ===========================================

  describe('markClusterPresented', () => {
    it('should set cluster status to presented', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await markClusterPresented('cluster-001', 'operations');

      const updateCall = mockClientQuery.mock.calls[1];
      expect(updateCall[0]).toContain('presented');
      expect(updateCall[1]).toEqual(['cluster-001']);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should use default context', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await markClusterPresented('cluster-001');

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(markClusterPresented('cluster-001')).rejects.toThrow('DB error');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ===========================================
  // runBatchAnalysis
  // ===========================================

  describe('runBatchAnalysis', () => {
    it('should process unprocessed thoughts and return stats', async () => {
      // SET search_path
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // SELECT unprocessed thoughts (none)
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Cluster count before
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] } as any);
      // Cluster count after
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] } as any);
      // Ready clusters count
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);
      // INSERT log
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await runBatchAnalysis('user1', 'operations');

      expect(result.thoughts_analyzed).toBe(0);
      expect(result.clusters_created).toBe(0);
      expect(result.clusters_updated).toBe(0);
      expect(result.clusters_ready).toBe(1);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should use default parameters', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await runBatchAnalysis();

      expect(result.thoughts_analyzed).toBe(0);
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('Batch error'));

      await expect(runBatchAnalysis('user1')).rejects.toThrow('Batch error');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should calculate clusters_created correctly when new clusters appear', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // 0 unprocessed
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Before: 2 clusters
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] } as any);
      // After: 4 clusters
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '4' }] } as any);
      // Ready
      mockClientQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      // Log
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await runBatchAnalysis();

      expect(result.clusters_created).toBe(2);
      // clusters_updated = thoughts_analyzed - clusters_created = 0 - 2 = -2
      // This is an edge case in the implementation
      expect(result.clusters_updated).toBe(-2);
    });
  });

  // ===========================================
  // getIncubatorStats
  // ===========================================

  describe('getIncubatorStats', () => {
    it('should return all statistics', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          total_thoughts: '25',
          unprocessed_thoughts: '3',
          total_clusters: '8',
          ready_clusters: '2',
          growing_clusters: '5',
          consolidated_clusters: '1',
        }],
      } as any);

      const stats = await getIncubatorStats('user1', 'operations');

      expect(stats.total_thoughts).toBe(25);
      expect(stats.unprocessed_thoughts).toBe(3);
      expect(stats.total_clusters).toBe(8);
      expect(stats.ready_clusters).toBe(2);
      expect(stats.growing_clusters).toBe(5);
      expect(stats.consolidated_clusters).toBe(1);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should return zeros when no data', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          total_thoughts: '0',
          unprocessed_thoughts: '0',
          total_clusters: '0',
          ready_clusters: '0',
          growing_clusters: '0',
          consolidated_clusters: '0',
        }],
      } as any);

      const stats = await getIncubatorStats();

      expect(stats.total_thoughts).toBe(0);
      expect(stats.total_clusters).toBe(0);
    });

    it('should use default parameters', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          total_thoughts: '0',
          unprocessed_thoughts: '0',
          total_clusters: '0',
          ready_clusters: '0',
          growing_clusters: '0',
          consolidated_clusters: '0',
        }],
      } as any);

      const stats = await getIncubatorStats();

      expect(stats).toBeDefined();
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('Stats query failed'));

      await expect(getIncubatorStats('user1')).rejects.toThrow('Stats query failed');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should parse string counts to integers', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          total_thoughts: '100',
          unprocessed_thoughts: '10',
          total_clusters: '20',
          ready_clusters: '5',
          growing_clusters: '12',
          consolidated_clusters: '3',
        }],
      } as any);

      const stats = await getIncubatorStats();

      expect(typeof stats.total_thoughts).toBe('number');
      expect(typeof stats.ready_clusters).toBe('number');
      expect(stats.total_thoughts).toBe(100);
    });
  });

  // ===========================================
  // backfillEmbeddings
  // ===========================================

  describe('backfillEmbeddings', () => {
    it('should process thoughts without embeddings', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          { id: 'thought-a', raw_input: 'Text A' },
          { id: 'thought-b', raw_input: 'Text B' },
        ],
      } as any);
      // UPDATE for each thought
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await backfillEmbeddings('user1', 'operations');

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(2);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should return zeros when no thoughts need backfill', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await backfillEmbeddings();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should count failures when embedding returns empty', async () => {
      mockGenerateEmbedding.mockResolvedValue([]);

      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 'thought-a', raw_input: 'Text A' }],
      } as any);

      const result = await backfillEmbeddings();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should count failures when embedding throws', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('Embedding service down'));

      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 'thought-a', raw_input: 'Text A' }],
      } as any);

      const result = await backfillEmbeddings();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should handle mixed success and failure', async () => {
      mockGenerateEmbedding
        .mockResolvedValueOnce([0.1, 0.2])
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce([0.3, 0.4]);

      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          { id: 't1', raw_input: 'A' },
          { id: 't2', raw_input: 'B' },
          { id: 't3', raw_input: 'C' },
        ],
      } as any);
      // UPDATE for t1
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      // t2 fails (no UPDATE)
      // UPDATE for t3
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await backfillEmbeddings();

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should release client on error', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockRejectedValueOnce(new Error('Fatal'));

      await expect(backfillEmbeddings()).rejects.toThrow('Fatal');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ===========================================
  // getClient (internal, tested via exports)
  // ===========================================

  describe('getClient (via exported functions)', () => {
    it('should throw for invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      (isValidContext as jest.Mock).mockReturnValueOnce(false);

      await expect(getLooseThoughts('user1', 50, true, 'invalid' as any)).rejects.toThrow(
        'Invalid context: invalid'
      );
    });

    it('should set search_path for operations context', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await getLooseThoughts('user1', 50, true, 'operations');

      expect(mockClientQuery.mock.calls[0][0]).toBe('SET search_path TO operations, public');
    });

    it('should set search_path for finance context', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockClientQuery.mockResolvedValueOnce({ rows: [] } as any);

      await getLooseThoughts('user1', 50, true, 'finance');

      expect(mockClientQuery.mock.calls[0][0]).toBe('SET search_path TO finance, public');
    });
  });
});
