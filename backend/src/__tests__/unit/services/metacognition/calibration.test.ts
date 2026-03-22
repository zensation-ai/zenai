/**
 * Tests for Phase 135: Calibration Tracking
 *
 * TDD: Tests written before implementation.
 * Covers createBins, assignToBin, updateBin, computeECE,
 * generateCalibrationReport, recordCalibrationData, loadCalibrationReport.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  createBins,
  assignToBin,
  updateBin,
  computeECE,
  generateCalibrationReport,
  recordCalibrationData,
  loadCalibrationReport,
} from '../../../../services/metacognition/calibration';
import type {
  CalibrationBin,
  CalibrationReport,
} from '../../../../services/metacognition/calibration';
import { queryContext } from '../../../../utils/database-context';
import { logger } from '../../../../utils/logger';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// createBins
// ---------------------------------------------------------------------------

describe('createBins', () => {
  it('creates 5 bins by default', () => {
    const bins = createBins();
    expect(bins).toHaveLength(5);
  });

  it('creates bins with correct boundaries for default 5', () => {
    const bins = createBins();
    expect(bins[0].binLower).toBeCloseTo(0.0);
    expect(bins[0].binUpper).toBeCloseTo(0.2);
    expect(bins[1].binLower).toBeCloseTo(0.2);
    expect(bins[1].binUpper).toBeCloseTo(0.4);
    expect(bins[4].binLower).toBeCloseTo(0.8);
    expect(bins[4].binUpper).toBeCloseTo(1.0);
  });

  it('creates custom number of bins', () => {
    const bins = createBins(10);
    expect(bins).toHaveLength(10);
    expect(bins[0].binLower).toBeCloseTo(0.0);
    expect(bins[0].binUpper).toBeCloseTo(0.1);
    expect(bins[9].binUpper).toBeCloseTo(1.0);
  });

  it('each bin starts with zero counts', () => {
    const bins = createBins();
    for (const bin of bins) {
      expect(bin.totalCount).toBe(0);
      expect(bin.positiveCount).toBe(0);
      expect(bin.actualRate).toBe(0);
      expect(bin.overconfidence).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// assignToBin
// ---------------------------------------------------------------------------

describe('assignToBin', () => {
  const bins = createBins(); // 5 bins: 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0

  it('assigns 0.0 to bin 0', () => {
    expect(assignToBin(0.0, bins)).toBe(0);
  });

  it('assigns 0.1 to bin 0', () => {
    expect(assignToBin(0.1, bins)).toBe(0);
  });

  it('assigns 0.5 to bin 2', () => {
    expect(assignToBin(0.5, bins)).toBe(2);
  });

  it('assigns 0.99 to bin 4', () => {
    expect(assignToBin(0.99, bins)).toBe(4);
  });

  it('assigns 1.0 to the last bin', () => {
    expect(assignToBin(1.0, bins)).toBe(4);
  });

  it('clamps negative values to bin 0', () => {
    expect(assignToBin(-0.5, bins)).toBe(0);
  });

  it('clamps values above 1.0 to last bin', () => {
    expect(assignToBin(1.5, bins)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// updateBin
// ---------------------------------------------------------------------------

describe('updateBin', () => {
  it('increments totalCount and positiveCount on positive feedback', () => {
    const bin: CalibrationBin = {
      binLower: 0.8,
      binUpper: 1.0,
      totalCount: 0,
      positiveCount: 0,
      actualRate: 0,
      overconfidence: 0,
    };
    const updated = updateBin(bin, true);
    expect(updated.totalCount).toBe(1);
    expect(updated.positiveCount).toBe(1);
  });

  it('increments only totalCount on negative feedback', () => {
    const bin: CalibrationBin = {
      binLower: 0.8,
      binUpper: 1.0,
      totalCount: 0,
      positiveCount: 0,
      actualRate: 0,
      overconfidence: 0,
    };
    const updated = updateBin(bin, false);
    expect(updated.totalCount).toBe(1);
    expect(updated.positiveCount).toBe(0);
  });

  it('computes actualRate correctly', () => {
    const bin: CalibrationBin = {
      binLower: 0.6,
      binUpper: 0.8,
      totalCount: 3,
      positiveCount: 2,
      actualRate: 2 / 3,
      overconfidence: 0,
    };
    // Add positive: 3/4 = 0.75
    const updated = updateBin(bin, true);
    expect(updated.actualRate).toBeCloseTo(0.75);
  });

  it('computes overconfidence as midpoint - actualRate', () => {
    // Bin 0.8-1.0, midpoint = 0.9
    // After 5 total, 3 positive: actualRate = 0.6, overconfidence = 0.9 - 0.6 = 0.3
    const bin: CalibrationBin = {
      binLower: 0.8,
      binUpper: 1.0,
      totalCount: 4,
      positiveCount: 2,
      actualRate: 0.5,
      overconfidence: 0.4,
    };
    const updated = updateBin(bin, true);
    // 5 total, 3 positive → actualRate = 0.6, overconfidence = 0.9 - 0.6 = 0.3
    expect(updated.overconfidence).toBeCloseTo(0.3);
  });

  it('shows negative overconfidence when underconfident', () => {
    // Bin 0.0-0.2, midpoint = 0.1, actualRate high → underconfident
    const bin: CalibrationBin = {
      binLower: 0.0,
      binUpper: 0.2,
      totalCount: 4,
      positiveCount: 4,
      actualRate: 1.0,
      overconfidence: -0.9,
    };
    const updated = updateBin(bin, true);
    // 5 total, 5 positive → actualRate = 1.0, overconfidence = 0.1 - 1.0 = -0.9
    expect(updated.overconfidence).toBeCloseTo(-0.9);
  });
});

// ---------------------------------------------------------------------------
// computeECE
// ---------------------------------------------------------------------------

describe('computeECE', () => {
  it('returns 0 for perfectly calibrated bins', () => {
    // Bins where midpoint == actualRate → overconfidence = 0
    const bins = createBins();
    bins[0] = { ...bins[0], totalCount: 10, positiveCount: 1, actualRate: 0.1, overconfidence: 0 };
    bins[2] = { ...bins[2], totalCount: 10, positiveCount: 5, actualRate: 0.5, overconfidence: 0 };
    bins[4] = { ...bins[4], totalCount: 10, positiveCount: 9, actualRate: 0.9, overconfidence: 0 };
    expect(computeECE(bins)).toBeCloseTo(0);
  });

  it('returns positive ECE for overconfident bins', () => {
    const bins = createBins();
    // Bin 0.8-1.0: midpoint 0.9, actualRate 0.5 → overconfidence 0.4
    bins[4] = { ...bins[4], totalCount: 10, positiveCount: 5, actualRate: 0.5, overconfidence: 0.4 };
    const ece = computeECE(bins);
    // 0.4 * (10/10) = 0.4
    expect(ece).toBeCloseTo(0.4);
  });

  it('computes weighted average across bins', () => {
    const bins = createBins();
    // Bin 0: 20 samples, overconfidence 0.05
    bins[0] = { ...bins[0], totalCount: 20, positiveCount: 1, actualRate: 0.05, overconfidence: 0.05 };
    // Bin 4: 80 samples, overconfidence 0.1
    bins[4] = { ...bins[4], totalCount: 80, positiveCount: 72, actualRate: 0.9, overconfidence: 0.0 };
    // ECE = |0.05| * 20/100 + |0.0| * 80/100 = 0.01
    expect(computeECE(bins)).toBeCloseTo(0.01);
  });

  it('ignores empty bins', () => {
    const bins = createBins();
    // Only one bin populated
    bins[2] = { ...bins[2], totalCount: 10, positiveCount: 5, actualRate: 0.5, overconfidence: 0 };
    expect(computeECE(bins)).toBeCloseTo(0);
  });

  it('returns 0 for all-empty bins', () => {
    const bins = createBins();
    expect(computeECE(bins)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateCalibrationReport
// ---------------------------------------------------------------------------

describe('generateCalibrationReport', () => {
  it('marks well-calibrated when ECE < 0.1', () => {
    const bins = createBins();
    bins[2] = { ...bins[2], totalCount: 100, positiveCount: 50, actualRate: 0.5, overconfidence: 0 };
    const report = generateCalibrationReport(bins);
    expect(report.isWellCalibrated).toBe(true);
    expect(report.expectedCalibrationError).toBeCloseTo(0);
  });

  it('marks poorly calibrated when ECE >= 0.1', () => {
    const bins = createBins();
    bins[4] = { ...bins[4], totalCount: 100, positiveCount: 10, actualRate: 0.1, overconfidence: 0.8 };
    const report = generateCalibrationReport(bins);
    expect(report.isWellCalibrated).toBe(false);
    expect(report.expectedCalibrationError).toBeGreaterThanOrEqual(0.1);
  });

  it('computes overconfidenceRate as proportion of overconfident non-empty bins', () => {
    const bins = createBins();
    // 2 non-empty bins, 1 overconfident
    bins[0] = { ...bins[0], totalCount: 10, positiveCount: 1, actualRate: 0.1, overconfidence: 0 };
    bins[4] = { ...bins[4], totalCount: 10, positiveCount: 5, actualRate: 0.5, overconfidence: 0.4 };
    const report = generateCalibrationReport(bins);
    expect(report.overconfidenceRate).toBeCloseTo(0.5);
  });

  it('returns 0 overconfidenceRate for all-empty bins', () => {
    const bins = createBins();
    const report = generateCalibrationReport(bins);
    expect(report.overconfidenceRate).toBe(0);
  });

  it('includes all bins in report', () => {
    const bins = createBins();
    const report = generateCalibrationReport(bins);
    expect(report.bins).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// recordCalibrationData
// ---------------------------------------------------------------------------

describe('recordCalibrationData', () => {
  it('writes to database with correct parameters', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    await recordCalibrationData('personal', 0.85, true);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO calibration_data'),
      [0.85, true],
    );
  });

  it('does not throw on database error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB down'));
    await expect(recordCalibrationData('work', 0.5, false)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to record calibration data',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});

// ---------------------------------------------------------------------------
// loadCalibrationReport
// ---------------------------------------------------------------------------

describe('loadCalibrationReport', () => {
  it('returns full report from database rows', async () => {
    const rows = [
      { confidence: 0.9, was_positive: true },
      { confidence: 0.9, was_positive: true },
      { confidence: 0.9, was_positive: false },
      { confidence: 0.1, was_positive: false },
      { confidence: 0.1, was_positive: false },
    ];
    mockQueryContext.mockResolvedValueOnce({ rows } as any);

    const report = await loadCalibrationReport('personal');
    expect(report.bins).toHaveLength(5);
    // Bin 0 (0-0.2): 2 samples, 0 positive → actualRate 0
    expect(report.bins[0].totalCount).toBe(2);
    expect(report.bins[0].positiveCount).toBe(0);
    // Bin 4 (0.8-1.0): 3 samples, 2 positive → actualRate ~0.667
    expect(report.bins[4].totalCount).toBe(3);
    expect(report.bins[4].positiveCount).toBe(2);
    expect(report.expectedCalibrationError).toBeGreaterThan(0);
  });

  it('returns default report for empty data', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    const report = await loadCalibrationReport('personal');
    expect(report.isWellCalibrated).toBe(true);
    expect(report.expectedCalibrationError).toBe(0);
    expect(report.bins).toHaveLength(5);
  });

  it('returns default report on database error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
    const report = await loadCalibrationReport('personal');
    expect(report.isWellCalibrated).toBe(true);
    expect(report.expectedCalibrationError).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to load calibration report',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('passes userId to query when provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    await loadCalibrationReport('work', 'user-123');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'work',
      expect.stringContaining('user_id = $1'),
      ['user-123'],
    );
  });

  it('omits user filter when userId not provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    await loadCalibrationReport('personal');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.not.stringContaining('user_id'),
      [],
    );
  });
});
