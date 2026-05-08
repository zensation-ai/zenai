/**
 * App Feedback Route (Task 6 — Gap Abarbeitung)
 *
 * POST /api/feedback — Store in-app bug reports and feature requests.
 * Writes to public.app_feedback (not context-specific).
 */

import express, { Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import { queryPublic } from '../utils/database-context';
import { logger } from '../utils/logger';

export const appFeedbackRouter = express.Router();

type FeedbackCategory = 'bug' | 'feature' | 'question' | 'other';

const VALID_CATEGORIES: FeedbackCategory[] = ['bug', 'feature', 'question', 'other'];

appFeedbackRouter.post(
  '/feedback',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { category, title, description, url } = req.body as {
      category: FeedbackCategory;
      title: string;
      description: string;
      url?: string;
    };

    if (!category || !title || !description) {
      throw new ValidationError('category, title, and description are required');
    }

    if (!VALID_CATEGORIES.includes(category)) {
      throw new ValidationError(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    if (title.length > 200) throw new ValidationError('title must be <= 200 characters');
    if (description.length > 2000) throw new ValidationError('description must be <= 2000 characters');

    const userId = (req.user as { id?: string } | undefined)?.id ?? 'anonymous';

    // Store in database (public schema — not context-specific)
    await queryPublic(
      `INSERT INTO public.app_feedback (id, user_id, category, title, description, url, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
      [userId, category, title, description, url ?? null]
    ).catch(() => {
      // Table may not exist yet — log only, don't fail the request
      logger.warn('app_feedback table missing — skipping DB store');
    });

    logger.info('App feedback received', { userId, category, title: title.slice(0, 50) });

    res.json({ success: true });
  })
);
