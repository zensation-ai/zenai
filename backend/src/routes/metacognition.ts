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
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';
import { getRecentStates, recordEvaluation, buildMetacognitiveState } from '../services/metacognition/state-vector';
import { loadCalibrationReport, recordCalibrationData } from '../services/metacognition/calibration';
import { loadCapabilityProfile, recordInteraction } from '../services/metacognition/capability-model';
import { computeCognitiveHealth } from '../services/metacognition/cognitive-health';

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
  const ctx = context as AIContext;

  // Run all queries in parallel for speed
  const [calibration, capabilities, recentStates, hypothesesRes, gapsRes, curiosityRes, predAccRes] = await Promise.allSettled([
    loadCalibrationReport(context),
    loadCapabilityProfile(context),
    getRecentStates(context, 10),
    queryContext(ctx,
      `SELECT id, hypothesis as prediction, confidence, status, created_at
       FROM hypotheses WHERE status = 'pending'
       ORDER BY confidence DESC LIMIT 10`),
    queryContext(ctx,
      `SELECT topic as area,
        CASE WHEN gap_score > 0.7 THEN 'high' WHEN gap_score > 0.4 THEN 'medium' ELSE 'low' END as severity,
        suggested_action as description
       FROM knowledge_gaps WHERE status = 'active'
       ORDER BY gap_score DESC LIMIT 10`),
    queryContext(ctx,
      `SELECT topic, gap_score as interest_score, updated_at as last_explored
       FROM knowledge_gaps WHERE status = 'active'
       ORDER BY gap_score DESC LIMIT 5`),
    queryContext(ctx,
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE was_correct = true) as correct
       FROM prediction_history
       WHERE created_at > NOW() - INTERVAL '30 days'`),
  ]);

  // Extract values with fallbacks
  const cal = calibration.status === 'fulfilled' ? calibration.value : null;
  const cap = capabilities.status === 'fulfilled' ? capabilities.value : null;
  const states = recentStates.status === 'fulfilled' ? recentStates.value : [];

  // --- Calibration ---
  const ece = cal?.expectedCalibrationError ?? 0;
  const calibrationScore = Math.max(0, 1 - ece);
  const calWithBins = cal as { bins?: Array<{ totalCount?: number }> } | null;
  const sampleSize = calWithBins?.bins
    ? calWithBins.bins.reduce((sum: number, b) => sum + (b.totalCount ?? 0), 0)
    : 0;
  const calibrationData = {
    score: Math.round(calibrationScore * 100) / 100,
    trend: 'stable' as string,
    sample_size: sampleSize,
  };

  // --- Strengths from capability profile ---
  const strengths = cap
    ? Object.values(cap.domains).map((d) => ({
        domain: d.domain ?? 'unknown',
        confidence: d.avgConfidence ?? 0,
        evidence_count: d.factCount ?? 0,
      }))
    : [];

  // --- Predictions from hypotheses table ---
  const predictions = hypothesesRes.status === 'fulfilled'
    ? (hypothesesRes.value.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        prediction: r.prediction,
        confidence: parseFloat(r.confidence as string) || 0,
        status: r.status,
        created_at: r.created_at,
      }))
    : [];

  // --- Knowledge gaps ---
  const knowledgeGaps = gapsRes.status === 'fulfilled'
    ? (gapsRes.value.rows ?? []).map((r: Record<string, unknown>) => ({
        area: r.area,
        severity: r.severity,
        description: (r.description as string) ?? '',
      }))
    : [];

  // --- Curiosity from knowledge_gaps ---
  const curiosity = curiosityRes.status === 'fulfilled'
    ? (curiosityRes.value.rows ?? []).map((r: Record<string, unknown>) => ({
        topic: r.topic,
        interest_score: parseFloat(r.interest_score as string) || 0,
        last_explored: r.last_explored ?? null,
      }))
    : [];

  // --- Recent state averages ---
  const avgConfidence = states.length > 0
    ? states.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / states.length
    : 0;
  const avgCoherence = states.length > 0
    ? states.reduce((sum, s) => sum + (s.coherence ?? 0), 0) / states.length
    : 0;
  const avgCoverage = states.length > 0
    ? states.reduce((sum, s) => sum + (s.knowledgeCoverage ?? 0), 0) / states.length
    : 0;

  // --- Prediction accuracy for health score ---
  let predictionAccuracy = 0;
  if (predAccRes.status === 'fulfilled') {
    const total = parseInt(predAccRes.value.rows[0]?.total ?? '0');
    const correct = parseInt(predAccRes.value.rows[0]?.correct ?? '0');
    predictionAccuracy = total > 0 ? correct / total : 0;
  }

  // --- Health score ---
  const healthScore = computeCognitiveHealth({
    calibrationScore,
    coverageScore: avgCoverage,
    predictionAccuracy,
    feedbackPositivity: 0.5, // placeholder — would need feedback aggregation
    fsrsCurrency: 0.5, // placeholder — would need FSRS stats
  });

  res.json({
    success: true,
    data: {
      calibration: calibrationData,
      strengths,
      predictions,
      curiosity,
      knowledge_gaps: knowledgeGaps,
      confidence_score: Math.round(avgConfidence * 100) / 100,
      coherence_score: Math.round(avgCoherence * 100) / 100,
      coverage_score: Math.round(avgCoverage * 100) / 100,
      healthScore,
    },
  });
}));

export default router;
