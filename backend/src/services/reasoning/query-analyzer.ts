/**
 * Query Analyzer (Phase 127, Task 1)
 *
 * Pure heuristic analysis of user queries — no async, no DB, no LLM.
 * Extracts intent, domain, complexity, temporal references, and other metadata
 * that GWT modules use for salience scoring.
 */

export interface QueryAnalysis {
  intent: 'question' | 'task' | 'discussion' | 'creative' | 'recall';
  domain: string; // 'finance' | 'code' | 'email' | 'personal' | 'learning' | 'general'
  complexity: number; // 0–1
  temporalReference: 'past' | 'present' | 'future' | null;
  entityMentions: string[]; // Simple NER
  isFollowUp: boolean;
  expectedOutputType: 'text' | 'code' | 'document' | 'list' | 'analysis';
  language: 'de' | 'en' | 'other';
}

// ─── Keyword Sets ──────────────────────────────────────────────────────────

const INTERROGATIVES = /^(was|wer|wie|warum|wann|wo|welche[rns]?|welch|can|what|how|why|when|where|which)\b/i;

const TASK_VERBS =
  /\b(erstell[et]?|schreib[et]?|mach[et]?|generier[et]?|create|write|make|build|generate|send|sende|sende[nt]?)\b/i;

const CREATIVE_KEYWORDS =
  /\b(brainstorm|idee|ideen|kreativ|vorstell[et]?|imagine|story|gedicht|poem|erzähl[et]?)\b/i;

const RECALL_KEYWORDS =
  /\b(erinnerst|weißt du noch|letztens|vorhin|remember|last time|earlier|kürzlich)\b/i;

const DOMAIN_KEYWORDS: Record<string, RegExp> = {
  finance:
    /\b(geld|budget|rechnung|kosten|umsatz|revenue|invoice|money|price|cost|payment|ausgaben|einnahmen|gehalt|salary)\b/i,
  code: /\b(code|funktion|function|api|bug|error|typescript|python|javascript|react|git|deploy|kompilier|debug|script|repository|library)\b/i,
  email:
    /\b(email|e-mail|mail|nachricht|inbox|antwort|reply|send|sende|forward|weiterleiten|betreff|subject)\b/i,
  learning:
    /\b(lernen|kurs|tutorial|verstehen|erkläre|erklären|explain|learn|study|understand|concept|konzept)\b/i,
  personal:
    /\b(privat|personal|family|hobby|urlaub|geburtstag|birthday|vacation|freunde|friends)\b/i,
};

// Personal domain also triggers on first-person possessive at word boundary
const PERSONAL_FIRST_PERSON = /\b(mein|meine|meinen|meinem|meiner)\b/i;

const TEMPORAL_PAST =
  /\b(gestern|letzte woche|letzte[mn]?|vorige[mn]?|vorhin|kürzlich|yesterday|last week|previously|earlier|ago)\b/i;

const TEMPORAL_FUTURE =
  /\b(morgen|nächste[rns]?|nächsten|bald|demnächst|tomorrow|next week|soon|upcoming|later)\b/i;

const TEMPORAL_PRESENT = /\b(jetzt|gerade|aktuell|heute|now|currently|today|right now)\b/i;

const CONJUNCTIONS = /\b(und|oder|aber|weil|obwohl|and|or|but|because|although|however)\b/i;
const COMPARISON_WORDS = /\b(vergleich[et]?|besser|unterschied|compare|better|versus|vs\.?|differ)\b/i;
const NUMBER_PATTERN = /\d+/;

const OUTPUT_CODE_KEYWORDS = /\b(code|funktion|function|script|api|endpoint|class|method|algorithm)\b/i;
const OUTPUT_DOCUMENT_KEYWORDS =
  /\b(bericht|report|document|präsentation|presentation|brief|letter|aufsatz|essay)\b/i;
const OUTPUT_LIST_KEYWORDS = /\b(liste|aufzählen|list|enumerate|steps|schritte|auflistung|items)\b/i;
const OUTPUT_ANALYSIS_KEYWORDS =
  /\b(analyse|analysiere|vergleich[et]?|pros|cons|analyze|compare|comparison|vor- und nachteile|unterschied)\b/i;

// Common German words that should NOT be treated as named entities (capitalized but common)
const COMMON_GERMAN_CAPITALIZED = new Set([
  'Ich',
  'Du',
  'Er',
  'Sie',
  'Es',
  'Wir',
  'Ihr',
  'Der',
  'Die',
  'Das',
  'Den',
  'Dem',
  'Des',
  'Ein',
  'Eine',
  'Einen',
  'Einem',
  'Einer',
  'Und',
  'Oder',
  'Aber',
  'Weil',
  'Obwohl',
  'Nicht',
  'Kein',
  'Keine',
  'Ist',
  'Sind',
  'War',
  'Waren',
  'Wird',
  'Werden',
  'Hat',
  'Haben',
  'Kann',
  'Können',
  'Muss',
  'Müssen',
  'Soll',
  'Sollen',
  'Will',
  'Wollen',
  'Darf',
  'Dürfen',
  'Wenn',
  'Als',
  'Wie',
  'Was',
  'Wer',
  'Wo',
  'Wann',
  'Warum',
  'Welche',
  'Welcher',
  'Welches',
  'Mit',
  'Von',
  'Für',
  'Aus',
  'Bei',
  'Über',
  'Unter',
  'Nach',
  'Vor',
  'Auf',
  'An',
  'In',
  'Zu',
  'Zum',
  'Zur',
  'Am',
  'Im',
  'Auch',
  'Noch',
  'Schon',
  'Nur',
  'Mehr',
  'Sehr',
  'Viel',
  'Alle',
  'Alles',
  'Diese',
  'Dieser',
  'Dieses',
  'Jede',
  'Jeder',
  'Jedes',
  'Neue',
  'Neuer',
  'Neues',
]);

// Follow-up start words (pronouns / demonstratives / references)
const FOLLOW_UP_STARTS =
  /^(das|dies|diese|dieser|dieses|er|sie|es|davon|darüber|dazu|this|that|it|those|about it|und|aber|also|and|but|so)\b/i;

// Anaphoric reference words anywhere in a query (for domain inheritance heuristic)
const ANAPHORIC_REFERENCES =
  /\b(davon|darüber|dazu|daraus|darauf|darin|damit|danach|davor|thereof|about it|from it|more of that|more of this|zeig mir mehr|tell me more)\b/i;

// German language markers
const GERMAN_INDICATORS =
  /[äöüßÄÖÜ]|\b(und|oder|ist|ich|der|die|das|nicht|aber|für|von|mit|auf|ein|eine|hat|haben|wird|werden|kann|den|dem|des|mir|mich|wir|sie|ihr|er|es|auch|noch|schon|nur|mehr)\b/i;

// English language markers
const ENGLISH_INDICATORS =
  /\b(the|is|are|this|that|not|and|or|to|of|in|it|for|with|on|at|from|have|has|be|been|being|do|does|did|will|would|could|should|can|may|might|shall|a|an)\b/i;

// ─── Main Export ───────────────────────────────────────────────────────────

/**
 * Analyze a user query using pure heuristics (no LLM, no DB, no async).
 *
 * @param query         The raw user query string.
 * @param recentContext Optional recent context for domain inheritance.
 */
export function analyzeQuery(
  query: string,
  recentContext?: { lastDomain?: string; lastEntities?: string[] }
): QueryAnalysis {
  const trimmed = query.trim();

  return {
    intent: detectIntent(trimmed),
    domain: detectDomain(trimmed, recentContext),
    complexity: computeComplexity(trimmed),
    temporalReference: detectTemporalReference(trimmed),
    entityMentions: extractEntities(trimmed),
    isFollowUp: detectFollowUp(trimmed),
    expectedOutputType: detectOutputType(trimmed),
    language: detectLanguage(trimmed),
  };
}

// ─── Intent Detection ──────────────────────────────────────────────────────

function detectIntent(
  query: string
): 'question' | 'task' | 'discussion' | 'creative' | 'recall' {
  if (!query) {return 'discussion';}

  // Recall takes highest priority — user is asking about memory
  if (RECALL_KEYWORDS.test(query)) {return 'recall';}

  // Creative next
  if (CREATIVE_KEYWORDS.test(query)) {
    // If no task verb accompanies, it's creative; otherwise creative still wins for "gedicht"
    const hasGedicht = /\b(gedicht|poem|story|erzähl)\b/i.test(query);
    if (hasGedicht || !TASK_VERBS.test(query)) {return 'creative';}
  }

  // Question: interrogative word at start OR ends with ?
  if (INTERROGATIVES.test(query) || query.trim().endsWith('?')) {return 'question';}

  // Task: action verb present
  if (TASK_VERBS.test(query)) {return 'task';}

  // Discussion: default
  return 'discussion';
}

// ─── Domain Detection ──────────────────────────────────────────────────────

function detectDomain(
  query: string,
  recentContext?: { lastDomain?: string; lastEntities?: string[] }
): string {
  if (!query) {
    return recentContext?.lastDomain ?? 'general';
  }

  // Check finance first (high specificity)
  for (const [domain, pattern] of Object.entries(DOMAIN_KEYWORDS)) {
    if (domain !== 'personal' && pattern.test(query)) {return domain;}
  }

  // Personal: either keyword set or first-person possessive
  if (DOMAIN_KEYWORDS.personal.test(query) || PERSONAL_FIRST_PERSON.test(query)) {
    return 'personal';
  }

  // Fallback to lastDomain when: query starts with follow-up marker OR contains anaphoric reference
  if (recentContext?.lastDomain && recentContext.lastDomain !== 'general') {
    if (detectFollowUp(query) || ANAPHORIC_REFERENCES.test(query)) {
      return recentContext.lastDomain;
    }
  }

  return 'general';
}

// ─── Complexity Heuristic ──────────────────────────────────────────────────

function computeComplexity(query: string): number {
  if (!query) {return 0;}

  const words = query.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount <= 1) {return 0;}

  let score = 0;

  if (wordCount > 30) {score += 0.3;}
  if (wordCount > 100) {score += 0.4;} // long queries are inherently complex
  if (wordCount > 150) {score += 0.3;} // very long queries push to cap
  if (CONJUNCTIONS.test(query)) {score += 0.2;}

  // Entity count — compute inline to avoid circular dep
  const entities = extractEntities(query);
  if (entities.length > 2) {score += 0.2;}

  if (NUMBER_PATTERN.test(query)) {score += 0.1;}
  if (COMPARISON_WORDS.test(query)) {score += 0.2;}

  return Math.min(1.0, score);
}

// ─── Temporal Detection ───────────────────────────────────────────────────

function detectTemporalReference(query: string): 'past' | 'present' | 'future' | null {
  if (!query) {return null;}

  if (TEMPORAL_PAST.test(query)) {return 'past';}
  if (TEMPORAL_FUTURE.test(query)) {return 'future';}
  if (TEMPORAL_PRESENT.test(query)) {return 'present';}

  return null;
}

// ─── Entity Extraction ────────────────────────────────────────────────────

function extractEntities(query: string): string[] {
  if (!query) {return [];}

  const entities = new Set<string>();

  // 1. Extract quoted strings (remove surrounding quotes)
  const quotedPattern = /[""]([^"""]+)["""]/g;
  let match: RegExpExecArray | null;
  while ((match = quotedPattern.exec(query)) !== null) {
    const inner = match[1].trim();
    if (inner) {entities.add(inner);}
  }

  // 2. Extract @mentions and #tags
  const atHashPattern = /[@#](\w+)/g;
  while ((match = atHashPattern.exec(query)) !== null) {
    entities.add(match[0]); // include the @ or #
  }

  // 3. Capitalized / CamelCase / PascalCase words NOT at the very start of the string
  //    and not in the common-words exclusion list.
  //    Pattern matches: initial capital followed by letters (including uppercase), e.g. TypeScript, React, Google
  const wordPattern = /\b([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ]+)\b/g;

  while ((match = wordPattern.exec(query)) !== null) {
    const word = match[1];
    const matchIndex = match.index;

    // Skip if at position 0 (very first word of entire query)
    if (matchIndex === 0) {continue;}

    // Skip common German words
    if (COMMON_GERMAN_CAPITALIZED.has(word)) {continue;}

    // Skip short words
    if (word.length < 2) {continue;}

    entities.add(word);
  }

  return Array.from(entities);
}

// ─── Follow-up Detection ──────────────────────────────────────────────────

function detectFollowUp(query: string): boolean {
  if (!query) {return false;}
  return FOLLOW_UP_STARTS.test(query.trim());
}

// ─── Expected Output Type ─────────────────────────────────────────────────

function detectOutputType(
  query: string
): 'text' | 'code' | 'document' | 'list' | 'analysis' {
  if (!query) {return 'text';}

  // Analysis check first (highest specificity for explicit "analyse" etc.)
  if (OUTPUT_ANALYSIS_KEYWORDS.test(query)) {return 'analysis';}

  // Code: either code domain keywords or explicit mention
  if (OUTPUT_CODE_KEYWORDS.test(query)) {return 'code';}

  // Document: task + document/report
  if (OUTPUT_DOCUMENT_KEYWORDS.test(query)) {return 'document';}

  // List
  if (OUTPUT_LIST_KEYWORDS.test(query)) {return 'list';}

  return 'text';
}

// ─── Language Detection ───────────────────────────────────────────────────

function detectLanguage(query: string): 'de' | 'en' | 'other' {
  if (!query) {return 'de';}

  const deMatches = (query.match(GERMAN_INDICATORS) ?? []).length;
  const enMatches = (query.match(ENGLISH_INDICATORS) ?? []).length;

  if (deMatches === 0 && enMatches === 0) {return 'de';} // default
  if (enMatches > deMatches) {return 'en';}
  return 'de'; // tie → German default
}
