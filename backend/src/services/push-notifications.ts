/**
 * Push Notifications Service
 *
 * Handles sending push notifications via Apple Push Notification Service (APNs).
 * Supports both token-based (JWT) and certificate-based authentication.
 *
 * Features:
 * - Device token management
 * - Notification preferences
 * - Rate limiting
 * - Quiet hours
 * - Notification history tracking
 * - Queue processing for batch sends
 */

import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import http2 from 'http2';
import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface DeviceToken {
  id: string;
  deviceToken: string;
  deviceId: string;
  deviceName?: string;
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  context: AIContext;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt?: Date;
}

export interface NotificationPreferences {
  draftReady: boolean;
  draftFeedbackReminder: boolean;
  ideaConnections: boolean;
  learningSuggestions: boolean;
  weeklySummary: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
  maxNotificationsPerHour: number;
  maxNotificationsPerDay: number;
}

export interface PushNotification {
  title: string;
  body: string;
  subtitle?: string;
  badge?: number;
  sound?: string;
  category?: string;
  threadId?: string;
  data?: Record<string, unknown>;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  subtitle?: string;
  draftId?: string;
  ideaId?: string;
  data?: Record<string, unknown>;
}

export type NotificationType =
  | 'draft_ready'
  | 'feedback_reminder'
  | 'idea_connection'
  | 'learning_suggestion'
  | 'weekly_summary'
  | 'custom';

// ===========================================
// APNs Configuration
// ===========================================

interface APNsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  production: boolean;
}

const getAPNsConfig = (): APNsConfig | null => {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID || 'com.alexanderbering.PersonalAIBrain';
  const privateKey = process.env.APNS_PRIVATE_KEY;
  const production = process.env.NODE_ENV === 'production';

  if (!keyId || !teamId || !privateKey) {
    return null;
  }

  return { keyId, teamId, bundleId, privateKey, production };
};

// APNs JWT token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

const generateAPNsToken = (config: APNsConfig): string => {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (tokens expire after 1 hour, we refresh at 50 min)
  if (cachedToken && cachedToken.expiresAt > now + 600) {
    return cachedToken.token;
  }

  const token = jwt.sign(
    {
      iss: config.teamId,
      iat: now,
    },
    config.privateKey,
    {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: config.keyId,
      },
    }
  );

  cachedToken = {
    token,
    expiresAt: now + 3600, // 1 hour
  };

  return token;
};

// ===========================================
// Device Token Management
// ===========================================

/**
 * Registers or updates a device token
 */
export async function registerDeviceToken(
  context: AIContext,
  deviceToken: string,
  deviceInfo: {
    deviceId: string;
    deviceName?: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
  }
): Promise<{ success: boolean; tokenId?: string; message?: string }> {
  try {
    const tokenId = uuidv4();

    await queryContext(
      context,
      `INSERT INTO device_tokens (
        id, device_token, device_id, device_name, device_model, os_version, app_version, context, last_used_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (device_token, context)
      DO UPDATE SET
        device_id = EXCLUDED.device_id,
        device_name = EXCLUDED.device_name,
        device_model = EXCLUDED.device_model,
        os_version = EXCLUDED.os_version,
        app_version = EXCLUDED.app_version,
        last_used_at = NOW(),
        is_active = true,
        failed_count = 0,
        updated_at = NOW()`,
      [
        tokenId,
        deviceToken,
        deviceInfo.deviceId,
        deviceInfo.deviceName || null,
        deviceInfo.deviceModel || null,
        deviceInfo.osVersion || null,
        deviceInfo.appVersion || null,
        context,
      ]
    );

    // Initialize preferences if not exist
    await queryContext(
      context,
      `INSERT INTO notification_preferences (id, device_id, context)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id, context) DO NOTHING`,
      [uuidv4(), deviceInfo.deviceId, context]
    );

    logger.info('Device token registered', {
      deviceId: deviceInfo.deviceId,
      context,
    });

    return { success: true, tokenId };
  } catch (error) {
    logger.error('Failed to register device token', error instanceof Error ? error : undefined);
    return { success: false, message: 'Failed to register device token' };
  }
}

/**
 * Unregisters a device token
 */
export async function unregisterDeviceToken(
  context: AIContext,
  deviceToken: string
): Promise<boolean> {
  try {
    await queryContext(
      context,
      `UPDATE device_tokens SET is_active = false, updated_at = NOW()
       WHERE device_token = $1 AND context = $2`,
      [deviceToken, context]
    );
    return true;
  } catch (error) {
    logger.error('Failed to unregister device token', error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Gets active device tokens for a context
 */
export async function getActiveDeviceTokens(
  context: AIContext,
  deviceId?: string
): Promise<DeviceToken[]> {
  try {
    let query = `
      SELECT id, device_token, device_id, device_name, device_model,
             os_version, app_version, context, is_active, last_used_at
      FROM device_tokens
      WHERE context = $1 AND is_active = true AND failed_count < 3
    `;
    const params: (string | AIContext)[] = [context];

    if (deviceId) {
      query += ` AND device_id = $2`;
      params.push(deviceId);
    }

    const result = await queryContext(context, query, params);

    interface DeviceTokenRow {
      id: string;
      device_token: string;
      device_id: string;
      device_name: string | null;
      device_model: string | null;
      os_version: string | null;
      app_version: string | null;
      context: AIContext;
      is_active: boolean;
      last_used_at: Date | null;
    }

    return result.rows.map((row: DeviceTokenRow) => ({
      id: row.id,
      deviceToken: row.device_token,
      deviceId: row.device_id,
      deviceName: row.device_name ?? undefined,
      deviceModel: row.device_model ?? undefined,
      osVersion: row.os_version ?? undefined,
      appVersion: row.app_version ?? undefined,
      context: row.context,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at ?? undefined,
    }));
  } catch (error) {
    logger.error('Failed to get active device tokens', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Notification Preferences
// ===========================================

/**
 * Gets notification preferences for a device
 */
export async function getNotificationPreferences(
  context: AIContext,
  deviceId: string
): Promise<NotificationPreferences | null> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM notification_preferences WHERE device_id = $1 AND context = $2`,
      [deviceId, context]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      draftReady: row.draft_ready,
      draftFeedbackReminder: row.draft_feedback_reminder,
      ideaConnections: row.idea_connections,
      learningSuggestions: row.learning_suggestions,
      weeklySummary: row.weekly_summary,
      quietHoursEnabled: row.quiet_hours_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      timezone: row.timezone,
      maxNotificationsPerHour: row.max_notifications_per_hour,
      maxNotificationsPerDay: row.max_notifications_per_day,
    };
  } catch (error) {
    logger.error('Failed to get notification preferences', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Updates notification preferences
 */
export async function updateNotificationPreferences(
  context: AIContext,
  deviceId: string,
  preferences: Partial<NotificationPreferences>
): Promise<boolean> {
  try {
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (preferences.draftReady !== undefined) {
      updates.push(`draft_ready = $${paramIndex++}`);
      values.push(preferences.draftReady);
    }
    if (preferences.draftFeedbackReminder !== undefined) {
      updates.push(`draft_feedback_reminder = $${paramIndex++}`);
      values.push(preferences.draftFeedbackReminder);
    }
    if (preferences.ideaConnections !== undefined) {
      updates.push(`idea_connections = $${paramIndex++}`);
      values.push(preferences.ideaConnections);
    }
    if (preferences.learningSuggestions !== undefined) {
      updates.push(`learning_suggestions = $${paramIndex++}`);
      values.push(preferences.learningSuggestions);
    }
    if (preferences.weeklySummary !== undefined) {
      updates.push(`weekly_summary = $${paramIndex++}`);
      values.push(preferences.weeklySummary);
    }
    if (preferences.quietHoursEnabled !== undefined) {
      updates.push(`quiet_hours_enabled = $${paramIndex++}`);
      values.push(preferences.quietHoursEnabled);
    }
    if (preferences.quietHoursStart !== undefined) {
      updates.push(`quiet_hours_start = $${paramIndex++}`);
      values.push(preferences.quietHoursStart);
    }
    if (preferences.quietHoursEnd !== undefined) {
      updates.push(`quiet_hours_end = $${paramIndex++}`);
      values.push(preferences.quietHoursEnd);
    }
    if (preferences.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(preferences.timezone);
    }

    if (updates.length === 0) {
      return true;
    }

    values.push(deviceId, context);

    await queryContext(
      context,
      `UPDATE notification_preferences
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE device_id = $${paramIndex++} AND context = $${paramIndex}`,
      values
    );

    return true;
  } catch (error) {
    logger.error('Failed to update notification preferences', error instanceof Error ? error : undefined);
    return false;
  }
}

// ===========================================
// Send Notifications
// ===========================================

/**
 * Sends a push notification to a specific device token via APNs
 */
async function sendToAPNs(
  deviceToken: string,
  notification: PushNotification,
  config: APNsConfig
): Promise<{ success: boolean; apnsId?: string; error?: string }> {
  return new Promise((resolve) => {
    const host = config.production
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com';

    const client = http2.connect(`https://${host}`);

    client.on('error', (err) => {
      logger.error('APNs connection error', err);
      resolve({ success: false, error: err.message });
    });

    const token = generateAPNsToken(config);

    const payload = {
      aps: {
        alert: {
          title: notification.title,
          body: notification.body,
          ...(notification.subtitle && { subtitle: notification.subtitle }),
        },
        badge: notification.badge,
        sound: notification.sound || 'default',
        ...(notification.category && { category: notification.category }),
        ...(notification.threadId && { 'thread-id': notification.threadId }),
        'mutable-content': 1,
        'content-available': 1,
      },
      ...(notification.data && notification.data),
    };

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      'authorization': `bearer ${token}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': '0',
    });

    let responseData = '';

    req.on('response', (headers) => {
      const status = headers[':status'];
      const apnsId = headers['apns-id'] as string;

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        client.close();

        if (status === 200) {
          resolve({ success: true, apnsId });
        } else {
          let errorReason = 'Unknown error';
          try {
            const parsed = JSON.parse(responseData);
            errorReason = parsed.reason || errorReason;
          } catch {
            // Ignore parse error
          }
          resolve({ success: false, error: `${status}: ${errorReason}` });
        }
      });
    });

    req.on('error', (err) => {
      client.close();
      resolve({ success: false, error: err.message });
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * Sends a notification to all active devices for a context
 */
export async function sendNotification(
  context: AIContext,
  payload: NotificationPayload,
  targetDeviceId?: string
): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  results: Array<{ deviceId: string; success: boolean; error?: string }>;
}> {
  const config = getAPNsConfig();

  if (!config) {
    logger.warn('APNs not configured, notification not sent');
    return { success: false, sent: 0, failed: 0, results: [] };
  }

  // Get active device tokens
  const devices = await getActiveDeviceTokens(context, targetDeviceId);

  if (devices.length === 0) {
    logger.info('No active devices to send notification to');
    return { success: true, sent: 0, failed: 0, results: [] };
  }

  const results: Array<{ deviceId: string; success: boolean; error?: string }> = [];

  // Check preferences and send to each device
  for (const device of devices) {
    // Check if notification type is enabled for this device
    const prefs = await getNotificationPreferences(context, device.deviceId);
    if (prefs) {
      if (payload.type === 'draft_ready' && !prefs.draftReady) {continue;}
      if (payload.type === 'feedback_reminder' && !prefs.draftFeedbackReminder) {continue;}
      if (payload.type === 'idea_connection' && !prefs.ideaConnections) {continue;}
      if (payload.type === 'learning_suggestion' && !prefs.learningSuggestions) {continue;}
      if (payload.type === 'weekly_summary' && !prefs.weeklySummary) {continue;}
    }

    // Check rate limits and quiet hours
    const canSendResult = await queryContext(
      context,
      `SELECT can_send_notification($1, $2) as allowed`,
      [device.deviceId, context]
    );

    if (!canSendResult.rows[0]?.allowed) {
      results.push({
        deviceId: device.deviceId,
        success: false,
        error: 'Rate limited or quiet hours',
      });
      continue;
    }

    // Send the notification
    const notification: PushNotification = {
      title: payload.title,
      body: payload.body,
      subtitle: payload.subtitle,
      category: payload.type,
      data: {
        type: payload.type,
        ...(payload.draftId && { draftId: payload.draftId }),
        ...(payload.ideaId && { ideaId: payload.ideaId }),
        ...payload.data,
      },
    };

    const sendResult = await sendToAPNs(device.deviceToken, notification, config);

    // Record in history
    await queryContext(
      context,
      `INSERT INTO notification_history (
        id, device_token_id, context, notification_type, title, body, subtitle,
        draft_id, idea_id, payload, status, sent_at, apns_id, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13)`,
      [
        uuidv4(),
        device.id,
        context,
        payload.type,
        payload.title,
        payload.body,
        payload.subtitle || null,
        payload.draftId || null,
        payload.ideaId || null,
        JSON.stringify(notification.data),
        sendResult.success ? 'sent' : 'failed',
        sendResult.apnsId || null,
        sendResult.error || null,
      ]
    );

    // Update device token status
    if (sendResult.success) {
      await queryContext(
        context,
        `UPDATE device_tokens SET last_used_at = NOW(), failed_count = 0 WHERE id = $1`,
        [device.id]
      );

      // Increment rate limit counters
      await queryContext(
        context,
        `SELECT increment_notification_count($1, $2)`,
        [device.deviceId, context]
      );
    } else {
      // Handle specific APNs errors
      if (
        sendResult.error?.includes('BadDeviceToken') ||
        sendResult.error?.includes('Unregistered')
      ) {
        await queryContext(
          context,
          `UPDATE device_tokens SET is_active = false, last_failure_reason = $1 WHERE id = $2`,
          [sendResult.error, device.id]
        );
      } else {
        await queryContext(
          context,
          `UPDATE device_tokens SET failed_count = failed_count + 1, last_failure_reason = $1 WHERE id = $2`,
          [sendResult.error, device.id]
        );
      }
    }

    results.push({
      deviceId: device.deviceId,
      success: sendResult.success,
      error: sendResult.error,
    });
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  logger.info('Notification batch sent', {
    context,
    type: payload.type,
    sent,
    failed,
  });

  return {
    success: sent > 0 || failed === 0,
    sent,
    failed,
    results,
  };
}

// ===========================================
// Convenience Methods for Specific Notifications
// ===========================================

/**
 * Sends a "Draft Ready" notification
 */
export async function notifyDraftReady(
  context: AIContext,
  draftId: string,
  draftType: string,
  ideaTitle: string
): Promise<boolean> {
  const typeNames: Record<string, string> = {
    email: 'E-Mail',
    article: 'Artikel',
    proposal: 'Angebot',
    document: 'Dokument',
    generic: 'Text',
  };

  const typeName = typeNames[draftType] || 'Entwurf';

  const result = await sendNotification(context, {
    type: 'draft_ready',
    title: `${typeName}-Entwurf fertig`,
    body: `Dein ${typeName}-Entwurf zu "${truncate(ideaTitle, 50)}" ist bereit.`,
    subtitle: 'Tippen zum Ansehen',
    draftId,
  });

  return result.sent > 0;
}

/**
 * Sends a feedback reminder notification
 */
export async function notifyFeedbackReminder(
  context: AIContext,
  draftId: string,
  draftType: string,
  ideaTitle: string
): Promise<boolean> {
  const result = await sendNotification(context, {
    type: 'feedback_reminder',
    title: 'Wie war der Entwurf?',
    body: `Du hast "${truncate(ideaTitle, 40)}" verwendet. Kurzes Feedback hilft uns zu verbessern.`,
    draftId,
  });

  return result.sent > 0;
}

/**
 * Sends an idea connection notification
 */
export async function notifyIdeaConnection(
  context: AIContext,
  ideaId: string,
  ideaTitle: string,
  connectedToTitle: string
): Promise<boolean> {
  const result = await sendNotification(context, {
    type: 'idea_connection',
    title: 'Neue Verbindung entdeckt',
    body: `"${truncate(ideaTitle, 30)}" ist mit "${truncate(connectedToTitle, 30)}" verbunden.`,
    ideaId,
  });

  return result.sent > 0;
}

/**
 * Sends a proactive suggestion notification
 */
export async function notifyProactiveSuggestion(
  context: AIContext,
  suggestion: {
    id: string;
    title: string;
    description: string;
    type: string;
    priority: string;
  }
): Promise<boolean> {
  const result = await sendNotification(context, {
    type: 'learning_suggestion',
    title: suggestion.title,
    body: truncate(suggestion.description, 100),
    subtitle: suggestion.priority === 'high' ? 'Hohe Prioritaet' : undefined,
    data: {
      suggestionId: suggestion.id,
      suggestionType: suggestion.type,
    },
  });

  return result.sent > 0;
}

// ===========================================
// Analytics
// ===========================================

/**
 * Gets notification statistics
 */
export async function getNotificationStats(
  context: AIContext,
  days: number = 30
): Promise<{
  totalSent: number;
  delivered: number;
  opened: number;
  failed: number;
  openRate: number;
  byType: Array<{
    type: string;
    count: number;
    openRate: number;
  }>;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE status = 'delivered' OR status = 'sent') as delivered,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        notification_type
       FROM notification_history
       WHERE context = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY ROLLUP(notification_type)`,
      [context, days]
    );

    interface NotificationStatsRow {
      total_sent: string;
      delivered: string;
      opened: string;
      failed: string;
      notification_type: string | null;
    }

    const overall = result.rows.find((r: NotificationStatsRow) => r.notification_type === null) || {
      total_sent: '0',
      delivered: '0',
      opened: '0',
      failed: '0',
    };

    const byType = result.rows
      .filter((r: NotificationStatsRow): r is NotificationStatsRow & { notification_type: string } => r.notification_type !== null)
      .map((r) => ({
        type: r.notification_type,
        count: parseInt(r.total_sent, 10),
        openRate: parseInt(r.delivered, 10) > 0 ? (parseInt(r.opened, 10) / parseInt(r.delivered, 10)) * 100 : 0,
      }));

    const delivered = parseInt(overall.delivered, 10);
    const opened = parseInt(overall.opened, 10);

    return {
      totalSent: parseInt(overall.total_sent, 10),
      delivered,
      opened,
      failed: parseInt(overall.failed, 10),
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      byType,
    };
  } catch (error) {
    logger.error('Failed to get notification stats', error instanceof Error ? error : undefined);
    return {
      totalSent: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      openRate: 0,
      byType: [],
    };
  }
}

/**
 * Records that a notification was opened
 */
export async function recordNotificationOpened(
  context: AIContext,
  notificationId: string
): Promise<boolean> {
  try {
    await queryContext(
      context,
      `UPDATE notification_history SET opened_at = NOW(), status = 'opened'
       WHERE id = $1 AND context = $2`,
      [notificationId, context]
    );
    return true;
  } catch {
    return false;
  }
}

// ===========================================
// Helpers
// ===========================================

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {return str;}
  return str.substring(0, maxLength - 3) + '...';
}

// ===========================================
// Configuration Check
// ===========================================

export function isPushNotificationsConfigured(): boolean {
  return getAPNsConfig() !== null;
}

export function getPushNotificationsStatus(): {
  configured: boolean;
  environment: 'production' | 'sandbox' | 'not_configured';
} {
  const config = getAPNsConfig();
  if (!config) {
    return { configured: false, environment: 'not_configured' };
  }
  return {
    configured: true,
    environment: config.production ? 'production' : 'sandbox',
  };
}
