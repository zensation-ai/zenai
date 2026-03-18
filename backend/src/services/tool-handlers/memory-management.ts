/**
 * Phase 99: Agent-Managed Memory Tools
 *
 * Allows the AI to actively manage its own memory:
 * - memory_promote: Elevate a fact to high importance
 * - memory_demote: Reduce a fact's confidence
 * - memory_forget: Soft-delete a fact with reason
 *
 * @module services/tool-handlers/memory-management
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { ToolDefinition, ToolExecutionContext } from '../claude/tool-use';

// ===========================================
// Tool Definitions
// ===========================================

export const TOOL_MEMORY_PROMOTE: ToolDefinition = {
  name: 'memory_promote',
  description: 'Stuft einen gespeicherten Fakt auf hohe Wichtigkeit hoch. Nutze dies wenn ein Fakt besonders relevant oder haeufig benoetigt wird.',
  input_schema: {
    type: 'object',
    properties: {
      fact_id: {
        type: 'string',
        description: 'ID des Fakts der hochgestuft werden soll',
      },
      reason: {
        type: 'string',
        description: 'Begruendung fuer die Hochstufung',
      },
    },
    required: ['fact_id', 'reason'],
  },
};

export const TOOL_MEMORY_DEMOTE: ToolDefinition = {
  name: 'memory_demote',
  description: 'Reduziert die Konfidenz eines gespeicherten Fakts. Nutze dies wenn ein Fakt ungenau oder veraltet erscheint.',
  input_schema: {
    type: 'object',
    properties: {
      fact_id: {
        type: 'string',
        description: 'ID des Fakts der herabgestuft werden soll',
      },
      reason: {
        type: 'string',
        description: 'Begruendung fuer die Herabstufung',
      },
    },
    required: ['fact_id', 'reason'],
  },
};

export const TOOL_MEMORY_FORGET: ToolDefinition = {
  name: 'memory_forget',
  description: 'Markiert einen Fakt als vergessen (Soft-Delete). Nutze dies wenn ein Fakt falsch ist oder der Nutzer bittet ihn zu vergessen.',
  input_schema: {
    type: 'object',
    properties: {
      fact_id: {
        type: 'string',
        description: 'ID des Fakts der vergessen werden soll',
      },
      reason: {
        type: 'string',
        description: 'Begruendung fuer das Vergessen',
      },
    },
    required: ['fact_id', 'reason'],
  },
};

// ===========================================
// Handlers
// ===========================================

export async function handleMemoryPromote(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const factId = input.fact_id as string;
  const reason = input.reason as string;
  const context = execContext.aiContext;

  if (!factId || !reason) {
    return 'Fehler: fact_id und reason sind erforderlich.';
  }

  try {
    const result = await queryContext(context, `
      UPDATE learned_facts
      SET importance = 'high',
          confidence = LEAST(confidence + 0.1, 1.0),
          decay_class = 'slow_decay',
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, content
    `, [factId]);

    if (result.rows.length === 0) {
      return `Fakt mit ID ${factId} nicht gefunden.`;
    }

    logger.info('Memory fact promoted', { factId, reason, context });
    return `Fakt hochgestuft: "${result.rows[0].content?.substring(0, 80)}..." — Grund: ${reason}`;
  } catch (error) {
    logger.error('memory_promote failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Hochstufen des Fakts.';
  }
}

export async function handleMemoryDemote(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const factId = input.fact_id as string;
  const reason = input.reason as string;
  const context = execContext.aiContext;

  if (!factId || !reason) {
    return 'Fehler: fact_id und reason sind erforderlich.';
  }

  try {
    const result = await queryContext(context, `
      UPDATE learned_facts
      SET confidence = GREATEST(confidence - 0.3, 0.0),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, content, confidence
    `, [factId]);

    if (result.rows.length === 0) {
      return `Fakt mit ID ${factId} nicht gefunden.`;
    }

    logger.info('Memory fact demoted', { factId, reason, newConfidence: result.rows[0].confidence, context });
    return `Fakt herabgestuft (Konfidenz: ${(result.rows[0].confidence * 100).toFixed(0)}%): "${result.rows[0].content?.substring(0, 80)}..." — Grund: ${reason}`;
  } catch (error) {
    logger.error('memory_demote failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Herabstufen des Fakts.';
  }
}

export async function handleMemoryForget(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const factId = input.fact_id as string;
  const reason = input.reason as string;
  const context = execContext.aiContext;

  if (!factId || !reason) {
    return 'Fehler: fact_id und reason sind erforderlich.';
  }

  try {
    const result = await queryContext(context, `
      UPDATE learned_facts
      SET forgotten = true,
          forgotten_reason = $2,
          confidence = 0,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, content
    `, [factId, reason]);

    if (result.rows.length === 0) {
      return `Fakt mit ID ${factId} nicht gefunden.`;
    }

    logger.info('Memory fact forgotten', { factId, reason, context });
    return `Fakt vergessen: "${result.rows[0].content?.substring(0, 80)}..." — Grund: ${reason}`;
  } catch (error) {
    logger.error('memory_forget failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Vergessen des Fakts.';
  }
}
