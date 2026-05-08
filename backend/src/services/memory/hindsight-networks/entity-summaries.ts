/**
 * Hindsight Network 3 — Entity Summaries.
 *
 * Phase H sprint reference: spec § H4 task 3 (Hindsight pattern,
 * LoCoMo ~89.6 % SOTA reference).
 *
 * What "entity summaries" represents
 * ----------------------------------
 * Per-entity rolling 200-token block that aggregates everything we
 * know about an entity into a single retrieval-friendly chunk.
 * Different from World Facts (Network 1: standalone facts) and Agent
 * Experiences (Network 2: time-stamped events).
 *
 * Example for "Caroline":
 *   "Caroline lives in Madrid. She studies AI at Stanford. Mentioned
 *    her sister has a daughter (May 2024). Birthday is in November.
 *    Last conversation: discussed the LoCoMo paper."
 *
 * Used by the cross-network router as a SECOND CONTEXT STREAM
 * alongside the actual evidence — when a query is "what does Caroline
 * do?", the answerer gets both the retrieved evidence chunks AND the
 * Caroline summary block. This is the Hindsight pattern's biggest
 * lift on multi-speaker conversations.
 *
 * Why it differs from Letta persona-blocks (H3.6)
 * -----------------------------------------------
 * Letta's persona-blocks (already shipped in H3.6) are USER-PINNED —
 * the user explicitly tells the agent "remember this about Caroline".
 * Network 3 is AGENT-BUILT — the agent rolls up facts/experiences into
 * a summary and rebuilds it on each new fact about the entity. Both
 * patterns can coexist; the user-pinned block has higher confidence,
 * the agent-built one provides automatic coverage.
 *
 * Pure module
 * -----------
 * The module owns: entity normalisation, rolling-summary truncation
 * (200-token cap), confidence aggregation. Storage is via injected
 * `EntitySummaryStore` so the module composes with both an in-memory
 * test impl and a production DB-backed impl (entity_summaries table
 * from the H4.0 migration).
 *
 * @module services/memory/hindsight-networks/entity-summaries
 */

// ===========================================================================
// Types
// ===========================================================================

export const ENTITY_SUMMARY_NETWORK = 'entity_summaries' as const;

/** Default cap for the rolling summary — spec says 200 tokens.
 *  We use approximate-token ≈ char/4 so 200 tokens ≈ 800 chars. */
export const ENTITY_SUMMARY_CHAR_CAP = 800;

/**
 * A single fact contribution to the rolling summary. Plain shape so
 * the network can ingest from World Facts, Agent Experiences,
 * Evolving Beliefs, or any other source without a coupling adapter.
 */
export interface SummaryContribution {
  /** Short claim about the entity ("lives in Madrid"). */
  text: string;
  /** Source confidence in [0, 1]. */
  confidence: number;
  /** Optional ISO timestamp — if supplied, contributes to the
   *  "lastUpdated" field of the summary. */
  observedAt?: string;
  /** Source-network tag for provenance ("world_facts" /
   *  "agent_experiences" / "evolving_beliefs" / etc.). */
  source?: string;
}

export interface EntitySummary {
  entityId: string;
  /** Rolling 200-token summary (aggregated from contributions). */
  summary: string;
  /** Number of contributions seen for this entity. */
  factCount: number;
  /** Latest contribution's observedAt, or insertion time when no
   *  observedAt was supplied. */
  lastUpdated: Date;
  /** Aggregate confidence — weighted mean over contributions. */
  confidence: number;
}

export interface UpdateSummaryOptions {
  /** Override the char cap. Default `ENTITY_SUMMARY_CHAR_CAP`. */
  charCap?: number;
  /** When the cap is exceeded, drop the OLDEST contribution lines
   *  first (default true). When false, the truncation is by simple
   *  end-of-string trimming. */
  evictOldest?: boolean;
}

/** Persistence interface — production caller wires to entity_summaries. */
export interface EntitySummaryStore {
  /** Read the current summary for an entity, or null if not set. */
  get(entityId: string): Promise<EntitySummary | null>;
  /** Upsert the summary for an entity. */
  upsert(summary: EntitySummary): Promise<void>;
  /** List entities matching a query (substring / embedding / BM25). */
  search(query: string, limit: number): Promise<ReadonlyArray<EntitySummary>>;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Normalise an entity id: trim, lowercase, collapse whitespace.
 * Pure function.
 */
export function normaliseEntityId(entityId: string): string {
  return String(entityId ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Build a fresh summary line from a contribution. Pure function.
 *
 * Format: `<text> [conf=N.NN]` — the confidence tag lets the
 * truncation logic prefer keeping high-confidence lines on eviction
 * and gives the caller a parseable trail for debugging.
 */
export function formatContributionLine(c: SummaryContribution): string {
  const text = String(c.text ?? '').trim();
  const conf = Number.isFinite(c.confidence) ? c.confidence : 0;
  const clamped = clamp(conf, 0, 1);
  return `${text} [conf=${clamped.toFixed(2)}]`;
}

/**
 * Append a new contribution to an existing summary, returning the new
 * `EntitySummary`. Truncates lines from the OLDEST end when the
 * combined char count exceeds the cap.
 *
 * Returns a NEW object — the input is not mutated.
 */
export function applyContribution(
  current: EntitySummary | null,
  entityId: string,
  contribution: SummaryContribution,
  options: UpdateSummaryOptions = {},
): EntitySummary {
  const cap = Math.max(64, options.charCap ?? ENTITY_SUMMARY_CHAR_CAP);
  const evictOldest = options.evictOldest ?? true;
  const normEntityId = normaliseEntityId(entityId);

  const observedAtDate = contribution.observedAt
    ? new Date(contribution.observedAt)
    : new Date();

  const newLine = formatContributionLine(contribution);

  const existingLines = current?.summary
    ? current.summary.split('\n').filter((s) => s.length > 0)
    : [];
  let combined = [...existingLines, newLine];

  // Cap-truncation: drop oldest until under cap (or exactly one line
  // remains — never go below 1).
  if (evictOldest) {
    while (combined.length > 1 && combined.join('\n').length > cap) {
      combined = combined.slice(1);
    }
    // Last-resort: a single line longer than the cap → trim its end.
    if (combined.length === 1 && combined[0].length > cap) {
      combined = [combined[0].slice(0, cap - 1) + '…'];
    }
  } else {
    let blob = combined.join('\n');
    if (blob.length > cap) blob = blob.slice(0, cap - 1) + '…';
    combined = blob.split('\n').filter((s) => s.length > 0);
    if (combined.length === 0) combined = [newLine.slice(0, cap - 1) + '…'];
  }

  // Confidence: weighted mean — each contribution counts as 1 weight,
  // so n contributions → arithmetic mean. We track aggregate via
  // factCount + per-contribution confidence.
  const oldFactCount = current?.factCount ?? 0;
  const newFactCount = oldFactCount + 1;
  const oldConf = current?.confidence ?? 0;
  const newConfRaw = clamp(contribution.confidence, 0, 1);
  const newConf =
    (oldConf * oldFactCount + newConfRaw) / newFactCount;

  // last_updated: max of (current.lastUpdated, contribution.observedAt).
  const oldLast = current?.lastUpdated?.getTime() ?? 0;
  const newLast = Math.max(oldLast, observedAtDate.getTime());

  return {
    entityId: normEntityId,
    summary: combined.join('\n'),
    factCount: newFactCount,
    lastUpdated: new Date(newLast),
    confidence: newConf,
  };
}

/**
 * Update the persisted summary for an entity. Reads, applies, writes.
 * Returns the new summary.
 */
export async function updateEntitySummary(
  entityId: string,
  contribution: SummaryContribution,
  store: EntitySummaryStore,
  options: UpdateSummaryOptions = {},
): Promise<EntitySummary> {
  const norm = normaliseEntityId(entityId);
  if (!norm) {
    throw new Error('updateEntitySummary: entityId must be non-empty');
  }
  const trimmed = String(contribution.text ?? '').trim();
  if (!trimmed) {
    throw new Error('updateEntitySummary: contribution.text must be non-empty');
  }

  const current = await store.get(norm);
  const next = applyContribution(current, norm, contribution, options);
  await store.upsert(next);
  return next;
}

/**
 * Recall the summary for an entity. Returns null when not yet built.
 */
export async function getEntitySummary(
  entityId: string,
  store: EntitySummaryStore,
): Promise<EntitySummary | null> {
  const norm = normaliseEntityId(entityId);
  if (!norm) return null;
  return store.get(norm);
}

/**
 * Search for entities matching a query, returning their summary blocks.
 * Wrapper over the store's search; sort by lastUpdated DESC.
 */
export async function searchEntitySummaries(
  query: string,
  store: EntitySummaryStore,
  options: { limit?: number } = {},
): Promise<ReadonlyArray<EntitySummary>> {
  const limit = Math.max(1, Math.floor(options.limit ?? 10));
  const raw = await store.search(query, limit * 2);
  const sorted = [...raw].sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  return sorted.slice(0, limit);
}

// ===========================================================================
// Helpers
// ===========================================================================

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

// ===========================================================================
// In-memory reference implementation
// ===========================================================================

export function createInMemoryEntitySummaryStore(): EntitySummaryStore & {
  size: () => number;
  snapshot: () => ReadonlyArray<EntitySummary>;
} {
  const byId = new Map<string, EntitySummary>();

  return {
    async get(entityId: string): Promise<EntitySummary | null> {
      return byId.get(entityId) ?? null;
    },
    async upsert(summary: EntitySummary): Promise<void> {
      byId.set(summary.entityId, summary);
    },
    async search(query: string, limit: number): Promise<ReadonlyArray<EntitySummary>> {
      const q = String(query ?? '').trim().toLowerCase();
      if (!q) return Array.from(byId.values()).slice(0, limit);
      const matches: EntitySummary[] = [];
      for (const s of byId.values()) {
        const haystack = (s.entityId + ' ' + s.summary).toLowerCase();
        if (haystack.includes(q)) matches.push(s);
      }
      return matches.slice(0, limit);
    },
    size: () => byId.size,
    snapshot: () => Array.from(byId.values()),
  };
}
