/**
 * Proactive Assistant API Routes
 *
 * Provides endpoints for:
 * - Getting proactive suggestions
 * - Managing suggestion feedback
 * - Viewing and managing routines
 * - Configuring proactive settings
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { AIContext, isValidContext } from '../utils/database-context';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { toIntBounded, toFloatBounded } from '../utils/validation';
import { logger } from '../utils/logger';
import {
  proactiveSuggestionEngine,
  SuggestionType,
} from '../services/proactive-suggestions';
import {
  routineDetectionService,
  UserAction,
} from '../services/routine-detection';
import {
  processWorkflowBoundary,
  BoundaryTrigger,
} from '../services/workflow-boundary-detector';
import { proactiveDigest } from '../services/proactive-digest';
import { recordLearningEvent } from '../services/evolution-analytics';

const router = Router();

// ===========================================
// Suggestions Endpoints
// ===========================================

/**
 * GET /api/proactive/suggestions
 * Get current proactive suggestions for the user
 */
router.get('/suggestions', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const limit = toIntBounded(req.query.limit as string, 5, 1, 50);
  const types = req.query.types
    ? (req.query.types as string).split(',') as SuggestionType[]
    : undefined;

  const suggestions = await proactiveSuggestionEngine.getSuggestions(context as AIContext, {
    limit,
    types,
  });

  res.json({
    success: true,
    suggestions,
    count: suggestions.length,
    hasMore: suggestions.length === limit,
  });
}));

/**
 * POST /api/proactive/suggestions/:id/accept
 * Accept a suggestion and optionally execute its action
 */
router.post('/suggestions/:id/accept', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const context = (req.body.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const actionTaken = req.body.actionTaken;

  await proactiveSuggestionEngine.recordFeedback(id, true, context as AIContext, { actionTaken });

  // Record the acceptance as a user action for learning
  await routineDetectionService.learnFromAction(context as AIContext, {
    actionType: 'suggestion_accepted',
    actionData: { suggestionId: id },
  });

  // Record learning event for evolution timeline (non-blocking)
  recordLearningEvent(context as AIContext, 'preference_updated', 'Vorschlag angenommen', {
    description: 'Ein proaktiver Vorschlag wurde akzeptiert',
    impact_score: 0.5,
    metadata: { suggestionId: id },
  }).catch((err) => logger.debug('Failed to record proactive activity', { error: err instanceof Error ? err.message : String(err) }));

  res.json({
    success: true,
    message: 'Suggestion accepted',
  });
}));

/**
 * POST /api/proactive/suggestions/:id/dismiss
 * Dismiss a suggestion with optional reason
 */
router.post('/suggestions/:id/dismiss', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const context = (req.body.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const reason = req.body.reason;

  await proactiveSuggestionEngine.recordFeedback(id, false, context as AIContext, {
    dismissReason: reason,
  });

  res.json({
    success: true,
    message: 'Suggestion dismissed',
  });
}));

// ===========================================
// Routines Endpoints
// ===========================================

/**
 * GET /api/proactive/routines
 * Get all detected routines for the user
 */
router.get('/routines', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const activeOnly = req.query.activeOnly !== 'false';
  const minConfidence = toFloatBounded(req.query.minConfidence as string, 0, 0, 1);

  const patterns = await routineDetectionService.getPatterns(context as AIContext, {
    activeOnly,
    minConfidence,
  });

  res.json({
    success: true,
    routines: patterns,
    count: patterns.length,
  });
}));

/**
 * POST /api/proactive/routines/analyze
 * Trigger routine analysis for the user
 */
router.post('/routines/analyze', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.body.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const days = toIntBounded(req.body.days as string, 30, 1, 365);

  const patterns = await routineDetectionService.analyzeUserPatterns(context as AIContext, days);

  res.json({
    success: true,
    message: 'Routine analysis complete',
    patternsFound: patterns.length,
    patterns,
  });
}));

/**
 * GET /api/proactive/routines/active
 * Get currently active routines that should trigger
 */
router.get('/routines/active', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const activeRoutines = await routineDetectionService.checkActiveRoutines(context as AIContext);

  res.json({
    success: true,
    activeRoutines,
    count: activeRoutines.length,
  });
}));

/**
 * PATCH /api/proactive/routines/:id
 * Toggle a routine's enabled/disabled state
 */
router.patch('/routines/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const context = (req.body.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    throw new ValidationError('enabled (boolean) is required');
  }

  const { queryContext } = await import('../utils/database-context');
  const result = await queryContext(
    context as AIContext,
    `UPDATE routine_patterns SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active`,
    [enabled, id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: 'Routine not found' });
    return;
  }

  res.json({
    success: true,
    message: enabled ? 'Routine enabled' : 'Routine disabled',
    routine: result.rows[0],
  });
}));

// ===========================================
// Action Recording Endpoint
// ===========================================

/**
 * POST /api/proactive/actions
 * Record a user action for routine learning
 */
router.post('/actions', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.body.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  if (!req.body.actionType) {
    throw new ValidationError('actionType is required');
  }

  const action: UserAction = {
    actionType: req.body.actionType,
    actionData: req.body.actionData || {},
    timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
  };

  await routineDetectionService.learnFromAction(context as AIContext, action);

  res.json({
    success: true,
    message: 'Action recorded',
  });
}));

// ===========================================
// Settings Endpoints
// ===========================================

/**
 * GET /api/proactive/settings
 * Get proactive settings for a context
 */
router.get('/settings', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const settings = await proactiveSuggestionEngine.getSettings(context as AIContext);

  res.json({
    success: true,
    settings,
  });
}));

/**
 * PUT /api/proactive/settings
 * Update proactive settings
 */
router.put('/settings', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.body.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const { proactivityLevel, enabledTypes, quietHoursStart, quietHoursEnd, maxSuggestionsPerDay } = req.body;

  // Validate proactivityLevel
  if (proactivityLevel && !['aggressive', 'balanced', 'minimal', 'off'].includes(proactivityLevel)) {
    throw new ValidationError('Invalid proactivityLevel. Must be one of: aggressive, balanced, minimal, off');
  }

  // Validate enabledTypes
  const validTypes: SuggestionType[] = ['routine', 'connection', 'reminder', 'draft', 'follow_up', 'insight'];
  if (enabledTypes && !enabledTypes.every((t: string) => validTypes.includes(t as SuggestionType))) {
    throw new ValidationError(`Invalid enabledTypes. Must be array of: ${validTypes.join(', ')}`);
  }

  // Validate quiet hours
  if (quietHoursStart !== undefined && (quietHoursStart < 0 || quietHoursStart > 23)) {
    throw new ValidationError('quietHoursStart must be between 0 and 23');
  }
  if (quietHoursEnd !== undefined && (quietHoursEnd < 0 || quietHoursEnd > 23)) {
    throw new ValidationError('quietHoursEnd must be between 0 and 23');
  }

  await proactiveSuggestionEngine.updateSettings(context as AIContext, {
    proactivityLevel,
    enabledTypes,
    quietHoursStart,
    quietHoursEnd,
    maxSuggestionsPerDay,
  });

  // Get updated settings
  const settings = await proactiveSuggestionEngine.getSettings(context as AIContext);

  res.json({
    success: true,
    message: 'Settings updated',
    settings,
  });
}));

// ===========================================
// Statistics Endpoints
// ===========================================

/**
 * GET /api/proactive/stats
 * Get proactive system statistics
 */
router.get('/stats', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const patterns = await routineDetectionService.getPatterns(context as AIContext, { activeOnly: false });
  const activePatterns = patterns.filter(p => p.isActive);
  const highConfidencePatterns = patterns.filter(p => p.confidence >= 0.7);

  const avgConfidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;

  res.json({
    success: true,
    stats: {
      totalPatterns: patterns.length,
      activePatterns: activePatterns.length,
      highConfidencePatterns: highConfidencePatterns.length,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      patternsByType: {
        time_based: patterns.filter(p => p.patternType === 'time_based').length,
        sequence_based: patterns.filter(p => p.patternType === 'sequence_based').length,
        context_based: patterns.filter(p => p.patternType === 'context_based').length,
      },
    },
  });
}));

// ===========================================
// Workflow Boundary Endpoints (Phase 32C)
// ===========================================

const VALID_TRIGGERS: BoundaryTrigger[] = ['idea_saved', 'chat_session_end', 'login_after_absence', 'draft_completed'];

/**
 * POST /api/proactive/boundary
 * Process a workflow boundary event and get contextual suggestion.
 *
 * Body: { trigger: BoundaryTrigger, context: AIContext, params: {...} }
 */
router.post('/boundary', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { trigger, context, params } = req.body;

  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    throw new ValidationError(`Invalid trigger. Use one of: ${VALID_TRIGGERS.join(', ')}`);
  }

  if (!context || !isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  // Handle login_after_absence specially: convert timestamp to Date
  const processedParams = { ...params };
  if (trigger === 'login_after_absence' && processedParams.lastActiveAt) {
    processedParams.lastActiveAt = new Date(processedParams.lastActiveAt);
  }

  const suggestion = await processWorkflowBoundary(
    trigger as BoundaryTrigger,
    context as AIContext,
    processedParams || {}
  );

  res.json({
    success: true,
    suggestion, // null if no suggestion (frequency limits, quiet hours, etc.)
  });
}));

// ===========================================
// Digest Endpoints (Phase 37)
// ===========================================

/**
 * GET /api/proactive/digest/latest
 * Get the latest unviewed digest for a context
 */
router.get('/digest/latest', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const digest = await proactiveDigest.getLatestUnviewed(context as AIContext);

  res.json({
    success: true,
    digest, // null if no unviewed digest
  });
}));

/**
 * GET /api/proactive/digest/recent
 * Get recent digests
 */
router.get('/digest/recent', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const limit = toIntBounded(req.query.limit as string, 7, 1, 30);
  const digests = await proactiveDigest.getRecent(context as AIContext, limit);

  res.json({
    success: true,
    digests,
  });
}));

/**
 * POST /api/proactive/digest/:id/viewed
 * Mark a digest as viewed
 */
router.post('/digest/:id/viewed', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  await proactiveDigest.markViewed(context as AIContext, req.params.id);

  res.json({
    success: true,
    message: 'Digest marked as viewed',
  });
}));

export default router;
