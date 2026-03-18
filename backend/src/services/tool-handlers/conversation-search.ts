/**
 * Phase 101 B2: Conversation Search Tool Handlers
 *
 * Two Claude tools for searching past conversations:
 * 1. conversation_search — full-text search using tsvector + ts_rank
 * 2. conversation_search_date — date-filtered conversation search
 *
 * Uses the search_vector tsvector column added in phase101_legendary_quality.sql
 *
 * @module services/tool-handlers/conversation-search
 */

import { logger } from '../../utils/logger';
import { ToolDefinition, ToolExecutionContext } from '../claude/tool-use';
import { queryContext } from '../../utils/database-context';

// ===========================================
// Tool Definitions
// ===========================================

export const TOOL_CONVERSATION_SEARCH: ToolDefinition = {
  name: 'conversation_search',
  description: 'Konversationssuche — Durchsucht vergangene Gespraeche nach relevanten Nachrichten. Nutze dieses Tool um frueheren Kontext, Entscheidungen oder besprochene Themen zu finden.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchbegriff oder Phrase (Volltextsuche)',
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 10, Max: 20)',
      },
    },
    required: ['query'],
  },
};

export const TOOL_CONVERSATION_SEARCH_DATE: ToolDefinition = {
  name: 'conversation_search_date',
  description: 'Zeitbasierte Konversationssuche — Sucht in einem Zeitfenster nach vergangenen Gespraechen. Nutze dieses Tool wenn du weisst dass ein Gespraech in einem bestimmten Zeitraum stattfand.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchbegriff oder Phrase',
      },
      from_date: {
        type: 'string',
        description: 'Startdatum im Format YYYY-MM-DD',
      },
      to_date: {
        type: 'string',
        description: 'Enddatum im Format YYYY-MM-DD',
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 10, Max: 20)',
      },
    },
    required: ['query', 'from_date', 'to_date'],
  },
};

// ===========================================
// ISO date validation
// ===========================================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

// ===========================================
// Handler: conversation_search
// ===========================================

export async function handleConversationSearch(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const limit = Math.min((input.limit as number) || 10, 20);
  const context = execContext.aiContext;

  if (!query || typeof query !== 'string') {
    return 'Fehler: Kein Suchbegriff angegeben.';
  }

  logger.debug('Tool: conversation_search', { query, limit, context });

  try {
    const result = await queryContext(
      context,
      `SELECT
        cm.id AS message_id,
        cm.session_id,
        cm.role,
        cm.content,
        cm.created_at,
        ts_rank(cm.search_vector, plainto_tsquery('simple', $1)) AS rank
      FROM chat_messages cm
      WHERE cm.search_vector @@ plainto_tsquery('simple', $1)
      ORDER BY rank DESC, cm.created_at DESC
      LIMIT $2`,
      [query, limit]
    );

    if (result.rows.length === 0) {
      return `Keine Gespraeche gefunden fuer: "${query}"`;
    }

    const formatted = result.rows.map((row, i) => {
      const date = new Date(row.created_at).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const role = row.role === 'user' ? 'Du' : 'KI';
      const preview = String(row.content || '').substring(0, 120);
      return `${i + 1}. [${date}] ${role}: "${preview}${preview.length >= 120 ? '...' : ''}"`;
    }).join('\n');

    return `${result.rows.length} Nachrichten gefunden fuer "${query}":\n\n${formatted}`;
  } catch (error) {
    logger.error('Tool conversation_search failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Konversationssuche. Bitte versuche es erneut.';
  }
}

// ===========================================
// Handler: conversation_search_date
// ===========================================

export async function handleConversationSearchDate(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const fromDate = input.from_date as string;
  const toDate = input.to_date as string;
  const limit = Math.min((input.limit as number) || 10, 20);
  const context = execContext.aiContext;

  if (!query || typeof query !== 'string') {
    return 'Fehler: Kein Suchbegriff angegeben.';
  }

  if (!fromDate || !isValidDate(fromDate)) {
    return `Fehler: Ungueltes Startdatum "${fromDate}". Bitte Format YYYY-MM-DD verwenden.`;
  }

  if (!toDate || !isValidDate(toDate)) {
    return `Fehler: Ungueltes Enddatum "${toDate}". Bitte Format YYYY-MM-DD verwenden.`;
  }

  logger.debug('Tool: conversation_search_date', { query, fromDate, toDate, limit, context });

  try {
    const result = await queryContext(
      context,
      `SELECT
        cm.id AS message_id,
        cm.session_id,
        cm.role,
        cm.content,
        cm.created_at,
        ts_rank(cm.search_vector, plainto_tsquery('simple', $1)) AS rank
      FROM chat_messages cm
      WHERE cm.search_vector @@ plainto_tsquery('simple', $1)
        AND cm.created_at >= $2::date
        AND cm.created_at < ($3::date + INTERVAL '1 day')
      ORDER BY rank DESC, cm.created_at DESC
      LIMIT $4`,
      [query, fromDate, toDate, limit]
    );

    if (result.rows.length === 0) {
      return `Keine Gespraeche gefunden fuer "${query}" im Zeitraum ${fromDate} bis ${toDate}.`;
    }

    const formatted = result.rows.map((row, i) => {
      const date = new Date(row.created_at).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const role = row.role === 'user' ? 'Du' : 'KI';
      const preview = String(row.content || '').substring(0, 120);
      return `${i + 1}. [${date}] ${role}: "${preview}${preview.length >= 120 ? '...' : ''}"`;
    }).join('\n');

    return `${result.rows.length} Nachrichten gefunden fuer "${query}" (${fromDate} – ${toDate}):\n\n${formatted}`;
  } catch (error) {
    logger.error('Tool conversation_search_date failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der zeitbasierten Konversationssuche. Bitte versuche es erneut.';
  }
}
