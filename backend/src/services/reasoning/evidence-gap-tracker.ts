/**
 * Evidence-Gap Tracker — MemR3-style explicit retrieval router.
 *
 * Phase H sprint reference: spec § H2 task 3 (MemR3, arXiv:2512.20237).
 *
 * Problem
 * -------
 * The current iterative-retriever (`services/arag/iterative-retriever.ts`)
 * runs a fixed number of retrieval rounds and assembles whatever it
 * gets. There is no representation of "what facts do I still need to
 * answer this question" — so the loop can't tell whether the answer is
 * already supportable or whether one more round would actually help.
 *
 * MemR3 (arXiv:2512.20237) introduces an explicit router with three
 * modes — `retrieve` (run another retrieval round), `reflect` (re-frame
 * the query because the last round was unproductive), and `answer`
 * (we have what we need; stop). The router operates on a structured
 * "what-do-I-still-need" state that tracks required fact slots and the
 * candidates that fill them.
 *
 * What this module gives you
 * --------------------------
 * 1. `EvidenceGapTracker` — stateful container for a single QA loop.
 *    Constructor takes a list of `RequiredFactPattern`s. Each round you
 *    call `ingest(candidates)` to drop in new facts; the tracker
 *    auto-fills gaps using the pattern's `matches` predicate.
 * 2. `decide()` returns the next `RouterAction` based on:
 *      - Are there unfilled gaps? → `retrieve` or `reflect`
 *      - Did the last round bring new evidence? `retrieve` if yes;
 *        `reflect` if not (the same query is unlikely to yield more
 *        than it already did).
 *      - Hit max iterations? → `answer` (give up gracefully).
 *      - All gaps filled? → `answer`.
 * 3. `unfilledGapsPrompt()` produces a short text fragment listing what
 *    the agent still needs — drop it into the next retrieval prompt
 *    or into a reflect-step prompt to drive the LLM toward filling
 *    specific gaps rather than re-running the same query.
 * 4. `coverage()` returns a [0, 1] score: filled / required.
 *
 * Pattern construction
 * --------------------
 * Patterns are caller-supplied. The H2 RAG path will derive them from
 * `temporal-multi-route` decomposition output (one pattern per route)
 * plus `list-completion-agent` analysis (one pattern per expected list
 * item, when the list size can be inferred). For tests and isolated
 * use, patterns can be hand-built — see the test suite.
 *
 * No LLM, no I/O — pure stateful logic. The `matches` predicate is the
 * only domain-specific hook and is supplied per-pattern.
 *
 * @module services/reasoning/evidence-gap-tracker
 */

// ===========================================================================
// Types
// ===========================================================================

/** What the next loop iteration should do. */
export type RouterAction =
  | 'retrieve' // run another retrieval round (with same or refined query)
  | 'reflect'  // last round was unproductive; LLM should re-frame
  | 'answer';  // we have what we need (or hit cap), commit to answering

/** A single piece of evidence the retriever returned. */
export interface EvidenceFact {
  /** Stable identifier — used for dedup across retrieval rounds. */
  id: string;
  /** The fact text (one short sentence is the typical shape). */
  text: string;
  /** Source confidence in [0, 1] — typically the retriever's relevance. */
  confidence: number;
  /** Optional source identifier (memory id, document id, etc.). */
  source?: string;
}

/** A "what do I need to answer this question" pattern. */
export interface RequiredFactPattern {
  /** Coarse type — drives prompt-template selection downstream. */
  kind: 'entity' | 'relation' | 'value' | 'date' | 'list_item' | 'evidence_chunk' | 'other';
  /** Short human-readable description ("the date Caroline mentioned X"). */
  description: string;
  /** Predicate: does this candidate fact fill this slot? Pure function,
   *  caller is free to use any matching strategy (regex, NER, embedding). */
  matches: (fact: EvidenceFact) => boolean;
  /** How many distinct facts can fill this slot? Default 1.
   *  For list-completion patterns, set this to the expected list length
   *  if known (or `Infinity` if unknown — gap stays open until cap). */
  maxFills?: number;
}

/** Snapshot of the tracker's current state. */
export interface GapState {
  /** All slots the question needs filled. */
  required: ReadonlyArray<RequiredFactPattern>;
  /** Map slot description → facts that have filled it (in arrival order). */
  acquired: ReadonlyMap<string, ReadonlyArray<EvidenceFact>>;
  /** The slots that still need at least one fact. */
  unfilled: ReadonlyArray<RequiredFactPattern>;
  /** All facts ingested so far across all rounds (deduped by id). */
  knownFactIds: ReadonlySet<string>;
}

/** What `decide()` returned. */
export interface RouterDecision {
  action: RouterAction;
  /** One short line explaining the choice — for logging / prompt building. */
  reason: string;
  /** Slots that still need filling (empty when action='answer' on success). */
  unfilledGaps: ReadonlyArray<RequiredFactPattern>;
  /** How many ingest() rounds have happened so far. */
  iterationCount: number;
  /** Coverage at the moment of the decision, in [0, 1]. */
  coverage: number;
}

export interface TrackerOptions {
  /** Hard cap on retrieve+reflect rounds combined. Default 5. The MemR3
   *  paper reports diminishing returns past 4–6. */
  maxIterations?: number;
  /** Per-fact confidence floor — facts below this are ignored even if
   *  they would match a pattern. Default 0 (no floor). */
  confidenceFloor?: number;
}

// ===========================================================================
// Implementation
// ===========================================================================

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_CONFIDENCE_FLOOR = 0;

export class EvidenceGapTracker {
  private readonly required: RequiredFactPattern[];
  private readonly maxIterations: number;
  private readonly confidenceFloor: number;
  private readonly acquired: Map<string, EvidenceFact[]> = new Map();
  private readonly knownFactIds: Set<string> = new Set();
  private iterations = 0;
  private newFactsLastRound = 0;

  constructor(required: ReadonlyArray<RequiredFactPattern>, options: TrackerOptions = {}) {
    if (required.length === 0) {
      throw new Error('EvidenceGapTracker: at least one RequiredFactPattern is required');
    }
    // Defensive copy — caller can safely mutate their input array.
    this.required = required.slice();
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.confidenceFloor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR;
    if (this.maxIterations < 1) {
      throw new Error(
        `EvidenceGapTracker: maxIterations must be >= 1; got ${this.maxIterations}`,
      );
    }
    // Initialise empty fact lists for each pattern (keyed by description).
    for (const p of this.required) this.acquired.set(p.description, []);
  }

  /**
   * Drop a batch of candidate facts into the tracker. Each candidate is
   * checked against every unfilled pattern; matches are recorded.
   *
   * Deduped by `fact.id` across rounds — the same fact in two rounds
   * counts once. Facts below `confidenceFloor` are silently dropped.
   *
   * Updates `iterations` (+1 per call) and `newFactsLastRound` (count
   * of facts that were ingested for the first time this call). Both are
   * what `decide()` reads.
   */
  ingest(candidates: ReadonlyArray<EvidenceFact>): void {
    this.iterations++;
    this.newFactsLastRound = 0;
    for (const fact of candidates) {
      if (!fact || !fact.id) continue;
      if (fact.confidence < this.confidenceFloor) continue;
      if (this.knownFactIds.has(fact.id)) continue;
      this.knownFactIds.add(fact.id);
      this.newFactsLastRound++;
      for (const pattern of this.required) {
        const slot = this.acquired.get(pattern.description)!;
        const cap = pattern.maxFills ?? 1;
        if (slot.length >= cap) continue;
        if (pattern.matches(fact)) slot.push(fact);
      }
    }
  }

  /**
   * Decide what the loop should do next. Pure read of internal state —
   * does not mutate.
   */
  decide(): RouterDecision {
    const unfilled = this.unfilledPatterns();
    const cov = this.coverage();
    if (unfilled.length === 0) {
      return {
        action: 'answer',
        reason: 'all required facts acquired',
        unfilledGaps: [],
        iterationCount: this.iterations,
        coverage: cov,
      };
    }
    if (this.iterations >= this.maxIterations) {
      return {
        action: 'answer',
        reason: `reached max iterations (${this.maxIterations}) with ${unfilled.length} gap(s) open`,
        unfilledGaps: unfilled,
        iterationCount: this.iterations,
        coverage: cov,
      };
    }
    // Iterations remain. If the last round produced new evidence, keep
    // retrieving with the same strategy. If not, reflect — the same
    // query won't suddenly give more next time.
    if (this.iterations === 0 || this.newFactsLastRound > 0) {
      return {
        action: 'retrieve',
        reason:
          this.iterations === 0
            ? 'initial retrieval round'
            : `last round added ${this.newFactsLastRound} new fact(s); continue retrieving`,
        unfilledGaps: unfilled,
        iterationCount: this.iterations,
        coverage: cov,
      };
    }
    return {
      action: 'reflect',
      reason: 'last round added no new facts; re-frame the query',
      unfilledGaps: unfilled,
      iterationCount: this.iterations,
      coverage: cov,
    };
  }

  /**
   * Build a short text block listing the unfilled gaps, suitable for
   * pre-pending to a retrieval prompt or a reflect-step prompt.
   *
   * Returns the empty string when nothing is unfilled.
   */
  unfilledGapsPrompt(): string {
    const unfilled = this.unfilledPatterns();
    if (unfilled.length === 0) return '';
    const lines: string[] = ['Still needed to answer:'];
    for (const p of unfilled) {
      const have = this.acquired.get(p.description)!.length;
      const cap = p.maxFills ?? 1;
      lines.push(`  - [${p.kind}] ${p.description}  (have ${have}/${cap})`);
    }
    return lines.join('\n');
  }

  /** Coverage score in [0, 1] — fraction of required slots that are
   *  filled to at least 1 fact. Use this for soft-stop heuristics
   *  ("stop when coverage ≥ 0.8") in addition to the hard router. */
  coverage(): number {
    if (this.required.length === 0) return 1;
    let filled = 0;
    for (const p of this.required) {
      const slot = this.acquired.get(p.description)!;
      if (slot.length > 0) filled++;
    }
    return filled / this.required.length;
  }

  /** Read-only snapshot of the current state. */
  getState(): GapState {
    return {
      required: this.required,
      acquired: this.acquired,
      unfilled: this.unfilledPatterns(),
      knownFactIds: this.knownFactIds,
    };
  }

  /** Reset the tracker for a fresh QA loop. Required patterns and
   *  options are preserved. */
  reset(): void {
    this.iterations = 0;
    this.newFactsLastRound = 0;
    this.knownFactIds.clear();
    for (const p of this.required) this.acquired.get(p.description)!.length = 0;
  }

  // ────────────────────────────────────────────────────────────────────

  private unfilledPatterns(): RequiredFactPattern[] {
    const out: RequiredFactPattern[] = [];
    for (const p of this.required) {
      const slot = this.acquired.get(p.description)!;
      if (slot.length === 0) out.push(p);
    }
    return out;
  }
}
