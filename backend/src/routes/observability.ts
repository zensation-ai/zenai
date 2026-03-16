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
import { getPoolStats } from '../utils/database-context';

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
