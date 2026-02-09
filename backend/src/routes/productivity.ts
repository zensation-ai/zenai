/**
 * Productivity Analytics Routes
 *
 * ROI-focused analytics endpoints showing concrete value.
 *
 * Endpoints:
 * - GET /api/:context/productivity/dashboard - Full productivity dashboard
 * - GET /api/:context/productivity/time-saved - Time saved estimates
 * - GET /api/:context/productivity/heatmap - Activity heatmap
 * - GET /api/:context/productivity/knowledge-growth - Knowledge graph growth
 * - GET /api/:context/productivity/streak - Streak information
 * - GET /api/:context/productivity/weekly-report - Weekly report card
 *
 * @module routes/productivity
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { AIContext } from '../utils/database-context';
import {
  getProductivityDashboard,
  getTimeSavedMetrics,
  getActivityHeatmap,
  getKnowledgeGrowth,
  getStreakInfo,
  getWeeklyReport,
} from '../services/productivity-analytics';

export const productivityRouter = Router();

function isValidContext(context: string): context is AIContext {
  return context === 'personal' || context === 'work';
}

/**
 * GET /api/:context/productivity/dashboard
 * Complete productivity dashboard data
 */
productivityRouter.get('/:context/productivity/dashboard', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const dashboard = await getProductivityDashboard(context);

  res.json({
    success: true,
    data: dashboard,
  });
}));

/**
 * GET /api/:context/productivity/time-saved
 * Time saved through AI assistance
 */
productivityRouter.get('/:context/productivity/time-saved', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const timeSaved = await getTimeSavedMetrics(context);

  res.json({
    success: true,
    data: timeSaved,
  });
}));

/**
 * GET /api/:context/productivity/heatmap
 * Activity heatmap (weekday × hour)
 */
productivityRouter.get('/:context/productivity/heatmap', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const heatmap = await getActivityHeatmap(context);

  res.json({
    success: true,
    data: heatmap,
  });
}));

/**
 * GET /api/:context/productivity/knowledge-growth
 * Knowledge graph growth metrics
 */
productivityRouter.get('/:context/productivity/knowledge-growth', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const growth = await getKnowledgeGrowth(context);

  res.json({
    success: true,
    data: growth,
  });
}));

/**
 * GET /api/:context/productivity/streak
 * Streak information
 */
productivityRouter.get('/:context/productivity/streak', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const streak = await getStreakInfo(context);

  res.json({
    success: true,
    data: streak,
  });
}));

/**
 * GET /api/:context/productivity/weekly-report
 * Weekly report card
 */
productivityRouter.get('/:context/productivity/weekly-report', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const report = await getWeeklyReport(context);

  res.json({
    success: true,
    data: report,
  });
}));
