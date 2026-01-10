/**
 * Thought Incubator Service
 *
 * Handles loose thoughts that don't immediately become structured ideas.
 * Instead, they "incubate" - the system finds patterns, clusters related
 * thoughts, and surfaces emerging themes when they're ready.
 */

import { getPool, AIContext } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { v4 as uuidv4 } from 'uuid';
import { learnFromThought } from './learning-engine';
import { logger } from '../utils/logger';

// Types
export interface LooseThought {
  id: string;
  user_id: string;
  raw_input: string;
  source: 'text' | 'voice' | 'quick_jot';
  user_tags: string[];
  embedding?: number[];
  cluster_id?: string;
  similarity_to_cluster?: number;
  is_processed: boolean;
  created_at: Date;
}

export interface ThoughtCluster {
  id: string;
  user_id: string;
  title?: string;
  summary?: string;
  suggested_type?: string;
  suggested_category?: string;
  thought_count: number;
  confidence_score: number;
  maturity_score: number;
  status: 'growing' | 'ready' | 'presented' | 'consolidated' | 'dismissed';
  thoughts?: LooseThought[];
  created_at: Date;
  updated_at: Date;
}

// Configuration
const CONFIG = {
  // Minimum similarity to join an existing cluster
  CLUSTER_SIMILARITY_THRESHOLD: 0.65,
  // Minimum thoughts to consider a cluster "ready"
  MIN_THOUGHTS_FOR_READY: 3,
  // Maturity score threshold to mark as ready
  MATURITY_THRESHOLD: 0.7,
  // Time weight factor (older thoughts contribute more to maturity)
  TIME_WEIGHT_FACTOR: 0.1,
  // Maximum thoughts to analyze in one batch
  BATCH_SIZE: 50,
};

/**
 * Add a new loose thought to the incubator
 * Minimal processing - just store and generate embedding
 */
export async function addLooseThought(
  rawInput: string,
  source: 'text' | 'voice' | 'quick_jot' = 'text',
  userTags: string[] = [],
  userId: string = 'default',
  context: AIContext = 'personal'
): Promise<LooseThought> {
  const pool = getPool(context);
  const client = await pool.connect();
  const id = uuidv4();

  try {
    // Generate embedding (fast, ~100-150ms)
    const embedding = await generateEmbedding(rawInput);

    // Store the thought
    const result = await client.query(
      `INSERT INTO loose_thoughts
       (id, user_id, raw_input, source, user_tags, embedding, is_processed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
       RETURNING *`,
      [id, userId, rawInput, source, JSON.stringify(userTags), embedding.length > 0 ? JSON.stringify(embedding) : null]
    );

    const thought = result.rows[0];

    // Trigger async cluster analysis (non-blocking)
    setImmediate(() => analyzeAndAssignCluster(id, context).catch(err =>
      logger.error('Cluster analysis failed', err instanceof Error ? err : undefined)
    ));

    return {
      id: thought.id,
      user_id: thought.user_id,
      raw_input: thought.raw_input,
      source: thought.source,
      user_tags: thought.user_tags || [],
      is_processed: thought.is_processed,
      created_at: thought.created_at,
    };
  } finally {
    client.release();
  }
}

/**
 * Analyze a single thought and assign to existing or new cluster
 */
async function analyzeAndAssignCluster(thoughtId: string, context: AIContext = 'personal'): Promise<void> {
  const pool = getPool(context);
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Get the thought with embedding
    const thoughtResult = await client.query(
      `SELECT id, user_id, raw_input, embedding
       FROM loose_thoughts
       WHERE id = $1 AND embedding IS NOT NULL`,
      [thoughtId]
    );

    if (thoughtResult.rows.length === 0) return;
    const thought = thoughtResult.rows[0];

    // Find similar clusters
    const similarClusters = await client.query(
      `SELECT id, title, thought_count, maturity_score,
              1 - (centroid_embedding <=> $1::vector) as similarity
       FROM thought_clusters
       WHERE user_id = $2
         AND status IN ('growing', 'ready')
         AND centroid_embedding IS NOT NULL
         AND 1 - (centroid_embedding <=> $1::vector) > $3
       ORDER BY similarity DESC
       LIMIT 3`,
      [thought.embedding, thought.user_id, CONFIG.CLUSTER_SIMILARITY_THRESHOLD]
    );

    let clusterId: string;
    let similarity: number;

    if (similarClusters.rows.length > 0) {
      // Join existing cluster
      const bestCluster = similarClusters.rows[0];
      clusterId = bestCluster.id;
      similarity = bestCluster.similarity;

      // Update cluster centroid (running average)
      await updateClusterCentroid(client, clusterId, thought.embedding);
    } else {
      // Create new cluster
      clusterId = uuidv4();
      similarity = 1.0;

      await client.query(
        `INSERT INTO thought_clusters
         (id, user_id, centroid_embedding, thought_count, status, created_at)
         VALUES ($1, $2, $3, 0, 'growing', NOW())`,
        [clusterId, thought.user_id, thought.embedding]
      );
    }

    // Assign thought to cluster
    await client.query(
      `UPDATE loose_thoughts
       SET cluster_id = $1, similarity_to_cluster = $2, is_processed = true
       WHERE id = $3`,
      [clusterId, similarity, thoughtId]
    );

    // Update cluster metadata and check maturity
    await updateClusterMetadata(client, clusterId);

    // Log analysis
    const duration = Date.now() - startTime;
    await client.query(
      `INSERT INTO cluster_analysis_log
       (run_type, thoughts_analyzed, clusters_created, clusters_updated, duration_ms)
       VALUES ('on_input', 1, $1, $2, $3)`,
      [similarClusters.rows.length === 0 ? 1 : 0, 1, duration]
    );

  } finally {
    client.release();
  }
}

/**
 * Update cluster centroid using running average
 */
async function updateClusterCentroid(
  client: any,
  clusterId: string,
  newEmbedding: string
): Promise<void> {
  // Get current centroid and count
  const clusterResult = await client.query(
    `SELECT centroid_embedding, thought_count FROM thought_clusters WHERE id = $1`,
    [clusterId]
  );

  if (clusterResult.rows.length === 0) return;

  const cluster = clusterResult.rows[0];
  const count = cluster.thought_count;
  const currentCentroid = cluster.centroid_embedding;

  // Calculate new centroid as weighted average
  // new_centroid = (old_centroid * count + new_embedding) / (count + 1)
  await client.query(
    `UPDATE thought_clusters
     SET centroid_embedding = (
       SELECT array_agg(
         (COALESCE(c.val, 0) * $2 + COALESCE(n.val, 0)) / ($2 + 1)
       )::vector
       FROM unnest($3::vector::float[]) WITH ORDINALITY AS c(val, idx)
       FULL OUTER JOIN unnest($4::vector::float[]) WITH ORDINALITY AS n(val, idx)
       ON c.idx = n.idx
     )
     WHERE id = $1`,
    [clusterId, count, currentCentroid, newEmbedding]
  );
}

/**
 * Update cluster metadata (count, maturity, status)
 */
async function updateClusterMetadata(client: any, clusterId: string): Promise<void> {
  // Count thoughts and calculate maturity
  const statsResult = await client.query(
    `SELECT
       COUNT(*) as thought_count,
       MIN(created_at) as oldest_thought,
       MAX(created_at) as newest_thought,
       AVG(similarity_to_cluster) as avg_similarity
     FROM loose_thoughts
     WHERE cluster_id = $1`,
    [clusterId]
  );

  const stats = statsResult.rows[0];
  const thoughtCount = parseInt(stats.thought_count);

  // Calculate maturity score
  // Factors: thought count, time span, similarity coherence
  const timeSpanDays = stats.oldest_thought && stats.newest_thought
    ? (new Date(stats.newest_thought).getTime() - new Date(stats.oldest_thought).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const countScore = Math.min(thoughtCount / CONFIG.MIN_THOUGHTS_FOR_READY, 1);
  const timeScore = Math.min(timeSpanDays * CONFIG.TIME_WEIGHT_FACTOR, 0.3);
  const coherenceScore = stats.avg_similarity ? parseFloat(stats.avg_similarity) * 0.3 : 0;

  const maturityScore = Math.min(countScore * 0.5 + timeScore + coherenceScore, 1);

  // Determine status
  const shouldBeReady = thoughtCount >= CONFIG.MIN_THOUGHTS_FOR_READY
    && maturityScore >= CONFIG.MATURITY_THRESHOLD;

  await client.query(
    `UPDATE thought_clusters
     SET thought_count = $2,
         maturity_score = $3,
         status = CASE
           WHEN status = 'growing' AND $4 THEN 'ready'
           ELSE status
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [clusterId, thoughtCount, maturityScore, shouldBeReady]
  );
}

/**
 * Get all loose thoughts for a user
 */
export async function getLooseThoughts(
  userId: string = 'default',
  limit: number = 50,
  includeProcessed: boolean = true,
  context: AIContext = 'personal'
): Promise<LooseThought[]> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, user_id, raw_input, source, user_tags, cluster_id,
              similarity_to_cluster, is_processed, created_at
       FROM loose_thoughts
       WHERE user_id = $1 ${!includeProcessed ? 'AND is_processed = false' : ''}
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get clusters ready for presentation
 */
export async function getReadyClusters(userId: string = 'default', context: AIContext = 'personal'): Promise<ThoughtCluster[]> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT c.*,
              json_agg(json_build_object(
                'id', t.id,
                'raw_input', t.raw_input,
                'source', t.source,
                'created_at', t.created_at,
                'similarity_to_cluster', t.similarity_to_cluster
              ) ORDER BY t.created_at) as thoughts
       FROM thought_clusters c
       LEFT JOIN loose_thoughts t ON t.cluster_id = c.id
       WHERE c.user_id = $1 AND c.status = 'ready'
       GROUP BY c.id
       ORDER BY c.maturity_score DESC, c.thought_count DESC`,
      [userId]
    );

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get all clusters with their thoughts
 */
export async function getAllClusters(
  userId: string = 'default',
  includeThoughts: boolean = true,
  context: AIContext = 'personal'
): Promise<ThoughtCluster[]> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    if (includeThoughts) {
      const result = await client.query(
        `SELECT c.*,
                COALESCE(json_agg(
                  CASE WHEN t.id IS NOT NULL THEN
                    json_build_object(
                      'id', t.id,
                      'raw_input', t.raw_input,
                      'source', t.source,
                      'created_at', t.created_at,
                      'similarity_to_cluster', t.similarity_to_cluster
                    )
                  END
                ) FILTER (WHERE t.id IS NOT NULL), '[]') as thoughts
         FROM thought_clusters c
         LEFT JOIN loose_thoughts t ON t.cluster_id = c.id
         WHERE c.user_id = $1 AND c.status NOT IN ('consolidated', 'dismissed')
         GROUP BY c.id
         ORDER BY c.status = 'ready' DESC, c.maturity_score DESC, c.updated_at DESC`,
        [userId]
      );
      return result.rows;
    } else {
      const result = await client.query(
        `SELECT * FROM thought_clusters
         WHERE user_id = $1 AND status NOT IN ('consolidated', 'dismissed')
         ORDER BY status = 'ready' DESC, maturity_score DESC, updated_at DESC`,
        [userId]
      );
      return result.rows;
    }
  } finally {
    client.release();
  }
}

/**
 * Generate summary for a cluster using LLM
 */
export async function generateClusterSummary(clusterId: string, context: AIContext = 'personal'): Promise<{
  title: string;
  summary: string;
  suggested_type: string;
  suggested_category: string;
}> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    // Get all thoughts in cluster
    const thoughtsResult = await client.query(
      `SELECT raw_input, created_at FROM loose_thoughts
       WHERE cluster_id = $1
       ORDER BY created_at`,
      [clusterId]
    );

    if (thoughtsResult.rows.length === 0) {
      throw new Error('Cluster has no thoughts');
    }

    const thoughts = thoughtsResult.rows.map((t: { raw_input: string }) => t.raw_input).join('\n---\n');

    // Use Mistral via axios (matching existing ollama.ts pattern)
    const axios = (await import('axios')).default;
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

    const prompt = `Analysiere diese zusammenhängenden Gedankenfragmente und fasse sie zusammen:

${thoughts}

Antworte NUR mit einem JSON-Objekt (keine Erklärung):
{
  "title": "Kurzer, prägnanter Titel (max 50 Zeichen)",
  "summary": "Zusammenfassung was sich hier als Thema/Idee/Konzept herauskristallisiert (2-3 Sätze)",
  "suggested_type": "idea|task|insight|problem|question",
  "suggested_category": "business|technical|personal|learning"
}`;

    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: 'mistral',
      prompt,
      stream: false,
      options: { temperature: 0.3 },
    }, { timeout: 60000 });

    const content = response.data.response;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Invalid LLM response');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Update cluster with summary
    await client.query(
      `UPDATE thought_clusters
       SET title = $2, summary = $3, suggested_type = $4, suggested_category = $5, updated_at = NOW()
       WHERE id = $1`,
      [clusterId, result.title, result.summary, result.suggested_type, result.suggested_category]
    );

    return result;
  } finally {
    client.release();
  }
}

/**
 * Consolidate a cluster into a proper idea
 */
export async function consolidateCluster(
  clusterId: string,
  overrides?: {
    title?: string;
    type?: string;
    category?: string;
    priority?: string;
  },
  context: AIContext = 'personal'
): Promise<string> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // Get cluster with summary
    const clusterResult = await client.query(
      `SELECT * FROM thought_clusters WHERE id = $1`,
      [clusterId]
    );

    if (clusterResult.rows.length === 0) {
      throw new Error('Cluster not found');
    }

    const cluster = clusterResult.rows[0];

    // Ensure we have a summary
    if (!cluster.title || !cluster.summary) {
      await generateClusterSummary(clusterId, context);
      const updated = await client.query(
        `SELECT * FROM thought_clusters WHERE id = $1`,
        [clusterId]
      );
      Object.assign(cluster, updated.rows[0]);
    }

    // Get all thoughts for the raw transcript
    const thoughtsResult = await client.query(
      `SELECT raw_input, created_at FROM loose_thoughts
       WHERE cluster_id = $1 ORDER BY created_at`,
      [clusterId]
    );

    const rawTranscript = thoughtsResult.rows
      .map((t: { raw_input: string; created_at: Date }) => `[${new Date(t.created_at).toLocaleDateString('de-DE')}] ${t.raw_input}`)
      .join('\n\n');

    // Generate embedding for the idea
    const embedding = await generateEmbedding(cluster.summary + ' ' + cluster.title);

    // Create the idea
    const ideaId = uuidv4();
    await client.query(
      `INSERT INTO ideas
       (id, title, type, category, priority, summary, raw_transcript, embedding,
        next_steps, context_needed, keywords, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]', '[]', '[]', NOW())`,
      [
        ideaId,
        overrides?.title || cluster.title,
        overrides?.type || cluster.suggested_type || 'idea',
        overrides?.category || cluster.suggested_category || 'personal',
        overrides?.priority || 'medium',
        cluster.summary,
        rawTranscript,
        embedding.length > 0 ? JSON.stringify(embedding) : null,
      ]
    );

    // Mark cluster as consolidated
    await client.query(
      `UPDATE thought_clusters
       SET status = 'consolidated', consolidated_idea_id = $2, consolidated_at = NOW()
       WHERE id = $1`,
      [clusterId, ideaId]
    );

    // Commit transaction
    await client.query('COMMIT');

    // Learn from the consolidated idea (async, non-blocking)
    learnFromThought(ideaId).catch(err =>
      logger.debug('Background learning from consolidated idea skipped', { error: err.message })
    );

    return ideaId;
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Dismiss a cluster (user decides it's not useful)
 */
export async function dismissCluster(clusterId: string, context: AIContext = 'personal'): Promise<void> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    await client.query(
      `UPDATE thought_clusters SET status = 'dismissed', updated_at = NOW() WHERE id = $1`,
      [clusterId]
    );
  } finally {
    client.release();
  }
}

/**
 * Mark a cluster as presented to the user
 */
export async function markClusterPresented(clusterId: string, context: AIContext = 'personal'): Promise<void> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    await client.query(
      `UPDATE thought_clusters
       SET status = 'presented', presented_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [clusterId]
    );
  } finally {
    client.release();
  }
}

/**
 * Run batch pattern detection on all unprocessed thoughts
 */
export async function runBatchAnalysis(userId: string = 'default', context: AIContext = 'personal'): Promise<{
  thoughts_analyzed: number;
  clusters_created: number;
  clusters_updated: number;
  clusters_ready: number;
}> {
  const pool = getPool(context);
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Get unprocessed thoughts
    const unprocessed = await client.query(
      `SELECT id FROM loose_thoughts
       WHERE user_id = $1 AND is_processed = false AND embedding IS NOT NULL
       LIMIT $2`,
      [userId, CONFIG.BATCH_SIZE]
    );

    let clustersCreated = 0;
    let clustersUpdated = 0;

    for (const thought of unprocessed.rows) {
      // This will create or update clusters
      const beforeCount = await client.query(
        `SELECT COUNT(*) as count FROM thought_clusters WHERE user_id = $1`,
        [userId]
      );

      await analyzeAndAssignCluster(thought.id, context);

      const afterCount = await client.query(
        `SELECT COUNT(*) as count FROM thought_clusters WHERE user_id = $1`,
        [userId]
      );

      if (parseInt(afterCount.rows[0].count) > parseInt(beforeCount.rows[0].count)) {
        clustersCreated++;
      } else {
        clustersUpdated++;
      }
    }

    // Count ready clusters
    const readyResult = await client.query(
      `SELECT COUNT(*) as count FROM thought_clusters
       WHERE user_id = $1 AND status = 'ready'`,
      [userId]
    );

    const result = {
      thoughts_analyzed: unprocessed.rows.length,
      clusters_created: clustersCreated,
      clusters_updated: clustersUpdated,
      clusters_ready: parseInt(readyResult.rows[0].count),
    };

    // Log the run
    const duration = Date.now() - startTime;
    await client.query(
      `INSERT INTO cluster_analysis_log
       (run_type, thoughts_analyzed, clusters_created, clusters_updated, clusters_ready, duration_ms)
       VALUES ('manual', $1, $2, $3, $4, $5)`,
      [result.thoughts_analyzed, result.clusters_created, result.clusters_updated, result.clusters_ready, duration]
    );

    return result;
  } finally {
    client.release();
  }
}

/**
 * Get incubator statistics
 */
export async function getIncubatorStats(userId: string = 'default', context: AIContext = 'personal'): Promise<{
  total_thoughts: number;
  unprocessed_thoughts: number;
  total_clusters: number;
  ready_clusters: number;
  growing_clusters: number;
  consolidated_clusters: number;
}> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM loose_thoughts WHERE user_id = $1) as total_thoughts,
         (SELECT COUNT(*) FROM loose_thoughts WHERE user_id = $1 AND is_processed = false) as unprocessed_thoughts,
         (SELECT COUNT(*) FROM thought_clusters WHERE user_id = $1) as total_clusters,
         (SELECT COUNT(*) FROM thought_clusters WHERE user_id = $1 AND status = 'ready') as ready_clusters,
         (SELECT COUNT(*) FROM thought_clusters WHERE user_id = $1 AND status = 'growing') as growing_clusters,
         (SELECT COUNT(*) FROM thought_clusters WHERE user_id = $1 AND status = 'consolidated') as consolidated_clusters`,
      [userId]
    );

    const stats = result.rows[0];
    return {
      total_thoughts: parseInt(stats.total_thoughts),
      unprocessed_thoughts: parseInt(stats.unprocessed_thoughts),
      total_clusters: parseInt(stats.total_clusters),
      ready_clusters: parseInt(stats.ready_clusters),
      growing_clusters: parseInt(stats.growing_clusters),
      consolidated_clusters: parseInt(stats.consolidated_clusters),
    };
  } finally {
    client.release();
  }
}