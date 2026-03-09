/**
 * Phase 49: Citation Tracker
 *
 * Source attribution system for AI responses. Assigns citation numbers
 * to retrieved sources, formats them for LLM context, and tracks which
 * citations were actually used in responses.
 *
 * @module services/rag/citation-tracker
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { EnhancedResult } from '../enhanced-rag';

// ===========================================
// Types & Interfaces
// ===========================================

export type SourceType = 'idea' | 'document' | 'chat' | 'web';

export interface SourceAttribution {
  /** Citation number: [1], [2], etc. */
  index: number;
  /** Source record ID */
  id: string;
  /** Source title */
  title: string;
  /** Source type */
  type: SourceType;
  /** Relevant text snippet */
  snippet: string;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Optional URL for web sources */
  url?: string;
}

export interface CitationResult {
  /** Ordered list of source attributions */
  sources: SourceAttribution[];
  /** Map from source_id to citation number */
  citationMap: Map<string, number>;
}

// ===========================================
// Constants
// ===========================================

/** Maximum snippet length for citations */
const MAX_SNIPPET_LENGTH = 200;

/** Regex to find citation markers like [1], [2] in text */
const CITATION_PATTERN = /\[(\d+)\]/g;

// ===========================================
// Citation Creation
// ===========================================

/**
 * Create citation assignments from retrieval results.
 * Assigns sequential numbers starting from 1.
 */
export function createCitations(results: EnhancedResult[]): CitationResult {
  const sources: SourceAttribution[] = [];
  const citationMap = new Map<string, number>();

  results.forEach((result, idx) => {
    const index = idx + 1;

    // Determine source type from result metadata
    const type = inferSourceType(result);

    // Create snippet from content or summary
    const rawSnippet = result.content || result.summary || '';
    const snippet = rawSnippet.length > MAX_SNIPPET_LENGTH
      ? rawSnippet.substring(0, MAX_SNIPPET_LENGTH).trim() + '...'
      : rawSnippet;

    sources.push({
      index,
      id: result.id,
      title: result.title || `Quelle ${index}`,
      type,
      snippet,
      relevanceScore: result.score,
    });

    citationMap.set(result.id, index);
  });

  return { sources, citationMap };
}

/**
 * Infer the source type from an EnhancedResult.
 */
function inferSourceType(result: EnhancedResult): SourceType {
  // Check sources array for hints
  const sourcesStr = (result.sources || []).join(' ').toLowerCase();

  if (sourcesStr.includes('web') || sourcesStr.includes('url')) return 'web';
  if (sourcesStr.includes('chat') || sourcesStr.includes('conversation')) return 'chat';
  if (sourcesStr.includes('document') || sourcesStr.includes('doc')) return 'document';

  // Default to idea (most common in ZenAI)
  return 'idea';
}

// ===========================================
// Context Formatting
// ===========================================

/**
 * Format retrieval results with citation markers for LLM context.
 * Each source is labeled with [N] so the LLM can reference them.
 */
export function formatCitationContext(
  results: EnhancedResult[],
  citations: CitationResult
): string {
  if (results.length === 0) return '';

  const sections = results.map((result) => {
    const citationNum = citations.citationMap.get(result.id);
    if (citationNum === undefined) return '';

    const content = result.content || result.summary || '';
    const title = result.title || 'Unbenannt';

    return `[${citationNum}] "${title}":\n${content}`;
  }).filter(Boolean);

  return `Verfuegbare Quellen:\n\n${sections.join('\n\n---\n\n')}\n\nBitte referenziere Quellen mit [N] wenn du sie verwendest.`;
}

// ===========================================
// Citation Extraction
// ===========================================

/**
 * Extract which citations were actually used in the AI response.
 * Parses [N] markers from the response text and maps them back to sources.
 */
export function extractCitationsFromResponse(
  response: string,
  citations: CitationResult
): SourceAttribution[] {
  const usedIndices = new Set<number>();

  let match: RegExpExecArray | null;
  const regex = new RegExp(CITATION_PATTERN.source, 'g');

  while ((match = regex.exec(response)) !== null) {
    const index = parseInt(match[1], 10);
    if (index > 0 && index <= citations.sources.length) {
      usedIndices.add(index);
    }
  }

  return citations.sources.filter(s => usedIndices.has(s.index));
}

// ===========================================
// Persistence
// ===========================================

/**
 * Save citation attributions to the database for a chat message.
 */
export async function saveCitations(
  chatMessageId: string,
  citations: SourceAttribution[],
  context: AIContext
): Promise<void> {
  if (citations.length === 0) return;

  try {
    // Insert all citations in a single query using UNNEST
    const ids = citations.map(c => c.id);
    const indices = citations.map(c => c.index);
    const titles = citations.map(c => c.title);
    const types = citations.map(c => c.type);
    const snippets = citations.map(c => c.snippet);
    const scores = citations.map(c => c.relevanceScore);

    await queryContext(
      context,
      `INSERT INTO message_citations (
        chat_message_id, source_id, citation_index, title, source_type, snippet, relevance_score
      )
      SELECT
        $1,
        unnest($2::text[]),
        unnest($3::int[]),
        unnest($4::text[]),
        unnest($5::text[]),
        unnest($6::text[]),
        unnest($7::float[])
      ON CONFLICT (chat_message_id, citation_index) DO UPDATE SET
        source_id = EXCLUDED.source_id,
        title = EXCLUDED.title,
        snippet = EXCLUDED.snippet,
        relevance_score = EXCLUDED.relevance_score`,
      [chatMessageId, ids, indices, titles, types, snippets, scores]
    );

    logger.debug('Citations saved', {
      chatMessageId,
      count: citations.length,
      context,
    });
  } catch (error) {
    // Non-critical: log but don't throw
    logger.warn('Failed to save citations', { chatMessageId, error });
  }
}

/**
 * Retrieve saved citations for a chat message.
 */
export async function getCitations(
  chatMessageId: string,
  context: AIContext
): Promise<SourceAttribution[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT source_id, citation_index, title, source_type, snippet, relevance_score
       FROM message_citations
       WHERE chat_message_id = $1
       ORDER BY citation_index ASC`,
      [chatMessageId]
    );

    return result.rows.map((row: {
      source_id: string;
      citation_index: number;
      title: string;
      source_type: string;
      snippet: string;
      relevance_score: number;
    }) => ({
      index: row.citation_index,
      id: row.source_id,
      title: row.title,
      type: row.source_type as SourceType,
      snippet: row.snippet,
      relevanceScore: row.relevance_score,
    }));
  } catch (error) {
    logger.warn('Failed to get citations', { chatMessageId, error });
    return [];
  }
}
