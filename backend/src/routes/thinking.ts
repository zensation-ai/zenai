/**
 * Phase 46: Extended Thinking Routes
 *
 * API endpoints for thinking chain management, feedback, and statistics.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { AIContext, isValidContext } from '../utils/database-context';
import {
  recordThinkingFeedback,
  getThinkingStats,
} from '../services/claude/thinking-budget';
import {
  getStrategyHistory,
  persistStrategies,
  getThinkingChainById,
  deleteThinkingChain,
} from '../services/thinking-management';

const router = Router();

// All routes require API key auth
router.use(apiKeyAuth);

/**
 * POST /api/:context/thinking/feedback
 * Record quality feedback for a thinking chain
 */
router.post(
  '/:context/thinking/feedback',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { chainId, wasHelpful, qualityRating, feedbackText } = req.body;

    if (!chainId) {
      return res.status(400).json({ success: false, error: 'chainId is required' });
    }

    if (typeof qualityRating !== 'number' || qualityRating < 1 || qualityRating > 5) {
      return res.status(400).json({ success: false, error: 'qualityRating must be 1-5' });
    }

    await recordThinkingFeedback(chainId, context, {
      wasHelpful: wasHelpful !== false,
      qualityRating: qualityRating as 1 | 2 | 3 | 4 | 5,
      feedbackText,
    });

    return res.json({ success: true, message: 'Feedback recorded' });
  })
);

/**
 * GET /api/:context/thinking/stats
 * Get thinking chain statistics
 */
router.get(
  '/:context/thinking/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const stats = await getThinkingStats(context);
    return res.json({ success: true, data: stats });
  })
);

/**
 * GET /api/:context/thinking/strategies
 * Get current budget strategy performance
 */
router.get(
  '/:context/thinking/strategies',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const strategies = await getStrategyHistory(context);
    return res.json({ success: true, data: strategies });
  })
);

/**
 * POST /api/:context/thinking/strategies/persist
 * Persist current in-memory strategies to database
 */
router.post(
  '/:context/thinking/strategies/persist',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    await persistStrategies(context);
    return res.json({ success: true, message: 'Strategies persisted' });
  })
);

/**
 * GET /api/:context/thinking/chains/:id
 * Get a specific thinking chain
 */
router.get(
  '/:context/thinking/chains/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const chain = await getThinkingChainById(req.params.id, context);
    if (!chain) {
      return res.status(404).json({ success: false, error: 'Thinking chain not found' });
    }

    return res.json({ success: true, data: chain });
  })
);

/**
 * DELETE /api/:context/thinking/chains/:id
 * Delete a thinking chain
 */
router.delete(
  '/:context/thinking/chains/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    await deleteThinkingChain(req.params.id, context);
    return res.json({ success: true, message: 'Thinking chain deleted' });
  })
);

export { router as thinkingRouter };
