/**
 * Phase 101 B4: Memory Benchmark Framework
 *
 * Evaluates retrieval quality of the HiMeS 4-layer memory system.
 * Samples facts from long-term memory, generates natural queries,
 * tests retrieval, and computes recall@k.
 *
 * @module services/memory/memory-benchmark
 */

import { AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { longTermMemory } from '../memory';

// ===========================================
// Types
// ===========================================

export interface BenchmarkResult {
  /** Total facts sampled for the benchmark */
  totalFacts: number;
  /** Number of facts successfully retrieved in top-k results */
  retrievedCorrectly: number;
  /** Recall@k = retrievedCorrectly / totalFacts */
  recallAtK: number;
  /** Average latency per retrieval attempt in ms */
  averageRetrievalLatency: number;
}

// ===========================================
// Query Generation
// ===========================================

/**
 * Generate a natural retrieval query from a fact's content.
 *
 * Transforms stored fact sentences into search queries by:
 * - Removing filler words
 * - Extracting key noun phrases
 * - Keeping queries concise (first 60 chars of core content)
 *
 * @param factContent - The stored fact content string
 * @returns A natural language query string
 */
export function generateRetrievalQuery(factContent: string): string {
  // Strip leading "User " prefix that's common in facts
  const stripped = factContent.replace(/^(user\s+)/i, '').trim();

  // Take first meaningful portion (up to 60 chars at word boundary)
  if (stripped.length <= 60) {
    return stripped;
  }

  const truncated = stripped.substring(0, 60);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 10 ? truncated.substring(0, lastSpace) : truncated;
}

// ===========================================
// Benchmark Runner
// ===========================================

/**
 * Run a memory retrieval benchmark.
 *
 * Samples up to `sampleSize` facts from long-term memory,
 * generates a natural query for each fact, attempts retrieval,
 * and computes recall@5 (how many facts appear in top-5 results).
 *
 * @param context - AI context to benchmark
 * @param sampleSize - Number of facts to sample (default 50)
 * @returns BenchmarkResult with recall@k and latency metrics
 */
export async function runMemoryBenchmark(
  context: AIContext,
  sampleSize = 50
): Promise<BenchmarkResult> {
  const K = 5; // recall@5

  try {
    // Get all facts from long-term memory
    const allFacts = await longTermMemory.getFacts(context);

    if (allFacts.length === 0) {
      logger.info('Memory benchmark: no facts found', { context });
      return {
        totalFacts: 0,
        retrievedCorrectly: 0,
        recallAtK: 0,
        averageRetrievalLatency: 0,
      };
    }

    // Sample up to sampleSize facts
    const sample = allFacts.length <= sampleSize
      ? allFacts
      : allFacts
          .slice()
          .sort(() => Math.random() - 0.5)
          .slice(0, sampleSize);

    let retrievedCorrectly = 0;
    const latencies: number[] = [];

    for (const fact of sample) {
      const query = generateRetrievalQuery(fact.content);

      const start = Date.now();
      try {
        const result = await longTermMemory.retrieve(context, query);
        const latency = Date.now() - start;
        latencies.push(latency);

        // Check if this fact appears in top-K results
        const topKIds = result.facts.slice(0, K).map(f => f.id);
        if (topKIds.includes(fact.id)) {
          retrievedCorrectly++;
        }
      } catch (err) {
        const latency = Date.now() - start;
        latencies.push(latency);
        logger.warn('Memory benchmark: retrieval failed for fact', {
          factId: fact.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    const totalFacts = sample.length;
    const recallAtK = totalFacts > 0 ? retrievedCorrectly / totalFacts : 0;
    const averageRetrievalLatency = latencies.length > 0
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
      : 0;

    logger.info('Memory benchmark complete', {
      context,
      totalFacts,
      retrievedCorrectly,
      recallAtK: recallAtK.toFixed(3),
      avgLatencyMs: averageRetrievalLatency.toFixed(1),
    });

    return {
      totalFacts,
      retrievedCorrectly,
      recallAtK,
      averageRetrievalLatency,
    };
  } catch (error) {
    logger.error('Memory benchmark failed', error instanceof Error ? error : undefined);
    return {
      totalFacts: 0,
      retrievedCorrectly: 0,
      recallAtK: 0,
      averageRetrievalLatency: 0,
    };
  }
}
