/**
 * Phase 34: Business Manager Routes
 *
 * API routes for the AI Business Manager - aggregates data from
 * external sources (Stripe, GA4, GSC, Uptime, Lighthouse) and
 * provides business intelligence endpoints.
 */

import { Router } from 'express';
import { overviewRouter } from './overview';
import { revenueRouter } from './revenue';
import { trafficRouter } from './traffic';
import { seoRouter } from './seo';
import { healthRouter } from './health';
import { insightsRouter } from './insights';
import { reportsRouter } from './reports';
import { connectorsRouter } from './connectors';

export const businessRouter = Router();

businessRouter.use('/overview', overviewRouter);
businessRouter.use('/revenue', revenueRouter);
businessRouter.use('/traffic', trafficRouter);
businessRouter.use('/seo', seoRouter);
businessRouter.use('/health', healthRouter);
businessRouter.use('/insights', insightsRouter);
businessRouter.use('/reports', reportsRouter);
businessRouter.use('/connectors', connectorsRouter);
