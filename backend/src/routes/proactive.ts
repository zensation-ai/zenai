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
import { AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
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
router.get('/suggestions', apiKeyAuth, requireScope('read'), async (req: Request, res: Response) => {
  try {
    const context = (req.query.context as AIContext) || 'personal';
    const limit = parseInt(req.query.limit as string) || 5;
    const types = req.query.types
      ? (req.query.types as string).split(',') as SuggestionType[]
      : undefined;

    const suggestions = await proactiveSuggestionEngine.getSuggestions(context, {
      limit,
      types,
    });

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
      hasMore: suggestions.length === limit,
    });
  } catch (error) {
    logger.error('Failed to get suggestions', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestions',
    });
  }
});

/**
 * POST /api/proactive/suggestions/:id/accept
 * Accept a suggestion and optionally execute its action
 */
router.post('/suggestions/:id/accept', apiKeyAuth, requireScope('write'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const context = (req.body.context as AIContext) || 'personal';
    const actionTaken = req.body.actionTaken;

    await proactiveSuggestionEngine.recordFeedback(id, true, context, { actionTaken });

    // Record the acceptance as a user action for learning
    await routineDetectionService.learnFromAction(context, {
      actionType: 'suggestion_accepted',
      actionData: { suggestionId: id },
    });

    res.json({
      success: true,
      message: 'Suggestion accepted',
    });
  } catch (error) {
    logger.error('Failed to accept suggestion', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to accept suggestion',
    });
  }
});

/**
 * POST /api/proactive/suggestions/:id/dismiss
 * Dismiss a suggestion with optional reason
 */
router.post('/suggestions/:id/dismiss', apiKeyAuth, requireScope('write'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const context = (req.body.context as AIContext) || 'personal';
    const reason = req.body.reason;

    await proactiveSuggestionEngine.recordFeedback(id, false, context, {
      dismissReason: reason,
    });

    res.json({
      success: true,
      message: 'Suggestion dismissed',
    });
  } catch (error) {
    logger.error('Failed to dismiss suggestion', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to dismiss suggestion',
    });
  }
});

// ===========================================
// Routines Endpoints
// ===========================================

/**
 * GET /api/proactive/routines
 * Get all detected routines for the user
 */
router.get('/routines', apiKeyAuth, requireScope('read'), async (req: Request, res: Response) => {
  try {
    const context = (req.query.context as AIContext) || 'personal';
    const activeOnly = req.query.activeOnly !== 'false';
    const minConfidence = parseFloat(req.query.minConfidence as string) || 0;

    const patterns = await routineDetectionService.getPatterns(context, {
      activeOnly,
      minConfidence,
    });

    res.json({
      success: true,
      routines: patterns,
      count: patterns.length,
    });
  } catch (error) {
    logger.error('Failed to get routines', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to get routines',
    });
  }
});

/**
 * POST /api/proactive/routines/analyze
 * Trigger routine analysis for the user
 */
router.post('/routines/analyze', apiKeyAuth, requireScope('write'), async (req: Request, res: Response) => {
  try {
    const context = (req.body.context as AIContext) || 'personal';
    const days = parseInt(req.body.days as string) || 30;

    const patterns = await routineDetectionService.analyzeUserPatterns(context, days);

    res.json({
      success: true,
      message: 'Routine analysis complete',
      patternsFound: patterns.length,
      patterns,
    });
  } catch (error) {
    logger.error('Failed to analyze routines', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze routines',
    });
  }
});

/**
 * GET /api/proactive/routines/active
 * Get currently active routines that should trigger
 */
router.get('/routines/active', apiKeyAuth, requireScope('read'), async (req: Request, res: Response) => {
  try {
    const context = (req.query.context as AIContext) || 'personal';

    const activeRoutines = await routineDetectionService.checkActiveRoutines(context);

    res.json({
      success: true,
      activeRoutines,
      count: activeRoutines.length,
    });
  } catch (error) {
    logger.error('Failed to get active routines', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to get active routines',
    });
  }
});

// ===========================================
// Action Recording Endpoint
// ===========================================

/**
 * POST /api/proactive/actions
 * Record a user action for routine learning
 */
router.post('/actions', apiKeyAuth, requireScope('write'), async (req: Request, res: Response) => {
  try {
    const context = (req.body.context as AIContext) || 'personal';
    const action: UserAction = {
      actionType: req.body.actionType,
      actionData: req.body.actionData || {},
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
    };

    if (!action.actionType) {
      return res.status(400).json({
        success: false,
        error: 'actionType is required',
      });
    }

    await routineDetectionService.learnFromAction(context, action);

    res.json({
      success: true,
      message: 'Action recorded',
    });
  } catch (error) {
    logger.error('Failed to record action', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to record action',
    });
  }
});

// ===========================================
// Settings Endpoints
// ===========================================

/**
 * GET /api/proactive/settings
 * Get proactive settings for a context
 */
router.get('/settings', apiKeyAuth, requireScope('read'), async (req: Request, res: Response) => {
  try {
    const context = (req.query.context as AIContext) || 'personal';

    const settings = await proactiveSuggestionEngine.getSettings(context);

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    logger.error('Failed to get settings', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to get settings',
    });
  }
});

/**
 * PUT /api/proactive/settings
 * Update proactive settings
 */
router.put('/settings', apiKeyAuth, requireScope('write'), async (req: Request, res: Response) => {
  try {
    const context = (req.body.context as AIContext) || 'personal';
    const { proactivityLevel, enabledTypes, quietHoursStart, quietHoursEnd, maxSuggestionsPerDay } = req.body;

    // Validate proactivityLevel
    if (proactivityLevel && !['aggressive', 'balanced', 'minimal', 'off'].includes(proactivityLevel)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid proactivityLevel. Must be one of: aggressive, balanced, minimal, off',
      });
    }

    // Validate enabledTypes
    const validTypes: SuggestionType[] = ['routine', 'connection', 'reminder', 'draft', 'follow_up', 'insight'];
    if (enabledTypes && !enabledTypes.every((t: string) => validTypes.includes(t as SuggestionType))) {
      return res.status(400).json({
        success: false,
        error: `Invalid enabledTypes. Must be array of: ${validTypes.join(', ')}`,
      });
    }

    // Validate quiet hours
    if (quietHoursStart !== undefined && (quietHoursStart < 0 || quietHoursStart > 23)) {
      return res.status(400).json({
        success: false,
        error: 'quietHoursStart must be between 0 and 23',
      });
    }
    if (quietHoursEnd !== undefined && (quietHoursEnd < 0 || quietHoursEnd > 23)) {
      return res.status(400).json({
        success: false,
        error: 'quietHoursEnd must be between 0 and 23',
      });
    }

    await proactiveSuggestionEngine.updateSettings(context, {
      proactivityLevel,
      enabledTypes,
      quietHoursStart,
      quietHoursEnd,
      maxSuggestionsPerDay,
    });

    // Get updated settings
    const settings = await proactiveSuggestionEngine.getSettings(context);

    res.json({
      success: true,
      message: 'Settings updated',
      settings,
    });
  } catch (error) {
    logger.error('Failed to update settings', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
    });
  }
});

// ===========================================
// Statistics Endpoints
// ===========================================

/**
 * GET /api/proactive/stats
 * Get proactive system statistics
 */
router.get('/stats', apiKeyAuth, requireScope('read'), async (req: Request, res: Response) => {
  try {
    const context = (req.query.context as AIContext) || 'personal';

    const patterns = await routineDetectionService.getPatterns(context, { activeOnly: false });
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
  } catch (error) {
    logger.error('Failed to get stats', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    });
  }
});

export default router;
