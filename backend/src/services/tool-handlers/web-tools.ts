/**
 * Web Tool Handlers
 *
 * Implements web-related Claude Tool Use handlers:
 * - Web search (Brave Search / DuckDuckGo fallback)
 * - URL content fetching
 *
 * @module services/tool-handlers/web-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { searchWeb, formatSearchResults } from '../web-search';
import { fetchUrl, formatForTool, isValidUrl } from '../url-fetch';

/**
 * Web search handler - searches the web for information
 * Uses Brave Search API (privacy-first) with DuckDuckGo fallback
 */
export async function handleWebSearch(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const count = Math.min((input.count as number) || 5, 10);

  if (!query || typeof query !== 'string') {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  logger.debug('Tool: web_search', { query, count });

  try {
    const results = await searchWeb(query, { count });
    return formatSearchResults(results);
  } catch (error) {
    logger.error('Tool web_search failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Websuche. Bitte versuche es erneut.';
  }
}

/**
 * Fetch URL handler - fetches and extracts content from a URL
 * Uses intelligent content extraction for readable output
 */
export async function handleFetchUrl(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const url = input.url as string;

  if (!url || typeof url !== 'string') {
    return 'Fehler: Keine URL angegeben.';
  }

  if (!isValidUrl(url)) {
    return 'Fehler: Ungültige URL. Bitte eine vollständige URL mit http:// oder https:// angeben.';
  }

  logger.debug('Tool: fetch_url', { url });

  try {
    const result = await fetchUrl(url, { timeout: 15000, maxContentLength: 30000 });
    return formatForTool(result);
  } catch (error) {
    logger.error('Tool fetch_url failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der URL: ${url}`;
  }
}
