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
import {
  inferTransitiveRelations,
  detectContradictions,
  detectCommunities,
  calculateCentrality,
  generateLearningPath,
  createManualRelation,
  updateRelationStrength,
  deleteRelation,
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
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

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
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const result = await queryContext(
      context,
      `SELECT id, name, description, member_ids, member_count, coherence_score, created_at
       FROM graph_communities
       WHERE updated_at > NOW() - INTERVAL '7 days'
       ORDER BY member_count DESC`
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
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

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
  requireUUID('ideaId'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

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

    const { sourceId, targetId } = req.body;
    if (!sourceId || !targetId) {
      return res.status(400).json({ success: false, error: 'sourceId and targetId are required' });
    }

    await deleteRelation(context, sourceId, targetId);
    return res.json({ success: true, message: 'Relation deleted' });
  })
);

export { router as graphReasoningRouter };
