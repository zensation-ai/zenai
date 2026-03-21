/**
 * Ideas CRUD Handlers
 *
 * Basic CRUD operations for ideas: list, get, create, update, delete.
 * Split from ideas-handlers.ts (Phase 122) for maintainability.
 *
 * @module routes/ideas-crud-handlers
 */

import { Request, Response } from 'express';
import { queryContext, AIContext, isValidUUID } from '../utils/database-context';
import { trackInteraction } from '../services/user-profile';
import { triggerWebhook } from '../services/webhooks';
import { learnFromCorrection, learnFromThought } from '../services/learning-engine';
import { logger } from '../utils/logger';
import {
  validatePagination,
  validateIdeaType,
  validateCategory,
  validatePriority,
  parseIntSafe,
} from '../utils/validation';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
import { parseIdeaRow, parseIdeaRows, IdeaDatabaseRow, serializeArrayField } from '../utils/idea-parser';
import { trackActivity } from '../services/activity-tracker';
import { getUserId } from '../utils/user-context';

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

const IDEA_DETAIL_COLUMNS = `id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, raw_transcript,
        context, created_at, updated_at`;

// ===========================================
// List ideas handler
// ===========================================

/**
 * Shared handler: GET list ideas with pagination
 */
export async function handleListIdeas(ctx: AIContext, req: Request, res: Response) {
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
    `SELECT ${IDEA_LIST_COLUMNS}, COUNT(*) OVER() AS total_count
     FROM ideas
     WHERE is_archived = false AND user_id = $1 ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
}

// ===========================================
// Single idea handler
// ===========================================

export async function handleGetIdea(ctx: AIContext, req: Request, res: Response) {
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
}

// ===========================================
// Update idea handler
// ===========================================

export async function handleUpdateIdea(ctx: AIContext, req: Request, res: Response) {
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
}

// ===========================================
// Delete idea handler
// ===========================================

export async function handleDeleteIdea(ctx: AIContext, req: Request, res: Response) {
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
// Stats handlers
// ===========================================

/**
 * Handler: GET stats/summary (legacy router)
 */
export async function handleStatsSummary(ctx: AIContext, req: Request, res: Response) {
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
}

/**
 * Handler: GET stats/summary (context-aware router — extended version)
 */
export async function handleStatsSummaryContext(ctx: AIContext, req: Request, res: Response) {
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
}

// ===========================================
// Recommendations handler
// ===========================================

export async function handleRecommendations(ctx: AIContext, req: Request, res: Response) {
  const startTime = Date.now();

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
}
