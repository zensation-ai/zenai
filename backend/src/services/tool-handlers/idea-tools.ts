/**
 * Idea Tool Handlers
 *
 * Extracted from index.ts (Phase 120) — contains tool handlers for
 * idea CRUD operations and the safe math calculator.
 *
 * @module services/tool-handlers/idea-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { enhancedRAG } from '../enhanced-rag';
import { queryContext } from '../../utils/database-context';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding } from '../ai';

// ===========================================
// Search Ideas
// ===========================================

export async function handleSearchIdeas(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const limit = (input.limit as number) || 5;
  const context = execContext.aiContext;

  if (!query) {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  logger.debug('Tool: search_ideas', { query, limit, context });

  try {
    const results = await enhancedRAG.quickRetrieve(query, context, limit);

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

// ===========================================
// Create Idea
// ===========================================

export async function handleCreateIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const title = input.title as string;
  const type = input.type as string;
  const summary = input.summary as string;
  const category = (input.category as string) || 'personal';
  const priority = (input.priority as string) || 'medium';
  const nextSteps = input.next_steps as string[] | undefined;
  const context = execContext.aiContext;

  if (!title || !type || !summary) {
    return 'Fehler: Titel, Typ und Zusammenfassung sind erforderlich.';
  }

  logger.debug('Tool: create_idea', { title, type, context });

  try {
    const id = uuidv4();

    // Generate embedding
    const embedding = await generateEmbedding(`${title} ${summary}`);

    // Insert into database
    await queryContext(
      context,
      `INSERT INTO ideas (id, context, title, type, category, priority, summary, next_steps, embedding, raw_transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        context,
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

    const contextLabels: Record<string, string> = { personal: 'Persönlich', work: 'Arbeit', learning: 'Lernen', creative: 'Kreativ' };
    const contextLabel = contextLabels[context] || context;

    return `Idee erfolgreich erstellt:
- **Titel**: ${title}
- **Typ**: ${type}
- **Kategorie**: ${category}
- **Priorität**: ${priority}
- **Bereich**: ${contextLabel}
- **ID**: ${id}`;
  } catch (error) {
    logger.error('Tool create_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Erstellen der Idee. Bitte versuche es erneut.';
  }
}

// ===========================================
// Get Related Ideas
// ===========================================

export async function handleGetRelated(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  const relationshipTypes = input.relationship_types as string[] | undefined;
  const context = execContext.aiContext;

  if (!ideaId) {
    return 'Fehler: Keine Idee-ID angegeben.';
  }

  logger.debug('Tool: get_related_ideas', { ideaId, relationshipTypes, context });

  try {
    // Get the source idea first
    const sourceResult = await queryContext(
      context,
      `SELECT id, title, summary FROM ideas WHERE id = $1 AND context = $2`,
      [ideaId, context]
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

    const params: (string | string[])[] = [ideaId, context];

    if (relationshipTypes && relationshipTypes.length > 0) {
      connectionQuery += ` AND kc.relationship_type = ANY($3)`;
      params.push(relationshipTypes);
    }

    connectionQuery += ` ORDER BY kc.strength DESC LIMIT 10`;

    const relatedResult = await queryContext(context, connectionQuery, params);

    if (relatedResult.rows.length === 0) {
      return `Keine verbundenen Ideen für "${source.title}" gefunden.`;
    }

    const formatted = relatedResult.rows.map((r: { title: string; relationship_type: string; strength: number; summary?: string }, i: number) =>
      `${i + 1}. **${r.title}** (${r.relationship_type}, Stärke: ${(r.strength * 100).toFixed(0)}%)\n   ${r.summary || 'Keine Zusammenfassung'}`
    ).join('\n\n');

    return `Verbundene Ideen zu "${source.title}":\n\n${formatted}`;
  } catch (error) {
    logger.error('Tool get_related_ideas failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der verbundenen Ideen.';
  }
}

// ===========================================
// Safe Math Evaluator (Recursive Descent Parser)
// ===========================================

/**
 * Safe math expression evaluator using recursive descent parsing.
 * Replaces Function()/eval() to eliminate code injection risks.
 * Supports: +, -, *, /, %, parentheses, unary minus, decimal numbers.
 */
function safeEvaluate(expr: string): number {
  // Only allow digits, operators, parentheses, decimal points, whitespace
  const sanitized = expr.replace(/\s/g, '');
  if (!/^[0-9+\-*/().%]+$/.test(sanitized)) {
    throw new Error('Ungültige Zeichen im Ausdruck. Nur Zahlen und +, -, *, /, (), % erlaubt.');
  }
  if (sanitized.length === 0 || !/\d/.test(sanitized)) {
    throw new Error('Ungültiger mathematischer Ausdruck.');
  }

  let pos = 0;

  function parseExpression(): number {
    let result = parseTerm();
    while (pos < sanitized.length && (sanitized[pos] === '+' || sanitized[pos] === '-')) {
      const op = sanitized[pos++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < sanitized.length && (sanitized[pos] === '*' || sanitized[pos] === '/' || sanitized[pos] === '%')) {
      const op = sanitized[pos++];
      const right = parseFactor();
      if ((op === '/' || op === '%') && right === 0) {
        throw new Error('Division durch Null ist nicht erlaubt.');
      }
      if (op === '*') {result *= right;}
      else if (op === '/') {result /= right;}
      else {result %= right;}
    }
    return result;
  }

  function parseFactor(): number {
    // Unary minus
    if (pos < sanitized.length && sanitized[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    // Unary plus
    if (pos < sanitized.length && sanitized[pos] === '+') {
      pos++;
      return parseFactor();
    }
    // Parenthesized expression
    if (pos < sanitized.length && sanitized[pos] === '(') {
      pos++; // skip '('
      const result = parseExpression();
      if (pos >= sanitized.length || sanitized[pos] !== ')') {
        throw new Error('Unbalancierte Klammern im Ausdruck.');
      }
      pos++; // skip ')'
      return result;
    }
    // Number (integer or decimal)
    const start = pos;
    while (pos < sanitized.length && (sanitized[pos] >= '0' && sanitized[pos] <= '9' || sanitized[pos] === '.')) {
      pos++;
    }
    if (pos === start) {
      throw new Error('Ungültiger mathematischer Ausdruck.');
    }
    const numStr = sanitized.slice(start, pos);
    const num = parseFloat(numStr);
    if (isNaN(num)) {
      throw new Error(`Ungültige Zahl: "${numStr}"`);
    }
    return num;
  }

  const result = parseExpression();
  if (pos !== sanitized.length) {
    throw new Error('Ungültiger mathematischer Ausdruck - unerwartete Zeichen am Ende.');
  }
  return result;
}

/**
 * Calculate handler (safe math evaluation)
 */
export async function handleCalculate(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const expression = input.expression as string;

  if (!expression || typeof expression !== 'string') {
    return 'Fehler: Kein mathematischer Ausdruck angegeben.';
  }

  logger.debug('Tool: calculate', { expression });

  try {
    const result = safeEvaluate(expression);

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return 'Fehler: Das Ergebnis ist keine gültige Zahl.';
    }

    return `${expression} = **${result}**`;
  } catch (evalError) {
    const msg = evalError instanceof Error ? evalError.message : 'Ungültiger Ausdruck';
    return `Fehler: ${msg}`;
  }
}

// ===========================================
// CRUD Tools: Update, Archive, Delete Ideas
// ===========================================

export async function handleUpdateIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  if (!ideaId) {return 'Fehler: Keine Idee-ID angegeben.';}

  const context = execContext.aiContext;
  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let paramIdx = 1;

  const fields: [string, string][] = [
    ['title', 'title'],
    ['summary', 'summary'],
    ['priority', 'priority'],
    ['category', 'category'],
    ['type', 'type'],
  ];

  for (const [inputKey, dbCol] of fields) {
    if (input[inputKey] !== undefined) {
      updates.push(`${dbCol} = $${paramIdx++}`);
      values.push(input[inputKey] as string);
    }
  }

  if (updates.length === 0) {
    return 'Fehler: Keine Felder zum Aktualisieren angegeben.';
  }

  updates.push(`updated_at = NOW()`);
  values.push(ideaId, context);

  try {
    const result = await queryContext(
      context,
      `UPDATE ideas SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND context = $${paramIdx} RETURNING id, title`,
      values
    );

    if (result.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    logger.info('Idea updated via tool', { id: ideaId });
    return `Idee "${result.rows[0].title}" erfolgreich aktualisiert.`;
  } catch (error) {
    logger.error('Tool update_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Aktualisieren der Idee.';
  }
}

export async function handleArchiveIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  if (!ideaId) {return 'Fehler: Keine Idee-ID angegeben.';}

  const context = execContext.aiContext;

  try {
    const result = await queryContext(
      context,
      `UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 AND context = $2 RETURNING id, title`,
      [ideaId, context]
    );

    if (result.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    logger.info('Idea archived via tool', { id: ideaId });
    return `Idee "${result.rows[0].title}" wurde archiviert.`;
  } catch (error) {
    logger.error('Tool archive_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Archivieren der Idee.';
  }
}

export async function handleDeleteIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  if (!ideaId) {return 'Fehler: Keine Idee-ID angegeben.';}

  const context = execContext.aiContext;

  try {
    const result = await queryContext(
      context,
      `DELETE FROM ideas WHERE id = $1 AND context = $2 RETURNING id, title`,
      [ideaId, context]
    );

    if (result.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    logger.info('Idea deleted via tool', { id: ideaId });
    return `Idee "${result.rows[0].title}" wurde geloescht.`;
  } catch (error) {
    logger.error('Tool delete_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Loeschen der Idee.';
  }
}
