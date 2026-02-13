/**
 * Phase 25: Draft Management Routes
 * Phase 5: Enhanced Feedback System
 *
 * API endpoints for managing proactively generated drafts.
 * Drafts are created automatically for tasks that involve writing.
 * Includes comprehensive feedback collection, analytics, and learning.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import {
  getDraftForIdea,
  generateProactiveDraft,
  markDraftViewed,
  saveDraftFeedback,
  discardDraft,
  listDrafts,
  DraftTrigger,
  // Phase 5: Enhanced feedback functions
  submitDetailedFeedback,
  recordDraftCopy,
  getFeedbackAnalytics,
  getPatternEffectiveness,
  getDraftsNeedingFeedback,
  getDraftFeedbackHistory,
  getLearningSuggestions,
  updateLearningSuggestion,
  quickFeedback,
  DetailedFeedback,
  detectDraftNeed,
} from '../services/draft-generation';
import { isClaudeAvailable } from '../services/claude';

export const draftsRouter = Router();

// All routes require authentication
draftsRouter.use(apiKeyAuth);

// ===========================================
// POST /api/:context/drafts/debug-detect
// Debug endpoint to test draft detection without generating
// ===========================================
draftsRouter.post(
  '/:context/drafts/debug-detect',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { text, type = 'task' } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    if (!text) {
      throw new ValidationError('text is required');
    }

    const claudeAvailable = isClaudeAvailable();
    const detection = await detectDraftNeed(text, type, context as AIContext);

    res.json({
      success: true,
      debug: {
        claudeAvailable,
        anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
        inputText: text,
        inputType: type,
        context,
      },
      detection: {
        detected: detection.detected,
        draftType: detection.draftType,
        confidence: detection.confidence,
        matchedPattern: detection.matchedPattern,
        extractedTopic: detection.extractedTopic,
        extractedRecipient: detection.extractedRecipient,
      },
    });
  })
);

// ===========================================
// GET /api/:context/ideas/:ideaId/draft
// Get draft for a specific idea
// ===========================================
draftsRouter.get(
  '/:context/ideas/:ideaId/draft',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, ideaId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const draft = await getDraftForIdea(ideaId, context as AIContext);

    if (!draft) {
      return res.json({
        success: true,
        draft: null,
        message: 'No draft available for this idea',
      });
    }

    // Mark as viewed if not already
    if (draft.status === 'ready') {
      await markDraftViewed(draft.id, context as AIContext);
    }

    res.json({
      success: true,
      draft: {
        id: draft.id,
        ideaId: draft.ideaId,
        draftType: draft.draftType,
        content: draft.content,
        wordCount: draft.wordCount,
        status: draft.status,
        generationTimeMs: draft.generationTimeMs,
      },
    });
  })
);

// ===========================================
// POST /api/:context/ideas/:ideaId/draft
// Generate draft on demand (if not exists or force regenerate)
// ===========================================
draftsRouter.post(
  '/:context/ideas/:ideaId/draft',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, ideaId } = req.params;
    const { forceRegenerate = false, title, summary, rawTranscript, keywords, type, category } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    // Check if draft already exists
    if (!forceRegenerate) {
      const existingDraft = await getDraftForIdea(ideaId, context as AIContext);
      if (existingDraft) {
        return res.json({
          success: true,
          draft: existingDraft,
          cached: true,
        });
      }
    }

    // Need idea details to generate
    if (!title) {
      throw new ValidationError('title is required to generate a draft');
    }

    const trigger: DraftTrigger = {
      ideaId,
      title,
      summary: summary || '',
      rawTranscript: rawTranscript || '',
      keywords: keywords || [],
      type: type || 'task',
      category: category || 'personal',
      context: context as AIContext,
    };

    // On-demand: User hat explizit geklickt → bei fehlender Detection Fallback verwenden
    const draft = await generateProactiveDraft(trigger, true);

    if (!draft) {
      return res.json({
        success: false,
        message: 'Draft generation not applicable for this idea',
      });
    }

    res.json({
      success: true,
      draft: {
        id: draft.id,
        ideaId: draft.ideaId,
        draftType: draft.draftType,
        content: draft.content,
        wordCount: draft.wordCount,
        status: draft.status,
        generationTimeMs: draft.generationTimeMs,
      },
      cached: false,
    });
  })
);

// ===========================================
// PUT /api/:context/drafts/:draftId/feedback
// Submit feedback for a draft
// ===========================================
draftsRouter.put(
  '/:context/drafts/:draftId/feedback',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, draftId } = req.params;
    const { rating, feedback, contentReusedPercent } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      throw new ValidationError('rating must be between 1 and 5');
    }

    await saveDraftFeedback(
      draftId,
      context as AIContext,
      rating,
      feedback,
      contentReusedPercent
    );

    logger.info('Draft feedback saved', { draftId, rating, contentReusedPercent });

    res.json({
      success: true,
      message: 'Feedback saved successfully',
    });
  })
);

// ===========================================
// DELETE /api/:context/drafts/:draftId
// Discard a draft
// ===========================================
draftsRouter.delete(
  '/:context/drafts/:draftId',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, draftId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    await discardDraft(draftId, context as AIContext);

    logger.info('Draft discarded', { draftId });

    res.json({
      success: true,
      message: 'Draft discarded',
    });
  })
);

// ===========================================
// GET /api/:context/drafts
// List all drafts
// ===========================================
draftsRouter.get(
  '/:context/drafts',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { status, limit = '20', offset = '0' } = req.query;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const drafts = await listDrafts(context as AIContext, {
      status: status as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({
      success: true,
      drafts: drafts.map(draft => ({
        id: draft.id,
        ideaId: draft.ideaId,
        draftType: draft.draftType,
        snippet: draft.content.substring(0, 150) + (draft.content.length > 150 ? '...' : ''),
        wordCount: draft.wordCount,
        status: draft.status,
      })),
      count: drafts.length,
    });
  })
);

// ===========================================
// PUT /api/:context/drafts/:draftId/viewed
// Mark draft as viewed
// ===========================================
draftsRouter.put(
  '/:context/drafts/:draftId/viewed',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, draftId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    await markDraftViewed(draftId, context as AIContext);

    res.json({
      success: true,
      message: 'Draft marked as viewed',
    });
  })
);

// ===========================================
// PHASE 5: Enhanced Feedback System Endpoints
// ===========================================

// ===========================================
// POST /api/:context/drafts/:draftId/feedback/detailed
// Submit comprehensive feedback with quality aspects, edit tracking, etc.
// ===========================================
draftsRouter.post(
  '/:context/drafts/:draftId/feedback/detailed',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, draftId } = req.params;
    const {
      rating,
      feedbackText,
      contentReusedPercent,
      editsDescription,
      editCategories,
      wasHelpful,
      wouldUseAgain,
      qualityAspects,
      finalWordCount,
      sessionDurationMs,
      feedbackSource,
    } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    if (!rating || rating < 1 || rating > 5) {
      throw new ValidationError('rating is required and must be between 1 and 5');
    }

    // Validate quality aspects if provided
    if (qualityAspects) {
      const validAspects = ['accuracy', 'tone', 'completeness', 'relevance', 'structure'];
      for (const [key, value] of Object.entries(qualityAspects)) {
        if (!validAspects.includes(key)) {
          throw new ValidationError(`Invalid quality aspect: ${key}`);
        }
        if (typeof value !== 'number' || value < 1 || value > 5) {
          throw new ValidationError(`Quality aspect ${key} must be between 1 and 5`);
        }
      }
    }

    // Validate edit categories if provided
    if (editCategories) {
      const validCategories = ['tone', 'length', 'content', 'structure', 'formatting', 'accuracy'];
      for (const cat of editCategories) {
        if (!validCategories.includes(cat)) {
          throw new ValidationError(`Invalid edit category: ${cat}`);
        }
      }
    }

    const feedback: DetailedFeedback = {
      rating,
      feedbackText,
      contentReusedPercent,
      editsDescription,
      editCategories,
      wasHelpful,
      wouldUseAgain,
      qualityAspects,
      finalWordCount,
      sessionDurationMs,
      feedbackSource,
    };

    const result = await submitDetailedFeedback(draftId, context as AIContext, feedback);

    if (!result.success) {
      throw new NotFoundError(result.message || 'Failed to submit feedback');
    }

    logger.info('Detailed draft feedback submitted', {
      draftId,
      feedbackId: result.feedbackId,
      rating,
      wasHelpful,
    });

    res.json({
      success: true,
      feedbackId: result.feedbackId,
      message: 'Detailed feedback submitted successfully',
    });
  })
);

// ===========================================
// POST /api/:context/drafts/:draftId/feedback/quick
// Quick thumbs up/down feedback
// ===========================================
draftsRouter.post(
  '/:context/drafts/:draftId/feedback/quick',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, draftId } = req.params;
    const { isPositive } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    if (typeof isPositive !== 'boolean') {
      throw new ValidationError('isPositive is required and must be a boolean');
    }

    const success = await quickFeedback(draftId, context as AIContext, isPositive);

    if (!success) {
      throw new NotFoundError('Failed to submit quick feedback');
    }

    logger.info('Quick draft feedback submitted', { draftId, isPositive });

    res.json({
      success: true,
      message: isPositive ? 'Thanks for the positive feedback!' : 'Thanks for the feedback, we\'ll work to improve',
    });
  })
);

// ===========================================
// POST /api/:context/drafts/:draftId/copied
// Record that a draft was copied
// ===========================================
draftsRouter.post(
  '/:context/drafts/:draftId/copied',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, draftId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    await recordDraftCopy(draftId, context as AIContext);

    res.json({
      success: true,
      message: 'Copy recorded',
    });
  })
);

// ===========================================
// GET /api/:context/drafts/:draftId/feedback/history
// Get feedback history for a draft
// ===========================================
draftsRouter.get(
  '/:context/drafts/:draftId/feedback/history',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, draftId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const history = await getDraftFeedbackHistory(draftId, context as AIContext);

    res.json({
      success: true,
      feedbackHistory: history,
      count: history.length,
    });
  })
);

// ===========================================
// GET /api/:context/drafts/analytics
// Get feedback analytics for the context
// ===========================================
draftsRouter.get(
  '/:context/drafts/analytics',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { days = '30' } = req.query;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const analytics = await getFeedbackAnalytics(
      context as AIContext,
      parseInt(days as string, 10)
    );

    res.json({
      success: true,
      analytics,
      period: {
        days: parseInt(days as string, 10),
      },
    });
  })
);

// ===========================================
// GET /api/:context/drafts/patterns/effectiveness
// Get pattern effectiveness data
// ===========================================
draftsRouter.get(
  '/:context/drafts/patterns/effectiveness',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const patterns = await getPatternEffectiveness(context as AIContext);

    // Group by performance tier for easier consumption
    const byTier = {
      excellent: patterns.filter(p => p.performanceTier === 'excellent'),
      good: patterns.filter(p => p.performanceTier === 'good'),
      average: patterns.filter(p => p.performanceTier === 'average'),
      needs_improvement: patterns.filter(p => p.performanceTier === 'needs_improvement'),
      new: patterns.filter(p => p.performanceTier === 'new'),
    };

    res.json({
      success: true,
      patterns,
      byTier,
      summary: {
        total: patterns.length,
        active: patterns.filter(p => p.isActive).length,
        avgRating: patterns.filter(p => p.avgRating).reduce((sum, p) => sum + (p.avgRating || 0), 0) /
          (patterns.filter(p => p.avgRating).length || 1),
      },
    });
  })
);

// ===========================================
// GET /api/:context/drafts/needing-feedback
// Get drafts that need feedback (used but not rated)
// ===========================================
draftsRouter.get(
  '/:context/drafts/needing-feedback',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { limit = '10' } = req.query;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const drafts = await getDraftsNeedingFeedback(
      context as AIContext,
      parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      drafts,
      count: drafts.length,
    });
  })
);

// ===========================================
// GET /api/:context/drafts/learning/suggestions
// Get learning suggestions for improvement
// ===========================================
draftsRouter.get(
  '/:context/drafts/learning/suggestions',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { status = 'pending' } = req.query;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const validStatuses = ['pending', 'applied', 'rejected', 'testing'];
    if (!validStatuses.includes(status as string)) {
      throw new ValidationError('status must be one of: pending, applied, rejected, testing');
    }

    const suggestions = await getLearningSuggestions(
      context as AIContext,
      status as 'pending' | 'applied' | 'rejected' | 'testing'
    );

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
    });
  })
);

// ===========================================
// PUT /api/:context/drafts/learning/suggestions/:suggestionId
// Apply or reject a learning suggestion
// ===========================================
draftsRouter.put(
  '/:context/drafts/learning/suggestions/:suggestionId',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, suggestionId } = req.params;
    const { action } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const validActions = ['applied', 'rejected', 'testing'];
    if (!validActions.includes(action)) {
      throw new ValidationError('action must be one of: applied, rejected, testing');
    }

    const success = await updateLearningSuggestion(
      suggestionId,
      context as AIContext,
      action as 'applied' | 'rejected' | 'testing'
    );

    if (!success) {
      throw new NotFoundError('Suggestion not found or could not be updated');
    }

    logger.info('Learning suggestion updated', { suggestionId, action });

    res.json({
      success: true,
      message: `Suggestion marked as ${action}`,
    });
  })
);
