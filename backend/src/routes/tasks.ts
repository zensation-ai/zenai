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
import { queryContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID, validateContextParam } from '../utils/validation';
import { validateBody } from '../utils/schemas';
import { CreateTaskSchema, UpdateTaskSchema } from '../utils/schemas';
import { requireUUID } from '../middleware/validate-params';
import { sendData, sendList, sendMessage, parsePagination } from '../utils/response';

export const tasksRouter = Router();

const VALID_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];

// ============================================================
// GET /api/:context/tasks/gantt  (before /:id to avoid conflict)
// ============================================================

tasksRouter.get('/:context/tasks/gantt', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const projectId = req.query.project_id as string | undefined;

  const tasks = await getTasksForGantt(context, projectId ? { project_id: projectId } : undefined);

  sendList(res, tasks);
}));

// ============================================================
// POST /api/:context/tasks/reorder
// ============================================================

tasksRouter.post('/:context/tasks/reorder', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
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

  sendMessage(res, `Reordered ${taskIds.length} tasks in column "${status}"`);
}));

// ============================================================
// POST /api/:context/tasks/from-idea/:ideaId
// ============================================================

tasksRouter.post('/:context/tasks/from-idea/:ideaId', apiKeyAuth, requireScope('write'), requireUUID('ideaId'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { ideaId } = req.params;

  const projectId = req.body.project_id as string | undefined;
  const task = await convertIdeaToTask(context, ideaId, projectId);

  sendData(res, task, 201);
}));

// ============================================================
// GET /api/:context/tasks
// ============================================================

tasksRouter.get('/:context/tasks', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { limit, offset } = parsePagination(req, { defaultLimit: 200, maxLimit: 500 });

  const filters = {
    project_id: req.query.project_id as string | undefined,
    status: req.query.status as TaskStatus | undefined,
    priority: req.query.priority as string | undefined,
    due_before: req.query.due_before as string | undefined,
    due_after: req.query.due_after as string | undefined,
    limit,
    offset,
  };

  const tasks = await getTasks(context, filters as Parameters<typeof getTasks>[1]);

  sendList(res, tasks);
}));

// ============================================================
// GET /api/:context/tasks/:id
// ============================================================

tasksRouter.get('/:context/tasks/:id', apiKeyAuth, requireUUID('id'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const task = await getTask(context, req.params.id);
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  sendData(res, task);
}));

// ============================================================
// POST /api/:context/tasks
// ============================================================

tasksRouter.post('/:context/tasks', apiKeyAuth, requireScope('write'), validateBody(CreateTaskSchema), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { title, description, status, priority, project_id, source_idea_id,
    calendar_event_id, due_date, start_date, assignee, estimated_hours,
    labels, metadata } = req.body;

  const task = await createTask(context, {
    title, description, status, priority, project_id, source_idea_id,
    calendar_event_id, due_date, start_date, assignee, estimated_hours,
    labels, metadata,
  });

  sendData(res, task, 201);
}));

// ============================================================
// PUT /api/:context/tasks/:id
// ============================================================

tasksRouter.put('/:context/tasks/:id', apiKeyAuth, requireScope('write'), requireUUID('id'), validateBody(UpdateTaskSchema), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const task = await updateTask(context, req.params.id, req.body);
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  sendData(res, task);
}));

// ============================================================
// DELETE /api/:context/tasks/:id
// ============================================================

tasksRouter.delete('/:context/tasks/:id', apiKeyAuth, requireScope('write'), requireUUID('id'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const deleted = await deleteTask(context, req.params.id);
  if (!deleted) {
    throw new NotFoundError('Task not found or already cancelled');
  }

  sendMessage(res, 'Task cancelled');
}));

// ============================================================
// PUT /api/:context/tasks/:id/favorite
// ============================================================

tasksRouter.put('/:context/tasks/:id/favorite', apiKeyAuth, requireScope('write'), requireUUID('id'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const result = await queryContext(
    context,
    'UPDATE tasks SET is_favorite = NOT COALESCE(is_favorite, false), updated_at = NOW() WHERE id = $1 AND status != $2 RETURNING id, is_favorite',
    [req.params.id, 'cancelled']
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Task not found');
  }

  sendMessage(res, 'Favorite toggled', {
    id: result.rows[0].id,
    isFavorite: result.rows[0].is_favorite,
  });
}));

// ============================================================
// Dependencies
// ============================================================

tasksRouter.get('/:context/tasks/:id/dependencies', apiKeyAuth, requireUUID('id'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const deps = await getTaskDependencies(context, req.params.id);

  sendData(res, deps);
}));

tasksRouter.post('/:context/tasks/:id/dependencies', apiKeyAuth, requireScope('write'), requireUUID('id'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;
  const { depends_on_id, dependency_type } = req.body;

  if (!depends_on_id || !isValidUUID(depends_on_id)) {
    throw new ValidationError('depends_on_id is required and must be a valid UUID');
  }
  if (id === depends_on_id) {
    throw new ValidationError('A task cannot depend on itself');
  }

  const dep = await addDependency(context, id, depends_on_id, dependency_type);

  sendData(res, dep, 201);
}));

tasksRouter.delete('/:context/tasks/:id/dependencies/:depId', apiKeyAuth, requireScope('write'), requireUUID('id', 'depId'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const deleted = await removeDependency(context, req.params.depId);
  if (!deleted) {
    throw new NotFoundError('Dependency not found');
  }

  sendMessage(res, 'Dependency removed');
}));
