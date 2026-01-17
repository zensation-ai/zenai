/**
 * Phase 25: Draft Management Routes
 *
 * API endpoints for managing proactively generated drafts.
 * Drafts are created automatically for tasks that involve writing.
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
} from '../services/draft-generation';

export const draftsRouter = Router();

// All routes require authentication
draftsRouter.use(apiKeyAuth);

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
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
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
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
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

    const draft = await generateProactiveDraft(trigger);

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
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
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
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
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
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
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
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    await markDraftViewed(draftId, context as AIContext);

    res.json({
      success: true,
      message: 'Draft marked as viewed',
    });
  })
);
