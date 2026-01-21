import { Router, Request, Response } from 'express';
import { queryContext, getPool, AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';
import { responseCacheMiddleware, invalidateCacheAfter } from '../middleware/response-cache';

const router = Router();

// Get available contexts (cached for 1 hour)
router.get('/contexts', apiKeyAuth, responseCacheMiddleware, (req, res) => {
  res.json({
    contexts: [
      {
        id: 'personal',
        name: 'Personal',
        icon: '🏠',
        description: 'Private ideas and thoughts'
      },
      {
        id: 'work',
        name: 'Work',
        icon: '💼',
        description: 'Work projects and business ideas'
      }
    ],
    default: 'personal'
  });
});

/**
 * GET /api/:context/ideas
 * Fetch ideas for a specific context
 * Cached for 2 minutes for better performance
 */
router.get('/:context/ideas', apiKeyAuth, responseCacheMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { limit = '50', offset = '0', type, priority, category } = req.query;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const pool = getPool(context as AIContext);

  // Build query with optional filters
  let query = `
    SELECT
      id, title, type, category, priority, summary,
      next_steps, context_needed, keywords, raw_transcript,
      created_at, updated_at
    FROM ideas
    WHERE is_archived = false
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (type) {
    query += ` AND type = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }

  if (priority) {
    query += ` AND priority = $${paramIndex}`;
    params.push(priority);
    paramIndex++;
  }

  if (category) {
    query += ` AND category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await pool.query(query, params);

  // Get total count
  const countResult = await pool.query('SELECT COUNT(*) FROM ideas WHERE is_archived = false');
  const total = parseInt(countResult.rows[0].count);

  res.json({
    ideas: result.rows,
    pagination: {
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: parseInt(offset as string) + result.rows.length < total
    },
    context
  });
}));

/**
 * GET /api/:context/ideas/archived
 * Fetch archived ideas for a specific context
 */
router.get('/:context/ideas/archived', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { limit = '50', offset = '0' } = req.query;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const pool = getPool(context as AIContext);

  const result = await pool.query(`
    SELECT
      id, title, type, category, priority, summary,
      next_steps, context_needed, keywords, raw_transcript,
      created_at, updated_at
    FROM ideas
    WHERE is_archived = true
    ORDER BY updated_at DESC
    LIMIT $1 OFFSET $2
  `, [parseInt(limit as string), parseInt(offset as string)]);

  const countResult = await pool.query('SELECT COUNT(*) FROM ideas WHERE is_archived = true');
  const total = parseInt(countResult.rows[0].count);

  res.json({
    ideas: result.rows,
    pagination: {
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: parseInt(offset as string) + result.rows.length < total
    },
    context
  });
}));

/**
 * PUT /api/:context/ideas/:id/archive
 * Archive an idea
 */
router.put('/:context/ideas/:id/archive', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const pool = getPool(context as AIContext);
  const result = await pool.query(
    'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id, title',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  res.json({ success: true, archivedId: id, idea: result.rows[0] });
}));

/**
 * PUT /api/:context/ideas/:id/restore
 * Restore an archived idea
 */
router.put('/:context/ideas/:id/restore', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const pool = getPool(context as AIContext);
  const result = await pool.query(
    'UPDATE ideas SET is_archived = false, updated_at = NOW() WHERE id = $1 AND is_archived = true RETURNING id, title',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Archived idea');
  }

  res.json({ success: true, restoredId: id, idea: result.rows[0] });
}));

/**
 * GET /api/:context/ideas/search
 * Search ideas within a specific context
 */
router.post('/:context/ideas/search', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { query: searchQuery, limit = 20 } = req.body;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  if (!searchQuery) {
    throw new ValidationError('Search query is required');
  }

  const pool = getPool(context as AIContext);

  // Full-text search using PostgreSQL
  const result = await pool.query(`
    SELECT
      id, title, type, category, priority, summary,
      next_steps, context_needed, keywords, raw_transcript,
      created_at, updated_at,
      ts_rank(
        to_tsvector('german', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(raw_transcript, '')),
        plainto_tsquery('german', $1)
      ) as rank
    FROM ideas
    WHERE is_archived = false
      AND to_tsvector('german', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(raw_transcript, ''))
      @@ plainto_tsquery('german', $1)
    ORDER BY rank DESC
    LIMIT $2
  `, [searchQuery, limit]);

  res.json({
    ideas: result.rows,
    query: searchQuery,
    context,
    total: result.rows.length
  });
}));

export { router as contextsRouter };
