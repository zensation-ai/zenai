/**
 * Core Memory Tool Handlers (Phase 126)
 *
 * Allows Claude to read, update, and append to pinned Core Memory blocks.
 * These blocks persist across sessions and appear in every system prompt.
 *
 * Tools:
 * - core_memory_read: Read a specific block
 * - core_memory_update: Replace a block's content entirely
 * - core_memory_append: Append text to a block
 *
 * @module services/tool-handlers/core-memory-tools
 */

import { logger } from '../../utils/logger';
import type { ToolExecutionContext } from '../claude/tool-use';
import { getCurrentUserId } from '../../utils/request-context';
import { SYSTEM_USER_ID } from '../../utils/user-context';

const VALID_BLOCK_TYPES = ['user_profile', 'current_goals', 'preferences', 'working_context'] as const;

function resolveUserId(context: ToolExecutionContext): string {
  return context.userId || getCurrentUserId() || SYSTEM_USER_ID;
}

function isValidBlockType(value: unknown): value is typeof VALID_BLOCK_TYPES[number] {
  return typeof value === 'string' && VALID_BLOCK_TYPES.includes(value as typeof VALID_BLOCK_TYPES[number]);
}

/**
 * Read a Core Memory block's content.
 */
export async function handleCoreMemoryRead(
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<string> {
  const blockType = input.block_type;

  if (!isValidBlockType(blockType)) {
    return `Ungueltiger Block-Typ: ${String(blockType)}. Erlaubt: ${VALID_BLOCK_TYPES.join(', ')}`;
  }

  try {
    const { getCoreMemoryBlocks } = await import('../memory/core-memory');
    const userId = resolveUserId(context);
    const blocks = await getCoreMemoryBlocks(context.aiContext, userId);
    const block = blocks.find(b => b.blockType === blockType);

    if (!block || !block.content) {
      return `Block "${blockType}" ist leer.`;
    }

    return block.content;
  } catch (error) {
    logger.error('core_memory_read failed', error instanceof Error ? error : undefined);
    return `Fehler beim Lesen des Blocks "${blockType}": ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Replace a Core Memory block's content entirely.
 */
export async function handleCoreMemoryUpdate(
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<string> {
  const blockType = input.block_type;
  const content = input.content;

  if (!isValidBlockType(blockType)) {
    return `Ungueltiger Block-Typ: ${String(blockType)}. Erlaubt: ${VALID_BLOCK_TYPES.join(', ')}`;
  }

  if (typeof content !== 'string' || !content.trim()) {
    return 'Inhalt darf nicht leer sein.';
  }

  try {
    const { updateCoreMemoryBlock } = await import('../memory/core-memory');
    const userId = resolveUserId(context);
    const updated = await updateCoreMemoryBlock(context.aiContext, userId, blockType, content, 'agent');

    logger.info('Core Memory block updated by agent', {
      blockType,
      userId,
      version: updated.version,
      contentLength: content.length,
    });

    return `Kern-Gedaechtnis Block "${blockType}" aktualisiert (Version ${updated.version}).`;
  } catch (error) {
    logger.error('core_memory_update failed', error instanceof Error ? error : undefined);
    return `Fehler beim Aktualisieren des Blocks "${blockType}": ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Append text to a Core Memory block.
 */
export async function handleCoreMemoryAppend(
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<string> {
  const blockType = input.block_type;
  const text = input.text;

  if (!isValidBlockType(blockType)) {
    return `Ungueltiger Block-Typ: ${String(blockType)}. Erlaubt: ${VALID_BLOCK_TYPES.join(', ')}`;
  }

  if (typeof text !== 'string' || !text.trim()) {
    return 'Text darf nicht leer sein.';
  }

  try {
    const { appendToCoreMemoryBlock } = await import('../memory/core-memory');
    const userId = resolveUserId(context);
    const updated = await appendToCoreMemoryBlock(context.aiContext, userId, blockType, text, 'agent');

    logger.info('Core Memory block appended by agent', {
      blockType,
      userId,
      version: updated.version,
      appendedLength: text.length,
    });

    return `Text an Kern-Gedaechtnis Block "${blockType}" angehaengt (Version ${updated.version}).`;
  } catch (error) {
    logger.error('core_memory_append failed', error instanceof Error ? error : undefined);
    return `Fehler beim Anhaengen an Block "${blockType}": ${error instanceof Error ? error.message : String(error)}`;
  }
}
