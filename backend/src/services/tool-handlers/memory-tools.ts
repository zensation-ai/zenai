/**
 * Memory Self-Editing Tool Handlers (Letta Pattern)
 *
 * Implements AI agency over its own memory state.
 * The AI can explicitly update, delete, and manage facts about the user.
 *
 * Based on the Letta/MemGPT architecture where the agent manages
 * its own memory through tool calls rather than relying solely
 * on passive extraction.
 *
 * @module services/tool-handlers/memory-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { longTermMemory, PersonalizationFact } from '../memory';
import { queryContext, AIContext } from '../../utils/database-context';
import { invalidatePersonalFactsCache, CATEGORY_LABELS, VALID_CATEGORIES } from '../personal-facts-bridge';
import { v4 as uuidv4 } from 'uuid';

// ===========================================
// Shared Helpers
// ===========================================

/**
 * Find a fact by ID or content search.
 * Returns the fact and its index, or null if not found.
 */
function findFact(
  facts: PersonalizationFact[],
  factId?: string,
  searchContent?: string
): { fact: PersonalizationFact; index: number } | null {
  if (factId) {
    const index = facts.findIndex(f => f.id === factId);
    if (index >= 0) {return { fact: facts[index], index };}
  }

  if (searchContent) {
    const searchLower = searchContent.toLowerCase();
    const index = facts.findIndex(f =>
      f.content.toLowerCase().includes(searchLower) ||
      searchLower.includes(f.content.toLowerCase())
    );
    if (index >= 0) {return { fact: facts[index], index };}
  }

  return null;
}

// ===========================================
// Memory Update Handler
// ===========================================

/**
 * Update an existing fact in long-term memory.
 * Supports lookup by fact_id or by content search.
 */
export async function handleMemoryUpdate(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const factId = input.fact_id as string | undefined;
  const searchContent = input.search_content as string | undefined;
  const newContent = input.new_content as string;
  const newFactType = input.new_fact_type as string | undefined;
  const confidence = (input.confidence as number) ?? 0.9;
  const context = execContext.aiContext;

  if (!newContent) {
    return 'Fehler: Neuer Inhalt ist erforderlich.';
  }

  if (!factId && !searchContent) {
    return 'Fehler: Entweder fact_id oder search_content muss angegeben werden.';
  }

  logger.debug('Tool: memory_update', { factId, searchContent, context });

  try {
    const facts = await longTermMemory.getFacts(context);
    const found = findFact(facts, factId, searchContent);

    if (!found) {
      // No existing fact found - create a new one instead
      await longTermMemory.addFact(context, {
        factType: (newFactType as 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context') || 'knowledge',
        content: newContent,
        confidence: Math.min(1.0, Math.max(0.0, confidence)),
        source: 'explicit',
      });

      return `Kein bestehender Fakt gefunden. Neuer Fakt gespeichert: "${newContent.substring(0, 80)}${newContent.length > 80 ? '...' : ''}"`;
    }

    const targetFact = found.fact;
    const oldContent = targetFact.content;

    // Update the fact in database
    const updatedFactType = newFactType || targetFact.factType;
    const updatedConfidence = Math.min(1.0, Math.max(0.0, confidence));

    try {
      await queryContext(
        context,
        `UPDATE personalization_facts
         SET content = $1,
             fact_type = $2,
             confidence = $3,
             last_confirmed = NOW(),
             occurrences = occurrences + 1
         WHERE id = $4`,
        [newContent, updatedFactType, updatedConfidence, targetFact.id]
      );
    } catch (dbError) {
      logger.debug('DB update failed, updating in-memory only', { dbError });
    }

    // Update in-memory state
    targetFact.content = newContent;
    targetFact.factType = updatedFactType as typeof targetFact.factType;
    targetFact.confidence = updatedConfidence;
    targetFact.lastConfirmed = new Date();
    targetFact.occurrences++;

    logger.info('Memory fact updated via tool', {
      factId: targetFact.id,
      oldContent: oldContent.substring(0, 50),
      newContent: newContent.substring(0, 50),
    });

    return `Fakt aktualisiert:
- **Vorher**: ${oldContent.substring(0, 80)}
- **Nachher**: ${newContent.substring(0, 80)}
- **Konfidenz**: ${(updatedConfidence * 100).toFixed(0)}%

Ich werde die aktualisierte Information ab sofort verwenden.`;
  } catch (error) {
    logger.error('Tool memory_update failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Aktualisieren des Fakts. Bitte versuche es erneut.';
  }
}

// ===========================================
// Memory Delete Handler
// ===========================================

/**
 * Delete a fact from long-term memory.
 * Supports lookup by fact_id or by content search.
 */
export async function handleMemoryDelete(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const factId = input.fact_id as string | undefined;
  const searchContent = input.search_content as string | undefined;
  const reason = (input.reason as string) || 'Vom Nutzer angefordert';
  const context = execContext.aiContext;

  if (!factId && !searchContent) {
    return 'Fehler: Entweder fact_id oder search_content muss angegeben werden, damit ich weiß welcher Fakt gelöscht werden soll.';
  }

  logger.debug('Tool: memory_delete', { factId, searchContent, reason, context });

  try {
    const facts = await longTermMemory.getFacts(context);
    const found = findFact(facts, factId, searchContent);

    if (!found) {
      return `Kein Fakt gefunden${searchContent ? ` für "${searchContent}"` : ''}. Nichts wurde gelöscht.`;
    }

    const targetFact = found.fact;

    // Soft-delete in database (set is_active = false)
    try {
      await queryContext(
        context,
        `UPDATE personalization_facts
         SET is_active = false,
             confidence = 0
         WHERE id = $1`,
        [targetFact.id]
      );
    } catch (dbError) {
      logger.debug('DB delete failed, removing from in-memory only', { dbError });
    }

    // Log the deletion for audit
    logger.info('Memory fact deleted via tool', {
      factId: targetFact.id,
      content: targetFact.content.substring(0, 100),
      reason,
      context,
    });

    // Remove from in-memory facts array via service method
    longTermMemory.removeFact(context, targetFact.id);

    return `Fakt gelöscht: "${targetFact.content.substring(0, 80)}${targetFact.content.length > 80 ? '...' : ''}"
- **Grund**: ${reason}

Ich werde diese Information nicht mehr verwenden.`;
  } catch (error) {
    logger.error('Tool memory_delete failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Löschen des Fakts. Bitte versuche es erneut.';
  }
}

// ===========================================
// Memory Update Profile Handler
// ===========================================

/**
 * Update the user's personal profile (personal_facts table).
 * Bridges to the PersonalizationChat system.
 */
export async function handleMemoryUpdateProfile(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const category = input.category as string;
  const factKey = input.fact_key as string;
  const factValue = input.fact_value as string;

  if (!category || !factKey || !factValue) {
    return 'Fehler: Kategorie, Schlüssel und Wert sind erforderlich.';
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return `Fehler: Ungültige Kategorie "${category}". Erlaubt: ${VALID_CATEGORIES.join(', ')}`;
  }

  logger.debug('Tool: memory_update_profile', { category, factKey, factValue });

  try {
    // Always use 'personal' schema for personal_facts (identity is context-independent)
    const _context = 'personal' as AIContext;

    await queryContext(
      _context,
      `INSERT INTO personal_facts (id, category, fact_key, fact_value, confidence, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'conversation', NOW(), NOW())
       ON CONFLICT (category, fact_key) DO UPDATE SET
         fact_value = $4,
         confidence = GREATEST(personal_facts.confidence, $5),
         updated_at = NOW()`,
      [uuidv4(), category, factKey, factValue, 0.95]
    );

    // Invalidate the personal facts cache so the new value is used immediately
    invalidatePersonalFactsCache();

    logger.info('Personal profile updated via tool', { category, factKey, factValue });

    return `Profil aktualisiert:
- **Kategorie**: ${CATEGORY_LABELS[category] || category}
- **${factKey}**: ${factValue}

Ich werde diese Information ab sofort in allen Gesprächen berücksichtigen.`;
  } catch (error) {
    logger.error('Tool memory_update_profile failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Aktualisieren des Profils. Bitte versuche es erneut.';
  }
}
