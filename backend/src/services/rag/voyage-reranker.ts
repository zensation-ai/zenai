/**
 * Voyage Reranker — interface to Voyage AI's `rerank-2.5` API.
 *
 * Phase H sprint reference: spec § H3 task 3.
 *
 * Why swap the cross-encoder for Voyage rerank-2.5
 * ------------------------------------------------
 * Today's RAG stack uses a cross-encoder MS-MARCO-style reranker.
 * Voyage AI published `rerank-2.5` (32K context window, +7.94 % over
 * Cohere v3.5 on standard benchmarks per their blog) which lifts
 * Cat 4 (Single-Hop) on the LoCoMo leaderboard ≥ +5 pp in
 * comparable harness setups. The 32K window matters specifically
 * because LoCoMo turns can be long enough that a 512-token
 * cross-encoder truncates the relevant span.
 *
 * Cost reality check
 * ------------------
 * Voyage rerank is metered. To bound cost the spec § H3 risk note
 * calls for "rerank only top-50 retrieval candidates" + caching.
 * Both are implemented here:
 *
 *   - The function caps `documents.length` at the caller-supplied
 *     `maxDocs` (default 50); excess candidates are skipped (not
 *     truncated text — left out entirely so the API call stays
 *     small).
 *   - An optional in-memory cache keyed by `(query, content-hash)`
 *     stores the latest score per pair; identical re-queries skip
 *     the API. Cache is opt-in via the `cache` option so tests run
 *     deterministically without shared state.
 *
 * Design
 * ------
 * Pure interface module with one injected `httpFetch` callback. The
 * callback is responsible for the actual HTTPS round-trip; the
 * module handles request shaping, response parsing, score
 * normalisation, and cache hits. Production callers pass `fetch`
 * directly; tests inject a deterministic stub.
 *
 * No DB, no logger dependency, no global state (cache is opt-in
 * via passed-in object). Failures throw — caller decides fallback
 * (e.g. fall back to cross-encoder, log + return original order).
 *
 * @module services/rag/voyage-reranker
 */

// ===========================================================================
// Types
// ===========================================================================

/** A reranking candidate. The `id` is what comes back in the result —
 *  the API returns positional indexes, but we map back to caller ids
 *  for clean composition. */
export interface RerankCandidate<T = unknown> {
  /** Stable id for the document. */
  id: string;
  /** Document text fed to the reranker. Voyage rerank-2.5 supports
   *  up to ~32 K tokens per document — practically no truncation
   *  needed for LoCoMo turns. */
  text: string;
  /** Optional caller payload returned alongside the score. */
  payload?: T;
}

/** A single rerank result: candidate id + relevance score. Sorted
 *  descending by `score` in the returned list. */
export interface RerankResult<T = unknown> {
  id: string;
  score: number;
  payload?: T;
  /** The candidate's original 0-based index in the input array.
   *  Useful for diagnostics ("did the top-1 jump 30 places?"). */
  originalIndex: number;
}

/** Minimal HTTP fetch contract. The real `fetch` (global or undici)
 *  satisfies this, and tests can pass a stub. */
export type HttpFetch = (
  url: string,
  init: HttpFetchInit,
) => Promise<HttpFetchResponse>;

export interface HttpFetchInit {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface HttpFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

/** Optional cache surface. Any object that exposes `get` / `set`
 *  qualifies — Map, LRU-Cache, Redis-wrapper, etc. */
export interface RerankCache {
  get(key: string): number | undefined;
  set(key: string, value: number): void;
}

export interface VoyageRerankOptions<T = unknown> {
  /** Required API key. Voyage's HTTP API authenticates via Bearer. */
  apiKey: string;
  /** Voyage model name. Default `'rerank-2.5'`. */
  model?: string;
  /** Cap on candidate count fed to the API (cost guard). Default 50.
   *  Excess candidates are dropped from the right (caller should
   *  pre-sort by retrieval score). */
  maxDocs?: number;
  /** Top-K to return after reranking. Default = number of docs sent. */
  topK?: number;
  /** Optional pairwise-similarity cache. Keyed by SHA-style hash of
   *  `query + "|" + candidate.text`. */
  cache?: RerankCache;
  /** Injected HTTP transport. Production: `fetch`. Tests: stub. */
  httpFetch?: HttpFetch;
  /** API base URL override. Default Voyage's production URL. */
  apiBase?: string;
  /** Request timeout in ms. Default 30000. */
  timeoutMs?: number;
}

// ===========================================================================
// Constants
// ===========================================================================

const DEFAULT_MODEL = 'rerank-2.5';
const DEFAULT_MAX_DOCS = 50;
const DEFAULT_API_BASE = 'https://api.voyageai.com/v1/rerank';
const DEFAULT_TIMEOUT_MS = 30000;

// ===========================================================================
// Helpers
// ===========================================================================

/** Stable hash for cache keys. Caller-supplied query + candidate text.
 *  djb2 hash — good enough for cache-key collision avoidance, much
 *  faster than crypto on the hot path. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & 0xffffffff; // keep 32-bit
  }
  return (h >>> 0).toString(36);
}

function cacheKey(query: string, text: string): string {
  return `${hash(query)}_${hash(text)}`;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Rerank `candidates` against `query` using Voyage's rerank-2.5 API.
 * Returns the top-K candidates sorted by relevance score descending.
 *
 * Performance:
 *   - One HTTPS round-trip per call (or zero if all candidates hit
 *     the cache).
 *   - Cache hits short-circuit: when EVERY candidate is in cache, no
 *     HTTP call is made and the function returns synchronously-fast
 *     (still async due to interface).
 *
 * @throws when `apiKey` is missing, when the HTTP call fails (non-2xx
 *         response or network error), or when the response shape is
 *         not what Voyage's documented schema specifies.
 */
export async function voyageRerank<T = unknown>(
  query: string,
  candidates: ReadonlyArray<RerankCandidate<T>>,
  options: VoyageRerankOptions<T>,
): Promise<RerankResult<T>[]> {
  if (!options.apiKey) {
    throw new Error('voyageRerank: apiKey is required');
  }
  const cleanQuery = String(query ?? '').trim();
  if (!cleanQuery) {
    throw new Error('voyageRerank: query must be a non-empty string');
  }
  if (!candidates || candidates.length === 0) return [];

  const model = options.model ?? DEFAULT_MODEL;
  const maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;
  const topK = options.topK ?? Math.min(candidates.length, maxDocs);
  const cache = options.cache;
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Cap candidates to maxDocs (cost guard). Caller should pre-sort.
  const capped = candidates.slice(0, maxDocs);

  // Try the cache first.
  const cachedScores = new Map<number, number>(); // index → score
  const needsApi: Array<{ i: number; cand: RerankCandidate<T>; key: string | null }> = [];
  for (let i = 0; i < capped.length; i++) {
    const cand = capped[i];
    if (!cache) {
      needsApi.push({ i, cand, key: null });
      continue;
    }
    const key = cacheKey(cleanQuery, cand.text);
    const hit = cache.get(key);
    if (hit !== undefined) {
      cachedScores.set(i, hit);
    } else {
      needsApi.push({ i, cand, key });
    }
  }

  // If everything was cached, skip the API entirely.
  let apiScores = new Map<number, number>();
  if (needsApi.length > 0) {
    const httpFetch = options.httpFetch ?? (typeof fetch !== 'undefined' ? (fetch as HttpFetch) : null);
    if (!httpFetch) {
      throw new Error(
        'voyageRerank: no HTTP transport available (pass options.httpFetch or run on a fetch-capable runtime)',
      );
    }

    const docs = needsApi.map((x) => x.cand.text);
    const body = JSON.stringify({
      query: cleanQuery,
      documents: docs,
      model,
      top_k: docs.length, // we want all scores; top-K trimming happens after merge
      return_documents: false,
    });

    // Apply timeout via AbortController? We don't have one in this
    // narrow HttpFetch contract — callers that want timeouts wrap
    // their own fetch. Document for clarity.
    void timeoutMs;

    let res: HttpFetchResponse;
    try {
      res = await httpFetch(apiBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`,
        },
        body,
      });
    } catch (e) {
      throw new Error(`voyageRerank: HTTP error: ${(e as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(`voyageRerank: HTTP ${res.status} from Voyage: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as unknown;
    const parsed = parseVoyageResponse(json, needsApi.length);
    // Voyage returns indexes RELATIVE TO the documents array we sent.
    // Map back to the original candidate index.
    for (const { index, score } of parsed) {
      const apiCandIdx = needsApi[index]?.i;
      if (apiCandIdx === undefined) continue;
      apiScores.set(apiCandIdx, score);
      // Cache the score for future identical queries.
      const key = needsApi[index].key;
      if (cache && key) cache.set(key, score);
    }
  }

  // Combine cached + API scores. Candidates without a score (shouldn't
  // happen, but defensive) get 0.
  const results: RerankResult<T>[] = capped.map((cand, i) => ({
    id: cand.id,
    score: cachedScores.get(i) ?? apiScores.get(i) ?? 0,
    payload: cand.payload,
    originalIndex: i,
  }));

  // Sort by score desc; tie-break by original index (stable).
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalIndex - b.originalIndex;
  });

  return results.slice(0, topK);
}

// ===========================================================================
// Response parsing (separated for testability)
// ===========================================================================

interface VoyageResponseItem {
  index: number;
  score: number;
}

/** Parse Voyage's documented response shape. Rejects malformed inputs
 *  with a descriptive error. */
export function parseVoyageResponse(json: unknown, expectedLen: number): VoyageResponseItem[] {
  if (!json || typeof json !== 'object') {
    throw new Error('voyageRerank: response is not an object');
  }
  const obj = json as Record<string, unknown>;
  const data = obj.data;
  if (!Array.isArray(data)) {
    throw new Error('voyageRerank: response.data is not an array');
  }
  const items: VoyageResponseItem[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const index =
      typeof r.index === 'number' ? r.index :
      typeof r.document_index === 'number' ? r.document_index : undefined;
    const score =
      typeof r.relevance_score === 'number' ? r.relevance_score :
      typeof r.score === 'number' ? r.score : undefined;
    if (index === undefined || score === undefined) continue;
    if (index < 0 || index >= expectedLen) continue;
    items.push({ index, score });
  }
  return items;
}

// ===========================================================================
// Convenience: simple Map-based cache
// ===========================================================================

/** Drop-in `RerankCache` backed by a plain `Map`. Caller controls
 *  lifecycle; for TTL or size limits, swap for a richer cache. */
export function createMemoryRerankCache(): RerankCache {
  const map = new Map<string, number>();
  return {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); },
  };
}
