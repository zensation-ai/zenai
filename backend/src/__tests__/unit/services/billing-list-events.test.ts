/**
 * Sprint 1.8 Commit 3: Tests for billing.listBillingEvents.
 *
 * The function drives the /admin/events dashboard: it returns recent
 * billing_events rows (+ total count) with optional event_type and search
 * filters. All queries are parameter-bound via queryPublic.
 */

const mockQueryPublic = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    events: { retrieve: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  }));
});

describe('billing.listBillingEvents', () => {
  let listBillingEvents: typeof import('../../../services/billing').listBillingEvents;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    ({ listBillingEvents } = await import('../../../services/billing'));
  });

  beforeEach(() => {
    mockQueryPublic.mockReset();
  });

  it('returns rows and total with no filters and default paging', async () => {
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ c: 3 }] }) // count
      .mockResolvedValueOnce({
        rows: [
          { id: 'r1', stripe_event_id: 'evt_1', event_type: 'invoice.paid', user_id: 'u1', processed_at: '2026-04-10' },
          { id: 'r2', stripe_event_id: 'evt_2', event_type: 'invoice.paid', user_id: null, processed_at: '2026-04-09' },
        ],
      });

    const res = await listBillingEvents();

    expect(res.total).toBe(3);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].stripe_event_id).toBe('evt_1');

    // First call: count, no WHERE, no params
    expect(mockQueryPublic).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT COUNT(*)'),
      [],
    );
    // Second call: rows with LIMIT/OFFSET params appended (50 / 0 by default)
    const rowsCall = mockQueryPublic.mock.calls[1];
    expect(rowsCall[0]).toContain('ORDER BY processed_at DESC');
    expect(rowsCall[1]).toEqual([50, 0]);
  });

  it('applies event_type filter', async () => {
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ c: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await listBillingEvents({ eventType: 'customer.subscription.updated' });

    const countCall = mockQueryPublic.mock.calls[0];
    expect(countCall[0]).toContain('event_type = $1');
    expect(countCall[1]).toEqual(['customer.subscription.updated']);
  });

  it('applies search filter (ILIKE)', async () => {
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ c: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    await listBillingEvents({ search: 'abc' });

    const countCall = mockQueryPublic.mock.calls[0];
    expect(countCall[0]).toContain('stripe_event_id ILIKE $1');
    expect(countCall[1]).toEqual(['%abc%']);
  });

  it('combines event_type and search', async () => {
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ c: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    await listBillingEvents({ eventType: 'invoice.paid', search: 'xyz' });

    const countCall = mockQueryPublic.mock.calls[0];
    expect(countCall[0]).toMatch(/event_type = \$1 AND stripe_event_id ILIKE \$2/);
    expect(countCall[1]).toEqual(['invoice.paid', '%xyz%']);
  });

  it('clamps limit to [1, 200] and offset to >= 0', async () => {
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ c: 999 }] })
      .mockResolvedValueOnce({ rows: [] });

    await listBillingEvents({ limit: 5000, offset: -10 });

    const rowsCall = mockQueryPublic.mock.calls[1];
    const params = rowsCall[1] as unknown[];
    expect(params[params.length - 2]).toBe(200); // limit clamped
    expect(params[params.length - 1]).toBe(0); // offset clamped
  });

  it('returns total 0 when count query has no rows', async () => {
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await listBillingEvents();
    expect(res.total).toBe(0);
    expect(res.rows).toEqual([]);
  });
});
