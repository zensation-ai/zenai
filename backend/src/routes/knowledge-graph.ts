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

export const knowledgeGraphRouter = Router();

/**
 * POST /api/knowledge-graph/analyze/:ideaId
 * Analyze and create relationships for an idea
 */
knowledgeGraphRouter.post('/analyze/:ideaId', async (req, res) => {
  const startTime = Date.now();

  try {
    const { ideaId } = req.params;

    console.log(`Analyzing relationships for idea: ${ideaId}`);
    const relationships = await analyzeRelationships(ideaId);

    res.json({
      success: true,
      ideaId,
      relationships,
      count: relationships.length,
      processingTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Relationship analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge-graph/relations/:ideaId
 * Get all relationships for an idea
 */
knowledgeGraphRouter.get('/relations/:ideaId', async (req, res) => {
  try {
    const { ideaId } = req.params;
    const relationships = await getRelationships(ideaId);

    res.json({
      ideaId,
      relationships,
      count: relationships.length,
    });
  } catch (error: any) {
    console.error('Get relationships error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge-graph/multi-hop/:ideaId
 * Multi-hop reasoning: find connected ideas through relationships
 */
knowledgeGraphRouter.get('/multi-hop/:ideaId', async (req, res) => {
  const startTime = Date.now();

  try {
    const { ideaId } = req.params;
    const maxHops = parseInt(req.query.maxHops as string) || 2;

    const paths = await multiHopSearch(ideaId, maxHops);

    res.json({
      ideaId,
      maxHops,
      paths,
      pathCount: paths.length,
      processingTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Multi-hop search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge-graph/suggestions/:ideaId
 * Get suggested connections for an idea
 */
knowledgeGraphRouter.get('/suggestions/:ideaId', async (req, res) => {
  try {
    const { ideaId } = req.params;
    const suggestions = await getSuggestedConnections(ideaId);

    res.json({
      ideaId,
      suggestions,
      count: suggestions.length,
    });
  } catch (error: any) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge-graph/stats
 * Get knowledge graph statistics
 */
knowledgeGraphRouter.get('/stats', async (req, res) => {
  try {
    const stats = await getGraphStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NEW: Full Graph Visualization Endpoints
// ============================================

/**
 * GET /api/:context/knowledge-graph/full
 * Get complete graph data for visualization
 */
knowledgeGraphRouter.get('/full', async (req, res) => {
  const startTime = Date.now();

  try {
    const context = (req.query.context as string) || 'personal';
    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    console.log(`[Knowledge Graph] Loading full graph for context: ${context}`);
    const graphData = await getFullGraph(context as AIContext);

    res.json({
      success: true,
      ...graphData,
      processingTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Get full graph error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge-graph/subgraph/:ideaId
 * Get subgraph around a specific idea
 */
knowledgeGraphRouter.get('/subgraph/:ideaId', async (req, res) => {
  const startTime = Date.now();

  try {
    const { ideaId } = req.params;
    const context = (req.query.context as string) || 'personal';
    const depth = parseInt(req.query.depth as string) || 2;
    const minStrength = parseFloat(req.query.minStrength as string) || 0.5;

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    console.log(`[Knowledge Graph] Loading subgraph for idea: ${ideaId}, depth: ${depth}`);
    const graphData = await getSubgraph(context as AIContext, ideaId, depth, minStrength);

    res.json({
      success: true,
      centerNode: ideaId,
      ...graphData,
      processingTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Get subgraph error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge-graph/discover
 * Discover relationships for all ideas in a context
 */
knowledgeGraphRouter.post('/discover', async (req, res) => {
  const startTime = Date.now();

  try {
    const { context = 'personal', force = false } = req.body;

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    console.log(`[Knowledge Graph] Starting relationship discovery for context: ${context}`);
    const result = await discoverAllRelationships(context as AIContext, { force });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Discover relationships error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge-graph/analytics
 * Get graph analytics for a context
 */
knowledgeGraphRouter.get('/analytics', async (req, res) => {
  try {
    const context = (req.query.context as string) || 'personal';

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    const analytics = await getGraphAnalytics(context as AIContext);

    res.json({
      success: true,
      context,
      analytics,
    });
  } catch (error: any) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Topic/Cluster Endpoints
// ============================================

/**
 * GET /api/knowledge-graph/topics
 * Get all topics for a context
 */
knowledgeGraphRouter.get('/topics', async (req, res) => {
  try {
    const context = (req.query.context as string) || 'personal';

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    const topics = await getTopics(context as AIContext);

    res.json({
      success: true,
      context,
      topics,
      count: topics.length,
    });
  } catch (error: any) {
    console.error('Get topics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge-graph/topics/:topicId
 * Get a single topic with its ideas
 */
knowledgeGraphRouter.get('/topics/:topicId', async (req, res) => {
  try {
    const { topicId } = req.params;
    const context = (req.query.context as string) || 'personal';

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    const result = await getTopicWithIdeas(context as AIContext, topicId);

    if (!result) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Get topic error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge-graph/topics/generate
 * Generate topics automatically using clustering
 */
knowledgeGraphRouter.post('/topics/generate', async (req, res) => {
  const startTime = Date.now();

  try {
    const { context = 'personal', minClusterSize = 2, maxClusters = 10 } = req.body;

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    console.log(`[Knowledge Graph] Generating topics for context: ${context}`);
    const result = await generateTopics(context as AIContext, { minClusterSize, maxClusters });

    res.json({
      ...result,
    });
  } catch (error: any) {
    console.error('Generate topics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge-graph/topics/merge
 * Merge multiple topics into one
 */
knowledgeGraphRouter.post('/topics/merge', async (req, res) => {
  try {
    const { context = 'personal', topicIds, newName } = req.body;

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    if (!Array.isArray(topicIds) || topicIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 topic IDs required for merge' });
    }

    if (!newName) {
      return res.status(400).json({ error: 'New topic name required' });
    }

    const mergedTopic = await mergeTopics(context as AIContext, topicIds, newName);

    if (!mergedTopic) {
      return res.status(500).json({ error: 'Failed to merge topics' });
    }

    res.json({
      success: true,
      topic: mergedTopic,
    });
  } catch (error: any) {
    console.error('Merge topics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge-graph/topics/assign/:ideaId
 * Assign an idea to its best matching topic
 */
knowledgeGraphRouter.post('/topics/assign/:ideaId', async (req, res) => {
  try {
    const { ideaId } = req.params;
    const { context = 'personal' } = req.body;

    if (!isValidContext(context)) {
      return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
    }

    const result = await assignIdeaToTopic(context as AIContext, ideaId);

    res.json({
      success: true,
      ideaId,
      ...result,
    });
  } catch (error: any) {
    console.error('Assign topic error:', error);
    res.status(500).json({ error: error.message });
  }
});
