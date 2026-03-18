/**
 * Global AI Search Service
 *
 * Unified search across the entire ZenAI platform:
 * - Ideas (semantic + keyword)
 * - Documents (semantic + keyword)
 * - Voice Memos (transcript search)
 * - Meetings (title + notes search)
 * - Learned Facts (AI memory search)
 * - Chat History (conversation search)
 *
 * Uses parallel execution for speed and normalizes scores
 * across different result types for consistent ranking.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export type SearchResultType = 'idea' | 'document' | 'voice_memo' | 'meeting' | 'fact' | 'chat' | 'contact' | 'email' | 'calendar_event' | 'transaction' | 'screen_capture';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  snippet: string;
  score: number; // 0-1 normalized relevance
  context: AIContext;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface GlobalSearchOptions {
  query: string;
  contexts?: AIContext[];
  types?: SearchResultType[];
  limit?: number;
  /** Include AI memory (facts, episodes) in search */
  includeMemory?: boolean;
}

export interface GlobalSearchResult {
  query: string;
  totalResults: number;
  results: SearchResult[];
  timing: {
    totalMs: number;
    perType: Record<string, number>;
  };
  searchedTypes: SearchResultType[];
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
  PER_TYPE_LIMIT: 10,
  /** Minimum query length for search */
  MIN_QUERY_LENGTH: 2,
  /** All searchable contexts */
  ALL_CONTEXTS: ['personal', 'work', 'learning', 'creative'] as AIContext[],
  /** All searchable types */
  ALL_TYPES: ['idea', 'document', 'voice_memo', 'meeting', 'fact', 'chat', 'contact', 'email', 'calendar_event', 'transaction', 'screen_capture'] as SearchResultType[],
};

// ===========================================
// Global Search Service
// ===========================================

class GlobalSearchService {

  /**
   * Execute a global search across all content types
   */
  async search(options: GlobalSearchOptions): Promise<GlobalSearchResult> {
    const start = Date.now();
    const {
      query,
      contexts = CONFIG.ALL_CONTEXTS,
      types = CONFIG.ALL_TYPES,
      limit = CONFIG.DEFAULT_LIMIT,
      includeMemory = true,
    } = options;

    if (query.length < CONFIG.MIN_QUERY_LENGTH) {
      return {
        query,
        totalResults: 0,
        results: [],
        timing: { totalMs: 0, perType: {} },
        searchedTypes: [],
      };
    }

    const perTypeLimit = Math.min(CONFIG.PER_TYPE_LIMIT, limit);
    const searchPattern = `%${query.replace(/%/g, '')}%`;
    const timing: Record<string, number> = {};
    const allResults: SearchResult[] = [];

    // Build search promises for all requested types in parallel
    const searchPromises: Promise<void>[] = [];

    for (const context of contexts) {
      if (types.includes('idea')) {
        searchPromises.push(
          this.searchIdeas(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Idea search failed', { context, error: err }))
        );
      }

      if (types.includes('document')) {
        searchPromises.push(
          this.searchDocuments(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Document search failed', { context, error: err }))
        );
      }

      if (types.includes('voice_memo')) {
        searchPromises.push(
          this.searchVoiceMemos(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Voice memo search failed', { context, error: err }))
        );
      }

      if (types.includes('meeting')) {
        searchPromises.push(
          this.searchMeetings(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Meeting search failed', { context, error: err }))
        );
      }

      if (types.includes('fact') && includeMemory) {
        searchPromises.push(
          this.searchFacts(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Fact search failed', { context, error: err }))
        );
      }

      if (types.includes('chat')) {
        searchPromises.push(
          this.searchChatHistory(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Chat search failed', { context, error: err }))
        );
      }

      // Phase 8: New domain searches
      if (types.includes('contact')) {
        searchPromises.push(
          this.searchContacts(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Contact search failed', { context, error: err }))
        );
      }

      if (types.includes('email')) {
        searchPromises.push(
          this.searchEmails(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Email search failed', { context, error: err }))
        );
      }

      if (types.includes('calendar_event')) {
        searchPromises.push(
          this.searchCalendarEvents(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Calendar search failed', { context, error: err }))
        );
      }

      if (types.includes('transaction')) {
        searchPromises.push(
          this.searchTransactions(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Transaction search failed', { context, error: err }))
        );
      }

      if (types.includes('screen_capture')) {
        searchPromises.push(
          this.searchScreenCaptures(context, searchPattern, perTypeLimit)
            .then(results => { allResults.push(...results); })
            .catch(err => logger.debug('Screen capture search failed', { context, error: err }))
        );
      }
    }

    // Execute all searches in parallel
    const searchStart = Date.now();
    await Promise.allSettled(searchPromises);
    timing['parallel_search'] = Date.now() - searchStart;

    // Sort by score descending and limit
    const sortedResults = allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(limit, CONFIG.MAX_LIMIT));

    // Deduplicate by ID (same item might appear in multiple contexts)
    const seen = new Set<string>();
    const deduped = sortedResults.filter(r => {
      const key = `${r.type}:${r.id}`;
      if (seen.has(key)) {return false;}
      seen.add(key);
      return true;
    });

    const totalMs = Date.now() - start;

    logger.info('Global search executed', {
      query: query.substring(0, 50),
      contexts: contexts.length,
      types,
      totalResults: deduped.length,
      totalMs,
    });

    return {
      query,
      totalResults: deduped.length,
      results: deduped,
      timing: { totalMs, perType: timing },
      searchedTypes: types,
    };
  }

  // ===========================================
  // Type-Specific Search Methods
  // ===========================================

  private async searchIdeas(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    const result = await queryContext(
      context,
      `SELECT id, title, summary, type, category, priority, created_at,
              CASE
                WHEN title ILIKE $2 THEN 0.9
                WHEN summary ILIKE $2 THEN 0.7
                WHEN raw_transcript ILIKE $2 THEN 0.5
                ELSE 0.3
              END as score
       FROM ideas
       WHERE context = $1
         AND is_archived = false
         AND (title ILIKE $2 OR summary ILIKE $2 OR raw_transcript ILIKE $2 OR keywords::text ILIKE $2)
       ORDER BY score DESC, created_at DESC
       LIMIT $3`,
      [context, pattern, limit]
    );

    return result.rows.map(row => ({
      id: row.id as string,
      type: 'idea' as SearchResultType,
      title: row.title as string || 'Untitled Idea',
      snippet: this.truncate(row.summary as string || '', 150),
      score: Number(row.score),
      context,
      createdAt: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
      metadata: {
        ideaType: row.type,
        category: row.category,
        priority: row.priority,
      },
    }));
  }

  private async searchDocuments(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, title, description, file_type, created_at,
                CASE
                  WHEN title ILIKE $2 THEN 0.85
                  WHEN description ILIKE $2 THEN 0.65
                  ELSE 0.4
                END as score
         FROM documents
         WHERE context = $1
           AND (title ILIKE $2 OR description ILIKE $2)
         ORDER BY score DESC, created_at DESC
         LIMIT $3`,
        [context, pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'document' as SearchResultType,
        title: row.title as string || 'Untitled Document',
        snippet: this.truncate(row.description as string || '', 150),
        score: Number(row.score),
        context,
        createdAt: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { fileType: row.file_type },
      }));
    } catch (e) {
      logger.warn('searchDocuments failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchVoiceMemos(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, title, transcript, summary, created_at,
                CASE
                  WHEN title ILIKE $2 THEN 0.8
                  WHEN summary ILIKE $2 THEN 0.65
                  WHEN transcript ILIKE $2 THEN 0.5
                  ELSE 0.3
                END as score
         FROM voice_memos
         WHERE context = $1
           AND (title ILIKE $2 OR transcript ILIKE $2 OR summary ILIKE $2)
         ORDER BY score DESC, created_at DESC
         LIMIT $3`,
        [context, pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'voice_memo' as SearchResultType,
        title: row.title as string || 'Voice Memo',
        snippet: this.truncate(row.summary as string || row.transcript as string || '', 150),
        score: Number(row.score),
        context,
        createdAt: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: {},
      }));
    } catch (e) {
      logger.warn('searchVoiceMemos failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchMeetings(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, title, notes, meeting_type, date, created_at,
                CASE
                  WHEN title ILIKE $2 THEN 0.85
                  WHEN notes ILIKE $2 THEN 0.6
                  ELSE 0.3
                END as score
         FROM meetings
         WHERE context = $1
           AND (title ILIKE $2 OR notes ILIKE $2)
         ORDER BY score DESC, date DESC
         LIMIT $3`,
        [context, pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'meeting' as SearchResultType,
        title: row.title as string || 'Meeting',
        snippet: this.truncate(row.notes as string || '', 150),
        score: Number(row.score),
        context,
        createdAt: (row.date as Date)?.toISOString() || (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { meetingType: row.meeting_type },
      }));
    } catch (e) {
      logger.warn('searchMeetings failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchFacts(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, fact_type, content, confidence, source, created_at,
                CASE
                  WHEN content ILIKE $2 THEN 0.75 * confidence
                  ELSE 0.3 * confidence
                END as score
         FROM learned_facts
         WHERE context = $1
           AND content ILIKE $2
           AND confidence > 0.3
         ORDER BY score DESC, created_at DESC
         LIMIT $3`,
        [context, pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'fact' as SearchResultType,
        title: `KI-Wissen: ${(row.fact_type as string || 'unknown')}`,
        snippet: this.truncate(row.content as string || '', 150),
        score: Number(row.score),
        context,
        createdAt: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: {
          factType: row.fact_type,
          confidence: row.confidence,
          source: row.source,
        },
      }));
    } catch (e) {
      logger.warn('searchFacts failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchChatHistory(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT m.id, m.content, m.role, m.session_id, m.created_at,
                s.title as session_title,
                CASE
                  WHEN m.content ILIKE $2 THEN 0.7
                  ELSE 0.3
                END as score
         FROM general_chat_messages m
         LEFT JOIN general_chat_sessions s ON m.session_id = s.id
         WHERE m.context = $1
           AND m.content ILIKE $2
           AND m.role = 'user'
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [context, pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.session_id as string || row.id as string,
        type: 'chat' as SearchResultType,
        title: row.session_title as string || 'Chat-Nachricht',
        snippet: this.truncate(row.content as string || '', 150),
        score: Number(row.score),
        context,
        createdAt: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { messageId: row.id, role: row.role },
      }));
    } catch (e) {
      logger.warn('searchChatHistory failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  // ===========================================
  // Phase 8: New Domain Search Methods
  // ===========================================

  private async searchContacts(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, display_name, email, role, organization_id, relationship_type, ai_summary, created_at,
                CASE
                  WHEN display_name ILIKE $1 THEN 0.9
                  WHEN email::text ILIKE $1 THEN 0.8
                  WHEN role ILIKE $1 THEN 0.6
                  ELSE 0.4
                END as score
         FROM contacts
         WHERE display_name ILIKE $1 OR email::text ILIKE $1 OR role ILIKE $1 OR notes ILIKE $1
         ORDER BY score DESC, updated_at DESC
         LIMIT $2`,
        [pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'contact' as SearchResultType,
        title: row.display_name as string,
        snippet: this.truncate(
          [row.role, row.ai_summary].filter(Boolean).join(' - ') || (row.email as string[])?.join(', ') || '',
          150
        ),
        score: Number(row.score),
        context,
        createdAt: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { relationship_type: row.relationship_type, email: row.email },
      }));
    } catch (e) {
      logger.warn('searchContacts failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchEmails(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, subject, from_address, to_addresses, ai_summary, direction, status, created_at,
                CASE
                  WHEN subject ILIKE $1 THEN 0.85
                  WHEN from_address ILIKE $1 THEN 0.7
                  WHEN ai_summary ILIKE $1 THEN 0.6
                  ELSE 0.4
                END as score
         FROM emails
         WHERE (subject ILIKE $1 OR from_address ILIKE $1 OR to_addresses::text ILIKE $1 OR ai_summary ILIKE $1)
           AND status != 'trash'
         ORDER BY score DESC, created_at DESC
         LIMIT $2`,
        [pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'email' as SearchResultType,
        title: row.subject as string || 'Kein Betreff',
        snippet: this.truncate(row.ai_summary as string || `Von: ${row.from_address}`, 150),
        score: Number(row.score),
        context,
        createdAt: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { from: row.from_address, direction: row.direction, status: row.status },
      }));
    } catch (e) {
      logger.warn('searchEmails failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchCalendarEvents(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, title, description, location, start_time, end_time, created_at,
                CASE
                  WHEN title ILIKE $1 THEN 0.85
                  WHEN description ILIKE $1 THEN 0.65
                  WHEN location ILIKE $1 THEN 0.5
                  ELSE 0.3
                END as score
         FROM calendar_events
         WHERE (title ILIKE $1 OR description ILIKE $1 OR location ILIKE $1)
         ORDER BY score DESC, start_time DESC
         LIMIT $2`,
        [pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'calendar_event' as SearchResultType,
        title: row.title as string || 'Termin',
        snippet: this.truncate(
          [row.description, row.location ? `Ort: ${row.location}` : ''].filter(Boolean).join(' | ') || '',
          150
        ),
        score: Number(row.score),
        context,
        createdAt: (row.start_time as Date)?.toISOString() || (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { start_time: row.start_time, end_time: row.end_time, location: row.location },
      }));
    } catch (e) {
      logger.warn('searchCalendarEvents failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchTransactions(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, amount, currency, transaction_type, category, payee, description, transaction_date, created_at,
                CASE
                  WHEN payee ILIKE $1 THEN 0.8
                  WHEN description ILIKE $1 THEN 0.65
                  WHEN category ILIKE $1 THEN 0.5
                  ELSE 0.3
                END as score
         FROM transactions
         WHERE (payee ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
         ORDER BY score DESC, transaction_date DESC
         LIMIT $2`,
        [pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'transaction' as SearchResultType,
        title: `${row.payee || row.category || 'Transaktion'}: ${row.amount} ${row.currency || 'EUR'}`,
        snippet: this.truncate(row.description as string || `${row.transaction_type} - ${row.category}`, 150),
        score: Number(row.score),
        context,
        createdAt: (row.transaction_date as Date)?.toISOString() || (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { amount: row.amount, currency: row.currency, category: row.category, transaction_type: row.transaction_type },
      }));
    } catch (e) {
      logger.warn('searchTransactions failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private async searchScreenCaptures(
    context: AIContext, pattern: string, limit: number
  ): Promise<SearchResult[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, timestamp, app_name, window_title, url, ocr_text, duration_seconds, created_at,
                CASE
                  WHEN window_title ILIKE $1 THEN 0.8
                  WHEN app_name ILIKE $1 THEN 0.7
                  WHEN url ILIKE $1 THEN 0.6
                  WHEN ocr_text ILIKE $1 THEN 0.5
                  ELSE 0.3
                END as score
         FROM screen_captures
         WHERE (window_title ILIKE $1 OR app_name ILIKE $1 OR url ILIKE $1 OR ocr_text ILIKE $1)
           AND is_sensitive = false
         ORDER BY score DESC, timestamp DESC
         LIMIT $2`,
        [pattern, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        type: 'screen_capture' as SearchResultType,
        title: row.window_title as string || row.app_name as string || 'Screen Capture',
        snippet: this.truncate(row.ocr_text as string || row.url as string || '', 150),
        score: Number(row.score),
        context,
        createdAt: (row.timestamp as Date)?.toISOString() || (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        metadata: { app_name: row.app_name, url: row.url, duration: row.duration_seconds },
      }));
    } catch (e) {
      logger.warn('searchScreenCaptures failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) {return text;}
    return text.substring(0, maxLen - 3) + '...';
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const globalSearch = new GlobalSearchService();
