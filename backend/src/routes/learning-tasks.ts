/**
 * Learning Tasks Routes
 *
 * API endpoints for managing daily learning tasks - topics assigned to the AI
 * for study and knowledge deepening.
 */

import { Router, Request, Response } from 'express';
import { AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
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
  const { status, category, limit, offset } = req.query;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const result = await getLearningTasks(
    {
      status: status as string,
      category: category as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
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
  const { topic, description, category, priority, target_completion_date, generate_outline } = req.body;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  if (!topic || topic.trim().length === 0) {
    throw new ValidationError('Topic is required');
  }

  if (category && !LEARNING_CATEGORIES.includes(category)) {
    throw new ValidationError(`Invalid category. Valid options: ${LEARNING_CATEGORIES.join(', ')}`);
  }

  const task = await createLearningTask(
    topic,
    {
      description,
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

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

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
  const { topic, description, category, priority, status, target_completion_date, learning_outline, summary } = req.body;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  if (category && !LEARNING_CATEGORIES.includes(category)) {
    throw new ValidationError(`Invalid category. Valid options: ${LEARNING_CATEGORIES.join(', ')}`);
  }

  const updates: Record<string, unknown> = {};
  if (topic !== undefined) updates.topic = topic;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;
  if (priority !== undefined) updates.priority = priority;
  if (status !== undefined) updates.status = status;
  if (target_completion_date !== undefined) {
    updates.target_completion_date = target_completion_date ? new Date(target_completion_date) : null;
  }
  if (learning_outline !== undefined) updates.learning_outline = learning_outline;
  if (summary !== undefined) updates.summary = summary;

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

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

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
  const { session_type, duration_minutes, notes, key_learnings, questions, understanding_level } = req.body;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
      duration_minutes,
      notes,
      key_learnings,
      questions,
      understanding_level,
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
  const { limit } = req.query;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const sessions = await getStudySessions(
    id,
    limit ? parseInt(limit as string) : 20,
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

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

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

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
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
  res.json({
    success: true,
    categories: LEARNING_CATEGORIES,
  });
}));

export const learningTasksRouter = router;
export default router;
