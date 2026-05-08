/**
 * Tests for Google Gemini AI Service
 * @module tests/unit/services/gemini
 */

// Mock fetch globally before imports
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Gemini AI Service', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    mockFetch.mockReset();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('isGeminiAvailable', () => {
    it('should return false without API key', () => {
      delete process.env.GOOGLE_AI_API_KEY;
      const { isGeminiAvailable } = require('../../../services/gemini');
      expect(isGeminiAvailable()).toBe(false);
    });

    it('should return true with API key', () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      const { isGeminiAvailable } = require('../../../services/gemini');
      expect(isGeminiAvailable()).toBe(true);
    });
  });

  describe('geminiGenerate', () => {
    it('should throw without API key', async () => {
      delete process.env.GOOGLE_AI_API_KEY;
      const { geminiGenerate } = require('../../../services/gemini');
      await expect(geminiGenerate('test prompt')).rejects.toThrow('GOOGLE_AI_API_KEY not configured');
    });

    it('should call correct URL with API key', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key-123';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Generated response' }] } }],
        }),
      });

      const { geminiGenerate } = require('../../../services/gemini');
      const result = await geminiGenerate('test prompt');

      expect(result).toBe('Generated response');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('generativelanguage.googleapis.com');
      expect(callUrl).toContain('key=test-key-123');
      expect(callUrl).toContain('gemini-2.5-flash');
    });

    it('should use custom model when specified', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
        }),
      });

      const { geminiGenerate } = require('../../../services/gemini');
      await geminiGenerate('test', { model: 'gemini-2.5-pro' });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('gemini-2.5-pro');
    });

    it('should include system prompt as user/model exchange', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
        }),
      });

      const { geminiGenerate } = require('../../../services/gemini');
      await geminiGenerate('user message', { systemPrompt: 'You are helpful' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.contents).toHaveLength(3);
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts[0].text).toBe('You are helpful');
      expect(body.contents[1].role).toBe('model');
      expect(body.contents[2].role).toBe('user');
      expect(body.contents[2].parts[0].text).toBe('user message');
    });

    it('should throw on API error', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      const { geminiGenerate } = require('../../../services/gemini');
      await expect(geminiGenerate('test')).rejects.toThrow('Gemini API error: 429');
    });

    it('should throw on empty response', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [] }),
      });

      const { geminiGenerate } = require('../../../services/gemini');
      await expect(geminiGenerate('test')).rejects.toThrow('Empty Gemini response');
    });
  });

  describe('geminiEmbed', () => {
    it('should throw without API key', async () => {
      delete process.env.GOOGLE_AI_API_KEY;
      const { geminiEmbed } = require('../../../services/gemini');
      await expect(geminiEmbed('test text')).rejects.toThrow('GOOGLE_AI_API_KEY not configured');
    });

    it('should return 768-dim array', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      const mockEmbedding = Array.from({ length: 768 }, (_, i) => Math.sin(i));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: mockEmbedding } }),
      });

      const { geminiEmbed } = require('../../../services/gemini');
      const result = await geminiEmbed('test text');

      expect(result).toHaveLength(768);
      expect(result[0]).toBe(mockEmbedding[0]);
    });

    it('should truncate embeddings longer than 768', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      const mockEmbedding = Array.from({ length: 1024 }, (_, i) => i * 0.001);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: mockEmbedding } }),
      });

      const { geminiEmbed } = require('../../../services/gemini');
      const result = await geminiEmbed('test text');

      expect(result).toHaveLength(768);
    });

    it('should throw on empty embedding', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: {} }),
      });

      const { geminiEmbed } = require('../../../services/gemini');
      await expect(geminiEmbed('test')).rejects.toThrow('Empty Gemini embedding');
    });

    it('should call embedding endpoint with correct params', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(768).fill(0.1) } }),
      });

      const { geminiEmbed } = require('../../../services/gemini');
      await geminiEmbed('test text');

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('text-embedding-004');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.outputDimensionality).toBe(768);
    });
  });

  describe('geminiStructure', () => {
    it('should parse valid JSON response', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: '{"title": "Test Title", "summary": "Test summary", "tags": ["tag1", "tag2"]}',
              }],
            },
          }],
        }),
      });

      const { geminiStructure } = require('../../../services/gemini');
      const result = await geminiStructure('test transcript', 'system prompt');

      expect(result.title).toBe('Test Title');
      expect(result.summary).toBe('Test summary');
      expect(result.tags).toEqual(['tag1', 'tag2']);
    });

    it('should handle JSON wrapped in code fences', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: '```json\n{"title": "Fenced", "summary": "test", "tags": []}\n```',
              }],
            },
          }],
        }),
      });

      const { geminiStructure } = require('../../../services/gemini');
      const result = await geminiStructure('transcript', 'prompt');

      expect(result.title).toBe('Fenced');
    });

    it('should fall back on parse error', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'This is not valid JSON at all' }],
            },
          }],
        }),
      });

      const { geminiStructure } = require('../../../services/gemini');
      const result = await geminiStructure('My long transcript about testing', 'prompt');

      expect(result.title).toBe('My long transcript about testing'.slice(0, 50));
      expect(result.tags).toEqual([]);
    });
  });
});
