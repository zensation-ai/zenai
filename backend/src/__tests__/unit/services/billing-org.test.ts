/**
 * Unit tests for org-level billing service (multi-tenancy)
 *
 * Covers:
 * - getOrgSubscription: DB hit, lazy creation
 * - getOrgBillingStatus: subscription + workspace credit breakdown
 * - syncOrgSubscription: upsert + workspace credit provisioning
 * - findOrgByCustomerId: lookup by Stripe customer ID
 * - updateOrgSeats: seat count propagation
 */

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryPublic = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

import {
  getOrgSubscription,
  getOrgBillingStatus,
  syncOrgSubscription,
  findOrgByCustomerId,
  updateOrgSeats,
} from '../../../services/billing';

import type Stripe from 'stripe';

const EMPTY = { rows: [] };
const row = (r: Record<string, unknown>) => ({ rows: [r] });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
  // Sprint 1.1 (2026-04-16): renamed STRIPE_TEAM_PRICE_ID → STRIPE_BUSINESS_PRICE_ID.
  process.env.STRIPE_BUSINESS_PRICE_ID = 'price_business';
  delete process.env.STRIPE_TEAM_PRICE_ID;
  process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_enterprise';
});

// ─────────────────────────────────────────────
// getOrgSubscription
// ─────────────────────────────────────────────

describe('getOrgSubscription', () => {
  it('returns existing org subscription', async () => {
    mockQueryPublic.mockResolvedValue(row({
      id: 'osub-1', org_id: 'org-1', plan: 'pro', status: 'active',
      stripe_subscription_id: 'sub_abc', current_period_start: null,
      current_period_end: '2026-05-01T00:00:00Z', cancel_at_period_end: false,
      seat_count: 5,
    }));

    const sub = await getOrgSubscription('org-1');

    expect(sub.orgId).toBe('org-1');
    expect(sub.plan).toBe('pro');
    expect(sub.seatCount).toBe(5);
    expect(mockQueryPublic).toHaveBeenCalledWith(
      expect.stringContaining('org_subscriptions'),
      ['org-1'],
    );
  });

  it('creates a free-tier subscription when none exists', async () => {
    mockQueryPublic
      .mockResolvedValueOnce(EMPTY) // SELECT returns nothing
      .mockResolvedValueOnce(row({
        id: 'osub-new', org_id: 'org-2', plan: 'free', status: 'active',
        stripe_subscription_id: null, current_period_start: null,
        current_period_end: null, cancel_at_period_end: false, seat_count: 1,
      }));

    const sub = await getOrgSubscription('org-2');

    expect(sub.plan).toBe('free');
    expect(sub.seatCount).toBe(1);
    expect(mockQueryPublic).toHaveBeenCalledTimes(2);
    expect(mockQueryPublic.mock.calls[1][0]).toMatch(/INSERT INTO/);
  });
});

// ─────────────────────────────────────────────
// getOrgBillingStatus
// ─────────────────────────────────────────────

describe('getOrgBillingStatus', () => {
  it('returns subscription + workspace credit breakdown', async () => {
    // 1st call: getOrgSubscription SELECT
    mockQueryPublic.mockResolvedValueOnce(row({
      id: 'osub-1', org_id: 'org-1', plan: 'business', status: 'active',
      stripe_subscription_id: 'sub_x', current_period_start: null,
      current_period_end: null, cancel_at_period_end: false, seat_count: 3,
    }));
    // 2nd call: org stripe_customer_id
    mockQueryPublic.mockResolvedValueOnce(row({ stripe_customer_id: 'cus_org1' }));
    // 3rd call: workspace credits join
    mockQueryPublic.mockResolvedValueOnce({
      rows: [
        { workspace_id: 'ws-1', workspace_name: 'Dev', credits_used: 100, credits_limit: 5000, seat_count: 3 },
        { workspace_id: 'ws-2', workspace_name: 'Ops', credits_used: 50, credits_limit: 5000, seat_count: 3 },
      ],
    });

    const status = await getOrgBillingStatus('org-1');

    expect(status.subscription.plan).toBe('business');
    expect(status.stripeCustomerId).toBe('cus_org1');
    expect(status.workspaceCredits).toHaveLength(2);
    expect(status.workspaceCredits[0].workspaceName).toBe('Dev');
    expect(status.workspaceCredits[0].creditsUsed).toBe(100);
  });
});

// ─────────────────────────────────────────────
// syncOrgSubscription
// ─────────────────────────────────────────────

describe('syncOrgSubscription', () => {
  function makeStripeSub(priceId: string, quantity = 1): Stripe.Subscription {
    return {
      id: 'sub_sync',
      object: 'subscription',
      status: 'active',
      customer: 'cus_org',
      metadata: { orgId: 'org-sync' },
      cancel_at_period_end: false,
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      items: {
        object: 'list',
        data: [{ price: { id: priceId }, quantity } as unknown as Stripe.SubscriptionItem],
        has_more: false,
        url: '',
      },
    } as unknown as Stripe.Subscription;
  }

  it('upserts org_subscriptions and provisions workspace credits', async () => {
    // upsert org_subscriptions
    mockQueryPublic.mockResolvedValueOnce(EMPTY);
    // update organizations plan
    mockQueryPublic.mockResolvedValueOnce(EMPTY);
    // workspaces SELECT
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-a' }, { id: 'ws-b' }] });
    // workspace_credits upsert x2
    mockQueryPublic.mockResolvedValueOnce(EMPTY);
    mockQueryPublic.mockResolvedValueOnce(EMPTY);

    await syncOrgSubscription('org-sync', makeStripeSub('price_business', 5));

    // First call: upsert org_subscriptions with plan='business'
    expect(mockQueryPublic.mock.calls[0][0]).toMatch(/org_subscriptions/);
    expect(mockQueryPublic.mock.calls[0][1]).toContain('business');

    // Second call: update org plan
    expect(mockQueryPublic.mock.calls[1][0]).toMatch(/UPDATE public.organizations/);

    // Third call: fetch workspaces
    expect(mockQueryPublic.mock.calls[2][0]).toMatch(/workspaces/);

    // 4th & 5th: workspace_credits upserts
    expect(mockQueryPublic.mock.calls[3][0]).toMatch(/workspace_credits/);
    expect(mockQueryPublic.mock.calls[4][0]).toMatch(/workspace_credits/);
  });

  it('maps enterprise price correctly', async () => {
    mockQueryPublic.mockResolvedValueOnce(EMPTY);
    mockQueryPublic.mockResolvedValueOnce(EMPTY);
    mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // no workspaces

    await syncOrgSubscription('org-ent', makeStripeSub('price_enterprise'));

    expect(mockQueryPublic.mock.calls[0][1]).toContain('enterprise');
  });
});

// ─────────────────────────────────────────────
// findOrgByCustomerId
// ─────────────────────────────────────────────

describe('findOrgByCustomerId', () => {
  it('returns org ID when found', async () => {
    mockQueryPublic.mockResolvedValue(row({ id: 'org-found' }));
    const orgId = await findOrgByCustomerId('cus_lookup');
    expect(orgId).toBe('org-found');
  });

  it('returns null when not found', async () => {
    mockQueryPublic.mockResolvedValue(EMPTY);
    const orgId = await findOrgByCustomerId('cus_unknown');
    expect(orgId).toBeNull();
  });
});

// ─────────────────────────────────────────────
// updateOrgSeats
// ─────────────────────────────────────────────

describe('updateOrgSeats', () => {
  it('updates org_subscriptions and workspace_credits', async () => {
    mockQueryPublic.mockResolvedValueOnce(EMPTY); // UPDATE org_subscriptions
    mockQueryPublic.mockResolvedValueOnce(EMPTY); // UPDATE workspace_credits

    await updateOrgSeats('org-seats', 10);

    expect(mockQueryPublic).toHaveBeenCalledTimes(2);
    expect(mockQueryPublic.mock.calls[0][0]).toMatch(/org_subscriptions/);
    expect(mockQueryPublic.mock.calls[0][1]).toContain(10);
    expect(mockQueryPublic.mock.calls[1][0]).toMatch(/workspace_credits/);
    expect(mockQueryPublic.mock.calls[1][1]).toContain(10);
  });
});
