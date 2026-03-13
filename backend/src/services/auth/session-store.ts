/**
 * Phase 56: Persistent Session Store
 * Stores refresh token sessions in PostgreSQL.
 * Designed for Redis-backed caching in a future iteration.
 */

import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface SessionRecord {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  device_info: Record<string, unknown>;
  ip_address: string | null;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  deviceInfo: Record<string, unknown>;
  ipAddress: string | null;
  expiresAt: Date;
}

// ===========================================
// Session Store
// ===========================================

class SessionStore {
  /**
   * Create a new session.
   */
  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const result = await pool.query(
      `INSERT INTO public.user_sessions (user_id, refresh_token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.userId,
        input.refreshTokenHash,
        JSON.stringify(input.deviceInfo),
        input.ipAddress,
        input.expiresAt.toISOString(),
      ]
    );
    return result.rows[0] as SessionRecord;
  }

  /**
   * Find a session by refresh token hash.
   */
  async findByRefreshTokenHash(hash: string): Promise<SessionRecord | null> {
    const result = await pool.query(
      'SELECT * FROM public.user_sessions WHERE refresh_token_hash = $1',
      [hash]
    );
    return result.rows.length > 0 ? (result.rows[0] as SessionRecord) : null;
  }

  /**
   * Revoke a session by marking it as revoked.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await pool.query(
      'UPDATE public.user_sessions SET revoked = true WHERE id = $1',
      [sessionId]
    );
  }

  /**
   * Revoke all sessions for a user.
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await pool.query(
      'UPDATE public.user_sessions SET revoked = true WHERE user_id = $1 AND revoked = false',
      [userId]
    );
    logger.info('All user sessions revoked', {
      operation: 'sessionStore.revokeAll',
      userId,
    });
  }

  /**
   * List active (non-revoked, non-expired) sessions for a user.
   */
  async listActiveSessions(userId: string): Promise<SessionRecord[]> {
    const result = await pool.query(
      `SELECT * FROM public.user_sessions
       WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows as SessionRecord[];
  }

  /**
   * Cleanup expired sessions (call periodically).
   */
  async cleanupExpired(): Promise<number> {
    const result = await pool.query(
      `DELETE FROM public.user_sessions
       WHERE expires_at < NOW() - INTERVAL '1 day' OR (revoked = true AND created_at < NOW() - INTERVAL '1 day')`
    );
    const deleted = result.rowCount || 0;
    if (deleted > 0) {
      logger.info('Cleaned up expired sessions', {
        operation: 'sessionStore.cleanup',
        deletedCount: deleted,
      });
    }
    return deleted;
  }
}

export const sessionStore = new SessionStore();
