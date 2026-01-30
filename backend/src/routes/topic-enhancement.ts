/**
 * Topic Enhancement API Routes
 *
 * Endpoints for advanced topic analysis and management:
 * - GET /topics/enhanced - Topics with keywords
 * - GET /topics/:id/quality - Quality metrics for a topic
 * - GET /topics/quality - Quality metrics for all topics
 * - GET /topics/similar - Find similar topics (merge suggestions)
 * - POST /topics/assign/:ideaId - Smart topic assignment
 * - POST /topics/context - Get topic context for chat
 *
 * @module routes/topic-enhancement
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { isValidUUID, toFloatBounded, toIntBounded } from '../utils/validation';
import { AIContext } from '../utils/database-context';
import {
  getTopicsWithKeywords,
  calculateTopicQuality,
  getAllTopicQualityMetrics,
  findBestTopicForIdea,
  autoAssignTopicToIdea,
  findSimilarTopics,
  getTopicContextForChat,
  formatTopicContextForPrompt,
} from '../services/topic-enhancement';

export const topicEnhancementRouter = Router();

/**
 * Validate context parameter
 */
function validateContext(context: unknown): AIContext {
  if (context !== 'personal' && context !== 'work') {
    throw new ValidationError('Context must be "personal" or "work"');
  }
  return context as AIContext;
}

// ===========================================
// GET /topics/enhanced
// ===========================================

/**
 * Get all topics with extracted keywords
 *
 * Query params:
 * - context: 'personal' | 'work' (required)
 */
topicEnhancementRouter.get(
  '/topics/enhanced',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.query.context);

    logger.info('Fetching enhanced topics', { context });

    const topics = await getTopicsWithKeywords(context);

    res.json({
      success: true,
      data: {
        topics,
        count: topics.length,
      },
    });
  })
);

// ===========================================
// GET /topics/quality
// ===========================================

/**
 * Get quality metrics for all topics
 *
 * Query params:
 * - context: 'personal' | 'work' (required)
 */
topicEnhancementRouter.get(
  '/topics/quality',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.query.context);

    logger.info('Calculating all topic quality metrics', { context });

    const metrics = await getAllTopicQualityMetrics(context);

    // Calculate summary statistics
    const avgQuality = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.overallQuality, 0) / metrics.length
      : 0;

    const avgCoherence = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.coherence, 0) / metrics.length
      : 0;

    const avgSeparation = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.separation, 0) / metrics.length
      : 0;

    res.json({
      success: true,
      data: {
        topics: metrics,
        summary: {
          topicCount: metrics.length,
          averageQuality: Math.round(avgQuality * 100) / 100,
          averageCoherence: Math.round(avgCoherence * 100) / 100,
          averageSeparation: Math.round(avgSeparation * 100) / 100,
          highQualityTopics: metrics.filter(m => m.overallQuality >= 0.7).length,
          lowQualityTopics: metrics.filter(m => m.overallQuality < 0.4).length,
        },
      },
    });
  })
);

// ===========================================
// GET /topics/:id/quality
// ===========================================

/**
 * Get quality metrics for a single topic
 *
 * Query params:
 * - context: 'personal' | 'work' (required)
 */
topicEnhancementRouter.get(
  '/topics/:id/quality',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const context = validateContext(req.query.context);

    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid topic ID format');
    }

    logger.info('Calculating topic quality', { topicId: id, context });

    const quality = await calculateTopicQuality(id, context);

    if (!quality) {
      throw new NotFoundError('Topic');
    }

    // Interpret quality
    let qualityLevel: string;
    if (quality.overallQuality >= 0.8) {
      qualityLevel = 'excellent';
    } else if (quality.overallQuality >= 0.6) {
      qualityLevel = 'good';
    } else if (quality.overallQuality >= 0.4) {
      qualityLevel = 'moderate';
    } else {
      qualityLevel = 'needs_improvement';
    }

    res.json({
      success: true,
      data: {
        ...quality,
        qualityLevel,
        recommendations: getQualityRecommendations(quality),
      },
    });
  })
);

/**
 * Generate recommendations based on quality metrics
 */
function getQualityRecommendations(quality: {
  coherence: number;
  separation: number;
  density: number;
  stability: number;
}): string[] {
  const recommendations: string[] = [];

  if (quality.coherence < 0.5) {
    recommendations.push('Die Ideen in diesem Topic sind sehr unterschiedlich. Erwäge, das Topic aufzuteilen.');
  }

  if (quality.separation < 0.3) {
    recommendations.push('Dieses Topic ist sehr ähnlich zu anderen. Prüfe, ob ein Merge sinnvoll wäre.');
  }

  if (quality.density < 0.6) {
    recommendations.push('Viele Ideen haben eine niedrige Zugehörigkeit. Überprüfe die Zuordnungen.');
  }

  if (quality.stability < 0.5) {
    recommendations.push('Die Ideen sind weit vom Topic-Zentrum entfernt. Das Topic könnte neu definiert werden.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Dieses Topic hat eine gute Qualität und benötigt keine Optimierung.');
  }

  return recommendations;
}

// ===========================================
// GET /topics/similar
// ===========================================

/**
 * Find similar topics that could be merged
 *
 * Query params:
 * - context: 'personal' | 'work' (required)
 * - threshold: number (optional, default 0.75)
 */
topicEnhancementRouter.get(
  '/topics/similar',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.query.context);
    // toFloatBounded ensures value is within valid range (0-1)
    const threshold = toFloatBounded(req.query.threshold as string, 0.75, 0, 1);

    logger.info('Finding similar topics', { context, threshold });

    const similarities = await findSimilarTopics(context, threshold);

    const mergeSuggestions = similarities.filter(s => s.suggestMerge);

    res.json({
      success: true,
      data: {
        similarities,
        mergeSuggestions,
        mergeSuggestionCount: mergeSuggestions.length,
      },
    });
  })
);

// ===========================================
// POST /topics/assign/:ideaId
// ===========================================

/**
 * Smart topic assignment for an idea
 *
 * Body:
 * - context: 'personal' | 'work' (required)
 * - minConfidence: number (optional, default 0.5)
 * - autoApply: boolean (optional, default false)
 */
topicEnhancementRouter.post(
  '/topics/assign/:ideaId',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { ideaId } = req.params;
    const { context, minConfidence = 0.5, autoApply = false } = req.body;

    if (!isValidUUID(ideaId)) {
      throw new ValidationError('Invalid idea ID format');
    }

    const validContext = validateContext(context);

    logger.info('Finding best topic for idea', { ideaId, context: validContext, minConfidence });

    const assignment = await findBestTopicForIdea(ideaId, validContext, minConfidence);

    if (!assignment) {
      res.json({
        success: true,
        data: {
          assigned: false,
          message: 'No suitable topic found above confidence threshold',
          ideaId,
        },
      });
      return;
    }

    // Auto-apply if requested
    if (autoApply) {
      const applied = await autoAssignTopicToIdea(ideaId, validContext);
      res.json({
        success: true,
        data: {
          assigned: applied,
          assignment,
          autoApplied: applied,
        },
      });
      return;
    }

    // Return suggestion without applying
    res.json({
      success: true,
      data: {
        assigned: false,
        assignment,
        autoApplied: false,
        message: 'Topic suggestion ready. Set autoApply=true to assign automatically.',
      },
    });
  })
);

// ===========================================
// POST /topics/context
// ===========================================

/**
 * Get topic context for chat enhancement
 *
 * Body:
 * - message: string (required)
 * - context: 'personal' | 'work' (required)
 * - maxTopics: number (optional, default 3)
 * - format: 'json' | 'prompt' (optional, default 'json')
 */
topicEnhancementRouter.post(
  '/topics/context',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { message, context, maxTopics = 3, format = 'json' } = req.body;

    if (!message || typeof message !== 'string') {
      throw new ValidationError('Message is required');
    }

    const validContext = validateContext(context);

    logger.info('Getting topic context for chat', {
      messageLength: message.length,
      context: validContext,
      maxTopics,
    });

    const topicContext = await getTopicContextForChat(message, validContext, maxTopics);

    if (format === 'prompt') {
      const promptText = formatTopicContextForPrompt(topicContext);
      res.json({
        success: true,
        data: {
          promptText,
          hasRelevantTopics: topicContext.relevantTopics.length > 0,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: topicContext,
    });
  })
);

// ===========================================
// GET /topics/orphans
// ===========================================

/**
 * Get ideas without topic assignments (orphans)
 *
 * Query params:
 * - context: 'personal' | 'work' (required)
 * - limit: number (optional, default 50)
 */
topicEnhancementRouter.get(
  '/topics/orphans',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.query.context);
    const limit = toIntBounded(req.query.limit as string, 50, 1, 200);

    logger.info('Fetching orphaned ideas', { context, limit });

    // This uses the helper function from the migration
    const { queryContext } = await import('../utils/database-context');

    const result = await queryContext(
      context,
      `SELECT i.id, i.title, i.type, i.created_at
       FROM ideas i
       LEFT JOIN idea_topic_memberships m ON i.id = m.idea_id
       WHERE i.context = $1 AND m.idea_id IS NULL
       ORDER BY i.created_at DESC
       LIMIT $2`,
      [context, limit]
    );

    res.json({
      success: true,
      data: {
        orphanedIdeas: result.rows,
        count: result.rows.length,
      },
    });
  })
);
