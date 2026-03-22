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

// ─── Aggregated Overview ─────────────────────────────────────────────────────

/** GET /api/:context/metacognition/overview — Single-call aggregated cognitive overview */
router.get('/:context/metacognition/overview', asyncHandler(async (req, res) => {
  const { context } = req.params;

  // Run all queries in parallel for speed
  const [calibration, capabilities, recentStates] = await Promise.allSettled([
    loadCalibrationReport(context),
    loadCapabilityProfile(context),
    getRecentStates(context, 10),
  ]);

  // Extract values with fallbacks
  const cal = calibration.status === 'fulfilled' ? calibration.value : null;
  const cap = capabilities.status === 'fulfilled' ? capabilities.value : null;
  const states = recentStates.status === 'fulfilled' ? recentStates.value : [];

  // Compute averages from recent states
  const avgConfidence = states.length > 0
    ? states.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / states.length
    : 0;
  const avgCoherence = states.length > 0
    ? states.reduce((sum, s) => sum + (s.coherence ?? 0), 0) / states.length
    : 0;
  const avgCoverage = states.length > 0
    ? states.reduce((sum, s) => sum + (s.knowledgeCoverage ?? 0), 0) / states.length
    : 0;

  // Load curiosity data (fire-and-forget, non-critical)
  let curiosity = { activeGaps: 0, pendingHypotheses: 0, recentGain: 0 };
  try {
    const { queryContext } = await import('../utils/database-context');
    const [gapsRes, hypoRes] = await Promise.allSettled([
      queryContext(context as 'personal' | 'work' | 'learning' | 'creative',
        "SELECT COUNT(*) as count FROM knowledge_gaps WHERE status = 'active'"),
      queryContext(context as 'personal' | 'work' | 'learning' | 'creative',
        "SELECT COUNT(*) as count FROM hypotheses WHERE status = 'pending'"),
    ]);
    curiosity = {
      activeGaps: gapsRes.status === 'fulfilled' ? parseInt(gapsRes.value.rows[0]?.count ?? '0') : 0,
      pendingHypotheses: hypoRes.status === 'fulfilled' ? parseInt(hypoRes.value.rows[0]?.count ?? '0') : 0,
      recentGain: 0, // Would need information_gain_events aggregation
    };
  } catch {
    // Non-critical, use defaults
  }

  // Load prediction accuracy (fire-and-forget, non-critical)
  let predictions = { accuracy: 0, totalPredictions: 0, recentTrend: 0 };
  try {
    const { queryContext } = await import('../utils/database-context');
    const predRes = await queryContext(
      context as 'personal' | 'work' | 'learning' | 'creative',
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE was_correct = true) as correct
       FROM prediction_history
       WHERE created_at > NOW() - INTERVAL '30 days'`,
    );
    const total = parseInt(predRes.rows[0]?.total ?? '0');
    const correct = parseInt(predRes.rows[0]?.correct ?? '0');
    predictions = {
      accuracy: total > 0 ? correct / total : 0,
      totalPredictions: total,
      recentTrend: 0,
    };
  } catch {
    // Non-critical, use defaults
  }

  res.json({
    success: true,
    data: {
      calibration: cal ? {
        ece: cal.expectedCalibrationError ?? 0,
        isWellCalibrated: cal.isWellCalibrated ?? true,
        overconfidenceRate: cal.overconfidenceRate ?? 0,
      } : { ece: 0, isWellCalibrated: true, overconfidenceRate: 0 },
      capabilities: cap ? {
        strengths: cap.strengths ?? [],
        weaknesses: cap.weaknesses ?? [],
        trend: cap.improvementTrend ?? 0,
      } : { strengths: [], weaknesses: [], trend: 0 },
      recentState: {
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        avgCoherence: Math.round(avgCoherence * 100) / 100,
        avgCoverage: Math.round(avgCoverage * 100) / 100,
      },
      curiosity,
      predictions: {
        accuracy: Math.round(predictions.accuracy * 100) / 100,
        totalPredictions: predictions.totalPredictions,
        recentTrend: predictions.recentTrend,
      },
    },
  });
}));

export default router;
