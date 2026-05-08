/**
 * Chat Guardrails — Pipeline for both input and output scanning.
 *
 * Companion to `middleware/input-screening.ts` (which only scans inbound user
 * messages for injection patterns). This service adds:
 *
 *   1. scanInput()  — richer classification of user input (injection, data
 *      exfil, secret-extraction attempts). Reuses the inbound screener, then
 *      layers category detection on top.
 *   2. scanOutput() — scans a model response before streaming it to the client
 *      for: plaintext secrets (API keys, private keys), disclosure of the
 *      system prompt, explicit "jailbreak successful" phrasing.
 *
 * Both scanners return a typed verdict. The **decision** (block/redact/allow)
 * is left to the caller (streaming pipeline or test harness) — this keeps the
 * scanners themselves side-effect-free and easy to unit-test and red-team.
 *
 * This module has ZERO dependencies on the request lifecycle or on Claude; the
 * red-team test suite drives it with deterministic fixtures.
 */

import { screenUserInput, type ScreeningResult } from '../middleware/input-screening';

// ===========================================
// Input scanning
// ===========================================

export type InputCategory =
  | 'prompt_injection'
  | 'system_prompt_extraction'
  | 'secret_extraction'
  | 'role_override'
  | 'clean';

export interface InputVerdict extends ScreeningResult {
  categories: InputCategory[];
  block: boolean;
}

/** Patterns that look like active attempts to extract the system prompt. */
const SYSTEM_PROMPT_EXTRACTION_PATTERNS: RegExp[] = [
  /what\s+(?:is|are)\s+your\s+(?:original\s+)?(?:instructions|system\s+prompt|rules)/i,
  /repeat\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions)/i,
  /print\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions|initial\s+prompt)/i,
  /show\s+me\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions)/i,
  /what\s+were\s+you\s+told/i,
  /reveal\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions)/i,
];

/** Patterns that look like attempts to have the model emit secrets. */
const SECRET_EXTRACTION_PATTERNS: RegExp[] = [
  /(?:give|tell|show)\s+me\s+(?:the|your|any)\s+(?:api\s+keys?|passwords?|secrets?|tokens?|credentials?)/i,
  /what\s+(?:is|are)\s+(?:the|your)\s+(?:[a-z]+\s+)?(?:api\s+keys?|passwords?|secrets?|access\s+tokens?|keys?)/i,
  /(?:leak|exfiltrate|dump)\s+(?:all\s+)?(?:secrets?|credentials?|env(?:ironment)?\s+variables?)/i,
  /print\s+(?:all\s+)?env(?:ironment)?\s+variables?/i,
];

const ROLE_OVERRIDE_PATTERNS: RegExp[] = [
  /you\s+are\s+now\s+/i,
  /act\s+as\s+(?:if\s+you\s+are\s+)?an?\s+/i,
  /pretend\s+(?:you\s+are|to\s+be)/i,
  /DAN\s+mode/i,
  /developer\s+mode/i,
  /no\s+restrictions?/i,
  /above\s+(?:all\s+)?(?:rules|instructions)/i,
];

export function scanInput(input: string): InputVerdict {
  const base = screenUserInput(input);
  const categories = new Set<InputCategory>();

  if (base.matchedPatterns.length > 0) {
    categories.add('prompt_injection');
  }
  if (SYSTEM_PROMPT_EXTRACTION_PATTERNS.some((p) => p.test(input))) {
    categories.add('system_prompt_extraction');
  }
  if (SECRET_EXTRACTION_PATTERNS.some((p) => p.test(input))) {
    categories.add('secret_extraction');
  }
  if (ROLE_OVERRIDE_PATTERNS.some((p) => p.test(input))) {
    categories.add('role_override');
  }
  if (categories.size === 0) {
    categories.add('clean');
  }

  // High-severity categories or score ≥ 0.8 → caller should hard-block.
  const HIGH_SEVERITY: InputCategory[] = ['secret_extraction'];
  const hasHighSeverity = [...categories].some((c) => HIGH_SEVERITY.includes(c));
  const block = hasHighSeverity || base.score >= 0.8;

  return {
    ...base,
    categories: [...categories],
    block,
  };
}

// ===========================================
// Output scanning
// ===========================================

export type OutputFinding =
  | 'plaintext_secret'
  | 'system_prompt_disclosure'
  | 'jailbreak_acknowledged';

export interface OutputVerdict {
  safe: boolean;
  findings: OutputFinding[];
  /** Redacted copy of the output with any detected secrets replaced. Only
   * produced if `plaintext_secret` is among the findings; otherwise identical
   * to the input. Never includes the actual secret string. */
  redacted: string;
}

/** Narrow, high-confidence patterns for common credential formats. Each should
 * have low false-positive rate in normal Markdown/code responses. */
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'aws_secret_key', re: /\baws(.{0,20})?(?:secret|private)[^\s]{0,20}[=:]\s*[A-Za-z0-9/+=]{40}\b/gi },
  { name: 'stripe_live_key', re: /\bsk_live_[A-Za-z0-9]{20,}/g },
  { name: 'stripe_test_key', re: /\bsk_test_[A-Za-z0-9]{20,}/g },
  { name: 'anthropic_key', re: /\bsk-ant-[A-Za-z0-9\-_]{20,}/g },
  { name: 'openai_key', re: /\bsk-proj-[A-Za-z0-9\-_]{20,}/g },
  { name: 'github_token', re: /\bghp_[A-Za-z0-9]{36,}/g },
  { name: 'google_api_key', re: /\bAIza[0-9A-Za-z\-_]{35}/g },
  { name: 'private_key_pem', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'slack_bot_token', re: /\bxox[baprs]-[A-Za-z0-9\-]{10,}/g },
];

/** Phrases that indicate the model is revealing its system prompt. These are
 * intentionally narrow: we only flag when the output explicitly frames itself
 * as the system prompt. */
const SYSTEM_DISCLOSURE_PATTERNS: RegExp[] = [
  /(?:my|the)\s+system\s+prompt\s+(?:is|says|reads)/i,
  /my\s+(?:original\s+)?instructions\s+(?:are|read|say)/i,
  /i\s+was\s+(?:told|instructed|programmed)\s+(?:to|that\s+i\s+am)/i,
  /here\s+(?:is|are)\s+(?:my|the)\s+(?:original\s+)?instructions/i,
];

/** Phrases that look like jailbreak acknowledgements (used both as positive
 * signal in red-team tests and as output filter). */
const JAILBREAK_ACK_PATTERNS: RegExp[] = [
  /DAN\s+mode\s+(?:activated|enabled|on)/i,
  /(?:jailbreak|restrictions?)\s+(?:successful|disabled|removed|bypassed)/i,
  /i\s+am\s+now\s+(?:unrestricted|free|DAN)/i,
  /i\s+will\s+ignore\s+(?:all\s+)?(?:previous\s+)?(?:rules|instructions)/i,
];

export function scanOutput(output: string): OutputVerdict {
  const findings = new Set<OutputFinding>();
  let redacted = output;

  for (const { re } of SECRET_PATTERNS) {
    if (re.test(output)) {
      findings.add('plaintext_secret');
      // Fresh RegExp to avoid lastIndex state leaking between scans when
      // the regex uses the /g flag.
      redacted = redacted.replace(new RegExp(re.source, re.flags), '[REDACTED]');
    }
  }

  if (SYSTEM_DISCLOSURE_PATTERNS.some((p) => p.test(output))) {
    findings.add('system_prompt_disclosure');
  }

  if (JAILBREAK_ACK_PATTERNS.some((p) => p.test(output))) {
    findings.add('jailbreak_acknowledged');
  }

  return {
    safe: findings.size === 0,
    findings: [...findings],
    redacted,
  };
}

// ===========================================
// Pipeline helper for red-team harness
// ===========================================

export interface RedTeamCase {
  /** Stable identifier for the attack scenario. */
  id: string;
  /** User-facing description of the attack. */
  description: string;
  /** The user input fed into scanInput(). */
  input: string;
  /** Deterministic model output used as if Claude had replied. Optional: if
   * omitted, only the input scan is evaluated. */
  simulatedOutput?: string;
  /** Expected input categories (subset; extras are allowed). */
  expectInputCategories: InputCategory[];
  /** Expected output findings (subset; extras are allowed). Only checked when
   * `simulatedOutput` is provided. */
  expectOutputFindings?: OutputFinding[];
  /** Whether the caller is expected to block this input outright. */
  expectBlocked: boolean;
}

export interface RedTeamResult {
  caseId: string;
  passed: boolean;
  inputVerdict: InputVerdict;
  outputVerdict?: OutputVerdict;
  failureReason?: string;
}

/**
 * Evaluate a single red-team case against the guardrail pipeline. A case
 * passes when:
 *   - all `expectInputCategories` are present in the input verdict
 *   - `block` matches `expectBlocked`
 *   - if `simulatedOutput` is set, all `expectOutputFindings` are present
 */
export function evaluateRedTeamCase(c: RedTeamCase): RedTeamResult {
  const inputVerdict = scanInput(c.input);
  const inputCategoriesOk = c.expectInputCategories.every((cat) =>
    inputVerdict.categories.includes(cat),
  );
  const blockOk = inputVerdict.block === c.expectBlocked;

  let outputVerdict: OutputVerdict | undefined;
  let outputOk = true;
  if (c.simulatedOutput !== undefined) {
    outputVerdict = scanOutput(c.simulatedOutput);
    if (c.expectOutputFindings) {
      outputOk = c.expectOutputFindings.every((f) =>
        outputVerdict!.findings.includes(f),
      );
    }
  }

  const passed = inputCategoriesOk && blockOk && outputOk;
  const failureReason = passed
    ? undefined
    : `inputCategoriesOk=${inputCategoriesOk} blockOk=${blockOk} outputOk=${outputOk}`;

  return { caseId: c.id, passed, inputVerdict, outputVerdict, failureReason };
}
