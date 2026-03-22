/**
 * Phase 141: Cognitive Health Score
 *
 * Computes a single 0-100 health score from multiple cognitive subsystem metrics.
 */

export function computeCognitiveHealth(params: {
  calibrationScore: number;
  coverageScore: number;
  predictionAccuracy: number;
  feedbackPositivity: number;
  fsrsCurrency: number;
}): number {
  return Math.round(
    params.calibrationScore * 25 +
    params.coverageScore * 25 +
    params.fsrsCurrency * 20 +
    params.predictionAccuracy * 15 +
    params.feedbackPositivity * 15
  );
}
