/**
 * Billing Routes
 *
 * POST /api/billing/checkout     — Create Stripe Checkout session (per-user)
 * POST /api/billing/portal       — Create Stripe Customer Portal session (per-user)
 * GET  /api/billing/status       — Get current subscription for the logged-in user
 * POST /api/billing/webhook      — Stripe webhook (raw body, no auth)
 *
 * Org-Level (multi-tenancy):
 * GET  /api/billing/org/:orgId/status    — Get org billing status + workspace credits
 * POST /api/billing/org/:orgId/checkout  — Create Stripe Checkout for org
 * POST /api/billing/org/:orgId/portal    — Create Stripe Portal for org
 * POST /api/billing/org/:orgId/seats     — Update seat count
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { jwtAuth } from '../middleware/jwt-auth';
import { requireRole } from '../middleware/rbac';
import { logger } from '../utils/logger';
import {
  getSubscription,
  getUserCredits,
  deductCredits,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  processWebhookEvent,
  replayStripeEvent,
  listBillingEvents,
  isStripeConfigured,
  getOrgBillingStatus,
  createOrgCheckoutSession,
  createOrgPortalSession,
  updateOrgSeats,
} from '../services/billing';
import {
  createCheckoutSession as createTierCheckoutSession,
  createPortalSession as createTierPortalSession,
  handleWebhookEvent as handleStripeWebhookEvent,
  verifyWebhookSignature,
  isBillableTier,
  getConfiguredTiers,
  type BillableTier,
} from '../services/billing/stripe-service';
import { requirePlan } from '../middleware/plan-gate';

export const billingRouter = Router();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function requireUserId(req: Request): string {
  const id = req.jwtUser?.id;
  if (!id) {
    throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  }
  return id;
}

// ─────────────────────────────────────────────
// GET /api/billing/status
// ─────────────────────────────────────────────

billingRouter.get(
  '/status',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const subscription = await getSubscription(userId);

    return res.json({
      success: true,
      data: subscription,
      stripeConfigured: isStripeConfigured(),
    });
  }),
);

// ─────────────────────────────────────────────
// GET /api/billing/credits
// ─────────────────────────────────────────────

billingRouter.get(
  '/credits',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const credits = await getUserCredits(userId);
    return res.json({ success: true, data: credits });
  }),
);

// ─────────────────────────────────────────────
// POST /api/billing/credits/deduct  (enterprise admin only)
// ─────────────────────────────────────────────

billingRouter.post(
  '/credits/deduct',
  jwtAuth,
  requirePlan('enterprise'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, amount, reason } = req.body as {
      userId?: string;
      amount?: number;
      reason?: string;
    };

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'userId and positive amount are required' });
    }

    const credits = await deductCredits(userId, amount, reason || 'admin_deduction', {
      adminId: requireUserId(req),
    });
    return res.json({ success: true, data: credits });
  }),
);

// ─────────────────────────────────────────────
// POST /api/billing/checkout
// ─────────────────────────────────────────────

billingRouter.post(
  '/checkout',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const userEmail = req.jwtUser?.email;

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'User email not found in token' });
    }

    const { priceId, successUrl, cancelUrl } = req.body as {
      priceId?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!priceId) {
      return res.status(400).json({ success: false, error: 'priceId is required' });
    }

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
    const resolvedSuccessUrl = successUrl || `${appUrl}/system/benutzer/billing?success=1`;
    const resolvedCancelUrl = cancelUrl || `${appUrl}/system/benutzer/billing?canceled=1`;

    const { url } = await createCheckoutSession({
      userId,
      userEmail,
      priceId,
      successUrl: resolvedSuccessUrl,
      cancelUrl: resolvedCancelUrl,
    });

    return res.json({ success: true, url });
  }),
);

// ─────────────────────────────────────────────
// POST /api/billing/checkout-session   (Sprint 1.6 — tier-based)
// ─────────────────────────────────────────────
//
// Friendlier alternative to /checkout: accepts a tier name instead of a raw
// Stripe price ID so the frontend doesn't need to know VITE_STRIPE_*_PRICE_ID.
// Enterprise is not self-serve — the frontend directs users to sales.

billingRouter.post(
  '/checkout-session',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const userEmail = req.jwtUser?.email;

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'User email not found in token' });
    }

    const { tier, quantity, successUrl, cancelUrl } = req.body as {
      tier?: string;
      quantity?: number;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!isBillableTier(tier)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier '${String(tier)}'. Expected one of: personal, pro, business.`,
      });
    }

    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
    }

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
    const resolvedSuccessUrl = successUrl || `${appUrl}/system/benutzer/billing?success=1`;
    const resolvedCancelUrl = cancelUrl || `${appUrl}/system/benutzer/billing?canceled=1`;

    try {
      const { url } = await createTierCheckoutSession({
        userId,
        userEmail,
        tier: tier as BillableTier,
        quantity,
        successUrl: resolvedSuccessUrl,
        cancelUrl: resolvedCancelUrl,
      });
      return res.json({ success: true, url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[Billing] checkout-session failed', { userId, tier, error: msg });
      return res.status(400).json({ success: false, error: msg });
    }
  }),
);

// ─────────────────────────────────────────────
// POST /api/billing/portal-session   (Sprint 1.6)
// ─────────────────────────────────────────────
//
// Functional alias for /portal with consistent Sprint 1.6 naming. Uses the
// same service call — kept as separate route so BillingTab.tsx can call the
// new-style endpoints without touching the legacy ones.

billingRouter.post(
  '/portal-session',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { returnUrl } = req.body as { returnUrl?: string };

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
    const resolvedReturnUrl = returnUrl || `${appUrl}/system/benutzer/billing`;

    try {
      const { url } = await createTierPortalSession({ userId, returnUrl: resolvedReturnUrl });
      return res.json({ success: true, url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[Billing] portal-session failed', { userId, error: msg });
      return res.status(400).json({ success: false, error: msg });
    }
  }),
);

// ─────────────────────────────────────────────
// GET /api/billing/tiers   (Sprint 1.6)
// ─────────────────────────────────────────────
//
// Returns which tiers are currently bookable in this deployment — lets the
// UI hide upgrade buttons for unconfigured tiers.

billingRouter.get(
  '/tiers',
  asyncHandler(async (_req: Request, res: Response) => {
    const tiers = getConfiguredTiers();
    return res.json({
      success: true,
      data: {
        tiers,
        stripeConfigured: isStripeConfigured(),
      },
    });
  }),
);

// ─────────────────────────────────────────────
// POST /api/billing/portal
// ─────────────────────────────────────────────

billingRouter.post(
  '/portal',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { returnUrl } = req.body as { returnUrl?: string };

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
    const resolvedReturnUrl = returnUrl || `${appUrl}/system/benutzer/billing`;

    const { url } = await createPortalSession({ userId, returnUrl: resolvedReturnUrl });
    return res.json({ success: true, url });
  }),
);

// ─────────────────────────────────────────────
// Org-Level Billing (Multi-Tenancy)
// ─────────────────────────────────────────────

/**
 * Require that the current user is the org owner.
 */
async function requireOrgOwner(req: Request, orgId: string): Promise<void> {
  const userId = requireUserId(req);
  // Import queryPublic inline to check org ownership
  const { queryPublic } = await import('../utils/database-context');
  const result = await queryPublic(
    `SELECT owner_id FROM public.organizations WHERE id = $1`,
    [orgId],
  );
  if (result.rows.length === 0) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }
  if ((result.rows[0] as Record<string, unknown>).owner_id !== userId) {
    throw Object.assign(new Error('Only the organization owner can manage billing'), { statusCode: 403 });
  }
}

// GET /api/billing/org/:orgId/status
billingRouter.get(
  '/org/:orgId/status',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    // Verify caller is at least a member of this org
    const userId = requireUserId(req);
    const { queryPublic: qp } = await import('../utils/database-context');
    const memberCheck = await qp(
      'SELECT 1 FROM public.organization_members WHERE org_id = $1 AND user_id = $2',
      [orgId, userId],
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Not a member of this organization' });
    }
    const status = await getOrgBillingStatus(orgId);
    return res.json({ success: true, data: status });
  }),
);

// POST /api/billing/org/:orgId/checkout
billingRouter.post(
  '/org/:orgId/checkout',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    await requireOrgOwner(req, orgId);

    const userEmail = req.jwtUser?.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'User email not found in token' });
    }

    const { priceId, seats, successUrl, cancelUrl } = req.body as {
      priceId?: string;
      seats?: number;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!priceId) {
      return res.status(400).json({ success: false, error: 'priceId is required' });
    }

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
    const resolvedSuccessUrl = successUrl || `${appUrl}/system/benutzer/billing?success=1`;
    const resolvedCancelUrl = cancelUrl || `${appUrl}/system/benutzer/billing?canceled=1`;

    const { url } = await createOrgCheckoutSession({
      orgId,
      ownerEmail: userEmail,
      priceId,
      seats,
      successUrl: resolvedSuccessUrl,
      cancelUrl: resolvedCancelUrl,
    });

    return res.json({ success: true, url });
  }),
);

// POST /api/billing/org/:orgId/portal
billingRouter.post(
  '/org/:orgId/portal',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    await requireOrgOwner(req, orgId);

    const { returnUrl } = req.body as { returnUrl?: string };
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
    const resolvedReturnUrl = returnUrl || `${appUrl}/system/benutzer/billing`;

    const { url } = await createOrgPortalSession({ orgId, returnUrl: resolvedReturnUrl });
    return res.json({ success: true, url });
  }),
);

// POST /api/billing/org/:orgId/seats
billingRouter.post(
  '/org/:orgId/seats',
  jwtAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    await requireOrgOwner(req, orgId);

    const { seatCount } = req.body as { seatCount?: number };
    if (!seatCount || seatCount < 1) {
      return res.status(400).json({ success: false, error: 'seatCount must be >= 1' });
    }

    await updateOrgSeats(orgId, seatCount);
    return res.json({ success: true, data: { seatCount } });
  }),
);

// ─────────────────────────────────────────────
// POST /api/billing/webhook  (NO auth — Stripe calls this directly)
// ─────────────────────────────────────────────

billingRouter.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      logger.warn('[BillingWebhook] Missing stripe-signature header');
      return res.status(400).json({ success: false, error: 'Missing stripe-signature' });
    }

    // rawBody is captured by the express.json() verify callback in MiddlewareModule
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      logger.warn('[BillingWebhook] rawBody not available — check middleware verify callback');
      return res.status(400).json({ success: false, error: 'Raw body not available' });
    }

    let event;
    try {
      event = verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[BillingWebhook] Signature verification failed', { error: msg });
      return res.status(400).json({ success: false, error: `Webhook signature invalid: ${msg}` });
    }

    try {
      const result = await handleStripeWebhookEvent(event);
      logger.info('[BillingWebhook] Event processed', {
        eventId: event.id,
        type: event.type,
        processed: result.processed,
        duplicate: result.duplicate,
      });
      return res.json({ success: true, received: true, duplicate: result.duplicate });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[BillingWebhook] Event processing failed', err instanceof Error ? err : undefined, {
        eventId: event.id,
        type: event.type,
      });
      return res.status(500).json({ success: false, error: msg });
    }
  }),
);

// ─────────────────────────────────────────────
// POST /api/billing/admin/webhook-replay  (admin-only)
//
// Re-runs a Stripe webhook event by ID. Default is a dry-run that reports
// the planned action without mutating state. Pass `dry_run=false` to
// actually process, and `force=true` to replay an event that was already
// recorded in billing_events (the force path deletes the row first so the
// idempotency guard does not short-circuit side effects).
// ─────────────────────────────────────────────

billingRouter.post(
  '/admin/webhook-replay',
  jwtAuth,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { event_id, dry_run, force } = req.body as {
      event_id?: string;
      dry_run?: boolean;
      force?: boolean;
    };

    if (!event_id || typeof event_id !== 'string') {
      return res.status(400).json({ success: false, error: 'event_id is required' });
    }

    try {
      const result = await replayStripeEvent(event_id, {
        dryRun: dry_run ?? true,
        force: force ?? false,
      });

      logger.info('[BillingAdmin] Webhook replay invoked', {
        adminId: req.jwtUser?.id,
        eventId: result.eventId,
        action: result.action,
        dryRun: result.dryRun,
        processed: result.processed,
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(status).json({ success: false, error: msg });
    }
  }),
);

// ─────────────────────────────────────────────
// GET /api/billing/admin/events  (admin-only)
//
// Lists recent Stripe webhook events recorded in billing_events. Used by
// the admin dashboard to find candidates for replay. Filters: event_type,
// search (stripe_event_id ILIKE), limit, offset.
// ─────────────────────────────────────────────

billingRouter.get(
  '/admin/events',
  jwtAuth,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const eventType = typeof req.query.event_type === 'string' ? req.query.event_type : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;

    const result = await listBillingEvents({
      eventType,
      search,
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });

    return res.json({ success: true, data: result.rows, total: result.total });
  }),
);
