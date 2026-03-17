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
import { logger } from '../utils/logger';
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

    try {
      const profile = await getProfile(context, userId);
      res.json({ success: true, data: profile });
    } catch (error) {
      logger.error('Digital Twin: Profil-Abruf fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Digital-Twin-Profil konnte nicht geladen werden' });
    }
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

    try {
      const entry = await upsertProfileSection(
        context, userId, section as ProfileSection, data, 'user_correction', 1.0,
      );
      res.json({ success: true, data: entry });
    } catch (error) {
      logger.error('Digital Twin: Profil-Aktualisierung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: section });
      res.status(500).json({ success: false, error: 'Profilsektion konnte nicht aktualisiert werden' });
    }
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

    try {
      const radar = await getRadarScores(context, userId);
      res.json({ success: true, data: radar });
    } catch (error) {
      logger.error('Digital Twin: Radar-Scores fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Radar-Scores konnten nicht berechnet werden' });
    }
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

    try {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 12, 52);
      const snapshots = await getEvolution(context, userId, limit);
      res.json({ success: true, data: snapshots });
    } catch (error) {
      logger.error('Digital Twin: Evolutionsverlauf fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Evolutionsverlauf konnte nicht geladen werden' });
    }
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

    try {
      const correction = await submitCorrection(
        context, userId, section as ProfileSection, corrected_value, reason,
      );
      res.json({ success: true, data: correction });
    } catch (error) {
      logger.error('Digital Twin: Korrektur fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: section });
      res.status(500).json({ success: false, error: 'Korrektur konnte nicht gespeichert werden' });
    }
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

    try {
      const exported = await exportProfile(context, userId);
      res.json({ success: true, data: exported });
    } catch (error) {
      logger.error('Digital Twin: Export fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Profil-Export konnte nicht erstellt werden' });
    }
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

    try {
      const sections = await aggregateProfile(context, userId);
      const snapshot = await createSnapshot(context, userId);

      res.json({
        success: true,
        data: {
          sections_updated: sections.length,
          snapshot_id: snapshot.id,
        },
      });
    } catch (error) {
      logger.error('Digital Twin: Profil-Refresh fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Profil konnte nicht aktualisiert werden' });
    }
  }),
);
