/**
 * Self-Improvement API Routes (Phase 141)
 *
 * Endpoints for identifying improvement opportunities, checking
 * the daily action budget, viewing history, and executing improvements.
 *
 * @module routes/self-improvement
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';
import {
  identifyImprovements,
  checkBudget,
  recordImprovementAction,
  getImprovementHistory,
} from '../services/integration/self-improvement';
import type { IdentifyParams, GapInput, ProcedureInput, CalibrationInput, TeamStrategyInput } from '../services/integration/self-improvement';

const router = Router();

// ─── Opportunities ───────────────────────────────────────────────────────────

/** GET /api/:context/self-improvement/opportunities — Identify improvement opportunities */
router.get('/:context/self-improvement/opportunities', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const ctx = context as AIContext;

  try {
    // Gather inputs from relevant tables in parallel
    const [gapsRes, proceduresRes, calibrationRes, teamRes] = await Promise.allSettled([
      queryContext(ctx, `SELECT topic, gap_score FROM knowledge_gaps WHERE status = 'active' ORDER BY gap_score DESC LIMIT 10`),
      queryContext(ctx, `SELECT trigger_pattern as name, COALESCE(success_rate, 0.5) as success_rate FROM procedural_memories ORDER BY created_at DESC LIMIT 20`),
      queryContext(ctx, `SELECT AVG(CASE WHEN was_correct THEN 0 ELSE 1 END) as ece FROM prediction_history WHERE created_at > NOW() - INTERVAL '30 days'`),
      queryContext(ctx, `SELECT strategy, AVG(COALESCE(quality_score, 0.5)) as avg_score FROM agent_workflow_runs GROUP BY strategy LIMIT 10`),
    ]);

    const params: IdentifyParams = {};

    if (gapsRes.status === 'fulfilled' && gapsRes.value.rows.length > 0) {
      params.gaps = gapsRes.value.rows.map((r: any): GapInput => ({
        topic: r.topic,
        gapScore: parseFloat(r.gap_score) || 0,
      }));
    }

    if (proceduresRes.status === 'fulfilled' && proceduresRes.value.rows.length > 0) {
      params.procedures = proceduresRes.value.rows.map((r: any): ProcedureInput => ({
        name: r.name || 'unknown',
        successRate: parseFloat(r.success_rate) || 0.5,
      }));
    }

    if (calibrationRes.status === 'fulfilled' && calibrationRes.value.rows.length > 0) {
      params.calibration = {
        ece: parseFloat(calibrationRes.value.rows[0]?.ece ?? '0'),
      } as CalibrationInput;
    }

    if (teamRes.status === 'fulfilled' && teamRes.value.rows.length > 0) {
      params.teamStats = teamRes.value.rows.map((r: any): TeamStrategyInput => ({
        strategy: r.strategy || 'unknown',
        avgScore: parseFloat(r.avg_score) || 0.5,
      }));
    }

    const improvements = identifyImprovements(params);
    res.json({ success: true, data: improvements });
  } catch (error) {
    logger.error('Failed to identify improvements', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to identify improvements' });
  }
}));

// ─── Budget ──────────────────────────────────────────────────────────────────

/** GET /api/:context/self-improvement/budget — Check daily improvement action budget */
router.get('/:context/self-improvement/budget', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const budget = await checkBudget(context as AIContext);
    res.json({ success: true, data: budget });
  } catch (error) {
    logger.error('Failed to check improvement budget', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to check improvement budget' });
  }
}));

// ─── History ─────────────────────────────────────────────────────────────────

/** GET /api/:context/self-improvement/history — Improvement action history */
router.get('/:context/self-improvement/history', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const history = await getImprovementHistory(context as AIContext, 20);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('Failed to load improvement history', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load improvement history' });
  }
}));

// ─── Execute ─────────────────────────────────────────────────────────────────

/** POST /api/:context/self-improvement/:id/execute — Execute an improvement action */
router.post('/:context/self-improvement/:id/execute', asyncHandler(async (req, res) => {
  const { context, id } = req.params;
  try {
    // Build a minimal action from the ID - the actual action should come from the opportunities list
    const action = {
      id,
      type: (req.body.type || 'knowledge_gap_research') as any,
      description: req.body.description || `Improvement action ${id}`,
      riskLevel: (req.body.riskLevel || 'low') as any,
      requiresApproval: req.body.requiresApproval ?? false,
      estimatedImpact: req.body.estimatedImpact ?? 0.5,
      basis: req.body.basis || [],
    };

    await recordImprovementAction(context as AIContext, action);
    res.json({ success: true, data: { id, status: 'executed' } });
  } catch (error) {
    logger.error('Failed to execute improvement', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to execute improvement' });
  }
}));

export default router;
