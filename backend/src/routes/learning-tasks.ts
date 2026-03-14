/**
 * Learning Tasks Routes
 *
 * API endpoints for managing daily learning tasks - topics assigned to the AI
 * for study and knowledge deepening.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidUUID, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';

// Input validation helpers
const MAX_TOPIC_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_NOTES_LENGTH = 10000;

function validateTaskId(id: string): void {
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid task ID format. Must be a valid UUID.');
  }
}

function sanitizeString(input: string | undefined, maxLength: number): string | undefined {
  if (!input) {return undefined;}
  return input.trim().slice(0, maxLength);
}
import { generateChallenge, evaluateRecall, getReviewSchedule } from '../services/active-recall';
import {
  createLearningTask,
  getLearningTasks,
  getLearningTask,
  updateLearningTask,
  deleteLearningTask,
  logStudySession,
  getStudySessions,
  getLearningStats,
  getLearningInsights,
  acknowledgeInsight,
  getDailyLearningSummary,
  generateLearningOutline,
  updateTaskProgress,
  LEARNING_CATEGORIES,
} from '../services/learning-tasks';

const router = Router();

/**
 * GET /api/:context/learning-tasks
 * Get all learning tasks for a context
 */
router.get('/:context/learning-tasks', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  getUserId(req); // auth check
  const { status, category, limit, offset } = req.query;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  // Validate and parse pagination parameters
  let parsedLimit: number | undefined;
  let parsedOffset: number | undefined;

  if (limit) {
    parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new ValidationError('Invalid limit. Must be between 1 and 100.');
    }
  }

  if (offset) {
    parsedOffset = parseInt(offset as string, 10);
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      throw new ValidationError('Invalid offset. Must be 0 or greater.');
    }
  }

  const result = await getLearningTasks(
    {
      status: status as string,
      category: category as string,
      limit: parsedLimit,
      offset: parsedOffset,
    },
    'default',
    context as AIContext
  );

  res.json({
    success: true,
    tasks: result.tasks,
    total: result.total,
    context,
  });
}));

/**
 * POST /api/:context/learning-tasks
 * Create a new learning task
 */
router.post('/:context/learning-tasks', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  getUserId(req); // auth check
  const { topic, description, category, priority, target_completion_date, generate_outline } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  if (!topic || topic.trim().length === 0) {
    throw new ValidationError('Topic is required');
  }

  if (topic.length > MAX_TOPIC_LENGTH) {
    throw new ValidationError(`Topic too long. Maximum ${MAX_TOPIC_LENGTH} characters.`);
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Description too long. Maximum ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  if (category && !LEARNING_CATEGORIES.includes(category)) {
    throw new ValidationError(`Invalid category. Valid options: ${LEARNING_CATEGORIES.join(', ')}`);
  }

  if (priority && !['low', 'medium', 'high'].includes(priority)) {
    throw new ValidationError('Invalid priority. Valid options: low, medium, high');
  }

  const sanitizedTopic = sanitizeString(topic, MAX_TOPIC_LENGTH);
  if (!sanitizedTopic) {
    throw new ValidationError('Topic is required and cannot be empty');
  }
  const task = await createLearningTask(
    sanitizedTopic,
    {
      description: sanitizeString(description, MAX_DESCRIPTION_LENGTH),
      category,
      priority,
      target_completion_date: target_completion_date ? new Date(target_completion_date) : undefined,
      generate_outline: generate_outline === true,
    },
    'default',
    context as AIContext
  );

  logger.info('Learning task created', { taskId: task.id, topic, context: context as AIContext });

  res.status(201).json({
    success: true,
    task,
    message: 'Lernaufgabe erstellt',
  });
}));

/**
 * GET /api/:context/learning-tasks/:id
 * Get a specific learning task
 */
router.get('/:context/learning-tasks/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  validateTaskId(id);

  const task = await getLearningTask(id, context as AIContext);

  if (!task) {
    throw new NotFoundError('Learning task');
  }

  // Also get sessions for this task
  const sessions = await getStudySessions(id, 10, context as AIContext);

  res.json({
    success: true,
    task,
    sessions,
  });
}));

/**
 * PUT /api/:context/learning-tasks/:id
 * Update a learning task
 */
router.put('/:context/learning-tasks/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check
  const { topic, description, category, priority, status, target_completion_date, learning_outline, summary } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  validateTaskId(id);

  if (category && !LEARNING_CATEGORIES.includes(category)) {
    throw new ValidationError(`Invalid category. Valid options: ${LEARNING_CATEGORIES.join(', ')}`);
  }

  if (priority && !['low', 'medium', 'high'].includes(priority)) {
    throw new ValidationError('Invalid priority. Valid options: low, medium, high');
  }

  if (status && !['active', 'paused', 'completed', 'archived'].includes(status)) {
    throw new ValidationError('Invalid status. Valid options: active, paused, completed, archived');
  }

  const updates: Record<string, unknown> = {};
  if (topic !== undefined) {updates.topic = sanitizeString(topic, MAX_TOPIC_LENGTH);}
  if (description !== undefined) {updates.description = sanitizeString(description, MAX_DESCRIPTION_LENGTH);}
  if (category !== undefined) {updates.category = category;}
  if (priority !== undefined) {updates.priority = priority;}
  if (status !== undefined) {updates.status = status;}
  if (target_completion_date !== undefined) {
    updates.target_completion_date = target_completion_date ? new Date(target_completion_date) : null;
  }
  if (learning_outline !== undefined) {updates.learning_outline = learning_outline;}
  if (summary !== undefined) {updates.summary = summary;}

  const task = await updateLearningTask(id, updates, context as AIContext);

  if (!task) {
    throw new NotFoundError('Learning task');
  }

  logger.info('Learning task updated', { taskId: id, updates: Object.keys(updates) });

  res.json({
    success: true,
    task,
    message: 'Lernaufgabe aktualisiert',
  });
}));

/**
 * DELETE /api/:context/learning-tasks/:id
 * Archive a learning task
 */
router.delete('/:context/learning-tasks/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  validateTaskId(id);

  const deleted = await deleteLearningTask(id, context as AIContext);

  if (!deleted) {
    throw new NotFoundError('Learning task');
  }

  res.json({
    success: true,
    message: 'Lernaufgabe archiviert',
  });
}));

/**
 * POST /api/:context/learning-tasks/:id/session
 * Log a study session for a task
 */
router.post('/:context/learning-tasks/:id/session', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check
  const { session_type, duration_minutes, notes, key_learnings, questions, understanding_level } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  validateTaskId(id);

  // Validate session_type if provided
  if (session_type && !['study', 'practice', 'review', 'quiz', 'reflection'].includes(session_type)) {
    throw new ValidationError('Invalid session_type. Valid options: study, practice, review, quiz, reflection');
  }

  // Validate duration_minutes if provided
  if (duration_minutes !== undefined) {
    const duration = typeof duration_minutes === 'string' ? parseInt(duration_minutes, 10) : duration_minutes;
    if (isNaN(duration) || duration < 0 || duration > 1440) {
      throw new ValidationError('Invalid duration_minutes. Must be between 0 and 1440 (24 hours).');
    }
  }

  // Validate understanding_level if provided
  if (understanding_level !== undefined) {
    const level = typeof understanding_level === 'string' ? parseInt(understanding_level, 10) : understanding_level;
    if (isNaN(level) || level < 1 || level > 5) {
      throw new ValidationError('Invalid understanding_level. Must be between 1 and 5.');
    }
  }

  // Verify task exists
  const task = await getLearningTask(id, context as AIContext);
  if (!task) {
    throw new NotFoundError('Learning task');
  }

  const session = await logStudySession(
    id,
    {
      session_type,
      duration_minutes: typeof duration_minutes === 'string' ? parseInt(duration_minutes, 10) : duration_minutes,
      notes: sanitizeString(notes, MAX_NOTES_LENGTH),
      key_learnings: Array.isArray(key_learnings) ? key_learnings.slice(0, 20) : undefined,
      questions: Array.isArray(questions) ? questions.slice(0, 20) : undefined,
      understanding_level: typeof understanding_level === 'string' ? parseInt(understanding_level, 10) : understanding_level,
    },
    'default',
    context as AIContext
  );

  // Update task progress after session
  const newProgress = await updateTaskProgress(id, context as AIContext);

  logger.info('Study session logged', { taskId: id, sessionId: session.id, duration: duration_minutes });

  res.status(201).json({
    success: true,
    session,
    progress: newProgress,
    message: 'Lernsitzung protokolliert',
  });
}));

/**
 * GET /api/:context/learning-tasks/:id/sessions
 * Get study sessions for a task
 */
router.get('/:context/learning-tasks/:id/sessions', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check
  const { limit } = req.query;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  validateTaskId(id);

  // Validate and parse limit
  let parsedLimit = 20;
  if (limit) {
    parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new ValidationError('Invalid limit. Must be between 1 and 100.');
    }
  }

  const sessions = await getStudySessions(
    id,
    parsedLimit,
    context as AIContext
  );

  res.json({
    success: true,
    sessions,
  });
}));

/**
 * POST /api/:context/learning-tasks/:id/generate-outline
 * Generate a learning outline for a task
 */
router.post('/:context/learning-tasks/:id/generate-outline', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  validateTaskId(id);

  const task = await getLearningTask(id, context as AIContext);
  if (!task) {
    throw new NotFoundError('Learning task');
  }

  const outline = await generateLearningOutline(task.topic, task.description);

  // Save the outline to the task
  await updateLearningTask(id, { learning_outline: outline }, context as AIContext);

  logger.info('Learning outline generated', { taskId: id });

  res.json({
    success: true,
    outline,
    message: 'Lernplan generiert',
  });
}));

/**
 * GET /api/:context/learning-tasks/stats
 * Get learning statistics
 */
router.get('/:context/learning-stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  getUserId(req); // auth check

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const stats = await getLearningStats('default', context as AIContext);

  res.json({
    success: true,
    stats,
    context,
  });
}));

/**
 * GET /api/:context/learning-tasks/daily-summary
 * Get daily learning summary
 */
router.get('/:context/learning-daily-summary', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  getUserId(req); // auth check

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const summary = await getDailyLearningSummary('default', context as AIContext);

  res.json({
    success: true,
    summary,
    context,
  });
}));

/**
 * GET /api/:context/learning-tasks/insights
 * Get unacknowledged learning insights
 */
router.get('/:context/learning-insights', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  getUserId(req); // auth check

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const insights = await getLearningInsights('default', context as AIContext);

  res.json({
    success: true,
    insights,
  });
}));

/**
 * POST /api/:context/learning-tasks/insights/:insightId/acknowledge
 * Acknowledge a learning insight
 */
router.post('/:context/learning-insights/:insightId/acknowledge', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, insightId } = req.params;
  getUserId(req); // auth check

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  if (!isValidUUID(insightId)) {
    throw new ValidationError('Invalid insight ID format. Must be a valid UUID.');
  }

  const acknowledged = await acknowledgeInsight(insightId, context as AIContext);

  if (!acknowledged) {
    throw new NotFoundError('Learning insight');
  }

  res.json({
    success: true,
    message: 'Insight bestätigt',
  });
}));

/**
 * GET /api/:context/learning-tasks/categories
 * Get available learning categories
 */
router.get('/:context/learning-categories', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  res.json({
    success: true,
    categories: LEARNING_CATEGORIES,
  });
}));

// ===========================================
// Active Recall Endpoints
// ===========================================

/**
 * GET /api/:context/learning-tasks/:id/challenge
 * Generate a recall challenge (shows title + tags, hides content)
 */
router.get('/:context/learning-tasks/:id/challenge', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check
  validateTaskId(id);

  const challenge = await generateChallenge(id, context as AIContext);
  if (!challenge) {
    throw new NotFoundError('Task');
  }

  res.json({ success: true, challenge });
}));

/**
 * POST /api/:context/learning-tasks/:id/recall
 * Submit a recall attempt and get evaluation + next review schedule
 */
router.post('/:context/learning-tasks/:id/recall', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;
  getUserId(req); // auth check
  const { user_recall } = req.body;
  validateTaskId(id);

  if (!user_recall || typeof user_recall !== 'string' || user_recall.trim().length === 0) {
    throw new ValidationError('user_recall is required and must be a non-empty string.');
  }

  const sanitizedRecall = user_recall.trim().slice(0, 2000);

  const result = await evaluateRecall(id, context as AIContext, sanitizedRecall);
  if (!result) {
    throw new NotFoundError('Task');
  }

  res.json({ success: true, ...result });
}));

/**
 * GET /api/:context/learning-tasks/review-schedule
 * Get tasks due for active recall review
 */
router.get('/:context/learning-tasks/review-schedule', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  getUserId(req); // auth check
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);

  const schedule = await getReviewSchedule(context as AIContext, limit);

  res.json({
    success: true,
    dueForReview: schedule,
    count: schedule.length,
  });
}));

export const learningTasksRouter = router;
export default router;
