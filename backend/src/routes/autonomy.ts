/**
 * Autonomy API Routes
 *
 * Controls the 4-level autonomy dial for proactive AI decisions:
 * suggest → ask → act → auto
 */

import { Router } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import {
  getAllAutonomyLevels,
  getAutonomyLevel,
  setAutonomyLevel,
  isValidAutonomyLevel,
} from '../services/autonomy-config';
import { getEventHistory } from '../services/event-system';

export const autonomyRouter = Router();

const VALID_ACTION_TYPES = ['notify', 'prepare_context', 'take_action', 'trigger_agent'] as const;

// ─── Get current autonomy levels ─────────────────────────
autonomyRouter.get(
  '/:context/autonomy/levels',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const levels = getAllAutonomyLevels(context);
    res.json({ success: true, data: levels });
  })
);

// ─── Update autonomy level ──────────────────────────────
autonomyRouter.put(
  '/:context/autonomy/levels',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const { actionType, level } = req.body;

    if (!actionType || typeof actionType !== 'string') {
      throw new ValidationError('actionType is required');
    }
    if (!VALID_ACTION_TYPES.includes(actionType as typeof VALID_ACTION_TYPES[number])) {
      throw new ValidationError(`actionType must be one of: ${VALID_ACTION_TYPES.join(', ')}`);
    }
    if (!level || !isValidAutonomyLevel(level)) {
      throw new ValidationError('level must be one of: suggest, ask, act, auto');
    }

    setAutonomyLevel(actionType, level, context);

    const updated = getAutonomyLevel(actionType, context);
    res.json({
      success: true,
      data: { actionType, level: updated, context },
    });
  })
);

// ─── Get recent autonomous actions ──────────────────────
autonomyRouter.get(
  '/:context/autonomy/history',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    // Query events related to autonomous/proactive actions
    const result = await getEventHistory(context, {
      eventType: req.query.eventType as string | undefined,
      limit,
      offset,
    });

    // Filter to proactive action events if no specific type requested
    const filtered = req.query.eventType
      ? result.events
      : result.events.filter(e =>
          e.eventType.startsWith('proactive.') ||
          e.decision === 'trigger_agent' ||
          e.decision === 'take_action'
        );

    res.json({
      success: true,
      data: filtered,
      total: filtered.length,
    });
  })
);
