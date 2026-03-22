/**
 * Fact Checker Service (Phase 127, Task 4)
 *
 * Runs AFTER Claude generates a response. Checks whether the response contradicts
 * any known facts in long-term memory using lightweight database lookups and
 * heuristic string matching — no LLM call required.
 *
 * Exported functions:
 *   extractStatements   — pure: extract factual sentences from response text
 *   extractKeywords     — pure: remove stop words, return significant terms
 *   checkFactContradictions — async: find facts that contradict response statements
 *   identifyNewFactCandidates — async: find statements not present in knowledge base
 *   runFactCheck        — async: main entry point, fire-and-forget friendly
 */

import { queryContext, type AIContext } from '../../utils/database-context';

type QueryParam = string | number | boolean | Date | null | undefined | Buffer | object;
import { logger } from '../../utils/logger';

// ──────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────

export interface Contradiction {
  /** What Claude said */
  responseStatement: string;
  /** What we know from memory */
  knownFact: string;
  factId: string;
  /** Heuristic confidence 0.3 – 0.7 */
  confidence: number;
}

export interface FactCheckResult {
  hasContradictions: boolean;
  contradictions: Contradiction[];
  /** Statements not in KB that could be stored as new facts */
  newFactCandidates: string[];
  /** Wall-clock time in ms */
  checkDuration: number;
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const MAX_STATEMENTS = 10;
const MAX_NEW_CANDIDATES = 5;
const DEFAULT_FACTS_LIMIT = 5;

/**
 * Combined German + English stop words.
 * Kept as a Set for O(1) lookups.
 */
const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'had',
  'be', 'been', 'being', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'nor',
  'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'up', 'about', 'into', 'than', 'so', 'as',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'we', 'you',
  'he', 'she', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'our',
  'your', 'his', 'their', 'what', 'which', 'who', 'whom', 'how',
  'when', 'where', 'why', 'all', 'each', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'also', 'just', 'very',
  // German
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen',
  'einem', 'einer', 'eines', 'ist', 'sind', 'war', 'waren', 'hat',
  'haben', 'wird', 'werden', 'kann', 'können', 'muss', 'müssen',
  'soll', 'sollen', 'darf', 'dürfen', 'würde', 'würden', 'hätte',
  'hätten', 'wäre', 'wären', 'nicht', 'kein', 'keine', 'keinen',
  'keinem', 'keiner', 'und', 'oder', 'aber', 'wenn', 'weil', 'dass',
  'daß', 'als', 'wie', 'für', 'mit', 'von', 'bei', 'nach', 'aus',
  'auf', 'in', 'an', 'um', 'durch', 'über', 'unter', 'zwischen',
  'vor', 'hinter', 'neben', 'ich', 'wir', 'sie', 'er', 'es', 'ihr',
  'mein', 'meine', 'dein', 'deine', 'sein', 'ihre', 'unser', 'unsere',
  'dieser', 'diese', 'dieses', 'jener', 'jene', 'jenes', 'auch',
  'noch', 'schon', 'immer', 'hier', 'da', 'dort', 'so', 'dann',
  'nur', 'mehr', 'sehr', 'viel', 'alle', 'alles', 'jeden', 'jedes',
]);

/**
 * Prefixes that mark meta-commentary rather than factual assertions.
 */
const META_PREFIXES = [
  'hier ist', 'hier sind', 'hier haben', 'hier findest',
  'ich kann', 'ich werde', 'ich habe', 'ich bin',
  'let me', 'here is', 'here are', 'i can', 'i will', 'i have',
  'of course', 'sure,', 'certainly,', 'please note',
];

// ──────────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────────

/**
 * Remove code blocks (``` … ```) from text.
 * Handles both single-line and multi-line fenced blocks.
 */
function stripCodeBlocks(text: string): string {
  // Remove fenced code blocks (``` ... ```)
  return text.replace(/```[\s\S]*?```/g, ' ');
}

/**
 * Return true when a sentence looks like a meta-statement or greeting.
 */
function isMetaStatement(sentence: string): boolean {
  const lower = sentence.toLowerCase().trimStart();
  return META_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// ──────────────────────────────────────────────────────────────
// extractKeywords
// ──────────────────────────────────────────────────────────────

/**
 * Extract significant keywords from a text fragment.
 *
 * Steps:
 *  1. Lowercase
 *  2. Strip punctuation attached to words
 *  3. Split on whitespace
 *  4. Remove stop words
 *  5. Remove words shorter than 3 characters
 *  6. Return unique keywords
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];

  const words = text
    .toLowerCase()
    // Remove punctuation attached to token boundaries (keep hyphens inside words)
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of words) {
    // Remove any remaining non-alpha-numeric characters (e.g. trailing dashes)
    const clean = word.replace(/^[-_]+|[-_]+$/g, '');
    if (
      clean.length >= 3 &&
      !STOP_WORDS.has(clean) &&
      !seen.has(clean)
    ) {
      seen.add(clean);
      result.push(clean);
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────
// extractStatements
// ──────────────────────────────────────────────────────────────

/**
 * Extract factual statements from a Claude response.
 *
 * Algorithm:
 *  1. Strip code blocks
 *  2. Split on sentence-ending punctuation (. ! ?)
 *  3. Filter: > 5 words
 *  4. Filter: not a question
 *  5. Filter: not a meta-statement / greeting
 *  6. Sort descending by word count (most information-dense first)
 *  7. Take up to MAX_STATEMENTS
 */
export function extractStatements(responseText: string): string[] {
  if (!responseText) return [];

  const cleaned = stripCodeBlocks(responseText);

  // Split on . ! ? — keep the delimiter in the token
  const raw = cleaned.split(/(?<=[.!?])\s+/);

  const sentences: string[] = [];

  for (const part of raw) {
    const sentence = part.trim();
    if (!sentence) continue;

    // Must end with sentence-ending punctuation (or be the last fragment)
    const normalized = sentence.endsWith('.') || sentence.endsWith('!') || sentence.endsWith('?')
      ? sentence
      : sentence + '.';

    // Filter: at least 6 words (> 5)
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 5) continue;

    // Filter: not a question
    if (normalized.endsWith('?')) continue;

    // Filter: not a meta-statement
    if (isMetaStatement(normalized)) continue;

    sentences.push(normalized);
  }

  // Sort by word count descending (information density)
  sentences.sort(
    (a, b) =>
      b.split(/\s+/).filter(Boolean).length -
      a.split(/\s+/).filter(Boolean).length,
  );

  return sentences.slice(0, MAX_STATEMENTS);
}

// ──────────────────────────────────────────────────────────────
// Contradiction heuristics
// ──────────────────────────────────────────────────────────────

/** Patterns that indicate negation in English or German */
const NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bno\b/i,
  /\bnever\b/i,
  /\bnicht\b/i,
  /\bkein\b/i,
  /\bkeine\b/i,
  /\bkeinen\b/i,
  /\bnein\b/i,
];

function hasNegation(text: string): boolean {
  return NEGATION_PATTERNS.some((re) => re.test(text));
}

/** Extract all integers from a string */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d+\b/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Given a response statement and a known fact that shares keyword overlap,
 * decide whether they contradict each other and return a confidence score.
 *
 * Returns null when no contradiction is detected.
 */
function detectContradiction(
  statement: string,
  fact: string,
): { confidence: number } | null {
  // ── Negation pattern ──────────────────────────────────────────
  const statNeg = hasNegation(statement);
  const factNeg = hasNegation(fact);

  if (statNeg !== factNeg) {
    // One contains a negation, the other does not → likely contradiction
    return { confidence: 0.55 };
  }

  // ── Numerical disagreement ────────────────────────────────────
  const statNums = extractNumbers(statement);
  const factNums = extractNumbers(fact);

  if (statNums.length > 0 && factNums.length > 0) {
    // Check if at least one number appears in statement but not in fact (or vice-versa)
    const statSet = new Set(statNums);
    const factSet = new Set(factNums);
    const hasDisagreement =
      statNums.some((n) => !factSet.has(n)) ||
      factNums.some((n) => !statSet.has(n));

    if (hasDisagreement) {
      return { confidence: 0.45 };
    }
  }

  return null;
}

/**
 * Keyword overlap ratio (Jaccard-like).
 * Returns 0–1 where 1 means identical keyword sets.
 */
function keywordOverlap(kwA: string[], kwB: string[]): number {
  if (kwA.length === 0 || kwB.length === 0) return 0;
  const setA = new Set(kwA);
  const setB = new Set(kwB);
  let intersection = 0;
  for (const k of setA) {
    if (setB.has(k)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ──────────────────────────────────────────────────────────────
// checkFactContradictions
// ──────────────────────────────────────────────────────────────

/**
 * For each statement, search learned_facts for potentially contradicting entries.
 *
 * Search strategy:
 *  - Extract keywords from statement
 *  - Query learned_facts using ILIKE on each significant keyword
 *  - Among returned facts, use heuristic contradiction detection
 *  - Return contradictions with confidence 0.3 – 0.7
 *
 * @param context  DB context (personal | work | learning | creative)
 * @param statements  Factual sentences to check
 * @param limit  Max facts to fetch per statement (default 5)
 */
export async function checkFactContradictions(
  context: AIContext,
  statements: string[],
  limit: number = DEFAULT_FACTS_LIMIT,
): Promise<Contradiction[]> {
  if (statements.length === 0) return [];

  const contradictions: Contradiction[] = [];

  for (const statement of statements) {
    const keywords = extractKeywords(statement);
    if (keywords.length === 0) continue;

    // Build ILIKE conditions for each keyword
    const conditions = keywords
      .slice(0, 5) // use top 5 keywords to keep query lean
      .map((_, i) => `content ILIKE $${i + 1}`)
      .join(' OR ');

    const params: QueryParam[] = [
      ...keywords.slice(0, 5).map((k) => `%${k}%`),
      limit,
    ];

    const sql = `
      SELECT id, content, confidence
      FROM learned_facts
      WHERE (${conditions})
      LIMIT $${params.length}
    `;

    let rows: Array<{ id: string; content: string; confidence: number }> = [];
    try {
      const result = await queryContext(context, sql, params);
      rows = result.rows;
    } catch (err) {
      logger.warn('fact-checker: DB query failed for statement', { error: err });
      continue;
    }

    const statKws = extractKeywords(statement);

    for (const row of rows) {
      const factKws = extractKeywords(row.content);
      const overlap = keywordOverlap(statKws, factKws);

      // Only consider facts with >40% keyword overlap as candidates
      if (overlap < 0.4) continue;

      const detection = detectContradiction(statement, row.content);
      if (!detection) continue;

      contradictions.push({
        responseStatement: statement,
        knownFact: row.content,
        factId: row.id,
        confidence: Math.min(0.7, Math.max(0.3, detection.confidence)),
      });
    }
  }

  return contradictions;
}

// ──────────────────────────────────────────────────────────────
// identifyNewFactCandidates
// ──────────────────────────────────────────────────────────────

/**
 * Identify statements that contain information NOT already in learned_facts.
 *
 * For each statement:
 *  - Search learned_facts with keyword overlap
 *  - If NO result has >30% keyword overlap → it's a new-fact candidate
 *
 * @returns Up to 5 novel statements
 */
export async function identifyNewFactCandidates(
  context: AIContext,
  statements: string[],
): Promise<string[]> {
  if (statements.length === 0) return [];

  const candidates: string[] = [];

  for (const statement of statements) {
    if (candidates.length >= MAX_NEW_CANDIDATES) break;

    const keywords = extractKeywords(statement);
    if (keywords.length === 0) continue;

    const conditions = keywords
      .slice(0, 5)
      .map((_, i) => `content ILIKE $${i + 1}`)
      .join(' OR ');

    const params: QueryParam[] = [
      ...keywords.slice(0, 5).map((k) => `%${k}%`),
      DEFAULT_FACTS_LIMIT,
    ];

    const sql = `
      SELECT content
      FROM learned_facts
      WHERE (${conditions})
      LIMIT $${params.length}
    `;

    let rows: Array<{ content: string }> = [];
    try {
      const result = await queryContext(context, sql, params);
      rows = result.rows;
    } catch (err) {
      logger.warn('fact-checker: DB query failed for new-fact check', { error: err });
      continue;
    }

    const statKws = extractKeywords(statement);

    // Check whether any existing fact has >30% keyword overlap
    const hasMatch = rows.some((row) => {
      const factKws = extractKeywords(row.content);
      return keywordOverlap(statKws, factKws) > 0.3;
    });

    if (!hasMatch) {
      candidates.push(statement);
    }
  }

  return candidates;
}

// ──────────────────────────────────────────────────────────────
// runFactCheck — main entry point
// ──────────────────────────────────────────────────────────────

/**
 * Run a full fact-check on a Claude response.
 *
 * Pipeline:
 *  1. extractStatements
 *  2. checkFactContradictions
 *  3. identifyNewFactCandidates
 *
 * Fire-and-forget friendly: all errors are caught internally;
 * on failure an empty FactCheckResult is returned so the calling
 * code is never blocked.
 */
export async function runFactCheck(
  context: AIContext,
  responseText: string,
): Promise<FactCheckResult> {
  const start = Date.now();
  const empty: FactCheckResult = {
    hasContradictions: false,
    contradictions: [],
    newFactCandidates: [],
    checkDuration: 0,
  };

  try {
    const statements = extractStatements(responseText);

    if (statements.length === 0) {
      return { ...empty, checkDuration: Date.now() - start };
    }

    const [contradictions, newFactCandidates] = await Promise.all([
      checkFactContradictions(context, statements),
      identifyNewFactCandidates(context, statements),
    ]);

    const checkDuration = Date.now() - start;

    logger.debug('fact-checker: check complete', {
      context,
      statements: statements.length,
      contradictions: contradictions.length,
      newFactCandidates: newFactCandidates.length,
      checkDuration,
    });

    return {
      hasContradictions: contradictions.length > 0,
      contradictions,
      newFactCandidates,
      checkDuration,
    };
  } catch (err) {
    logger.error('fact-checker: runFactCheck failed', err instanceof Error ? err : undefined);
    return { ...empty, checkDuration: Date.now() - start };
  }
}
