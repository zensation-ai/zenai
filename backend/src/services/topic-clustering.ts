/**
 * Topic Clustering Service
 *
 * Automatically groups related ideas into topics using K-Means clustering
 * on the 768-dimensional embeddings stored in PostgreSQL.
 */

import { queryContext, AIContext, getPool } from '../utils/database-context';
import { queryOllamaJSON } from '../utils/ollama';
import { logger } from '../utils/logger';

// Topic colors for visualization (matching Zensation theme)
const TOPIC_COLORS = [
  '#60a5fa', // Blue
  '#34d399', // Green
  '#f472b6', // Pink
  '#fbbf24', // Yellow
  '#a78bfa', // Purple
  '#06b6d4', // Cyan
  '#f87171', // Red
  '#fb923c', // Orange
  '#4ade80', // Lime
  '#818cf8', // Indigo
];

// Topic icons
const TOPIC_ICONS = ['💡', '🎯', '💼', '🔧', '📊', '🚀', '💭', '📝', '🧠', '⚡'];

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  ideaCount: number;
  ideaIds: string[];
  confidenceScore: number;
}

export interface TopicGenerationResult {
  success: boolean;
  topicsCreated: number;
  topicsUpdated: number;
  ideasAssigned: number;
  processingTime: number;
}

interface IdeaEmbedding {
  id: string;
  title: string;
  summary: string;
  embedding: number[];
}

/**
 * Generate topics for a context using K-Means clustering
 */
export async function generateTopics(
  context: AIContext,
  options: { minClusterSize?: number; maxClusters?: number } = {}
): Promise<TopicGenerationResult> {
  const startTime = Date.now();
  const { minClusterSize = 2, maxClusters = 10 } = options;

  logger.info('Topic clustering started', { context });

  // 1. Get all ideas with embeddings
  const ideasResult = await queryContext(context, `
    SELECT id, title, summary, embedding
    FROM ideas
    WHERE embedding IS NOT NULL
      AND is_archived = FALSE
    ORDER BY created_at DESC
    LIMIT 500
  `);

  const ideas: IdeaEmbedding[] = ideasResult.rows
    .filter((row: any) => row.embedding)
    .map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      embedding: parseEmbedding(row.embedding),
    }));

  logger.debug('Found ideas with embeddings', { count: ideas.length });

  if (ideas.length < minClusterSize * 2) {
    logger.debug('Not enough ideas for clustering', { count: ideas.length, minRequired: minClusterSize * 2 });
    return {
      success: false,
      topicsCreated: 0,
      topicsUpdated: 0,
      ideasAssigned: 0,
      processingTime: Date.now() - startTime,
    };
  }

  // 2. Determine optimal number of clusters
  const k = Math.min(maxClusters, Math.max(2, Math.floor(ideas.length / 3)));
  logger.debug('Determined optimal cluster count', { k, ideaCount: ideas.length });

  // 3. Run K-Means clustering
  const clusters = kMeansClustering(ideas, k, 20);

  // 4. Filter out small clusters
  const validClusters = clusters.filter(c => c.ideaIds.length >= minClusterSize);
  logger.debug('Valid clusters found', { validCount: validClusters.length, minClusterSize });

  // 5-6. Database operations in transaction
  const pool = getPool(context);
  const client = await pool.connect();

  let topicsCreated = 0;
  let ideasAssigned = 0;

  try {
    // Start transaction
    await client.query('BEGIN');

    // Clear existing auto-generated topics
    await client.query(`
      DELETE FROM idea_topic_memberships
      WHERE topic_id IN (
        SELECT id FROM idea_topics WHERE context = $1 AND is_auto_generated = TRUE
      )
    `, [context]);

    await client.query(`
      DELETE FROM idea_topics WHERE context = $1 AND is_auto_generated = TRUE
    `, [context]);

    // Create new topics with LLM-generated names
    for (let i = 0; i < validClusters.length; i++) {
      const cluster = validClusters[i];
      const clusterIdeas = ideas.filter(idea => cluster.ideaIds.includes(idea.id));

      // Generate topic name and description using LLM
      const topicInfo = await labelCluster(clusterIdeas);

      // Calculate centroid embedding
      const centroid = cluster.centroid;
      const centroidStr = `[${centroid.join(',')}]`;

      // Create topic
      const topicResult = await client.query(`
        INSERT INTO idea_topics (context, name, description, color, icon, centroid_embedding, is_auto_generated, confidence_score)
        VALUES ($1, $2, $3, $4, $5, $6::vector, TRUE, $7)
        RETURNING id
      `, [
        context,
        topicInfo.name,
        topicInfo.description,
        TOPIC_COLORS[i % TOPIC_COLORS.length],
        TOPIC_ICONS[i % TOPIC_ICONS.length],
        centroidStr,
        cluster.coherence,
      ]);

      const topicId = topicResult.rows[0].id;
      topicsCreated++;

      // Assign ideas to topic
      for (const ideaId of cluster.ideaIds) {
        const membershipScore = calculateMembershipScore(
          ideas.find(i => i.id === ideaId)!.embedding,
          centroid
        );

        await client.query(`
          INSERT INTO idea_topic_memberships (idea_id, topic_id, membership_score, is_primary)
          VALUES ($1, $2, $3, TRUE)
          ON CONFLICT (idea_id, topic_id) DO UPDATE SET membership_score = $3
        `, [ideaId, topicId, membershipScore]);

        // Update primary_topic_id on idea
        await client.query(`
          UPDATE ideas SET primary_topic_id = $1 WHERE id = $2
        `, [topicId, ideaId]);

        ideasAssigned++;
      }
    }

    // Commit transaction
    await client.query('COMMIT');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const processingTime = Date.now() - startTime;
  logger.info('Topic clustering complete', { topicsCreated, ideasAssigned, processingTime });

  return {
    success: true,
    topicsCreated,
    topicsUpdated: 0,
    ideasAssigned,
    processingTime,
  };
}

/**
 * K-Means clustering implementation
 */
interface Cluster {
  centroid: number[];
  ideaIds: string[];
  coherence: number;
}

function kMeansClustering(ideas: IdeaEmbedding[], k: number, maxIterations: number): Cluster[] {
  if (ideas.length === 0 || k <= 0) {return [];}

  const dim = ideas[0].embedding.length;

  // Initialize centroids using K-Means++ initialization
  const centroids = initializeCentroids(ideas, k);

  let clusters: Map<number, string[]> = new Map();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Assign ideas to nearest centroid
    clusters = new Map();
    for (let i = 0; i < k; i++) {
      clusters.set(i, []);
    }

    for (const idea of ideas) {
      let minDist = Infinity;
      let nearestCluster = 0;

      for (let i = 0; i < k; i++) {
        const dist = euclideanDistance(idea.embedding, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = i;
        }
      }

      clusters.get(nearestCluster)!.push(idea.id);
    }

    // Update centroids
    let converged = true;
    for (let i = 0; i < k; i++) {
      const clusterIdeas = clusters.get(i)!;
      if (clusterIdeas.length === 0) {continue;}

      const newCentroid = new Array(dim).fill(0);
      for (const ideaId of clusterIdeas) {
        const embedding = ideas.find(idea => idea.id === ideaId)!.embedding;
        for (let d = 0; d < dim; d++) {
          newCentroid[d] += embedding[d];
        }
      }

      for (let d = 0; d < dim; d++) {
        newCentroid[d] /= clusterIdeas.length;
        if (Math.abs(newCentroid[d] - centroids[i][d]) > 0.0001) {
          converged = false;
        }
        centroids[i][d] = newCentroid[d];
      }
    }

    if (converged) {
      logger.debug('K-Means converged', { iteration: iteration + 1 });
      break;
    }
  }

  // Calculate cluster coherence (average similarity to centroid)
  const result: Cluster[] = [];
  for (let i = 0; i < k; i++) {
    const clusterIdeas = clusters.get(i)!;
    if (clusterIdeas.length === 0) {continue;}

    let coherence = 0;
    for (const ideaId of clusterIdeas) {
      const embedding = ideas.find(idea => idea.id === ideaId)!.embedding;
      coherence += cosineSimilarity(embedding, centroids[i]);
    }
    coherence /= clusterIdeas.length;

    result.push({
      centroid: centroids[i],
      ideaIds: clusterIdeas,
      coherence,
    });
  }

  return result;
}

/**
 * K-Means++ initialization for better initial centroids
 */
function initializeCentroids(ideas: IdeaEmbedding[], k: number): number[][] {
  const centroids: number[][] = [];
  const _dim = ideas[0].embedding.length;

  // First centroid is random
  const firstIdx = Math.floor(Math.random() * ideas.length);
  centroids.push([...ideas[firstIdx].embedding]);

  // Subsequent centroids chosen with probability proportional to distance squared
  for (let i = 1; i < k; i++) {
    const distances: number[] = [];
    let totalDist = 0;

    for (const idea of ideas) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = euclideanDistance(idea.embedding, centroid);
        minDist = Math.min(minDist, dist);
      }
      distances.push(minDist * minDist);
      totalDist += minDist * minDist;
    }

    // Weighted random selection
    let r = Math.random() * totalDist;
    let selectedIdx = 0;
    for (let j = 0; j < distances.length; j++) {
      r -= distances[j];
      if (r <= 0) {
        selectedIdx = j;
        break;
      }
    }

    centroids.push([...ideas[selectedIdx].embedding]);
  }

  return centroids;
}

/**
 * Use LLM to generate a name and description for a cluster
 * Uses OpenAI in production, Ollama in local development
 */
async function labelCluster(ideas: IdeaEmbedding[]): Promise<{ name: string; description: string }> {
  const ideaSummaries = ideas
    .slice(0, 5) // Limit to 5 ideas for context
    .map(i => `- ${i.title}: ${i.summary || 'Keine Zusammenfassung'}`)
    .join('\n');

  const prompt = `Analysiere diese Gruppe von zusammengehörigen Ideen und finde einen passenden Themennamen.

IDEEN:
${ideaSummaries}

Antworte NUR mit validem JSON in diesem Format:
{"name": "Kurzer Themenname (2-4 Wörter)", "description": "Ein Satz Beschreibung des Themas"}`;

  try {
    const result = await queryOllamaJSON<{ name: string; description: string }>(prompt);
    if (result && result.name) {
      return {
        name: result.name,
        description: result.description || '',
      };
    }
  } catch (error) {
    logger.error('LLM labeling failed', error instanceof Error ? error : undefined);
  }

  // Fallback: use first idea's title
  return {
    name: ideas[0]?.title?.substring(0, 30) || 'Thema',
    description: '',
  };
}

/**
 * Assign a single idea to the best matching topic
 */
export async function assignIdeaToTopic(
  context: AIContext,
  ideaId: string
): Promise<{ topicId: string | null; score: number }> {
  // Get idea embedding
  const ideaResult = await queryContext(context, `
    SELECT embedding FROM ideas WHERE id = $1
  `, [ideaId]);

  if (ideaResult.rows.length === 0 || !ideaResult.rows[0].embedding) {
    return { topicId: null, score: 0 };
  }

  const ideaEmbedding = parseEmbedding(ideaResult.rows[0].embedding);

  // Find best matching topic by centroid similarity
  const topicsResult = await queryContext(context, `
    SELECT id, centroid_embedding
    FROM idea_topics
    WHERE context = $1 AND centroid_embedding IS NOT NULL
  `, [context]);

  let bestTopicId: string | null = null;
  let bestScore = 0;

  for (const topic of topicsResult.rows) {
    const centroid = parseEmbedding(topic.centroid_embedding);
    const similarity = cosineSimilarity(ideaEmbedding, centroid);

    if (similarity > bestScore) {
      bestScore = similarity;
      bestTopicId = topic.id;
    }
  }

  // Only assign if similarity is high enough
  if (bestTopicId && bestScore > 0.7) {
    await queryContext(context, `
      INSERT INTO idea_topic_memberships (idea_id, topic_id, membership_score, is_primary)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (idea_id, topic_id) DO UPDATE SET membership_score = $3
    `, [ideaId, bestTopicId, bestScore]);

    await queryContext(context, `
      UPDATE ideas SET primary_topic_id = $1 WHERE id = $2
    `, [bestTopicId, ideaId]);

    // Update topic idea_count trigger handles this automatically
  }

  return { topicId: bestTopicId, score: bestScore };
}

/**
 * Get all topics for a context
 */
export async function getTopics(context: AIContext): Promise<Topic[]> {
  const result = await queryContext(context, `
    SELECT
      t.id,
      t.name,
      t.description,
      t.color,
      t.icon,
      t.idea_count,
      t.confidence_score,
      COALESCE(
        (SELECT json_agg(m.idea_id)
         FROM idea_topic_memberships m
         WHERE m.topic_id = t.id),
        '[]'
      ) as idea_ids
    FROM idea_topics t
    WHERE t.context = $1
    ORDER BY t.idea_count DESC
  `, [context]);

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    ideaCount: row.idea_count,
    ideaIds: row.idea_ids || [],
    confidenceScore: row.confidence_score || 0,
  }));
}

/**
 * Get a single topic with its ideas
 */
export async function getTopicWithIdeas(
  context: AIContext,
  topicId: string
): Promise<{ topic: Topic; ideas: any[] } | null> {
  const topicResult = await queryContext(context, `
    SELECT id, name, description, color, icon, idea_count, confidence_score
    FROM idea_topics
    WHERE id = $1 AND context = $2
  `, [topicId, context]);

  if (topicResult.rows.length === 0) {
    return null;
  }

  const ideasResult = await queryContext(context, `
    SELECT i.id, i.title, i.type, i.category, i.priority, i.summary, m.membership_score
    FROM ideas i
    JOIN idea_topic_memberships m ON i.id = m.idea_id
    WHERE m.topic_id = $1
    ORDER BY m.membership_score DESC
  `, [topicId]);

  const topic = topicResult.rows[0];
  return {
    topic: {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      color: topic.color,
      icon: topic.icon,
      ideaCount: topic.idea_count,
      ideaIds: ideasResult.rows.map(r => r.id),
      confidenceScore: topic.confidence_score || 0,
    },
    ideas: ideasResult.rows,
  };
}

/**
 * Merge multiple topics into one
 */
export async function mergeTopics(
  context: AIContext,
  topicIds: string[],
  newName: string
): Promise<Topic | null> {
  if (topicIds.length < 2) {return null;}

  const pool = getPool(context);
  const client = await pool.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // Get all ideas from all topics
    const ideasResult = await client.query(`
      SELECT DISTINCT idea_id
      FROM idea_topic_memberships
      WHERE topic_id = ANY($1)
    `, [topicIds]);

    const ideaIds = ideasResult.rows.map(r => r.idea_id);

    // Calculate new centroid (average of all idea embeddings)
    const embeddingsResult = await client.query(`
      SELECT embedding
      FROM ideas
      WHERE id = ANY($1) AND embedding IS NOT NULL
    `, [ideaIds]);

    const dim = 768;
    const newCentroid = new Array(dim).fill(0);
    let count = 0;

    for (const row of embeddingsResult.rows) {
      const embedding = parseEmbedding(row.embedding);
      for (let d = 0; d < dim; d++) {
        newCentroid[d] += embedding[d];
      }
      count++;
    }

    if (count > 0) {
      for (let d = 0; d < dim; d++) {
        newCentroid[d] /= count;
      }
    }

    // Delete old topics and memberships
    await client.query(`
      DELETE FROM idea_topic_memberships WHERE topic_id = ANY($1)
    `, [topicIds]);

    await client.query(`
      DELETE FROM idea_topics WHERE id = ANY($1)
    `, [topicIds]);

    // Create new merged topic
    const centroidStr = `[${newCentroid.join(',')}]`;
    const newTopicResult = await client.query(`
      INSERT INTO idea_topics (context, name, color, icon, centroid_embedding, is_auto_generated)
      VALUES ($1, $2, $3, $4, $5::vector, FALSE)
      RETURNING id
    `, [context, newName, TOPIC_COLORS[0], '🔗', centroidStr]);

    const newTopicId = newTopicResult.rows[0].id;

    // Reassign all ideas
    for (const ideaId of ideaIds) {
      await client.query(`
        INSERT INTO idea_topic_memberships (idea_id, topic_id, membership_score, is_primary)
        VALUES ($1, $2, 1.0, TRUE)
      `, [ideaId, newTopicId]);

      await client.query(`
        UPDATE ideas SET primary_topic_id = $1 WHERE id = $2
      `, [newTopicId, ideaId]);
    }

    // Commit transaction
    await client.query('COMMIT');

    return getTopicWithIdeas(context, newTopicId).then(r => r?.topic || null);
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// Utility Functions
// ============================================

function parseEmbedding(embedding: any): number[] {
  if (Array.isArray(embedding)) {return embedding;}
  if (typeof embedding === 'string') {
    // Handle PostgreSQL vector format: [0.1,0.2,...]
    const cleaned = embedding.replace(/[\[\]]/g, '');
    return cleaned.split(',').map(Number);
  }
  return [];
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

function calculateMembershipScore(embedding: number[], centroid: number[]): number {
  const similarity = cosineSimilarity(embedding, centroid);
  // Normalize to 0-1 range (similarity is already -1 to 1, but usually positive for related content)
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}
