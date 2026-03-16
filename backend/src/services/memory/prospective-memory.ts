/**
 * Phase 87: Prospective Memory Service
 *
 * Manages "remembering to do things in the future" — intentions tied
 * to temporal, event-based, activity-based, or context-based triggers.
 * When a trigger condition is met, the memory "fires" and surfaces
 * the stored intention to the user.
 *
 * @module services/memory/prospective-memory
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export type TriggerType = 'time' | 'event' | 'activity' | 'context';
export type MemoryPriority = 'low' | 'medium' | 'high';
export type MemoryStatus = 'pending' | 'fired' | 'dismissed' | 'expired';

export interface ProspectiveMemoryInput {
  triggerType: TriggerType;
  triggerCondition: Record<string, unknown>;
  memoryContent: string;
  priority?: MemoryPriority;
  expiresAt?: string;
}

export interface ProspectiveMemoryRecord {
  id: string;
  userId: string;
  triggerType: TriggerType;
  triggerCondition: Record<string, unknown>;
  memoryContent: string;
  priority: MemoryPriority;
  status: MemoryStatus;
  firedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===========================================
// Service Functions
// ===========================================

/**
 * Create a new prospective memory
 */
export async function createProspectiveMemory(
  context: AIContext,
  userId: string,
  data: ProspectiveMemoryInput
): Promise<ProspectiveMemoryRecord> {
  const { triggerType, triggerCondition, memoryContent, priority, expiresAt } = data;

  const result = await queryContext(
    context,
    `INSERT INTO prospective_memories
     (user_id, trigger_type, trigger_condition, memory_content, priority, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, trigger_type, trigger_condition, memory_content,
               priority, status, fired_at, expires_at, created_at, updated_at`,
    [
      userId,
      triggerType,
      JSON.stringify(triggerCondition),
      memoryContent,
      priority ?? 'medium',
      expiresAt ?? null,
    ]
  );

  const record = mapRow(result.rows[0]);
  logger.info('Prospective memory created', {
    id: record.id,
    triggerType,
    context,
  });

  return record;
}

/**
 * Check for time-based triggers that should fire now
 */
export async function checkTimeBasedTriggers(
  context: AIContext
): Promise<ProspectiveMemoryRecord[]> {
  const result = await queryContext(
    context,
    `SELECT id, user_id, trigger_type, trigger_condition, memory_content,
            priority, status, fired_at, expires_at, created_at, updated_at
     FROM prospective_memories
     WHERE status = 'pending'
       AND trigger_type = 'time'
       AND (trigger_condition->>'time')::timestamptz <= NOW()
     ORDER BY priority DESC, created_at ASC`,
    []
  );

  return result.rows.map(mapRow);
}

/**
 * Check for activity-based triggers matching the current page/activity
 */
export async function checkActivityTriggers(
  context: AIContext,
  userId: string,
  currentPage: string
): Promise<ProspectiveMemoryRecord[]> {
  const result = await queryContext(
    context,
    `SELECT id, user_id, trigger_type, trigger_condition, memory_content,
            priority, status, fired_at, expires_at, created_at, updated_at
     FROM prospective_memories
     WHERE status = 'pending'
       AND trigger_type = 'activity'
       AND user_id = $1
       AND (trigger_condition->>'page' = $2
            OR trigger_condition->>'activity' = $2)
     ORDER BY priority DESC, created_at ASC`,
    [userId, currentPage]
  );

  return result.rows.map(mapRow);
}

/**
 * Check for context-based triggers matching the current context
 */
export async function checkContextTriggers(
  context: AIContext,
  userId: string
): Promise<ProspectiveMemoryRecord[]> {
  const result = await queryContext(
    context,
    `SELECT id, user_id, trigger_type, trigger_condition, memory_content,
            priority, status, fired_at, expires_at, created_at, updated_at
     FROM prospective_memories
     WHERE status = 'pending'
       AND trigger_type = 'context'
       AND user_id = $1
       AND trigger_condition->>'context' = $2
     ORDER BY priority DESC, created_at ASC`,
    [userId, context]
  );

  return result.rows.map(mapRow);
}

/**
 * Fire a prospective memory (set status=fired, fired_at=now)
 */
export async function fireMemory(
  context: AIContext,
  memoryId: string
): Promise<ProspectiveMemoryRecord | null> {
  const result = await queryContext(
    context,
    `UPDATE prospective_memories
     SET status = 'fired', fired_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id, user_id, trigger_type, trigger_condition, memory_content,
               priority, status, fired_at, expires_at, created_at, updated_at`,
    [memoryId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.info('Prospective memory fired', { id: memoryId, context });
  return mapRow(result.rows[0]);
}

/**
 * Dismiss a prospective memory
 */
export async function dismissMemory(
  context: AIContext,
  memoryId: string
): Promise<ProspectiveMemoryRecord | null> {
  const result = await queryContext(
    context,
    `UPDATE prospective_memories
     SET status = 'dismissed', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id, user_id, trigger_type, trigger_condition, memory_content,
               priority, status, fired_at, expires_at, created_at, updated_at`,
    [memoryId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.info('Prospective memory dismissed', { id: memoryId, context });
  return mapRow(result.rows[0]);
}

/**
 * List all pending prospective memories for a user
 */
export async function listPending(
  context: AIContext,
  userId: string
): Promise<ProspectiveMemoryRecord[]> {
  const result = await queryContext(
    context,
    `SELECT id, user_id, trigger_type, trigger_condition, memory_content,
            priority, status, fired_at, expires_at, created_at, updated_at
     FROM prospective_memories
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY
       CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
       created_at ASC`,
    [userId]
  );

  return result.rows.map(mapRow);
}

/**
 * Find expired memories and set their status to 'expired'
 */
export async function getExpiredAndCleanup(
  context: AIContext
): Promise<number> {
  const result = await queryContext(
    context,
    `UPDATE prospective_memories
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`,
    []
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info('Expired prospective memories cleaned up', { count, context });
  }

  return count;
}

// ===========================================
// Helper
// ===========================================

function mapRow(row: Record<string, unknown>): ProspectiveMemoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    triggerType: row.trigger_type as TriggerType,
    triggerCondition: (typeof row.trigger_condition === 'string'
      ? JSON.parse(row.trigger_condition as string)
      : row.trigger_condition) as Record<string, unknown>,
    memoryContent: row.memory_content as string,
    priority: row.priority as MemoryPriority,
    status: row.status as MemoryStatus,
    firedAt: row.fired_at ? String(row.fired_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
