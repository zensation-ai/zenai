/**
 * Phase 58: GraphRAG Routes
 *
 * API endpoints for entity extraction, hybrid retrieval,
 * community summaries, and graph indexing.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requirePlan } from '../middleware/plan-gate';
import { validateContextParam } from '../utils/validation';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { isValidContext } from '../utils/database-context';
import { queryContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';
import { escapeLike } from '../utils/sql-helpers';
import { graphBuilder } from '../services/knowledge-graph/graph-builder';
import { hybridRetriever } from '../services/knowledge-graph/hybrid-retriever';
import { communitySummarizer } from '../services/knowledge-graph/community-summarizer';
import { graphIndexer } from '../services/knowledge-graph/graph-indexer';
import { queryEventsByTimeRange, getActivityHeatmap, getEntityActivityScore, pruneOldEvents } from '../services/knowledge-graph/event-subgraph';
import { getTemporalEntityRanking, getEntityTimeline } from '../services/knowledge-graph/temporal-index';

const router = Router();

router.use(apiKeyAuth);

/**
 * POST /api/:context/graphrag/extract
 * Extract entities and relations from text
 */
router.post(
  '/:context/graphrag/extract',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const { text, sourceId } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new ValidationError('text is required and must be a non-empty string.');
    }

    const result = await graphBuilder.extractFromText(
      text,
      sourceId || '00000000-0000-0000-0000-000000000000',
      context
    );

    return res.json({ success: true, data: result });
  })
);

/**
 * GET /api/:context/graphrag/entities
 * List entities with optional filters
 */
router.get(
  '/:context/graphrag/entities',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    const userId = getUserId(req);
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    let sql = `SELECT id, name, type, description, importance, mention_count, aliases, created_at, updated_at
               FROM knowledge_entities WHERE user_id = $1`;
    const params: (string | number)[] = [userId];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    if (search) {
      params.push(`%${escapeLike(search)}%`);
      sql += ` AND (LOWER(name) LIKE LOWER($${params.length}) OR LOWER(description) LIKE LOWER($${params.length}))`;
    }

    sql += ` ORDER BY importance DESC, mention_count DESC`;
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const result = await queryContext(context, sql, params);

    return res.json({ success: true, data: result.rows });
  })
);

/**
 * GET /api/:context/graphrag/entities/:id
 * Get entity with its relations
 */
router.get(
  '/:context/graphrag/entities/:id',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    const userId = getUserId(req);
    const entityId = req.params.id;

    const entityResult = await queryContext(
      context,
      `SELECT id, name, type, description, importance, mention_count, aliases, source_ids, metadata, created_at, updated_at
       FROM knowledge_entities WHERE id = $1 AND user_id = $2`,
      [entityId, userId]
    );

    if (entityResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }

    // Fetch relations (scoped to user's entities)
    const relationsResult = await queryContext(
      context,
      `SELECT er.id, er.relation_type, er.description, er.strength,
              CASE WHEN er.source_entity_id = $1 THEN er.target_entity_id ELSE er.source_entity_id END as related_entity_id,
              CASE WHEN er.source_entity_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction,
              ke.name as related_entity_name, ke.type as related_entity_type
       FROM entity_relations er
       JOIN knowledge_entities ke ON ke.id = CASE WHEN er.source_entity_id = $1 THEN er.target_entity_id ELSE er.source_entity_id END
         AND ke.user_id = $2
       WHERE (er.source_entity_id = $1 OR er.target_entity_id = $1)
       ORDER BY er.strength DESC`,
      [entityId, userId]
    );

    return res.json({
      success: true,
      data: {
        ...entityResult.rows[0],
        relations: relationsResult.rows,
      },
    });
  })
);

/**
 * DELETE /api/:context/graphrag/entities/:id
 * Delete an entity (cascades to relations)
 */
router.delete(
  '/:context/graphrag/entities/:id',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    const userId = getUserId(req);
    const entityId = req.params.id;

    const result = await queryContext(
      context,
      `DELETE FROM knowledge_entities WHERE id = $1 AND user_id = $2 RETURNING id`,
      [entityId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }

    return res.json({ success: true, message: 'Entity deleted' });
  })
);

/**
 * POST /api/:context/graphrag/retrieve
 * Hybrid retrieval: vector + graph + community + BM25
 */
router.post(
  '/:context/graphrag/retrieve',
  requireScope('read'),
  requirePlan('pro'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const { query, options } = req.body;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new ValidationError('query is required and must be a non-empty string.');
    }

    const results = await hybridRetriever.retrieve(query, context, options);

    return res.json({ success: true, data: results });
  })
);

/**
 * GET /api/:context/graphrag/communities
 * Get community summaries
 */
router.get(
  '/:context/graphrag/communities',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const summaries = await communitySummarizer.getCommunitySummaries(context);

    return res.json({ success: true, data: summaries });
  })
);

/**
 * POST /api/:context/graphrag/communities/refresh
 * Refresh community summaries
 */
router.post(
  '/:context/graphrag/communities/refresh',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const maxAgeHours = parseInt(req.body.maxAgeHours, 10) || 24;
    const refreshed = await communitySummarizer.refreshStaleCommunitySummaries(context, maxAgeHours);

    return res.json({ success: true, data: { refreshedCount: refreshed } });
  })
);

/**
 * POST /api/:context/graphrag/index
 * Trigger batch indexing
 */
router.post(
  '/:context/graphrag/index',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const limit = parseInt(req.body.limit, 10) || 50;
    const sinceHours = req.body.sinceHours ? parseInt(req.body.sinceHours, 10) : undefined;

    const result = await graphIndexer.indexBatch(context, { limit, sinceHours });

    return res.json({ success: true, data: result });
  })
);

/**
 * GET /api/:context/graphrag/index/status
 * Get indexing status
 */
router.get(
  '/:context/graphrag/index/status',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const status = await graphIndexer.getIndexingStatus(context);

    return res.json({
      success: true,
      data: {
        ...status,
        isIndexing: graphIndexer.isIndexing(),
      },
    });
  })
);

// ===========================================
// Event Subgraph Routes (Layer 1)
// ===========================================

/**
 * GET /api/:context/graphrag/events
 * Query events by time range
 */
router.get(
  '/:context/graphrag/events',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const startDate = new Date(req.query.start as string || Date.now() - 7 * 86400000);
    const endDate = new Date(req.query.end as string || Date.now());
    const eventType = req.query.type as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

    const events = await queryEventsByTimeRange(context, startDate, endDate, {
      eventType: eventType as Parameters<typeof queryEventsByTimeRange>[3] extends { eventType?: infer T } ? T : never,
      limit,
    });

    return res.json({ success: true, data: events });
  })
);

/**
 * GET /api/:context/graphrag/events/heatmap
 * Activity heatmap
 */
router.get(
  '/:context/graphrag/events/heatmap',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const days = Math.min(parseInt(req.query.days as string, 10) || 30, 365);
    const heatmap = await getActivityHeatmap(context, days);
    return res.json({ success: true, data: heatmap });
  })
);

/**
 * GET /api/:context/graphrag/entities/:id/activity
 * Entity activity score
 */
router.get(
  '/:context/graphrag/entities/:id/activity',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const entityId = req.params.id;
    const days = Math.min(parseInt(req.query.days as string, 10) || 7, 365);
    const activity = await getEntityActivityScore(context, entityId, days);
    return res.json({ success: true, data: activity });
  })
);

/**
 * GET /api/:context/graphrag/entities/:id/timeline
 * Entity event timeline
 */
router.get(
  '/:context/graphrag/entities/:id/timeline',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const entityId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const timeline = await getEntityTimeline(context, entityId, limit);
    return res.json({ success: true, data: timeline });
  })
);

/**
 * GET /api/:context/graphrag/temporal-ranking
 * Temporal entity ranking
 */
router.get(
  '/:context/graphrag/temporal-ranking',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const ranking = await getTemporalEntityRanking(context, limit);
    return res.json({ success: true, data: ranking });
  })
);

/**
 * POST /api/:context/graphrag/events/prune
 * Prune old events
 */
router.post(
  '/:context/graphrag/events/prune',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: operations, finance, people, or strategy.');
    }

    getUserId(req); // auth check
    const days = req.body.retentionDays || 90;
    const deleted = await pruneOldEvents(context, days);
    return res.json({ success: true, data: { deletedEvents: deleted } });
  })
);

export const graphragRouter = router;
