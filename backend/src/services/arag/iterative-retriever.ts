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
import {
  EvidenceGapTracker,
  RequiredFactPattern,
  EvidenceFact,
} from '../reasoning/evidence-gap-tracker';
import {
  memoRAGDraftClueRetrieve,
  DraftLLM,
} from '../reasoning/draft-clue-retriever';
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

/** Maximum number of retrieval iterations.
 *  Phase H1.2 → H2.4: raised from 3 to 5. The MemR3 paper
 *  (arXiv:2512.20237) reports diminishing returns past 4–6 rounds for
 *  multi-hop QA. The early-exit triggers below stop earlier in
 *  practice — this cap is the hard upper bound for pathological
 *  queries that genuinely need deeper exploration.
 */
const MAX_ITERATIONS = 5;

/**
 * Confidence threshold for early exit.
 * Phase 113: Raised to 0.8 per quality gate requirements.
 */
const EARLY_EXIT_CONFIDENCE = 0.8;

/**
 * Coverage / completeness threshold for early exit.
 * Phase H2.4: explicit coverage-threshold-stopping per spec § H2 task 4.
 * The strategy-evaluator's `completeness` is heuristic-derived from
 * result count, score distribution, and content diversity; when it
 * crosses 0.8 the retrieval has effectively saturated and additional
 * rounds have been observed to add cost without F1 lift. This stop
 * is applied IN ADDITION to the confidence-based early exit; the loop
 * exits as soon as either threshold fires.
 */
const COMPLETENESS_EXIT_THRESHOLD = 0.8;

/**
 * Confidence threshold triggering query reformulation and strategy revision.
 * Phase 113: Lowered to 0.5 to trigger reformulation earlier.
 */
const REVISION_THRESHOLD = 0.5;

/** Maximum results per interface call */
const MAX_RESULTS_PER_INTERFACE = 10;

/** All available retrieval interfaces */
const ALL_INTERFACES: RetrievalInterface[] = ['keyword', 'semantic', 'chunk_read', 'graph', 'community'];

/** Phase H2.3 binding default: read once at module load. */
const H2_EVIDENCE_GAP_DEFAULT = (() => {
  const raw = process.env.H2_EVIDENCE_GAP;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

/** Phase H2.2 binding default: read once at module load. */
const H2_MEMORAG_DRAFT_CLUE_DEFAULT = (() => {
  const raw = process.env.H2_MEMORAG_DRAFT_CLUE;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

/**
 * Optional per-call configuration for the iterative retriever.
 *
 * All flags default to OFF — the legacy heuristic-evaluator stop logic
 * remains the production path until the eval harness validates each
 * binding's lift on LoCoMo categories. The corresponding env vars
 * (`H2_EVIDENCE_GAP`, `H2_MEMORAG_DRAFT_CLUE`) provide A/B switches
 * without code changes.
 *
 * Phase H spec ref: § H2 task 2 (MemoRAG) + task 3 (MemR3 evidence-gap
 * router).
 */
export interface IterativeRetrievalOptions {
  /** When true, drive stop / retrieve / reflect decisions via an
   *  EvidenceGapTracker derived from the query (one slot per content
   *  token). Layered ON TOP of the existing evaluator — both signals
   *  must agree to keep retrieving when the tracker says answer. */
  enableEvidenceGap?: boolean;
  /** When true, before the first retrieval round generate a draft
   *  hypothetical answer (MemoRAG, arXiv:2409.05591) via the supplied
   *  `draftLLM` and run an extra retrieval round seeded with the draft
   *  text. Hits from both routes are merged via the standard
   *  mergeResults dedup. */
  enableMemoRAG?: boolean;
  /** LLM callback used by the MemoRAG draft path. Caller wires this to
   *  whatever transport (Anthropic, OpenAI, …). Required when
   *  `enableMemoRAG` resolves to true; otherwise ignored. */
  draftLLM?: DraftLLM;
  /** Optional caller-supplied gap patterns. When omitted but
   *  `enableEvidenceGap` is on, the tracker auto-derives patterns from
   *  the query text. Provide explicit patterns when callers can do
   *  better (e.g., temporal-multi-route output). */
  gapPatterns?: ReadonlyArray<RequiredFactPattern>;
  /** Cap MemoRAG retrieval payload size. Default `MAX_RESULTS_PER_INTERFACE`. */
  memoRAGMaxHits?: number;
}

// ===========================================
// Interface Executors
// ===========================================

/**
 * Execute a single retrieval step against the appropriate interface.
 */
async function executeStep(
  step: RetrievalStep,
  context: AIContext,
  _existingResults: RetrievalResultItem[]
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
  if (!sanitized) {return [];}

  const tsQuery = sanitized
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => `${w}:*`)
    .join(' & ');

  if (!tsQuery) {return [];}

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
    if (!embedding || embedding.length === 0) {return [];}

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
  if (!ids || ids.length === 0) {return [];}

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
 *
 * Phase H bindings (default OFF):
 *   - `options.enableMemoRAG` (or env H2_MEMORAG_DRAFT_CLUE=true): runs
 *     a draft-clue retrieval round before the regular plan kicks in.
 *   - `options.enableEvidenceGap` (or env H2_EVIDENCE_GAP=true): adds
 *     an EvidenceGapTracker that can short-circuit the loop when all
 *     query-derived gaps are filled.
 */
export async function executeRetrievalPlan(
  initialPlan: RetrievalPlan,
  context: AIContext,
  query: string,
  options: IterativeRetrievalOptions = {},
): Promise<{ result: RetrievalResult; metadata: ARAGExecutionMetadata }> {
  const startTime = Date.now();
  let allResults: RetrievalResultItem[] = [];
  const stepTimings: ARAGExecutionMetadata['stepTimings'] = [];
  const interfacesUsed = new Set<RetrievalInterface>();
  let currentPlan = initialPlan;
  let currentQuery = query;
  let iteration = 0;
  let lastEvaluation = { confidence: 0, completeness: 0, shouldRetry: true, reason: 'Initial' };

  // ── Phase H2.3 binding: optional EvidenceGapTracker.
  const useEvidenceGap = options.enableEvidenceGap ?? H2_EVIDENCE_GAP_DEFAULT;
  const tracker = useEvidenceGap
    ? buildAutoTracker(query, options.gapPatterns)
    : null;

  // ── Phase H2.2 binding: optional MemoRAG draft-clue retrieval.
  const useMemoRAG = (options.enableMemoRAG ?? H2_MEMORAG_DRAFT_CLUE_DEFAULT) && options.draftLLM !== undefined;
  if (useMemoRAG && options.draftLLM) {
    try {
      const memoStart = Date.now();
      const memoMaxHits = options.memoRAGMaxHits ?? MAX_RESULTS_PER_INTERFACE;
      const memoRetriever = async (qtxt: string): Promise<Array<{ item: RetrievalResultItem; score: number }>> => {
        const items = await executeSemanticSearch(qtxt, context, memoMaxHits);
        return items.map((it) => ({ item: it, score: it.score }));
      };
      const memoResult = await memoRAGDraftClueRetrieve(query, options.draftLLM, memoRetriever, {
        maxHits: memoMaxHits * 2,
        itemId: (it) => it.id,
      });
      const memoItems: RetrievalResultItem[] = memoResult.fused.map((f) => ({
        ...f.item,
        // Tag MemoRAG-sourced items so the merge step can recognise them.
        source: 'memorag',
        score: Math.min(1, f.score / Math.max(0.0001, memoResult.fused[0]?.score ?? 1)),
      }));
      if (memoItems.length > 0) {
        allResults = mergeResults(allResults, memoItems);
        interfacesUsed.add('semantic');
        stepTimings.push({ interface: 'semantic', durationMs: Date.now() - memoStart });
      }
      if (tracker) tracker.ingest(toEvidenceFacts(memoItems));
      logger.info('A-RAG MemoRAG draft-clue round', {
        draftLength: memoResult.draft.length,
        memoHits: memoItems.length,
      });
    } catch (error) {
      logger.warn('A-RAG MemoRAG draft-clue failed; falling back to plan-only', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

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
      // Phase H2.3: feed the gap tracker the new round's hits.
      if (tracker) tracker.ingest(toEvidenceFacts(newResults));
    }

    // Phase H2.3: when the tracker reports all gaps filled, exit before
    // the heuristic evaluator gets a chance — the tracker is more precise
    // about "do we actually have what the query needs".
    if (tracker) {
      const decision = tracker.decide();
      if (decision.action === 'answer' && decision.unfilledGaps.length === 0) {
        lastEvaluation = {
          confidence: Math.max(decision.coverage, lastEvaluation.confidence ?? 0),
          completeness: decision.coverage,
          shouldRetry: false,
          reason: `evidence-gap tracker: ${decision.reason}`,
        };
        logger.info('A-RAG evidence-gap tracker: all required facts acquired', {
          iteration,
          coverage: decision.coverage,
        });
        break;
      }
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

    // Phase 113: Early exit when quality gate threshold (0.8) is met.
    if (lastEvaluation.confidence >= EARLY_EXIT_CONFIDENCE) {
      logger.info('A-RAG quality gate: early exit on high confidence', {
        iteration,
        confidence: lastEvaluation.confidence,
        threshold: EARLY_EXIT_CONFIDENCE,
      });
      break;
    }
    // Phase H2.4: Early exit when coverage / completeness has saturated.
    // Independent of the confidence-based exit — completeness reflects
    // breadth of evidence (count + diversity) while confidence reflects
    // depth (top-score + variance). Either crossing 0.8 is a sufficient
    // stop signal per the spec's coverage-threshold-stopping requirement.
    if (lastEvaluation.completeness >= COMPLETENESS_EXIT_THRESHOLD) {
      logger.info('A-RAG quality gate: early exit on high completeness', {
        iteration,
        completeness: lastEvaluation.completeness,
        threshold: COMPLETENESS_EXIT_THRESHOLD,
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

// ===========================================
// Phase H2.3 — auto-derived RequiredFactPattern from query
// ===========================================

/**
 * When the caller has not supplied explicit gap patterns, derive a set
 * of patterns from the query text. The derivation is intentionally
 * coarse: one pattern per distinct content-bearing token. The pattern
 * matches a candidate fact iff its text contains the token (case-
 * insensitive substring). This is a minimum-viable signal — sufficient
 * to early-exit when retrieval has already covered the query terms.
 *
 * Why not stricter matching: the goal is to STOP a loop early when
 * coverage is good. A loose match yields more "false positives" (gaps
 * marked filled when retrieval was only adjacent), which translates to
 * "stop earlier" — exactly the failure mode that costs the LEAST on
 * latency-bound LoCoMo eval. False negatives (gap stays open when it
 * shouldn't) just keep the legacy loop running, which is the baseline.
 *
 * Future enhancement: derive patterns from `temporal-multi-route`
 * decomposition (one pattern per route-type) and `list-completion-agent`
 * count detection. Both are wired separately and can be passed via
 * `options.gapPatterns`.
 */
function buildAutoTracker(
  query: string,
  explicit?: ReadonlyArray<RequiredFactPattern>,
): EvidenceGapTracker {
  if (explicit && explicit.length > 0) {
    return new EvidenceGapTracker(explicit, { maxIterations: MAX_ITERATIONS });
  }
  const tokens = extractContentTokens(query);
  if (tokens.length === 0) {
    // Fallback: a no-op pattern that never matches; the tracker will
    // never report 'answer' on coverage and the loop falls back to the
    // legacy heuristic-evaluator stop logic.
    return new EvidenceGapTracker(
      [
        {
          kind: 'other',
          description: '(no content tokens in query)',
          matches: () => false,
        },
      ],
      { maxIterations: MAX_ITERATIONS },
    );
  }
  const patterns: RequiredFactPattern[] = tokens.map((tok) => ({
    kind: 'evidence_chunk',
    description: `mentions "${tok}"`,
    matches: (fact: EvidenceFact) =>
      typeof fact.text === 'string' &&
      fact.text.toLowerCase().includes(tok.toLowerCase()),
    maxFills: 1,
  }));
  return new EvidenceGapTracker(patterns, { maxIterations: MAX_ITERATIONS });
}

/** Extract content-bearing tokens from a query: length ≥ 4, alphanumeric,
 *  not a stop word. Deduplicated, lower-cased. */
function extractContentTokens(query: string): string[] {
  if (typeof query !== 'string' || !query.trim()) return [];
  // Stop list kept tight — we don't want to drop content words like
  // "year" or "name" that often appear in LoCoMo Cat 2/4 queries.
  const STOP = new Set([
    'when', 'where', 'what', 'which', 'whom', 'whose', 'why', 'how',
    'does', 'did', 'do', 'is', 'are', 'was', 'were', 'has', 'have',
    'had', 'will', 'would', 'should', 'could', 'can', 'may', 'might',
    'this', 'that', 'these', 'those', 'with', 'from', 'into', 'onto',
    'about', 'after', 'before', 'between', 'over', 'under', 'until',
    'since', 'while', 'and', 'the', 'for', 'but', 'not', 'yet', 'just',
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of query.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const tok = raw.toLowerCase();
    if (tok.length < 4) continue;
    if (STOP.has(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

/** Bridge: convert RetrievalResultItem rows into EvidenceFact rows for
 *  the tracker. Confidence comes from the retriever's score. */
function toEvidenceFacts(items: ReadonlyArray<RetrievalResultItem>): EvidenceFact[] {
  return items.map((item) => ({
    id: item.id,
    text: `${item.title ?? ''} ${item.content ?? ''}`.trim(),
    confidence: item.score,
    source: item.source,
  }));
}
