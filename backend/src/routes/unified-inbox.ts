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
import { getUserId } from '../utils/user-context';
import { getUnifiedInbox, getUnifiedInboxCounts, InboxItemType, InboxItem } from '../services/unified-inbox';
import { decodeCursor, encodeCursor } from '../utils/cursor-pagination';

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
    getUserId(req); // auth check - userId passed to DB via request context

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "operations", "finance", "people", or "strategy".');
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

    const cursorParam = req.query.cursor as string | undefined;

    if (cursorParam) {
      // Cursor mode: fetch all items and apply cursor filtering in-memory
      // (unified inbox aggregates from multiple sources, so cursor is applied post-aggregation)
      const decoded = decodeCursor(cursorParam);

      // Fetch enough items to satisfy pagination (fetch more to account for cursor filtering)
      const fetchLimit = limit + 1;
      const result = await getUnifiedInbox(context as AIContext, { types, limit: 1000 });

      // Apply cursor filter: keep items that come after the cursor position
      // Items are sorted by priority then timestamp DESC — cursor tracks timestamp + id
      let items: InboxItem[] = result.items;
      if (decoded) {
        const cursorTime = new Date(decoded.t).getTime();
        const cursorId = decoded.i;
        // Find the position after the cursor item in the sorted list
        const cursorIdx = items.findIndex(
          item => item.id === cursorId && item.timestamp === decoded.t
        );
        if (cursorIdx !== -1) {
          items = items.slice(cursorIdx + 1);
        } else {
          // Fallback: keep only items with timestamp strictly less than cursor
          items = items.filter(item => {
            const itemTime = new Date(item.timestamp).getTime();
            if (itemTime < cursorTime) return true;
            if (itemTime === cursorTime && item.id < cursorId) return true;
            return false;
          });
        }
      }

      const hasMore = items.length > limit;
      const pageItems = hasMore ? items.slice(0, limit) : items;

      let nextCursor: string | null = null;
      if (hasMore && pageItems.length > 0) {
        const last = pageItems[pageItems.length - 1];
        nextCursor = encodeCursor(last.timestamp, last.id);
      }

      sendData(res, {
        items: pageItems,
        counts: result.counts,
        total: result.total,
        generated_at: result.generated_at,
        nextCursor,
        hasMore,
      });
    } else {
      // Offset mode (legacy): pass limit directly to service
      const result = await getUnifiedInbox(context as AIContext, { types, limit });
      sendData(res, result);
    }
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
    getUserId(req); // auth check - userId passed to DB via request context

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "operations", "finance", "people", or "strategy".');
    }

    const result = await getUnifiedInboxCounts(context as AIContext);

    sendSuccess(res, { fields: { counts: result.counts, total: result.total } });
  })
);
