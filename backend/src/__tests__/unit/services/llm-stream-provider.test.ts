/**
 * Tests for Multi-LLM Stream Provider
 *
 * @module __tests__/unit/services/llm-stream-provider
 */

// Mock dependencies before imports
jest.mock('../../../services/mistral', () => ({
  generateMistralResponse: jest.fn(),
}));
jest.mock('../../../services/openai', () => ({
  generateOpenAIResponse: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  selectProvider,
  getFallbackChain,
  executeWithFallback,
  streamWithFallback,
  LLMProvider,
} from '../../../services/llm/stream-provider';
import { generateMistralResponse } from '../../../services/mistral';
import { generateOpenAIResponse } from '../../../services/openai';

const mockMistral = generateMistralResponse as jest.MockedFunction<typeof generateMistralResponse>;
const mockOpenAI = generateOpenAIResponse as jest.MockedFunction<typeof generateOpenAIResponse>;

describe('LLM Stream Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================
  // selectProvider
  // =============================================

  describe('selectProvider', () => {
    it('returns anthropic provider for anthropic string', () => {
      expect(selectProvider('anthropic')).toBe('anthropic');
    });

    it('returns mistral provider for mistral string', () => {
      expect(selectProvider('mistral')).toBe('mistral');
    });

    it('returns openai provider for openai string', () => {
      expect(selectProvider('openai')).toBe('openai');
    });

    it('returns ollama provider for ollama string', () => {
      expect(selectProvider('ollama')).toBe('ollama');
    });

    it('returns google provider for google string', () => {
      expect(selectProvider('google')).toBe('google');
    });

    it('returns deepseek provider for deepseek string', () => {
      expect(selectProvider('deepseek')).toBe('deepseek');
    });

    it('defaults to anthropic for unknown provider', () => {
      expect(selectProvider('unknown')).toBe('anthropic');
      expect(selectProvider('')).toBe('anthropic');
    });
  });

  // =============================================
  // getFallbackChain
  // =============================================

  describe('getFallbackChain', () => {
    it('returns fallback order excluding anthropic', () => {
      const chain = getFallbackChain('anthropic');
      expect(chain).toEqual(['mistral', 'openai', 'ollama']);
    });

    it('excludes mistral from chain when mistral is primary', () => {
      const chain = getFallbackChain('mistral');
      expect(chain).toEqual(['openai', 'ollama']);
    });

    it('excludes openai from chain when openai is primary', () => {
      const chain = getFallbackChain('openai');
      expect(chain).toEqual(['mistral', 'ollama']);
    });

    it('returns full chain for google (not in fallback list)', () => {
      const chain = getFallbackChain('google');
      expect(chain).toEqual(['mistral', 'openai', 'ollama']);
    });
  });

  // =============================================
  // executeWithFallback
  // =============================================

  describe('executeWithFallback', () => {
    it('calls Mistral for mistral provider', async () => {
      mockMistral.mockResolvedValueOnce('Mistral response');

      const result = await executeWithFallback('mistral', 'system', 'user message');

      expect(result).toEqual({ response: 'Mistral response', provider: 'mistral' });
      expect(mockMistral).toHaveBeenCalledWith('system', 'user message', {
        maxTokens: 4096,
        temperature: 0.7,
      });
    });

    it('calls OpenAI for openai provider', async () => {
      mockOpenAI.mockResolvedValueOnce('OpenAI response');

      const result = await executeWithFallback('openai', 'system', 'user message');

      expect(result).toEqual({ response: 'OpenAI response', provider: 'openai' });
      expect(mockOpenAI).toHaveBeenCalledWith('system', 'user message', {
        maxTokens: 4096,
        temperature: 0.7,
      });
    });

    it('passes custom options to provider', async () => {
      mockMistral.mockResolvedValueOnce('Custom response');

      await executeWithFallback('mistral', 'sys', 'msg', {
        maxTokens: 2048,
        temperature: 0.5,
      });

      expect(mockMistral).toHaveBeenCalledWith('sys', 'msg', {
        maxTokens: 2048,
        temperature: 0.5,
      });
    });

    it('returns null for unsupported provider (ollama)', async () => {
      const result = await executeWithFallback('ollama', 'system', 'message');
      expect(result).toBeNull();
    });

    it('returns null when provider throws', async () => {
      mockMistral.mockRejectedValueOnce(new Error('API key invalid'));

      const result = await executeWithFallback('mistral', 'system', 'message');
      expect(result).toBeNull();
    });
  });

  // =============================================
  // streamWithFallback
  // =============================================

  describe('streamWithFallback', () => {
    let mockRes: { write: jest.Mock; end: jest.Mock; headersSent: boolean };

    beforeEach(() => {
      mockRes = {
        write: jest.fn().mockReturnValue(true),
        end: jest.fn(),
        headersSent: true,
      };
    });

    it('tries Mistral first and writes SSE events on success', async () => {
      mockMistral.mockResolvedValueOnce('Mistral answer');

      const result = await streamWithFallback(mockRes as any, 'system', 'message');

      expect(result).toEqual({ response: 'Mistral answer', provider: 'mistral' });
      expect(mockRes.write).toHaveBeenCalledTimes(3);
      expect(mockRes.write).toHaveBeenCalledWith('event: content_start\ndata: {}\n\n');
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: content_delta'),
      );
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: done'),
      );
    });

    it('falls back to OpenAI when Mistral fails', async () => {
      mockMistral.mockRejectedValueOnce(new Error('Mistral down'));
      mockOpenAI.mockResolvedValueOnce('OpenAI answer');

      const result = await streamWithFallback(mockRes as any, 'system', 'message');

      expect(result).toEqual({ response: 'OpenAI answer', provider: 'openai' });
      expect(mockMistral).toHaveBeenCalled();
      expect(mockOpenAI).toHaveBeenCalled();
    });

    it('returns null when all fallback providers fail', async () => {
      mockMistral.mockRejectedValueOnce(new Error('Mistral down'));
      mockOpenAI.mockRejectedValueOnce(new Error('OpenAI down'));

      const result = await streamWithFallback(mockRes as any, 'system', 'message');

      expect(result).toBeNull();
      expect(mockRes.write).not.toHaveBeenCalled();
    });

    it('includes fallback metadata in done event', async () => {
      mockMistral.mockResolvedValueOnce('Response text');

      await streamWithFallback(mockRes as any, 'system', 'message');

      // Find the done event write call
      const doneCall = mockRes.write.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('event: done'),
      );
      expect(doneCall).toBeDefined();

      const dataLine = (doneCall![0] as string).split('\n').find((l: string) => l.startsWith('data: '));
      const parsed = JSON.parse(dataLine!.replace('data: ', ''));
      expect(parsed.metadata.provider).toBe('mistral');
      expect(parsed.metadata.fallback).toBe(true);
    });
  });
});
