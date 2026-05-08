/**
 * SemanticPreClusterer -- Hippocampal-Inspired Semantic Clustering
 *
 * USC 2025: cluster memories by semantic category before storage to accelerate
 * encoding and retrieval. Inspired by the hippocampus organizing memories into
 * semantic clusters during the encoding phase.
 *
 * Key mechanisms:
 *   - Assign new memories to the nearest semantic cluster (cosine similarity > 0.6)
 *   - Create a new cluster when no suitable cluster exists
 *   - Auto-split clusters that grow beyond MAX_CLUSTER_SIZE (50 members)
 *   - Update cluster centroids by recomputing the mean embedding
 *   - Ablation: fully disableable via setEnabled() for experiments
 *
 * Part of the Predictive Memory Architecture (PMA).
 *
 * Reference: USC Viterbi AI Memory Clustering (2025) — semantic pre-clustering
 *   for episodic memory systems.
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum cosine similarity to assign to an existing cluster */
export const SIMILARITY_THRESHOLD = 0.6;

/** Maximum members per cluster before it splits */
export const MAX_CLUSTER_SIZE = 50;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClusterInfo {
  id: string;
  memberCount: number;
  avgImportance: number;
  similarity: number;
  label: string | null;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class SemanticPreClusterer {
  private enabled = true;

  /**
   * Availability flag — false if the memory_clusters / memory_cluster_members
   * tables are missing. Starts true (optimistic) and only flips false on
   * confirmed 42P01 error.
   */
  private available = true;

  /**
   * Returns true if the error indicates a missing table (PostgreSQL 42P01).
   */
  private static isMissingTable(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      ((err as any).code === '42P01' ||
        (typeof (err as any).message === 'string' &&
          (err as any).message.includes('does not exist')))
    );
  }

  /**
   * Mark the service unavailable and log a warning. Called once on first
   * 42P01 error so all subsequent calls skip the DB entirely.
   */
  private markUnavailable(context: AIContext, operation: string): void {
    if (this.available) {
      this.available = false;
      logger.warn('SemanticPreClusterer: cluster tables missing — running in degraded mode', { context, operation });
    }
  }

  // ── Ablation ────────────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // ── Cluster Assignment ──────────────────────────────────────────────────

  /**
   * Assign an embedding to the nearest existing cluster (if similarity > 0.6),
   * or create a new cluster when no suitable match exists.
   *
   * @returns { clusterId, isNew } where isNew=true means a new cluster was created
   */
  async assignToCluster(
    embedding: number[],
    context: AIContext,
    userId: string,
    importance = 0.5,
  ): Promise<{ clusterId: string | null; isNew: boolean }> {
    if (!this.enabled) return { clusterId: null, isNew: false };
    if (!this.available) return { clusterId: null, isNew: false };

    const embeddingLiteral = `[${embedding.join(',')}]`;

    try {
      // Find nearest existing cluster centroid using pgvector cosine distance
      const nearestResult = await queryContext(
        context,
        `SELECT id, 1 - (centroid_embedding <=> $1::vector) AS similarity
         FROM memory_clusters
         WHERE user_id = $2
         ORDER BY centroid_embedding <=> $1::vector
         LIMIT 1`,
        [embeddingLiteral, userId],
      );

      const nearest = nearestResult.rows[0];

      if (nearest && Number(nearest.similarity) > SIMILARITY_THRESHOLD) {
        // Assign to existing cluster
        const clusterId: string = nearest.id;

        await queryContext(
          context,
          `INSERT INTO memory_cluster_members (cluster_id, memory_id, similarity_to_centroid, added_at)
           VALUES ($1, $2, $3, NOW())`,
          [clusterId, null, Number(nearest.similarity)],
        );

        await queryContext(
          context,
          `UPDATE memory_clusters
           SET member_count = member_count + 1,
               last_accessed = NOW()
           WHERE id = $1`,
          [clusterId],
        );

        logger.debug('SemanticPreClusterer: assigned to existing cluster', { clusterId, context });

        return { clusterId, isNew: false };
      }

      // No suitable cluster — create a new one
      const insertResult = await queryContext(
        context,
        `INSERT INTO memory_clusters
           (user_id, centroid_embedding, member_count, avg_importance, label, created_at, last_accessed)
         VALUES ($1, $2::vector, 1, $3, NULL, NOW(), NOW())
         RETURNING id`,
        [userId, embeddingLiteral, importance],
      );

      const newClusterId: string = insertResult.rows[0].id;

      await queryContext(
        context,
        `INSERT INTO memory_cluster_members (cluster_id, memory_id, similarity_to_centroid, added_at)
         VALUES ($1, $2, $3, NOW())`,
        [newClusterId, null, 1.0],
      );

      logger.debug('SemanticPreClusterer: created new cluster', { newClusterId, context });

      return { clusterId: newClusterId, isNew: true };
    } catch (err) {
      if (SemanticPreClusterer.isMissingTable(err)) {
        this.markUnavailable(context, 'assignToCluster');
        return { clusterId: null, isNew: false };
      }
      throw err;
    }
  }

  // ── Cluster Retrieval ───────────────────────────────────────────────────

  /**
   * Return the top-N clusters most similar to the given query embedding.
   *
   * Results are ordered by cosine similarity (highest first).
   */
  async getTopClusters(
    queryEmbedding: number[],
    context: AIContext,
    userId: string,
    limit = 3,
  ): Promise<ClusterInfo[]> {
    if (!this.available) return [];

    const embeddingLiteral = `[${queryEmbedding.join(',')}]`;

    try {
      const result = await queryContext(
        context,
        `SELECT id,
                member_count,
                avg_importance,
                label,
                1 - (centroid_embedding <=> $1::vector) AS similarity
         FROM memory_clusters
         WHERE user_id = $2
         ORDER BY centroid_embedding <=> $1::vector
         LIMIT $3`,
        [embeddingLiteral, userId, limit],
      );

      return result.rows.map((row) => ({
        id: row.id as string,
        memberCount: Number(row.member_count),
        avgImportance: Number(row.avg_importance),
        similarity: Number(row.similarity),
        label: row.label as string | null,
      }));
    } catch (err) {
      if (SemanticPreClusterer.isMissingTable(err)) {
        this.markUnavailable(context, 'getTopClusters');
        return [];
      }
      throw err;
    }
  }

  // ── Cluster Splitting ───────────────────────────────────────────────────

  /**
   * Split a cluster into two halves (approximate k-means: first half / second half).
   *
   * Steps:
   *   1. Fetch all member embeddings from the original cluster
   *   2. Split members into two halves
   *   3. Create two new clusters with computed centroids
   *   4. Delete the original cluster
   *
   * @returns IDs of the two new clusters
   */
  async splitCluster(
    clusterId: string,
    context: AIContext,
  ): Promise<{ newCluster1: string; newCluster2: string }> {
    // Fetch all members with their embeddings
    const membersResult = await queryContext(
      context,
      `SELECT mcm.memory_id, mcm.embedding
       FROM memory_cluster_members mcm
       WHERE mcm.cluster_id = $1`,
      [clusterId],
    );

    const members = membersResult.rows;

    // Simple split: first half / second half
    const mid = Math.ceil(members.length / 2);
    const half1 = members.slice(0, mid);
    const half2 = members.slice(mid);

    const computeCentroid = (embeddings: number[][]): number[] => {
      if (embeddings.length === 0) return [];
      const dim = embeddings[0].length;
      const sum = new Array<number>(dim).fill(0);
      for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) {
          sum[i] += emb[i];
        }
      }
      return sum.map((v) => v / embeddings.length);
    };

    const parseEmbedding = (raw: unknown): number[] => {
      if (Array.isArray(raw)) return raw as number[];
      if (typeof raw === 'string') {
        return (raw as string)
          .replace(/[[\]]/g, '')
          .split(',')
          .map(Number);
      }
      return [];
    };

    const centroid1 = computeCentroid(half1.map((m) => parseEmbedding(m.embedding)));
    const centroid2 = computeCentroid(half2.map((m) => parseEmbedding(m.embedding)));

    const centroid1Literal = `[${centroid1.join(',')}]`;
    const centroid2Literal = `[${centroid2.join(',')}]`;

    // Create first new cluster
    const cluster1Result = await queryContext(
      context,
      `INSERT INTO memory_clusters
         (centroid_embedding, member_count, avg_importance, created_at, last_accessed)
       VALUES ($1::vector, $2, 0.5, NOW(), NOW())
       RETURNING id`,
      [centroid1Literal, half1.length],
    );
    const newCluster1: string = cluster1Result.rows[0].id;

    // Move members from half1 to new cluster 1
    await queryContext(
      context,
      `UPDATE memory_cluster_members
       SET cluster_id = $1
       WHERE cluster_id = $2 AND memory_id = ANY($3::text[])`,
      [newCluster1, clusterId, half1.map((m) => m.memory_id)],
    );

    // Create second new cluster
    const cluster2Result = await queryContext(
      context,
      `INSERT INTO memory_clusters
         (centroid_embedding, member_count, avg_importance, created_at, last_accessed)
       VALUES ($1::vector, $2, 0.5, NOW(), NOW())
       RETURNING id`,
      [centroid2Literal, half2.length],
    );
    const newCluster2: string = cluster2Result.rows[0].id;

    // Move members from half2 to new cluster 2
    await queryContext(
      context,
      `UPDATE memory_cluster_members
       SET cluster_id = $1
       WHERE cluster_id = $2 AND memory_id = ANY($3::text[])`,
      [newCluster2, clusterId, half2.map((m) => m.memory_id)],
    );

    // Delete the original cluster
    await queryContext(
      context,
      `DELETE FROM memory_clusters WHERE id = $1`,
      [clusterId],
    );

    logger.info('SemanticPreClusterer: cluster split', {
      originalClusterId: clusterId,
      newCluster1,
      newCluster2,
      context,
    });

    return { newCluster1, newCluster2 };
  }

  // ── Centroid Update ─────────────────────────────────────────────────────

  /**
   * Recompute the centroid of a cluster by averaging all member embeddings.
   * Also updates avg_importance and last_accessed.
   */
  async updateCentroid(clusterId: string, context: AIContext): Promise<void> {
    // Fetch all member embeddings and importance values
    const membersResult = await queryContext(
      context,
      `SELECT mcm.embedding, mcm.importance
       FROM memory_cluster_members mcm
       WHERE mcm.cluster_id = $1`,
      [clusterId],
    );

    const members = membersResult.rows;

    if (members.length === 0) {
      logger.warn('SemanticPreClusterer: no members found for centroid update', {
        clusterId,
        context,
      });
      return;
    }

    const parseEmbedding = (raw: unknown): number[] => {
      if (Array.isArray(raw)) return raw as number[];
      if (typeof raw === 'string') {
        return (raw as string)
          .replace(/[[\]]/g, '')
          .split(',')
          .map(Number);
      }
      return [];
    };

    // Compute mean embedding
    const embeddings = members.map((m) => parseEmbedding(m.embedding));
    const dim = embeddings[0]?.length ?? 0;
    const centroid = new Array<number>(dim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += emb[i] / embeddings.length;
      }
    }

    // Compute mean importance
    const avgImportance =
      members.reduce((sum: number, m) => sum + Number(m.importance ?? 0.5), 0) / members.length;

    const centroidLiteral = `[${centroid.join(',')}]`;

    await queryContext(
      context,
      `UPDATE memory_clusters
       SET centroid_embedding = $1::vector,
           avg_importance = $2,
           last_accessed = NOW()
       WHERE id = $3`,
      [centroidLiteral, avgImportance, clusterId],
    );

    logger.debug('SemanticPreClusterer: centroid updated', {
      clusterId,
      avgImportance,
      context,
    });
  }

  // ── Cluster Members ─────────────────────────────────────────────────────

  /**
   * Retrieve members of a cluster with pagination.
   *
   * @returns Array of { memoryId, similarity, addedAt }
   */
  async getClusterMembers(
    clusterId: string,
    context: AIContext,
    limit = 20,
  ): Promise<{ memoryId: string; similarity: number; addedAt: Date }[]> {
    const result = await queryContext(
      context,
      `SELECT memory_id, similarity_to_centroid, added_at
       FROM memory_cluster_members
       WHERE cluster_id = $1
       ORDER BY added_at DESC
       LIMIT $2`,
      [clusterId, limit],
    );

    return result.rows.map((row) => ({
      memoryId: row.memory_id as string,
      similarity: Number(row.similarity_to_centroid),
      addedAt: new Date(row.added_at),
    }));
  }
}
