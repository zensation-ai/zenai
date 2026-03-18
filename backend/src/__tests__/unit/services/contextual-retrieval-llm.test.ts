/**
 * Tests for Contextual Retrieval with LLM (Phase 100)
 *
 * Tests that context prefix generation uses Claude Haiku
 * and falls back to template on error.
 */

jest.mock('../../../services/claude/core', () => ({
  generateClaudeResponse: jest.fn(),
}));

jest.mock('../../../services/claude/client', () => ({
  MODEL_CONFIG: {
    default: 'claude-sonnet-4-20250514',
    haiku: 'claude-haiku-4-5-20251001',
  },
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  getClaudeClient: jest.fn(),
  executeWithProtection: jest.fn(),
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  generateContextPrefix,
  generateContextPrefixLLM,
  enrichChunkFull,
  backfillTemplateContent,
} from '../../../services/contextual-retrieval';

const { generateClaudeResponse } = require('../../../services/claude/core');
const { queryContext } = require('../../../utils/database-context');

describe('Contextual Retrieval with LLM', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateContextPrefix (template fallback)', () => {
    it('should generate prefix from title and section', () => {
      const prefix = generateContextPrefix({
        documentTitle: 'Q3 Report',
        sectionHeader: 'Revenue',
        chunkContent: 'Revenue grew 3%',
      });
      expect(prefix).toContain('Q3 Report');
      expect(prefix).toContain('Revenue');
    });

    it('should return empty string for no metadata', () => {
      const prefix = generateContextPrefix({
        chunkContent: 'Some content',
      });
      expect(prefix).toBe('');
    });
  });

  describe('generateContextPrefixLLM', () => {
    it('should call Claude Haiku for context generation', async () => {
      generateClaudeResponse.mockResolvedValueOnce(
        'This chunk from the Q3 Report discusses the revenue growth trends for the third quarter.'
      );

      const prefix = await generateContextPrefixLLM({
        documentTitle: 'Q3 Report',
        chunkContent: 'Revenue grew 3% compared to Q2.',
        fullDocument: 'Full document text about quarterly earnings...',
      });

      expect(prefix).toContain('Q3 Report');
      expect(generateClaudeResponse).toHaveBeenCalledTimes(1);
      // Verify system prompt mentions context/chunk
      const systemPrompt = generateClaudeResponse.mock.calls[0][0];
      expect(systemPrompt.toLowerCase()).toContain('context');
    });

    it('should truncate full document to ~8000 chars', async () => {
      const longDoc = 'x'.repeat(20000);
      generateClaudeResponse.mockResolvedValueOnce('Context prefix.');

      await generateContextPrefixLLM({
        documentTitle: 'Long Doc',
        chunkContent: 'Some chunk',
        fullDocument: longDoc,
      });

      // The user prompt should contain a truncated version
      const userPrompt = generateClaudeResponse.mock.calls[0][1];
      expect(userPrompt.length).toBeLessThan(12000); // 8000 + chunk + boilerplate
    });

    it('should fall back to template on Claude error', async () => {
      generateClaudeResponse.mockRejectedValueOnce(new Error('API unavailable'));

      const prefix = await generateContextPrefixLLM({
        documentTitle: 'Test Doc',
        chunkContent: 'Some content',
        fullDocument: 'Full doc',
      });

      // Should get template fallback
      expect(prefix).toContain('Test Doc');
      expect(prefix.length).toBeGreaterThan(0);
    });

    it('should fall back to template when Claude returns empty', async () => {
      generateClaudeResponse.mockResolvedValueOnce('');

      const prefix = await generateContextPrefixLLM({
        documentTitle: 'Empty Response Doc',
        chunkContent: 'Chunk text',
        fullDocument: 'Doc text',
      });

      expect(prefix).toContain('Empty Response Doc');
    });

    it('should use max 100 tokens output', async () => {
      generateClaudeResponse.mockResolvedValueOnce('Short context.');

      await generateContextPrefixLLM({
        documentTitle: 'Doc',
        chunkContent: 'Content',
        fullDocument: 'Full text',
      });

      const options = generateClaudeResponse.mock.calls[0][2];
      expect(options.maxTokens).toBeLessThanOrEqual(100);
    });
  });

  describe('enrichChunkFull', () => {
    it('should enrich chunk with template prefix', () => {
      const result = enrichChunkFull({
        documentTitle: 'Test',
        chunkContent: 'Some text',
      });
      expect(result.enrichedContent).toContain('Test');
      expect(result.enrichedContent).toContain('Some text');
    });
  });

  describe('backfillTemplateContent', () => {
    it('should find old template-based records', async () => {
      queryContext.mockResolvedValueOnce({
        rows: [
          { id: 'chunk-1', enriched_content: "This chunk from 'Old Doc' discusses section. Old content" },
          { id: 'chunk-2', enriched_content: "This chunk from 'Another' discusses topic. More content" },
        ],
      });

      const result = await backfillTemplateContent('personal', 10);

      expect(queryContext).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no template records found', async () => {
      queryContext.mockResolvedValueOnce({ rows: [] });

      const result = await backfillTemplateContent('work', 5);

      expect(result).toHaveLength(0);
    });
  });
});
