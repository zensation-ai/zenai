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
import { toIntBounded } from '../utils/validation';
import {
  proactiveSuggestionEngine,
  SuggestionType,
} from '../services/proactive-suggestions';
import {
  routineDetectionService,
  UserAction,
} from '../services/routine-detection';

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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const actionTaken = req.body.actionTaken;

  await proactiveSuggestionEngine.recordFeedback(id, true, context as AIContext, { actionTaken });

  // Record the acceptance as a user action for learning
  await routineDetectionService.learnFromAction(context as AIContext, {
    actionType: 'suggestion_accepted',
    actionData: { suggestionId: id },
  });

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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const activeOnly = req.query.activeOnly !== 'false';
  const minConfidence = parseFloat(req.query.minConfidence as string) || 0;

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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const activeRoutines = await routineDetectionService.checkActiveRoutines(context as AIContext);

  res.json({
    success: true,
    activeRoutines,
    count: activeRoutines.length,
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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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

export default router;
