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
import { getAuditLogger } from '../services/security/audit-logger';
import {
  getAllTierConfigs,
  getTierConfig,
  updateTierConfig,
  getRateLimitStats,
} from '../services/security/rate-limit-advanced';
import { isValidContext, AIContext } from '../types';
import { logger } from '../utils/logger';

const router = Router();

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
      : 'personal' as AIContext;

    const auditLogger = getAuditLogger();
    const result = await auditLogger.getAuditLog(ctx, {
      eventType: event_type as any,
      userId: user_id as string,
      severity: severity as any,
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
      : 'personal' as AIContext;

    const { queryContext } = await import('../utils/database-context');
    const result = await queryContext(
      context,
      'SELECT * FROM security_audit_log WHERE id = $1',
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
      : 'personal' as AIContext;

    const auditLogger = getAuditLogger();
    const alerts = await auditLogger.getSecurityAlerts(
      ctx,
      severity as any,
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
    if (maxRequests) update.maxRequests = parseInt(maxRequests, 10);
    if (windowSeconds) update.windowSeconds = parseInt(windowSeconds, 10);
    if (blockSeconds !== undefined) update.blockSeconds = parseInt(blockSeconds, 10);

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

export const securityRouter = router;
