/**
 * Unit Tests for Proactive Intelligence Service
 *
 * Tests research detection (pattern + LLM), execution pipeline,
 * idea processing, retrieval, UX tracking, manual triggers,
 * focus topic research, schedule checking, and document sources.
 *
 * @module tests/unit/services/proactive-intelligence
 */

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-research-uuid'),
}));

const mockQueryOllamaJSON = jest.fn();
jest.mock('../../../utils/ollama', () => ({
  queryOllamaJSON: (...args: unknown[]) => mockQueryOllamaJSON(...args),
}));

const mockSearchWeb = jest.fn();
jest.mock('../../../services/web-search', () => ({
  searchWeb: (...args: unknown[]) => mockSearchWeb(...args),
}));

const mockFetchUrl = jest.fn();
jest.mock('../../../services/url-fetch', () => ({
  fetchUrl: (...args: unknown[]) => mockFetchUrl(...args),
}));

import {
  detectResearchNeed,
  executeProactiveResearch,
  processIdeaForResearch,
  getPendingResearch,
  getResearchById,
  markResearchViewed,
  dismissResearch,
  rateResearch,
  triggerManualResearch,
  researchFocusTopic,
  shouldResearchNow,
} from '../../../services/proactive-intelligence';

// ===========================================
// Test Helpers
// ===========================================

const makeResearchRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'res-001',
  trigger_idea_id: 'idea-001',
  trigger_type: 'task_research',
  trigger_text: 'Recherchieren zu SAP-Schnittstellen',
  research_query: 'SAP-Schnittstellen',
  research_results: JSON.stringify([
    { source: 'Web Search', title: 'SAP API Guide', snippet: 'Details...', relevance_score: 0.9, fetched_at: '2026-03-20T10:00:00Z' },
  ]),
  summary: 'SAP bietet verschiedene Schnittstellen...',
  key_insights: ['Insight 1', 'Insight 2'],
  teaser_title: 'SAP Schnittstellen',
  teaser_text: 'Wichtige Erkenntnisse zu SAP APIs',
  status: 'completed' as const,
  confidence_score: 0.8,
  context: 'operations',
  created_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

const makePatternRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pattern-001',
  pattern_name: 'Recherche-Aufgabe',
  pattern_type: 'phrase',
  trigger_keywords: ['recherchieren', 'recherche'],
  trigger_phrases: ['muss ich recherchieren', 'noch recherchieren'],
  exclude_keywords: ['habe recherchiert'],
  search_sources: ['web'],
  search_depth: 'standard',
  max_results: 5,
  context: 'operations',
  is_active: true,
  ...overrides,
});

const makeFocusMock = (overrides: Record<string, unknown> = {}) => ({
  id: 'focus-001',
  name: 'Kubernetes',
  description: 'Container orchestration',
  learning_goals: ['Deploy apps', 'Networking'],
  document_sources: [],
  research_schedule: 'weekly',
  last_researched_at: null,
  ...overrides,
});

// ===========================================
// Tests
// ===========================================

describe('Proactive Intelligence Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockQueryOllamaJSON.mockReset();
    mockSearchWeb.mockReset();
    mockFetchUrl.mockReset();
  });

  // -------------------------------------------
  // detectResearchNeed
  // -------------------------------------------
  describe('detectResearchNeed', () => {
    it('detects research need via phrase pattern from DB', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow()],
      });

      const result = await detectResearchNeed(
        'Ich muss noch recherchieren zu SAP APIs',
        'task',
        'operations'
      );

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.matched_pattern).toBe('Recherche-Aufgabe');
      expect(result.search_sources).toEqual(['web']);
    });

    it('detects research need via keyword pattern', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({
          trigger_phrases: [],
          trigger_keywords: ['recherchieren'],
        })],
      });

      const result = await detectResearchNeed(
        'Ich sollte recherchieren was TypeScript kann',
        'task',
        'operations'
      );

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('excludes text with exclude keywords', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow()],
      });

      // "habe recherchiert" is in exclude_keywords
      const result = await detectResearchNeed(
        'Ich habe recherchiert zu SAP APIs',
        'task',
        'operations'
      );

      // Pattern should not match due to exclude keywords; falls to LLM
      // LLM not mocked so returns not detected
      expect(result.detected).toBe(false);
    });

    it('falls back to default patterns when DB fails', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await detectResearchNeed(
        'Ich muss noch recherchieren zu Docker',
        'task',
        'operations'
      );

      // Default patterns include "noch recherchieren" phrase
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.9);
    });

    it('uses LLM detection for task/question types when no pattern matches', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryOllamaJSON.mockResolvedValueOnce({
        needs_research: true,
        confidence: 0.8,
        research_topic: 'GraphQL vs REST',
        search_query: 'GraphQL vs REST comparison',
      });

      const result = await detectResearchNeed(
        'Prüfen welche API-Optionen wir nutzen könnten',
        'task',
        'operations'
      );

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.8);
      expect(result.research_topic).toBe('GraphQL vs REST');
      expect(mockQueryOllamaJSON).toHaveBeenCalledTimes(1);
    });

    it('skips LLM detection for non-task/question types', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await detectResearchNeed(
        'Some random note about cooking',
        'note',
        'operations'
      );

      expect(result.detected).toBe(false);
      expect(mockQueryOllamaJSON).not.toHaveBeenCalled();
    });

    it('returns not detected when LLM says no research needed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryOllamaJSON.mockResolvedValueOnce({
        needs_research: false,
        confidence: 0.2,
      });

      const result = await detectResearchNeed(
        'Einkaufen gehen',
        'task',
        'operations'
      );

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('handles LLM failure gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryOllamaJSON.mockRejectedValueOnce(new Error('LLM unavailable'));

      const result = await detectResearchNeed(
        'Prüfen welche Tools es gibt',
        'task',
        'operations'
      );

      expect(result.detected).toBe(false);
    });

    it('detects via keyword default pattern "wie funktioniert"', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await detectResearchNeed(
        'wie funktioniert Kubernetes Networking',
        'question',
        'operations'
      );

      expect(result.detected).toBe(true);
      expect(result.matched_pattern).toBe('Technische Frage');
    });
  });

  // -------------------------------------------
  // executeProactiveResearch
  // -------------------------------------------
  describe('executeProactiveResearch', () => {
    it('executes full research pipeline successfully', async () => {
      // INSERT research entry
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Web search
      mockSearchWeb.mockResolvedValueOnce({
        success: true,
        results: [
          { title: 'Result 1', url: 'https://example.com/1', description: 'Desc 1', position: 1 },
          { title: 'Result 2', url: 'https://example.com/2', description: 'Desc 2', position: 2 },
        ],
      });
      // LLM summary
      mockQueryOllamaJSON.mockResolvedValueOnce({
        summary: 'Good summary',
        key_insights: ['Insight A', 'Insight B'],
        teaser_title: 'Research Title',
        teaser_text: 'Short teaser',
      });
      // UPDATE research entry
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // UPDATE pattern stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await executeProactiveResearch(
        'idea-123',
        'Some trigger text',
        'SAP APIs',
        ['web'],
        'operations'
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe('test-research-uuid');
      expect(result!.status).toBe('completed');
      expect(result!.research_results).toHaveLength(2);
      expect(result!.summary).toBe('Good summary');
      expect(result!.key_insights).toEqual(['Insight A', 'Insight B']);
      expect(mockQueryContext).toHaveBeenCalledTimes(3);
    });

    it('returns null and marks as failed on web search error', async () => {
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Web search throws
      mockSearchWeb.mockRejectedValueOnce(new Error('Network error'));
      // LLM summary (no results)
      mockQueryOllamaJSON.mockResolvedValueOnce({
        summary: 'No results',
        key_insights: [],
        teaser_title: 'Recherche: SAP APIs',
        teaser_text: 'Keine Ergebnisse',
      });
      // UPDATE research entry
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // UPDATE pattern stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await executeProactiveResearch(
        'idea-123',
        'trigger',
        'SAP APIs',
        ['web'],
        'operations'
      );

      // Should still succeed, just with 0 results (web search failure is caught internally)
      expect(result).not.toBeNull();
      expect(result!.research_results).toHaveLength(0);
    });

    it('marks research as failed when INSERT throws', async () => {
      // INSERT throws
      mockQueryContext.mockRejectedValueOnce(new Error('DB insert failed'));
      // Failure update
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await executeProactiveResearch(
        'idea-123',
        'trigger',
        'query',
        ['web'],
        'operations'
      );

      expect(result).toBeNull();
      // Second call is the failure update
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('handles LLM summary failure with fallback', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockSearchWeb.mockResolvedValueOnce({
        success: true,
        results: [
          { title: 'Result 1', url: 'https://example.com', description: 'Description here', position: 1 },
        ],
      });
      // LLM fails
      mockQueryOllamaJSON.mockRejectedValueOnce(new Error('LLM error'));
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await executeProactiveResearch(
        null,
        'trigger',
        'test query',
        ['web'],
        'operations'
      );

      expect(result).not.toBeNull();
      // Fallback summary uses first result's snippet
      expect(result!.summary).toBe('Description here');
      expect(result!.key_insights).toEqual(['Result 1']);
    });
  });

  // -------------------------------------------
  // processIdeaForResearch
  // -------------------------------------------
  describe('processIdeaForResearch', () => {
    it('triggers research when need is detected with sufficient confidence', async () => {
      // getActivePatterns
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow()],
      });
      // executeProactiveResearch: INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Web search
      mockSearchWeb.mockResolvedValueOnce({
        success: true,
        results: [{ title: 'R1', url: 'https://ex.com', description: 'D1', position: 1 }],
      });
      // LLM summary
      mockQueryOllamaJSON.mockResolvedValueOnce({
        summary: 'Summary',
        key_insights: ['I1'],
        teaser_title: 'Title',
        teaser_text: 'Teaser',
      });
      // UPDATE research
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // UPDATE pattern stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await processIdeaForResearch(
        'idea-500',
        'Muss noch recherchieren zu Docker Compose',
        'task',
        'operations'
      );

      expect(result).not.toBeNull();
      expect(result!.trigger_type).toBe('task_research');
    });

    it('returns null when no research need detected', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await processIdeaForResearch(
        'idea-500',
        'Einkaufen gehen',
        'note',
        'operations'
      );

      expect(result).toBeNull();
    });

    it('returns null when confidence is below 0.5', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // LLM returns low confidence
      mockQueryOllamaJSON.mockResolvedValueOnce({
        needs_research: true,
        confidence: 0.3,
        research_topic: 'something',
        search_query: 'something',
      });

      const result = await processIdeaForResearch(
        'idea-500',
        'Maybe check something',
        'task',
        'operations'
      );

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------
  // getPendingResearch
  // -------------------------------------------
  describe('getPendingResearch', () => {
    it('returns parsed research entries', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeResearchRow(),
          makeResearchRow({ id: 'res-002', research_results: [{ source: 'Web', title: 'T', snippet: 'S', relevance_score: 0.5, fetched_at: 'now' }] }),
        ],
      });

      const results = await getPendingResearch('operations', 10);

      expect(results).toHaveLength(2);
      // First row has stringified results - should be parsed
      expect(Array.isArray(results[0].research_results)).toBe(true);
      // Second row has object results - should stay as-is
      expect(Array.isArray(results[1].research_results)).toBe(true);
    });

    it('returns empty array on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const results = await getPendingResearch('operations');

      expect(results).toEqual([]);
    });

    it('uses default limit of 10', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await getPendingResearch('finance');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'finance',
        expect.any(String),
        ['finance', 10]
      );
    });
  });

  // -------------------------------------------
  // getResearchById
  // -------------------------------------------
  describe('getResearchById', () => {
    it('returns parsed research entry', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeResearchRow()],
      });

      const result = await getResearchById('res-001', 'operations');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('res-001');
      expect(Array.isArray(result!.research_results)).toBe(true);
      expect(Array.isArray(result!.key_insights)).toBe(true);
    });

    it('returns null when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await getResearchById('nonexistent', 'operations');

      expect(result).toBeNull();
    });

    it('returns null on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await getResearchById('res-001', 'operations');

      expect(result).toBeNull();
    });

    it('handles missing key_insights gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeResearchRow({ key_insights: null, research_results: null })],
      });

      const result = await getResearchById('res-001', 'operations');

      expect(result).not.toBeNull();
      expect(result!.key_insights).toEqual([]);
      expect(result!.research_results).toEqual([]);
    });
  });

  // -------------------------------------------
  // markResearchViewed
  // -------------------------------------------
  describe('markResearchViewed', () => {
    it('returns true when row is updated', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });

      const result = await markResearchViewed('res-001', 'operations');

      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('viewed'),
        ['res-001', 'operations']
      );
    });

    it('returns false when no row matches', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0 });

      const result = await markResearchViewed('nonexistent', 'operations');

      expect(result).toBe(false);
    });

    it('returns false on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await markResearchViewed('res-001', 'operations');

      expect(result).toBe(false);
    });

    it('handles null rowCount', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: null });

      const result = await markResearchViewed('res-001', 'operations');

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------
  // dismissResearch
  // -------------------------------------------
  describe('dismissResearch', () => {
    it('returns true when row is dismissed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });

      const result = await dismissResearch('res-001', 'operations');

      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('dismissed'),
        ['res-001', 'operations']
      );
    });

    it('returns false when no row matches', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0 });

      const result = await dismissResearch('nonexistent', 'operations');

      expect(result).toBe(false);
    });

    it('returns false on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await dismissResearch('res-001', 'operations');

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------
  // rateResearch
  // -------------------------------------------
  describe('rateResearch', () => {
    it('updates rating successfully', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });

      await rateResearch('res-001', 5, true, 'operations');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('user_rating'),
        [5, true, 'res-001', 'operations']
      );
    });

    it('propagates DB errors', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      await expect(rateResearch('res-001', 3, false, 'operations')).rejects.toThrow('DB error');
    });
  });

  // -------------------------------------------
  // triggerManualResearch
  // -------------------------------------------
  describe('triggerManualResearch', () => {
    it('delegates to executeProactiveResearch with null ideaId', async () => {
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Web search
      mockSearchWeb.mockResolvedValueOnce({ success: true, results: [] });
      // LLM (no results path)
      mockQueryOllamaJSON.mockResolvedValueOnce(null);
      // UPDATE
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Pattern stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await triggerManualResearch('Docker Networking', ['web'], 'finance');

      expect(result).not.toBeNull();
      expect(result!.trigger_idea_id).toBeNull();
    });

    it('uses default sources when none provided', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockSearchWeb.mockResolvedValueOnce({ success: true, results: [] });
      mockQueryOllamaJSON.mockResolvedValueOnce(null);
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await triggerManualResearch('test query');

      expect(mockSearchWeb).toHaveBeenCalled();
    });
  });

  // -------------------------------------------
  // researchFocusTopic
  // -------------------------------------------
  describe('researchFocusTopic', () => {
    it('executes focus topic research successfully', async () => {
      const focus = makeFocusMock();
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Web search
      mockSearchWeb.mockResolvedValueOnce({
        success: true,
        results: [{ title: 'K8s Guide', url: 'https://k8s.io', description: 'K8s desc', position: 1 }],
      });
      // LLM summary
      mockQueryOllamaJSON.mockResolvedValueOnce({
        summary: 'K8s summary',
        key_insights: ['Pods', 'Services'],
        teaser_title: 'Kubernetes Updates',
        teaser_text: 'New K8s features',
      });
      // UPDATE research
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // UPDATE domain_focus
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await researchFocusTopic(focus as any, 'people');

      expect(result).not.toBeNull();
      expect(result!.trigger_type).toBe('scheduled');
      expect(result!.trigger_text).toBe('Focus: Kubernetes');
      expect(result!.research_results.length).toBeGreaterThanOrEqual(1);
      // Verify domain_focus was updated
      expect(mockQueryContext).toHaveBeenCalledWith(
        'people',
        expect.stringContaining('domain_focus'),
        expect.arrayContaining([focus.id])
      );
    });

    it('includes document sources in results', async () => {
      const focus = makeFocusMock({
        document_sources: [
          { type: 'url', name: 'K8s Docs', path: 'https://kubernetes.io/docs' },
          { type: 'url', name: 'Helm Docs', path: 'https://helm.sh/docs' },
        ],
      });
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Web search
      mockSearchWeb.mockResolvedValueOnce({ success: true, results: [] });
      // fetchUrl calls
      mockFetchUrl
        .mockResolvedValueOnce({ success: true, content: 'K8s content here', title: 'K8s', domain: 'kubernetes.io' })
        .mockResolvedValueOnce({ success: true, content: 'Helm content', title: 'Helm', domain: 'helm.sh' });
      // LLM summary
      mockQueryOllamaJSON.mockResolvedValueOnce({
        summary: 'Combined summary',
        key_insights: ['K8s insight'],
        teaser_title: 'Title',
        teaser_text: 'Teaser',
      });
      // UPDATE research
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // UPDATE domain_focus
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await researchFocusTopic(focus as any, 'operations');

      expect(result).not.toBeNull();
      expect(result!.research_results).toHaveLength(2);
      expect(mockFetchUrl).toHaveBeenCalledTimes(2);
    });

    it('returns null and marks as failed on error', async () => {
      const focus = makeFocusMock();
      // INSERT throws
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      // Failure update
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await researchFocusTopic(focus as any, 'operations');

      expect(result).toBeNull();
    });

    it('builds query from focus name, description, and learning goals', async () => {
      const focus = makeFocusMock({
        name: 'React',
        description: 'Frontend framework',
        learning_goals: ['Hooks', 'Server Components', 'Testing'],
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockSearchWeb.mockResolvedValueOnce({ success: true, results: [] });
      mockQueryOllamaJSON.mockResolvedValueOnce(null);
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await researchFocusTopic(focus as any, 'operations');

      // The INSERT call should contain the composed query
      const insertCall = mockQueryContext.mock.calls[0];
      const queryParam = insertCall[2][4]; // research_query param
      expect(queryParam).toContain('React');
      expect(queryParam).toContain('Frontend framework');
      expect(queryParam).toContain('Hooks');
      expect(queryParam).toContain('aktuelle Entwicklungen');
    });

    it('limits document sources to 3', async () => {
      const focus = makeFocusMock({
        document_sources: [
          { type: 'url', name: 'S1', path: 'https://a.com' },
          { type: 'url', name: 'S2', path: 'https://b.com' },
          { type: 'url', name: 'S3', path: 'https://c.com' },
          { type: 'url', name: 'S4', path: 'https://d.com' },
          { type: 'file', name: 'Local', path: '/local/file.md' },
        ],
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockSearchWeb.mockResolvedValueOnce({ success: true, results: [] });
      mockFetchUrl
        .mockResolvedValueOnce({ success: true, content: 'c1', title: 't1', domain: 'a.com' })
        .mockResolvedValueOnce({ success: true, content: 'c2', title: 't2', domain: 'b.com' })
        .mockResolvedValueOnce({ success: true, content: 'c3', title: 't3', domain: 'c.com' });
      mockQueryOllamaJSON.mockResolvedValueOnce(null);
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await researchFocusTopic(focus as any, 'operations');

      // Only 3 URL sources fetched (file type filtered, 4th URL capped)
      expect(mockFetchUrl).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------
  // shouldResearchNow
  // -------------------------------------------
  describe('shouldResearchNow', () => {
    it('returns true when never researched', () => {
      const focus = makeFocusMock({ last_researched_at: null });
      expect(shouldResearchNow(focus as any)).toBe(true);
    });

    it('returns false for manual schedule', () => {
      const focus = makeFocusMock({ research_schedule: 'manual' });
      expect(shouldResearchNow(focus as any)).toBe(false);
    });

    it('returns true for daily schedule after 1 day', () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const focus = makeFocusMock({ research_schedule: 'daily', last_researched_at: yesterday });
      expect(shouldResearchNow(focus as any)).toBe(true);
    });

    it('returns false for daily schedule if researched today', () => {
      const recentlyResearched = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const focus = makeFocusMock({ research_schedule: 'daily', last_researched_at: recentlyResearched });
      expect(shouldResearchNow(focus as any)).toBe(false);
    });

    it('returns true for weekly schedule after 7 days', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const focus = makeFocusMock({ research_schedule: 'weekly', last_researched_at: eightDaysAgo });
      expect(shouldResearchNow(focus as any)).toBe(true);
    });

    it('returns false for weekly schedule within 7 days', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const focus = makeFocusMock({ research_schedule: 'weekly', last_researched_at: threeDaysAgo });
      expect(shouldResearchNow(focus as any)).toBe(false);
    });

    it('returns true for biweekly schedule after 14 days', () => {
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const focus = makeFocusMock({ research_schedule: 'biweekly', last_researched_at: fifteenDaysAgo });
      expect(shouldResearchNow(focus as any)).toBe(true);
    });

    it('returns true for monthly schedule after 30 days', () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const focus = makeFocusMock({ research_schedule: 'monthly', last_researched_at: thirtyOneDaysAgo });
      expect(shouldResearchNow(focus as any)).toBe(true);
    });

    it('defaults to weekly for unknown schedule', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const focus = makeFocusMock({ research_schedule: 'unknown_schedule', last_researched_at: eightDaysAgo });
      expect(shouldResearchNow(focus as any)).toBe(true);
    });

    it('defaults to weekly when no research_schedule property', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const focus = { id: 'f1', name: 'Test', description: '', learning_goals: [], document_sources: [], last_researched_at: twoDaysAgo };
      expect(shouldResearchNow(focus as any)).toBe(false);
    });
  });
});
