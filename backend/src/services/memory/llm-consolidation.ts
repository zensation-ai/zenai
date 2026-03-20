/**
 * LLM-Based Episodic Consolidation (Phase 100)
 *
 * Replaces simple string truncation with Claude Haiku extraction
 * of semantic facts from grouped episodes.
 *
 * Output format: JSON Array [{content, fact_type, confidence}]
 * Falls back to old substring method on error.
 *
 * @module services/memory/llm-consolidation
 */

import { logger } from '../../utils/logger';
import { generateClaudeResponse } from '../claude/core';

// ===========================================
// Types
// ===========================================

export interface EpisodeInput {
  id: string;
  trigger: string;
  response: string;
  retrievalStrength: number;
}

export interface ExtractedFact {
  content: string;
  fact_type: string;
  confidence: number;
}

// ===========================================
// Valid fact types
// ===========================================

const VALID_FACT_TYPES = ['preference', 'behavior', 'knowledge', 'goal', 'context'];

// ===========================================
// Phase 112: Semantic Clustering (TF-IDF)
// ===========================================

/**
 * A cluster of semantically similar episodes.
 */
export interface SemanticCluster {
  /** Representative text for this cluster (first episode's trigger) */
  centroid: string;
  /** Episodes belonging to this cluster */
  members: EpisodeInput[];
  /** Average pairwise similarity within the cluster */
  similarity: number;
}

/**
 * TF-IDF vector representation for a document.
 */
interface TfIdfVector {
  terms: Map<string, number>;
  magnitude: number;
}

/**
 * Tokenize text into normalized terms.
 * Strips punctuation, lowercases, filters short words and stop words.
 */
function tokenize(text: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
    'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
    'them', 'his', 'her', 'their', 'my', 'your', 'our', 'we', 'you',
    'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'ist',
    'sind', 'war', 'hat', 'haben', 'ich', 'du', 'er', 'sie', 'wir',
    'ihr', 'es', 'den', 'dem', 'des', 'von', 'zu', 'mit', 'auf', 'fuer',
    'als', 'an', 'auch', 'noch', 'wie', 'nur', 'wenn', 'dann', 'so',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Compute TF-IDF vectors for a set of documents.
 *
 * Term Frequency: count / total terms in doc
 * Inverse Document Frequency: log(N / df)
 *
 * @param documents - Array of document texts
 * @returns Array of TF-IDF vectors
 */
function computeTfIdfVectors(documents: string[]): TfIdfVector[] {
  const N = documents.length;
  if (N === 0) return [];

  // Tokenize all documents
  const tokenized = documents.map(doc => tokenize(doc));

  // Compute document frequency for each term
  const df = new Map<string, number>();
  for (const tokens of tokenized) {
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  // Compute TF-IDF for each document
  return tokenized.map(tokens => {
    const termCounts = new Map<string, number>();
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    const totalTerms = Math.max(tokens.length, 1);
    const tfidf = new Map<string, number>();
    let magnitudeSq = 0;

    for (const [term, count] of termCounts) {
      const tf = count / totalTerms;
      const idf = Math.log(N / (df.get(term) || 1));
      const score = tf * idf;
      if (score > 0) {
        tfidf.set(term, score);
        magnitudeSq += score * score;
      }
    }

    return {
      terms: tfidf,
      magnitude: Math.sqrt(magnitudeSq),
    };
  });
}

/**
 * Compute cosine similarity between two TF-IDF vectors.
 *
 * @returns Similarity score 0-1
 */
function cosineSimilarity(a: TfIdfVector, b: TfIdfVector): number {
  if (a.magnitude === 0 || b.magnitude === 0) return 0;

  let dotProduct = 0;
  // Iterate over the smaller vector for efficiency
  const [smaller, larger] = a.terms.size <= b.terms.size ? [a, b] : [b, a];
  for (const [term, scoreA] of smaller.terms) {
    const scoreB = larger.terms.get(term);
    if (scoreB !== undefined) {
      dotProduct += scoreA * scoreB;
    }
  }

  return dotProduct / (a.magnitude * b.magnitude);
}

/**
 * Cluster episodes by semantic similarity using TF-IDF cosine similarity.
 *
 * Uses a greedy single-linkage approach:
 * 1. Compute TF-IDF vectors for each episode (trigger + response)
 * 2. Greedily assign each episode to the most similar existing cluster
 * 3. If no cluster has similarity > threshold, create a new cluster
 *
 * @param episodes - Episodes to cluster
 * @param threshold - Minimum cosine similarity to join a cluster (default: 0.5)
 * @returns Array of SemanticClusters
 */
const MAX_CLUSTER_EPISODES = 50;

export function clusterEpisodesSemantic(
  episodes: EpisodeInput[],
  threshold = 0.5
): SemanticCluster[] {
  if (episodes.length === 0) return [];
  // Cap episodes to avoid O(n^2) pairwise similarity computation
  if (episodes.length > MAX_CLUSTER_EPISODES) {
    episodes = episodes.slice(0, MAX_CLUSTER_EPISODES);
  }
  if (episodes.length === 1) {
    return [{
      centroid: episodes[0].trigger,
      members: [episodes[0]],
      similarity: 1.0,
    }];
  }

  // Create document text for each episode
  const documents = episodes.map(ep =>
    `${ep.trigger} ${ep.response}`.substring(0, 1000)
  );

  // Compute TF-IDF vectors
  const vectors = computeTfIdfVectors(documents);

  // Greedy clustering
  const clusters: { centroidIdx: number; memberIndices: number[] }[] = [];

  for (let i = 0; i < episodes.length; i++) {
    let bestCluster = -1;
    let bestSimilarity = 0;

    for (let c = 0; c < clusters.length; c++) {
      const sim = cosineSimilarity(vectors[i], vectors[clusters[c].centroidIdx]);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestCluster = c;
      }
    }

    if (bestCluster >= 0 && bestSimilarity >= threshold) {
      clusters[bestCluster].memberIndices.push(i);
    } else {
      // Create new cluster with this episode as centroid
      clusters.push({ centroidIdx: i, memberIndices: [i] });
    }
  }

  // Convert to SemanticCluster format
  return clusters.map(cluster => {
    const members = cluster.memberIndices.map(idx => episodes[idx]);

    // Compute average pairwise similarity within cluster
    let totalSim = 0;
    let pairCount = 0;
    for (let i = 0; i < cluster.memberIndices.length; i++) {
      for (let j = i + 1; j < cluster.memberIndices.length; j++) {
        totalSim += cosineSimilarity(
          vectors[cluster.memberIndices[i]],
          vectors[cluster.memberIndices[j]]
        );
        pairCount++;
      }
    }
    const avgSimilarity = pairCount > 0 ? totalSim / pairCount : 1.0;

    return {
      centroid: episodes[cluster.centroidIdx].trigger,
      members,
      similarity: Math.round(avgSimilarity * 1000) / 1000,
    };
  });
}

// ===========================================
// Fallback: Old substring method
// ===========================================

function extractFactsFallback(episodes: EpisodeInput[]): ExtractedFact[] {
  return episodes.map(ep => ({
    content: `Fruehere Interaktion: "${ep.trigger.substring(0, 100)}${ep.trigger.length > 100 ? '...' : ''}" -> ${ep.response.substring(0, 150)}${ep.response.length > 150 ? '...' : ''}`,
    fact_type: 'context',
    confidence: ep.retrievalStrength,
  }));
}

// ===========================================
// LLM-Based Extraction
// ===========================================

/**
 * Extract 1-3 semantic facts from grouped episodes using Claude Haiku.
 *
 * Phase 112: Optionally pre-clusters episodes semantically before LLM extraction.
 * When useSemantic is true, episodes are clustered by TF-IDF similarity first,
 * and the LLM receives pre-clustered groups for better fact extraction.
 *
 * @param episodes - Episodes to extract facts from
 * @param options - Optional configuration
 * @param options.useSemantic - If true, pre-cluster episodes before LLM extraction
 * @returns Array of extracted facts
 */
export async function extractFactsFromEpisodes(
  episodes: EpisodeInput[],
  options?: { useSemantic?: boolean }
): Promise<ExtractedFact[]> {
  if (episodes.length === 0) {
    return [];
  }

  // Phase 112: Pre-cluster episodes semantically if requested
  if (options?.useSemantic && episodes.length > 2) {
    try {
      const clusters = clusterEpisodesSemantic(episodes);
      if (clusters.length > 1) {
        logger.info('Semantic pre-clustering applied', {
          episodeCount: episodes.length,
          clusterCount: clusters.length,
        });
        // Extract facts from each cluster independently, then merge
        const allFacts: ExtractedFact[] = [];
        for (const cluster of clusters) {
          const clusterFacts = await extractFactsFromEpisodes(cluster.members, { useSemantic: false });
          allFacts.push(...clusterFacts);
        }
        // Deduplicate by content similarity
        const uniqueFacts: ExtractedFact[] = [];
        for (const fact of allFacts) {
          const isDuplicate = uniqueFacts.some(existing => {
            const wordsA = new Set(fact.content.toLowerCase().split(/\s+/));
            const wordsB = new Set(existing.content.toLowerCase().split(/\s+/));
            let overlap = 0;
            for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
            return overlap / Math.max(1, Math.min(wordsA.size, wordsB.size)) > 0.8;
          });
          if (!isDuplicate) uniqueFacts.push(fact);
        }
        return uniqueFacts.slice(0, 5); // Max 5 facts from multi-cluster
      }
    } catch (err) {
      logger.warn('Semantic clustering failed, falling back to flat extraction', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    const episodeText = episodes.map((ep, i) =>
      `Episode ${i + 1}:\n  User: ${ep.trigger.substring(0, 300)}\n  AI: ${ep.response.substring(0, 500)}`
    ).join('\n\n');

    const systemPrompt = `You are a memory consolidation assistant. Given a set of past conversation episodes, extract 1-3 semantic facts that capture the most important user preferences, knowledge, or patterns. Output ONLY a JSON array of objects with fields: content (string), fact_type (one of: preference, behavior, knowledge, goal, context), confidence (number 0-1). Use the same language as the input.`;

    const userPrompt = `Episodes to consolidate:\n\n${episodeText}\n\nExtract key facts as JSON array:`;

    const response = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 400,
      temperature: 0.2,
    });

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('LLM consolidation: No JSON array in response, using fallback');
      return extractFactsFallback(episodes);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      logger.warn('LLM consolidation: Empty or invalid array, using fallback');
      return extractFactsFallback(episodes);
    }

    // Validate and sanitize facts
    const validFacts: ExtractedFact[] = parsed
      .slice(0, 3) // Max 3 facts
      .map((f: Record<string, unknown>) => ({
        content: String(f.content || ''),
        fact_type: VALID_FACT_TYPES.includes(f.fact_type as string)
          ? (f.fact_type as string)
          : 'context',
        confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.7)),
      }))
      .filter((f: ExtractedFact) => f.content.length > 0);

    if (validFacts.length === 0) {
      return extractFactsFallback(episodes);
    }

    logger.info('LLM consolidation extracted facts', {
      episodeCount: episodes.length,
      factCount: validFacts.length,
    });

    return validFacts;
  } catch (error) {
    logger.warn('LLM consolidation failed, using substring fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return extractFactsFallback(episodes);
  }
}
