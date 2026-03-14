/**
 * Phase 64: Workflow Store
 *
 * CRUD operations for persisting agent workflow graphs.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface StoredWorkflow {
  id: string;
  name: string;
  description: string | null;
  graphDefinition: Record<string, unknown>;
  createdBy: string | null;
  usageCount: number;
  avgDurationMs: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string | null;
  workflowName: string;
  status: string;
  state: Record<string, unknown>;
  nodeHistory: Record<string, unknown>[];
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

// ===========================================
// Service
// ===========================================

class WorkflowStore {
  private async getPool() {
    const { pool } = await import('../../utils/database-context');
    return pool;
  }

  async saveWorkflow(input: {
    name: string;
    description?: string;
    graphDefinition: Record<string, unknown>;
    createdBy?: string;
  }): Promise<StoredWorkflow> {
    const p = await this.getPool();
    const id = uuidv4();
    const result = await p.query(`
      INSERT INTO public.agent_workflows (id, name, description, graph_definition, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, input.name, input.description || null, JSON.stringify(input.graphDefinition), input.createdBy || null]);
    return this.mapWorkflow(result.rows[0]);
  }

  async getWorkflow(id: string): Promise<StoredWorkflow | null> {
    const p = await this.getPool();
    const result = await p.query('SELECT * FROM public.agent_workflows WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapWorkflow(result.rows[0]) : null;
  }

  async listWorkflows(): Promise<StoredWorkflow[]> {
    const p = await this.getPool();
    const result = await p.query('SELECT * FROM public.agent_workflows ORDER BY created_at DESC');
    return result.rows.map((r: Record<string, unknown>) => this.mapWorkflow(r));
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const p = await this.getPool();
    const result = await p.query('DELETE FROM public.agent_workflows WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  async recordRun(input: {
    workflowId?: string;
    workflowName: string;
    status: string;
    state: Record<string, unknown>;
    nodeHistory: Record<string, unknown>[];
    durationMs?: number;
    error?: string;
  }): Promise<WorkflowRun> {
    const p = await this.getPool();
    const id = uuidv4();
    const result = await p.query(`
      INSERT INTO public.agent_workflow_runs (id, workflow_id, workflow_name, status, state, node_history, duration_ms, error, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $4 IN ('completed', 'failed') THEN NOW() ELSE NULL END)
      RETURNING *
    `, [id, input.workflowId || null, input.workflowName, input.status, JSON.stringify(input.state), JSON.stringify(input.nodeHistory), input.durationMs || null, input.error || null]);

    // Update workflow stats if linked
    if (input.workflowId) {
      try {
        await p.query(`
          UPDATE public.agent_workflows
          SET usage_count = usage_count + 1,
              avg_duration_ms = CASE WHEN $2 IS NOT NULL THEN (avg_duration_ms * usage_count + $2) / (usage_count + 1) ELSE avg_duration_ms END,
              success_rate = CASE WHEN $3 = 'completed' THEN (success_rate * usage_count + 1) / (usage_count + 1) ELSE (success_rate * usage_count) / (usage_count + 1) END,
              updated_at = NOW()
          WHERE id = $1
        `, [input.workflowId, input.durationMs, input.status]);
      } catch (error) {
        logger.warn('Failed to update workflow stats', {
          operation: 'workflow-store',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.mapRun(result.rows[0]);
  }

  async listRuns(filters?: { workflowId?: string; status?: string; limit?: number }): Promise<WorkflowRun[]> {
    const p = await this.getPool();
    let sql = 'SELECT * FROM public.agent_workflow_runs WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.workflowId) {
      params.push(filters.workflowId);
      sql += ` AND workflow_id = $${params.length}`;
    }
    if (filters?.status) {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ' ORDER BY started_at DESC';
    const limit = Math.min(filters?.limit || 20, 100);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const result = await p.query(sql, params);
    return result.rows.map((r: Record<string, unknown>) => this.mapRun(r));
  }

  private mapWorkflow(row: Record<string, unknown>): StoredWorkflow {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      graphDefinition: typeof row.graph_definition === 'string' ? JSON.parse(row.graph_definition as string) : (row.graph_definition as Record<string, unknown>),
      createdBy: row.created_by as string | null,
      usageCount: row.usage_count as number,
      avgDurationMs: row.avg_duration_ms as number,
      successRate: row.success_rate as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapRun(row: Record<string, unknown>): WorkflowRun {
    return {
      id: row.id as string,
      workflowId: row.workflow_id as string | null,
      workflowName: row.workflow_name as string,
      status: row.status as string,
      state: typeof row.state === 'string' ? JSON.parse(row.state as string) : (row.state as Record<string, unknown>),
      nodeHistory: typeof row.node_history === 'string' ? JSON.parse(row.node_history as string) : (row.node_history as Record<string, unknown>[]),
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string | null,
      durationMs: row.duration_ms as number | null,
      error: row.error as string | null,
    };
  }
}

// ===========================================
// Singleton
// ===========================================

let instance: WorkflowStore | null = null;

export function getWorkflowStore(): WorkflowStore {
  if (!instance) {
    instance = new WorkflowStore();
  }
  return instance;
}

export function resetWorkflowStore(): void {
  instance = null;
}
