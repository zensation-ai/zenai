/**
 * Phase 48: Knowledge Graph Reasoning Routes
 *
 * API endpoints for graph inference, community detection,
 * centrality analysis, learning paths, and manual relation CRUD.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { validateContextParam } from '../utils/validation';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { isValidContext, queryContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';
import {
  inferTransitiveRelations,
  detectContradictions,
  detectCommunities,
  calculateCentrality,
  generateLearningPath,
  createManualRelation,
  updateRelationStrength,
  deleteRelation,
  queryTemporalRelations,
  getRelationHistory,
  detectTemporalContradictions,
  getFactVersionHistory,
} from '../services/knowledge-graph/graph-reasoning';

const router = Router();

router.use(apiKeyAuth);

/**
 * POST /api/:context/knowledge-graph/infer
 * Run transitive inference to find hidden relationships
 */
router.post(
  '/:context/knowledge-graph/infer',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const minStrength = parseFloat(req.body.minStrength) || 0.5;
    const maxResults = parseInt(req.body.maxResults, 10) || 20;

    const inferred = await inferTransitiveRelations(context, { minStrength, maxResults });
    return res.json({ success: true, data: inferred });
  })
);

/**
 * GET /api/:context/knowledge-graph/contradictions
 * Detect potential contradictions in the graph
 */
router.get(
  '/:context/knowledge-graph/contradictions',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const contradictions = await detectContradictions(context);
    return res.json({ success: true, data: contradictions });
  })
);

/**
 * POST /api/:context/knowledge-graph/communities
 * Detect communities in the knowledge graph
 */
router.post(
  '/:context/knowledge-graph/communities',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const minSize = parseInt(req.body.minSize, 10) || 3;
    const minStrength = parseFloat(req.body.minStrength) || 0.4;

    const communities = await detectCommunities(context, { minSize, minStrength });
    return res.json({ success: true, data: communities });
  })
);

/**
 * GET /api/:context/knowledge-graph/communities
 * Get cached communities
 */
router.get(
  '/:context/knowledge-graph/communities',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const userId = getUserId(req);
    const result = await queryContext(
      context,
      `SELECT id, name, description, member_ids, member_count, coherence_score, created_at
       FROM graph_communities
       WHERE updated_at > NOW() - INTERVAL '7 days' AND user_id = $1
       ORDER BY member_count DESC`,
      [userId]
    );

    return res.json({
      success: true,
      data: result.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        memberIds: r.member_ids,
        memberCount: parseInt(r.member_count as string, 10) || 0,
        coherenceScore: parseFloat(r.coherence_score as string) || 0,
        createdAt: r.created_at,
      })),
    });
  })
);

/**
 * GET /api/:context/knowledge-graph/centrality
 * Get centrality metrics for the graph
 */
router.get(
  '/:context/knowledge-graph/centrality',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const centrality = await calculateCentrality(context, { limit });
    return res.json({ success: true, data: centrality });
  })
);

/**
 * GET /api/:context/knowledge-graph/learning-path/:ideaId
 * Generate a learning path starting from an idea
 */
router.get(
  '/:context/knowledge-graph/learning-path/:ideaId',
  requireScope('read'),
  requireUUID('ideaId'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const maxSteps = parseInt(req.query.maxSteps as string, 10) || 8;
    const path = await generateLearningPath(context, req.params.ideaId, { maxSteps });
    return res.json({ success: true, data: path });
  })
);

/**
 * POST /api/:context/knowledge-graph/relations
 * Create a manual relationship between two ideas
 */
router.post(
  '/:context/knowledge-graph/relations',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const { sourceId, targetId, relationType, strength } = req.body;
    if (!sourceId || !targetId || !relationType) {
      return res.status(400).json({ success: false, error: 'sourceId, targetId, and relationType are required' });
    }

    const id = await createManualRelation(context, sourceId, targetId, relationType, strength);
    return res.json({ success: true, data: { id } });
  })
);

/**
 * PUT /api/:context/knowledge-graph/relations
 * Update a relationship strength
 */
router.put(
  '/:context/knowledge-graph/relations',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const { sourceId, targetId, strength } = req.body;
    if (!sourceId || !targetId || typeof strength !== 'number') {
      return res.status(400).json({ success: false, error: 'sourceId, targetId, and strength are required' });
    }

    await updateRelationStrength(context, sourceId, targetId, strength);
    return res.json({ success: true, message: 'Relation updated' });
  })
);

/**
 * DELETE /api/:context/knowledge-graph/relations
 * Delete a relationship
 */
router.delete(
  '/:context/knowledge-graph/relations',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const { sourceId, targetId } = req.body;
    if (!sourceId || !targetId) {
      return res.status(400).json({ success: false, error: 'sourceId and targetId are required' });
    }

    await deleteRelation(context, sourceId, targetId);
    return res.json({ success: true, message: 'Relation deleted' });
  })
);

// ===========================================
// Temporal Knowledge Graph
// ===========================================

/**
 * GET /api/:context/knowledge-graph/temporal/:ideaId
 * Get temporal relations for an idea (active + historical within time range)
 */
router.get(
  '/:context/knowledge-graph/temporal/:ideaId',
  requireScope('read'),
  requireUUID('ideaId'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const relations = await queryTemporalRelations(context, req.params.ideaId, { from, to });
    return res.json({ success: true, data: relations });
  })
);

/**
 * GET /api/:context/knowledge-graph/temporal-history
 * Get full relation history between two ideas
 */
router.get(
  '/:context/knowledge-graph/temporal-history',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const sourceId = req.query.sourceId as string;
    const targetId = req.query.targetId as string;
    if (!sourceId || !targetId) {
      throw new ValidationError('sourceId and targetId query parameters are required');
    }

    const history = await getRelationHistory(context, sourceId, targetId);
    return res.json({ success: true, data: history });
  })
);

/**
 * GET /api/:context/knowledge-graph/temporal-contradictions
 * Detect temporal contradictions (superseded relations that conflict)
 */
router.get(
  '/:context/knowledge-graph/temporal-contradictions',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const contradictions = await detectTemporalContradictions(context);
    return res.json({ success: true, data: contradictions });
  })
);

/**
 * GET /api/:context/knowledge-graph/fact-versions/:factId
 * Get version history for a learned fact
 */
router.get(
  '/:context/knowledge-graph/fact-versions/:factId',
  requireScope('read'),
  requireUUID('factId'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const _userId = getUserId(req);
    const versions = await getFactVersionHistory(context, req.params.factId);
    return res.json({ success: true, data: versions });
  })
);

export { router as graphReasoningRouter };
