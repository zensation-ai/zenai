/**
 * Demo Route — Alex Chen onboarding persona
 *
 *   POST   /api/demo/seed    — seed the demo user's data (idempotent)
 *   GET    /api/demo/status  — current row counts per entity type
 *   DELETE /api/demo/reset   — clear demo user's data
 *
 * All endpoints use apiKeyAuth with the `write` scope (seed/reset) or `read`
 * scope (status). Demo users are additionally subject to the global demoGuard
 * rate limit registered in MiddlewareModule.
 */

import express, { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import {
  seedAlexChenData,
  clearAlexChenData,
  countAlexChenData,
} from '../services/demo/alex-chen-seed';
import { ALEX_DEMO_SUMMARY, ALEX_USER_ID } from '../services/demo/alex-chen-data';

export const demoRouter = express.Router();

/** POST /api/demo/seed */
demoRouter.post(
  '/demo/seed',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('[demo-route] POST /api/demo/seed');
    const summary = await seedAlexChenData();
    res.json({
      success: true,
      summary,
      message: 'Alex Chen demo data seeded successfully',
    });
  }),
);

/** GET /api/demo/status */
demoRouter.get(
  '/demo/status',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const counts = await countAlexChenData();
    const seeded =
      counts.coreBlocks > 0 ||
      counts.topics > 0 ||
      counts.ideas > 0 ||
      counts.facts > 0 ||
      counts.episodes > 0;
    res.json({
      success: true,
      persona: ALEX_DEMO_SUMMARY.persona,
      userId: ALEX_USER_ID,
      seeded,
      counts,
      expected: {
        coreBlocks: ALEX_DEMO_SUMMARY.coreBlocks,
        topics: ALEX_DEMO_SUMMARY.topics,
        ideas: ALEX_DEMO_SUMMARY.ideas,
        facts: ALEX_DEMO_SUMMARY.facts,
        episodes: ALEX_DEMO_SUMMARY.episodes,
      },
    });
  }),
);

/** DELETE /api/demo/reset */
demoRouter.delete(
  '/demo/reset',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('[demo-route] DELETE /api/demo/reset');
    await clearAlexChenData();
    res.json({
      success: true,
      cleared: true,
      message: 'Alex Chen demo data cleared',
    });
  }),
);
