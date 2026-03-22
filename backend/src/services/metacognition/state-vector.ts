/**
 * Phase 135: Metacognitive State Vector
 *
 * Computes a multi-dimensional state vector that captures the system's
 * self-awareness about its own knowledge, confidence, and coherence.
 * Used by downstream services for adaptive behavior (e.g., triggering
 * clarification, adjusting retrieval strategies, or flagging uncertainty).
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfusionLevel = 'low' | 'medium' | 'high';

export interface MetacognitiveState {
  confidence: number;        // 0-1
  coherence: number;         // 0-1
  conflictLevel: number;     // 0+
  knowledgeCoverage: number; // 0-1
  confusionLevel: ConfusionLevel;
}

interface BuildStateParams {
  confidence: number;
  coherence: number;
  conflictLevel: number;
  knowledgeCoverage: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

// ---------------------------------------------------------------------------
// computeCoherence
// ---------------------------------------------------------------------------

export function computeCoherence(
  queryEmbedding: number[],
  contextEmbeddings: number[][],
  responseEmbedding: number[],
): number {
  if (
    queryEmbedding.length === 0 ||
    contextEmbeddings.length === 0 ||
    responseEmbedding.length === 0
  ) {
    return 0;
  }

  const similarities: number[] = [];

  // query <-> response
  similarities.push(cosineSimilarity(queryEmbedding, responseEmbedding));

  // query <-> each context
  for (const ctx of contextEmbeddings) {
    similarities.push(cosineSimilarity(queryEmbedding, ctx));
  }

  // response <-> each context
  for (const ctx of contextEmbeddings) {
    similarities.push(cosineSimilarity(responseEmbedding, ctx));
  }

  // Average, clamped 0-1
  const sum = similarities.reduce((acc, s) => acc + Math.max(0, s), 0);
  const avg = sum / similarities.length;

  return Math.max(0, Math.min(1, avg));
}

// ---------------------------------------------------------------------------
// computeKnowledgeCoverage
// ---------------------------------------------------------------------------

export function computeKnowledgeCoverage(
  queryEntities: string[],
  knownEntities: Set<string>,
): number {
  if (queryEntities.length === 0) return 0;

  let found = 0;
  for (const entity of queryEntities) {
    if (knownEntities.has(entity)) found++;
  }

  return found / queryEntities.length;
}

// ---------------------------------------------------------------------------
// detectConfusion
// ---------------------------------------------------------------------------

export function detectConfusion(state: MetacognitiveState): ConfusionLevel {
  // High priority checks
  if (state.conflictLevel > 2) return 'high';
  if (state.knowledgeCoverage < 0.3) return 'high';

  // Medium priority checks
  if (state.confidence < 0.4) return 'medium';
  if (state.coherence < 0.5) return 'medium';

  return 'low';
}

// ---------------------------------------------------------------------------
// buildMetacognitiveState
// ---------------------------------------------------------------------------

export function buildMetacognitiveState(params: BuildStateParams): MetacognitiveState {
  const state: MetacognitiveState = {
    confidence: params.confidence,
    coherence: params.coherence,
    conflictLevel: params.conflictLevel,
    knowledgeCoverage: params.knowledgeCoverage,
    confusionLevel: 'low', // placeholder
  };

  state.confusionLevel = detectConfusion(state);

  return state;
}

// ---------------------------------------------------------------------------
// recordEvaluation
// ---------------------------------------------------------------------------

export async function recordEvaluation(
  context: string,
  state: MetacognitiveState,
  query: string,
  domain: string,
): Promise<void> {
  try {
    const sql = `INSERT INTO metacognitive_evaluations
      (confidence, coherence, conflict_level, knowledge_coverage, confusion_level, query, domain, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`;

    await queryContext(context, sql, [
      state.confidence,
      state.coherence,
      state.conflictLevel,
      state.knowledgeCoverage,
      state.confusionLevel,
      query,
      domain,
    ]);

    logger.debug('Recorded metacognitive evaluation', { context, domain, confusionLevel: state.confusionLevel });
  } catch (error) {
    logger.error('Failed to record metacognitive evaluation', { error });
  }
}

// ---------------------------------------------------------------------------
// getRecentStates
// ---------------------------------------------------------------------------

export async function getRecentStates(
  context: string,
  limit: number = 20,
): Promise<MetacognitiveState[]> {
  try {
    const sql = `SELECT confidence, coherence, conflict_level, knowledge_coverage, confusion_level
                 FROM metacognitive_evaluations
                 ORDER BY created_at DESC
                 LIMIT $1`;

    const result = await queryContext(context, sql, [limit]);

    if (!result.rows || result.rows.length === 0) return [];

    return result.rows.map((row: any) => ({
      confidence: Number(row.confidence),
      coherence: Number(row.coherence),
      conflictLevel: Number(row.conflict_level),
      knowledgeCoverage: Number(row.knowledge_coverage),
      confusionLevel: row.confusion_level as ConfusionLevel,
    }));
  } catch (error) {
    logger.error('Failed to get recent metacognitive states', { error });
    return [];
  }
}
