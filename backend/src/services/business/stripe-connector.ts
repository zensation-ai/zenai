/**
 * Stripe Connector Service
 *
 * Connects to Stripe API for revenue metrics: MRR, subscriptions, churn, payments.
 * Used by the AI Business Manager for financial analytics.
 *
 * @module services/business/stripe-connector
 */

import Stripe from 'stripe';
// pool.query() is used intentionally — business tables are global (not per-context schema)
import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { BusinessConnector, StripeMetrics, RecentPayment } from '../../types/business';

// ============================================
// Stripe Connector
// ============================================

class StripeConnector implements BusinessConnector {
  readonly sourceType = 'stripe' as const;
  private stripe: Stripe | null = null;

  async initialize(): Promise<void> {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      logger.warn('[StripeConnector] STRIPE_SECRET_KEY not configured - connector disabled');
      return;
    }
    this.stripe = new Stripe(apiKey);
    logger.info('[StripeConnector] Initialized successfully');
  }

  isAvailable(): boolean {
    return this.stripe !== null;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.stripe) {
      return { success: false, message: 'Stripe not initialized. Set STRIPE_SECRET_KEY.' };
    }
    try {
      const account = await this.stripe.accounts.retrieve();
      return { success: true, message: `Connected to Stripe account: ${account.business_profile?.name ?? account.id}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Stripe connection failed: ${message}` };
    }
  }

  async collectMetrics(): Promise<Record<string, unknown>> {
    try {
      const metrics = await this.getMetrics();
      return metrics as unknown as Record<string, unknown>;
    } catch (error) {
      logger.warn('[StripeConnector] Failed to collect metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Return empty metrics instead of throwing
      return {};
    }
  }

  // ============================================
  // Revenue Metrics
  // ============================================

  async getMetrics(): Promise<StripeMetrics> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const results = await Promise.allSettled([
      this.stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price'] }),
      this.stripe.customers.list({ limit: 1 }),
      this.stripe.charges.list({ limit: 10 }),
    ]);

    const subscriptions = results[0].status === 'fulfilled' ? results[0].value : null;
    const customers = results[1].status === 'fulfilled' ? results[1].value : null;
    const recentCharges = results[2].status === 'fulfilled' ? results[2].value : null;

    // Log any individual failures without breaking the entire metrics response
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const names = ['subscriptions', 'customers', 'charges'];
        logger.warn(`[StripeConnector] Failed to fetch ${names[i]}`, {
          error: (results[i] as PromiseRejectedResult).reason?.message ?? 'Unknown error',
        });
      }
    }

    const mrr = subscriptions ? this.calculateMRR(subscriptions.data) : 0;
    const churnRate = await this.calculateChurnRate();
    const mrrGrowth = await this.calculateMRRGrowth(mrr);

    const recentPayments: RecentPayment[] = (recentCharges?.data ?? [])
      .filter(c => c.status === 'succeeded')
      .map(c => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency.toUpperCase(),
        customer_id: typeof c.customer === 'string' ? c.customer : c.customer?.id ?? '',
        status: c.status ?? 'unknown',
        occurred_at: new Date(c.created * 1000).toISOString(),
      }));

    return {
      mrr,
      arr: mrr * 12,
      activeSubscriptions: subscriptions?.data.length ?? 0,
      churnRate,
      mrrGrowth,
      totalCustomers: customers?.data.length ?? 0,
      recentPayments,
    };
  }

  calculateMRR(subscriptions: Stripe.Subscription[]): number {
    let totalMRR = 0;

    for (const sub of subscriptions) {
      for (const item of sub.items.data) {
        const price = item.price;
        if (!price.unit_amount) { continue; }

        const amount = price.unit_amount / 100;
        const quantity = item.quantity ?? 1;

        switch (price.recurring?.interval) {
          case 'month':
            totalMRR += amount * quantity;
            break;
          case 'year':
            totalMRR += (amount * quantity) / 12;
            break;
          case 'week':
            totalMRR += (amount * quantity * 52) / 12;
            break;
          case 'day':
            totalMRR += (amount * quantity * 365) / 12;
            break;
        }
      }
    }

    return Math.round(totalMRR * 100) / 100;
  }

  private async calculateChurnRate(): Promise<number> {
    if (!this.stripe) { return 0; }

    try {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

      const [canceled, activeAtStart] = await Promise.all([
        this.stripe.subscriptions.list({
          status: 'canceled',
          created: { gte: thirtyDaysAgo },
          limit: 100,
        }),
        this.stripe.subscriptions.list({
          status: 'all',
          created: { lte: thirtyDaysAgo },
          limit: 1,
        }),
      ]);

      const totalAtStart = activeAtStart.data.length || 1;
      return Math.round((canceled.data.length / totalAtStart) * 100 * 100) / 100;
    } catch {
      return 0;
    }
  }

  private async calculateMRRGrowth(currentMRR: number): Promise<number> {
    try {
      const result = await pool.query(`
        SELECT (metrics->'stripe'->>'mrr')::float as mrr
        FROM business_metrics_snapshots
        WHERE snapshot_type = 'daily'
          AND snapshot_date < CURRENT_DATE
        ORDER BY snapshot_date DESC
        LIMIT 1
      `);

      if (result.rows.length === 0 || !result.rows[0].mrr) { return 0; }

      const previousMRR = result.rows[0].mrr;
      if (previousMRR === 0) { return currentMRR > 0 ? 100 : 0; }

      return Math.round(((currentMRR - previousMRR) / previousMRR) * 100 * 100) / 100;
    } catch {
      return 0;
    }
  }

  // ============================================
  // Revenue Timeline
  // ============================================

  async getRevenueTimeline(days: number): Promise<Array<{ date: string; mrr: number; subscriptions: number }>> {
    const result = await pool.query(`
      SELECT
        snapshot_date as date,
        (metrics->'stripe'->>'mrr')::float as mrr,
        (metrics->'stripe'->>'activeSubscriptions')::int as subscriptions
      FROM business_metrics_snapshots
      WHERE snapshot_type = 'daily'
        AND snapshot_date > CURRENT_DATE - $1::int
      ORDER BY snapshot_date ASC
    `, [days]);

    return result.rows.map(row => ({
      date: row.date,
      mrr: row.mrr ?? 0,
      subscriptions: row.subscriptions ?? 0,
    }));
  }

  // ============================================
  // Revenue Events
  // ============================================

  async getRecentEvents(limit: number): Promise<Array<{ id: string; event_type: string; amount: number | null; currency: string; occurred_at: string }>> {
    const result = await pool.query(`
      SELECT id, event_type, amount, currency, occurred_at
      FROM revenue_events
      ORDER BY occurred_at DESC
      LIMIT $1
    `, [Math.min(limit, 100)]);

    return result.rows;
  }

  // ============================================
  // Webhook Handler
  // ============================================

  async handleWebhook(payload: string | Buffer, signature: string): Promise<void> {
    if (!this.stripe) { throw new Error('Stripe not initialized'); }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) { throw new Error('STRIPE_WEBHOOK_SECRET not configured'); }

    const event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    const eventData = event.data.object as unknown as Record<string, unknown>;
    const amount = typeof eventData.amount === 'number' ? eventData.amount : null;
    const customerId = typeof eventData.customer === 'string' ? eventData.customer : null;

    await pool.query(`
      INSERT INTO revenue_events (event_type, stripe_event_id, customer_id, amount, currency, event_data, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (stripe_event_id) DO NOTHING
    `, [
      event.type,
      event.id,
      customerId,
      amount,
      'EUR',
      JSON.stringify(event.data.object),
      new Date(event.created * 1000).toISOString(),
    ]);

    logger.info(`[StripeConnector] Webhook processed: ${event.type} (${event.id})`);
  }
}

export const stripeConnector = new StripeConnector();
