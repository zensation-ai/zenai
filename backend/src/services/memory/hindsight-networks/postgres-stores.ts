/**
 * Postgres-backed Hindsight stores.
 *
 * Phase H4 production-binding C-D. DB-backed implementations of the
 * pure store interfaces from H4.3 (entity_summaries) and H4.4
 * (evolving_beliefs). The tables are created by the H4.0 migration
 * (`backend/sql/migrations/phase_h_4_hindsight_networks.sql`).
 *
 * Pattern: factory-per-context. Each `createPostgresEntitySummaryStore(ctx)`
 * call returns a store bound to the supplied AIContext schema. The
 * underlying `queryContext(ctx, sql, params)` routes the SQL to the
 * correct schema-isolated table (`{operations,finance,people,strategy}.entity_summaries`).
 *
 * Why factory-per-context (not a single global store)
 * ---------------------------------------------------
 * The pure store interfaces (`EntitySummaryStore`, `BeliefStore`) have
 * no `context` arg on their methods — they were designed to be context-
 * agnostic so the in-memory reference implementations stay simple. To
 * support multi-tenant isolated schemas in production, we wrap
 * `queryContext(ctx, ...)` once at factory time. The memory-coordinator
 * calls the factory with its current `AIContext` for each
 * `prepareEnhancedContext` invocation.
 *
 * Why no embedding-aware search yet
 * ---------------------------------
 * The HNSW index from the H4.0 migration is in place, but the search
 * methods here use BM25-style substring + ts_rank ranking. Embedding-
 * cosine search is a follow-up enhancement once we wire query
 * embeddings in (the chat path already generates them; we just need
 * to thread them through). The contract stays the same — only the
 * implementation under search() gets richer.
 *
 * @module services/memory/hindsight-networks/postgres-stores
 */

import type { AIContext } from '../../../utils/database-context';
import { queryContext } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';
import type {
  EntitySummary,
  EntitySummaryStore,
} from './entity-summaries';
import type {
  EvolvingBelief,
  BeliefStore,
} from './evolving-beliefs';

// ===========================================================================
// PostgresEntitySummaryStore
// ===========================================================================

/**
 * Map a raw DB row to an EntitySummary type. Defensive against missing
 * fields — the table has non-null constraints on the required columns
 * but the embedding column is nullable + we filter it out of the
 * domain type.
 */
function rowToEntitySummary(row: Record<string, unknown>): EntitySummary {
  return {
    entityId: String(row.entity_id ?? ''),
    summary: String(row.summary ?? ''),
    factCount: Number(row.fact_count ?? 0) || 0,
    lastUpdated: row.last_updated ? new Date(row.last_updated as string) : new Date(0),
    confidence: Number(row.confidence ?? 0) || 0,
  };
}

/**
 * Create a Postgres-backed EntitySummaryStore for a specific context schema.
 */
export function createPostgresEntitySummaryStore(
  context: AIContext,
): EntitySummaryStore {
  return {
    async get(entityId: string): Promise<EntitySummary | null> {
      const sql = `
        SELECT entity_id, summary, fact_count, last_updated, confidence
        FROM entity_summaries
        WHERE entity_id = $1
        LIMIT 1
      `;
      try {
        const result = await queryContext(context, sql, [entityId]);
        if (result.rows.length === 0) return null;
        return rowToEntitySummary(result.rows[0] as Record<string, unknown>);
      } catch (error) {
        logger.debug('PostgresEntitySummaryStore.get failed', {
          context,
          entityId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },

    async upsert(summary: EntitySummary): Promise<void> {
      const sql = `
        INSERT INTO entity_summaries
          (entity_id, summary, fact_count, last_updated, confidence)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (entity_id) DO UPDATE SET
          summary      = EXCLUDED.summary,
          fact_count   = EXCLUDED.fact_count,
          last_updated = EXCLUDED.last_updated,
          confidence   = EXCLUDED.confidence
      `;
      try {
        await queryContext(context, sql, [
          summary.entityId,
          summary.summary,
          summary.factCount,
          summary.lastUpdated.toISOString(),
          summary.confidence,
        ]);
      } catch (error) {
        logger.warn('PostgresEntitySummaryStore.upsert failed', {
          context,
          entityId: summary.entityId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    async search(
      query: string,
      limit: number,
    ): Promise<ReadonlyArray<EntitySummary>> {
      const trimmed = String(query ?? '').trim();
      if (!trimmed) {
        // Return most-recently-updated entities when query is empty.
        const sql = `
          SELECT entity_id, summary, fact_count, last_updated, confidence
          FROM entity_summaries
          ORDER BY last_updated DESC
          LIMIT $1
        `;
        try {
          const result = await queryContext(context, sql, [limit]);
          return result.rows.map((r) => rowToEntitySummary(r as Record<string, unknown>));
        } catch (error) {
          logger.debug('PostgresEntitySummaryStore.search (empty query) failed', {
            context,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }
      }

      // Substring-match on entity_id + summary; rank by exact-token match
      // count via ts_rank on the German + English text-search config.
      // Fallback to plain ILIKE if ts_query parsing trips on the input.
      const sanitized = trimmed.replace(/[^\w\s]/g, ' ').trim();
      const sqlBM25 = `
        SELECT entity_id, summary, fact_count, last_updated, confidence,
               ts_rank(
                 to_tsvector('simple', entity_id || ' ' || summary),
                 plainto_tsquery('simple', $1)
               ) AS rank
        FROM entity_summaries
        WHERE to_tsvector('simple', entity_id || ' ' || summary) @@ plainto_tsquery('simple', $1)
           OR LOWER(entity_id) LIKE $2
           OR LOWER(summary) LIKE $2
        ORDER BY rank DESC, last_updated DESC
        LIMIT $3
      `;
      const ilikePattern = `%${trimmed.toLowerCase()}%`;
      try {
        const result = await queryContext(context, sqlBM25, [
          sanitized,
          ilikePattern,
          limit,
        ]);
        return result.rows.map((r) => rowToEntitySummary(r as Record<string, unknown>));
      } catch (error) {
        logger.debug('PostgresEntitySummaryStore.search BM25 failed, falling back', {
          context,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fallback: pure ILIKE.
        const fallbackSql = `
          SELECT entity_id, summary, fact_count, last_updated, confidence
          FROM entity_summaries
          WHERE LOWER(entity_id) LIKE $1 OR LOWER(summary) LIKE $1
          ORDER BY last_updated DESC
          LIMIT $2
        `;
        try {
          const result = await queryContext(context, fallbackSql, [
            ilikePattern,
            limit,
          ]);
          return result.rows.map((r) => rowToEntitySummary(r as Record<string, unknown>));
        } catch (e2) {
          logger.warn('PostgresEntitySummaryStore.search fallback also failed', {
            context,
            error: e2 instanceof Error ? e2.message : String(e2),
          });
          return [];
        }
      }
    },
  };
}

// ===========================================================================
// PostgresBeliefStore
// ===========================================================================

function rowToBelief(row: Record<string, unknown>): EvolvingBelief {
  return {
    beliefId: String(row.belief_id ?? ''),
    entityId: String(row.entity_id ?? ''),
    claim: String(row.claim ?? ''),
    confidence: Number(row.confidence ?? 0) || 0,
    evidenceFor: Number(row.evidence_for ?? 0) || 0,
    evidenceAgainst: Number(row.evidence_against ?? 0) || 0,
    lastRevised: row.last_revised ? new Date(row.last_revised as string) : new Date(0),
    supersededAt: row.superseded_at ? new Date(row.superseded_at as string) : null,
    supersededBy: row.superseded_by ? String(row.superseded_by) : null,
  };
}

/**
 * Create a Postgres-backed BeliefStore for a specific context schema.
 */
export function createPostgresBeliefStore(context: AIContext): BeliefStore {
  return {
    async getById(beliefId: string): Promise<EvolvingBelief | null> {
      const sql = `
        SELECT belief_id, entity_id, claim, confidence,
               evidence_for, evidence_against,
               last_revised, superseded_at, superseded_by
        FROM evolving_beliefs
        WHERE belief_id = $1
        LIMIT 1
      `;
      try {
        const result = await queryContext(context, sql, [beliefId]);
        if (result.rows.length === 0) return null;
        return rowToBelief(result.rows[0] as Record<string, unknown>);
      } catch (error) {
        logger.debug('PostgresBeliefStore.getById failed', {
          context,
          beliefId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },

    async listActiveByEntity(
      entityId: string,
    ): Promise<ReadonlyArray<EvolvingBelief>> {
      const sql = `
        SELECT belief_id, entity_id, claim, confidence,
               evidence_for, evidence_against,
               last_revised, superseded_at, superseded_by
        FROM evolving_beliefs
        WHERE entity_id = $1 AND superseded_at IS NULL
        ORDER BY confidence DESC, last_revised DESC
      `;
      try {
        const result = await queryContext(context, sql, [entityId]);
        return result.rows.map((r) => rowToBelief(r as Record<string, unknown>));
      } catch (error) {
        logger.debug('PostgresBeliefStore.listActiveByEntity failed', {
          context,
          entityId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },

    async insert(belief: Omit<EvolvingBelief, 'beliefId'>): Promise<string> {
      const sql = `
        INSERT INTO evolving_beliefs
          (entity_id, claim, confidence, evidence_for, evidence_against,
           last_revised, superseded_at, superseded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING belief_id
      `;
      try {
        const result = await queryContext(context, sql, [
          belief.entityId,
          belief.claim,
          belief.confidence,
          belief.evidenceFor,
          belief.evidenceAgainst,
          belief.lastRevised.toISOString(),
          belief.supersededAt ? belief.supersededAt.toISOString() : null,
          belief.supersededBy,
        ]);
        const row = result.rows[0] as Record<string, unknown> | undefined;
        if (!row) throw new Error('PostgresBeliefStore.insert: no belief_id returned');
        return String(row.belief_id);
      } catch (error) {
        logger.warn('PostgresBeliefStore.insert failed', {
          context,
          entityId: belief.entityId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    async update(belief: EvolvingBelief): Promise<void> {
      const sql = `
        UPDATE evolving_beliefs
        SET entity_id        = $2,
            claim            = $3,
            confidence       = $4,
            evidence_for     = $5,
            evidence_against = $6,
            last_revised     = $7,
            superseded_at    = $8,
            superseded_by    = $9
        WHERE belief_id = $1
      `;
      try {
        await queryContext(context, sql, [
          belief.beliefId,
          belief.entityId,
          belief.claim,
          belief.confidence,
          belief.evidenceFor,
          belief.evidenceAgainst,
          belief.lastRevised.toISOString(),
          belief.supersededAt ? belief.supersededAt.toISOString() : null,
          belief.supersededBy,
        ]);
      } catch (error) {
        logger.warn('PostgresBeliefStore.update failed', {
          context,
          beliefId: belief.beliefId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}

// ===========================================================================
// Convenience: factory pair for both stores
// ===========================================================================

/**
 * Convenience helper that returns BOTH stores wired against the same
 * context schema. Used by the memory-coordinator's per-context lookup.
 */
export function createPostgresHindsightStores(context: AIContext): {
  entitySummaryStore: EntitySummaryStore;
  beliefStore: BeliefStore;
} {
  return {
    entitySummaryStore: createPostgresEntitySummaryStore(context),
    beliefStore: createPostgresBeliefStore(context),
  };
}
