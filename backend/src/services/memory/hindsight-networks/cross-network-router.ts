/**
 * Hindsight Cross-Network Retrieval Router.
 *
 * Phase H sprint reference: spec § H4 task 5 (Hindsight pattern,
 * LoCoMo ~89.6 % SOTA reference).
 *
 * What this routes
 * ----------------
 * Given a query, decide which of the four Hindsight networks should
 * be queried first (and with what weight) for the query's likely
 * answer. The 4 networks:
 *
 *   1. World Facts        — objective claims about the world
 *   2. Agent Experiences  — time-stamped events with the user
 *   3. Entity Summaries   — per-entity rolling 200-token block
 *   4. Evolving Beliefs   — Bayesian-updated agent beliefs
 *
 * The router DOES NOT pick a single winner — multiple networks usually
 * contribute. It returns an ordered list of (network, weight) pairs
 * the caller can fan out to in parallel and merge via RRF.
 *
 * Why heuristic-first
 * -------------------
 * Spec § H4 task 5 says: "zunächst heuristisch, später RL-trained in
 * H5". The heuristic version is cheap (regex + cue counting), runs
 * <1ms, and gives the eval-harness an A/B-able routing surface
 * without training. H5 will swap this for a learned policy once we
 * have eval data.
 *
 * Compose with H7.1 LoCoMo category detection
 * -------------------------------------------
 * H7.1's `detectLoCoMoCategory` already classifies queries as
 * multi_hop / temporal / single_hop / open_domain / adversarial. We
 * map those categories to network preferences:
 *
 *   Cat 1 (Multi-Hop)   → entity_summaries primary, world_facts secondary
 *   Cat 2 (Temporal)    → agent_experiences primary, entity_summaries secondary
 *   Cat 3 (Open-Domain) → world_facts primary
 *   Cat 4 (Single-Hop)  → entity_summaries primary, world_facts secondary
 *   Cat 5 (Adversarial) → ALL networks (defensive — find ANY supporting fact)
 *
 * Belief queries (signalled by preference / opinion cues like "likes",
 * "prefers", "thinks") boost evolving_beliefs into the top weights
 * regardless of category.
 *
 * Pure function — no I/O.
 *
 * @module services/memory/hindsight-networks/cross-network-router
 */

import { detectLoCoMoCategory, type LoCoMoCategory } from '../../reasoning/wait-forcing';
import { WORLD_FACT_NETWORK } from './world-facts';
import { AGENT_EXPERIENCE_NETWORK } from './agent-experiences';
import { ENTITY_SUMMARY_NETWORK } from './entity-summaries';
import { EVOLVING_BELIEF_NETWORK } from './evolving-beliefs';

// ===========================================================================
// Types
// ===========================================================================

export type HindsightNetworkId =
  | typeof WORLD_FACT_NETWORK
  | typeof AGENT_EXPERIENCE_NETWORK
  | typeof ENTITY_SUMMARY_NETWORK
  | typeof EVOLVING_BELIEF_NETWORK;

export interface NetworkRouting {
  /** Ordered list of network preferences with normalised weights. */
  networks: ReadonlyArray<{ network: HindsightNetworkId; weight: number }>;
  /** Detected LoCoMo category that drove the routing. */
  category: LoCoMoCategory;
  /** Whether belief-cues fired (preference/opinion query). */
  beliefBoost: boolean;
  /** Per-cue contributor breakdown for observability. */
  contributors: Readonly<Record<string, number>>;
  /** Short reason string for logging. */
  reason: string;
}

export interface RoutingOptions {
  /** Override the default category-to-network weight table. Useful for
   *  per-context tuning (e.g. finance schema → world_facts dominant). */
  weightTable?: Readonly<Partial<Record<LoCoMoCategory, ReadonlyArray<{ network: HindsightNetworkId; weight: number }>>>>;
  /** Coefficient applied to the evolving_beliefs weight when belief-cues
   *  fire. Default 1.5. */
  beliefBoostFactor?: number;
}

// ===========================================================================
// Defaults
// ===========================================================================

const DEFAULT_BELIEF_BOOST = 1.5;

/** Default category → network weight table (per spec § H4 task 5). */
const DEFAULT_WEIGHT_TABLE: Record<
  LoCoMoCategory,
  ReadonlyArray<{ network: HindsightNetworkId; weight: number }>
> = {
  multi_hop: [
    { network: ENTITY_SUMMARY_NETWORK, weight: 0.40 },
    { network: WORLD_FACT_NETWORK, weight: 0.30 },
    { network: AGENT_EXPERIENCE_NETWORK, weight: 0.20 },
    { network: EVOLVING_BELIEF_NETWORK, weight: 0.10 },
  ],
  temporal: [
    { network: AGENT_EXPERIENCE_NETWORK, weight: 0.55 },
    { network: ENTITY_SUMMARY_NETWORK, weight: 0.25 },
    { network: WORLD_FACT_NETWORK, weight: 0.15 },
    { network: EVOLVING_BELIEF_NETWORK, weight: 0.05 },
  ],
  open_domain: [
    { network: WORLD_FACT_NETWORK, weight: 0.50 },
    { network: ENTITY_SUMMARY_NETWORK, weight: 0.25 },
    { network: AGENT_EXPERIENCE_NETWORK, weight: 0.15 },
    { network: EVOLVING_BELIEF_NETWORK, weight: 0.10 },
  ],
  single_hop: [
    { network: ENTITY_SUMMARY_NETWORK, weight: 0.45 },
    { network: WORLD_FACT_NETWORK, weight: 0.30 },
    { network: AGENT_EXPERIENCE_NETWORK, weight: 0.15 },
    { network: EVOLVING_BELIEF_NETWORK, weight: 0.10 },
  ],
  adversarial: [
    // Cat 5 needs every network online — adversarial questions are
    // designed to mislead by exploiting which network the agent ASKED.
    { network: ENTITY_SUMMARY_NETWORK, weight: 0.30 },
    { network: WORLD_FACT_NETWORK, weight: 0.30 },
    { network: AGENT_EXPERIENCE_NETWORK, weight: 0.25 },
    { network: EVOLVING_BELIEF_NETWORK, weight: 0.15 },
  ],
  unknown: [
    { network: ENTITY_SUMMARY_NETWORK, weight: 0.35 },
    { network: WORLD_FACT_NETWORK, weight: 0.30 },
    { network: AGENT_EXPERIENCE_NETWORK, weight: 0.25 },
    { network: EVOLVING_BELIEF_NETWORK, weight: 0.10 },
  ],
};

const BELIEF_CUE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(likes?|loves?|prefers?|hates?|dislikes?)\b/i,
  /\b(thinks?|believes?|opinion|opinions?)\b/i,
  /\b(favou?rite|preferen[cs]es?)\b/i,
  /\b(want|wants?|wished?|wishe[ds])\b/i,
];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Route a query to the appropriate Hindsight network mix.
 *
 * Pure function — same query, same routing, no side effects.
 *
 * Steps:
 *   1. Detect LoCoMo category via H7.1 detectLoCoMoCategory.
 *   2. Look up the category's default network-weight list.
 *   3. Detect belief-cues; if any fire, boost the evolving_beliefs
 *      weight by `beliefBoostFactor` and re-normalise.
 *   4. Normalise weights to sum to 1.0.
 *   5. Sort by weight DESC.
 *
 * Returns the ordered routing decision with full observability fields.
 */
export function routeToHindsightNetworks(
  query: string,
  options: RoutingOptions = {},
): NetworkRouting {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) {
    return {
      networks: [],
      category: 'unknown',
      beliefBoost: false,
      contributors: { empty: 0 },
      reason: 'empty query',
    };
  }

  const detection = detectLoCoMoCategory(trimmed);
  const weightTable = options.weightTable ?? {};
  const baseWeights =
    weightTable[detection.category] ??
    DEFAULT_WEIGHT_TABLE[detection.category] ??
    DEFAULT_WEIGHT_TABLE.unknown;

  const beliefCueCount = BELIEF_CUE_PATTERNS.filter((p) => p.test(trimmed)).length;
  const beliefBoost = beliefCueCount > 0;
  const boostFactor = options.beliefBoostFactor ?? DEFAULT_BELIEF_BOOST;

  // Apply belief-boost to a copy.
  const boosted = baseWeights.map(({ network, weight }) => ({
    network,
    weight: network === EVOLVING_BELIEF_NETWORK && beliefBoost
      ? weight * boostFactor
      : weight,
  }));

  // Re-normalise.
  const sum = boosted.reduce((acc, x) => acc + x.weight, 0);
  const normalised = sum > 0
    ? boosted.map(({ network, weight }) => ({
        network,
        weight: weight / sum,
      }))
    : boosted;

  // Sort by weight DESC, network-id alpha for stable tiebreak.
  const sorted = [...normalised].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.network.localeCompare(b.network);
  });

  return {
    networks: sorted,
    category: detection.category,
    beliefBoost,
    contributors: {
      ...detection.contributors,
      belief_cues: beliefCueCount,
    },
    reason: beliefBoost
      ? `category=${detection.category} + belief boost (×${boostFactor})`
      : `category=${detection.category}`,
  };
}

/**
 * Convenience: pick the top-K networks from a routing decision.
 * Useful when the caller can only fan out to a fixed number of
 * networks for latency reasons.
 */
export function topKNetworks(
  routing: NetworkRouting,
  k: number,
): ReadonlyArray<{ network: HindsightNetworkId; weight: number }> {
  return routing.networks.slice(0, Math.max(1, Math.floor(k)));
}

/**
 * All known network ids (handy for fan-out integration tests +
 * cross-network-router callers that want "all four").
 */
export const ALL_HINDSIGHT_NETWORKS: ReadonlyArray<HindsightNetworkId> = [
  WORLD_FACT_NETWORK,
  AGENT_EXPERIENCE_NETWORK,
  ENTITY_SUMMARY_NETWORK,
  EVOLVING_BELIEF_NETWORK,
];
