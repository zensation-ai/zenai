/**
 * Unified AI Assistant Routes (Phase 91)
 *
 * REST API for the unified assistant overlay.
 */

import { Router } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import {
  processQuery,
  getSuggestionsForPage,
  recordInteraction,
  getInteractionHistory,
} from '../services/unified-assistant';

export const unifiedAssistantRouter = Router();

// ─── Process natural language query ─────────────────────
unifiedAssistantRouter.post(
  '/:context/assistant/query',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const { query, pageContext } = req.body as { query?: string; pageContext?: string };
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new ValidationError('Query is required');
    }

    const startTime = Date.now();
    const result = processQuery(query.trim());
    const responseTimeMs = Date.now() - startTime;

    // Fire-and-forget: record interaction
    recordInteraction(context, userId, {
      query: query.trim(),
      intent: result.intent,
      action: (result.actions[0] as unknown as Record<string, unknown>) ?? null,
      result: { actionCount: result.actions.length, confidence: result.confidence },
      pageContext: pageContext ?? null,
      responseTimeMs,
    }).catch(() => { /* swallow */ });

    res.json({
      success: true,
      data: {
        ...result,
        responseTimeMs,
      },
    });
  })
);

// ─── Get context-aware suggestions ──────────────────────
unifiedAssistantRouter.get(
  '/:context/assistant/suggestions',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const pageContext = (req.query.page as string) ?? 'dashboard';
    const suggestions = getSuggestionsForPage(pageContext);

    res.json({ success: true, data: suggestions });
  })
);

// ─── Execute a cross-feature action ─────────────────────
unifiedAssistantRouter.post(
  '/:context/assistant/execute',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const { actionId, params } = req.body as { actionId?: string; params?: Record<string, unknown> };
    if (!actionId || typeof actionId !== 'string') {
      throw new ValidationError('actionId is required');
    }

    // For now, cross-feature actions return instructions for the frontend to execute.
    // The actual execution happens client-side via navigation + state passing.
    const actionInstructions: Record<string, unknown> = {
      actionId,
      status: 'delegated',
      message: 'Action delegated to frontend for execution',
      params: params ?? {},
    };

    // Record the execution
    recordInteraction(context, userId, {
      query: `execute:${actionId}`,
      intent: 'action',
      action: { actionId, params },
      result: actionInstructions,
      pageContext: null,
      responseTimeMs: 0,
    }).catch(() => { /* swallow */ });

    res.json({ success: true, data: actionInstructions });
  })
);

// ─── Get recent assistant interactions ──────────────────
unifiedAssistantRouter.get(
  '/:context/assistant/history',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
    const history = await getInteractionHistory(context, userId, limit);

    res.json({ success: true, data: history });
  })
);
