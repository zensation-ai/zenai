/**
 * Semantic Search 2.0 — Universal Cross-Feature Search (Phase 95)
 *
 * Unified search across ALL ZenAI features:
 * ideas, emails, tasks, contacts, documents, chat_messages,
 * calendar_events, transactions, knowledge_entities.
 *
 * Features:
 * - Multi-type parallel search with ILIKE text matching
 * - Relevance scoring: exact > prefix > contains
 * - Type prefix shortcuts: @ contacts, # ideas, $ finance, ! tasks
 * - Faceted filtering by type, time range
 * - Search history tracking (last 20 per user)
 * - Natural language query preprocessing
 */

import { AIContext, queryContext } from '../utils/database-context';
import type { QueryParam } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type SearchEntityType =
  | 'ideas'
  | 'emails'
  | 'tasks'
  | 'contacts'
  | 'documents'
  | 'chat_messages'
  | 'calendar_events'
  | 'transactions'
  | 'knowledge_entities';

export const ALL_ENTITY_TYPES: SearchEntityType[] = [
  'ideas', 'emails', 'tasks', 'contacts', 'documents',
  'chat_messages', 'calendar_events', 'transactions', 'knowledge_entities',
];

export interface SearchResult {
  id: string;
  type: SearchEntityType;
  title: string;
  snippet: string;
  score: number;
  context: AIContext;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface UnifiedSearchOptions {
  query: string;
  context: AIContext;
  userId: string;
  types?: SearchEntityType[];
  timeRange?: { from?: string; to?: string };
  limit?: number;
}

export interface UnifiedSearchResult {
  query: string;
  totalResults: number;
  results: SearchResult[];
  facets: Record<SearchEntityType, number>;
  timingMs: number;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  result_count: number;
  selected_result: Record<string, unknown> | null;
  created_at: string;
}

export interface SearchFacets {
  types: Array<{ type: SearchEntityType; count: number }>;
}

// ===========================================
// Type Prefix Mapping
// ===========================================

const TYPE_PREFIXES: Record<string, SearchEntityType[]> = {
  '@': ['contacts'],
  '#': ['ideas'],
  '$': ['transactions'],
  '!': ['tasks'],
};

// ===========================================
// Query Preprocessing
// ===========================================

/**
 * Parse type prefix shortcuts from query.
 * E.g. "@john" -> { cleanQuery: "john", hintedTypes: ["contacts"] }
 */
export function parseTypePrefix(query: string): {
  cleanQuery: string;
  hintedTypes: SearchEntityType[] | null;
} {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { cleanQuery: trimmed, hintedTypes: null };
  }

  const prefix = trimmed[0];
  const mapping = TYPE_PREFIXES[prefix];
  if (mapping) {
    return {
      cleanQuery: trimmed.slice(1).trim(),
      hintedTypes: mapping,
    };
  }

  return { cleanQuery: trimmed, hintedTypes: null };
}

/**
 * Extract entity type hints from natural language.
 * E.g. "emails from john" -> hints at emails type
 */
export function extractEntityHints(query: string): SearchEntityType[] {
  const lower = query.toLowerCase();
  const hints: SearchEntityType[] = [];

  const hintMap: Record<string, SearchEntityType> = {
    'email': 'emails',
    'mail': 'emails',
    'nachricht': 'emails',
    'task': 'tasks',
    'aufgabe': 'tasks',
    'todo': 'tasks',
    'contact': 'contacts',
    'kontakt': 'contacts',
    'person': 'contacts',
    'document': 'documents',
    'dokument': 'documents',
    'file': 'documents',
    'datei': 'documents',
    'idea': 'ideas',
    'gedanke': 'ideas',
    'idee': 'ideas',
    'chat': 'chat_messages',
    'message': 'chat_messages',
    'event': 'calendar_events',
    'termin': 'calendar_events',
    'kalender': 'calendar_events',
    'calendar': 'calendar_events',
    'transaction': 'transactions',
    'zahlung': 'transactions',
    'payment': 'transactions',
    'finance': 'transactions',
    'entity': 'knowledge_entities',
    'knowledge': 'knowledge_entities',
    'wissen': 'knowledge_entities',
  };

  for (const [keyword, entityType] of Object.entries(hintMap)) {
    if (lower.includes(keyword) && !hints.includes(entityType)) {
      hints.push(entityType);
    }
  }

  return hints;
}

// ===========================================
// Scoring
// ===========================================

/**
 * Score a result based on how well it matches the query.
 * exact match = 1.0, prefix = 0.8, contains = 0.6, partial = 0.3
 */
export function scoreResult(text: string, query: string): number {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  if (lower === queryLower) return 1.0;
  if (lower.startsWith(queryLower)) return 0.8;
  if (lower.includes(queryLower)) return 0.6;

  // Check individual words
  const queryWords = queryLower.split(/\s+/);
  const matchedWords = queryWords.filter(w => lower.includes(w));
  if (matchedWords.length > 0) {
    return 0.3 * (matchedWords.length / queryWords.length);
  }

  return 0.1;
}

// ===========================================
// Per-Type Search Functions
// ===========================================

async function searchIdeas(
  context: AIContext, userId: string, query: string, limit: number, timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];
  let timeFilter = '';
  if (timeRange?.from) {
    params.push(timeRange.from);
    timeFilter += ` AND i.created_at >= $${params.length}`;
  }
  if (timeRange?.to) {
    params.push(timeRange.to);
    timeFilter += ` AND i.created_at <= $${params.length}`;
  }

  const sql = `
    SELECT i.id, i.title, COALESCE(SUBSTRING(i.content, 1, 200), '') AS snippet,
           i.created_at, i.status, i.priority
    FROM ideas i
    WHERE (i.title ILIKE $1 OR i.content ILIKE $1)
      AND i.user_id = $2
      ${timeFilter}
    ORDER BY i.created_at DESC
    LIMIT $3
  `;

  const result = await queryContext(context, sql, params);
  return result.rows.map(row => ({
    id: row.id,
    type: 'ideas' as SearchEntityType,
    title: row.title || 'Untitled Idea',
    snippet: row.snippet || '',
    score: scoreResult(row.title || '', query),
    context,
    timestamp: row.created_at,
    metadata: { status: row.status, priority: row.priority },
  }));
}

async function searchEmails(
  context: AIContext, userId: string, query: string, limit: number, timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];
  let timeFilter = '';
  if (timeRange?.from) {
    params.push(timeRange.from);
    timeFilter += ` AND e.created_at >= $${params.length}`;
  }
  if (timeRange?.to) {
    params.push(timeRange.to);
    timeFilter += ` AND e.created_at <= $${params.length}`;
  }

  const sql = `
    SELECT e.id, e.subject, COALESCE(SUBSTRING(e.body_text, 1, 200), '') AS snippet,
           e.created_at, e.from_address, e.status
    FROM emails e
    WHERE (e.subject ILIKE $1 OR e.body_text ILIKE $1 OR e.from_address ILIKE $1)
      AND e.user_id = $2
      ${timeFilter}
    ORDER BY e.created_at DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'emails' as SearchEntityType,
      title: row.subject || 'No Subject',
      snippet: row.snippet || '',
      score: scoreResult(row.subject || '', query),
      context,
      timestamp: row.created_at,
      metadata: { from: row.from_address, status: row.status },
    }));
  } catch (e) {
    logger.warn('searchEmails failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function searchTasks(
  context: AIContext, userId: string, query: string, limit: number, timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];
  let timeFilter = '';
  if (timeRange?.from) {
    params.push(timeRange.from);
    timeFilter += ` AND t.created_at >= $${params.length}`;
  }
  if (timeRange?.to) {
    params.push(timeRange.to);
    timeFilter += ` AND t.created_at <= $${params.length}`;
  }

  const sql = `
    SELECT t.id, t.title, COALESCE(SUBSTRING(t.description, 1, 200), '') AS snippet,
           t.created_at, t.status, t.priority
    FROM tasks t
    WHERE (t.title ILIKE $1 OR t.description ILIKE $1)
      AND t.user_id = $2
      ${timeFilter}
    ORDER BY t.created_at DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'tasks' as SearchEntityType,
      title: row.title || 'Untitled Task',
      snippet: row.snippet || '',
      score: scoreResult(row.title || '', query),
      context,
      timestamp: row.created_at,
      metadata: { status: row.status, priority: row.priority },
    }));
  } catch (e) {
    logger.warn('searchTasks failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function searchContacts(
  context: AIContext, userId: string, query: string, limit: number, _timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];

  const sql = `
    SELECT c.id, c.name, COALESCE(c.email, '') AS email,
           COALESCE(c.company, '') AS company, c.created_at
    FROM contacts c
    WHERE (c.name ILIKE $1 OR c.email ILIKE $1 OR c.company ILIKE $1)
      AND c.user_id = $2
    ORDER BY c.created_at DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'contacts' as SearchEntityType,
      title: row.name || 'Unknown Contact',
      snippet: [row.email, row.company].filter(Boolean).join(' - '),
      score: scoreResult(row.name || '', query),
      context,
      timestamp: row.created_at,
      metadata: { email: row.email, company: row.company },
    }));
  } catch (e) {
    logger.warn('searchContacts failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function searchDocuments(
  context: AIContext, userId: string, query: string, limit: number, timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];
  let timeFilter = '';
  if (timeRange?.from) {
    params.push(timeRange.from);
    timeFilter += ` AND d.created_at >= $${params.length}`;
  }
  if (timeRange?.to) {
    params.push(timeRange.to);
    timeFilter += ` AND d.created_at <= $${params.length}`;
  }

  const sql = `
    SELECT d.id, d.title, COALESCE(SUBSTRING(d.content, 1, 200), '') AS snippet,
           d.created_at, d.file_type
    FROM documents d
    WHERE (d.title ILIKE $1 OR d.content ILIKE $1)
      AND d.user_id = $2
      ${timeFilter}
    ORDER BY d.created_at DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'documents' as SearchEntityType,
      title: row.title || 'Untitled Document',
      snippet: row.snippet || '',
      score: scoreResult(row.title || '', query),
      context,
      timestamp: row.created_at,
      metadata: { fileType: row.file_type },
    }));
  } catch (e) {
    logger.warn('searchDocuments failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function searchChatMessages(
  context: AIContext, userId: string, query: string, limit: number, timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];
  let timeFilter = '';
  if (timeRange?.from) {
    params.push(timeRange.from);
    timeFilter += ` AND m.created_at >= $${params.length}`;
  }
  if (timeRange?.to) {
    params.push(timeRange.to);
    timeFilter += ` AND m.created_at <= $${params.length}`;
  }

  const sql = `
    SELECT m.id, SUBSTRING(m.content, 1, 100) AS title,
           COALESCE(SUBSTRING(m.content, 1, 200), '') AS snippet,
           m.created_at, m.role, m.session_id
    FROM general_chat_messages m
    JOIN general_chat_sessions s ON s.id = m.session_id
    WHERE m.content ILIKE $1
      AND s.user_id = $2
      ${timeFilter}
    ORDER BY m.created_at DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'chat_messages' as SearchEntityType,
      title: (row.title || '').substring(0, 80) + ((row.title || '').length > 80 ? '...' : ''),
      snippet: row.snippet || '',
      score: scoreResult(row.snippet || '', query),
      context,
      timestamp: row.created_at,
      metadata: { role: row.role, sessionId: row.session_id },
    }));
  } catch (e) {
    logger.warn('searchChatMessages failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function searchCalendarEvents(
  context: AIContext, userId: string, query: string, limit: number, timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];
  let timeFilter = '';
  if (timeRange?.from) {
    params.push(timeRange.from);
    timeFilter += ` AND ce.start_time >= $${params.length}`;
  }
  if (timeRange?.to) {
    params.push(timeRange.to);
    timeFilter += ` AND ce.start_time <= $${params.length}`;
  }

  const sql = `
    SELECT ce.id, ce.title, COALESCE(ce.description, '') AS snippet,
           ce.start_time AS created_at, ce.location
    FROM calendar_events ce
    WHERE (ce.title ILIKE $1 OR ce.description ILIKE $1 OR ce.location ILIKE $1)
      AND ce.user_id = $2
      ${timeFilter}
    ORDER BY ce.start_time DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'calendar_events' as SearchEntityType,
      title: row.title || 'Untitled Event',
      snippet: row.snippet || '',
      score: scoreResult(row.title || '', query),
      context,
      timestamp: row.created_at,
      metadata: { location: row.location },
    }));
  } catch (e) {
    logger.warn('searchCalendarEvents failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function searchTransactions(
  context: AIContext, userId: string, query: string, limit: number, timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];
  let timeFilter = '';
  if (timeRange?.from) {
    params.push(timeRange.from);
    timeFilter += ` AND ft.created_at >= $${params.length}`;
  }
  if (timeRange?.to) {
    params.push(timeRange.to);
    timeFilter += ` AND ft.created_at <= $${params.length}`;
  }

  const sql = `
    SELECT ft.id, ft.description, ft.amount, ft.currency,
           ft.created_at, ft.category
    FROM financial_transactions ft
    WHERE (ft.description ILIKE $1 OR ft.category ILIKE $1)
      AND ft.user_id = $2
      ${timeFilter}
    ORDER BY ft.created_at DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'transactions' as SearchEntityType,
      title: row.description || 'Transaction',
      snippet: `${row.amount ?? ''} ${row.currency ?? ''} - ${row.category ?? ''}`.trim(),
      score: scoreResult(row.description || '', query),
      context,
      timestamp: row.created_at,
      metadata: { amount: row.amount, currency: row.currency, category: row.category },
    }));
  } catch (e) {
    logger.warn('searchTransactions failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function searchKnowledgeEntities(
  context: AIContext, userId: string, query: string, limit: number, _timeRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const params: QueryParam[] = [`%${query}%`, userId, limit];

  const sql = `
    SELECT ke.id, ke.name, COALESCE(ke.description, '') AS snippet,
           ke.created_at, ke.entity_type
    FROM knowledge_entities ke
    WHERE (ke.name ILIKE $1 OR ke.description ILIKE $1)
      AND ke.user_id = $2
    ORDER BY ke.created_at DESC
    LIMIT $3
  `;

  try {
    const result = await queryContext(context, sql, params);
    return result.rows.map(row => ({
      id: row.id,
      type: 'knowledge_entities' as SearchEntityType,
      title: row.name || 'Entity',
      snippet: row.snippet || '',
      score: scoreResult(row.name || '', query),
      context,
      timestamp: row.created_at,
      metadata: { entityType: row.entity_type },
    }));
  } catch (e) {
    logger.warn('searchKnowledgeEntities failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

// ===========================================
// Search Dispatcher
// ===========================================

const SEARCH_FUNCTIONS: Record<
  SearchEntityType,
  (ctx: AIContext, userId: string, q: string, limit: number, timeRange?: { from?: string; to?: string }) => Promise<SearchResult[]>
> = {
  ideas: searchIdeas,
  emails: searchEmails,
  tasks: searchTasks,
  contacts: searchContacts,
  documents: searchDocuments,
  chat_messages: searchChatMessages,
  calendar_events: searchCalendarEvents,
  transactions: searchTransactions,
  knowledge_entities: searchKnowledgeEntities,
};

// ===========================================
// Main Search Function
// ===========================================

export async function unifiedSearch(options: UnifiedSearchOptions): Promise<UnifiedSearchResult> {
  const start = Date.now();
  const { query, context, userId, limit = 20, timeRange } = options;

  // Parse prefix shortcuts
  const { cleanQuery, hintedTypes } = parseTypePrefix(query);

  if (cleanQuery.length < 1) {
    return { query, totalResults: 0, results: [], facets: {} as Record<SearchEntityType, number>, timingMs: 0 };
  }

  // Determine which types to search
  let typesToSearch = options.types ?? hintedTypes ?? ALL_ENTITY_TYPES;

  // If no explicit types but NLP hints exist, boost those
  if (!options.types && !hintedTypes) {
    const nlpHints = extractEntityHints(cleanQuery);
    if (nlpHints.length > 0) {
      typesToSearch = nlpHints;
    }
  }

  const perTypeLimit = Math.min(Math.ceil(limit / typesToSearch.length) + 2, 20);

  // Execute searches in parallel
  const searchPromises = typesToSearch.map(async (type) => {
    const fn = SEARCH_FUNCTIONS[type];
    if (!fn) return [];
    try {
      return await fn(context, userId, cleanQuery, perTypeLimit, timeRange);
    } catch (err) {
      logger.warn(`Semantic search failed for type ${type}`, { error: err });
      return [];
    }
  });

  const allResults = await Promise.all(searchPromises);
  const flatResults = allResults.flat();

  // Sort by score descending, then by timestamp descending
  flatResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  // Deduplicate by id+type
  const seen = new Set<string>();
  const deduped = flatResults.filter(r => {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build facets
  const facets = {} as Record<SearchEntityType, number>;
  for (const r of deduped) {
    facets[r.type] = (facets[r.type] ?? 0) + 1;
  }

  // Apply limit
  const limited = deduped.slice(0, limit);

  return {
    query,
    totalResults: deduped.length,
    results: limited,
    facets,
    timingMs: Date.now() - start,
  };
}

// ===========================================
// Search Suggestions
// ===========================================

export async function getSearchSuggestions(
  context: AIContext, userId: string, prefix: string
): Promise<string[]> {
  if (prefix.length < 2) return [];

  // Get recent searches matching prefix
  const sql = `
    SELECT DISTINCT query FROM search_history
    WHERE user_id = $1 AND query ILIKE $2
    ORDER BY query
    LIMIT 5
  `;

  try {
    const result = await queryContext(context, sql, [userId, `${prefix}%`]);
    return result.rows.map(r => r.query);
  } catch (e) {
    logger.warn('getSearchSuggestions failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

// ===========================================
// Search History
// ===========================================

export async function recordSearchHistory(
  context: AIContext,
  userId: string,
  query: string,
  resultCount: number,
  selectedResult?: Record<string, unknown>
): Promise<void> {
  try {
    // Insert new entry
    await queryContext(context, `
      INSERT INTO search_history (user_id, query, result_count, selected_result)
      VALUES ($1, $2, $3, $4)
    `, [userId, query, resultCount, selectedResult ? JSON.stringify(selectedResult) : null]);

    // Trim to last 20
    await queryContext(context, `
      DELETE FROM search_history
      WHERE user_id = $1 AND id NOT IN (
        SELECT id FROM search_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      )
    `, [userId]);
  } catch (err) {
    logger.warn('Failed to record search history', { error: err });
  }
}

export async function getSearchHistory(
  context: AIContext, userId: string, limit = 20
): Promise<SearchHistoryEntry[]> {
  const sql = `
    SELECT id, query, result_count, selected_result, created_at
    FROM search_history
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `;

  try {
    const result = await queryContext(context, sql, [userId, limit]);
    return result.rows;
  } catch (e) {
    logger.warn('getSearchHistory failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

export async function clearSearchHistory(
  context: AIContext, userId: string
): Promise<void> {
  await queryContext(context, `DELETE FROM search_history WHERE user_id = $1`, [userId]);
}

// ===========================================
// Facets
// ===========================================

export async function getSearchFacets(
  context: AIContext, userId: string
): Promise<SearchFacets> {
  const typeCounts: Array<{ type: SearchEntityType; count: number }> = [];

  const countQueries: Array<{ type: SearchEntityType; sql: string }> = [
    { type: 'ideas', sql: 'SELECT COUNT(*) as count FROM ideas WHERE user_id = $1' },
    { type: 'tasks', sql: 'SELECT COUNT(*) as count FROM tasks WHERE user_id = $1' },
    { type: 'contacts', sql: 'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1' },
    { type: 'emails', sql: 'SELECT COUNT(*) as count FROM emails WHERE user_id = $1' },
    { type: 'documents', sql: 'SELECT COUNT(*) as count FROM documents WHERE user_id = $1' },
    { type: 'calendar_events', sql: 'SELECT COUNT(*) as count FROM calendar_events WHERE user_id = $1' },
  ];

  const results = await Promise.allSettled(
    countQueries.map(async ({ type, sql }) => {
      const res = await queryContext(context, sql, [userId]);
      return { type, count: parseInt(res.rows[0]?.count ?? '0', 10) };
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.count > 0) {
      typeCounts.push(r.value);
    }
  }

  return { types: typeCounts };
}
