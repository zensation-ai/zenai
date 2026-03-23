/**
 * Slack API Routes
 *
 * Management endpoints for Slack workspaces, channels, proactive config,
 * and activity log. All routes require JWT authentication.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireJwt } from '../middleware/jwt-auth';
import { getUserId } from '../utils/user-context';
import { queryPublic } from '../utils/database-context';
const VALID_CONTEXTS = ['personal', 'work', 'learning', 'creative'];

export function createSlackRouter(): Router {
  const router = Router();

  router.use(requireJwt);

  // GET /api/slack/workspaces — List connected workspaces
  router.get('/workspaces', asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const result = await queryPublic(
      'SELECT * FROM public.slack_workspaces WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    res.json({ success: true, data: result.rows });
  }));

  // GET /api/slack/channels — List channels for user's workspace
  router.get('/channels', asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const wsResult = await queryPublic(
      'SELECT id FROM public.slack_workspaces WHERE user_id = $1 LIMIT 1',
      [userId],
    );

    if (wsResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const channels = await queryPublic(
      'SELECT * FROM public.slack_channels WHERE workspace_id = $1 ORDER BY channel_name',
      [wsResult.rows[0].id],
    );
    res.json({ success: true, data: channels.rows });
  }));

  // PATCH /api/slack/channels/:channelId/config — Update channel context or mute
  router.patch('/channels/:channelId/config', asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    const { target_context, muted } = req.body;

    if (target_context && !VALID_CONTEXTS.includes(target_context)) {
      return res.status(400).json({ success: false, error: 'Invalid target_context' });
    }

    const updates: string[] = [];
    const values: (string | boolean)[] = [];
    let paramIndex = 1;

    if (target_context) {
      updates.push(`target_context = $${paramIndex++}`);
      values.push(target_context);
    }
    if (typeof muted === 'boolean') {
      updates.push(`muted = $${paramIndex++}`);
      values.push(muted);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    updates.push('updated_at = NOW()');
    values.push(channelId);

    await queryPublic(
      `UPDATE public.slack_channels SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );

    res.json({ success: true });
  }));

  // PATCH /api/slack/workspaces/:id/proactive — Update proactive config
  router.patch('/workspaces/:id/proactive', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = req.body;

    await queryPublic(
      `UPDATE public.slack_workspaces SET proactive_config = proactive_config || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(config), id],
    );

    res.json({ success: true });
  }));

  // GET /api/slack/activity — Recent activity log (scoped to user)
  router.get('/activity', asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const result = await queryPublic(
      `SELECT wl.* FROM public.integration_webhook_log wl
       WHERE wl.connector_id = 'slack' AND wl.user_id = $1
       ORDER BY wl.created_at DESC LIMIT 50`,
      [userId],
    );
    res.json({ success: true, data: result.rows });
  }));

  // POST /api/slack/commands/summarize — Trigger channel summarization
  router.post('/commands/summarize', asyncHandler(async (req, res) => {
    const { channelId } = req.body;
    if (!channelId) {
      return res.status(400).json({ success: false, error: 'channelId required' });
    }
    // Placeholder — actual summarization requires Claude API call
    res.json({ success: true, message: 'Summary requested', channelId });
  }));

  return router;
}
