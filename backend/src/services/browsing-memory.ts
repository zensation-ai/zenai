/**
 * Browsing Memory Service - Phase 2
 *
 * Context-aware browsing history and bookmark management.
 * Stores visited pages, AI-generated summaries, and bookmarks.
 */

import { queryContext, AIContext, QueryParam } from '../utils/database-context';
import { logger } from '../utils/logger';
import { SYSTEM_USER_ID } from '../utils/user-context';

// ============================================================
// Types
// ============================================================

export interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string | null;
  domain: string;
  visit_time: string;
  duration_seconds: number | null;
  content_summary: string | null;
  content_text: string | null;
  keywords: string[];
  category: string | null;
  is_bookmarked: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  folder: string;
  tags: string[];
  ai_summary: string | null;
  favicon_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BrowsingHistoryFilters {
  domain?: string;
  category?: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface BookmarkFilters {
  folder?: string;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateHistoryInput {
  url: string;
  title?: string;
  domain: string;
  duration_seconds?: number;
  content_summary?: string;
  content_text?: string;
  keywords?: string[];
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateBookmarkInput {
  url: string;
  title?: string;
  description?: string;
  folder?: string;
  tags?: string[];
  ai_summary?: string;
  favicon_url?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Privacy Filter - Domains to exclude from history
// ============================================================

const SENSITIVE_DOMAINS = [
  // Banking
  'paypal.com', 'chase.com', 'bankofamerica.com', 'wellsfargo.com',
  'deutsche-bank.de', 'sparkasse.de', 'commerzbank.de', 'ing.de',
  'comdirect.de', 'consorsbank.de', 'dkb.de', 'n26.com',
  // Health
  'myhealth.va.gov', 'patient.portal', 'doctolib.de',
  // Password managers
  '1password.com', 'bitwarden.com', 'lastpass.com',
  // Government
  'elster.de', 'bund.de',
];

/**
 * Check if a domain should be excluded from history for privacy
 */
export function isSensitiveDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  return SENSITIVE_DOMAINS.some(sensitive =>
    lowerDomain === sensitive || lowerDomain.endsWith('.' + sensitive)
  );
}

// ============================================================
// Browsing History CRUD
// ============================================================

/**
 * Record a page visit in browsing history
 */
export async function addHistoryEntry(
  context: AIContext,
  input: CreateHistoryInput,
  userId: string = SYSTEM_USER_ID
): Promise<BrowsingHistoryEntry> {
  // Privacy filter
  if (isSensitiveDomain(input.domain)) {
    logger.info('Skipping sensitive domain from browsing history', { domain: input.domain });
    // Return a stub entry without persisting
    return {
      id: 'filtered',
      url: input.url,
      title: input.title || null,
      domain: input.domain,
      visit_time: new Date().toISOString(),
      duration_seconds: null,
      content_summary: null,
      content_text: null,
      keywords: [],
      category: null,
      is_bookmarked: false,
      metadata: {},
      created_at: new Date().toISOString(),
    };
  }

  const result = await queryContext(context, `
    INSERT INTO browsing_history (url, title, domain, duration_seconds, content_summary, content_text, keywords, category, metadata, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    input.url,
    input.title || null,
    input.domain,
    input.duration_seconds || null,
    input.content_summary || null,
    input.content_text || null,
    input.keywords || [],
    input.category || null,
    JSON.stringify(input.metadata || {}),
    userId,
  ]);

  return result.rows[0];
}

/**
 * Get browsing history with filters
 */
export async function getHistory(
  context: AIContext,
  filters: BrowsingHistoryFilters = {},
  userId: string = SYSTEM_USER_ID
): Promise<{ entries: BrowsingHistoryEntry[]; total: number }> {
  const conditions: string[] = [`user_id = $1`];
  const params: QueryParam[] = [userId];
  let paramIndex = 2;

  if (filters.domain) {
    conditions.push(`domain = $${paramIndex++}`);
    params.push(filters.domain);
  }

  if (filters.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(filters.category);
  }

  if (filters.search) {
    conditions.push(`(title ILIKE $${paramIndex} OR url ILIKE $${paramIndex} OR content_summary ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters.from_date) {
    conditions.push(`visit_time >= $${paramIndex++}`);
    params.push(filters.from_date);
  }

  if (filters.to_date) {
    conditions.push(`visit_time <= $${paramIndex++}`);
    params.push(filters.to_date);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const [dataResult, countResult] = await Promise.all([
    queryContext(context, `
      SELECT * FROM browsing_history
      ${whereClause}
      ORDER BY visit_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]),
    queryContext(context, `
      SELECT COUNT(*) as total FROM browsing_history ${whereClause}
    `, params),
  ]);

  return {
    entries: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
  };
}

/**
 * Get a single history entry by ID
 */
export async function getHistoryEntry(
  context: AIContext,
  id: string,
  userId: string = SYSTEM_USER_ID
): Promise<BrowsingHistoryEntry | null> {
  const result = await queryContext(context,
    'SELECT * FROM browsing_history WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0] || null;
}

/**
 * Delete a history entry
 */
export async function deleteHistoryEntry(
  context: AIContext,
  id: string,
  userId: string = SYSTEM_USER_ID
): Promise<boolean> {
  const result = await queryContext(context,
    'DELETE FROM browsing_history WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Clear all history (with optional date range)
 */
export async function clearHistory(
  context: AIContext,
  before?: string,
  userId: string = SYSTEM_USER_ID
): Promise<number> {
  let query = 'DELETE FROM browsing_history WHERE user_id = $1';
  const params: QueryParam[] = [userId];

  if (before) {
    query += ' AND visit_time <= $2';
    params.push(before);
  }

  const result = await queryContext(context, query, params);
  return result.rowCount ?? 0;
}

/**
 * Get domain statistics
 */
export async function getDomainStats(
  context: AIContext,
  limit = 20,
  userId: string = SYSTEM_USER_ID
): Promise<Array<{ domain: string; visit_count: number; total_duration: number; last_visit: string }>> {
  const result = await queryContext(context, `
    SELECT
      domain,
      COUNT(*) as visit_count,
      COALESCE(SUM(duration_seconds), 0) as total_duration,
      MAX(visit_time) as last_visit
    FROM browsing_history
    WHERE user_id = $1
    GROUP BY domain
    ORDER BY visit_count DESC
    LIMIT $2
  `, [userId, limit]);

  return result.rows.map(row => ({
    domain: row.domain,
    visit_count: parseInt(row.visit_count, 10),
    total_duration: parseInt(row.total_duration, 10),
    last_visit: row.last_visit,
  }));
}

// ============================================================
// Bookmarks CRUD
// ============================================================

/**
 * Create a bookmark
 */
export async function createBookmark(
  context: AIContext,
  input: CreateBookmarkInput,
  userId: string = SYSTEM_USER_ID
): Promise<Bookmark> {
  const result = await queryContext(context, `
    INSERT INTO bookmarks (url, title, description, folder, tags, ai_summary, favicon_url, metadata, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (url, user_id) DO UPDATE SET
      title = COALESCE(EXCLUDED.title, bookmarks.title),
      description = COALESCE(EXCLUDED.description, bookmarks.description),
      folder = COALESCE(EXCLUDED.folder, bookmarks.folder),
      tags = COALESCE(EXCLUDED.tags, bookmarks.tags),
      ai_summary = COALESCE(EXCLUDED.ai_summary, bookmarks.ai_summary),
      updated_at = NOW()
    RETURNING *
  `, [
    input.url,
    input.title || null,
    input.description || null,
    input.folder || 'Unsortiert',
    input.tags || [],
    input.ai_summary || null,
    input.favicon_url || null,
    JSON.stringify(input.metadata || {}),
    userId,
  ]);

  return result.rows[0];
}

/**
 * Get bookmarks with filters
 */
export async function getBookmarks(
  context: AIContext,
  filters: BookmarkFilters = {},
  userId: string = SYSTEM_USER_ID
): Promise<{ bookmarks: Bookmark[]; total: number }> {
  const conditions: string[] = [`user_id = $1`];
  const params: QueryParam[] = [userId];
  let paramIndex = 2;

  if (filters.folder) {
    conditions.push(`folder = $${paramIndex++}`);
    params.push(filters.folder);
  }

  if (filters.tag) {
    conditions.push(`$${paramIndex++} = ANY(tags)`);
    params.push(filters.tag);
  }

  if (filters.search) {
    conditions.push(`(title ILIKE $${paramIndex} OR url ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const [dataResult, countResult] = await Promise.all([
    queryContext(context, `
      SELECT * FROM bookmarks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]),
    queryContext(context, `
      SELECT COUNT(*) as total FROM bookmarks ${whereClause}
    `, params),
  ]);

  return {
    bookmarks: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
  };
}

/**
 * Get a single bookmark by ID
 */
export async function getBookmark(
  context: AIContext,
  id: string,
  userId: string = SYSTEM_USER_ID
): Promise<Bookmark | null> {
  const result = await queryContext(context,
    'SELECT * FROM bookmarks WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0] || null;
}

/**
 * Update a bookmark
 */
export async function updateBookmark(
  context: AIContext,
  id: string,
  updates: Partial<CreateBookmarkInput>,
  userId: string = SYSTEM_USER_ID
): Promise<Bookmark | null> {
  const sets: string[] = [];
  const params: QueryParam[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    sets.push(`title = $${paramIndex++}`);
    params.push(updates.title);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }
  if (updates.folder !== undefined) {
    sets.push(`folder = $${paramIndex++}`);
    params.push(updates.folder);
  }
  if (updates.tags !== undefined) {
    sets.push(`tags = $${paramIndex++}`);
    params.push(updates.tags);
  }
  if (updates.ai_summary !== undefined) {
    sets.push(`ai_summary = $${paramIndex++}`);
    params.push(updates.ai_summary);
  }
  if (updates.favicon_url !== undefined) {
    sets.push(`favicon_url = $${paramIndex++}`);
    params.push(updates.favicon_url);
  }

  if (sets.length === 0) {return getBookmark(context, id, userId);}

  sets.push('updated_at = NOW()');

  const result = await queryContext(context, `
    UPDATE bookmarks SET ${sets.join(', ')}
    WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
    RETURNING *
  `, [...params, id, userId]);

  return result.rows[0] || null;
}

/**
 * Delete a bookmark
 */
export async function deleteBookmark(
  context: AIContext,
  id: string,
  userId: string = SYSTEM_USER_ID
): Promise<boolean> {
  const result = await queryContext(context,
    'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get all bookmark folders
 */
export async function getBookmarkFolders(
  context: AIContext,
  userId: string = SYSTEM_USER_ID
): Promise<Array<{ folder: string; count: number }>> {
  const result = await queryContext(context, `
    SELECT folder, COUNT(*) as count
    FROM bookmarks
    WHERE user_id = $1
    GROUP BY folder
    ORDER BY folder
  `, [userId]);

  return result.rows.map(row => ({
    folder: row.folder,
    count: parseInt(row.count, 10),
  }));
}
