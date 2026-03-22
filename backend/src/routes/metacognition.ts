/**
 * Metacognition API Routes (Phase 135-136)
 *
 * Endpoints for metacognitive state, calibration reports,
 * and capability profiles.
 *
 * @module routes/metacognition
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { getRecentStates, recordEvaluation, buildMetacognitiveState } from '../services/metacognition/state-vector';
import { loadCalibrationReport, recordCalibrationData } from '../services/metacognition/calibration';
import { loadCapabilityProfile, recordInteraction } from '../services/metacognition/capability-model';

const router = Router();

// ─── Metacognitive State ─────────────────────────────────────────────────────

/** GET /api/:context/metacognition/states — Recent metacognitive state snapshots */
router.get('/:context/metacognition/states', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;
  const states = await getRecentStates(context, limit);
  res.json({ success: true, data: states });
}));

/** POST /api/:context/metacognition/evaluate — Record evaluation for a response */
router.post('/:context/metacognition/evaluate', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const { confidence, coherence, conflictLevel, knowledgeCoverage, query, domain } = req.body;

  const state = buildMetacognitiveState({
    confidence: confidence ?? 0.5,
    coherence: coherence ?? 0.5,
    conflictLevel: conflictLevel ?? 0,
    knowledgeCoverage: knowledgeCoverage ?? 0.5,
  });

  await recordEvaluation(context, state, query || '', domain || 'general');
  res.json({ success: true, data: state });
}));

// ─── Calibration ─────────────────────────────────────────────────────────────

/** GET /api/:context/metacognition/calibration — Get calibration report */
router.get('/:context/metacognition/calibration', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const report = await loadCalibrationReport(context);
  res.json({ success: true, data: report });
}));

/** POST /api/:context/metacognition/calibration/record — Record calibration data point */
router.post('/:context/metacognition/calibration/record', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const { confidence, wasPositive } = req.body;

  await recordCalibrationData(context, confidence ?? 0.5, wasPositive ?? true);
  res.json({ success: true });
}));

// ─── Capability Profile ──────────────────────────────────────────────────────

/** GET /api/:context/metacognition/capabilities — Get capability profile */
router.get('/:context/metacognition/capabilities', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const profile = await loadCapabilityProfile(context);
  res.json({ success: true, data: profile });
}));

/** POST /api/:context/metacognition/interaction — Record interaction for capability tracking */
router.post('/:context/metacognition/interaction', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const { domain, wasPositive, quality } = req.body;

  await recordInteraction(context, domain || 'general', wasPositive ?? true, quality);
  res.json({ success: true });
}));

export default router;
