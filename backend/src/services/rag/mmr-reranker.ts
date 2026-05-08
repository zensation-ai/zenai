/**
 * MMR Reranker — Maximal Marginal Relevance.
 *
 * Phase H sprint reference: spec § H2 task 6 (MMR diversification,
 * Carbonell & Goldstein 1998, SIGIR).
 *
 * Problem
 * -------
 * Plain top-K by relevance score returns K results that are often near-
 * duplicates of each other (same fact in different paraphrases, same
 * source mentioned multiple times). For LoCoMo Cat 1 (Multi-Hop) the
 * answer often requires *different* evidence facts — a list of K
 * paraphrases of one fact gives the model nothing new past the first.
 *
 * What MMR does
 * -------------
 * Greedy iterative selection that, at each step, picks the candidate
 * maximising the trade-off:
 *
 *     mmr(d) = λ · relevance(d, query) − (1 − λ) · max_{s ∈ selected} sim(d, s)
 *
 * λ ∈ [0, 1]:
 *   - λ = 1.0 → pure relevance (same as top-K, MMR is a no-op)
 *   - λ = 0.0 → pure diversity (most-different from already-selected)
 *   - λ = 0.5 → balanced (the standard SIGIR-1998 default)
 *
 * The function `relevance(d, query)` is precomputed and passed in on
 * each candidate. The function `sim(d, s)` between two items is
 * supplied by the caller — it can be cosine similarity over embeddings,
 * Jaccard over keyword sets, or any custom predicate. Keeping it
 * caller-supplied keeps this module dependency-free.
 *
 * Why standalone (vs. inlining in adaptive-retrieval.ts)
 * ------------------------------------------------------
 * MMR is a generic reranking primitive. Its callers are not just the
 * RAG retrieval path — H2.7 (Coverage-Aware Fact-Extraction) and the
 * H4 4-network cross-network composer will both want to apply it.
 * A standalone module with a callback-based similarity stays composable.
 *
 * Complexity
 * ----------
 *   - O(K · N) similarity calls — for each of K selected positions, we
 *     check the remaining N − selected candidates. With cached pairwise
 *     similarities this drops to O(K · N) lookups.
 *   - Use `precomputePairwiseSimilarity` when N is large and your
 *     similarity function is expensive (e.g. embedding-based).
 *
 * @module services/rag/mmr-reranker
 */

// ===========================================================================
// Types
// ===========================================================================

/** A candidate for reranking: an item plus its query-relevance score. */
export interface MMRItem<T> {
  /** Whatever the retriever returned. The reranker is content-agnostic. */
  item: T;
  /** Query-relevance score in [0, 1]. Higher = more relevant. Caller is
   *  responsible for normalising scores into a comparable range across
   *  candidates — MMR's diversity term assumes the relevance values are
   *  on the same scale as the similarity values. */
  relevance: number;
}

/** Caller-supplied pairwise similarity in [0, 1]. */
export type MMRSimilarity<T> = (a: T, b: T) => number;

export interface MMROptions<T> {
  /** Lambda in [0, 1]. Default 0.5. */
  lambda?: number;
  /** How many items to keep. Default = candidates.length (full rerank). */
  k?: number;
  /** Pairwise similarity function. Required. */
  similarity: MMRSimilarity<T>;
  /** Stable-id extractor for caching pairwise sims and dedup. Defaults
   *  try `(item as any).id`, then JSON-stringify, then String(item). */
  itemId?: (item: T) => string;
}

// ===========================================================================
// Defaults & helpers
// ===========================================================================

const DEFAULT_LAMBDA = 0.5;

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
// Core rerank
// ===========================================================================

/**
 * Greedy MMR rerank. Returns up to `k` items in selection order.
 *
 * Notes:
 *   - Throws when `lambda` is outside [0, 1].
 *   - Empty / missing candidates → returns []. Single candidate is a
 *     trivial 1-item return.
 *   - `relevance` < 0 is allowed (some retrievers report distance instead
 *     of similarity); the reranker does not normalise.
 *   - Duplicate item IDs in input are deduped: only the first occurrence
 *     is considered. Caller controls this via `itemId`.
 */
export function mmrRerank<T>(
  candidates: ReadonlyArray<MMRItem<T>>,
  options: MMROptions<T>,
): MMRItem<T>[] {
  const lambda = options.lambda ?? DEFAULT_LAMBDA;
  if (lambda < 0 || lambda > 1) {
    throw new Error(`mmrRerank: lambda must be in [0, 1]; got ${lambda}`);
  }
  const itemId = options.itemId ?? defaultItemId;
  const sim = options.similarity;
  const k = options.k ?? candidates.length;
  if (k <= 0) return [];

  // Dedup by id (first occurrence wins).
  const seen = new Set<string>();
  const pool: Array<{ id: string; cand: MMRItem<T> }> = [];
  for (const c of candidates) {
    const id = itemId(c.item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    pool.push({ id, cand: c });
  }
  if (pool.length === 0) return [];

  const selected: Array<{ id: string; cand: MMRItem<T> }> = [];
  // Pairwise similarity cache (keyed by sorted id pair).
  const simCache = new Map<string, number>();
  const cachedSim = (aId: string, bId: string, a: T, b: T): number => {
    const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    const hit = simCache.get(key);
    if (hit !== undefined) return hit;
    const v = sim(a, b);
    simCache.set(key, v);
    return v;
  };

  // Pick the highest-relevance item first (with stable tie-break by id
  // so output is deterministic across runs).
  pool.sort((a, b) => {
    if (b.cand.relevance !== a.cand.relevance) return b.cand.relevance - a.cand.relevance;
    return a.id.localeCompare(b.id);
  });
  selected.push(pool.shift()!);

  while (selected.length < k && pool.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      let maxSimToSelected = 0;
      for (const s of selected) {
        const sv = cachedSim(cand.id, s.id, cand.cand.item, s.cand.item);
        if (sv > maxSimToSelected) maxSimToSelected = sv;
      }
      const mmrScore = lambda * cand.cand.relevance - (1 - lambda) * maxSimToSelected;
      // Tie-break: prefer original-rank order (lower index = higher relevance,
      // already sorted). When mmrScore is exactly equal, the lower-index
      // candidate wins — bestScore strict-greater-than test enforces this.
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break; // Defensive — shouldn't happen.
    selected.push(pool.splice(bestIdx, 1)[0]);
  }

  return selected.map((s) => s.cand);
}

// ===========================================================================
// Helper: precompute pairwise similarity matrix
// ===========================================================================

/**
 * For very large candidate lists or expensive similarity functions, the
 * caller can precompute the full pairwise matrix once and wrap it in a
 * cheap lookup. Returns a similarity function that does O(1) lookups
 * by item id.
 *
 * Usage:
 *   const cachedSim = precomputePairwiseSimilarity(items, embeddingCosine);
 *   mmrRerank(candidates, { similarity: cachedSim, itemId, ... });
 */
export function precomputePairwiseSimilarity<T>(
  items: ReadonlyArray<T>,
  similarity: MMRSimilarity<T>,
  itemId: (item: T) => string = defaultItemId,
): MMRSimilarity<T> {
  const matrix = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const idI = itemId(items[i]);
    for (let j = i; j < items.length; j++) {
      const idJ = itemId(items[j]);
      const key = idI < idJ ? `${idI}|${idJ}` : `${idJ}|${idI}`;
      matrix.set(key, i === j ? 1.0 : similarity(items[i], items[j]));
    }
  }
  return (a, b) => {
    const idA = itemId(a);
    const idB = itemId(b);
    const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
    const hit = matrix.get(key);
    if (hit !== undefined) return hit;
    // Fall back to live computation if the pair wasn't precomputed.
    return similarity(a, b);
  };
}

// ===========================================================================
// Convenience: cosine similarity for embedding vectors
// ===========================================================================

/** Cosine similarity in [-1, 1] for two equal-length numeric vectors.
 *  Returns 0 on length mismatch or zero-vector input. The MMR contract
 *  expects similarity in [0, 1]; callers that pass embeddings often
 *  clamp negatives to 0 first — this helper does NOT clamp so the raw
 *  signal is preserved when the caller wants it. */
export function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
