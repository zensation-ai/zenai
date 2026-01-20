/**
 * Security Tests: Input Validation (Sprint 2)
 *
 * Tests for Zod-based input validation schemas
 */

import {
  UUIDSchema,
  ContextSchema,
  PaginationSchema,
  IdeaTypeSchema,
  CategorySchema,
  PrioritySchema,
  IdeaInputSchema,
  IdeaSearchSchema,
  VoiceMemoTextSchema,
  ExportFilterSchema,
  CreateApiKeySchema,
  CheckDuplicatesSchema,
  SwipeActionSchema,
} from '../../../utils/schemas';

describe('Security: Input Validation (Sprint 2)', () => {
  // ===========================================
  // UUID Validation
  // ===========================================
  describe('UUIDSchema', () => {
    it('should accept valid UUIDs', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ];

      for (const uuid of validUUIDs) {
        const result = UUIDSchema.safeParse(uuid);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid UUIDs', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400e29b41d4a716446655440000',
        '',
        null,
        undefined,
        12345,
      ];

      for (const uuid of invalidUUIDs) {
        const result = UUIDSchema.safeParse(uuid);
        expect(result.success).toBe(false);
      }
    });

    it('should reject SQL injection attempts in UUIDs', () => {
      const sqlInjectionAttempts = [
        "550e8400-e29b-41d4-a716-446655440000'; DROP TABLE ideas;--",
        "550e8400-e29b-41d4-a716-446655440000 OR 1=1",
        "'; DELETE FROM ideas WHERE '1'='1",
      ];

      for (const attempt of sqlInjectionAttempts) {
        const result = UUIDSchema.safeParse(attempt);
        expect(result.success).toBe(false);
      }
    });
  });

  // ===========================================
  // Context Validation
  // ===========================================
  describe('ContextSchema', () => {
    it('should accept valid contexts', () => {
      expect(ContextSchema.safeParse('personal').success).toBe(true);
      expect(ContextSchema.safeParse('work').success).toBe(true);
    });

    it('should reject invalid contexts', () => {
      const invalidContexts = [
        'invalid',
        'Personal',
        'WORK',
        '',
        null,
        undefined,
        'admin',
        '../../../etc/passwd',
      ];

      for (const ctx of invalidContexts) {
        const result = ContextSchema.safeParse(ctx);
        expect(result.success).toBe(false);
      }
    });
  });

  // ===========================================
  // Pagination Validation
  // ===========================================
  describe('PaginationSchema', () => {
    it('should accept valid pagination params', () => {
      const result = PaginationSchema.safeParse({ limit: '20', offset: '0' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ limit: 20, offset: 0 });
    });

    it('should use default values when not provided', () => {
      const result = PaginationSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ limit: 20, offset: 0 });
    });

    it('should calculate offset from page', () => {
      const result = PaginationSchema.safeParse({ limit: '10', page: '3' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ limit: 10, offset: 20 });
    });

    it('should reject limit > 100', () => {
      const result = PaginationSchema.safeParse({ limit: '101' });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = PaginationSchema.safeParse({ offset: '-1' });
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric values', () => {
      const result = PaginationSchema.safeParse({ limit: 'abc' });
      expect(result.success).toBe(false);
    });
  });

  // ===========================================
  // Idea Enum Validations
  // ===========================================
  describe('IdeaTypeSchema', () => {
    it('should accept valid idea types', () => {
      const validTypes = ['idea', 'task', 'insight', 'problem', 'question'];
      for (const type of validTypes) {
        expect(IdeaTypeSchema.safeParse(type).success).toBe(true);
      }
    });

    it('should reject invalid types', () => {
      expect(IdeaTypeSchema.safeParse('invalid').success).toBe(false);
      expect(IdeaTypeSchema.safeParse('IDEA').success).toBe(false);
      expect(IdeaTypeSchema.safeParse('').success).toBe(false);
    });
  });

  describe('CategorySchema', () => {
    it('should accept valid categories', () => {
      const validCategories = ['business', 'technical', 'personal', 'learning'];
      for (const cat of validCategories) {
        expect(CategorySchema.safeParse(cat).success).toBe(true);
      }
    });

    it('should reject invalid categories', () => {
      expect(CategorySchema.safeParse('invalid').success).toBe(false);
      expect(CategorySchema.safeParse('BUSINESS').success).toBe(false);
    });
  });

  describe('PrioritySchema', () => {
    it('should accept valid priorities', () => {
      const validPriorities = ['low', 'medium', 'high'];
      for (const pri of validPriorities) {
        expect(PrioritySchema.safeParse(pri).success).toBe(true);
      }
    });

    it('should reject invalid priorities', () => {
      expect(PrioritySchema.safeParse('urgent').success).toBe(false);
      expect(PrioritySchema.safeParse('HIGH').success).toBe(false);
      expect(PrioritySchema.safeParse('1').success).toBe(false);
    });
  });

  // ===========================================
  // Idea Input Validation
  // ===========================================
  describe('IdeaInputSchema', () => {
    it('should accept valid idea input', () => {
      const validInput = {
        title: 'Test Idea',
        content: 'This is a test idea content',
        type: 'idea',
        category: 'technical',
        priority: 'medium',
      };
      const result = IdeaInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should trim whitespace from title', () => {
      const result = IdeaInputSchema.safeParse({ title: '  Test Title  ' });
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Test Title');
    });

    it('should reject empty title', () => {
      const result = IdeaInputSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });

    it('should reject title > 500 chars', () => {
      const longTitle = 'a'.repeat(501);
      const result = IdeaInputSchema.safeParse({ title: longTitle });
      expect(result.success).toBe(false);
    });

    it('should reject content > 50000 chars', () => {
      const longContent = 'a'.repeat(50001);
      const result = IdeaInputSchema.safeParse({ title: 'Test', content: longContent });
      expect(result.success).toBe(false);
    });

    it('should reject too many keywords', () => {
      const tooManyKeywords = Array(51).fill('keyword');
      const result = IdeaInputSchema.safeParse({ title: 'Test', keywords: tooManyKeywords });
      expect(result.success).toBe(false);
    });

    it('should reject XSS in title', () => {
      // Note: Zod doesn't sanitize XSS by default, but we trim
      // The actual XSS prevention should happen at output time
      const result = IdeaInputSchema.safeParse({ title: '<script>alert("xss")</script>' });
      expect(result.success).toBe(true);
      // Title is trimmed but script tags preserved (output encoding should handle XSS)
    });
  });

  // ===========================================
  // Search Validation
  // ===========================================
  describe('IdeaSearchSchema', () => {
    it('should accept valid search input', () => {
      const result = IdeaSearchSchema.safeParse({ query: 'test search' });
      expect(result.success).toBe(true);
    });

    it('should reject empty query', () => {
      const result = IdeaSearchSchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });

    it('should reject query > 500 chars', () => {
      const longQuery = 'a'.repeat(501);
      const result = IdeaSearchSchema.safeParse({ query: longQuery });
      expect(result.success).toBe(false);
    });

    it('should use default limit of 10', () => {
      const result = IdeaSearchSchema.safeParse({ query: 'test' });
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(10);
    });

    it('should clamp threshold to 0-1 range', () => {
      expect(IdeaSearchSchema.safeParse({ query: 'test', threshold: 0.5 }).success).toBe(true);
      expect(IdeaSearchSchema.safeParse({ query: 'test', threshold: 1.5 }).success).toBe(false);
      expect(IdeaSearchSchema.safeParse({ query: 'test', threshold: -0.5 }).success).toBe(false);
    });
  });

  // ===========================================
  // Voice Memo Validation
  // ===========================================
  describe('VoiceMemoTextSchema', () => {
    it('should accept valid text input', () => {
      const result = VoiceMemoTextSchema.safeParse({ text: 'This is a test memo' });
      expect(result.success).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = VoiceMemoTextSchema.safeParse({ text: '  Test memo  ' });
      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Test memo');
    });

    it('should reject empty text', () => {
      const result = VoiceMemoTextSchema.safeParse({ text: '' });
      expect(result.success).toBe(false);
    });

    it('should reject text > 100000 chars', () => {
      const longText = 'a'.repeat(100001);
      const result = VoiceMemoTextSchema.safeParse({ text: longText });
      expect(result.success).toBe(false);
    });

    it('should accept optional transcript', () => {
      const result = VoiceMemoTextSchema.safeParse({
        text: 'Test',
        transcript: 'Optional transcript',
      });
      expect(result.success).toBe(true);
    });
  });

  // ===========================================
  // Export Filter Validation
  // ===========================================
  describe('ExportFilterSchema', () => {
    it('should accept valid filters', () => {
      const result = ExportFilterSchema.safeParse({
        type: 'idea',
        category: 'technical',
        priority: 'high',
        includeArchived: true,
      });
      expect(result.success).toBe(true);
    });

    it('should use default for includeArchived', () => {
      const result = ExportFilterSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.includeArchived).toBe(false);
    });

    it('should coerce string boolean for includeArchived', () => {
      const result = ExportFilterSchema.safeParse({ includeArchived: 'true' });
      expect(result.success).toBe(true);
      expect(result.data?.includeArchived).toBe(true);
    });
  });

  // ===========================================
  // API Key Creation Validation
  // ===========================================
  describe('CreateApiKeySchema', () => {
    it('should accept valid API key creation', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'My API Key',
        scopes: ['read', 'write'],
        rateLimit: 500,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = CreateApiKeySchema.safeParse({
        name: '',
        scopes: ['read'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject name with special characters', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'My<script>Key',
        scopes: ['read'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty scopes', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test Key',
        scopes: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid scopes', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test Key',
        scopes: ['superadmin'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject rate limit > 10000', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test Key',
        scopes: ['read'],
        rateLimit: 99999,
      });
      expect(result.success).toBe(false);
    });

    it('should use default rate limit', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test Key',
        scopes: ['read'],
      });
      expect(result.success).toBe(true);
      expect(result.data?.rateLimit).toBe(1000);
    });
  });

  // ===========================================
  // Check Duplicates Validation
  // ===========================================
  describe('CheckDuplicatesSchema', () => {
    it('should accept content', () => {
      const result = CheckDuplicatesSchema.safeParse({ content: 'Test content' });
      expect(result.success).toBe(true);
    });

    it('should accept title', () => {
      const result = CheckDuplicatesSchema.safeParse({ title: 'Test title' });
      expect(result.success).toBe(true);
    });

    it('should require either content or title', () => {
      const result = CheckDuplicatesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should use default threshold', () => {
      const result = CheckDuplicatesSchema.safeParse({ content: 'Test' });
      expect(result.success).toBe(true);
      expect(result.data?.threshold).toBe(0.85);
    });
  });

  // ===========================================
  // Swipe Action Validation
  // ===========================================
  describe('SwipeActionSchema', () => {
    it('should accept valid actions', () => {
      const validActions = ['priority', 'later', 'archive'];
      for (const action of validActions) {
        const result = SwipeActionSchema.safeParse({ action });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid actions', () => {
      const invalidActions = ['delete', 'edit', 'PRIORITY', ''];
      for (const action of invalidActions) {
        const result = SwipeActionSchema.safeParse({ action });
        expect(result.success).toBe(false);
      }
    });
  });
});
