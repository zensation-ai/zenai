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
import { generateClaudeResponse } from '../claude/core';

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

// ===========================================
// Memory Rethink Handler (Phase 101 — Contextual Synthesis)
// ===========================================

/**
 * Reflect on an existing memory fact and revise it in light of new context.
 * Unlike memory_replace (which substitutes), this synthesizes old + new using Claude Haiku
 * to produce a richer, contextually updated fact. Records revision in fact lineage.
 *
 * Tool: memory_rethink(fact_id, new_context)
 */
export async function handleMemoryRethink(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const factId = input.fact_id as string | undefined;
  const newContext = input.new_context as string | undefined;
  const context = execContext.aiContext;

  if (!factId) {
    return 'Fehler: fact_id (ID des zu revidierenden Fakts) ist erforderlich.';
  }
  if (!newContext) {
    return 'Fehler: new_context (neuer Kontext oder Information) ist erforderlich.';
  }

  logger.debug('Tool: memory_rethink', { factId, context });

  try {
    // 1. Load the existing fact from DB
    const result = await queryContext(
      context as 'personal' | 'work' | 'learning' | 'creative',
      `SELECT id, content, fact_type, confidence, metadata
       FROM personalization_facts
       WHERE id = $1 AND is_active = true LIMIT 1`,
      [factId]
    );

    if (result.rows.length === 0) {
      // Also try via longTermMemory in-memory cache
      const facts = await longTermMemory.getFacts(context);
      const found = findFact(facts, factId);
      if (!found) {
        return `Fakt mit ID "${factId}" nicht gefunden. Nutze memory_introspect um verfuegbare Fakten anzuzeigen.`;
      }

      // Fall back to in-memory fact details
      const targetFact = found.fact;
      return await synthesizeAndUpdateFact(
        context,
        { id: targetFact.id, content: targetFact.content, fact_type: targetFact.factType, confidence: targetFact.confidence, metadata: null },
        newContext,
        targetFact
      );
    }

    const dbFact = result.rows[0] as { id: string; content: string; fact_type: string; confidence: number; metadata: Record<string, unknown> | null };

    // Also get the in-memory fact reference for updating cached state
    const facts = await longTermMemory.getFacts(context);
    const found = findFact(facts, factId);

    return await synthesizeAndUpdateFact(context, dbFact, newContext, found?.fact ?? null);
  } catch (error) {
    logger.error('Tool memory_rethink failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Revidieren des Fakts. Bitte versuche es erneut.';
  }
}

/**
 * Core synthesis: call Claude Haiku to blend old content + new context, then persist.
 */
async function synthesizeAndUpdateFact(
  context: string,
  dbFact: { id: string; content: string; fact_type: string; confidence: number; metadata: Record<string, unknown> | null },
  newContext: string,
  inMemoryFact: PersonalizationFact | null
): Promise<string> {
  const oldContent = dbFact.content;

  // 2. Synthesize revised content using Claude Haiku
  const systemPrompt = `You are a memory revision assistant. Given an existing memory fact and new contextual information, produce a single revised fact that integrates both. Output ONLY the revised fact as a plain string — no JSON, no labels, no explanation. Keep it concise (1-3 sentences max). Use the same language as the existing fact.`;
  const userPrompt = `Existing fact: ${oldContent}\n\nNew context to integrate: ${newContext}\n\nRevised fact:`;

  let revisedContent: string;
  try {
    const response = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 200,
      temperature: 0.3,
    });
    revisedContent = response.trim();
    if (!revisedContent) {
      throw new Error('Empty synthesis response');
    }
  } catch (llmError) {
    logger.error('Claude synthesis in memory_rethink failed', llmError instanceof Error ? llmError : undefined);
    return 'Fehler bei der KI-Synthese. Bitte versuche es erneut.';
  }

  // 3. Build lineage metadata: record superseded_by + revision reason
  const revisionMetadata = JSON.stringify({
    rethought_at: new Date().toISOString(),
    old_content: oldContent,
    new_context: newContext,
    supersede_reason: 'memory_rethink contextual synthesis',
  });

  // 4. Persist revised content + lineage to DB
  try {
    await queryContext(
      context as 'personal' | 'work' | 'learning' | 'creative',
      `UPDATE personalization_facts
       SET content = $1,
           last_confirmed = NOW(),
           occurrences = occurrences + 1,
           metadata = COALESCE(metadata, '{}')::jsonb || $2::jsonb
       WHERE id = $3`,
      [revisedContent, revisionMetadata, dbFact.id]
    );
  } catch (dbError) {
    logger.debug('DB rethink with metadata failed, falling back to simple update', { dbError });
    try {
      await queryContext(
        context as 'personal' | 'work' | 'learning' | 'creative',
        `UPDATE personalization_facts
         SET content = $1,
             last_confirmed = NOW(),
             occurrences = occurrences + 1
         WHERE id = $2`,
        [revisedContent, dbFact.id]
      );
    } catch (fallbackError) {
      logger.error('DB rethink fallback update also failed', fallbackError instanceof Error ? fallbackError : undefined);
    }
  }

  // 5. Update in-memory cache if available
  if (inMemoryFact) {
    inMemoryFact.content = revisedContent;
    inMemoryFact.lastConfirmed = new Date();
    inMemoryFact.occurrences++;
  }

  logger.info('Memory fact rethought via contextual synthesis', {
    factId: dbFact.id,
    oldContent: oldContent.substring(0, 50),
    revisedContent: revisedContent.substring(0, 50),
  });

  return `Fakt kontextuell revidiert:
- **Vorher**: ${oldContent.substring(0, 100)}${oldContent.length > 100 ? '...' : ''}
- **Neuer Kontext**: ${newContext.substring(0, 100)}${newContext.length > 100 ? '...' : ''}
- **Nachher** (synthetisiert): ${revisedContent.substring(0, 100)}${revisedContent.length > 100 ? '...' : ''}

Die synthetisierte Information wird ab sofort verwendet. Aenderungshistorie wurde als Lineage gespeichert.`;
}

// ===========================================
// Memory Restructure Handler (Letta V1 Pattern)
// ===========================================

/**
 * Merge, split, promote, or demote memory facts.
 * Enables the AI to actively reorganize its memory structure.
 */
export async function handleMemoryRestructure(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const action = input.action as 'merge' | 'split' | 'promote' | 'demote';
  const factIdsRaw = input.fact_ids as string;
  const newContent = input.new_content as string | undefined;
  const reason = input.reason as string;
  const context = execContext.aiContext;

  if (!action || !factIdsRaw || !reason) {
    return 'Fehler: action, fact_ids und reason sind erforderlich.';
  }

  const validActions = ['merge', 'split', 'promote', 'demote'];
  if (!validActions.includes(action)) {
    return `Fehler: Ungueltige Aktion "${action}". Erlaubt: ${validActions.join(', ')}`;
  }

  const factIds = factIdsRaw.split(',').map(id => id.trim()).filter(Boolean);
  if (factIds.length === 0) {
    return 'Fehler: Mindestens eine Fakt-ID ist erforderlich.';
  }

  logger.debug('Tool: memory_restructure', { action, factIds, reason, context });

  try {
    const facts = await longTermMemory.getFacts(context);

    switch (action) {
      case 'merge': {
        if (factIds.length < 2) {
          return 'Fehler: Fuer merge werden mindestens 2 Fakt-IDs benoetigt.';
        }
        if (!newContent) {
          return 'Fehler: Fuer merge ist new_content (der kombinierte Fakt) erforderlich.';
        }

        const foundFacts: PersonalizationFact[] = [];
        for (const fid of factIds) {
          const found = findFact(facts, fid);
          if (found) {
            foundFacts.push(found.fact);
          }
        }

        if (foundFacts.length < 2) {
          return `Nur ${foundFacts.length} von ${factIds.length} Fakten gefunden. Merge erfordert mindestens 2 gefundene Fakten.`;
        }

        // Archive originals (soft-delete)
        for (const fact of foundFacts) {
          try {
            await queryContext(
              context,
              `UPDATE personalization_facts SET is_active = false, confidence = 0 WHERE id = $1`,
              [fact.id]
            );
            longTermMemory.removeFact(context, fact.id);
          } catch (dbErr) {
            logger.debug('DB archive during merge failed for fact', { factId: fact.id, dbErr });
          }
        }

        // Create merged fact
        const highestConfidence = Math.max(...foundFacts.map(f => f.confidence));
        await longTermMemory.addFact(context, {
          factType: foundFacts[0].factType,
          content: newContent,
          confidence: Math.min(1.0, highestConfidence + 0.05),
          source: 'explicit',
        });

        const archivedNames = foundFacts.map(f => `"${f.content.substring(0, 40)}..."`).join(', ');
        logger.info('Memory facts merged via tool', { mergedCount: foundFacts.length, reason });

        return `${foundFacts.length} Fakten verschmolzen:
- **Archiviert**: ${archivedNames}
- **Neuer Fakt**: "${newContent.substring(0, 100)}${newContent.length > 100 ? '...' : ''}"
- **Grund**: ${reason}`;
      }

      case 'split': {
        if (factIds.length !== 1) {
          return 'Fehler: Fuer split wird genau 1 Fakt-ID benoetigt.';
        }
        if (!newContent) {
          return 'Fehler: Fuer split ist new_content (komma-separierte neue Fakten) erforderlich.';
        }

        const found = findFact(facts, factIds[0]);
        if (!found) {
          return `Fakt mit ID "${factIds[0]}" nicht gefunden.`;
        }

        const originalFact = found.fact;
        const newFacts = newContent.split(',').map(s => s.trim()).filter(Boolean);

        if (newFacts.length < 2) {
          return 'Fehler: Split erfordert mindestens 2 neue Fakten (komma-separiert in new_content).';
        }

        // Archive original
        try {
          await queryContext(
            context,
            `UPDATE personalization_facts SET is_active = false, confidence = 0 WHERE id = $1`,
            [originalFact.id]
          );
          longTermMemory.removeFact(context, originalFact.id);
        } catch (dbErr) {
          logger.debug('DB archive during split failed', { factId: originalFact.id, dbErr });
        }

        // Create new split facts
        for (const content of newFacts) {
          await longTermMemory.addFact(context, {
            factType: originalFact.factType,
            content,
            confidence: originalFact.confidence,
            source: 'explicit',
          });
        }

        logger.info('Memory fact split via tool', { originalId: originalFact.id, splitCount: newFacts.length, reason });

        return `Fakt aufgeteilt:
- **Original**: "${originalFact.content.substring(0, 80)}..."
- **Neue Fakten** (${newFacts.length}):
${newFacts.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}
- **Grund**: ${reason}`;
      }

      case 'promote': {
        if (factIds.length !== 1) {
          return 'Fehler: Fuer promote wird genau 1 Fakt-ID benoetigt.';
        }

        const found = findFact(facts, factIds[0]);
        if (!found) {
          return `Fakt mit ID "${factIds[0]}" nicht gefunden.`;
        }

        const targetFact = found.fact;
        const oldConfidence = targetFact.confidence;
        const newConfidence = Math.min(1.0, oldConfidence + 0.15);

        try {
          await queryContext(
            context,
            `UPDATE personalization_facts SET confidence = $1, last_confirmed = NOW() WHERE id = $2`,
            [newConfidence, targetFact.id]
          );
        } catch (dbErr) {
          logger.debug('DB promote failed', { factId: targetFact.id, dbErr });
        }

        targetFact.confidence = newConfidence;
        targetFact.lastConfirmed = new Date();

        logger.info('Memory fact promoted via tool', { factId: targetFact.id, oldConfidence, newConfidence, reason });

        return `Fakt hochgestuft:
- **Fakt**: "${targetFact.content.substring(0, 80)}..."
- **Konfidenz**: ${(oldConfidence * 100).toFixed(0)}% → ${(newConfidence * 100).toFixed(0)}%
- **Grund**: ${reason}`;
      }

      case 'demote': {
        if (factIds.length !== 1) {
          return 'Fehler: Fuer demote wird genau 1 Fakt-ID benoetigt.';
        }

        const found = findFact(facts, factIds[0]);
        if (!found) {
          return `Fakt mit ID "${factIds[0]}" nicht gefunden.`;
        }

        const targetFact = found.fact;
        const oldConfidence = targetFact.confidence;
        const newConfidence = Math.max(0.1, oldConfidence - 0.2);

        try {
          await queryContext(
            context,
            `UPDATE personalization_facts SET confidence = $1 WHERE id = $2`,
            [newConfidence, targetFact.id]
          );
        } catch (dbErr) {
          logger.debug('DB demote failed', { factId: targetFact.id, dbErr });
        }

        targetFact.confidence = newConfidence;

        logger.info('Memory fact demoted via tool', { factId: targetFact.id, oldConfidence, newConfidence, reason });

        return `Fakt herabgestuft:
- **Fakt**: "${targetFact.content.substring(0, 80)}..."
- **Konfidenz**: ${(oldConfidence * 100).toFixed(0)}% → ${(newConfidence * 100).toFixed(0)}%
- **Grund**: ${reason}

Der Fakt wird in zukuenftigen Antworten weniger stark gewichtet.`;
      }

      default:
        return `Unbekannte Aktion: ${action}`;
    }
  } catch (error) {
    logger.error('Tool memory_restructure failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Restrukturieren der Fakten. Bitte versuche es erneut.';
  }
}
