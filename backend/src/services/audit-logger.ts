/**
 * Phase Security Sprint 3: Audit Logging Service
 *
 * Provides comprehensive audit logging for security-relevant events.
 * Logs are formatted for compliance and security analysis.
 *
 * Features:
 * - Structured audit log format
 * - IP address and User-Agent tracking
 * - Severity levels for filtering
 * - Database persistence for audit trail
 * - Compliance-ready JSON format
 */

import { Request } from 'express';
// pool.query() is intentional here: audit_logs is a global table (not per-context)
import { pool } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Audit event categories
 */
export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  API_KEY = 'api_key',
  DATA_ACCESS = 'data_access',
  DATA_EXPORT = 'data_export',
  DATA_MODIFICATION = 'data_modification',
  ADMIN_ACTION = 'admin_action',
  SECURITY = 'security',
  SYSTEM = 'system',
}

/**
 * Audit event severity levels
 */
export enum AuditSeverity {
  INFO = 'info',       // Normal operations
  WARNING = 'warning', // Suspicious but not critical
  CRITICAL = 'critical', // Security-critical events
}

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  id?: string;
  timestamp: Date;
  category: AuditCategory;
  action: string;
  severity: AuditSeverity;
  actor: {
    type: 'api_key' | 'user' | 'system' | 'anonymous';
    id?: string;
    name?: string;
  };
  resource?: {
    type: string;
    id?: string;
    name?: string;
  };
  request?: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
    method?: string;
    path?: string;
  };
  outcome: 'success' | 'failure' | 'blocked';
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Flag to track if audit_logs table has been initialized
let auditTableInitialized = false;

/**
 * Ensure audit_logs table exists
 */
async function ensureAuditTable(): Promise<void> {
  if (auditTableInitialized) {return;}

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        category VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'info',
        actor_type VARCHAR(20) NOT NULL,
        actor_id VARCHAR(100),
        actor_name VARCHAR(255),
        resource_type VARCHAR(50),
        resource_id VARCHAR(100),
        resource_name VARCHAR(255),
        request_ip VARCHAR(45),
        request_user_agent TEXT,
        request_id VARCHAR(100),
        request_method VARCHAR(10),
        request_path TEXT,
        outcome VARCHAR(20) NOT NULL,
        details JSONB,
        metadata JSONB
      )
    `);

    // Create indexes for efficient querying
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    `);

    auditTableInitialized = true;
    logger.info('Audit logs table initialized', { operation: 'auditLogger' });
  } catch (error) {
    logger.warn('Could not create audit_logs table', { operation: 'auditLogger', error });
  }
}

/**
 * Extract client information from request
 */
function extractRequestInfo(req?: Request): AuditLogEntry['request'] {
  if (!req) {return undefined;}

  // Get real IP (handle proxies)
  let ip = req.ip;
  if (!ip) {
    const forwarded = req.headers['x-forwarded-for'];
    ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
  }
  if (!ip) {
    ip = req.socket?.remoteAddress;
  }

  return {
    ip: ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    requestId: (req.headers['x-request-id'] as string) || undefined,
    method: req.method,
    path: req.path,
  };
}

/**
 * Extract actor information from request
 */
function extractActorInfo(req?: Request): AuditLogEntry['actor'] {
  if (!req) {
    return { type: 'system' };
  }

  if (req.apiKey) {
    return {
      type: 'api_key',
      id: req.apiKey.id,
      name: req.apiKey.name,
    };
  }

  if (req.user) {
    return {
      type: 'user',
      id: req.user.id,
      name: undefined,
    };
  }

  return { type: 'anonymous' };
}

/**
 * Write audit log entry to database
 */
async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await ensureAuditTable();

    await pool.query(
      `INSERT INTO audit_logs (
        timestamp, category, action, severity,
        actor_type, actor_id, actor_name,
        resource_type, resource_id, resource_name,
        request_ip, request_user_agent, request_id, request_method, request_path,
        outcome, details, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        entry.timestamp,
        entry.category,
        entry.action,
        entry.severity,
        entry.actor.type,
        entry.actor.id || null,
        entry.actor.name || null,
        entry.resource?.type || null,
        entry.resource?.id || null,
        entry.resource?.name || null,
        entry.request?.ip || null,
        entry.request?.userAgent || null,
        entry.request?.requestId || null,
        entry.request?.method || null,
        entry.request?.path || null,
        entry.outcome,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  } catch (error) {
    // Log to file/console if database write fails
    logger.error('Failed to write audit log to database', error instanceof Error ? error : undefined, {
      operation: 'auditLogger',
      auditEntry: entry,
    });
  }
}

/**
 * Format audit log for console/file output
 */
function formatAuditLog(entry: AuditLogEntry): string {
  const parts = [
    `[AUDIT]`,
    `[${entry.severity.toUpperCase()}]`,
    `[${entry.category}]`,
    entry.action,
    `outcome=${entry.outcome}`,
    entry.actor.type !== 'anonymous' ? `actor=${entry.actor.type}:${entry.actor.id || 'unknown'}` : 'actor=anonymous',
    entry.resource ? `resource=${entry.resource.type}:${entry.resource.id || 'unknown'}` : '',
    entry.request?.ip ? `ip=${entry.request.ip}` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Main audit logger class
 */
class AuditLogger {
  /**
   * Log an audit event
   */
  async log(options: {
    category: AuditCategory;
    action: string;
    severity?: AuditSeverity;
    req?: Request;
    resource?: AuditLogEntry['resource'];
    outcome: AuditLogEntry['outcome'];
    details?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      timestamp: new Date(),
      category: options.category,
      action: options.action,
      severity: options.severity || AuditSeverity.INFO,
      actor: extractActorInfo(options.req),
      resource: options.resource,
      request: extractRequestInfo(options.req),
      outcome: options.outcome,
      details: options.details,
      metadata: options.metadata,
    };

    // Log to console/file
    const formattedLog = formatAuditLog(entry);
    if (entry.severity === AuditSeverity.CRITICAL) {
      logger.warn(formattedLog, { audit: true, ...entry });
    } else {
      logger.info(formattedLog, { audit: true, ...entry });
    }

    // Write to database
    await writeAuditLog(entry);
  }

  // Convenience methods for common audit events

  /**
   * Log authentication attempt
   */
  async logAuth(options: {
    action: 'login' | 'logout' | 'token_refresh' | 'api_key_auth' | 'auth_failure';
    req?: Request;
    outcome: 'success' | 'failure' | 'blocked';
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      category: AuditCategory.AUTHENTICATION,
      action: options.action,
      severity: options.outcome === 'failure' ? AuditSeverity.WARNING : AuditSeverity.INFO,
      req: options.req,
      outcome: options.outcome,
      details: options.details,
    });
  }

  /**
   * Log API key management action
   */
  async logApiKeyAction(options: {
    action: 'create' | 'update' | 'delete' | 'regenerate' | 'extend' | 'deactivate';
    req?: Request;
    keyId: string;
    keyName?: string;
    outcome: 'success' | 'failure';
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      category: AuditCategory.API_KEY,
      action: `api_key_${options.action}`,
      severity: AuditSeverity.CRITICAL,
      req: options.req,
      resource: {
        type: 'api_key',
        id: options.keyId,
        name: options.keyName,
      },
      outcome: options.outcome,
      details: options.details,
    });
  }

  /**
   * Log data export action
   */
  async logExport(options: {
    exportType: 'pdf' | 'csv' | 'json' | 'markdown' | 'backup';
    req?: Request;
    resourceType: string;
    resourceCount?: number;
    outcome: 'success' | 'failure';
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      category: AuditCategory.DATA_EXPORT,
      action: `export_${options.exportType}`,
      severity: AuditSeverity.CRITICAL,
      req: options.req,
      resource: {
        type: options.resourceType,
      },
      outcome: options.outcome,
      details: {
        exportType: options.exportType,
        resourceCount: options.resourceCount,
        ...options.details,
      },
    });
  }

  /**
   * Log admin action
   */
  async logAdminAction(options: {
    action: string;
    req?: Request;
    resource?: AuditLogEntry['resource'];
    outcome: 'success' | 'failure';
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      category: AuditCategory.ADMIN_ACTION,
      action: options.action,
      severity: AuditSeverity.CRITICAL,
      req: options.req,
      resource: options.resource,
      outcome: options.outcome,
      details: options.details,
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(options: {
    action: string;
    req?: Request;
    severity?: AuditSeverity;
    outcome: 'success' | 'failure' | 'blocked';
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      category: AuditCategory.SECURITY,
      action: options.action,
      severity: options.severity || AuditSeverity.WARNING,
      req: options.req,
      outcome: options.outcome,
      details: options.details,
    });
  }

  /**
   * Log data access (for sensitive data)
   */
  async logDataAccess(options: {
    action: 'read' | 'list' | 'search';
    req?: Request;
    resourceType: string;
    resourceId?: string;
    outcome: 'success' | 'failure';
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      category: AuditCategory.DATA_ACCESS,
      action: `data_${options.action}`,
      severity: AuditSeverity.INFO,
      req: options.req,
      resource: {
        type: options.resourceType,
        id: options.resourceId,
      },
      outcome: options.outcome,
      details: options.details,
    });
  }

  /**
   * Query audit logs (for admin dashboard)
   */
  async queryLogs(options: {
    category?: AuditCategory;
    severity?: AuditSeverity;
    actorId?: string;
    resourceType?: string;
    action?: string;
    outcome?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    await ensureAuditTable();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (options.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(options.category);
    }
    if (options.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      values.push(options.severity);
    }
    if (options.actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      values.push(options.actorId);
    }
    if (options.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      values.push(options.resourceType);
    }
    if (options.action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(options.action);
    }
    if (options.outcome) {
      conditions.push(`outcome = $${paramIndex++}`);
      values.push(options.outcome);
    }
    if (options.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const [logsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM audit_logs ${whereClause}
         ORDER BY timestamp DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
        values
      ),
    ]);

    return {
      logs: logsResult.rows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        category: row.category,
        action: row.action,
        severity: row.severity,
        actor: {
          type: row.actor_type,
          id: row.actor_id,
          name: row.actor_name,
        },
        resource: row.resource_type
          ? {
              type: row.resource_type,
              id: row.resource_id,
              name: row.resource_name,
            }
          : undefined,
        request: row.request_ip
          ? {
              ip: row.request_ip,
              userAgent: row.request_user_agent,
              requestId: row.request_id,
              method: row.request_method,
              path: row.request_path,
            }
          : undefined,
        outcome: row.outcome,
        details: row.details,
        metadata: row.metadata,
      })),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /**
   * Cleanup old audit logs (for maintenance)
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    await ensureAuditTable();

    const result = await pool.query(
      `DELETE FROM audit_logs
       WHERE timestamp < NOW() - make_interval(days => $1)
       RETURNING id`,
      [retentionDays]
    );

    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old audit log entries`, {
        operation: 'auditLogCleanup',
        retentionDays,
      });
    }

    return deletedCount;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
