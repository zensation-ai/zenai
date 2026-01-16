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
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { isValidContext } from '../utils/database-context';

export const userProfileRouter = Router();
export const userProfileContextRouter = Router();

/**
 * GET /api/profile
 * Get user profile with learned preferences
 */
userProfileRouter.get('/', apiKeyAuth, asyncHandler(async (req, res) => {
  const profileId = (req.query.profile_id as string) || 'default';
  const profile = await getUserProfile(profileId);

  res.json({ profile });
}));

/**
 * POST /api/profile/track
 * Track a user interaction for learning
 */
userProfileRouter.post('/track', apiKeyAuth, asyncHandler(async (req, res) => {
  const { idea_id, meeting_id, interaction_type, metadata } = req.body;

  if (!interaction_type) {
    throw new ValidationError('interaction_type is required', { interaction_type: 'required' });
  }

  await trackInteraction({
    idea_id,
    meeting_id,
    interaction_type,
    metadata,
  });

  res.json({ success: true });
}));

/**
 * GET /api/profile/recommendations
 * Get personalized recommendations
 */
userProfileRouter.get('/recommendations', apiKeyAuth, asyncHandler(async (req, res) => {
  const profileId = (req.query.profile_id as string) || 'default';
  const recommendations = await getRecommendations(profileId);

  res.json({ recommendations });
}));

/**
 * GET /api/profile/personalized-ideas
 * Get ideas that match user interests
 */
userProfileRouter.get('/personalized-ideas', apiKeyAuth, asyncHandler(async (req, res) => {
  const profileId = (req.query.profile_id as string) || 'default';
  const limit = parseInt(req.query.limit as string) || 10;

  const ideas = await getPersonalizedIdeas(limit, profileId);

  res.json({ ideas, count: ideas.length });
}));

/**
 * POST /api/profile/recalculate
 * Recalculate profile statistics
 */
userProfileRouter.post('/recalculate', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const profileId = (req.query.profile_id as string) || 'default';

  await recalculateStats(profileId);
  await updateInterestEmbedding(profileId);

  const profile = await getUserProfile(profileId);

  res.json({ success: true, profile });
}));

/**
 * PUT /api/profile/auto-priority
 * Enable/disable auto-priority feature
 */
userProfileRouter.put('/auto-priority', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  const profileId = (req.query.profile_id as string) || 'default';

  if (typeof enabled !== 'boolean') {
    throw new ValidationError('enabled must be a boolean', { enabled: 'must be boolean' });
  }

  await setAutoPriority(enabled, profileId);

  res.json({ success: true, auto_priority_enabled: enabled });
}));

/**
 * POST /api/profile/suggest-priority
 * Get suggested priority for keywords
 */
userProfileRouter.post('/suggest-priority', apiKeyAuth, asyncHandler(async (req, res) => {
  const { keywords } = req.body;
  const profileId = (req.query.profile_id as string) || 'default';

  if (!keywords || !Array.isArray(keywords)) {
    throw new ValidationError('keywords array is required', { keywords: 'required' });
  }

  const suggestedPriority = await suggestPriority(keywords, profileId);

  res.json({ suggested_priority: suggestedPriority });
}));

/**
 * GET /api/profile/stats
 * Get profile statistics summary
 */
userProfileRouter.get('/stats', apiKeyAuth, asyncHandler(async (req, res) => {
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
}));

// ==================== Context-Aware Profile Routes ====================
// These routes support /api/:context/profile/... paths for proper context switching

/**
 * GET /api/:context/profile/stats
 * Get profile statistics for the specific context
 */
userProfileContextRouter.get('/:context/profile/stats', apiKeyAuth, asyncHandler(async (req, res) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const profileId = `${context}_default`;
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
}));

/**
 * GET /api/:context/profile/recommendations
 * Get personalized recommendations for the specific context
 */
userProfileContextRouter.get('/:context/profile/recommendations', apiKeyAuth, asyncHandler(async (req, res) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const profileId = `${context}_default`;
  const recommendations = await getRecommendations(profileId);

  res.json({ recommendations });
}));

/**
 * POST /api/:context/profile/recalculate
 * Recalculate profile statistics for the specific context
 */
userProfileContextRouter.post('/:context/profile/recalculate', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const profileId = `${context}_default`;

  await recalculateStats(profileId);
  await updateInterestEmbedding(profileId);

  const profile = await getUserProfile(profileId);

  res.json({ success: true, profile });
}));

/**
 * PUT /api/:context/profile/auto-priority
 * Enable/disable auto-priority feature for the specific context
 */
userProfileContextRouter.put('/:context/profile/auto-priority', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { context } = req.params;
  const { enabled } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  if (typeof enabled !== 'boolean') {
    throw new ValidationError('enabled must be a boolean', { enabled: 'must be boolean' });
  }

  const profileId = `${context}_default`;

  await setAutoPriority(enabled, profileId);

  res.json({ success: true, auto_priority_enabled: enabled });
}));
