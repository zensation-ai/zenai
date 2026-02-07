/**
 * Phase 7.2: API Response Validation Tests
 *
 * Tests Zod schema validation for core API response shapes.
 * Verifies both valid and invalid data handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  safeParseResponse,
  HealthResponseSchema,
  IdeasResponseSchema,
  IdeaCreationResponseSchema,
  ChatSessionsResponseSchema,
  ChatMessageResponseSchema,
  CodeExecutionResponseSchema,
  SearchResponseSchema,
  MeetingsResponseSchema,
  SyncStatusResponseSchema,
  createWrappedSchema,
} from '../apiSchemas';
import { z } from 'zod';

describe('API Schema Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('safeParseResponse', () => {
    it('should return validated data for valid input', () => {
      const schema = z.object({ count: z.number() });
      const data = { count: 42 };
      const result = safeParseResponse(schema, data, 'test');
      expect(result).toEqual({ count: 42 });
    });

    it('should return raw data on validation failure (graceful degradation)', () => {
      const schema = z.object({ count: z.number() });
      const invalidData = { count: 'not-a-number' };

      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = safeParseResponse(schema, invalidData, 'test');
      // Should return raw data as fallback
      expect(result).toEqual(invalidData);

      warnSpy.mockRestore();
    });

    it('should log warning in dev mode on validation failure', () => {
      const schema = z.object({ count: z.number() });
      const invalidData = { count: 'wrong' };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      safeParseResponse(schema, invalidData, 'testContext');

      // In test mode (which uses DEV-like env), a warning should be logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[API Schema] Validation failed for "testContext"'),
        expect.any(String),
      );

      warnSpy.mockRestore();
    });
  });

  describe('HealthResponseSchema', () => {
    it('should validate a valid health response', () => {
      const data = {
        status: 'healthy',
        timestamp: '2026-02-07T12:00:00Z',
        version: '2.0.0',
        services: {
          databases: {
            personal: { status: 'connected' },
            work: { status: 'connected' },
          },
          ai: {
            claude: { status: 'healthy', available: true },
            ollama: { status: 'disconnected', models: [] },
          },
        },
        uptime: { seconds: 3600, human: '1h 0m 0s' },
        memory: { heapUsed: '50 MB', heapTotal: '100 MB', rss: '150 MB' },
      };

      const result = HealthResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept minimal health response', () => {
      const data = { status: 'healthy' };
      const result = HealthResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept extra fields (passthrough)', () => {
      const data = { status: 'healthy', customField: 'value' };
      const result = HealthResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).customField).toBe('value');
      }
    });

    it('should reject missing status', () => {
      const data = { timestamp: '2026-02-07T12:00:00Z' };
      const result = HealthResponseSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('IdeasResponseSchema', () => {
    it('should validate an ideas list response', () => {
      const data = {
        ideas: [
          { id: 'idea-1', title: 'Test Idea', type: 'task', category: 'work', priority: 'high' },
          { id: 'idea-2', title: 'Another Idea' },
        ],
        pagination: { total: 2, limit: 100, offset: 0 },
      };

      const result = IdeasResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ideas).toHaveLength(2);
        expect(result.data.pagination?.total).toBe(2);
      }
    });

    it('should default ideas to empty array when missing', () => {
      const data = {};
      const result = IdeasResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ideas).toEqual([]);
      }
    });

    it('should accept ideas with extra properties', () => {
      const data = {
        ideas: [{ id: 'idea-1', customField: 'extra' }],
      };
      const result = IdeasResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('IdeaCreationResponseSchema', () => {
    it('should validate idea creation response', () => {
      const data = {
        ideaId: 'new-idea-123',
        structured: {
          title: 'New Idea',
          summary: 'A test idea',
          type: 'task',
          category: 'work',
          priority: 'medium',
          next_steps: ['Step 1', 'Step 2'],
          keywords: ['test'],
        },
        success: true,
      };

      const result = IdeaCreationResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ideaId).toBe('new-idea-123');
        expect(result.data.structured?.next_steps).toEqual(['Step 1', 'Step 2']);
      }
    });

    it('should reject missing ideaId', () => {
      const data = { structured: { title: 'No ID' } };
      const result = IdeaCreationResponseSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('ChatSessionsResponseSchema', () => {
    it('should validate chat sessions response', () => {
      const data = {
        data: {
          sessions: [
            { id: 'session-1', title: 'Chat 1', created_at: '2026-02-07T12:00:00Z' },
          ],
        },
      };

      const result = ChatSessionsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data.sessions).toHaveLength(1);
      }
    });

    it('should default sessions to empty array', () => {
      const data = { data: {} };
      const result = ChatSessionsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data.sessions).toEqual([]);
      }
    });
  });

  describe('ChatMessageResponseSchema', () => {
    it('should validate chat message response', () => {
      const data = {
        data: {
          userMessage: { id: 'msg-1', role: 'user' as const, content: 'Hello' },
          assistantMessage: { id: 'msg-2', role: 'assistant' as const, content: 'Hi there!' },
          titleUpdated: true,
          title: 'Greeting Chat',
        },
      };

      const result = ChatMessageResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('CodeExecutionResponseSchema', () => {
    it('should validate code execution response', () => {
      const data = {
        success: true,
        data: {
          output: 'Hello World\n',
          exitCode: 0,
          executionTime: 150,
          language: 'python',
          code: 'print("Hello World")',
        },
      };

      const result = CodeExecutionResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data?.output).toBe('Hello World\n');
      }
    });

    it('should validate failed execution', () => {
      const data = {
        success: false,
        data: {
          error: 'SyntaxError: invalid syntax',
          exitCode: 1,
        },
      };

      const result = CodeExecutionResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('SearchResponseSchema', () => {
    it('should validate search response', () => {
      const data = {
        ideas: [
          { id: 'search-1', title: 'Match 1' },
          { id: 'search-2', title: 'Match 2' },
        ],
      };

      const result = SearchResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ideas).toHaveLength(2);
      }
    });

    it('should default to empty array when no ideas', () => {
      const data = {};
      const result = SearchResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ideas).toEqual([]);
      }
    });
  });

  describe('MeetingsResponseSchema', () => {
    it('should validate meetings response', () => {
      const data = {
        meetings: [
          { id: 'meet-1', title: 'Standup', date: '2026-02-07', status: 'scheduled' },
        ],
      };

      const result = MeetingsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should default to empty array', () => {
      const data = {};
      const result = MeetingsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.meetings).toEqual([]);
      }
    });
  });

  describe('SyncStatusResponseSchema', () => {
    it('should validate sync status response', () => {
      const data = {
        last_sync: '2026-02-07T12:00:00Z',
        pending_changes: 3,
        sync_enabled: true,
        devices: [{ id: 'device-1', name: 'iPhone' }],
      };

      const result = SyncStatusResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept null last_sync', () => {
      const data = { last_sync: null };
      const result = SyncStatusResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('createWrappedSchema', () => {
    it('should create a { success, data } wrapper schema', () => {
      const innerSchema = z.object({ name: z.string() });
      const wrappedSchema = createWrappedSchema(innerSchema);

      const data = { success: true, data: { name: 'test' } };
      const result = wrappedSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});
