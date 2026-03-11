/**
 * Email Tool Handlers - Phase 43
 *
 * Tool handlers for "Ask My Inbox" feature.
 * Enables natural language email queries via the chat interface.
 */

import { ToolExecutionContext } from '../claude/tool-use';
import { parseNaturalLanguageQuery, searchEmails, getInboxSummary, formatSearchResultsForChat, formatInboxSummaryForChat } from '../email-search';
import { logger } from '../../utils/logger';

/**
 * Handle ask_inbox tool — search emails with natural language
 */
export async function handleAskInbox(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const question = input.question as string;
  if (!question) {
    return 'Fehler: Keine Frage angegeben.';
  }

  const context = execContext.aiContext;
  logger.debug('Tool: ask_inbox', { question, context });

  try {
    // Check for summary/overview requests
    const isSummaryRequest = /(überblick|übersicht|zusammenfassung|summary|overview|inbox.?status)/i.test(question);

    if (isSummaryRequest) {
      const summary = await getInboxSummary(context);
      return formatInboxSummaryForChat(summary);
    }

    // Parse natural language into structured query
    const query = parseNaturalLanguageQuery(question);
    query.limit = Math.min((input.limit as number) || 10, 20);

    const response = await searchEmails(context, query);
    return formatSearchResultsForChat(response);
  } catch (error) {
    logger.error('Tool ask_inbox failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Inbox-Suche. Bitte versuche es erneut.';
  }
}

/**
 * Handle inbox_summary tool — quick inbox overview
 */
export async function handleInboxSummary(
  _input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const context = execContext.aiContext;
  logger.debug('Tool: inbox_summary', { context });

  try {
    const summary = await getInboxSummary(context);
    return formatInboxSummaryForChat(summary);
  } catch (error) {
    logger.error('Tool inbox_summary failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der Inbox-Übersicht.';
  }
}
