/**
 * Billing Service
 *
 * Manages Stripe subscriptions, checkout sessions, customer portal, and
 * webhook event processing.
 *
 * Supports two modes:
 * - Legacy per-user billing (subscriptions table)
 * - Org-level billing (org_subscriptions + workspace_credits tables)
 *
 * When multi-tenancy is active, billing is per-organization. Each org has
 * one Stripe customer/subscription, and credits are distributed to workspaces.
 */

import Stripe from 'stripe';
import { queryPublic } from '../utils/database-context';
import { logger } from '../utils/logger';
import { recordStripeWebhookReplay } from './observability/metrics';
import type { OrgPlan } from '../types/multi-tenancy';
import { PLAN_LIMITS } from '../types/multi-tenancy';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanTier;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface OrgSubscription {
  id: string;
  orgId: string;
  plan: OrgPlan;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  seatCount: number;
}

export interface OrgBillingStatus {
  subscription: OrgSubscription;
  stripeCustomerId: string | null;
  stripeConfigured: boolean;
  workspaceCredits: Array<{
    workspaceId: string;
    workspaceName: string;
    creditsUsed: number;
    creditsLimit: number;
    seatCount: number;
  }>;
}

// ─────────────────────────────────────────────
// Stripe client (lazy-init, graceful degradation)
// ─────────────────────────────────────────────

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeClient) {return stripeClient;}
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

// ─────────────────────────────────────────────
// Database helpers
// ─────────────────────────────────────────────

function rowToSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    plan: (row.plan as PlanTier) || 'free',
    status: (row.status as string) || 'active',
    stripeCustomerId: (row.stripe_customer_id as string) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string) ?? null,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end as string) : null,
    cancelAtPeriodEnd: (row.cancel_at_period_end as boolean) || false,
  };
}

// ─────────────────────────────────────────────
// Subscription CRUD
// ─────────────────────────────────────────────

/**
 * Get the current subscription for a user (creates a free-tier row if none exists).
 */
export async function getSubscription(userId: string): Promise<Subscription> {
  const result = await queryPublic(
    `SELECT * FROM subscriptions WHERE user_id = $1`,
    [userId],
  );

  if (result.rows.length > 0) {
    return rowToSubscription(result.rows[0] as Record<string, unknown>);
  }

  // Lazily create a free-tier record for the user
  const inserted = await queryPublic(
    `INSERT INTO subscriptions (user_id, plan, status)
     VALUES ($1, 'free', 'active')
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId],
  );
  return rowToSubscription(inserted.rows[0] as Record<string, unknown>);
}

/**
 * Look up the plan tier for a user (used by plan-gate middleware).
 * Returns 'free' if no subscription record exists.
 */
export async function getUserPlan(userId: string): Promise<PlanTier> {
  try {
    const result = await queryPublic(
      `SELECT plan FROM subscriptions WHERE user_id = $1`,
      [userId],
    );
    if (result.rows.length === 0) {return 'free';}
    const row = result.rows[0] as Record<string, unknown>;
    return (row.plan as PlanTier) || 'free';
  } catch (err) {
    logger.warn('[BillingService] getUserPlan failed — defaulting to free', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'free';
  }
}

// ─────────────────────────────────────────────
// Stripe Checkout
// ─────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for a given price ID.
 * If the user already has a Stripe customer ID, it is reused.
 */
export async function createCheckoutSession({
  userId,
  userEmail,
  priceId,
  successUrl,
  cancelUrl,
}: {
  userId: string;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const sub = await getSubscription(userId);

  // Reuse existing customer or create a new one
  let customerId = sub.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { userId },
    });
    customerId = customer.id;
    await queryPublic(
      `UPDATE subscriptions SET stripe_customer_id = $1 WHERE user_id = $2`,
      [customerId, userId],
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
    subscription_data: { metadata: { userId } },
  });

  if (!session.url) {
    throw new Error('Stripe checkout session URL is null');
  }
  return { url: session.url };
}

// ─────────────────────────────────────────────
// Stripe Customer Portal
// ─────────────────────────────────────────────

/**
 * Create a Stripe Billing Portal session so the user can manage their subscription.
 */
export async function createPortalSession({
  userId,
  returnUrl,
}: {
  userId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const sub = await getSubscription(userId);

  if (!sub.stripeCustomerId) {
    throw new Error('No Stripe customer found for this user. Subscribe first.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

// ─────────────────────────────────────────────
// Webhook Processing
// ─────────────────────────────────────────────

/**
 * Validate and parse a Stripe webhook event from raw body + signature header.
 */
export function constructWebhookEvent(
  rawBody: Buffer | string,
  signature: string,
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * Idempotently process a Stripe webhook event.
 * Returns true if the event was processed, false if it was a duplicate.
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<boolean> {
  // Idempotency check
  const existing = await queryPublic(
    `SELECT id FROM billing_events WHERE stripe_event_id = $1`,
    [event.id],
  );
  if (existing.rows.length > 0) {
    logger.debug('[BillingService] Duplicate webhook event, skipping', { eventId: event.id });
    return false;
  }

  let userId: string | null = null;
  let orgId: string | null = null;

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;

      // Try org-level billing first (multi-tenancy)
      orgId = (stripeSub.metadata?.orgId as string) ?? null;
      if (!orgId) {
        orgId = await findOrgByCustomerId(stripeSub.customer as string);
      }

      if (orgId) {
        await syncOrgSubscription(orgId, stripeSub);
      }

      // Also sync legacy per-user billing
      userId = (stripeSub.metadata?.userId as string) ?? null;
      if (!userId) {
        userId = await findUserByCustomerId(stripeSub.customer as string);
      }
      if (userId) {
        await syncSubscription(userId, stripeSub);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      // Update org-level status if applicable
      orgId = await findOrgByCustomerId(customerId);
      if (orgId) {
        await queryPublic(
          `UPDATE public.org_subscriptions SET status = 'past_due', updated_at = NOW() WHERE org_id = $1`,
          [orgId],
        );
        logger.warn('[BillingService] Payment failed — org subscription set to past_due', { orgId });
      }

      // Also update legacy per-user status
      userId = await findUserByCustomerId(customerId);
      if (userId) {
        await queryPublic(
          `UPDATE subscriptions SET status = 'past_due' WHERE user_id = $1`,
          [userId],
        );
        logger.warn('[BillingService] Payment failed — subscription set to past_due', { userId });
      }
      break;
    }

    default:
      // Non-critical event types — log but don't fail
      logger.debug('[BillingService] Unhandled webhook event type', { type: event.type });
  }

  // Record the event (audit trail + idempotency)
  await queryPublic(
    `INSERT INTO billing_events (stripe_event_id, event_type, user_id, org_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [event.id, event.type, userId, orgId, JSON.stringify(event.data.object)],
  );

  return true;
}

// ─────────────────────────────────────────────
// Admin: Webhook Replay
// ─────────────────────────────────────────────

export interface ReplayOptions {
  /** If true (default), do not mutate state — report what would happen. */
  dryRun?: boolean;
  /**
   * If true, delete the existing billing_events row before re-processing so
   * side effects run again. Without force, a prior success is reported as
   * a no-op (idempotent).
   */
  force?: boolean;
}

export interface ReplayResult {
  eventId: string;
  eventType: string;
  dryRun: boolean;
  alreadyProcessed: boolean;
  action: 'skip' | 'process' | 'force-replay';
  processed: boolean;
  notes: string;
}

/**
 * Replay a Stripe webhook event by event ID. Admin-only operation. The
 * default mode is a dry-run that reports the planned action without
 * touching state; pass `dryRun=false` to mutate, and `force=true` to
 * re-run side effects even for events already in `billing_events`.
 */
export async function replayStripeEvent(
  eventId: string,
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const dryRun = options.dryRun ?? true;
  const force = options.force ?? false;

  // Basic validation — Stripe event IDs always start with `evt_`
  if (!eventId || typeof eventId !== 'string' || !eventId.startsWith('evt_')) {
    throw Object.assign(new Error('Invalid Stripe event ID (expected prefix evt_)'), { statusCode: 400 });
  }

  // Fetch the event from Stripe so we always see the latest payload
  const event = await getStripe().events.retrieve(eventId);

  // Idempotency lookup
  const existing = await queryPublic(
    `SELECT id FROM billing_events WHERE stripe_event_id = $1`,
    [event.id],
  );
  const alreadyProcessed = existing.rows.length > 0;

  // Decide action
  let action: ReplayResult['action'];
  if (alreadyProcessed && !force) {
    action = 'skip';
  } else if (alreadyProcessed && force) {
    action = 'force-replay';
  } else {
    action = 'process';
  }

  if (dryRun) {
    try {
      recordStripeWebhookReplay(action, { dryRun: true, processed: false, eventType: event.type });
    } catch { /* best-effort metric */ }
    return {
      eventId: event.id,
      eventType: event.type,
      dryRun: true,
      alreadyProcessed,
      action,
      processed: false,
      notes:
        action === 'skip'
          ? 'Event already recorded; replay would be a no-op. Pass force=true to re-run side effects.'
          : action === 'force-replay'
          ? 'Event already recorded; replay would DELETE the billing_events row and re-run side effects.'
          : 'Event has not been processed before; replay would process it and insert a billing_events row.',
    };
  }

  // Non-dry-run branch — mutate state
  if (action === 'skip') {
    try {
      recordStripeWebhookReplay('skip', { dryRun: false, processed: false, eventType: event.type });
    } catch { /* best-effort metric */ }
    return {
      eventId: event.id,
      eventType: event.type,
      dryRun: false,
      alreadyProcessed: true,
      action: 'skip',
      processed: false,
      notes: 'Event already recorded; not replayed. Pass force=true to re-run.',
    };
  }

  if (action === 'force-replay') {
    await queryPublic(
      `DELETE FROM billing_events WHERE stripe_event_id = $1`,
      [event.id],
    );
    logger.warn('[BillingService] Force-replay deleted existing billing_events row', {
      eventId: event.id,
      eventType: event.type,
    });
  }

  const processed = await processWebhookEvent(event);

  logger.info('[BillingService] Webhook replay complete', {
    eventId: event.id,
    eventType: event.type,
    action,
    processed,
  });

  try {
    recordStripeWebhookReplay(action, { dryRun: false, processed, eventType: event.type });
  } catch { /* best-effort metric */ }

  return {
    eventId: event.id,
    eventType: event.type,
    dryRun: false,
    alreadyProcessed,
    action,
    processed,
    notes: processed
      ? 'Event replayed successfully.'
      : 'processWebhookEvent returned false — likely a race with another replay.',
  };
}

// ─────────────────────────────────────────────
// Admin: Event listing (Sprint 1.8 Commit 3)
// ─────────────────────────────────────────────

export interface BillingEventRow {
  id: string;
  stripe_event_id: string;
  event_type: string;
  user_id: string | null;
  processed_at: string;
}

export interface ListBillingEventsOptions {
  /** Filter by event_type (exact match). */
  eventType?: string;
  /** Filter by stripe_event_id substring (LIKE). */
  search?: string;
  /** Default 50, cap 200. */
  limit?: number;
  /** Default 0. */
  offset?: number;
}

export interface ListBillingEventsResult {
  rows: BillingEventRow[];
  total: number;
}

/**
 * List recent Stripe webhook events recorded in billing_events. Admin-only.
 * Drives the webhook-replay admin dashboard.
 */
export async function listBillingEvents(
  options: ListBillingEventsOptions = {},
): Promise<ListBillingEventsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (options.eventType) {
    params.push(options.eventType);
    conditions.push(`event_type = $${params.length}`);
  }
  if (options.search) {
    params.push(`%${options.search}%`);
    conditions.push(`stripe_event_id ILIKE $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await queryPublic(
    `SELECT COUNT(*)::int AS c FROM billing_events ${where}`,
    [...params],
  );
  const total = (countRes.rows[0]?.c as number | undefined) ?? 0;

  const rowsParams = [...params, limit, offset];
  const rowsRes = await queryPublic(
    `SELECT id, stripe_event_id, event_type, user_id, processed_at
       FROM billing_events
       ${where}
       ORDER BY processed_at DESC
       LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
    rowsParams,
  );

  return {
    rows: rowsRes.rows as BillingEventRow[],
    total,
  };
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Map a Stripe Subscription to our plan tier and upsert the subscriptions table.
 */
async function syncSubscription(
  userId: string,
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

  // Determine plan from the first line item's price ID
  const priceId = stripeSub.items.data[0]?.price?.id;
  let plan: PlanTier = 'free';
  if (priceId && enterprisePriceId && priceId === enterprisePriceId) {
    plan = 'enterprise';
  } else if (priceId && proPriceId && priceId === proPriceId) {
    plan = 'pro';
  }

  // Map Stripe status to our status enum
  const status = mapStripeStatus(stripeSub.status);

  // If subscription is canceled/expired, revert to free
  if (['canceled', 'incomplete_expired'].includes(status)) {
    plan = 'free';
  }

  // Use runtime cast — Stripe v20 types restructured some Subscription fields
  const subRaw = stripeSub as unknown as Record<string, unknown>;
  const periodEndTs = subRaw.current_period_end as number | null | undefined;
  const cancelAtPeriodEnd = (subRaw.cancel_at_period_end as boolean | null | undefined) ?? false;
  const periodEnd = periodEndTs ? new Date(periodEndTs * 1000) : null;

  await queryPublic(
    `INSERT INTO subscriptions
       (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       plan                   = EXCLUDED.plan,
       status                 = EXCLUDED.status,
       stripe_customer_id     = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       current_period_end     = EXCLUDED.current_period_end,
       cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
       updated_at             = NOW()`,
    [
      userId,
      plan,
      status,
      stripeSub.customer as string,
      stripeSub.id,
      periodEnd,
      cancelAtPeriodEnd,
    ],
  );

  // Provision/update credits when plan changes
  const limit = PLAN_CREDIT_LIMITS[plan] || PLAN_CREDIT_LIMITS.free;
  await queryPublic(
    `INSERT INTO public.user_credits (user_id, plan, credits_limit)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       plan = EXCLUDED.plan,
       credits_limit = EXCLUDED.credits_limit`,
    [userId, plan, limit],
  ).catch(err => {
    // Non-critical: credit table might not exist yet
    logger.debug('[BillingService] Credit provisioning skipped', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info('[BillingService] Subscription synced', { userId, plan, status });
}

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  const map: Record<Stripe.Subscription.Status, string> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    unpaid: 'unpaid',
    paused: 'past_due',
  };
  return map[stripeStatus] ?? 'active';
}

// ─────────────────────────────────────────────
// Credit Tracking
// ─────────────────────────────────────────────

export const PLAN_CREDIT_LIMITS: Record<PlanTier, number> = {
  free: 50,
  pro: 2000,
  enterprise: 999999, // effectively unlimited
};

export interface UserCredits {
  remaining: number;
  used: number;
  limit: number;
  plan: PlanTier;
}

/**
 * Get the credit balance for a user in the current billing period.
 * Falls back to plan defaults if no credit record exists.
 */
export async function getUserCredits(userId: string): Promise<UserCredits> {
  const { rows } = await queryPublic(
    `SELECT credits_limit - credits_used AS credits_remaining, credits_used, plan, credits_limit
     FROM public.user_credits
     WHERE user_id = $1
       AND period_end > now()`,
    [userId],
  );

  if (rows.length === 0) {
    const plan = await getUserPlan(userId);
    return {
      remaining: PLAN_CREDIT_LIMITS[plan],
      used: 0,
      limit: PLAN_CREDIT_LIMITS[plan],
      plan,
    };
  }

  const row = rows[0] as Record<string, unknown>;
  const plan = (row.plan as PlanTier) || 'free';
  return {
    remaining: Number(row.credits_remaining),
    used: Number(row.credits_used),
    limit: Number(row.credits_limit),
    plan,
  };
}

/**
 * Deduct credits from a user's balance. Throws if insufficient credits.
 * Records a transaction for audit trail.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<UserCredits> {
  const { rows } = await queryPublic(
    `UPDATE public.user_credits
     SET credits_used = credits_used + $2
     WHERE user_id = $1
       AND period_end > now()
       AND (credits_limit - credits_used) >= $2
     RETURNING credits_limit - credits_used AS credits_remaining, credits_used, plan, credits_limit`,
    [userId, amount],
  );

  if (rows.length === 0) {
    throw new Error('Insufficient credits');
  }

  // Record the transaction
  await queryPublic(
    `INSERT INTO public.credit_transactions (user_id, amount, reason, metadata)
     VALUES ($1, $2, $3, $4)`,
    [userId, -amount, reason, JSON.stringify(metadata)],
  );

  const row = rows[0] as Record<string, unknown>;
  const plan = (row.plan as PlanTier) || 'free';
  return {
    remaining: Number(row.credits_remaining),
    used: Number(row.credits_used),
    limit: Number(row.credits_limit),
    plan,
  };
}

/**
 * Reset credits for all users whose billing period has expired.
 * Called by a monthly cron job or BullMQ worker.
 */
export async function resetMonthlyCredits(): Promise<number> {
  const { rowCount } = await queryPublic(
    `UPDATE public.user_credits
     SET credits_used = 0,
         period_start = date_trunc('month', now()),
         period_end = date_trunc('month', now()) + INTERVAL '1 month'
     WHERE period_end <= now()`,
    [],
  );
  return rowCount ?? 0;
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

async function findUserByCustomerId(customerId: string): Promise<string | null> {
  const result = await queryPublic(
    `SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
    [customerId],
  );
  if (result.rows.length === 0) {return null;}
  const row = result.rows[0] as Record<string, unknown>;
  return (row.user_id as string) ?? null;
}

// ─────────────────────────────────────────────
// Org-Level Billing (Multi-Tenancy)
// ─────────────────────────────────────────────

function rowToOrgSubscription(row: Record<string, unknown>): OrgSubscription {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    plan: (row.plan as OrgPlan) || 'free',
    status: (row.status as string) || 'active',
    stripeSubscriptionId: (row.stripe_subscription_id as string) ?? null,
    currentPeriodStart: row.current_period_start ? new Date(row.current_period_start as string) : null,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end as string) : null,
    cancelAtPeriodEnd: (row.cancel_at_period_end as boolean) || false,
    seatCount: Number(row.seat_count) || 1,
  };
}

/**
 * Get org subscription (creates free-tier row if none exists).
 */
export async function getOrgSubscription(orgId: string): Promise<OrgSubscription> {
  const result = await queryPublic(
    `SELECT * FROM public.org_subscriptions WHERE org_id = $1`,
    [orgId],
  );

  if (result.rows.length > 0) {
    return rowToOrgSubscription(result.rows[0] as Record<string, unknown>);
  }

  const inserted = await queryPublic(
    `INSERT INTO public.org_subscriptions (org_id, plan, status)
     VALUES ($1, 'free', 'active')
     ON CONFLICT (org_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [orgId],
  );
  return rowToOrgSubscription(inserted.rows[0] as Record<string, unknown>);
}

/**
 * Get full org billing status including workspace credit breakdown.
 */
export async function getOrgBillingStatus(orgId: string): Promise<OrgBillingStatus> {
  const subscription = await getOrgSubscription(orgId);

  const orgResult = await queryPublic(
    `SELECT stripe_customer_id FROM public.organizations WHERE id = $1`,
    [orgId],
  );
  const stripeCustomerId = orgResult.rows.length > 0
    ? ((orgResult.rows[0] as Record<string, unknown>).stripe_customer_id as string) ?? null
    : null;

  const creditsResult = await queryPublic(
    `SELECT wc.workspace_id, w.name AS workspace_name,
            wc.credits_used, wc.credits_limit, wc.seat_count
     FROM public.workspace_credits wc
     JOIN public.workspaces w ON w.id = wc.workspace_id
     WHERE w.org_id = $1`,
    [orgId],
  );

  const workspaceCredits = (creditsResult.rows as Record<string, unknown>[]).map(r => ({
    workspaceId: r.workspace_id as string,
    workspaceName: r.workspace_name as string,
    creditsUsed: Number(r.credits_used),
    creditsLimit: Number(r.credits_limit),
    seatCount: Number(r.seat_count),
  }));

  return {
    subscription,
    stripeCustomerId,
    stripeConfigured: isStripeConfigured(),
    workspaceCredits,
  };
}

/**
 * Create a Stripe Checkout session for an organization.
 */
export async function createOrgCheckoutSession({
  orgId,
  ownerEmail,
  priceId,
  seats,
  successUrl,
  cancelUrl,
}: {
  orgId: string;
  ownerEmail: string;
  priceId: string;
  seats?: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();

  // Get or create Stripe customer for the org
  const orgResult = await queryPublic(
    `SELECT stripe_customer_id, name FROM public.organizations WHERE id = $1`,
    [orgId],
  );
  if (orgResult.rows.length === 0) {
    throw new Error('Organization not found');
  }
  const orgRow = orgResult.rows[0] as Record<string, unknown>;
  let customerId = orgRow.stripe_customer_id as string | null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: ownerEmail,
      name: orgRow.name as string,
      metadata: { orgId },
    });
    customerId = customer.id;
    await queryPublic(
      `UPDATE public.organizations SET stripe_customer_id = $1 WHERE id = $2`,
      [customerId, orgId],
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: seats ?? 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { orgId },
    subscription_data: { metadata: { orgId } },
  });

  if (!session.url) {
    throw new Error('Stripe checkout session URL is null');
  }
  return { url: session.url };
}

/**
 * Create a Stripe Billing Portal session for an organization.
 */
export async function createOrgPortalSession({
  orgId,
  returnUrl,
}: {
  orgId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();

  const orgResult = await queryPublic(
    `SELECT stripe_customer_id FROM public.organizations WHERE id = $1`,
    [orgId],
  );
  if (orgResult.rows.length === 0) {
    throw new Error('Organization not found');
  }

  const customerId = (orgResult.rows[0] as Record<string, unknown>).stripe_customer_id as string | null;
  if (!customerId) {
    throw new Error('No Stripe customer found for this organization. Subscribe first.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

/**
 * Sync a Stripe subscription to the org-level billing tables.
 * Called from webhook processing when orgId is present.
 */
export async function syncOrgSubscription(
  orgId: string,
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const plan = mapStripePriceToOrgPlan(stripeSub);
  const status = mapStripeStatus(stripeSub.status);

  const subRaw = stripeSub as unknown as Record<string, unknown>;
  const periodStartTs = subRaw.current_period_start as number | null | undefined;
  const periodEndTs = subRaw.current_period_end as number | null | undefined;
  const cancelAtPeriodEnd = (subRaw.cancel_at_period_end as boolean | null | undefined) ?? false;
  const periodStart = periodStartTs ? new Date(periodStartTs * 1000) : null;
  const periodEnd = periodEndTs ? new Date(periodEndTs * 1000) : null;

  // Seat count from the subscription quantity
  const seatCount = stripeSub.items.data[0]?.quantity ?? 1;

  // Upsert org_subscriptions
  await queryPublic(
    `INSERT INTO public.org_subscriptions
       (org_id, plan, status, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, seat_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (org_id) DO UPDATE SET
       plan                   = EXCLUDED.plan,
       status                 = EXCLUDED.status,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       current_period_start   = EXCLUDED.current_period_start,
       current_period_end     = EXCLUDED.current_period_end,
       cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
       seat_count             = EXCLUDED.seat_count,
       updated_at             = NOW()`,
    [orgId, plan, status, stripeSub.id, periodStart, periodEnd, cancelAtPeriodEnd, seatCount],
  );

  // Update org plan
  await queryPublic(
    `UPDATE public.organizations SET plan = $1, stripe_subscription_id = $2, updated_at = NOW() WHERE id = $3`,
    [plan, stripeSub.id, orgId],
  );

  // Provision/update workspace credits for all workspaces in this org
  await provisionOrgWorkspaceCredits(orgId, plan, periodStart, periodEnd);

  logger.info('[BillingService] Org subscription synced', { orgId, plan, status, seatCount });
}

/**
 * Provision workspace credits for all workspaces in an org.
 */
async function provisionOrgWorkspaceCredits(
  orgId: string,
  plan: OrgPlan,
  periodStart: Date | null,
  periodEnd: Date | null,
): Promise<void> {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const workspaces = await queryPublic(
    `SELECT id FROM public.workspaces WHERE org_id = $1`,
    [orgId],
  );

  for (const ws of workspaces.rows as Record<string, unknown>[]) {
    const wsId = ws.id as string;
    await queryPublic(
      `INSERT INTO public.workspace_credits (workspace_id, plan, credits_limit, seat_limit, period_start, period_end)
       VALUES ($1, $2, $3, $4, COALESCE($5, date_trunc('month', now())), COALESCE($6, date_trunc('month', now()) + INTERVAL '1 month'))
       ON CONFLICT (workspace_id) DO UPDATE SET
         plan = EXCLUDED.plan,
         credits_limit = EXCLUDED.credits_limit,
         seat_limit = EXCLUDED.seat_limit,
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         updated_at = NOW()`,
      [wsId, plan, limits.creditsPerMonth, limits.maxSeats, periodStart, periodEnd],
    );
  }
}

/**
 * Map Stripe price ID to OrgPlan tier.
 */
function mapStripePriceToOrgPlan(stripeSub: Stripe.Subscription): OrgPlan {
  const priceId = stripeSub.items.data[0]?.price?.id;
  const personalPriceId = process.env.STRIPE_PERSONAL_PRICE_ID;
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  // Sprint 1.1 (2026-04-16): renamed STRIPE_TEAM_PRICE_ID → STRIPE_BUSINESS_PRICE_ID.
  // Fallback to legacy env-var so deployments without the new name still resolve correctly.
  const businessPriceId = process.env.STRIPE_BUSINESS_PRICE_ID ?? process.env.STRIPE_TEAM_PRICE_ID;
  const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

  if (priceId && enterprisePriceId && priceId === enterprisePriceId) return 'enterprise';
  if (priceId && businessPriceId && priceId === businessPriceId) return 'business';
  if (priceId && proPriceId && priceId === proPriceId) return 'pro';
  if (priceId && personalPriceId && priceId === personalPriceId) return 'personal';
  return 'free';
}

/**
 * Find org by Stripe customer ID.
 */
export async function findOrgByCustomerId(customerId: string): Promise<string | null> {
  const result = await queryPublic(
    `SELECT id FROM public.organizations WHERE stripe_customer_id = $1`,
    [customerId],
  );
  if (result.rows.length === 0) return null;
  return (result.rows[0] as Record<string, unknown>).id as string;
}

/**
 * Update seat count for an org and sync to workspace credit limits.
 */
export async function updateOrgSeats(orgId: string, newSeatCount: number): Promise<void> {
  await queryPublic(
    `UPDATE public.org_subscriptions SET seat_count = $1, updated_at = NOW() WHERE org_id = $2`,
    [newSeatCount, orgId],
  );
  // Update seat_count on all workspace credits
  await queryPublic(
    `UPDATE public.workspace_credits wc
     SET seat_count = $1, updated_at = NOW()
     FROM public.workspaces w
     WHERE wc.workspace_id = w.id AND w.org_id = $2`,
    [newSeatCount, orgId],
  );
}
