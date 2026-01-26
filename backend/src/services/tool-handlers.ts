/**
 * Tool Handlers
 *
 * Implements the actual functionality for Claude Tool Use.
 * Connects the abstract tool definitions with real operations.
 *
 * @module services/tool-handlers
 */

import { logger } from '../utils/logger';
import {
  toolRegistry,
  TOOL_SEARCH_IDEAS,
  TOOL_CREATE_IDEA,
  TOOL_GET_RELATED,
  TOOL_CALCULATE,
} from './claude/tool-use';
import { enhancedRAG } from './enhanced-rag';
import { AIContext, queryContext } from '../utils/database-context';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding } from './ai';

// ===========================================
// State Management
// ===========================================

/**
 * Current context for tool execution
 * Set this before executing tools that need context
 */
let currentContext: AIContext = 'personal';

/**
 * Set the current context for tool execution
 */
export function setToolContext(context: AIContext): void {
  currentContext = context;
}

/**
 * Get the current context
 */
export function getToolContext(): AIContext {
  return currentContext;
}

// ===========================================
// Tool Handler Implementations
// ===========================================

/**
 * Search ideas handler
 */
async function handleSearchIdeas(input: Record<string, unknown>): Promise<string> {
  const query = input.query as string;
  const limit = (input.limit as number) || 5;

  if (!query) {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  logger.debug('Tool: search_ideas', { query, limit, context: currentContext });

  try {
    const results = await enhancedRAG.quickRetrieve(query, currentContext, limit);

    if (results.length === 0) {
      return `Keine Ideen gefunden für: "${query}"`;
    }

    const formatted = results.map((r, i) =>
      `${i + 1}. **${r.title}** (Score: ${(r.score * 100).toFixed(0)}%)\n   ${r.summary || 'Keine Zusammenfassung'}`
    ).join('\n\n');

    return `Gefundene Ideen (${results.length}):\n\n${formatted}`;
  } catch (error) {
    logger.error('Tool search_ideas failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Suche. Bitte versuche es erneut.';
  }
}

/**
 * Create idea handler
 */
async function handleCreateIdea(input: Record<string, unknown>): Promise<string> {
  const title = input.title as string;
  const type = input.type as string;
  const summary = input.summary as string;
  const category = (input.category as string) || 'personal';
  const priority = (input.priority as string) || 'medium';
  const nextSteps = input.next_steps as string[] | undefined;

  if (!title || !type || !summary) {
    return 'Fehler: Titel, Typ und Zusammenfassung sind erforderlich.';
  }

  logger.debug('Tool: create_idea', { title, type, context: currentContext });

  try {
    const id = uuidv4();

    // Generate embedding
    const embedding = await generateEmbedding(`${title} ${summary}`);

    // Insert into database
    await queryContext(
      currentContext,
      `INSERT INTO ideas (id, context, title, type, category, priority, summary, next_steps, embedding, raw_transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        currentContext,
        title,
        type,
        category,
        priority,
        summary,
        nextSteps ? JSON.stringify(nextSteps) : null,
        embedding.length > 0 ? `[${embedding.join(',')}]` : null,
        summary, // Use summary as raw_transcript
      ]
    );

    logger.info('Idea created via tool', { id, title });

    return `Idee erfolgreich erstellt:
- **Titel**: ${title}
- **Typ**: ${type}
- **Kategorie**: ${category}
- **Priorität**: ${priority}
- **ID**: ${id}`;
  } catch (error) {
    logger.error('Tool create_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Erstellen der Idee. Bitte versuche es erneut.';
  }
}

/**
 * Get related ideas handler
 */
async function handleGetRelated(input: Record<string, unknown>): Promise<string> {
  const ideaId = input.idea_id as string;
  const relationshipTypes = input.relationship_types as string[] | undefined;

  if (!ideaId) {
    return 'Fehler: Keine Idee-ID angegeben.';
  }

  logger.debug('Tool: get_related_ideas', { ideaId, relationshipTypes });

  try {
    // Get the source idea first
    const sourceResult = await queryContext(
      currentContext,
      `SELECT id, title, summary FROM ideas WHERE id = $1 AND context = $2`,
      [ideaId, currentContext]
    );

    if (sourceResult.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    const source = sourceResult.rows[0];

    // Get connections from knowledge graph
    let connectionQuery = `
      SELECT
        CASE WHEN kc.source_idea_id = $1 THEN kc.target_idea_id ELSE kc.source_idea_id END as related_id,
        kc.relationship_type,
        kc.strength,
        i.title,
        i.summary
      FROM knowledge_connections kc
      JOIN ideas i ON i.id = CASE WHEN kc.source_idea_id = $1 THEN kc.target_idea_id ELSE kc.source_idea_id END
      WHERE (kc.source_idea_id = $1 OR kc.target_idea_id = $1)
        AND i.context = $2
        AND i.is_archived = false
    `;

    const params: (string | string[])[] = [ideaId, currentContext];

    if (relationshipTypes && relationshipTypes.length > 0) {
      connectionQuery += ` AND kc.relationship_type = ANY($3)`;
      params.push(relationshipTypes);
    }

    connectionQuery += ` ORDER BY kc.strength DESC LIMIT 10`;

    const relatedResult = await queryContext(currentContext, connectionQuery, params);

    if (relatedResult.rows.length === 0) {
      return `Keine verbundenen Ideen für "${source.title}" gefunden.`;
    }

    const formatted = relatedResult.rows.map((r: any, i: number) =>
      `${i + 1}. **${r.title}** (${r.relationship_type}, Stärke: ${(r.strength * 100).toFixed(0)}%)\n   ${r.summary || 'Keine Zusammenfassung'}`
    ).join('\n\n');

    return `Verbundene Ideen zu "${source.title}":\n\n${formatted}`;
  } catch (error) {
    logger.error('Tool get_related_ideas failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der verbundenen Ideen.';
  }
}

/**
 * Calculate handler (safe math evaluation)
 */
async function handleCalculate(input: Record<string, unknown>): Promise<string> {
  const expression = input.expression as string;

  if (!expression) {
    return 'Fehler: Kein mathematischer Ausdruck angegeben.';
  }

  logger.debug('Tool: calculate', { expression });

  try {
    // Safe math evaluation - only allow numbers and basic operators
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');

    if (sanitized !== expression.replace(/\s/g, '')) {
      return 'Fehler: Ungültige Zeichen im Ausdruck. Nur Zahlen und +, -, *, /, (), % erlaubt.';
    }

    // Use Function constructor for evaluation (safer than eval but still limited)
    const result = Function(`"use strict"; return (${sanitized})`)();

    if (typeof result !== 'number' || !isFinite(result)) {
      return 'Fehler: Das Ergebnis ist keine gültige Zahl.';
    }

    return `${expression} = **${result}**`;
  } catch (error) {
    return `Fehler: Ungültiger mathematischer Ausdruck "${expression}"`;
  }
}

// ===========================================
// Registration
// ===========================================

/**
 * Register all tool handlers
 * Call this during application startup
 */
export function registerAllToolHandlers(): void {
  logger.info('Registering tool handlers');

  toolRegistry.register(TOOL_SEARCH_IDEAS, handleSearchIdeas);
  toolRegistry.register(TOOL_CREATE_IDEA, handleCreateIdea);
  toolRegistry.register(TOOL_GET_RELATED, handleGetRelated);
  toolRegistry.register(TOOL_CALCULATE, handleCalculate);

  logger.info('Tool handlers registered', {
    tools: ['search_ideas', 'create_idea', 'get_related_ideas', 'calculate'],
  });
}

/**
 * Check if handlers are registered
 */
export function areToolsRegistered(): boolean {
  return toolRegistry.has('search_ideas');
}
