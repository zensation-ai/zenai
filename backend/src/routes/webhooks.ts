/**
 * Phase 4: Webhook Management Routes
 * CRUD operations for webhooks and delivery history
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { pool } from '../utils/database';
import { testWebhook, getWebhookDeliveries } from '../services/webhooks';

export const webhooksRouter = Router();

/**
 * POST /api/webhooks
 * Create a new webhook endpoint
 */
webhooksRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, url, events, retryCount = 3, generateSecret = true } = req.body;

    if (!name || !url) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Name and URL are required'
      });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        error: 'Invalid events',
        message: 'Provide at least one event type to subscribe to',
        availableEvents: [
          'idea.created', 'idea.updated', 'idea.deleted', 'idea.archived',
          'meeting.created', 'meeting.updated', 'meeting.completed', 'meeting.notes_added',
          'calendar.synced', 'slack.message_processed'
        ]
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'Provide a valid webhook URL'
      });
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
  } catch (error) {
    console.error('Create webhook error:', error);
    res.status(500).json({
      error: 'Failed to create webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/webhooks
 * List all webhooks
 */
webhooksRouter.get('/', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('List webhooks error:', error);
    res.status(500).json({
      error: 'Failed to list webhooks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/webhooks/:id
 * Get webhook details
 */
webhooksRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, url, events, is_active, retry_count,
              last_triggered_at, failure_count, created_at, updated_at
       FROM webhooks
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Webhook not found',
        message: `No webhook found with id: ${id}`
      });
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
  } catch (error) {
    console.error('Get webhook error:', error);
    res.status(500).json({
      error: 'Failed to get webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /api/webhooks/:id
 * Update a webhook
 */
webhooksRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
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
        return res.status(400).json({
          error: 'Invalid URL',
          message: 'Provide a valid webhook URL'
        });
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
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Provide at least one field to update'
      });
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
      return res.status(404).json({
        error: 'Webhook not found',
        message: `No webhook found with id: ${id}`
      });
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
  } catch (error) {
    console.error('Update webhook error:', error);
    res.status(500).json({
      error: 'Failed to update webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
webhooksRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM webhooks WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Webhook not found',
        message: `No webhook found with id: ${id}`
      });
    }

    res.json({
      success: true,
      message: 'Webhook deleted',
      deletedWebhook: {
        id: result.rows[0].id,
        name: result.rows[0].name
      }
    });
  } catch (error) {
    console.error('Delete webhook error:', error);
    res.status(500).json({
      error: 'Failed to delete webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/webhooks/:id/test
 * Send a test webhook
 */
webhooksRouter.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await testWebhook(id);

    if (!result.success) {
      return res.status(result.error === 'Webhook not found' ? 404 : 502).json({
        success: false,
        error: 'Test delivery failed',
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Test webhook delivered successfully'
    });
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({
      error: 'Failed to test webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/webhooks/:id/deliveries
 * Get delivery history for a webhook
 */
webhooksRouter.get('/:id/deliveries', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Verify webhook exists
    const webhookResult = await pool.query(
      'SELECT id, name FROM webhooks WHERE id = $1',
      [id]
    );

    if (webhookResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Webhook not found',
        message: `No webhook found with id: ${id}`
      });
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
  } catch (error) {
    console.error('Get webhook deliveries error:', error);
    res.status(500).json({
      error: 'Failed to get webhook deliveries',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/webhooks/:id/secret/regenerate
 * Regenerate webhook secret
 */
webhooksRouter.post('/:id/secret/regenerate', async (req: Request, res: Response) => {
  try {
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
      return res.status(404).json({
        error: 'Webhook not found',
        message: `No webhook found with id: ${id}`
      });
    }

    res.json({
      success: true,
      message: 'Webhook secret regenerated. Save this secret - it will not be shown again!',
      webhookId: result.rows[0].id,
      webhookName: result.rows[0].name,
      secret: newSecret
    });
  } catch (error) {
    console.error('Regenerate webhook secret error:', error);
    res.status(500).json({
      error: 'Failed to regenerate webhook secret',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
