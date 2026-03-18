import { Router, Request, Response, NextFunction } from 'express';
import { queryContext, AIContext, isValidContext, isValidUUID } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { trackInteraction } from '../services/user-profile';
import { triggerWebhook } from '../services/webhooks';
import { logAIActivity } from '../services/ai-activity-logger';
import { learnFromCorrection, learnFromThought } from '../services/learning-engine';
import { findDuplicates, mergeIdeas } from '../services/duplicate-detection';
import { logger } from '../utils/logger';
import {
  validatePagination,
  validateIdeaType,
  validateCategory,
  validatePriority,
  validateRequiredString,
  parseIntSafe,
  validateContextParam,
} from '../utils/validation';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, AppError } from '../middleware/errorHandler';
import { parseIdeaRow, parseIdeaRows, IdeaDatabaseRow, serializeArrayField } from '../utils/idea-parser';
import { trackActivity } from '../services/activity-tracker';
import { moveIdea } from '../services/idea-move';
import { invalidateCacheForContext } from '../middleware/response-cache';
import { getUserId } from '../utils/user-context';
import { escapeLike } from '../utils/sql-helpers';

// ===========================================
// Type-safe row interfaces for aggregate queries
// ===========================================
interface CountRow { count: string }
interface TypeCountRow extends CountRow { type: string }
interface CategoryCountRow extends CountRow { category: string }
interface PriorityCountRow extends CountRow { priority: string }

// ===========================================
// Shared column lists — single source of truth
// ===========================================
const IDEA_LIST_COLUMNS = `id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, context, is_favorite, created_at, updated_at`;

const IDEA_TRIAGE_COLUMNS = `i.id, i.title, i.type, i.category, i.priority, i.summary,
        i.next_steps, i.context_needed, i.keywords, i.context,
        i.created_at, i.updated_at, i.raw_transcript`;

const IDEA_SEARCH_COLUMNS = `id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, context, created_at`;

const IDEA_DETAIL_COLUMNS = `id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, raw_transcript,
        context, created_at, updated_at`;

export const ideasRouter = Router();

// Context-aware router for routes like /api/:context/ideas/*
export const ideasContextRouter = Router();

/**
 * Get context from request header or query param, default to 'personal'
 */
function getContext(req: Request): AIContext {
  const context = (req.headers['x-ai-context'] as string) || (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError(`Invalid context: ${context}. Must be one of: personal, work, learning, creative`);
  }
  return context;
}

/**
 * Middleware to validate UUID parameter
 */
function validateUUID(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id;
  if (id && !isValidUUID(id)) {
    throw new ValidationError('Invalid ID format. Must be a valid UUID.');
  }
  next();
}

// ===========================================
// Shared handler functions
// ===========================================

/**
 * Shared handler: GET triage ideas
 */
async function handleTriageGet(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);

  const limitResult = parseIntSafe(req.query.limit?.toString(), { default: 20, min: 1, max: 50, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 20;

  const excludeIds = req.query.exclude ? (req.query.exclude as string).split(',').filter(id => isValidUUID(id)) : [];

  let excludeClause = '';
  const params: (string | number)[] = [ctx, limit, userId];
  if (excludeIds.length > 0) {
    excludeClause = ` AND i.id NOT IN (${excludeIds.map((_, idx) => `$${idx + 4}`).join(',')})`;
    params.push(...excludeIds);
  }

  const result = await queryContext(
    ctx,
    `SELECT ${IDEA_TRIAGE_COLUMNS}
     FROM ideas i
     LEFT JOIN triage_history th ON th.idea_id = i.id
       AND th.created_at > NOW() - INTERVAL '24 hours'
     WHERE i.context = $1
       AND i.is_archived = false
       AND th.id IS NULL
       AND i.user_id = $3
       ${excludeClause}
     ORDER BY
       CASE i.priority
         WHEN 'high' THEN 1
         WHEN 'medium' THEN 2
         WHEN 'low' THEN 3
         ELSE 4
       END,
       i.created_at DESC
     LIMIT $2`,
    params
  );

  const countResult = await queryContext(
    ctx,
    `SELECT COUNT(*) as total
     FROM ideas i
     LEFT JOIN triage_history th ON th.idea_id = i.id
       AND th.created_at > NOW() - INTERVAL '24 hours'
     WHERE i.context = $1
       AND i.is_archived = false
       AND th.id IS NULL
       AND i.user_id = $2`,
    [ctx, userId]
  );

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    total: parseInt(countResult.rows[0].total, 10),
    hasMore: result.rows.length === limit,
  });
}

/**
 * Shared handler: POST triage action
 */
async function handleTriagePost(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);
  const ideaId = req.params.id;

  if (!isValidUUID(ideaId)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const { action } = req.body;

  const validActions = ['priority', 'keep', 'later', 'archive'];
  if (!action || !validActions.includes(action)) {
    throw new ValidationError(`Invalid triage action. Must be one of: ${validActions.join(', ')}`);
  }

  const ideaCheck = await queryContext(ctx, 'SELECT id, title, priority FROM ideas WHERE id = $1 AND user_id = $2', [ideaId, userId]);
  if (ideaCheck.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const oldPriority = ideaCheck.rows[0].priority;
  const ideaTitle = ideaCheck.rows[0].title;

  let updateData: { priority?: 'low' | 'medium' | 'high'; is_archived?: boolean } = {};
  let actionDescription = '';

  switch (action) {
    case 'priority':
      updateData = { priority: 'high' };
      actionDescription = 'als Priorität markiert';
      break;
    case 'archive':
      updateData = { is_archived: true };
      actionDescription = 'archiviert';
      break;
    case 'later':
      updateData = { priority: 'low' };
      actionDescription = 'auf später verschoben';
      break;
    case 'keep':
      actionDescription = 'beibehalten';
      break;
  }

  if (Object.keys(updateData).length > 0) {
    const ALLOWED_TRIAGE_COLUMNS = new Set(['priority', 'is_archived']);
    const safeKeys = Object.keys(updateData).filter(k => ALLOWED_TRIAGE_COLUMNS.has(k));

    if (safeKeys.length !== Object.keys(updateData).length) {
      throw new ValidationError('Invalid update fields detected');
    }

    await queryContext(
      ctx,
      `UPDATE ideas SET ${safeKeys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $${safeKeys.length + 2}`,
      [ideaId, ...safeKeys.map(k => updateData[k as keyof typeof updateData]), userId]
    );

    if (updateData.priority && oldPriority !== updateData.priority) {
      learnFromCorrection(ideaId, {
        oldPriority,
        newPriority: updateData.priority,
      }).catch(err => logger.debug('Background triage correction learning skipped', { error: err.message }));
    }
  }

  await queryContext(
    ctx,
    `INSERT INTO triage_history (idea_id, context, action, user_id) VALUES ($1, $2, $3, $4)`,
    [ideaId, ctx, action, userId]
  );

  trackInteraction({
    idea_id: ideaId,
    interaction_type: action === 'priority' ? 'prioritize' : action === 'archive' ? 'archive' : 'view',
    metadata: { action, source: 'triage', old_priority: oldPriority },
  }).catch((err) => logger.debug('Background triage tracking skipped', { error: err.message }));

  logAIActivity({
    context: ctx,
    type: 'idea_triaged',
    message: `Gedanke "${ideaTitle.substring(0, 50)}..." ${actionDescription}`,
    ideaId,
    metadata: { action, oldPriority, newPriority: updateData.priority },
  }).catch((err) => logger.debug('Background AI activity logging skipped', { error: err.message }));

  if (action === 'archive') {
    triggerWebhook('idea.archived', { id: ideaId })
      .catch((err) => logger.debug('Background triage archive webhook skipped', { error: err.message }));
  }

  res.json({
    success: true,
    ideaId,
    action,
    message: `Idee ${actionDescription}`,
  });
}

/**
 * Shared handler: GET list ideas with pagination
 */
async function handleListIdeas(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);

  const paginationResult = validatePagination(req.query as Record<string, unknown>, { maxLimit: 100, defaultLimit: 20 });
  if (!paginationResult.success) {
    throw new ValidationError('Invalid pagination');
  }
  const { limit, offset } = paginationResult.data ?? { limit: 20, offset: 0 };

  const typeResult = validateIdeaType(req.query.type);
  if (!typeResult.success) {
    throw new ValidationError('Invalid type filter');
  }

  const categoryResult = validateCategory(req.query.category);
  if (!categoryResult.success) {
    throw new ValidationError('Invalid category filter');
  }

  const priorityResult = validatePriority(req.query.priority);
  if (!priorityResult.success) {
    throw new ValidationError('Invalid priority filter');
  }

  let whereClause = '';
  const params: (string | number | boolean)[] = [userId];
  let paramIndex = 2;

  if (typeResult.data) {
    whereClause += ` AND type = $${paramIndex++}`;
    params.push(typeResult.data);
  }
  if (categoryResult.data) {
    whereClause += ` AND category = $${paramIndex++}`;
    params.push(categoryResult.data);
  }
  if (priorityResult.data) {
    whereClause += ` AND priority = $${paramIndex++}`;
    params.push(priorityResult.data);
  }
  if (req.query.favorites === 'true') {
    whereClause += ` AND is_favorite = true`;
  }

  const result = await queryContext(
    ctx,
    `SELECT ${IDEA_LIST_COLUMNS}
     FROM ideas
     WHERE is_archived = false AND user_id = $1 ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const countResult = await queryContext(
    ctx,
    `SELECT COUNT(*) as total FROM ideas WHERE is_archived = false AND user_id = $1 ${whereClause}`,
    params
  );

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    pagination: {
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
      hasMore: offset + limit < parseInt(countResult.rows[0].total, 10),
    },
  });
}

/**
 * Shared handler: GET archived ideas
 */
async function handleArchivedList(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);

  const paginationResult = validatePagination(req.query as Record<string, unknown>, { maxLimit: 100, defaultLimit: 20 });
  if (!paginationResult.success) {
    throw new ValidationError('Invalid pagination');
  }
  const pagination = paginationResult.data ?? { limit: 20, offset: 0 };

  const result = await queryContext(
    ctx,
    `SELECT ${IDEA_LIST_COLUMNS}
     FROM ideas
     WHERE is_archived = true AND user_id = $3
     ORDER BY updated_at DESC
     LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset, userId]
  );

  const countResult = await queryContext(
    ctx,
    'SELECT COUNT(*) as total FROM ideas WHERE is_archived = true AND user_id = $1',
    [userId]
  );

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    pagination: {
      total: parseInt(countResult.rows[0].total, 10),
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.offset + pagination.limit < parseInt(countResult.rows[0].total, 10),
    },
  });
}

/**
 * Shared handler: PUT archive idea
 */
async function handleArchiveIdea(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);
  const id = req.params.id;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_archived = true, archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  trackInteraction({
    idea_id: id,
    interaction_type: 'archive',
    metadata: { action: 'archive', context: ctx },
  }).catch((err) => logger.debug('Background archive tracking skipped', { error: err.message }));

  triggerWebhook('idea.archived', {
    id,
    context: ctx,
  }).catch((err) => logger.debug('Background archive webhook skipped', { error: err.message }));

  res.json({ success: true, archivedId: id });
}

/**
 * Shared handler: PUT restore idea
 */
async function handleRestoreIdea(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);
  const id = req.params.id;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_archived = false, archived_at = NULL, updated_at = NOW() WHERE id = $1 AND is_archived = true AND user_id = $2 RETURNING id, title',
    [id, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Archived idea');
  }

  trackInteraction({
    idea_id: id,
    interaction_type: 'edit',
    metadata: { action: 'restore', context: ctx },
  }).catch((err) => logger.debug('Background restore tracking skipped', { error: err.message }));

  triggerWebhook('idea.updated', {
    id,
    action: 'restored',
    context: ctx,
  }).catch((err) => logger.debug('Background restore webhook skipped', { error: err.message }));

  res.json({ success: true, restoredId: id, idea: result.rows[0] });
}

/**
 * Shared handler: DELETE idea
 */
async function handleDeleteIdea(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);
  const id = req.params.id;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(ctx, 'DELETE FROM ideas WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  trackInteraction({
    idea_id: id,
    interaction_type: 'archive',
    metadata: { action: 'delete', context: ctx },
  }).catch((err) => logger.debug('Background delete tracking skipped', { error: err.message }));

  triggerWebhook('idea.deleted', {
    id,
    context: ctx,
  }).catch((err) => logger.debug('Background webhook skipped', { error: err.message }));

  res.json({ success: true, deletedId: id });
}

// ===========================================
// Legacy Router (ideasRouter) — uses header/query context
// ===========================================

/**
 * GET /api/ideas/stats/summary
 * Get statistics about ideas (excluding archived)
 * NOTE: Must be defined BEFORE /:id route to avoid being caught by it
 */
ideasRouter.get('/stats/summary', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const userId = getUserId(req);
  const [totalResult, typeResult, categoryResult, priorityResult] = await Promise.all([
    queryContext(ctx, 'SELECT COUNT(*) as total FROM ideas WHERE is_archived = false AND user_id = $1', [userId]),
    queryContext(ctx, 'SELECT type, COUNT(*) as count FROM ideas WHERE is_archived = false AND user_id = $1 GROUP BY type', [userId]),
    queryContext(ctx, 'SELECT category, COUNT(*) as count FROM ideas WHERE is_archived = false AND user_id = $1 GROUP BY category', [userId]),
    queryContext(ctx, 'SELECT priority, COUNT(*) as count FROM ideas WHERE is_archived = false AND user_id = $1 GROUP BY priority', [userId]),
  ]);

  res.json({
    success: true,
    total: parseInt(totalResult.rows[0]?.total ?? '0', 10),
    byType: (typeResult.rows as TypeCountRow[]).reduce((acc, row) => ({ ...acc, [row.type]: parseInt(row.count, 10) }), {} as Record<string, number>),
    byCategory: (categoryResult.rows as CategoryCountRow[]).reduce((acc, row) => ({ ...acc, [row.category]: parseInt(row.count, 10) }), {} as Record<string, number>),
    byPriority: (priorityResult.rows as PriorityCountRow[]).reduce((acc, row) => ({ ...acc, [row.priority]: parseInt(row.count, 10) }), {} as Record<string, number>),
  });
}));

/**
 * GET /api/ideas/triage — delegates to shared handler
 */
ideasRouter.get('/triage', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleTriageGet(getContext(req), req, res);
}));

/**
 * POST /api/ideas/:id/triage — delegates to shared handler
 */
ideasRouter.post('/:id/triage', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleTriagePost(getContext(req), req, res);
}));

/**
 * GET /api/ideas — delegates to shared handler
 */
ideasRouter.get('/', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleListIdeas(getContext(req), req, res);
}));

/**
 * GET /api/ideas/recommendations
 * Get personalized idea recommendations based on user profile
 * NOTE: Must be defined BEFORE /:id route to avoid being caught by it
 */
ideasRouter.get('/recommendations', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);

  const limitResult = parseIntSafe(req.query.limit?.toString(), { default: 10, min: 1, max: 50, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 10;

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, keywords, context, created_at, relevance_score
     FROM get_idea_recommendations($1, $2)`,
    [ctx, limit]
  );

  const totalTime = Date.now() - startTime;

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    personalized: result.rows.length > 0 && result.rows[0].relevance_score > 0,
    processingTime: totalTime,
  });
}));

/**
 * GET /api/ideas/:id
 * Get a single idea by ID
 */
ideasRouter.get('/:id', apiKeyAuth, validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const userId = getUserId(req);
  const result = await queryContext(
    ctx,
    `SELECT ${IDEA_DETAIL_COLUMNS}
     FROM ideas WHERE id = $1 AND user_id = $2`,
    [req.params.id, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const row = result.rows[0];

  // Track view interaction for learning
  trackInteraction({
    idea_id: req.params.id,
    interaction_type: 'view',
  }).catch((err) => logger.debug('Background view tracking skipped', { error: err.message }));

  // Increment view count
  queryContext(ctx, 'UPDATE ideas SET viewed_count = viewed_count + 1 WHERE id = $1 AND user_id = $2', [req.params.id, userId])
    .catch((err) => logger.debug('Background view count update skipped', { error: err.message }));

  res.json({ success: true, idea: parseIdeaRow(row as IdeaDatabaseRow) });
}));

/**
 * POST /api/ideas/search
 * Semantic search using Supabase pgvector function
 */
ideasRouter.post('/search', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);
  const userId = getUserId(req);

  const queryResult = validateRequiredString(req.body.query, 'query', { minLength: 1, maxLength: 500 });
  if (!queryResult.success) {
    throw new ValidationError('Invalid search query');
  }
  const searchQuery = queryResult.data ?? '';

  const limitResult = parseIntSafe(req.body.limit?.toString(), { default: 10, min: 1, max: 50, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 10;

  const thresholdResult = parseIntSafe(req.body.threshold?.toString(), { default: 0.5, min: 0, max: 1, fieldName: 'threshold' });
  const threshold = thresholdResult.success ? (thresholdResult.data ?? 0.5) : 0.5;

  // Generate embedding for search query
  const embeddingStart = Date.now();
  const queryEmbedding = await generateEmbedding(searchQuery);
  const embeddingTime = Date.now() - embeddingStart;

  if (queryEmbedding.length === 0) {
    // Fallback to text search if embedding fails — escape LIKE metacharacters
    const safeQuery = escapeLike(searchQuery);
    const textResult = await queryContext(
      ctx,
      `SELECT ${IDEA_SEARCH_COLUMNS}
       FROM ideas
       WHERE (title ILIKE $1 OR summary ILIKE $1 OR raw_transcript ILIKE $1) AND user_id = $3
       ORDER BY created_at DESC
       LIMIT $2`,
      [`%${safeQuery}%`, limit, userId]
    );

    return res.json({
      success: true,
      ideas: parseIdeaRows(textResult.rows as IdeaDatabaseRow[]),
      searchType: 'text-fallback',
      processingTime: Date.now() - startTime,
    });
  }

  // Use Supabase function for optimized vector search
  const searchStart = Date.now();
  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, keywords, context, created_at, similarity
     FROM search_ideas_by_embedding($1::vector(768), $2, $3, $4)`,
    [formatForPgVector(queryEmbedding), ctx, threshold, limit]
  );
  const searchTime = Date.now() - searchStart;

  const totalTime = Date.now() - startTime;

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    searchType: 'supabase-function',
    performance: {
      totalMs: totalTime,
      embeddingMs: embeddingTime,
      searchMs: searchTime,
      resultsFound: result.rows.length,
    },
  });
}));

/**
 * POST /api/ideas/search/progressive
 * Phase 32B: Progressive Search - keyword-first, then semantic
 */
ideasRouter.post('/search/progressive', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);
  const userId = getUserId(req);

  const queryResult = validateRequiredString(req.body.query, 'query', { minLength: 1, maxLength: 500 });
  if (!queryResult.success) {
    throw new ValidationError('Invalid search query');
  }
  const searchQuery = queryResult.data ?? '';

  const limitResult = parseIntSafe(req.body.limit?.toString(), { default: 10, min: 1, max: 50, fieldName: 'limit' });
  const limit = limitResult.success ? (limitResult.data ?? 10) : 10;

  // Phase 1: Keyword search (fast, < 50ms typically) — escape LIKE metacharacters
  const safeQuery = escapeLike(searchQuery);
  const keywordStart = Date.now();
  const keywordResult = await queryContext(
    ctx,
    `SELECT ${IDEA_SEARCH_COLUMNS}
     FROM ideas
     WHERE (title ILIKE $1 OR summary ILIKE $1 OR raw_transcript ILIKE $1) AND user_id = $3
     ORDER BY created_at DESC
     LIMIT $2`,
    [`%${safeQuery}%`, limit, userId]
  );
  const keywordTime = Date.now() - keywordStart;

  const keywordIds = new Set(keywordResult.rows.map((r: IdeaDatabaseRow) => r.id));

  // Phase 2: Semantic search (parallel with keyword, but takes longer)
  const semanticStart = Date.now();
  let semanticResults: IdeaDatabaseRow[] = [];
  let semanticTime = 0;
  try {
    const queryEmbedding = await generateEmbedding(searchQuery);
    if (queryEmbedding.length > 0) {
      const result = await queryContext(
        ctx,
        `SELECT id, title, type, category, priority, summary, keywords, context, created_at, similarity
         FROM search_ideas_by_embedding($1::vector(768), $2, $3, $4)`,
        [formatForPgVector(queryEmbedding), ctx, 0.4, limit]
      );
      // Deduplicate: exclude ideas already found by keyword search
      semanticResults = (result.rows as IdeaDatabaseRow[]).filter(
        (r: IdeaDatabaseRow) => !keywordIds.has(r.id)
      );
    }
    semanticTime = Date.now() - semanticStart;
  } catch (error) {
    logger.debug('Semantic search in progressive mode failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    semanticTime = Date.now() - semanticStart;
  }

  const totalTime = Date.now() - startTime;

  res.json({
    success: true,
    keyword: {
      ideas: parseIdeaRows(keywordResult.rows as IdeaDatabaseRow[]),
      count: keywordResult.rows.length,
    },
    semantic: {
      ideas: parseIdeaRows(semanticResults),
      count: semanticResults.length,
    },
    performance: {
      totalMs: totalTime,
      keywordMs: keywordTime,
      semanticMs: semanticTime,
      totalResults: keywordResult.rows.length + semanticResults.length,
    },
  });
}));

/**
 * GET /api/ideas/:id/similar
 * Find similar ideas using Supabase function
 */
ideasRouter.get('/:id/similar', apiKeyAuth, validateUUID, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);
  const userId = getUserId(req);
  const ideaId = req.params.id;

  const limitResult = parseIntSafe(req.query.limit?.toString(), { default: 5, min: 1, max: 20, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 5;

  const ideaCheck = await queryContext(ctx, 'SELECT id FROM ideas WHERE id = $1 AND user_id = $2', [ideaId, userId]);
  if (ideaCheck.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, keywords, context, created_at, similarity
     FROM find_similar_ideas($1::uuid, $2, $3)`,
    [ideaId, ctx, limit]
  );

  const totalTime = Date.now() - startTime;

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    sourceIdeaId: ideaId,
    processingTime: totalTime,
  });
}));

/**
 * PUT /api/ideas/:id
 * Update an idea
 */
ideasRouter.put('/:id', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const userId = getUserId(req);
  const { title, type, category, priority, summary, next_steps, context_needed, keywords } = req.body;

  const oldIdea = await queryContext(
    ctx,
    'SELECT type, category, priority FROM ideas WHERE id = $1 AND user_id = $2',
    [req.params.id, userId]
  );

  if (oldIdea.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const old = oldIdea.rows[0];

  const result = await queryContext(
    ctx,
    `UPDATE ideas SET
      title = COALESCE($2, title),
      type = COALESCE($3, type),
      category = COALESCE($4, category),
      priority = COALESCE($5, priority),
      summary = COALESCE($6, summary),
      next_steps = COALESCE($7, next_steps),
      context_needed = COALESCE($8, context_needed),
      keywords = COALESCE($9, keywords),
      updated_at = NOW()
     WHERE id = $1 AND user_id = $10
     RETURNING id, title, type, category, priority, summary,
               next_steps, context_needed, keywords, raw_transcript,
               context, is_favorite, created_at, updated_at`,
    [
      req.params.id,
      title,
      type,
      category,
      priority,
      summary,
      serializeArrayField(next_steps),
      serializeArrayField(context_needed),
      serializeArrayField(keywords),
      userId,
    ]
  );

  const hasTypeChange = type && type !== old.type;
  const hasCategoryChange = category && category !== old.category;
  const hasPriorityChange = priority && priority !== old.priority;

  if (hasTypeChange || hasCategoryChange || hasPriorityChange) {
    logger.info('User correction detected', { ideaId: req.params.id });

    learnFromCorrection(req.params.id, {
      oldType: hasTypeChange ? old.type : undefined,
      newType: hasTypeChange ? type : undefined,
      oldCategory: hasCategoryChange ? old.category : undefined,
      newCategory: hasCategoryChange ? category : undefined,
      oldPriority: hasPriorityChange ? old.priority : undefined,
      newPriority: hasPriorityChange ? priority : undefined,
    }).catch(err => logger.debug('Background correction learning skipped', { error: err.message }));

    learnFromThought(req.params.id, 'default', true).catch(err =>
      logger.debug('Background learning from corrected idea skipped', { error: err.message })
    );
  }

  const metadata: Record<string, unknown> = { action: 'update' };
  if (hasPriorityChange) {
    metadata.new_priority = priority;
    metadata.old_priority = old.priority;
    trackInteraction({
      idea_id: req.params.id,
      interaction_type: 'prioritize',
      metadata,
    }).catch((err) => logger.debug('Background prioritize tracking skipped', { error: err.message }));
  } else {
    trackInteraction({
      idea_id: req.params.id,
      interaction_type: 'edit',
      metadata,
    }).catch((err) => logger.debug('Background edit tracking skipped', { error: err.message }));
  }

  triggerWebhook('idea.updated', {
    id: req.params.id,
    ...result.rows[0]
  }).catch((err) => logger.debug('Background webhook skipped', { error: err.message }));

  trackActivity(ctx, {
    eventType: hasTypeChange || hasCategoryChange ? 'accuracy_improved' : 'preference_updated',
    title: `Gedanke bearbeitet: ${(title || result.rows[0].title || '').substring(0, 50)}`,
    description: hasTypeChange || hasCategoryChange || hasPriorityChange
      ? 'Korrektur der KI-Klassifizierung' : 'Inhalt aktualisiert',
    impact_score: hasTypeChange || hasCategoryChange ? 0.7 : 0.3,
    related_entity_type: 'idea',
    related_entity_id: req.params.id,
    actionType: 'idea_updated',
    actionData: { ideaId: req.params.id, hasCorrection: hasTypeChange || hasCategoryChange || hasPriorityChange },
  }).catch((err) => logger.debug('Failed to record idea update activity', { error: err instanceof Error ? err.message : String(err) }));

  res.json({ success: true, idea: parseIdeaRow(result.rows[0] as IdeaDatabaseRow) });
}));

/**
 * DELETE /api/ideas/:id — delegates to shared handler
 */
ideasRouter.delete('/:id', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleDeleteIdea(getContext(req), req, res);
}));

/**
 * PUT /api/ideas/:id/priority
 * Update idea priority (from swipe actions)
 */
ideasRouter.put('/:id/priority', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const userId = getUserId(req);
  const { priority } = req.body;

  if (!priority || !['low', 'medium', 'high'].includes(priority)) {
    throw new ValidationError('Invalid priority. Must be low, medium, or high');
  }

  const oldResult = await queryContext(
    ctx,
    'SELECT priority FROM ideas WHERE id = $1 AND user_id = $2',
    [req.params.id, userId]
  );

  if (oldResult.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const oldPriority = oldResult.rows[0].priority;

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3 RETURNING id, title, priority',
    [req.params.id, priority, userId]
  );

  if (oldPriority !== priority) {
    learnFromCorrection(req.params.id, {
      oldPriority,
      newPriority: priority,
    }).catch(err => logger.debug('Background priority correction learning skipped', { error: err.message }));

    learnFromThought(req.params.id, 'default', true).catch(err =>
      logger.debug('Background learning skipped', { error: err.message })
    );
  }

  trackInteraction({
    idea_id: req.params.id,
    interaction_type: 'prioritize',
    metadata: { new_priority: priority, old_priority: oldPriority, source: 'swipe' },
  }).catch((err) => logger.debug('Background priority tracking skipped', { error: err.message }));

  res.json({ success: true, idea: result.rows[0] });
}));

/**
 * POST /api/ideas/:id/swipe
 * Handle swipe actions from iOS app
 */
ideasRouter.post('/:id/swipe', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const userId = getUserId(req);
  const { action } = req.body;
  const ideaId = req.params.id;

  if (!action || !['priority', 'later', 'archive'].includes(action)) {
    throw new ValidationError('Invalid action. Must be priority, later, or archive');
  }

  let result;
  switch (action) {
    case 'priority':
      result = await queryContext(
        ctx,
        'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3 RETURNING id, title, priority',
        [ideaId, 'high', userId]
      );
      trackInteraction({
        idea_id: ideaId,
        interaction_type: 'prioritize',
        metadata: { new_priority: 'high', source: 'swipe' },
      }).catch((err) => logger.debug('Background swipe priority tracking skipped', { error: err.message }));
      break;

    case 'archive':
      result = await queryContext(
        ctx,
        'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, title',
        [ideaId, userId]
      );
      trackInteraction({
        idea_id: ideaId,
        interaction_type: 'archive',
        metadata: { source: 'swipe' },
      }).catch((err) => logger.debug('Background swipe archive tracking skipped', { error: err.message }));
      triggerWebhook('idea.archived', { id: ideaId })
        .catch((err) => logger.debug('Background archive webhook skipped', { error: err.message }));
      break;

    case 'later':
      result = await queryContext(
        ctx,
        'SELECT id, title FROM ideas WHERE id = $1 AND user_id = $2',
        [ideaId, userId]
      );
      trackInteraction({
        idea_id: ideaId,
        interaction_type: 'view',
        metadata: { action: 'review_later', source: 'swipe' },
      }).catch((err) => logger.debug('Background swipe later tracking skipped', { error: err.message }));
      break;
  }

  if (!result || result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  res.json({ success: true, action, idea: result.rows[0] });
}));

/**
 * GET /api/ideas/archived/list — delegates to shared handler
 */
ideasRouter.get('/archived/list', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleArchivedList(getContext(req), req, res);
}));

/**
 * PUT /api/ideas/:id/restore — delegates to shared handler
 */
ideasRouter.put('/:id/restore', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleRestoreIdea(getContext(req), req, res);
}));

/**
 * PUT /api/ideas/:id/archive — delegates to shared handler
 */
ideasRouter.put('/:id/archive', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleArchiveIdea(getContext(req), req, res);
}));

// ===========================================
// Phase 10: Duplicate Detection
// ===========================================

/**
 * POST /api/ideas/check-duplicates
 */
ideasRouter.post('/check-duplicates', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const userId = getUserId(req);
  const { content, title, threshold = 0.85 } = req.body;

  if (!content && !title) {
    throw new ValidationError('Content or title is required');
  }

  const textToCheck = content || title;
  const result = await findDuplicates(ctx, textToCheck, threshold, undefined, userId);

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * POST /api/ideas/:id/merge
 */
ideasRouter.post('/:id/merge', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const userId = getUserId(req);
  const primaryId = req.params.id;
  const { secondaryId } = req.body;

  if (!secondaryId || !isValidUUID(secondaryId)) {
    throw new ValidationError('Valid secondaryId is required');
  }

  if (primaryId === secondaryId) {
    throw new ValidationError('Cannot merge idea with itself');
  }

  const ownerCheck = await queryContext(ctx,
    `SELECT id FROM ideas WHERE id IN ($1, $2) AND user_id = $3`,
    [primaryId, secondaryId, userId]
  );
  if (ownerCheck.rows.length < 2) {
    throw new ValidationError('One or both ideas not found');
  }

  const result = await mergeIdeas(ctx, primaryId, secondaryId);

  if (!result.success) {
    throw new ValidationError(result.message);
  }

  const updated = await queryContext(
    ctx,
    `SELECT id, title, content, type, category, priority, summary, keywords, next_steps, created_at, updated_at
     FROM ideas WHERE id = $1 AND user_id = $2`,
    [primaryId, userId]
  );

  res.json({
    success: true,
    message: result.message,
    idea: updated.rows[0],
  });
}));

// ===========================================
// Context-Aware Routes (for /api/:context/ideas/*)
// All delegate to shared handlers where possible
// ===========================================

/**
 * GET /api/:context/ideas/triage — delegates to shared handler
 */
ideasContextRouter.get('/:context/ideas/triage', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleTriageGet(validateContextParam(req.params.context), req, res);
}));

/**
 * POST /api/:context/ideas/:id/triage — delegates to shared handler
 */
ideasContextRouter.post('/:context/ideas/:id/triage', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleTriagePost(validateContextParam(req.params.context), req, res);
}));

/**
 * GET /api/:context/ideas/stats/summary
 * Extended stats version for context-aware routes (includes thisWeek, lastMonth, todayCount)
 */
ideasContextRouter.get('/:context/ideas/stats/summary', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const userId = getUserId(req);

  try {
    const [totalResult, typeResult, categoryResult, priorityResult] = await Promise.all([
      queryContext(ctx, `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_month,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today
        FROM ideas WHERE is_archived = false AND user_id = $1
      `, [userId]),
      queryContext(ctx, 'SELECT type, COUNT(*) as count FROM ideas WHERE is_archived = false AND user_id = $1 GROUP BY type', [userId]),
      queryContext(ctx, 'SELECT category, COUNT(*) as count FROM ideas WHERE is_archived = false AND user_id = $1 GROUP BY category', [userId]),
      queryContext(ctx, 'SELECT priority, COUNT(*) as count FROM ideas WHERE is_archived = false AND user_id = $1 GROUP BY priority', [userId]),
    ]);

    const totals = totalResult.rows[0];

    res.json({
      success: true,
      total: parseInt(totals?.total ?? '0', 10),
      thisWeek: parseInt(totals?.this_week ?? '0', 10),
      lastMonth: parseInt(totals?.last_month ?? '0', 10),
      todayCount: parseInt(totals?.today ?? '0', 10),
      byType: (typeResult.rows as TypeCountRow[]).reduce((acc, row) => ({ ...acc, [row.type || 'unknown']: parseInt(row.count, 10) }), {} as Record<string, number>),
      byCategory: (categoryResult.rows as CategoryCountRow[]).reduce((acc, row) => ({ ...acc, [row.category || 'unknown']: parseInt(row.count, 10) }), {} as Record<string, number>),
      byPriority: (priorityResult.rows as PriorityCountRow[]).reduce((acc, row) => ({ ...acc, [row.priority || 'unknown']: parseInt(row.count, 10) }), {} as Record<string, number>),
    });
  } catch (error) {
    logger.warn('ideas stats/summary query failed', {
      context: ctx,
      error: error instanceof Error ? error.message : String(error),
    });
    res.json({
      success: true,
      total: 0,
      thisWeek: 0,
      lastMonth: 0,
      todayCount: 0,
      byType: {},
      byCategory: {},
      byPriority: {},
    });
  }
}));

/**
 * PUT /api/:context/ideas/:id/archive — delegates to shared handler
 */
ideasContextRouter.put('/:context/ideas/:id/archive', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleArchiveIdea(validateContextParam(req.params.context), req, res);
}));

/**
 * PUT /api/:context/ideas/:id/restore — delegates to shared handler
 */
ideasContextRouter.put('/:context/ideas/:id/restore', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleRestoreIdea(validateContextParam(req.params.context), req, res);
}));

/**
 * GET /api/:context/ideas — delegates to shared handler
 */
ideasContextRouter.get('/:context/ideas', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleListIdeas(validateContextParam(req.params.context), req, res);
}));

/**
 * GET /api/:context/ideas/archived — delegates to shared handler
 */
ideasContextRouter.get('/:context/ideas/archived', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleArchivedList(validateContextParam(req.params.context), req, res);
}));

/**
 * DELETE /api/:context/ideas/:id — delegates to shared handler
 */
ideasContextRouter.delete('/:context/ideas/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleDeleteIdea(validateContextParam(req.params.context), req, res);
}));

/**
 * POST /api/:context/ideas/:id/move
 * Move an idea from one context to another.
 */
ideasContextRouter.post('/:context/ideas/:id/move', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const sourceContext = validateContextParam(req.params.context);
  getUserId(req); // auth check
  const { id } = req.params;
  const { targetContext } = req.body;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  if (!targetContext || !isValidContext(targetContext)) {
    throw new ValidationError('Invalid targetContext. Use "personal", "work", "learning", or "creative".');
  }

  if (sourceContext === targetContext) {
    throw new ValidationError('Source and target context are the same.');
  }

  try {
    const result = await moveIdea(sourceContext, targetContext as AIContext, id);

    await Promise.all([
      invalidateCacheForContext(sourceContext, 'ideas'),
      invalidateCacheForContext(targetContext as AIContext, 'ideas'),
    ]).catch(() => { /* cache invalidation is best-effort */ });

    trackInteraction({
      idea_id: id,
      interaction_type: 'edit',
      metadata: { action: 'move', from: sourceContext, to: targetContext },
    }).catch((err) => logger.debug('Background move tracking skipped', { error: err.message }));

    learnFromCorrection(id, {
      oldContext: sourceContext,
      newContext: targetContext,
    }).catch(() => { /* Background learning - ignore errors */ });

    res.json({
      success: true,
      movedId: result.ideaId,
      newIdeaId: result.newIdeaId,
      from: result.sourceContext,
      to: result.targetContext,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'IDEA_NOT_FOUND') {
      throw new NotFoundError('Idea');
    }
    if (error instanceof Error && error.message === 'SCHEMA_MISMATCH') {
      throw new AppError('Verschieben fehlgeschlagen — bitte versuche es erneut.', 500, 'SCHEMA_MISMATCH');
    }
    throw error;
  }
}));

/**
 * PUT /api/:context/ideas/:id/favorite
 * Toggle favorite status on an idea
 */
ideasContextRouter.put('/:context/ideas/:id/favorite', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_favorite = NOT COALESCE(is_favorite, false), updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, is_favorite',
    [id, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  res.json({
    success: true,
    id: result.rows[0].id,
    isFavorite: result.rows[0].is_favorite,
  });
}));

// ===========================================
// Batch Operations
// ===========================================

const MAX_BATCH_SIZE = 100;

function validateBatchIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError('ids must be a non-empty array');
  }
  if (ids.length > MAX_BATCH_SIZE) {
    throw new ValidationError(`Maximum ${MAX_BATCH_SIZE} items per batch operation`);
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !isValidUUID(id)) {
      throw new ValidationError(`Invalid UUID: ${id}`);
    }
  }
  return ids as string[];
}

/**
 * POST /api/:context/ideas/batch/archive
 */
ideasContextRouter.post('/:context/ideas/batch/archive', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const ids = validateBatchIds(req.body.ids);

  const result = await queryContext(
    ctx,
    `UPDATE ideas SET is_archived = true, archived_at = NOW(), updated_at = NOW() WHERE id = ANY($1::uuid[]) AND is_archived = false AND user_id = $2 RETURNING id`,
    [ids, userId]
  );

  res.json({
    success: true,
    affected: result.rows.length,
  });
}));

/**
 * POST /api/:context/ideas/batch/delete
 */
ideasContextRouter.post('/:context/ideas/batch/delete', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const ids = validateBatchIds(req.body.ids);

  const result = await queryContext(
    ctx,
    'DELETE FROM ideas WHERE id = ANY($1::uuid[]) AND user_id = $2 RETURNING id',
    [ids, userId]
  );

  res.json({
    success: true,
    affected: result.rows.length,
  });
}));

/**
 * POST /api/:context/ideas/batch/favorite
 */
ideasContextRouter.post('/:context/ideas/batch/favorite', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const ids = validateBatchIds(req.body.ids);
  const isFavorite = req.body.isFavorite !== false; // default true

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_favorite = $2, updated_at = NOW() WHERE id = ANY($1::uuid[]) AND user_id = $3 RETURNING id',
    [ids, isFavorite, userId]
  );

  res.json({
    success: true,
    affected: result.rows.length,
    isFavorite,
  });
}));
