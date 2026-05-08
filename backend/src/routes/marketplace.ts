/**
 * Phase 143: Agent Marketplace Routes
 *
 * All endpoints mounted under /api/marketplace (via agents module).
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createModerationMiddleware } from '../middleware/moderation-factory';
import { marketplaceService } from '../services/agents/marketplace-service';

/**
 * Sprint 1.12 — Content moderation hook on POST /publish.
 * Concatenates owner-supplied description + tags so the 3-tier moderation
 * service (regex → OpenAI → Claude) can flag obvious violations BEFORE
 * the blueprint enters the pending queue. Fail-open semantics match the
 * other moderation callsites; the state machine still guarantees admin
 * review so nothing goes live without human sign-off.
 */
const publishModeration = createModerationMiddleware({
  domain: 'marketplace',
  extractContent: (req: Request) => {
    const body = (req.body ?? {}) as {
      description?: unknown;
      tags?: unknown;
    };
    const parts: string[] = [];
    if (typeof body.description === 'string') parts.push(body.description);
    if (Array.isArray(body.tags)) {
      parts.push(body.tags.filter((t): t is string => typeof t === 'string').join(' '));
    }
    const joined = parts.join('\n').trim();
    return joined.length > 0 ? joined : undefined;
  },
});

export const marketplaceRouter = Router();

/**
 * GET /api/marketplace/blueprints
 * Browse community blueprints
 */
marketplaceRouter.get('/blueprints', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { category, search, sort, limit, offset } = req.query;
  const data = await marketplaceService.listCommunityBlueprints({
    category: category as string | undefined,
    search: search as string | undefined,
    sort: sort as 'rating' | 'popular' | 'newest' | undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
  });
  res.json({ data });
}));

/**
 * GET /api/marketplace/featured
 * Get curated featured blueprints
 */
marketplaceRouter.get('/featured', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 6;
  const data = await marketplaceService.getFeatured(limit);
  res.json({ data });
}));

/**
 * GET /api/marketplace/blueprints/:id
 * Get full blueprint detail (tools, instructions, rating histogram, recent reviews)
 */
marketplaceRouter.get('/blueprints/:id', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const data = await marketplaceService.getBlueprintDetail(req.params.id);
  if (!data) return res.status(404).json({ error: 'Blueprint not found' });
  res.json({ data });
}));

/**
 * GET /api/marketplace/blueprints/:id/rating-eligibility
 * Check if the current user can rate this blueprint (installed + >=3 executions + not rated)
 */
marketplaceRouter.get('/blueprints/:id/rating-eligibility', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const data = await marketplaceService.getRatingEligibility(req.params.id, userId);
  res.json({ data });
}));

/**
 * POST /api/marketplace/blueprints/install
 * Install a community blueprint
 */
marketplaceRouter.post('/blueprints/install', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { blueprintId } = req.body;
  if (!blueprintId) {
    return res.status(400).json({ error: 'Missing required field: blueprintId' });
  }
  const data = await marketplaceService.installBlueprint(blueprintId, (req as any).userId);
  res.status(201).json({ data });
}));

/**
 * GET /api/marketplace/blueprints/:id/publish-candidate
 * Owner-scoped pre-fill for the publish confirm modal.
 */
marketplaceRouter.get(
  '/blueprints/:id/publish-candidate',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const data = await marketplaceService.getPublishCandidate(req.params.id, userId);
      res.json({ data });
    } catch (err: any) {
      if (err?.message?.includes('not owned')) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }),
);

/**
 * POST /api/marketplace/blueprints/publish
 * Publish a user blueprint to the marketplace.
 *
 * Body: { blueprintId, description?, category?, tags? }
 * Sets source='community' + moderation_status='pending' (admin must approve).
 */
marketplaceRouter.post(
  '/blueprints/publish',
  apiKeyAuth,
  requireScope('write'),
  publishModeration,
  asyncHandler(async (req: Request, res: Response) => {
    const { blueprintId, description, category, tags } = req.body ?? {};
    if (!blueprintId) {
      return res.status(400).json({ error: 'Missing required field: blueprintId' });
    }
    if (description !== undefined && typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be a string' });
    }
    if (category !== undefined && typeof category !== 'string') {
      return res.status(400).json({ error: 'category must be a string' });
    }
    if (tags !== undefined && (!Array.isArray(tags) || tags.some(t => typeof t !== 'string'))) {
      return res.status(400).json({ error: 'tags must be a string array' });
    }
    if (Array.isArray(tags) && tags.length > 5) {
      return res.status(400).json({ error: 'tags may not exceed 5 entries' });
    }
    if (typeof description === 'string' && description.trim().length > 0) {
      const len = description.trim().length;
      if (len < 50 || len > 500) {
        return res.status(400).json({ error: 'description must be 50–500 characters' });
      }
    }
    try {
      await marketplaceService.publishBlueprint(blueprintId, (req as any).userId, {
        description: typeof description === 'string' ? description.trim() : undefined,
        category: typeof category === 'string' ? category.trim() : undefined,
        tags: Array.isArray(tags) ? tags.map((t: string) => t.trim()).filter(Boolean) : undefined,
      });
      res.json({ success: true, status: 'pending' });
    } catch (err: any) {
      if (err?.code === 'PUBLISH_RATE_LIMIT') {
        return res.status(429).json({ error: err.message, code: err.code });
      }
      if (err?.code === 'PUBLISH_DUPLICATE') {
        return res.status(409).json({ error: err.message, code: err.code });
      }
      if (err?.message?.includes('not owned')) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }),
);

/**
 * DELETE /api/marketplace/blueprints/:id/publish
 * Unpublish: revert a community blueprint back to user_created.
 */
marketplaceRouter.delete(
  '/blueprints/:id/publish',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      await marketplaceService.unpublishBlueprint(req.params.id, userId);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message?.includes('not owned')) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }),
);


/**
 * GET /api/marketplace/admin/pending
 * Admin moderation queue.
 */
marketplaceRouter.get(
  '/admin/pending',
  apiKeyAuth,
  requireScope('admin'),
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const data = await marketplaceService.listPendingBlueprints(limit);
    res.json({ data });
  }),
);

/**
 * POST /api/marketplace/admin/blueprints/:id/moderate
 * Admin approval/rejection of a pending blueprint.
 */
marketplaceRouter.post(
  '/admin/blueprints/:id/moderate',
  apiKeyAuth,
  requireScope('admin'),
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { decision, reason } = req.body ?? {};
    if (decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
    }
    try {
      await marketplaceService.setModerationDecision(
        req.params.id,
        (req as any).userId,
        decision,
        typeof reason === 'string' ? reason.trim() : undefined,
      );
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message?.includes('requires a reason')) {
        return res.status(400).json({ error: err.message });
      }
      if (err?.message?.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }),
);

/**
 * POST /api/marketplace/blueprints/:id/rate
 * Rate a blueprint
 */
marketplaceRouter.post('/blueprints/:id/rate', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { rating, review } = req.body;
  if (!rating || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Missing required field: rating (number)' });
  }
  try {
    const data = await marketplaceService.rateBlueprint(req.params.id, (req as any).userId, rating, review);
    res.json({ data });
  } catch (err: any) {
    if (err.message?.includes('between 1 and 5')) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}));
