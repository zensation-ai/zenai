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
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { parseIdeaRow, parseIdeaRows, IdeaDatabaseRow, serializeArrayField } from '../utils/idea-parser';
import { trackActivity } from '../services/activity-tracker';

// ===========================================
// Type-safe row interfaces for aggregate queries
// ===========================================
interface CountRow { count: string }
interface TypeCountRow extends CountRow { type: string }
interface CategoryCountRow extends CountRow { category: string }
interface PriorityCountRow extends CountRow { priority: string }

export const ideasRouter = Router();

// Context-aware router for routes like /api/:context/ideas/*
export const ideasContextRouter = Router();

/**
 * Get context from request header or query param, default to 'personal'
 */
function getContext(req: Request): AIContext {
  const context = (req.headers['x-ai-context'] as string) || (req.query.context as string) || 'personal';
  return isValidContext(context) ? context : 'personal';
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

/**
 * GET /api/ideas/stats/summary
 * Get statistics about ideas (excluding archived)
 * NOTE: Must be defined BEFORE /:id route to avoid being caught by it
 */
ideasRouter.get('/stats/summary', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const [totalResult, typeResult, categoryResult, priorityResult] = await Promise.all([
    queryContext(ctx, 'SELECT COUNT(*) as total FROM ideas WHERE is_archived = false'),
    queryContext(ctx, 'SELECT type, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY type'),
    queryContext(ctx, 'SELECT category, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY category'),
    queryContext(ctx, 'SELECT priority, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY priority'),
  ]);

  res.json({
    success: true,
    total: parseInt(totalResult.rows[0].total, 10),
    byType: (typeResult.rows as TypeCountRow[]).reduce((acc, row) => ({ ...acc, [row.type]: parseInt(row.count, 10) }), {} as Record<string, number>),
    byCategory: (categoryResult.rows as CategoryCountRow[]).reduce((acc, row) => ({ ...acc, [row.category]: parseInt(row.count, 10) }), {} as Record<string, number>),
    byPriority: (priorityResult.rows as PriorityCountRow[]).reduce((acc, row) => ({ ...acc, [row.priority]: parseInt(row.count, 10) }), {} as Record<string, number>),
  });
}));

/**
 * GET /api/ideas/triage
 * Get ideas for triage, sorted by priority and creation date
 * Returns ideas that haven't been triaged recently (within 24 hours)
 * NOTE: Must be defined BEFORE /:id route to avoid being caught by it
 */
ideasRouter.get('/triage', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getContext(req);

  // Validate pagination
  const limitResult = parseIntSafe(req.query.limit?.toString(), { default: 20, min: 1, max: 50, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 20;

  // Get excluded IDs (already processed in this session)
  const excludeIds = req.query.exclude ? (req.query.exclude as string).split(',').filter(id => isValidUUID(id)) : [];

  // Build exclusion clause
  let excludeClause = '';
  const params: (string | number)[] = [ctx, limit];
  if (excludeIds.length > 0) {
    excludeClause = ` AND i.id NOT IN (${excludeIds.map((_, idx) => `$${idx + 3}`).join(',')})`;
    params.push(...excludeIds);
  }

  // Get ideas for triage: not archived, not recently triaged, sorted by priority then date
  const result = await queryContext(
    ctx,
    `SELECT i.id, i.title, i.type, i.category, i.priority, i.summary,
            i.next_steps, i.context_needed, i.keywords, i.context,
            i.created_at, i.updated_at, i.raw_transcript
     FROM ideas i
     LEFT JOIN triage_history th ON th.idea_id = i.id
       AND th.triaged_at > NOW() - INTERVAL '24 hours'
     WHERE i.context = $1
       AND i.is_archived = false
       AND th.id IS NULL
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

  // Get total count of pending triage items
  const countResult = await queryContext(
    ctx,
    `SELECT COUNT(*) as total
     FROM ideas i
     LEFT JOIN triage_history th ON th.idea_id = i.id
       AND th.triaged_at > NOW() - INTERVAL '24 hours'
     WHERE i.context = $1
       AND i.is_archived = false
       AND th.id IS NULL`,
    [ctx]
  );

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    total: parseInt(countResult.rows[0].total, 10),
    hasMore: result.rows.length === limit,
  });
}));

/**
 * POST /api/ideas/:id/triage
 * Record a triage action for an idea
 * Actions: 'priority' (mark high), 'keep' (no change), 'later' (lower priority), 'archive'
 */
ideasRouter.post('/:id/triage', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const ideaId = req.params.id;
  const { action } = req.body;

  // Validate action
  const validActions = ['priority', 'keep', 'later', 'archive'];
  if (!action || !validActions.includes(action)) {
    throw new ValidationError(`Invalid triage action. Must be one of: ${validActions.join(', ')}`);
  }

  // Check if idea exists
  const ideaCheck = await queryContext(ctx, 'SELECT id, title, priority FROM ideas WHERE id = $1', [ideaId]);
  if (ideaCheck.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const oldPriority = ideaCheck.rows[0].priority;
  const ideaTitle = ideaCheck.rows[0].title;

  // Apply action based on type
  // Type-safe update data with allowed triage fields only
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

  // Update idea if needed
  if (Object.keys(updateData).length > 0) {
    // Defense in Depth: Whitelist allowed column names to prevent any SQL injection
    const ALLOWED_TRIAGE_COLUMNS = new Set(['priority', 'is_archived']);
    const safeKeys = Object.keys(updateData).filter(k => ALLOWED_TRIAGE_COLUMNS.has(k));

    if (safeKeys.length !== Object.keys(updateData).length) {
      throw new ValidationError('Invalid update fields detected');
    }

    await queryContext(
      ctx,
      `UPDATE ideas SET ${safeKeys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [ideaId, ...safeKeys.map(k => updateData[k as keyof typeof updateData])]
    );

    // Learn from priority changes
    if (updateData.priority && oldPriority !== updateData.priority) {
      learnFromCorrection(ideaId, {
        oldPriority,
        newPriority: updateData.priority,
      }).catch(err => logger.debug('Background triage correction learning skipped', { error: err.message }));
    }
  }

  // Record triage action in history
  await queryContext(
    ctx,
    `INSERT INTO triage_history (idea_id, context, action) VALUES ($1, $2, $3)`,
    [ideaId, ctx, action]
  );

  // Track interaction for learning
  trackInteraction({
    idea_id: ideaId,
    interaction_type: action === 'priority' ? 'prioritize' : action === 'archive' ? 'archive' : 'view',
    metadata: { action, source: 'triage', old_priority: oldPriority },
  }).catch((err) => logger.debug('Background triage tracking skipped', { error: err.message }));

  // Log AI activity
  logAIActivity({
    context: ctx,
    type: 'idea_triaged',
    message: `Gedanke "${ideaTitle.substring(0, 50)}..." ${actionDescription}`,
    ideaId,
    metadata: { action, oldPriority, newPriority: updateData.priority },
  }).catch((err) => logger.debug('Background AI activity logging skipped', { error: err.message }));

  // Trigger webhook for archive action
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
}));

/**
 * GET /api/ideas
 * List all ideas with pagination
 */
ideasRouter.get('/', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getContext(req);

  // Validate pagination
  const paginationResult = validatePagination(req.query as Record<string, unknown>, { maxLimit: 100, defaultLimit: 20 });
  if (!paginationResult.success) {
    throw new ValidationError('Invalid pagination');
  }
  const { limit, offset } = paginationResult.data ?? { limit: 20, offset: 0 };

  // Validate filter params
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
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;

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
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, context, is_favorite, created_at, updated_at
     FROM ideas
     WHERE is_archived = false ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const countResult = await queryContext(
    ctx,
    `SELECT COUNT(*) as total FROM ideas WHERE is_archived = false ${whereClause}`,
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
}));

/**
 * GET /api/ideas/recommendations
 * Get personalized idea recommendations based on user profile
 * Uses user's interest embedding for relevance scoring
 * NOTE: Must be defined BEFORE /:id route to avoid being caught by it
 */
ideasRouter.get('/recommendations', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);

  // Validate limit
  const limitResult = parseIntSafe(req.query.limit?.toString(), { default: 10, min: 1, max: 50, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 10;

  // Use Supabase function to get recommendations
  const result = await queryContext(
    ctx,
    `SELECT * FROM get_idea_recommendations($1, $2)`,
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
  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, raw_transcript,
            context, created_at, updated_at
     FROM ideas WHERE id = $1`,
    [req.params.id]
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
  queryContext(ctx, 'UPDATE ideas SET viewed_count = viewed_count + 1 WHERE id = $1', [req.params.id])
    .catch((err) => logger.debug('Background view count update skipped', { error: err.message }));

  res.json({ success: true, idea: parseIdeaRow(row as IdeaDatabaseRow) });
}));

/**
 * POST /api/ideas/search
 * Semantic search using Supabase pgvector function
 * Uses optimized HNSW index for fast similarity search
 */
ideasRouter.post('/search', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);

  // Validate search query
  const queryResult = validateRequiredString(req.body.query, 'query', { minLength: 1, maxLength: 500 });
  if (!queryResult.success) {
    throw new ValidationError('Invalid search query');
  }
  const searchQuery = queryResult.data ?? '';

  // Validate limit
  const limitResult = parseIntSafe(req.body.limit?.toString(), { default: 10, min: 1, max: 50, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 10;

  // Validate threshold
  const thresholdResult = parseIntSafe(req.body.threshold?.toString(), { default: 0.5, min: 0, max: 1, fieldName: 'threshold' });
  const threshold = thresholdResult.success ? (thresholdResult.data ?? 0.5) : 0.5;

  // Generate embedding for search query
  const embeddingStart = Date.now();
  const queryEmbedding = await generateEmbedding(searchQuery);
  const embeddingTime = Date.now() - embeddingStart;

  if (queryEmbedding.length === 0) {
    // Fallback to text search if embedding fails
    const textResult = await queryContext(
      ctx,
      `SELECT id, title, type, category, priority, summary,
              next_steps, context_needed, keywords, context, created_at
       FROM ideas
       WHERE title ILIKE $1 OR summary ILIKE $1 OR raw_transcript ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [`%${searchQuery}%`, limit]
    );

    return res.json({
      success: true,
      ideas: textResult.rows,
      searchType: 'text-fallback',
      processingTime: Date.now() - startTime,
    });
  }

  // Use Supabase function for optimized vector search
  const searchStart = Date.now();
  const result = await queryContext(
    ctx,
    `SELECT * FROM search_ideas_by_embedding($1::vector(768), $2, $3, $4)`,
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
 *
 * Returns both keyword (BM25/ILIKE) and semantic (embedding) results
 * in a single response with phase labels. Keyword results are fast
 * and appear first; semantic results provide deeper relevance.
 */
ideasRouter.post('/search/progressive', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);

  const queryResult = validateRequiredString(req.body.query, 'query', { minLength: 1, maxLength: 500 });
  if (!queryResult.success) {
    throw new ValidationError('Invalid search query');
  }
  const searchQuery = queryResult.data ?? '';

  const limitResult = parseIntSafe(req.body.limit?.toString(), { default: 10, min: 1, max: 50, fieldName: 'limit' });
  const limit = limitResult.success ? (limitResult.data ?? 10) : 10;

  // Phase 1: Keyword search (fast, < 50ms typically)
  const keywordStart = Date.now();
  const keywordResult = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, context, created_at
     FROM ideas
     WHERE title ILIKE $1 OR summary ILIKE $1 OR raw_transcript ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [`%${searchQuery}%`, limit]
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
        `SELECT * FROM search_ideas_by_embedding($1::vector(768), $2, $3, $4)`,
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
 * Uses pre-computed embeddings for instant results
 */
ideasRouter.get('/:id/similar', apiKeyAuth, validateUUID, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const ctx = getContext(req);
  const ideaId = req.params.id;

  // Validate limit
  const limitResult = parseIntSafe(req.query.limit?.toString(), { default: 5, min: 1, max: 20, fieldName: 'limit' });
  if (!limitResult.success) {
    throw new ValidationError('Invalid limit');
  }
  const limit = limitResult.data ?? 5;

  // Check if idea exists
  const ideaCheck = await queryContext(ctx, 'SELECT id FROM ideas WHERE id = $1', [ideaId]);
  if (ideaCheck.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  // Use Supabase function to find similar ideas
  const result = await queryContext(
    ctx,
    `SELECT * FROM find_similar_ideas($1::uuid, $2, $3)`,
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
 *
 * WICHTIG: Bei Änderungen von type/category/priority lernt das System
 * dass die ursprüngliche LLM-Klassifizierung falsch war!
 */
ideasRouter.put('/:id', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { title, type, category, priority, summary, next_steps, context_needed, keywords } = req.body;

  // Hole alte Werte um Korrekturen zu erkennen
  const oldIdea = await queryContext(
    ctx,
    'SELECT type, category, priority FROM ideas WHERE id = $1',
    [req.params.id]
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
     WHERE id = $1
     RETURNING *`,
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
    ]
  );

  // KRITISCH: User-Korrektur erkennen und lernen!
  // Dies verhindert, dass LLM-Fehlinterpretationen sich verfestigen
  const hasTypeChange = type && type !== old.type;
  const hasCategoryChange = category && category !== old.category;
  const hasPriorityChange = priority && priority !== old.priority;

  if (hasTypeChange || hasCategoryChange || hasPriorityChange) {
    logger.info('User correction detected', { ideaId: req.params.id });

    // Lernen aus der Korrektur (async, non-blocking)
    learnFromCorrection(req.params.id, {
      oldType: hasTypeChange ? old.type : undefined,
      newType: hasTypeChange ? type : undefined,
      oldCategory: hasCategoryChange ? old.category : undefined,
      newCategory: hasCategoryChange ? category : undefined,
      oldPriority: hasPriorityChange ? old.priority : undefined,
      newPriority: hasPriorityChange ? priority : undefined,
    }).catch(err => logger.debug('Background correction learning skipped', { error: err.message }));

    // Zusätzlich: Lerne stark von der korrigierten Idee
    learnFromThought(req.params.id, 'default', true).catch(err =>
      logger.debug('Background learning from corrected idea skipped', { error: err.message })
    );
  }

  // Track edit and priority changes for interaction tracking
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

  // Phase 4: Trigger webhook
  triggerWebhook('idea.updated', {
    id: req.params.id,
    ...result.rows[0]
  }).catch((err) => logger.debug('Background webhook skipped', { error: err.message }));

  // Track activity for evolution timeline + suggestions (non-blocking)
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
 * DELETE /api/ideas/:id
 * Delete an idea
 */
ideasRouter.delete('/:id', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const result = await queryContext(ctx, 'DELETE FROM ideas WHERE id = $1 RETURNING id', [req.params.id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  // Track archive/delete for learning
  trackInteraction({
    idea_id: req.params.id,
    interaction_type: 'archive',
    metadata: { action: 'delete' },
  }).catch((err) => logger.debug('Background delete tracking skipped', { error: err.message }));

  // Phase 4: Trigger webhook
  triggerWebhook('idea.deleted', {
    id: req.params.id
  }).catch((err) => logger.debug('Background webhook skipped', { error: err.message }));

  res.json({ success: true, deletedId: req.params.id });
}));

/**
 * PUT /api/ideas/:id/priority
 * Update idea priority (from swipe actions)
 *
 * WICHTIG: Dies ist eine User-Korrektur und löst starkes Lernen aus!
 */
ideasRouter.put('/:id/priority', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { priority } = req.body;

  if (!priority || !['low', 'medium', 'high'].includes(priority)) {
    throw new ValidationError('Invalid priority. Must be low, medium, or high');
  }

  // Hole alte Priorität für Korrektur-Lernen
  const oldResult = await queryContext(
    ctx,
    'SELECT priority FROM ideas WHERE id = $1',
    [req.params.id]
  );

  if (oldResult.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const oldPriority = oldResult.rows[0].priority;

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 RETURNING id, title, priority',
    [req.params.id, priority]
  );

  // Lerne aus der Prioritäts-Korrektur (wenn geändert)
  if (oldPriority !== priority) {
    learnFromCorrection(req.params.id, {
      oldPriority,
      newPriority: priority,
    }).catch(err => logger.debug('Background priority correction learning skipped', { error: err.message }));

    // Lerne stark von dieser Idee
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
        'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 RETURNING id, title, priority',
        [ideaId, 'high']
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
        'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id, title',
        [ideaId]
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
      // Just track the interaction, no changes to the idea
      result = await queryContext(
        ctx,
        'SELECT id, title FROM ideas WHERE id = $1',
        [ideaId]
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
 * GET /api/ideas/archived
 * List all archived ideas with pagination
 */
ideasRouter.get('/archived/list', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getContext(req);

  // Validate pagination
  const paginationResult = validatePagination(req.query as Record<string, unknown>, { maxLimit: 100, defaultLimit: 20 });
  if (!paginationResult.success) {
    throw new ValidationError('Invalid pagination');
  }
  const pagination = paginationResult.data ?? { limit: 20, offset: 0 };

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, context, is_favorite, created_at, updated_at
     FROM ideas
     WHERE is_archived = true
     ORDER BY updated_at DESC
     LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset]
  );

  const countResult = await queryContext(
    ctx,
    'SELECT COUNT(*) as total FROM ideas WHERE is_archived = true'
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
}));

/**
 * PUT /api/ideas/:id/restore
 * Restore an archived idea
 */
ideasRouter.put('/:id/restore', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_archived = false, updated_at = NOW() WHERE id = $1 AND is_archived = true RETURNING id, title',
    [req.params.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Archived idea');
  }

  trackInteraction({
    idea_id: req.params.id,
    interaction_type: 'view',
    metadata: { action: 'restore' },
  }).catch((err) => logger.debug('Background restore tracking skipped', { error: err.message }));

  triggerWebhook('idea.updated', {
    id: req.params.id,
    action: 'restored'
  }).catch((err) => logger.debug('Background restore webhook skipped', { error: err.message }));

  res.json({ success: true, restoredId: req.params.id, idea: result.rows[0] });
}));

/**
 * PUT /api/ideas/:id/archive
 * Archive an idea (soft delete)
 */
ideasRouter.put('/:id/archive', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id',
    [req.params.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  trackInteraction({
    idea_id: req.params.id,
    interaction_type: 'archive',
    metadata: { action: 'archive' },
  }).catch((err) => logger.debug('Background archive tracking skipped', { error: err.message }));

  // Phase 4: Trigger webhook
  triggerWebhook('idea.archived', {
    id: req.params.id
  }).catch((err) => logger.debug('Background archive webhook skipped', { error: err.message }));

  res.json({ success: true, archivedId: req.params.id });
}));

// ===========================================
// Phase 10: Duplicate Detection
// ===========================================

/**
 * POST /api/ideas/check-duplicates
 * Check for potential duplicates before creating an idea
 */
ideasRouter.post('/check-duplicates', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { content, title, threshold = 0.85 } = req.body;

  if (!content && !title) {
    throw new ValidationError('Content or title is required');
  }

  const textToCheck = content || title;
  const result = await findDuplicates(ctx, textToCheck, threshold);

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * POST /api/ideas/:id/merge
 * Merge another idea into this one
 */
ideasRouter.post('/:id/merge', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const primaryId = req.params.id;
  const { secondaryId } = req.body;

  if (!secondaryId || !isValidUUID(secondaryId)) {
    throw new ValidationError('Valid secondaryId is required');
  }

  if (primaryId === secondaryId) {
    throw new ValidationError('Cannot merge idea with itself');
  }

  const result = await mergeIdeas(ctx, primaryId, secondaryId);

  if (!result.success) {
    throw new ValidationError(result.message);
  }

  // Fetch updated primary idea
  const updated = await queryContext(
    ctx,
    `SELECT id, title, content, type, category, priority, summary, keywords, next_steps, created_at, updated_at
     FROM ideas WHERE id = $1`,
    [primaryId]
  );

  res.json({
    success: true,
    message: result.message,
    idea: updated.rows[0],
  });
}));

// ===========================================
// Context-Aware Routes (for /api/:context/ideas/*)
// ===========================================

/**
 * GET /api/:context/ideas/stats/summary
 * Get statistics about ideas (excluding archived) - context-aware version
 */
ideasContextRouter.get('/:context/ideas/stats/summary', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);

  try {
    const [totalResult, typeResult, categoryResult, priorityResult] = await Promise.all([
      queryContext(ctx, `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_month,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today
        FROM ideas WHERE is_archived = false
      `),
      queryContext(ctx, 'SELECT type, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY type'),
      queryContext(ctx, 'SELECT category, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY category'),
      queryContext(ctx, 'SELECT priority, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY priority'),
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
    // Database/schema issue - return empty stats instead of 500
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
 * PUT /api/:context/ideas/:id/archive
 * Archive an idea - context-aware version
 */
ideasContextRouter.put('/:context/ideas/:id/archive', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_archived = true, archived_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  // Track interaction for learning
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
}));

/**
 * PUT /api/:context/ideas/:id/restore
 * Restore an archived idea - context-aware version
 */
ideasContextRouter.put('/:context/ideas/:id/restore', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_archived = false, archived_at = NULL, updated_at = NOW() WHERE id = $1 AND is_archived = true RETURNING id, title',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Archived idea');
  }

  // Track interaction for learning (use 'edit' since 'restore' is not a valid type)
  trackInteraction({
    idea_id: id,
    interaction_type: 'edit',
    metadata: { action: 'restore', context: ctx },
  }).catch((err) => logger.debug('Background restore tracking skipped', { error: err.message }));

  // Use idea.updated webhook since idea.restored doesn't exist
  triggerWebhook('idea.updated', {
    id,
    action: 'restored',
    context: ctx,
  }).catch((err) => logger.debug('Background restore webhook skipped', { error: err.message }));

  res.json({ success: true, restoredId: id, idea: result.rows[0] });
}));

/**
 * GET /api/:context/ideas
 * List all ideas with pagination - context-aware version
 */
ideasContextRouter.get('/:context/ideas', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);

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
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;

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
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, context, is_favorite, created_at, updated_at
     FROM ideas
     WHERE is_archived = false ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const countResult = await queryContext(
    ctx,
    `SELECT COUNT(*) as total FROM ideas WHERE is_archived = false ${whereClause}`,
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
}));

/**
 * GET /api/:context/ideas/archived
 * List archived ideas - context-aware version
 */
ideasContextRouter.get('/:context/ideas/archived', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);

  const paginationResult = validatePagination(req.query as Record<string, unknown>, { maxLimit: 100, defaultLimit: 20 });
  if (!paginationResult.success) {
    throw new ValidationError('Invalid pagination');
  }
  const pagination = paginationResult.data ?? { limit: 20, offset: 0 };

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary,
            next_steps, context_needed, keywords, context, is_favorite, created_at, updated_at
     FROM ideas
     WHERE is_archived = true
     ORDER BY updated_at DESC
     LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset]
  );

  const countResult = await queryContext(
    ctx,
    'SELECT COUNT(*) as total FROM ideas WHERE is_archived = true'
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
}));

/**
 * DELETE /api/:context/ideas/:id
 * Delete an idea - context-aware version
 */
ideasContextRouter.delete('/:context/ideas/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(ctx, 'DELETE FROM ideas WHERE id = $1 RETURNING id', [id]);

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
}));

/**
 * POST /api/:context/ideas/:id/move
 * Move an idea from one context to another
 */
ideasContextRouter.post('/:context/ideas/:id/move', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const sourceContext = validateContextParam(req.params.context);
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

  // 1. Read the idea from source context
  const sourceResult = await queryContext(
    sourceContext,
    `SELECT id, title, raw_text, type, category, priority, tags, source, mood,
            energy_level, is_actionable, is_archived, ai_enhanced_title,
            ai_summary, ai_category, ai_tags, ai_priority, ai_sentiment,
            ai_confidence, keywords, embedding, related_ideas
     FROM ideas WHERE id = $1`,
    [id]
  );

  if (sourceResult.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const idea = sourceResult.rows[0];

  // 2. Insert into target context
  await queryContext(
    targetContext as AIContext,
    `INSERT INTO ideas (id, title, raw_text, type, category, priority, tags, source, mood,
                        energy_level, is_actionable, is_archived, ai_enhanced_title,
                        ai_summary, ai_category, ai_tags, ai_priority, ai_sentiment,
                        ai_confidence, keywords, embedding, related_ideas, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())`,
    [
      idea.id, idea.title, idea.raw_text, idea.type, idea.category,
      idea.priority, idea.tags, idea.source, idea.mood, idea.energy_level,
      idea.is_actionable, idea.is_archived, idea.ai_enhanced_title,
      idea.ai_summary, idea.ai_category, idea.ai_tags, idea.ai_priority,
      idea.ai_sentiment, idea.ai_confidence, idea.keywords, idea.embedding,
      idea.related_ideas,
    ]
  );

  // 3. Delete from source context
  await queryContext(
    sourceContext,
    'DELETE FROM ideas WHERE id = $1',
    [id]
  );

  logger.info('Idea moved between contexts', {
    ideaId: id,
    from: sourceContext,
    to: targetContext,
  });

  // Track interaction
  trackInteraction({
    idea_id: id,
    interaction_type: 'edit',
    metadata: { action: 'move', from: sourceContext, to: targetContext },
  }).catch((err) => logger.debug('Background move tracking skipped', { error: err.message }));

  res.json({
    success: true,
    movedId: id,
    from: sourceContext,
    to: targetContext,
  });
}));

/**
 * PUT /api/:context/ideas/:id/favorite
 * Toggle favorite status on an idea
 */
ideasContextRouter.put('/:context/ideas/:id/favorite', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid idea ID format');
  }

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_favorite = NOT COALESCE(is_favorite, false), updated_at = NOW() WHERE id = $1 RETURNING id, is_favorite',
    [id]
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
 * Archive multiple ideas at once
 */
ideasContextRouter.post('/:context/ideas/batch/archive', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const ids = validateBatchIds(req.body.ids);

  const result = await queryContext(
    ctx,
    `UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = ANY($1::uuid[]) AND is_archived = false RETURNING id`,
    [ids]
  );

  res.json({
    success: true,
    affected: result.rows.length,
  });
}));

/**
 * POST /api/:context/ideas/batch/delete
 * Delete multiple ideas at once
 */
ideasContextRouter.post('/:context/ideas/batch/delete', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const ids = validateBatchIds(req.body.ids);

  const result = await queryContext(
    ctx,
    'DELETE FROM ideas WHERE id = ANY($1::uuid[]) RETURNING id',
    [ids]
  );

  res.json({
    success: true,
    affected: result.rows.length,
  });
}));

/**
 * POST /api/:context/ideas/batch/favorite
 * Set or unset favorite for multiple ideas
 */
ideasContextRouter.post('/:context/ideas/batch/favorite', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const ctx = validateContextParam(req.params.context);
  const ids = validateBatchIds(req.body.ids);
  const isFavorite = req.body.isFavorite !== false; // default true

  const result = await queryContext(
    ctx,
    'UPDATE ideas SET is_favorite = $2, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING id',
    [ids, isFavorite]
  );

  res.json({
    success: true,
    affected: result.rows.length,
    isFavorite,
  });
}));
