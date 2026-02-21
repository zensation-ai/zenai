/**
 * Business Revenue Routes
 *
 * Stripe-based revenue metrics: MRR, subscriptions, payments, timeline.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler';
import { stripeConnector } from '../../services/business';
import { logger } from '../../utils/logger';

export const revenueRouter = Router();

/**
 * GET /api/business/revenue
 * Current revenue metrics
 */
revenueRouter.get('/', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  if (!stripeConnector.isAvailable()) {
    res.json({ success: true, revenue: null, message: 'Stripe not configured' });
    return;
  }

  const metrics = await stripeConnector.getMetrics();
  res.json({ success: true, revenue: metrics });
}));

/**
 * GET /api/business/revenue/timeline
 * Revenue over time
 */
revenueRouter.get('/timeline', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const period = parseInt(req.query.period as string, 10) || 30;
  const days = Math.min(Math.max(period, 7), 365);

  const timeline = await stripeConnector.getRevenueTimeline(days);
  res.json({ success: true, timeline, period: `${days} days` });
}));

/**
 * GET /api/business/revenue/events
 * Recent revenue events
 */
revenueRouter.get('/events', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

  const events = await stripeConnector.getRecentEvents(limit);
  res.json({ success: true, events, count: events.length });
}));

/**
 * POST /api/business/revenue/webhook
 * Stripe webhook receiver
 */
revenueRouter.post('/webhook', asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    throw new ValidationError('Missing stripe-signature header');
  }

  // Use raw body for Stripe signature verification (express.json() preserves it via verify callback)
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    throw new ValidationError('Raw body not available for signature verification');
  }
  await stripeConnector.handleWebhook(rawBody, signature);
  res.json({ success: true, received: true });
}));
