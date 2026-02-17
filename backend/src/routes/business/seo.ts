/**
 * Business SEO Routes
 *
 * Google Search Console metrics: impressions, clicks, CTR, rankings.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { gscConnector } from '../../services/business';
// pool.query() is used intentionally — business tables are global (not per-context schema)
import { pool } from '../../utils/database';

export const seoRouter = Router();

/**
 * GET /api/business/seo
 * Current SEO metrics
 */
seoRouter.get('/', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) || '28d';

  if (!gscConnector.isAvailable()) {
    res.json({ success: true, seo: null, message: 'Google Search Console not configured' });
    return;
  }

  const siteUrl = process.env.GSC_SITE_URL ?? 'https://zensation.ai';
  const metrics = await gscConnector.getSearchMetrics(siteUrl, period);
  res.json({ success: true, seo: metrics });
}));

/**
 * GET /api/business/seo/timeline
 * SEO metrics over time from stored snapshots
 */
seoRouter.get('/timeline', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(parseInt(req.query.period as string, 10) || 30, 365);

  const result = await pool.query(`
    SELECT
      snapshot_date as date,
      total_impressions as impressions,
      total_clicks as clicks,
      avg_ctr as ctr,
      avg_position as "avgPosition"
    FROM seo_snapshots
    WHERE snapshot_date > CURRENT_DATE - $1::int
    ORDER BY snapshot_date ASC
  `, [days]);

  res.json({ success: true, timeline: result.rows, period: `${days} days` });
}));

/**
 * GET /api/business/seo/queries
 * Top search queries from latest snapshot
 */
seoRouter.get('/queries', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT top_queries as queries
    FROM seo_snapshots
    ORDER BY snapshot_date DESC
    LIMIT 1
  `);

  const queries = result.rows.length > 0 ? result.rows[0].queries : [];
  res.json({ success: true, queries });
}));
