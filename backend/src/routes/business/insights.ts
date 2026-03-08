/**
 * Business Insights Routes
 *
 * AI-generated business insights: anomalies, trends, recommendations.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler, NotFoundError } from '../../middleware/errorHandler';
// pool.query() is used intentionally — business tables are global (not per-context schema)
import { pool } from '../../utils/database';
import { insightGenerator } from '../../services/business';

export const insightsRouter = Router();

/**
 * GET /api/business/insights
 * List active insights
 */
insightsRouter.get('/', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query.status as string) || 'active';
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);

  const result = await pool.query(`
    SELECT id, insight_type, severity, title, description, data_source,
           related_metrics, action_items, status, generated_at, dismissed_at
    FROM business_insights
    WHERE status = $1
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
      generated_at DESC
    LIMIT $2
  `, [status, limit]);

  res.json({ success: true, insights: result.rows, count: result.rows.length });
}));

/**
 * POST /api/business/insights/generate
 * Manually trigger insight generation
 */
insightsRouter.post('/generate', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  await insightGenerator.generateDailyInsights();

  const result = await pool.query(`
    SELECT id, insight_type, severity, title, description, data_source,
           related_metrics, action_items, status, generated_at
    FROM business_insights
    WHERE status = 'active'
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
      generated_at DESC
    LIMIT 20
  `);

  res.json({ success: true, insights: result.rows, count: result.rows.length });
}));

/**
 * POST /api/business/insights/:id/dismiss
 * Dismiss an insight
 */
insightsRouter.post('/:id/dismiss', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(`
    UPDATE business_insights
    SET status = 'dismissed', dismissed_at = NOW()
    WHERE id = $1
    RETURNING id
  `, [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Insight');
  }

  res.json({ success: true, message: 'Insight dismissed' });
}));

/**
 * POST /api/business/insights/:id/act
 * Mark an insight as acted on
 */
insightsRouter.post('/:id/act', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(`
    UPDATE business_insights
    SET status = 'acted_on', dismissed_at = NOW()
    WHERE id = $1
    RETURNING id
  `, [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Insight');
  }

  res.json({ success: true, message: 'Insight marked as acted on' });
}));
