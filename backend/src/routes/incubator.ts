/**
 * Thought Incubator API Routes
 *
 * Endpoints for managing loose thoughts that incubate into structured ideas
 * Now with dual-context support (personal/work)
 */

import { Router, Request, Response } from 'express';
import { getUserId } from '../utils/user-context';
import {
  addLooseThought,
  getLooseThoughts,
  getAllClusters,
  getReadyClusters,
  generateClusterSummary,
  consolidateCluster,
  dismissCluster,
  markClusterPresented,
  runBatchAnalysis,
  getIncubatorStats,
  backfillEmbeddings,
} from '../services/thought-incubator';
import { runDailyLearning, getPersonalizedPromptContext } from '../services/learning-engine';
import { getUserProfile, getRecommendations } from '../services/user-profile';
import { AIContext, isValidContext, isValidUUID } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';

const router = Router();

// Helper to extract and validate context from request
function getContextFromRequest(req: Request): AIContext {
  const context = (req.query.context as string) || (req.body?.context as string) || 'personal';
  return isValidContext(context) ? context : 'personal';
}

// Helper to validate cluster ID
function validateClusterId(id: string): void {
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid cluster ID format. Must be a valid UUID.');
  }
}

/**
 * POST /api/incubator/thought
 * Add a new loose thought to the incubator
 */
router.post('/thought', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { text, source = 'text', tags = [] } = req.body;
  const userId = getUserId(req);
  const context = getContextFromRequest(req);

  if (!text || text.trim().length === 0) {
    throw new ValidationError('Text ist erforderlich');
  }

  const thought = await addLooseThought(
    text.trim(),
    source,
    tags,
    userId,
    context
  );

  res.status(201).json({
    success: true,
    thought,
    context,
    message: 'Gedanke wurde zum Inkubator hinzugefügt',
  });
}));

/**
 * GET /api/incubator/thoughts
 * Get all loose thoughts
 */
router.get('/thoughts', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const includeProcessed = req.query.includeProcessed !== 'false';
  const context = getContextFromRequest(req);

  const thoughts = await getLooseThoughts(userId, limit, includeProcessed, context);

  res.json({
    success: true,
    thoughts,
    count: thoughts.length,
    context,
  });
}));

/**
 * GET /api/incubator/clusters
 * Get all clusters with their thoughts
 */
router.get('/clusters', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const includeThoughts = req.query.includeThoughts !== 'false';
  const context = getContextFromRequest(req);

  const clusters = await getAllClusters(userId, includeThoughts, context);

  res.json({
    success: true,
    clusters,
    count: clusters.length,
    context,
  });
}));

/**
 * GET /api/incubator/clusters/ready
 * Get clusters that are ready for presentation
 */
router.get('/clusters/ready', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const context = getContextFromRequest(req);

  const clusters = await getReadyClusters(userId, context);

  res.json({
    success: true,
    clusters,
    count: clusters.length,
    hasNew: clusters.some(c => c.status === 'ready'),
    context,
  });
}));

/**
 * POST /api/incubator/clusters/:id/summarize
 * Generate AI summary for a cluster
 */
router.post('/clusters/:id/summarize', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateClusterId(id);
  const context = getContextFromRequest(req);

  const summary = await generateClusterSummary(id, context);

  res.json({
    success: true,
    ...summary,
    context,
  });
}));

/**
 * POST /api/incubator/clusters/:id/consolidate
 * Convert a cluster into a proper idea
 */
router.post('/clusters/:id/consolidate', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateClusterId(id);
  const { title, type, category, priority } = req.body;
  const context = getContextFromRequest(req);

  const ideaId = await consolidateCluster(id, {
    title,
    type,
    category,
    priority,
  }, context);

  res.json({
    success: true,
    ideaId,
    context,
    message: 'Cluster wurde zu einer Idee konsolidiert',
  });
}));

/**
 * POST /api/incubator/clusters/:id/dismiss
 * Dismiss a cluster (user doesn't find it useful)
 */
router.post('/clusters/:id/dismiss', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateClusterId(id);
  const context = getContextFromRequest(req);

  await dismissCluster(id, context);

  res.json({
    success: true,
    context,
    message: 'Cluster wurde verworfen',
  });
}));

/**
 * POST /api/incubator/clusters/:id/presented
 * Mark a cluster as presented to the user
 */
router.post('/clusters/:id/presented', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateClusterId(id);
  const context = getContextFromRequest(req);

  await markClusterPresented(id, context);

  res.json({
    success: true,
    context,
  });
}));

/**
 * POST /api/incubator/analyze
 * Run batch analysis on unprocessed thoughts
 */
router.post('/analyze', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const context = getContextFromRequest(req);

  const result = await runBatchAnalysis(userId, context);

  res.json({
    success: true,
    ...result,
    context,
  });
}));

/**
 * GET /api/incubator/stats
 * Get incubator statistics
 */
router.get('/stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const context = getContextFromRequest(req);

  const stats = await getIncubatorStats(userId, context);

  res.json({
    success: true,
    ...stats,
    context,
  });
}));

/**
 * POST /api/incubator/backfill-embeddings
 * Backfill embeddings for thoughts that don't have them
 * Useful after deploying new embedding providers
 */
router.post('/backfill-embeddings', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const context = getContextFromRequest(req);

  const result = await backfillEmbeddings(userId, context);

  res.json({
    success: true,
    ...result,
    context,
    message: `Backfill complete: ${result.processed} processed, ${result.failed} failed`,
  });
}));

/**
 * GET /api/incubator/debug
 * Debug endpoint to inspect thought state
 * Requires admin scope - for debugging only
 */
router.get('/debug', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const context = getContextFromRequest(req);
  const userId = getUserId(req);
  const { getPool, isValidContext } = await import('../utils/database-context');
  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: 'Invalid context' });
    return;
  }
  const SEARCH_PATHS: Record<string, string> = {
    personal: 'SET search_path TO personal, public',
    work: 'SET search_path TO work, public',
    learning: 'SET search_path TO learning, public',
    creative: 'SET search_path TO creative, public',
  };
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    await client.query(SEARCH_PATHS[context]);
    // Get thoughts with embedding status
    const thoughtsResult = await client.query(
      `SELECT id, raw_input, is_processed, cluster_id, similarity_to_cluster,
              embedding IS NOT NULL as has_embedding,
              CASE WHEN embedding IS NOT NULL THEN array_length(embedding::real[], 1) END as embedding_dims
       FROM loose_thoughts
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get cluster count
    const clustersResult = await client.query(
      `SELECT COUNT(*) as count FROM thought_clusters WHERE user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      thoughts: thoughtsResult.rows.map(t => ({
        id: t.id,
        raw_input: t.raw_input?.substring(0, 50) + '...',
        has_embedding: t.has_embedding,
        embedding_dims: t.embedding_dims,
        is_processed: t.is_processed,
        cluster_id: t.cluster_id,
        similarity: t.similarity_to_cluster,
      })),
      thought_count: thoughtsResult.rows.length,
      cluster_count: parseInt(clustersResult.rows[0].count, 10),
      context,
    });
  } finally {
    client.release();
  }
}));

/**
 * GET /api/incubator/learning
 * Get learning status and insights
 */
router.get('/learning', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const [profile, recommendations, insights] = await Promise.all([
    getUserProfile(userId),
    getRecommendations(userId),
    runDailyLearning(userId),
  ]);

  // Calculate learning progress
  const totalInteractions = Object.values(profile.preferred_categories || {}).reduce((a, b) => a + (b as number), 0);
  const learningProgress = Math.min(totalInteractions / 100, 1); // Max at 100 interactions

  res.json({
    success: true,
    learningProgress,
    confidence: insights.confidence,
    profile: {
      topCategories: Object.entries(profile.preferred_categories || {})
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([cat, count]) => ({ category: cat, count })),
      topTypes: Object.entries(profile.preferred_types || {})
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([type, count]) => ({ type, count })),
      thinkingPatterns: profile.thinking_patterns,
      languageStyle: profile.language_style,
    },
    recommendations,
    insights: insights.insights,
    totalIdeas: profile.total_ideas,
    avgPerDay: profile.avg_ideas_per_day,
  });
}));

/**
 * GET /api/incubator/context
 * Get personalized context for LLM prompts
 */
router.get('/context', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const context = await getPersonalizedPromptContext(userId);

  res.json({
    success: true,
    context: context,
    hasContext: context.length > 0,
  });
}));

export default router;
