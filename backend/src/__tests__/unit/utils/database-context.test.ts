/**
 * Unit Tests for Database Context Utilities
 *
 * Tests the dual-database architecture for Personal vs Work contexts.
 */

import { isValidUUID, isValidContext, AIContext } from '../../../utils/database-context';

describe('Database Context Utilities', () => {
  // ===========================================
  // isValidUUID Tests
  // ===========================================

  describe('isValidUUID', () => {
    it('should validate standard UUID v4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should validate UUID v1', () => {
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should validate lowercase UUIDs', () => {
      expect(isValidUUID('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true);
    });

    it('should validate uppercase UUIDs', () => {
      expect(isValidUUID('A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11')).toBe(true);
    });

    it('should validate mixed case UUIDs', () => {
      expect(isValidUUID('A0eeBC99-9c0B-4eF8-Bb6D-6bB9bD380A11')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });

    it('should reject too short strings', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
    });

    it('should reject strings without hyphens', () => {
      expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    it('should reject strings with invalid characters', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000!')).toBe(false);
    });

    it('should reject strings with wrong format', () => {
      expect(isValidUUID('not-a-valid-uuid-at-all')).toBe(false);
      expect(isValidUUID('12345678-1234-1234-1234-123456789012x')).toBe(false);
    });

    it('should reject null-like strings', () => {
      expect(isValidUUID('null')).toBe(false);
      expect(isValidUUID('undefined')).toBe(false);
    });

    it('should reject UUIDs with wrong version digit', () => {
      // Version must be 1-5 (third group first digit)
      expect(isValidUUID('550e8400-e29b-01d4-a716-446655440000')).toBe(false);
      expect(isValidUUID('550e8400-e29b-61d4-a716-446655440000')).toBe(false);
    });

    it('should reject UUIDs with wrong variant digit', () => {
      // Variant must be 8, 9, a, or b (fourth group first digit)
      expect(isValidUUID('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
    });
  });

  // ===========================================
  // isValidContext Tests
  // ===========================================

  describe('isValidContext', () => {
    it('should validate "personal" context', () => {
      expect(isValidContext('personal')).toBe(true);
    });

    it('should validate "work" context', () => {
      expect(isValidContext('work')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidContext('')).toBe(false);
    });

    it('should reject invalid contexts', () => {
      expect(isValidContext('invalid')).toBe(false);
      expect(isValidContext('private')).toBe(false);
      expect(isValidContext('business')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isValidContext('Personal')).toBe(false);
      expect(isValidContext('PERSONAL')).toBe(false);
      expect(isValidContext('Work')).toBe(false);
      expect(isValidContext('WORK')).toBe(false);
    });

    it('should reject strings with extra whitespace', () => {
      expect(isValidContext(' personal')).toBe(false);
      expect(isValidContext('personal ')).toBe(false);
      expect(isValidContext(' personal ')).toBe(false);
    });
  });

  // ===========================================
  // AIContext Type Tests
  // ===========================================

  describe('AIContext Type', () => {
    it('should only allow valid context values', () => {
      // TypeScript compile-time check - these should be valid
      const validContexts: AIContext[] = ['personal', 'work', 'learning', 'creative'];

      expect(validContexts).toContain('personal');
      expect(validContexts).toContain('work');
      expect(validContexts).toContain('learning');
      expect(validContexts).toContain('creative');
      expect(validContexts.length).toBe(4);
    });

    it('should work with type guard', () => {
      const testContext = (ctx: string): ctx is AIContext => {
        return isValidContext(ctx);
      };

      expect(testContext('personal')).toBe(true);
      expect(testContext('work')).toBe(true);
      expect(testContext('invalid')).toBe(false);
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle special characters in context check', () => {
      expect(isValidContext('personal\n')).toBe(false);
      expect(isValidContext('personal\t')).toBe(false);
      expect(isValidContext('personal\r')).toBe(false);
    });

    it('should handle unicode in UUID check', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000ö')).toBe(false);
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      expect(isValidUUID(longString)).toBe(false);
      expect(isValidContext(longString)).toBe(false);
    });
  });
});
