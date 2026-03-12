/**
 * Phase 8: Unified Inbox Routes
 *
 * Aggregates all actionable items into a single inbox:
 * - Unread emails, due tasks, upcoming meetings
 * - Follow-up reminders, budget alerts, AI briefings
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { sendData, sendSuccess } from '../utils/response';
import { getUnifiedInbox, getUnifiedInboxCounts, InboxItemType } from '../services/unified-inbox';

export const unifiedInboxRouter = Router();

const VALID_TYPES: InboxItemType[] = [
  'email', 'task_due', 'meeting_soon', 'follow_up',
  'budget_alert', 'proactive_suggestion', 'briefing',
];

/**
 * GET /api/:context/inbox
 * Get unified inbox items
 *
 * Query params:
 * - types: comma-separated filter (e.g. "email,task_due")
 * - limit: max items (default 50, max 100)
 */
unifiedInboxRouter.get(
  '/:context/inbox',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const typesParam = req.query.types as string | undefined;
    let types: InboxItemType[] | undefined;

    if (typesParam) {
      types = typesParam.split(',').map(t => t.trim()) as InboxItemType[];
      for (const t of types) {
        if (!VALID_TYPES.includes(t)) {
          throw new ValidationError(`Invalid inbox type: "${t}". Use: ${VALID_TYPES.join(', ')}.`);
        }
      }
    }

    const parsedLimit = parseInt(req.query.limit as string, 10);
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await getUnifiedInbox(context as AIContext, { types, limit });

    sendData(res, result);
  })
);

/**
 * GET /api/:context/inbox/counts
 * Get just the counts per type (lightweight endpoint for badges)
 */
unifiedInboxRouter.get(
  '/:context/inbox/counts',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const result = await getUnifiedInboxCounts(context as AIContext);

    sendSuccess(res, { fields: { counts: result.counts, total: result.total } });
  })
);
