/**
 * Business Health Routes
 *
 * System health: uptime monitoring + web performance scores.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { uptimeConnector, lighthouseConnector } from '../../services/business';
import { pool } from '../../utils/database';

export const healthRouter = Router();

/**
 * GET /api/business/health
 * Combined health status (uptime + performance)
 */
healthRouter.get('/', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const [uptime, performance] = await Promise.all([
    uptimeConnector.isAvailable()
      ? uptimeConnector.getUptimeStatus()
      : null,
    lighthouseConnector.getLatestScores(),
  ]);

  res.json({
    success: true,
    health: {
      uptime: uptime ?? { percentage: 100, avgResponseTime: 0, incidents: [], monitors: [] },
      performance: performance ?? { score: 0, accessibilityScore: 0, bestPracticesScore: 0, seoScore: 0, lcp: 0, fid: 0, cls: 0 },
    },
  });
}));

/**
 * GET /api/business/health/uptime
 * Detailed uptime data
 */
healthRouter.get('/uptime', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  if (!uptimeConnector.isAvailable()) {
    res.json({ success: true, uptime: null, message: 'UptimeRobot not configured' });
    return;
  }

  const status = await uptimeConnector.getUptimeStatus();
  res.json({ success: true, uptime: status });
}));

/**
 * GET /api/business/health/performance
 * Performance scores over time
 */
healthRouter.get('/performance', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(parseInt(req.query.period as string, 10) || 30, 365);
  const url = (req.query.url as string) || undefined;

  const query = url
    ? `SELECT audit_date as date, performance_score as score, lcp, fid, cls
       FROM performance_scores WHERE url = $1 AND audit_date > CURRENT_DATE - $2::int
       ORDER BY audit_date ASC`
    : `SELECT audit_date as date, performance_score as score, lcp, fid, cls, url
       FROM performance_scores WHERE audit_date > CURRENT_DATE - $1::int
       ORDER BY audit_date ASC`;

  const result = url
    ? await pool.query(query, [url, days])
    : await pool.query(query, [days]);

  // Also include latest scores for the frontend PerformanceMetrics display
  const latestScores = await lighthouseConnector.getLatestScores();

  res.json({ success: true, performance: latestScores, timeline: result.rows, period: `${days} days` });
}));

/**
 * POST /api/business/health/audit
 * Trigger a new Lighthouse audit
 */
healthRouter.post('/audit', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const url = (req.body.url as string) || 'https://zensation.ai';

  const scores = await lighthouseConnector.getScores(url);
  await lighthouseConnector.runAuditAndStore(url);

  res.json({ success: true, scores, url });
}));
