/**
 * Screen Memory Service - Phase 5
 *
 * Backend service for querying and managing screen memory data.
 * Captures are stored per context in the database.
 * The actual screenshot capture happens in Electron (local only).
 */

import { queryContext, AIContext, QueryParam } from '../utils/database-context';
import { logger } from '../utils/logger';
import { SYSTEM_USER_ID } from '../utils/user-context';

// ============================================================
// Types
// ============================================================

export interface ScreenCapture {
  id: string;
  timestamp: string;
  app_name: string | null;
  window_title: string | null;
  url: string | null;
  ocr_text: string | null;
  screenshot_path: string | null;
  duration_seconds: number;
  is_sensitive: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ScreenMemoryFilters {
  search?: string;
  app_name?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface ScreenMemoryStats {
  total_captures: number;
  total_apps: number;
  total_duration_hours: number;
  top_apps: { app_name: string; count: number; hours: number }[];
  captures_today: number;
}

// ============================================================
// CRUD
// ============================================================

export async function storeCapture(
  context: AIContext,
  input: Partial<ScreenCapture>,
  userId: string = SYSTEM_USER_ID
): Promise<ScreenCapture> {
  const result = await queryContext(context,
    `INSERT INTO screen_captures
       (timestamp, app_name, window_title, url, ocr_text, screenshot_path,
        duration_seconds, is_sensitive, metadata, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.timestamp || new Date().toISOString(),
      input.app_name || null,
      input.window_title || null,
      input.url || null,
      input.ocr_text || null,
      input.screenshot_path || null,
      input.duration_seconds || 0,
      input.is_sensitive || false,
      JSON.stringify(input.metadata || {}),
      userId,
    ]
  );
  return result.rows[0];
}

export async function getCaptures(
  context: AIContext,
  filters: ScreenMemoryFilters = {},
  userId: string = SYSTEM_USER_ID
): Promise<{ captures: ScreenCapture[]; total: number }> {
  const conditions: string[] = ['is_sensitive = FALSE', 'user_id = $1'];
  const params: QueryParam[] = [userId];
  let idx = 2;

  if (filters.search) {
    conditions.push(`(ocr_text ILIKE $${idx} OR window_title ILIKE $${idx} OR app_name ILIKE $${idx} OR url ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters.app_name) {
    conditions.push(`app_name = $${idx++}`);
    params.push(filters.app_name);
  }
  if (filters.date_from) {
    conditions.push(`timestamp >= $${idx++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`timestamp <= $${idx++}`);
    params.push(filters.date_to);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Count query uses only filter params; data query adds limit/offset
  const countParams = [...params];
  const countSql = `SELECT COUNT(*) as total FROM screen_captures ${whereClause}`;

  params.push(limit);
  const limitIdx = idx++;
  params.push(offset);
  const offsetIdx = idx++;

  const dataSql = `SELECT * FROM screen_captures ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

  const [dataResult, countResult] = await Promise.all([
    queryContext(context, dataSql, params),
    queryContext(context, countSql, countParams),
  ]);

  return {
    captures: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
  };
}

export async function getCapture(context: AIContext, id: string, userId: string = SYSTEM_USER_ID): Promise<ScreenCapture | null> {
  const result = await queryContext(context,
    `SELECT * FROM screen_captures WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function deleteCapture(context: AIContext, id: string, userId: string = SYSTEM_USER_ID): Promise<boolean> {
  const result = await queryContext(context,
    `DELETE FROM screen_captures WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Analytics
// ============================================================

export async function getStats(context: AIContext, userId: string = SYSTEM_USER_ID): Promise<ScreenMemoryStats> {
  const [totalResult, appsResult, todayResult, topAppsResult] = await Promise.all([
    queryContext(context,
      `SELECT COUNT(*) as total, COALESCE(SUM(duration_seconds), 0) as total_duration
       FROM screen_captures WHERE is_sensitive = FALSE AND user_id = $1`,
      [userId]
    ),
    queryContext(context,
      `SELECT COUNT(DISTINCT app_name) as total FROM screen_captures WHERE app_name IS NOT NULL AND user_id = $1`,
      [userId]
    ),
    queryContext(context,
      `SELECT COUNT(*) as total FROM screen_captures
       WHERE timestamp >= CURRENT_DATE AND is_sensitive = FALSE AND user_id = $1`,
      [userId]
    ),
    queryContext(context,
      `SELECT app_name, COUNT(*) as count, COALESCE(SUM(duration_seconds), 0) as seconds
       FROM screen_captures
       WHERE app_name IS NOT NULL AND is_sensitive = FALSE AND user_id = $1
       GROUP BY app_name ORDER BY count DESC LIMIT 10`,
      [userId]
    ),
  ]);

  return {
    total_captures: parseInt(totalResult.rows[0]?.total || '0', 10),
    total_apps: parseInt(appsResult.rows[0]?.total || '0', 10),
    total_duration_hours: Math.round(Number(totalResult.rows[0]?.total_duration || 0) / 3600),
    top_apps: topAppsResult.rows.map((r: Record<string, unknown>) => ({
      app_name: String(r.app_name),
      count: Number(r.count),
      hours: Math.round(Number(r.seconds) / 3600 * 10) / 10,
    })),
    captures_today: parseInt(todayResult.rows[0]?.total || '0', 10),
  };
}

// ============================================================
// Cleanup
// ============================================================

export async function cleanupOldCaptures(context: AIContext, retentionDays = 30, userId: string = SYSTEM_USER_ID): Promise<number> {
  const result = await queryContext(context,
    `DELETE FROM screen_captures
     WHERE timestamp < NOW() - make_interval(days := $1) AND user_id = $2
     RETURNING id`,
    [retentionDays, userId]
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info(`Screen memory: Cleaned up ${count} captures older than ${retentionDays} days`);
  }
  return count;
}
