/**
 * Tests for the Phase H1.2 bi-temporal additions to temporal-index +
 * event-subgraph.
 *
 * Coverage:
 *   - recordEvent omits bi-temporal columns when caller does not supply them
 *     (back-compat) and includes them when supplied.
 *   - recordEvent falls back to legacy schema on "column does not exist".
 *   - queryEventsByEventTime emits the COALESCE-on-event_time SQL filter.
 *   - getBiTemporalAsOfSnapshot emits the two-axis SQL filter.
 *
 * Mocks queryContext + logger only — no DB.
 *
 * @module tests/unit/services/temporal-index-bi-temporal
 */

import { recordEvent } from '../../../services/knowledge-graph/event-subgraph';
import {
  queryEventsByEventTime,
  getBiTemporalAsOfSnapshot,
} from '../../../services/knowledge-graph/temporal-index';
import { queryContext } from '../../../utils/database-context';

jest.mock('../../../utils/database-context', () => ({ queryContext: jest.fn() }));
jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

const baseRow = {
  id: 'evt-1',
  event_type: 'chat_reference',
  actor: 'user',
  target_entity_id: null,
  related_entity_ids: [],
  payload: {},
  context: 'operations',
  created_at: '2026-05-07T10:00:00Z',
  event_time: '2023-05-08T13:56:00Z',
  event_time_precision: 'time',
  valid_from: null,
  valid_to: null,
};

describe('event-subgraph.recordEvent — bi-temporal (Phase H1.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses legacy INSERT when no bi-temporal options supplied', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'x' }] } as any);
    await recordEvent('operations', 'tool_invocation', 'agent:researcher');
    const sql = mockQueryContext.mock.calls[0][1] as string;
    expect(sql).not.toMatch(/event_time/);
    expect(sql).not.toMatch(/valid_from/);
    expect((mockQueryContext.mock.calls[0][2] as unknown[]).length).toBe(6);
  });

  it('uses extended INSERT when eventTime supplied', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'x' }] } as any);
    const t = new Date('2023-05-08T13:56:00Z');
    await recordEvent('operations', 'chat_reference', 'user', {
      eventTime: t,
      eventTimePrecision: 'time',
    });
    const sql = mockQueryContext.mock.calls[0][1] as string;
    expect(sql).toMatch(/event_time/);
    expect(sql).toMatch(/event_time_precision/);
    expect(sql).toMatch(/valid_from/);
    expect(sql).toMatch(/valid_to/);
    const params = mockQueryContext.mock.calls[0][2] as unknown[];
    expect(params.length).toBe(10);
    expect(params[6]).toBe(t);
    expect(params[7]).toBe('time');
    expect(params[8]).toBeNull();
    expect(params[9]).toBeNull();
  });

  it('falls back to legacy INSERT when bi-temporal column missing', async () => {
    mockQueryContext.mockRejectedValueOnce(
      new Error('column "event_time" does not exist'),
    );
    mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'fallback' }] } as any);

    const id = await recordEvent('operations', 'chat_reference', 'user', {
      eventTime: new Date(),
      eventTimePrecision: 'day',
    });
    expect(id).toBe('fallback');

    expect(mockQueryContext).toHaveBeenCalledTimes(2);
    const fallbackSql = mockQueryContext.mock.calls[1][1] as string;
    expect(fallbackSql).not.toMatch(/event_time/);
  });

  it('returns empty string and logs warning on unrelated INSERT error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(
      new Error('connection refused'),
    );
    const id = await recordEvent('operations', 'chat_reference', 'user');
    expect(id).toBe('');
  });

  it('returns empty string when fallback path also errors', async () => {
    mockQueryContext.mockRejectedValueOnce(
      new Error('column "event_time" does not exist'),
    );
    mockQueryContext.mockRejectedValueOnce(
      new Error('connection refused after retry'),
    );
    const id = await recordEvent('operations', 'chat_reference', 'user', {
      eventTime: new Date(),
    });
    expect(id).toBe('');
  });
});

describe('temporal-index — bi-temporal queries (Phase H1.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('queryEventsByEventTime', () => {
    it('filters on COALESCE(event_time, created_at) BETWEEN bounds', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [baseRow] } as any);
      const start = new Date('2023-05-01T00:00:00Z');
      const end = new Date('2023-05-31T23:59:59Z');
      const out = await queryEventsByEventTime('operations', start, end);

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toMatch(/COALESCE\(event_time, created_at\)/);
      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params[0]).toBe('operations');
      expect(params[1]).toBe(start);
      expect(params[2]).toBe(end);

      expect(out.length).toBe(1);
      expect(out[0].id).toBe('evt-1');
      expect(out[0].eventTime).toEqual(new Date('2023-05-08T13:56:00Z'));
      expect(out[0].eventTimePrecision).toBe('time');
    });

    it('appends event_type filter when supplied', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      await queryEventsByEventTime('operations', new Date(), new Date(), {
        eventType: 'chat_reference',
      });
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toMatch(/event_type = \$\d/);
    });

    it('appends entity filter when entityId supplied', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      await queryEventsByEventTime('operations', new Date(), new Date(), {
        entityId: 'caroline',
      });
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toMatch(/target_entity_id = \$/);
      expect(sql).toMatch(/= ANY\(related_entity_ids\)/);
    });

    it('returns null event_time on legacy rows', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...baseRow, event_time: null, event_time_precision: null }],
      } as any);
      const out = await queryEventsByEventTime('operations', new Date(), new Date());
      expect(out[0].eventTime).toBeNull();
      expect(out[0].eventTimePrecision).toBeNull();
    });
  });

  describe('getBiTemporalAsOfSnapshot', () => {
    it('emits two-axis filter (event_time AND created_at)', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      const asOfEvent = new Date('2023-12-31T23:59:59Z');
      const asOfIngest = new Date('2026-01-01T00:00:00Z');
      await getBiTemporalAsOfSnapshot('operations', asOfEvent, asOfIngest);

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toMatch(/COALESCE\(event_time, created_at\) <= \$2/);
      expect(sql).toMatch(/created_at <= \$3/);
    });

    it('orders by COALESCE(event_time, created_at) DESC', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      await getBiTemporalAsOfSnapshot('operations', new Date(), new Date());
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toMatch(/ORDER BY COALESCE\(event_time, created_at\) DESC/);
    });
  });
});
