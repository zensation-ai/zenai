/**
 * Interaction Tracking API Routes
 * Phase 4: Deep Learning Feedback Loop
 *
 * Tracks user interactions, corrections, and provides learning analytics.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  trackInteraction,
  trackView,
  trackSearchClick,
  trackFeedback,
  recordCorrection,
  getIdeaCorrectionHistory,
  getOrCreateSession,
  endSession,
  getInteractionStats,
  getCorrectionStatsByField,
  getActivePatterns,
  suggestCorrectionFromPatterns,
  EntityType,
  InteractionType,
  CorrectionField,
} from '../services/interaction-tracking';

export const interactionsRouter = Router();

// ===========================================
// Interaction Tracking
// ===========================================

/**
 * POST /api/:context/interactions
 * Track a user interaction
 */
interactionsRouter.post(
  '/:context/interactions',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { entity_type, entity_id, interaction_type, metadata, session_id, duration_ms } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    // Validate entity_type
    const validEntityTypes: EntityType[] = ['idea', 'cluster', 'automation', 'suggestion', 'search', 'profile'];
    if (!entity_type || !validEntityTypes.includes(entity_type)) {
      throw new ValidationError(`Invalid entity_type. Use: ${validEntityTypes.join(', ')}`);
    }

    // Validate interaction_type
    const validInteractionTypes: InteractionType[] = [
      'view', 'create', 'edit', 'delete', 'archive', 'restore',
      'share', 'export', 'search_click', 'suggestion_accept', 'suggestion_dismiss',
      'feedback_positive', 'feedback_negative', 'correction', 'bulk_action'
    ];
    if (!interaction_type || !validInteractionTypes.includes(interaction_type)) {
      throw new ValidationError(`Invalid interaction_type. Use: ${validInteractionTypes.join(', ')}`);
    }

    const id = await trackInteraction(context as AIContext, entity_type, interaction_type, {
      entity_id,
      metadata,
      session_id,
      duration_ms: parseInt(duration_ms) || 0,
    });

    res.status(201).json({
      success: true,
      interaction_id: id,
    });
  })
);

/**
 * POST /api/:context/interactions/view
 * Track a view event (simplified endpoint)
 */
interactionsRouter.post(
  '/:context/interactions/view',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { entity_type, entity_id, duration_ms, session_id } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (!entity_type || !entity_id) {
      throw new ValidationError('entity_type and entity_id are required');
    }

    await trackView(
      context as AIContext,
      entity_type as EntityType,
      entity_id,
      parseInt(duration_ms) || undefined,
      session_id
    );

    res.json({ success: true });
  })
);

/**
 * POST /api/:context/interactions/search-click
 * Track when user clicks a search result
 */
interactionsRouter.post(
  '/:context/interactions/search-click',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { query, result_id, position, session_id } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (!query || !result_id) {
      throw new ValidationError('query and result_id are required');
    }

    await trackSearchClick(
      context as AIContext,
      query,
      result_id,
      parseInt(position) || 0,
      session_id
    );

    res.json({ success: true });
  })
);

/**
 * POST /api/:context/interactions/feedback
 * Track feedback on an entity
 */
interactionsRouter.post(
  '/:context/interactions/feedback',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { entity_type, entity_id, is_positive, comment, session_id } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (!entity_type || !entity_id || is_positive === undefined) {
      throw new ValidationError('entity_type, entity_id, and is_positive are required');
    }

    await trackFeedback(
      context as AIContext,
      entity_type as EntityType,
      entity_id,
      is_positive === true,
      comment,
      session_id
    );

    res.json({ success: true });
  })
);

// ===========================================
// Corrections
// ===========================================

/**
 * POST /api/:context/corrections
 * Record a field-level correction
 */
interactionsRouter.post(
  '/:context/corrections',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { idea_id, field, old_value, new_value, weight } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (!idea_id || !field || old_value === undefined || new_value === undefined) {
      throw new ValidationError('idea_id, field, old_value, and new_value are required');
    }

    // Validate field
    const validFields: CorrectionField[] = ['type', 'category', 'priority', 'title', 'summary', 'keywords', 'next_steps'];
    if (!validFields.includes(field)) {
      throw new ValidationError(`Invalid field. Use: ${validFields.join(', ')}`);
    }

    const correctionId = await recordCorrection(
      context as AIContext,
      idea_id,
      field as CorrectionField,
      old_value,
      new_value,
      weight !== undefined ? parseFloat(weight) : 5.0
    );

    logger.info('Correction recorded via API', { correctionId, context, field });

    res.status(201).json({
      success: true,
      correction_id: correctionId,
    });
  })
);

/**
 * GET /api/:context/corrections/idea/:ideaId
 * Get correction history for an idea
 */
interactionsRouter.get(
  '/:context/corrections/idea/:ideaId',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context, ideaId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const corrections = await getIdeaCorrectionHistory(context as AIContext, ideaId);

    res.json({
      success: true,
      corrections,
      count: corrections.length,
    });
  })
);

/**
 * POST /api/:context/corrections/suggest
 * Get correction suggestions based on learned patterns
 */
interactionsRouter.post(
  '/:context/corrections/suggest',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { content, current_values } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (!content) {
      throw new ValidationError('content is required');
    }

    const suggestions = await suggestCorrectionFromPatterns(
      context as AIContext,
      content,
      current_values || {}
    );

    res.json({
      success: true,
      suggestions,
      has_suggestions: Object.keys(suggestions).length > 0,
    });
  })
);

// ===========================================
// Sessions
// ===========================================

/**
 * POST /api/:context/sessions
 * Create or get a learning session
 */
interactionsRouter.post(
  '/:context/sessions',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { session_token, client_info } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (!session_token) {
      throw new ValidationError('session_token is required');
    }

    const session = await getOrCreateSession(
      context as AIContext,
      session_token,
      client_info
    );

    res.json({
      success: true,
      session,
    });
  })
);

/**
 * POST /api/:context/sessions/:token/end
 * End a learning session
 */
interactionsRouter.post(
  '/:context/sessions/:token/end',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    await endSession(token);

    res.json({
      success: true,
      message: 'Session ended',
    });
  })
);

// ===========================================
// Statistics
// ===========================================

/**
 * GET /api/:context/interactions/stats
 * Get interaction statistics
 */
interactionsRouter.get(
  '/:context/interactions/stats',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const stats = await getInteractionStats(context as AIContext);

    res.json({
      success: true,
      stats,
    });
  })
);

/**
 * GET /api/:context/corrections/stats
 * Get correction statistics by field
 */
interactionsRouter.get(
  '/:context/corrections/stats',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const stats = await getCorrectionStatsByField(context as AIContext);

    res.json({
      success: true,
      stats,
    });
  })
);

/**
 * GET /api/:context/patterns
 * Get active correction patterns
 */
interactionsRouter.get(
  '/:context/patterns',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { field } = req.query;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const patterns = await getActivePatterns(
      context as AIContext,
      field as CorrectionField | undefined
    );

    res.json({
      success: true,
      patterns,
      count: patterns.length,
    });
  })
);
