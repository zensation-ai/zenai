/**
 * Centralized Input Validation Utilities
 *
 * Provides consistent validation across all routes to prevent:
 * - Invalid input data
 * - Type coercion errors
 * - SQL injection edge cases
 * - Missing required fields
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorCodes, AIContext, IdeaType, IdeaCategory, Priority } from '../types';
import { isValidContext } from './database-context';
import { ValidationError as RouteValidationError } from '../middleware/errorHandler';

// ===========================================
// Validation Result Types
// ===========================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

// ===========================================
// Number Validation
// ===========================================

/**
 * Safely parse integer with validation
 */
export function parseIntSafe(
  value: string | undefined | null,
  options: {
    default?: number;
    min?: number;
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult<number> {
  const { default: defaultValue = 0, min, max, fieldName = 'value' } = options;

  if (value === undefined || value === null || value === '') {
    return { success: true, data: defaultValue };
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a valid integer`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  if (min !== undefined && parsed < min) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be at least ${min}`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  if (max !== undefined && parsed > max) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be at most ${max}`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  return { success: true, data: parsed };
}

/**
 * Safely parse float with validation
 */
export function parseFloatSafe(
  value: string | undefined | null,
  options: {
    default?: number;
    min?: number;
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult<number> {
  const { default: defaultValue = 0, min, max, fieldName = 'value' } = options;

  if (value === undefined || value === null || value === '') {
    return { success: true, data: defaultValue };
  }

  const parsed = parseFloat(value);

  if (isNaN(parsed)) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a valid number`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  if (min !== undefined && parsed < min) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be at least ${min}`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  if (max !== undefined && parsed > max) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be at most ${max}`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  return { success: true, data: parsed };
}

// ===========================================
// Pagination Validation
// ===========================================

export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Validate and parse pagination parameters
 */
export function validatePagination(
  query: { limit?: string; offset?: string; page?: string },
  options: { maxLimit?: number; defaultLimit?: number } = {}
): ValidationResult<PaginationParams> {
  const { maxLimit = 100, defaultLimit = 20 } = options;
  const errors: ValidationError[] = [];

  // Parse limit
  const limitResult = parseIntSafe(query.limit, {
    default: defaultLimit,
    min: 1,
    max: maxLimit,
    fieldName: 'limit',
  });
  if (!limitResult.success) {
    errors.push(...(limitResult.errors || []));
  }

  // Parse offset (or calculate from page)
  let offset = 0;
  if (query.page) {
    const pageResult = parseIntSafe(query.page, { default: 1, min: 1, fieldName: 'page' });
    if (!pageResult.success) {
      errors.push(...(pageResult.errors || []));
    } else {
      offset = ((pageResult.data || 1) - 1) * (limitResult.data || defaultLimit);
    }
  } else {
    const offsetResult = parseIntSafe(query.offset, { default: 0, min: 0, fieldName: 'offset' });
    if (!offsetResult.success) {
      errors.push(...(offsetResult.errors || []));
    } else {
      offset = offsetResult.data || 0;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      limit: limitResult.data || defaultLimit,
      offset,
    },
  };
}

// ===========================================
// String Validation
// ===========================================

/**
 * Validate required string field
 */
export function validateRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {}
): ValidationResult<string> {
  const { minLength = 1, maxLength = 10000 } = options;

  if (value === undefined || value === null) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} is required`,
        code: ErrorCodes.MISSING_FIELD,
      }],
    };
  }

  if (typeof value !== 'string') {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a string`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be at least ${minLength} characters`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  if (trimmed.length > maxLength) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be at most ${maxLength} characters`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  return { success: true, data: trimmed };
}

/**
 * Validate optional string field
 */
export function validateOptionalString(
  value: unknown,
  fieldName: string,
  options: { maxLength?: number } = {}
): ValidationResult<string | undefined> {
  const { maxLength = 10000 } = options;

  if (value === undefined || value === null || value === '') {
    return { success: true, data: undefined };
  }

  if (typeof value !== 'string') {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a string`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be at most ${maxLength} characters`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  return { success: true, data: trimmed };
}

// ===========================================
// Enum Validation
// ===========================================

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  value: unknown,
  validValues: readonly T[],
  fieldName: string,
  options: { required?: boolean; default?: T } = {}
): ValidationResult<T | undefined> {
  const { required = false, default: defaultValue } = options;

  if (value === undefined || value === null || value === '') {
    if (required && defaultValue === undefined) {
      return {
        success: false,
        errors: [{
          field: fieldName,
          message: `${fieldName} is required`,
          code: ErrorCodes.MISSING_FIELD,
        }],
      };
    }
    return { success: true, data: defaultValue };
  }

  if (typeof value !== 'string') {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a string`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  if (!validValues.includes(value as T)) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be one of: ${validValues.join(', ')}`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  return { success: true, data: value as T };
}

// ===========================================
// Context Validation
// ===========================================

const VALID_CONTEXTS: readonly AIContext[] = ['personal', 'work', 'learning', 'creative'];

/**
 * Validate AI context parameter
 */
export function validateContext(
  value: unknown,
  fieldName: string = 'context'
): ValidationResult<AIContext> {
  return validateEnum(value, VALID_CONTEXTS, fieldName, { required: true }) as ValidationResult<AIContext>;
}

/**
 * Validate context from route params (:context).
 * Throws RouteValidationError if invalid — works with asyncHandler/errorHandler.
 *
 * Replaces the duplicated getContextFromParams() in tasks, projects, calendar, ideas routes.
 */
export function validateContextParam(context: string): AIContext {
  if (!isValidContext(context)) {
    throw new RouteValidationError(
      'Invalid context. Use "personal", "work", "learning", or "creative".',
      { context: 'must be "personal", "work", "learning", or "creative"' }
    );
  }
  return context as AIContext;
}

// ===========================================
// Idea Field Validation
// ===========================================

const VALID_IDEA_TYPES: readonly IdeaType[] = ['idea', 'task', 'insight', 'problem', 'question'];
const VALID_CATEGORIES: readonly IdeaCategory[] = ['business', 'technical', 'personal', 'learning'];
const VALID_PRIORITIES: readonly Priority[] = ['low', 'medium', 'high'];

export function validateIdeaType(value: unknown): ValidationResult<IdeaType | undefined> {
  return validateEnum(value, VALID_IDEA_TYPES, 'type');
}

export function validateCategory(value: unknown): ValidationResult<IdeaCategory | undefined> {
  return validateEnum(value, VALID_CATEGORIES, 'category');
}

export function validatePriority(value: unknown): ValidationResult<Priority | undefined> {
  return validateEnum(value, VALID_PRIORITIES, 'priority');
}

// ===========================================
// Array Validation
// ===========================================

/**
 * Validate string array
 */
export function validateStringArray(
  value: unknown,
  fieldName: string,
  options: { maxItems?: number; maxItemLength?: number } = {}
): ValidationResult<string[]> {
  const { maxItems = 100, maxItemLength = 1000 } = options;

  if (value === undefined || value === null) {
    return { success: true, data: [] };
  }

  if (!Array.isArray(value)) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be an array`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  if (value.length > maxItems) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must have at most ${maxItems} items`,
        code: ErrorCodes.INVALID_INPUT,
      }],
    };
  }

  const errors: ValidationError[] = [];
  const validItems: string[] = [];

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'string') {
      errors.push({
        field: `${fieldName}[${i}]`,
        message: `Item at index ${i} must be a string`,
        code: ErrorCodes.INVALID_FORMAT,
      });
    } else if (item.length > maxItemLength) {
      errors.push({
        field: `${fieldName}[${i}]`,
        message: `Item at index ${i} must be at most ${maxItemLength} characters`,
        code: ErrorCodes.INVALID_INPUT,
      });
    } else {
      validItems.push(item.trim());
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: validItems };
}

// ===========================================
// UUID Validation
// ===========================================

/** UUID v1-5 validation regex - exported for direct use */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Simple UUID validation check */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Validate UUID format
 */
export function validateUUID(
  value: unknown,
  fieldName: string = 'id'
): ValidationResult<string> {
  if (value === undefined || value === null) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} is required`,
        code: ErrorCodes.MISSING_FIELD,
      }],
    };
  }

  if (typeof value !== 'string') {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a string`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  if (!UUID_REGEX.test(value)) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a valid UUID`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  return { success: true, data: value };
}

// ===========================================
// Date Validation
// ===========================================

/**
 * Validate ISO date string
 */
export function validateDate(
  value: unknown,
  fieldName: string,
  options: { required?: boolean } = {}
): ValidationResult<Date | undefined> {
  const { required = false } = options;

  if (value === undefined || value === null || value === '') {
    if (required) {
      return {
        success: false,
        errors: [{
          field: fieldName,
          message: `${fieldName} is required`,
          code: ErrorCodes.MISSING_FIELD,
        }],
      };
    }
    return { success: true, data: undefined };
  }

  if (typeof value !== 'string') {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a date string`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} must be a valid date`,
        code: ErrorCodes.INVALID_FORMAT,
      }],
    };
  }

  return { success: true, data: date };
}

// ===========================================
// Middleware Factory
// ===========================================

/**
 * Create validation middleware
 */
export function createValidationMiddleware<T>(
  validator: (req: Request) => ValidationResult<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = validator(req);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Validation failed',
          details: result.errors,
        },
      });
    }
    // Attach validated data to request
    (req as Request & { validated: T }).validated = result.data as T;
    next();
  };
}

// ===========================================
// Common Middleware Helpers
// ===========================================

/**
 * Middleware to validate context from query or params
 * Extracts context and attaches to req.validatedContext
 */
export function requireContext(source: 'query' | 'params' = 'query') {
  return (req: Request, res: Response, next: NextFunction) => {
    const contextValue = source === 'query' ? req.query.context : req.params.context;
    const result = validateContext(contextValue);

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid context. Use "personal", "work", "learning", or "creative".'
      });
    }

    (req as Request & { validatedContext: AIContext }).validatedContext = result.data as AIContext;
    next();
  };
}

/**
 * Helper to extract validated context from request
 */
export function getValidatedContext(req: Request): AIContext {
  return (req as Request & { validatedContext: AIContext }).validatedContext;
}

/**
 * Quick context check - returns context or null with error response
 */
export function checkContext(
  req: Request,
  res: Response,
  source: 'query' | 'params' | 'body' = 'query'
): AIContext | null {
  let contextValue: unknown;

  switch (source) {
    case 'query':
      contextValue = req.query.context;
      break;
    case 'params':
      contextValue = req.params.context;
      break;
    case 'body':
      contextValue = req.body?.context;
      break;
  }

  const result = validateContext(contextValue);

  if (!result.success || !result.data) {
    res.status(400).json({ error: 'Invalid context. Use "personal", "work", "learning", or "creative".' });
    return null;
  }

  return result.data;
}

// ===========================================
// Simple Integer Helpers (for quick migration)
// ===========================================

/**
 * Simple parseInt with radix 10 and default value
 * Use this for quick migration of parseInt(, 10) calls
 *
 * @example
 * // Instead of: parseInt(req.query.limit as string, 10) || 20
 * // Use: toInt(req.query.limit, 20)
 */
export function toInt(value: string | number | undefined | null, defaultValue: number = 0): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.floor(value) : defaultValue;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Simple parseInt with radix 10, default value, and bounds
 * Ensures the result is within [min, max] range
 *
 * @example
 * // Instead of: Math.min(parseInt(req.query.limit as string, 10) || 20, 100)
 * // Use: toIntBounded(req.query.limit, 20, 1, 100)
 */
export function toIntBounded(
  value: string | number | undefined | null,
  defaultValue: number,
  min: number,
  max: number
): number {
  const parsed = toInt(value, defaultValue);
  return Math.max(min, Math.min(max, parsed));
}

/**
 * Safely parse a float value with bounds checking
 * Returns defaultValue if parsing fails or value is NaN
 * Ensures the result is within [min, max] range
 *
 * @example
 * // Instead of: parseFloat(req.query.threshold as string) || 0.75
 * // Use: toFloatBounded(req.query.threshold, 0.75, 0, 1)
 */
export function toFloatBounded(
  value: string | number | undefined | null,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, parsed));
}
