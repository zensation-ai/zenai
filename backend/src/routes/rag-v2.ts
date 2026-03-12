/**
 * Phase 49: RAG v2 Routes
 *
 * API endpoints for adaptive retrieval and citation tracking.
 *
 * Routes (mounted at /api/:context/rag/v2):
 * - POST /retrieve - Adaptive retrieval with strategy selection
 * - GET /citations/:messageId - Get citations for a message
 * - POST /source-feedback - Record source quality feedback
 * - GET /strategy-stats - Strategy usage statistics
 *
 * @module routes/rag-v2
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { apiKeyAuth } from '../middleware/auth';
import { validateContextParam } from '../utils/validation';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { AIContext, isValidContext } from '../utils/database-context';
import { queryContext } from '../utils/database-context';
import { retrieve, AdaptiveStrategy } from '../services/rag/adaptive-retrieval';
import { getCitations } from '../services/rag/citation-tracker';

const router = Router();

router.use(apiKeyAuth);

// ===========================================
// POST /api/:context/rag/v2/retrieve
// ===========================================

/**
 * Execute adaptive retrieval with automatic strategy selection.
 *
 * Body: { query: string, strategy?: 'dense' | 'sparse' | 'hybrid' | 'auto', maxResults?: number }
 * Returns: { success: true, data: AdaptiveRetrievalResult }
 */
router.post(
  '/:context/rag/v2/retrieve',
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { query, strategy, maxResults } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required and must be a string' });
    }

    const validStrategies: (AdaptiveStrategy | 'auto')[] = ['dense', 'sparse', 'hybrid', 'auto'];
    if (strategy && !validStrategies.includes(strategy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`,
      });
    }

    const forceStrategy = strategy && strategy !== 'auto' ? strategy as AdaptiveStrategy : undefined;

    const result = await retrieve(query, context, {
      forceStrategy,
      maxResults: maxResults ? parseInt(maxResults, 10) : undefined,
    });

    return res.json({ success: true, data: result });
  })
);

// ===========================================
// GET /api/:context/rag/v2/citations/:messageId
// ===========================================

/**
 * Get saved citations for a specific chat message.
 *
 * Returns: { success: true, data: { citations: SourceAttribution[] } }
 */
router.get(
  '/:context/rag/v2/citations/:messageId',
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { messageId } = req.params;
    if (!messageId) {
      return res.status(400).json({ success: false, error: 'messageId is required' });
    }

    const citations = await getCitations(messageId, context);

    return res.json({ success: true, data: { citations } });
  })
);

// ===========================================
// POST /api/:context/rag/v2/source-feedback
// ===========================================

/**
 * Record feedback on a specific source's helpfulness.
 *
 * Body: { sourceId: string, helpful: boolean, queryType?: string }
 */
router.post(
  '/:context/rag/v2/source-feedback',
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { sourceId, helpful, queryType } = req.body;

    if (!sourceId || typeof helpful !== 'boolean') {
      return res.status(400).json({ success: false, error: 'sourceId and helpful (boolean) are required' });
    }

    await queryContext(
      context,
      `INSERT INTO rag_source_feedback (source_id, helpful, query_type, context)
       VALUES ($1, $2, $3, $4)`,
      [sourceId, helpful, queryType || null, context]
    );

    return res.json({ success: true, data: { recorded: true } });
  })
);

// ===========================================
// GET /api/:context/rag/v2/strategy-stats
// ===========================================

/**
 * Get strategy usage statistics from RAG query analytics.
 *
 * Returns: { success: true, data: { strategies: { dense: stats, sparse: stats, hybrid: stats } } }
 */
router.get(
  '/:context/rag/v2/strategy-stats',
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const days = parseInt(req.query.days as string, 10) || 30;

    // Query the rag_source_feedback table for stats
    const strategies: Record<string, { total: number; helpful: number; unhelpful: number; helpfulRate: number }> = {
      dense: { total: 0, helpful: 0, unhelpful: 0, helpfulRate: 0 },
      sparse: { total: 0, helpful: 0, unhelpful: 0, helpfulRate: 0 },
      hybrid: { total: 0, helpful: 0, unhelpful: 0, helpfulRate: 0 },
    };

    try {
      const result = await queryContext(
        context,
        `SELECT
          query_type,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE helpful = true) as helpful_count,
          COUNT(*) FILTER (WHERE helpful = false) as unhelpful_count
         FROM rag_source_feedback
         WHERE context = $1
           AND created_at > NOW() - INTERVAL '1 day' * $2
         GROUP BY query_type`,
        [context, days]
      );

      for (const row of result.rows) {
        const queryType = row.query_type as string;
        if (queryType && strategies[queryType]) {
          const total = parseInt(row.total, 10);
          const helpful = parseInt(row.helpful_count, 10);
          const unhelpful = parseInt(row.unhelpful_count, 10);
          strategies[queryType] = {
            total,
            helpful,
            unhelpful,
            helpfulRate: total > 0 ? helpful / total : 0,
          };
        }
      }
    } catch (err) {
      // Table might not exist yet - return defaults
      logger.warn('Failed to load RAG strategy stats, using defaults', { error: (err as Error).message });
    }

    return res.json({ success: true, data: { strategies } });
  })
);

export { router as ragV2Router };
