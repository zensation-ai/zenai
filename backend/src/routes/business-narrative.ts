/**
 * Business Narrative API Routes (Phase 96)
 *
 * Cross-context business intelligence narratives and custom KPIs.
 */

import { Router } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import { logger } from '../utils/logger';
import {
  generateDailyDigest,
  generateWeeklyReport,
  detectAllAnomalies,
  listKPIs,
  createKPI,
  updateKPI,
  deleteKPI,
  getTrends,
} from '../services/business-narrative';

export const businessNarrativeRouter = Router();

// ─── Daily Digest ────────────────────────────────
businessNarrativeRouter.get(
  '/:context/business-narrative/daily',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    try {
      const digest = await generateDailyDigest(context, userId);
      res.json({ success: true, data: digest });
    } catch (error) {
      logger.error('Geschäftsnarrative: Täglicher Digest fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Täglicher Geschäfts-Digest konnte nicht erstellt werden' });
    }
  })
);

// ─── Weekly Report ───────────────────────────────
businessNarrativeRouter.get(
  '/:context/business-narrative/weekly',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    try {
      const report = await generateWeeklyReport(context, userId);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Geschäftsnarrative: Wochenbericht fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Wochenbericht konnte nicht erstellt werden' });
    }
  })
);

// ─── Anomalies ───────────────────────────────────
businessNarrativeRouter.get(
  '/:context/business-narrative/anomalies',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    try {
      const anomalies = await detectAllAnomalies(context, userId);
      res.json({ success: true, data: anomalies });
    } catch (error) {
      logger.error('Geschäftsnarrative: Anomalie-Erkennung fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Anomalien konnten nicht erkannt werden' });
    }
  })
);

// ─── List KPIs ───────────────────────────────────
businessNarrativeRouter.get(
  '/:context/business-narrative/kpis',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    try {
      const kpis = await listKPIs(context, userId);
      res.json({ success: true, data: kpis });
    } catch (error) {
      logger.error('Geschäftsnarrative: KPI-Liste fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'KPIs konnten nicht geladen werden' });
    }
  })
);

// ─── Create KPI ──────────────────────────────────
businessNarrativeRouter.post(
  '/:context/business-narrative/kpis',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const { name, description, formula, targetValue, unit } = req.body;
    if (!name || !formula) { throw new ValidationError('name and formula are required'); }
    if (!formula.sources || !formula.aggregation) { throw new ValidationError('formula must include sources and aggregation'); }

    try {
      const kpi = await createKPI(context, userId, { name, description, formula, targetValue, unit });
      res.status(201).json({ success: true, data: kpi });
    } catch (error) {
      logger.error('Geschäftsnarrative: KPI-Erstellung fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'KPI konnte nicht erstellt werden' });
    }
  })
);

// ─── Update KPI ──────────────────────────────────
businessNarrativeRouter.put(
  '/:context/business-narrative/kpis/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    try {
      const updated = await updateKPI(context, userId, req.params.id, req.body);
      if (!updated) { throw new NotFoundError('KPI not found'); }

      res.json({ success: true, data: updated });
    } catch (error) {
      if (error instanceof NotFoundError) { throw error; }
      logger.error('Geschäftsnarrative: KPI-Aktualisierung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: req.params.id });
      res.status(500).json({ success: false, error: 'KPI konnte nicht aktualisiert werden' });
    }
  })
);

// ─── Delete KPI ──────────────────────────────────
businessNarrativeRouter.delete(
  '/:context/business-narrative/kpis/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    try {
      const deleted = await deleteKPI(context, userId, req.params.id);
      if (!deleted) { throw new NotFoundError('KPI not found'); }

      res.json({ success: true, message: 'KPI deleted' });
    } catch (error) {
      if (error instanceof NotFoundError) { throw error; }
      logger.error('Geschäftsnarrative: KPI-Löschung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: req.params.id });
      res.status(500).json({ success: false, error: 'KPI konnte nicht gelöscht werden' });
    }
  })
);

// ─── Trends ──────────────────────────────────────
businessNarrativeRouter.get(
  '/:context/business-narrative/trends',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    try {
      const days = Math.min(parseInt(req.query.days as string, 10) || 7, 30);
      const trends = await getTrends(context, userId, days);
      res.json({ success: true, data: trends });
    } catch (error) {
      logger.error('Geschäftsnarrative: Trend-Analyse fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Trends konnten nicht geladen werden' });
    }
  })
);
