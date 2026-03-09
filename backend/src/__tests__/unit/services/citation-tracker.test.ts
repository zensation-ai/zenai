/**
 * Phase 49: Citation Tracker Tests
 */

import {
  createCitations,
  formatCitationContext,
  extractCitationsFromResponse,
  saveCitations,
  getCitations,
  SourceAttribution,
} from '../../../services/rag/citation-tracker';
import { EnhancedResult } from '../../../services/enhanced-rag';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

var mockQueryContext = jest.requireMock('../../../utils/database-context').queryContext;

// ===========================================
// Helpers
// ===========================================

function makeEnhancedResult(id: string, title: string, score: number, content?: string): EnhancedResult {
  return {
    id,
    title,
    summary: `Summary for ${title}`,
    content,
    score,
    scores: { semantic: score },
    sources: ['semantic'],
  };
}

// ===========================================
// createCitations Tests
// ===========================================

describe('createCitations', () => {
  test('assigns sequential citation numbers starting from 1', () => {
    const results = [
      makeEnhancedResult('a', 'First', 0.9),
      makeEnhancedResult('b', 'Second', 0.8),
      makeEnhancedResult('c', 'Third', 0.7),
    ];

    const { sources, citationMap } = createCitations(results);
    expect(sources).toHaveLength(3);
    expect(sources[0].index).toBe(1);
    expect(sources[1].index).toBe(2);
    expect(sources[2].index).toBe(3);
    expect(citationMap.get('a')).toBe(1);
    expect(citationMap.get('b')).toBe(2);
    expect(citationMap.get('c')).toBe(3);
  });

  test('handles empty results', () => {
    const { sources, citationMap } = createCitations([]);
    expect(sources).toHaveLength(0);
    expect(citationMap.size).toBe(0);
  });

  test('truncates long snippets', () => {
    const longContent = 'x'.repeat(500);
    const results = [makeEnhancedResult('a', 'Long', 0.9, longContent)];

    const { sources } = createCitations(results);
    expect(sources[0].snippet.length).toBeLessThanOrEqual(203); // 200 + '...'
    expect(sources[0].snippet.endsWith('...')).toBe(true);
  });

  test('uses summary when content is missing', () => {
    const results = [makeEnhancedResult('a', 'No Content', 0.9)];
    const { sources } = createCitations(results);
    expect(sources[0].snippet).toBe('Summary for No Content');
  });

  test('preserves relevance scores', () => {
    const results = [
      makeEnhancedResult('a', 'High', 0.95),
      makeEnhancedResult('b', 'Low', 0.3),
    ];

    const { sources } = createCitations(results);
    expect(sources[0].relevanceScore).toBeCloseTo(0.95);
    expect(sources[1].relevanceScore).toBeCloseTo(0.3);
  });

  test('defaults type to idea', () => {
    const results = [makeEnhancedResult('a', 'Test', 0.9)];
    const { sources } = createCitations(results);
    expect(sources[0].type).toBe('idea');
  });
});

// ===========================================
// formatCitationContext Tests
// ===========================================

describe('formatCitationContext', () => {
  test('formats results with [N] markers', () => {
    const results = [
      makeEnhancedResult('a', 'First Source', 0.9, 'Content of first source'),
      makeEnhancedResult('b', 'Second Source', 0.8, 'Content of second source'),
    ];
    const citations = createCitations(results);

    const formatted = formatCitationContext(results, citations);
    expect(formatted).toContain('[1] "First Source"');
    expect(formatted).toContain('[2] "Second Source"');
    expect(formatted).toContain('Content of first source');
    expect(formatted).toContain('Bitte referenziere Quellen mit [N]');
  });

  test('returns empty string for empty results', () => {
    const formatted = formatCitationContext([], createCitations([]));
    expect(formatted).toBe('');
  });
});

// ===========================================
// extractCitationsFromResponse Tests
// ===========================================

describe('extractCitationsFromResponse', () => {
  test('extracts used citations from response', () => {
    const results = [
      makeEnhancedResult('a', 'First', 0.9),
      makeEnhancedResult('b', 'Second', 0.8),
      makeEnhancedResult('c', 'Third', 0.7),
    ];
    const citations = createCitations(results);

    const response = 'According to [1], this is true. Also see [3] for more details.';
    const used = extractCitationsFromResponse(response, citations);

    expect(used).toHaveLength(2);
    expect(used.map(u => u.index)).toEqual([1, 3]);
  });

  test('returns empty array when no citations used', () => {
    const results = [makeEnhancedResult('a', 'First', 0.9)];
    const citations = createCitations(results);

    const used = extractCitationsFromResponse('No citations here', citations);
    expect(used).toEqual([]);
  });

  test('ignores invalid citation numbers', () => {
    const results = [makeEnhancedResult('a', 'First', 0.9)];
    const citations = createCitations(results);

    const response = 'See [0] and [99] for details.';
    const used = extractCitationsFromResponse(response, citations);
    expect(used).toEqual([]);
  });

  test('handles duplicate citations in response', () => {
    const results = [makeEnhancedResult('a', 'First', 0.9)];
    const citations = createCitations(results);

    const response = '[1] says this, and [1] also says that.';
    const used = extractCitationsFromResponse(response, citations);
    expect(used).toHaveLength(1);
  });
});

// ===========================================
// saveCitations Tests
// ===========================================

describe('saveCitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saves citations to database', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const citations: SourceAttribution[] = [
      { index: 1, id: 'src-1', title: 'Source 1', type: 'idea', snippet: 'Test', relevanceScore: 0.9 },
      { index: 2, id: 'src-2', title: 'Source 2', type: 'document', snippet: 'Test 2', relevanceScore: 0.8 },
    ];

    await saveCitations('msg-123', citations, 'personal');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO message_citations'),
      expect.any(Array),
    );
  });

  test('skips save for empty citations', async () => {
    await saveCitations('msg-123', [], 'personal');
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  test('handles database errors gracefully', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

    const citations: SourceAttribution[] = [
      { index: 1, id: 'src-1', title: 'Source 1', type: 'idea', snippet: 'Test', relevanceScore: 0.9 },
    ];

    // Should not throw
    await expect(saveCitations('msg-123', citations, 'personal')).resolves.toBeUndefined();
  });
});

// ===========================================
// getCitations Tests
// ===========================================

describe('getCitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('retrieves citations from database', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { source_id: 'src-1', citation_index: 1, title: 'Source 1', source_type: 'idea', snippet: 'Test', relevance_score: 0.9 },
        { source_id: 'src-2', citation_index: 2, title: 'Source 2', source_type: 'document', snippet: 'Test 2', relevance_score: 0.8 },
      ],
    });

    const citations = await getCitations('msg-123', 'personal');
    expect(citations).toHaveLength(2);
    expect(citations[0].index).toBe(1);
    expect(citations[0].id).toBe('src-1');
    expect(citations[0].type).toBe('idea');
    expect(citations[1].type).toBe('document');
  });

  test('returns empty array on error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
    const citations = await getCitations('msg-123', 'personal');
    expect(citations).toEqual([]);
  });
});
