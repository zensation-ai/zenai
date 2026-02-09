/**
 * Intelligent Learning Routes
 *
 * API endpoints for the AI learning system:
 * - Domain Focus management
 * - AI Feedback collection
 * - Proactive Research
 * - Daily Learning & Suggestions
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidUUID, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';

// Domain Focus
import {
  createDomainFocus,
  updateDomainFocus,
  getDomainFocus,
  getAllDomainFocus,
  toggleDomainFocus,
  deleteDomainFocus,
  getActiveFocusContext,
  getDomainFocusStats,
  createPresetFocusAreas,
} from '../services/domain-focus';

// AI Feedback
import {
  submitFeedback,
  getFeedback,
  getFeedbackStats,
  analyzeFeedbackPatterns,
  quickThumbsUp,
  quickThumbsDown,
  submitCorrection,
} from '../services/ai-feedback';

// Proactive Intelligence
import {
  processIdeaForResearch,
  getPendingResearch,
  getResearchById,
  dismissResearch,
  markResearchViewed,
  triggerManualResearch,
} from '../services/proactive-intelligence';

// Daily Learning
import {
  runDailyLearning,
  getDailyLearningLogs,
  getActiveSuggestions,
  respondToSuggestion,
  getSuggestionStats,
} from '../services/daily-learning';

// Business Profile Learning
import {
  getOrCreateProfile,
  updateProfile,
  getProfileStats,
  getPersonalizedContext,
  runComprehensiveProfileAnalysis,
} from '../services/business-profile-learning';

const router = Router();

// Input validation
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_FEEDBACK_LENGTH = 5000;

function validateContext(context: string): AIContext {
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }
  return context as AIContext;
}

function validateId(id: string, name: string = 'ID'): void {
  if (!isValidUUID(id)) {
    throw new ValidationError(`Invalid ${name} format. Must be a valid UUID.`);
  }
}

// ===========================================
// Domain Focus Routes
// ===========================================

/**
 * GET /api/:context/focus
 * Get all domain focus areas
 */
router.get('/:context/focus', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { activeOnly } = req.query;

  const focusAreas = await getAllDomainFocus(context, activeOnly === 'true');

  res.json({
    success: true,
    focus_areas: focusAreas,
    context,
  });
}));

/**
 * POST /api/:context/focus
 * Create a new domain focus
 */
router.post('/:context/focus', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { name, description, keywords, learning_goals, document_sources, api_connections, priority } = req.body;

  if (!name || name.trim().length === 0) {
    throw new ValidationError('Name is required');
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Name too long. Maximum ${MAX_NAME_LENGTH} characters.`);
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Description too long. Maximum ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  if (priority !== undefined && (priority < 1 || priority > 10)) {
    throw new ValidationError('Priority must be between 1 and 10.');
  }

  const focus = await createDomainFocus({
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    description: description?.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    keywords: Array.isArray(keywords) ? keywords.slice(0, 20) : undefined,
    learning_goals: Array.isArray(learning_goals) ? learning_goals.slice(0, 10) : undefined,
    document_sources,
    api_connections,
    priority,
  }, context);

  logger.info('Domain focus created', { focusId: focus.id, name, context });

  res.status(201).json({
    success: true,
    focus,
    message: 'Fokus-Thema erstellt',
  });
}));

/**
 * GET /api/:context/focus/:id
 * Get a specific domain focus
 */
router.get('/:context/focus/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  validateId(id, 'Focus ID');

  const focus = await getDomainFocus(id, context);

  if (!focus) {
    throw new NotFoundError('Domain focus');
  }

  res.json({
    success: true,
    focus,
  });
}));

/**
 * PUT /api/:context/focus/:id
 * Update a domain focus
 */
router.put('/:context/focus/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  validateId(id, 'Focus ID');

  const { name, description, keywords, learning_goals, document_sources, api_connections, priority } = req.body;

  const focus = await updateDomainFocus(id, {
    name: name?.trim().slice(0, MAX_NAME_LENGTH),
    description: description?.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    keywords: Array.isArray(keywords) ? keywords.slice(0, 20) : undefined,
    learning_goals: Array.isArray(learning_goals) ? learning_goals.slice(0, 10) : undefined,
    document_sources,
    api_connections,
    priority,
  }, context);

  if (!focus) {
    throw new NotFoundError('Domain focus');
  }

  logger.info('Domain focus updated', { focusId: id, context });

  res.json({
    success: true,
    focus,
    message: 'Fokus-Thema aktualisiert',
  });
}));

/**
 * PUT /api/:context/focus/:id/toggle
 * Activate/deactivate a domain focus
 */
router.put('/:context/focus/:id/toggle', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  const { is_active } = req.body;
  validateId(id, 'Focus ID');

  if (typeof is_active !== 'boolean') {
    throw new ValidationError('is_active must be a boolean');
  }

  const success = await toggleDomainFocus(id, is_active, context);

  if (!success) {
    throw new NotFoundError('Domain focus');
  }

  res.json({
    success: true,
    message: is_active ? 'Fokus-Thema aktiviert' : 'Fokus-Thema deaktiviert',
  });
}));

/**
 * DELETE /api/:context/focus/:id
 * Delete a domain focus
 */
router.delete('/:context/focus/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  validateId(id, 'Focus ID');

  const success = await deleteDomainFocus(id, context);

  if (!success) {
    throw new NotFoundError('Domain focus');
  }

  res.json({
    success: true,
    message: 'Fokus-Thema gelöscht',
  });
}));

/**
 * GET /api/:context/focus/stats
 * Get domain focus statistics
 */
router.get('/:context/focus-stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const stats = await getDomainFocusStats(context);

  res.json({
    success: true,
    stats,
    context,
  });
}));

/**
 * GET /api/:context/focus/context-prompt
 * Get the active focus context for LLM prompts
 */
router.get('/:context/focus-context', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const focusContext = await getActiveFocusContext(context);

  res.json({
    success: true,
    focus_context: focusContext,
    context,
  });
}));

/**
 * POST /api/:context/focus/presets
 * Create preset focus areas
 */
router.post('/:context/focus/presets', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  await createPresetFocusAreas(context);

  res.json({
    success: true,
    message: 'Preset-Fokus-Themen erstellt',
  });
}));

// ===========================================
// AI Feedback Routes
// ===========================================

/**
 * POST /api/:context/feedback
 * Submit feedback for an AI response
 */
router.post('/:context/feedback', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { response_type, original_response, rating, correction, feedback_text } = req.body;

  if (!response_type || response_type.trim().length === 0) {
    throw new ValidationError('response_type is required');
  }

  if (!original_response || original_response.trim().length === 0) {
    throw new ValidationError('original_response is required');
  }

  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    throw new ValidationError('rating must be a number between 1 and 5');
  }

  const feedback = await submitFeedback({
    responseType: response_type,
    originalResponse: original_response.slice(0, MAX_FEEDBACK_LENGTH),
    rating,
    correction: correction?.slice(0, MAX_FEEDBACK_LENGTH),
    feedbackText: feedback_text?.slice(0, MAX_FEEDBACK_LENGTH),
  }, context);

  logger.info('AI feedback submitted', { feedbackId: feedback.id, rating, context });

  res.status(201).json({
    success: true,
    feedback,
    message: 'Feedback gespeichert',
  });
}));

/**
 * POST /api/:context/feedback/thumbs-up
 * Quick positive feedback
 */
router.post('/:context/feedback/thumbs-up', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { response_type, original_response } = req.body;

  if (!response_type || !original_response) {
    throw new ValidationError('response_type and original_response are required');
  }

  const feedback = await quickThumbsUp(response_type, original_response, context);

  res.status(201).json({
    success: true,
    feedback,
    message: 'Danke für das positive Feedback!',
  });
}));

/**
 * POST /api/:context/feedback/thumbs-down
 * Quick negative feedback
 */
router.post('/:context/feedback/thumbs-down', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { response_type, original_response, feedback_text } = req.body;

  if (!response_type || !original_response) {
    throw new ValidationError('response_type and original_response are required');
  }

  const feedback = await quickThumbsDown(response_type, original_response, feedback_text || '', context);

  res.status(201).json({
    success: true,
    feedback,
    message: 'Feedback gespeichert. Wir arbeiten daran!',
  });
}));

/**
 * POST /api/:context/feedback/correction
 * Submit a correction
 */
router.post('/:context/feedback/correction', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { response_type, original_response, correction } = req.body;

  if (!response_type || !original_response || !correction) {
    throw new ValidationError('response_type, original_response, and correction are required');
  }

  const feedback = await submitCorrection(
    response_type,
    original_response.slice(0, MAX_FEEDBACK_LENGTH),
    correction.slice(0, MAX_FEEDBACK_LENGTH),
    context
  );

  res.status(201).json({
    success: true,
    feedback,
    message: 'Korrektur gespeichert. Die KI lernt davon!',
  });
}));

/**
 * GET /api/:context/feedback
 * Get feedback entries
 */
router.get('/:context/feedback', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { response_type, min_rating, max_rating, only_corrections, limit, offset } = req.query;

  const feedbackList = await getFeedback(context, {
    responseType: response_type as string,
    minRating: min_rating ? parseInt(min_rating as string, 10) : undefined,
    maxRating: max_rating ? parseInt(max_rating as string, 10) : undefined,
    onlyWithCorrections: only_corrections === 'true',
    limit: limit ? parseInt(limit as string, 10) : 50,
    offset: offset ? parseInt(offset as string, 10) : 0,
  });

  res.json({
    success: true,
    feedback: feedbackList,
    context,
  });
}));

/**
 * GET /api/:context/feedback/stats
 * Get feedback statistics
 */
router.get('/:context/feedback-stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const stats = await getFeedbackStats(context);

  res.json({
    success: true,
    stats,
    context,
  });
}));

/**
 * GET /api/:context/feedback/insights
 * Analyze feedback for improvement insights
 */
router.get('/:context/feedback-insights', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const insights = await analyzeFeedbackPatterns(context);

  res.json({
    success: true,
    insights,
    context,
  });
}));

// ===========================================
// Proactive Research Routes
// ===========================================

/**
 * GET /api/:context/research
 * Get pending research items
 */
router.get('/:context/research', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { limit } = req.query;

  const research = await getPendingResearch(context, limit ? parseInt(limit as string, 10) : 10);

  res.json({
    success: true,
    research,
    context,
  });
}));

/**
 * GET /api/:context/research/:id
 * Get a specific research item
 */
router.get('/:context/research/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  validateId(id, 'Research ID');

  const research = await getResearchById(id, context);

  if (!research) {
    throw new NotFoundError('Research item');
  }

  res.json({
    success: true,
    research,
  });
}));

/**
 * PUT /api/:context/research/:id/viewed
 * Mark research as viewed
 */
router.put('/:context/research/:id/viewed', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  validateId(id, 'Research ID');

  const success = await markResearchViewed(id, context);

  if (!success) {
    throw new NotFoundError('Research item');
  }

  res.json({
    success: true,
    message: 'Als gelesen markiert',
  });
}));

/**
 * PUT /api/:context/research/:id/dismiss
 * Dismiss a research item
 */
router.put('/:context/research/:id/dismiss', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  validateId(id, 'Research ID');

  const success = await dismissResearch(id, context);

  if (!success) {
    throw new NotFoundError('Research item');
  }

  res.json({
    success: true,
    message: 'Recherche abgelehnt',
  });
}));

/**
 * POST /api/:context/research/trigger
 * Manually trigger research for a query
 */
router.post('/:context/research/trigger', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { query, sources } = req.body;

  if (!query || query.trim().length === 0) {
    throw new ValidationError('query is required');
  }

  const research = await triggerManualResearch(query, sources, context);

  if (!research) {
    throw new ValidationError('Could not execute research');
  }

  logger.info('Manual research triggered', { researchId: research.id, query, context });

  res.status(201).json({
    success: true,
    research,
    message: 'Recherche gestartet',
  });
}));

/**
 * POST /api/:context/research/process-idea
 * Process an idea for potential research needs
 */
router.post('/:context/research/process-idea', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { idea_id, text, idea_type } = req.body;

  if (!text || text.trim().length === 0) {
    throw new ValidationError('text is required');
  }

  const research = await processIdeaForResearch(
    idea_id || null,
    text,
    idea_type || 'task',
    context
  );

  res.json({
    success: true,
    research,
    message: research ? 'Recherche vorbereitet' : 'Keine Recherche erforderlich',
  });
}));

// ===========================================
// Daily Learning & Suggestions Routes
// ===========================================

/**
 * POST /api/:context/learning/run
 * Trigger daily learning job
 */
router.post('/:context/learning/run', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  logger.info('Manual daily learning triggered', { context });

  const result = await runDailyLearning(context);

  res.json({
    success: true,
    result,
    message: 'Tägliches Lernen abgeschlossen',
  });
}));

/**
 * GET /api/:context/learning/logs
 * Get daily learning logs
 */
router.get('/:context/learning/logs', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { limit } = req.query;

  const logs = await getDailyLearningLogs(context, limit ? parseInt(limit as string, 10) : 7);

  res.json({
    success: true,
    logs,
    context,
  });
}));

/**
 * GET /api/:context/suggestions
 * Get active AI suggestions
 */
router.get('/:context/suggestions', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { limit } = req.query;

  const suggestions = await getActiveSuggestions(context, limit ? parseInt(limit as string, 10) : 5);

  res.json({
    success: true,
    suggestions,
    context,
  });
}));

/**
 * PUT /api/:context/suggestions/:id/respond
 * Respond to a suggestion (accept or dismiss)
 */
router.put('/:context/suggestions/:id/respond', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { id } = req.params;
  const { response, feedback } = req.body;
  validateId(id, 'Suggestion ID');

  if (!response || !['accepted', 'dismissed'].includes(response)) {
    throw new ValidationError('response must be "accepted" or "dismissed"');
  }

  await respondToSuggestion(id, response, feedback || null, context);

  res.json({
    success: true,
    message: response === 'accepted' ? 'Vorschlag angenommen' : 'Vorschlag abgelehnt',
  });
}));

/**
 * GET /api/:context/suggestions/stats
 * Get suggestion statistics
 */
router.get('/:context/suggestion-stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const stats = await getSuggestionStats(context);

  res.json({
    success: true,
    stats,
    context,
  });
}));

// ===========================================
// Business Profile Routes
// ===========================================

/**
 * GET /api/:context/profile
 * Get the user's business profile
 */
router.get('/:context/profile', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const profile = await getOrCreateProfile(context);

  res.json({
    success: true,
    profile,
    context,
  });
}));

/**
 * PUT /api/:context/profile
 * Update the user's business profile
 */
router.put('/:context/profile', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const updates = req.body;

  // Sanitize input
  const allowedFields = [
    'company_name', 'industry', 'company_size', 'role',
    'main_products_services', 'target_customers', 'key_partners', 'tech_stack',
    'communication_style', 'decision_making_style', 'preferred_meeting_types',
    'pain_points', 'goals'
  ];

  const sanitizedUpdates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in updates) {
      sanitizedUpdates[field] = updates[field];
    }
  }

  const profile = await updateProfile(context, sanitizedUpdates);

  logger.info('Business profile updated', { context, fieldsUpdated: Object.keys(sanitizedUpdates) });

  res.json({
    success: true,
    profile,
    message: 'Profil aktualisiert',
  });
}));

/**
 * GET /api/:context/profile/stats
 * Get profile statistics
 */
router.get('/:context/profile-stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const stats = await getProfileStats(context);

  res.json({
    success: true,
    stats,
    context,
  });
}));

/**
 * GET /api/:context/profile/context
 * Get personalized context for LLM prompts
 */
router.get('/:context/profile-context', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  const personalizedContext = await getPersonalizedContext(context);

  res.json({
    success: true,
    personalized_context: personalizedContext,
    context,
  });
}));

/**
 * POST /api/:context/profile/analyze
 * Run comprehensive profile analysis
 */
router.post('/:context/profile/analyze', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);
  const { days_back } = req.body;

  logger.info('Profile analysis triggered', { context, daysBack: days_back });

  const result = await runComprehensiveProfileAnalysis(context, days_back || 30);

  res.json({
    success: true,
    result,
    message: 'Profil-Analyse abgeschlossen',
  });
}));

// ===========================================
// Combined Dashboard Data
// ===========================================

/**
 * GET /api/:context/learning/dashboard
 * Get all learning-related data for the dashboard
 */
router.get('/:context/learning/dashboard', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContext(req.params.context);

  // Fetch all data in parallel
  const [
    focusAreas,
    focusStats,
    feedbackStats,
    feedbackInsights,
    pendingResearch,
    suggestions,
    suggestionStats,
    learningLogs,
    profileStats,
  ] = await Promise.all([
    getAllDomainFocus(context, true),
    getDomainFocusStats(context),
    getFeedbackStats(context),
    analyzeFeedbackPatterns(context),
    getPendingResearch(context, 5),
    getActiveSuggestions(context, 5),
    getSuggestionStats(context),
    getDailyLearningLogs(context, 7),
    getProfileStats(context),
  ]);

  res.json({
    success: true,
    dashboard: {
      focus: {
        active_areas: focusAreas,
        stats: focusStats,
      },
      feedback: {
        stats: feedbackStats,
        insights: feedbackInsights,
      },
      research: {
        pending: pendingResearch,
      },
      suggestions: {
        active: suggestions,
        stats: suggestionStats,
      },
      learning: {
        recent_logs: learningLogs,
      },
      profile: {
        stats: profileStats,
      },
    },
    context,
  });
}));

export const intelligentLearningRouter = router;
export default router;
