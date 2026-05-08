/**
 * Unit tests for billing service
 *
 * Covers:
 * - getUserPlan: DB hit, fallback to free, error resilience
 * - processWebhookEvent: idempotency, subscription sync (pro/enterprise/free),
 *   invoice.payment_failed, unknown event types
 */

import type Stripe from 'stripe';

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryPublic = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

// Import after mocks are set up
import { getUserPlan, processWebhookEvent } from '../../../services/billing';

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

const PRO_PRICE_ID = 'price_pro_test';
const ENTERPRISE_PRICE_ID = 'price_enterprise_test';

function makeStripeSub(overrides: {
  id?: string;
  status?: Stripe.Subscription.Status;
  customer?: string;
  priceId?: string;
  userId?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number;
}): Stripe.Subscription {
  const {
    id = 'sub_test123',
    status = 'active',
    customer = 'cus_test123',
    priceId = PRO_PRICE_ID,
    userId = 'user-abc',
    cancelAtPeriodEnd = false,
    currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 86400,
  } = overrides;

  return {
    id,
    object: 'subscription',
    status,
    customer,
    metadata: userId ? { userId } : {},
    cancel_at_period_end: cancelAtPeriodEnd,
    current_period_end: currentPeriodEnd,
    items: {
      object: 'list',
      data: [{ price: { id: priceId } } as Stripe.SubscriptionItem],
      has_more: false,
      url: '',
    },
  } as unknown as Stripe.Subscription;
}

function makeEvent(
  type: string,
  dataObject: object,
  id = 'evt_test001',
): Stripe.Event {
  return {
    id,
    object: 'event',
    type,
    data: { object: dataObject },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    api_version: null,
  } as unknown as Stripe.Event;
}

/** Empty DB result (no rows). */
const EMPTY = { rows: [] };
/** Single-row result. */
const row = (r: Record<string, unknown>) => ({ rows: [r] });

// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_PRO_PRICE_ID = PRO_PRICE_ID;
  process.env.STRIPE_ENTERPRISE_PRICE_ID = ENTERPRISE_PRICE_ID;
});

// ─────────────────────────────────────────────
// getUserPlan
// ─────────────────────────────────────────────

describe('getUserPlan', () => {
  it('returns the plan stored in the DB', async () => {
    mockQueryPublic.mockResolvedValue(row({ plan: 'pro' }));
    expect(await getUserPlan('user-1')).toBe('pro');
    expect(mockQueryPublic).toHaveBeenCalledWith(
      expect.stringContaining('SELECT plan FROM subscriptions'),
      ['user-1'],
    );
  });

  it('returns "free" when no subscription row exists', async () => {
    mockQueryPublic.mockResolvedValue(EMPTY);
    expect(await getUserPlan('user-2')).toBe('free');
  });

  it('returns "free" when plan column is null', async () => {
    mockQueryPublic.mockResolvedValue(row({ plan: null }));
    expect(await getUserPlan('user-3')).toBe('free');
  });

  it('returns "free" and does not throw on DB error', async () => {
    mockQueryPublic.mockRejectedValue(new Error('connection refused'));
    await expect(getUserPlan('user-4')).resolves.toBe('free');
  });
});

// ─────────────────────────────────────────────
// processWebhookEvent — idempotency
// ─────────────────────────────────────────────

describe('processWebhookEvent — idempotency', () => {
  it('returns false and skips processing for a duplicate event', async () => {
    mockQueryPublic.mockResolvedValue(row({ id: 'billing_evt_1' })); // already recorded

    const event = makeEvent(
      'customer.subscription.created',
      makeStripeSub({}),
      'evt_duplicate',
    );

    const result = await processWebhookEvent(event);

    expect(result).toBe(false);
    // Only the idempotency check query should run
    expect(mockQueryPublic).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────
// processWebhookEvent — subscription.created / updated
// ─────────────────────────────────────────────

describe('processWebhookEvent — customer.subscription.created', () => {
  it('syncs a pro subscription when userId is in metadata', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)   // idempotency check
      .mockResolvedValueOnce(EMPTY)   // findOrgByCustomerId (no org match)
      .mockResolvedValueOnce(EMPTY)   // syncSubscription upsert
      .mockResolvedValueOnce(EMPTY);  // insert billing_event

    const stripeSub = makeStripeSub({ priceId: PRO_PRICE_ID, userId: 'user-pro' });
    const event = makeEvent('customer.subscription.created', stripeSub);

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // call[2] is now the subscription upsert (after org lookup at call[1])
    const upsertCall = mockQueryPublic.mock.calls[2];
    expect(upsertCall[1]).toContain('pro');
    expect(upsertCall[1]).toContain('user-pro');
  });

  it('syncs an enterprise subscription', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)   // idempotency check
      .mockResolvedValueOnce(EMPTY)   // findOrgByCustomerId
      .mockResolvedValueOnce(EMPTY)   // syncSubscription upsert
      .mockResolvedValueOnce(EMPTY);  // insert billing_event

    const stripeSub = makeStripeSub({ priceId: ENTERPRISE_PRICE_ID, userId: 'user-ent' });
    const event = makeEvent('customer.subscription.created', stripeSub);

    await processWebhookEvent(event);

    const upsertCall = mockQueryPublic.mock.calls[2];
    expect(upsertCall[1]).toContain('enterprise');
  });

  it('falls back to customer-ID lookup when userId is missing from metadata', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)                          // idempotency check
      .mockResolvedValueOnce(EMPTY)                          // findOrgByCustomerId (no org)
      .mockResolvedValueOnce(row({ user_id: 'user-found' })) // findUserByCustomerId
      .mockResolvedValueOnce(EMPTY)                          // syncSubscription upsert
      .mockResolvedValueOnce(EMPTY);                         // insert billing_event

    const stripeSub = makeStripeSub({ userId: null, customer: 'cus_lookup' });
    const event = makeEvent('customer.subscription.created', stripeSub);

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // call[2] should be the user customer-ID lookup
    expect(mockQueryPublic.mock.calls[2][0]).toMatch(/stripe_customer_id/);
    expect(mockQueryPublic.mock.calls[2][1]).toContain('cus_lookup');
  });
});

// ─────────────────────────────────────────────
// processWebhookEvent — customer.subscription.updated
// ─────────────────────────────────────────────

describe('processWebhookEvent — customer.subscription.updated', () => {
  it('syncs plan update via the same code path as created', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)   // idempotency check
      .mockResolvedValueOnce(EMPTY)   // findOrgByCustomerId
      .mockResolvedValueOnce(EMPTY)   // syncSubscription upsert
      .mockResolvedValueOnce(EMPTY)   // credit provisioning (catch-guarded)
      .mockResolvedValueOnce(EMPTY);  // insert billing_event

    const stripeSub = makeStripeSub({
      priceId: ENTERPRISE_PRICE_ID,
      userId: 'user-upgrade',
      status: 'active',
    });
    const event = makeEvent('customer.subscription.updated', stripeSub, 'evt_update_1');

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // The subscription upsert (call[2]) should contain 'enterprise'
    const upsertCall = mockQueryPublic.mock.calls[2];
    expect(upsertCall[1]).toContain('enterprise');
    expect(upsertCall[1]).toContain('user-upgrade');
  });

  it('handles downgrade to free when price ID is unknown', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)   // idempotency check
      .mockResolvedValueOnce(EMPTY)   // findOrgByCustomerId
      .mockResolvedValueOnce(EMPTY)   // syncSubscription upsert
      .mockResolvedValueOnce(EMPTY)   // credit provisioning
      .mockResolvedValueOnce(EMPTY);  // insert billing_event

    const stripeSub = makeStripeSub({
      priceId: 'price_unknown_tier',
      userId: 'user-downgrade',
      status: 'active',
    });
    const event = makeEvent('customer.subscription.updated', stripeSub, 'evt_update_2');

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // Unknown price ID maps to 'free' plan
    const upsertCall = mockQueryPublic.mock.calls[2];
    expect(upsertCall[1]).toContain('free');
  });
});

// ─────────────────────────────────────────────
// processWebhookEvent — subscription.deleted → revert to free
// ─────────────────────────────────────────────

describe('processWebhookEvent — customer.subscription.deleted', () => {
  it('reverts plan to free when subscription is canceled', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)   // idempotency check
      .mockResolvedValueOnce(EMPTY)   // findOrgByCustomerId
      .mockResolvedValueOnce(EMPTY)   // syncSubscription upsert
      .mockResolvedValueOnce(EMPTY);  // insert billing_event

    const stripeSub = makeStripeSub({ status: 'canceled', userId: 'user-del' });
    const event = makeEvent('customer.subscription.deleted', stripeSub);

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // call[2] is now the subscription upsert (after org lookup)
    const upsertCall = mockQueryPublic.mock.calls[2];
    expect(upsertCall[1]).toContain('free');
    expect(upsertCall[1]).toContain('canceled');
  });
});

// ─────────────────────────────────────────────
// processWebhookEvent — invoice.payment_failed
// ─────────────────────────────────────────────

describe('processWebhookEvent — invoice.payment_failed', () => {
  it('sets subscription status to past_due', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)                          // idempotency check
      .mockResolvedValueOnce(EMPTY)                          // findOrgByCustomerId (no org)
      .mockResolvedValueOnce(row({ user_id: 'user-late' })) // findUserByCustomerId
      .mockResolvedValueOnce(EMPTY)                          // UPDATE status = past_due (user)
      .mockResolvedValueOnce(EMPTY);                         // insert billing_event

    const invoice = {
      id: 'in_test123',
      object: 'invoice',
      customer: 'cus_late123',
    };
    const event = makeEvent('invoice.payment_failed', invoice, 'evt_pay_fail');

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // call[3] should be the UPDATE status = past_due (user-level)
    const updateCall = mockQueryPublic.mock.calls[3];
    expect(updateCall[0]).toMatch(/past_due/);
    expect(updateCall[1]).toContain('user-late');
  });

  it('sets org subscription to past_due when org is found', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)                          // idempotency check
      .mockResolvedValueOnce(row({ id: 'org-late' }))        // findOrgByCustomerId → match
      .mockResolvedValueOnce(EMPTY)                          // UPDATE org_subscriptions to past_due
      .mockResolvedValueOnce(row({ user_id: 'user-late' })) // findUserByCustomerId
      .mockResolvedValueOnce(EMPTY)                          // UPDATE subscriptions to past_due (user)
      .mockResolvedValueOnce(EMPTY);                         // insert billing_event

    const invoice = {
      id: 'in_org_fail',
      object: 'invoice',
      customer: 'cus_org_late',
    };
    const event = makeEvent('invoice.payment_failed', invoice, 'evt_org_pay_fail');

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // call[2] should be the org subscription UPDATE to past_due
    const orgUpdateCall = mockQueryPublic.mock.calls[2];
    expect(orgUpdateCall[0]).toMatch(/org_subscriptions/);
    expect(orgUpdateCall[0]).toMatch(/past_due/);
    expect(orgUpdateCall[1]).toContain('org-late');
  });

  it('skips the UPDATE when no user is found for the customer ID', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)  // idempotency check
      .mockResolvedValueOnce(EMPTY)  // findOrgByCustomerId → no match
      .mockResolvedValueOnce(EMPTY)  // findUserByCustomerId → no match
      .mockResolvedValueOnce(EMPTY); // insert billing_event

    const invoice = { id: 'in_2', object: 'invoice', customer: 'cus_unknown' };
    const event = makeEvent('invoice.payment_failed', invoice, 'evt_pay_fail_2');

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    // 4 queries total: idempotency + findOrg + findUser + insert billing_event
    expect(mockQueryPublic).toHaveBeenCalledTimes(4);
  });
});

// ─────────────────────────────────────────────
// processWebhookEvent — unhandled event type
// ─────────────────────────────────────────────

describe('processWebhookEvent — unhandled event types', () => {
  it('records the event and returns true without erroring', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY)  // idempotency check
      .mockResolvedValueOnce(EMPTY); // insert billing_event

    const event = makeEvent('charge.succeeded', { id: 'ch_1' }, 'evt_charge');

    const result = await processWebhookEvent(event);

    expect(result).toBe(true);
    expect(mockQueryPublic).toHaveBeenCalledTimes(2);
  });
});
