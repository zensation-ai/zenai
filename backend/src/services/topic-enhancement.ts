/**
 * Topic Enhancement Service
 *
 * Advanced topic analysis and management features including:
 * - Keyword extraction from topic member ideas
 * - Topic quality metrics (coherence, separation, stability)
 * - Smart topic assignment for new ideas
 * - Topic similarity detection for merge suggestions
 * - Topic-aware chat context
 *
 * @module services/topic-enhancement
 */

import { logger } from '../utils/logger';
import { queryContext, AIContext } from '../utils/database-context';
import { generateEmbedding } from './ai';
import { cosineSimilarity } from '../utils/embedding';

// ===========================================
// Types
// ===========================================

export interface TopicKeyword {
  word: string;
  score: number;
  frequency: number;
}

export interface TopicWithKeywords {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  ideaCount: number;
  keywords: TopicKeyword[];
}

export interface TopicQualityMetrics {
  topicId: string;
  topicName: string;
  coherence: number; // 0-1, how similar ideas within topic are
  separation: number; // 0-1, how different from other topics
  density: number; // Average membership score
  stability: number; // How well ideas fit (average distance to centroid)
  overallQuality: number; // Weighted combination
}

export interface TopicSimilarity {
  topic1Id: string;
  topic1Name: string;
  topic2Id: string;
  topic2Name: string;
  similarity: number;
  sharedKeywords: string[];
  suggestMerge: boolean;
}

export interface TopicAssignment {
  ideaId: string;
  topicId: string;
  topicName: string;
  confidence: number;
  alternativeTopics: Array<{ id: string; name: string; confidence: number }>;
}

export interface TopicChatContext {
  relevantTopics: Array<{
    id: string;
    name: string;
    relevance: number;
    ideaCount: number;
    keywords: string[];
  }>;
  suggestedIdeas: Array<{
    id: string;
    title: string;
    topicName: string;
    relevance: number;
  }>;
}

// ===========================================
// Keyword Extraction
// ===========================================

/**
 * Extract keywords from topic member ideas using TF-IDF-like scoring
 */
export async function extractTopicKeywords(
  topicId: string,
  context: AIContext,
  maxKeywords: number = 10
): Promise<TopicKeyword[]> {
  try {
    // Get all ideas in this topic
    const ideasResult = await queryContext(
      context,
      `SELECT i.title, i.summary, i.raw_transcript
       FROM ideas i
       JOIN idea_topic_memberships m ON i.id = m.idea_id
       WHERE m.topic_id = $1
       ORDER BY m.membership_score DESC
       LIMIT 100`,
      [topicId]
    );

    if (ideasResult.rows.length === 0) {
      return [];
    }

    // Combine all text
    const allText = ideasResult.rows
      .map(r => `${r.title || ''} ${r.summary || ''} ${r.raw_transcript || ''}`)
      .join(' ')
      .toLowerCase();

    // Tokenize and count words
    const words = allText
      .replace(/[^\wäöüß\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Get document frequency from all ideas (for IDF calculation)
    const allIdeasResult = await queryContext(
      context,
      `SELECT COUNT(DISTINCT id) as total FROM ideas WHERE context = $1`,
      [context]
    );
    const totalDocs = parseInt(allIdeasResult.rows[0]?.total || '1', 10);

    // Calculate TF-IDF-like scores
    const stopWords = new Set([
      'und', 'oder', 'aber', 'auch', 'eine', 'einen', 'einem', 'einer',
      'der', 'die', 'das', 'den', 'dem', 'des', 'dass', 'wenn', 'dann',
      'sein', 'haben', 'werden', 'kann', 'muss', 'will', 'soll', 'wird',
      'sind', 'ist', 'war', 'waren', 'wurde', 'wurden', 'nach', 'bei',
      'mit', 'von', 'für', 'auf', 'aus', 'über', 'unter', 'durch',
      'nicht', 'noch', 'schon', 'sehr', 'mehr', 'viel', 'alle', 'alles',
      'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
      'has', 'have', 'been', 'will', 'can', 'could', 'should', 'would',
    ]);

    const keywords: TopicKeyword[] = [];

    for (const [word, freq] of wordFreq.entries()) {
      if (stopWords.has(word)) continue;
      if (freq < 2) continue; // At least 2 occurrences

      // Simple TF-IDF: freq * log(totalDocs / docFreq)
      // Simplified: just use frequency weighted by word length
      const score = freq * Math.log(word.length);

      keywords.push({
        word,
        score,
        frequency: freq,
      });
    }

    // Sort by score and return top keywords
    return keywords
      .sort((a, b) => b.score - a.score)
      .slice(0, maxKeywords);
  } catch (error) {
    logger.error('Failed to extract topic keywords', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get all topics with their extracted keywords
 */
export async function getTopicsWithKeywords(
  context: AIContext
): Promise<TopicWithKeywords[]> {
  try {
    const topicsResult = await queryContext(
      context,
      `SELECT t.id, t.name, t.description, t.color, t.icon, t.idea_count
       FROM idea_topics t
       WHERE t.context = $1
       ORDER BY t.idea_count DESC`,
      [context]
    );

    const topicsWithKeywords: TopicWithKeywords[] = [];

    for (const topic of topicsResult.rows) {
      const keywords = await extractTopicKeywords(topic.id, context, 8);

      topicsWithKeywords.push({
        id: topic.id,
        name: topic.name,
        description: topic.description,
        color: topic.color,
        icon: topic.icon,
        ideaCount: parseInt(topic.idea_count, 10),
        keywords,
      });
    }

    return topicsWithKeywords;
  } catch (error) {
    logger.error('Failed to get topics with keywords', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Topic Quality Metrics
// ===========================================

/**
 * Calculate quality metrics for a single topic
 */
export async function calculateTopicQuality(
  topicId: string,
  context: AIContext
): Promise<TopicQualityMetrics | null> {
  try {
    // Get topic info and centroid
    const topicResult = await queryContext(
      context,
      `SELECT id, name, centroid_embedding, idea_count
       FROM idea_topics
       WHERE id = $1`,
      [topicId]
    );

    if (topicResult.rows.length === 0) {
      return null;
    }

    const topic = topicResult.rows[0];
    const centroid = topic.centroid_embedding;

    if (!centroid) {
      return null;
    }

    // Get member idea embeddings and membership scores
    const membersResult = await queryContext(
      context,
      `SELECT i.embedding, m.membership_score
       FROM ideas i
       JOIN idea_topic_memberships m ON i.id = m.idea_id
       WHERE m.topic_id = $1 AND i.embedding IS NOT NULL`,
      [topicId]
    );

    if (membersResult.rows.length === 0) {
      return {
        topicId: topic.id,
        topicName: topic.name,
        coherence: 0,
        separation: 0,
        density: 0,
        stability: 0,
        overallQuality: 0,
      };
    }

    // Parse centroid embedding
    let centroidVec: number[];
    try {
      centroidVec = typeof centroid === 'string' ? JSON.parse(centroid) : centroid;
    } catch {
      centroidVec = centroid;
    }

    // Calculate coherence (average pairwise similarity within topic)
    let coherenceSum = 0;
    let coherenceCount = 0;
    const embeddings: number[][] = [];

    for (const row of membersResult.rows) {
      let embedding: number[];
      try {
        embedding = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      } catch {
        embedding = row.embedding;
      }
      embeddings.push(embedding);
    }

    // Sample pairwise similarities (max 100 pairs for performance)
    const maxPairs = Math.min(100, (embeddings.length * (embeddings.length - 1)) / 2);
    for (let i = 0; i < embeddings.length && coherenceCount < maxPairs; i++) {
      for (let j = i + 1; j < embeddings.length && coherenceCount < maxPairs; j++) {
        coherenceSum += cosineSimilarity(embeddings[i], embeddings[j]);
        coherenceCount++;
      }
    }
    const coherence = coherenceCount > 0 ? coherenceSum / coherenceCount : 0;

    // Calculate stability (average similarity to centroid)
    let stabilitySum = 0;
    for (const embedding of embeddings) {
      stabilitySum += cosineSimilarity(embedding, centroidVec);
    }
    const stability = embeddings.length > 0 ? stabilitySum / embeddings.length : 0;

    // Calculate density (average membership score)
    let densitySum = 0;
    for (const row of membersResult.rows) {
      densitySum += parseFloat(row.membership_score);
    }
    const density = membersResult.rows.length > 0 ? densitySum / membersResult.rows.length : 0;

    // Calculate separation (distance to nearest other topic centroid)
    const otherTopicsResult = await queryContext(
      context,
      `SELECT id, centroid_embedding
       FROM idea_topics
       WHERE context = $1 AND id != $2 AND centroid_embedding IS NOT NULL`,
      [context, topicId]
    );

    let separation = 1.0; // Default: perfect separation if no other topics
    for (const otherTopic of otherTopicsResult.rows) {
      let otherCentroid: number[];
      try {
        otherCentroid = typeof otherTopic.centroid_embedding === 'string'
          ? JSON.parse(otherTopic.centroid_embedding)
          : otherTopic.centroid_embedding;
      } catch {
        otherCentroid = otherTopic.centroid_embedding;
      }

      const sim = cosineSimilarity(centroidVec, otherCentroid);
      // Separation is 1 - similarity (higher is better)
      separation = Math.min(separation, 1 - sim);
    }

    // Calculate overall quality (weighted average)
    const overallQuality = (
      coherence * 0.3 +
      stability * 0.3 +
      density * 0.2 +
      separation * 0.2
    );

    return {
      topicId: topic.id,
      topicName: topic.name,
      coherence,
      separation,
      density,
      stability,
      overallQuality,
    };
  } catch (error) {
    logger.error('Failed to calculate topic quality', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Get quality metrics for all topics
 */
export async function getAllTopicQualityMetrics(
  context: AIContext
): Promise<TopicQualityMetrics[]> {
  try {
    const topicsResult = await queryContext(
      context,
      `SELECT id FROM idea_topics WHERE context = $1`,
      [context]
    );

    const metrics: TopicQualityMetrics[] = [];

    for (const topic of topicsResult.rows) {
      const quality = await calculateTopicQuality(topic.id, context);
      if (quality) {
        metrics.push(quality);
      }
    }

    return metrics.sort((a, b) => b.overallQuality - a.overallQuality);
  } catch (error) {
    logger.error('Failed to get all topic quality metrics', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Smart Topic Assignment
// ===========================================

/**
 * Find best matching topic for an idea based on semantic similarity
 */
export async function findBestTopicForIdea(
  ideaId: string,
  context: AIContext,
  minConfidence: number = 0.5
): Promise<TopicAssignment | null> {
  try {
    // Get idea embedding
    const ideaResult = await queryContext(
      context,
      `SELECT id, embedding FROM ideas WHERE id = $1`,
      [ideaId]
    );

    if (ideaResult.rows.length === 0 || !ideaResult.rows[0].embedding) {
      logger.warn('Idea not found or has no embedding', { ideaId });
      return null;
    }

    let ideaEmbedding: number[];
    try {
      ideaEmbedding = typeof ideaResult.rows[0].embedding === 'string'
        ? JSON.parse(ideaResult.rows[0].embedding)
        : ideaResult.rows[0].embedding;
    } catch {
      ideaEmbedding = ideaResult.rows[0].embedding;
    }

    // Get all topic centroids
    const topicsResult = await queryContext(
      context,
      `SELECT id, name, centroid_embedding
       FROM idea_topics
       WHERE context = $1 AND centroid_embedding IS NOT NULL`,
      [context]
    );

    if (topicsResult.rows.length === 0) {
      return null;
    }

    // Calculate similarity to each topic
    const similarities: Array<{ id: string; name: string; confidence: number }> = [];

    for (const topic of topicsResult.rows) {
      let centroid: number[];
      try {
        centroid = typeof topic.centroid_embedding === 'string'
          ? JSON.parse(topic.centroid_embedding)
          : topic.centroid_embedding;
      } catch {
        centroid = topic.centroid_embedding;
      }

      const sim = cosineSimilarity(ideaEmbedding, centroid);
      similarities.push({
        id: topic.id,
        name: topic.name,
        confidence: sim,
      });
    }

    // Sort by similarity
    similarities.sort((a, b) => b.confidence - a.confidence);

    const best = similarities[0];

    if (best.confidence < minConfidence) {
      logger.debug('No topic meets confidence threshold', {
        ideaId,
        bestConfidence: best.confidence,
        threshold: minConfidence,
      });
      return null;
    }

    return {
      ideaId,
      topicId: best.id,
      topicName: best.name,
      confidence: best.confidence,
      alternativeTopics: similarities.slice(1, 4), // Top 3 alternatives
    };
  } catch (error) {
    logger.error('Failed to find best topic for idea', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Auto-assign topic to a newly created idea
 * Called after idea creation to maintain topic assignments
 */
export async function autoAssignTopicToIdea(
  ideaId: string,
  context: AIContext
): Promise<boolean> {
  try {
    const assignment = await findBestTopicForIdea(ideaId, context, 0.6);

    if (!assignment) {
      logger.debug('No suitable topic found for idea', { ideaId });
      return false;
    }

    // Insert membership
    await queryContext(
      context,
      `INSERT INTO idea_topic_memberships (idea_id, topic_id, membership_score, is_primary)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (idea_id, topic_id)
       DO UPDATE SET membership_score = $3, is_primary = true`,
      [ideaId, assignment.topicId, assignment.confidence]
    );

    // Update idea's primary topic
    await queryContext(
      context,
      `UPDATE ideas SET primary_topic_id = $2 WHERE id = $1`,
      [ideaId, assignment.topicId]
    );

    logger.info('Auto-assigned topic to idea', {
      ideaId,
      topicId: assignment.topicId,
      topicName: assignment.topicName,
      confidence: assignment.confidence,
    });

    return true;
  } catch (error) {
    logger.error('Failed to auto-assign topic', error instanceof Error ? error : undefined);
    return false;
  }
}

// ===========================================
// Topic Similarity & Merge Suggestions
// ===========================================

/**
 * Find topics that are similar and could potentially be merged
 */
export async function findSimilarTopics(
  context: AIContext,
  similarityThreshold: number = 0.75
): Promise<TopicSimilarity[]> {
  try {
    // Get all topics with centroids
    const topicsResult = await queryContext(
      context,
      `SELECT id, name, centroid_embedding
       FROM idea_topics
       WHERE context = $1 AND centroid_embedding IS NOT NULL`,
      [context]
    );

    const similarities: TopicSimilarity[] = [];

    // Compare each pair
    for (let i = 0; i < topicsResult.rows.length; i++) {
      for (let j = i + 1; j < topicsResult.rows.length; j++) {
        const topic1 = topicsResult.rows[i];
        const topic2 = topicsResult.rows[j];

        let centroid1: number[], centroid2: number[];
        try {
          centroid1 = typeof topic1.centroid_embedding === 'string'
            ? JSON.parse(topic1.centroid_embedding)
            : topic1.centroid_embedding;
          centroid2 = typeof topic2.centroid_embedding === 'string'
            ? JSON.parse(topic2.centroid_embedding)
            : topic2.centroid_embedding;
        } catch {
          continue;
        }

        const sim = cosineSimilarity(centroid1, centroid2);

        if (sim >= similarityThreshold - 0.1) {
          // Get shared keywords
          const keywords1 = await extractTopicKeywords(topic1.id, context, 5);
          const keywords2 = await extractTopicKeywords(topic2.id, context, 5);

          const words1 = new Set(keywords1.map(k => k.word));
          const sharedKeywords = keywords2
            .filter(k => words1.has(k.word))
            .map(k => k.word);

          similarities.push({
            topic1Id: topic1.id,
            topic1Name: topic1.name,
            topic2Id: topic2.id,
            topic2Name: topic2.name,
            similarity: sim,
            sharedKeywords,
            suggestMerge: sim >= similarityThreshold,
          });
        }
      }
    }

    return similarities.sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    logger.error('Failed to find similar topics', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Topic-aware Chat Context
// ===========================================

/**
 * Get relevant topic context for a chat message
 * Used to enhance chat responses with topic-aware information
 */
export async function getTopicContextForChat(
  message: string,
  context: AIContext,
  maxTopics: number = 3
): Promise<TopicChatContext> {
  try {
    // Generate embedding for the message
    const messageEmbedding = await generateEmbedding(message);

    if (messageEmbedding.length === 0) {
      return { relevantTopics: [], suggestedIdeas: [] };
    }

    // Find relevant topics
    const topicsResult = await queryContext(
      context,
      `SELECT id, name, centroid_embedding, idea_count
       FROM idea_topics
       WHERE context = $1 AND centroid_embedding IS NOT NULL`,
      [context]
    );

    const topicRelevance: Array<{
      id: string;
      name: string;
      relevance: number;
      ideaCount: number;
    }> = [];

    for (const topic of topicsResult.rows) {
      let centroid: number[];
      try {
        centroid = typeof topic.centroid_embedding === 'string'
          ? JSON.parse(topic.centroid_embedding)
          : topic.centroid_embedding;
      } catch {
        continue;
      }

      const relevance = cosineSimilarity(messageEmbedding, centroid);
      topicRelevance.push({
        id: topic.id,
        name: topic.name,
        relevance,
        ideaCount: parseInt(topic.idea_count, 10),
      });
    }

    // Sort by relevance and take top N
    const relevantTopics = topicRelevance
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxTopics);

    // Get keywords for relevant topics
    const topicsWithKeywords = await Promise.all(
      relevantTopics.map(async (t) => ({
        ...t,
        keywords: (await extractTopicKeywords(t.id, context, 5)).map(k => k.word),
      }))
    );

    // Find relevant ideas from top topics
    const suggestedIdeas: Array<{
      id: string;
      title: string;
      topicName: string;
      relevance: number;
    }> = [];

    for (const topic of relevantTopics.slice(0, 2)) {
      const ideasResult = await queryContext(
        context,
        `SELECT i.id, i.title, i.embedding
         FROM ideas i
         JOIN idea_topic_memberships m ON i.id = m.idea_id
         WHERE m.topic_id = $1 AND i.embedding IS NOT NULL
         ORDER BY m.membership_score DESC
         LIMIT 5`,
        [topic.id]
      );

      for (const idea of ideasResult.rows) {
        let ideaEmbedding: number[];
        try {
          ideaEmbedding = typeof idea.embedding === 'string'
            ? JSON.parse(idea.embedding)
            : idea.embedding;
        } catch {
          continue;
        }

        const relevance = cosineSimilarity(messageEmbedding, ideaEmbedding);
        suggestedIdeas.push({
          id: idea.id,
          title: idea.title,
          topicName: topic.name,
          relevance,
        });
      }
    }

    // Sort and limit suggested ideas
    suggestedIdeas.sort((a, b) => b.relevance - a.relevance);

    return {
      relevantTopics: topicsWithKeywords,
      suggestedIdeas: suggestedIdeas.slice(0, 5),
    };
  } catch (error) {
    logger.error('Failed to get topic context for chat', error instanceof Error ? error : undefined);
    return { relevantTopics: [], suggestedIdeas: [] };
  }
}

/**
 * Format topic context for inclusion in chat prompt
 */
export function formatTopicContextForPrompt(topicContext: TopicChatContext): string {
  if (topicContext.relevantTopics.length === 0) {
    return '';
  }

  const lines: string[] = ['[RELEVANTE THEMEN]'];

  for (const topic of topicContext.relevantTopics) {
    const keywordStr = topic.keywords.length > 0 ? ` (${topic.keywords.join(', ')})` : '';
    lines.push(`- ${topic.name}${keywordStr} [${topic.ideaCount} Ideen]`);
  }

  if (topicContext.suggestedIdeas.length > 0) {
    lines.push('');
    lines.push('[VERWANDTE IDEEN]');
    for (const idea of topicContext.suggestedIdeas.slice(0, 3)) {
      lines.push(`- "${idea.title}" (${idea.topicName})`);
    }
  }

  return lines.join('\n');
}

// ===========================================
// Exports
// ===========================================

export const topicEnhancement = {
  extractTopicKeywords,
  getTopicsWithKeywords,
  calculateTopicQuality,
  getAllTopicQualityMetrics,
  findBestTopicForIdea,
  autoAssignTopicToIdea,
  findSimilarTopics,
  getTopicContextForChat,
  formatTopicContextForPrompt,
};

export default topicEnhancement;
