/**
 * Phase 4: Webhook Management Routes
 * CRUD operations for webhooks and delivery history
 * SECURITY: All endpoints require authentication
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { pool } from '../utils/database';
import { isValidUUID } from '../utils/database-context';
import { testWebhook, getWebhookDeliveries, WebhookEventType } from '../services/webhooks';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';

// Validation constants
const MAX_NAME_LENGTH = 100;
const MIN_RETRY_COUNT = 0;
const MAX_RETRY_COUNT = 10;
const MAX_DELIVERIES_LIMIT = 100;
const DEFAULT_DELIVERIES_LIMIT = 50;

const VALID_WEBHOOK_EVENTS: readonly WebhookEventType[] = [
  'idea.created', 'idea.updated', 'idea.deleted', 'idea.archived',
  'meeting.created', 'meeting.updated', 'meeting.completed', 'meeting.notes_added',
  'calendar.synced', 'slack.message_processed'
] as const;

function validateWebhookId(id: string): void {
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid webhook ID format. Must be a valid UUID.');
  }
}

function validateName(name: unknown): string {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Name is required and must be a non-empty string.');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Name too long. Maximum ${MAX_NAME_LENGTH} characters.`);
  }
  return name.trim();
}

function validateUrl(url: unknown): string {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('URL is required.');
  }
  try {
    new URL(url);
    return url;
  } catch {
    throw new ValidationError('Provide a valid webhook URL.');
  }
}

function validateEvents(events: unknown): WebhookEventType[] {
  if (!events || !Array.isArray(events) || events.length === 0) {
    throw new ValidationError('Provide at least one event type to subscribe to.');
  }
  for (const event of events) {
    if (typeof event !== 'string' || !VALID_WEBHOOK_EVENTS.includes(event as WebhookEventType)) {
      throw new ValidationError(`Invalid event type: ${event}. Valid events: ${VALID_WEBHOOK_EVENTS.join(', ')}`);
    }
  }
  return events as WebhookEventType[];
}

function validateRetryCount(retryCount: unknown): number {
  if (retryCount === undefined || retryCount === null) {return 3;}
  const count = typeof retryCount === 'string' ? parseInt(retryCount, 10) : retryCount;
  if (typeof count !== 'number' || isNaN(count)) {
    throw new ValidationError('Retry count must be a number.');
  }
  if (count < MIN_RETRY_COUNT || count > MAX_RETRY_COUNT) {
    throw new ValidationError(`Retry count must be between ${MIN_RETRY_COUNT} and ${MAX_RETRY_COUNT}.`);
  }
  return Math.floor(count);
}

function parseDeliveriesLimit(limitStr: string | undefined): number {
  if (!limitStr) {return DEFAULT_DELIVERIES_LIMIT;}
  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 1) {return DEFAULT_DELIVERIES_LIMIT;}
  return Math.min(limit, MAX_DELIVERIES_LIMIT);
}

export const webhooksRouter = Router();

/**
 * POST /api/webhooks
 * Create a new webhook endpoint
 */
webhooksRouter.post('/', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { name, url, events, retryCount, generateSecret = true } = req.body;

  // Validate all inputs
  const validatedName = validateName(name);
  const validatedUrl = validateUrl(url);
  const validatedEvents = validateEvents(events);
  const validatedRetryCount = validateRetryCount(retryCount);

  const id = uuidv4();
  const secret = generateSecret ? crypto.randomBytes(32).toString('hex') : null;

  await pool.query(
    `INSERT INTO webhooks (id, name, url, secret, events, retry_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, validatedName, validatedUrl, secret, JSON.stringify(validatedEvents), validatedRetryCount]
  );

  res.status(201).json({
    success: true,
    message: 'Webhook created',
    webhook: {
      id,
      name: validatedName,
      url: validatedUrl,
      secret, // Only returned on creation
      events: validatedEvents,
      retryCount: validatedRetryCount,
      isActive: true,
      createdAt: new Date()
    },
    instructions: secret ? {
      signature: 'Webhooks are signed with HMAC-SHA256',
      header: 'X-Webhook-Signature',
      format: 'sha256=<signature>',
      verification: 'Compare signature with HMAC-SHA256 of raw request body using the secret'
    } : undefined
  });
}));

/**
 * GET /api/webhooks
 * List all webhooks
 */
webhooksRouter.get('/', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  let rows: Record<string, unknown>[] = [];
  try {
    const result = await pool.query(
      `SELECT id, name, url, events, is_active, retry_count,
              last_triggered_at, failure_count, created_at, updated_at
       FROM webhooks
       ORDER BY created_at DESC`
    );
    rows = result.rows;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('does not exist')) throw err;
    // Table missing — return empty list gracefully
  }

  res.json({
    success: true,
    count: rows.length,
    webhooks: rows.map(row => ({
      id: row.id,
      name: row.name,
      url: row.url,
      events: row.events,
      isActive: row.is_active,
      retryCount: row.retry_count,
      lastTriggeredAt: row.last_triggered_at,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  });
}));

/**
 * GET /api/webhooks/:id
 * Get webhook details
 */
webhooksRouter.get('/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateWebhookId(id);

  const result = await pool.query(
    `SELECT id, name, url, events, is_active, retry_count,
            last_triggered_at, failure_count, created_at, updated_at
     FROM webhooks
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  const row = result.rows[0];
  res.json({
    success: true,
    webhook: {
      id: row.id,
      name: row.name,
      url: row.url,
      events: row.events,
      isActive: row.is_active,
      retryCount: row.retry_count,
      lastTriggeredAt: row.last_triggered_at,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  });
}));

/**
 * PATCH /api/webhooks/:id
 * Update a webhook
 */
webhooksRouter.patch('/:id', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateWebhookId(id);

  const { name, url, events, isActive, retryCount } = req.body;

  const updates: string[] = [];
  const values: (string | boolean | number)[] = [];
  let paramIndex = 1;

  if (name !== undefined) {
    const validatedName = validateName(name);
    updates.push(`name = $${paramIndex++}`);
    values.push(validatedName);
  }
  if (url !== undefined) {
    const validatedUrl = validateUrl(url);
    updates.push(`url = $${paramIndex++}`);
    values.push(validatedUrl);
  }
  if (events !== undefined) {
    const validatedEvents = validateEvents(events);
    updates.push(`events = $${paramIndex++}`);
    values.push(JSON.stringify(validatedEvents));
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean.');
    }
    updates.push(`is_active = $${paramIndex++}`);
    values.push(isActive);
  }
  if (retryCount !== undefined) {
    const validatedRetryCount = validateRetryCount(retryCount);
    updates.push(`retry_count = $${paramIndex++}`);
    values.push(validatedRetryCount);
  }

  if (updates.length === 0) {
    throw new ValidationError('Provide at least one field to update');
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE webhooks
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING id, name, url, events, is_active, retry_count`,
    values
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  const row = result.rows[0];
  res.json({
    success: true,
    message: 'Webhook updated',
    webhook: {
      id: row.id,
      name: row.name,
      url: row.url,
      events: row.events,
      isActive: row.is_active,
      retryCount: row.retry_count
    }
  });
}));

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
webhooksRouter.delete('/:id', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateWebhookId(id);

  const result = await pool.query(
    'DELETE FROM webhooks WHERE id = $1 RETURNING id, name',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  res.json({
    success: true,
    message: 'Webhook deleted',
    deletedWebhook: {
      id: result.rows[0].id,
      name: result.rows[0].name
    }
  });
}));

/**
 * POST /api/webhooks/:id/test
 * Send a test webhook
 */
webhooksRouter.post('/:id/test', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateWebhookId(id);

  const result = await testWebhook(id);

  if (!result.success) {
    if (result.error === 'Webhook not found') {
      throw new NotFoundError('Webhook');
    }
    throw new ValidationError(result.error || 'Test delivery failed');
  }

  res.json({
    success: true,
    message: 'Test webhook delivered successfully'
  });
}));

/**
 * GET /api/webhooks/:id/deliveries
 * Get delivery history for a webhook
 */
webhooksRouter.get('/:id/deliveries', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateWebhookId(id);
  const limit = parseDeliveriesLimit(req.query.limit as string | undefined);

  // Verify webhook exists
  const webhookResult = await pool.query(
    'SELECT id, name FROM webhooks WHERE id = $1',
    [id]
  );

  if (webhookResult.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  const deliveries = await getWebhookDeliveries(id, limit);

  res.json({
    success: true,
    webhookId: id,
    webhookName: webhookResult.rows[0].name,
    count: deliveries.length,
    deliveries: deliveries.map(d => ({
      id: d.id,
      eventType: d.event_type,
      responseStatus: d.response_status,
      attempt: d.attempt,
      status: d.status,
      errorMessage: d.error_message,
      deliveredAt: d.delivered_at,
      createdAt: d.created_at
    }))
  });
}));

/**
 * POST /api/webhooks/:id/secret/regenerate
 * Regenerate webhook secret
 */
webhooksRouter.post('/:id/secret/regenerate', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateWebhookId(id);
  const newSecret = crypto.randomBytes(32).toString('hex');

  const result = await pool.query(
    `UPDATE webhooks
     SET secret = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name`,
    [newSecret, id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  res.json({
    success: true,
    message: 'Webhook secret regenerated. Save this secret - it will not be shown again!',
    webhookId: result.rows[0].id,
    webhookName: result.rows[0].name,
    secret: newSecret
  });
}));
