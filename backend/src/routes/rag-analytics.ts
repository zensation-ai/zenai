/**
 * Phase 47: RAG Analytics Routes
 *
 * API endpoints for RAG feedback, query analytics, and performance monitoring.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AIContext, isValidContext } from '../utils/database-context';
import {
  recordRAGFeedback,
  getRAGAnalytics,
  getRAGStrategyPerformance,
  getRAGQueryHistory,
} from '../services/rag-feedback';

const router = Router();

router.use(apiKeyAuth);

/**
 * POST /api/:context/rag/feedback
 * Record feedback on RAG retrieval quality
 */
router.post(
  '/:context/rag/feedback',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ success: false, error: 'Invalid context' });
    }

    const { queryId, queryText, sessionId, resultId, wasHelpful, relevanceRating, feedbackText, strategiesUsed, confidence, responseTimeMs } = req.body;

    if (!queryText || typeof wasHelpful !== 'boolean') {
      return res.status(400).json({ success: false, error: 'queryText and wasHelpful are required' });
    }

    const id = await recordRAGFeedback(context, {
      queryId,
      queryText,
      sessionId,
      resultId,
      wasHelpful,
      relevanceRating,
      feedbackText,
      strategiesUsed,
      confidence,
      responseTimeMs,
    });

    return res.json({ success: true, data: { id } });
  })
);

/**
 * GET /api/:context/rag/analytics
 * Get RAG performance analytics
 */
router.get(
  '/:context/rag/analytics',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ success: false, error: 'Invalid context' });
    }

    const days = parseInt(req.query.days as string, 10) || 30;
    const analytics = await getRAGAnalytics(context, days);
    return res.json({ success: true, data: analytics });
  })
);

/**
 * GET /api/:context/rag/strategies
 * Get strategy performance breakdown
 */
router.get(
  '/:context/rag/strategies',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ success: false, error: 'Invalid context' });
    }

    const days = parseInt(req.query.days as string, 10) || 30;
    const performance = await getRAGStrategyPerformance(context, days);
    return res.json({ success: true, data: performance });
  })
);

/**
 * GET /api/:context/rag/history
 * Get recent RAG query history
 */
router.get(
  '/:context/rag/history',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ success: false, error: 'Invalid context' });
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const history = await getRAGQueryHistory(context, limit);
    return res.json({ success: true, data: history });
  })
);

export { router as ragAnalyticsRouter };
