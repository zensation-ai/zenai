/**
 * Phase 126: Core Memory Service
 *
 * Core Memory blocks are structured text blocks that are ALWAYS injected
 * into Claude's system prompt. Each user has exactly one block per type
 * per context (personal/work/learning/creative).
 *
 * Block types:
 *   - user_profile:    Who the user is (background, identity)
 *   - current_goals:   What the user is working toward
 *   - preferences:     How the user likes to work / communicate
 *   - working_context: Current project / task focus
 *
 * @module services/memory/core-memory
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Constants
// ===========================================

export const CORE_BLOCK_TYPES = [
  'user_profile',
  'current_goals',
  'preferences',
  'working_context',
] as const;

export type CoreBlockType = typeof CORE_BLOCK_TYPES[number];

export const MAX_BLOCK_CHARS = 2000;

// ===========================================
// Types
// ===========================================

export interface CoreMemoryBlock {
  id: string;
  userId: string;
  blockType: CoreBlockType;
  content: string;
  version: number;
  updatedBy: 'user' | 'agent' | 'system';
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// Internal helpers
// ===========================================

/** Map German display labels for each block type */
const BLOCK_LABELS: Record<CoreBlockType, string> = {
  user_profile: 'Benutzerprofil',
  current_goals: 'Aktuelle Ziele',
  preferences: 'Präferenzen',
  working_context: 'Arbeitskontext',
};

/** Map a raw DB row to a CoreMemoryBlock */
function rowToBlock(row: {
  id: string;
  user_id: string;
  block_type: string;
  content: string;
  version: number;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}): CoreMemoryBlock {
  return {
    id: row.id,
    userId: row.user_id,
    blockType: row.block_type as CoreBlockType,
    content: row.content,
    version: row.version,
    updatedBy: row.updated_by as CoreMemoryBlock['updatedBy'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ===========================================
// Service functions
// ===========================================

/**
 * Fetch all core memory blocks for a user.
 * Returns an empty array if none exist.
 */
export async function getCoreMemoryBlocks(
  context: AIContext,
  userId: string
): Promise<CoreMemoryBlock[]> {
  const sql = `
    SELECT id, user_id, block_type, content, version, updated_by, created_at, updated_at
    FROM core_memory_blocks
    WHERE user_id = $1
    ORDER BY block_type
  `;

  const result = await queryContext(context, sql, [userId]);
  return result.rows.map(rowToBlock);
}

/**
 * Fetch a single core memory block by type.
 * Returns null if the block does not exist.
 */
export async function getCoreMemoryBlock(
  context: AIContext,
  userId: string,
  blockType: CoreBlockType
): Promise<CoreMemoryBlock | null> {
  const sql = `
    SELECT id, user_id, block_type, content, version, updated_by, created_at, updated_at
    FROM core_memory_blocks
    WHERE user_id = $1 AND block_type = $2
    LIMIT 1
  `;

  const result = await queryContext(context, sql, [userId, blockType]);
  if (result.rows.length === 0) return null;
  return rowToBlock(result.rows[0]);
}

/**
 * Upsert a core memory block.
 * - Truncates content to MAX_BLOCK_CHARS.
 * - Increments version on update.
 * - Creates the block if it does not exist (version starts at 1).
 */
export async function updateCoreMemoryBlock(
  context: AIContext,
  userId: string,
  blockType: CoreBlockType,
  content: string,
  updatedBy = 'user'
): Promise<CoreMemoryBlock> {
  const truncated = content.slice(0, MAX_BLOCK_CHARS);

  const sql = `
    INSERT INTO core_memory_blocks (user_id, block_type, content, version, updated_by)
    VALUES ($1, $2, $3, 1, $4)
    ON CONFLICT (user_id, block_type) DO UPDATE SET
      content    = EXCLUDED.content,
      version    = core_memory_blocks.version + 1,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING id, user_id, block_type, content, version, updated_by, created_at, updated_at
  `;

  const result = await queryContext(context, sql, [userId, blockType, truncated, updatedBy]);

  logger.debug('Core memory block updated', { context, userId, blockType, version: result.rows[0]?.version });

  return rowToBlock(result.rows[0]);
}

/**
 * Append text to an existing core memory block.
 * - Creates the block if it does not exist.
 * - If the combined length exceeds MAX_BLOCK_CHARS, truncates old content
 *   from the beginning so that the most recent information is preserved.
 */
export async function appendToCoreMemoryBlock(
  context: AIContext,
  userId: string,
  blockType: CoreBlockType,
  text: string,
  updatedBy = 'agent'
): Promise<CoreMemoryBlock> {
  const existing = await getCoreMemoryBlock(context, userId, blockType);
  const existingContent = existing?.content ?? '';
  const combined = existingContent + text;

  // Truncate from the beginning to keep the newest content
  const truncated = combined.length > MAX_BLOCK_CHARS
    ? combined.slice(combined.length - MAX_BLOCK_CHARS)
    : combined;

  return updateCoreMemoryBlock(context, userId, blockType, truncated, updatedBy);
}

/**
 * Pure function — builds the [KERN-GEDÄCHTNIS] section injected into
 * Claude's system prompt.
 *
 * Only includes blocks with non-empty content.
 * Returns empty string if no blocks have content.
 *
 * Example output:
 * ```
 * [KERN-GEDÄCHTNIS]
 * ## Benutzerprofil
 * Alex, developer
 *
 * ## Aktuelle Ziele
 * Build ZenAI Phase 126
 * ```
 */
export function buildCoreMemoryPromptSection(blocks: CoreMemoryBlock[]): string {
  const nonEmpty = blocks.filter(b => b.content && b.content.trim().length > 0);
  if (nonEmpty.length === 0) return '';

  const sections = nonEmpty.map(block => {
    const label = BLOCK_LABELS[block.blockType];
    return `## ${label}\n${block.content}`;
  });

  return `[KERN-GEDÄCHTNIS]\n${sections.join('\n\n')}`;
}

/**
 * Create empty blocks for all 4 types if they don't already exist.
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
 */
export async function initializeDefaultBlocks(
  context: AIContext,
  userId: string
): Promise<void> {
  // Build a multi-row insert with one placeholder set per block type
  const values = CORE_BLOCK_TYPES.map((_, i) => {
    const base = i * 3; // 3 params per row: user_id, block_type, updated_by
    return `($1, $${base + 2}, '', 1, $${base + 3})`;
  }).join(', ');

  // Build flat params array: [userId, 'user_profile', 'system', 'current_goals', 'system', ...]
  const params: string[] = [userId];
  for (const blockType of CORE_BLOCK_TYPES) {
    params.push(blockType, 'system');
  }

  const sql = `
    INSERT INTO core_memory_blocks (user_id, block_type, content, version, updated_by)
    VALUES ${values}
    ON CONFLICT (user_id, block_type) DO NOTHING
  `;

  await queryContext(context, sql, params);

  logger.info('Core memory blocks initialized', { context, userId, blockTypes: CORE_BLOCK_TYPES });
}
