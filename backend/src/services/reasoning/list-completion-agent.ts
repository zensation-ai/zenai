/**
 * List-Completion Agent — detect list-style queries and shape the
 * answerer for completeness + format-match.
 *
 * Phase H sprint reference: spec § H2 task 5.
 *
 * Why this exists
 * ---------------
 * LoCoMo Cat 1 (Multi-Hop) answers are often LISTS — "what cities did
 * Joanna visit?", "what subjects did Caroline mention as interests?",
 * "list all the books Caroline recommended". On a list-style gold:
 *
 *   gold: "Madrid, Barcelona, Seville"
 *   pred: "Madrid"
 *   F1-on-comma-split: precision 1.0, recall 0.33, F1 = 0.50.
 *
 * If we (a) don't notice the query is a list and (b) don't tell the
 * answerer to keep going past the first match, we leave a third of the
 * F1 on the floor on those queries. Two surface fixes catch the
 * structural majority of these losses:
 *
 *   1. **Prompt-shaping** — when the query is detected as list-style,
 *      append a short, deterministic instruction telling the answerer to
 *      enumerate ALL instances and use a comma-separated format.
 *   2. **Format-normalisation** — post-process answers (whether from
 *      list-shaped queries or not) into a stable comma-separated form
 *      so the LoCoMo F1 split-on-comma scorer compares apples to apples.
 *
 * Both are deterministic — no LLM call, no I/O. The detector is
 * Englisch-pattern-matched (LoCoMo language) following the same
 * convention as `algorithms/temporal-multi-route` for cue detection.
 *
 * Why standalone (vs. inlining in general-chat.ts)
 * ------------------------------------------------
 * - Pure functions: detector / prompt-builder / normaliser / scorer
 *   each have a clear contract and full test coverage.
 * - Reusable: the answerer agent, the LoCoMo eval harness
 *   (`experiments/baselines/answerer.py` Mode-β), and the planned H2.7
 *   Coverage-Aware Fact-Extraction all want the same primitives.
 * - The F1 scorer is a tiny utility — handy for any "did the answer
 *   contain everything from the gold?" check, not just LoCoMo.
 *
 * @module services/reasoning/list-completion-agent
 */

/* eslint-disable security/detect-unsafe-regex */

// ===========================================================================
// Types
// ===========================================================================

export interface ListCompletionAnalysis {
  /** True if the query is detected as asking for a list / enumeration. */
  isListQuery: boolean;
  /** The cue substrings that fired the detection (for audit / logging). */
  detectedCues: string[];
  /** Aggregated confidence in [0, 1] via 1 − ∏(1 − c_i). */
  confidence: number;
  /** True if the question uses an explicit plural marker
   *  ("which cities", "what subjects", "what books"). Implies list
   *  even without "list" / "all" keywords. */
  hasPluralCue: boolean;
}

export interface FormatNormalizationOptions {
  /** Output separator. Default ', '. */
  separator?: string;
  /** Strip a trailing period from each item. Default true. */
  stripTrailingDots?: boolean;
  /** Lowercase items. Default false (preserve case). */
  lowercase?: boolean;
  /** Sort items alphabetically. Default false (preserve order). */
  sort?: boolean;
  /** Deduplicate items (after lowercase if applicable). Default true. */
  dedup?: boolean;
  /** Minimum item length after trimming. Items shorter are dropped.
   *  Default 1. */
  minItemLength?: number;
}

export interface ListF1Result {
  precision: number;
  recall: number;
  f1: number;
  /** True positives: predicted items that appear in gold (case-insensitive). */
  truePositives: string[];
  /** False positives: predicted items NOT in gold. */
  falsePositives: string[];
  /** False negatives: gold items NOT in predicted. */
  falseNegatives: string[];
}

// ===========================================================================
// Cue patterns (English; matches LoCoMo wording)
// ===========================================================================

interface CuePattern {
  pattern: RegExp;
  /** Confidence contribution. Aggregated via 1 − ∏(1 − c_i). */
  confidence: number;
  /** True if this cue alone implies a list, even without other cues
   *  (used to set `hasPluralCue` separately for analytics). */
  isPluralCue?: boolean;
}

const CUE_PATTERNS: readonly CuePattern[] = [
  // Strong explicit-enumeration cues.
  { pattern: /\blist\s+(?:all\s+)?(?:the\s+)?/i, confidence: 0.95 },
  { pattern: /\bname\s+(?:all\s+)?(?:the\s+)?/i, confidence: 0.85 },
  { pattern: /\benumerate\b/i, confidence: 0.95 },
  { pattern: /\bgive\s+(?:me\s+)?(?:a\s+)?list\s+of\b/i, confidence: 0.95 },

  // "all the X" / "all of the X" / "all X"
  { pattern: /\ball\s+(?:of\s+)?(?:the\s+)?(?=\w)/i, confidence: 0.7 },
  { pattern: /\bevery\s+(?=\w)/i, confidence: 0.6 },

  // "which X" / "what Xs" / "what are the X" — explicit plural cues.
  // The plural-noun detection requires a 4+ character word ending in 's'
  // to avoid false positives on auxiliary verbs (is/was/has/does/this).
  // Also excludes a stopword shortlist that ends in 's' but never begins
  // a list-query (e.g. "what is").
  {
    pattern: /\bwhich\s+(?!is\b|was\b|has\b|does\b|this\b|these\b|those\b)\w{4,}s\b/i,
    confidence: 0.7,
    isPluralCue: true,
  },
  {
    pattern: /\bwhat\s+(?:are\s+(?:the\s+)?)?(?!is\b|was\b|has\b|does\b|this\b|these\b|those\b)\w{4,}s\b/i,
    confidence: 0.6,
    isPluralCue: true,
  },

  // "people who" / "things that" — relative-clause aggregations.
  { pattern: /\b(?:people|things|items|entries|places|cities|books|movies|songs)\s+(?:who|that|which)\b/i, confidence: 0.7 },
];

// ===========================================================================
// Detection
// ===========================================================================

/**
 * Detect whether a query is asking for a list / enumeration. Pure
 * regex on English wording.
 */
export function detectListQuery(query: string): ListCompletionAnalysis {
  const text = String(query ?? '');
  if (!text.trim()) {
    return { isListQuery: false, detectedCues: [], confidence: 0, hasPluralCue: false };
  }
  let failProb = 1;
  let hasPluralCue = false;
  const cues: string[] = [];
  for (const p of CUE_PATTERNS) {
    const m = text.match(p.pattern);
    if (!m) continue;
    cues.push(m[0]);
    failProb *= 1 - p.confidence;
    if (p.isPluralCue) hasPluralCue = true;
  }
  const confidence = 1 - failProb;
  return {
    isListQuery: cues.length > 0,
    detectedCues: cues,
    confidence,
    hasPluralCue,
  };
}

// ===========================================================================
// Prompt building
// ===========================================================================

/** The standard list-completion suffix. Kept as a separate constant so
 *  it's grep-able and the eval harness can compare prompts byte-for-byte. */
export const LIST_COMPLETION_INSTRUCTION =
  'When the question asks for a list of items, return ALL instances ' +
  'found across ALL evidence — do not stop at the first match. ' +
  'Format the answer as a comma-separated list (e.g. "Madrid, Barcelona, ' +
  'Seville"). Do not number, bullet, or label the items.';

/**
 * Phase H2.7 — coverage-aware "are there more?" follow-up prompt.
 *
 * Used by the Coverage-Aware Fact-Extraction loop: after the answerer
 * produces an initial list-shaped response, this prompt asks the
 * answerer to check whether evidence supports any additional items
 * that were left out, and to extend the list if so. Distinct from the
 * H2.5 LIST_COMPLETION_INSTRUCTION which targets the FIRST answer; this
 * one drives the SECOND-and-later passes.
 *
 * Variables substituted via str.replace (NOT format) for parity with
 * the H0 verbatim-prompt convention.
 */
export const COLLECT_MORE_INSTRUCTION =
  'Earlier you answered: "{{previous_answer}}".\n' +
  'Re-examine the evidence: are there OTHER items that match the ' +
  'question and that you did not include? If yes, extend the list ' +
  'with the additional items. If no, return the SAME comma-separated ' +
  'list unchanged. Format the answer as a single comma-separated list ' +
  '(e.g. "Madrid, Barcelona, Seville"). Do not number, bullet, label, ' +
  'or comment.';

/**
 * Append the list-completion instruction to a system prompt. Idempotent —
 * if the instruction is already present (substring match) the prompt
 * is returned unchanged.
 *
 * Returns the original prompt unchanged when the query is not detected
 * as list-style — callers can pass any query through this without
 * worrying about over-shaping.
 */
export function buildListCompletionPrompt(
  originalSystemPrompt: string,
  query: string,
): string {
  const analysis = detectListQuery(query);
  if (!analysis.isListQuery) return originalSystemPrompt;
  if (originalSystemPrompt.includes(LIST_COMPLETION_INSTRUCTION)) return originalSystemPrompt;
  const sep = originalSystemPrompt.endsWith('\n') ? '' : '\n';
  return `${originalSystemPrompt}${sep}\n${LIST_COMPLETION_INSTRUCTION}`;
}

/**
 * Phase H2.7 — build the "are there more?" follow-up prompt with the
 * previous answer substituted in. Used by the Coverage-Aware Fact-
 * Extraction loop.
 */
export function buildCollectMorePrompt(previousAnswer: string): string {
  return COLLECT_MORE_INSTRUCTION.replace('{{previous_answer}}', String(previousAnswer ?? ''));
}

// ===========================================================================
// Coverage-Aware Fact-Extraction loop control (H2.7)
// ===========================================================================

export interface CollectionState {
  /** All distinct items collected across rounds. */
  items: ReadonlyArray<string>;
  /** Number of follow-up rounds attempted (excludes the initial answer). */
  rounds: number;
  /** Per-round delta — how many new items each follow-up added. */
  newPerRound: ReadonlyArray<number>;
  /** Whether the loop reached a terminal state. */
  closed: boolean;
  /** Reason the loop closed (when `closed=true`). */
  closeReason?: 'no_new_items' | 'max_rounds' | 'expected_count_reached';
}

export interface CollectionLoopOptions {
  /** Max follow-up rounds. Default 3. */
  maxRounds?: number;
  /** When known, the expected list length. Loop stops early when
   *  collected ≥ expected. Default undefined (no early-stop on count). */
  expectedCount?: number;
  /** Lowercase items for dedup comparison. Default true (LoCoMo-style
   *  case-insensitive matching). */
  caseInsensitive?: boolean;
}

/**
 * Stateful container for the H2.7 Coverage-Aware Fact-Extraction loop.
 *
 * Usage: caller supplies the initial answer to `start()`, then for each
 * follow-up round calls `addRound(answer)`. After each call,
 * `shouldContinue()` returns whether another follow-up should be
 * attempted; `getState()` exposes the current collection.
 *
 * Stops when:
 *   - Last follow-up added zero new items (= no signal of more).
 *   - `maxRounds` reached (default 3).
 *   - `expectedCount` reached (when supplied).
 *
 * Pure logic — no LLM, no I/O. The caller is responsible for actually
 * making the LLM follow-up calls; this class just tracks state and
 * decides when to stop.
 */
export class CoverageAwareCollector {
  private readonly maxRounds: number;
  private readonly expectedCount?: number;
  private readonly caseInsensitive: boolean;
  private collected = new Map<string, string>(); // key (normalised) → display
  private newPerRound: number[] = [];
  private rounds = 0;
  private started = false;
  private closeReason?: CollectionState['closeReason'];

  constructor(options: CollectionLoopOptions = {}) {
    this.maxRounds = options.maxRounds ?? 3;
    this.expectedCount = options.expectedCount;
    this.caseInsensitive = options.caseInsensitive ?? true;
    if (this.maxRounds < 0) {
      throw new Error(`CoverageAwareCollector: maxRounds must be >= 0; got ${this.maxRounds}`);
    }
  }

  /** Seed the collector with the initial (round-0) answer. Required
   *  before any addRound() calls. */
  start(initialAnswer: string): void {
    if (this.started) throw new Error('CoverageAwareCollector: start() called twice');
    this.started = true;
    const items = parseListAnswer(normalizeListAnswer(initialAnswer));
    for (const it of items) this.put(it);
  }

  /** Drop a follow-up round answer in. Computes per-round delta and
   *  may set `closeReason`. */
  addRound(roundAnswer: string): void {
    if (!this.started) throw new Error('CoverageAwareCollector: addRound() before start()');
    if (this.closeReason) return; // already closed; idempotent no-op
    this.rounds++;
    const items = parseListAnswer(normalizeListAnswer(roundAnswer));
    let added = 0;
    for (const it of items) if (this.put(it)) added++;
    this.newPerRound.push(added);

    // Decide whether to close.
    if (this.expectedCount !== undefined && this.collected.size >= this.expectedCount) {
      this.closeReason = 'expected_count_reached';
    } else if (added === 0) {
      this.closeReason = 'no_new_items';
    } else if (this.rounds >= this.maxRounds) {
      this.closeReason = 'max_rounds';
    }
  }

  /** True if another follow-up round should be attempted. */
  shouldContinue(): boolean {
    if (!this.started) return false;
    if (this.closeReason) return false;
    if (this.rounds >= this.maxRounds) return false;
    if (this.expectedCount !== undefined && this.collected.size >= this.expectedCount) return false;
    return true;
  }

  /** Read-only snapshot of current state. */
  getState(): CollectionState {
    return {
      items: Array.from(this.collected.values()),
      rounds: this.rounds,
      newPerRound: this.newPerRound,
      closed: this.closeReason !== undefined,
      closeReason: this.closeReason,
    };
  }

  /** Convenience: render the current collection as a comma-separated
   *  string in original-case order. */
  format(): string {
    return Array.from(this.collected.values()).join(', ');
  }

  // ────────────────────────────────────────────────────────────────────

  /** Insert one item. Returns true iff it was new. */
  private put(displayItem: string): boolean {
    const trimmed = displayItem.trim();
    if (!trimmed) return false;
    const key = this.caseInsensitive ? trimmed.toLowerCase() : trimmed;
    if (this.collected.has(key)) return false;
    this.collected.set(key, trimmed);
    return true;
  }
}

// ===========================================================================
// Format normalisation
// ===========================================================================

/**
 * Normalise a raw answer string into a stable comma-separated form
 * suitable for split-on-comma F1 scoring.
 *
 * Handles inputs that arrive in many shapes:
 *   - "Madrid, Barcelona, Seville"
 *   - "Madrid; Barcelona; Seville"
 *   - "Madrid and Barcelona and Seville"
 *   - "1. Madrid 2. Barcelona 3. Seville"
 *   - "- Madrid\n- Barcelona\n- Seville"
 *   - "The cities Joanna visited were Madrid, Barcelona, and Seville."
 *
 * The last example is intentional: list-style answers from chat models
 * often include a leading "The X are ..." prefix. The normaliser strips
 * that prefix using a generous-but-anchored regex.
 */
export function normalizeListAnswer(
  answer: string,
  options: FormatNormalizationOptions = {},
): string {
  const sep = options.separator ?? ', ';
  const stripDots = options.stripTrailingDots ?? true;
  const lowercase = options.lowercase ?? false;
  const sort = options.sort ?? false;
  const dedup = options.dedup ?? true;
  const minLen = options.minItemLength ?? 1;

  let text = String(answer ?? '').trim();
  if (!text) return '';

  // Strip a single leading sentence prefix like "The cities ... were "
  // or "X visited the following: " or "Here are the cities: ". Anchored
  // at start to avoid mid-sentence damage. The trailing separator is
  // permissive: colon, semicolon, comma, dash, OR just whitespace.
  text = text.replace(
    /^(?:the\s+\w+(?:\s+\w+){0,8}\s+(?:are|were|include|included|is|was|visited|mentioned)|here\s+(?:are|is)(?:\s+\w+){0,8}|following|the\s+following(?:\s+\w+){0,4}|in\s+order|listed|the\s+list)(?:\s*[:;,-]\s*|\s+)/i,
    '',
  );

  // Strip enclosing quotes / brackets if the WHOLE string is enclosed.
  text = text.replace(/^[\["'(]\s*/, '').replace(/\s*[\])"']$/, '');

  // Strip trailing period from the WHOLE string.
  text = text.replace(/\.\s*$/, '');

  // Replace numbered-list markers ("1. Foo  2. Bar  3. Baz") with commas.
  text = text.replace(/(?:^|\s)\d+[).]\s+/g, ', ');
  // Replace bullet markers (- / * / •) with commas.
  text = text.replace(/(?:^|\s)[\-*•]\s+/g, ', ');
  // Replace "and"/"&" / semicolon / newline as separators.
  text = text.replace(/\s+(?:and|&)\s+/gi, ', ');
  text = text.replace(/[;\n\r]+/g, ', ');

  // Split on comma, trim each.
  let items = text.split(',').map((s) => s.trim()).filter((s) => s.length >= minLen);

  // Strip trailing dots per item.
  if (stripDots) items = items.map((s) => s.replace(/\.+\s*$/, ''));

  // Lowercase per item.
  if (lowercase) items = items.map((s) => s.toLowerCase());

  // Dedup (case-aware unless lowercased above).
  if (dedup) {
    const seen = new Set<string>();
    items = items.filter((s) => {
      const key = lowercase ? s : s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (sort) items.sort((a, b) => a.localeCompare(b));

  return items.join(sep);
}

/**
 * Parse a normalised answer back into an array (the inverse of
 * `normalizeListAnswer` join-step).
 */
export function parseListAnswer(answer: string, separator: string = ','): string[] {
  if (!answer) return [];
  return String(answer).split(separator).map((s) => s.trim()).filter((s) => s.length > 0);
}

// ===========================================================================
// F1 scoring
// ===========================================================================

/**
 * Compute precision / recall / F1 between a predicted list-answer and a
 * gold list-answer. Items are compared case-insensitively after trim.
 *
 * Both `predicted` and `gold` may be strings (parsed via `parseListAnswer`)
 * or arrays of items.
 *
 * Edge cases:
 *   - both empty → F1 = 1 (vacuously matched)
 *   - one empty → F1 = 0
 *   - duplicates within predicted/gold are deduped before scoring
 *     (matches how LoCoMo F1 is conventionally computed)
 */
export function listAnswerF1(
  predicted: string | ReadonlyArray<string>,
  gold: string | ReadonlyArray<string>,
): ListF1Result {
  const predList = Array.isArray(predicted)
    ? Array.from(new Set(predicted.map((s) => s.trim().toLowerCase()).filter(Boolean)))
    : Array.from(new Set(parseListAnswer(predicted as string).map((s) => s.toLowerCase())));
  const goldList = Array.isArray(gold)
    ? Array.from(new Set(gold.map((s) => s.trim().toLowerCase()).filter(Boolean)))
    : Array.from(new Set(parseListAnswer(gold as string).map((s) => s.toLowerCase())));

  const goldSet = new Set(goldList);
  const predSet = new Set(predList);

  if (predList.length === 0 && goldList.length === 0) {
    return { precision: 1, recall: 1, f1: 1, truePositives: [], falsePositives: [], falseNegatives: [] };
  }
  if (predList.length === 0 || goldList.length === 0) {
    return {
      precision: 0, recall: 0, f1: 0,
      truePositives: [],
      falsePositives: predList,
      falseNegatives: goldList,
    };
  }

  const tp: string[] = [];
  const fp: string[] = [];
  for (const p of predList) {
    if (goldSet.has(p)) tp.push(p); else fp.push(p);
  }
  const fn: string[] = [];
  for (const g of goldList) if (!predSet.has(g)) fn.push(g);

  const precision = tp.length / (tp.length + fp.length);
  const recall = tp.length / (tp.length + fn.length);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return { precision, recall, f1, truePositives: tp, falsePositives: fp, falseNegatives: fn };
}
