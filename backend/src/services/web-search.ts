/**
 * Web Search Service
 *
 * Provides web search capabilities using Brave Search API.
 * Privacy-first alternative to Google Search.
 *
 * Features:
 * - Privacy-focused search (no tracking)
 * - Rich snippets with descriptions
 * - Optional deep fetch of top results
 *
 * @module services/web-search
 */

import axios from 'axios';
import { logger } from '../utils/logger';
import { fetchUrl, FetchedContent } from './url-fetch';
import { TIMEOUTS } from '../config/timeouts';

// ===========================================
// Types
// ===========================================

export interface SearchResult {
  /** Result title */
  title: string;
  /** Result URL */
  url: string;
  /** Result snippet/description */
  description: string;
  /** Domain of the result */
  domain: string;
  /** Position in search results */
  position: number;
  /** Published date if available */
  publishedDate?: string;
  /** Extra info (e.g., FAQ, rating) */
  extra?: Record<string, unknown>;
}

export interface SearchResponse {
  /** Original query */
  query: string;
  /** Search results */
  results: SearchResult[];
  /** Total results found (estimated) */
  totalResults: number;
  /** Time taken in ms */
  searchTimeMs: number;
  /** Whether search was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

export interface SearchOptions {
  /** Number of results (default: 5, max: 20) */
  count?: number;
  /** Country code for localization (default: DE) */
  country?: string;
  /** Language code (default: de) */
  language?: string;
  /** Safe search level: off, moderate, strict (default: moderate) */
  safeSearch?: 'off' | 'moderate' | 'strict';
  /** Fetch full content of top N results (default: 0) */
  deepFetchTop?: number;
  /** Timeout in ms (default: 10000) */
  timeout?: number;
}

// ===========================================
// Configuration
// ===========================================

// Brave Search API endpoint
const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

// Fallback to DuckDuckGo HTML if no API key
const DUCKDUCKGO_URL = 'https://html.duckduckgo.com/html/';

// Get API key from environment
function getBraveApiKey(): string | undefined {
  return process.env.BRAVE_SEARCH_API_KEY;
}

// ===========================================
// Web Search Service
// ===========================================

/**
 * Search the web for information
 */
export async function searchWeb(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
  const startTime = Date.now();
  const {
    count = 5,
    country = 'DE',
    language = 'de',
    safeSearch = 'moderate',
    deepFetchTop = 0,
    timeout = TIMEOUTS.WEB_SEARCH,
  } = options;

  if (!query || query.trim().length === 0) {
    return {
      query,
      results: [],
      totalResults: 0,
      searchTimeMs: 0,
      success: false,
      error: 'Suchanfrage darf nicht leer sein.',
    };
  }

  logger.info('Web search', { query, count, country });

  const apiKey = getBraveApiKey();

  try {
    let results: SearchResult[];

    if (apiKey) {
      // Use Brave Search API
      results = await searchWithBrave(query, {
        count: Math.min(count, 20),
        country,
        language,
        safeSearch,
        timeout,
        apiKey,
      });
    } else {
      // Fallback to DuckDuckGo scraping
      logger.warn('No Brave API key, falling back to DuckDuckGo');
      results = await searchWithDuckDuckGo(query, {
        count: Math.min(count, 10),
        timeout,
      });
    }

    // Optionally fetch full content of top results
    if (deepFetchTop > 0 && results.length > 0) {
      const topResults = results.slice(0, deepFetchTop);
      const fetchedContents = await Promise.all(
        topResults.map(r => fetchUrl(r.url, { timeout: TIMEOUTS.WEB_SEARCH_DEEP_FETCH }))
      );

      // Enhance results with fetched content
      for (let i = 0; i < fetchedContents.length; i++) {
        const fetched = fetchedContents[i];
        if (fetched.success && fetched.content) {
          results[i].extra = {
            fullContent: fetched.content.substring(0, 5000),
            wordCount: fetched.wordCount,
            author: fetched.author,
          };
        }
      }
    }

    const searchTimeMs = Date.now() - startTime;

    logger.info('Web search complete', {
      query,
      resultCount: results.length,
      searchTimeMs,
    });

    return {
      query,
      results,
      totalResults: results.length,
      searchTimeMs,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
    logger.error('Web search failed', err instanceof Error ? err : undefined, { query });

    return {
      query,
      results: [],
      totalResults: 0,
      searchTimeMs: Date.now() - startTime,
      success: false,
      error: `Suche fehlgeschlagen: ${errorMessage}`,
    };
  }
}

// ===========================================
// Search Providers
// ===========================================

interface BraveSearchOptions {
  count: number;
  country: string;
  language: string;
  safeSearch: string;
  timeout: number;
  apiKey: string;
}

async function searchWithBrave(query: string, options: BraveSearchOptions): Promise<SearchResult[]> {
  const response = await axios.get(BRAVE_API_URL, {
    params: {
      q: query,
      count: options.count,
      country: options.country,
      search_lang: options.language,
      safesearch: options.safeSearch,
    },
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': options.apiKey,
    },
    timeout: options.timeout,
  });

  const data = response.data;

  if (!data.web?.results) {
    return [];
  }

  return data.web.results.map((result: {
    title?: string;
    url?: string;
    description?: string;
    page_age?: string;
    extra_snippets?: string[];
  }, index: number) => ({
    title: result.title || '',
    url: result.url || '',
    description: result.description || '',
    domain: extractDomain(result.url || ''),
    position: index + 1,
    publishedDate: result.page_age,
    extra: result.extra_snippets ? { snippets: result.extra_snippets } : undefined,
  }));
}

interface DuckDuckGoOptions {
  count: number;
  timeout: number;
}

async function searchWithDuckDuckGo(query: string, options: DuckDuckGoOptions): Promise<SearchResult[]> {
  // DuckDuckGo HTML endpoint (no API key needed)
  const response = await axios.post(DUCKDUCKGO_URL, new URLSearchParams({ q: query }), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ZenAI/1.0 (Web Search; +https://zensation.ai)',
    },
    timeout: options.timeout,
  });

  const html = response.data as string;
  const results: SearchResult[] = [];

  // Parse DuckDuckGo HTML results
  // Results are in div.result elements
  const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;
  let match;
  let position = 0;

  while ((match = resultRegex.exec(html)) !== null && position < options.count) {
    position++;
    const url = decodeURIComponent(match[1].replace(/.*uddg=/, '').split('&')[0] || match[1]);
    results.push({
      title: cleanHtml(match[2]),
      url,
      description: cleanHtml(match[3]),
      domain: extractDomain(url),
      position,
    });
  }

  // Alternative parsing if regex didn't work
  if (results.length === 0) {
    const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*result[^"]*"[^>]*>([^<]*)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null && position < options.count) {
      position++;
      const url = match[1];
      results.push({
        title: cleanHtml(match[2]) || url,
        url,
        description: '',
        domain: extractDomain(url),
        position,
      });
    }
  }

  return results;
}

// ===========================================
// Helpers
// ===========================================

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ===========================================
// Tool Output Formatters
// ===========================================

/**
 * Format search results for tool output
 */
export function formatSearchResults(response: SearchResponse): string {
  if (!response.success) {
    return `Suche fehlgeschlagen: ${response.error}`;
  }

  if (response.results.length === 0) {
    return `Keine Ergebnisse für "${response.query}" gefunden.`;
  }

  const parts: string[] = [];
  parts.push(`**Suchergebnisse für "${response.query}"** (${response.results.length} Ergebnisse)\n`);

  for (const result of response.results) {
    parts.push(`${result.position}. **${result.title}**`);
    parts.push(`   ${result.url}`);
    if (result.description) {
      parts.push(`   ${result.description}`);
    }
    if (result.publishedDate) {
      parts.push(`   _Veröffentlicht: ${result.publishedDate}_`);
    }
    parts.push('');
  }

  parts.push(`_Suche in ${response.searchTimeMs}ms_`);

  return parts.join('\n');
}

/**
 * Format search results with deep fetch content
 */
export function formatSearchResultsWithContent(
  response: SearchResponse,
  fetchedContents: FetchedContent[]
): string {
  if (!response.success) {
    return `Suche fehlgeschlagen: ${response.error}`;
  }

  const parts: string[] = [];
  parts.push(`**Suchergebnisse für "${response.query}"**\n`);

  for (let i = 0; i < response.results.length; i++) {
    const result = response.results[i];
    const fetched = fetchedContents[i];

    parts.push(`---\n### ${result.position}. ${result.title}`);
    parts.push(`URL: ${result.url}`);

    if (fetched?.success && fetched.content) {
      parts.push(`\n${fetched.content.substring(0, 2000)}...`);
      parts.push(`\n_${fetched.wordCount} Wörter_`);
    } else if (result.description) {
      parts.push(`\n${result.description}`);
    }

    parts.push('');
  }

  return parts.join('\n');
}
