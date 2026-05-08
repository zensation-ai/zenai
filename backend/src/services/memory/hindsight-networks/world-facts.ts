/**
 * Hindsight Network 1 — World Facts.
 *
 * Phase H sprint reference: spec § H4 task 1 (Hindsight pattern,
 * LoCoMo ~89.6 % SOTA reference).
 *
 * What "world facts" means here
 * -----------------------------
 * Objective claims about the world that go BEYOND user-specific
 * preferences / behaviour / goals — e.g.:
 *
 *   - "Stanford is in California."
 *   - "Python 3.11 was released in October 2022."
 *   - "Caroline mentioned that her sister has a daughter."
 *
 * These are different from `agent_experiences` (Network 2: things that
 * happened with the user) and `entity_summaries` (Network 3: rolling
 * per-entity summary). They share the underlying long-term-memory
 * storage but earn their own retrieval surface so the cross-network
 * router can target queries that need objective facts (e.g. Cat 3
 * Open-Domain).
 *
 * Pure module
 * -----------
 * The module is mostly logic — content normalisation, SHA-256 hashing,
 * dedup checks. It composes with `longTermMemory` for the actual
 * persistence: `addWorldFact` writes via `longTermMemory.addFact` with
 * a metadata kind-tag, `recallWorldFacts` filters LTM facts by the tag.
 *
 * Why a tag in the existing schema, not a separate table:
 *   - LTM already implements decay, FSRS scheduling, contradiction
 *     detection, retrieval boost — all properties world-facts need.
 *   - A separate world_facts table would duplicate ~ 60 % of LTM logic
 *     for marginal storage benefit.
 *   - The `kind` discriminator goes through fact.content via a
 *     prefix marker the module handles internally, so existing LTM
 *     consumers see the facts as ordinary `factType: 'knowledge'`.
 *
 * SHA-256 dedup
 * -------------
 * Each new fact is hashed (content + entity-tag), and the hash is
 * looked up against the in-memory cache + persisted in the fact's
 * metadata. Same hash → return existing id (deduplicated:true).
 * Slight content variation (whitespace, capitalisation) normalised
 * before hashing.
 *
 * @module services/memory/hindsight-networks/world-facts
 */

import { createHash } from 'crypto';

// ===========================================================================
// Types
// ===========================================================================

/**
 * Tag added to a fact's content when it's stored as a world fact. Lives
 * inside the `content` field as a structured prefix so existing LTM
 * consumers don't need schema changes. Stripped on read.
 *
 * Top-level export for byte-equal eval-harness comparison.
 */
export const WORLD_FACT_PREFIX = '[world_fact] ';

/**
 * Network identifier for cross-network-router decisions.
 * Top-level export so the router and downstream code share one constant.
 */
export const WORLD_FACT_NETWORK = 'world_facts' as const;

export interface WorldFact {
  id: string;
  /** Plain content WITHOUT the prefix tag. */
  content: string;
  /** Entities mentioned in the fact, normalised lower-case. */
  entities: ReadonlyArray<string>;
  /** SHA-256 hash of normalised (content, entities). */
  hash: string;
  /** Source confidence in [0, 1]. */
  confidence: number;
  /** First time we observed this fact. */
  firstSeen: Date;
  /** Last time the fact was confirmed by a new source. */
  lastConfirmed: Date;
  /** How many independent sources have confirmed this fact. */
  occurrences: number;
}

export interface AddWorldFactOptions {
  /** Source confidence in [0, 1]. Default 0.7 (heuristic-extracted facts
   *  start moderate; LLM-validated facts should pass higher). */
  confidence?: number;
  /** Optional list of entities the fact mentions (for cross-network
   *  router fan-out). Normalised lower-case + deduped before hashing. */
  entities?: ReadonlyArray<string>;
  /** When set, override SHA-256 dedup matching even if the hash exists
   *  (e.g. forced re-confirmation pass). */
  forceInsert?: boolean;
}

export interface AddWorldFactResult {
  id: string;
  hash: string;
  /** True when an existing fact matched by hash and we incremented its
   *  occurrences instead of inserting a new row. */
  deduplicated: boolean;
  /** True when the input was inserted as a new row (false on dedup). */
  inserted: boolean;
}

/**
 * Persistence interface — injected by the production caller (typically
 * `longTermMemory`). Pure module, no direct DB or service import.
 */
export interface WorldFactStore {
  /** Find an existing fact by content hash. Returns null when unknown. */
  findByHash(hash: string): Promise<WorldFact | null>;
  /** Insert a new fact. Returns the assigned id. */
  insert(fact: Omit<WorldFact, 'id'>): Promise<string>;
  /** Bump occurrences + lastConfirmed on an existing fact. */
  bumpOccurrence(id: string, at: Date): Promise<void>;
  /** Search facts by query string. The store decides the matching
   *  strategy (substring / embedding / BM25). */
  search(query: string, limit: number): Promise<ReadonlyArray<WorldFact>>;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Compute the canonical SHA-256 hash for a (content, entities) pair.
 *
 * Normalisation:
 *   - lowercased
 *   - whitespace runs collapsed to single space
 *   - leading / trailing whitespace trimmed
 *   - entities sorted, lowercased, deduped before joining
 *
 * Pure function — same input, same output, no side effects.
 */
export function computeWorldFactHash(
  content: string,
  entities: ReadonlyArray<string> = [],
): string {
  const normContent = String(content ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const normEntities = Array.from(
    new Set(
      entities.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0),
    ),
  ).sort();
  const payload = normContent + '␞' + normEntities.join('␟');
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Add a world-fact to the store. Returns whether the fact was new (inserted)
 * or matched an existing hash (deduplicated → occurrences bumped).
 *
 * Always idempotent under same (content, entities): two calls produce the
 * same hash, second call deduplicates.
 *
 * Composes with the injected `WorldFactStore` so the module is testable
 * with an in-memory implementation and production callers can wire it
 * to long-term-memory.
 */
export async function addWorldFact(
  content: string,
  store: WorldFactStore,
  options: AddWorldFactOptions = {},
): Promise<AddWorldFactResult> {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) {
    throw new Error('addWorldFact: content must be non-empty');
  }
  const confidence = clamp(options.confidence ?? 0.7, 0, 1);
  const entities = normaliseEntities(options.entities ?? []);
  const hash = computeWorldFactHash(trimmed, entities);
  const now = new Date();

  if (!options.forceInsert) {
    const existing = await store.findByHash(hash);
    if (existing) {
      await store.bumpOccurrence(existing.id, now);
      return {
        id: existing.id,
        hash,
        deduplicated: true,
        inserted: false,
      };
    }
  }

  const id = await store.insert({
    content: trimmed,
    entities,
    hash,
    confidence,
    firstSeen: now,
    lastConfirmed: now,
    occurrences: 1,
  });

  return {
    id,
    hash,
    deduplicated: false,
    inserted: true,
  };
}

/**
 * Recall world-facts matching a query.
 *
 * Pure wrapper over `store.search` — sorts by occurrences DESC,
 * confidence DESC as a stability tiebreaker, applies the supplied limit.
 *
 * Optional `requireEntity` filters to facts that mention the supplied
 * entity (case-insensitive).
 */
export async function recallWorldFacts(
  query: string,
  store: WorldFactStore,
  options: { limit?: number; requireEntity?: string } = {},
): Promise<ReadonlyArray<WorldFact>> {
  const limit = Math.max(1, Math.floor(options.limit ?? 10));
  const raw = await store.search(query, limit * 2);

  const filtered = options.requireEntity
    ? raw.filter((f) =>
        f.entities.includes(String(options.requireEntity).trim().toLowerCase()),
      )
    : raw;

  const sorted = [...filtered].sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.id.localeCompare(b.id);
  });

  return sorted.slice(0, limit);
}

// ===========================================================================
// Helpers
// ===========================================================================

function normaliseEntities(entities: ReadonlyArray<string>): string[] {
  return Array.from(
    new Set(
      entities.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0),
    ),
  ).sort();
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

// ===========================================================================
// In-memory reference implementation (used by tests + smoke; production
// caller swaps in the long-term-memory-backed store)
// ===========================================================================

/**
 * Reference implementation of `WorldFactStore` backed by a `Map`. Tests
 * use this to exercise the algorithm without touching the DB. Production
 * callers should NOT use this — they wire to long-term-memory.
 */
export function createInMemoryWorldFactStore(): WorldFactStore & {
  size: () => number;
  snapshot: () => ReadonlyArray<WorldFact>;
} {
  const byId = new Map<string, WorldFact>();
  const idByHash = new Map<string, string>();
  let nextId = 1;

  return {
    async findByHash(hash: string): Promise<WorldFact | null> {
      const id = idByHash.get(hash);
      return id ? (byId.get(id) ?? null) : null;
    },
    async insert(fact: Omit<WorldFact, 'id'>): Promise<string> {
      const id = `wf-${nextId++}`;
      const stored: WorldFact = { ...fact, id };
      byId.set(id, stored);
      idByHash.set(stored.hash, id);
      return id;
    },
    async bumpOccurrence(id: string, at: Date): Promise<void> {
      const fact = byId.get(id);
      if (fact) {
        const updated: WorldFact = {
          ...fact,
          occurrences: fact.occurrences + 1,
          lastConfirmed: at,
        };
        byId.set(id, updated);
      }
    },
    async search(query: string, limit: number): Promise<ReadonlyArray<WorldFact>> {
      const q = String(query ?? '').trim().toLowerCase();
      if (!q) return [];
      const matches: WorldFact[] = [];
      for (const fact of byId.values()) {
        const haystack = (
          fact.content + ' ' + fact.entities.join(' ')
        ).toLowerCase();
        if (haystack.includes(q)) matches.push(fact);
      }
      return matches.slice(0, limit);
    },
    size: () => byId.size,
    snapshot: () => Array.from(byId.values()),
  };
}
