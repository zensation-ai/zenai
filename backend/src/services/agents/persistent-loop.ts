/**
 * Phase 129: Persistent Agent Loop
 *
 * Enables agents to pursue GOALS over multiple steps, with:
 * - Persistent task state in the database
 * - Step dependency resolution
 * - Pause / resume / fail lifecycle
 * - Background execution support
 *
 * Table: persistent_agent_tasks (created by phase129 migration)
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface PlannedStep {
  stepNumber: number;
  description: string;
  tools: string[];
  dependsOn: number[]; // Steps that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AgentPlan {
  steps: PlannedStep[];
  estimatedDuration: string;
  requiredTools: string[];
}

export type TaskStatus =
  | 'planning'
  | 'executing'
  | 'waiting_input'
  | 'paused'
  | 'completed'
  | 'failed';

export interface PersistentAgentTask {
  id: string;
  userId: string;
  goal: string;
  plan: AgentPlan;
  currentStep: number;
  status: TaskStatus;
  context: string;
  results: string[];
  maxSteps: number;
  maxDurationMinutes: number;
  createdAt: Date;
  lastActivityAt: Date;
}

// ===========================================
// Helpers
// ===========================================

/** Parse a DB row into a PersistentAgentTask. */
function rowToTask(row: Record<string, unknown>): PersistentAgentTask {
  const plan: AgentPlan =
    typeof row.plan === 'string' ? JSON.parse(row.plan) : (row.plan as AgentPlan);

  const results: string[] =
    typeof row.results === 'string'
      ? JSON.parse(row.results)
      : Array.isArray(row.results)
        ? (row.results as string[])
        : [];

  return {
    id: row.id as string,
    userId: row.user_id as string,
    goal: row.goal as string,
    plan,
    currentStep: (row.current_step as number) ?? 1,
    status: row.status as TaskStatus,
    context: row.context as string,
    results,
    maxSteps: (row.max_steps as number) ?? 20,
    maxDurationMinutes: (row.max_duration_minutes as number) ?? 60,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    lastActivityAt:
      row.last_activity_at instanceof Date
        ? row.last_activity_at
        : new Date(row.last_activity_at as string),
  };
}

// ===========================================
// Pure Functions
// ===========================================

/**
 * Find the first pending step whose all dependsOn steps are completed.
 * Pure function — no side effects.
 */
export function getNextExecutableStep(plan: AgentPlan): PlannedStep | null {
  const completedNums = new Set(
    plan.steps.filter((s) => s.status === 'completed').map((s) => s.stepNumber),
  );

  for (const step of plan.steps) {
    if (step.status !== 'pending') continue;
    const depsAllDone = step.dependsOn.every((dep) => completedNums.has(dep));
    if (depsAllDone) return step;
  }
  return null;
}

/**
 * Check whether the task has exceeded its allowed duration.
 * Pure function — no side effects.
 */
export function isExpired(task: PersistentAgentTask): boolean {
  const elapsedMs = Date.now() - task.createdAt.getTime();
  const maxMs = task.maxDurationMinutes * 60 * 1000;
  return elapsedMs > maxMs;
}

// ===========================================
// CRUD Operations
// ===========================================

/**
 * Create a new persistent agent task.
 * Returns the generated task ID.
 */
export async function createTask(
  context: AIContext,
  userId: string,
  goal: string,
  plan: AgentPlan,
  maxSteps = 20,
  maxDuration = 60,
): Promise<string> {
  const id = uuidv4();
  const now = new Date();

  await queryContext(
    context,
    `INSERT INTO persistent_agent_tasks
       (id, user_id, goal, plan, current_step, status, context, results,
        max_steps, max_duration_minutes, created_at, last_activity_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      userId,
      goal,
      JSON.stringify(plan),
      1,
      'planning' as TaskStatus,
      context,
      JSON.stringify([]),
      maxSteps,
      maxDuration,
      now,
      now,
    ],
  );

  logger.info(`[PersistentLoop] Created task ${id} for user ${userId} in context ${context}`);
  return id;
}

/**
 * Retrieve a task by ID. Returns null if not found.
 */
export async function getTask(
  context: AIContext,
  taskId: string,
): Promise<PersistentAgentTask | null> {
  const result = await queryContext(
    context,
    `SELECT * FROM persistent_agent_tasks WHERE id = $1`,
    [taskId],
  );

  if (!result.rows.length) return null;
  return rowToTask(result.rows[0] as Record<string, unknown>);
}

/**
 * List all non-terminal tasks for a given user (excludes completed / failed).
 */
export async function listActiveTasks(
  context: AIContext,
  userId: string,
): Promise<PersistentAgentTask[]> {
  const result = await queryContext(
    context,
    `SELECT * FROM persistent_agent_tasks
     WHERE user_id = $1
       AND status NOT IN ('completed', 'failed')
     ORDER BY last_activity_at DESC`,
    [userId],
  );

  return (result.rows as Record<string, unknown>[]).map(rowToTask);
}

// ===========================================
// Step Lifecycle
// ===========================================

/**
 * Mark the current running step as completed (with result), find and activate
 * the next executable step. Returns the next step, or null when the plan is done.
 * Also updates lastActivityAt.
 */
export async function advanceStep(
  context: AIContext,
  taskId: string,
  result: string,
): Promise<PlannedStep | null> {
  const task = await getTask(context, taskId);
  if (!task) return null;

  const plan = task.plan;
  const now = new Date();

  // Mark the currently running step (or first step at currentStep) as completed
  const currentIdx = plan.steps.findIndex((s) => s.stepNumber === task.currentStep);
  if (currentIdx !== -1) {
    plan.steps[currentIdx] = {
      ...plan.steps[currentIdx],
      status: 'completed',
      result,
      completedAt: now,
    };
  }

  // Find next executable step
  const nextStep = getNextExecutableStep(plan);

  let nextCurrentStep = task.currentStep;
  let nextStatus: TaskStatus = task.status;

  if (nextStep) {
    // Mark it as running
    const nextIdx = plan.steps.findIndex((s) => s.stepNumber === nextStep.stepNumber);
    plan.steps[nextIdx] = { ...plan.steps[nextIdx], status: 'running', startedAt: now };
    nextCurrentStep = nextStep.stepNumber;
    nextStatus = 'executing';
  } else {
    // All steps done; caller should call completeTask
    nextStatus = task.status;
  }

  await queryContext(
    context,
    `UPDATE persistent_agent_tasks
     SET plan = $1, current_step = $2, status = $3, last_activity_at = $4
     WHERE id = $5`,
    [JSON.stringify(plan), nextCurrentStep, nextStatus, now, taskId],
  );

  if (!nextStep) return null;

  // Return the updated next step object
  return plan.steps.find((s) => s.stepNumber === nextStep.stepNumber) ?? null;
}

/**
 * Mark the current step as failed and set the task status to 'failed'.
 */
export async function failStep(
  context: AIContext,
  taskId: string,
  error: string,
): Promise<void> {
  const task = await getTask(context, taskId);
  if (!task) return;

  const plan = task.plan;
  const now = new Date();

  const currentIdx = plan.steps.findIndex((s) => s.stepNumber === task.currentStep);
  if (currentIdx !== -1) {
    plan.steps[currentIdx] = {
      ...plan.steps[currentIdx],
      status: 'failed',
      error,
      completedAt: now,
    };
  }

  await queryContext(
    context,
    `UPDATE persistent_agent_tasks
     SET plan = $1, status = $2, last_activity_at = $3
     WHERE id = $4`,
    [JSON.stringify(plan), 'failed' as TaskStatus, now, taskId],
  );

  logger.warn(`[PersistentLoop] Task ${taskId} failed at step ${task.currentStep}: ${error}`);
}

// ===========================================
// Task Lifecycle Controls
// ===========================================

/**
 * Pause the task (status → 'paused').
 */
export async function pauseTask(context: AIContext, taskId: string): Promise<void> {
  await queryContext(
    context,
    `UPDATE persistent_agent_tasks SET status = $1 WHERE id = $2`,
    ['paused', taskId],
  );
  logger.info(`[PersistentLoop] Task ${taskId} paused`);
}

/**
 * Resume a paused task (status → 'executing').
 * Returns the next executable step, or null if none exists.
 */
export async function resumeTask(
  context: AIContext,
  taskId: string,
): Promise<PlannedStep | null> {
  const task = await getTask(context, taskId);
  if (!task) return null;

  await queryContext(
    context,
    `UPDATE persistent_agent_tasks SET status = $1 WHERE id = $2`,
    ['executing', taskId],
  );

  logger.info(`[PersistentLoop] Task ${taskId} resumed`);
  return getNextExecutableStep(task.plan);
}

/**
 * Mark the task as completed with a final result string.
 */
export async function completeTask(
  context: AIContext,
  taskId: string,
  finalResult: string,
): Promise<void> {
  const now = new Date();

  await queryContext(
    context,
    `UPDATE persistent_agent_tasks
     SET status = $1,
         results = results || $2::jsonb,
         last_activity_at = $3
     WHERE id = $4`,
    ['completed' as TaskStatus, JSON.stringify([finalResult]), now, taskId],
  );

  logger.info(`[PersistentLoop] Task ${taskId} completed`);
}
