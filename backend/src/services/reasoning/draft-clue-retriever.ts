/**
 * Draft-Clue Retriever — MemoRAG-style dual retrieval.
 *
 * Phase H sprint reference: spec § H2 task 2 (MemoRAG, arXiv:2409.05591).
 *
 * Why this exists
 * ---------------
 * Standard retrieval uses the QUESTION as the only retrieval seed.
 * That works when the question shares vocabulary with the relevant
 * memory text — but LoCoMo Cat 1 (Multi-Hop) questions often don't.
 * Example:
 *
 *   question: "Who graduated from Stanford in 2018?"
 *   memory:   "Caroline finished her Master's at Stanford with honors.
 *              May 2018."
 *
 * The question's vocabulary ("graduated", "Stanford", "2018") only
 * partially overlaps with the memory's wording ("finished", "Master's",
 * "Stanford", "May 2018"). Embedding-based retrieval CAN bridge this
 * gap, but the gap is wide enough that recall suffers.
 *
 * What MemoRAG (arXiv:2409.05591) does
 * ------------------------------------
 * Generate a HYPOTHETICAL ANSWER to the question, then use it as a
 * SECOND retrieval seed. The hypothetical answer is full prose — not
 * just keywords (HyDE) — so it shares far more vocabulary surface with
 * the eventual matching memory than the bare question does.
 *
 *   draft answer: "Caroline graduated from Stanford in 2018 with a
 *                  Master's degree, finishing with honors that May."
 *
 * That draft has both the question's terms AND the memory's terms.
 * Retrieval seeded with `(query, draft)` pulls from both clusters and
 * rank-fuses the results.
 *
 * MemoRAG vs HyDE
 * ---------------
 * HyDE (Hypothetical Document Embeddings, Gao et al. 2022) generates a
 * synthetic DOCUMENT-style passage. MemoRAG generates a full ANSWER.
 * Different prompt shape, different vocabulary distribution. The two
 * are compatible — a future enhancement could run both in parallel and
 * fuse three streams (query + HyDE-doc + MemoRAG-draft).
 *
 * Why standalone (vs. inlining in adaptive-retrieval.ts)
 * ------------------------------------------------------
 * Pure pipeline: takes a query, an LLM callback, and a retriever
 * callback; returns fused hits. No DB, no I/O of its own. The callbacks
 * are injected so the algorithm is trivially testable with stubs and
 * works against any retrieval surface (KG, RAG, hybrid, etc.).
 *
 * Performance
 * -----------
 * Cost is one LLM call (the draft generation) + two retrieval calls
 * (query + draft, in parallel). The draft generation can use a small
 * cheap model (gpt-4o-mini works well per the MemoRAG paper) since
 * the draft only needs to be VOCABULARY-PLAUSIBLE, not factually
 * correct. Retrieval then re-anchors against ground-truth.
 *
 * Score fusion
 * ------------
 * Reciprocal Rank Fusion (RRF, Cormack/Clarke/Buettcher 2009) with the
 * standard k=60 — same constant as `synthesis-engine.ts` and
 * `algorithms/temporal-multi-route.ts` so all three modules are
 * directly comparable. Optional `draftWeight` lets the caller
 * down-weight the draft route if early empirical results show it's
 * noisier than the question route on a given corpus.
 *
 * @module services/reasoning/draft-clue-retriever
 */

// ===========================================================================
// Verbatim draft-generation prompt
// ===========================================================================

/**
 * The MemoRAG draft-answer prompt. Kept as a top-level export so the
 * eval harness can compare prompts byte-for-byte the same way the H0
 * verbatim-prompt verification does. Variable `{{query}}` substituted
 * via `String.replace`.
 *
 * The MemoRAG paper (arXiv:2409.05591) does not publish a single
 * canonical prompt — their open-source repo uses several variants. The
 * version below distills the common structure: ask the model to
 * confidently invent a plausible answer, prioritising vocabulary
 * coverage over factual correctness, in 1–3 sentences.
 *
 * Edit only with intent: changes here change empirical retrieval
 * behaviour and should be commented in the diff.
 */
export const MEMORAG_DRAFT_PROMPT =
  'You are about to draft a hypothetical answer to a question. The ' +
  'answer will be used purely as a retrieval seed — it does NOT need ' +
  'to be factually correct, and you do NOT have to know the truth. ' +
  'Your goal is to write a plausible, vocabulary-rich answer that uses ' +
  'the kinds of words and phrasing that the true answer would likely ' +
  'use, in 1–3 sentences. Output the answer text only — no preamble, ' +
  'no caveats, no "I don\'t know" disclaimers.\n\n' +
  'Question: {{query}}\n\nAnswer:';

// ===========================================================================
// Types
// ===========================================================================

/** A generic retrieval hit — re-defined here to keep this module
 *  dependency-free. Callers convert their own retrieval shape into this. */
export interface RetrievalHit<T> {
  item: T;
  /** Retriever-internal score (cosine, BM25, etc.). Used for tie-break. */
  score: number;
}

/** Async LLM callback. Caller wires this to whatever transport (Anthropic,
 *  OpenAI, Mistral, Ollama, ...). */
export type DraftLLM = (prompt: string) => Promise<string>;

/** Async retriever callback. Same query string in both calls (the
 *  algorithm calls it twice — once with the question, once with the
 *  generated draft). */
export type DraftRetriever<T> = (queryText: string) => Promise<RetrievalHit<T>[]>;

export interface DraftClueOptions<T> {
  /** RRF-K constant. Default 60 (Cormack/Clarke/Buettcher 2009). */
  rrfK?: number;
  /** Multiplier on the draft route's RRF contribution. Default 1.0
   *  (equal weight). Set < 1 to down-weight a noisy draft route. */
  draftWeight?: number;
  /** Stable-id extractor for items, used to merge hits across the two
   *  retrieval routes. Defaults try `.id`, then JSON-stringify. */
  itemId?: (item: T) => string;
  /** Cap on returned hits. Default: no cap. */
  maxHits?: number;
}

export interface DraftClueResult<T> {
  /** The draft answer the LLM generated. Useful for logging / debugging. */
  draft: string;
  /** Per-route raw hits (before fusion). */
  perRoute: {
    query: RetrievalHit<T>[];
    draft: RetrievalHit<T>[];
  };
  /** Fused hits, sorted by RRF score descending. */
  fused: Array<{
    item: T;
    /** RRF score (post draft-weight). */
    score: number;
    /** Which routes the item appeared in. */
    contributingRoutes: ReadonlyArray<'query' | 'draft'>;
  }>;
}

// ===========================================================================
// Defaults & helpers
// ===========================================================================

const DEFAULT_RRF_K = 60;
const DEFAULT_DRAFT_WEIGHT = 1.0;

function defaultItemId(item: unknown): string {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    const o = item as Record<string, unknown>;
    if (typeof o.id === 'string') return o.id;
    if (typeof o.id === 'number') return String(o.id);
  }
  try { return JSON.stringify(item); }
  catch { return String(item); }
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Run MemoRAG-style dual retrieval: generate a draft answer, retrieve
 * with both the original query and the draft, fuse via RRF.
 *
 * Behaviour:
 *   - The two retrieval calls are launched in parallel (Promise.all).
 *   - On LLM failure: the exception propagates (caller decides whether
 *     to fall back to query-only retrieval). We don't silently degrade
 *     because that would make a non-MemoRAG run masquerade as MemoRAG
 *     in the eval log.
 *   - Empty draft (LLM returned ""): the algorithm falls back to
 *     query-only retrieval and reports `draft: ""` in the result so
 *     callers can detect the degenerate case.
 *
 * @throws when `llm` rejects.
 */
export async function memoRAGDraftClueRetrieve<T>(
  query: string,
  llm: DraftLLM,
  retriever: DraftRetriever<T>,
  options: DraftClueOptions<T> = {},
): Promise<DraftClueResult<T>> {
  const trimmedQuery = String(query ?? '').trim();
  if (!trimmedQuery) {
    throw new Error('memoRAGDraftClueRetrieve: query must be a non-empty string');
  }

  // 1. Generate the draft answer.
  const draftPrompt = MEMORAG_DRAFT_PROMPT.replace('{{query}}', trimmedQuery);
  const rawDraft = await llm(draftPrompt);
  const draft = String(rawDraft ?? '').trim();

  // 2. Dual retrieval — parallel.
  const [queryHits, draftHits] = await Promise.all([
    retriever(trimmedQuery),
    draft ? retriever(draft) : Promise.resolve([] as RetrievalHit<T>[]),
  ]);

  // 3. Fuse.
  const fused = fuseTwoRoutes(
    queryHits,
    draftHits,
    {
      rrfK: options.rrfK ?? DEFAULT_RRF_K,
      draftWeight: options.draftWeight ?? DEFAULT_DRAFT_WEIGHT,
      itemId: (options.itemId ?? defaultItemId) as (item: T) => string,
    },
  );
  const cap = options.maxHits;

  return {
    draft,
    perRoute: { query: queryHits, draft: draftHits },
    fused: cap !== undefined ? fused.slice(0, cap) : fused,
  };
}

// ===========================================================================
// Fusion (RRF, kept local — different shape from temporal-multi-route's
// per-route-confidence-weighted variant)
// ===========================================================================

interface FuseOpts<T> {
  rrfK: number;
  draftWeight: number;
  itemId: (item: T) => string;
}

function fuseTwoRoutes<T>(
  queryHits: ReadonlyArray<RetrievalHit<T>>,
  draftHits: ReadonlyArray<RetrievalHit<T>>,
  opts: FuseOpts<T>,
): DraftClueResult<T>['fused'] {
  type Bucket = {
    item: T;
    score: number;
    routes: Set<'query' | 'draft'>;
    bestRetrieverScore: number;
  };
  const buckets = new Map<string, Bucket>();

  const addRoute = (
    hits: ReadonlyArray<RetrievalHit<T>>,
    route: 'query' | 'draft',
    weight: number,
  ): void => {
    if (hits.length === 0) return;
    const ranked = hits.slice().sort((a, b) => b.score - a.score);
    for (let r = 0; r < ranked.length; r++) {
      const hit = ranked[r];
      const id = opts.itemId(hit.item);
      if (!id) continue;
      const contribution = weight / (opts.rrfK + r + 1);
      const existing = buckets.get(id);
      if (existing) {
        existing.score += contribution;
        existing.routes.add(route);
        if (hit.score > existing.bestRetrieverScore) existing.bestRetrieverScore = hit.score;
      } else {
        buckets.set(id, {
          item: hit.item,
          score: contribution,
          routes: new Set([route]),
          bestRetrieverScore: hit.score,
        });
      }
    }
  };

  addRoute(queryHits, 'query', 1.0);
  addRoute(draftHits, 'draft', opts.draftWeight);

  return Array.from(buckets.values())
    .map((b) => ({
      item: b.item,
      score: b.score,
      contributingRoutes: Array.from(b.routes).sort() as ReadonlyArray<'query' | 'draft'>,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break by id for determinism.
      return opts.itemId(a.item).localeCompare(opts.itemId(b.item));
    });
}
