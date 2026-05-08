/**
 * Unit Tests for SemanticPreClusterer
 *
 * Hippocampal-inspired semantic clustering of memories before storage.
 * USC 2025: cluster memories by semantic category to accelerate encoding
 * and retrieval. Auto-splits clusters when they exceed MAX_CLUSTER_SIZE (50).
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import {
  SemanticPreClusterer,
  ClusterInfo,
  SIMILARITY_THRESHOLD,
  MAX_CLUSTER_SIZE,
} from '../../../../services/memory/semantic-pre-clusterer';

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { queryContext } = require('../../../../utils/database-context');
const mockQueryContext = queryContext as jest.Mock;

// Helper: create a simple 4-dim embedding for tests
const makeEmbedding = (seed = 0.1): number[] => [seed, seed * 2, seed * 3, seed * 4];

describe('SemanticPreClusterer', () => {
  let clusterer: SemanticPreClusterer;

  beforeEach(() => {
    clusterer = new SemanticPreClusterer();
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // =========================================================
  // Cluster Assignment (5 tests)
  // =========================================================

  describe('assignToCluster', () => {
    it('should assign to existing cluster when cosine similarity > 0.6', async () => {
      // Existing cluster found with similarity 0.85
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'cluster-1', similarity: 0.85 }],
        }) // nearest centroid query
        .mockResolvedValueOnce({ rows: [] }) // insert member
        .mockResolvedValueOnce({ rows: [] }); // update member_count

      const result = await clusterer.assignToCluster(makeEmbedding(), 'operations', 'user-1');

      expect(result.clusterId).toBe('cluster-1');
      expect(result.isNew).toBe(false);
    });

    it('should create new cluster when no existing cluster matches (similarity <= 0.6)', async () => {
      // No clusters found above threshold
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] }) // nearest centroid → none returned
        .mockResolvedValueOnce({ rows: [{ id: 'new-cluster-1' }] }) // insert new cluster
        .mockResolvedValueOnce({ rows: [] }); // insert member

      const result = await clusterer.assignToCluster(makeEmbedding(), 'operations', 'user-1');

      expect(result.clusterId).toBe('new-cluster-1');
      expect(result.isNew).toBe(true);
    });

    it('should return { clusterId, isNew } with correct shape', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'cluster-2', similarity: 0.75 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await clusterer.assignToCluster(makeEmbedding(0.2), 'finance', 'user-2');

      expect(result).toHaveProperty('clusterId');
      expect(result).toHaveProperty('isNew');
      expect(typeof result.isNew).toBe('boolean');
    });

    it('should increment member_count when assigning to existing cluster', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'cluster-1', similarity: 0.9 }] })
        .mockResolvedValueOnce({ rows: [] }) // insert member
        .mockResolvedValueOnce({ rows: [] }); // update member_count

      await clusterer.assignToCluster(makeEmbedding(), 'operations', 'user-1');

      const updateCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' &&
          (call[1] as string).toLowerCase().includes('member_count'),
      );
      expect(updateCall).toBeDefined();
    });

    it('should insert a row into memory_cluster_members table', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'cluster-1', similarity: 0.9 }] })
        .mockResolvedValueOnce({ rows: [] }) // insert member
        .mockResolvedValueOnce({ rows: [] }); // update member_count

      await clusterer.assignToCluster(makeEmbedding(), 'operations', 'user-1');

      const memberInsert = mockQueryContext.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' &&
          (call[1] as string).includes('memory_cluster_members'),
      );
      expect(memberInsert).toBeDefined();
    });
  });

  // =========================================================
  // Cluster Retrieval (4 tests)
  // =========================================================

  describe('getTopClusters', () => {
    it('should return top-3 clusters by cosine similarity to query embedding', async () => {
      const mockClusters = [
        { id: 'c-1', member_count: 10, avg_importance: 0.7, label: 'topic-A', similarity: 0.92 },
        { id: 'c-2', member_count: 5, avg_importance: 0.5, label: null, similarity: 0.81 },
        { id: 'c-3', member_count: 3, avg_importance: 0.6, label: 'topic-C', similarity: 0.73 },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: mockClusters });

      const result = await clusterer.getTopClusters(makeEmbedding(), 'operations', 'user-1');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('c-1');
      expect(result[0].similarity).toBe(0.92);
    });

    it('should return clusters ordered by similarity (highest first)', async () => {
      const mockClusters = [
        { id: 'c-1', member_count: 10, avg_importance: 0.7, label: null, similarity: 0.95 },
        { id: 'c-2', member_count: 5, avg_importance: 0.5, label: null, similarity: 0.78 },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: mockClusters });

      const result = await clusterer.getTopClusters(makeEmbedding(), 'operations', 'user-1', 2);

      expect(result[0].similarity).toBeGreaterThan(result[1].similarity);
    });

    it('should filter by context and userId', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await clusterer.getTopClusters(makeEmbedding(), 'finance', 'user-42', 3);

      const call = mockQueryContext.mock.calls[0];
      expect(call[0]).toBe('finance');
      const params = call[2] as unknown[];
      expect(params).toContain('user-42');
    });

    it('should return empty array when no clusters exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await clusterer.getTopClusters(makeEmbedding(), 'operations', 'user-1');

      expect(result).toEqual([]);
    });
  });

  // =========================================================
  // Cluster Splitting (3 tests)
  // =========================================================

  describe('splitCluster', () => {
    it('should trigger split when member_count > MAX_CLUSTER_SIZE (50)', async () => {
      // Fetch members for splitting (51 members)
      const memberRows = Array.from({ length: 51 }, (_, i) => ({
        memory_id: `mem-${i}`,
        embedding: makeEmbedding(0.1 * (i + 1)),
      }));

      mockQueryContext
        .mockResolvedValueOnce({ rows: memberRows }) // fetch members
        .mockResolvedValueOnce({ rows: [{ id: 'new-cluster-A' }] }) // create cluster 1
        .mockResolvedValueOnce({ rows: [] }) // insert members into cluster 1
        .mockResolvedValueOnce({ rows: [{ id: 'new-cluster-B' }] }) // create cluster 2
        .mockResolvedValueOnce({ rows: [] }) // insert members into cluster 2
        .mockResolvedValueOnce({ rows: [] }); // delete original cluster

      const result = await clusterer.splitCluster('cluster-big', 'operations');

      expect(result).toHaveProperty('newCluster1');
      expect(result).toHaveProperty('newCluster2');
    });

    it('should create exactly 2 new clusters when splitting', async () => {
      const memberRows = Array.from({ length: 10 }, (_, i) => ({
        memory_id: `mem-${i}`,
        embedding: makeEmbedding(0.1 * (i + 1)),
      }));

      mockQueryContext
        .mockResolvedValueOnce({ rows: memberRows })
        .mockResolvedValueOnce({ rows: [{ id: 'split-cluster-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'split-cluster-2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await clusterer.splitCluster('cluster-old', 'operations');

      expect(result.newCluster1).toBe('split-cluster-1');
      expect(result.newCluster2).toBe('split-cluster-2');
    });

    it('should delete the original cluster after split', async () => {
      const memberRows = Array.from({ length: 4 }, (_, i) => ({
        memory_id: `mem-${i}`,
        embedding: makeEmbedding(0.1 * (i + 1)),
      }));

      mockQueryContext
        .mockResolvedValueOnce({ rows: memberRows })
        .mockResolvedValueOnce({ rows: [{ id: 'nc-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'nc-2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // delete

      await clusterer.splitCluster('cluster-to-delete', 'operations');

      const deleteCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' && (call[1] as string).toUpperCase().includes('DELETE'),
      );
      expect(deleteCall).toBeDefined();
      expect((deleteCall![2] as unknown[])).toContain('cluster-to-delete');
    });
  });

  // =========================================================
  // Centroid Update (3 tests)
  // =========================================================

  describe('updateCentroid', () => {
    it('should recompute mean embedding from all member embeddings', async () => {
      const memberRows = [
        { embedding: [0.2, 0.4], importance: 0.8 },
        { embedding: [0.4, 0.8], importance: 0.6 },
      ];

      mockQueryContext
        .mockResolvedValueOnce({ rows: memberRows }) // fetch embeddings
        .mockResolvedValueOnce({ rows: [] }); // update centroid

      await clusterer.updateCentroid('cluster-1', 'operations');

      const updateCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' &&
          (call[1] as string).toLowerCase().includes('centroid_embedding'),
      );
      expect(updateCall).toBeDefined();
    });

    it('should update avg_importance when recomputing centroid', async () => {
      const memberRows = [
        { embedding: makeEmbedding(0.1), importance: 0.8 },
        { embedding: makeEmbedding(0.2), importance: 0.4 },
      ];

      mockQueryContext
        .mockResolvedValueOnce({ rows: memberRows })
        .mockResolvedValueOnce({ rows: [] });

      await clusterer.updateCentroid('cluster-1', 'operations');

      const updateCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' &&
          (call[1] as string).toLowerCase().includes('avg_importance'),
      );
      expect(updateCall).toBeDefined();
      // avg_importance should be 0.6 = (0.8 + 0.4) / 2
      const params = updateCall![2] as unknown[];
      expect(params.some((p) => typeof p === 'number' && Math.abs((p as number) - 0.6) < 0.01)).toBe(true);
    });

    it('should update last_accessed timestamp', async () => {
      const memberRows = [{ embedding: makeEmbedding(0.1), importance: 0.7 }];

      mockQueryContext
        .mockResolvedValueOnce({ rows: memberRows })
        .mockResolvedValueOnce({ rows: [] });

      await clusterer.updateCentroid('cluster-1', 'operations');

      const updateCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' &&
          (call[1] as string).toLowerCase().includes('last_accessed'),
      );
      expect(updateCall).toBeDefined();
    });
  });

  // =========================================================
  // Edge Cases (5 tests)
  // =========================================================

  describe('edge cases', () => {
    it('should return { clusterId: null, isNew: false } when disabled (ablation)', async () => {
      clusterer.setEnabled(false);

      const result = await clusterer.assignToCluster(makeEmbedding(), 'operations', 'user-1');

      expect(result.clusterId).toBeNull();
      expect(result.isNew).toBe(false);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should handle empty embedding array gracefully (no crash)', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'new-cluster-empty' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await clusterer.assignToCluster([], 'operations', 'user-1');

      expect(result).toHaveProperty('clusterId');
      expect(result).toHaveProperty('isNew');
    });

    it('should return paginated members from getClusterMembers', async () => {
      const memberRows = [
        { memory_id: 'mem-1', similarity_to_centroid: 0.9, added_at: new Date('2026-01-01') },
        { memory_id: 'mem-2', similarity_to_centroid: 0.75, added_at: new Date('2026-01-02') },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: memberRows });

      const members = await clusterer.getClusterMembers('cluster-1', 'operations', 20);

      expect(members).toHaveLength(2);
      expect(members[0].memoryId).toBe('mem-1');
      expect(members[0].similarity).toBe(0.9);
      expect(members[0].addedAt).toBeInstanceOf(Date);
    });

    it('should isolate clusters by context (no cross-context leakage)', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'cluster-work' }] })
        .mockResolvedValueOnce({ rows: [] });

      await clusterer.assignToCluster(makeEmbedding(), 'finance', 'user-1');

      for (const call of mockQueryContext.mock.calls) {
        expect(call[0]).toBe('finance');
      }
    });

    it('should assign label from cluster row when available', async () => {
      const mockClusters = [
        { id: 'c-1', member_count: 5, avg_importance: 0.7, label: 'science-memories', similarity: 0.88 },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: mockClusters });

      const result = await clusterer.getTopClusters(makeEmbedding(), 'operations', 'user-1', 1);

      expect(result[0].label).toBe('science-memories');
    });
  });

  // =========================================================
  // Exported Constants
  // =========================================================

  describe('exported constants', () => {
    it('should export SIMILARITY_THRESHOLD as 0.6', () => {
      expect(SIMILARITY_THRESHOLD).toBe(0.6);
    });

    it('should export MAX_CLUSTER_SIZE as 50', () => {
      expect(MAX_CLUSTER_SIZE).toBe(50);
    });
  });
});
