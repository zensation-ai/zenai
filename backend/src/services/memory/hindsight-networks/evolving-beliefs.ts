/**
 * Hindsight Network 4 — Evolving Beliefs.
 *
 * Phase H sprint reference: spec § H4 task 4 (Hindsight pattern,
 * LoCoMo ~89.6 % SOTA reference).
 *
 * What "evolving beliefs" represents
 * ----------------------------------
 * What the agent BELIEVES about the user / entities — preferences,
 * opinions, uncertain claims that update under new evidence. Different
 * from Network 1 (world facts, objective) and Network 3 (entity
 * summaries, aggregate).
 *
 * Examples:
 *   "Caroline prefers coffee over tea." (preference, confidence 0.7)
 *   "Bob doesn't like crowded restaurants." (preference, 0.6)
 *   "Caroline's birthday is in November." (could be wrong → confidence)
 *
 * Bayesian update with a Beta distribution
 * ----------------------------------------
 * Each belief tracks two counters:
 *   - evidence_for     (Beta α — successes)
 *   - evidence_against (Beta β — failures)
 *
 * Confidence is the posterior mean of Beta(α+1, β+1):
 *   confidence = (α + 1) / (α + β + 2)
 *
 * The +1 priors (Laplace smoothing) avoid 0/0 on first observation
 * and prevent extreme confidence from a single observation.
 *
 * On contradicting evidence, evidence_against increments — confidence
 * drops smoothly. When confidence falls below a threshold, the belief
 * is marked SUPERSEDED rather than deleted (audit trail). A new
 * belief can be linked via supersededBy for chain-of-revision.
 *
 * Why explicit Beta-update (not a simple EMA)
 * -------------------------------------------
 * - Symmetry: confidence in [0, 1] both grows AND shrinks predictably.
 * - Honest uncertainty: 1 evidence_for + 1 evidence_against → 0.50
 *   confidence (rightly cautious), not 0.91 (over-anchored EMA).
 * - Composable with confidence-intervals: future caller can compute
 *   credible intervals from the same (α, β) counters without storing
 *   anything extra.
 *
 * @module services/memory/hindsight-networks/evolving-beliefs
 */

// ===========================================================================
// Types
// ===========================================================================

export const EVOLVING_BELIEF_NETWORK = 'evolving_beliefs' as const;

/** Default confidence below which a belief is marked superseded. */
export const DEFAULT_ABANDONMENT_THRESHOLD = 0.30;

export interface EvolvingBelief {
  /** Stable belief id (UUID-like). */
  beliefId: string;
  /** Entity the belief is about (normalised lower-case). */
  entityId: string;
  /** The claim itself (free-form, agent-rendered). */
  claim: string;
  /** Posterior-mean confidence ∈ [0, 1] (Beta(α+1, β+1)). */
  confidence: number;
  /** Beta α — successes (evidence supporting the claim). */
  evidenceFor: number;
  /** Beta β — failures (evidence against the claim). */
  evidenceAgainst: number;
  /** Last time confidence was recalculated. */
  lastRevised: Date;
  /** When the belief was superseded (null when active). */
  supersededAt: Date | null;
  /** Successor belief id (when this one was replaced). */
  supersededBy: string | null;
}

export type EvidenceDirection = 'for' | 'against';

export interface UpdateEvidenceOptions {
  /** Confidence threshold below which the belief is auto-superseded.
   *  Default `DEFAULT_ABANDONMENT_THRESHOLD` (0.30). Set to 0 to
   *  disable auto-supersession. */
  abandonmentThreshold?: number;
  /** When auto-supersession fires AND a successor claim is supplied,
   *  insert the successor belief and link it. */
  successorClaim?: string;
  /** When auto-supersession fires, the link target id is set on the
   *  superseded belief. Default null. */
  successorBeliefId?: string;
}

export interface BeliefStore {
  /** Read by belief id. */
  getById(beliefId: string): Promise<EvolvingBelief | null>;
  /** List active (non-superseded) beliefs for an entity. */
  listActiveByEntity(entityId: string): Promise<ReadonlyArray<EvolvingBelief>>;
  /** Insert a new belief. Returns the assigned id. */
  insert(belief: Omit<EvolvingBelief, 'beliefId'>): Promise<string>;
  /** Update an existing belief in-place. */
  update(belief: EvolvingBelief): Promise<void>;
}

// ===========================================================================
// Math helpers (pure)
// ===========================================================================

/**
 * Posterior-mean confidence under Beta(α+1, β+1) with Laplace smoothing.
 *
 *   confidence = (α + 1) / (α + β + 2)
 *
 * α = evidence_for, β = evidence_against. The +1 priors keep the first
 * observation centred near 0.50 (not 1.00) and avoid 0/0 on empty.
 *
 * Pure function.
 */
export function computeBeliefConfidence(
  evidenceFor: number,
  evidenceAgainst: number,
): number {
  const a = Math.max(0, Number.isFinite(evidenceFor) ? evidenceFor : 0);
  const b = Math.max(0, Number.isFinite(evidenceAgainst) ? evidenceAgainst : 0);
  return (a + 1) / (a + b + 2);
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Create a fresh belief about an entity. Caller supplies an initial
 * direction (for/against the claim) so the very first observation
 * already nudges confidence above/below 0.50 instead of being a
 * formless 0.50.
 *
 * Pure function.
 */
export function createBelief(
  entityId: string,
  claim: string,
  initialDirection: EvidenceDirection = 'for',
): Omit<EvolvingBelief, 'beliefId'> {
  const norm = String(entityId ?? '').trim().toLowerCase();
  if (!norm) throw new Error('createBelief: entityId must be non-empty');
  const text = String(claim ?? '').trim();
  if (!text) throw new Error('createBelief: claim must be non-empty');
  const evidenceFor = initialDirection === 'for' ? 1 : 0;
  const evidenceAgainst = initialDirection === 'against' ? 1 : 0;
  const now = new Date();
  return {
    entityId: norm,
    claim: text,
    confidence: computeBeliefConfidence(evidenceFor, evidenceAgainst),
    evidenceFor,
    evidenceAgainst,
    lastRevised: now,
    supersededAt: null,
    supersededBy: null,
  };
}

/**
 * Increment evidence in the supplied direction. Returns the new
 * `EvolvingBelief` with updated counters + recomputed confidence.
 *
 * Does NOT auto-supersede here — that's the job of `updateBelief`
 * (the read-apply-write wrapper). Pure function.
 */
export function applyEvidence(
  belief: EvolvingBelief,
  direction: EvidenceDirection,
): EvolvingBelief {
  const inc = direction === 'for' ? 1 : 0;
  const incA = direction === 'against' ? 1 : 0;
  const newFor = belief.evidenceFor + inc;
  const newAgainst = belief.evidenceAgainst + incA;
  return {
    ...belief,
    evidenceFor: newFor,
    evidenceAgainst: newAgainst,
    confidence: computeBeliefConfidence(newFor, newAgainst),
    lastRevised: new Date(),
  };
}

/**
 * Mark a belief as superseded. Returns a NEW belief; input not mutated.
 * Pure function.
 */
export function markSuperseded(
  belief: EvolvingBelief,
  successorBeliefId: string | null,
  at: Date = new Date(),
): EvolvingBelief {
  return {
    ...belief,
    supersededAt: at,
    supersededBy: successorBeliefId,
    lastRevised: at,
  };
}

/**
 * Update a belief with new evidence. Read, apply, write. Returns the
 * new state. When confidence drops below the abandonment threshold,
 * the belief is marked superseded and (optionally) a successor is
 * inserted + linked.
 */
export async function updateBelief(
  beliefId: string,
  direction: EvidenceDirection,
  store: BeliefStore,
  options: UpdateEvidenceOptions = {},
): Promise<EvolvingBelief> {
  const current = await store.getById(beliefId);
  if (!current) {
    throw new Error(`updateBelief: belief ${beliefId} not found`);
  }
  if (current.supersededAt) {
    throw new Error(`updateBelief: belief ${beliefId} is superseded; cannot update`);
  }

  const updated = applyEvidence(current, direction);

  const threshold =
    options.abandonmentThreshold ?? DEFAULT_ABANDONMENT_THRESHOLD;

  // Auto-supersede when confidence drops below threshold AND we've
  // accumulated meaningful evidence (≥ 2 against — single isolated
  // contradiction shouldn't bury a previously-confident belief).
  if (
    threshold > 0 &&
    updated.confidence < threshold &&
    updated.evidenceAgainst >= 2
  ) {
    let successorId: string | null = options.successorBeliefId ?? null;
    if (options.successorClaim && !successorId) {
      const successor = createBelief(updated.entityId, options.successorClaim, 'for');
      successorId = await store.insert(successor);
    }
    const superseded = markSuperseded(updated, successorId);
    await store.update(superseded);
    return superseded;
  }

  await store.update(updated);
  return updated;
}

/**
 * List active beliefs for an entity, sorted by confidence DESC.
 */
export async function listEntityBeliefs(
  entityId: string,
  store: BeliefStore,
  options: { limit?: number; minConfidence?: number } = {},
): Promise<ReadonlyArray<EvolvingBelief>> {
  const norm = String(entityId ?? '').trim().toLowerCase();
  if (!norm) return [];
  const limit = Math.max(1, Math.floor(options.limit ?? 20));
  const minConf = options.minConfidence ?? 0;

  const raw = await store.listActiveByEntity(norm);
  const filtered = raw.filter((b) => b.confidence >= minConf);
  const sorted = [...filtered].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.lastRevised.getTime() - a.lastRevised.getTime();
  });
  return sorted.slice(0, limit);
}

// ===========================================================================
// In-memory reference implementation
// ===========================================================================

export function createInMemoryBeliefStore(): BeliefStore & {
  size: () => number;
  snapshot: () => ReadonlyArray<EvolvingBelief>;
  reset: () => void;
} {
  const byId = new Map<string, EvolvingBelief>();
  let nextId = 1;

  return {
    async getById(beliefId: string): Promise<EvolvingBelief | null> {
      return byId.get(beliefId) ?? null;
    },
    async listActiveByEntity(entityId: string): Promise<ReadonlyArray<EvolvingBelief>> {
      const out: EvolvingBelief[] = [];
      for (const b of byId.values()) {
        if (b.entityId === entityId && b.supersededAt === null) out.push(b);
      }
      return out;
    },
    async insert(belief: Omit<EvolvingBelief, 'beliefId'>): Promise<string> {
      const id = `belief-${nextId++}`;
      byId.set(id, { ...belief, beliefId: id });
      return id;
    },
    async update(belief: EvolvingBelief): Promise<void> {
      byId.set(belief.beliefId, belief);
    },
    size: () => byId.size,
    snapshot: () => Array.from(byId.values()),
    reset: () => {
      byId.clear();
      nextId = 1;
    },
  };
}
