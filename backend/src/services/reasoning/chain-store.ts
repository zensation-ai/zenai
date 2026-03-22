/**
 * Reasoning Chain Store (Phase 128, Task 2)
 *
 * Persists and retrieves full reasoning chains (steps, tools used, conclusion)
 * for later reuse on similar queries. Uses pgvector cosine similarity for
 * semantic matching so the system can short-circuit repeated reasoning.
 *
 * @module services/reasoning/chain-store
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { logger } from '../../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReasoningStep {
  stepNumber: number;
  type: 'observation' | 'hypothesis' | 'inference' | 'verification' | 'conclusion';
  content: string;
  sourceFacts?: string[];
  confidence?: number;
}

export interface ReasoningChain {
  id: string;
  userId: string;
  query: string;
  steps: ReasoningStep[];
  conclusion: string | null;
  confidence: number;
  domain: string | null;
  usedFacts: string[];
  usedTools: string[];
  userFeedback: number | null;
  reusable: boolean;
  reuseCount: number;
  createdAt: Date;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function rowToChain(row: Record<string, unknown>): ReasoningChain {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    query: row.query as string,
    steps: (row.steps ?? []) as ReasoningStep[],
    conclusion: (row.conclusion as string | null) ?? null,
    confidence: row.confidence as number,
    domain: (row.domain as string | null) ?? null,
    usedFacts: (row.used_facts as string[]) ?? [],
    usedTools: (row.used_tools as string[]) ?? [],
    userFeedback: (row.user_feedback as number | null) ?? null,
    reusable: row.reusable as boolean,
    reuseCount: row.reuse_count as number,
    createdAt: new Date(row.created_at as string | Date),
  };
}

// ─── storeChain ───────────────────────────────────────────────────────────────

/**
 * Persist a reasoning chain with a query embedding for similarity search.
 * Returns the generated UUID.
 */
export async function storeChain(
  context: AIContext,
  chain: Omit<ReasoningChain, 'id' | 'createdAt' | 'reuseCount'>
): Promise<string> {
  let embeddingJson: string | null = null;

  try {
    const embedding = await generateEmbedding(chain.query);
    embeddingJson = JSON.stringify(embedding);
  } catch (err) {
    logger.debug('chain-store: embedding generation failed, storing without embedding', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const result = await queryContext(
    context,
    `INSERT INTO reasoning_chains
       (user_id, query, query_embedding, steps, conclusion, confidence, domain,
        used_facts, used_tools, user_feedback, reusable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      chain.userId,
      chain.query,
      embeddingJson,
      JSON.stringify(chain.steps),
      chain.conclusion ?? null,
      chain.confidence,
      chain.domain ?? null,
      chain.usedFacts,
      chain.usedTools,
      chain.userFeedback ?? null,
      chain.reusable,
    ]
  );

  const id = result.rows[0].id as string;
  logger.info('chain-store: stored reasoning chain', { id, context, query: chain.query });
  return id;
}

// ─── findSimilarChains ────────────────────────────────────────────────────────

/**
 * Vector similarity search over reusable reasoning chains.
 * Returns at most `limit` chains whose cosine similarity to the query
 * is >= `minSimilarity`, ordered by similarity descending.
 */
export async function findSimilarChains(
  context: AIContext,
  query: string,
  limit = 3,
  minSimilarity = 0.85
): Promise<Array<ReasoningChain & { similarity: number }>> {
  let embeddingJson: string | null = null;

  try {
    const embedding = await generateEmbedding(query);
    embeddingJson = JSON.stringify(embedding);
  } catch (err) {
    logger.warn('chain-store: embedding generation failed in findSimilarChains', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const result = await queryContext(
    context,
    `SELECT *,
            1 - (query_embedding <=> $1::vector) AS similarity
     FROM   reasoning_chains
     WHERE  reusable = true
       AND  query_embedding IS NOT NULL
       AND  1 - (query_embedding <=> $1::vector) >= $2
     ORDER BY similarity DESC
     LIMIT $3`,
    [embeddingJson, minSimilarity, limit]
  );

  return result.rows.map(row => ({
    ...rowToChain(row as Record<string, unknown>),
    similarity: row.similarity as number,
  }));
}

// ─── getChain ─────────────────────────────────────────────────────────────────

/**
 * Retrieve a single reasoning chain by its UUID.
 * Returns null if not found.
 */
export async function getChain(context: AIContext, chainId: string): Promise<ReasoningChain | null> {
  const result = await queryContext(
    context,
    `SELECT * FROM reasoning_chains WHERE id = $1`,
    [chainId]
  );

  if (result.rows.length === 0) {return null;}
  return rowToChain(result.rows[0] as Record<string, unknown>);
}

// ─── markReusable ─────────────────────────────────────────────────────────────

/**
 * Flip the reusable flag on a stored chain.
 */
export async function markReusable(
  context: AIContext,
  chainId: string,
  reusable: boolean
): Promise<void> {
  await queryContext(
    context,
    `UPDATE reasoning_chains SET reusable = $1 WHERE id = $2`,
    [reusable, chainId]
  );
}

// ─── recordFeedback ───────────────────────────────────────────────────────────

/**
 * Persist user feedback (1–5) for a chain.
 * Automatically marks chains with rating >= 4 as reusable.
 */
export async function recordFeedback(
  context: AIContext,
  chainId: string,
  rating: number
): Promise<void> {
  await queryContext(
    context,
    `UPDATE reasoning_chains SET user_feedback = $1 WHERE id = $2`,
    [rating, chainId]
  );

  if (rating >= 4) {
    await markReusable(context, chainId, true);
  }
}

// ─── incrementReuseCount ─────────────────────────────────────────────────────

/**
 * Atomically increment the reuse_count for a chain.
 */
export async function incrementReuseCount(context: AIContext, chainId: string): Promise<void> {
  await queryContext(
    context,
    `UPDATE reasoning_chains SET reuse_count = reuse_count + 1 WHERE id = $1`,
    [chainId]
  );
}

// ─── getReusableChainForQuery ─────────────────────────────────────────────────

/**
 * Convenience function: return the single best reusable chain for a query,
 * or null if no chain meets the default 0.85 similarity threshold.
 */
export async function getReusableChainForQuery(
  context: AIContext,
  query: string
): Promise<ReasoningChain | null> {
  const results = await findSimilarChains(context, query, 1, 0.85);
  return results.length > 0 ? results[0] : null;
}
