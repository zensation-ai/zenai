/**
 * Business Traffic Routes
 *
 * GA4-based traffic metrics: users, sessions, pageviews, sources.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { ga4Connector } from '../../services/business';
import { pool } from '../../utils/database';

export const trafficRouter = Router();

/**
 * GET /api/business/traffic
 * Current traffic metrics
 */
trafficRouter.get('/', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) || '7d';

  if (!ga4Connector.isAvailable()) {
    res.json({ success: true, traffic: null, message: 'Google Analytics not configured' });
    return;
  }

  const metrics = await ga4Connector.getTrafficMetrics(period);
  res.json({ success: true, traffic: metrics });
}));

/**
 * GET /api/business/traffic/timeline
 * Traffic over time from stored snapshots
 */
trafficRouter.get('/timeline', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(parseInt(req.query.period as string, 10) || 30, 365);

  const result = await pool.query(`
    SELECT
      snapshot_date as date,
      users,
      sessions,
      pageviews,
      bounce_rate as "bounceRate"
    FROM traffic_snapshots
    WHERE snapshot_date > CURRENT_DATE - $1::int
    ORDER BY snapshot_date ASC
  `, [days]);

  res.json({ success: true, timeline: result.rows, period: `${days} days` });
}));
