import { Router, Request, Response } from 'express';
import { queryContext, AIContext, isValidContext, isValidUUID } from '../utils/database-context';
import { logger } from '../utils/logger';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';

export const notificationsRouter = Router();

/**
 * Get context from request
 */
function getContext(req: Request): AIContext {
  const context = (req.headers['x-ai-context'] as string) || (req.query.context as string) || 'personal';
  return isValidContext(context) ? context : 'personal';
}

// ============================================
// Push Token Registration
// ============================================

interface RegisterTokenRequest {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  deviceName?: string;
}

/**
 * POST /api/notifications/register
 * Register a push notification token
 */
notificationsRouter.post('/register', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const { token, platform, deviceId, deviceName } = req.body as RegisterTokenRequest;

  if (!token || !platform) {
    throw new ValidationError('Token and platform are required');
  }

  // Check if token already exists
  const existing = await queryContext(
    ctx,
    `SELECT id FROM push_tokens WHERE token = $1`,
    [token]
  );

  if (existing.rows.length > 0) {
    // Update existing token
    await queryContext(
      ctx,
      `UPDATE push_tokens
       SET device_name = COALESCE($1, device_name),
           updated_at = NOW(),
           is_active = true
       WHERE token = $2`,
      [deviceName, token]
    );

    return res.json({
      success: true,
      message: 'Token updated',
      tokenId: existing.rows[0].id,
    });
  }

  // Insert new token
  const result = await queryContext(
    ctx,
    `INSERT INTO push_tokens (token, platform, device_id, device_name, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [token, platform, deviceId || null, deviceName || null]
  );

  logger.info('Push token registered', { platform, context: ctx });

  res.status(201).json({
    success: true,
    message: 'Token registered',
    tokenId: result.rows[0].id,
  });
}));

/**
 * DELETE /api/notifications/unregister
 * Unregister a push notification token
 */
notificationsRouter.delete('/unregister', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Token is required');
  }

  await queryContext(
    ctx,
    `UPDATE push_tokens SET is_active = false, updated_at = NOW() WHERE token = $1`,
    [token]
  );

  res.json({ success: true, message: 'Token unregistered' });
}));

// ============================================
// Notification Preferences
// ============================================

interface NotificationPreferences {
  clusterReady: boolean;
  dailyDigest: boolean;
  weeklyInsights: boolean;
  priorityReminders: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
}

/**
 * GET /api/notifications/preferences
 * Get notification preferences
 */
notificationsRouter.get('/preferences', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);

  const result = await queryContext(
    ctx,
    `SELECT * FROM notification_preferences LIMIT 1`
  );

  if (result.rows.length === 0) {
    // Return defaults
    return res.json({
      clusterReady: true,
      dailyDigest: false,
      weeklyInsights: true,
      priorityReminders: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });
  }

  res.json(result.rows[0]);
}));

/**
 * PUT /api/notifications/preferences
 * Update notification preferences
 */
notificationsRouter.put('/preferences', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const prefs = req.body as NotificationPreferences;

  // Upsert preferences
  await queryContext(
    ctx,
    `INSERT INTO notification_preferences
       (cluster_ready, daily_digest, weekly_insights, priority_reminders, quiet_hours_start, quiet_hours_end)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       cluster_ready = EXCLUDED.cluster_ready,
       daily_digest = EXCLUDED.daily_digest,
       weekly_insights = EXCLUDED.weekly_insights,
       priority_reminders = EXCLUDED.priority_reminders,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       updated_at = NOW()`,
    [
      prefs.clusterReady ?? true,
      prefs.dailyDigest ?? false,
      prefs.weeklyInsights ?? true,
      prefs.priorityReminders ?? true,
      prefs.quietHoursStart || '22:00',
      prefs.quietHoursEnd || '08:00',
    ]
  );

  res.json({ success: true, message: 'Preferences updated' });
}));

// ============================================
// Notification Events (for triggering)
// ============================================

export enum NotificationType {
  CLUSTER_READY = 'cluster_ready',
  DAILY_DIGEST = 'daily_digest',
  WEEKLY_INSIGHTS = 'weekly_insights',
  PRIORITY_REMINDER = 'priority_reminder',
  IDEA_REMINDER = 'idea_reminder',
}

interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * POST /api/notifications/send (internal use / testing)
 * Trigger a notification
 */
notificationsRouter.post('/send', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const payload = req.body as NotificationPayload;

  if (!payload.type || !payload.title || !payload.body) {
    throw new ValidationError('type, title, and body are required');
  }

  // Get active tokens
  const tokens = await queryContext(
    ctx,
    `SELECT token, platform FROM push_tokens WHERE is_active = true`
  );

  if (tokens.rows.length === 0) {
    return res.json({
      success: true,
      message: 'No active tokens to notify',
      notifiedCount: 0,
    });
  }

  // Log notification event
  await queryContext(
    ctx,
    `INSERT INTO notification_history (type, title, body, data, recipients_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [payload.type, payload.title, payload.body, JSON.stringify(payload.data || {}), tokens.rows.length]
  );

  // In production, this would call APNs/FCM
  // For now, we just log and return success
  logger.info('Notification triggered', {
    type: payload.type,
    recipients: tokens.rows.length,
    context: ctx,
  });

  res.json({
    success: true,
    message: 'Notification sent',
    notifiedCount: tokens.rows.length,
    // In production: include actual send results
  });
}));

/**
 * GET /api/notifications/history
 * Get notification history
 */
notificationsRouter.get('/history', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const limit = parseInt(req.query.limit as string) || 20;

  const result = await queryContext(
    ctx,
    `SELECT id, type, title, body, data, recipients_count, created_at
     FROM notification_history
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  res.json({
    notifications: result.rows,
    total: result.rows.length,
  });
}));

// ============================================
// Scheduled Notification Helpers
// ============================================

/**
 * Check for ready clusters and notify
 * Called by a cron job or background process
 */
export async function checkAndNotifyReadyClusters(context: AIContext): Promise<number> {
  try {
    // Find clusters that are ready and haven't been notified
    const clusters = await queryContext(
      context,
      `SELECT tc.id, tc.suggested_title, tc.maturity_score, tc.confidence
       FROM thought_clusters tc
       WHERE tc.status = 'ready'
         AND tc.notified_at IS NULL
         AND tc.maturity_score >= 0.7`
    );

    if (clusters.rows.length === 0) {
      return 0;
    }

    // Get preferences
    const prefs = await queryContext(
      context,
      `SELECT cluster_ready FROM notification_preferences LIMIT 1`
    );

    if (prefs.rows.length === 0 || !prefs.rows[0].cluster_ready) {
      return 0;
    }

    // Get active tokens
    const tokens = await queryContext(
      context,
      `SELECT token, platform FROM push_tokens WHERE is_active = true`
    );

    if (tokens.rows.length === 0) {
      return 0;
    }

    // Mark clusters as notified
    const clusterIds = clusters.rows.map((c) => c.id);
    await queryContext(
      context,
      `UPDATE thought_clusters SET notified_at = NOW() WHERE id = ANY($1)`,
      [clusterIds]
    );

    // Log notification
    for (const cluster of clusters.rows) {
      await queryContext(
        context,
        `INSERT INTO notification_history (type, title, body, data, recipients_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          NotificationType.CLUSTER_READY,
          'Gedanken-Cluster bereit!',
          `"${cluster.suggested_title}" ist bereit zur Konsolidierung`,
          JSON.stringify({ clusterId: cluster.id }),
          tokens.rows.length,
        ]
      );
    }

    logger.info('Cluster notifications sent', {
      context,
      clusterCount: clusters.rows.length,
      recipientCount: tokens.rows.length,
    });

    return clusters.rows.length;
  } catch (error: any) {
    logger.error('Failed to check/notify clusters', error);
    return 0;
  }
}

/**
 * Generate daily digest notification
 */
export async function generateDailyDigest(context: AIContext): Promise<void> {
  try {
    // Get today's stats
    const stats = await queryContext(
      context,
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as new_ideas,
         COUNT(*) FILTER (WHERE priority = 'high' AND is_archived = false) as high_priority,
         (SELECT COUNT(*) FROM thought_clusters WHERE status = 'ready') as ready_clusters
       FROM ideas`
    );

    const { new_ideas, high_priority, ready_clusters } = stats.rows[0];

    if (new_ideas === '0' && high_priority === '0' && ready_clusters === '0') {
      return; // Nothing to report
    }

    const prefs = await queryContext(
      context,
      `SELECT daily_digest FROM notification_preferences LIMIT 1`
    );

    if (prefs.rows.length === 0 || !prefs.rows[0].daily_digest) {
      return;
    }

    const tokens = await queryContext(
      context,
      `SELECT COUNT(*) as count FROM push_tokens WHERE is_active = true`
    );

    if (tokens.rows[0].count === '0') {
      return;
    }

    // Build digest message
    const parts = [];
    if (parseInt(new_ideas) > 0) parts.push(`${new_ideas} neue Ideen`);
    if (parseInt(high_priority) > 0) parts.push(`${high_priority} hohe Priorität`);
    if (parseInt(ready_clusters) > 0) parts.push(`${ready_clusters} Cluster bereit`);

    await queryContext(
      context,
      `INSERT INTO notification_history (type, title, body, data, recipients_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        NotificationType.DAILY_DIGEST,
        'Tägliche Zusammenfassung',
        parts.join(' • '),
        JSON.stringify({ new_ideas, high_priority, ready_clusters }),
        parseInt(tokens.rows[0].count),
      ]
    );

    logger.info('Daily digest generated', { context });
  } catch (error: any) {
    logger.error('Failed to generate daily digest', error);
  }
}
