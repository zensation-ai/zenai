/**
 * Route-level tests for POST /api/billing/admin/webhook-replay.
 *
 * Covers:
 * - Admin-only (403 for non-admin role)
 * - Missing / invalid event_id (400)
 * - Dry-run default (no state mutation)
 * - Force flag propagation
 * - Service error surface (4xx vs 5xx)
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

// Mutable JWT user so individual tests can flip role
let mockUser: { id: string; email: string; role?: string } | undefined = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { jwtUser?: unknown }).jwtUser = mockUser;
    next();
  },
}));

// Let the real RBAC middleware run so we exercise the 403 path.
// The rbac middleware reads `req.jwtUser.role` (among other sources).

const mockReplayStripeEvent = jest.fn();
const mockListBillingEvents = jest.fn();
jest.mock('../../../services/billing', () => ({
  // Routes import many exports; stub the ones the router touches.
  getSubscription: jest.fn(),
  getUserCredits: jest.fn(),
  deductCredits: jest.fn(),
  createCheckoutSession: jest.fn(),
  createPortalSession: jest.fn(),
  constructWebhookEvent: jest.fn(),
  processWebhookEvent: jest.fn(),
  replayStripeEvent: (...a: unknown[]) => mockReplayStripeEvent(...a),
  listBillingEvents: (...a: unknown[]) => mockListBillingEvents(...a),
  isStripeConfigured: () => true,
  getUserPlan: jest.fn().mockResolvedValue('enterprise'),
  getOrgBillingStatus: jest.fn(),
  createOrgCheckoutSession: jest.fn(),
  createOrgPortalSession: jest.fn(),
  updateOrgSeats: jest.fn(),
}));

jest.mock('../../../middleware/plan-gate', () => ({
  requirePlan: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRouter);
  app.use(errorHandler);
  return app;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('POST /api/billing/admin/webhook-replay', () => {
  beforeEach(() => {
    mockReplayStripeEvent.mockReset();
    mockUser = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
  });

  it('rejects non-admin users with 403', async () => {
    mockUser = { id: 'viewer-1', email: 'v@example.com', role: 'viewer' };
    const app = buildApp();

    const res = await request(app)
      .post('/api/billing/admin/webhook-replay')
      .send({ event_id: 'evt_abc' });

    expect(res.status).toBe(403);
    expect(mockReplayStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects when event_id is missing (400)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/billing/admin/webhook-replay').send({});
    expect(res.status).toBe(400);
    expect(mockReplayStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects when event_id is not a string (400)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/admin/webhook-replay')
      .send({ event_id: 42 });
    expect(res.status).toBe(400);
    expect(mockReplayStripeEvent).not.toHaveBeenCalled();
  });

  it('calls the service with dryRun=true by default', async () => {
    mockReplayStripeEvent.mockResolvedValue({
      eventId: 'evt_abc',
      eventType: 'customer.subscription.updated',
      dryRun: true,
      alreadyProcessed: false,
      action: 'process',
      processed: false,
      notes: 'Would process.',
    });

    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/admin/webhook-replay')
      .send({ event_id: 'evt_abc' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({ eventId: 'evt_abc', dryRun: true, processed: false }),
    });
    expect(mockReplayStripeEvent).toHaveBeenCalledWith('evt_abc', { dryRun: true, force: false });
  });

  it('forwards explicit dry_run=false and force=true', async () => {
    mockReplayStripeEvent.mockResolvedValue({
      eventId: 'evt_abc',
      eventType: 'customer.subscription.updated',
      dryRun: false,
      alreadyProcessed: true,
      action: 'force-replay',
      processed: true,
      notes: 'Replayed.',
    });

    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/admin/webhook-replay')
      .send({ event_id: 'evt_abc', dry_run: false, force: true });

    expect(res.status).toBe(200);
    expect(mockReplayStripeEvent).toHaveBeenCalledWith('evt_abc', { dryRun: false, force: true });
    expect(res.body.data.processed).toBe(true);
  });

  it('surfaces service errors with statusCode (e.g. 400 for invalid ID)', async () => {
    const err = Object.assign(new Error('Invalid Stripe event ID (expected prefix evt_)'), {
      statusCode: 400,
    });
    mockReplayStripeEvent.mockRejectedValue(err);

    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/admin/webhook-replay')
      .send({ event_id: 'bogus' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid Stripe event ID/);
  });

  it('returns 500 for unexpected service errors without a statusCode', async () => {
    mockReplayStripeEvent.mockRejectedValue(new Error('boom'));
    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/admin/webhook-replay')
      .send({ event_id: 'evt_abc' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/boom/);
  });
});

describe('GET /api/billing/admin/events', () => {
  beforeEach(() => {
    mockListBillingEvents.mockReset();
    mockUser = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
  });

  it('returns rows + total', async () => {
    mockListBillingEvents.mockResolvedValue({
      rows: [
        { id: 'a', stripe_event_id: 'evt_1', event_type: 'invoice.paid', user_id: 'u1', processed_at: '2026-04-10' },
      ],
      total: 1,
    });

    const app = buildApp();
    const res = await request(app).get('/api/billing/admin/events');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(mockListBillingEvents).toHaveBeenCalledWith({
      eventType: undefined,
      search: undefined,
      limit: undefined,
      offset: undefined,
    });
  });

  it('passes query filters through', async () => {
    mockListBillingEvents.mockResolvedValue({ rows: [], total: 0 });
    const app = buildApp();

    await request(app).get(
      '/api/billing/admin/events?event_type=invoice.paid&search=abc&limit=10&offset=5',
    );

    expect(mockListBillingEvents).toHaveBeenCalledWith({
      eventType: 'invoice.paid',
      search: 'abc',
      limit: 10,
      offset: 5,
    });
  });

  it('denies non-admins', async () => {
    mockUser = { id: 'user-1', email: 'user@example.com', role: 'user' };
    const app = buildApp();
    const res = await request(app).get('/api/billing/admin/events');
    expect(res.status).toBe(403);
    expect(mockListBillingEvents).not.toHaveBeenCalled();
  });
});
