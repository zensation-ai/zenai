/**
 * Phase 62: Security Admin Routes
 *
 * Admin-only endpoints for security audit logs, alerts, and rate limit management.
 * All endpoints require JWT auth + admin role.
 */

import { Router, Request, Response } from 'express';
import { jwtAuth } from '../middleware/jwt-auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';
import { getAuditLogger, type SecurityEventType, type SecuritySeverity } from '../services/security/audit-logger';
import {
  getAllTierConfigs,
  getTierConfig,
  updateTierConfig,
  getRateLimitStats,
} from '../services/security/rate-limit-advanced';
import { verifyAuditChain } from '../services/security/audit-hash-chain';
import { getSIEMStatus, invalidateOrgSIEMCache } from '../services/security/siem-forwarder';
import { encrypt, isEncrypted } from '../services/security/field-encryption';
import { queryPublic } from '../utils/database-context';
import { isValidContext, AIContext } from '../types';
import { logger } from '../utils/logger';

const router = Router();

// ===========================================
// Type Guards
// ===========================================

const VALID_AUDIT_EVENT_TYPES: readonly SecurityEventType[] = [
  'login', 'logout', 'failed_login', 'password_change', 'role_change',
  'api_key_created', 'api_key_revoked', 'sensitive_data_access',
  'permission_denied', 'config_change',
] as const;

const VALID_SEVERITY_LEVELS: readonly SecuritySeverity[] = [
  'info', 'warning', 'critical',
] as const;

function isValidAuditEventType(value: unknown): value is SecurityEventType {
  return typeof value === 'string' && VALID_AUDIT_EVENT_TYPES.includes(value as SecurityEventType);
}

function isValidSeverity(value: unknown): value is SecuritySeverity {
  return typeof value === 'string' && VALID_SEVERITY_LEVELS.includes(value as SecuritySeverity);
}

// All security routes require admin role
const adminAuth = [jwtAuth, requireRole('admin')];

// ===========================================
// Audit Log Endpoints
// ===========================================

/**
 * GET /api/security/audit-log
 * Query security audit log with filters.
 */
router.get(
  '/audit-log',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      event_type,
      user_id,
      severity,
      start_date,
      end_date,
      limit,
      offset,
      context,
    } = req.query;

    const ctx = (typeof context === 'string' && isValidContext(context))
      ? context as AIContext
      : 'operations' as AIContext;

    const auditLogger = getAuditLogger();
    const result = await auditLogger.getAuditLog(ctx, {
      eventType: isValidAuditEventType(event_type) ? event_type : undefined,
      userId: user_id as string,
      severity: isValidSeverity(severity) ? severity : undefined,
      startDate: start_date as string,
      endDate: end_date as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: result.entries,
      total: result.total,
    });
  })
);

/**
 * GET /api/security/audit-log/:id
 * Get a single audit log entry.
 */
router.get(
  '/audit-log/:id',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const context = (typeof req.query.context === 'string' && isValidContext(req.query.context as string))
      ? req.query.context as AIContext
      : 'operations' as AIContext;

    const { queryContext } = await import('../utils/database-context');
    const result = await queryContext(
      context,
      `SELECT id, event_type, user_id, ip_address, user_agent,
              details, severity, created_at
       FROM security_audit_log WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Audit log entry not found',
        code: 'NOT_FOUND',
      });
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * GET /api/security/alerts
 * Get recent critical security events.
 */
router.get(
  '/alerts',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { severity, limit, context } = req.query;
    const ctx = (typeof context === 'string' && isValidContext(context))
      ? context as AIContext
      : 'operations' as AIContext;

    const auditLogger = getAuditLogger();
    const alerts = await auditLogger.getSecurityAlerts(
      ctx,
      isValidSeverity(severity) ? severity : undefined,
      limit ? parseInt(limit as string, 10) : undefined
    );

    res.json({
      success: true,
      data: alerts,
    });
  })
);

// ===========================================
// Rate Limit Management Endpoints
// ===========================================

/**
 * GET /api/security/rate-limits
 * Get current rate limit configuration for all tiers.
 */
router.get(
  '/rate-limits',
  ...adminAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const configs = getAllTierConfigs();

    res.json({
      success: true,
      data: configs,
    });
  })
);

/**
 * PUT /api/security/rate-limits/:tier
 * Update rate limit configuration for a tier.
 */
router.put(
  '/rate-limits/:tier',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { tier } = req.params;
    const { maxRequests, windowSeconds, blockSeconds } = req.body;

    if (!maxRequests && !windowSeconds && blockSeconds === undefined) {
      res.status(400).json({
        success: false,
        error: 'Provide at least one of: maxRequests, windowSeconds, blockSeconds',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const update: Record<string, unknown> = {};
    if (maxRequests !== undefined && maxRequests !== null) {update.maxRequests = parseInt(maxRequests, 10);}
    if (windowSeconds !== undefined && windowSeconds !== null) {update.windowSeconds = parseInt(windowSeconds, 10);}
    if (blockSeconds !== undefined) {update.blockSeconds = parseInt(blockSeconds, 10);}

    const updated = updateTierConfig(tier, update);

    // Log the config change
    const auditLogger = getAuditLogger();
    await auditLogger.logSecurityEvent({
      eventType: 'config_change',
      userId: req.jwtUser?.id || req.apiKey?.id || 'unknown',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { tier, previousConfig: getTierConfig(tier), newConfig: updated },
      severity: 'warning',
    });

    logger.info('Rate limit tier updated', {
      operation: 'security',
      tier,
      config: updated,
    });

    res.json({
      success: true,
      data: updated,
    });
  })
);

/**
 * GET /api/security/rate-limits/stats
 * Get rate limit hit statistics.
 */
router.get(
  '/rate-limits/stats',
  ...adminAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = getRateLimitStats();

    res.json({
      success: true,
      data: stats,
    });
  })
);

// ===========================================
// Hash-Chain Audit Verification (Sprint 1.2)
// ===========================================

/**
 * GET /api/security/audit/verify
 *
 * Admin-only. Verifiziert die tenant_audit_log Hash-Chain für einen
 * Workspace. Query-Params:
 *   - workspace_id (required): Workspace-UUID
 *   - from_ts (optional): ISO-Timestamp — nur Einträge ab diesem Zeitpunkt.
 *                         Sinnvoll für lange Chains.
 *   - limit (optional): Max. Anzahl geprüfter Einträge (default 10000).
 */
router.get(
  '/audit/verify',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const workspaceId = typeof req.query.workspace_id === 'string' ? req.query.workspace_id : '';
    if (!workspaceId) {
      res.status(400).json({
        success: false,
        error: 'workspace_id query parameter is required',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const fromTsRaw = typeof req.query.from_ts === 'string' ? req.query.from_ts : undefined;
    let fromTs: Date | undefined;
    if (fromTsRaw) {
      const parsed = new Date(fromTsRaw);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({
          success: false,
          error: 'from_ts must be a valid ISO timestamp',
          code: 'VALIDATION_ERROR',
        });
        return;
      }
      fromTs = parsed;
    }

    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;

    const verification = await verifyAuditChain(workspaceId, {
      fromTs,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    logger.info('Audit chain verification', {
      operation: 'security',
      workspaceId,
      valid: verification.valid,
      totalChecked: verification.totalChecked,
    });

    res.json({ success: true, data: verification });
  })
);

// ===========================================
// SIEM Forwarder Status (Sprint 1.8)
// ===========================================

/**
 * GET /api/security/siem/status
 *
 * Admin-only. Returns the in-memory SIEM forwarder status:
 * provider, success/failure counters, failure rate, last record,
 * last failure, and a ring buffer of the most recent forwards.
 */
router.get(
  '/siem/status',
  ...adminAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const status = getSIEMStatus();
    res.json({ success: true, data: status });
  })
);

// ===========================================
// SIEM Per-Org Config (Sprint 1.9)
// ===========================================
//
// GET  /api/security/siem/config/:orgId — read the stored config (apiKey masked)
// PUT  /api/security/siem/config/:orgId — write a new config (apiKey encrypted)
// DELETE /api/security/siem/config/:orgId — remove the config (fall back to env)
//
// Admin-only. The apiKey is encrypted via field-encryption before storage;
// reads mask it to '***' so it never leaves the server in plaintext.

type SIEMConfigInput =
  | { provider: 'noop' }
  | { provider: 'datadog'; endpoint: string; apiKey: string; source?: string; service?: string }
  | { provider: 'syslog'; host: string; port?: number; facility?: number; appName?: string };

function validateSIEMConfigInput(body: unknown): SIEMConfigInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.provider === 'noop') return { provider: 'noop' };
  if (b.provider === 'datadog') {
    if (typeof b.endpoint !== 'string' || !b.endpoint.startsWith('https://')) return null;
    if (typeof b.apiKey !== 'string' || b.apiKey.length < 8) return null;
    return {
      provider: 'datadog',
      endpoint: b.endpoint,
      apiKey: b.apiKey,
      source: typeof b.source === 'string' ? b.source : undefined,
      service: typeof b.service === 'string' ? b.service : undefined,
    };
  }
  if (b.provider === 'syslog') {
    if (typeof b.host !== 'string' || b.host.length === 0) return null;
    const port = typeof b.port === 'number' ? b.port : undefined;
    if (port !== undefined && (port < 1 || port > 65535)) return null;
    const facility = typeof b.facility === 'number' ? b.facility : undefined;
    if (facility !== undefined && (facility < 0 || facility > 23)) return null;
    return {
      provider: 'syslog',
      host: b.host,
      port,
      facility,
      appName: typeof b.appName === 'string' ? b.appName : undefined,
    };
  }
  return null;
}

function maskSIEMConfig(cfg: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!cfg) return null;
  if (cfg.provider === 'datadog' && typeof cfg.apiKey === 'string') {
    return { ...cfg, apiKey: '***' };
  }
  return cfg;
}

router.get(
  '/siem/config/:orgId',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    const result = await queryPublic(
      'SELECT siem_config FROM public.organizations WHERE id = $1 LIMIT 1',
      [orgId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Organization not found' });
      return;
    }
    const cfg = result.rows[0].siem_config as Record<string, unknown> | null;
    res.json({ success: true, data: { config: maskSIEMConfig(cfg) } });
  })
);

router.put(
  '/siem/config/:orgId',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    const input = validateSIEMConfigInput(req.body);
    if (!input) {
      res.status(400).json({ success: false, error: 'Invalid SIEM config shape' });
      return;
    }

    // Encrypt apiKey in-place before persisting. Datadog is currently the
    // only provider with a sensitive field; syslog/noop carry none.
    const toStore: Record<string, unknown> = { ...input };
    if (input.provider === 'datadog') {
      toStore.apiKey = isEncrypted(input.apiKey) ? input.apiKey : encrypt(input.apiKey);
    }

    const result = await queryPublic(
      `UPDATE public.organizations
         SET siem_config = $1::jsonb,
             updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [JSON.stringify(toStore), orgId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Organization not found' });
      return;
    }

    invalidateOrgSIEMCache(orgId);
    logger.info('SIEM per-org config updated', {
      operation: 'siem-config-write',
      orgId,
      provider: input.provider,
      adminId: req.jwtUser?.id,
    });
    res.json({ success: true, data: { config: maskSIEMConfig(toStore) } });
  })
);

router.delete(
  '/siem/config/:orgId',
  ...adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    const result = await queryPublic(
      `UPDATE public.organizations
         SET siem_config = NULL,
             updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [orgId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Organization not found' });
      return;
    }
    invalidateOrgSIEMCache(orgId);
    logger.info('SIEM per-org config removed', {
      operation: 'siem-config-delete',
      orgId,
      adminId: req.jwtUser?.id,
    });
    res.json({ success: true });
  })
);

// Exported for tests — allows asserting mask logic without going through the route.
export const _siemConfigInternals = {
  validateSIEMConfigInput,
  maskSIEMConfig,
};

export const securityRouter = router;
