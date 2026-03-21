/**
 * Ideas Advanced Handlers
 *
 * Search, triage, archive, restore, merge, duplicates, batch ops, favorites, move, priority, swipe.
 * Split from ideas-handlers.ts (Phase 122) for maintainability.
 *
 * @module routes/ideas-advanced-handlers
 */

import { Request, Response } from 'express';
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
  validateRequiredString,
  parseIntSafe,
  validateContextParam,
} from '../utils/validation';
import { ValidationError, NotFoundError, AppError } from '../middleware/errorHandler';
import { parseIdeaRows, IdeaDatabaseRow } from '../utils/idea-parser';
import { trackActivity } from '../services/activity-tracker';
import { moveIdea } from '../services/idea-move';
import { invalidateCacheForContext } from '../middleware/response-cache';
import { getUserId } from '../utils/user-context';
import { escapeLike } from '../utils/sql-helpers';

// ===========================================
// Shared column lists
// ===========================================
const IDEA_LIST_COLUMNS = `id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, context, is_favorite, created_at, updated_at`;

const IDEA_TRIAGE_COLUMNS = `i.id, i.title, i.type, i.category, i.priority, i.summary,
        i.next_steps, i.context_needed, i.keywords, i.context,
        i.created_at, i.updated_at, i.raw_transcript`;

const IDEA_SEARCH_COLUMNS = `id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, context, created_at`;

// ===========================================
// Triage handlers
// ===========================================

/**
 * Shared handler: GET triage ideas
 */
export async function handleTriageGet(ctx: AIContext, req: Request, res: Response) {
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
    `SELECT ${IDEA_TRIAGE_COLUMNS}, COUNT(*) OVER() AS total_count
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

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    total,
    hasMore: result.rows.length === limit,
  });
}

/**
 * Shared handler: POST triage action
 */
export async function handleTriagePost(ctx: AIContext, req: Request, res: Response) {
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

// ===========================================
// Archive handlers
// ===========================================

/**
 * Shared handler: GET archived ideas
 */
export async function handleArchivedList(ctx: AIContext, req: Request, res: Response) {
  const userId = getUserId(req);

  const paginationResult = validatePagination(req.query as Record<string, unknown>, { maxLimit: 100, defaultLimit: 20 });
  if (!paginationResult.success) {
    throw new ValidationError('Invalid pagination');
  }
  const pagination = paginationResult.data ?? { limit: 20, offset: 0 };

  const result = await queryContext(
    ctx,
    `SELECT ${IDEA_LIST_COLUMNS}, COUNT(*) OVER() AS total_count
     FROM ideas
     WHERE is_archived = true AND user_id = $3
     ORDER BY updated_at DESC
     LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset, userId]
  );

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;

  res.json({
    success: true,
    ideas: parseIdeaRows(result.rows as IdeaDatabaseRow[]),
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.offset + pagination.limit < total,
    },
  });
}

/**
 * Shared handler: PUT archive idea
 */
export async function handleArchiveIdea(ctx: AIContext, req: Request, res: Response) {
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
export async function handleRestoreIdea(ctx: AIContext, req: Request, res: Response) {
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

// ===========================================
// Search handlers
// ===========================================

export async function handleSearch(ctx: AIContext, req: Request, res: Response) {
  const startTime = Date.now();
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
    // Fallback to text search if embedding fails
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
}

export async function handleProgressiveSearch(ctx: AIContext, req: Request, res: Response) {
  const startTime = Date.now();
  const userId = getUserId(req);

  const queryResult = validateRequiredString(req.body.query, 'query', { minLength: 1, maxLength: 500 });
  if (!queryResult.success) {
    throw new ValidationError('Invalid search query');
  }
  const searchQuery = queryResult.data ?? '';

  const limitResult = parseIntSafe(req.body.limit?.toString(), { default: 10, min: 1, max: 50, fieldName: 'limit' });
  const limit = limitResult.success ? (limitResult.data ?? 10) : 10;

  // Phase 1: Keyword search (fast, < 50ms typically)
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
}

// ===========================================
// Similar ideas handler
// ===========================================

export async function handleSimilarIdeas(ctx: AIContext, req: Request, res: Response) {
  const startTime = Date.now();
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
}

// ===========================================
// Priority & Swipe handlers
// ===========================================

export async function handlePriorityUpdate(ctx: AIContext, req: Request, res: Response) {
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
}

export async function handleSwipeAction(ctx: AIContext, req: Request, res: Response) {
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
}

// ===========================================
// Duplicate Detection handlers
// ===========================================

export async function handleCheckDuplicates(ctx: AIContext, req: Request, res: Response) {
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
}

export async function handleMergeIdeas(ctx: AIContext, req: Request, res: Response) {
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
}

// ===========================================
// Context-aware route handlers
// ===========================================

export async function handleMoveIdea(req: Request, res: Response) {
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
}

export async function handleToggleFavorite(ctx: AIContext, req: Request, res: Response) {
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
}

// ===========================================
// Batch Operations
// ===========================================

const MAX_BATCH_SIZE = 100;

export function validateBatchIds(ids: unknown): string[] {
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

export async function handleBatchArchive(ctx: AIContext, req: Request, res: Response) {
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
}

export async function handleBatchDelete(ctx: AIContext, req: Request, res: Response) {
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
}

export async function handleBatchFavorite(ctx: AIContext, req: Request, res: Response) {
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
}
