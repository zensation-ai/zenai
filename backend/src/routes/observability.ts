/**
 * Phase 61: Observability API Routes
 *
 * Endpoints for metrics snapshots, queue statistics, and extended health.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getMetricSnapshots, getMetricsSummary, isMetricsEnabled } from '../services/observability/metrics';
import { isTracingEnabled } from '../services/observability/tracing';
import { getQueueService, QueueName, QUEUE_NAMES } from '../services/queue/job-queue';
import { getWorkerHealth } from '../services/queue/workers';
import { getPoolStats, queryPublic, queryContext } from '../utils/database-context';

export const observabilityRouter = Router();

// ===========================================
// GET /api/observability/metrics
// Current metric snapshots
// ===========================================

observabilityRouter.get(
  '/metrics',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const limit = parseInt(_req.query.limit as string) || 100;
    const snapshots = getMetricSnapshots(limit);
    const summary = getMetricsSummary();

    res.json({
      success: true,
      data: {
        snapshots,
        summary,
        metricsEnabled: isMetricsEnabled(),
        count: snapshots.length,
      },
    });
  }),
);

// ===========================================
// GET /api/observability/queue-stats
// All queue statistics
// ===========================================

observabilityRouter.get(
  '/queue-stats',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const queueService = getQueueService();
    const stats = await queueService.getAllStats();

    res.json({
      success: true,
      data: {
        queues: stats,
        available: queueService.isAvailable(),
        queueNames: queueService.getQueueNames(),
      },
    });
  }),
);

// ===========================================
// GET /api/observability/queue-stats/:name
// Single queue statistics
// ===========================================

observabilityRouter.get(
  '/queue-stats/:name',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;

    if (!QUEUE_NAMES.includes(name as QueueName)) {
      res.status(400).json({
        success: false,
        error: `Unknown queue: ${name}. Available: ${QUEUE_NAMES.join(', ')}`,
      });
      return;
    }

    const queueService = getQueueService();
    const stats = await queueService.getQueueStats(name as QueueName);

    if (!stats) {
      res.status(404).json({
        success: false,
        error: `Queue '${name}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: stats,
    });
  }),
);

// ===========================================
// GET /api/observability/health
// Extended health with queue + tracing status
// ===========================================

observabilityRouter.get(
  '/health',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const queueService = getQueueService();
    const queueStats = await queueService.getAllStats();

    const totalActive = queueStats.reduce((sum, q) => sum + q.active, 0);
    const totalFailed = queueStats.reduce((sum, q) => sum + q.failed, 0);

    const poolStats = getPoolStats();
    const workerHealth = getWorkerHealth();

    res.json({
      success: true,
      data: {
        tracing: {
          enabled: isTracingEnabled(),
          status: isTracingEnabled() ? 'active' : 'disabled',
        },
        metrics: {
          enabled: isMetricsEnabled(),
          status: isMetricsEnabled() ? 'active' : 'disabled',
        },
        queues: {
          available: queueService.isAvailable(),
          status: queueService.isAvailable() ? 'connected' : 'disabled',
          totalActive,
          totalFailed,
          queues: queueStats,
        },
        workers: workerHealth,
        database: {
          pool: poolStats.pool,
          events: poolStats.events,
          contexts: poolStats.contexts,
        },
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

// ===========================================
// GET /api/observability/saas-summary  (Sprint 1.6)
// Admin-only snapshot for the grafana-saas-health dashboard.
// Aggregates active sessions, plan distribution, 24h revenue proxy and
// per-schema memory/idea counts across all 4 contexts.
// ===========================================

/**
 * EUR monthly price per tier; used as a revenue proxy until Stripe invoice
 * aggregation lands. `enterprise` is a manual contract → priced as 0 here so
 * it doesn't skew the "Self-Serve 24h revenue" metric.
 */
const TIER_MONTHLY_EUR: Record<string, number> = {
  free: 0,
  personal: 19,
  pro: 39,
  business: 59,
  enterprise: 0,
};

const SUPPORTED_CONTEXTS = ['operations', 'finance', 'people', 'strategy'] as const;

observabilityRouter.get(
  '/saas-summary',
  apiKeyAuth,
  requireScope('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    // --- 1) Active sessions (non-revoked, non-expired) -------------------
    const sessionsResult = await queryPublic(
      `SELECT COUNT(*)::int AS active
         FROM public.user_sessions
        WHERE revoked = FALSE
          AND expires_at > NOW()`,
    );
    const activeSessions = (sessionsResult.rows[0] as { active: number } | undefined)?.active ?? 0;

    // --- 2) Plan distribution -------------------------------------------
    const plansResult = await queryPublic(
      `SELECT plan, COUNT(*)::int AS count
         FROM public.subscriptions
        WHERE status IN ('active', 'trialing')
        GROUP BY plan`,
    );
    const plans: Record<string, number> = {};
    for (const row of plansResult.rows as Array<{ plan: string; count: number }>) {
      plans[row.plan] = row.count;
    }

    // --- 3) 24h revenue proxy (new subscriptions × monthly price) -------
    const newSubsResult = await queryPublic(
      `SELECT plan, COUNT(*)::int AS count
         FROM public.subscriptions
        WHERE status IN ('active', 'trialing')
          AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY plan`,
    );
    let revenueProxyEur24h = 0;
    for (const row of newSubsResult.rows as Array<{ plan: string; count: number }>) {
      revenueProxyEur24h += (TIER_MONTHLY_EUR[row.plan] ?? 0) * row.count;
    }

    // --- 4) Per-context counts (parallel across all 4 schemas) ----------
    const contextStats: Record<string, { ideas: number; memories: number }> = {};
    await Promise.all(
      SUPPORTED_CONTEXTS.map(async ctx => {
        const [ideasRes, memoriesRes] = await Promise.all([
          queryContext(ctx, `SELECT COUNT(*)::int AS count FROM ideas`).catch(() => ({ rows: [{ count: 0 }] })),
          queryContext(ctx, `SELECT COUNT(*)::int AS count FROM memory_items`).catch(() => ({ rows: [{ count: 0 }] })),
        ]);
        contextStats[ctx] = {
          ideas: (ideasRes.rows[0] as { count: number } | undefined)?.count ?? 0,
          memories: (memoriesRes.rows[0] as { count: number } | undefined)?.count ?? 0,
        };
      }),
    );

    res.json({
      success: true,
      data: {
        active_sessions: activeSessions,
        plans,
        revenue_proxy_eur_24h: revenueProxyEur24h,
        contexts: contextStats,
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

// ===========================================
// POST /api/observability/queue/:name/clean
// Clean completed/failed jobs from a queue
// ===========================================

observabilityRouter.post(
  '/queue/:name/clean',
  apiKeyAuth,
  requireScope('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;

    if (!QUEUE_NAMES.includes(name as QueueName)) {
      res.status(400).json({
        success: false,
        error: `Unknown queue: ${name}. Available: ${QUEUE_NAMES.join(', ')}`,
      });
      return;
    }

    const status = (req.body?.status as 'completed' | 'failed') || 'completed';
    const gracePeriodMs = parseInt(req.body?.gracePeriodMs as string) || 3600_000;

    const queueService = getQueueService();
    const cleaned = await queueService.cleanQueue(name as QueueName, status, gracePeriodMs);

    res.json({
      success: true,
      data: {
        queue: name,
        status,
        cleaned,
      },
    });
  }),
);
