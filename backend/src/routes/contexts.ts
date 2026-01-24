import { Router, Request, Response } from 'express';
import { queryContext, AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { responseCacheMiddleware, invalidateCacheForContext } from '../middleware/response-cache';
import { getRecentAIActivities, markActivitiesAsRead, getUnreadActivityCount } from '../services/ai-activity-logger';

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
 * TEMPORARILY DISABLED CACHE to debug persistence issue
 */
router.get('/:context/ideas', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { limit = '50', offset = '0', type, priority, category } = req.query;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  // CRITICAL FIX: Use queryContext() instead of pool.query() to ensure correct schema
  // queryContext() sets search_path to the correct schema (personal or work)
  // Without this, queries would read from the wrong schema and miss new ideas!

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

  const result = await queryContext(context as AIContext, query, params);

  // Get total count
  const countResult = await queryContext(context as AIContext, 'SELECT COUNT(*) FROM ideas WHERE is_archived = false');
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

  const result = await queryContext(context as AIContext, `
    SELECT
      id, title, type, category, priority, summary,
      next_steps, context_needed, keywords, raw_transcript,
      created_at, updated_at
    FROM ideas
    WHERE is_archived = true
    ORDER BY updated_at DESC
    LIMIT $1 OFFSET $2
  `, [parseInt(limit as string), parseInt(offset as string)]);

  const countResult = await queryContext(context as AIContext, 'SELECT COUNT(*) FROM ideas WHERE is_archived = true');
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

  const result = await queryContext(
    context as AIContext,
    'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id, title',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  // Invalidate cache so archived idea disappears from list
  await invalidateCacheForContext(context as AIContext, 'ideas');

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

  const result = await queryContext(
    context as AIContext,
    'UPDATE ideas SET is_archived = false, updated_at = NOW() WHERE id = $1 AND is_archived = true RETURNING id, title',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Archived idea');
  }

  // Invalidate cache so restored idea appears in list
  await invalidateCacheForContext(context as AIContext, 'ideas');

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

  // Full-text search using PostgreSQL
  const result = await queryContext(context as AIContext, `
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

/**
 * GET /api/:context/ideas/triage
 * Get ideas for triage, sorted by priority and creation date
 */
router.get('/:context/ideas/triage', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { limit = '20', exclude } = req.query;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  // Parse excluded IDs
  const excludeIds = exclude ? (exclude as string).split(',').filter(Boolean) : [];

  // Build exclusion clause
  let excludeClause = '';
  const params: any[] = [parseInt(limit as string)];

  if (excludeIds.length > 0) {
    excludeClause = ` AND id NOT IN (${excludeIds.map((_, idx) => `$${idx + 2}`).join(',')})`;
    params.push(...excludeIds);
  }

  // Get ideas for triage: not archived, sorted by priority then date
  const result = await queryContext(
    context as AIContext,
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, raw_transcript,
            created_at, updated_at
     FROM ideas
     WHERE is_archived = false
       ${excludeClause}
     ORDER BY
       CASE priority
         WHEN 'high' THEN 1
         WHEN 'medium' THEN 2
         WHEN 'low' THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT $1`,
    params
  );

  // Get total count
  const countResult = await queryContext(
    context as AIContext,
    'SELECT COUNT(*) as total FROM ideas WHERE is_archived = false'
  );

  res.json({
    success: true,
    ideas: result.rows,
    total: parseInt(countResult.rows[0].total),
    hasMore: result.rows.length === parseInt(limit as string),
  });
}));

/**
 * POST /api/:context/ideas/:id/triage
 * Record a triage action for an idea
 */
router.post('/:context/ideas/:id/triage', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  const { action } = req.body;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const validActions = ['priority', 'keep', 'later', 'archive'];
  if (!action || !validActions.includes(action)) {
    throw new ValidationError(`Invalid triage action. Must be one of: ${validActions.join(', ')}`);
  }

  // Check if idea exists
  const ideaCheck = await queryContext(context as AIContext, 'SELECT id, title, priority FROM ideas WHERE id = $1', [id]);
  if (ideaCheck.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const ideaTitle = ideaCheck.rows[0].title;

  // Apply action
  switch (action) {
    case 'priority':
      await queryContext(context as AIContext, 'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1', [id, 'high']);
      break;
    case 'archive':
      await queryContext(context as AIContext, 'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1', [id]);
      break;
    case 'later':
      await queryContext(context as AIContext, 'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1', [id, 'low']);
      break;
    // 'keep' = no changes needed
  }

  res.json({
    success: true,
    ideaId: id,
    action,
    message: `Idee "${ideaTitle.substring(0, 30)}..." ${action === 'priority' ? 'priorisiert' : action === 'archive' ? 'archiviert' : action === 'later' ? 'auf später' : 'behalten'}`,
  });
}));

/**
 * GET /api/:context/ai-activity
 * Get recent AI activity feed for dashboard
 */
router.get('/:context/ai-activity', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { limit = '10' } = req.query;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const activities = await getRecentAIActivities(context as AIContext, parseInt(limit as string));
  const unreadCount = await getUnreadActivityCount(context as AIContext);

  res.json({
    activities,
    unreadCount,
    context
  });
}));

/**
 * POST /api/:context/ai-activity/mark-read
 * Mark activities as read
 */
router.post('/:context/ai-activity/mark-read', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { activityIds } = req.body;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const markedCount = await markActivitiesAsRead(context as AIContext, activityIds);

  res.json({
    success: true,
    markedCount,
    context
  });
}));

export { router as contextsRouter };
