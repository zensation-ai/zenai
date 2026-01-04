/**
 * Phase 4: API Key Management Routes
 * Create, list, revoke API keys for external integrations
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../utils/database';
import { generateApiKey, hashApiKey, apiKeyAuth, requireScope } from '../middleware/auth';

export const apiKeysRouter = Router();

/**
 * POST /api/keys
 * Create a new API key
 */
apiKeysRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, scopes = ['read'], rateLimit = 1000, expiresIn } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Name required',
        message: 'Please provide a name for the API key'
      });
    }

    const { key, prefix, hash } = generateApiKey();
    const id = uuidv4();

    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000);
    }

    await pool.query(
      `INSERT INTO api_keys (id, name, key_hash, key_prefix, scopes, rate_limit, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, hash, prefix, JSON.stringify(scopes), rateLimit, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: 'API key created. Save this key - it will not be shown again!',
      apiKey: {
        id,
        name,
        key, // Only returned on creation
        prefix,
        scopes,
        rateLimit,
        expiresAt,
        createdAt: new Date()
      }
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({
      error: 'Failed to create API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/keys
 * List all API keys (without revealing the actual keys)
 */
apiKeysRouter.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, key_prefix, scopes, rate_limit, expires_at,
              last_used_at, created_at, is_active
       FROM api_keys
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      count: result.rows.length,
      apiKeys: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        keyPrefix: row.key_prefix,
        scopes: row.scopes,
        rateLimit: row.rate_limit,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        isActive: row.is_active
      }))
    });
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({
      error: 'Failed to list API keys',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/keys/:id
 * Get a specific API key details
 */
apiKeysRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, key_prefix, scopes, rate_limit, expires_at,
              last_used_at, created_at, is_active
       FROM api_keys
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'API key not found',
        message: `No API key found with id: ${id}`
      });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      apiKey: {
        id: row.id,
        name: row.name,
        keyPrefix: row.key_prefix,
        scopes: row.scopes,
        rateLimit: row.rate_limit,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        isActive: row.is_active
      }
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({
      error: 'Failed to get API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /api/keys/:id
 * Update an API key (name, scopes, rate limit, active status)
 */
apiKeysRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, scopes, rateLimit, isActive } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (scopes !== undefined) {
      updates.push(`scopes = $${paramIndex++}`);
      values.push(JSON.stringify(scopes));
    }
    if (rateLimit !== undefined) {
      updates.push(`rate_limit = $${paramIndex++}`);
      values.push(rateLimit);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Provide at least one field to update'
      });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE api_keys
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, name, key_prefix, scopes, rate_limit, expires_at, is_active`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'API key not found',
        message: `No API key found with id: ${id}`
      });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      message: 'API key updated',
      apiKey: {
        id: row.id,
        name: row.name,
        keyPrefix: row.key_prefix,
        scopes: row.scopes,
        rateLimit: row.rate_limit,
        expiresAt: row.expires_at,
        isActive: row.is_active
      }
    });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({
      error: 'Failed to update API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/keys/:id
 * Delete (revoke) an API key
 */
apiKeysRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM api_keys WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'API key not found',
        message: `No API key found with id: ${id}`
      });
    }

    res.json({
      success: true,
      message: 'API key deleted',
      deletedKey: {
        id: result.rows[0].id,
        name: result.rows[0].name
      }
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({
      error: 'Failed to delete API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/keys/:id/regenerate
 * Regenerate an API key (creates new key, invalidates old)
 */
apiKeysRouter.post('/:id/regenerate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { key, prefix, hash } = generateApiKey();

    const result = await pool.query(
      `UPDATE api_keys
       SET key_hash = $1, key_prefix = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, scopes, rate_limit, expires_at`,
      [hash, prefix, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'API key not found',
        message: `No API key found with id: ${id}`
      });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      message: 'API key regenerated. Save this key - it will not be shown again!',
      apiKey: {
        id: row.id,
        name: row.name,
        key, // Only returned on regeneration
        prefix,
        scopes: row.scopes,
        rateLimit: row.rate_limit,
        expiresAt: row.expires_at
      }
    });
  } catch (error) {
    console.error('Regenerate API key error:', error);
    res.status(500).json({
      error: 'Failed to regenerate API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/keys/verify
 * Verify an API key is valid (used by external services)
 */
apiKeysRouter.post('/verify', apiKeyAuth, (req: Request, res: Response) => {
  res.json({
    success: true,
    valid: true,
    apiKey: {
      id: req.apiKey!.id,
      name: req.apiKey!.name,
      scopes: req.apiKey!.scopes,
      rateLimit: req.apiKey!.rateLimit
    }
  });
});
