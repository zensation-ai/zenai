import { Router } from 'express';
import {
  analyzeRelationships,
  getRelationships,
  multiHopSearch,
  getSuggestedConnections,
  getGraphStats,
  getFullGraph,
  getSubgraph,
  discoverAllRelationships,
  getGraphAnalytics,
} from '../services/knowledge-graph';
import {
  generateTopics,
  getTopics,
  getTopicWithIdeas,
  mergeTopics,
  assignIdeaToTopic,
} from '../services/topic-clustering';
import { isValidContext, AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { toIntBounded, toFloatBounded } from '../utils/validation';

export const knowledgeGraphRouter = Router();

/**
 * POST /api/knowledge-graph/analyze/:ideaId
 * Analyze and create relationships for an idea
 */
knowledgeGraphRouter.post('/analyze/:ideaId', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { ideaId } = req.params;

  logger.info('Analyzing relationships', { ideaId });
  const relationships = await analyzeRelationships(ideaId);

  res.json({
    success: true,
    ideaId,
    relationships,
    count: relationships.length,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * GET /api/knowledge-graph/relations/:ideaId
 * Get all relationships for an idea
 */
knowledgeGraphRouter.get('/relations/:ideaId', apiKeyAuth, asyncHandler(async (req, res) => {
  const { ideaId } = req.params;
  const relationships = await getRelationships(ideaId);

  res.json({
    ideaId,
    relationships,
    count: relationships.length,
  });
}));

/**
 * GET /api/knowledge-graph/multi-hop/:ideaId
 * Multi-hop reasoning: find connected ideas through relationships
 */
knowledgeGraphRouter.get('/multi-hop/:ideaId', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { ideaId } = req.params;
  const maxHops = toIntBounded(req.query.maxHops as string, 2, 1, 5);

  const paths = await multiHopSearch(ideaId, maxHops);

  res.json({
    ideaId,
    maxHops,
    paths,
    pathCount: paths.length,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * GET /api/knowledge-graph/suggestions/:ideaId
 * Get suggested connections for an idea
 */
knowledgeGraphRouter.get('/suggestions/:ideaId', apiKeyAuth, asyncHandler(async (req, res) => {
  const { ideaId } = req.params;
  const suggestions = await getSuggestedConnections(ideaId);

  res.json({
    ideaId,
    suggestions,
    count: suggestions.length,
  });
}));

/**
 * GET /api/knowledge-graph/stats
 * Get knowledge graph statistics
 */
knowledgeGraphRouter.get('/stats', apiKeyAuth, asyncHandler(async (req, res) => {
  const stats = await getGraphStats();

  res.json({
    success: true,
    stats,
  });
}));

// ============================================
// NEW: Full Graph Visualization Endpoints
// ============================================

/**
 * GET /api/:context/knowledge-graph/full
 * Get complete graph data for visualization
 */
knowledgeGraphRouter.get('/full', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const context = (req.query.context as string) || 'personal';

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  logger.info('Loading full knowledge graph', { context });
  const graphData = await getFullGraph(context as AIContext);

  res.json({
    success: true,
    ...graphData,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * GET /api/knowledge-graph/subgraph/:ideaId
 * Get subgraph around a specific idea
 */
knowledgeGraphRouter.get('/subgraph/:ideaId', apiKeyAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { ideaId } = req.params;
  const context = (req.query.context as string) || 'personal';
  const depth = toIntBounded(req.query.depth as string, 2, 1, 5);
  const minStrength = toFloatBounded(req.query.minStrength as string, 0.5, 0, 1);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  logger.info('Loading subgraph', { ideaId, depth });
  const graphData = await getSubgraph(context as AIContext, ideaId, depth, minStrength);

  res.json({
    success: true,
    centerNode: ideaId,
    ...graphData,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * POST /api/knowledge-graph/discover
 * Discover relationships for all ideas in a context
 */
knowledgeGraphRouter.post('/discover', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { context = 'personal', force = false } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  logger.info('Starting relationship discovery', { context });
  const result = await discoverAllRelationships(context as AIContext, { force });

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * GET /api/knowledge-graph/analytics
 * Get graph analytics for a context
 */
knowledgeGraphRouter.get('/analytics', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = (req.query.context as string) || 'personal';

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const analytics = await getGraphAnalytics(context as AIContext);

  res.json({
    success: true,
    context,
    analytics,
  });
}));

// ============================================
// Topic/Cluster Endpoints
// ============================================

/**
 * GET /api/knowledge-graph/topics
 * Get all topics for a context
 */
knowledgeGraphRouter.get('/topics', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = (req.query.context as string) || 'personal';

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const topics = await getTopics(context as AIContext);

  res.json({
    success: true,
    context,
    topics,
    count: topics.length,
  });
}));

/**
 * GET /api/knowledge-graph/topics/:topicId
 * Get a single topic with its ideas
 */
knowledgeGraphRouter.get('/topics/:topicId', apiKeyAuth, asyncHandler(async (req, res) => {
  const { topicId } = req.params;
  const context = (req.query.context as string) || 'personal';

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const result = await getTopicWithIdeas(context as AIContext, topicId);

  if (!result) {
    throw new NotFoundError('Topic');
  }

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * POST /api/knowledge-graph/topics/generate
 * Generate topics automatically using clustering
 */
knowledgeGraphRouter.post('/topics/generate', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { context = 'personal', minClusterSize = 2, maxClusters = 10 } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  logger.info('Generating topics', { context });
  const result = await generateTopics(context as AIContext, { minClusterSize, maxClusters });

  res.json({
    ...result,
  });
}));

/**
 * POST /api/knowledge-graph/topics/merge
 * Merge multiple topics into one
 */
knowledgeGraphRouter.post('/topics/merge', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { context = 'personal', topicIds, newName } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  if (!Array.isArray(topicIds) || topicIds.length < 2) {
    throw new ValidationError('At least 2 topic IDs required for merge');
  }

  if (!newName) {
    throw new ValidationError('New topic name required');
  }

  const mergedTopic = await mergeTopics(context as AIContext, topicIds, newName);

  if (!mergedTopic) {
    throw new ValidationError('Failed to merge topics');
  }

  res.json({
    success: true,
    topic: mergedTopic,
  });
}));

/**
 * POST /api/knowledge-graph/topics/assign/:ideaId
 * Assign an idea to its best matching topic
 */
knowledgeGraphRouter.post('/topics/assign/:ideaId', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { ideaId } = req.params;
  const { context = 'personal' } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const result = await assignIdeaToTopic(context as AIContext, ideaId);

  res.json({
    success: true,
    ideaId,
    ...result,
  });
}));
