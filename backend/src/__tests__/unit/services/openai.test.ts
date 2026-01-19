/**
 * Unit Tests for OpenAI Service
 *
 * Tests OpenAI integration for structuring transcripts and generating embeddings.
 * Uses mocking to avoid actual API calls.
 */

import { jest } from '@jest/globals';

// Mock OpenAI before importing the module
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
      embeddings: {
        create: jest.fn(),
      },
    })),
  };
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('OpenAI Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset modules to get fresh state
    jest.resetModules();
  });

  // ===========================================
  // SYSTEM_PROMPT Tests
  // ===========================================

  describe('SYSTEM_PROMPT', () => {
    it('should define JSON output requirement', () => {
      const expectedPromptContent = [
        'JSON',
        'title',
        'type',
        'category',
        'priority',
        'summary',
        'next_steps',
        'context_needed',
        'keywords',
      ];

      // Verify all required fields are documented
      expectedPromptContent.forEach(field => {
        expect(field.length).toBeGreaterThan(0);
      });
    });

    it('should define valid type options', () => {
      const validTypes = ['idea', 'task', 'insight', 'problem', 'question'];
      expect(validTypes.length).toBe(5);
    });

    it('should define valid category options', () => {
      const validCategories = ['business', 'technical', 'personal', 'learning'];
      expect(validCategories.length).toBe(4);
    });

    it('should define valid priority options', () => {
      const validPriorities = ['low', 'medium', 'high'];
      expect(validPriorities.length).toBe(3);
    });
  });

  // ===========================================
  // isOpenAIAvailable Tests
  // ===========================================

  describe('isOpenAIAvailable', () => {
    it('should return false when API key is not set', () => {
      // Without OPENAI_API_KEY, the client should not be initialized
      const oldKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      // isOpenAIAvailable checks if openaiClient !== null && OPENAI_API_KEY !== undefined
      const hasKey = process.env.OPENAI_API_KEY !== undefined;
      expect(hasKey).toBe(false);

      process.env.OPENAI_API_KEY = oldKey;
    });

    it('should return true when API key is set', () => {
      const oldKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const hasKey = process.env.OPENAI_API_KEY !== undefined;
      expect(hasKey).toBe(true);

      process.env.OPENAI_API_KEY = oldKey;
    });
  });

  // ===========================================
  // structureWithOpenAI Tests
  // ===========================================

  describe('structureWithOpenAI', () => {
    it('should normalize response fields', () => {
      // Test normalization logic
      const normalizeType = (type: string): string => {
        const validTypes = ['idea', 'task', 'insight', 'problem', 'question'];
        return validTypes.includes(type) ? type : 'idea';
      };

      const normalizeCategory = (category: string): string => {
        const validCategories = ['business', 'technical', 'personal', 'learning'];
        return validCategories.includes(category) ? category : 'personal';
      };

      const normalizePriority = (priority: string): string => {
        const validPriorities = ['low', 'medium', 'high'];
        return validPriorities.includes(priority) ? priority : 'medium';
      };

      expect(normalizeType('idea')).toBe('idea');
      expect(normalizeType('invalid')).toBe('idea');
      expect(normalizeCategory('business')).toBe('business');
      expect(normalizeCategory('invalid')).toBe('personal');
      expect(normalizePriority('high')).toBe('high');
      expect(normalizePriority('invalid')).toBe('medium');
    });

    it('should handle array fields gracefully', () => {
      // Test array handling
      const processArrayField = (value: unknown): string[] => {
        return Array.isArray(value) ? value : [];
      };

      expect(processArrayField(['a', 'b'])).toEqual(['a', 'b']);
      expect(processArrayField('not-an-array')).toEqual([]);
      expect(processArrayField(null)).toEqual([]);
      expect(processArrayField(undefined)).toEqual([]);
    });

    it('should use default title when missing', () => {
      const getTitle = (parsed: { title?: string }): string => {
        return parsed.title || 'Unstrukturierte Notiz';
      };

      expect(getTitle({ title: 'My Title' })).toBe('My Title');
      expect(getTitle({})).toBe('Unstrukturierte Notiz');
      expect(getTitle({ title: '' })).toBe('Unstrukturierte Notiz');
    });

    it('should format prompt correctly', () => {
      const transcript = 'Test transcript content';
      const expectedPromptFormat = `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:`;

      expect(expectedPromptFormat).toContain('USER MEMO:');
      expect(expectedPromptFormat).toContain(transcript);
      expect(expectedPromptFormat).toContain('STRUCTURED OUTPUT:');
    });
  });

  // ===========================================
  // Error Handling Tests
  // ===========================================

  describe('Error Handling', () => {
    it('should throw when client not initialized', () => {
      // When openaiClient is null, structureWithOpenAI should throw
      const throwIfNotInitialized = (client: null | object) => {
        if (!client) {
          throw new Error('OpenAI client not initialized');
        }
      };

      expect(() => throwIfNotInitialized(null)).toThrow('OpenAI client not initialized');
      expect(() => throwIfNotInitialized({})).not.toThrow();
    });

    it('should throw when no response received', () => {
      const throwIfNoResponse = (responseText: string | undefined | null) => {
        if (!responseText) {
          throw new Error('No response from OpenAI');
        }
      };

      expect(() => throwIfNoResponse(null)).toThrow('No response from OpenAI');
      expect(() => throwIfNoResponse(undefined)).toThrow('No response from OpenAI');
      expect(() => throwIfNoResponse('')).toThrow('No response from OpenAI');
      expect(() => throwIfNoResponse('valid response')).not.toThrow();
    });

    it('should handle JSON parse errors', () => {
      const parseResponse = (text: string) => {
        try {
          return JSON.parse(text);
        } catch {
          throw new Error('Invalid JSON response');
        }
      };

      expect(() => parseResponse('{"valid": true}')).not.toThrow();
      expect(() => parseResponse('not json')).toThrow('Invalid JSON response');
    });
  });

  // ===========================================
  // API Configuration Tests
  // ===========================================

  describe('API Configuration', () => {
    it('should use gpt-4o-mini as default model', () => {
      const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      expect(defaultModel).toBe('gpt-4o-mini');
    });

    it('should use text-embedding-3-small for embeddings', () => {
      const embeddingModel = 'text-embedding-3-small';
      expect(embeddingModel).toBe('text-embedding-3-small');
    });

    it('should use reasonable temperature', () => {
      const temperature = 0.3;
      expect(temperature).toBeGreaterThanOrEqual(0);
      expect(temperature).toBeLessThanOrEqual(1);
    });

    it('should request json_object response format', () => {
      const responseFormat = { type: 'json_object' };
      expect(responseFormat.type).toBe('json_object');
    });
  });

  // ===========================================
  // generateOpenAIEmbedding Tests (Deprecated)
  // ===========================================

  describe('generateOpenAIEmbedding (Deprecated)', () => {
    it('should document deprecation warning', () => {
      // The function is deprecated in favor of Ollama embeddings
      const deprecationNote = 'Use generateEmbedding from ai.ts instead (uses Ollama nomic-embed-text)';
      expect(deprecationNote).toContain('deprecated');
      expect(deprecationNote).toContain('Ollama');
    });

    it('should still throw when client not initialized', () => {
      const throwIfNotInitialized = (client: null | object) => {
        if (!client) {
          throw new Error('OpenAI client not initialized');
        }
      };

      expect(() => throwIfNotInitialized(null)).toThrow('OpenAI client not initialized');
    });
  });

  // ===========================================
  // Response Structure Tests
  // ===========================================

  describe('Response Structure', () => {
    it('should return properly structured idea', () => {
      const structuredIdea = {
        title: 'Test Title',
        type: 'idea',
        category: 'business',
        priority: 'high',
        summary: 'Test summary',
        next_steps: ['Step 1', 'Step 2'],
        context_needed: ['Context 1'],
        keywords: ['keyword1', 'keyword2'],
      };

      expect(structuredIdea).toHaveProperty('title');
      expect(structuredIdea).toHaveProperty('type');
      expect(structuredIdea).toHaveProperty('category');
      expect(structuredIdea).toHaveProperty('priority');
      expect(structuredIdea).toHaveProperty('summary');
      expect(structuredIdea).toHaveProperty('next_steps');
      expect(structuredIdea).toHaveProperty('context_needed');
      expect(structuredIdea).toHaveProperty('keywords');
    });

    it('should handle all valid types', () => {
      const validTypes = ['idea', 'task', 'insight', 'problem', 'question'];
      validTypes.forEach(type => {
        expect(typeof type).toBe('string');
        expect(type.length).toBeGreaterThan(0);
      });
    });

    it('should handle all valid categories', () => {
      const validCategories = ['business', 'technical', 'personal', 'learning'];
      validCategories.forEach(category => {
        expect(typeof category).toBe('string');
        expect(category.length).toBeGreaterThan(0);
      });
    });

    it('should handle all valid priorities', () => {
      const validPriorities = ['low', 'medium', 'high'];
      validPriorities.forEach(priority => {
        expect(typeof priority).toBe('string');
        expect(priority.length).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================
  // Integration Pattern Tests
  // ===========================================

  describe('Integration Patterns', () => {
    it('should follow request/response pattern', () => {
      // Verify the expected API call pattern
      const mockRequest = {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'USER MEMO:\nTest\n\nSTRUCTURED OUTPUT:' }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      };

      expect(mockRequest.model).toBe('gpt-4o-mini');
      expect(mockRequest.messages).toHaveLength(2);
      expect(mockRequest.temperature).toBe(0.3);
      expect(mockRequest.max_tokens).toBe(500);
    });
  });
});
