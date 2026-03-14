/**
 * Phase 50: Analytics V2 Routes
 *
 * Enhanced analytics endpoints with custom date ranges,
 * trend analysis, productivity insights, and period comparison.
 *
 * Mounted at: /api/:context/analytics/v2/*
 */

import { Router, Request, Response } from 'express';
import { isValidContext, AIContext } from '../utils/database-context';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import {
  getOverview,
  getTrends,
  getProductivityInsights,
  getComparison,
} from '../services/analytics-v2';
import { getUsageStats, getDailyUsage } from '../services/ai-usage-tracker';
import { getMemoryHealth } from '../services/memory-health';

export const analyticsV2Router = Router();

// ===========================================
// Helper: Parse & validate date params
// ===========================================

function parseDateRange(req: Request): { from: string; to: string } {
  const from = req.query.from as string;
  const to = req.query.to as string;

  if (!from || !to) {
    throw new ValidationError('Query parameters "from" and "to" are required (YYYY-MM-DD).');
  }

  // Basic format check
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    throw new ValidationError('Date parameters must be in YYYY-MM-DD format.');
  }

  if (new Date(from) > new Date(to)) {
    throw new ValidationError('"from" date must be before or equal to "to" date.');
  }

  return { from, to };
}

function validateContext(req: Request): AIContext {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }
  return context as AIContext;
}

// ===========================================
// GET /api/:context/analytics/v2/overview
// ===========================================

analyticsV2Router.get(
  '/:context/analytics/v2/overview',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = validateContext(req);
    getUserId(req); // auth check
    const { from, to } = parseDateRange(req);

    const overview = await getOverview(ctx, from, to);

    res.json({ success: true, data: overview });
  })
);

// ===========================================
// GET /api/:context/analytics/v2/trends
// ===========================================

analyticsV2Router.get(
  '/:context/analytics/v2/trends',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = validateContext(req);
    getUserId(req); // auth check
    const { from, to } = parseDateRange(req);
    const granularity = (req.query.granularity as string) || 'day';

    if (!['day', 'week', 'month'].includes(granularity)) {
      throw new ValidationError('Granularity must be "day", "week", or "month".');
    }

    const trends = await getTrends(ctx, from, to, granularity as 'day' | 'week' | 'month');

    res.json({ success: true, data: trends });
  })
);

// ===========================================
// GET /api/:context/analytics/v2/productivity
// ===========================================

analyticsV2Router.get(
  '/:context/analytics/v2/productivity',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = validateContext(req);
    getUserId(req); // auth check
    const { from, to } = parseDateRange(req);

    const insights = await getProductivityInsights(ctx, from, to);

    res.json({ success: true, data: insights });
  })
);

// ===========================================
// GET /api/:context/analytics/v2/comparison
// ===========================================

analyticsV2Router.get(
  '/:context/analytics/v2/comparison',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = validateContext(req);
    getUserId(req); // auth check

    const p1From = req.query.p1_from as string;
    const p1To = req.query.p1_to as string;
    const p2From = req.query.p2_from as string;
    const p2To = req.query.p2_to as string;

    if (!p1From || !p1To || !p2From || !p2To) {
      throw new ValidationError('Query parameters "p1_from", "p1_to", "p2_from", "p2_to" are required.');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (![p1From, p1To, p2From, p2To].every(d => dateRegex.test(d))) {
      throw new ValidationError('All date parameters must be in YYYY-MM-DD format.');
    }

    const comparison = await getComparison(
      ctx,
      { from: p1From, to: p1To },
      { from: p2From, to: p2To }
    );

    res.json({ success: true, data: comparison });
  })
);

// ===========================================
// GET /api/:context/analytics/v2/ai-usage
// ===========================================

analyticsV2Router.get(
  '/:context/analytics/v2/ai-usage',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    validateContext(req);
    getUserId(req); // auth check
    const { from, to } = parseDateRange(req);

    const stats = await getUsageStats(from, to);

    res.json({ success: true, data: stats });
  })
);

// ===========================================
// GET /api/:context/analytics/v2/ai-usage/daily
// ===========================================

analyticsV2Router.get(
  '/:context/analytics/v2/ai-usage/daily',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    validateContext(req);
    getUserId(req); // auth check
    const { from, to } = parseDateRange(req);

    const daily = await getDailyUsage(from, to);

    res.json({ success: true, data: daily });
  })
);

// ===========================================
// GET /api/:context/analytics/v2/memory-health
// ===========================================

analyticsV2Router.get(
  '/:context/analytics/v2/memory-health',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = validateContext(req);
    getUserId(req); // auth check

    const health = await getMemoryHealth(ctx);

    res.json({ success: true, data: health });
  })
);
