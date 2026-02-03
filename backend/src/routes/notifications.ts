/**
 * Push Notifications Routes
 *
 * API endpoints for managing push notifications:
 * - Device token registration (APNs)
 * - Notification preferences with quiet hours
 * - Notification history and analytics
 * - Draft-ready notifications
 */

import { Router, Request, Response } from 'express';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import {
  registerDeviceToken,
  unregisterDeviceToken,
  getActiveDeviceTokens,
  getNotificationPreferences as getPrefs,
  updateNotificationPreferences as updatePrefs,
  sendNotification,
  getNotificationStats,
  recordNotificationOpened,
  isPushNotificationsConfigured,
  getPushNotificationsStatus,
  NotificationPayload as APNsPayload,
} from '../services/push-notifications';

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
    `SELECT id, cluster_ready, daily_digest, weekly_insights, priority_reminders,
            quiet_hours_start, quiet_hours_end, updated_at
     FROM notification_preferences LIMIT 1`
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
  // Validate and constrain limit to prevent excessive queries
  const parsedLimit = parseInt(req.query.limit as string, 10);
  const limit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 100);

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
    if (parseInt(new_ideas) > 0) {parts.push(`${new_ideas} neue Ideen`);}
    if (parseInt(high_priority) > 0) {parts.push(`${high_priority} hohe Priorität`);}
    if (parseInt(ready_clusters) > 0) {parts.push(`${ready_clusters} Cluster bereit`);}

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

// ============================================
// APNs Push Notification Routes (Phase: Push Notifications)
// ============================================

/**
 * POST /api/:context/notifications/device
 * Register or update a device token for APNs
 */
notificationsRouter.post(
  '/:context/notifications/device',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { deviceToken, deviceId, deviceName, deviceModel, osVersion, appVersion } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    if (!deviceToken || typeof deviceToken !== 'string') {
      throw new ValidationError('deviceToken is required and must be a string');
    }

    if (!deviceId || typeof deviceId !== 'string') {
      throw new ValidationError('deviceId is required and must be a string');
    }

    const result = await registerDeviceToken(context as AIContext, deviceToken, {
      deviceId,
      deviceName,
      deviceModel,
      osVersion,
      appVersion,
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to register device token');
    }

    logger.info('APNs device token registered', { deviceId, context });

    res.json({
      success: true,
      tokenId: result.tokenId,
      message: 'Device token registered successfully',
    });
  })
);

/**
 * DELETE /api/:context/notifications/device
 * Unregister a device token from APNs
 */
notificationsRouter.delete(
  '/:context/notifications/device',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    // Accept both deviceToken (legacy) and deviceId (frontend)
    const { deviceToken, deviceId } = req.body;
    const token = deviceToken || deviceId;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    if (!token) {
      throw new ValidationError('deviceToken or deviceId is required');
    }

    await unregisterDeviceToken(context as AIContext, token);

    res.json({
      success: true,
      message: 'Device token unregistered',
    });
  })
);

/**
 * GET /api/:context/notifications/devices
 * Get all active devices for the context
 */
notificationsRouter.get(
  '/:context/notifications/devices',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    const devices = await getActiveDeviceTokens(context as AIContext);

    res.json({
      success: true,
      devices: devices.map((d) => ({
        id: d.id,
        device_token: d.deviceToken || d.deviceId,
        device_name: d.deviceName,
        device_model: d.deviceModel,
        os_version: d.osVersion,
        app_version: d.appVersion,
        is_active: d.isActive ?? true,
        last_used_at: d.lastUsedAt,
        created_at: d.createdAt,
      })),
      count: devices.length,
    });
  })
);

/**
 * GET /api/:context/notifications/preferences/:deviceId
 * Get notification preferences for a device
 */
notificationsRouter.get(
  '/:context/notifications/preferences/:deviceId',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, deviceId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    const preferences = await getPrefs(context as AIContext, deviceId);

    if (!preferences) {
      // Return default preferences in snake_case format for frontend compatibility
      res.json({
        success: true,
        preferences: {
          draft_ready: true,
          feedback_reminder: true,
          idea_connections: true,
          learning_suggestions: true,
          weekly_summary: false,
          quiet_hours_start: null,
          quiet_hours_end: null,
          quiet_hours_timezone: 'Europe/Berlin',
          max_per_hour: 10,
          max_per_day: 50,
        },
      });
      return;
    }

    // Convert preferences to snake_case for frontend compatibility
    res.json({
      success: true,
      preferences: {
        draft_ready: preferences.draftReady ?? true,
        feedback_reminder: preferences.draftFeedbackReminder ?? true,
        idea_connections: preferences.ideaConnections ?? true,
        learning_suggestions: preferences.learningSuggestions ?? true,
        weekly_summary: preferences.weeklySummary ?? false,
        quiet_hours_start: preferences.quietHoursStart ?? null,
        quiet_hours_end: preferences.quietHoursEnd ?? null,
        quiet_hours_timezone: preferences.timezone ?? 'Europe/Berlin',
        max_per_hour: preferences.maxNotificationsPerHour ?? 10,
        max_per_day: preferences.maxNotificationsPerDay ?? 50,
      },
    });
  })
);

/**
 * PUT /api/:context/notifications/preferences/:deviceId
 * Update notification preferences for a device
 */
notificationsRouter.put(
  '/:context/notifications/preferences/:deviceId',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, deviceId } = req.params;
    const body = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    // Accept both snake_case (frontend) and camelCase (legacy) formats
    const quietHoursStartValue = body.quiet_hours_start ?? body.quietHoursStart;
    const quietHoursEndValue = body.quiet_hours_end ?? body.quietHoursEnd;

    // Validate quiet hours format if provided
    if (quietHoursStartValue && !/^\d{2}:\d{2}$/.test(quietHoursStartValue)) {
      throw new ValidationError('quiet_hours_start must be in HH:MM format');
    }
    if (quietHoursEndValue && !/^\d{2}:\d{2}$/.test(quietHoursEndValue)) {
      throw new ValidationError('quiet_hours_end must be in HH:MM format');
    }

    // Map from both formats to internal format
    const prefsToUpdate = {
      draftReady: body.draft_ready ?? body.draftReady,
      draftFeedbackReminder: body.feedback_reminder ?? body.draftFeedbackReminder,
      ideaConnections: body.idea_connections ?? body.ideaConnections,
      learningSuggestions: body.learning_suggestions ?? body.learningSuggestions,
      weeklySummary: body.weekly_summary ?? body.weeklySummary,
      quietHoursEnabled: body.quiet_hours_enabled ?? body.quietHoursEnabled,
      quietHoursStart: quietHoursStartValue,
      quietHoursEnd: quietHoursEndValue,
      timezone: body.quiet_hours_timezone ?? body.timezone,
    };

    const success = await updatePrefs(context as AIContext, deviceId, prefsToUpdate);

    if (!success) {
      throw new Error('Failed to update preferences');
    }

    res.json({
      success: true,
      message: 'Preferences updated',
    });
  })
);

/**
 * POST /api/:context/notifications/push
 * Send a push notification via APNs
 */
notificationsRouter.post(
  '/:context/notifications/push',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { type, title, body, subtitle, draftId, ideaId, deviceId, data } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    if (!type || !title || !body) {
      throw new ValidationError('type, title, and body are required');
    }

    const validTypes = [
      'draft_ready',
      'feedback_reminder',
      'idea_connection',
      'learning_suggestion',
      'weekly_summary',
      'custom',
    ];

    if (!validTypes.includes(type)) {
      throw new ValidationError(`type must be one of: ${validTypes.join(', ')}`);
    }

    const payload: APNsPayload = {
      type,
      title,
      body,
      subtitle,
      draftId,
      ideaId,
      data,
    };

    const result = await sendNotification(context as AIContext, payload, deviceId);

    res.json({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
      results: result.results,
    });
  })
);

/**
 * POST /api/:context/notifications/:notificationId/opened
 * Record that a notification was opened
 */
notificationsRouter.post(
  '/:context/notifications/:notificationId/opened',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, notificationId } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    await recordNotificationOpened(context as AIContext, notificationId);

    res.json({
      success: true,
      message: 'Notification marked as opened',
    });
  })
);

/**
 * GET /api/:context/notifications/stats
 * Get notification statistics
 */
notificationsRouter.get(
  '/:context/notifications/stats',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { days = '30' } = req.query;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    const stats = await getNotificationStats(context as AIContext, parseInt(days as string, 10));

    // Return stats in snake_case format for frontend compatibility
    res.json({
      success: true,
      total_sent: stats?.totalSent ?? 0,
      total_opened: stats?.opened ?? 0,
      open_rate: stats?.openRate ?? 0,
      by_type: stats?.byType ?? [],
      period: {
        days: parseInt(days as string, 10),
      },
      // Also include nested stats for backwards compatibility
      stats,
    });
  })
);

/**
 * GET /api/:context/notifications/status
 * Get push notification configuration status
 */
notificationsRouter.get(
  '/:context/notifications/status',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Must be "personal" or "work"');
    }

    const status = getPushNotificationsStatus();
    // Get active device count for frontend compatibility
    const devices = await getActiveDeviceTokens(context as AIContext);

    res.json({
      success: true,
      // Frontend-expected fields (snake_case)
      configured: status.configured,
      provider: 'apns',
      active_devices: devices.length,
      // Legacy structure for backwards compatibility
      pushNotifications: {
        configured: status.configured,
        environment: status.environment,
      },
    });
  })
);
