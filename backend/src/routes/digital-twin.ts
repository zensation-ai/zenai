/**
 * Phase 92: Digital Twin Profile API Routes
 *
 * REST endpoints for the Digital Twin profile dashboard.
 */

import { Router } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import {
  getProfile,
  upsertProfileSection,
  getRadarScores,
  getEvolution,
  createSnapshot,
  submitCorrection,
  aggregateProfile,
  exportProfile,
  isValidSection,
  type ProfileSection,
} from '../services/digital-twin';

export const digitalTwinRouter = Router();

// ─── GET /api/:context/digital-twin/profile ─────────────
digitalTwinRouter.get(
  '/:context/digital-twin/profile',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }
    const userId = getUserId(req);

    const profile = await getProfile(context, userId);
    res.json({ success: true, data: profile });
  }),
);

// ─── PUT /api/:context/digital-twin/profile ─────────────
digitalTwinRouter.put(
  '/:context/digital-twin/profile',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }
    const userId = getUserId(req);

    const { section, data } = req.body;
    if (!section || !isValidSection(section)) {
      throw new ValidationError('Invalid or missing section. Valid: personality, expertise, work_patterns, interests, goals, preferences');
    }
    if (!data || typeof data !== 'object') {
      throw new ValidationError('data must be a JSON object');
    }

    const entry = await upsertProfileSection(
      context, userId, section as ProfileSection, data, 'user_correction', 1.0,
    );
    res.json({ success: true, data: entry });
  }),
);

// ─── GET /api/:context/digital-twin/radar ───────────────
digitalTwinRouter.get(
  '/:context/digital-twin/radar',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }
    const userId = getUserId(req);

    const radar = await getRadarScores(context, userId);
    res.json({ success: true, data: radar });
  }),
);

// ─── GET /api/:context/digital-twin/evolution ───────────
digitalTwinRouter.get(
  '/:context/digital-twin/evolution',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }
    const userId = getUserId(req);

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 12, 52);
    const snapshots = await getEvolution(context, userId, limit);
    res.json({ success: true, data: snapshots });
  }),
);

// ─── POST /api/:context/digital-twin/correction ────────
digitalTwinRouter.post(
  '/:context/digital-twin/correction',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }
    const userId = getUserId(req);

    const { section, corrected_value, reason } = req.body;
    if (!section || !isValidSection(section)) {
      throw new ValidationError('Invalid or missing section');
    }
    if (!corrected_value || typeof corrected_value !== 'object') {
      throw new ValidationError('corrected_value must be a JSON object');
    }

    const correction = await submitCorrection(
      context, userId, section as ProfileSection, corrected_value, reason,
    );
    res.json({ success: true, data: correction });
  }),
);

// ─── GET /api/:context/digital-twin/export ──────────────
digitalTwinRouter.get(
  '/:context/digital-twin/export',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }
    const userId = getUserId(req);

    const exported = await exportProfile(context, userId);
    res.json({ success: true, data: exported });
  }),
);

// ─── POST /api/:context/digital-twin/refresh ────────────
digitalTwinRouter.post(
  '/:context/digital-twin/refresh',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }
    const userId = getUserId(req);

    const sections = await aggregateProfile(context, userId);
    const snapshot = await createSnapshot(context, userId);

    res.json({
      success: true,
      data: {
        sections_updated: sections.length,
        snapshot_id: snapshot.id,
      },
    });
  }),
);
