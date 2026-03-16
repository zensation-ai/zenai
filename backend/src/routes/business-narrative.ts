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

    const digest = await generateDailyDigest(context, userId);
    res.json({ success: true, data: digest });
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

    const report = await generateWeeklyReport(context, userId);
    res.json({ success: true, data: report });
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

    const anomalies = await detectAllAnomalies(context, userId);
    res.json({ success: true, data: anomalies });
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

    const kpis = await listKPIs(context, userId);
    res.json({ success: true, data: kpis });
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

    const kpi = await createKPI(context, userId, { name, description, formula, targetValue, unit });
    res.status(201).json({ success: true, data: kpi });
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

    const updated = await updateKPI(context, userId, req.params.id, req.body);
    if (!updated) { throw new NotFoundError('KPI not found'); }

    res.json({ success: true, data: updated });
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

    const deleted = await deleteKPI(context, userId, req.params.id);
    if (!deleted) { throw new NotFoundError('KPI not found'); }

    res.json({ success: true, message: 'KPI deleted' });
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

    const days = Math.min(parseInt(req.query.days as string, 10) || 7, 30);
    const trends = await getTrends(context, userId, days);
    res.json({ success: true, data: trends });
  })
);
