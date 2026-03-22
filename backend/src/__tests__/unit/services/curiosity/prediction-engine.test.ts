/**
 * Tests for Phase 134: Prediction Engine
 *
 * TDD: Tests written before implementation.
 * Covers predictNextIntent, computePredictionError,
 * updateModel, makePrediction, and recordPredictionResult.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  predictNextIntent,
  computePredictionError,
  updateModel,
  makePrediction,
  recordPredictionResult,
} from '../../../../services/curiosity/prediction-engine';
import type {
  UserPrediction,
  PredictionError,
  QueryAnalysis,
} from '../../../../services/curiosity/prediction-engine';
import type { TemporalPattern, SequentialPattern } from '../../../../services/curiosity/pattern-tracker';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// predictNextIntent
// ---------------------------------------------------------------------------

describe('predictNextIntent', () => {
  const temporalPatterns: TemporalPattern[] = [
    { timeOfDay: 9, dayOfWeek: 1, domain: 'work', intent: 'search', frequency: 10 },
    { timeOfDay: 14, dayOfWeek: 3, domain: 'personal', intent: 'browse', frequency: 8 },
    { timeOfDay: 20, dayOfWeek: 5, domain: 'learning', intent: 'study', frequency: 12 },
  ];

  const sequentialPatterns: SequentialPattern[] = [
    { fromIntent: 'search', toIntent: 'create', count: 5, probability: 0.8 },
    { fromIntent: 'search', toIntent: 'read', count: 2, probability: 0.2 },
    { fromIntent: 'create', toIntent: 'review', count: 3, probability: 0.6 },
  ];

  it('uses temporal pattern when it matches current time', () => {
    const result = predictNextIntent(temporalPatterns, [], 9, 1);
    expect(result.predictedIntent).toBe('search');
    expect(result.predictedDomain).toBe('work');
    expect(result.basis.some((b) => b.includes('temporal'))).toBe(true);
  });

  it('uses sequential pattern when lastIntent is provided', () => {
    const result = predictNextIntent([], sequentialPatterns, 12, 2, 'search');
    expect(result.predictedIntent).toBe('create');
    expect(result.basis.some((b) => b.includes('sequential'))).toBe(true);
  });

  it('combines temporal and sequential signals', () => {
    const result = predictNextIntent(temporalPatterns, sequentialPatterns, 9, 1, 'search');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.basis.length).toBeGreaterThanOrEqual(2);
  });

  it('returns low confidence when no patterns match', () => {
    const result = predictNextIntent([], [], 3, 4);
    expect(result.confidence).toBeLessThanOrEqual(0.15);
    expect(result.predictedIntent).toBe('general');
    expect(result.predictedDomain).toBe('personal');
  });

  it('returns generic fallback with no_pattern_match basis when empty', () => {
    const result = predictNextIntent([], [], 3, 4);
    expect(result.basis).toContain('no_pattern_match');
  });

  it('includes recency signal when lastIntent is provided', () => {
    const result = predictNextIntent([], [], 12, 2, 'search');
    expect(result.basis.some((b) => b.includes('recency'))).toBe(true);
  });

  it('returns higher confidence for strong temporal match', () => {
    const strongPatterns: TemporalPattern[] = [
      { timeOfDay: 9, dayOfWeek: 1, domain: 'work', intent: 'search', frequency: 20 },
    ];
    const result = predictNextIntent(strongPatterns, sequentialPatterns, 9, 1, 'search');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('confidence is capped at 1.0', () => {
    const strongPatterns: TemporalPattern[] = [
      { timeOfDay: 9, dayOfWeek: 1, domain: 'work', intent: 'search', frequency: 100 },
    ];
    const strongSeq: SequentialPattern[] = [
      { fromIntent: 'search', toIntent: 'search', count: 50, probability: 1.0 },
    ];
    const result = predictNextIntent(strongPatterns, strongSeq, 9, 1, 'search');
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });

  it('predictedEntities is an empty array', () => {
    const result = predictNextIntent(temporalPatterns, sequentialPatterns, 9, 1, 'search');
    expect(result.predictedEntities).toEqual([]);
  });

  it('picks highest probability sequential pattern', () => {
    const seqPatterns: SequentialPattern[] = [
      { fromIntent: 'browse', toIntent: 'read', count: 1, probability: 0.2 },
      { fromIntent: 'browse', toIntent: 'create', count: 4, probability: 0.8 },
    ];
    const result = predictNextIntent([], seqPatterns, 12, 2, 'browse');
    expect(result.predictedIntent).toBe('create');
  });

  it('handles temporal match without sequential data', () => {
    const result = predictNextIntent(temporalPatterns, [], 20, 5);
    expect(result.predictedIntent).toBe('study');
    expect(result.predictedDomain).toBe('learning');
  });

  it('handles sequential match without temporal data', () => {
    const result = predictNextIntent([], sequentialPatterns, 12, 2, 'create');
    expect(result.predictedIntent).toBe('review');
  });
});

// ---------------------------------------------------------------------------
// computePredictionError
// ---------------------------------------------------------------------------

describe('computePredictionError', () => {
  const basePrediction: UserPrediction = {
    predictedIntent: 'search',
    predictedDomain: 'work',
    predictedEntities: [],
    confidence: 0.7,
    basis: ['temporal'],
  };

  it('returns 0 error for exact match', () => {
    const actual: QueryAnalysis = { intent: 'search', domain: 'work', entities: [] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.errorMagnitude).toBeCloseTo(0.0);
    expect(error.learningSignal).toBe('correct');
  });

  it('returns high error for wrong intent', () => {
    const actual: QueryAnalysis = { intent: 'create', domain: 'work', entities: [] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.errorMagnitude).toBeCloseTo(0.7); // 1.0 * 0.7 + 0.0 * 0.3
    expect(error.learningSignal).toBe('wrong_intent');
  });

  it('returns moderate error for wrong domain only', () => {
    const actual: QueryAnalysis = { intent: 'search', domain: 'personal', entities: [] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.errorMagnitude).toBeCloseTo(0.09); // 0.0 * 0.7 + 0.3 * 0.3
    expect(error.learningSignal).toBe('wrong_domain');
  });

  it('returns surprise signal when both wrong', () => {
    const actual: QueryAnalysis = { intent: 'study', domain: 'learning', entities: [] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.learningSignal).toBe('surprise');
    expect(error.errorMagnitude).toBeGreaterThan(0);
  });

  it('detects partial intent match', () => {
    const prediction: UserPrediction = {
      ...basePrediction,
      predictedIntent: 'search',
    };
    const actual: QueryAnalysis = { intent: 'web_search', domain: 'work', entities: [] };
    const error = computePredictionError(prediction, actual);
    // 'search' is contained in 'web_search' → partial match (0.5)
    expect(error.errorMagnitude).toBeCloseTo(0.35); // 0.5 * 0.7 + 0.0 * 0.3
  });

  it('error magnitude is capped at 1.0', () => {
    const actual: QueryAnalysis = { intent: 'completely_different', domain: 'creative', entities: [] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.errorMagnitude).toBeLessThanOrEqual(1.0);
  });

  it('preserves predicted object in error', () => {
    const actual: QueryAnalysis = { intent: 'search', domain: 'work', entities: [] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.predicted).toBe(basePrediction);
  });

  it('stores actual intent and domain', () => {
    const actual: QueryAnalysis = { intent: 'browse', domain: 'personal', entities: ['react'] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.actualIntent).toBe('browse');
    expect(error.actualDomain).toBe('personal');
  });

  it('returns correct for matching intent even with different entities', () => {
    const actual: QueryAnalysis = { intent: 'search', domain: 'work', entities: ['typescript'] };
    const error = computePredictionError(basePrediction, actual);
    expect(error.learningSignal).toBe('correct');
  });
});

// ---------------------------------------------------------------------------
// updateModel
// ---------------------------------------------------------------------------

describe('updateModel', () => {
  it('writes prediction error to database', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const error: PredictionError = {
      predicted: {
        predictedIntent: 'search',
        predictedDomain: 'work',
        predictedEntities: [],
        confidence: 0.7,
        basis: ['temporal'],
      },
      actualIntent: 'create',
      actualDomain: 'work',
      errorMagnitude: 0.7,
      learningSignal: 'wrong_intent',
    };

    await updateModel('personal', error);
    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO prediction_log'),
      expect.arrayContaining(['search', 'work', 'create', 'work']),
    );
  });

  it('does not throw on DB error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB write failed'));

    const error: PredictionError = {
      predicted: {
        predictedIntent: 'search',
        predictedDomain: 'work',
        predictedEntities: [],
        confidence: 0.5,
        basis: [],
      },
      actualIntent: 'create',
      actualDomain: 'work',
      errorMagnitude: 0.7,
      learningSignal: 'wrong_intent',
    };

    await expect(updateModel('personal', error)).resolves.toBeUndefined();
  });

  it('serializes basis as JSON', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const error: PredictionError = {
      predicted: {
        predictedIntent: 'search',
        predictedDomain: 'work',
        predictedEntities: [],
        confidence: 0.7,
        basis: ['temporal', 'sequential'],
      },
      actualIntent: 'search',
      actualDomain: 'work',
      errorMagnitude: 0.0,
      learningSignal: 'correct',
    };

    await updateModel('personal', error);
    const callArgs = mockQueryContext.mock.calls[0][2] as any[];
    expect(callArgs[7]).toBe(JSON.stringify(['temporal', 'sequential']));
  });
});

// ---------------------------------------------------------------------------
// makePrediction
// ---------------------------------------------------------------------------

describe('makePrediction', () => {
  it('returns prediction based on activity history', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { timestamp: '2026-03-23T09:00:00Z', domain: 'work', intent: 'search', entities: '[]' },
        { timestamp: '2026-03-23T09:30:00Z', domain: 'work', intent: 'search', entities: '[]' },
        { timestamp: '2026-03-23T10:00:00Z', domain: 'work', intent: 'create', entities: '[]' },
      ],
    } as any);

    // Use a Monday at 9am to match the activity data
    const prediction = await makePrediction('personal', undefined, new Date(2026, 2, 23, 9, 0, 0));
    expect(prediction).toHaveProperty('predictedIntent');
    expect(prediction).toHaveProperty('predictedDomain');
    expect(prediction).toHaveProperty('predictedEntities');
    expect(prediction).toHaveProperty('confidence');
    expect(prediction).toHaveProperty('basis');
    expect(prediction.confidence).toBeGreaterThan(0);
  });

  it('returns generic prediction when no history exists', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const prediction = await makePrediction('personal');
    expect(prediction.predictedIntent).toBe('general');
    expect(prediction.predictedDomain).toBe('personal');
    expect(prediction.confidence).toBe(0.1);
    expect(prediction.basis).toContain('no_history');
  });

  it('returns fallback on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB connection failed'));

    const prediction = await makePrediction('personal');
    expect(prediction.predictedIntent).toBe('general');
    expect(prediction.predictedDomain).toBe('personal');
    expect(prediction.confidence).toBe(0.1);
    expect(prediction.basis).toContain('error_fallback');
  });

  it('passes userId when provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await makePrediction('personal', 'user-123');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('user_id'),
      ['user-123'],
    );
  });

  it('uses current time when not provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const prediction = await makePrediction('personal');
    // Should not throw and should return a valid prediction
    expect(prediction).toHaveProperty('predictedIntent');
  });

  it('parses entities from JSON strings', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { timestamp: '2026-03-23T09:00:00Z', domain: 'work', intent: 'search', entities: '["typescript","react"]' },
      ],
    } as any);

    const prediction = await makePrediction('personal', undefined, new Date(2026, 2, 23, 9, 0, 0));
    expect(prediction).toHaveProperty('predictedIntent');
  });

  it('handles null entities gracefully', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { timestamp: '2026-03-23T09:00:00Z', domain: 'work', intent: 'search', entities: null },
      ],
    } as any);

    const prediction = await makePrediction('personal', undefined, new Date(2026, 2, 23, 9, 0, 0));
    expect(prediction).toHaveProperty('predictedIntent');
  });

  it('uses last intent from most recent activity for sequential patterns', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { timestamp: '2026-03-23T10:00:00Z', domain: 'work', intent: 'create', entities: '[]' },
        { timestamp: '2026-03-23T09:30:00Z', domain: 'work', intent: 'search', entities: '[]' },
        { timestamp: '2026-03-23T09:00:00Z', domain: 'work', intent: 'search', entities: '[]' },
      ],
    } as any);

    const prediction = await makePrediction('personal', undefined, new Date(2026, 2, 23, 10, 0, 0));
    // Last intent should be 'create' (first row = most recent)
    expect(prediction.basis.some((b) => b.includes('recency') && b.includes('create'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// recordPredictionResult
// ---------------------------------------------------------------------------

describe('recordPredictionResult', () => {
  it('updates prediction log with actual result', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const actual: QueryAnalysis = { intent: 'search', domain: 'work', entities: [] };
    await recordPredictionResult('personal', 'pred-123', actual);

    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('UPDATE prediction_log'),
      ['search', 'work', 'pred-123'],
    );
  });

  it('does not throw on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB update failed'));

    const actual: QueryAnalysis = { intent: 'search', domain: 'work', entities: [] };
    await expect(recordPredictionResult('personal', 'pred-123', actual)).resolves.toBeUndefined();
  });

  it('passes correct predictionId', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const actual: QueryAnalysis = { intent: 'browse', domain: 'personal', entities: [] };
    await recordPredictionResult('work', 'pred-456', actual);

    const callArgs = mockQueryContext.mock.calls[0][2] as any[];
    expect(callArgs[2]).toBe('pred-456');
  });
});
