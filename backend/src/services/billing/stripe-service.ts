/**
 * Stripe Service — Sprint 1.6 (SaaS-Launch-Readiness)
 *
 * Tier-based checkout, customer portal, and idempotent webhook processing.
 *
 * Sits on top of the legacy per-user/per-org billing service (services/billing.ts):
 *  - Resolves friendly tier names (personal/pro/business) to Stripe price IDs.
 *  - Deduplicates raw webhook events at the ingestion layer via
 *    public.stripe_webhook_events (migration: sprint_1_6_stripe_webhook_events.sql).
 *  - Delegates domain-level handling back to services/billing.ts so we don't
 *    duplicate the `billing_events` audit trail or the subscription sync logic.
 */

import Stripe from 'stripe';
import { queryPublic } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import {
  createCheckoutSession as createLegacyCheckoutSession,
  createPortalSession as createLegacyPortalSession,
  constructWebhookEvent,
  processWebhookEvent as processLegacyWebhookEvent,
} from '../billing';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BillableTier = 'personal' | 'pro' | 'business';

export interface CheckoutSessionInput {
  userId: string;
  userEmail: string;
  tier: BillableTier;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
}

export interface PortalSessionInput {
  userId: string;
  returnUrl: string;
}

export interface WebhookProcessingResult {
  processed: boolean;
  duplicate: boolean;
  eventId: string;
  type: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier → Price-ID mapping
// ─────────────────────────────────────────────────────────────────────────────

const TIER_PRICE_ENV: Record<BillableTier, string[]> = {
  personal: ['STRIPE_PERSONAL_PRICE_ID'],
  pro: ['STRIPE_PRO_PRICE_ID'],
  business: ['STRIPE_BUSINESS_PRICE_ID', 'STRIPE_TEAM_PRICE_ID'],
};

const VALID_TIERS: readonly BillableTier[] = ['personal', 'pro', 'business'] as const;

export function isBillableTier(v: unknown): v is BillableTier {
  return typeof v === 'string' && (VALID_TIERS as readonly string[]).includes(v);
}

export function resolvePriceId(tier: BillableTier): string {
  const candidates = TIER_PRICE_ENV[tier];
  for (const key of candidates) {
    const val = process.env[key];
    if (val && val.trim().length > 0) {
      return val.trim();
    }
  }
  throw new Error(
    `No Stripe price ID configured for tier '${tier}' (set one of: ${candidates.join(', ')})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout Session (tier-based)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for a friendly tier name.
 * Delegates to the legacy price-based createCheckoutSession after resolving
 * the tier to a configured Stripe price ID. Quantity applies to seat-based
 * tiers (business) and defaults to 1.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<{ url: string }> {
  const { tier, quantity = 1 } = input;

  if (!isBillableTier(tier)) {
    throw new Error(
      `Invalid tier '${String(tier)}' (expected one of: ${VALID_TIERS.join(', ')})`,
    );
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`quantity must be a positive integer (got: ${String(quantity)})`);
  }

  const priceId = resolvePriceId(tier);

  logger.debug('[StripeService] Creating checkout session', {
    userId: input.userId,
    tier,
    priceId,
    quantity,
  });

  return createLegacyCheckoutSession({
    userId: input.userId,
    userEmail: input.userEmail,
    priceId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal Session
// ─────────────────────────────────────────────────────────────────────────────

export async function createPortalSession(
  input: PortalSessionInput,
): Promise<{ url: string }> {
  return createLegacyPortalSession(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Event Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a Stripe webhook signature and return the parsed event.
 * Throws if the signature is invalid or STRIPE_WEBHOOK_SECRET is missing.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
): Stripe.Event {
  return constructWebhookEvent(rawBody, signature);
}

/**
 * Process a validated Stripe event idempotently.
 *
 * Dedup strategy:
 *  1. INSERT ... ON CONFLICT DO NOTHING into public.stripe_webhook_events.
 *     If the insert returns zero rows, the event was already seen — short-circuit
 *     with {processed: false, duplicate: true}.
 *  2. Otherwise, delegate to the legacy processWebhookEvent (which has its own
 *     billing_events audit trail) and mark our row as processed.
 *
 * If the legacy handler throws, we persist the error to handler_error for
 * later replay, then rethrow so the HTTP route can return 500 to Stripe.
 */
export async function handleWebhookEvent(
  event: Stripe.Event,
): Promise<WebhookProcessingResult> {
  const insertResult = await queryPublic(
    `INSERT INTO public.stripe_webhook_events (id, type, payload, livemode, api_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      event.id,
      event.type,
      JSON.stringify(event.data.object),
      event.livemode ?? null,
      event.api_version ?? null,
    ],
  );

  if (insertResult.rows.length === 0) {
    logger.info('[StripeService] Duplicate webhook event — skipping', {
      eventId: event.id,
      type: event.type,
    });
    return { processed: false, duplicate: true, eventId: event.id, type: event.type };
  }

  try {
    const didProcess = await processLegacyWebhookEvent(event);

    await queryPublic(
      `UPDATE public.stripe_webhook_events
       SET processed_at = NOW(), handler_error = NULL
       WHERE id = $1`,
      [event.id],
    );

    return {
      processed: didProcess,
      duplicate: false,
      eventId: event.id,
      type: event.type,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await queryPublic(
      `UPDATE public.stripe_webhook_events SET handler_error = $2 WHERE id = $1`,
      [event.id, msg],
    ).catch(() => {
      /* swallow — the original error is what matters */
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Introspection
// ─────────────────────────────────────────────────────────────────────────────

export function getConfiguredTiers(): BillableTier[] {
  return VALID_TIERS.filter(t => {
    try {
      resolvePriceId(t);
      return true;
    } catch {
      return false;
    }
  });
}
