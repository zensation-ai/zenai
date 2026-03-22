/**
 * Feedback Aggregator Tests — Phase 137
 *
 * ~25 tests covering aggregateFeedback, computePositiveRate, computeTrend,
 * buildSubsystemReport, and loadFeedbackSummary.
 */

import {
  aggregateFeedback,
  computePositiveRate,
  computeTrend,
  buildSubsystemReport,
  loadFeedbackSummary,
} from '../../../../services/feedback/feedback-aggregator';
import type { FeedbackEvent } from '../../../../services/feedback/feedback-bus';

// ---- Mocks ----------------------------------------------------------------

const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---- Helpers --------------------------------------------------------------

let idCounter = 0;
function makeEvent(
  overrides: Partial<FeedbackEvent> = {},
): FeedbackEvent {
  idCounter += 1;
  return {
    id: `ev-${idCounter}`,
    type: 'response_rating' as const,
    source: 'chat',
    target: 'msg-1',
    value: 0.5,
    details: {},
    timestamp: new Date('2026-03-22T10:00:00Z'),
    ...overrides,
  };
}

function makeEvents(values: number[], type: FeedbackEvent['type'] = 'response_rating', source = 'chat'): FeedbackEvent[] {
  return values.map((v) => makeEvent({ value: v, type, source }));
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  idCounter = 0;
});

describe('computePositiveRate', () => {
  it('returns 0 for empty array', () => {
    expect(computePositiveRate([])).toBe(0);
  });

  it('returns 1 when all positive', () => {
    expect(computePositiveRate([0.5, 0.8, 1])).toBe(1);
  });

  it('returns 0 when all negative or zero', () => {
    expect(computePositiveRate([-0.5, 0, -1])).toBe(0);
  });

  it('handles mixed values', () => {
    expect(computePositiveRate([0.5, -0.5, 0, 1])).toBe(0.5);
  });

  it('treats exactly 0 as not positive', () => {
    expect(computePositiveRate([0])).toBe(0);
  });
});

describe('computeTrend', () => {
  it('returns 0 when fewer values than window', () => {
    expect(computeTrend([1, 2, 3], 10)).toBe(0);
  });

  it('returns 0 when exactly window size (no older portion)', () => {
    // 10 values, window=10 → recent=all, older=[] → 0
    expect(computeTrend([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10)).toBe(0);
  });

  it('computes positive trend when recent values are higher', () => {
    // 5 older = 0, 5 recent = 1 → trend = 1 - 0 = 1
    const values = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    expect(computeTrend(values, 5)).toBe(1);
  });

  it('computes negative trend when recent values are lower', () => {
    const values = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
    expect(computeTrend(values, 5)).toBe(-1);
  });

  it('returns 0 when all values are equal', () => {
    const values = Array(20).fill(0.5);
    expect(computeTrend(values, 10)).toBeCloseTo(0);
  });

  it('defaults window to 10', () => {
    // 10 older = 0, 10 recent = 1
    const values = [...Array(10).fill(0), ...Array(10).fill(1)];
    expect(computeTrend(values)).toBe(1);
  });
});

describe('aggregateFeedback', () => {
  it('returns empty array for no events', () => {
    expect(aggregateFeedback([])).toEqual([]);
  });

  it('aggregates a single type', () => {
    const events = makeEvents([0.4, 0.6, -0.2]);
    const summaries = aggregateFeedback(events);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].type).toBe('response_rating');
    expect(summaries[0].totalCount).toBe(3);
    expect(summaries[0].avgValue).toBeCloseTo((0.4 + 0.6 - 0.2) / 3);
    expect(summaries[0].positiveRate).toBeCloseTo(2 / 3);
  });

  it('aggregates multiple types', () => {
    const events = [
      ...makeEvents([1, 1], 'response_rating'),
      ...makeEvents([-1], 'fact_correction'),
    ];
    const summaries = aggregateFeedback(events);

    expect(summaries).toHaveLength(2);
    const rating = summaries.find((s) => s.type === 'response_rating');
    const correction = summaries.find((s) => s.type === 'fact_correction');
    expect(rating?.totalCount).toBe(2);
    expect(correction?.totalCount).toBe(1);
    expect(correction?.avgValue).toBe(-1);
  });

  it('computes recentTrend as 0 when fewer than 10 events per type', () => {
    const events = makeEvents([1, 1, 1]);
    const summaries = aggregateFeedback(events);
    expect(summaries[0].recentTrend).toBe(0);
  });
});

describe('buildSubsystemReport', () => {
  it('filters events to the specified subsystem', () => {
    const events = [
      ...makeEvents([1, 1], 'response_rating', 'chat'),
      ...makeEvents([0.5], 'tool_success', 'agent'),
    ];
    const report = buildSubsystemReport('chat', events);

    expect(report.subsystem).toBe('chat');
    expect(report.summaries).toHaveLength(1);
    expect(report.summaries[0].type).toBe('response_rating');
  });

  it('returns empty summaries for unknown subsystem', () => {
    const events = makeEvents([1], 'response_rating', 'chat');
    const report = buildSubsystemReport('unknown', events);

    expect(report.summaries).toHaveLength(0);
    expect(report.overallScore).toBe(0);
  });

  it('computes overallScore as weighted average', () => {
    // 2 events with avg 0.5, 1 event with avg 1 → (0.5*2 + 1*1) / 3
    const events = [
      ...makeEvents([0.5, 0.5], 'response_rating', 'rag'),
      ...makeEvents([1], 'document_quality', 'rag'),
    ];
    const report = buildSubsystemReport('rag', events);

    expect(report.overallScore).toBeCloseTo((0.5 * 2 + 1 * 1) / 3);
  });

  it('returns overallScore 0 when no events match', () => {
    const report = buildSubsystemReport('none', []);
    expect(report.overallScore).toBe(0);
  });
});

describe('loadFeedbackSummary', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
  });

  it('queries without type filter when type is omitted', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [
        { type: 'response_rating', total_count: 10, avg_value: 0.7 },
      ],
    });

    const summaries = await loadFeedbackSummary('personal');

    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    const sql: string = mockQueryContext.mock.calls[0][1];
    expect(sql).not.toContain('WHERE');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].type).toBe('response_rating');
    expect(summaries[0].totalCount).toBe(10);
    expect(summaries[0].avgValue).toBeCloseTo(0.7);
  });

  it('queries with type filter when type is provided', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    await loadFeedbackSummary('work', 'tool_success');

    const sql: string = mockQueryContext.mock.calls[0][1];
    expect(sql).toContain('WHERE type = $1');
    expect(mockQueryContext.mock.calls[0][2]).toEqual(['tool_success']);
  });

  it('returns empty array on DB error', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB fail'));
    const result = await loadFeedbackSummary('personal');

    expect(result).toEqual([]);
    const { logger } = jest.requireMock('../../../../utils/logger');
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns empty array when no rows', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });
    const result = await loadFeedbackSummary('learning');
    expect(result).toEqual([]);
  });

  it('maps multiple rows correctly', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [
        { type: 'response_rating', total_count: 5, avg_value: 0.3 },
        { type: 'agent_performance', total_count: 2, avg_value: -0.1 },
      ],
    });

    const result = await loadFeedbackSummary('creative');
    expect(result).toHaveLength(2);
    expect(result[0].totalCount).toBe(5);
    expect(result[1].type).toBe('agent_performance');
  });
});
