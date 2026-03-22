/**
 * Phase 133: Artificial Curiosity Engine — Information Gain
 *
 * Computes surprise, novelty, and information gain scores for RAG queries.
 * Uses cosine similarity between query and retrieved embeddings to measure surprise,
 * and a familiarity buffer to track novelty over time.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { AIContext } from '../../types/context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InformationGainEvent {
  queryText: string;
  surprise: number;
  novelty: number;
  informationGain: number;
}

// ---------------------------------------------------------------------------
// Cosine Similarity
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {return 0;}

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  if (denominator === 0) {return 0;}

  return dot / denominator;
}

// ---------------------------------------------------------------------------
// Surprise Score
// ---------------------------------------------------------------------------

export function computeSurpriseScore(
  queryEmbedding: number[],
  retrievedEmbeddings: number[][],
): number {
  if (retrievedEmbeddings.length === 0) {return 1.0;}

  const totalSim = retrievedEmbeddings.reduce(
    (sum, emb) => sum + cosineSimilarity(queryEmbedding, emb),
    0,
  );
  const avgSim = totalSim / retrievedEmbeddings.length;
  const surprise = 1 - avgSim;

  return Math.max(0, Math.min(1, surprise));
}

// ---------------------------------------------------------------------------
// Novelty Score
// ---------------------------------------------------------------------------

export function computeNoveltyScore(
  retrievedIds: string[],
  familiarityBuffer: Set<string>,
): number {
  if (retrievedIds.length === 0) {return 0;}

  const newCount = retrievedIds.filter((id) => !familiarityBuffer.has(id)).length;
  return newCount / retrievedIds.length;
}

// ---------------------------------------------------------------------------
// Information Gain
// ---------------------------------------------------------------------------

export function computeInformationGain(surprise: number, novelty: number): number {
  const gain = surprise * novelty;
  return Math.max(0, Math.min(1, gain));
}

// ---------------------------------------------------------------------------
// FamiliarityBuffer — FIFO buffer with fixed max size
// ---------------------------------------------------------------------------

export class FamiliarityBuffer {
  private readonly maxSize: number;
  private readonly items: Set<string> = new Set();
  private readonly order: string[] = [];

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  add(id: string): void {
    if (this.maxSize <= 0) {return;}
    if (this.items.has(id)) {return;}

    if (this.order.length >= this.maxSize) {
      const oldest = this.order.shift();
      if (oldest !== undefined) {
        this.items.delete(oldest);
      }
    }

    this.items.add(id);
    this.order.push(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get size(): number {
    return this.items.size;
  }
}

// ---------------------------------------------------------------------------
// Record to DB (fire-and-forget)
// ---------------------------------------------------------------------------

export async function recordInformationGain(
  context: string,
  params: InformationGainEvent,
): Promise<void> {
  try {
    await queryContext(
      context as AIContext,
      `INSERT INTO information_gain_events (query_text, surprise, novelty, information_gain, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [params.queryText, params.surprise, params.novelty, params.informationGain],
    );
  } catch (err) {
    logger.error('Failed to record information gain event', err instanceof Error ? err : new Error(String(err)));
  }
}
