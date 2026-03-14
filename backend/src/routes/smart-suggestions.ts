/**
 * Smart Suggestions API Routes (Phase 69.1)
 *
 * Surfaces AI proactive suggestions to the user.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import {
  getActiveSuggestions,
  dismissSuggestion,
  snoozeSuggestion,
  acceptSuggestion,
  type SnoozeDuration,
} from '../services/smart-suggestions';

export const smartSuggestionsRouter = Router();

const VALID_SNOOZE_DURATIONS: SnoozeDuration[] = ['1h', '4h', 'tomorrow'];

// ─── Get active suggestions ─────────────────────────────
smartSuggestionsRouter.get(
  '/:context/suggestions',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 3, 10);
    const suggestions = await getActiveSuggestions(context, userId, limit);
    res.json({ success: true, data: suggestions });
  })
);

// ─── Dismiss suggestion ─────────────────────────────────
smartSuggestionsRouter.post(
  '/:context/suggestions/:id/dismiss',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const dismissed = await dismissSuggestion(context, req.params.id, userId);
    if (!dismissed) { throw new NotFoundError('Suggestion not found'); }

    res.json({ success: true, message: 'Suggestion dismissed' });
  })
);

// ─── Snooze suggestion ──────────────────────────────────
smartSuggestionsRouter.post(
  '/:context/suggestions/:id/snooze',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const duration = req.body.duration as SnoozeDuration;
    if (!duration || !VALID_SNOOZE_DURATIONS.includes(duration)) {
      throw new ValidationError(`duration must be one of: ${VALID_SNOOZE_DURATIONS.join(', ')}`);
    }

    const snoozed = await snoozeSuggestion(context, req.params.id, userId, duration);
    if (!snoozed) { throw new NotFoundError('Suggestion not found'); }

    res.json({ success: true, message: `Suggestion snoozed for ${duration}` });
  })
);

// ─── Accept suggestion ──────────────────────────────────
smartSuggestionsRouter.post(
  '/:context/suggestions/:id/accept',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const accepted = await acceptSuggestion(context, req.params.id, userId);
    if (!accepted) { throw new NotFoundError('Suggestion not found'); }

    res.json({ success: true, message: 'Suggestion accepted' });
  })
);

// ─── SSE stream for real-time suggestions ───────────────
const sseClients = new Map<string, Set<Response>>();

export function notifySuggestionClients(context: AIContext, event: Record<string, unknown>): void {
  const clients = sseClients.get(context);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(event);
  for (const res of clients) {
    try { res.write(`data: ${data}\n\n`); } catch { clients.delete(res); }
  }
}

smartSuggestionsRouter.get(
  '/:context/suggestions/stream',
  apiKeyAuth,
  requireScope('read'),
  (req: Request, res: Response) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      res.status(400).json({ error: 'Invalid context' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseClients.has(context)) { sseClients.set(context, new Set()); }
    const clients = sseClients.get(context);
    if (clients) { clients.add(res); }

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    req.on('close', () => {
      sseClients.get(context)?.delete(res);
    });
  }
);
