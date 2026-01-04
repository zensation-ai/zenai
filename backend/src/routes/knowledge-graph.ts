import { Router } from 'express';
import {
  analyzeRelationships,
  getRelationships,
  multiHopSearch,
  getSuggestedConnections,
  getGraphStats,
} from '../services/knowledge-graph';

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
