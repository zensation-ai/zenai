/**
 * Tasks Service - Phase 37
 *
 * Context-aware task management with Kanban status, Gantt scheduling,
 * dependencies, and calendar/idea linking.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id?: string;
  source_idea_id?: string;
  calendar_event_id?: string;
  due_date?: string;
  start_date?: string;
  completed_at?: string;
  assignee?: string;
  estimated_hours?: number;
  actual_hours?: number;
  sort_order: number;
  context: string;
  labels: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  project_name?: string;
  project_color?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  project_id?: string;
  source_idea_id?: string;
  calendar_event_id?: string;
  due_date?: string;
  start_date?: string;
  assignee?: string;
  estimated_hours?: number;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskFilters {
  project_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_before?: string;
  due_after?: string;
  limit?: number;
  offset?: number;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  dependency_type: DependencyType;
  created_at: string;
  // Joined
  task_title?: string;
  depends_on_title?: string;
}

export interface GanttTask extends Task {
  dependencies: TaskDependency[];
}

// ============================================================
// Core CRUD
// ============================================================

export async function createTask(
  context: AIContext,
  input: CreateTaskInput
): Promise<Task> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const status = input.status || 'backlog';

  // Get max sort_order for the status column
  const maxResult = await queryContext(context, `
    SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
    FROM tasks WHERE status = $1
  `, [status]);
  const sortOrder = parseInt(maxResult.rows[0]?.next_order, 10) || 0;

  const result = await queryContext(context, `
    INSERT INTO tasks (
      id, title, description, status, priority,
      project_id, source_idea_id, calendar_event_id,
      due_date, start_date, assignee, estimated_hours,
      sort_order, context, labels, metadata,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $17
    )
    RETURNING *
  `, [
    id, input.title, input.description || null, status, input.priority || 'medium',
    input.project_id || null, input.source_idea_id || null, input.calendar_event_id || null,
    input.due_date || null, input.start_date || null, input.assignee || null, input.estimated_hours || null,
    sortOrder, context, JSON.stringify(input.labels || []), JSON.stringify(input.metadata || {}),
    now,
  ]);

  logger.info('Task created', { id, title: input.title, status, context, operation: 'createTask' });
  return mapRowToTask(result.rows[0]);
}

export async function getTasks(
  context: AIContext,
  filters?: TaskFilters
): Promise<Task[]> {
  const conditions: string[] = ["t.status != 'cancelled'"];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.project_id) {
    conditions.push(`t.project_id = $${paramIdx}`);
    params.push(filters.project_id);
    paramIdx++;
  }

  if (filters?.status) {
    conditions[0] = `t.status = $${paramIdx}`;
    params.push(filters.status);
    paramIdx++;
  }

  if (filters?.priority) {
    conditions.push(`t.priority = $${paramIdx}`);
    params.push(filters.priority);
    paramIdx++;
  }

  if (filters?.due_before) {
    conditions.push(`t.due_date <= $${paramIdx}`);
    params.push(filters.due_before);
    paramIdx++;
  }

  if (filters?.due_after) {
    conditions.push(`t.due_date >= $${paramIdx}`);
    params.push(filters.due_after);
    paramIdx++;
  }

  const limit = Math.min(filters?.limit || 200, 500);
  const offset = filters?.offset || 0;

  const result = await queryContext(context, `
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.sort_order ASC, t.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...params, limit, offset]);

  return result.rows.map(mapRowToTask);
}

export async function getTask(
  context: AIContext,
  id: string
): Promise<Task | null> {
  const result = await queryContext(context, `
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = $1
  `, [id]);

  return result.rows.length > 0 ? mapRowToTask(result.rows[0]) : null;
}

export async function updateTask(
  context: AIContext,
  id: string,
  updates: Partial<CreateTaskInput> & { actual_hours?: number; completed_at?: string }
): Promise<Task | null> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    status: 'status',
    priority: 'priority',
    project_id: 'project_id',
    source_idea_id: 'source_idea_id',
    calendar_event_id: 'calendar_event_id',
    due_date: 'due_date',
    start_date: 'start_date',
    assignee: 'assignee',
    estimated_hours: 'estimated_hours',
    actual_hours: 'actual_hours',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in updates) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push((updates as Record<string, unknown>)[key] as string | number | null);
      paramIdx++;
    }
  }

  // JSON fields
  if (updates.labels !== undefined) {
    setClauses.push(`labels = $${paramIdx}`);
    params.push(JSON.stringify(updates.labels));
    paramIdx++;
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx}`);
    params.push(JSON.stringify(updates.metadata));
    paramIdx++;
  }

  // Auto-set completed_at when status becomes 'done'
  if (updates.status === 'done') {
    setClauses.push(`completed_at = $${paramIdx}`);
    params.push(new Date().toISOString());
    paramIdx++;
  } else if (updates.status) {
    // Clear completed_at if moving away from done
    setClauses.push(`completed_at = NULL`);
  }

  if (setClauses.length === 0) {return null;}

  setClauses.push('updated_at = NOW()');

  const result = await queryContext(context, `
    UPDATE tasks
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIdx}
    RETURNING *
  `, [...params, id]);

  if (result.rows.length === 0) {return null;}

  logger.info('Task updated', { id, context, operation: 'updateTask' });
  return mapRowToTask(result.rows[0]);
}

export async function deleteTask(
  context: AIContext,
  id: string
): Promise<boolean> {
  const result = await queryContext(context, `
    UPDATE tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1 AND status != 'cancelled'
    RETURNING id
  `, [id]);

  if (result.rows.length > 0) {
    logger.info('Task cancelled', { id, context, operation: 'deleteTask' });
    return true;
  }
  return false;
}

// ============================================================
// Kanban Reorder
// ============================================================

export async function reorderTasks(
  context: AIContext,
  status: TaskStatus,
  taskIds: string[]
): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  // Batch update: single query using unnest instead of N individual updates
  await queryContext(context, `
    UPDATE tasks
    SET sort_order = batch.new_order,
        status = $1,
        updated_at = NOW()
    FROM (
      SELECT unnest($2::uuid[]) AS id,
             generate_series(0, $3::int) AS new_order
    ) AS batch
    WHERE tasks.id = batch.id
  `, [status, taskIds, taskIds.length - 1]);

  logger.info('Tasks reordered', {
    status, count: taskIds.length, context, operation: 'reorderTasks'
  });
}

// ============================================================
// Dependencies
// ============================================================

export async function addDependency(
  context: AIContext,
  taskId: string,
  dependsOnId: string,
  type: DependencyType = 'finish_to_start'
): Promise<TaskDependency> {
  const id = uuidv4();

  const result = await queryContext(context, `
    INSERT INTO task_dependencies (id, task_id, depends_on_id, dependency_type)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [id, taskId, dependsOnId, type]);

  logger.info('Task dependency added', {
    taskId, dependsOnId, type, context, operation: 'addDependency'
  });

  return mapRowToDependency(result.rows[0]);
}

export async function removeDependency(
  context: AIContext,
  dependencyId: string
): Promise<boolean> {
  const result = await queryContext(context, `
    DELETE FROM task_dependencies WHERE id = $1 RETURNING id
  `, [dependencyId]);

  return result.rows.length > 0;
}

export async function getTaskDependencies(
  context: AIContext,
  taskId: string
): Promise<{ incoming: TaskDependency[]; outgoing: TaskDependency[] }> {
  const [incomingResult, outgoingResult] = await Promise.all([
    queryContext(context, `
      SELECT d.*, t.title as depends_on_title
      FROM task_dependencies d
      JOIN tasks t ON d.depends_on_id = t.id
      WHERE d.task_id = $1
    `, [taskId]),
    queryContext(context, `
      SELECT d.*, t.title as task_title
      FROM task_dependencies d
      JOIN tasks t ON d.task_id = t.id
      WHERE d.depends_on_id = $1
    `, [taskId]),
  ]);

  return {
    incoming: incomingResult.rows.map(mapRowToDependency),
    outgoing: outgoingResult.rows.map(mapRowToDependency),
  };
}

// ============================================================
// Gantt Data
// ============================================================

export async function getTasksForGantt(
  context: AIContext,
  filters?: { project_id?: string }
): Promise<GanttTask[]> {
  const conditions: string[] = ["t.status != 'cancelled'"];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.project_id) {
    conditions.push(`t.project_id = $${paramIdx}`);
    params.push(filters.project_id);
    paramIdx++;
  }

  const tasksResult = await queryContext(context, `
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.sort_order ASC, t.sort_order ASC
    LIMIT 500
  `, params);

  const tasks = tasksResult.rows.map(mapRowToTask);

  // Fetch all dependencies in one query
  const taskIds = tasks.map(t => t.id);
  if (taskIds.length === 0) {
    return [];
  }

  const depsResult = await queryContext(context, `
    SELECT d.*, t1.title as task_title, t2.title as depends_on_title
    FROM task_dependencies d
    JOIN tasks t1 ON d.task_id = t1.id
    JOIN tasks t2 ON d.depends_on_id = t2.id
    WHERE d.task_id = ANY($1) OR d.depends_on_id = ANY($1)
  `, [taskIds]);

  const depsMap = new Map<string, TaskDependency[]>();
  for (const row of depsResult.rows) {
    const dep = mapRowToDependency(row);
    const existing = depsMap.get(dep.task_id) || [];
    existing.push(dep);
    depsMap.set(dep.task_id, existing);
  }

  return tasks.map(task => ({
    ...task,
    dependencies: depsMap.get(task.id) || [],
  }));
}

// ============================================================
// Idea to Task Conversion
// ============================================================

export async function convertIdeaToTask(
  context: AIContext,
  ideaId: string,
  projectId?: string
): Promise<Task> {
  // Read the idea
  const ideaResult = await queryContext(context, `
    SELECT id, title, summary, priority FROM ideas WHERE id = $1
  `, [ideaId]);

  if (ideaResult.rows.length === 0) {
    throw new Error('Idea not found');
  }

  const idea = ideaResult.rows[0];

  return createTask(context, {
    title: idea.title as string,
    description: (idea.summary as string) || undefined,
    priority: mapIdeaPriority(idea.priority as string),
    source_idea_id: ideaId,
    project_id: projectId,
  });
}

// ============================================================
// Helpers
// ============================================================

function mapIdeaPriority(priority: string | null): TaskPriority {
  switch (priority) {
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return 'medium';
  }
}

function parseJsonbSafe<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {return fallback;}
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function toISOString(value: unknown): string | undefined {
  if (!value) {return undefined;}
  if (value instanceof Date) {return value.toISOString();}
  return value as string;
}

function mapRowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    project_id: row.project_id as string | undefined,
    source_idea_id: row.source_idea_id as string | undefined,
    calendar_event_id: row.calendar_event_id as string | undefined,
    due_date: toISOString(row.due_date),
    start_date: toISOString(row.start_date),
    completed_at: toISOString(row.completed_at),
    assignee: row.assignee as string | undefined,
    estimated_hours: row.estimated_hours as number | undefined,
    actual_hours: row.actual_hours as number | undefined,
    sort_order: (row.sort_order as number) || 0,
    context: row.context as string,
    labels: parseJsonbSafe<string[]>(row.labels, []),
    metadata: parseJsonbSafe<Record<string, unknown>>(row.metadata, {}),
    created_at: (row.created_at as Date)?.toISOString?.() ?? row.created_at as string,
    updated_at: (row.updated_at as Date)?.toISOString?.() ?? row.updated_at as string,
    project_name: row.project_name as string | undefined,
    project_color: row.project_color as string | undefined,
  };
}

function mapRowToDependency(row: Record<string, unknown>): TaskDependency {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    depends_on_id: row.depends_on_id as string,
    dependency_type: row.dependency_type as DependencyType,
    created_at: (row.created_at as Date)?.toISOString?.() ?? row.created_at as string,
    task_title: row.task_title as string | undefined,
    depends_on_title: row.depends_on_title as string | undefined,
  };
}
