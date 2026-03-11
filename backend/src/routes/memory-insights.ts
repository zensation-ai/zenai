/**
 * Phase 53: Memory Insights Routes
 *
 * API endpoints for memory timeline, conflict detection,
 * curation suggestions, and impact analysis.
 *
 * All routes: /api/:context/memory/insights/*
 */

import { Router, Request, Response } from 'express';
import { isValidContext, AIContext } from '../utils/database-context';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import {
  getMemoryTimeline,
  detectConflicts,
  getCurationSuggestions,
  getMemoryImpact,
  getMemoryStats,
} from '../services/memory-insights';

export const memoryInsightsRouter = Router();

memoryInsightsRouter.use(apiKeyAuth);

/**
 * GET /api/:context/memory/insights/timeline?from=&to=&granularity=
 * Get memory creation timeline grouped by layer
 */
memoryInsightsRouter.get(
  '/:context/memory/insights/timeline',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!from || !to) {
      throw new ValidationError('Query parameters "from" and "to" are required (YYYY-MM-DD format).');
    }

    const granularity = (req.query.granularity as string) || 'day';
    if (!['day', 'week', 'month'].includes(granularity)) {
      throw new ValidationError('Granularity must be "day", "week", or "month".');
    }

    const data = await getMemoryTimeline(context, from, to, granularity as 'day' | 'week' | 'month');
    return res.json({ success: true, data });
  })
);

/**
 * GET /api/:context/memory/insights/conflicts?limit=20
 * Detect memory conflicts (duplicates, outdated, contradictions)
 */
memoryInsightsRouter.get(
  '/:context/memory/insights/conflicts',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const data = await detectConflicts(context, limit);
    return res.json({ success: true, data });
  })
);

/**
 * GET /api/:context/memory/insights/curation
 * Get curation suggestions (archive, promote, merge, delete)
 */
memoryInsightsRouter.get(
  '/:context/memory/insights/curation',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const data = await getCurationSuggestions(context);
    return res.json({ success: true, data });
  })
);

/**
 * GET /api/:context/memory/insights/impact?limit=20
 * Get most impactful memories ranked by influence score
 */
memoryInsightsRouter.get(
  '/:context/memory/insights/impact',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const data = await getMemoryImpact(context, limit);
    return res.json({ success: true, data });
  })
);

/**
 * GET /api/:context/memory/insights/stats
 * Get aggregated memory statistics
 */
memoryInsightsRouter.get(
  '/:context/memory/insights/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const data = await getMemoryStats(context);
    return res.json({ success: true, data });
  })
);
