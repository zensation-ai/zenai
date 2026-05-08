/**
 * Tests for the Phase H1.2 bi-temporal additions to EpisodicMemoryService.
 *
 * Coverage:
 *   - store() unchanged behaviour when biTemporal omitted (back-compat).
 *   - store() bi-temporal column path passes the new params correctly.
 *   - store() falls back to legacy schema on "column does not exist"
 *     (migration-window resilience).
 *
 * Mocks: queryContext, generateEmbedding (deterministic), formatForPgVector,
 * logger. No DB.
 *
 * @module tests/unit/services/memory/episodic-memory-bi-temporal
 */

import { EpisodicMemoryService } from '../../../../services/memory/episodic-memory';
import { queryContext, AIContext } from '../../../../utils/database-context';
import { generateEmbedding } from '../../../../services/ai';

jest.mock('../../../../utils/database-context', () => ({ queryContext: jest.fn() }));
jest.mock('../../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
}));
jest.mock('../../../../utils/embedding', () => ({
  formatForPgVector: jest.fn().mockReturnValue('[0.1,0.2,0.3,0.4,0.5]'),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;

const mockRow = {
  id: 'test-id-bi',
  context: 'operations',
  session_id: 'session-bi',
  trigger: 'When did Caroline mention?',
  response: 'On May 8',
  emotional_valence: 0,
  emotional_arousal: 0,
  time_of_day: 'morning',
  day_of_week: 'Monday',
  is_weekend: false,
  linked_episodes: [],
  linked_facts: [],
  retrieval_count: 0,
  last_retrieved: null,
  retrieval_strength: 1.0,
  created_at: new Date('2026-05-07T10:00:00Z'),
  updated_at: new Date('2026-05-07T10:00:00Z'),
  event_time: new Date('2023-05-08T13:56:00Z'),
  event_time_precision: 'time',
  valid_from: null,
  valid_to: null,
};

describe('EpisodicMemoryService — bi-temporal (Phase H1.2)', () => {
  let service: EpisodicMemoryService;
  const ctx: AIContext = 'operations';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EpisodicMemoryService();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('omits bi-temporal columns from INSERT when biTemporal arg is undefined', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);   // findSimilarEpisodes
    mockQueryContext.mockResolvedValueOnce({ rows: [mockRow] } as any); // INSERT
    await service.store('q', 'r', 's-1', ctx);

    const insertCall = mockQueryContext.mock.calls[1];
    const sql = insertCall[1] as string;
    expect(sql).not.toMatch(/event_time/);
    expect(sql).not.toMatch(/valid_from/);
    // Param count: legacy = 11
    expect((insertCall[2] as unknown[]).length).toBe(11);
  });

  it('includes all 4 bi-temporal columns when biTemporal arg supplied', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [mockRow] } as any);

    const eventTime = new Date('2023-05-08T13:56:00Z');
    const validFrom = new Date('2023-05-08T00:00:00Z');
    const validTo = new Date('2023-05-09T00:00:00Z');
    await service.store('q', 'r', 's-2', ctx, {
      eventTime,
      eventTimePrecision: 'time',
      validFrom,
      validTo,
    });

    const insertCall = mockQueryContext.mock.calls[1];
    const sql = insertCall[1] as string;
    expect(sql).toMatch(/event_time/);
    expect(sql).toMatch(/event_time_precision/);
    expect(sql).toMatch(/valid_from/);
    expect(sql).toMatch(/valid_to/);
    const params = insertCall[2] as unknown[];
    expect(params.length).toBe(15);
    expect(params[11]).toBe(eventTime);
    expect(params[12]).toBe('time');
    expect(params[13]).toBe(validFrom);
    expect(params[14]).toBe(validTo);
  });

  it('falls back to legacy schema when bi-temporal column missing', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // findSimilar
    // First INSERT errors with "column does not exist"
    mockQueryContext.mockRejectedValueOnce(
      new Error('column "event_time" does not exist'),
    );
    // Second INSERT (legacy fallback) succeeds
    mockQueryContext.mockResolvedValueOnce({ rows: [mockRow] } as any);

    const result = await service.store('q', 'r', 's-3', ctx, {
      eventTime: new Date('2023-05-08T13:56:00Z'),
      eventTimePrecision: 'time',
    });
    expect(result.id).toBe('test-id-bi');

    // Three calls total: findSimilar, failed-bi-temporal-INSERT, legacy-INSERT.
    expect(mockQueryContext).toHaveBeenCalledTimes(3);
    const fallbackCall = mockQueryContext.mock.calls[2];
    expect(fallbackCall[1]).not.toMatch(/event_time/);
  });

  it('rethrows non-column errors (e.g. constraint violation)', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "episodic_memories_pkey"'),
    );

    await expect(service.store('q', 'r', 's-4', ctx, {
      eventTime: new Date(),
      eventTimePrecision: 'day',
    })).rejects.toThrow('duplicate key value');
  });

  it('passes only the supplied bi-temporal fields and NULL for unsupplied', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [mockRow] } as any);

    await service.store('q', 'r', 's-5', ctx, {
      eventTime: new Date('2023-05-08T13:56:00Z'),
      eventTimePrecision: 'time',
      // validFrom + validTo intentionally omitted
    });

    const params = mockQueryContext.mock.calls[1][2] as unknown[];
    expect(params[11]).toBeInstanceOf(Date);
    expect(params[12]).toBe('time');
    expect(params[13]).toBeNull();
    expect(params[14]).toBeNull();
  });
});
