/**
 * Phase 94: On-Device AI Routes
 *
 * Minimal backend endpoints for hybrid routing decisions:
 * - GET /api/:context/on-device-ai/status    — Server-side AI status
 * - POST /api/:context/on-device-ai/sync-vocab — Upload vocabulary index
 * - GET /api/:context/on-device-ai/config    — Get on-device AI configuration
 */

import { Router, type Request, type Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(apiKeyAuth);

// ===========================================
// GET /api/:context/on-device-ai/status
// ===========================================

/**
 * Returns server-side AI status for hybrid routing decisions.
 * The frontend uses this to decide whether to use on-device or cloud.
 */
router.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const context = req.params.context;

    logger.debug(`[OnDeviceAI] Status request from user=${userId}, context=${context}`);

    res.json({
      success: true,
      data: {
        cloudAvailable: true,
        cloudModel: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
        cloudLatencyMs: null, // Could be populated with avg latency
        recommendOnDevice: [
          'intent_classification',
          'sentiment_analysis',
          'text_completion',
          'extractive_summarization',
        ],
        requiresCloud: [
          'creative_writing',
          'code_generation',
          'complex_reasoning',
          'rag_retrieval',
          'tool_use',
          'vision',
        ],
      },
    });
  }),
);

// ===========================================
// POST /api/:context/on-device-ai/sync-vocab
// ===========================================

/**
 * Upload vocabulary index from on-device for cloud backup.
 * This allows the server to keep a backup of the user's TF-IDF vocabulary
 * for cross-device sync.
 */
router.post(
  '/sync-vocab',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const context = req.params.context;
    const { vocabulary } = req.body;

    if (!Array.isArray(vocabulary)) {
      res.status(400).json({
        success: false,
        error: 'vocabulary must be an array of { term, df, idf } entries',
      });
      return;
    }

    logger.info(`[OnDeviceAI] Vocab sync from user=${userId}, context=${context}, terms=${vocabulary.length}`);

    // For now, just acknowledge. In future, store in DB.
    res.json({
      success: true,
      data: {
        termsReceived: vocabulary.length,
        syncedAt: new Date().toISOString(),
      },
    });
  }),
);

// ===========================================
// GET /api/:context/on-device-ai/config
// ===========================================

/**
 * Get server-recommended on-device AI configuration.
 */
router.get(
  '/config',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const context = req.params.context;

    logger.debug(`[OnDeviceAI] Config request from user=${userId}, context=${context}`);

    res.json({
      success: true,
      data: {
        recommendedComplexityThreshold: 0.5,
        maxCorpusSize: 500,
        cacheTTLMs: 30 * 60 * 1000, // 30 minutes
        enabledProviders: [
          'intent-classifier',
          'sentiment-analyzer',
          'summarizer',
          'text-completer',
        ],
        plannedProviders: [
          {
            id: 'embedding-onnx',
            name: 'all-MiniLM-L6-v2',
            sizeBytes: 23 * 1024 * 1024,
            status: 'planned',
          },
        ],
      },
    });
  }),
);

export const onDeviceAIRouter = router;
