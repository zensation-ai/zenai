/**
 * Phase 133: Artificial Curiosity Engine — Gap Detector
 *
 * Detects knowledge gaps by analyzing query history, fact coverage,
 * confidence scores, and RAG retrieval quality. Returns scored gaps
 * with suggested remediation actions.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { AIContext } from '../../types/context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeGap {
  topic: string;
  domain: string;
  queryCount: number;
  factCount: number;
  avgConfidence: number;
  avgRAGScore: number;
  gapScore: number;
  suggestedAction: string;
}

interface GapScoreParams {
  queryCount: number;
  maxQueries: number;
  factCount: number;
  maxFacts: number;
  avgConfidence: number;
  avgRAGScore: number;
}

interface QueryInput {
  text: string;
  domain: string;
}

interface TopicGroup {
  topic: string;
  domain: string;
  queryCount: number;
}

// ---------------------------------------------------------------------------
// Stop words for keyword extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'in', 'of', 'and', 'for', 'to', 'on', 'at',
  'by', 'it', 'or', 'as', 'be', 'was', 'are', 'with', 'that', 'this',
  'from', 'but', 'not', 'has', 'had', 'have', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'its', 'my', 'your', 'our', 'their', 'his', 'her', 'we', 'they',
  'he', 'she', 'i', 'you', 'me', 'us', 'them', 'who', 'what', 'where',
  'when', 'how', 'why', 'which', 'there', 'here', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'some', 'any', 'no', 'only',
  'very', 'just', 'also', 'than', 'then', 'so', 'if', 'about', 'up',
  'out', 'way', 'best',
]);

// ---------------------------------------------------------------------------
// computeGapScore
// ---------------------------------------------------------------------------

export function computeGapScore(params: GapScoreParams): number {
  const { queryCount, maxQueries, factCount, maxFacts, avgConfidence, avgRAGScore } = params;

  const queryRatio = maxQueries > 0 ? queryCount / maxQueries : 0;
  const factRatio = maxFacts > 0 ? factCount / maxFacts : 0;

  const raw =
    queryRatio * 0.4 +
    (1 - factRatio) * 0.3 +
    (1 - avgConfidence) * 0.2 +
    (1 - avgRAGScore) * 0.1;

  return Math.max(0, Math.min(1, raw));
}

// ---------------------------------------------------------------------------
// suggestAction
// ---------------------------------------------------------------------------

export function suggestAction(
  gapScore: number,
  factCount: number,
  avgConfidence: number,
): string {
  if (gapScore > 0.8 && factCount === 0) return 'web_research';
  if (gapScore > 0.6 && avgConfidence < 0.3) return 'web_research';
  if (gapScore > 0.5 && factCount > 0) return 'consolidate_existing';
  if (gapScore > 0.3) return 'ask_user';
  return 'monitor';
}

// ---------------------------------------------------------------------------
// groupQueriesByTopic
// ---------------------------------------------------------------------------

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function groupQueriesByTopic(queries: QueryInput[]): TopicGroup[] {
  if (queries.length === 0) return [];

  // Build keyword-to-query index
  const groups = new Map<string, { domain: string; count: number }>();

  for (const q of queries) {
    const keywords = extractKeywords(q.text);
    if (keywords.length === 0) continue;

    // Use sorted keywords as group key for dedup
    const key = keywords.sort().join(' ');
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, { domain: q.domain, count: 1 });
    }
  }

  // Merge groups that share significant keyword overlap
  const entries = Array.from(groups.entries());
  const merged: { topic: string; domain: string; queryCount: number }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue;

    const [keyA, valA] = entries[i];
    const wordsA = new Set(keyA.split(' '));
    let combinedWords = new Set(wordsA);
    let totalCount = valA.count;
    let domain = valA.domain;

    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(j)) continue;
      const [keyB, valB] = entries[j];
      const wordsB = new Set(keyB.split(' '));

      // Jaccard-like overlap check
      let overlap = 0;
      for (const w of wordsB) {
        if (wordsA.has(w)) overlap++;
      }
      const union = new Set([...wordsA, ...wordsB]).size;
      if (union > 0 && overlap / union >= 0.3) {
        used.add(j);
        totalCount += valB.count;
        for (const w of wordsB) combinedWords.add(w);
      }
    }

    // Pick the most frequent words as topic label
    const freqMap = new Map<string, number>();
    for (const w of combinedWords) {
      freqMap.set(w, (freqMap.get(w) || 0) + 1);
    }
    const topicWords = Array.from(combinedWords)
      .sort()
      .slice(0, 4);

    merged.push({
      topic: topicWords.join(' '),
      domain,
      queryCount: totalCount,
    });
  }

  // Sort by queryCount descending
  merged.sort((a, b) => b.queryCount - a.queryCount);

  return merged;
}

// ---------------------------------------------------------------------------
// detectGaps
// ---------------------------------------------------------------------------

export async function detectGaps(
  context: string,
  userId?: string,
): Promise<KnowledgeGap[]> {
  try {
    // Fetch recent query history with confidence and RAG scores
    const queryHistorySQL = userId
      ? `SELECT query_text, domain, confidence, rag_score
         FROM chat_query_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 200`
      : `SELECT query_text, domain, confidence, rag_score
         FROM chat_query_log
         ORDER BY created_at DESC
         LIMIT 200`;

    const queryParams = userId ? [userId] : [];
    const queryResult = await queryContext(context as AIContext, queryHistorySQL, queryParams);

    if (!queryResult.rows || queryResult.rows.length === 0) {
      logger.debug('No query history found for gap detection');
      return [];
    }

    // Fetch fact counts per domain
    const factSQL = `SELECT domain, COUNT(*)::int AS fact_count
                     FROM learned_facts
                     GROUP BY domain`;
    const factResult = await queryContext(context as AIContext, factSQL);

    const factMap = new Map<string, number>();
    if (factResult?.rows) {
      for (const row of factResult.rows) {
        factMap.set(row.domain, Number(row.fact_count));
      }
    }

    // Build query inputs for grouping
    const queryInputs: QueryInput[] = queryResult.rows.map((r: any) => ({
      text: r.query_text,
      domain: r.domain || context,
    }));

    // Group queries by topic
    const topicGroups = groupQueriesByTopic(queryInputs);

    // Compute confidence and RAG score averages per topic group
    // For simplicity, compute domain-level averages from raw rows
    const domainStats = new Map<string, { confSum: number; ragSum: number; count: number }>();
    for (const row of queryResult.rows) {
      const d = row.domain || context;
      const stats = domainStats.get(d) || { confSum: 0, ragSum: 0, count: 0 };
      stats.confSum += Number(row.confidence || 0);
      stats.ragSum += Number(row.rag_score || 0);
      stats.count++;
      domainStats.set(d, stats);
    }

    const maxQueries = Math.max(...topicGroups.map((g) => g.queryCount), 1);
    const maxFacts = Math.max(...Array.from(factMap.values()), 1);

    // Score each topic group
    const gaps: KnowledgeGap[] = topicGroups.map((group) => {
      const factCount = factMap.get(group.domain) || 0;
      const stats = domainStats.get(group.domain) || { confSum: 0, ragSum: 0, count: 1 };
      const avgConfidence = stats.count > 0 ? stats.confSum / stats.count : 0;
      const avgRAGScore = stats.count > 0 ? stats.ragSum / stats.count : 0;

      const gapScore = computeGapScore({
        queryCount: group.queryCount,
        maxQueries,
        factCount,
        maxFacts,
        avgConfidence,
        avgRAGScore,
      });

      return {
        topic: group.topic,
        domain: group.domain,
        queryCount: group.queryCount,
        factCount,
        avgConfidence,
        avgRAGScore,
        gapScore,
        suggestedAction: suggestAction(gapScore, factCount, avgConfidence),
      };
    });

    // Sort by gapScore descending, return top 5
    gaps.sort((a, b) => b.gapScore - a.gapScore);

    const topGaps = gaps.slice(0, 5);
    logger.info(`Detected ${topGaps.length} knowledge gaps for context=${context}`);

    return topGaps;
  } catch (error) {
    logger.error('Gap detection failed', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}
