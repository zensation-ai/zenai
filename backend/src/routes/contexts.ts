import { Router, Request, Response } from 'express';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { responseCacheMiddleware, invalidateCacheForContext } from '../middleware/response-cache';
import { getRecentAIActivities, markActivitiesAsRead, getUnreadActivityCount } from '../services/ai-activity-logger';
import { getUserId } from '../utils/user-context';
import { escapeLike } from '../utils/sql-helpers';

const router = Router();

// Get available contexts (cached for 1 hour)
router.get('/contexts', apiKeyAuth, responseCacheMiddleware, (req, res) => {
  res.json({
    success: true,
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
      },
      {
        id: 'learning',
        name: 'Learning',
        icon: '📚',
        description: 'Learning and education'
      },
      {
        id: 'creative',
        name: 'Creative',
        icon: '🎨',
        description: 'Creative projects and art'
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
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  // Build query with optional filters + user_id isolation
  let query = `
    SELECT
      id, title, type, category, priority, summary,
      next_steps, context_needed, keywords, raw_transcript,
      created_at, updated_at
    FROM ideas
    WHERE is_archived = false AND user_id = $1
  `;

  const params: (string | number)[] = [userId];
  let paramIndex = 2;

  if (type) {
    query += ` AND type = $${paramIndex}`;
    params.push(String(type));
    paramIndex++;
  }

  if (priority) {
    query += ` AND priority = $${paramIndex}`;
    params.push(String(priority));
    paramIndex++;
  }

  if (category) {
    query += ` AND category = $${paramIndex}`;
    params.push(String(category));
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const result = await queryContext(context as AIContext, query, params);

  // Get total count
  const countResult = await queryContext(context as AIContext, 'SELECT COUNT(*) FROM ideas WHERE is_archived = false AND user_id = $1', [userId]);
  const total = parseInt(countResult.rows[0].count, 10);

  res.json({
    success: true,
    ideas: result.rows,
    pagination: {
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      hasMore: parseInt(offset as string, 10) + result.rows.length < total
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
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const parsedLimit = parseInt(limit as string, 10) || 50;
  const parsedOffset = parseInt(offset as string, 10) || 0;

  let result;
  try {
    result = await queryContext(context as AIContext, `
      SELECT
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, raw_transcript,
        created_at, updated_at
      FROM ideas
      WHERE is_archived = true AND user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parsedLimit, parsedOffset]);
  } catch {
    result = await queryContext(context as AIContext, `
      SELECT
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords,
        created_at, updated_at
      FROM ideas
      WHERE is_archived = true AND user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parsedLimit, parsedOffset]);
  }

  const countResult = await queryContext(context as AIContext, 'SELECT COUNT(*) FROM ideas WHERE is_archived = true AND user_id = $1', [userId]);
  const total = parseInt(countResult.rows[0].count, 10);

  res.json({
    success: true,
    ideas: result.rows,
    pagination: {
      total,
      limit: parsedLimit,
      offset: parsedOffset,
      hasMore: parsedOffset + result.rows.length < total
    },
    context
  });
}));

/**
 * PUT /api/:context/ideas/:id/archive
 * Archive an idea
 */
router.put('/:context/ideas/:id/archive', apiKeyAuth, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const result = await queryContext(
    context as AIContext,
    'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, title',
    [id, userId]
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
router.put('/:context/ideas/:id/restore', apiKeyAuth, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const result = await queryContext(
    context as AIContext,
    'UPDATE ideas SET is_archived = false, updated_at = NOW() WHERE id = $1 AND is_archived = true AND user_id = $2 RETURNING id, title',
    [id, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Archived idea');
  }

  // Invalidate cache so restored idea appears in list
  await invalidateCacheForContext(context as AIContext, 'ideas');

  res.json({ success: true, restoredId: id, idea: result.rows[0] });
}));

// NOTE: Move route removed — handled by ideasContextRouter in ideas.ts (registered earlier in main.ts)

/**
 * GET /api/:context/ideas/search
 * Search ideas within a specific context
 */
router.post('/:context/ideas/search', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { query: searchQuery, limit = 20 } = req.body;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  if (!searchQuery) {
    throw new ValidationError('Search query is required');
  }

  const searchPattern = `%${escapeLike(searchQuery)}%`;
  const limitNum = typeof limit === 'number' ? limit : parseInt(String(limit), 10) || 20;

  const result = await queryContext(context as AIContext, `
    SELECT
      id, title, type, category, priority, summary,
      next_steps, context_needed, keywords, raw_transcript,
      created_at, updated_at
    FROM ideas
    WHERE is_archived = false AND user_id = $1
      AND (
        title ILIKE $2
        OR summary ILIKE $2
        OR raw_transcript ILIKE $2
        OR COALESCE(keywords::text, '') ILIKE $2
      )
    ORDER BY created_at DESC
    LIMIT $3
  `, [userId, searchPattern, limitNum]);

  res.json({
    success: true,
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
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  // Parse excluded IDs
  const excludeIds = exclude ? (exclude as string).split(',').filter(Boolean) : [];

  // Build exclusion clause — user_id is $1, limit is $2
  let excludeClause = '';
  const params: (string | number)[] = [userId, parseInt(limit as string, 10)];

  if (excludeIds.length > 0) {
    excludeClause = ` AND id NOT IN (${excludeIds.map((_, idx) => `$${idx + 3}`).join(',')})`;
    params.push(...excludeIds);
  }

  const result = await queryContext(
    context as AIContext,
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, raw_transcript,
            created_at, updated_at
     FROM ideas
     WHERE is_archived = false AND user_id = $1
       ${excludeClause}
     ORDER BY
       CASE priority
         WHEN 'high' THEN 1
         WHEN 'medium' THEN 2
         WHEN 'low' THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT $2`,
    params
  );

  const countResult = await queryContext(
    context as AIContext,
    'SELECT COUNT(*) as total FROM ideas WHERE is_archived = false AND user_id = $1',
    [userId]
  );

  res.json({
    success: true,
    ideas: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    hasMore: result.rows.length === parseInt(limit as string, 10),
  });
}));

/**
 * POST /api/:context/ideas/:id/triage
 * Record a triage action for an idea
 */
router.post('/:context/ideas/:id/triage', apiKeyAuth, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  const { action } = req.body;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const validActions = ['priority', 'keep', 'later', 'archive'];
  if (!action || !validActions.includes(action)) {
    throw new ValidationError(`Invalid triage action. Must be one of: ${validActions.join(', ')}`);
  }

  // Check if idea exists and belongs to user
  const ideaCheck = await queryContext(context as AIContext, 'SELECT id, title, priority FROM ideas WHERE id = $1 AND user_id = $2', [id, userId]);
  if (ideaCheck.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const ideaTitle = ideaCheck.rows[0].title;

  // Apply action
  switch (action) {
    case 'priority':
      await queryContext(context as AIContext, 'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3', [id, 'high', userId]);
      break;
    case 'archive':
      await queryContext(context as AIContext, 'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 AND user_id = $2', [id, userId]);
      break;
    case 'later':
      await queryContext(context as AIContext, 'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3', [id, 'low', userId]);
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

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const activities = await getRecentAIActivities(context as AIContext, parseInt(limit as string, 10));
  const unreadCount = await getUnreadActivityCount(context as AIContext);

  res.json({
    success: true,
    activities,
    unreadCount,
    context
  });
}));

/**
 * POST /api/:context/ai-activity/mark-read
 * Mark activities as read
 */
router.post('/:context/ai-activity/mark-read', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { activityIds } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const markedCount = await markActivitiesAsRead(context as AIContext, activityIds);

  res.json({
    success: true,
    markedCount,
    context
  });
}));

export { router as contextsRouter };
