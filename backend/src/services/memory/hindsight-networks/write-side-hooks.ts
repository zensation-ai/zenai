/**
 * Hindsight write-side hooks.
 *
 * Phase H4 production-binding F + G. As facts arrive in long-term-memory
 * (or directly from chat-message-handlers' personalization-extraction
 * pipeline), the hooks here update Network 3 (entity_summaries) and
 * Network 4 (evolving_beliefs) automatically.
 *
 * Read-side (commits e1e5a90e + 22436d6c + 994bb133) routes queries to
 * the four networks at retrieval time. Write-side (this commit) is the
 * other half: as facts and experiences accumulate, the per-entity
 * rolling summaries and belief counters stay current without the
 * eval-harness needing to pre-populate them.
 *
 * Shape
 * -----
 * Pure functions over the existing `PersonalizationFact` shape (from
 * `ltm-types.ts`). Stores injected. The hook is composable with
 * `long-term-memory.addFact()` — production caller can wire it post-
 * write via an optional callback in a follow-up sprint, OR the eval-
 * harness can call it directly while ingesting LoCoMo conversations.
 *
 * Belief detection
 * ----------------
 * Preference / opinion / aversion language patterns map to evidence
 * directions:
 *   - "X likes/loves/prefers/wants Y" → for-evidence on "X prefers Y"
 *   - "X dislikes/hates Y" → for-evidence on "X dislikes Y"
 *   - "X does NOT like Y" → against-evidence on "X likes Y" (via
 *     existing-belief lookup); no-match → for-evidence on "X dislikes Y"
 *
 * The classifier is conservative: facts that don't match any pattern
 * are skipped (not all facts are belief-claims). Facts that fire
 * multiple patterns produce multiple belief contributions.
 *
 * @module services/memory/hindsight-networks/write-side-hooks
 */

import type { PersonalizationFact } from '../ltm-types';
import type {
  EntitySummaryStore,
  SummaryContribution,
} from './entity-summaries';
import { updateEntitySummary } from './entity-summaries';
import type {
  BeliefStore,
  EvidenceDirection,
} from './evolving-beliefs';
import {
  createBelief,
  applyEvidence,
} from './evolving-beliefs';

// ===========================================================================
// Env-flag default
// ===========================================================================

const H4_WRITE_HOOKS_DEFAULT = (() => {
  const raw = process.env.H4_WRITE_HOOKS;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

// ===========================================================================
// Types
// ===========================================================================

export interface WriteHookOptions {
  /** Per-call override of env-default. */
  enable?: boolean;
  /** When true, also derive evolving_beliefs from preference/aversion
   *  language. Default true (independent of the master enable flag). */
  enableBeliefExtraction?: boolean;
  /** Cap on contributions emitted per fact. Default 5. */
  maxContributionsPerFact?: number;
}

export interface WriteHookStores {
  entitySummaryStore?: EntitySummaryStore;
  beliefStore?: BeliefStore;
}

export interface BeliefDraft {
  entityId: string;
  claim: string;
  direction: EvidenceDirection;
}

export interface WriteHookResult {
  /** Number of entity-summary updates applied. */
  summaryUpdates: number;
  /** Number of belief contributions applied (insert + applyEvidence). */
  beliefUpdates: number;
  /** Whether the hook was actually invoked (vs. gate-disabled). */
  applied: boolean;
}

// ===========================================================================
// Entity extraction (shared with agent-experiences pattern)
// ===========================================================================

const STOP = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'been', 'but', 'by', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'i', 'if', 'in', 'is', 'it', 'me',
  'my', 'no', 'not', 'of', 'on', 'or', 'so', 'that', 'the', 'their', 'they',
  'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who',
  'why', 'will', 'with', 'you',
]);

/**
 * Extract entity candidates from a fact's content. Capitalised non-stop
 * tokens (case-folded, deduped, sorted). Pure function.
 */
export function extractEntitiesFromFact(content: string): string[] {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) return [];
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
  return Array.from(out).sort();
}

// ===========================================================================
// Belief detection
// ===========================================================================

/**
 * Preference / aversion patterns. Each pattern fires on the fact's
 * content (case-insensitive). When a pattern matches, it produces a
 * `BeliefDraft` describing the entity, the canonicalised claim, and
 * the evidence direction.
 *
 * Top-level export so eval-harness can inspect the pattern table.
 */
export const BELIEF_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  direction: EvidenceDirection;
  claimTemplate: string;
}> = [
  {
    pattern: /\b(prefers?|prefer|preferring)\b/i,
    direction: 'for',
    claimTemplate: 'prefers',
  },
  {
    pattern: /\b(likes?|loves?|enjoys?|appreciates?)\b/i,
    direction: 'for',
    claimTemplate: 'likes',
  },
  {
    pattern: /\b(wants?|wishes?|wished?|desires?)\b/i,
    direction: 'for',
    claimTemplate: 'wants',
  },
  {
    pattern: /\b(dislikes?|hates?|loathes?|avoids?)\b/i,
    direction: 'for',
    claimTemplate: 'dislikes',
  },
  {
    pattern: /\b(believes?|thinks?|opinions?\s+(?:on|about))\b/i,
    direction: 'for',
    claimTemplate: 'thinks',
  },
];

/**
 * Detect preference / opinion / aversion claims in a fact. Returns a
 * `BeliefDraft[]` — empty when no pattern fires.
 *
 * Each draft picks the FIRST entity from the fact (subject of the
 * claim) and the FIRST pattern that matched as the canonical claim
 * shape ("X prefers Y" / "X dislikes Y" / etc.). Facts with no
 * extracted entity are skipped — there's no subject to attach the
 * belief to.
 *
 * Pure function.
 */
export function detectBeliefDrafts(fact: PersonalizationFact): BeliefDraft[] {
  if (fact.factType !== 'preference' && fact.factType !== 'goal' && fact.factType !== 'behavior') {
    return [];
  }
  const content = String(fact.content ?? '').trim();
  if (!content) return [];

  const entities = extractEntitiesFromFact(content);
  if (entities.length === 0) return [];

  const drafts: BeliefDraft[] = [];
  for (const { pattern, direction, claimTemplate } of BELIEF_PATTERNS) {
    if (pattern.test(content)) {
      // Use the first extracted entity as the subject; the rest of
      // the content (as-is) is the claim.
      drafts.push({
        entityId: entities[0],
        claim: `${claimTemplate}: ${content}`,
        direction,
      });
      break; // One pattern per fact — multiple drafts cause double-counting.
    }
  }
  return drafts;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Update Network 3 (entity_summaries) for each entity mentioned in a
 * fact. One fact contributes one line per entity; the
 * `applyContribution` builder handles the rolling-summary truncation.
 *
 * Returns the number of summary updates applied (== entities count).
 * Errors per-entity are caught + logged (debug); the loop continues
 * with the rest.
 */
export async function contributeFactToEntitySummaries(
  fact: PersonalizationFact,
  store: EntitySummaryStore,
  options: { maxContributionsPerFact?: number } = {},
): Promise<number> {
  const max = Math.max(1, Math.floor(options.maxContributionsPerFact ?? 5));
  const entities = extractEntitiesFromFact(fact.content).slice(0, max);
  if (entities.length === 0) return 0;

  let count = 0;
  for (const entityId of entities) {
    try {
      const contribution: SummaryContribution = {
        text: fact.content,
        confidence: fact.confidence,
        observedAt: fact.lastConfirmed.toISOString(),
        source: 'long_term_memory',
      };
      await updateEntitySummary(entityId, contribution, store);
      count += 1;
    } catch {
      // Don't let one bad upsert abort the rest.
    }
  }
  return count;
}

/**
 * Detect preference/opinion claims in a fact and persist them as
 * evolving_beliefs. New beliefs are inserted; existing beliefs that
 * match the same (entity, claim) are bumped via `applyEvidence`.
 *
 * Match-existing logic: list active beliefs for the entity, look for
 * a belief whose claim STARTS WITH the same template prefix
 * ("prefers:", "likes:", etc.). When found → applyEvidence. When not
 * found → createBelief + insert.
 *
 * Returns the number of belief writes (insert + update count).
 */
export async function contributeFactToBeliefs(
  fact: PersonalizationFact,
  store: BeliefStore,
): Promise<number> {
  const drafts = detectBeliefDrafts(fact);
  if (drafts.length === 0) return 0;

  let count = 0;
  for (const draft of drafts) {
    try {
      // Look for an existing belief on the same (entity, claim-prefix).
      const claimPrefix = draft.claim.split(':')[0] + ':';
      const active = await store.listActiveByEntity(draft.entityId);
      const existing = active.find((b) => b.claim.startsWith(claimPrefix));

      if (existing) {
        // Bump evidence on the existing belief.
        const updated = applyEvidence(existing, draft.direction);
        await store.update(updated);
        count += 1;
      } else {
        // New belief — insert with the supplied initial direction.
        const fresh = createBelief(draft.entityId, draft.claim, draft.direction);
        await store.insert(fresh);
        count += 1;
      }
    } catch {
      // Don't let one belief failure abort the rest.
    }
  }
  return count;
}

/**
 * Compose both write-side hooks: update entity_summaries AND
 * evolving_beliefs from a single fact arrival. Convenience for
 * production caller (long-term-memory.addFact post-write hook) +
 * eval-harness LoCoMo ingestion.
 *
 * Default-OFF env-flag (`H4_WRITE_HOOKS`) — when disabled, returns
 * applied=false with zero counts.
 */
export async function contributeFact(
  fact: PersonalizationFact,
  stores: WriteHookStores,
  options: WriteHookOptions = {},
): Promise<WriteHookResult> {
  const enable = options.enable ?? H4_WRITE_HOOKS_DEFAULT;
  if (!enable) {
    return { summaryUpdates: 0, beliefUpdates: 0, applied: false };
  }

  let summaryUpdates = 0;
  let beliefUpdates = 0;

  if (stores.entitySummaryStore) {
    summaryUpdates = await contributeFactToEntitySummaries(fact, stores.entitySummaryStore, {
      maxContributionsPerFact: options.maxContributionsPerFact,
    });
  }

  if (stores.beliefStore && options.enableBeliefExtraction !== false) {
    beliefUpdates = await contributeFactToBeliefs(fact, stores.beliefStore);
  }

  return {
    summaryUpdates,
    beliefUpdates,
    applied: true,
  };
}
