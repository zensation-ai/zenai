/**
 * Tests for DeepSeek AI Service
 * @module tests/unit/services/deepseek
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

describe('DeepSeek AI Service', () => {
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

  describe('isDeepSeekAvailable', () => {
    it('should return false without API key', () => {
      delete process.env.DEEPSEEK_API_KEY;
      const { isDeepSeekAvailable } = require('../../../services/deepseek');
      expect(isDeepSeekAvailable()).toBe(false);
    });

    it('should return true with API key', () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      const { isDeepSeekAvailable } = require('../../../services/deepseek');
      expect(isDeepSeekAvailable()).toBe(true);
    });
  });

  describe('deepseekGenerate', () => {
    it('should throw without API key', async () => {
      delete process.env.DEEPSEEK_API_KEY;
      const { deepseekGenerate } = require('../../../services/deepseek');
      await expect(deepseekGenerate('test prompt')).rejects.toThrow('DEEPSEEK_API_KEY not configured');
    });

    it('should call OpenAI-compatible endpoint', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key-456';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'DeepSeek response' } }],
        }),
      });

      const { deepseekGenerate } = require('../../../services/deepseek');
      const result = await deepseekGenerate('test prompt');

      expect(result).toBe('DeepSeek response');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(options.headers['Authorization']).toBe('Bearer test-key-456');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('deepseek-chat');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('should include system prompt when provided', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'response' } }],
        }),
      });

      const { deepseekGenerate } = require('../../../services/deepseek');
      await deepseekGenerate('user message', { systemPrompt: 'Be helpful' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('Be helpful');
      expect(body.messages[1].role).toBe('user');
    });

    it('should use custom model when specified', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'response' } }],
        }),
      });

      const { deepseekGenerate } = require('../../../services/deepseek');
      await deepseekGenerate('test', { model: 'deepseek-reasoner' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('deepseek-reasoner');
    });

    it('should throw on API error', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      });

      const { deepseekGenerate } = require('../../../services/deepseek');
      await expect(deepseekGenerate('test')).rejects.toThrow('DeepSeek API error: 500');
    });

    it('should throw on empty response', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '' } }] }),
      });

      const { deepseekGenerate } = require('../../../services/deepseek');
      await expect(deepseekGenerate('test')).rejects.toThrow('Empty DeepSeek response');
    });

    it('should pass maxTokens and temperature', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'response' } }],
        }),
      });

      const { deepseekGenerate } = require('../../../services/deepseek');
      await deepseekGenerate('test', { maxTokens: 2048, temperature: 0.3 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.3);
    });
  });

  describe('deepseekStructure', () => {
    it('should parse valid JSON response', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"title": "Test Title", "summary": "Test summary", "tags": ["tag1"]}',
            },
          }],
        }),
      });

      const { deepseekStructure } = require('../../../services/deepseek');
      const result = await deepseekStructure('test transcript', 'system prompt');

      expect(result.title).toBe('Test Title');
      expect(result.summary).toBe('Test summary');
      expect(result.tags).toEqual(['tag1']);
    });

    it('should fall back on parse error', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Not JSON at all, just plain text' },
          }],
        }),
      });

      const { deepseekStructure } = require('../../../services/deepseek');
      const result = await deepseekStructure('A transcript for structuring', 'prompt');

      expect(result.title).toBe('A transcript for structuring'.slice(0, 50));
      expect(result.summary).toBe('A transcript for structuring'.slice(0, 200));
      expect(result.tags).toEqual([]);
    });

    it('should handle code-fenced JSON', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '```json\n{"title": "Fenced", "summary": "ok", "tags": ["a"]}\n```',
            },
          }],
        }),
      });

      const { deepseekStructure } = require('../../../services/deepseek');
      const result = await deepseekStructure('transcript', 'prompt');

      expect(result.title).toBe('Fenced');
    });
  });
});
