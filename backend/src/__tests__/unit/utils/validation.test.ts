/**
 * Unit Tests for Validation Utilities
 *
 * Tests the centralized validation functions used across all routes.
 */

import {
  parseIntSafe,
  parseFloatSafe,
  validatePagination,
  validateRequiredString,
  validateOptionalString,
  validateEnum,
  validateContext,
  validateUUID,
  validateDate,
  validateStringArray,
  validateIdeaType,
  validateCategory,
  validatePriority,
} from '../../../utils/validation';

describe('Validation Utilities', () => {
  // ===========================================
  // parseIntSafe Tests
  // ===========================================

  describe('parseIntSafe', () => {
    it('should return default value for undefined input', () => {
      const result = parseIntSafe(undefined, { default: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toBe(10);
    });

    it('should return default value for null input', () => {
      const result = parseIntSafe(null, { default: 5 });
      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });

    it('should return default value for empty string', () => {
      const result = parseIntSafe('', { default: 20 });
      expect(result.success).toBe(true);
      expect(result.data).toBe(20);
    });

    it('should parse valid integer string', () => {
      const result = parseIntSafe('42');
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should fail for non-numeric string', () => {
      const result = parseIntSafe('abc', { fieldName: 'count' });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].field).toBe('count');
      expect(result.errors?.[0].message).toContain('valid integer');
    });

    it('should fail when below minimum', () => {
      const result = parseIntSafe('5', { min: 10, fieldName: 'value' });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('at least 10');
    });

    it('should fail when above maximum', () => {
      const result = parseIntSafe('100', { max: 50, fieldName: 'value' });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('at most 50');
    });

    it('should pass when within range', () => {
      const result = parseIntSafe('25', { min: 10, max: 50 });
      expect(result.success).toBe(true);
      expect(result.data).toBe(25);
    });
  });

  // ===========================================
  // parseFloatSafe Tests
  // ===========================================

  describe('parseFloatSafe', () => {
    it('should parse valid float string', () => {
      const result = parseFloatSafe('3.14');
      expect(result.success).toBe(true);
      expect(result.data).toBeCloseTo(3.14);
    });

    it('should fail for non-numeric string', () => {
      const result = parseFloatSafe('not-a-number');
      expect(result.success).toBe(false);
    });

    it('should respect min/max bounds', () => {
      const result = parseFloatSafe('0.5', { min: 0, max: 1 });
      expect(result.success).toBe(true);
      expect(result.data).toBe(0.5);
    });
  });

  // ===========================================
  // validatePagination Tests
  // ===========================================

  describe('validatePagination', () => {
    it('should return defaults when no params provided', () => {
      const result = validatePagination({});
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(20);
      expect(result.data?.offset).toBe(0);
    });

    it('should parse limit and offset', () => {
      const result = validatePagination({ limit: '10', offset: '50' });
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(10);
      expect(result.data?.offset).toBe(50);
    });

    it('should calculate offset from page number', () => {
      const result = validatePagination({ limit: '10', page: '3' });
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(10);
      expect(result.data?.offset).toBe(20); // (3-1) * 10
    });

    it('should enforce maxLimit', () => {
      const result = validatePagination({ limit: '200' }, { maxLimit: 100 });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('at most 100');
    });

    it('should reject negative offset', () => {
      const result = validatePagination({ offset: '-5' });
      expect(result.success).toBe(false);
    });
  });

  // ===========================================
  // validateRequiredString Tests
  // ===========================================

  describe('validateRequiredString', () => {
    it('should fail for undefined value', () => {
      const result = validateRequiredString(undefined, 'name');
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('required');
    });

    it('should fail for null value', () => {
      const result = validateRequiredString(null, 'name');
      expect(result.success).toBe(false);
    });

    it('should fail for non-string value', () => {
      const result = validateRequiredString(123, 'name');
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('must be a string');
    });

    it('should trim and validate string', () => {
      const result = validateRequiredString('  hello world  ', 'name');
      expect(result.success).toBe(true);
      expect(result.data).toBe('hello world');
    });

    it('should fail for string shorter than minLength', () => {
      const result = validateRequiredString('ab', 'name', { minLength: 3 });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('at least 3');
    });

    it('should fail for string longer than maxLength', () => {
      const result = validateRequiredString('hello world', 'name', { maxLength: 5 });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('at most 5');
    });
  });

  // ===========================================
  // validateOptionalString Tests
  // ===========================================

  describe('validateOptionalString', () => {
    it('should return undefined for missing value', () => {
      const result = validateOptionalString(undefined, 'description');
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const result = validateOptionalString('', 'description');
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should validate and trim provided string', () => {
      const result = validateOptionalString('  test  ', 'description');
      expect(result.success).toBe(true);
      expect(result.data).toBe('test');
    });
  });

  // ===========================================
  // validateEnum Tests
  // ===========================================

  describe('validateEnum', () => {
    const validValues = ['red', 'green', 'blue'] as const;

    it('should validate valid enum value', () => {
      const result = validateEnum('red', validValues, 'color');
      expect(result.success).toBe(true);
      expect(result.data).toBe('red');
    });

    it('should fail for invalid enum value', () => {
      const result = validateEnum('yellow', validValues, 'color');
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('must be one of');
    });

    it('should return default value when not provided', () => {
      const result = validateEnum(undefined, validValues, 'color', { default: 'blue' });
      expect(result.success).toBe(true);
      expect(result.data).toBe('blue');
    });

    it('should fail when required and not provided', () => {
      const result = validateEnum(undefined, validValues, 'color', { required: true });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('required');
    });
  });

  // ===========================================
  // validateContext Tests
  // ===========================================

  describe('validateContext', () => {
    it('should validate "personal" context', () => {
      const result = validateContext('personal');
      expect(result.success).toBe(true);
      expect(result.data).toBe('personal');
    });

    it('should validate "work" context', () => {
      const result = validateContext('work');
      expect(result.success).toBe(true);
      expect(result.data).toBe('work');
    });

    it('should fail for invalid context', () => {
      const result = validateContext('invalid');
      expect(result.success).toBe(false);
    });

    it('should fail for missing context', () => {
      const result = validateContext(undefined);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================
  // validateUUID Tests
  // ===========================================

  describe('validateUUID', () => {
    it('should validate valid UUID v4', () => {
      const result = validateUUID('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
    });

    it('should validate UUID with different version', () => {
      const result = validateUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
      expect(result.success).toBe(true);
    });

    it('should fail for invalid UUID format', () => {
      const result = validateUUID('not-a-uuid');
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('valid UUID');
    });

    it('should fail for UUID with invalid characters', () => {
      const result = validateUUID('550e8400-e29b-41d4-a716-44665544000g');
      expect(result.success).toBe(false);
    });

    it('should fail for missing UUID', () => {
      const result = validateUUID(undefined);
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('required');
    });
  });

  // ===========================================
  // validateDate Tests
  // ===========================================

  describe('validateDate', () => {
    it('should validate ISO date string', () => {
      const result = validateDate('2024-01-15T10:30:00Z', 'startDate');
      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Date);
    });

    it('should validate date-only string', () => {
      const result = validateDate('2024-01-15', 'startDate');
      expect(result.success).toBe(true);
    });

    it('should fail for invalid date string', () => {
      const result = validateDate('not-a-date', 'startDate');
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('valid date');
    });

    it('should return undefined for optional missing date', () => {
      const result = validateDate(undefined, 'startDate');
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should fail for required missing date', () => {
      const result = validateDate(undefined, 'startDate', { required: true });
      expect(result.success).toBe(false);
    });
  });

  // ===========================================
  // validateStringArray Tests
  // ===========================================

  describe('validateStringArray', () => {
    it('should return empty array for undefined input', () => {
      const result = validateStringArray(undefined, 'tags');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should validate array of strings', () => {
      const result = validateStringArray(['tag1', 'tag2', 'tag3'], 'tags');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should trim string items', () => {
      const result = validateStringArray(['  tag1  ', '  tag2  '], 'tags');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['tag1', 'tag2']);
    });

    it('should fail for non-array input', () => {
      const result = validateStringArray('not-an-array', 'tags');
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('must be an array');
    });

    it('should fail for array with non-string items', () => {
      const result = validateStringArray(['tag1', 123, 'tag3'], 'tags');
      expect(result.success).toBe(false);
    });

    it('should enforce maxItems limit', () => {
      const result = validateStringArray(['a', 'b', 'c', 'd'], 'tags', { maxItems: 3 });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('at most 3');
    });
  });

  // ===========================================
  // Idea Field Validation Tests
  // ===========================================

  describe('validateIdeaType', () => {
    it('should validate "idea" type', () => {
      const result = validateIdeaType('idea');
      expect(result.success).toBe(true);
      expect(result.data).toBe('idea');
    });

    it('should validate "task" type', () => {
      const result = validateIdeaType('task');
      expect(result.success).toBe(true);
    });

    it('should validate "insight" type', () => {
      const result = validateIdeaType('insight');
      expect(result.success).toBe(true);
    });

    it('should fail for invalid type', () => {
      const result = validateIdeaType('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('validateCategory', () => {
    it('should validate "business" category', () => {
      const result = validateCategory('business');
      expect(result.success).toBe(true);
    });

    it('should validate "technical" category', () => {
      const result = validateCategory('technical');
      expect(result.success).toBe(true);
    });

    it('should fail for invalid category', () => {
      const result = validateCategory('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('validatePriority', () => {
    it('should validate "low" priority', () => {
      const result = validatePriority('low');
      expect(result.success).toBe(true);
    });

    it('should validate "medium" priority', () => {
      const result = validatePriority('medium');
      expect(result.success).toBe(true);
    });

    it('should validate "high" priority', () => {
      const result = validatePriority('high');
      expect(result.success).toBe(true);
    });

    it('should fail for invalid priority', () => {
      const result = validatePriority('urgent');
      expect(result.success).toBe(false);
    });
  });
});
