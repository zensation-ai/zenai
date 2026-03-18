/**
 * Phase 62: Security Audit Logger
 *
 * Structured security audit logging to database with event system integration.
 * Separate from Phase Security Sprint 3 audit-logger.ts (which is in services/audit-logger.ts
 * and uses the public schema). This logger stores security events per-context
 * using queryContext for schema isolation.
 *
 * Event types: login, logout, failed_login, password_change, role_change,
 * api_key_created, api_key_revoked, sensitive_data_access, permission_denied,
 * config_change
 */

import { queryContext, AIContext, QueryParam } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export type SecurityEventType =
  | 'login'
  | 'logout'
  | 'failed_login'
  | 'password_change'
  | 'role_change'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'sensitive_data_access'
  | 'permission_denied'
  | 'config_change';

export type SecuritySeverity = 'info' | 'warning' | 'critical';

export interface SecurityEvent {
  id: string;
  event_type: SecurityEventType;
  user_id: string;
  ip_address: string;
  user_agent: string;
  details: Record<string, unknown>;
  severity: SecuritySeverity;
  context: string;
  created_at: string;
}

export interface LogSecurityEventInput {
  eventType: SecurityEventType;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  severity?: SecuritySeverity;
  context?: AIContext;
}

export interface AuditLogFilters {
  eventType?: SecurityEventType;
  userId?: string;
  severity?: SecuritySeverity;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ===========================================
// Column list — single source of truth
// ===========================================

const SECURITY_AUDIT_COLUMNS = `id, event_type, user_id, ip_address, user_agent,
  details, severity, context, created_at`;

// ===========================================
// Severity defaults per event type
// ===========================================

const DEFAULT_SEVERITY: Record<SecurityEventType, SecuritySeverity> = {
  login: 'info',
  logout: 'info',
  failed_login: 'warning',
  password_change: 'warning',
  role_change: 'critical',
  api_key_created: 'info',
  api_key_revoked: 'warning',
  sensitive_data_access: 'warning',
  permission_denied: 'warning',
  config_change: 'critical',
};

// ===========================================
// Security Audit Logger
// ===========================================

class SecurityAuditLogger {
  /**
   * Log a security event to the database.
   */
  async logSecurityEvent(event: LogSecurityEventInput): Promise<SecurityEvent | null> {
    const context = event.context || 'personal';
    const severity = event.severity || DEFAULT_SEVERITY[event.eventType] || 'info';

    try {
      const result = await queryContext(
        context as AIContext,
        `INSERT INTO security_audit_log (event_type, user_id, ip_address, user_agent, details, severity, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          event.eventType,
          event.userId,
          event.ipAddress || 'unknown',
          event.userAgent || 'unknown',
          JSON.stringify(event.details || {}),
          severity,
          context,
        ]
      );

      const logged = result.rows[0] as SecurityEvent;

      // Log to structured logger as well
      if (severity === 'critical') {
        logger.warn('SECURITY CRITICAL EVENT', {
          operation: 'security-audit',
          eventType: event.eventType,
          userId: event.userId,
          severity,
        });

        // Try to emit to event system (fire-and-forget)
        this.emitSecurityEvent(context as AIContext, event.eventType, event).catch(() => {
          // Silent - event system integration is best-effort
        });
      }

      return logged;
    } catch (error) {
      logger.error('Failed to log security event', error instanceof Error ? error : undefined, {
        operation: 'security-audit',
        eventType: event.eventType,
      });
      // Critical security events must not be silently lost
      if (severity === 'critical') {
        throw error;
      }
      return null;
    }
  }

  /**
   * Query audit log with filters.
   */
  async getAuditLog(context: AIContext, filters: AuditLogFilters = {}): Promise<{
    entries: SecurityEvent[];
    total: number;
  }> {
    const conditions: string[] = [];
    const params: QueryParam[] = [];
    let paramIdx = 1;

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIdx++}`);
      params.push(filters.eventType);
    }
    if (filters.userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(filters.userId);
    }
    if (filters.severity) {
      conditions.push(`severity = $${paramIdx++}`);
      params.push(filters.severity);
    }
    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const [dataResult, countResult] = await Promise.all([
      queryContext(
        context,
        `SELECT ${SECURITY_AUDIT_COLUMNS} FROM security_audit_log ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      ),
      queryContext(
        context,
        `SELECT COUNT(*) as total FROM security_audit_log ${whereClause}`,
        params
      ),
    ]);

    return {
      entries: dataResult.rows as SecurityEvent[],
      total: parseInt(countResult.rows[0]?.total || '0', 10),
    };
  }

  /**
   * Get recent security alerts (critical and warning events).
   */
  async getSecurityAlerts(
    context: AIContext,
    severity?: SecuritySeverity,
    limit: number = 20
  ): Promise<SecurityEvent[]> {
    const severityFilter = severity
      ? `severity = $1`
      : `severity IN ('critical', 'warning')`;
    const params = severity ? [severity, limit] : [limit];
    const limitParam = severity ? '$2' : '$1';

    const result = await queryContext(
      context,
      `SELECT ${SECURITY_AUDIT_COLUMNS} FROM security_audit_log
       WHERE ${severityFilter}
       ORDER BY created_at DESC
       LIMIT ${limitParam}`,
      params
    );

    return result.rows as SecurityEvent[];
  }

  /**
   * Emit security event to the event system (Phase 54 integration).
   */
  private async emitSecurityEvent(
    context: AIContext,
    eventType: string,
    event: LogSecurityEventInput
  ): Promise<void> {
    try {
      const { emitSystemEvent } = await import('../event-system');
      await emitSystemEvent({
        context,
        eventType: `security.${eventType}`,
        eventSource: 'security-audit-logger',
        payload: {
          userId: event.userId,
          severity: event.severity || DEFAULT_SEVERITY[event.eventType],
          details: event.details,
        },
      });
    } catch {
      // Silent - event system may not be available
    }
  }
}

// Singleton
let instance: SecurityAuditLogger | null = null;

export function getAuditLogger(): SecurityAuditLogger {
  if (!instance) {
    instance = new SecurityAuditLogger();
  }
  return instance;
}

// For testing - reset singleton
export function resetAuditLogger(): void {
  instance = null;
}
