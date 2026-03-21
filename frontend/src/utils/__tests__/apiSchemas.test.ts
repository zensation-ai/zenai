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
  SyncPendingResponseSchema,
  AutomationsResponseSchema,
  AutomationSuggestionsResponseSchema,
  AutomationStatsResponseSchema,
  ProfileStatsResponseSchema,
  ProfileRecommendationsResponseSchema,
  BusinessProfileResponseSchema,
  NotificationStatusResponseSchema,
  NotificationDevicesResponseSchema,
  NotificationHistoryResponseSchema,
  NotificationStatsResponseSchema,
  AnalyticsDashboardResponseSchema,
  ProductivityScoreResponseSchema,
  ExportHistoryResponseSchema,
  StoriesResponseSchema,
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

      // logger.warn prefixes with '[WARN]' before delegating to console.warn
      expect(warnSpy).toHaveBeenCalledWith(
        '[WARN]',
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
        sessions: [
          { id: 'session-1', title: 'Chat 1', created_at: '2026-02-07T12:00:00Z' },
        ],
      };

      const result = ChatSessionsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessions).toHaveLength(1);
      }
    });

    it('should default sessions to empty array', () => {
      const data = {};
      const result = ChatSessionsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessions).toEqual([]);
      }
    });
  });

  describe('ChatMessageResponseSchema', () => {
    it('should validate chat message response', () => {
      const data = {
        userMessage: { id: 'msg-1', role: 'user' as const, content: 'Hello' },
        assistantMessage: { id: 'msg-2', role: 'assistant' as const, content: 'Hi there!' },
        titleUpdated: true,
        title: 'Greeting Chat',
      };

      const result = ChatMessageResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('CodeExecutionResponseSchema', () => {
    it('should validate code execution response', () => {
      const data = {
        success: true,
        output: 'Hello World\n',
        exitCode: 0,
        executionTime: 150,
        language: 'python',
        code: 'print("Hello World")',
      };

      const result = CodeExecutionResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output).toBe('Hello World\n');
      }
    });

    it('should validate failed execution', () => {
      const data = {
        success: false,
        error: 'SyntaxError: invalid syntax',
        exitCode: 1,
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

  // =================================================================
  // Phase 8.5: Expanded Schema Tests
  // =================================================================

  describe('SyncPendingResponseSchema', () => {
    it('should validate pending changes response', () => {
      const data = {
        changes: [
          { id: 'change-1', type: 'idea', action: 'archive', timestamp: '2026-02-07T12:00:00Z', synced: false },
        ],
      };
      const result = SyncPendingResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.changes).toHaveLength(1);
      }
    });

    it('should default changes to empty array', () => {
      const result = SyncPendingResponseSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.changes).toEqual([]);
      }
    });
  });

  describe('AutomationsResponseSchema', () => {
    it('should validate automations list', () => {
      const data = {
        automations: [
          {
            id: 'auto-1',
            name: 'Auto Archive',
            description: 'Automatically archive old ideas',
            trigger: { type: 'schedule', config: { cron: '0 0 * * *' } },
            actions: [{ type: 'archive', config: {}, order: 0 }],
            is_active: true,
            run_count: 42,
            success_count: 40,
            failure_count: 2,
            last_run_at: '2026-02-07T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      };
      const result = AutomationsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.automations).toHaveLength(1);
        expect(result.data.automations[0].name).toBe('Auto Archive');
      }
    });

    it('should default to empty array', () => {
      const result = AutomationsResponseSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.automations).toEqual([]);
      }
    });
  });

  describe('AutomationSuggestionsResponseSchema', () => {
    it('should validate suggestions response', () => {
      const data = {
        suggestions: [
          { id: 'sug-1', name: 'Priority Boost', description: 'Auto-prioritize tech ideas', reasoning: 'Pattern detected', confidence: 0.85 },
        ],
      };
      const result = AutomationSuggestionsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.suggestions[0].confidence).toBe(0.85);
      }
    });
  });

  describe('AutomationStatsResponseSchema', () => {
    it('should validate stats response', () => {
      const data = {
        total_automations: 5,
        active_automations: 3,
        total_executions: 100,
        successful_executions: 95,
        failed_executions: 5,
        success_rate: 0.95,
      };
      const result = AutomationStatsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success_rate).toBe(0.95);
      }
    });
  });

  describe('ProfileStatsResponseSchema', () => {
    it('should validate profile stats', () => {
      const data = {
        total_ideas: 150,
        total_meetings: 20,
        avg_ideas_per_day: 3.5,
        top_categories: [['tech', 45], ['business', 30]],
        top_types: [['idea', 80], ['task', 40]],
        top_topics: [['AI', 25]],
      };
      const result = ProfileStatsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('ProfileRecommendationsResponseSchema', () => {
    it('should validate recommendations', () => {
      const data = {
        recommendations: {
          suggested_topics: ['AI', 'DevOps'],
          optimal_hours: [9, 10, 14],
          focus_categories: ['tech'],
          insights: ['You are most productive in the morning'],
        },
      };
      const result = ProfileRecommendationsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('BusinessProfileResponseSchema', () => {
    it('should validate business profile', () => {
      const data = {
        profile: {
          id: 'profile-1',
          company_name: 'ZenSation',
          industry: 'Tech',
          role: 'CTO',
        },
      };
      const result = BusinessProfileResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept null fields', () => {
      const data = {
        profile: {
          id: 'profile-1',
          company_name: null,
          industry: null,
          role: null,
        },
      };
      const result = BusinessProfileResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('NotificationStatusResponseSchema', () => {
    it('should validate push status', () => {
      const data = {
        configured: true,
        provider: 'firebase',
        active_devices: 2,
      };
      const result = NotificationStatusResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('NotificationDevicesResponseSchema', () => {
    it('should validate devices list', () => {
      const data = {
        devices: [
          { id: 'dev-1', device_name: 'iPhone 15', is_active: true, last_used_at: '2026-02-07T12:00:00Z' },
        ],
      };
      const result = NotificationDevicesResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.devices).toHaveLength(1);
      }
    });

    it('should default to empty array', () => {
      const result = NotificationDevicesResponseSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.devices).toEqual([]);
      }
    });
  });

  describe('NotificationHistoryResponseSchema', () => {
    it('should validate history response', () => {
      const data = {
        notifications: [
          { id: 'notif-1', type: 'draft_ready', title: 'Draft Ready', body: 'Your idea is ready', status: 'sent', sent_at: '2026-02-07T12:00:00Z' },
        ],
      };
      const result = NotificationHistoryResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('NotificationStatsResponseSchema', () => {
    it('should validate notification stats', () => {
      const data = {
        total_sent: 100,
        total_opened: 75,
        open_rate: 0.75,
      };
      const result = NotificationStatsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept extra fields via passthrough', () => {
      const data = {
        total_sent: 100,
        total_opened: 75,
        open_rate: 0.75,
        by_type: { draft_ready: 40, feedback_reminder: 30 },
      };
      const result = NotificationStatsResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('AnalyticsDashboardResponseSchema', () => {
    it('should validate dashboard data', () => {
      const data = {
        data: {
          summary: { total: 150, today: 5, thisWeek: 25, thisMonth: 80 },
          goals: {
            daily: { target: 5, current: 3, progress: 0.6 },
            weekly: { target: 20, current: 18, progress: 0.9 },
          },
          streaks: { current: 7, longest: 15 },
        },
      };
      const result = AnalyticsDashboardResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept partial data', () => {
      const data = { data: { summary: { total: 10 } } };
      const result = AnalyticsDashboardResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('ProductivityScoreResponseSchema', () => {
    it('should validate productivity score', () => {
      const data = {
        data: {
          overall: 82,
          breakdown: {
            output: { score: 85, label: 'High' },
            consistency: { score: 78, label: 'Good' },
          },
          trend: 'improving',
        },
      };
      const result = ProductivityScoreResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('ExportHistoryResponseSchema', () => {
    it('should validate export history', () => {
      const data = {
        exports: [
          { id: 'exp-1', format: 'json', filename: 'export.json', size: 1024, created_at: '2026-02-07T12:00:00Z' },
        ],
      };
      const result = ExportHistoryResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.exports).toHaveLength(1);
      }
    });

    it('should default to empty array', () => {
      const result = ExportHistoryResponseSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.exports).toEqual([]);
      }
    });
  });

  describe('StoriesResponseSchema', () => {
    it('should validate stories response', () => {
      const data = {
        stories: [
          {
            id: 'story-1',
            title: 'My Week',
            date: '2026-02-07',
            items: [
              { id: 'item-1', type: 'idea', title: 'Great Idea' },
            ],
          },
        ],
      };
      const result = StoriesResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stories).toHaveLength(1);
        expect(result.data.stories[0].items).toHaveLength(1);
      }
    });

    it('should default to empty array', () => {
      const result = StoriesResponseSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stories).toEqual([]);
      }
    });
  });
});
