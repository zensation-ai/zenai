/**
 * Thought Incubator API Routes
 *
 * Endpoints for managing loose thoughts that incubate into structured ideas
 * Now with dual-context support (personal/work)
 */

import { Router, Request, Response } from 'express';
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
} from '../services/thought-incubator';
import { runDailyLearning, getPersonalizedPromptContext } from '../services/learning-engine';
import { getUserProfile, getRecommendations } from '../services/user-profile';
import { AIContext, isValidContext } from '../utils/database-context';

const router = Router();

// Helper to extract and validate context from request
function getContextFromRequest(req: Request): AIContext {
  const context = (req.query.context as string) || (req.body?.context as string) || 'personal';
  return isValidContext(context) ? context : 'personal';
}

/**
 * POST /api/incubator/thought
 * Add a new loose thought to the incubator
 */
router.post('/thought', async (req: Request, res: Response) => {
  try {
    const { text, source = 'text', tags = [], userId = 'default' } = req.body;
    const context = getContextFromRequest(req);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text ist erforderlich' });
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
  } catch (error) {
    console.error('Error adding loose thought:', error);
    res.status(500).json({ error: 'Fehler beim Hinzufügen des Gedankens' });
  }
});

/**
 * GET /api/incubator/thoughts
 * Get all loose thoughts
 */
router.get('/thoughts', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const limit = parseInt(req.query.limit as string) || 50;
    const includeProcessed = req.query.includeProcessed !== 'false';
    const context = getContextFromRequest(req);

    const thoughts = await getLooseThoughts(userId, limit, includeProcessed, context);

    res.json({
      thoughts,
      count: thoughts.length,
      context,
    });
  } catch (error) {
    console.error('Error fetching loose thoughts:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Gedanken' });
  }
});

/**
 * GET /api/incubator/clusters
 * Get all clusters with their thoughts
 */
router.get('/clusters', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const includeThoughts = req.query.includeThoughts !== 'false';
    const context = getContextFromRequest(req);

    const clusters = await getAllClusters(userId, includeThoughts, context);

    res.json({
      clusters,
      count: clusters.length,
      context,
    });
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Cluster' });
  }
});

/**
 * GET /api/incubator/clusters/ready
 * Get clusters that are ready for presentation
 */
router.get('/clusters/ready', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const context = getContextFromRequest(req);

    const clusters = await getReadyClusters(userId, context);

    res.json({
      clusters,
      count: clusters.length,
      hasNew: clusters.some(c => c.status === 'ready'),
      context,
    });
  } catch (error) {
    console.error('Error fetching ready clusters:', error);
    res.status(500).json({ error: 'Fehler beim Laden der fertigen Cluster' });
  }
});

/**
 * POST /api/incubator/clusters/:id/summarize
 * Generate AI summary for a cluster
 */
router.post('/clusters/:id/summarize', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const context = getContextFromRequest(req);

    const summary = await generateClusterSummary(id, context);

    res.json({
      success: true,
      ...summary,
      context,
    });
  } catch (error) {
    console.error('Error generating cluster summary:', error);
    res.status(500).json({ error: 'Fehler beim Generieren der Zusammenfassung' });
  }
});

/**
 * POST /api/incubator/clusters/:id/consolidate
 * Convert a cluster into a proper idea
 */
router.post('/clusters/:id/consolidate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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
  } catch (error) {
    console.error('Error consolidating cluster:', error);
    res.status(500).json({ error: 'Fehler beim Konsolidieren des Clusters' });
  }
});

/**
 * POST /api/incubator/clusters/:id/dismiss
 * Dismiss a cluster (user doesn't find it useful)
 */
router.post('/clusters/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const context = getContextFromRequest(req);

    await dismissCluster(id, context);

    res.json({
      success: true,
      context,
      message: 'Cluster wurde verworfen',
    });
  } catch (error) {
    console.error('Error dismissing cluster:', error);
    res.status(500).json({ error: 'Fehler beim Verwerfen des Clusters' });
  }
});

/**
 * POST /api/incubator/clusters/:id/presented
 * Mark a cluster as presented to the user
 */
router.post('/clusters/:id/presented', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const context = getContextFromRequest(req);

    await markClusterPresented(id, context);

    res.json({
      success: true,
      context,
    });
  } catch (error) {
    console.error('Error marking cluster as presented:', error);
    res.status(500).json({ error: 'Fehler beim Markieren als präsentiert' });
  }
});

/**
 * POST /api/incubator/analyze
 * Run batch analysis on unprocessed thoughts
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'default';
    const context = getContextFromRequest(req);

    const result = await runBatchAnalysis(userId, context);

    res.json({
      success: true,
      ...result,
      context,
    });
  } catch (error) {
    console.error('Error running batch analysis:', error);
    res.status(500).json({ error: 'Fehler bei der Batch-Analyse' });
  }
});

/**
 * GET /api/incubator/stats
 * Get incubator statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const context = getContextFromRequest(req);

    const stats = await getIncubatorStats(userId, context);

    res.json({
      ...stats,
      context,
    });
  } catch (error) {
    console.error('Error fetching incubator stats:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Statistiken' });
  }
});

/**
 * GET /api/incubator/learning
 * Get learning status and insights
 */
router.get('/learning', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';

    const [profile, recommendations, insights] = await Promise.all([
      getUserProfile(userId),
      getRecommendations(userId),
      runDailyLearning(userId),
    ]);

    // Calculate learning progress
    const totalInteractions = Object.values(profile.preferred_categories || {}).reduce((a, b) => a + (b as number), 0);
    const learningProgress = Math.min(totalInteractions / 100, 1); // Max at 100 interactions

    res.json({
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
  } catch (error) {
    console.error('Error fetching learning status:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Lernstatus' });
  }
});

/**
 * GET /api/incubator/context
 * Get personalized context for LLM prompts
 */
router.get('/context', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';

    const context = await getPersonalizedPromptContext(userId);

    res.json({
      context,
      hasContext: context.length > 0,
    });
  } catch (error) {
    console.error('Error fetching personalized context:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Kontexts' });
  }
});

export default router;
