/**
 * Phase 4: Webhook Management Routes
 * CRUD operations for webhooks and delivery history
 * SECURITY: All endpoints require authentication
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { pool } from '../utils/database';
import { testWebhook, getWebhookDeliveries } from '../services/webhooks';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';

export const webhooksRouter = Router();

/**
 * POST /api/webhooks
 * Create a new webhook endpoint
 */
webhooksRouter.post('/', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { name, url, events, retryCount = 3, generateSecret = true } = req.body;

  if (!name || !url) {
    throw new ValidationError('Name and URL are required');
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    throw new ValidationError('Provide at least one event type to subscribe to');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new ValidationError('Provide a valid webhook URL');
  }

  const id = uuidv4();
  const secret = generateSecret ? crypto.randomBytes(32).toString('hex') : null;

  await pool.query(
    `INSERT INTO webhooks (id, name, url, secret, events, retry_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name, url, secret, JSON.stringify(events), retryCount]
  );

  res.status(201).json({
    success: true,
    message: 'Webhook created',
    webhook: {
      id,
      name,
      url,
      secret, // Only returned on creation
      events,
      retryCount,
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
  const result = await pool.query(
    `SELECT id, name, url, events, is_active, retry_count,
            last_triggered_at, failure_count, created_at, updated_at
     FROM webhooks
     ORDER BY created_at DESC`
  );

  res.json({
    success: true,
    count: result.rows.length,
    webhooks: result.rows.map(row => ({
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
  const { name, url, events, isActive, retryCount } = req.body;

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(name);
  }
  if (url !== undefined) {
    try {
      new URL(url);
    } catch {
      throw new ValidationError('Provide a valid webhook URL');
    }
    updates.push(`url = $${paramIndex++}`);
    values.push(url);
  }
  if (events !== undefined) {
    updates.push(`events = $${paramIndex++}`);
    values.push(JSON.stringify(events));
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(isActive);
  }
  if (retryCount !== undefined) {
    updates.push(`retry_count = $${paramIndex++}`);
    values.push(retryCount);
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
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

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
