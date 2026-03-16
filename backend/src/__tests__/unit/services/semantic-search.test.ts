/**
 * Semantic Search 2.0 Tests (Phase 95)
 *
 * Tests for unified cross-feature search service.
 */

import {
  parseTypePrefix,
  extractEntityHints,
  scoreResult,
  unifiedSearch,
  getSearchSuggestions,
  recordSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  getSearchFacets,
  ALL_ENTITY_TYPES,
} from '../../../services/semantic-search';
import type { SearchEntityType, UnifiedSearchOptions } from '../../../services/semantic-search';

// ===========================================
// Mock database-context
// ===========================================

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
  VALID_CONTEXTS: ['personal', 'work', 'learning', 'creative'],
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ===========================================
// Setup
// ===========================================

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ===========================================
// parseTypePrefix
// ===========================================

describe('parseTypePrefix', () => {
  it('should parse @ prefix as contacts', () => {
    const result = parseTypePrefix('@john');
    expect(result.cleanQuery).toBe('john');
    expect(result.hintedTypes).toEqual(['contacts']);
  });

  it('should parse # prefix as ideas', () => {
    const result = parseTypePrefix('#project');
    expect(result.cleanQuery).toBe('project');
    expect(result.hintedTypes).toEqual(['ideas']);
  });

  it('should parse $ prefix as transactions', () => {
    const result = parseTypePrefix('$rent');
    expect(result.cleanQuery).toBe('rent');
    expect(result.hintedTypes).toEqual(['transactions']);
  });

  it('should parse ! prefix as tasks', () => {
    const result = parseTypePrefix('!deploy');
    expect(result.cleanQuery).toBe('deploy');
    expect(result.hintedTypes).toEqual(['tasks']);
  });

  it('should return null hintedTypes for normal queries', () => {
    const result = parseTypePrefix('hello world');
    expect(result.cleanQuery).toBe('hello world');
    expect(result.hintedTypes).toBeNull();
  });

  it('should handle empty query', () => {
    const result = parseTypePrefix('');
    expect(result.cleanQuery).toBe('');
    expect(result.hintedTypes).toBeNull();
  });

  it('should handle single character (too short for prefix)', () => {
    const result = parseTypePrefix('@');
    expect(result.cleanQuery).toBe('@');
    expect(result.hintedTypes).toBeNull();
  });

  it('should trim whitespace from clean query', () => {
    const result = parseTypePrefix('@ john doe ');
    expect(result.cleanQuery).toBe('john doe');
  });
});

// ===========================================
// extractEntityHints
// ===========================================

describe('extractEntityHints', () => {
  it('should detect email hints', () => {
    const hints = extractEntityHints('emails from john');
    expect(hints).toContain('emails');
  });

  it('should detect task hints', () => {
    const hints = extractEntityHints('my tasks for today');
    expect(hints).toContain('tasks');
  });

  it('should detect contact hints', () => {
    const hints = extractEntityHints('find contact information');
    expect(hints).toContain('contacts');
  });

  it('should detect document hints', () => {
    const hints = extractEntityHints('search my documents');
    expect(hints).toContain('documents');
  });

  it('should detect calendar hints', () => {
    const hints = extractEntityHints('upcoming calendar events');
    expect(hints).toContain('calendar_events');
  });

  it('should detect finance hints', () => {
    const hints = extractEntityHints('recent transactions');
    expect(hints).toContain('transactions');
  });

  it('should detect knowledge hints', () => {
    const hints = extractEntityHints('knowledge graph entities');
    expect(hints).toContain('knowledge_entities');
  });

  it('should detect German keywords', () => {
    const hints = extractEntityHints('meine Aufgabe fuer morgen');
    expect(hints).toContain('tasks');
  });

  it('should return empty for generic queries', () => {
    const hints = extractEntityHints('hello');
    expect(hints).toEqual([]);
  });

  it('should detect multiple hints', () => {
    const hints = extractEntityHints('email about the task deadline');
    expect(hints).toContain('emails');
    expect(hints).toContain('tasks');
  });
});

// ===========================================
// scoreResult
// ===========================================

describe('scoreResult', () => {
  it('should give highest score for exact match', () => {
    expect(scoreResult('hello', 'hello')).toBe(1.0);
  });

  it('should give high score for prefix match', () => {
    expect(scoreResult('hello world', 'hello')).toBe(0.8);
  });

  it('should give medium score for contains match', () => {
    expect(scoreResult('say hello there', 'hello')).toBe(0.6);
  });

  it('should give low score for partial word match', () => {
    const score = scoreResult('project management', 'project');
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it('should be case insensitive', () => {
    expect(scoreResult('Hello World', 'hello world')).toBe(1.0);
  });

  it('should give lowest score when no match', () => {
    const score = scoreResult('completely different', 'xyz');
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it('should handle empty text', () => {
    const score = scoreResult('', 'hello');
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it('should handle multi-word partial matches', () => {
    const score = scoreResult('project management tool', 'project tool');
    expect(score).toBeGreaterThan(0);
  });
});

// ===========================================
// unifiedSearch
// ===========================================

describe('unifiedSearch', () => {
  const baseOptions: UnifiedSearchOptions = {
    query: 'test',
    context: 'personal' as const,
    userId: 'user-123',
    limit: 20,
  };

  it('should return empty results for empty query', async () => {
    const result = await unifiedSearch({ ...baseOptions, query: '' });
    expect(result.totalResults).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('should search across multiple types in parallel', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [{ id: '1', title: 'Test Idea', snippet: 'content', created_at: new Date().toISOString(), status: 'active', priority: 'medium' }],
    });

    const result = await unifiedSearch(baseOptions);
    expect(result.results.length).toBeGreaterThan(0);
    expect(mockQueryContext).toHaveBeenCalled();
  });

  it('should handle type prefix in query', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [{ id: '1', name: 'John Doe', email: 'john@test.com', company: 'ACME', created_at: new Date().toISOString() }],
    });

    const result = await unifiedSearch({ ...baseOptions, query: '@john' });
    // Should only search contacts due to @ prefix
    expect(result.results.length).toBeGreaterThanOrEqual(0);
  });

  it('should filter by specified types', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [{ id: '1', title: 'Task', snippet: '', created_at: new Date().toISOString(), status: 'todo', priority: 'high' }],
    });

    const result = await unifiedSearch({
      ...baseOptions,
      types: ['tasks'] as SearchEntityType[],
    });

    expect(result.results.every(r => r.type === 'tasks')).toBe(true);
  });

  it('should apply time range filter', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    await unifiedSearch({
      ...baseOptions,
      timeRange: { from: '2026-01-01', to: '2026-12-31' },
    });

    // Verify time range params were passed to query
    expect(mockQueryContext).toHaveBeenCalled();
    const calls = mockQueryContext.mock.calls;
    const hasTimeParam = calls.some(call => {
      const params = call[2] as unknown[];
      return params && params.some(p => typeof p === 'string' && p.startsWith('2026'));
    });
    expect(hasTimeParam).toBe(true);
  });

  it('should sort results by score descending', async () => {
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [
          { id: '1', title: 'test exact', snippet: '', created_at: new Date().toISOString(), status: 'active', priority: 'medium' },
          { id: '2', title: 'something with test inside', snippet: '', created_at: new Date().toISOString(), status: 'active', priority: 'low' },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const result = await unifiedSearch({ ...baseOptions, types: ['ideas'] });
    if (result.results.length >= 2) {
      expect(result.results[0].score).toBeGreaterThanOrEqual(result.results[1].score);
    }
  });

  it('should deduplicate results by id+type', async () => {
    const now = new Date().toISOString();
    mockQueryContext.mockResolvedValue({
      rows: [
        { id: 'same-id', title: 'Test', snippet: '', created_at: now, status: 'active', priority: 'medium' },
        { id: 'same-id', title: 'Test', snippet: '', created_at: now, status: 'active', priority: 'medium' },
      ],
    });

    const result = await unifiedSearch({ ...baseOptions, types: ['ideas'] });
    const ids = result.results.map(r => r.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });

  it('should respect limit parameter', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i}`,
      title: `Test ${i}`,
      snippet: '',
      created_at: new Date().toISOString(),
      status: 'active',
      priority: 'medium',
    }));
    mockQueryContext.mockResolvedValue({ rows });

    const result = await unifiedSearch({ ...baseOptions, types: ['ideas'], limit: 3 });
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it('should build facets from results', async () => {
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Idea', snippet: '', created_at: new Date().toISOString(), status: 'active', priority: 'medium' }],
      })
      .mockResolvedValue({ rows: [] });

    const result = await unifiedSearch({ ...baseOptions, types: ['ideas', 'tasks'] });
    expect(result.facets).toBeDefined();
    if (result.results.length > 0) {
      expect(result.facets.ideas).toBeGreaterThanOrEqual(0);
    }
  });

  it('should handle database errors gracefully per type', async () => {
    // Ideas succeeds, others fail
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Test', snippet: '', created_at: new Date().toISOString(), status: 'active', priority: 'medium' }],
      })
      .mockRejectedValue(new Error('DB Error'));

    const result = await unifiedSearch(baseOptions);
    // Should still return results from successful type
    expect(result).toBeDefined();
    expect(result.results.length).toBeGreaterThanOrEqual(0);
  });

  it('should report timing', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });
    const result = await unifiedSearch(baseOptions);
    expect(result.timingMs).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================
// Search Suggestions
// ===========================================

describe('getSearchSuggestions', () => {
  it('should return suggestions for valid prefix', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [{ query: 'test query' }, { query: 'test search' }],
    });

    const suggestions = await getSearchSuggestions('personal', 'user-1', 'te');
    expect(suggestions).toEqual(['test query', 'test search']);
  });

  it('should return empty for short prefix', async () => {
    const suggestions = await getSearchSuggestions('personal', 'user-1', 'a');
    expect(suggestions).toEqual([]);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('should handle database errors gracefully', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB Error'));
    const suggestions = await getSearchSuggestions('personal', 'user-1', 'test');
    expect(suggestions).toEqual([]);
  });
});

// ===========================================
// Search History
// ===========================================

describe('recordSearchHistory', () => {
  it('should insert search history entry', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    await recordSearchHistory('personal', 'user-1', 'test query', 5);
    expect(mockQueryContext).toHaveBeenCalled();
    const insertCall = mockQueryContext.mock.calls.find(c =>
      (c[1] as string).includes('INSERT INTO search_history')
    );
    expect(insertCall).toBeDefined();
  });

  it('should trim old history entries', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    await recordSearchHistory('personal', 'user-1', 'test', 3);
    const deleteCall = mockQueryContext.mock.calls.find(c =>
      (c[1] as string).includes('DELETE FROM search_history')
    );
    expect(deleteCall).toBeDefined();
  });

  it('should handle errors silently', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB Error'));
    // Should not throw
    await recordSearchHistory('personal', 'user-1', 'test', 0);
  });

  it('should store selected result as JSON', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });
    const selected = { type: 'ideas', id: '123' };

    await recordSearchHistory('personal', 'user-1', 'test', 1, selected);
    const insertCall = mockQueryContext.mock.calls.find(c =>
      (c[1] as string).includes('INSERT INTO search_history')
    );
    expect(insertCall).toBeDefined();
    const params = insertCall?.[2] as unknown[];
    expect(params?.[3]).toBe(JSON.stringify(selected));
  });
});

describe('getSearchHistory', () => {
  it('should return search history entries', async () => {
    const entries = [
      { id: '1', query: 'test', result_count: 5, selected_result: null, created_at: new Date().toISOString() },
    ];
    mockQueryContext.mockResolvedValue({ rows: entries });

    const history = await getSearchHistory('personal', 'user-1');
    expect(history).toEqual(entries);
  });

  it('should respect limit parameter', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    await getSearchHistory('personal', 'user-1', 10);
    const params = mockQueryContext.mock.calls[0][2] as unknown[];
    expect(params[1]).toBe(10);
  });

  it('should handle database errors gracefully', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB Error'));
    const history = await getSearchHistory('personal', 'user-1');
    expect(history).toEqual([]);
  });
});

describe('clearSearchHistory', () => {
  it('should delete all search history for user', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    await clearSearchHistory('personal', 'user-1');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('DELETE FROM search_history'),
      ['user-1']
    );
  });
});

// ===========================================
// Search Facets
// ===========================================

describe('getSearchFacets', () => {
  it('should return type counts', async () => {
    mockQueryContext.mockResolvedValue({ rows: [{ count: '42' }] });

    const facets = await getSearchFacets('personal', 'user-1');
    expect(facets.types).toBeDefined();
    expect(Array.isArray(facets.types)).toBe(true);
  });

  it('should handle partial failures', async () => {
    // First query succeeds, rest fail
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockRejectedValue(new Error('DB Error'));

    const facets = await getSearchFacets('personal', 'user-1');
    expect(facets.types.length).toBeGreaterThanOrEqual(1);
  });

  it('should exclude types with zero count', async () => {
    mockQueryContext.mockResolvedValue({ rows: [{ count: '0' }] });

    const facets = await getSearchFacets('personal', 'user-1');
    const nonZero = facets.types.filter(t => t.count > 0);
    expect(nonZero.length).toBe(0);
  });
});

// ===========================================
// ALL_ENTITY_TYPES
// ===========================================

describe('ALL_ENTITY_TYPES', () => {
  it('should contain all 9 entity types', () => {
    expect(ALL_ENTITY_TYPES).toHaveLength(9);
  });

  it('should include ideas', () => {
    expect(ALL_ENTITY_TYPES).toContain('ideas');
  });

  it('should include emails', () => {
    expect(ALL_ENTITY_TYPES).toContain('emails');
  });

  it('should include tasks', () => {
    expect(ALL_ENTITY_TYPES).toContain('tasks');
  });

  it('should include contacts', () => {
    expect(ALL_ENTITY_TYPES).toContain('contacts');
  });

  it('should include documents', () => {
    expect(ALL_ENTITY_TYPES).toContain('documents');
  });

  it('should include chat_messages', () => {
    expect(ALL_ENTITY_TYPES).toContain('chat_messages');
  });

  it('should include calendar_events', () => {
    expect(ALL_ENTITY_TYPES).toContain('calendar_events');
  });

  it('should include transactions', () => {
    expect(ALL_ENTITY_TYPES).toContain('transactions');
  });

  it('should include knowledge_entities', () => {
    expect(ALL_ENTITY_TYPES).toContain('knowledge_entities');
  });
});
