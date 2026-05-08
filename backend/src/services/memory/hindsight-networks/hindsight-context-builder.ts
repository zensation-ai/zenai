/**
 * Hindsight Context Builder.
 *
 * Phase H4 production-binding bridge. Composes:
 *   - Cross-network router (H4.5) — picks top-K networks per query
 *   - Network 3 stores (H4.3 entity summaries)
 *   - Network 4 stores (H4.4 evolving beliefs)
 *
 * into ContextPart[] suitable for the memory-coordinator's
 * combineAllContextParts() merge stage.
 *
 * Why a builder, not direct memory-coordinator changes
 * ---------------------------------------------------
 * The 4 network primitives expose pure interfaces. The memory-
 * coordinator already orchestrates 4+ context sources (working,
 * episodic, short-term, long-term, graph, cross-context). Adding the
 * Hindsight networks as a 5th source through a thin builder keeps
 * the coordinator focused and lets the eval-harness flip the binding
 * via one env-flag without touching unrelated context paths.
 *
 * What ContextPart looks like
 * ---------------------------
 * The shape is owned by `services/memory/memory-types.ts` and used by
 * the coordinator's combine + prune + budget pipeline. The builder
 * emits ContextPart[] tagged with source='hindsight' so downstream
 * logging shows the routing decision.
 *
 * Default-OFF env-flag
 * --------------------
 * `H4_HINDSIGHT_ROUTER` reads at module load. Per-call `enable: true`
 * always wins over env. Without stores supplied the builder is a
 * no-op — production caller is responsible for wiring the DB-backed
 * implementations of EntitySummaryStore + BeliefStore. In-memory
 * reference implementations from the per-network modules also work
 * for tests / smoke.
 *
 * @module services/memory/hindsight-networks/hindsight-context-builder
 */

import type { ContextPart } from '../memory-types';
import {
  routeToHindsightNetworks,
  topKNetworks,
  type HindsightNetworkId,
  type RoutingOptions,
  type NetworkRouting,
} from './cross-network-router';
import {
  searchEntitySummaries,
  type EntitySummaryStore,
} from './entity-summaries';
import {
  listEntityBeliefs,
  type BeliefStore,
} from './evolving-beliefs';
import { ENTITY_SUMMARY_NETWORK } from './entity-summaries';
import { EVOLVING_BELIEF_NETWORK } from './evolving-beliefs';

// ===========================================================================
// Env-flag default
// ===========================================================================

const H4_HINDSIGHT_ROUTER_DEFAULT = (() => {
  const raw = process.env.H4_HINDSIGHT_ROUTER;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

// ===========================================================================
// Types
// ===========================================================================

export interface HindsightContextBuilderOptions {
  /** Per-call override of env-default. */
  enable?: boolean;
  /** Cross-network-router options (threshold, weight table, belief-boost
   *  factor). Forwarded verbatim to `routeToHindsightNetworks`. */
  routingOptions?: RoutingOptions;
  /** How many top networks to fan out to. Default 2. */
  topK?: number;
  /** Per-network result cap. Default 3. */
  perNetworkLimit?: number;
  /** Optional list of entity ids to scope the lookup to. When omitted,
   *  the builder falls back to a free-text search via the stores. */
  entityIds?: ReadonlyArray<string>;
  /** Minimum belief confidence to include in evolving_beliefs results.
   *  Default 0.5. */
  minBeliefConfidence?: number;
}

export interface HindsightContextBuilderStores {
  /** Required for Network 3 (Entity Summaries) lookups. */
  entitySummaryStore?: EntitySummaryStore;
  /** Required for Network 4 (Evolving Beliefs) lookups. */
  beliefStore?: BeliefStore;
}

export interface HindsightContextResult {
  parts: ContextPart[];
  routing: NetworkRouting;
  /** Per-network counts for telemetry / observability. */
  hits: Readonly<Record<HindsightNetworkId, number>>;
  /** Whether the builder was actually invoked (vs gate-disabled / no
   *  stores supplied). */
  applied: boolean;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Build ContextPart[] from the Hindsight networks for a query.
 *
 * Pure-async. No DB or LLM imports — production caller injects the
 * stores. When the gate is OFF or the required stores are missing,
 * returns an empty parts list with `applied: false` and the routing
 * still computed (callers can log the would-have-been routing without
 * fetching).
 *
 * Currently fetches from Network 3 (entity_summaries) and Network 4
 * (evolving_beliefs) directly. Networks 1 (world_facts) and 2
 * (agent_experiences) are already covered by the coordinator's
 * existing long-term and episodic retrieval — adding them here would
 * duplicate. The router still factors all 4 weights into the routing
 * decision, but only Networks 3+4 contribute new ContextParts here.
 */
export async function buildHindsightContextParts(
  query: string,
  stores: HindsightContextBuilderStores,
  options: HindsightContextBuilderOptions = {},
): Promise<HindsightContextResult> {
  const enable = options.enable ?? H4_HINDSIGHT_ROUTER_DEFAULT;
  const routing = routeToHindsightNetworks(query, options.routingOptions);

  const emptyHits = {
    world_facts: 0,
    agent_experiences: 0,
    entity_summaries: 0,
    evolving_beliefs: 0,
  } as Record<HindsightNetworkId, number>;

  if (!enable) {
    return { parts: [], routing, hits: emptyHits, applied: false };
  }

  const topK = Math.max(1, Math.floor(options.topK ?? 2));
  const targetNetworks = topKNetworks(routing, topK);
  const perNetLimit = Math.max(1, Math.floor(options.perNetworkLimit ?? 3));
  const minConf = options.minBeliefConfidence ?? 0.5;

  const parts: ContextPart[] = [];
  const hits: Record<HindsightNetworkId, number> = { ...emptyHits };

  for (const { network, weight } of targetNetworks) {
    if (network === ENTITY_SUMMARY_NETWORK && stores.entitySummaryStore) {
      try {
        const summaries = options.entityIds && options.entityIds.length > 0
          ? await fetchSummariesByEntityIds(
              stores.entitySummaryStore,
              options.entityIds,
              perNetLimit,
            )
          : await searchEntitySummaries(query, stores.entitySummaryStore, {
              limit: perNetLimit,
            });
        for (const s of summaries) {
          parts.push({
            type: 'fact',
            content: `[Entity: ${s.entityId}] ${s.summary}`,
            relevance: weight * Math.max(0.1, s.confidence),
            source: 'long_term',
            timestamp: s.lastUpdated.getTime(),
          });
          hits[ENTITY_SUMMARY_NETWORK] += 1;
        }
      } catch {
        // Don't let store errors break the wider context build.
      }
    }

    if (network === EVOLVING_BELIEF_NETWORK && stores.beliefStore) {
      try {
        const focusEntities = options.entityIds && options.entityIds.length > 0
          ? options.entityIds
          : extractEntityCandidates(query);

        for (const entityId of focusEntities) {
          const beliefs = await listEntityBeliefs(entityId, stores.beliefStore, {
            limit: perNetLimit,
            minConfidence: minConf,
          });
          for (const b of beliefs) {
            parts.push({
              type: 'fact',
              content:
                `[Belief about ${b.entityId}] ${b.claim} ` +
                `(conf=${b.confidence.toFixed(2)}, ` +
                `+${b.evidenceFor}/${b.evidenceAgainst})`,
              relevance: weight * b.confidence,
              source: 'long_term',
              timestamp: b.lastRevised.getTime(),
            });
            hits[EVOLVING_BELIEF_NETWORK] += 1;
          }
        }
      } catch {
        // Don't let store errors break the wider context build.
      }
    }
  }

  return { parts, routing, hits, applied: true };
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Fetch summaries by explicit entity ids (case-folded). */
async function fetchSummariesByEntityIds(
  store: EntitySummaryStore,
  entityIds: ReadonlyArray<string>,
  perEntityLimit: number,
): Promise<ReadonlyArray<NonNullable<Awaited<ReturnType<EntitySummaryStore['get']>>>>> {
  const out: NonNullable<Awaited<ReturnType<EntitySummaryStore['get']>>>[] = [];
  for (const id of entityIds) {
    const norm = id.trim().toLowerCase();
    if (!norm) continue;
    const s = await store.get(norm);
    if (s !== null) out.push(s);
    if (out.length >= perEntityLimit) break;
  }
  return out;
}

/**
 * Extract candidate entity ids from a free-text query — capitalised,
 * non-stop tokens, lowercased + deduped. Used as fallback when
 * caller doesn't supply explicit entityIds.
 *
 * Matches the same heuristic shape as agent-experiences.ts so the
 * eval-harness sees consistent entity extraction across networks.
 */
function extractEntityCandidates(query: string): string[] {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return [];
  const STOP = new Set([
    'a','an','and','as','at','but','by','for','from','i','in','is','it','of',
    'on','or','so','that','the','they','this','to','was','we','were','will',
    'with','you','what','when','where','which','who','why','how',
  ]);
  const tokens = trimmed.split(/\s+/);
  const out = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[^\p{L}\p{N}]/gu, '');
    if (tok.length < 2) continue;
    if (i === 0 && STOP.has(tok.toLowerCase())) continue;
    if (STOP.has(tok.toLowerCase())) continue;
    if (/^[A-Z]/.test(tok) && !/^[A-Z]+$/.test(tok)) {
      out.add(tok.toLowerCase());
    }
  }
  return Array.from(out);
}
