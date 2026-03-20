/**
 * Phase 70: A-RAG Iterative Retriever
 *
 * Executes retrieval plans step by step with self-evaluation.
 * Supports early exit on high confidence and escalation to
 * the strategy agent for revised plans on low confidence.
 *
 * Max 3 iterations total to bound latency.
 *
 * @module services/arag/iterative-retriever
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { hybridRetriever } from '../knowledge-graph/hybrid-retriever';
import { logger } from '../../utils/logger';
import { evaluateResults } from './strategy-evaluator';
import { planRetrieval, buildDefaultPlan, expandQueryWithGraphContext } from './strategy-agent';
import type {
  RetrievalInterface,
  RetrievalPlan,
  RetrievalStep,
  RetrievalResult,
  RetrievalResultItem,
  ARAGExecutionMetadata,
} from './retrieval-interfaces';

// ===========================================
// Configuration
// ===========================================

/** Maximum number of retrieval iterations */
const MAX_ITERATIONS = 3;

/**
 * Confidence threshold for early exit.
 * Phase 113: Raised to 0.8 per quality gate requirements.
 */
const EARLY_EXIT_CONFIDENCE = 0.8;

/**
 * Confidence threshold triggering query reformulation and strategy revision.
 * Phase 113: Lowered to 0.5 to trigger reformulation earlier.
 */
const REVISION_THRESHOLD = 0.5;

/** Maximum results per interface call */
const MAX_RESULTS_PER_INTERFACE = 10;

/** All available retrieval interfaces */
const ALL_INTERFACES: RetrievalInterface[] = ['keyword', 'semantic', 'chunk_read', 'graph', 'community'];

// ===========================================
// Interface Executors
// ===========================================

/**
 * Execute a single retrieval step against the appropriate interface.
 */
async function executeStep(
  step: RetrievalStep,
  context: AIContext,
  existingResults: RetrievalResultItem[]
): Promise<RetrievalResultItem[]> {
  const maxResults = (step.params.maxResults as number) || MAX_RESULTS_PER_INTERFACE;
  const query = (step.params.query as string) || (step.params.terms as string) || '';

  switch (step.interface) {
    case 'keyword':
      return executeKeywordSearch(query, context, maxResults);
    case 'semantic':
      return executeSemanticSearch(query, context, maxResults);
    case 'chunk_read':
      return executeChunkRead(step.params, context);
    case 'graph':
      return executeGraphSearch(query, context, maxResults);
    case 'community':
      return executeCommunitySearch(query, context, maxResults);
    default:
      logger.warn('Unknown retrieval interface', { interface: step.interface });
      return [];
  }
}

/**
 * Keyword (BM25) full-text search.
 */
async function executeKeywordSearch(
  query: string,
  context: AIContext,
  limit: number
): Promise<RetrievalResultItem[]> {
  const sanitized = query.replace(/[^\w\s]/g, ' ').trim();
  if (!sanitized) return [];

  const tsQuery = sanitized
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => `${w}:*`)
    .join(' & ');

  if (!tsQuery) return [];

  try {
    const result = await queryContext(
      context,
      `SELECT id, title, COALESCE(summary, '') as content,
              ts_rank(
                to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(raw_content, '')),
                to_tsquery('german', $1)
              ) as rank
       FROM ideas
       WHERE is_archived = FALSE
         AND to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(raw_content, ''))
             @@ to_tsquery('german', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      [tsQuery, limit]
    );

    const maxRank = result.rows.length > 0
      ? Math.max(...result.rows.map((r: Record<string, unknown>) => parseFloat(r.rank as string) || 0))
      : 1;

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      score: maxRank > 0 ? (parseFloat(row.rank as string) || 0) / maxRank : 0,
      source: 'keyword',
    }));
  } catch (error) {
    logger.debug('A-RAG keyword search failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return [];
  }
}

/**
 * Semantic (embedding) vector search.
 */
async function executeSemanticSearch(
  query: string,
  context: AIContext,
  limit: number
): Promise<RetrievalResultItem[]> {
  try {
    const embedding = await generateEmbedding(query);
    if (!embedding || embedding.length === 0) return [];

    const result = await queryContext(
      context,
      `SELECT id, title, COALESCE(summary, '') as content,
              1 - (embedding <=> $1::vector) as similarity
       FROM ideas
       WHERE is_archived = FALSE
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [`[${embedding.join(',')}]`, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      score: parseFloat(row.similarity as string) || 0,
      source: 'semantic',
    }));
  } catch (error) {
    logger.debug('A-RAG semantic search failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return [];
  }
}

/**
 * Direct chunk read by ID.
 */
async function executeChunkRead(
  params: Record<string, unknown>,
  context: AIContext
): Promise<RetrievalResultItem[]> {
  const ids = params.ids as string[] | undefined;
  if (!ids || ids.length === 0) return [];

  try {
    const result = await queryContext(
      context,
      `SELECT id, title, COALESCE(summary, '') as summary,
              COALESCE(raw_transcript, raw_content, '') as content
       FROM ideas
       WHERE id = ANY($1::uuid[])
         AND is_archived = FALSE`,
      [ids]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      content: `${row.summary as string} ${row.content as string}`.trim(),
      score: 1.0, // Direct lookup = perfect relevance
      source: 'chunk_read',
    }));
  } catch (error) {
    logger.debug('A-RAG chunk read failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return [];
  }
}

/**
 * Graph traversal search via hybrid retriever.
 */
async function executeGraphSearch(
  query: string,
  context: AIContext,
  limit: number
): Promise<RetrievalResultItem[]> {
  try {
    const results = await hybridRetriever.retrieve(query, context, {
      maxResults: limit,
      enableVector: false,
      enableGraph: true,
      enableCommunity: false,
      enableBM25: false,
    });

    return results.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      score: r.score,
      source: 'graph',
    }));
  } catch (error) {
    logger.debug('A-RAG graph search failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return [];
  }
}

/**
 * Community summary search via hybrid retriever.
 */
async function executeCommunitySearch(
  query: string,
  context: AIContext,
  limit: number
): Promise<RetrievalResultItem[]> {
  try {
    const results = await hybridRetriever.retrieve(query, context, {
      maxResults: limit,
      enableVector: false,
      enableGraph: false,
      enableCommunity: true,
      enableBM25: false,
    });

    return results.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      score: r.score,
      source: 'community',
    }));
  } catch (error) {
    logger.debug('A-RAG community search failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return [];
  }
}

// ===========================================
// Result Merging
// ===========================================

/**
 * Merge new results into existing results, deduplicating by ID.
 * Items appearing in multiple sources get a score boost.
 */
function mergeResults(
  existing: RetrievalResultItem[],
  newResults: RetrievalResultItem[]
): RetrievalResultItem[] {
  const merged = new Map<string, RetrievalResultItem>();

  for (const result of existing) {
    merged.set(result.id, result);
  }

  for (const result of newResults) {
    const current = merged.get(result.id);
    if (current) {
      // Boost for appearing in multiple sources
      current.score = Math.min(current.score + result.score * 0.3, 1.0);
      // Keep longer content
      if (result.content.length > current.content.length) {
        current.content = result.content;
      }
    } else {
      merged.set(result.id, { ...result });
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

// ===========================================
// Iterative Retriever
// ===========================================

/**
 * Execute a retrieval plan iteratively with self-evaluation.
 *
 * Flow:
 * 1. Execute plan steps (respecting dependencies)
 * 2. Evaluate results
 * 3. If confidence >= 0.9, return early
 * 4. If confidence < 0.6, ask strategy agent for revised plan
 * 5. Repeat up to MAX_ITERATIONS
 */
export async function executeRetrievalPlan(
  initialPlan: RetrievalPlan,
  context: AIContext,
  query: string
): Promise<{ result: RetrievalResult; metadata: ARAGExecutionMetadata }> {
  const startTime = Date.now();
  let allResults: RetrievalResultItem[] = [];
  const stepTimings: ARAGExecutionMetadata['stepTimings'] = [];
  const interfacesUsed = new Set<RetrievalInterface>();
  let currentPlan = initialPlan;
  let currentQuery = query;
  let iteration = 0;
  let lastEvaluation = { confidence: 0, completeness: 0, shouldRetry: true, reason: 'Initial' };

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // Phase 113: On second iteration, try graph-aware query expansion to improve recall
    if (iteration === 2 && lastEvaluation.confidence < REVISION_THRESHOLD) {
      try {
        const expanded = await expandQueryWithGraphContext(query, context);
        if (expanded !== query) {
          currentQuery = expanded;
          logger.debug('A-RAG graph-expanded query', {
            iteration,
            original: query,
            expanded: currentQuery,
          });
        }
      } catch {
        // Non-fatal: continue with original query
      }
    }

    logger.debug('A-RAG iteration starting', {
      iteration,
      planSteps: currentPlan.steps.length,
      existingResults: allResults.length,
      qualityGate: { earlyExit: EARLY_EXIT_CONFIDENCE, reformulate: REVISION_THRESHOLD },
    });

    // Execute plan steps
    const stepResults = await executePlanSteps(currentPlan.steps, context, allResults);

    // Merge step results
    for (const { results: newResults, iface, durationMs } of stepResults) {
      allResults = mergeResults(allResults, newResults);
      interfacesUsed.add(iface);
      stepTimings.push({ interface: iface, durationMs });
    }

    // Evaluate results using the current (possibly expanded) query for term coverage
    lastEvaluation = evaluateResults(currentQuery, allResults);

    logger.debug('A-RAG evaluation (quality gate)', {
      iteration,
      confidence: lastEvaluation.confidence,
      completeness: lastEvaluation.completeness,
      shouldRetry: lastEvaluation.shouldRetry,
      resultCount: allResults.length,
      reason: lastEvaluation.reason,
      qualityGate: {
        earlyExit: EARLY_EXIT_CONFIDENCE,
        reformulate: REVISION_THRESHOLD,
        willExit: lastEvaluation.confidence >= EARLY_EXIT_CONFIDENCE,
        willReformulate: lastEvaluation.confidence < REVISION_THRESHOLD && iteration < MAX_ITERATIONS,
      },
    });

    // Phase 113: Early exit when quality gate threshold (0.8) is met
    if (lastEvaluation.confidence >= EARLY_EXIT_CONFIDENCE) {
      logger.info('A-RAG quality gate: early exit on high confidence', {
        iteration,
        confidence: lastEvaluation.confidence,
        threshold: EARLY_EXIT_CONFIDENCE,
      });
      break;
    }

    // Check if we should retry
    if (!lastEvaluation.shouldRetry || iteration >= MAX_ITERATIONS) {
      break;
    }

    // Phase 113: Quality gate — reformulate query and get a revised plan when confidence < 0.5
    if (lastEvaluation.confidence < REVISION_THRESHOLD) {
      logger.info('A-RAG quality gate: reformulating query due to low confidence', {
        iteration,
        confidence: lastEvaluation.confidence,
        threshold: REVISION_THRESHOLD,
        expandedQuery: currentQuery !== query,
      });

      try {
        // Exclude already-used interfaces to try new approaches
        const unusedInterfaces = ALL_INTERFACES.filter(i => !interfacesUsed.has(i));
        const revisedPlan = unusedInterfaces.length > 0
          ? await planRetrieval(currentQuery, context, unusedInterfaces)
          : buildDefaultPlan(currentQuery, ALL_INTERFACES);

        currentPlan = revisedPlan;

        logger.debug('A-RAG strategy revised', {
          iteration,
          newSteps: revisedPlan.steps.map(s => s.interface),
          queryUsed: currentQuery,
        });
      } catch {
        // If revision fails, build a simple fallback plan with unused interfaces
        const unused = ALL_INTERFACES.filter(i => !interfacesUsed.has(i));
        if (unused.length > 0) {
          currentPlan = buildDefaultPlan(currentQuery, unused);
        } else {
          break; // Nothing left to try
        }
      }
    }
  }

  const totalTimeMs = Date.now() - startTime;

  return {
    result: {
      results: allResults,
      confidence: lastEvaluation.confidence,
      completeness: lastEvaluation.completeness,
    },
    metadata: {
      totalTimeMs,
      iterations: iteration,
      interfacesUsed: Array.from(interfacesUsed),
      stepTimings,
      usedStrategyAgent: true,
      queryType: initialPlan.queryType,
    },
  };
}

/**
 * Execute plan steps, respecting dependency ordering.
 * Steps without dependencies run in parallel.
 * Steps with dependencies wait for their prerequisite.
 */
async function executePlanSteps(
  steps: RetrievalStep[],
  context: AIContext,
  existingResults: RetrievalResultItem[]
): Promise<Array<{ results: RetrievalResultItem[]; iface: RetrievalInterface; durationMs: number }>> {
  const completed: Array<{ results: RetrievalResultItem[]; iface: RetrievalInterface; durationMs: number }> = [];

  // Group steps by dependency level
  const independent = steps.filter(s => s.dependsOn === undefined);
  const dependent = steps.filter(s => s.dependsOn !== undefined);

  // Execute independent steps in parallel
  if (independent.length > 0) {
    const parallelResults = await Promise.all(
      independent.map(async (step) => {
        const stepStart = Date.now();
        try {
          const results = await executeStep(step, context, existingResults);
          return {
            results,
            iface: step.interface,
            durationMs: Date.now() - stepStart,
          };
        } catch (error) {
          logger.debug('A-RAG step failed', {
            interface: step.interface,
            error: error instanceof Error ? error.message : 'Unknown',
          });
          return {
            results: [] as RetrievalResultItem[],
            iface: step.interface,
            durationMs: Date.now() - stepStart,
          };
        }
      })
    );
    completed.push(...parallelResults);
  }

  // Execute dependent steps sequentially
  for (const step of dependent) {
    const stepStart = Date.now();
    try {
      // Merge all completed results for the dependent step to use
      const allCompleted = completed.flatMap(c => c.results);
      const combinedExisting = mergeResults(existingResults, allCompleted);
      const results = await executeStep(step, context, combinedExisting);
      completed.push({
        results,
        iface: step.interface,
        durationMs: Date.now() - stepStart,
      });
    } catch (error) {
      logger.debug('A-RAG dependent step failed', {
        interface: step.interface,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      completed.push({
        results: [],
        iface: step.interface,
        durationMs: Date.now() - stepStart,
      });
    }
  }

  return completed;
}
