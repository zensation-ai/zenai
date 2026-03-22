/**
 * Phase 135: Calibration Tracking
 *
 * Tracks how well the system's confidence scores predict actual outcomes.
 * Uses binned calibration (reliability diagrams) and Expected Calibration
 * Error (ECE) to quantify over/under-confidence.
 *
 * A well-calibrated system means: when it says "80% confident", it is
 * correct ~80% of the time.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { AIContext } from '../../types/context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalibrationBin {
  binLower: number;
  binUpper: number;
  totalCount: number;
  positiveCount: number;
  actualRate: number;
  overconfidence: number;
}

export interface CalibrationReport {
  bins: CalibrationBin[];
  expectedCalibrationError: number;
  overconfidenceRate: number;
  isWellCalibrated: boolean;
}

// ---------------------------------------------------------------------------
// createBins
// ---------------------------------------------------------------------------

export function createBins(binCount: number = 5): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  const step = 1.0 / binCount;

  for (let i = 0; i < binCount; i++) {
    const binLower = parseFloat((i * step).toFixed(10));
    const binUpper = parseFloat(((i + 1) * step).toFixed(10));
    bins.push({
      binLower,
      binUpper,
      totalCount: 0,
      positiveCount: 0,
      actualRate: 0,
      overconfidence: 0,
    });
  }

  return bins;
}

// ---------------------------------------------------------------------------
// assignToBin
// ---------------------------------------------------------------------------

export function assignToBin(confidence: number, bins: CalibrationBin[]): number {
  if (bins.length === 0) {return 0;}

  // Clamp to [0, 1]
  const clamped = Math.max(0, Math.min(1, confidence));

  // Edge case: exactly 1.0 goes into the last bin
  if (clamped >= 1.0) {return bins.length - 1;}

  const step = 1.0 / bins.length;
  const index = Math.floor(clamped / step);

  // Safety clamp to valid range
  return Math.max(0, Math.min(bins.length - 1, index));
}

// ---------------------------------------------------------------------------
// updateBin
// ---------------------------------------------------------------------------

export function updateBin(bin: CalibrationBin, wasPositive: boolean): CalibrationBin {
  const totalCount = bin.totalCount + 1;
  const positiveCount = bin.positiveCount + (wasPositive ? 1 : 0);
  const actualRate = positiveCount / totalCount;
  const midpoint = (bin.binLower + bin.binUpper) / 2;
  const overconfidence = midpoint - actualRate;

  return {
    ...bin,
    totalCount,
    positiveCount,
    actualRate,
    overconfidence,
  };
}

// ---------------------------------------------------------------------------
// computeECE
// ---------------------------------------------------------------------------

export function computeECE(bins: CalibrationBin[]): number {
  const totalSamples = bins.reduce((sum, b) => sum + b.totalCount, 0);
  if (totalSamples === 0) {return 0;}

  let ece = 0;
  for (const bin of bins) {
    if (bin.totalCount === 0) {continue;}
    ece += Math.abs(bin.overconfidence) * (bin.totalCount / totalSamples);
  }

  return ece;
}

// ---------------------------------------------------------------------------
// generateCalibrationReport
// ---------------------------------------------------------------------------

export function generateCalibrationReport(bins: CalibrationBin[]): CalibrationReport {
  const ece = computeECE(bins);

  const nonEmptyBins = bins.filter((b) => b.totalCount > 0);
  const overconfidentBins = nonEmptyBins.filter((b) => b.overconfidence > 0);
  const overconfidenceRate =
    nonEmptyBins.length > 0 ? overconfidentBins.length / nonEmptyBins.length : 0;

  return {
    bins,
    expectedCalibrationError: ece,
    overconfidenceRate,
    isWellCalibrated: ece < 0.1,
  };
}

// ---------------------------------------------------------------------------
// recordCalibrationData
// ---------------------------------------------------------------------------

export async function recordCalibrationData(
  context: string,
  confidence: number,
  wasPositive: boolean,
): Promise<void> {
  try {
    await queryContext(
      context as AIContext,
      `INSERT INTO calibration_data (confidence, was_positive, created_at)
       VALUES ($1, $2, NOW())`,
      [confidence, wasPositive],
    );
    logger.debug('Calibration data recorded', { confidence, wasPositive });
  } catch (err) {
    // Fire-and-forget: log but do not throw
    logger.warn('Failed to record calibration data', { error: err });
  }
}

// ---------------------------------------------------------------------------
// loadCalibrationReport
// ---------------------------------------------------------------------------

export async function loadCalibrationReport(
  context: string,
  userId?: string,
): Promise<CalibrationReport> {
  try {
    const userClause = userId ? ' AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const result = await queryContext(
      context as AIContext,
      `SELECT confidence, was_positive FROM calibration_data WHERE 1=1${userClause} ORDER BY created_at DESC LIMIT 1000`,
      params,
    );

    const rows: Array<{ confidence: number; was_positive: boolean }> = result?.rows ?? [];

    if (rows.length === 0) {
      return generateCalibrationReport(createBins());
    }

    const bins = createBins();
    for (const row of rows) {
      const idx = assignToBin(row.confidence, bins);
      bins[idx] = updateBin(bins[idx], row.was_positive);
    }

    return generateCalibrationReport(bins);
  } catch (err) {
    logger.error('Failed to load calibration report', err instanceof Error ? err : new Error(String(err)));
    return generateCalibrationReport(createBins());
  }
}
