/**
 * Task Routes - Phase 37
 *
 * Context-aware task API: /api/:context/tasks/*
 * Supports Kanban reorder, dependencies, Gantt data, and idea conversion.
 */

import { Router } from 'express';
import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  reorderTasks,
  getTasksForGantt,
  addDependency,
  removeDependency,
  getTaskDependencies,
  convertIdeaToTask,
  TaskStatus,
} from '../services/tasks';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID } from '../utils/validation';

export const tasksRouter = Router();

const VALID_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];

function getContextFromParams(context: string): AIContext {
  if (!isValidContext(context)) {
    throw new ValidationError(
      'Invalid context. Use "personal", "work", "learning", or "creative".',
      { context: 'must be "personal", "work", "learning", or "creative"' }
    );
  }
  return context as AIContext;
}

// ============================================================
// GET /api/:context/tasks/gantt  (before /:id to avoid conflict)
// ============================================================

tasksRouter.get('/:context/tasks/gantt', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const projectId = req.query.project_id as string | undefined;

  const tasks = await getTasksForGantt(context, projectId ? { project_id: projectId } : undefined);

  res.json({
    success: true,
    data: tasks,
    count: tasks.length,
  });
}));

// ============================================================
// POST /api/:context/tasks/reorder
// ============================================================

tasksRouter.post('/:context/tasks/reorder', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { status, taskIds } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    throw new ValidationError('Valid status is required', { status: `must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    throw new ValidationError('taskIds must be a non-empty array');
  }

  for (const tid of taskIds) {
    if (!isValidUUID(tid)) {
      throw new ValidationError('All taskIds must be valid UUIDs');
    }
  }

  await reorderTasks(context, status, taskIds);

  res.json({
    success: true,
    message: `Reordered ${taskIds.length} tasks in column "${status}"`,
  });
}));

// ============================================================
// POST /api/:context/tasks/from-idea/:ideaId
// ============================================================

tasksRouter.post('/:context/tasks/from-idea/:ideaId', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { ideaId } = req.params;

  if (!isValidUUID(ideaId)) {
    throw new ValidationError('Invalid idea ID', { ideaId: 'must be a valid UUID' });
  }

  const projectId = req.body.project_id as string | undefined;
  const task = await convertIdeaToTask(context, ideaId, projectId);

  res.status(201).json({
    success: true,
    data: task,
  });
}));

// ============================================================
// GET /api/:context/tasks
// ============================================================

tasksRouter.get('/:context/tasks', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);

  const filters = {
    project_id: req.query.project_id as string | undefined,
    status: req.query.status as TaskStatus | undefined,
    priority: req.query.priority as string | undefined,
    due_before: req.query.due_before as string | undefined,
    due_after: req.query.due_after as string | undefined,
    limit: Math.min(parseInt(req.query.limit as string, 10) || 200, 500),
    offset: parseInt(req.query.offset as string, 10) || 0,
  };

  const tasks = await getTasks(context, filters as Parameters<typeof getTasks>[1]);

  res.json({
    success: true,
    data: tasks,
    count: tasks.length,
  });
}));

// ============================================================
// GET /api/:context/tasks/:id
// ============================================================

tasksRouter.get('/:context/tasks/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid task ID', { id: 'must be a valid UUID' });
  }

  const task = await getTask(context, id);
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  res.json({
    success: true,
    data: task,
  });
}));

// ============================================================
// POST /api/:context/tasks
// ============================================================

tasksRouter.post('/:context/tasks', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { title, description, status, priority, project_id, source_idea_id,
    calendar_event_id, due_date, start_date, assignee, estimated_hours,
    labels, metadata } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new ValidationError('Title is required', { title: 'must be a non-empty string' });
  }

  const task = await createTask(context, {
    title: title.trim(),
    description, status, priority, project_id, source_idea_id,
    calendar_event_id, due_date, start_date, assignee, estimated_hours,
    labels, metadata,
  });

  res.status(201).json({
    success: true,
    data: task,
  });
}));

// ============================================================
// PUT /api/:context/tasks/:id
// ============================================================

tasksRouter.put('/:context/tasks/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid task ID', { id: 'must be a valid UUID' });
  }

  const task = await updateTask(context, id, req.body);
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  res.json({
    success: true,
    data: task,
  });
}));

// ============================================================
// DELETE /api/:context/tasks/:id
// ============================================================

tasksRouter.delete('/:context/tasks/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid task ID', { id: 'must be a valid UUID' });
  }

  const deleted = await deleteTask(context, id);
  if (!deleted) {
    throw new NotFoundError('Task not found or already cancelled');
  }

  res.json({
    success: true,
    message: 'Task cancelled',
  });
}));

// ============================================================
// Dependencies
// ============================================================

tasksRouter.get('/:context/tasks/:id/dependencies', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid task ID', { id: 'must be a valid UUID' });
  }

  const deps = await getTaskDependencies(context, id);

  res.json({
    success: true,
    data: deps,
  });
}));

tasksRouter.post('/:context/tasks/:id/dependencies', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;
  const { depends_on_id, dependency_type } = req.body;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid task ID', { id: 'must be a valid UUID' });
  }
  if (!depends_on_id || !isValidUUID(depends_on_id)) {
    throw new ValidationError('depends_on_id is required and must be a valid UUID');
  }
  if (id === depends_on_id) {
    throw new ValidationError('A task cannot depend on itself');
  }

  const dep = await addDependency(context, id, depends_on_id, dependency_type);

  res.status(201).json({
    success: true,
    data: dep,
  });
}));

tasksRouter.delete('/:context/tasks/:id/dependencies/:depId', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { depId } = req.params;

  if (!isValidUUID(depId)) {
    throw new ValidationError('Invalid dependency ID', { depId: 'must be a valid UUID' });
  }

  const deleted = await removeDependency(context, depId);
  if (!deleted) {
    throw new NotFoundError('Dependency not found');
  }

  res.json({
    success: true,
    message: 'Dependency removed',
  });
}));
