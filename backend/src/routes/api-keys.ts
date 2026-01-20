/**
 * Phase 4: API Key Management Routes
 * Create, list, revoke API keys for external integrations
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../utils/database';
import { isValidUUID } from '../utils/database-context';
import { generateApiKey, apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

// Input validation constants
const MAX_NAME_LENGTH = 100;
const MIN_RATE_LIMIT = 1;
const MAX_RATE_LIMIT = 100000;
const MIN_EXPIRES_IN = 3600; // 1 hour minimum
const MAX_EXPIRES_IN = 31536000; // 1 year maximum
const VALID_SCOPES = ['read', 'write', 'admin'] as const;

function validateApiKeyId(id: string): void {
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid API key ID format. Must be a valid UUID.');
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

function validateScopes(scopes: unknown): string[] {
  if (!scopes) {return ['read'];}
  if (!Array.isArray(scopes)) {
    throw new ValidationError('Scopes must be an array.');
  }
  for (const scope of scopes) {
    if (typeof scope !== 'string' || !VALID_SCOPES.includes(scope as any)) {
      throw new ValidationError(`Invalid scope: ${scope}. Valid scopes: ${VALID_SCOPES.join(', ')}`);
    }
  }
  return scopes as string[];
}

function validateRateLimit(rateLimit: unknown): number {
  if (rateLimit === undefined || rateLimit === null) {return 1000;}
  const limit = typeof rateLimit === 'string' ? parseInt(rateLimit, 10) : rateLimit;
  if (typeof limit !== 'number' || isNaN(limit)) {
    throw new ValidationError('Rate limit must be a number.');
  }
  if (limit < MIN_RATE_LIMIT || limit > MAX_RATE_LIMIT) {
    throw new ValidationError(`Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}.`);
  }
  return Math.floor(limit);
}

function validateExpiresIn(expiresIn: unknown): number | null {
  if (expiresIn === undefined || expiresIn === null) {return null;}
  const seconds = typeof expiresIn === 'string' ? parseInt(expiresIn, 10) : expiresIn;
  if (typeof seconds !== 'number' || isNaN(seconds)) {
    throw new ValidationError('ExpiresIn must be a number (seconds).');
  }
  if (seconds < MIN_EXPIRES_IN || seconds > MAX_EXPIRES_IN) {
    throw new ValidationError(`ExpiresIn must be between ${MIN_EXPIRES_IN} (1 hour) and ${MAX_EXPIRES_IN} (1 year) seconds.`);
  }
  return Math.floor(seconds);
}

export const apiKeysRouter = Router();

/**
 * POST /api/keys
 * Create a new API key
 * SECURITY: Admin-only endpoint
 */
apiKeysRouter.post('/', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { name, scopes, rateLimit, expiresIn } = req.body;

  // Validate all inputs
  const validatedName = validateName(name);
  const validatedScopes = validateScopes(scopes);
  const validatedRateLimit = validateRateLimit(rateLimit);
  const validatedExpiresIn = validateExpiresIn(expiresIn);

  const { key, prefix, hash } = await generateApiKey();
  const id = uuidv4();

  let expiresAt = null;
  if (validatedExpiresIn) {
    expiresAt = new Date(Date.now() + validatedExpiresIn * 1000);
  }

  await pool.query(
    `INSERT INTO api_keys (id, name, key_hash, key_prefix, scopes, rate_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, validatedName, hash, prefix, JSON.stringify(validatedScopes), validatedRateLimit, expiresAt]
  );

  res.status(201).json({
    success: true,
    message: 'API key created. Save this key - it will not be shown again!',
    apiKey: {
      id,
      name: validatedName,
      key, // Only returned on creation
      prefix,
      scopes: validatedScopes,
      rateLimit: validatedRateLimit,
      expiresAt,
      createdAt: new Date()
    }
  });
}));

/**
 * GET /api/keys
 * List all API keys (without revealing the actual keys)
 * SECURITY: Admin-only endpoint
 * NOTE: keyPrefix intentionally not exposed to prevent brute-force attack narrowing
 */
apiKeysRouter.get('/', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT id, name, scopes, rate_limit, expires_at,
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
      // SECURITY: keyPrefix removed - exposes info useful for brute-force attacks
      scopes: row.scopes,
      rateLimit: row.rate_limit,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      isActive: row.is_active
    }))
  });
}));

/**
 * GET /api/keys/:id
 * Get a specific API key details
 * SECURITY: Admin-only endpoint
 * NOTE: keyPrefix intentionally not exposed to prevent brute-force attack narrowing
 */
apiKeysRouter.get('/:id', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateApiKeyId(id);

  const result = await pool.query(
    `SELECT id, name, scopes, rate_limit, expires_at,
            last_used_at, created_at, is_active
     FROM api_keys
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('API key');
  }

  const row = result.rows[0];
  res.json({
    success: true,
    apiKey: {
      id: row.id,
      name: row.name,
      // SECURITY: keyPrefix removed - exposes info useful for brute-force attacks
      scopes: row.scopes,
      rateLimit: row.rate_limit,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      isActive: row.is_active
    }
  });
}));

/**
 * PATCH /api/keys/:id
 * Update an API key (name, scopes, rate limit, active status)
 * SECURITY: Admin-only endpoint
 */
apiKeysRouter.patch('/:id', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateApiKeyId(id);

  const { name, scopes, rateLimit, isActive } = req.body;

  const updates: string[] = [];
  const values: (string | number | boolean | string[])[] = [];
  let paramIndex = 1;

  if (name !== undefined) {
    const validatedName = validateName(name);
    updates.push(`name = $${paramIndex++}`);
    values.push(validatedName);
  }
  if (scopes !== undefined) {
    const validatedScopes = validateScopes(scopes);
    updates.push(`scopes = $${paramIndex++}`);
    values.push(JSON.stringify(validatedScopes));
  }
  if (rateLimit !== undefined) {
    const validatedRateLimit = validateRateLimit(rateLimit);
    updates.push(`rate_limit = $${paramIndex++}`);
    values.push(validatedRateLimit);
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean.');
    }
    updates.push(`is_active = $${paramIndex++}`);
    values.push(isActive);
  }

  if (updates.length === 0) {
    throw new ValidationError('Provide at least one field to update');
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
    throw new NotFoundError('API key');
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
}));

/**
 * DELETE /api/keys/:id
 * Delete (revoke) an API key
 * SECURITY: Admin-only endpoint
 */
apiKeysRouter.delete('/:id', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateApiKeyId(id);

  const result = await pool.query(
    'DELETE FROM api_keys WHERE id = $1 RETURNING id, name',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('API key');
  }

  res.json({
    success: true,
    message: 'API key deleted',
    deletedKey: {
      id: result.rows[0].id,
      name: result.rows[0].name
    }
  });
}));

/**
 * POST /api/keys/:id/regenerate
 * Regenerate an API key (creates new key, invalidates old)
 * SECURITY: Admin-only endpoint
 */
apiKeysRouter.post('/:id/regenerate', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateApiKeyId(id);

  const { key, prefix, hash } = await generateApiKey();

  const result = await pool.query(
    `UPDATE api_keys
     SET key_hash = $1, key_prefix = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, scopes, rate_limit, expires_at`,
    [hash, prefix, id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('API key');
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
}));

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
