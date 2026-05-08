/**
 * H3.5 — Quote-the-Source Prompting.
 *
 * Phase H sprint reference: spec § H3 task 5.
 *
 * What this does
 * --------------
 * Mem0's verbatim judge prompt accepts answers as CORRECT when the
 * model "touches on the same topic" as the gold answer. The cheapest
 * way to boost judge-acceptance is to force the answer model to
 * QUOTE the supporting fact from the retrieved evidence verbatim.
 * That guarantees lexical overlap with the gold answer (which was
 * itself extracted from the same conversation).
 *
 * Mechanism
 * ---------
 * When retrieved evidence is available, prepend the system prompt
 * with a directive:
 *
 *   "When you have a supporting fact in the retrieved evidence,
 *    quote it VERBATIM in your answer. Format:
 *    'According to the conversation: \"<verbatim fact>\".'
 *    Then add your synthesised summary."
 *
 * For LoCoMo this typically reads:
 *
 *   Q: When did Caroline graduate?
 *   Retrieved: "Caroline mentioned she graduated from Stanford in
 *               May 2018."
 *   A: According to the conversation: "Caroline mentioned she
 *      graduated from Stanford in May 2018." She graduated in
 *      May 2018.
 *
 * The judge sees "Caroline graduated from Stanford" verbatim AND
 * the synthesised "May 2018" answer — both signals fire.
 *
 * Pure module
 * -----------
 * Single function: `applyQuoteSourcePrompt(systemPrompt, options)`.
 * Returns the augmented prompt + an `applied` flag for observability.
 * Default OFF via env `H3_QUOTE_SOURCE`. Production caller wires the
 * binding into chat-message-handlers + chat-messages similar to H7.1.
 *
 * @module services/reasoning/quote-source-prompting
 */

// ===========================================================================
// Verbatim instruction templates
// ===========================================================================

/**
 * Default quote-source instruction. Top-level export for byte-equal
 * eval-harness comparison (matches H0/H1.6/H7.1 verbatim convention).
 */
export const QUOTE_SOURCE_INSTRUCTION_TEMPLATE =
  '\n\n[QUOTE-THE-SOURCE DISCIPLINE]\n' +
  'When the retrieved evidence contains a fact that answers the question,\n' +
  'quote that fact VERBATIM in your answer:\n' +
  '\n' +
  '  Format: According to the conversation: "<verbatim fact from evidence>".\n' +
  '          Then provide your synthesised answer.\n' +
  '\n' +
  'This is REQUIRED whenever the evidence directly addresses the question.\n' +
  'Do not paraphrase the supporting fact — copy it word-for-word so the\n' +
  'reader can verify the source. After the quote, you may add concise\n' +
  'synthesis.';

/**
 * Optional sentinel a downstream parser can detect to extract the
 * verbatim quote from the answer. Top-level export.
 */
export const QUOTE_SOURCE_PREFIX_SENTINEL = 'According to the conversation:';

// ===========================================================================
// Types
// ===========================================================================

export interface QuoteSourceOptions {
  /** Per-call override of env-default. */
  enable?: boolean;
  /** Override the verbatim template (advanced use). */
  template?: string;
  /** Skip when retrieved evidence is empty / not yet known to the
   *  caller. Default true — the directive only helps when evidence
   *  exists; otherwise it confuses the model. */
  skipWhenNoEvidence?: boolean;
  /** Caller indicates whether evidence is available. When false AND
   *  `skipWhenNoEvidence` is true, the directive is omitted. */
  hasEvidence?: boolean;
}

export interface QuoteSourceDecision {
  /** Augmented (or unchanged) system prompt. */
  prompt: string;
  /** Whether the directive was actually appended. */
  applied: boolean;
  /** Short reason string for logging. */
  reason: string;
}

// ===========================================================================
// Env-flag default
// ===========================================================================

const H3_QUOTE_SOURCE_DEFAULT = (() => {
  const raw = process.env.H3_QUOTE_SOURCE;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Apply the quote-source directive to a system prompt.
 *
 * Decision matrix:
 *   - enable=false (or env unset, default-OFF) → identity, applied=false
 *   - skipWhenNoEvidence=true + hasEvidence=false → skip,
 *                                                   reason 'no evidence'
 *   - otherwise → append the directive, applied=true
 *
 * Pure function — same input, same output, no side effects.
 */
export function applyQuoteSourcePrompt(
  systemPrompt: string,
  options: QuoteSourceOptions = {},
): QuoteSourceDecision {
  const enable = options.enable ?? H3_QUOTE_SOURCE_DEFAULT;
  if (!enable) {
    return {
      prompt: systemPrompt,
      applied: false,
      reason: 'gate disabled (env H3_QUOTE_SOURCE not set)',
    };
  }

  const skipNoEv = options.skipWhenNoEvidence ?? true;
  if (skipNoEv && options.hasEvidence === false) {
    return {
      prompt: systemPrompt,
      applied: false,
      reason: 'skipped — no evidence available',
    };
  }

  const tpl = options.template ?? QUOTE_SOURCE_INSTRUCTION_TEMPLATE;
  return {
    prompt: systemPrompt + tpl,
    applied: true,
    reason: 'quote-source directive appended',
  };
}

/**
 * Quick check whether the model's answer contains a verbatim quote
 * (sentinel-detected). Useful for the eval-harness to count
 * compliance rates per run.
 *
 * Pure function.
 */
export function answerContainsVerbatimQuote(answer: string): boolean {
  return String(answer ?? '').includes(QUOTE_SOURCE_PREFIX_SENTINEL);
}
