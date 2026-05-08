/**
 * Tests for billing.replayStripeEvent — the admin-only webhook replay path.
 *
 * Verifies dry-run behavior, idempotency (no-op when already recorded),
 * and the force branch that deletes the existing billing_events row so
 * side effects run again.
 */

import type Stripe from 'stripe';

// ─────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────

const mockQueryPublic = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Stripe: fake the SDK's constructor so getStripe() works without a real key.
const mockEventsRetrieve = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    events: { retrieve: (id: string) => mockEventsRetrieve(id) },
    webhooks: { constructEvent: jest.fn() },
  }));
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: 'evt_test_123',
    object: 'event',
    type: 'customer.subscription.updated',
    api_version: '2024-06-20',
    created: 1700000000,
    data: {
      object: {
        id: 'sub_test_123',
        object: 'subscription',
        metadata: {},
        status: 'active',
        items: { data: [] },
      },
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    ...overrides,
  } as unknown as Stripe.Event;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('billing.replayStripeEvent', () => {
  let replayStripeEvent: typeof import('../../../services/billing').replayStripeEvent;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    ({ replayStripeEvent } = await import('../../../services/billing'));
  });

  beforeEach(() => {
    mockQueryPublic.mockReset();
    // Default: any unexpected call returns an empty rowset so secondary
    // lookups (findOrgByCustomerId, findUserByCustomerId, etc.) don't crash.
    mockQueryPublic.mockResolvedValue({ rows: [] });
    mockEventsRetrieve.mockReset();
  });

  it('rejects an event id that does not start with evt_', async () => {
    await expect(replayStripeEvent('not_a_real_id')).rejects.toThrow(/Invalid Stripe event ID/);
  });

  it('rejects an empty event id', async () => {
    await expect(replayStripeEvent('')).rejects.toThrow(/Invalid Stripe event ID/);
  });

  it('dry-run reports action=process for an unseen event', async () => {
    mockEventsRetrieve.mockResolvedValue(makeEvent());
    // Default rowset is empty — treat as unseen.

    const result = await replayStripeEvent('evt_test_123', { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.alreadyProcessed).toBe(false);
    expect(result.action).toBe('process');
    expect(result.processed).toBe(false);
    expect(result.eventType).toBe('customer.subscription.updated');
    // No DELETE or INSERT during dry-run
    const mutating = mockQueryPublic.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /DELETE|INSERT|UPDATE/.test(sql),
    );
    expect(mutating).toHaveLength(0);
  });

  it('dry-run reports action=skip when the event is already in billing_events', async () => {
    mockEventsRetrieve.mockResolvedValue(makeEvent());
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });

    const result = await replayStripeEvent('evt_test_123', { dryRun: true });

    expect(result.alreadyProcessed).toBe(true);
    expect(result.action).toBe('skip');
    expect(result.processed).toBe(false);
    expect(result.notes).toMatch(/no-op|force=true/);
    const mutating = mockQueryPublic.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /DELETE|INSERT|UPDATE/.test(sql),
    );
    expect(mutating).toHaveLength(0);
  });

  it('dry-run reports action=force-replay when the event is in billing_events and force=true', async () => {
    mockEventsRetrieve.mockResolvedValue(makeEvent());
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });

    const result = await replayStripeEvent('evt_test_123', { dryRun: true, force: true });

    expect(result.alreadyProcessed).toBe(true);
    expect(result.action).toBe('force-replay');
    expect(result.processed).toBe(false);
    // No DELETE during dry-run
    const mutating = mockQueryPublic.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /DELETE|INSERT|UPDATE/.test(sql),
    );
    expect(mutating).toHaveLength(0);
  });

  it('defaults to dry-run when no options are passed (safety first)', async () => {
    mockEventsRetrieve.mockResolvedValue(makeEvent());
    const result = await replayStripeEvent('evt_test_123');
    expect(result.dryRun).toBe(true);
    expect(result.processed).toBe(false);
  });

  it('non-dry-run + already processed + no force → skip, no side effects', async () => {
    mockEventsRetrieve.mockResolvedValue(makeEvent());
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });

    const result = await replayStripeEvent('evt_test_123', { dryRun: false, force: false });

    expect(result.action).toBe('skip');
    expect(result.processed).toBe(false);
    // No DELETE, no INSERT INTO billing_events.
    const mutating = mockQueryPublic.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /DELETE FROM billing_events|INSERT INTO billing_events/.test(sql),
    );
    expect(mutating).toHaveLength(0);
  });

  it('non-dry-run + new event → processes and inserts a billing_events row', async () => {
    mockEventsRetrieve.mockResolvedValue(makeEvent());
    // Default empty rowset means: no existing billing_events row, and the
    // inner lookups findOrgByCustomerId / findUserByCustomerId also return null.

    const result = await replayStripeEvent('evt_test_123', { dryRun: false });

    expect(result.action).toBe('process');
    expect(result.processed).toBe(true);
    expect(result.alreadyProcessed).toBe(false);

    const insertCall = mockQueryPublic.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO billing_events'),
    );
    expect(insertCall).toBeDefined();
  });

  it('non-dry-run + force + already processed → DELETEs then re-runs processing', async () => {
    mockEventsRetrieve.mockResolvedValue(makeEvent());
    // First SELECT → existing row (so alreadyProcessed=true triggers force path)
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });
    // All subsequent calls (DELETE, idempotency re-check, inner lookups, INSERT)
    // fall through to the default empty rowset.

    const result = await replayStripeEvent('evt_test_123', { dryRun: false, force: true });

    expect(result.action).toBe('force-replay');
    expect(result.processed).toBe(true);
    expect(result.alreadyProcessed).toBe(true);

    const deleteCall = mockQueryPublic.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('DELETE FROM billing_events'),
    );
    expect(deleteCall).toBeDefined();
    const insertCall = mockQueryPublic.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO billing_events'),
    );
    expect(insertCall).toBeDefined();
  });

  it('propagates errors from Stripe when the event cannot be retrieved', async () => {
    mockEventsRetrieve.mockRejectedValue(new Error('No such event'));
    await expect(replayStripeEvent('evt_missing_999')).rejects.toThrow(/No such event/);
  });
});
