/**
 * Memory Self-Editing Tool Handlers (Phase 100)
 *
 * Advanced memory management tools that allow the AI to:
 * - Replace facts with audit trail (memory_replace)
 * - Abstract multiple facts into higher-level knowledge (memory_abstract)
 * - Discover and link related facts (memory_search_and_link)
 *
 * @module services/tool-handlers/memory-self-editing
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { generateClaudeResponse } from '../claude/core';
import { MODEL_CONFIG } from '../claude/client';
import { v4 as uuidv4 } from 'uuid';

// ===========================================
// memory_replace
// ===========================================

/**
 * Find a fact by ID, then fall back to content search.
 * Returns the matched row or null.
 */
async function findFactByKeyOrContent(
  context: string,
  key: string
): Promise<{ id: string; content: string; fact_type: string; confidence: number } | null> {
  // Try by ID first
  const byId = await queryContext(
    context as 'personal' | 'work' | 'learning' | 'creative',
    `SELECT id, content, fact_type, confidence FROM personalization_facts
     WHERE id = $1 AND is_active = true LIMIT 1`,
    [key]
  );
  if (byId.rows.length > 0) return byId.rows[0];

  // Fall back to content search
  const byContent = await queryContext(
    context as 'personal' | 'work' | 'learning' | 'creative',
    `SELECT id, content, fact_type, confidence FROM personalization_facts
     WHERE is_active = true AND content ILIKE '%' || $1 || '%'
     ORDER BY confidence DESC LIMIT 1`,
    [key]
  );
  if (byContent.rows.length > 0) return byContent.rows[0];

  return null;
}

/**
 * Replace a fact's content with a new value, recording the reason.
 *
 * Tool: memory_replace(key, old_content, new_content, reason)
 */
export async function handleMemoryReplace(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const key = input.key as string | undefined;
  const newContent = input.new_content as string | undefined;
  const reason = input.reason as string | undefined;
  const context = execContext.aiContext;

  if (!key) {
    return 'Fehler: key (Fakt-ID oder Suchbegriff) ist erforderlich.';
  }
  if (!newContent) {
    return 'Fehler: new_content ist erforderlich.';
  }
  if (!reason) {
    return 'Fehler: reason (Begruendung) ist erforderlich.';
  }

  logger.debug('Tool: memory_replace', { key, context });

  try {
    const fact = await findFactByKeyOrContent(context, key);

    if (!fact) {
      return `Fakt nicht gefunden fuer "${key}". Nutze memory_introspect um verfuegbare Fakten anzuzeigen.`;
    }

    const oldContent = fact.content;

    // Update the fact and record the replacement reason
    const replaceMetadata = JSON.stringify({
      replaced_at: new Date().toISOString(),
      old_content: oldContent,
      reason,
    });

    await queryContext(
      context,
      `UPDATE personalization_facts
       SET content = $1,
           last_confirmed = NOW(),
           occurrences = occurrences + 1,
           metadata = COALESCE(metadata, '{}')::jsonb || $2::jsonb
       WHERE id = $3`,
      [newContent, replaceMetadata, fact.id]
    );

    logger.info('Memory fact replaced via tool', {
      factId: fact.id,
      oldContent: oldContent.substring(0, 50),
      newContent: newContent.substring(0, 50),
      reason,
    });

    return `Fakt ersetzt:
- **Vorher**: ${oldContent.substring(0, 100)}${oldContent.length > 100 ? '...' : ''}
- **Nachher**: ${newContent.substring(0, 100)}${newContent.length > 100 ? '...' : ''}
- **Grund**: ${reason}

Die aktualisierte Information wird ab sofort verwendet.`;
  } catch (error) {
    logger.error('Tool memory_replace failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Ersetzen des Fakts. Bitte versuche es erneut.';
  }
}

// ===========================================
// memory_abstract
// ===========================================

/**
 * Load multiple facts, call Claude Haiku to create one abstracted fact,
 * and mark originals as superseded.
 *
 * Tool: memory_abstract(fact_ids[], instruction)
 */
export async function handleMemoryAbstract(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const factIdsRaw = input.fact_ids as string | undefined;
  const instruction = input.instruction as string | undefined;
  const context = execContext.aiContext;

  if (!factIdsRaw) {
    return 'Fehler: fact_ids (komma-separierte Liste) ist erforderlich.';
  }
  if (!instruction) {
    return 'Fehler: instruction (Abstractions-Anweisung) ist erforderlich.';
  }

  const factIds = factIdsRaw.split(',').map(id => id.trim()).filter(Boolean);
  if (factIds.length < 2) {
    return 'Fehler: Mindestens 2 Fakt-IDs sind fuer die Abstraktion erforderlich.';
  }

  logger.debug('Tool: memory_abstract', { factIds, instruction, context });

  try {
    // Load all referenced facts
    const loadedFacts: Array<{ id: string; content: string; fact_type: string; confidence: number }> = [];

    for (const fid of factIds) {
      const result = await queryContext(
        context,
        `SELECT id, content, fact_type, confidence FROM personalization_facts
         WHERE id = $1 AND is_active = true LIMIT 1`,
        [fid]
      );
      if (result.rows.length > 0) {
        loadedFacts.push(result.rows[0]);
      }
    }

    if (loadedFacts.length < 2) {
      const missing = factIds.filter(id => !loadedFacts.find(f => f.id === id));
      return `Nur ${loadedFacts.length} von ${factIds.length} Fakten gefunden. Nicht gefunden: ${missing.join(', ')}. Abstraktion erfordert mindestens 2 Fakten.`;
    }

    // Call Claude Haiku to abstract the facts
    const factsText = loadedFacts.map((f, i) => `${i + 1}. [${f.fact_type}] ${f.content}`).join('\n');

    const systemPrompt = `You are a memory abstraction assistant. Given multiple specific facts, create one or more abstracted higher-level facts that capture the essence. Output ONLY a JSON array of objects with fields: content (string), fact_type (string: preference|behavior|knowledge|goal|context), confidence (number 0-1). Use the same language as the input facts.`;

    const userPrompt = `Facts to abstract:\n${factsText}\n\nInstruction: ${instruction}\n\nOutput JSON array:`;

    let abstractedFacts: Array<{ content: string; fact_type: string; confidence: number }>;

    try {
      const response = await generateClaudeResponse(systemPrompt, userPrompt, {
        maxTokens: 300,
        temperature: 0.3,
      });

      // Parse the JSON response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }
      abstractedFacts = JSON.parse(jsonMatch[0]);
    } catch (llmError) {
      logger.error('Claude abstraction failed', llmError instanceof Error ? llmError : undefined);
      return 'Fehler bei der KI-Abstraktion. Bitte versuche es erneut.';
    }

    if (!Array.isArray(abstractedFacts) || abstractedFacts.length === 0) {
      return 'Fehler: KI konnte keine abstrahierten Fakten erzeugen.';
    }

    // Mark originals as superseded
    const newFactId = uuidv4();
    for (const fact of loadedFacts) {
      await queryContext(
        context,
        `UPDATE personalization_facts
         SET metadata = COALESCE(metadata, '{}')::jsonb || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({ superseded_by: newFactId, supersede_reason: instruction }), fact.id]
      );
    }

    // Store the abstracted fact(s)
    const createdFacts: string[] = [];
    for (const af of abstractedFacts.slice(0, 3)) { // Max 3 abstracted facts
      const embedding = await generateEmbedding(af.content);
      await queryContext(
        context,
        `INSERT INTO personalization_facts (id, context, fact_type, content, confidence, source, first_seen, last_confirmed, occurrences, is_active, embedding)
         VALUES ($1, $2, $3, $4, $5, 'abstracted', NOW(), NOW(), 1, true, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          uuidv4(),
          context,
          af.fact_type || 'knowledge',
          af.content,
          Math.min(1.0, af.confidence || 0.8),
          embedding.length > 0 ? `[${embedding.join(',')}]` : null,
        ]
      );
      createdFacts.push(af.content);
    }

    logger.info('Memory facts abstracted via tool', {
      sourceCount: loadedFacts.length,
      resultCount: createdFacts.length,
      instruction,
    });

    return `Fakten erfolgreich abstrahiert:
- **Quellen** (${loadedFacts.length}): ${loadedFacts.map(f => `"${f.content.substring(0, 40)}..."`).join(', ')}
- **Abstrahierter Fakt**: ${createdFacts.map((c, i) => `${i + 1}. ${c}`).join('\n  ')}

Die Quell-Fakten wurden als superseded markiert.`;
  } catch (error) {
    logger.error('Tool memory_abstract failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Fakten-Abstraktion. Bitte versuche es erneut.';
  }
}

// ===========================================
// memory_search_and_link
// ===========================================

/**
 * Semantic search for related facts and create relations between them.
 *
 * Tool: memory_search_and_link(query, link_type)
 */
export async function handleMemorySearchAndLink(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const searchQuery = input.query as string | undefined;
  const linkType = (input.link_type as string) || 'related';
  const context = execContext.aiContext;

  if (!searchQuery) {
    return 'Fehler: query (Suchbegriff) ist erforderlich.';
  }

  logger.debug('Tool: memory_search_and_link', { query: searchQuery, linkType, context });

  try {
    // Generate embedding for semantic search
    const embedding = await generateEmbedding(searchQuery);

    if (embedding.length === 0) {
      return 'Fehler: Embedding-Generierung fehlgeschlagen.';
    }

    // Semantic search for related facts
    const searchResult = await queryContext(
      context,
      `SELECT id, content, confidence, fact_type,
              1 - (embedding <=> $1::vector) as similarity
       FROM personalization_facts
       WHERE is_active = true AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 10`,
      [`[${embedding.join(',')}]`]
    );

    const relatedFacts = searchResult.rows.filter(
      (r: { similarity: number }) => r.similarity > 0.5
    );

    if (relatedFacts.length < 2) {
      return `Keine ausreichend verwandten Fakten gefunden fuer "${searchQuery}". Mindestens 2 sind noetig fuer Verlinkung.`;
    }

    // Create links between the top related facts
    let linksCreated = 0;
    for (let i = 0; i < relatedFacts.length - 1 && i < 5; i++) {
      for (let j = i + 1; j < relatedFacts.length && j < 5; j++) {
        try {
          await queryContext(
            context,
            `INSERT INTO knowledge_connections (id, source_idea_id, target_idea_id, relationship_type, strength, context)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [
              uuidv4(),
              relatedFacts[i].id,
              relatedFacts[j].id,
              linkType,
              Math.min(relatedFacts[i].similarity, relatedFacts[j].similarity),
              context,
            ]
          );
          linksCreated++;
        } catch {
          // Link might already exist, that's fine
        }
      }
    }

    const factList = relatedFacts.slice(0, 5).map(
      (f: { content: string; similarity: number }, i: number) =>
        `${i + 1}. "${f.content.substring(0, 60)}..." (Aehnlichkeit: ${(f.similarity * 100).toFixed(0)}%)`
    ).join('\n');

    logger.info('Memory facts linked via tool', {
      query: searchQuery,
      factsFound: relatedFacts.length,
      linksCreated,
      linkType,
    });

    return `${relatedFacts.length} verwandte Fakten gefunden und ${linksCreated} Verknuepfungen erstellt (Typ: ${linkType}):

${factList}`;
  } catch (error) {
    logger.error('Tool memory_search_and_link failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Suche und Verlinkung. Bitte versuche es erneut.';
  }
}
