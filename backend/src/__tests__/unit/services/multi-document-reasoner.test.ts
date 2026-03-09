/**
 * Phase 49: Multi-Document Reasoner Tests
 */

import { synthesize, MultiDocumentResult, SourceAttribution } from '../../../services/rag/multi-document-reasoner';
import { EnhancedResult } from '../../../services/enhanced-rag';

// Mock Claude service
var mockGenerateClaudeResponse = jest.fn();
var mockQueryClaudeJSON = jest.fn();

jest.mock('../../../services/claude', () => ({
  generateClaudeResponse: (...args: unknown[]) => mockGenerateClaudeResponse(...args),
  queryClaudeJSON: (...args: unknown[]) => mockQueryClaudeJSON(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ===========================================
// Test Fixtures
// ===========================================

function makeDocument(overrides: Partial<EnhancedResult> = {}): EnhancedResult {
  return {
    id: 'doc-1',
    title: 'Test Document',
    summary: 'A test document summary.',
    content: 'Full content of the test document.',
    score: 0.85,
    scores: { semantic: 0.85 },
    sources: ['agentic'],
    ...overrides,
  };
}

describe('Multi-Document Reasoner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateClaudeResponse.mockReset();
    mockQueryClaudeJSON.mockReset();
  });

  // ===========================================
  // Empty / Null Inputs
  // ===========================================

  describe('empty inputs', () => {
    it('should handle empty documents array', async () => {
      const result = await synthesize('What is X?', [], 'personal');

      expect(result.synthesis).toContain('No relevant sources');
      expect(result.sources).toEqual([]);
      expect(result.agreements).toEqual([]);
      expect(result.contradictions).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    it('should handle null documents', async () => {
      const result = await synthesize('What is X?', null as unknown as EnhancedResult[], 'personal');

      expect(result.confidence).toBe(0);
      expect(result.sources).toEqual([]);
    });
  });

  // ===========================================
  // Single Document
  // ===========================================

  describe('single document synthesis', () => {
    it('should return document content without Claude calls for single doc', async () => {
      const doc = makeDocument({ title: 'Memory Guide', content: 'Memory works by encoding information.' });

      const result = await synthesize('How does memory work?', [doc], 'personal');

      expect(result.synthesis).toContain('Memory Guide');
      expect(result.synthesis).toContain('[1]');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('Memory Guide');
      expect(result.agreements).toEqual([]);
      expect(result.contradictions).toEqual([]);
      // Confidence should be based on the document score
      expect(result.confidence).toBeGreaterThan(0);

      // Should NOT call Claude for single document
      expect(mockGenerateClaudeResponse).not.toHaveBeenCalled();
      expect(mockQueryClaudeJSON).not.toHaveBeenCalled();
    });

    it('should cap confidence at 1.0 for single high-scoring doc', async () => {
      const doc = makeDocument({ score: 0.99 });
      const result = await synthesize('query', [doc], 'personal');
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  // ===========================================
  // Multi-Document Synthesis
  // ===========================================

  describe('multi-document synthesis', () => {
    it('should call Claude for synthesis and analysis with multiple docs', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce(
        'According to [1], cats are independent. Meanwhile [2] notes cats are social.'
      );
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: ['Both sources agree cats are popular pets'],
        contradictions: ['Source 1 says independent, source 2 says social'],
        confidence: 0.75,
      });

      const docs = [
        makeDocument({ id: 'doc-1', title: 'Cat Behavior', content: 'Cats are independent creatures.' }),
        makeDocument({ id: 'doc-2', title: 'Cat Social Life', content: 'Cats are social animals.', score: 0.80 }),
      ];

      const result = await synthesize('Are cats social?', docs, 'personal');

      expect(result.synthesis).toContain('[1]');
      expect(result.synthesis).toContain('[2]');
      expect(result.sources).toHaveLength(2);
      expect(result.agreements).toContain('Both sources agree cats are popular pets');
      expect(result.contradictions).toHaveLength(1);
      expect(result.confidence).toBe(0.75);

      expect(mockGenerateClaudeResponse).toHaveBeenCalledTimes(1);
      expect(mockQueryClaudeJSON).toHaveBeenCalledTimes(1);
    });

    it('should handle agreements without contradictions', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Both sources confirm X [1][2].');
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: ['Both confirm X', 'Both mention Y'],
        contradictions: [],
        confidence: 0.95,
      });

      const docs = [
        makeDocument({ id: 'd1', title: 'Source A' }),
        makeDocument({ id: 'd2', title: 'Source B' }),
      ];

      const result = await synthesize('What is X?', docs, 'work');

      expect(result.agreements).toHaveLength(2);
      expect(result.contradictions).toHaveLength(0);
      expect(result.confidence).toBe(0.95);
    });

    it('should handle contradictions between sources', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Sources disagree on timing.');
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: [],
        contradictions: ['Source 1 says 2020, Source 2 says 2021'],
        confidence: 0.4,
      });

      const docs = [
        makeDocument({ id: 'd1', title: 'Report A', content: 'Event happened in 2020.' }),
        makeDocument({ id: 'd2', title: 'Report B', content: 'Event happened in 2021.' }),
      ];

      const result = await synthesize('When did the event happen?', docs, 'personal');

      expect(result.contradictions).toHaveLength(1);
      expect(result.confidence).toBe(0.4);
    });
  });

  // ===========================================
  // Source Attribution
  // ===========================================

  describe('source attribution', () => {
    it('should create correct source attributions', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Synthesis text.');
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: [],
        contradictions: [],
        confidence: 0.8,
      });

      const docs = [
        makeDocument({
          id: 'src-1',
          title: 'Research Paper',
          content: 'Detailed research findings about the topic.',
          score: 0.9,
        }),
        makeDocument({
          id: 'src-2',
          title: 'Blog Post',
          content: 'A blog discussing the same topic.',
          score: 0.7,
        }),
      ];

      const result = await synthesize('query', docs, 'personal');

      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].id).toBe('src-1');
      expect(result.sources[0].title).toBe('Research Paper');
      expect(result.sources[0].relevanceScore).toBe(0.9);
      expect(result.sources[0].snippet).toBeTruthy();
      expect(result.sources[1].id).toBe('src-2');
    });

    it('should infer source type from title/content', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Synthesis.');
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: [],
        contradictions: [],
        confidence: 0.7,
      });

      const docs = [
        makeDocument({ id: 'd1', title: 'Chat with user' }),
        makeDocument({ id: 'd2', title: 'https://example.com/page', summary: 'A website about...' }),
      ];

      const result = await synthesize('query', docs, 'personal');

      expect(result.sources[0].type).toBe('chat');
      expect(result.sources[1].type).toBe('web');
    });
  });

  // ===========================================
  // Error Handling
  // ===========================================

  describe('error handling', () => {
    it('should handle synthesis generation failure gracefully', async () => {
      mockGenerateClaudeResponse.mockRejectedValueOnce(new Error('Claude unavailable'));
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: ['point'],
        contradictions: [],
        confidence: 0.8,
      });

      const docs = [makeDocument(), makeDocument({ id: 'd2' })];
      const result = await synthesize('query', docs, 'personal');

      expect(result.synthesis).toContain('Unable to synthesize');
      // Analysis should still succeed
      expect(result.agreements).toHaveLength(1);
    });

    it('should handle analysis failure with fallback confidence', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Synthesis text.');
      mockQueryClaudeJSON.mockRejectedValueOnce(new Error('JSON parse failed'));

      const docs = [makeDocument(), makeDocument({ id: 'd2' })];
      const result = await synthesize('query', docs, 'personal');

      expect(result.synthesis).toBe('Synthesis text.');
      expect(result.agreements).toEqual([]);
      expect(result.contradictions).toEqual([]);
      // Fallback confidence should be between 0 and 1
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should clamp confidence to [0, 1] range', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Text.');
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: [],
        contradictions: [],
        confidence: 5.0, // Invalid — above 1
      });

      const docs = [makeDocument(), makeDocument({ id: 'd2' })];
      const result = await synthesize('query', docs, 'personal');

      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================
  // Confidence Calculation
  // ===========================================

  describe('confidence calculation', () => {
    it('should use Claude-provided confidence when available', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Synthesis.');
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: ['agreement'],
        contradictions: [],
        confidence: 0.88,
      });

      const docs = [makeDocument(), makeDocument({ id: 'd2' })];
      const result = await synthesize('query', docs, 'personal');

      expect(result.confidence).toBe(0.88);
    });

    it('should handle non-numeric confidence from Claude', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce('Synthesis.');
      mockQueryClaudeJSON.mockResolvedValueOnce({
        agreements: [],
        contradictions: [],
        confidence: 'high', // Invalid type
      });

      const docs = [makeDocument(), makeDocument({ id: 'd2' })];
      const result = await synthesize('query', docs, 'personal');

      // Should fall back to calculated confidence
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
