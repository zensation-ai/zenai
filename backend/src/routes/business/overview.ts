/**
 * Business Overview Route
 *
 * Aggregated business health dashboard - single endpoint
 * that combines metrics from all active connectors.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { pool } from '../../utils/database';
import { stripeConnector, ga4Connector, gscConnector, uptimeConnector, lighthouseConnector, getConnectorStatuses } from '../../services/business';
import type { BusinessOverview } from '../../types/business';

export const overviewRouter = Router();

/**
 * GET /api/business/overview
 * Aggregated business health dashboard
 */
overviewRouter.get('/', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const overview: BusinessOverview = {
    revenue: { mrr: 0, mrrGrowth: 0, activeSubscriptions: 0, churnRate: 0 },
    traffic: { users: 0, usersGrowth: 0, sessions: 0, bounceRate: 0 },
    seo: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0 },
    health: { uptime: 100, activeIncidents: 0, avgResponseTime: 0 },
    performance: { score: 0, lcp: 0, fid: 0, cls: 0 },
  };

  // Try to get live data from connectors, fall back to latest snapshot
  const errors: string[] = [];

  if (stripeConnector.isAvailable()) {
    try {
      const metrics = await stripeConnector.getMetrics();
      overview.revenue = {
        mrr: metrics.mrr,
        mrrGrowth: metrics.mrrGrowth,
        activeSubscriptions: metrics.activeSubscriptions,
        churnRate: metrics.churnRate,
      };
    } catch {
      errors.push('stripe');
    }
  }

  if (ga4Connector.isAvailable()) {
    try {
      const metrics = await ga4Connector.getTrafficMetrics('7d');
      overview.traffic = {
        users: metrics.users,
        usersGrowth: metrics.usersGrowth,
        sessions: metrics.sessions,
        bounceRate: metrics.bounceRate,
      };
    } catch {
      errors.push('ga4');
    }
  }

  if (gscConnector.isAvailable()) {
    try {
      const siteUrl = process.env.GSC_SITE_URL ?? 'https://zensation.ai';
      const metrics = await gscConnector.getSearchMetrics(siteUrl, '28d');
      overview.seo = {
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        avgPosition: metrics.avgPosition,
      };
    } catch {
      errors.push('gsc');
    }
  }

  if (uptimeConnector.isAvailable()) {
    try {
      const status = await uptimeConnector.getUptimeStatus();
      overview.health = {
        uptime: status.percentage,
        activeIncidents: status.incidents.length,
        avgResponseTime: status.avgResponseTime,
      };
    } catch {
      errors.push('uptime');
    }
  }

  // Performance from stored data (lighthouse audits are expensive)
  try {
    const scores = await lighthouseConnector.getLatestScores();
    if (scores) {
      overview.performance = {
        score: scores.score,
        lcp: scores.lcp,
        fid: scores.fid,
        cls: scores.cls,
      };
    }
  } catch {
    errors.push('lighthouse');
  }

  // Fall back to latest snapshot for any failed connectors
  if (errors.length > 0) {
    try {
      const snapshot = await pool.query(`
        SELECT metrics FROM business_metrics_snapshots
        WHERE snapshot_type = 'daily'
        ORDER BY snapshot_date DESC
        LIMIT 1
      `);
      if (snapshot.rows.length > 0) {
        const cached = snapshot.rows[0].metrics;
        if (errors.includes('stripe') && cached.stripe) {
          overview.revenue = {
            mrr: cached.stripe.mrr ?? 0,
            mrrGrowth: cached.stripe.mrrGrowth ?? 0,
            activeSubscriptions: cached.stripe.activeSubscriptions ?? 0,
            churnRate: cached.stripe.churnRate ?? 0,
          };
        }
        // Similar for other connectors...
      }
    } catch { /* ignore */ }
  }

  const connectors = getConnectorStatuses();

  res.json({
    success: true,
    overview,
    connectors,
    errors: errors.length > 0 ? errors : undefined,
    lastUpdated: new Date().toISOString(),
  });
}));
