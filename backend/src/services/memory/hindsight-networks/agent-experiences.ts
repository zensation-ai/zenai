/**
 * Hindsight Network 2 — Agent Experiences.
 *
 * Phase H sprint reference: spec § H4 task 2 (Hindsight pattern,
 * LoCoMo ~89.6 % SOTA reference).
 *
 * What "agent experiences" represents
 * -----------------------------------
 * Things that PASSED — concrete events that happened with the user,
 * tagged with ISO-8601 timestamps + entities. Maps onto the existing
 * `episodic_memories` table (already bi-temporal after H1.2 migration).
 * The network's job is to provide a clean retrieval surface for
 * Cat 2 (Temporal) queries — "When did Caroline mention X?",
 * "What happened in our last session?" — without forcing the caller
 * to know the underlying schema.
 *
 * Why a thin wrapper, not a re-implementation
 * -------------------------------------------
 * The existing `episodic_memories` table + `episodic-memory.ts`
 * service already implement:
 *   - bi-temporal storage (event_time + ingest_time after H1.2)
 *   - emotional tagging (PMA Phase 145)
 *   - retrieval by query / time range
 *
 * Network 2 here is the LOGICAL view on top: a focused API surface
 * (`addExperience` / `recallExperiences`) that the cross-network router
 * can target. Pure-algo for entity-tagging + ISO normalisation; injects
 * the persistence layer.
 *
 * Composition with H1
 * -------------------
 * `addExperience` calls into the H1.1 `temporal-normalizer` to coerce
 * loose timestamp strings ("yesterday", "May 8 2024") into the
 * `(iso, precision, anchorIso?)` shape the bi-temporal store expects.
 * This means LoCoMo session timestamps land as proper event_time
 * values without the caller doing date math.
 *
 * @module services/memory/hindsight-networks/agent-experiences
 */

import { normalizeTimestamp, type NormalizedTimestamp } from '../temporal-normalizer';

// ===========================================================================
// Types
// ===========================================================================

/** Network identifier for cross-network-router decisions. */
export const AGENT_EXPERIENCE_NETWORK = 'agent_experiences' as const;

export interface AgentExperience {
  id: string;
  /** What happened — short verb-led summary. */
  summary: string;
  /** Speaker / actor of the experience (case-preserved). */
  actor: string;
  /** Entities mentioned, normalised lower-case + sorted. */
  entities: ReadonlyArray<string>;
  /** Resolved bi-temporal timestamp. */
  eventTime: NormalizedTimestamp;
  /** When we ingested the experience (always now()). */
  ingestTime: Date;
  /** Free-form metadata (session id, conversation id, etc.). */
  metadata: Readonly<Record<string, unknown>>;
}

export interface AddExperienceOptions {
  /** Optional reference time used to resolve relative timestamps
   *  ("yesterday" → reference - 1 day). When omitted, "now" is used. */
  anchor?: Date;
  /** Free-form metadata stored alongside the experience. */
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AddExperienceInput {
  summary: string;
  actor: string;
  /** Loose timestamp string — passed to `normalizeTimestamp`. May be
   *  a date ("2024-05-08"), a phrase ("last week"), an ISO string, etc. */
  rawTimestamp: string;
  /** Optional explicit entity list. When omitted, the module extracts
   *  capitalised non-stop tokens from the summary. */
  entities?: ReadonlyArray<string>;
}

export interface RecallExperienceOptions {
  /** Query string the store will match against summary / metadata. */
  limit?: number;
  /** Filter to experiences mentioning this entity (case-insensitive). */
  requireEntity?: string;
  /** Restrict to experiences whose event_time falls within [from, to].
   *  Either bound may be undefined for an open interval. */
  eventTimeFrom?: Date;
  eventTimeTo?: Date;
}

/**
 * Persistence interface. Production caller wires this to the existing
 * `episodic_memories` table; the in-memory implementation below is for
 * tests + smoke.
 */
export interface AgentExperienceStore {
  /** Insert an experience. Returns the assigned id. */
  insert(experience: Omit<AgentExperience, 'id'>): Promise<string>;
  /** Search by query string + optional time-range / entity filter. */
  search(
    query: string,
    options: { limit: number; from?: Date; to?: Date; entity?: string },
  ): Promise<ReadonlyArray<AgentExperience>>;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Extract capitalised non-stop tokens from text. Used as the default
 * entity-list when the caller doesn't supply one. Pure function.
 *
 * Stop tokens: question words, common articles, leading sentence-caps.
 * Output is normalised lower-case + deduped + sorted.
 */
export function extractEntitiesFromSummary(summary: string): string[] {
  const trimmed = String(summary ?? '').trim();
  if (!trimmed) return [];
  const STOP = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'be',
    'been',
    'but',
    'by',
    'do',
    'does',
    'for',
    'from',
    'had',
    'has',
    'have',
    'i',
    'if',
    'in',
    'is',
    'it',
    'me',
    'my',
    'no',
    'not',
    'of',
    'on',
    'or',
    'so',
    'that',
    'the',
    'their',
    'they',
    'this',
    'to',
    'was',
    'we',
    'were',
    'what',
    'when',
    'where',
    'which',
    'who',
    'why',
    'will',
    'with',
    'you',
  ]);
  const tokens = trimmed.split(/\s+/);
  const out = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[^\p{L}\p{N}]/gu, '');
    if (tok.length < 2) continue;
    // Skip sentence-initial caps that are common stop-words.
    if (i === 0 && STOP.has(tok.toLowerCase())) continue;
    if (STOP.has(tok.toLowerCase())) continue;
    if (/^[A-Z]/.test(tok) && !/^[A-Z]+$/.test(tok)) {
      out.add(tok.toLowerCase());
    }
  }
  return Array.from(out).sort();
}

/**
 * Add an experience. Resolves the loose timestamp via H1.1
 * temporal-normalizer, extracts entities (or uses caller-supplied),
 * persists via the injected store.
 */
export async function addExperience(
  input: AddExperienceInput,
  store: AgentExperienceStore,
  options: AddExperienceOptions = {},
): Promise<{ id: string; eventTime: NormalizedTimestamp }> {
  const summary = String(input.summary ?? '').trim();
  if (!summary) throw new Error('addExperience: summary must be non-empty');

  const actor = String(input.actor ?? '').trim();
  if (!actor) throw new Error('addExperience: actor must be non-empty');

  const eventTime = normalizeTimestamp(input.rawTimestamp, {
    anchor: options.anchor,
  });
  if (!eventTime) {
    throw new Error(
      `addExperience: could not normalise timestamp "${input.rawTimestamp}"`,
    );
  }

  const entitiesRaw = input.entities ?? extractEntitiesFromSummary(summary);
  const entities = normaliseEntities(entitiesRaw);

  const id = await store.insert({
    summary,
    actor,
    entities,
    eventTime,
    ingestTime: new Date(),
    metadata: options.metadata ?? {},
  });

  return { id, eventTime };
}

/**
 * Recall experiences matching the query. Sort by eventTime DESC (most
 * recent first), then by ingestTime DESC as a stability tiebreaker.
 *
 * The store handles the query-matching strategy (substring / embedding
 * / BM25); this wrapper applies the post-filter + sort.
 */
export async function recallExperiences(
  query: string,
  store: AgentExperienceStore,
  options: RecallExperienceOptions = {},
): Promise<ReadonlyArray<AgentExperience>> {
  const limit = Math.max(1, Math.floor(options.limit ?? 10));
  const raw = await store.search(query, {
    limit: limit * 2,
    from: options.eventTimeFrom,
    to: options.eventTimeTo,
    entity: options.requireEntity?.toLowerCase(),
  });

  // Defensive post-filter — some store impls (in-memory, BM25) may not
  // honour the time/entity filter perfectly. Re-apply here so the
  // contract is consistent across implementations.
  const filtered = raw.filter((exp) => {
    const eventDate = new Date(exp.eventTime.iso);
    if (options.eventTimeFrom && eventDate < options.eventTimeFrom) return false;
    if (options.eventTimeTo && eventDate > options.eventTimeTo) return false;
    if (options.requireEntity) {
      const needle = options.requireEntity.toLowerCase();
      if (!exp.entities.includes(needle)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aT = new Date(a.eventTime.iso).getTime();
    const bT = new Date(b.eventTime.iso).getTime();
    if (bT !== aT) return bT - aT;
    return b.ingestTime.getTime() - a.ingestTime.getTime();
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

// ===========================================================================
// In-memory reference implementation
// ===========================================================================

export function createInMemoryAgentExperienceStore(): AgentExperienceStore & {
  size: () => number;
  snapshot: () => ReadonlyArray<AgentExperience>;
} {
  const byId = new Map<string, AgentExperience>();
  let nextId = 1;

  return {
    async insert(experience: Omit<AgentExperience, 'id'>): Promise<string> {
      const id = `exp-${nextId++}`;
      const stored: AgentExperience = { ...experience, id };
      byId.set(id, stored);
      return id;
    },
    async search(
      query: string,
      opts: { limit: number; from?: Date; to?: Date; entity?: string },
    ): Promise<ReadonlyArray<AgentExperience>> {
      const q = String(query ?? '').trim().toLowerCase();
      const matches: AgentExperience[] = [];
      for (const exp of byId.values()) {
        if (q) {
          const haystack = (
            exp.summary +
            ' ' +
            exp.actor +
            ' ' +
            exp.entities.join(' ')
          ).toLowerCase();
          if (!haystack.includes(q)) continue;
        }
        if (opts.from) {
          const d = new Date(exp.eventTime.iso);
          if (d < opts.from) continue;
        }
        if (opts.to) {
          const d = new Date(exp.eventTime.iso);
          if (d > opts.to) continue;
        }
        if (opts.entity) {
          if (!exp.entities.includes(opts.entity)) continue;
        }
        matches.push(exp);
      }
      return matches.slice(0, opts.limit);
    },
    size: () => byId.size,
    snapshot: () => Array.from(byId.values()),
  };
}
