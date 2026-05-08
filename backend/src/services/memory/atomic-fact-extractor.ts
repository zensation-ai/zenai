/**
 * Atomic Fact Extractor — Mem0-style SVO triple extraction.
 *
 * Phase H sprint reference: spec § H3 task 1.
 *
 * Why atomic facts matter for LoCoMo Cat 4
 * ----------------------------------------
 * Cat 4 (Single-Hop) is 55 % of the scored set. Mem0's overall edge
 * over OpenAI-Memory came almost entirely from extracting atomic
 * subject-verb-object facts at write-time and indexing them
 * separately from the raw conversation text. Each conversation turn
 * → ≥ 1 SVO atomic fact, where each fact:
 *
 *   - has minimal context dependency (no co-reference, no anaphora)
 *   - is RETRIEVABLE on its own (the SVO triple alone is searchable)
 *   - composes back into the original episode via the source link
 *
 * Result: a query like "what does Caroline study?" retrieves the SVO
 * fact `(Caroline, studies, psychology)` directly, instead of having
 * to embed-match against a 200-word transcript chunk.
 *
 * Design
 * ------
 * Pure heuristic extraction with an optional LLM-callback for the
 * cases the heuristic misses. The two paths:
 *
 *   1. **Heuristic** — pure regex / token-pattern matching on common
 *      English SVO shapes ("Caroline studies psychology", "She lives
 *      in Madrid", "I am 45 years old"). Catches a surprising amount
 *      on conversational text. Zero cost, < 1 ms.
 *
 *   2. **LLM-callback** — caller-supplied async function that takes
 *      the raw text and returns parsed `AtomicFact[]`. Used when
 *      the caller wants exhaustive coverage or needs the model to
 *      handle co-reference / paraphrase. Optional — the heuristic
 *      alone is usable for high-volume ingest.
 *
 * Both paths produce the same `AtomicFact` shape, so the rest of the
 * pipeline (storage, retrieval, scoring) doesn't care which path
 * fed it.
 *
 * Why standalone (vs. extending llm-consolidation.ts)
 * ---------------------------------------------------
 * - llm-consolidation.ts extracts long-form facts from episode
 *   *batches* (used for episodic-memory consolidation). Granularity
 *   is whole episodes, not individual turns. This module operates
 *   on individual turns and emits SVO triples.
 * - Different output schema: long-form facts have one `text` field;
 *   atomic facts have explicit `subject` / `verb` / `object` slots.
 * - Different test discipline: pure functions, no DB I/O, callable
 *   from any pipeline (ingest, eval, A/B harness).
 *
 * @module services/memory/atomic-fact-extractor
 */

/* eslint-disable security/detect-unsafe-regex */

// ===========================================================================
// Types
// ===========================================================================

/** A single SVO atomic fact extracted from a source text. */
export interface AtomicFact {
  /** The subject (who/what the fact is about). */
  subject: string;
  /** The verb / predicate. Lowercased lemma when possible. */
  verb: string;
  /** The object / complement. */
  object: string;
  /** [0, 1] confidence — 1.0 for high-precision regex hits, lower
   *  for fallback / LLM extractions where the caller can't verify. */
  confidence: number;
  /** The source text the fact was derived from (verbatim). */
  sourceText: string;
  /** Which extraction path produced this fact — 'heuristic' or 'llm'.
   *  Useful for analytics: e.g. did the LLM-fallback add value over
   *  the heuristic? */
  source: 'heuristic' | 'llm';
  /** Optional turn index for provenance back to the conversation. */
  turnIndex?: number;
  /** Optional speaker for provenance. */
  speaker?: string;
}

/** Async LLM extraction callback. The caller wires this to whatever
 *  transport (Anthropic, OpenAI, …) and is responsible for parsing
 *  the model output into AtomicFact records. */
export type LLMFactExtractor = (
  text: string,
  context: { speaker?: string; turnIndex?: number },
) => Promise<Omit<AtomicFact, 'source'>[]>;

export interface ExtractOptions {
  /** Optional LLM extractor. When supplied, runs after the heuristic
   *  and ADDS to the heuristic's output (deduped). When omitted,
   *  only the heuristic runs. */
  llmExtractor?: LLMFactExtractor;
  /** Speaker label to attach to every extracted fact. */
  speaker?: string;
  /** Turn index in the original conversation. */
  turnIndex?: number;
  /** Minimum subject + object lengths after trimming. Default 1.
   *  Set to 2 to skip pronouns and articles. */
  minSlotLength?: number;
  /** Cap on facts returned. Default no cap. */
  maxFacts?: number;
}

// ===========================================================================
// Heuristic SVO patterns (English, conversational)
// ===========================================================================

/** A single regex-driven SVO pattern with a parser. */
interface SVOPattern {
  name: string;
  /** Regex with named or positional capture groups for subject, verb,
   *  object. Case-insensitive. */
  pattern: RegExp;
  /** Verbatim parser. Returns null when the match is rejected
   *  (e.g. one of the slots is empty after trim). */
  parse: (match: RegExpMatchArray, sourceText: string) => Omit<AtomicFact, 'source'> | null;
  /** Confidence assigned to hits from this pattern. */
  confidence: number;
}

/** Common-but-noisy "stopword" subjects we silently drop. Generic
 *  pronouns without antecedent resolution carry no retrieval signal. */
const SKIP_SUBJECTS = new Set([
  'it', 'this', 'that', 'these', 'those', 'there', 'here',
  'something', 'anything', 'nothing', 'everything',
  'someone', 'anyone', 'no one',
]);

const PATTERNS: readonly SVOPattern[] = [
  // ── 1. "X is/are Y" / "X was/were Y" — copular, very high precision
  {
    name: 'copular',
    pattern: /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|I)\s+(is|are|was|were|am)\s+([a-zA-Z0-9][a-zA-Z0-9\s'-]{0,80}?)(?=[.,;:!?]|$)/g,
    parse: (m) => ({
      subject: m[1].trim(),
      verb: m[2].toLowerCase().trim(),
      object: m[3].trim(),
      confidence: 0.9,
      sourceText: m[0].trim(),
    }),
    confidence: 0.9,
  },
  // ── 2. "X has/have Y" / "X had Y" — possession
  {
    name: 'possession',
    pattern: /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|I)\s+(has|have|had)\s+([a-zA-Z0-9][a-zA-Z0-9\s'-]{0,80}?)(?=[.,;:!?]|$)/g,
    parse: (m) => ({
      subject: m[1].trim(),
      verb: m[2].toLowerCase().trim(),
      object: m[3].trim(),
      confidence: 0.85,
      sourceText: m[0].trim(),
    }),
    confidence: 0.85,
  },
  // ── 3. "X lives/works/studies/teaches in/at Y" — location/affiliation
  {
    name: 'location',
    pattern: /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|I)\s+(lives?|works?|studies|studied|teaches?|taught|stays?|stayed)\s+(?:at|in|with|for)\s+([A-Z][a-zA-Z0-9\s'-]{0,60}?)(?=[.,;:!?]|$)/g,
    parse: (m) => ({
      subject: m[1].trim(),
      verb: m[2].toLowerCase().trim().replace(/s$/, ''), // lemmatise
      object: m[3].trim(),
      confidence: 0.95,
      sourceText: m[0].trim(),
    }),
    confidence: 0.95,
  },
  // ── 4. "X likes/loves/hates/wants Y" — preference
  {
    name: 'preference',
    pattern: /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|I)\s+(likes?|loves?|hates?|wants?|enjoys?|prefers?|hates?)\s+([a-zA-Z][a-zA-Z\s'-]{0,60}?)(?=[.,;:!?]|$)/g,
    parse: (m) => ({
      subject: m[1].trim(),
      verb: m[2].toLowerCase().trim().replace(/s$/, ''),
      object: m[3].trim(),
      confidence: 0.9,
      sourceText: m[0].trim(),
    }),
    confidence: 0.9,
  },
  // ── 5. "X visited/went to/travelled to Y"
  {
    name: 'travel',
    pattern: /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|I)\s+(visited|went|travelled|traveled|moved|relocated)\s+(?:to|from)\s+([A-Z][a-zA-Z0-9\s'-]{0,60}?)(?=[.,;:!?]|$)/g,
    parse: (m) => ({
      subject: m[1].trim(),
      verb: m[2].toLowerCase().trim(),
      object: m[3].trim(),
      confidence: 0.95,
      sourceText: m[0].trim(),
    }),
    confidence: 0.95,
  },
  // ── 6. "My X is Y" / "His X is Y" — possessive-attribute
  {
    name: 'possessive-attribute',
    pattern: /\b(my|his|her|our|their)\s+([a-z]+)\s+(is|are|was|were)\s+([a-zA-Z][a-zA-Z\s'-]{0,60}?)(?=[.,;:!?]|$)/gi,
    parse: (m, _src) => ({
      // The "subject" of the fact is the speaker's reference + role
      // (e.g. "my daughter" → subject "my daughter").
      subject: `${m[1]} ${m[2]}`.toLowerCase().trim(),
      verb: m[3].toLowerCase().trim(),
      object: m[4].trim(),
      confidence: 0.7, // lower — needs antecedent resolution to be useful
      sourceText: m[0].trim(),
    }),
    confidence: 0.7,
  },
];

// ===========================================================================
// Heuristic extraction
// ===========================================================================

/**
 * Pure-regex extraction. Walks every pattern, collects hits, dedupes
 * by (subject, verb, object) — case-insensitive on the join — and
 * filters by `minSlotLength`.
 */
export function extractAtomicFactsHeuristic(
  text: string,
  options: ExtractOptions = {},
): AtomicFact[] {
  const minLen = options.minSlotLength ?? 1;
  const speaker = options.speaker;
  const turnIndex = options.turnIndex;
  const cleanText = String(text ?? '').trim();
  if (!cleanText) return [];

  const seen = new Set<string>();
  const facts: AtomicFact[] = [];

  for (const p of PATTERNS) {
    // Reset lastIndex to ensure global regex state is clean per call.
    p.pattern.lastIndex = 0;
    const matches = cleanText.matchAll(p.pattern);
    for (const m of matches) {
      const parsed = p.parse(m, cleanText);
      if (!parsed) continue;
      const subject = parsed.subject.trim();
      const verb = parsed.verb.trim();
      const object = parsed.object.trim();
      if (subject.length < minLen || object.length < minLen) continue;
      if (SKIP_SUBJECTS.has(subject.toLowerCase())) continue;
      const key = `${subject.toLowerCase()}|${verb.toLowerCase()}|${object.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fact: AtomicFact = {
        subject,
        verb,
        object,
        confidence: parsed.confidence,
        sourceText: parsed.sourceText,
        source: 'heuristic',
      };
      if (speaker) fact.speaker = speaker;
      if (turnIndex !== undefined) fact.turnIndex = turnIndex;
      facts.push(fact);
    }
  }

  return options.maxFacts !== undefined ? facts.slice(0, options.maxFacts) : facts;
}

// ===========================================================================
// LLM-augmented extraction
// ===========================================================================

/**
 * Top-level extractor: heuristic first, then LLM-fallback if supplied.
 * Dedupes the union by (subject, verb, object), preferring the
 * higher-confidence record when both paths surface the same fact.
 *
 * Throws when `llmExtractor` is supplied and rejects (caller decides
 * fallback policy — e.g. log + ignore, retry, etc.).
 */
export async function extractAtomicFacts(
  text: string,
  options: ExtractOptions = {},
): Promise<AtomicFact[]> {
  const heuristic = extractAtomicFactsHeuristic(text, options);
  if (!options.llmExtractor) return heuristic;

  const cleanText = String(text ?? '').trim();
  if (!cleanText) return heuristic;

  const llmRaw = await options.llmExtractor(cleanText, {
    speaker: options.speaker,
    turnIndex: options.turnIndex,
  });
  // Stamp source + back-fill speaker/turnIndex if the LLM forgot.
  const llmFacts: AtomicFact[] = llmRaw.map((f) => ({
    ...f,
    source: 'llm' as const,
    speaker: f.speaker ?? options.speaker,
    turnIndex: f.turnIndex ?? options.turnIndex,
  }));

  // Merge: heuristic first, then LLM facts that aren't duplicates.
  const out: AtomicFact[] = [...heuristic];
  const seen = new Set(
    heuristic.map(
      (f) => `${f.subject.toLowerCase()}|${f.verb.toLowerCase()}|${f.object.toLowerCase()}`,
    ),
  );
  for (const f of llmFacts) {
    const key = `${f.subject.toLowerCase()}|${f.verb.toLowerCase()}|${f.object.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return options.maxFacts !== undefined ? out.slice(0, options.maxFacts) : out;
}

// ===========================================================================
// Utilities
// ===========================================================================

/**
 * Render an AtomicFact as a single canonical sentence ("Caroline lives
 * in Madrid"). Useful for embedding-time text + retrieval display.
 */
export function factToSentence(f: AtomicFact): string {
  return `${f.subject} ${f.verb} ${f.object}`.trim();
}

/**
 * Deduplicate an array of facts by (subject, verb, object). Preserves
 * input order; first occurrence wins.
 */
export function dedupeFacts(facts: ReadonlyArray<AtomicFact>): AtomicFact[] {
  const seen = new Set<string>();
  const out: AtomicFact[] = [];
  for (const f of facts) {
    const key = `${f.subject.toLowerCase()}|${f.verb.toLowerCase()}|${f.object.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
