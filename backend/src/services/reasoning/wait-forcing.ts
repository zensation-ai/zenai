/**
 * s1 Wait-Forcing for LoCoMo Cat 1 (Multi-Hop) + Cat 2 (Temporal).
 *
 * Phase H sprint reference: spec § H7 task 1 (s1, arXiv:2501.19393).
 *
 * What s1 actually does
 * ---------------------
 * Muennighoff et al. (2025) show that for reasoning-heavy tasks, simply
 * appending a Wait-token after the model's first chain-of-thought pass
 * forces a second deliberation cycle and adds 5-10 pp accuracy on
 * multi-step problems with no model retraining. The mechanism is
 * test-time compute amplification: the model has more tokens to
 * reconsider whether the first answer was missing a hop or a temporal
 * detail.
 *
 * Why a prompt-level adaptation here
 * ----------------------------------
 * The paper-faithful s1 implementation is multi-turn: generate a first
 * answer, detect the </think> closing token, append the literal "Wait, "
 * string, run a SECOND generation. That's an architectural change that
 * doubles API spend and requires custom streaming. For LoCoMo eval the
 * higher-leverage move is to land a SYSTEM-PROMPT instruction that
 * asks the model to do the same thing in ONE pass: produce a first
 * analytical pass, pause, reconsider, then answer.
 *
 * Two production-relevant outcomes:
 *   - Cat 1 (Multi-Hop) — model is asked to re-check whether all
 *     supporting hops are present in the answer.
 *   - Cat 2 (Temporal)  — model is asked to re-check date precision
 *     and event ordering before responding.
 *
 * Cat 3 (Open-domain) and Cat 4 (Single-Hop) are NOT augmented — single-
 * hop questions don't benefit from extra deliberation, and open-domain
 * already triggers other RAG-side machinery.
 *
 * The verbatim INSTRUCTION_TEMPLATE is exported as a top-level constant
 * for byte-equal eval-harness comparison (matching the H0/H1.6 verbatim
 * convention).
 *
 * Pure module: no DB, no LLM, no logger. Production callers compose.
 *
 * @module services/reasoning/wait-forcing
 */

// ===========================================================================
// Types
// ===========================================================================

/**
 * LoCoMo question category, indexed as in `experiments/data/locomo.json`.
 * Note the JSON's numbering differs from the Mem0 paper prose — this
 * module follows the JSON convention to stay consistent with the rest
 * of the eval pipeline (see CLAUDE.md memory note on the numbering trap).
 *
 *  - 1 = Multi-Hop
 *  - 2 = Temporal
 *  - 3 = Open-Domain
 *  - 4 = Single-Hop
 *  - 5 = Adversarial (excluded from Mem0 leaderboard)
 */
export type LoCoMoCategory = 'multi_hop' | 'temporal' | 'open_domain' | 'single_hop' | 'adversarial' | 'unknown';

export interface CategoryDetectionResult {
  /** Predicted category. */
  category: LoCoMoCategory;
  /** Per-cue contributor breakdown for observability and debugging. */
  contributors: Readonly<Record<string, number>>;
  /** Confidence in [0, 1]. Higher = more cues agreed. */
  confidence: number;
}

export interface WaitForcingOptions {
  /** When true, return the augmented prompt; otherwise return input
   *  unchanged. Resolved against the env-flag by the production caller. */
  enable?: boolean;
  /** Categories that should trigger wait-forcing. Default
   *  ['multi_hop', 'temporal'] per spec § H7 task 1. */
  triggerCategories?: ReadonlyArray<LoCoMoCategory>;
  /** Override the verbatim instruction template. Default
   *  `WAIT_FORCING_INSTRUCTION_TEMPLATE`. */
  template?: string;
  /** Substitution map for `{{key}}` placeholders inside the template. */
  variables?: Readonly<Record<string, string>>;
}

// ===========================================================================
// Verbatim templates (top-level exports for byte-equal eval comparison)
// ===========================================================================

/**
 * Default wait-forcing instruction. Appended to the system prompt when
 * the detected category is one of the trigger categories.
 *
 * Substitution variables:
 *   - {{category}} — human-readable category name (Multi-Hop / Temporal)
 *   - {{focus}}    — what to re-check (hops / dates and ordering)
 *
 * The phrasing is deliberate:
 *   - "First analytical pass" mirrors s1's chain-of-thought structure.
 *   - "Pause and reconsider" mirrors the literal "Wait, " token.
 *   - "Specifically check" gives the model a concrete second-pass focus,
 *     which is what s1's appended-token does at the token level.
 */
export const WAIT_FORCING_INSTRUCTION_TEMPLATE =
  '\n\n[REASONING DISCIPLINE — {{category}}]\n' +
  'This is a {{category}} question. Take extra time to think carefully:\n' +
  '1. Produce a first analytical pass through the question.\n' +
  '2. Pause and reconsider — ask yourself "Wait, let me think more carefully."\n' +
  '3. Specifically check: {{focus}}.\n' +
  '4. Only then commit to your final answer.';

/** Per-category focus text substituted into `{{focus}}`. */
export const WAIT_FORCING_FOCUS_BY_CATEGORY: Readonly<Record<LoCoMoCategory, string>> = {
  multi_hop:
    'have I followed every supporting hop, or did I skip an intermediate step',
  temporal:
    'are dates precise to the right granularity, and is the event ordering correct',
  open_domain: 'is my answer grounded in the retrieved evidence',
  single_hop: 'is the single supporting fact actually present in the conversation',
  adversarial: 'am I confidently asserting something the conversation does not support',
  unknown: 'is the answer grounded in the supplied conversation',
};

/** Per-category human-readable label substituted into `{{category}}`. */
export const WAIT_FORCING_LABEL_BY_CATEGORY: Readonly<Record<LoCoMoCategory, string>> = {
  multi_hop: 'Multi-Hop',
  temporal: 'Temporal',
  open_domain: 'Open-Domain',
  single_hop: 'Single-Hop',
  adversarial: 'Adversarial',
  unknown: 'Reasoning',
};

// ===========================================================================
// Cue patterns
// ===========================================================================

/** Multi-hop indicators: comparison, count, list, "and ... and", multi-entity. */
const MULTI_HOP_PATTERNS: ReadonlyArray<RegExp> = [
  /\bhow\s+many\b/i,
  /\bhow\s+much\b/i,
  /\blist\s+all\b/i,
  /\bwhich\s+of\b/i,
  /\beach\s+of\b/i,
  /\bevery\b/i,
  /\bcompared\s+to\b/i,
  /\bdifference\s+between\b/i,
  /\bversus\b|\bvs\.?\b/i,
  /\bamong\b/i,
  /\bbetween\b/i,
  /\bboth\b/i,
];

/** Temporal indicators: dates, ordering, durations, recency anchors. */
const TEMPORAL_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(yesterday|today|tomorrow)\b/i,
  /\blast\s+(year|month|week|day|night)\b/i,
  /\bnext\s+(year|month|week|day)\b/i,
  /\b(years?|months?|weeks?|days?|hours?)\s+ago\b/i,
  /\bin\s+the\s+(past|future)\b/i,
  /\bhow\s+long\s+ago\b/i,
  /\bwhen\s+did\b/i,
  /\bwhen\s+was\b/i,
  /\bbefore\b/i,
  /\bafter\b/i,
  /\bsince\b/i,
  /\bduring\b/i,
  /\b(first|earliest|latest|recently)\b/i,
  /\b(\d{4})\b/, // four-digit year
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i,
];

/** Adversarial / abstention indicators (weakly, mostly informational). */
const ADVERSARIAL_PATTERNS: ReadonlyArray<RegExp> = [
  /\bif\s+at\s+all\b/i,
  /\bnever\b/i,
  /\bnot\s+mentioned\b/i,
  /\bdid\s+not\b/i,
  /\bdidn'?t\b/i,
];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Detect the LoCoMo category of a question via heuristic regex cues.
 *
 * Decision policy (cue-count tiebreak):
 *   - If multi-hop and temporal both fire ≥ 2 cues → multi-hop wins
 *     (multi-hop dominates because it usually subsumes temporal-style
 *     reasoning when both are present).
 *   - If temporal fires AT LEAST ONE cue alone → temporal.
 *   - If multi-hop fires AT LEAST ONE cue alone → multi-hop.
 *   - If adversarial fires alone → adversarial.
 *   - If question word + entity present → single_hop.
 *   - Otherwise → open_domain.
 *
 * Pure function — same input, same output, no side effects.
 */
export function detectLoCoMoCategory(query: string): CategoryDetectionResult {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) {
    return {
      category: 'unknown',
      contributors: { empty: 0 },
      confidence: 0,
    };
  }

  const multiCount = MULTI_HOP_PATTERNS.filter((p) => p.test(trimmed)).length;
  const temporalCount = TEMPORAL_PATTERNS.filter((p) => p.test(trimmed)).length;
  const adversarialCount = ADVERSARIAL_PATTERNS.filter((p) => p.test(trimmed)).length;

  const contributors: Record<string, number> = {
    multi_hop_cues: multiCount,
    temporal_cues: temporalCount,
    adversarial_cues: adversarialCount,
  };

  // Combined dominance: both fire ≥ 2 → multi-hop wins (covers the
  // "How many times did Caroline mention X before May 2024?" shape).
  if (multiCount >= 2 && temporalCount >= 2) {
    const c = clamp((multiCount + temporalCount) / 6, 0.5, 1);
    return { category: 'multi_hop', contributors, confidence: c };
  }

  // Temporal dominance: ≥ 1 temporal cue, ≤ 1 multi-hop cue → temporal.
  if (temporalCount >= 1 && multiCount <= 1) {
    return {
      category: 'temporal',
      contributors,
      confidence: clamp(temporalCount / 4, 0.3, 1),
    };
  }

  // Multi-hop dominance: ≥ 1 multi-hop cue, ≤ 1 temporal cue → multi-hop.
  if (multiCount >= 1) {
    return {
      category: 'multi_hop',
      contributors,
      confidence: clamp(multiCount / 4, 0.3, 1),
    };
  }

  // Both ≥ 1 but neither dominant — fall back to multi-hop because the
  // mixed pattern still benefits from the wait-forcing reconsideration.
  if (temporalCount >= 1) {
    return {
      category: 'temporal',
      contributors,
      confidence: 0.4,
    };
  }

  // Adversarial fallback — only when no other signal is present.
  if (adversarialCount >= 1) {
    return {
      category: 'adversarial',
      contributors,
      confidence: clamp(adversarialCount / 3, 0.3, 0.8),
    };
  }

  // Single-hop fallback: question-word + at least one capitalised entity.
  const hasQuestionHead = /^\s*(when|where|what|which|who|whom|whose|why|how)\b/i.test(trimmed);
  const hasEntity = /\b[A-Z][a-z]{2,}\b/.test(trimmed);
  if (hasQuestionHead && hasEntity) {
    return {
      category: 'single_hop',
      contributors,
      confidence: 0.5,
    };
  }

  // Otherwise treat as open-domain.
  return {
    category: 'open_domain',
    contributors,
    confidence: 0.3,
  };
}

/**
 * Build the wait-forcing instruction snippet for a given category.
 *
 * Returns the empty string when the category is not in the trigger
 * list. Substitutes `{{category}}` and `{{focus}}` from the per-category
 * tables; additional callerâ€‘supplied variables override the defaults.
 *
 * Pure function.
 */
export function buildWaitForcingInstruction(
  category: LoCoMoCategory,
  options: { triggerCategories?: ReadonlyArray<LoCoMoCategory>; template?: string; variables?: Readonly<Record<string, string>> } = {},
): string {
  const triggers = options.triggerCategories ?? DEFAULT_TRIGGER_CATEGORIES;
  if (!triggers.includes(category)) return '';

  const tpl = options.template ?? WAIT_FORCING_INSTRUCTION_TEMPLATE;
  const baseVars: Record<string, string> = {
    category: WAIT_FORCING_LABEL_BY_CATEGORY[category],
    focus: WAIT_FORCING_FOCUS_BY_CATEGORY[category],
  };
  const vars = { ...baseVars, ...(options.variables ?? {}) };
  return substituteVariables(tpl, vars);
}

/**
 * Compose `applyWaitForcingToSystemPrompt`: detect category, build the
 * instruction snippet, and append it to the system prompt when the
 * gate is open.
 *
 * Returns the input prompt unchanged when:
 *   - `options.enable` is falsy.
 *   - Detected category is NOT in `triggerCategories`.
 *   - Detected category is `unknown` (empty query).
 *
 * Returns `{ prompt, applied, category, confidence }` so the caller
 * can log or surface the decision in observability output.
 */
export function applyWaitForcingToSystemPrompt(
  systemPrompt: string,
  query: string,
  options: WaitForcingOptions = {},
): { prompt: string; applied: boolean; category: LoCoMoCategory; confidence: number } {
  const enable = options.enable ?? false;
  const detection = detectLoCoMoCategory(query);
  if (!enable) {
    return {
      prompt: systemPrompt,
      applied: false,
      category: detection.category,
      confidence: detection.confidence,
    };
  }
  const snippet = buildWaitForcingInstruction(detection.category, {
    triggerCategories: options.triggerCategories,
    template: options.template,
    variables: options.variables,
  });
  if (!snippet) {
    return {
      prompt: systemPrompt,
      applied: false,
      category: detection.category,
      confidence: detection.confidence,
    };
  }
  return {
    prompt: systemPrompt + snippet,
    applied: true,
    category: detection.category,
    confidence: detection.confidence,
  };
}

// ===========================================================================
// Defaults + helpers
// ===========================================================================

/** Default trigger categories per spec § H7 task 1. */
export const DEFAULT_TRIGGER_CATEGORIES: ReadonlyArray<LoCoMoCategory> = ['multi_hop', 'temporal'];

function substituteVariables(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const key of Object.keys(vars)) {
    out = out.split('{{' + key + '}}').join(vars[key] ?? '');
  }
  return out;
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
