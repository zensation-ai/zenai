/**
 * Social Media Routes
 *
 * CRUD for social posts, publishing, scheduling, and analytics.
 *
 * @module routes/social
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import { createModerationMiddleware, extractFromFields } from '../middleware/moderation-factory';
import { AIContext, isValidContext } from '../utils/database-context';

// Sprint 1.2 + 1.10: Content-Moderation vor Social-Veröffentlichung.
const socialModeration = createModerationMiddleware({
  domain: 'social',
  extractContent: extractFromFields(['content', 'text', 'body']),
});
import {
  createPostDraft,
  listPosts,
  getPost,
  updatePost,
  deletePost,
  publishPost,
  getPlatformStatus,
  schedulePost,
} from '../services/social/social-publisher';
import { PostStatus, SocialPlatform } from '../services/social/platform-types';
import { queryContext } from '../utils/database-context';
import { requestSocialApproval } from '../services/social/social-governance';
import { logger } from '../utils/logger';

const router = Router();

// Sprint 1.5 Item 4 — blanket auth for all social routes.
router.use(apiKeyAuth);

// ===========================================
// List posts
// ===========================================

router.get(
  '/:context/social/posts',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const { status, platform, limit } = req.query;

    const posts = await listPosts(context, {
      status: status as PostStatus | undefined,
      platform: platform as SocialPlatform | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ data: posts, total: posts.length });
  })
);

// ===========================================
// Get single post
// ===========================================

router.get(
  '/:context/social/posts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const post = await getPost(context, req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ data: post });
  })
);

// ===========================================
// Create draft
// ===========================================

router.post(
  '/:context/social/posts',
  socialModeration,
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const { source_type, source_id, platform, content, media_urls, scheduled_at } = req.body;

    if (!platform || !content) {
      return res.status(400).json({ error: 'platform and content are required' });
    }

    const post = await createPostDraft(context, {
      source_type: source_type || 'manual',
      source_id,
      platform,
      content,
      media_urls,
      scheduled_at: scheduled_at ? new Date(scheduled_at) : undefined,
    });

    res.status(201).json({ data: post });
  })
);

// ===========================================
// Update draft
// ===========================================

router.put(
  '/:context/social/posts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const { content, scheduled_at, platform } = req.body;

    const post = await updatePost(context, req.params.id, {
      content,
      scheduled_at: scheduled_at ? new Date(scheduled_at) : undefined,
      platform,
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found or not in draft status' });
    }

    res.json({ data: post });
  })
);

// ===========================================
// Delete draft
// ===========================================

router.delete(
  '/:context/social/posts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const deleted = await deletePost(context, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Post not found or not in draft status' });
    }

    res.json({ ok: true });
  })
);

// ===========================================
// Approve post (transitions to 'approved')
// ===========================================

router.post(
  '/:context/social/posts/:id/approve',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    try {
      const result = await requestSocialApproval(context, req.params.id);
      logger.info(`[SocialRoutes] Governance approval for post ${req.params.id}: autoApproved=${result.autoApproved}`);
      res.json({
        data: result.post,
        autoApproved: result.autoApproved,
        governanceId: result.governanceAction.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return res.status(404).json({ error: 'Post not found or already processed' });
      }
      throw err;
    }
  })
);

// ===========================================
// Publish post
// ===========================================

router.post(
  '/:context/social/posts/:id/publish',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    // First approve if still in draft
    await queryContext(context, `
      UPDATE social_posts
      SET status = 'approved', updated_at = NOW()
      WHERE id = $1 AND status IN ('draft', 'pending_approval')
    `, [req.params.id]);

    const result = await publishPost(context, req.params.id);

    if (result.success) {
      res.json({ data: result });
    } else {
      res.status(400).json({ error: result.error });
    }
  })
);

// ===========================================
// Schedule post
// ===========================================

router.post(
  '/:context/social/posts/:id/schedule',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const { scheduled_at } = req.body;
    if (!scheduled_at) {
      return res.status(400).json({ error: 'scheduled_at is required' });
    }

    // Verify post exists and is in a schedulable state before calling schedulePost
    const check = await queryContext(context, `
      SELECT id FROM social_posts
      WHERE id = $1 AND status IN ('draft', 'approved', 'pending_approval')
    `, [req.params.id]);

    if (!check.rows.length) {
      return res.status(404).json({ error: 'Post not found or already published' });
    }

    await schedulePost(context, req.params.id, new Date(scheduled_at));

    // Return the updated post
    const updated = await queryContext(context, `
      SELECT * FROM social_posts WHERE id = $1
    `, [req.params.id]);

    res.json({ data: updated.rows[0] });
  })
);

// ===========================================
// Platform status
// ===========================================

router.get(
  '/:context/social/platforms',
  asyncHandler(async (_req: Request, res: Response) => {
    const status = getPlatformStatus();
    res.json({ data: status });
  })
);

// ===========================================
// Calendar view (upcoming scheduled posts)
// ===========================================

router.get(
  '/:context/social/calendar',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const posts = await listPosts(context, { status: 'scheduled' });
    res.json({ data: posts });
  })
);

// ===========================================
// AI Draft from source content
// ===========================================

router.post(
  '/:context/social/draft-from-source',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const { source_type, source_content, platform, locale, tone, thread_mode } = req.body;

    if (!source_content) {
      return res.status(400).json({ error: 'source_content is required' });
    }

    try {
      const { createContentAgent } = await import('../services/social/content-agent');
      const agent = createContentAgent();

      if (platform) {
        // Draft for a single platform
        const result = await agent.draftPost(
          {
            sourceType: source_type || 'manual',
            sourceContent: source_content,
            platform,
            locale: locale || (platform === 'discord' ? 'de' : 'en'),
            tone: tone || 'professional',
            threadMode: thread_mode,
          },
          context,
        );
        res.status(201).json({ data: [result] });
      } else {
        // Draft for all platforms
        const results = await agent.draftForAllPlatforms(
          source_content,
          source_type || 'manual',
          context,
        );
        res.status(201).json({ data: results });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[SocialRoutes] draft-from-source failed', err instanceof Error ? err : undefined);
      res.status(500).json({ error: `Failed to draft: ${message}` });
    }
  })
);

// ===========================================
// Post metrics
// ===========================================

router.get(
  '/:context/social/posts/:id/metrics',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }
    const result = await queryContext(context,
      `SELECT metrics, platform, platform_post_id FROM social_posts WHERE id = $1`,
      [req.params.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ data: result.rows[0] });
  })
);

// ===========================================
// Connected accounts
// ===========================================

router.get(
  '/:context/social/accounts',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const result = await queryContext(context,
      `SELECT id, platform, account_name, is_active, token_expires_at, created_at
       FROM social_accounts WHERE is_active = true ORDER BY created_at DESC`
    );

    res.json({ data: result.rows });
  })
);

router.post(
  '/:context/social/accounts',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const { platform, account_name, webhook_url } = req.body;

    if (!platform || !account_name) {
      return res.status(400).json({ error: 'platform and account_name are required' });
    }

    // For Discord webhooks, store the URL (not encrypted for now — no token)
    const result = await queryContext(context,
      `INSERT INTO social_accounts (platform, account_name, access_token_encrypted, is_active)
       VALUES ($1, $2, $3, true) RETURNING id, platform, account_name, is_active, created_at`,
      [platform, account_name, webhook_url || null],
    );

    res.status(201).json({ data: result.rows[0] });
  })
);

router.delete(
  '/:context/social/accounts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const result = await queryContext(context,
      `UPDATE social_accounts SET is_active = false WHERE id = $1 RETURNING id`,
      [req.params.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ ok: true });
  })
);

export default router;
