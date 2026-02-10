/**
 * Phase 4: Webhook Service
 * Manages outgoing webhooks for external integrations
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import axios from 'axios';
// pool.query() is intentional here: webhooks/webhook_deliveries are global tables (not per-context)
import { pool } from '../utils/database';
import { logger } from '../utils/logger';

// Webhook event types
export type WebhookEventType =
  | 'idea.created'
  | 'idea.updated'
  | 'idea.deleted'
  | 'idea.archived'
  | 'meeting.created'
  | 'meeting.updated'
  | 'meeting.completed'
  | 'meeting.notes_added'
  | 'calendar.synced'
  | 'slack.message_processed';

/** Generic webhook data - contains event-specific payload */
interface WebhookEventData {
  id?: string;
  [key: string]: unknown;
}

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: WebhookEventData;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: WebhookEventType[];
  isActive: boolean;
  retryCount: number;
}

/**
 * Create HMAC signature for webhook payload
 */
function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Get all active webhooks for a specific event
 */
async function getWebhooksForEvent(event: WebhookEventType): Promise<Webhook[]> {
  const result = await pool.query(
    `SELECT id, name, url, secret, events, is_active, retry_count
     FROM webhooks
     WHERE is_active = true
     AND events ? $1`,
    [event]
  );

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    url: row.url,
    secret: row.secret,
    events: row.events,
    isActive: row.is_active,
    retryCount: row.retry_count
  }));
}

/**
 * Deliver webhook to a single endpoint
 */
async function deliverWebhook(
  webhook: Webhook,
  payload: WebhookPayload,
  attempt: number = 1
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const deliveryId = uuidv4();
  const payloadString = JSON.stringify(payload);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Id': webhook.id,
      'X-Webhook-Event': payload.event,
      'X-Webhook-Delivery': deliveryId,
      'X-Webhook-Timestamp': payload.timestamp
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      headers['X-Webhook-Signature'] = `sha256=${signPayload(payloadString, webhook.secret)}`;
    }

    const response = await axios.post(webhook.url, payload, {
      headers,
      timeout: 10000, // 10 second timeout
      validateStatus: () => true // Accept any status code
    });

    const success = response.status >= 200 && response.status < 300;

    // Log delivery
    await pool.query(
      `INSERT INTO webhook_deliveries
       (id, webhook_id, event_type, payload, response_status, response_body, attempt, status, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        deliveryId,
        webhook.id,
        payload.event,
        payload,
        response.status,
        typeof response.data === 'string' ? response.data.substring(0, 1000) : JSON.stringify(response.data).substring(0, 1000),
        attempt,
        success ? 'success' : 'failed'
      ]
    );

    // Update webhook stats
    if (success) {
      await pool.query(
        `UPDATE webhooks
         SET last_triggered_at = NOW(), failure_count = 0
         WHERE id = $1`,
        [webhook.id]
      );
    } else {
      await pool.query(
        `UPDATE webhooks
         SET failure_count = failure_count + 1
         WHERE id = $1`,
        [webhook.id]
      );
    }

    return { success, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed delivery
    await pool.query(
      `INSERT INTO webhook_deliveries
       (id, webhook_id, event_type, payload, attempt, status, error_message)
       VALUES ($1, $2, $3, $4, $5, 'failed', $6)`,
      [deliveryId, webhook.id, payload.event, payload, attempt, errorMessage]
    );

    // Update failure count
    await pool.query(
      `UPDATE webhooks
       SET failure_count = failure_count + 1
       WHERE id = $1`,
      [webhook.id]
    );

    return { success: false, error: errorMessage };
  }
}

/**
 * Retry failed webhook delivery with exponential backoff
 */
async function retryWebhook(
  webhook: Webhook,
  payload: WebhookPayload,
  maxRetries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await deliverWebhook(webhook, payload, attempt);

    if (result.success) {
      logger.info('Webhook delivered successfully', { webhookName: webhook.name, attempt });
      return;
    }

    if (attempt < maxRetries) {
      // Exponential backoff: 1s, 4s, 9s
      const delay = attempt * attempt * 1000;
      logger.debug('Webhook delivery failed, retrying', { webhookName: webhook.name, delay, attempt });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  logger.warn('Webhook delivery failed after retries', { webhookName: webhook.name, maxRetries });
}

/**
 * Trigger webhooks for an event
 * This is the main function to call from other services
 */
export async function triggerWebhook(event: WebhookEventType, data: WebhookEventData): Promise<void> {
  try {
    const webhooks = await getWebhooksForEvent(event);

    if (webhooks.length === 0) {
      return; // No webhooks configured for this event
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data
    };

    logger.info('Triggering webhooks', { webhookCount: webhooks.length, event });

    // Deliver webhooks in parallel (don't wait for response)
    webhooks.forEach(webhook => {
      retryWebhook(webhook, payload, webhook.retryCount).catch(err => {
        logger.error('Webhook error', err instanceof Error ? err : undefined, { webhookName: webhook.name });
      });
    });
  } catch (error) {
    logger.error('Trigger webhook error', error instanceof Error ? error : undefined);
  }
}

/**
 * Create a new webhook
 */
export async function createWebhook(
  name: string,
  url: string,
  events: WebhookEventType[],
  options: { secret?: string; retryCount?: number } = {}
): Promise<{ id: string; secret: string }> {
  const id = uuidv4();
  const secret = options.secret || crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO webhooks (id, name, url, secret, events, retry_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name, url, secret, JSON.stringify(events), options.retryCount || 3]
  );

  return { id, secret };
}

/**
 * Get webhook delivery history
 */
/** Webhook delivery record */
interface WebhookDelivery {
  id: string;
  event_type: WebhookEventType;
  payload: WebhookPayload;
  response_status: number | null;
  response_body: string | null;
  attempt: number;
  status: 'success' | 'failed';
  error_message: string | null;
  delivered_at: Date | null;
  created_at: Date;
}

export async function getWebhookDeliveries(
  webhookId: string,
  limit: number = 50
): Promise<WebhookDelivery[]> {
  const result = await pool.query(
    `SELECT id, event_type, payload, response_status, response_body,
            attempt, status, error_message, delivered_at, created_at
     FROM webhook_deliveries
     WHERE webhook_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [webhookId, limit]
  );

  return result.rows;
}

/**
 * Test a webhook by sending a test event
 */
export async function testWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
  const result = await pool.query(
    `SELECT id, name, url, secret, events, is_active, retry_count
     FROM webhooks
     WHERE id = $1`,
    [webhookId]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Webhook not found' };
  }

  const webhook: Webhook = {
    id: result.rows[0].id,
    name: result.rows[0].name,
    url: result.rows[0].url,
    secret: result.rows[0].secret,
    events: result.rows[0].events,
    isActive: result.rows[0].is_active,
    retryCount: result.rows[0].retry_count
  };

  const testPayload: WebhookPayload = {
    event: 'idea.created',
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      message: 'This is a test webhook delivery',
      webhookId: webhook.id,
      webhookName: webhook.name
    }
  };

  return deliverWebhook(webhook, testPayload, 1);
}

/**
 * Clean up old webhook deliveries
 */
export async function cleanupWebhookDeliveries(daysToKeep: number = 30): Promise<number> {
  // Validate daysToKeep to prevent negative values or excessive retention
  const safeDays = Math.max(1, Math.min(Math.floor(daysToKeep), 365));

  // Use parameterized query to prevent SQL injection
  const result = await pool.query(
    `DELETE FROM webhook_deliveries
     WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [safeDays]
  );

  return result.rowCount || 0;
}
