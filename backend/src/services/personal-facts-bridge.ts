/**
 * Personal Facts Bridge Service
 *
 * Bridges PersonalizationChat facts (personal_facts table, personal schema)
 * into ALL Claude API calls across the system. User identity is context-independent:
 * regardless of whether the user is in work/learning/creative context,
 * the AI should know who they are.
 *
 * Architecture:
 *   PersonalizationChat → personal_facts (personal schema)
 *                              ↓
 *              personal-facts-bridge.ts (THIS FILE)
 *                              ↓
 *   GeneralChat / Streaming / Extended-Thinking / Idea-Structuring
 *
 * Facts are loaded from the personal schema and formatted as a system prompt
 * section that can be injected into any Claude API call.
 *
 * Phase 42 Enhancement: Query-Relevant Fact Selection
 * Instead of always loading the same top-25 facts, the bridge now supports
 * a two-tier approach:
 * 1. Core Profile (always included): basic_info + communication_style (~8 facts)
 * 2. Query-Relevant Facts (dynamically selected): facts matching the current query
 *
 * Performance: Results are cached for 60 seconds to avoid redundant DB queries
 * during rapid message exchanges.
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Maximum number of facts to load from DB */
  MAX_FACTS: 40,
  /** Maximum facts in the core profile (always included) */
  MAX_CORE_FACTS: 10,
  /** Maximum query-relevant facts to add */
  MAX_RELEVANT_FACTS: 15,
  /** Cache TTL in milliseconds (60 seconds) */
  CACHE_TTL_MS: 60_000,
  /** System prompt section header */
  SECTION_HEADER: '[PERSÖNLICHES PROFIL]',
  /** Instruction for the AI */
  SECTION_FOOTER: 'Nutze dieses Wissen für personalisierte, empathische Antworten. Sprich den Benutzer so an, wie er es bevorzugt.',
  /** Categories that are always included in core profile */
  CORE_CATEGORIES: ['basic_info', 'communication_style', 'personality'] as readonly string[],
};

// ===========================================
// Types & Cache
// ===========================================

interface PersonalFactRow {
  category: string;
  fact_key: string;
  fact_value: string;
  confidence: number;
}

interface CachedAllFacts {
  rows: PersonalFactRow[];
  timestamp: number;
}

let allFactsCache: CachedAllFacts | null = null;

// ===========================================
// Category Labels (German)
// ===========================================

export const VALID_CATEGORIES: string[] = [
  'basic_info', 'personality', 'work_life', 'goals_dreams',
  'interests_hobbies', 'communication_style', 'decision_making',
  'daily_routines', 'values_beliefs', 'challenges',
];

export const CATEGORY_LABELS: Record<string, string> = {
  basic_info: 'Grundlegendes',
  personality: 'Persönlichkeit',
  work_life: 'Arbeit & Beruf',
  goals_dreams: 'Ziele & Träume',
  interests_hobbies: 'Interessen & Hobbys',
  communication_style: 'Kommunikationsstil',
  decision_making: 'Entscheidungsfindung',
  daily_routines: 'Tagesablauf',
  values_beliefs: 'Werte & Überzeugungen',
  challenges: 'Herausforderungen',
};

// ===========================================
// Internal: Load All Facts
// ===========================================

/**
 * Load all personal facts from DB (cached for 60s).
 * Returns raw rows for flexible filtering.
 */
async function loadAllFacts(): Promise<PersonalFactRow[]> {
  if (allFactsCache && (Date.now() - allFactsCache.timestamp) < CONFIG.CACHE_TTL_MS) {
    return allFactsCache.rows;
  }

  try {
    const result = await queryContext('personal' as AIContext, `
      SELECT category, fact_key, fact_value, confidence
      FROM personal_facts
      ORDER BY confidence DESC, updated_at DESC
      LIMIT $1
    `, [CONFIG.MAX_FACTS]);

    const rows: PersonalFactRow[] = result.rows.map((r: Record<string, unknown>) => ({
      category: (r.category as string) || 'sonstiges',
      fact_key: r.fact_key as string,
      fact_value: r.fact_value as string,
      confidence: parseFloat(r.confidence as string) || 0.5,
    }));

    allFactsCache = { rows, timestamp: Date.now() };
    return rows;
  } catch (error) {
    logger.debug('Failed to load personal facts', {
      error: error instanceof Error ? error.message : String(error),
    });
    allFactsCache = { rows: [], timestamp: Date.now() };
    return [];
  }
}

// ===========================================
// Internal: Format Facts
// ===========================================

/**
 * Format fact rows into a grouped, human-readable string.
 */
function formatFacts(rows: PersonalFactRow[]): string {
  const factsByCategory: Record<string, string[]> = {};

  for (const row of rows) {
    const label = CATEGORY_LABELS[row.category] || row.category;
    if (!factsByCategory[label]) {
      factsByCategory[label] = [];
    }
    factsByCategory[label].push(`${row.fact_key}: ${row.fact_value}`);
  }

  return Object.entries(factsByCategory)
    .map(([cat, facts]) => `- ${cat}: ${facts.join('; ')}`)
    .join('\n');
}

/**
 * Score a fact's relevance to a query using keyword overlap.
 * Fast heuristic: no embedding computation needed.
 */
function scoreFactRelevance(fact: PersonalFactRow, queryWords: Set<string>): number {
  if (queryWords.size === 0) {return 0;}

  const factText = `${fact.category} ${fact.fact_key} ${fact.fact_value}`.toLowerCase();
  const factKeyLower = fact.fact_key.toLowerCase();
  const factValueLower = fact.fact_value.toLowerCase();

  let matches = 0;
  for (const word of queryWords) {
    if (factText.includes(word)) {
      matches++;
      // Boost for key/value matches (these are more significant)
      if (factKeyLower.includes(word) || factValueLower.includes(word)) {
        matches += 0.5;
      }
    }
  }

  return matches / Math.max(1, queryWords.size);
}

// ===========================================
// Public API
// ===========================================

/**
 * Load personal facts from the PersonalizationChat (personal_facts table).
 * These facts represent the user's identity learned through the "Lerne mich kennen" feature.
 * Always reads from the personal schema (user identity is context-independent).
 *
 * Results are cached for 60 seconds.
 *
 * @returns Formatted string of personal facts, or null if none exist
 */
export async function getPersonalFacts(): Promise<string | null> {
  const rows = await loadAllFacts();
  if (rows.length === 0) {return null;}
  return formatFacts(rows);
}

/**
 * Build a system prompt section with personal facts.
 * Returns an empty string if no facts are available.
 *
 * Phase 42 Enhancement: When a query is provided, uses two-tier selection:
 * 1. Core Profile: basic_info + communication_style (always included)
 * 2. Query-Relevant Facts: additional facts matching the current query
 *
 * This keeps the prompt focused and efficient while ensuring essential
 * identity information is always present.
 *
 * @param query Optional current user message for relevance-based selection
 */
export async function getPersonalFactsPromptSection(query?: string): Promise<string> {
  const allRows = await loadAllFacts();
  if (allRows.length === 0) {return '';}

  let selectedRows: PersonalFactRow[];

  if (!query || allRows.length <= CONFIG.MAX_CORE_FACTS + CONFIG.MAX_RELEVANT_FACTS) {
    // No query or few facts: include all
    selectedRows = allRows;
  } else {
    // Two-tier selection
    const coreFacts = allRows.filter(r => CONFIG.CORE_CATEGORIES.includes(r.category));
    const nonCoreFacts = allRows.filter(r => !CONFIG.CORE_CATEGORIES.includes(r.category));

    // Score non-core facts by relevance to query
    const queryWords = new Set(
      query.toLowerCase()
        .replace(/[.,!?;:]+/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2)
    );

    const scoredNonCore = nonCoreFacts
      .map(f => ({ fact: f, score: scoreFactRelevance(f, queryWords) }))
      .sort((a, b) => {
        // Sort by relevance score, then by confidence
        if (b.score !== a.score) {return b.score - a.score;}
        return b.fact.confidence - a.fact.confidence;
      });

    // Take core + top relevant non-core
    const relevantNonCore = scoredNonCore
      .slice(0, CONFIG.MAX_RELEVANT_FACTS)
      .map(s => s.fact);

    selectedRows = [...coreFacts.slice(0, CONFIG.MAX_CORE_FACTS), ...relevantNonCore];
  }

  const formatted = formatFacts(selectedRows);
  if (!formatted) {return '';}

  return `\n\n${CONFIG.SECTION_HEADER}\nFolgendes weißt du über den Benutzer (aus persönlichen Gesprächen):\n${formatted}\n${CONFIG.SECTION_FOOTER}`;
}

/**
 * Invalidate the facts cache.
 * Call this after PersonalizationChat stores new facts.
 */
export function invalidatePersonalFactsCache(): void {
  allFactsCache = null;
}
