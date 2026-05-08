/**
 * Prompt Sanitizer — Sprint 1.4, Security Week 4
 *
 * Complements `middleware/input-screening.ts` (which *detects* injection attempts
 * and tags the request) with a sanitization pass that *strips* model-specific
 * control tokens from user-supplied text before it reaches the LLM.
 *
 * Why a separate layer?
 * - Input-screening is a heuristic scorer — it may allow suspicious content
 *   through (by design: false positives would break legitimate tool use).
 * - Prompt-sanitizer removes known-unsafe markers unconditionally — a user
 *   typing `<|im_start|>system` should never actually see those tokens reach
 *   the model, regardless of the screening score.
 *
 * Scope: conservative stripping only. We do NOT try to detect semantic jailbreak
 * attempts ("ignore previous instructions ...") — that's the detection layer's
 * job. We DO strip control tokens and system-prompt-delimiter-lookalikes that
 * have no legitimate reason to appear in user text.
 *
 * @module services/security/prompt-sanitizer
 */

/**
 * Well-known model control tokens that should never appear in user-submitted
 * text. Each entry is a regex + a short, stable name used in `patternsHit`.
 * Patterns use `g` flag so multiple occurrences are all replaced.
 */
interface ControlTokenPattern {
  /** Stable identifier surfaced in `patternsHit`. */
  name: string;
  /** Regex matched against the raw input. */
  pattern: RegExp;
}

const CONTROL_TOKEN_PATTERNS: readonly ControlTokenPattern[] = [
  // ChatML (OpenAI) style delimiters
  { name: 'chatml_im_start', pattern: /<\|im_start\|>/gi },
  { name: 'chatml_im_end', pattern: /<\|im_end\|>/gi },
  { name: 'chatml_endoftext', pattern: /<\|endoftext\|>/gi },

  // Llama / Mistral instruction tokens
  { name: 'inst_open', pattern: /\[INST\]/gi },
  { name: 'inst_close', pattern: /\[\/INST\]/gi },
  { name: 'sys_open', pattern: /<<SYS>>/gi },
  { name: 'sys_close', pattern: /<<\/SYS>>/gi },

  // Anthropic legacy tokens (current API doesn't use these, but older clients might)
  { name: 'human_turn', pattern: /\n\nHuman:/gi },
  { name: 'assistant_turn', pattern: /\n\nAssistant:/gi },

  // HTML-style pseudo-system tags (common jailbreak pattern)
  { name: 'html_system_open', pattern: /<\s*system\s*>/gi },
  { name: 'html_system_close', pattern: /<\s*\/\s*system\s*>/gi },

  // Markdown-header style system impersonation (e.g. "### System:")
  // Matches at line start with optional whitespace; only for exact "system" / "instruction" labels.
  {
    name: 'md_header_system',
    pattern: /^\s{0,4}#{1,6}\s*(system|instruction|assistant|human)\s*:/gim,
  },

  // JSON role-injection ("role": "system") embedded in user text
  {
    name: 'json_role_system',
    pattern: /"role"\s*:\s*"(system|assistant|tool)"/gi,
  },
];

/** Character used to replace stripped tokens (empty string deletes them). */
const REPLACEMENT = '';

/** Upper bound on input size to keep sanitization cheap (64 KB). */
const MAX_INPUT_BYTES = 64 * 1024;

export interface SanitizeResult {
  /** Input with all control tokens stripped. Identical to input if none hit. */
  sanitized: string;
  /** Names of patterns that matched (stable identifiers, safe to log). */
  patternsHit: string[];
  /** True if any pattern matched (shortcut for `patternsHit.length > 0`). */
  modified: boolean;
  /** True if input was truncated to `MAX_INPUT_BYTES`. */
  truncated: boolean;
}

/**
 * Sanitize a user-supplied string by stripping known control tokens.
 *
 * Idempotent: `sanitizePrompt(sanitizePrompt(x).sanitized).sanitized === sanitizePrompt(x).sanitized`.
 * Safe for non-string inputs: returns `{ sanitized: '', patternsHit: [], modified: false, truncated: false }`.
 */
export function sanitizePrompt(input: unknown): SanitizeResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { sanitized: '', patternsHit: [], modified: false, truncated: false };
  }

  let working = input;
  let truncated = false;

  // Truncate excessively large inputs before running regexes — keeps worst-case
  // sanitize cost bounded even under adversarial input.
  if (Buffer.byteLength(working, 'utf8') > MAX_INPUT_BYTES) {
    working = working.slice(0, MAX_INPUT_BYTES);
    truncated = true;
  }

  const patternsHit: string[] = [];

  for (const { name, pattern } of CONTROL_TOKEN_PATTERNS) {
    // `pattern.test()` mutates lastIndex on `/g` regexes — we use `.match()`
    // which is state-free and returns null/array.
    const matches = working.match(pattern);
    if (matches && matches.length > 0) {
      patternsHit.push(name);
      working = working.replace(pattern, REPLACEMENT);
    }
  }

  return {
    sanitized: working,
    patternsHit,
    modified: patternsHit.length > 0 || truncated,
    truncated,
  };
}

/**
 * Convenience: sanitize and return only the cleaned string. Prefer
 * `sanitizePrompt()` when you also need `patternsHit` for telemetry.
 */
export function sanitizePromptString(input: unknown): string {
  return sanitizePrompt(input).sanitized;
}

/** Exposed for tests and diagnostics — do not mutate. */
export const CONTROL_TOKEN_PATTERN_NAMES: readonly string[] =
  CONTROL_TOKEN_PATTERNS.map((p) => p.name);
