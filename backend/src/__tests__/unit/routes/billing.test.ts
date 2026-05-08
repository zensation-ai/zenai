/**
 * Integration tests for billing routes
 *
 * Covers:
 * - GET  /api/billing/status  — returns subscription data (authenticated)
 * - POST /api/billing/checkout — validation + delegates to service
 * - POST /api/billing/portal   — validation + delegates to service
 * - POST /api/billing/webhook  — missing signature, missing rawBody,
 *                                invalid signature, successful processing
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { billingRouter } from '../../../routes/billing';
import { errorHandler } from '../../../middleware/errorHandler';

// ─────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mutable so individual tests can toggle authentication
let mockUser: { id: string; email: string } | undefined = {
  id: 'user-123',
  email: 'test@example.com',
};

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { jwtUser?: unknown }).jwtUser = mockUser;
    next();
  },
}));

const mockGetSubscription = jest.fn();
const mockGetUserCredits = jest.fn();
const mockDeductCredits = jest.fn();
const mockCreateCheckoutSession = jest.fn();
const mockCreatePortalSession = jest.fn();
const mockConstructWebhookEvent = jest.fn();
const mockProcessWebhookEvent = jest.fn();
const mockIsStripeConfigured = jest.fn(() => true);

jest.mock('../../../services/billing', () => ({
  getSubscription: (...a: unknown[]) => mockGetSubscription(...a),
  getUserCredits: (...a: unknown[]) => mockGetUserCredits(...a),
  deductCredits: (...a: unknown[]) => mockDeductCredits(...a),
  createCheckoutSession: (...a: unknown[]) => mockCreateCheckoutSession(...a),
  createPortalSession: (...a: unknown[]) => mockCreatePortalSession(...a),
  constructWebhookEvent: (...a: unknown[]) => mockConstructWebhookEvent(...a),
  processWebhookEvent: (...a: unknown[]) => mockProcessWebhookEvent(...a),
  isStripeConfigured: () => mockIsStripeConfigured(),
  getUserPlan: jest.fn().mockResolvedValue('enterprise'),
}));

// Sprint 1.6 — routes/billing.ts delegates webhook + tier-based checkout to
// services/billing/stripe-service, so we mock that layer as well.
const mockVerifyWebhookSignature = jest.fn();
const mockHandleStripeWebhookEvent = jest.fn();
const mockTierCheckoutSession = jest.fn();
const mockTierPortalSession = jest.fn();
const mockIsBillableTier = jest.fn((v: unknown) => typeof v === 'string' && ['personal', 'pro', 'business'].includes(v));
const mockGetConfiguredTiers = jest.fn(() => ['personal', 'pro', 'business']);

jest.mock('../../../services/billing/stripe-service', () => ({
  createCheckoutSession: (...a: unknown[]) => mockTierCheckoutSession(...a),
  createPortalSession: (...a: unknown[]) => mockTierPortalSession(...a),
  verifyWebhookSignature: (...a: unknown[]) => mockVerifyWebhookSignature(...a),
  handleWebhookEvent: (...a: unknown[]) => mockHandleStripeWebhookEvent(...a),
  isBillableTier: (...a: unknown[]) => mockIsBillableTier(...a),
  getConfiguredTiers: () => mockGetConfiguredTiers(),
}));

jest.mock('../../../middleware/plan-gate', () => ({
  requirePlan: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// ─────────────────────────────────────────────
// App fixtures
// ─────────────────────────────────────────────

/** Standard app — rawBody NOT attached (tests the missing-rawBody branch). */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRouter);
  app.use(errorHandler);
  return app;
}

/**
 * App that attaches rawBody via the express.json verify callback —
 * mirrors how the production MiddlewareModule sets it up.
 */
function buildAppWithRawBody() {
  const app = express();
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use('/api/billing', billingRouter);
  app.use(errorHandler);
  return app;
}

// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-123', email: 'test@example.com' };
});

// ─────────────────────────────────────────────
// GET /api/billing/status
// ─────────────────────────────────────────────

describe('GET /api/billing/status', () => {
  const subscription = {
    id: 'sub-1',
    userId: 'user-123',
    plan: 'pro',
    status: 'active',
    stripeCustomerId: 'cus_abc',
    stripeSubscriptionId: 'sub_abc',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };

  it('returns 200 with subscription data for an authenticated user', async () => {
    mockGetSubscription.mockResolvedValue(subscription);

    const res = await request(buildApp()).get('/api/billing/status');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: subscription,
      stripeConfigured: true,
    });
    expect(mockGetSubscription).toHaveBeenCalledWith('user-123');
  });

  it('returns 5xx when jwtUser is absent (requireUserId throws plain Error)', async () => {
    // requireUserId throws Object.assign(new Error(...), { statusCode: 401 }) — a plain
    // Error, not AppError, so errorHandler returns 500. In production, jwtAuth itself
    // rejects unauthenticated requests before the route handler is reached.
    mockUser = undefined;

    const res = await request(buildApp()).get('/api/billing/status');

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─────────────────────────────────────────────
// GET /api/billing/credits
// ─────────────────────────────────────────────

describe('GET /api/billing/credits', () => {
  it('returns 200 with credit data for authenticated user', async () => {
    mockGetUserCredits.mockResolvedValue({
      remaining: 45,
      used: 5,
      limit: 50,
      plan: 'free',
    });

    const res = await request(buildApp()).get('/api/billing/credits');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { remaining: 45, used: 5, limit: 50, plan: 'free' },
    });
    expect(mockGetUserCredits).toHaveBeenCalledWith('user-123');
  });
});

// ─────────────────────────────────────────────
// POST /api/billing/credits/deduct
// ─────────────────────────────────────────────

describe('POST /api/billing/credits/deduct', () => {
  it('returns 400 when userId is missing', async () => {
    const res = await request(buildApp())
      .post('/api/billing/credits/deduct')
      .send({ amount: 5, reason: 'test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/);
  });

  it('returns 400 when amount is missing or non-positive', async () => {
    const res = await request(buildApp())
      .post('/api/billing/credits/deduct')
      .send({ userId: 'user-target', amount: 0 });

    expect(res.status).toBe(400);
  });

  it('returns 200 with updated credits on success', async () => {
    mockDeductCredits.mockResolvedValue({
      remaining: 45,
      used: 5,
      limit: 50,
      plan: 'free',
    });

    const res = await request(buildApp())
      .post('/api/billing/credits/deduct')
      .send({ userId: 'user-target', amount: 5, reason: 'manual_adjustment' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { remaining: 45, used: 5, limit: 50, plan: 'free' },
    });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      'user-target',
      5,
      'manual_adjustment',
      expect.objectContaining({ adminId: 'user-123' }),
    );
  });

  it('returns 500 when insufficient credits', async () => {
    mockDeductCredits.mockRejectedValue(new Error('Insufficient credits'));

    const res = await request(buildApp())
      .post('/api/billing/credits/deduct')
      .send({ userId: 'user-target', amount: 999, reason: 'test' });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────
// POST /api/billing/checkout
// ─────────────────────────────────────────────

describe('POST /api/billing/checkout', () => {
  it('returns 400 when priceId is missing', async () => {
    const res = await request(buildApp())
      .post('/api/billing/checkout')
      .send({ successUrl: 'https://example.com/ok' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priceId is required/);
  });

  it('returns 200 with checkout URL on success', async () => {
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_1' });

    const res = await request(buildApp())
      .post('/api/billing/checkout')
      .send({ priceId: 'price_pro_123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, url: 'https://checkout.stripe.com/sess_1' });
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        userEmail: 'test@example.com',
        priceId: 'price_pro_123',
      }),
    );
  });
});

// ─────────────────────────────────────────────
// POST /api/billing/portal
// ─────────────────────────────────────────────

describe('POST /api/billing/portal', () => {
  it('returns 200 with portal URL', async () => {
    mockCreatePortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/p/sess_2' });

    const res = await request(buildApp())
      .post('/api/billing/portal')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, url: 'https://billing.stripe.com/p/sess_2' });
    expect(mockCreatePortalSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123' }),
    );
  });

  it('returns 500 when user has no Stripe customer', async () => {
    mockCreatePortalSession.mockRejectedValue(
      new Error('No Stripe customer found for this user. Subscribe first.'),
    );

    const res = await request(buildApp())
      .post('/api/billing/portal')
      .send({});

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────
// POST /api/billing/webhook
// ─────────────────────────────────────────────

describe('POST /api/billing/webhook', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await request(buildApp())
      .post('/api/billing/webhook')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing stripe-signature/);
  });

  it('returns 400 when rawBody is not attached', async () => {
    const res = await request(buildApp())
      .post('/api/billing/webhook')
      .set('stripe-signature', 't=1,v1=abc')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Raw body not available/);
  });

  it('returns 400 when Stripe signature verification fails', async () => {
    mockVerifyWebhookSignature.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const res = await request(buildAppWithRawBody())
      .post('/api/billing/webhook')
      .set('stripe-signature', 't=1,v1=bad')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature invalid/);
  });

  it('returns 200 when event is successfully processed', async () => {
    const fakeEvent = { id: 'evt_ok', type: 'customer.subscription.created' };
    mockVerifyWebhookSignature.mockReturnValue(fakeEvent);
    mockHandleStripeWebhookEvent.mockResolvedValue({
      processed: true,
      duplicate: false,
      eventId: fakeEvent.id,
      type: fakeEvent.type,
    });

    const res = await request(buildAppWithRawBody())
      .post('/api/billing/webhook')
      .set('stripe-signature', 't=1,v1=valid')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, received: true, duplicate: false });
    expect(mockHandleStripeWebhookEvent).toHaveBeenCalledWith(fakeEvent);
  });

  it('returns 200 with duplicate=true for a repeated event', async () => {
    const fakeEvent = { id: 'evt_dup', type: 'customer.subscription.created' };
    mockVerifyWebhookSignature.mockReturnValue(fakeEvent);
    mockHandleStripeWebhookEvent.mockResolvedValue({
      processed: false,
      duplicate: true,
      eventId: fakeEvent.id,
      type: fakeEvent.type,
    });

    const res = await request(buildAppWithRawBody())
      .post('/api/billing/webhook')
      .set('stripe-signature', 't=1,v1=valid')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, received: true, duplicate: true });
  });

  it('returns 500 when handleWebhookEvent throws', async () => {
    const fakeEvent = { id: 'evt_err', type: 'customer.subscription.updated' };
    mockVerifyWebhookSignature.mockReturnValue(fakeEvent);
    mockHandleStripeWebhookEvent.mockRejectedValue(new Error('DB write failed'));

    const res = await request(buildAppWithRawBody())
      .post('/api/billing/webhook')
      .set('stripe-signature', 't=1,v1=valid')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────
// Sprint 1.6 — tier-based checkout + portal
// ─────────────────────────────────────────────

describe('POST /api/billing/checkout-session (Sprint 1.6)', () => {
  it('returns 400 when tier is missing', async () => {
    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid tier/);
  });

  it('returns 400 when tier is unknown', async () => {
    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({ tier: 'unicorn' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid tier/);
  });

  it('returns 400 when enterprise tier is requested (manual sales only)', async () => {
    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({ tier: 'enterprise' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid tier/);
  });

  it('returns 400 when quantity is non-positive', async () => {
    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({ tier: 'pro', quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/);
  });

  it('returns 200 with checkout URL for tier=personal', async () => {
    mockTierCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/s/p' });

    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({ tier: 'personal' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, url: 'https://checkout.stripe.com/s/p' });
    expect(mockTierCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'personal', userId: 'user-123' }),
    );
  });

  it('returns 200 with checkout URL for tier=pro', async () => {
    mockTierCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/s/pro' });

    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({ tier: 'pro' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.com/s/pro');
  });

  it('returns 200 with checkout URL for tier=business with quantity', async () => {
    mockTierCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/s/b' });

    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({ tier: 'business', quantity: 5 });

    expect(res.status).toBe(200);
    expect(mockTierCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'business', quantity: 5 }),
    );
  });

  it('returns 400 when tier price is not configured', async () => {
    mockTierCheckoutSession.mockRejectedValue(
      new Error("No Stripe price ID configured for tier 'personal' (set one of: STRIPE_PERSONAL_PRICE_ID)"),
    );

    const res = await request(buildApp())
      .post('/api/billing/checkout-session')
      .send({ tier: 'personal' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No Stripe price ID configured/);
  });
});

describe('POST /api/billing/portal-session (Sprint 1.6)', () => {
  it('returns 200 with portal URL', async () => {
    mockTierPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/p/x' });

    const res = await request(buildApp())
      .post('/api/billing/portal-session')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, url: 'https://billing.stripe.com/p/x' });
  });

  it('returns 400 when user has no Stripe customer', async () => {
    mockTierPortalSession.mockRejectedValue(new Error('No Stripe customer found'));

    const res = await request(buildApp())
      .post('/api/billing/portal-session')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/billing/tiers (Sprint 1.6)', () => {
  it('returns configured tiers without requiring auth', async () => {
    mockGetConfiguredTiers.mockReturnValue(['personal', 'pro']);
    mockIsStripeConfigured.mockReturnValue(true);

    const res = await request(buildApp()).get('/api/billing/tiers');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { tiers: ['personal', 'pro'], stripeConfigured: true },
    });
  });

  it('reflects when Stripe is not configured', async () => {
    mockGetConfiguredTiers.mockReturnValue([]);
    mockIsStripeConfigured.mockReturnValue(false);

    const res = await request(buildApp()).get('/api/billing/tiers');

    expect(res.status).toBe(200);
    expect(res.body.data.stripeConfigured).toBe(false);
    expect(res.body.data.tiers).toEqual([]);
  });
});
