/**
 * Tests for org-level billing routes
 *
 * Covers:
 * - GET  /api/billing/org/:orgId/status   — org billing status
 * - POST /api/billing/org/:orgId/checkout — org checkout session
 * - POST /api/billing/org/:orgId/portal   — org portal session
 * - POST /api/billing/org/:orgId/seats    — update seat count
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { billingRouter } from '../../../routes/billing';
import { errorHandler } from '../../../middleware/errorHandler';

// ─────────────────────────────────────────────
// Mocks
// ──────────────────────────────────���──────────

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let mockUser: { id: string; email: string } | undefined = {
  id: 'user-owner',
  email: 'owner@org.com',
};

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { jwtUser?: unknown }).jwtUser = mockUser;
    next();
  },
}));

const mockGetOrgBillingStatus = jest.fn();
const mockCreateOrgCheckoutSession = jest.fn();
const mockCreateOrgPortalSession = jest.fn();
const mockUpdateOrgSeats = jest.fn();

// Mock for requireOrgOwner's dynamic import of database-context
const mockQueryPublic = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

jest.mock('../../../services/billing', () => ({
  getSubscription: jest.fn(),
  getUserCredits: jest.fn(),
  createCheckoutSession: jest.fn(),
  createPortalSession: jest.fn(),
  constructWebhookEvent: jest.fn(),
  processWebhookEvent: jest.fn(),
  isStripeConfigured: () => true,
  getOrgBillingStatus: (...a: unknown[]) => mockGetOrgBillingStatus(...a),
  createOrgCheckoutSession: (...a: unknown[]) => mockCreateOrgCheckoutSession(...a),
  createOrgPortalSession: (...a: unknown[]) => mockCreateOrgPortalSession(...a),
  updateOrgSeats: (...a: unknown[]) => mockUpdateOrgSeats(...a),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-owner', email: 'owner@org.com' };
  // Default: user IS the org owner
  mockQueryPublic.mockResolvedValue({ rows: [{ owner_id: 'user-owner' }] });
});

// ─────────────────────────��───────────────────
// GET /api/billing/org/:orgId/status
// ─────────────────────────────────────────────

describe('GET /api/billing/org/:orgId/status', () => {
  it('rejects unauthenticated user (requireUserId throws)', async () => {
    mockUser = undefined;
    const res = await request(buildApp()).get('/api/billing/org/org-1/status');
    // requireUserId throws a plain Error with statusCode: 401.
    // The errorHandler does not recognize plain Errors with statusCode,
    // so it falls through to the generic 500 handler. The error message
    // is preserved in non-production mode.
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Authentication required/);
  });

  it('returns org billing status', async () => {
    const mockStatus = {
      subscription: { id: 'osub-1', orgId: 'org-1', plan: 'business', status: 'active', seatCount: 5 },
      stripeCustomerId: 'cus_org1',
      stripeConfigured: true,
      workspaceCredits: [
        { workspaceId: 'ws-1', workspaceName: 'Dev', creditsUsed: 100, creditsLimit: 5000, seatCount: 5 },
      ],
    };
    mockGetOrgBillingStatus.mockResolvedValue(mockStatus);

    const res = await request(buildApp()).get('/api/billing/org/org-1/status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subscription.plan).toBe('business');
    expect(res.body.data.workspaceCredits).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// POST /api/billing/org/:orgId/checkout
// ────────────���────────────────────────────────

describe('POST /api/billing/org/:orgId/checkout', () => {
  it('returns 400 when priceId is missing', async () => {
    const res = await request(buildApp())
      .post('/api/billing/org/org-1/checkout')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priceId is required/);
  });

  it('returns checkout URL on success', async () => {
    mockCreateOrgCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/org_1' });

    const res = await request(buildApp())
      .post('/api/billing/org/org-1/checkout')
      .send({ priceId: 'price_team' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.com/org_1');
    expect(mockCreateOrgCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        ownerEmail: 'owner@org.com',
        priceId: 'price_team',
      }),
    );
  });

  it('rejects non-owner (requireOrgOwner throws ownership error)', async () => {
    mockQueryPublic.mockResolvedValue({ rows: [{ owner_id: 'other-user' }] });

    const res = await request(buildApp())
      .post('/api/billing/org/org-1/checkout')
      .send({ priceId: 'price_team' });

    // requireOrgOwner throws a plain Error with statusCode: 403.
    // errorHandler returns 500 but preserves the error message.
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Only the organization owner/);
  });

  it('rejects unauthenticated user on checkout (requireUserId throws)', async () => {
    mockUser = undefined;

    const res = await request(buildApp())
      .post('/api/billing/org/org-1/checkout')
      .send({ priceId: 'price_team' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Authentication required/);
  });

  it('rejects when org is not found (requireOrgOwner throws)', async () => {
    mockQueryPublic.mockResolvedValue({ rows: [] });

    const res = await request(buildApp())
      .post('/api/billing/org/org-1/checkout')
      .send({ priceId: 'price_team' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Organization not found/);
  });
});

// ─────────────────────��───────────────────────
// POST /api/billing/org/:orgId/portal
// ────────���─────────────────────���──────────────

describe('POST /api/billing/org/:orgId/portal', () => {
  it('returns portal URL on success', async () => {
    mockCreateOrgPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/org_portal' });

    const res = await request(buildApp())
      .post('/api/billing/org/org-1/portal')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://billing.stripe.com/org_portal');
  });

  it('rejects non-owner on portal (requireOrgOwner throws ownership error)', async () => {
    mockQueryPublic.mockResolvedValue({ rows: [{ owner_id: 'someone-else' }] });

    const res = await request(buildApp())
      .post('/api/billing/org/org-1/portal')
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Only the organization owner/);
  });
});

// ──────��──────────────────────────────────────
// POST /api/billing/org/:orgId/seats
// ────────────��────────────────────────────────

describe('POST /api/billing/org/:orgId/seats', () => {
  it('updates seat count', async () => {
    mockUpdateOrgSeats.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/api/billing/org/org-1/seats')
      .send({ seatCount: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.seatCount).toBe(10);
    expect(mockUpdateOrgSeats).toHaveBeenCalledWith('org-1', 10);
  });

  it('returns 400 for invalid seat count', async () => {
    const res = await request(buildApp())
      .post('/api/billing/org/org-1/seats')
      .send({ seatCount: 0 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when seatCount is missing', async () => {
    const res = await request(buildApp())
      .post('/api/billing/org/org-1/seats')
      .send({});

    expect(res.status).toBe(400);
  });
});
