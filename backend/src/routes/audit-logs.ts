/**
 * Phase Security Sprint 3: Audit Logs Routes
 *
 * Provides admin endpoints for querying and managing audit logs.
 * All endpoints require admin scope.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { auditLogger, AuditCategory, AuditSeverity } from '../services/audit-logger';
import {
  getDecisionLogs,
  getDecisionById,
  generateComplianceReport,
  getDataLineage,
  exportDecisionLogs,
} from '../services/compliance-logger';

export const auditLogsRouter = Router();

// Validation helpers
const VALID_CATEGORIES = Object.values(AuditCategory);
const VALID_SEVERITIES = Object.values(AuditSeverity);
const VALID_OUTCOMES = ['success', 'failure', 'blocked'];

/**
 * GET /api/audit-logs
 * Query audit logs with filters
 * SECURITY: Admin-only endpoint
 */
auditLogsRouter.get('/', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const {
    category,
    severity,
    actorId,
    resourceType,
    action,
    outcome,
    startDate,
    endDate,
    limit,
    offset,
  } = req.query;

  // Validate filters
  // SECURITY FIX: Generic error messages to prevent information disclosure
  if (category && !VALID_CATEGORIES.includes(category as AuditCategory)) {
    throw new ValidationError('Invalid category parameter.');
  }
  if (severity && !VALID_SEVERITIES.includes(severity as AuditSeverity)) {
    throw new ValidationError('Invalid severity parameter.');
  }
  if (outcome && !VALID_OUTCOMES.includes(outcome as string)) {
    throw new ValidationError('Invalid outcome parameter.');
  }

  const parsedLimit = limit ? parseInt(limit as string) : 100;
  const parsedOffset = offset ? parseInt(offset as string) : 0;

  // SECURITY FIX: Generic error messages to prevent information disclosure
  if (parsedLimit < 1 || parsedLimit > 1000) {
    throw new ValidationError('Invalid limit parameter.');
  }
  if (parsedOffset < 0) {
    throw new ValidationError('Invalid offset parameter.');
  }

  // Parse dates
  let parsedStartDate: Date | undefined;
  let parsedEndDate: Date | undefined;

  if (startDate) {
    parsedStartDate = new Date(startDate as string);
    if (isNaN(parsedStartDate.getTime())) {
      throw new ValidationError('Invalid startDate format. Use ISO 8601 format.');
    }
  }
  if (endDate) {
    parsedEndDate = new Date(endDate as string);
    if (isNaN(parsedEndDate.getTime())) {
      throw new ValidationError('Invalid endDate format. Use ISO 8601 format.');
    }
  }

  // Log the audit log query itself (meta!)
  await auditLogger.logDataAccess({
    action: 'list',
    req,
    resourceType: 'audit_logs',
    outcome: 'success',
    details: {
      filters: { category, severity, actorId, resourceType, action, outcome },
    },
  });

  const result = await auditLogger.queryLogs({
    category: category as AuditCategory,
    severity: severity as AuditSeverity,
    actorId: actorId as string,
    resourceType: resourceType as string,
    action: action as string,
    outcome: outcome as string,
    startDate: parsedStartDate,
    endDate: parsedEndDate,
    limit: parsedLimit,
    offset: parsedOffset,
  });

  res.json({
    success: true,
    total: result.total,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore: parsedOffset + result.logs.length < result.total,
    logs: result.logs,
  });
}));

/**
 * GET /api/audit-logs/stats
 * Get audit log statistics
 * SECURITY: Admin-only endpoint
 */
auditLogsRouter.get('/stats', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query;
  const daysBack = days ? parseInt(days as string) : 7;

  // SECURITY FIX: Generic error message to prevent information disclosure
  if (daysBack < 1 || daysBack > 90) {
    throw new ValidationError('Invalid days parameter.');
  }

  // Query statistics
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const [
    totalResult,
    byCategoryResult,
    bySeverityResult,
    byOutcomeResult,
    recentCriticalResult,
  ] = await Promise.all([
    auditLogger.queryLogs({ startDate, limit: 1 }),
    // Custom queries for aggregations would go here
    // For now, we'll calculate from the full result
    auditLogger.queryLogs({ startDate, limit: 10000 }),
    auditLogger.queryLogs({ startDate, severity: AuditSeverity.WARNING, limit: 1 }),
    auditLogger.queryLogs({ startDate, outcome: 'failure', limit: 1 }),
    auditLogger.queryLogs({ startDate, severity: AuditSeverity.CRITICAL, limit: 10 }),
  ]);

  // Calculate category breakdown
  const categoryBreakdown: Record<string, number> = {};
  const severityBreakdown: Record<string, number> = {};
  const outcomeBreakdown: Record<string, number> = {};

  for (const log of byCategoryResult.logs) {
    categoryBreakdown[log.category] = (categoryBreakdown[log.category] || 0) + 1;
    severityBreakdown[log.severity] = (severityBreakdown[log.severity] || 0) + 1;
    outcomeBreakdown[log.outcome] = (outcomeBreakdown[log.outcome] || 0) + 1;
  }

  res.json({
    success: true,
    period: {
      days: daysBack,
      startDate,
      endDate: new Date(),
    },
    stats: {
      totalEvents: totalResult.total,
      byCategory: categoryBreakdown,
      bySeverity: severityBreakdown,
      byOutcome: outcomeBreakdown,
      warningCount: bySeverityResult.total,
      failureCount: byOutcomeResult.total,
    },
    recentCritical: recentCriticalResult.logs,
  });
}));

/**
 * GET /api/audit-logs/categories
 * Get available audit categories
 */
auditLogsRouter.get('/categories', apiKeyAuth, requireScope('admin'), (req: Request, res: Response) => {
  res.json({
    success: true,
    categories: VALID_CATEGORIES,
    severities: VALID_SEVERITIES,
    outcomes: VALID_OUTCOMES,
  });
});

/**
 * POST /api/audit-logs/cleanup
 * Clean up old audit logs
 * SECURITY: Admin-only endpoint
 */
auditLogsRouter.post('/cleanup', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { retentionDays } = req.body;

  const days = retentionDays ? parseInt(retentionDays) : 90;

  // SECURITY FIX: Generic error message to prevent information disclosure
  if (days < 30 || days > 365) {
    throw new ValidationError('Invalid retention days parameter.');
  }

  // Log the cleanup action
  await auditLogger.logAdminAction({
    action: 'audit_log_cleanup',
    req,
    outcome: 'success',
    details: { retentionDays: days },
  });

  const deletedCount = await auditLogger.cleanupOldLogs(days);

  res.json({
    success: true,
    message: `Cleaned up ${deletedCount} audit log entries older than ${days} days.`,
    deletedCount,
    retentionDays: days,
  });
}));

// ===========================================
// Compliance & Governance Endpoints
// ===========================================

/**
 * GET /api/audit-logs/compliance/decisions
 * Query AI decision logs for compliance auditing.
 */
auditLogsRouter.get('/compliance/decisions', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { limit, offset, startDate, endDate, context, modelId, minConfidence } = req.query;

  const parsedLimit = limit ? parseInt(limit as string) : 50;
  const parsedOffset = offset ? parseInt(offset as string) : 0;

  if (parsedLimit < 1 || parsedLimit > 500) {
    throw new ValidationError('Invalid limit parameter.');
  }
  if (parsedOffset < 0) {
    throw new ValidationError('Invalid offset parameter.');
  }

  const options: {
    limit: number;
    offset: number;
    startDate?: number;
    endDate?: number;
    context?: string;
    modelId?: string;
    minConfidence?: number;
  } = { limit: parsedLimit, offset: parsedOffset };

  if (startDate) {
    const d = new Date(startDate as string);
    if (isNaN(d.getTime())) throw new ValidationError('Invalid startDate format.');
    options.startDate = d.getTime();
  }
  if (endDate) {
    const d = new Date(endDate as string);
    if (isNaN(d.getTime())) throw new ValidationError('Invalid endDate format.');
    options.endDate = d.getTime();
  }
  if (context) options.context = context as string;
  if (modelId) options.modelId = modelId as string;
  if (minConfidence) options.minConfidence = parseFloat(minConfidence as string);

  const result = getDecisionLogs(options);

  res.json({
    success: true,
    total: result.total,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore: parsedOffset + result.logs.length < result.total,
    decisions: result.logs,
  });
}));

/**
 * GET /api/audit-logs/compliance/decisions/:id
 * Get a single AI decision by ID.
 */
auditLogsRouter.get('/compliance/decisions/:id', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const decision = getDecisionById(req.params.id);

  if (!decision) {
    res.status(404).json({ success: false, error: 'Decision not found' });
    return;
  }

  res.json({ success: true, decision });
}));

/**
 * GET /api/audit-logs/compliance/decisions/:id/lineage
 * Get data lineage for a specific AI decision.
 */
auditLogsRouter.get('/compliance/decisions/:id/lineage', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const lineage = getDataLineage(req.params.id);

  if (!lineage.decision) {
    res.status(404).json({ success: false, error: 'Decision not found' });
    return;
  }

  res.json({
    success: true,
    decision: lineage.decision,
    sources: lineage.sources,
    sourceTypes: lineage.sourceTypes,
  });
}));

/**
 * GET /api/audit-logs/compliance/report
 * Generate a compliance report for a time period.
 */
auditLogsRouter.get('/compliance/report', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { days, context } = req.query;
  const periodDays = days ? parseInt(days as string) : 30;

  if (periodDays < 1 || periodDays > 365) {
    throw new ValidationError('Invalid days parameter.');
  }

  const report = generateComplianceReport(periodDays, context as string | undefined);

  res.json({ success: true, report });
}));

/**
 * GET /api/audit-logs/compliance/export
 * Export AI decision logs as CSV.
 */
auditLogsRouter.get('/compliance/export', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { days, context } = req.query;
  const periodDays = days ? parseInt(days as string) : 30;

  if (periodDays < 1 || periodDays > 365) {
    throw new ValidationError('Invalid days parameter.');
  }

  const csv = exportDecisionLogs(periodDays, context as string | undefined);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=compliance-decisions-${periodDays}d.csv`);
  res.send(csv);
}));
