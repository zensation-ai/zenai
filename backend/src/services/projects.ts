/**
 * Projects Service - Phase 37
 *
 * Context-aware project management for grouping tasks.
 * Projects live in each context schema (personal, work, learning, creative).
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  status: ProjectStatus;
  context: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Computed
  task_count?: number;
  done_count?: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  status?: ProjectStatus;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  limit?: number;
  offset?: number;
}

// ============================================================
// CRUD
// ============================================================

export async function createProject(
  context: AIContext,
  input: CreateProjectInput
): Promise<Project> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const result = await queryContext(context, `
    INSERT INTO projects (
      id, name, description, color, icon, status,
      context, sort_order, metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
    RETURNING *
  `, [
    id,
    input.name,
    input.description || null,
    input.color || '#4A90D9',
    input.icon || '📁',
    input.status || 'active',
    context,
    input.sort_order ?? 0,
    JSON.stringify(input.metadata || {}),
    now,
  ]);

  logger.info('Project created', { id, name: input.name, context, operation: 'createProject' });
  return mapRowToProject(result.rows[0]);
}

export async function getProjects(
  context: AIContext,
  filters?: ProjectFilters
): Promise<Project[]> {
  const conditions: string[] = ["p.status != 'archived'"];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.status) {
    conditions[0] = `p.status = $${paramIdx}`;
    params.push(filters.status);
    paramIdx++;
  }

  const limit = Math.min(filters?.limit || 100, 500);
  const offset = filters?.offset || 0;

  const result = await queryContext(context, `
    SELECT p.*,
      COUNT(t.id) FILTER (WHERE t.status != 'cancelled') as task_count,
      COUNT(t.id) FILTER (WHERE t.status = 'done') as done_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY p.id
    ORDER BY p.sort_order ASC, p.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...params, limit, offset]);

  return result.rows.map(mapRowToProject);
}

export async function getProject(
  context: AIContext,
  id: string
): Promise<Project | null> {
  const result = await queryContext(context, `
    SELECT p.*,
      COUNT(t.id) FILTER (WHERE t.status != 'cancelled') as task_count,
      COUNT(t.id) FILTER (WHERE t.status = 'done') as done_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.id = $1
    GROUP BY p.id
  `, [id]);

  return result.rows.length > 0 ? mapRowToProject(result.rows[0]) : null;
}

export async function updateProject(
  context: AIContext,
  id: string,
  updates: Partial<CreateProjectInput>
): Promise<Project | null> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    color: 'color',
    icon: 'icon',
    status: 'status',
    sort_order: 'sort_order',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in updates) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push((updates as Record<string, unknown>)[key] as string | number | null);
      paramIdx++;
    }
  }

  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx}`);
    params.push(JSON.stringify(updates.metadata));
    paramIdx++;
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');

  const result = await queryContext(context, `
    UPDATE projects
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIdx}
    RETURNING *
  `, [...params, id]);

  if (result.rows.length === 0) return null;

  logger.info('Project updated', { id, context, operation: 'updateProject' });
  return mapRowToProject(result.rows[0]);
}

export async function deleteProject(
  context: AIContext,
  id: string
): Promise<boolean> {
  const result = await queryContext(context, `
    UPDATE projects
    SET status = 'archived', updated_at = NOW()
    WHERE id = $1 AND status != 'archived'
    RETURNING id
  `, [id]);

  if (result.rows.length > 0) {
    logger.info('Project archived', { id, context, operation: 'deleteProject' });
    return true;
  }
  return false;
}

// ============================================================
// Helpers
// ============================================================

function parseJsonbSafe<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function mapRowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    color: (row.color as string) || '#4A90D9',
    icon: (row.icon as string) || '📁',
    status: row.status as ProjectStatus,
    context: row.context as string,
    sort_order: (row.sort_order as number) || 0,
    metadata: parseJsonbSafe<Record<string, unknown>>(row.metadata, {}),
    created_at: (row.created_at as Date)?.toISOString?.() ?? row.created_at as string,
    updated_at: (row.updated_at as Date)?.toISOString?.() ?? row.updated_at as string,
    task_count: row.task_count !== undefined ? parseInt(row.task_count as string) || 0 : undefined,
    done_count: row.done_count !== undefined ? parseInt(row.done_count as string) || 0 : undefined,
  };
}
