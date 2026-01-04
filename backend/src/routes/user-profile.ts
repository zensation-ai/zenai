import { Router } from 'express';
import {
  getUserProfile,
  trackInteraction,
  getRecommendations,
  getPersonalizedIdeas,
  recalculateStats,
  setAutoPriority,
  updateInterestEmbedding,
  suggestPriority,
} from '../services/user-profile';

export const userProfileRouter = Router();

/**
 * GET /api/profile
 * Get user profile with learned preferences
 */
userProfileRouter.get('/', async (req, res) => {
  try {
    const profileId = (req.query.profile_id as string) || 'default';
    const profile = await getUserProfile(profileId);

    res.json({ profile });
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/profile/track
 * Track a user interaction for learning
 */
userProfileRouter.post('/track', async (req, res) => {
  try {
    const { idea_id, meeting_id, interaction_type, metadata } = req.body;

    if (!interaction_type) {
      return res.status(400).json({ error: 'interaction_type is required' });
    }

    await trackInteraction({
      idea_id,
      meeting_id,
      interaction_type,
      metadata,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Track interaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/profile/recommendations
 * Get personalized recommendations
 */
userProfileRouter.get('/recommendations', async (req, res) => {
  try {
    const profileId = (req.query.profile_id as string) || 'default';
    const recommendations = await getRecommendations(profileId);

    res.json({ recommendations });
  } catch (error: any) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/profile/personalized-ideas
 * Get ideas that match user interests
 */
userProfileRouter.get('/personalized-ideas', async (req, res) => {
  try {
    const profileId = (req.query.profile_id as string) || 'default';
    const limit = parseInt(req.query.limit as string) || 10;

    const ideas = await getPersonalizedIdeas(limit, profileId);

    res.json({ ideas, count: ideas.length });
  } catch (error: any) {
    console.error('Get personalized ideas error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/profile/recalculate
 * Recalculate profile statistics
 */
userProfileRouter.post('/recalculate', async (req, res) => {
  try {
    const profileId = (req.query.profile_id as string) || 'default';

    await recalculateStats(profileId);
    await updateInterestEmbedding(profileId);

    const profile = await getUserProfile(profileId);

    res.json({ success: true, profile });
  } catch (error: any) {
    console.error('Recalculate stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/profile/auto-priority
 * Enable/disable auto-priority feature
 */
userProfileRouter.put('/auto-priority', async (req, res) => {
  try {
    const { enabled } = req.body;
    const profileId = (req.query.profile_id as string) || 'default';

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    await setAutoPriority(enabled, profileId);

    res.json({ success: true, auto_priority_enabled: enabled });
  } catch (error: any) {
    console.error('Set auto-priority error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/profile/suggest-priority
 * Get suggested priority for keywords
 */
userProfileRouter.post('/suggest-priority', async (req, res) => {
  try {
    const { keywords } = req.body;
    const profileId = (req.query.profile_id as string) || 'default';

    if (!keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'keywords array is required' });
    }

    const suggestedPriority = await suggestPriority(keywords, profileId);

    res.json({ suggested_priority: suggestedPriority });
  } catch (error: any) {
    console.error('Suggest priority error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/profile/stats
 * Get profile statistics summary
 */
userProfileRouter.get('/stats', async (req, res) => {
  try {
    const profileId = (req.query.profile_id as string) || 'default';
    const profile = await getUserProfile(profileId);

    // Get top categories
    const topCategories = Object.entries(profile.preferred_categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Get top types
    const topTypes = Object.entries(profile.preferred_types)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Get top topics
    const topTopics = Object.entries(profile.topic_interests)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    res.json({
      total_ideas: profile.total_ideas,
      total_meetings: profile.total_meetings,
      avg_ideas_per_day: profile.avg_ideas_per_day,
      top_categories: topCategories,
      top_types: topTypes,
      top_topics: topTopics,
      auto_priority_enabled: profile.auto_priority_enabled,
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});
