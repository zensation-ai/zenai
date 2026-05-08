/**
 * HyperAgents API Routes
 * Recursive self-improvement management endpoints.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  getStatus,
  proposeImprovement,
  approveAndApply,
  rollbackImprovement,
  checkAutoRollback,
} from '../services/hyperagents/meta-improver';
import {
  getMetaMetrics,
  getImprovementHistory,
} from '../services/hyperagents/improvement-tracker';
import { HYPERAGENT_BOUNDS } from '../services/hyperagents/safety-bounds';

const router = Router();

router.use(apiKeyAuth);

// ─── Status ─────────────────────────────────────────────────────────────────

/** GET /api/:context/hyperagents/status - Current state */
router.get(
  '/:context/hyperagents/status',
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const status = getStatus();
    res.json({ success: true, data: status });
  })
);

// ─── History ────────────────────────────────────────────────────────────────

/** GET /api/:context/hyperagents/history - Improvement history */
router.get(
  '/:context/hyperagents/history',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const history = getImprovementHistory(limit);
    res.json({ success: true, data: history });
  })
);

// ─── Meta-Metrics ───────────────────────────────────────────────────────────

/** GET /api/:context/hyperagents/meta-metrics - Meta-metrics */
router.get(
  '/:context/hyperagents/meta-metrics',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string || '30', 10);
    const metrics = getMetaMetrics(days);
    res.json({ success: true, data: metrics });
  })
);

// ─── Safety Bounds ──────────────────────────────────────────────────────────

/** GET /api/:context/hyperagents/bounds - Safety bounds (read-only) */
router.get(
  '/:context/hyperagents/bounds',
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: HYPERAGENT_BOUNDS });
  })
);

// ─── Propose ────────────────────────────────────────────────────────────────

/** POST /api/:context/hyperagents/propose - Propose an improvement */
router.post(
  '/:context/hyperagents/propose',
  requireScope('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { level, type, description, targetProperty, currentValue, proposedValue, rationale, expectedImpact } = req.body;
    const result = await proposeImprovement({
      level,
      type,
      description,
      targetProperty,
      currentValue,
      proposedValue,
      rationale,
      expectedImpact,
    });
    res.json({ success: true, data: result });
  })
);

// ─── Approve ────────────────────────────────────────────────────────────────

/** POST /api/:context/hyperagents/:id/approve - Approve improvement */
router.post(
  '/:context/hyperagents/:id/approve',
  requireScope('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const success = approveAndApply(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Improvement not found' });
    }
    res.json({ success: true, data: { approved: true } });
  })
);

// ─── Rollback ───────────────────────────────────────────────────────────────

/** POST /api/:context/hyperagents/:id/rollback - Rollback improvement */
router.post(
  '/:context/hyperagents/:id/rollback',
  requireScope('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const success = rollbackImprovement(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Improvement not found' });
    }
    res.json({ success: true, data: { rolledBack: true } });
  })
);

// ─── Auto-Rollback ──────────────────────────────────────────────────────────

/** POST /api/:context/hyperagents/check-rollback - Check for auto-rollback */
router.post(
  '/:context/hyperagents/check-rollback',
  requireScope('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    const rolledBack = checkAutoRollback();
    res.json({ success: true, data: { rolledBack, count: rolledBack.length } });
  })
);

export default router;
