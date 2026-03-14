/**
 * Agent Checkpoint Service
 *
 * Provides durable execution for multi-agent pipelines:
 * - Save/restore checkpoints at each pipeline step
 * - Pause/resume execution (human-in-the-loop)
 * - Governance integration for high-impact tool calls
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { sharedMemory, SharedMemoryEntry } from './memory/shared-memory';
import { AgentOutput } from './agents/base-agent';
import { AgentRole } from './memory/shared-memory';

// ===========================================
// Types
// ===========================================

export type ExecutionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'awaiting_approval'
  | 'cancelled';

export interface AgentCheckpoint {
  id: string;
  executionId: string;
  stepIndex: number;
  agentRole: string;
  agentResults: AgentOutput[];
  sharedMemorySnapshot: SharedMemoryEntry[];
  pipelineState: PipelineState;
  createdAt: string;
}

export interface PipelineState {
  pipeline: AgentRole[];
  currentStep: number;
  completedSteps: number[];
  pendingApprovalActionId?: string;
}

// Tools that require governance approval before execution
export const APPROVAL_REQUIRED_TOOLS = [
  'send_email',
  'github_create_issue',
];

// ===========================================
// Checkpoint Operations
// ===========================================

/**
 * Save a checkpoint after an agent completes a step.
 */
export async function saveCheckpoint(
  context: AIContext,
  executionId: string,
  stepIndex: number,
  agentRole: string,
  agentResults: AgentOutput[],
  teamId: string,
  pipelineState: PipelineState
): Promise<string | null> {
  try {
    // Serialize shared memory
    const entries = sharedMemory.read(teamId);

    const result = await queryContext(
      context,
      `INSERT INTO agent_checkpoints (execution_id, step_index, agent_role, agent_results, shared_memory_snapshot, pipeline_state)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        executionId,
        stepIndex,
        agentRole,
        JSON.stringify(agentResults),
        JSON.stringify(entries),
        JSON.stringify(pipelineState),
      ]
    );

    // Update execution record
    await queryContext(
      context,
      `UPDATE agent_executions
       SET checkpoint_step = $2, checkpoint_at = NOW(), checkpoint_state = $3
       WHERE id = $1`,
      [executionId, stepIndex, JSON.stringify(pipelineState)]
    );

    logger.debug('Checkpoint saved', { executionId, stepIndex, agentRole });
    return result.rows[0]?.id || null;
  } catch (error) {
    logger.error('Failed to save checkpoint', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Load the latest checkpoint for an execution.
 */
export async function loadCheckpoint(
  context: AIContext,
  executionId: string
): Promise<AgentCheckpoint | null> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, execution_id, step_index, agent_role, agent_results,
              shared_memory_snapshot, pipeline_state, created_at
       FROM agent_checkpoints
       WHERE execution_id = $1
       ORDER BY step_index DESC
       LIMIT 1`,
      [executionId]
    );

    if (result.rows.length === 0) {return null;}

    const r = result.rows[0];
    return {
      id: r.id,
      executionId: r.execution_id,
      stepIndex: parseInt(r.step_index, 10) || 0,
      agentRole: r.agent_role,
      agentResults: parseJSON(r.agent_results, []),
      sharedMemorySnapshot: parseJSON(r.shared_memory_snapshot, []),
      pipelineState: parseJSON(r.pipeline_state, { pipeline: [], currentStep: 0, completedSteps: [] }),
      createdAt: r.created_at,
    };
  } catch (error) {
    logger.error('Failed to load checkpoint', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Restore shared memory from a checkpoint snapshot.
 */
export function restoreSharedMemory(
  teamId: string,
  snapshot: SharedMemoryEntry[]
): void {
  // Re-initialize shared memory
  sharedMemory.initialize(teamId);

  // Replay all entries
  for (const entry of snapshot) {
    sharedMemory.write(
      teamId,
      entry.agentRole,
      entry.type,
      entry.content,
      entry.metadata
    );
  }
}

// ===========================================
// Execution Status Management
// ===========================================

/**
 * Update execution status in the database.
 */
export async function updateExecutionStatus(
  context: AIContext,
  executionId: string,
  status: ExecutionStatus,
  extra?: { pauseReason?: string; userId?: string }
): Promise<void> {
  const validStatuses: ExecutionStatus[] = ['running', 'completed', 'failed', 'paused', 'awaiting_approval', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid execution status: ${status}`);
  }

  try {
    const params: (string | number | boolean | null)[] = [executionId, status];
    const updates: string[] = ['status = $2'];
    let paramIdx = 3;

    if (status === 'paused' || status === 'awaiting_approval') {
      updates.push('paused_at = NOW()');
      if (extra?.pauseReason) {
        updates.push(`pause_reason = $${paramIdx++}`);
        params.push(extra.pauseReason);
      }
    }

    if (status === 'running') {
      updates.push('resume_count = COALESCE(resume_count, 0) + 1');
      updates.push('paused_at = NULL');
      updates.push('pause_reason = NULL');
    }

    let userFilter = '';
    if (extra?.userId) {
      userFilter = ` AND user_id = $${paramIdx++}`;
      params.push(extra.userId);
    }

    const sql = `UPDATE agent_executions SET ${updates.join(', ')} WHERE id = $1${userFilter}`;

    await queryContext(context, sql, params);
  } catch (error) {
    logger.error('Failed to update execution status', error instanceof Error ? error : undefined);
  }
}

/**
 * Get execution status from the database.
 */
export async function getExecutionStatus(
  context: AIContext,
  executionId: string,
  userId?: string
): Promise<{
  status: ExecutionStatus;
  checkpointStep: number;
  resumeCount: number;
  pausedAt: string | null;
  pauseReason: string | null;
} | null> {
  try {
    const userFilter = userId ? ' AND user_id = $2' : '';
    const params = userId ? [executionId, userId] : [executionId];
    const result = await queryContext(
      context,
      `SELECT status, checkpoint_step, resume_count, paused_at, pause_reason
       FROM agent_executions WHERE id = $1${userFilter}`,
      params
    );

    if (result.rows.length === 0) {return null;}

    const r = result.rows[0];
    return {
      status: (r.status || 'running') as ExecutionStatus,
      checkpointStep: parseInt(r.checkpoint_step, 10) || 0,
      resumeCount: parseInt(r.resume_count, 10) || 0,
      pausedAt: r.paused_at || null,
      pauseReason: r.pause_reason || null,
    };
  } catch (error) {
    logger.error('Failed to get execution status', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * List all checkpoints for an execution.
 */
export async function listCheckpoints(
  context: AIContext,
  executionId: string,
  userId?: string
): Promise<Array<{
  id: string;
  stepIndex: number;
  agentRole: string;
  createdAt: string;
}>> {
  try {
    const userFilter = userId
      ? ' AND execution_id IN (SELECT id FROM agent_executions WHERE id = $1 AND user_id = $2)'
      : '';
    const params = userId ? [executionId, userId] : [executionId];
    const result = await queryContext(
      context,
      `SELECT id, step_index, agent_role, created_at
       FROM agent_checkpoints
       WHERE execution_id = $1${userFilter}
       ORDER BY step_index ASC`,
      params
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      stepIndex: parseInt(r.step_index as string, 10) || 0,
      agentRole: r.agent_role as string,
      createdAt: r.created_at as string,
    }));
  } catch (error) {
    logger.error('Failed to list checkpoints', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Check if a tool call requires governance approval.
 */
export function requiresApproval(toolName: string): boolean {
  return APPROVAL_REQUIRED_TOOLS.includes(toolName);
}

// ===========================================
// Helpers
// ===========================================

function parseJSON<T>(value: unknown, fallback: T): T {
  if (!value) {return fallback;}
  if (typeof value === 'object') {return value as T;}
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}
